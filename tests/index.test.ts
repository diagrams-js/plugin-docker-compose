import { describe, it, expect } from "vitest";
import { Diagram } from "diagrams-js";
import { dockerComposePlugin } from "../src/index.js";

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
      expect(json.nodes.find((n) => n.id === "web")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "db")).toBeDefined();
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
      const webNode = json.nodes.find((n) => n.id === "web");
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
        from: "web",
        to: "db",
      });
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
      const networkNode = json.nodes.find((n) => n.id === "network-frontend");
      expect(networkNode).toBeDefined();
      expect(networkNode?.metadata?.compose?.type).toBe("network");

      // Should have edge from web to network
      expect(json.edges?.some((e) => e.from === "web" && e.to === "network-frontend")).toBe(true);
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
      const volumeNode = json.nodes.find((n) => n.id === "volume-pgdata");
      expect(volumeNode).toBeDefined();
      expect(volumeNode?.metadata?.compose?.type).toBe("volume");

      // Should have edge from db to volume
      expect(json.edges?.some((e) => e.from === "db" && e.to === "volume-pgdata")).toBe(true);
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

      expect(exported).toContain('version: "3.8"');
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
      expect(exported).toContain('- "80:80"');
      expect(exported).toContain('- "443:443"');
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
      const web1 = json1.nodes.find((n) => n.id === "web");
      const web2 = json2.nodes.find((n) => n.id === "web");
      expect(web2?.metadata?.compose).toEqual(web1?.metadata?.compose);

      const db1 = json1.nodes.find((n) => n.id === "db");
      const db2 = json2.nodes.find((n) => n.id === "db");
      expect(db2?.metadata?.compose).toEqual(db1?.metadata?.compose);

      // Compare edges
      expect(json2.edges).toHaveLength(json1.edges?.length || 0);
    });
  });
});
