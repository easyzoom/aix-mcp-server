## Summary / 变更摘要

<!--
EN: Briefly describe what this PR changes and why.
中文：简要说明这个 PR 改了什么，以及为什么要改。
-->

- 

## Type of Change / 变更类型

<!-- Check all that apply / 勾选适用项 -->

- [ ] Feature / 新功能
- [ ] Bug fix / 修复问题
- [ ] Refactor / 重构
- [ ] Documentation / 文档
- [ ] CI/CD or tooling / CI/CD 或工程配置
- [ ] Security / 安全相关
- [ ] MCP service registry update / MCP 服务注册中心更新
- [ ] Plugin or proxy change / 插件或代理变更

## MCP Impact / MCP 影响范围

<!--
EN: Explain how this affects MCP clients, tools, resources, prompts, plugins, proxy targets, or registry entries.
中文：说明是否影响 MCP 客户端、工具、资源、提示词、插件、代理目标或注册中心条目。
-->

- [ ] No MCP behavior changes / 不影响 MCP 行为
- [ ] Adds or changes tools / 新增或修改 tools
- [ ] Adds or changes resources / 新增或修改 resources
- [ ] Adds or changes prompts / 新增或修改 prompts
- [ ] Adds or changes plugin loading / 新增或修改插件加载
- [ ] Adds or changes proxy behavior / 新增或修改代理行为
- [ ] Adds or changes registry metadata / 新增或修改注册中心元数据

Details / 说明：

-

## Security & Sandbox / 安全与沙箱验证

<!--
EN: Required for changes touching registry entries, install commands, proxy targets, filesystem/system tools, auth, or external network access.
中文：如果改动涉及注册中心条目、安装命令、代理目标、文件系统/系统工具、认证或外部网络访问，请填写。
-->

- [ ] Not applicable / 不适用
- [ ] Security level reviewed / 已检查安全等级
- [ ] Sandbox validation passed / 沙箱验证通过
- [ ] New or changed install command reviewed / 已检查新增或修改的安装命令
- [ ] External URL/source reviewed / 已检查外部 URL/source
- [ ] No secrets or credentials committed / 未提交密钥或凭证

Sandbox result / 沙箱结果：

```text
Paste output or summary here.
```

## Screenshots / 截图

<!--
EN: Add screenshots for Dashboard/UI changes.
中文：如果修改了 Dashboard/UI，请添加截图。
-->

## Test Plan / 测试计划

<!-- Check completed items / 勾选已完成项 -->

- [ ] `npm run build`
- [ ] Docker build/start tested / 已测试 Docker 构建与启动
- [ ] Dashboard manually tested / 已手动测试 Dashboard
- [ ] MCP stdio mode tested / 已测试 MCP stdio 模式
- [ ] MCP HTTP endpoint tested / 已测试 MCP HTTP 端点
- [ ] Relevant API endpoint tested / 已测试相关 API 接口

Additional notes / 其他说明：

-

## Checklist / 提交前检查

- [ ] I have kept the change focused and avoided unrelated refactors.
      / 我已保持改动聚焦，避免无关重构。
- [ ] I have updated documentation if behavior or setup changed.
      / 如果行为或配置方式有变化，我已更新文档。
- [ ] I have considered backward compatibility for existing configs.
      / 我已考虑现有配置的兼容性。
- [ ] I have included version, contributor, license, security level, and capabilities for new registry entries.
      / 新增注册中心条目已包含版本号、贡献者、许可证、安全等级和能力描述。
