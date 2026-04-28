import { z } from "zod";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { McpPlugin } from "../plugin.js";

const plugin: McpPlugin = {
  name: "system",
  description: "System info resource and shell command tool",

  register(server) {
    server.registerTool(
      "run-command",
      {
        title: "Run Shell Command",
        description: "Execute a shell command and return the output",
        inputSchema: z.object({
          command: z.string().describe("Shell command to execute"),
          cwd: z.string().optional().describe("Working directory (default: current)"),
          timeout: z.number().optional().describe("Timeout in milliseconds (default: 10000)"),
        }),
        annotations: { title: "Run Shell Command", destructiveHint: true },
      },
      async ({ command, cwd, timeout }) => {
        try {
          const output = execSync(command, {
            cwd: cwd ? resolve(cwd) : undefined,
            timeout: timeout ?? 10000,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
          });
          return { content: [{ type: "text", text: output || "(no output)" }] };
        } catch (err: unknown) {
          const error = err as { stderr?: string; message?: string };
          return {
            content: [{ type: "text", text: error.stderr || error.message || String(err) }],
            isError: true,
          };
        }
      }
    );

    server.registerResource(
      "system-info",
      "system://info",
      {
        title: "System Information",
        description: "Current system information (OS, architecture, Node version, etc.)",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                cwd: process.cwd(),
                uptime: `${(process.uptime() / 60).toFixed(1)} minutes`,
                memoryUsage: process.memoryUsage(),
                env: {
                  HOME: process.env.HOME,
                  USER: process.env.USER,
                  SHELL: process.env.SHELL,
                },
              },
              null,
              2
            ),
          },
        ],
      })
    );
  },
};

export default plugin;
