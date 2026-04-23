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

/**
 * Image mapping types for Docker Compose plugin
 * Use this type to define custom icon mappings
 */
export type ImageMappings = Record<
  string,
  | { provider: string; type: string; resource: string }
  | { url: string }
  | { iconify: string }
  | string
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
function getProviderForImage(
  image: string,
  imageMappings: ImageMappings = {},
  serviceName?: string,
): ProviderResult {
  // Handle empty image (e.g., services with only 'build' configuration)
  // Return Docker container as default
  if (!image || image.trim() === "") {
    const defaultResult = {
      provider: "onprem",
      type: "container",
      resource: "Docker",
    };
    return defaultResult;
  }

  // Normalize image for cache key (lowercase, extract base name)
  const lowerImage = image.toLowerCase();
  const imageName =
    lowerImage
      .split("/")
      .pop() // Get last part after slashes
      ?.split(":")[0] // Remove version tag
      ?.split("@")[0] || ""; // Remove digest

  // Create cache key from service name or image name
  const cacheKey =
    serviceName && imageMappings[serviceName] ? `service:${serviceName}` : `image:${imageName}`;

  // Check cache using normalized key
  if (resourceCache.has(cacheKey)) {
    return resourceCache.get(cacheKey)!;
  }

  // Check custom image mappings by service name first (takes precedence over image name)
  if (serviceName && imageMappings[serviceName]) {
    const customMapping = imageMappings[serviceName];
    // Handle URL string mapping
    if (typeof customMapping === "string") {
      const result = { url: customMapping };
      resourceCache.set(cacheKey, result);
      return result;
    }
    // Handle { url: "..." } object mapping
    if ("url" in customMapping) {
      const result = { url: customMapping.url };
      resourceCache.set(cacheKey, result);
      return result;
    }
    // Handle { iconify: "prefix:name" } object mapping
    // Uses Iconify API: https://api.iconify.design/{prefix}:{name}.svg
    if ("iconify" in customMapping) {
      const iconifyUrl = `https://api.iconify.design/${customMapping.iconify}.svg`;
      const result = { url: iconifyUrl };
      resourceCache.set(cacheKey, result);
      return result;
    }
    // Handle { provider, type, resource } mapping
    const result = customMapping;
    resourceCache.set(cacheKey, result);
    return result;
  }

  // Check custom image mappings by image name (fallback if no service name mapping)
  // Use imageName which was already extracted above
  const customMapping = imageMappings[imageName];
  if (customMapping) {
    // Handle URL string mapping
    if (typeof customMapping === "string") {
      const result = { url: customMapping };
      resourceCache.set(cacheKey, result);
      return result;
    }
    // Handle { url: "..." } object mapping
    if ("url" in customMapping) {
      const result = { url: customMapping.url };
      resourceCache.set(cacheKey, result);
      return result;
    }
    // Handle { iconify: "prefix:name" } object mapping
    // Uses Iconify API: https://api.iconify.design/{prefix}:{name}.svg
    if ("iconify" in customMapping) {
      const iconifyUrl = `https://api.iconify.design/${customMapping.iconify}.svg`;
      const result = { url: iconifyUrl };
      resourceCache.set(cacheKey, result);
      return result;
    }
    // Handle { provider, type, resource } mapping
    const result = customMapping;
    resourceCache.set(cacheKey, result);
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
    resourceCache.set(cacheKey, result);
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
      resourceCache.set(cacheKey, result);
      return result;
    }
  }

  // Default to Docker container from onprem provider
  const defaultResult = {
    provider: "onprem",
    type: "container",
    resource: "Docker",
  };
  resourceCache.set(cacheKey, defaultResult);
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
   * Can be either a provider icon mapping, a custom image URL, or an Iconify icon.
   */
  imageMappings?: Record<
    string,
    | { provider: string; type: string; resource: string }
    | { url: string }
    | { iconify: string }
    | string
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
 * const plugin = createDockerComposePlugin();
 * await diagram.registerPlugins([plugin]);
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
 * // With custom image mappings
 * const plugin = createDockerComposePlugin({
 *   defaultVersion: "3.9",
 *   imageMappings: {
 *     // Provider icons
 *     "custom-db": { provider: "onprem", type: "database", resource: "Postgresql" },
 *     // Custom URL
 *     "my-api": "https://example.com/icon.svg",
 *     // Iconify icons (https://iconify.design/)
 *     "docker": { iconify: "logos:docker" },
 *     "kubernetes": { iconify: "logos:kubernetes" }
 *   }
 * });
 * await diagram.registerPlugins([plugin]);
 * ```
 */
/**
 * Validate Iconify icon format
 * Iconify icons should be in format "prefix:name"
 */
function validateIconifyFormat(key: string, value: string): void {
  // Check if it contains : separator
  if (!value.includes(":")) {
    console.warn(
      `[docker-compose-plugin] Invalid Iconify format for "${key}": "${value}". ` +
        `Expected format: "prefix:name" (e.g., "logos:docker")`,
    );
  }
}

/**
 * Validate image mappings configuration
 */
function validateImageMappings(imageMappings?: ImageMappings): void {
  if (!imageMappings) return;

  for (const [key, value] of Object.entries(imageMappings)) {
    if (typeof value === "object" && "iconify" in value) {
      validateIconifyFormat(key, value.iconify);
    }
  }
}

export function createDockerComposePlugin(config?: DockerComposePluginConfig): DiagramsPlugin {
  // Validate configuration on creation
  validateImageMappings(config?.imageMappings);

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
            const { _version, _name, _type, ...serviceConfig } = metadata;

            // Clean up the service config - remove undefined values and empty arrays
            const cleanedConfig: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(serviceConfig)) {
              if (value !== undefined && value !== null) {
                // Skip empty arrays and empty objects
                if (Array.isArray(value) && value.length === 0) continue;
                if (
                  typeof value === "object" &&
                  !Array.isArray(value) &&
                  Object.keys(value).length === 0
                ) {
                  continue;
                }
                cleanedConfig[key] = value;
              }
            }

            compose.services[serviceName] = cleanedConfig as ComposeService;

            // Track networks
            if (metadata.networks) {
              for (const network of metadata.networks as string[]) {
                networks.add(network);
              }
            }

            // Track only named volumes (not bind mounts)
            if (metadata.volumes) {
              for (const volume of metadata.volumes as string[]) {
                const volumeName = parseVolumeName(volume);

                // Skip bind mounts - these should NOT be in the volumes section
                const isBindMount =
                  volumeName.startsWith(".") ||
                  volumeName.startsWith("/") ||
                  volumeName.startsWith("\\") ||
                  /^[a-zA-Z]:[/\\]/.test(volumeName);

                if (!isBindMount) {
                  volumes.add(volumeName);
                }
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
    const providerInfo = getProviderForImage(image, imageMappings, serviceName);
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
      node.type = providerInfo.type;
      node.resource = providerInfo.resource;
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

        // Skip bind mounts (host paths) - these are not Docker volumes
        // Bind mounts look like: ./path, /host/path, or C:\path (Windows)
        const isBindMount =
          volumeName.startsWith(".") ||
          volumeName.startsWith("/") ||
          volumeName.startsWith("\\") ||
          /^[a-zA-Z]:[/\\]/.test(volumeName); // Windows absolute paths like C:/ or C:\

        if (isBindMount) {
          continue;
        }

        // Create edge if volume is defined in compose.volumes (even if value is null/undefined)
        // or if it's an anonymous volume (no colon in spec)
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
  // Use the yaml module to properly serialize all fields
  const composeForYaml = {
    ...(compose.version && { version: compose.version }),
    ...(compose.name && { name: compose.name }),
    services: compose.services,
    ...(compose.networks &&
      Object.keys(compose.networks).length > 0 && { networks: compose.networks }),
    ...(compose.volumes && Object.keys(compose.volumes).length > 0 && { volumes: compose.volumes }),
  };

  return yaml?.dump(composeForYaml, { noRefs: true, lineWidth: -1 }) || "";
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
 * await diagram.registerPlugins([createDockerComposePlugin({ defaultVersion: "3.9" })]);
 * ```
 */
export const dockerComposePlugin = createDockerComposePlugin();
