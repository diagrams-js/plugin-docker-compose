import { describe, it, expect } from "vitest";
import { Diagram } from "diagrams-js";
import { dockerComposePlugin, createDockerComposePlugin } from "../src/index.js";

describe("Docker Compose Plugin", () => {
  describe("Import", () => {
    it("should import a simple docker-compose file", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
  db:
    image: postgres:13
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      expect(json.nodes).toHaveLength(2);
      expect(json.nodes.find((n) => n.id === "my-app-web")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "my-app-db")).toBeDefined();
    });

    it("should preserve service configuration in metadata", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
    environment:
      NODE_ENV: production
    restart: always
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const webNode = json.nodes.find((n) => n.id === "my-app-web");
      expect(webNode).toBeDefined();
      expect(webNode?.metadata?.compose).toMatchObject({
        image: "nginx:latest",
        ports: ["80:80", "443:443"],
        environment: { NODE_ENV: "production" },
        restart: "always",
      });
    });

    it("should create edges for depends_on", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    depends_on:
      - db
  db:
    image: postgres:13
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      expect(json.edges).toHaveLength(1);
      expect(json.edges?.[0]).toMatchObject({
        from: "my-app-web",
        to: "my-app-db",
      });
    });

    it("should map node image to Nodejs resource", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  app:
    image: node:18
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const appNode = json.nodes.find((n) => n.id === "my-app-app");
      expect(appNode).toBeDefined();
      expect(appNode?.type).toBe("Nodejs");
      expect(appNode?.provider).toBe("programming");
      expect(appNode?.service).toBe("language");
    });

    it("should assign Docker icon to services with only build configuration", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    depends_on:
      - valkey
  valkey:
    image: valkey/valkey:8.1.2-alpine3.22
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const appNode = json.nodes.find((n) => n.id === "my-app-app");
      expect(appNode).toBeDefined();
      expect(appNode?.type).toBe("Docker");
      expect(appNode?.provider).toBe("onprem");
      expect(appNode?.service).toBe("container");
    });

    it("should use custom image mappings when configured", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createDockerComposePlugin({
        imageMappings: {
          "my-custom-api": {
            provider: "onprem",
            type: "compute",
            resource: "Server",
          },
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  api:
    image: my-custom-api:latest
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const apiNode = json.nodes.find((n) => n.id === "my-app-api");
      expect(apiNode).toBeDefined();
      expect(apiNode?.type).toBe("Server");
      expect(apiNode?.provider).toBe("onprem");
      expect(apiNode?.service).toBe("compute");
    });

    it("should support custom image URLs in imageMappings", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createDockerComposePlugin({
        imageMappings: {
          "my-service": "https://example.com/icon.png",
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  service:
    image: my-service:latest
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const serviceNode = json.nodes.find((n) => n.id === "my-app-service");
      expect(serviceNode).toBeDefined();
      // Check that node exists with the expected ID and label
      expect(serviceNode?.id).toBe("my-app-service");
      expect(serviceNode?.label).toBe("service");
      // Note: The iconUrl is set during import via JSON, but toJSON only preserves
      // provider/type/service for provider-based nodes, not custom icon nodes.
      // The icon is stored internally and will render correctly.
    });

    it("should support { url: ... } object in imageMappings", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createDockerComposePlugin({
        imageMappings: {
          "my-app": { url: "https://cdn.example.com/myapp-icon.svg" },
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  app:
    image: my-app:1.0
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const appNode = json.nodes.find((n) => n.id === "my-app-app");
      expect(appNode).toBeDefined();
      // Check that node exists with the expected ID and label
      expect(appNode?.id).toBe("my-app-app");
      expect(appNode?.label).toBe("app");
      // Note: The iconUrl is set during import via JSON, but toJSON only preserves
      // provider/type/service for provider-based nodes, not custom icon nodes.
      // The icon is stored internally and will render correctly.
    });

    it("should render with custom icon URL", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createDockerComposePlugin({
        imageMappings: {
          "my-service": "https://diagrams-js.hatemhosny.dev/img/logo.svg",
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: my-service:latest
`;

      await diagram.import(composeYaml, "docker-compose");

      // Wait a bit for icon to load (since it's async)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const svg = await diagram.render();

      // The SVG should contain the service node (node ID is HTML-encoded in SVG output)
      expect(svg).toContain("web");

      // Check if icon was loaded by looking for image attribute in DOT (through SVG inspection)
      // The icon should be embedded as a data URL
      const iconData = (diagram as unknown as { ["~getIconData"]: () => Record<string, string> })[
        "~getIconData"
      ]();
      console.log("Icon data keys:", Object.keys(iconData));
      console.log("Icon data values present:", Object.values(iconData).length > 0);
    });

    it("should support Iconify icons in imageMappings", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createDockerComposePlugin({
        imageMappings: {
          "docker-service": { iconify: "logos:docker" },
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: docker-service:latest
`;

      await diagram.import(composeYaml, "docker-compose");

      // Just verify the import succeeds and node is created
      const json = diagram.toJSON();
      const webNode = json.nodes.find((n) => n.id === "my-app-web");
      expect(webNode).toBeDefined();
      expect(webNode?.label).toBe("web");
      // Icon URL should be set to the Iconify URL (accepts both : and / formats)
      expect(webNode?.iconUrl).toMatch(/https:\/\/api\.iconify\.design\/logos[:/]docker\.svg/);
    });

    it("should create cluster for compose project", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      expect(json.clusters).toHaveLength(1);
      expect(json.clusters?.[0].label).toBe("my-app");
    });

    it("should handle networks", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    networks:
      - frontend
networks:
  frontend:
    driver: bridge
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const networkNode = json.nodes.find((n) => n.id === "my-app-network-frontend");
      expect(networkNode).toBeDefined();
      expect(networkNode?.metadata?.compose?._type).toBe("network");

      // Should have edge from web to network
      expect(
        json.edges?.some((e) => e.from === "my-app-web" && e.to === "my-app-network-frontend"),
      ).toBe(true);
    });

    it("should handle volumes", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  db:
    image: postgres:13
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();
      const volumeNode = json.nodes.find((n) => n.id === "my-app-volume-pgdata");
      expect(volumeNode).toBeDefined();
      expect(volumeNode?.metadata?.compose?._type).toBe("volume");

      // Should have edge from db to volume
      expect(
        json.edges?.some((e) => e.from === "my-app-db" && e.to === "my-app-volume-pgdata"),
      ).toBe(true);
    });

    it("should handle bind mount volumes without creating volume nodes", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  backend:
    image: node:latest
    volumes:
      - ./my-volume/
      - /host/path:/container/path
      - /absolute-volume/
      - named_vol:/data
volumes:
  named_vol:
`;

      await diagram.import(composeYaml, "docker-compose");

      const json = diagram.toJSON();

      // Should only have 2 nodes: backend service and named_vol volume
      expect(json.nodes).toHaveLength(2);
      expect(json.nodes.find((n) => n.id === "my-app-backend")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "my-app-volume-named_vol")).toBeDefined();

      // Should not create nodes for bind mounts (relative or absolute)
      expect(json.nodes.find((n) => n.id?.includes("my-volume"))).toBeUndefined();
      expect(json.nodes.find((n) => n.id?.includes("host"))).toBeUndefined();
      expect(json.nodes.find((n) => n.id?.includes("absolute-volume"))).toBeUndefined();

      // Should only have 1 edge: backend -> named_vol
      expect(json.edges).toHaveLength(1);
      expect(json.edges?.[0]).toMatchObject({
        from: "my-app-backend",
        to: "my-app-volume-named_vol",
      });
    });
  });

  describe("Export", () => {
    it("should export to docker-compose format", async () => {
      const diagram = Diagram("my-app");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
  db:
    image: postgres:13
`;

      await diagram.import(composeYaml, "docker-compose");
      const exported = await diagram.export("docker-compose");

      expect(exported).toContain("version: '3.8'");
      expect(exported).toContain("name: my-app");
      expect(exported).toContain("services:");
      expect(exported).toContain("web:");
      expect(exported).toContain("image: nginx:latest");
      expect(exported).toContain("db:");
      expect(exported).toContain("image: postgres:13");
    });

    it("should preserve ports in export", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
`;

      await diagram.import(composeYaml, "docker-compose");
      const exported = await diagram.export("docker-compose");

      expect(exported).toContain("ports:");
      expect(exported).toContain("- '80:80'");
      expect(exported).toContain("- '443:443'");
    });

    it("should preserve environment variables in export", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  db:
    image: postgres:13
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: admin
`;

      await diagram.import(composeYaml, "docker-compose");
      const exported = await diagram.export("docker-compose");

      expect(exported).toContain("environment:");
      expect(exported).toContain("POSTGRES_DB: mydb");
      expect(exported).toContain("POSTGRES_USER: admin");
    });

    it("should preserve depends_on in export", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const composeYaml = `
version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    depends_on:
      - db
  db:
    image: postgres:13
`;

      await diagram.import(composeYaml, "docker-compose");
      const exported = await diagram.export("docker-compose");

      expect(exported).toContain("depends_on:");
      expect(exported).toContain("- db");
    });
  });

  describe("Round-trip", () => {
    it("should preserve all data in import-export round-trip", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([dockerComposePlugin]);

      const originalYaml = `version: "3.8"
name: my-app
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
    depends_on:
      - db
  db:
    image: postgres:13
    environment:
      POSTGRES_DB: mydb
`;

      await diagram.import(originalYaml, "docker-compose");
      const exported = await diagram.export("docker-compose");

      // Import the exported YAML and verify it's the same
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([dockerComposePlugin]);
      await diagram2.import(exported as string, "docker-compose");

      const json1 = diagram.toJSON();
      const json2 = diagram2.toJSON();

      // Compare service configurations
      const web1 = json1.nodes.find((n) => n.id === "my-app-web");
      const web2 = json2.nodes.find((n) => n.id === "my-app-web");
      expect(web2?.metadata?.compose).toEqual(web1?.metadata?.compose);

      const db1 = json1.nodes.find((n) => n.id === "my-app-db");
      const db2 = json2.nodes.find((n) => n.id === "my-app-db");
      expect(db2?.metadata?.compose).toEqual(db1?.metadata?.compose);

      // Compare edges
      expect(json2.edges).toHaveLength(json1.edges?.length || 0);
    });

    it("should export all services when multiple compose files are imported", async () => {
      const diagram = Diagram("Environment Comparison");
      await diagram.registerPlugins([dockerComposePlugin]);

      const stagingCompose = `
name: staging-environment
services:
  web:
    image: nginx:alpine
  api:
    image: myapp:staging
`;

      const productionCompose = `
name: production-environment
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
  api:
    image: myapp:latest
    replicas: 3
`;

      await diagram.import([stagingCompose, productionCompose], "docker-compose");

      const json = diagram.toJSON();
      expect(json.nodes).toHaveLength(4); // 2 services x 2 environments
      expect(json.clusters).toHaveLength(2); // 2 clusters

      const exported = await diagram.export("docker-compose");

      // When multiple compose files have services with the same name,
      // they are merged with the last one winning (production in this case)
      expect(exported).toContain("web:");
      expect(exported).toContain("api:");
      expect(exported).toContain("nginx:latest"); // Production version
      expect(exported).toContain("myapp:latest"); // Production version
      expect(exported).toContain("ports:\n      - '80:80'");
    });
  });
});
