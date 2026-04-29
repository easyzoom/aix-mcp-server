# AIX MCP Server

[English](./README.md)

可扩展的 Model Context Protocol (MCP) 服务器，支持插件系统、代理转发、Web Dashboard 和服务注册中心。

## 特性

- **双传输模式** — stdio（用于 Cursor / Claude Desktop）和 Streamable HTTP
- **插件系统** — 内置 6 个实用插件，支持通过 npm 包或本地路径扩展
- **代理转发** — 将多个远程 MCP 服务器聚合为一个统一端点
- **Web Dashboard** — 可视化管理插件、代理、查看日志
- **服务注册中心** — 预置常见 MCP 服务信息，支持一键安装和配置复制
- **LLM 智能搜索** — AI 驱动的 MCP 服务发现与推荐
- **Docker 部署** — 多阶段构建，开箱即用

## 快速开始

### 本地运行

```bash
npm install
npm run build

# stdio 模式（供 MCP 客户端连接）
npm start

# HTTP 模式（启动 Web 服务 + Dashboard）
node dist/index.js http
```

### Docker 部署

```bash
# 一键构建并启动（后台）
docker compose up --build -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

服务默认监听 `http://localhost:3080`。

## 内置插件

| 插件 | Tools | 说明 |
|------|-------|------|
| **calculator** | `calculator` | 数学表达式求值 |
| **crypto** | `hash-text`, `random-uuid`, `random-string` | 哈希、UUID、随机字符串 |
| **datetime** | `current-time`, `format-time` | 当前时间、时间格式化 |
| **filesystem** | `list-files`, `read-file` + Resource | 文件列表、读取、文件资源 |
| **system** | `run-command` + Resource | Shell 命令执行、系统信息资源 |
| **text-utils** | `json-format`, `base64`, `text-stats` | JSON 格式化、Base64 编解码、文本统计 |

## MCP 客户端配置

### Cursor

在 Cursor 的 MCP 设置中添加：

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

或使用 HTTP 模式（先启动服务）：

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

在 `claude_desktop_config.json` 中添加：

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

## 插件开发

创建一个 TypeScript 文件，导出符合 `McpPlugin` 接口的默认对象：

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

参考 `examples/mcp-plugin-example/` 目录获取完整示例。

### 安装插件

```bash
# 通过 CLI
node dist/cli.js add ./path/to/plugin
node dist/cli.js add some-npm-package

# 或直接编辑 mcp-plugins.json
```

## 代理配置

编辑 `mcp-proxy.json` 添加远程 MCP 服务器：

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

## 项目结构

```
aix-mcp-server/
├── src/
│   ├── index.ts          # 入口（stdio / HTTP 传输）
│   ├── cli.ts            # 插件管理 CLI
│   ├── loader.ts         # 插件加载器
│   ├── plugin.ts         # 插件接口定义
│   ├── proxy.ts          # 代理转发
│   ├── registry.ts       # 服务注册中心
│   ├── llm.ts            # LLM 提供商集成
│   ├── plugins/          # 内置插件
│   │   ├── calculator.ts
│   │   ├── crypto.ts
│   │   ├── datetime.ts
│   │   ├── filesystem.ts
│   │   ├── system.ts
│   │   └── text-utils.ts
│   └── web/
│       ├── api.ts        # Dashboard API 路由
│       └── dashboard.html
├── mcp-plugins.json      # 插件配置
├── mcp-proxy.json        # 代理配置
├── mcp-registry.json     # 服务注册中心数据
├── llm-config.json       # LLM 提供商配置
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## License

MIT
