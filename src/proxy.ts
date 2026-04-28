import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export interface ProxyTarget {
  name: string;
  url: string;
  enabled?: boolean;
  description?: string;
}

export interface ProxyConfig {
  targets: ProxyTarget[];
}

async function proxyCall(target: ProxyTarget, method: string, params: unknown): Promise<unknown> {
  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "aix-proxy", version: "1.0.0" },
    },
  });

  const initResp = await fetch(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: initBody,
  });

  const sessionId = initResp.headers.get("mcp-session-id");
  const initText = await initResp.text();
  const initData = parseSSE(initText);
  if (!initData || !sessionId) {
    throw new Error(`Failed to initialize session with ${target.name}`);
  }

  const callBody = JSON.stringify({ jsonrpc: "2.0", id: 2, method, params });
  const callResp = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sessionId,
    },
    body: callBody,
  });

  const callText = await callResp.text();
  const result = parseSSE(callText);
  return result?.result ?? result;
}

function parseSSE(text: string): Record<string, unknown> | null {
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        continue;
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function registerProxyPlugin(server: McpServer, targets: ProxyTarget[]): void {
  const active = targets.filter((t) => t.enabled !== false);
  if (active.length === 0) return;

  server.registerTool(
    "proxy-call",
    {
      title: "Proxy Call",
      description: `Forward a method call to a remote MCP server. Available targets: ${active.map((t) => t.name).join(", ")}`,
      inputSchema: z.object({
        target: z.string().describe(`Target server name: ${active.map((t) => t.name).join(" | ")}`),
        method: z.string().describe("MCP method to call, e.g. tools/list, tools/call"),
        params: z.record(z.string(), z.unknown()).optional().describe("Method parameters"),
      }),
    },
    async ({ target: targetName, method, params }) => {
      const t = active.find((x) => x.name === targetName);
      if (!t) {
        return {
          content: [{ type: "text", text: `Unknown target "${targetName}". Available: ${active.map((x) => x.name).join(", ")}` }],
          isError: true,
        };
      }
      try {
        const result = await proxyCall(t, method, params ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Proxy error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "proxy-list-targets",
    {
      title: "List Proxy Targets",
      description: "List all available proxy targets and their status",
      inputSchema: z.object({}),
    },
    async () => {
      const lines = active.map((t) => `- ${t.name}: ${t.url} ${t.description ? `(${t.description})` : ""}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  for (const target of active) {
    server.registerTool(
      `proxy-${target.name}-tools`,
      {
        title: `${target.name} Tools`,
        description: `List tools available on remote server: ${target.name}`,
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const result = await proxyCall(target, "tools/list", {});
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );
  }

  server.registerResource(
    "proxy-targets",
    "proxy://targets",
    { title: "Proxy Targets", description: "All configured proxy targets", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(active, null, 2) }],
    })
  );
}
