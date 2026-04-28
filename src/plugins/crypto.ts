import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpPlugin } from "../plugin.js";

const hashAlgorithms = ["sha256", "sha512", "md5"] as const;

const plugin: McpPlugin = {
  name: "crypto",
  description: "Hashing, UUID, and random string helpers",

  register(server) {
    server.registerTool(
      "hash-text",
      {
        title: "Hash Text",
        description: "Create a digest for text using sha256, sha512, or md5",
        inputSchema: z.object({
          text: z.string().describe("Text to hash"),
          algorithm: z.enum(hashAlgorithms).optional().describe("Hash algorithm (default: sha256)"),
          encoding: z.enum(["hex", "base64"]).optional().describe("Digest encoding (default: hex)"),
        }),
        annotations: { title: "Hash Text", readOnlyHint: true },
      },
      async ({ text, algorithm, encoding }) => {
        const digest = createHash(algorithm ?? "sha256").update(text).digest(encoding ?? "hex");
        return { content: [{ type: "text", text: digest }] };
      }
    );

    server.registerTool(
      "random-uuid",
      {
        title: "Random UUID",
        description: "Generate one or more random UUID v4 values",
        inputSchema: z.object({
          count: z.number().int().min(1).max(50).optional().describe("Number of UUIDs to generate (default: 1)"),
        }),
        annotations: { title: "Random UUID", readOnlyHint: true },
      },
      async ({ count }) => {
        const values = Array.from({ length: count ?? 1 }, () => randomUUID());
        return { content: [{ type: "text", text: values.join("\n") }] };
      }
    );

    server.registerTool(
      "random-string",
      {
        title: "Random String",
        description: "Generate a cryptographically random string",
        inputSchema: z.object({
          bytes: z.number().int().min(1).max(1024).optional().describe("Number of random bytes (default: 32)"),
          encoding: z.enum(["hex", "base64", "base64url"]).optional().describe("Output encoding (default: base64url)"),
        }),
        annotations: { title: "Random String", readOnlyHint: true },
      },
      async ({ bytes, encoding }) => {
        const output = randomBytes(bytes ?? 32).toString(encoding ?? "base64url");
        return { content: [{ type: "text", text: output }] };
      }
    );
  },
};

export default plugin;
