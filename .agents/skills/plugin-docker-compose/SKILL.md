---
name: plugin-docker-compose
description: >-
  Import and export Docker Compose files with diagrams-js.
  Convert docker-compose.yml to architecture diagrams and vice versa.
type: feature
library: diagrams-js
---

# Docker Compose Plugin for diagrams-js

The Docker Compose plugin enables bidirectional conversion between Docker Compose YAML files and architecture diagrams.

## When to Use This Skill

Use this skill when you need to:

- Visualize Docker Compose configurations as architecture diagrams
- Generate Docker Compose files from existing diagrams
- Import multi-service applications into diagrams
- Export diagrams to deployment configurations
- Document container orchestration setups

## Quick Start

### Installation

```bash
npm install @diagrams-js/plugin-docker-compose
```

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
```

## Features

### Import Capabilities

- Parse Docker Compose YAML files
- Create nodes for each service with appropriate icons (based on image)
- Create clusters for compose projects
- Create edges for service dependencies (`depends_on`)
- Support for networks and volumes
- Store compose-specific metadata on nodes
- Import multiple compose files into separate clusters

### Export Capabilities

- Export diagrams to Docker Compose YAML format
- Include service configuration (image, ports, environment, volumes, etc.)
- Reconstruct dependencies from edges
- Include networks and volumes
- Generate valid Docker Compose files

## Supported Docker Compose Fields

### Services

- `image` - Maps to appropriate provider icons
- `build` - Build configuration
- `ports` - Port mappings
- `environment` - Environment variables
- `volumes` - Volume mounts
- `depends_on` - Service dependencies (creates edges)
- `networks` - Network connections
- `command` - Container command
- `working_dir` - Working directory
- `restart` - Restart policy
- `labels` - Container labels

### Networks

- `driver` - Network driver
- `external` - External network flag

### Volumes

- `driver` - Volume driver
- `external` - External volume flag

## Image to Icon Mapping

The plugin automatically maps Docker images to appropriate provider icons:

### Databases

- `postgres` → PostgreSQL
- `mysql` → MySQL
- `mariadb` → MariaDB
- `mongo` / `mongodb` → MongoDB
- `redis` → Redis
- `cassandra` → Cassandra
- `couchdb` → CouchDB
- `influxdb` → InfluxDB
- `neo4j` → Neo4j
- `oracle` → Oracle
- `mssql` → MSSQL

### Message Queues

- `kafka` → Kafka
- `rabbitmq` → RabbitMQ

### Monitoring

- `prometheus` → Prometheus
- `grafana` → Grafana

### Search

- `elasticsearch` → Elasticsearch

### Web Servers

- `nginx` → Nginx
- `apache` / `httpd` → Apache

### Container Orchestration

- `nomad` → Nomad

### Default

- Other images → Generic container

## API Reference

### `dockerComposePlugin`

Pre-created Docker Compose plugin instance (no configuration needed).

```typescript
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

// Use directly
await diagram.registerPlugins([dockerComposePlugin]);
```

The plugin provides:

- **Importer**: `name: "docker-compose"`, supports `.yml` and `.yaml` files
- **Exporter**: `name: "docker-compose"`, exports to `.yml` format

### `createDockerComposePlugin(config?)`

Factory function for creating a configured plugin instance.

```typescript
import { createDockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

// Create with custom configuration
const plugin = createDockerComposePlugin({
  defaultVersion: "3.9",
  imageMappings: {
    "custom-db": { provider: "onprem", type: "database", resourceType: "Postgresql" },
  },
});

await diagram.registerPlugins([plugin]);
```

## Examples

### Visualize a Microservices Architecture

```typescript
import { Diagram } from "diagrams-js";
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const composeYaml = `
version: "3.8"
name: ecommerce-app
services:
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - api
      
  api:
    image: node:18
    ports:
      - "3000:3000"
    depends_on:
      - db
      - cache
      
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: ecommerce
    volumes:
      - pgdata:/var/lib/postgresql/data
      
  cache:
    image: redis:7-alpine
    
volumes:
  pgdata:
`;

const diagram = Diagram("E-commerce Application");
await diagram.registerPlugins([dockerComposePlugin]);
await diagram.import(composeYaml, "docker-compose");

const svg = await diagram.render();
```

### Import Multiple Compose Files

```typescript
const compose1 = `
name: frontend-app
services:
  web:
    image: nginx
`;

const compose2 = `
name: backend-api
services:
  api:
    image: node:18
`;

const diagram = Diagram("Full Stack");
await diagram.registerPlugins([dockerComposePlugin]);

// Each compose file gets its own cluster
await diagram.import([compose1, compose2], "docker-compose");
```

### Export with Custom Metadata

```typescript
import { Diagram, Node } from "diagrams-js";
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

const diagram = Diagram("Production Stack");

const web = diagram.add(Node("web"));
web.metadata = {
  compose: {
    image: "nginx:latest",
    ports: ["80:80", "443:443"],
    restart: "always",
    labels: {
      app: "web",
      env: "production",
    },
  },
};

await diagram.registerPlugins([dockerComposePlugin]);
const compose = await diagram.export("docker-compose");
```

## Runtime Support

- Node.js ✅
- Browser ✅
- Deno ✅
- Bun ✅

## Best Practices

### 1. Use Service Names as Labels

Service names in Docker Compose become node labels:

```yaml
services:
  web-server: # Node label will be "web-server"
    image: nginx
```

### 2. Store Metadata for Round-trip

When creating nodes programmatically, store compose metadata:

```typescript
const node = diagram.add(Node("my-service"));
node.metadata = {
  compose: {
    image: "my-image:latest",
    ports: ["8080:80"],
    environment: { NODE_ENV: "production" },
  },
};
```

### 3. Handle Dependencies

Use `depends_on` in compose or `.from()` in code to create edges:

```typescript
// In Docker Compose
web.depends_on:
  - db

// In diagrams-js
web.from(db);
```

### 4. Multiple Compose Files

Import multiple compose files to compare architectures:

```typescript
await diagram.import([stagingCompose, productionCompose], "docker-compose");
```

## Troubleshooting

### Plugin Not Found

```typescript
// Make sure to register the plugin before using import/export
import { dockerComposePlugin } from "@diagrams-js/plugin-docker-compose";

await diagram.registerPlugins([dockerComposePlugin]);
```

### Type Errors

The metadata property is typed as `Record<string, any>`, so you can access it directly:

```typescript
node.metadata = {
  compose: { ... }
};
```

### Missing Icons

The plugin maps common images to provider icons. For custom images, a generic container icon is used.

## Further Reading

- diagrams-js Plugin System: See `diagrams-js-plugin-system` skill
- diagrams-js Documentation: https://diagrams-js.hatemhosny.dev
- Docker Compose Reference: https://docs.docker.com/compose/
