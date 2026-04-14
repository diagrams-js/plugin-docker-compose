/**
 * Docker Compose Plugin for diagrams-js
 *
 * This plugin provides import/export capabilities for Docker Compose files.
 * It can import docker-compose.yml files to create diagrams and export diagrams
 * to docker-compose.yml format.
 *
 * This plugin demonstrates best practices for creating plugins:
 * - Uses Diagram.fromJSON() to create nodes with proper provider icons
 * - Does not rely on internal library implementations
 * - Converts external format to JSON, then imports via standard API
 */

// Type imports from diagrams-js - these are only types, not runtime imports
// Runtime exports are accessed via context.lib to avoid multiple instances
import type {
  DiagramsPlugin,
  ImporterCapability,
  ExporterCapability,
  ImportContext,
  ExportContext,
  Diagram,
  DiagramJSON,
  DiagramNodeJSON,
  DiagramEdgeJSON,
  DiagramClusterJSON,
  Yaml,
} from "diagrams-js";

/**
 * Docker Compose service configuration
 */
interface ComposeService {
  image?: string;
  build?: string | { context: string; dockerfile?: string };
  ports?: string[];
  environment?: Record<string, string> | string[];
  volumes?: string[];
  depends_on?: string[] | Record<string, { condition: string }>;
  networks?: string[];
  command?: string | string[];
  working_dir?: string;
  restart?: string;
  labels?: Record<string, string>;
}

/**
 * Docker Compose network configuration
 */
interface ComposeNetwork {
  driver?: string;
  external?: boolean;
  name?: string;
}

/**
 * Docker Compose volume configuration
 */
interface ComposeVolume {
  driver?: string;
  external?: boolean;
  name?: string;
}

/**
 * Docker Compose file structure
 */
interface ComposeFile {
  version?: string;
  name?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, ComposeNetwork>;
  volumes?: Record<string, ComposeVolume>;
}

interface ResourceInfo {
  provider: string;
  type: string;
  resource: string;
}

let findResource: (query: string) => ResourceInfo[];
let yaml: Yaml | undefined;

/**
 * Result from getProviderForImage - either a provider mapping or a custom URL
 */
type ProviderResult =
  | { provider: string; type: string; resource: string; url?: undefined }
  | { url: string; provider?: undefined; type?: undefined; resource?: undefined };

type ImageMappings = Record<
  string,
  { provider: string; type: string; resource: string } | { url: string } | string
>;

/**
 * Cache for resource lookups to avoid repeated searches
 */
const resourceCache = new Map<string, ProviderResult>();

/**
 * Common Docker image name mappings to resource names
 * These are Docker images that don't directly match their resource names
 */
const DOCKER_IMAGE_ALIASES: Record<string, string> = {
  node: "Nodejs",
  golang: "Go",
  "c-sharp": "Dotnet",
  "c#": "Dotnet",
  postgres: "Postgresql",
  mongo: "Mongodb",
  httpd: "Apache",
};

/**
 * Maps Docker image names to provider node types using find-resource module
 */
function getProviderForImage(image: string, imageMappings: ImageMappings = {}): ProviderResult {
  // Check cache first
  if (resourceCache.has(image)) {
    return resourceCache.get(image)!;
  }

  // Handle empty image (e.g., services with only 'build' configuration)
  // Return Docker container as default
  if (!image || image.trim() === "") {
    const defaultResult = {
      provider: "onprem",
      type: "container",
      resource: "Docker",
    };
    resourceCache.set(image, defaultResult);
    return defaultResult;
  }

  const lowerImage = image.toLowerCase();

  // Extract service name from image (remove version tags, registry, etc.)
  // e.g., "docker.io/library/postgres:14" -> "postgres"
  // e.g., "myregistry.com/team/mysql:8.0" -> "mysql"
  const imageName =
    lowerImage
      .split("/")
      .pop() // Get last part after slashes
      ?.split(":")[0] // Remove version tag
      ?.split("@")[0] || ""; // Remove digest

  // Check custom image mappings first (user-defined mappings take precedence)
  const customMapping = imageMappings[imageName];
  if (customMapping) {
    // Handle URL string mapping
    if (typeof customMapping === "string") {
      const result = { url: customMapping };
      resourceCache.set(image, result);
      return result;
    }
    // Handle { url: "..." } object mapping
    if ("url" in customMapping) {
      const result = { url: customMapping.url };
      resourceCache.set(image, result);
      return result;
    }
    // Handle { provider, type, resource } mapping
    const result = customMapping;
    resourceCache.set(image, result);
    return result;
  }

  // Check for Docker image aliases first
  // e.g., "node" -> search for "Nodejs" instead
  const searchTerm = DOCKER_IMAGE_ALIASES[imageName] || imageName;

  // Search for matching resources
  const matches = findResource(searchTerm);

  // If we found matches, use the best one (exact match is first due to sorting)
  if (matches.length > 0) {
    const bestMatch = matches[0];
    const result = {
      provider: bestMatch.provider,
      type: bestMatch.type,
      resource: bestMatch.resource,
    };
    resourceCache.set(image, result);
    return result;
  }

  // Fallback: try searching with common suffixes removed
  // e.g., "postgresql" -> "postgres"
  const baseName = imageName.replace(/db$/, "").replace(/sql$/, "");
  if (baseName !== imageName) {
    const baseMatches = findResource(baseName);
    if (baseMatches.length > 0) {
      const bestMatch = baseMatches[0];
      const result = {
        provider: bestMatch.provider,
        type: bestMatch.type,
        resource: bestMatch.resource,
      };
      resourceCache.set(image, result);
      return result;
    }
  }

  // Default to Docker container from onprem provider
  const defaultResult = {
    provider: "onprem",
    type: "container",
    resource: "Docker",
  };
  resourceCache.set(image, defaultResult);
  return defaultResult;
}

/**
 * Docker Compose plugin configuration options
 */
export interface DockerComposePluginConfig {
  /** Default Docker Compose version for exports (default: "3.8") */
  defaultVersion?: string;
  /**
   * Custom image to icon mappings.
   * Can be either a provider icon mapping or a custom image URL.
   */
  imageMappings?: Record<
    string,
    { provider: string; type: string; resource: string } | { url: string } | string
  >;
}

/**
 * Create the Docker Compose plugin
 *
 * This plugin provides import/export capabilities for Docker Compose files.
 *
 * @param config - Optional plugin configuration
 * @returns The Docker Compose plugin instance
 *
 * @example
 * ```typescript
 * import { Diagram } from "diagrams-js";
 * import { createDockerComposePlugin } from "@diagrams-js/plugin-docker-compose";
 *
 * const diagram = Diagram('My App');
 * await diagram.registerPlugins([createDockerComposePlugin]);
 *
 * // Import from Docker Compose
 * const composeYaml = await fs.readFile('docker-compose.yml', 'utf-8');
 * await diagram.import(composeYaml, 'docker-compose');
 *
 * // Export to Docker Compose
 * const composeOutput = await diagram.export('docker-compose');
 * ```
 *
 * @example
 * // With configuration
 * await diagram.registerPlugins([[createDockerComposePlugin, {
 *   defaultVersion: "3.9",
 *   imageMappings: {
 *     "custom-db": { provider: "onprem", type: "database", resource: "Postgresql" }
 *   }
 * }]]);
 */
export function createDockerComposePlugin(config?: DockerComposePluginConfig): DiagramsPlugin {
  return {
    name: "docker-compose",
    version: "1.0.0",
    apiVersion: "1.0",
    runtimeSupport: {
      node: true,
      browser: true,
      deno: true,
      bun: true,
    },
    initialize: async (_config, context) => {
      const [resourcesList, yamlModule] = await Promise.all([
        context.loadResourcesList(),
        context.loadYaml(),
      ]);
      if (resourcesList?.findResource) {
        findResource = resourcesList.findResource;
      }
      if (yamlModule) {
        yaml = yamlModule;
      }
    },
    capabilities: [
      {
        type: "importer",
        name: "docker-compose",
        extensions: [".yml", ".yaml"],
        mimeTypes: ["text/yaml", "application/x-yaml"],

        canImport: async (source: string | string[]): Promise<boolean> => {
          const sources = Array.isArray(source) ? source : [source];
          for (const src of sources) {
            // Check for Docker Compose specific keys
            if (src.includes("services:") || src.includes("version:") || src.includes("name:")) {
              return true;
            }
          }
          return false;
        },

        import: async (
          source: string | string[],
          diagram: Diagram,
          _context: ImportContext,
        ): Promise<void> => {
          const sources = Array.isArray(source) ? source : [source];

          for (let i = 0; i < sources.length; i++) {
            const compose = parseComposeFile(sources[i]);
            const projectName = compose.name || `compose-project-${i}`;

            // Convert Docker Compose to diagrams-js JSON format
            // This is the recommended approach: convert to JSON, then use the built-in JSON importer
            const json = composeToJSON(compose, projectName, config?.imageMappings);

            // Use the built-in JSON importer to merge the JSON into the target diagram
            // This properly resolves provider icons and creates nodes with correct metadata
            await diagram.import(JSON.stringify(json), "json");
          }
        },
      } as ImporterCapability,

      {
        type: "exporter",
        name: "docker-compose",
        extension: ".yml",
        mimeType: "text/yaml",

        export: async (diagram: Diagram, _context: ExportContext): Promise<string> => {
          // Try to get original compose metadata from the first node
          const diagramJson = diagram.toJSON();
          const firstNode = diagramJson.nodes[0];
          const originalMetadata = firstNode?.metadata?.compose;

          const compose: ComposeFile = {
            version: originalMetadata?._version || config?.defaultVersion || "3.8",
            name: originalMetadata?._name || diagram.name.toLowerCase().replace(/\s+/g, "-"),
            services: {},
            networks: {},
            volumes: {},
          };

          const json = diagram.toJSON();

          // Track networks and volumes
          const networks = new Set<string>();
          const volumes = new Set<string>();

          // Process nodes to create services
          for (const node of json.nodes) {
            // Skip network and volume nodes - they are not services
            // Check metadata._type first, then fall back to ID check
            const metadata = node.metadata?.compose || {};
            if (metadata._type === "network" || metadata._type === "volume") {
              continue;
            }
            if (node.id?.includes("network-") || node.id?.includes("volume-")) {
              continue;
            }

            const serviceName = (node.label || "unnamed").toLowerCase().replace(/\s+/g, "_");

            // Extract all service properties from metadata, excluding internal fields
            const { _version, _name, ...serviceConfig } = metadata;

            compose.services[serviceName] = {
              image: serviceConfig.image || "",
              ports: serviceConfig.ports || [],
              environment: serviceConfig.environment || {},
              volumes: serviceConfig.volumes || [],
              networks: serviceConfig.networks || [],
              command: serviceConfig.command,
              working_dir: serviceConfig.working_dir,
              restart: serviceConfig.restart,
              labels: serviceConfig.labels,
              // Include any additional fields from the original config
              ...serviceConfig,
            };

            // Track networks
            if (metadata.networks) {
              for (const network of metadata.networks as string[]) {
                networks.add(network);
              }
            }

            // Track volumes
            if (metadata.volumes) {
              for (const volume of metadata.volumes as string[]) {
                const volumeName = parseVolumeName(volume);
                volumes.add(volumeName);
              }
            }
          }

          // Add networks
          for (const networkName of networks) {
            compose.networks![networkName] = {
              driver: "bridge",
            };
          }

          // Add volumes
          for (const volumeName of volumes) {
            compose.volumes![volumeName] = {};
          }

          // Reconstruct dependencies from edges
          // Edge from "web" to "db" means web depends_on db
          if (json.edges) {
            for (const edge of json.edges) {
              const sourceNode = json.nodes.find((n) => n.id === edge.from);
              const targetNode = json.nodes.find((n) => n.id === edge.to);

              if (sourceNode && targetNode) {
                const sourceService = (sourceNode.label || "unnamed")
                  .toLowerCase()
                  .replace(/\s+/g, "_");
                const targetService = (targetNode.label || "unnamed")
                  .toLowerCase()
                  .replace(/\s+/g, "_");

                // Check if this is a service-to-service connection (not network/volume)
                const sourceMetadata = sourceNode.metadata?.compose || {};

                const networks = sourceMetadata.networks;
                const volumes = sourceMetadata.volumes;

                if (
                  compose.services[sourceService] &&
                  compose.services[targetService] &&
                  !networks?.includes(targetNode.label || "") &&
                  !volumes?.some((v: string) => v.includes(targetNode.label || ""))
                ) {
                  // Add dependency: source depends on target
                  // Edge from -> to means from depends_on to
                  if (!compose.services[sourceService].depends_on) {
                    compose.services[sourceService].depends_on = [];
                  }
                  const deps = compose.services[sourceService].depends_on as string[];
                  if (!deps.includes(targetService)) {
                    deps.push(targetService);
                  }
                }
              }
            }
          }

          // Convert to YAML
          return stringifyComposeFile(compose);
        },
      } as ExporterCapability,
    ],
  };
}

/**
 * Parse a Docker Compose YAML file using context.loadYaml() (re-exports from js-yaml)
 */
function parseComposeFile(yamlContent: string): ComposeFile {
  const parsed = yaml?.load(yamlContent) as ComposeFile | undefined;

  if (!parsed) {
    throw new Error("Failed to load Docker Compose file parser");
  }

  // Ensure required fields have defaults
  return {
    version: parsed.version || "3.8",
    name: parsed.name,
    services: parsed.services || {},
    networks: parsed.networks,
    volumes: parsed.volumes,
  };
}

/**
 * Convert Docker Compose file to diagrams-js JSON format
 * This is the recommended approach for plugins: convert to JSON, then use Diagram.fromJSON()
 */
function composeToJSON(
  compose: ComposeFile,
  projectName: string,
  imageMappings: ImageMappings = {},
): DiagramJSON {
  const nodes: DiagramNodeJSON[] = [];
  const edges: DiagramEdgeJSON[] = [];
  const clusterNodes: string[] = [];

  // Create nodes for services with provider info for icon resolution
  // Prefix node IDs with project name to avoid collisions when importing multiple compose files
  const nodeIdPrefix = projectName ? `${projectName}-` : "";

  for (const [serviceName, serviceConfig] of Object.entries(compose.services)) {
    const image = serviceConfig.image || "";
    const providerInfo = getProviderForImage(image, imageMappings);
    const nodeId = `${nodeIdPrefix}${serviceName}`;

    const node: DiagramNodeJSON = {
      id: nodeId,
      label: serviceName,
      metadata: {
        compose: {
          _version: compose.version,
          _name: compose.name,
          // Store the entire service config to preserve all fields
          ...serviceConfig,
        },
      },
    };

    // Add provider info or custom icon URL
    if ("url" in providerInfo) {
      // Custom icon URL - will be handled by JSON importer as Custom node
      node.iconUrl = providerInfo.url;
    } else {
      // Provider-based icon
      node.provider = providerInfo.provider;
      node.service = providerInfo.type;
      node.type = providerInfo.resource;
    }

    nodes.push(node);
    clusterNodes.push(nodeId);
  }

  // Create nodes for networks with project prefix
  if (compose.networks) {
    for (const [networkName, networkConfig] of Object.entries(compose.networks)) {
      const nodeId = `${nodeIdPrefix}network-${networkName}`;
      const node: DiagramNodeJSON = {
        id: nodeId,
        label: networkName,
        attrs: {
          shape: "ellipse",
          style: "dashed",
        },
        metadata: {
          compose: {
            _type: "network",
            driver: networkConfig?.driver,
            external: networkConfig?.external,
          },
        },
      };
      nodes.push(node);
      clusterNodes.push(nodeId);
    }
  }

  // Create nodes for volumes with project prefix
  if (compose.volumes) {
    for (const [volumeName, volumeConfig] of Object.entries(compose.volumes)) {
      const nodeId = `${nodeIdPrefix}volume-${volumeName}`;
      const node: DiagramNodeJSON = {
        id: nodeId,
        label: volumeName,
        attrs: {
          shape: "cylinder",
          style: "filled",
          fillcolor: "#E8E8E8",
        },
        metadata: {
          compose: {
            _type: "volume",
            driver: volumeConfig?.driver,
            external: volumeConfig?.external,
          },
        },
      };
      nodes.push(node);
      clusterNodes.push(nodeId);
    }
  }

  // Create edges for service dependencies with prefixed node IDs
  // "web depends_on db" means web -> db (web depends on db)
  for (const [serviceName, serviceConfig] of Object.entries(compose.services)) {
    const sourceNodeId = `${nodeIdPrefix}${serviceName}`;

    if (serviceConfig.depends_on) {
      const deps = normalizeDependsOn(serviceConfig.depends_on);
      for (const depName of deps) {
        edges.push({
          from: sourceNodeId,
          to: `${nodeIdPrefix}${depName}`,
          direction: "forward",
        });
      }
    }

    // Connect services to networks
    if (serviceConfig.networks) {
      for (const networkName of serviceConfig.networks) {
        edges.push({
          from: sourceNodeId,
          to: `${nodeIdPrefix}network-${networkName}`,
          direction: "forward",
        });
      }
    }

    // Connect services to volumes
    if (serviceConfig.volumes) {
      for (const volumeSpec of serviceConfig.volumes) {
        const volumeName = parseVolumeName(volumeSpec);
        // Create edge if volume is defined in compose.volumes (even if value is null/undefined)
        // or if it's a named volume (no colon in spec)
        const isNamedVolume = compose.volumes && volumeName in compose.volumes;
        const isAnonymousVolume = !volumeSpec.includes(":");
        if (isNamedVolume || isAnonymousVolume) {
          edges.push({
            from: sourceNodeId,
            to: `${nodeIdPrefix}volume-${volumeName}`,
            direction: "forward",
          });
        }
      }
    }
  }

  // Create cluster for the compose project
  const cluster: DiagramClusterJSON = {
    label: projectName,
    nodes: clusterNodes,
  };

  return {
    name: projectName,
    nodes,
    edges: edges.length > 0 ? edges : undefined,
    clusters: [cluster],
  };
}

/**
 * Parse volume name from volume spec
 */
function parseVolumeName(volumeSpec: string): string {
  // Volume specs can be:
  // - volume_name:/path
  // - /host/path:/container/path
  // - named_volume
  const parts = volumeSpec.split(":");
  return parts[0] || "unnamed";
}

/**
 * Normalize depends_on to array of strings
 */
function normalizeDependsOn(dependsOn: string[] | Record<string, { condition: string }>): string[] {
  if (Array.isArray(dependsOn)) {
    return dependsOn;
  }
  return Object.keys(dependsOn);
}

/**
 * Convert compose object to YAML string
 */
function stringifyComposeFile(compose: ComposeFile): string {
  const lines: string[] = [];

  if (compose.version) {
    lines.push(`version: "${compose.version}"`);
    lines.push("");
  }

  if (compose.name) {
    lines.push(`name: ${compose.name}`);
    lines.push("");
  }

  // Services
  if (Object.keys(compose.services).length > 0) {
    lines.push("services:");
    for (const [name, service] of Object.entries(compose.services)) {
      lines.push(`  ${name}:`);

      if (service.image) {
        lines.push(`    image: ${service.image}`);
      }

      if (service.command) {
        if (Array.isArray(service.command)) {
          lines.push(`    command: [${service.command.map((c) => `"${c}"`).join(", ")}]`);
        } else {
          lines.push(`    command: ${service.command}`);
        }
      }

      if (service.working_dir) {
        lines.push(`    working_dir: ${service.working_dir}`);
      }

      if (service.restart) {
        lines.push(`    restart: ${service.restart}`);
      }

      if (service.ports && service.ports.length > 0) {
        lines.push("    ports:");
        for (const port of service.ports) {
          lines.push(`      - "${port}"`);
        }
      }

      if (service.environment && Object.keys(service.environment).length > 0) {
        lines.push("    environment:");
        if (Array.isArray(service.environment)) {
          for (const env of service.environment) {
            lines.push(`      - ${env}`);
          }
        } else {
          for (const [key, value] of Object.entries(service.environment)) {
            lines.push(`      ${key}: ${value}`);
          }
        }
      }

      if (service.volumes && service.volumes.length > 0) {
        lines.push("    volumes:");
        for (const volume of service.volumes) {
          lines.push(`      - ${volume}`);
        }
      }

      if (service.networks && service.networks.length > 0) {
        lines.push("    networks:");
        for (const network of service.networks) {
          lines.push(`      - ${network}`);
        }
      }

      if (
        service.depends_on &&
        Array.isArray(service.depends_on) &&
        service.depends_on.length > 0
      ) {
        lines.push("    depends_on:");
        for (const dep of service.depends_on) {
          lines.push(`      - ${dep}`);
        }
      }

      if (service.labels && Object.keys(service.labels).length > 0) {
        lines.push("    labels:");
        for (const [key, value] of Object.entries(service.labels)) {
          lines.push(`      ${key}: ${value}`);
        }
      }

      lines.push("");
    }
  }

  // Networks
  if (compose.networks && Object.keys(compose.networks).length > 0) {
    lines.push("networks:");
    for (const [name, network] of Object.entries(compose.networks)) {
      lines.push(`  ${name}:`);
      if (network.driver) {
        lines.push(`    driver: ${network.driver}`);
      }
      if (network.external) {
        lines.push("    external: true");
      }
      lines.push("");
    }
  }

  // Volumes
  if (compose.volumes && Object.keys(compose.volumes).length > 0) {
    lines.push("volumes:");
    for (const [name, volume] of Object.entries(compose.volumes)) {
      lines.push(`  ${name}:`);
      if (volume.driver) {
        lines.push(`    driver: ${volume.driver}`);
      }
      if (volume.external) {
        lines.push("    external: true");
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

/**
 * Default Docker Compose plugin instance (without configuration)
 * Exported for convenience. Use this when you don't need custom configuration.
 *
 * @example
 * ```typescript
 * import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";
 *
 * // Use the pre-created instance (no configuration)
 * await diagram.registerPlugins([dockerComposePlugin]);
 * ```
 *
 * For custom configuration, use the factory function:
 * ```typescript
 * await diagram.registerPlugins([[createDockerComposePlugin, { defaultVersion: "3.9" }]]);
 * ```
 */
export const dockerComposePlugin = createDockerComposePlugin();
