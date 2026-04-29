# JSON Plugins / JSON 插件

JSON plugins let you create lightweight local MCP tools without TypeScript.

JSON 插件允许你不用 TypeScript，只通过 JSON 创建轻量 MCP 工具，类似分享一个油猴脚本。

## Why JSON Plugins? / 为什么需要 JSON 插件？

- Easy to write, copy, share, and review
- No compile step
- Safer by default: declarative responses only
- Good for simple prompts, templates, canned JSON, and static resources

## Example / 示例

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
          "name": {
            "type": "string",
            "description": "Name to greet"
          }
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

## Supported Features / 当前支持能力

- Tool declarations
- Simplified input schema
- Template response: `{{field}}`, `{{config.field}}`
- Fixed JSON response
- Static resources

JSON plugins intentionally do not execute arbitrary JavaScript or shell commands.

JSON 插件默认不执行任意 JavaScript 或 shell 命令。
