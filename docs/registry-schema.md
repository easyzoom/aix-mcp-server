# MCP Registry Schema / MCP 注册中心字段规范

`mcp-registry.json` is the public catalog used by the Guide Center. Each entry should be complete enough for users and agents to understand, install, and validate the MCP service.

`mcp-registry.json` 是 Guide Center 使用的公开目录。每个条目都应该包含足够的信息，方便用户和 Agent 理解、安装并验证 MCP 服务。

## Required Fields / 必填字段

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable unique id, kebab-case recommended |
| `name` | string | Human-readable service name |
| `version` | string | Semantic version, for example `1.0.0` |
| `date` | string | Date in `YYYY-MM-DD` format |
| `source` | string | HTTPS source URL or trusted local source path |
| `summary` | string | Short one-line description |
| `description` | string | Detailed service explanation |
| `tags` | string[] | Search and filter tags |
| `usageCount` | number | Local usage/copy counter |
| `relatedIds` | string[] | Related registry entry ids |
| `verified` | boolean | Maintainer/community verification flag |
| `securityLevel` | `S1`-`S4` | Current trust level |
| `contributor` | string | Person or organization contributing the entry |
| `license` | string | Service license |
| `install` | object | Installation or client configuration |
| `capabilities` | object | Declared tools, prompts, and resources |

## Install Types / 安装类型

```json
{
  "install": {
    "type": "plugin",
    "pluginSource": "./plugins/hello-json.json"
  }
}
```

```json
{
  "install": {
    "type": "proxy",
    "proxyUrl": "http://localhost:4000/mcp"
  }
}
```

```json
{
  "install": {
    "type": "standalone",
    "command": "npx -y @modelcontextprotocol/server-filesystem",
    "cursorConfig": {
      "mcpServers": {}
    },
    "claudeConfig": {
      "mcpServers": {}
    }
  }
}
```

## Validation / 本地校验

Run the registry validator before opening a pull request:

```bash
npm run build
npm run registry:validate
```

The validator checks duplicate ids, required fields, semantic versions, install config, related ids, and configured JSON plugins.
