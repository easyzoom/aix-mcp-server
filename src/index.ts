#!/usr/bin/env node

import { isInitializeRequest, McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllPlugins, type LoadedPlugin } from "./loader.js";
import { registerProxyPlugin, type ProxyConfig } from "./proxy.js";
import { setupApiRoutes } from "./web/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const SERVER_NAME = "aix-mcp-server";
const SERVER_VERSION = "1.0.0";

// ─── Config ─────────────────────────────────────────────────────────────────

async function loadProxyConfig(): Promise<ProxyConfig> {
  try {
    const raw = await readFile(join(PROJECT_ROOT, "mcp-proxy.json"), "utf-8");
    return JSON.parse(raw) as ProxyConfig;
  } catch {
    return { targets: [] };
  }
}

// ─── Server Factory ─────────────────────────────────────────────────────────

function createServer(loaded: LoadedPlugin[], proxyConfig: ProxyConfig): McpServer {
  const descriptions = loaded.map((l) => l.plugin.description ?? l.plugin.name);
  const activeProxies = proxyConfig.targets.filter((t) => t.enabled !== false);
  if (activeProxies.length > 0) {
    descriptions.push(`Proxy to ${activeProxies.length} remote server(s)`);
  }

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: `Available capabilities: ${descriptions.join("; ")}.` }
  );

  for (const { plugin, config } of loaded) {
    plugin.register(server, config);
    console.error(`  [plugin] ${plugin.name} loaded`);
  }

  if (activeProxies.length > 0) {
    registerProxyPlugin(server, proxyConfig.targets);
    console.error(`  [proxy] ${activeProxies.length} target(s) registered`);
  }

  return server;
}

// ─── Transports ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mode = args[0] ?? "stdio";
const port = parseInt(process.env.MCP_PORT ?? "3000", 10);
const host = process.env.MCP_HOST ?? "0.0.0.0";

async function startStdio(loaded: LoadedPlugin[], proxyConfig: ProxyConfig) {
  const server = createServer(loaded, proxyConfig);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} started on stdio (${loaded.length} plugins)`);
}

async function startHttp(loaded: LoadedPlugin[], proxyConfig: ProxyConfig) {
  const transports: Record<string, NodeStreamableHTTPServerTransport> = {};

  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());

  // ─── MCP Streamable HTTP ────────────────────────────────────────────

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new NodeStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => { transports[sid] = transport; },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) delete transports[sid];
        };

        const freshProxy = await loadProxyConfig();
        const server = createServer(loaded, freshProxy);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (sessionId) {
        res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null });
      } else {
        res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
      }
    } catch (error) {
      console.error("Error handling MCP POST:", error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Missing or invalid session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Missing or invalid session ID" });
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) res.status(500).send("Error processing session termination");
    }
  });

  // ─── Web Dashboard & API ────────────────────────────────────────────

  setupApiRoutes(app as unknown as import("express").Router, PROJECT_ROOT, () => Object.keys(transports).length);

  app.get("/", async (_req, res) => {
    try {
      const html = await readFile(join(__dirname, "web", "dashboard.html"), "utf-8");
      res.type("html").send(html);
    } catch {
      res.type("html").send(
        `<html><body style="background:#0f1117;color:#e4e6f0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh">` +
        `<div><h1>AIX MCP Server</h1><p>Dashboard HTML not found. Run <code>npm run build</code>.</p></div></body></html>`
      );
    }
  });

  // ─── Health ─────────────────────────────────────────────────────────

  app.get("/health", async (_req, res) => {
    const freshProxy = await loadProxyConfig();
    res.json({
      status: "ok",
      server: SERVER_NAME,
      version: SERVER_VERSION,
      plugins: loaded.map((l) => ({ name: l.plugin.name, description: l.plugin.description })),
      proxy: freshProxy.targets.filter((t) => t.enabled !== false).map((t) => t.name),
      sessions: Object.keys(transports).length,
    });
  });

  // ─── Start ──────────────────────────────────────────────────────────

  const httpServer = app.listen(port, host, () => {
    console.error(`${SERVER_NAME} HTTP listening on http://${host}:${port}/mcp (${loaded.length} plugins)`);
    console.error(`  Dashboard: http://${host}:${port}/`);
  });

  process.on("SIGINT", async () => {
    httpServer.close();
    for (const sid of Object.keys(transports)) {
      await transports[sid].close();
      delete transports[sid];
    }
    process.exit(0);
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const loaded = await loadAllPlugins(PROJECT_ROOT);
  const proxyConfig = await loadProxyConfig();

  const activeProxies = proxyConfig.targets.filter((t) => t.enabled !== false);
  if (activeProxies.length > 0) {
    console.error(`[proxy] ${activeProxies.length} target(s) configured`);
  }

  if (loaded.length === 0 && activeProxies.length === 0) {
    console.error("[warn] No plugins or proxy targets found.");
  }

  if (mode === "http") {
    await startHttp(loaded, proxyConfig);
  } else {
    await startStdio(loaded, proxyConfig);
  }
}

main();
