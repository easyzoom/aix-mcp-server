# Cursor Integration Guide / Cursor 集成指引

This guide explains how to connect AIX MCP Server to Cursor so it can be used by AI Agents.

本文说明如何将 AIX MCP Server 集成到 Cursor，让 Cursor Agent 可以调用本项目提供的 MCP tools 和 resources。

## Integration Modes / 集成方式

Cursor supports two common MCP configuration scopes:

| Scope | Config path | Use case |
| --- | --- | --- |
| Project-level | `.cursor/mcp.json` inside a repository | Only this project can use the MCP server |
| Global user-level | `~/.cursor/mcp.json` | All Cursor workspaces can use the MCP server |

If you want every Cursor project to use AIX MCP Server, use the global user-level config.

如果希望所有 Cursor 打开的工程都能使用 AIX MCP Server，请使用用户级全局配置。

## Recommended: HTTP Integration / 推荐：HTTP 网络集成

HTTP integration is best when you want all Cursor workspaces to share one running AIX MCP Server.

如果希望所有 Cursor 工程共用一个 AIX MCP Server，推荐使用 HTTP 网络集成。

Benefits:

- One long-running MCP server shared by all Cursor projects
- Dashboard and MCP endpoint use the same process
- Works well with Docker and system services
- Easier to observe with `/health` and Dashboard logs

Start the server with Docker:

```bash
docker compose up --build -d
```

Or start it locally:

```bash
npm run build
node dist/index.js http
```

Verify HTTP health:

```bash
curl http://localhost:3080/health
```

Then configure Cursor globally:

```json
{
  "mcpServers": {
    "aix-mcp-server": {
      "url": "http://localhost:3080/mcp"
    }
  }
}
```

Opening `http://localhost:3080/mcp` directly in a browser may show `Missing or invalid session ID`. That is expected because MCP Streamable HTTP requires the client to initialize a session first.

直接在浏览器打开 `http://localhost:3080/mcp` 可能看到 `Missing or invalid session ID`，这是正常的，因为 MCP Streamable HTTP 需要客户端先初始化会话。

## Alternative: stdio Integration / 备选：stdio 集成

stdio integration is useful for a single project or for simple local development. Cursor starts the MCP server process itself.

stdio 适合单项目或本地开发场景，由 Cursor 自己启动 MCP Server 进程。

## Build the Server for stdio / 为 stdio 构建服务

Run this in the AIX MCP Server repository:

```bash
npm install
npm run build
```

The stdio Cursor config should point to the built entry:

```text
/home/wyh/Desktop/self/aix-mcp-server/dist/index.js
```

## Global Cursor Config with stdio / stdio 全局配置

Edit `~/.cursor/mcp.json` and add `aix-mcp-server` under `mcpServers`.

```json
{
  "mcpServers": {
    "aix-mcp-server": {
      "command": "node",
      "args": [
        "/home/wyh/Desktop/self/aix-mcp-server/dist/index.js"
      ]
    }
  }
}
```

If your `~/.cursor/mcp.json` already has other servers, merge only the `aix-mcp-server` entry and keep the existing entries.

如果 `~/.cursor/mcp.json` 已经有其他 MCP 服务，只需要合并 `aix-mcp-server` 这一项，不要覆盖已有配置。

## Project-Level Config with stdio / stdio 项目级配置

For a single repository only, create `.cursor/mcp.json` in that repository:

```json
{
  "mcpServers": {
    "aix-mcp-server": {
      "command": "node",
      "args": [
        "/home/wyh/Desktop/self/aix-mcp-server/dist/index.js"
      ]
    }
  }
}
```

Avoid defining the same server in both global and project-level config at the same time, otherwise Cursor may show duplicate MCP servers.

不建议同时在全局和项目级配置同名服务，否则 Cursor 中可能出现重复 MCP Server。

## Reload Cursor / 重载 Cursor

After changing MCP config:

1. Run `Reload Window` in Cursor.
2. Open Cursor MCP settings or tools list.
3. Confirm `aix-mcp-server` appears.

修改 MCP 配置后：

1. 在 Cursor 中执行 `Reload Window`。
2. 打开 MCP 设置或工具列表。
3. 确认能看到 `aix-mcp-server`。

## Verify Tools / 验证功能

Try these prompts in Cursor Agent:

```text
用 MCP 计算 123 * 456
```

```text
调用 current-time 获取当前时间
```

```text
用 text-utils 统计这段文本字数：hello world
```

If Cursor can call tools such as `calculator`, `current-time`, `json-format`, or `text-stats`, the integration is working.

如果 Cursor 能调用 `calculator`、`current-time`、`json-format` 或 `text-stats` 等工具，说明集成成功。

## Troubleshooting / 故障排查

- `aix-mcp-server` does not appear: reload Cursor and verify `~/.cursor/mcp.json` is valid JSON.
- Tools fail to start: run `npm run build` again and confirm `dist/index.js` exists.
- Tools are duplicated: remove either the global or project-level MCP config.
- Config path is different on another machine: update the absolute path in `args`.
- HTTP server is down: run `docker compose up -d` and verify `curl http://localhost:3080/health`.
- Need Dashboard mode: open `http://localhost:3080` when the HTTP server is running.

## Recommended Setup / 推荐配置

For personal daily use across all Cursor workspaces, prefer global HTTP config:

```text
~/.cursor/mcp.json
```

For open source examples or repository-specific demos, prefer project-level stdio config:

```text
.cursor/mcp.json
```
