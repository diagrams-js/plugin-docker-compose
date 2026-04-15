# @diagrams-js/plugin-docker-compose

Docker Compose import/export plugin for diagrams-js. Convert between Docker Compose YAML files and architecture diagrams.

## Installation

```bash
npm install @diagrams-js/plugin-docker-compose
```

## Usage

### Import from Docker Compose

```typescript
import { Diagram } from "diagrams-js";
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const diagram = Diagram("My Application");

// Register the plugin
await diagram.registerPlugins([dockerComposePlugin]);

// Import from Docker Compose YAML
const composeYaml = `
version: "3.8"
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

await diagram.import(composeYaml, "docker-compose");

// Render the diagram
const svg = await diagram.render();
```

### Export to Docker Compose

```typescript
import { Diagram, Node } from "diagrams-js";
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const diagram = Diagram("My Application");

// Create nodes with Docker Compose metadata
const web = diagram.add(Node("web"));
web.metadata = {
  compose: {
    image: "nginx:latest",
    ports: ["80:80"],
  },
};

const db = diagram.add(Node("db"));
db.metadata = {
  compose: {
    image: "postgres:13",
    environment: { POSTGRES_DB: "mydb" },
  },
};

// Create dependency
web.from(db);

// Register plugin and export
await diagram.registerPlugins([dockerComposePlugin]);
const composeYaml = await diagram.export("docker-compose");

console.log(composeYaml);
// Output:
// version: "3.8"
// name: my-application
// services:
//   web:
//     image: nginx:latest
//     ports:
//       - "80:80"
//     depends_on:
//       - db
//   db:
//     image: postgres:13
//     environment:
//       POSTGRES_DB: mydb
```

## Features

### Import

- Parse Docker Compose YAML files
- Create nodes for each service with Docker icons
- Create clusters for compose projects
- Create edges for service dependencies (`depends_on`)
- Support for networks and volumes
- Store compose-specific metadata on nodes

### Export

- Export diagrams to Docker Compose YAML format
- Include service configuration (image, ports, environment, volumes, etc.)
- Reconstruct dependencies from edges
- Include networks and volumes
- Generate valid Docker Compose files

## Configuration

### Custom Image Mappings

You can customize which icons are used for specific Docker images. The plugin supports multiple mapping formats:

**Mapping Priority:**

1. **Service name** (e.g., `my-custom-api`) - takes precedence
2. **Image name** (e.g., `nginx`, `postgres`) - fallback

```typescript
import { Diagram } from "diagrams-js";
import { createDockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const diagram = Diagram("My Application");

// Create plugin with custom image mappings
const plugin = createDockerComposePlugin({
  imageMappings: {
    // 1. Provider icon mapping - use built-in provider icons
    "my-custom-api": {
      provider: "onprem",
      type: "compute",
      resource: "Server",
    },
    "company-db": {
      provider: "onprem",
      type: "database",
      resource: "Postgresql",
    },

    // 2. Direct URL string - use a custom image URL
    "my-frontend": "https://example.com/react-icon.png",

    // 3. URL object - same as string but as object
    "my-backend": {
      url: "https://example.com/node-icon.svg",
    },

    // 4. Iconify icon - use icons from Iconify (https://iconify.design/)
    // Format: { iconify: "prefix:name" }
    "docker-service": {
      iconify: "logos:docker",
    },
    "aws-service": {
      iconify: "logos:aws",
    },
    kubernetes: {
      iconify: "logos:kubernetes",
    },
  },
});

await diagram.registerPlugins([plugin]);
```

### `ImageMappings` Type

Exported TypeScript type for defining image mappings with full type safety:

```typescript
import { createDockerComposePlugin, ImageMappings } from "@diagrams-js/plugin-docker-compose";

const mappings: ImageMappings = {
  "my-api": { provider: "onprem", type: "compute", resource: "Server" },
  "my-app": { iconify: "logos:docker" },
  "custom-service": "https://example.com/icon.svg",
};

const plugin = createDockerComposePlugin({ imageMappings: mappings });
```

## Working with Clusters

Clusters are created through the diagram instance, not by calling `Cluster()` directly:

```typescript
import { Diagram, Node } from "diagrams-js";
import { ECS } from "diagrams-js/aws/compute";

const diagram = Diagram("My Architecture");

// ✅ Correct: Create cluster via diagram.cluster()
const cluster = diagram.cluster("Services");
cluster.add(Node("Web Server"));
cluster.add(ECS("API"));

// Nested clusters
const outer = diagram.cluster("Production");
const inner = outer.cluster("Services");
inner.add(ECS("API"));

// ❌ Incorrect: Don't call Cluster() directly
// const cluster = Cluster("VPC"); // This will throw an error
```

The Docker Compose plugin automatically creates clusters for each compose project during import.

## Runtime Support

- Browser ✅
- Node.js ✅
- Deno ✅
- Bun ✅

## License

MIT
