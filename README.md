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

## API

### `dockerComposePlugin`

Creates the Docker Compose plugin instance.

```typescript
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const plugin = dockerComposePlugin;
```

The plugin provides:

- **Importer**: `name: "docker-compose"`, supports `.yml` and `.yaml` files
- **Exporter**: `name: "docker-compose"`, exports to `.yml` format

## Runtime Support

- Node.js ✅
- Browser ✅
- Deno ✅
- Bun ✅

## License

MIT
