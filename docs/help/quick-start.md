# Quick Start / 快速开始

## Discover MCP Services / 发现 MCP 服务

Go to the **Guide** tab to browse all registered MCP services. Use the search bar to find by name, or click **AI** for smart recommendations.

进入 **Guide** 页面浏览所有 MCP 服务。你可以使用搜索框按名称检索，也可以点击 **AI** 获取智能推荐。

- Filter by **security level** (`S1`-`S4`) and **tags**
- Click a service card to view details, capabilities, install config, and related services
- Use the AI assistant to describe your need in natural language

## Install Services / 安装服务

Go to the **Plugins** tab and click **+ Add MCP Service**.

进入 **Plugins** 页面，点击 **+ Add MCP Service** 添加服务。

Supported install types:

- **Plugin**: local plugin path, for example `./plugins/my-plugin`
- **Proxy**: remote MCP endpoint, for example `http://host:3000/mcp`
- **Standalone**: external command, for example `npx -y @some/mcp-server`

## Client Configuration / 客户端配置

Connect your MCP client using either stdio or HTTP mode.

```bash
# stdio
node dist/index.js

# HTTP
node dist/index.js http
```

HTTP endpoint:

```text
http://localhost:3080/mcp
```
