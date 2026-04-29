# AIX MCP Server

[中文文档](./README.zh-CN.md)

An extensible Model Context Protocol (MCP) server with a plugin system, proxy forwarding, Web Dashboard, and a built-in service registry.

## Features

- **Dual Transport** — stdio (for Cursor / Claude Desktop) and Streamable HTTP
- **Plugin System** — 6 built-in utility plugins; extend via npm packages or local paths
- **Proxy Forwarding** — Aggregate multiple remote MCP servers into a single endpoint
- **Web Dashboard** — Manage plugins, proxies, and logs through a visual interface
- **Service Registry** — Pre-loaded catalog of popular MCP services with one-click install and config copy
- **LLM-Powered Search** — AI-driven discovery and recommendations for MCP services
- **Docker Ready** — Multi-stage build, works out of the box

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
|--------|-------|-------------|
| **calculator** | `calculator` | Math expression evaluation |
| **crypto** | `hash-text`, `random-uuid`, `random-string` | Hashing, UUID, random strings |
| **datetime** | `current-time`, `format-time` | Current time, time formatting |
| **filesystem** | `list-files`, `read-file` + Resource | File listing, reading, file resource |
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

## Project Structure

```
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
