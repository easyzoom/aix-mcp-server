# Security Levels & Sandbox / 安全等级与沙箱

Every MCP service has a security level that describes its trust and validation status.

每个 MCP 服务都有一个安全等级，用于描述可信度和验证状态。

## Levels / 等级

| Level | Name | Meaning |
| --- | --- | --- |
| `S1` | Official | Built-in or official trusted source, sandbox verified |
| `S2` | Verified | Third-party verified, community reviewed |
| `S3` | Community | Community contributed, basic checks passed |
| `S4` | Unverified | Newly added or unverified, use with caution |

## Upgrade Path / 升级路径

Security levels are upgraded through sandbox validation.

安全等级通过沙箱验证机制升级。

- `S4 -> S3`: basic metadata, valid install config, at least one capability
- `S3 -> S2`: source URL, contributor identity, richer capabilities, usage history
- `S2 -> S1`: built-in source or trusted official repository, verified flag, sandbox pass

## Sandbox Checks / 沙箱检查项

The sandbox does **not** execute arbitrary install commands. It validates configuration and risk signals instead.

沙箱不会直接执行任意安装命令，而是验证配置完整性和风险信号。

Checks include:

- Complete metadata: name, summary, description, license, contributor
- Semantic version, for example `1.0.0`
- Declared capabilities: tools, prompts, resources
- Complete install config
- Known dangerous shell patterns
- Local plugin path containment under `./plugins`
- Trusted source rules
- Proxy MCP handshake, when applicable
- Source URL reachability, when applicable

Use **Run Sandbox** to inspect validation results, or **Upgrade with Sandbox** to validate and upgrade automatically when all required checks pass.
