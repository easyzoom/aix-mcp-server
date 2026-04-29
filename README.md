# AIX MCP Server

[中文文档](./README.zh-CN.md)

An extensible Model Context Protocol (MCP) server with a plugin system, proxy forwarding, Web Dashboard, and a built-in service registry.

![AIX MCP Server banner](./docs/assets/banner.svg)

## Features

- **Dual Transport** — stdio (for Cursor / Claude Desktop) and Streamable HTTP
- **Plugin System** — 7 built-in utility plugins; extend via npm packages, local paths, or JSON files
- **Proxy Forwarding** — Aggregate multiple remote MCP servers into a single endpoint
- **Web Dashboard** — Manage plugins, proxies, and logs through a visual interface
- **Service Registry** — Pre-loaded catalog of popular MCP services with one-click install and config copy
- **LLM-Powered Search** — AI-driven discovery and recommendations for MCP services
- **Docker Ready** — Multi-stage build, works out of the box

## Preview

![Dashboard preview](./docs/assets/dashboard-preview.svg)

## Quick Start

### Local

```bash
npm install
npm run build

# stdio mode (for MCP clients)
npm start

# HTTP mode (starts web server + dashboard)
node dist/index.js http
```

### Docker

```bash
# Build and start (detached)
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The service listens on `http://localhost:3080` by default.

## Built-in Plugins

| Plugin | Tools | Description |
| -------- | ------- | ------------- |
| **calculator** | `calculator` | Math expression evaluation |
| **crypto** | `hash-text`, `random-uuid`, `random-string` | Hashing, UUID, random strings |
| **datetime** | `current-time`, `format-time` | Current time, time formatting |
| **filesystem** | `list-files`, `read-file` + Resource | File listing, reading, file resource |
| **hello-json** | `hello-json` + Resource | Declarative JSON-authored plugin example |
| **system** | `run-command` + Resource | Shell command execution, system info resource |
| **text-utils** | `json-format`, `base64`, `text-stats` | JSON formatting, Base64 encode/decode, text stats |

## MCP Client Configuration

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "aix-mcp-server": {
      "command": "node",
      "args": ["/path/to/aix-mcp-server/dist/index.js"]
    }
  }
}
```

Or use HTTP mode (start the server first):

```json
{
  "mcpServers": {
    "aix-mcp-server": {
      "url": "http://localhost:3080/mcp"
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aix-mcp-server": {
      "command": "node",
      "args": ["/path/to/aix-mcp-server/dist/index.js"]
    }
  }
}
```

## Plugin Development

Create a TypeScript file that default-exports an object conforming to the `McpPlugin` interface:

```typescript
import { z } from "zod";
import type { McpPlugin } from "aix-mcp-server/plugin";

const plugin: McpPlugin = {
  name: "my-plugin",
  description: "My custom plugin",
  register(server) {
    server.registerTool("my-tool", {
      title: "My Tool",
      description: "Does something useful",
      inputSchema: z.object({
        input: z.string().describe("Input value"),
      }),
    }, async ({ input }) => {
      return { content: [{ type: "text", text: `Result: ${input}` }] };
    });
  },
};

export default plugin;
```

See `examples/mcp-plugin-example/` for a complete example.

### JSON Plugins

You can also create lightweight local MCP plugins using only JSON, similar to sharing a userscript. JSON plugins are declarative and do not execute arbitrary JavaScript. They currently support template/json tool responses and static resources.

Create `plugins/my-json-plugin.json`:

```json
{
  "schemaVersion": 1,
  "name": "my-json-plugin",
  "description": "A declarative JSON MCP plugin",
  "tools": [
    {
      "name": "hello",
      "title": "Hello",
      "description": "Return a greeting",
      "inputSchema": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string", "description": "Name to greet" }
        }
      },
      "response": {
        "type": "template",
        "text": "Hello {{name}}!"
      }
    }
  ]
}
```

Then add it to `mcp-plugins.json`:

```json
{
  "source": "./plugins/my-json-plugin.json",
  "enabled": true
}
```

### Installing Plugins

```bash
# Via CLI
node dist/cli.js add ./path/to/plugin
node dist/cli.js add some-npm-package

# Or edit mcp-plugins.json directly
```

## Proxy Configuration

Edit `mcp-proxy.json` to add remote MCP servers:

```json
{
  "targets": [
    {
      "name": "remote-server",
      "url": "http://other-mcp:3000/mcp",
      "enabled": true,
      "description": "Remote MCP server"
    }
  ]
}
```

## Quality Checks

```bash
npm test
npm run registry:validate
```

`registry:validate` checks `mcp-registry.json` and configured JSON plugins before you open a pull request.

## Architecture

![AIX MCP Server architecture](./docs/assets/architecture.svg)

See [Architecture Notes](./docs/architecture.md) and [Registry Schema](./docs/registry-schema.md) for contributor-facing design details.

See [Cursor Integration Guide](./docs/cursor-integration.md) to configure this server for one project or all Cursor workspaces.

See [Technical Roadmap](./docs/roadmap.md) for the planned v1.1, v1.2, and v2.0 evolution.

## Troubleshooting

- `http://localhost:3080/mcp` returns `Missing or invalid session ID`: this is expected when opening the MCP endpoint directly in a browser. Use the Dashboard at `http://localhost:3080`, or connect through an MCP client.
- Dashboard changes do not appear: rebuild and restart the server or container after changing TypeScript, plugins, or config files.
- JSON plugin fails to load: run `npm run registry:validate` to get an exact field path for the invalid JSON.
- Sandbox upgrade fails: inspect the failed check and its `Fix` message in the Dashboard, then rerun sandbox validation.

## Project Structure

```text
aix-mcp-server/
├── src/
│   ├── index.ts          # Entry (stdio / HTTP transport)
│   ├── cli.ts            # Plugin management CLI
│   ├── loader.ts         # Plugin loader
│   ├── plugin.ts         # Plugin interface
│   ├── proxy.ts          # Proxy forwarding
│   ├── registry.ts       # Service registry
│   ├── llm.ts            # LLM provider integration
│   ├── plugins/          # Built-in plugins
│   │   ├── calculator.ts
│   │   ├── crypto.ts
│   │   ├── datetime.ts
│   │   ├── filesystem.ts
│   │   ├── system.ts
│   │   └── text-utils.ts
│   └── web/
│       ├── api.ts        # Dashboard API routes
│       └── dashboard.html
├── mcp-plugins.json      # Plugin configuration
├── mcp-proxy.json        # Proxy configuration
├── mcp-registry.json     # Service registry data
├── llm-config.json       # LLM provider configuration
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## License

MIT
