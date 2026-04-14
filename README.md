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

**Mapping by Service Name vs Image Name:**

The plugin first checks for a mapping by the **service name**, then falls back to the **image name**:

```yaml
# docker-compose.yml
services:
  my-api:
    image: nginx:latest # Would normally show nginx icon
```

```typescript
// This mapping by SERVICE NAME takes precedence
imageMappings: {
  "my-api": { iconify: "logos:aws" }  // Shows AWS icon instead of nginx
}

// This mapping by IMAGE NAME is the fallback
imageMappings: {
  "nginx": { iconify: "logos:nginx" }  // Used only if no "my-api" mapping
}
```

#### Iconify Icons

The plugin supports [Iconify](https://iconify.design/) icons, which provides access to 100,000+ open source icons. Use the `{ iconify: "prefix:name" }` format:

- Browse icons at https://icon-sets.iconify.design/
- Common prefixes: `logos:` (technology logos), `mdi:` (Material Design), `fluent-emoji:` (emoji)
- Examples:
  - `{ iconify: "logos:docker" }` - Docker logo
  - `{ iconify: "logos:aws" }` - AWS logo
  - `{ iconify: "mdi:server" }` - Server icon
  - `{ iconify: "logos:kubernetes" }` - Kubernetes logo

Icons are automatically fetched from the Iconify API and embedded in the diagram.

## API

### `dockerComposePlugin`

Pre-created plugin instance (no configuration).

```typescript
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

await diagram.registerPlugins([dockerComposePlugin]);
```

### `createDockerComposePlugin(config?)`

Factory function to create a configured plugin instance.

```typescript
import { createDockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const plugin = createDockerComposePlugin({
  defaultVersion: "3.9",
  imageMappings: {
    "custom-db": { provider: "onprem", type: "database", resource: "Postgresql" },
  },
});

await diagram.registerPlugins([plugin]);
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
