import { z } from "zod";
import { ResourceTemplate } from "@modelcontextprotocol/server";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { McpPlugin } from "../plugin.js";

const plugin: McpPlugin = {
  name: "filesystem",
  description: "File system tools (list, read) and file resources",

  register(server) {
    server.registerTool(
      "list-files",
      {
        title: "List Files",
        description: "List files and directories at the given path",
        inputSchema: z.object({
          path: z.string().describe("Absolute or relative directory path"),
          recursive: z.boolean().optional().describe("Whether to list recursively (default: false)"),
        }),
      },
      async ({ path: dirPath, recursive }) => {
        try {
          const absPath = resolve(dirPath);
          const entries = await readdir(absPath, { withFileTypes: true });
          const lines: string[] = [];

          for (const entry of entries) {
            lines.push(`${entry.isDirectory() ? "📁" : "📄"} ${entry.name}`);
            if (recursive && entry.isDirectory()) {
              try {
                const subs = await readdir(join(absPath, entry.name), { withFileTypes: true });
                for (const s of subs) {
                  lines.push(`  ${s.isDirectory() ? "📁" : "📄"} ${entry.name}/${s.name}`);
                }
              } catch {
                lines.push(`  ⚠️ ${entry.name}/ (permission denied)`);
              }
            }
          }

          return {
            content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "(empty directory)" }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "read-file",
      {
        title: "Read File",
        description: "Read the contents of a text file",
        inputSchema: z.object({
          path: z.string().describe("Absolute or relative file path"),
          maxLines: z.number().optional().describe("Maximum number of lines to return (default: all)"),
        }),
        annotations: { title: "Read File", readOnlyHint: true },
      },
      async ({ path: filePath, maxLines }) => {
        try {
          const absPath = resolve(filePath);
          const info = await stat(absPath);

          if (info.size > 1024 * 1024) {
            return {
              content: [{ type: "text", text: `File too large (${(info.size / 1024 / 1024).toFixed(1)} MB). Max 1 MB.` }],
              isError: true,
            };
          }

          let text = await readFile(absPath, "utf-8");

          if (maxLines !== undefined) {
            const lines = text.split("\n");
            text = lines.slice(0, maxLines).join("\n");
            if (lines.length > maxLines) {
              text += `\n... (${lines.length - maxLines} more lines)`;
            }
          }

          return { content: [{ type: "text", text }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );

    server.registerResource(
      "file-resource",
      new ResourceTemplate("file://{filePath}", {
        list: async () => ({
          resources: [
            { uri: "file:///etc/hostname", name: "Hostname" },
            { uri: "file:///etc/os-release", name: "OS Release" },
          ],
        }),
      }),
      { title: "File Content", description: "Read any local file as a resource", mimeType: "text/plain" },
      async (uri, { filePath }) => {
        try {
          const fp = Array.isArray(filePath) ? filePath.join("/") : filePath;
          const absPath = fp.startsWith("/") ? fp : `/${fp}`;
          return { contents: [{ uri: uri.href, text: await readFile(absPath, "utf-8") }] };
        } catch (err) {
          return { contents: [{ uri: uri.href, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      }
    );
  },
};

export default plugin;
