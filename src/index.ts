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
} from "diagrams-js";

// Import the DiagramJSON type for proper typing
import type {
  DiagramJSON,
  DiagramNodeJSON,
  DiagramEdgeJSON,
  DiagramClusterJSON,
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

/**
 * Maps Docker image names to provider node types
 */
function getProviderForImage(image: string): {
  provider: string;
  type: string;
  resourceType: string;
} {
  const lowerImage = image.toLowerCase();

  // Databases
  if (lowerImage.includes("postgres")) {
    return { provider: "onprem", type: "database", resourceType: "Postgresql" };
  }
  if (lowerImage.includes("mysql")) {
    return { provider: "onprem", type: "database", resourceType: "Mysql" };
  }
  if (lowerImage.includes("mariadb")) {
    return { provider: "onprem", type: "database", resourceType: "Mariadb" };
  }
  if (lowerImage.includes("mongodb") || lowerImage.includes("mongo")) {
    return { provider: "onprem", type: "database", resourceType: "Mongodb" };
  }
  if (lowerImage.includes("redis")) {
    return { provider: "onprem", type: "database", resourceType: "Redis" };
  }
  if (lowerImage.includes("cassandra")) {
    return { provider: "onprem", type: "database", resourceType: "Cassandra" };
  }
  if (lowerImage.includes("couchdb")) {
    return { provider: "onprem", type: "database", resourceType: "Couchdb" };
  }
  if (lowerImage.includes("influxdb")) {
    return { provider: "onprem", type: "database", resourceType: "Influxdb" };
  }
  if (lowerImage.includes("neo4j")) {
    return { provider: "onprem", type: "database", resourceType: "Neo4j" };
  }
  if (lowerImage.includes("oracle")) {
    return { provider: "onprem", type: "database", resourceType: "Oracle" };
  }
  if (lowerImage.includes("mssql")) {
    return { provider: "onprem", type: "database", resourceType: "Mssql" };
  }

  // Message Queues
  if (lowerImage.includes("kafka")) {
    return { provider: "onprem", type: "queue", resourceType: "Kafka" };
  }
  if (lowerImage.includes("rabbitmq")) {
    return { provider: "onprem", type: "queue", resourceType: "Rabbitmq" };
  }

  // Monitoring
  if (lowerImage.includes("prometheus")) {
    return { provider: "onprem", type: "monitoring", resourceType: "Prometheus" };
  }
  if (lowerImage.includes("grafana")) {
    return { provider: "onprem", type: "monitoring", resourceType: "Grafana" };
  }

  // Search
  if (lowerImage.includes("elasticsearch")) {
    return { provider: "onprem", type: "search", resourceType: "Elasticsearch" };
  }

  // Web Servers
  if (lowerImage.includes("nginx")) {
    return { provider: "onprem", type: "network", resourceType: "Nginx" };
  }
  if (lowerImage.includes("apache") || lowerImage.includes("httpd")) {
    return { provider: "onprem", type: "network", resourceType: "Apache" };
  }

  // Container Orchestration
  if (lowerImage.includes("nomad")) {
    return { provider: "onprem", type: "compute", resourceType: "Nomad" };
  }

  // Default to generic container
  return { provider: "generic", type: "compute", resourceType: "Container" };
}

/**
 * Docker Compose plugin configuration options
 */
export interface DockerComposePluginConfig {
  /** Default Docker Compose version for exports (default: "3.8") */
  defaultVersion?: string;
  /** Custom image to icon mappings */
  imageMappings?: Record<string, { provider: string; type: string; resourceType: string }>;
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
 *     "custom-db": { provider: "onprem", type: "database", resourceType: "Postgresql" }
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
            const compose = await parseComposeFile(sources[i]);
            const projectName = compose.name || `compose-project-${i}`;

            // Convert Docker Compose to diagrams-js JSON format
            // This is the recommended approach: convert to JSON, then use the built-in JSON importer
            const json = composeToJSON(compose, projectName);

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
          const compose: ComposeFile = {
            version: config?.defaultVersion || "3.8",
            name: diagram.name.toLowerCase().replace(/\s+/g, "-"),
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
            const serviceName = (node.label || "unnamed").toLowerCase().replace(/\s+/g, "_");

            // Determine service type from metadata or defaults
            const metadata = node.metadata?.compose || {};

            compose.services[serviceName] = {
              image: metadata.image || "nginx:latest",
              ports: metadata.ports || [],
              environment: metadata.environment || {},
              volumes: metadata.volumes || [],
              networks: metadata.networks || [],
              command: metadata.command,
              working_dir: metadata.working_dir,
              restart: metadata.restart,
              labels: metadata.labels,
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
                  // Add dependency
                  if (!compose.services[targetService].depends_on) {
                    compose.services[targetService].depends_on = [];
                  }
                  const deps = compose.services[targetService].depends_on as string[];
                  if (!deps.includes(sourceService)) {
                    deps.push(sourceService);
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
 * Parse a Docker Compose YAML file
 */
async function parseComposeFile(yamlContent: string): Promise<ComposeFile> {
  // Simple YAML parser for Docker Compose
  // In a real implementation, you might want to use a proper YAML library
  const lines = yamlContent.split("\n");
  const compose: ComposeFile = {
    version: "3.8",
    services: {},
  };

  let currentSection: "root" | "services" | "networks" | "volumes" = "root";
  let currentItem: string | null = null;
  let currentService: ComposeService | null = null;
  let currentNetwork: ComposeNetwork | null = null;
  let currentVolume: ComposeVolume | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - trimmed.length;

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Top-level sections
    if (indent === 0) {
      if (trimmed.startsWith("version:")) {
        compose.version = trimmed.split(":")[1]?.trim().replace(/['"]/g, "");
      } else if (trimmed.startsWith("name:")) {
        compose.name = trimmed.split(":")[1]?.trim().replace(/['"]/g, "");
      } else if (trimmed === "services:") {
        currentSection = "services";
        currentItem = null;
      } else if (trimmed === "networks:") {
        currentSection = "networks";
        currentItem = null;
        compose.networks = {};
      } else if (trimmed === "volumes:") {
        currentSection = "volumes";
        currentItem = null;
        compose.volumes = {};
      }
      continue;
    }

    // Service definitions
    if (currentSection === "services" && indent === 2) {
      const match = trimmed.match(/^(\w+):/);
      if (match) {
        currentItem = match[1];
        currentService = {};
        compose.services[currentItem] = currentService;
      }
      continue;
    }

    // Network definitions
    if (currentSection === "networks" && indent === 2) {
      const match = trimmed.match(/^(\w+):/);
      if (match) {
        currentItem = match[1];
        currentNetwork = {};
        compose.networks![currentItem] = currentNetwork;
      }
      continue;
    }

    // Volume definitions
    if (currentSection === "volumes" && indent === 2) {
      const match = trimmed.match(/^(\w+):/);
      if (match) {
        currentItem = match[1];
        currentVolume = {};
        compose.volumes![currentItem] = currentVolume;
      }
      continue;
    }

    // Service properties
    if (currentService && indent >= 4) {
      const propMatch = trimmed.match(/^(\w+):\s*(.*)/);
      if (propMatch) {
        const [, prop, value] = propMatch;
        const cleanValue = value.replace(/['"]/g, "");

        switch (prop) {
          case "image":
            currentService.image = cleanValue;
            break;
          case "command":
            currentService.command = cleanValue;
            break;
          case "working_dir":
            currentService.working_dir = cleanValue;
            break;
          case "restart":
            currentService.restart = cleanValue;
            break;
          case "ports":
            currentService.ports = [];
            break;
          case "environment":
            currentService.environment = {};
            break;
          case "volumes":
            currentService.volumes = [];
            break;
          case "depends_on":
            currentService.depends_on = [];
            break;
          case "networks":
            currentService.networks = [];
            break;
        }
      } else if (trimmed.startsWith("- ")) {
        // Array items
        if (currentService.ports !== undefined && !currentService.ports.length) {
          currentService.ports = parseArray(lines, lines.indexOf(line));
        } else if (currentService.volumes !== undefined && !currentService.volumes.length) {
          currentService.volumes = parseArray(lines, lines.indexOf(line));
        } else if (currentService.depends_on !== undefined && !currentService.depends_on.length) {
          currentService.depends_on = parseArray(lines, lines.indexOf(line));
        } else if (currentService.networks !== undefined && !currentService.networks.length) {
          currentService.networks = parseArray(lines, lines.indexOf(line));
        }
      }
    }
  }

  return compose;
}

/**
 * Parse an array from YAML lines
 */
function parseArray(lines: string[], startIndex: number): string[] {
  const result: string[] = [];
  const startIndent = lines[startIndex].length - lines[startIndex].trim().length;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - trimmed.length;

    if (indent < startIndent) break;
    if (trimmed.startsWith("- ")) {
      result.push(trimmed.substring(2).trim());
    }
  }

  return result;
}

/**
 * Convert Docker Compose file to diagrams-js JSON format
 * This is the recommended approach for plugins: convert to JSON, then use Diagram.fromJSON()
 */
function composeToJSON(compose: ComposeFile, projectName: string): DiagramJSON {
  const nodes: DiagramNodeJSON[] = [];
  const edges: DiagramEdgeJSON[] = [];
  const clusterNodes: string[] = [];

  // Create nodes for services with provider info for icon resolution
  for (const [serviceName, serviceConfig] of Object.entries(compose.services)) {
    const image = serviceConfig.image || "";
    const providerInfo = getProviderForImage(image);

    const node: DiagramNodeJSON = {
      id: serviceName,
      label: serviceName,
      provider: providerInfo.provider,
      service: providerInfo.type,
      type: providerInfo.resourceType,
    };

    nodes.push(node);
    clusterNodes.push(serviceName);
  }

  // Create nodes for networks
  if (compose.networks) {
    for (const networkName of Object.keys(compose.networks)) {
      const node: DiagramNodeJSON = {
        id: `network-${networkName}`,
        label: networkName,
        attrs: {
          shape: "ellipse",
          style: "dashed",
        },
      };
      nodes.push(node);
      clusterNodes.push(`network-${networkName}`);
    }
  }

  // Create nodes for volumes
  if (compose.volumes) {
    for (const volumeName of Object.keys(compose.volumes)) {
      const node: DiagramNodeJSON = {
        id: `volume-${volumeName}`,
        label: volumeName,
        attrs: {
          shape: "cylinder",
          style: "filled",
          fillcolor: "#E8E8E8",
        },
      };
      nodes.push(node);
      clusterNodes.push(`volume-${volumeName}`);
    }
  }

  // Create edges for service dependencies
  // "web depends_on db" means web -> db (web depends on db)
  for (const [serviceName, serviceConfig] of Object.entries(compose.services)) {
    if (serviceConfig.depends_on) {
      const deps = normalizeDependsOn(serviceConfig.depends_on);
      for (const depName of deps) {
        edges.push({
          from: serviceName,
          to: depName,
          direction: "forward",
        });
      }
    }

    // Connect services to networks
    if (serviceConfig.networks) {
      for (const networkName of serviceConfig.networks) {
        edges.push({
          from: serviceName,
          to: `network-${networkName}`,
          direction: "forward",
        });
      }
    }

    // Connect services to volumes
    if (serviceConfig.volumes) {
      for (const volumeSpec of serviceConfig.volumes) {
        const volumeName = parseVolumeName(volumeSpec);
        if (compose.volumes?.[volumeName]) {
          edges.push({
            from: serviceName,
            to: `volume-${volumeName}`,
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

  return lines.join("\n");
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
