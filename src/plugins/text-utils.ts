import { z } from "zod";
import type { McpPlugin } from "../plugin.js";

const plugin: McpPlugin = {
  name: "text-utils",
  description: "Text, JSON, and Base64 utilities",

  register(server) {
    server.registerTool(
      "json-format",
      {
        title: "Format JSON",
        description: "Parse and pretty-print JSON text",
        inputSchema: z.object({
          json: z.string().describe("JSON text to format"),
          spaces: z.number().int().min(0).max(8).optional().describe("Indent spaces (default: 2)"),
        }),
        annotations: { title: "Format JSON", readOnlyHint: true },
      },
      async ({ json, spaces }) => {
        try {
          return {
            content: [{ type: "text", text: JSON.stringify(JSON.parse(json), null, spaces ?? 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "base64",
      {
        title: "Base64 Encode/Decode",
        description: "Encode text to Base64 or decode Base64 into UTF-8 text",
        inputSchema: z.object({
          action: z.enum(["encode", "decode"]).describe("Operation to perform"),
          text: z.string().describe("Input text"),
        }),
        annotations: { title: "Base64 Encode/Decode", readOnlyHint: true },
      },
      async ({ action, text }) => {
        try {
          const result =
            action === "encode"
              ? Buffer.from(text, "utf-8").toString("base64")
              : Buffer.from(text, "base64").toString("utf-8");
          return { content: [{ type: "text", text: result }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "text-stats",
      {
        title: "Text Stats",
        description: "Count characters, words, lines, and bytes in text",
        inputSchema: z.object({
          text: z.string().describe("Text to analyze"),
        }),
        annotations: { title: "Text Stats", readOnlyHint: true },
      },
      async ({ text }) => {
        const trimmed = text.trim();
        const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
        const stats = {
          characters: Array.from(text).length,
          bytes: Buffer.byteLength(text, "utf-8"),
          lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
          words,
        };

        return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
      }
    );
  },
};

export default plugin;
