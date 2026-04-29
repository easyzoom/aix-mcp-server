/**
 * Example MCP Plugin — use this as a template for creating npm-publishable plugins.
 *
 * To publish: rename the package, implement your tools/resources, then `npm publish`.
 *
 * Users install with:
 *   cd my-mcp-server
 *   npm run plugin:add mcp-plugin-example
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

interface McpPlugin {
  name: string;
  description?: string;
  register(server: McpServer, config?: Record<string, unknown>): void;
}

const plugin: McpPlugin = {
  name: "example",
  description: "An example plugin that echoes back input and shows config usage",

  register(server, config) {
    const prefix = (config?.prefix as string) ?? "Echo";

    server.registerTool(
      "echo",
      {
        title: "Echo",
        description: "Echoes back your message with an optional prefix",
        inputSchema: z.object({
          message: z.string().describe("Message to echo"),
        }),
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `[${prefix}] ${message}` }],
      })
    );

    server.registerResource(
      "example-info",
      "example://info",
      {
        title: "Example Plugin Info",
        description: "Shows the plugin's current configuration",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ name: "example", config: config ?? {} }, null, 2),
          },
        ],
      })
    );
  },
};

export default plugin;
