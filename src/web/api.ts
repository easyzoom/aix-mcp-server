import type { Router } from "express";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { PluginsConfig } from "../plugin.js";
import type { ProxyConfig } from "../proxy.js";
import { readRegistry, writeRegistry, SECURITY_LEVELS, type McpRegistry, type McpRegistryEntry, type SecurityLevel } from "../registry.js";
import { nextSecurityLevel, sandboxValidateEntry } from "../security.js";
import { readLlmConfig, writeLlmConfig, getProvider, maskApiKey, chatCompletion, type LlmConfig, type ChatMessage } from "../llm.js";
import { buildManagedServices, decodeServiceId, serviceId } from "../service-manager.js";

const CONFIG_FILE = "mcp-plugins.json";
const PROXY_FILE = "mcp-proxy.json";
const REGISTRY_FILE = "mcp-registry.json";
const LLM_CONFIG_FILE = "llm-config.json";
const HELP_DOCS_DIR = "docs/help";

async function readJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

function applyRegistryEdit(entry: McpRegistryEntry, body: Partial<McpRegistryEntry> & { command?: string; pluginSource?: string; proxyUrl?: string }): void {
  entry.name = body.name || entry.name;
  entry.version = body.version || entry.version;
  entry.source = body.source || entry.source;
  entry.summary = body.summary || entry.summary;
  entry.description = body.description || entry.description;
  entry.contributor = body.contributor || entry.contributor;
  entry.license = body.license || entry.license;
  entry.enabled = body.enabled ?? entry.enabled;
  if (Array.isArray(body.tags)) entry.tags = body.tags;
  if (Array.isArray(body.relatedIds)) entry.relatedIds = body.relatedIds;
  if (body.capabilities) entry.capabilities = body.capabilities;
  if (body.install) entry.install = { ...entry.install, ...body.install };
  if (body.command !== undefined) entry.install.command = body.command;
  if (body.pluginSource !== undefined) entry.install.pluginSource = body.pluginSource;
  if (body.proxyUrl !== undefined) entry.install.proxyUrl = body.proxyUrl;

  entry.securityLevel = "S4";
  entry.verified = false;
}

export function setupApiRoutes(router: Router, projectRoot: string, getSessionCount: () => number): void {
  const configPath = join(projectRoot, CONFIG_FILE);
  const proxyPath = join(projectRoot, PROXY_FILE);
  const registryPath = join(projectRoot, REGISTRY_FILE);
  const llmConfigPath = join(projectRoot, LLM_CONFIG_FILE);
  const helpDocsPath = join(projectRoot, HELP_DOCS_DIR);
  const startTime = Date.now();

  router.get("/api/status", async (_req, res) => {
    const plugins = await readJSON<PluginsConfig>(configPath, { plugins: [] });
    const proxy = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
    const registry = await readRegistry(registryPath);
    const services = buildManagedServices(plugins, proxy, registry);

    res.json({
      server: "aix-mcp-server",
      version: "1.0.0",
      uptime: (Date.now() - startTime) / 1000,
      sessions: getSessionCount(),
      services,
      plugins: plugins.plugins,
      proxy: proxy.targets,
    });
  });

  // ─── Unified MCP Service Management ────────────────────────────────

  router.get("/api/services", async (_req, res) => {
    const plugins = await readJSON<PluginsConfig>(configPath, { plugins: [] });
    const proxy = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
    const registry = await readRegistry(registryPath);
    const services = buildManagedServices(plugins, proxy, registry);
    res.json({ services, total: services.length });
  });

  router.post("/api/services/:id/toggle", async (req, res) => {
    const decoded = decodeServiceId(req.params.id);
    if (!decoded) { res.status(400).json({ error: "invalid service id" }); return; }

    if (decoded.kind === "plugin") {
      const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
      const entry = cfg.plugins.find((p) => p.source === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }
      entry.enabled = entry.enabled === false ? true : false;
      await writeJSON(configPath, cfg);
      res.json({ ok: true, enabled: entry.enabled });
      return;
    }

    if (decoded.kind === "proxy") {
      const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
      const entry = cfg.targets.find((t) => t.name === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }
      entry.enabled = entry.enabled === false ? true : false;
      await writeJSON(proxyPath, cfg);
      res.json({ ok: true, enabled: entry.enabled });
      return;
    }

    if (decoded.kind === "standalone") {
      const registry = await readRegistry(registryPath);
      const entry = registry.entries.find((e) => e.id === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }
      entry.enabled = entry.enabled === false ? true : false;
      await writeRegistry(registryPath, registry);
      res.json({ ok: true, enabled: entry.enabled });
      return;
    }

    res.status(400).json({ error: "unsupported service kind" });
  });

  router.delete("/api/services/:id", async (req, res) => {
    const decoded = decodeServiceId(req.params.id);
    if (!decoded) { res.status(400).json({ error: "invalid service id" }); return; }

    if (decoded.kind === "plugin") {
      const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
      cfg.plugins = cfg.plugins.filter((p) => p.source !== decoded.value);
      await writeJSON(configPath, cfg);
      res.json({ ok: true });
      return;
    }

    if (decoded.kind === "proxy") {
      const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
      cfg.targets = cfg.targets.filter((t) => t.name !== decoded.value);
      await writeJSON(proxyPath, cfg);
      res.json({ ok: true });
      return;
    }

    if (decoded.kind === "standalone") {
      const registry = await readRegistry(registryPath);
      const entry = registry.entries.find((e) => e.id === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }
      entry.enabled = false;
      await writeRegistry(registryPath, registry);
      res.json({ ok: true });
      return;
    }

    res.status(400).json({ error: "unsupported service kind" });
  });

  router.put("/api/services/:id", async (req, res) => {
    const decoded = decodeServiceId(req.params.id);
    if (!decoded) { res.status(400).json({ error: "invalid service id" }); return; }

    if (decoded.kind === "plugin") {
      const { source, enabled, config } = req.body as Partial<McpRegistryEntry> & { source?: string; enabled?: boolean; config?: Record<string, unknown> };
      if (!source) { res.status(400).json({ error: "source required" }); return; }
      const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
      const entry = cfg.plugins.find((p) => p.source === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }
      entry.source = source;
      entry.enabled = enabled ?? entry.enabled;
      if (config && Object.keys(config).length > 0) entry.config = config;
      else delete entry.config;
      await writeJSON(configPath, cfg);

      const registry = await readRegistry(registryPath);
      const regEntry = registry.entries.find((item) => item.install.type === "plugin" && item.install.pluginSource === decoded.value);
      if (regEntry) {
        applyRegistryEdit(regEntry, { ...req.body, source, pluginSource: source, enabled });
        await writeRegistry(registryPath, registry);
      }

      res.json({ ok: true, id: serviceId("plugin", source), requiresSandbox: !!regEntry });
      return;
    }

    if (decoded.kind === "proxy") {
      const { name, url, enabled, description } = req.body as Partial<McpRegistryEntry> & { name?: string; url?: string; enabled?: boolean; description?: string };
      if (!name || !url) { res.status(400).json({ error: "name and url required" }); return; }
      const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
      const entry = cfg.targets.find((t) => t.name === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }
      const oldUrl = entry.url;
      entry.name = name;
      entry.url = url;
      entry.enabled = enabled ?? entry.enabled;
      entry.description = description || undefined;
      await writeJSON(proxyPath, cfg);

      const registry = await readRegistry(registryPath);
      const regEntry = registry.entries.find((item) => item.install.type === "proxy" && item.install.proxyUrl === oldUrl);
      if (regEntry) {
        applyRegistryEdit(regEntry, { ...req.body, name, source: url, proxyUrl: url, description, enabled });
        await writeRegistry(registryPath, registry);
      }

      res.json({ ok: true, id: serviceId("proxy", name), requiresSandbox: !!regEntry });
      return;
    }

    if (decoded.kind === "standalone") {
      const body = req.body as Partial<McpRegistryEntry> & { command?: string };
      const registry = await readRegistry(registryPath);
      const entry = registry.entries.find((e) => e.id === decoded.value);
      if (!entry) { res.status(404).json({ error: "not found" }); return; }

      applyRegistryEdit(entry, body);
      await writeRegistry(registryPath, registry);

      res.json({ ok: true, id: serviceId("standalone", entry.id), requiresSandbox: true });
      return;
    }

    res.status(400).json({ error: "unsupported service kind" });
  });

  router.post("/api/services/:id/test", async (req, res) => {
    const decoded = decodeServiceId(req.params.id);
    if (!decoded) { res.status(400).json({ ok: false, message: "invalid service id" }); return; }

    if (decoded.kind === "proxy") {
      const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
      const target = cfg.targets.find((t) => t.name === decoded.value);
      if (!target) { res.status(404).json({ ok: false, message: "Target not found" }); return; }
      try {
        const resp = await fetch(target.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "aix-test", version: "1.0.0" } },
          }),
          signal: AbortSignal.timeout(5000),
        });
        res.json({ ok: resp.ok, message: `HTTP ${resp.status}` });
      } catch (err) {
        res.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    res.json({ ok: true, message: decoded.kind === "standalone" ? "Standalone service config is managed in registry." : "Local plugin is configured." });
  });

  // ─── Help Docs ──────────────────────────────────────────────────────

  router.get("/api/docs", async (_req, res) => {
    try {
      const files = (await readdir(helpDocsPath)).filter((file) => file.endsWith(".md")).sort();
      const docs = await Promise.all(
        files.map(async (file) => {
          const id = file.replace(/\.md$/, "");
          const content = await readFile(join(helpDocsPath, file), "utf-8");
          const title = content.match(/^#\s+(.+)$/m)?.[1] ?? id;
          return { id, title, file };
        })
      );
      res.json({ docs });
    } catch {
      res.json({ docs: [] });
    }
  });

  router.get("/api/docs/:id", async (req, res) => {
    const id = basename(req.params.id).replace(/\.md$/, "");
    try {
      const content = await readFile(join(helpDocsPath, `${id}.md`), "utf-8");
      res.type("text/markdown").send(content);
    } catch {
      res.status(404).json({ error: "not found" });
    }
  });

  // ─── Plugin CRUD ────────────────────────────────────────────────────

  router.post("/api/plugins", async (req, res) => {
    const { source, config: pluginConfig } = req.body;
    if (!source) { res.status(400).json({ error: "source required" }); return; }

    const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
    if (cfg.plugins.some((p) => p.source === source)) {
      res.json({ ok: true, message: "already exists" });
      return;
    }

    cfg.plugins.push({ source, enabled: true, ...(pluginConfig ? { config: pluginConfig } : {}) });
    await writeJSON(configPath, cfg);
    res.json({ ok: true, message: `Added ${source}. Restart server to apply.` });
  });

  router.delete("/api/plugins", async (req, res) => {
    const { source } = req.body;
    const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
    cfg.plugins = cfg.plugins.filter((p) => p.source !== source);
    await writeJSON(configPath, cfg);
    res.json({ ok: true });
  });

  router.post("/api/plugins/toggle", async (req, res) => {
    const { source } = req.body;
    const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
    const entry = cfg.plugins.find((p) => p.source === source);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }
    entry.enabled = entry.enabled === false ? true : false;
    await writeJSON(configPath, cfg);
    res.json({ ok: true, enabled: entry.enabled });
  });

  // ─── Proxy CRUD ─────────────────────────────────────────────────────

  router.post("/api/proxy", async (req, res) => {
    const { name, url, description } = req.body;
    if (!name || !url) { res.status(400).json({ error: "name and url required" }); return; }

    const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
    if (cfg.targets.some((t) => t.name === name)) {
      res.json({ ok: true, message: "already exists" });
      return;
    }

    cfg.targets.push({ name, url, enabled: true, ...(description ? { description } : {}) });
    await writeJSON(proxyPath, cfg);
    res.json({ ok: true, message: `Added proxy ${name}. Restart server to apply.` });
  });

  router.delete("/api/proxy", async (req, res) => {
    const { name } = req.body;
    const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
    cfg.targets = cfg.targets.filter((t) => t.name !== name);
    await writeJSON(proxyPath, cfg);
    res.json({ ok: true });
  });

  router.post("/api/proxy/toggle", async (req, res) => {
    const { name } = req.body;
    const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
    const entry = cfg.targets.find((t) => t.name === name);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }
    entry.enabled = entry.enabled === false ? true : false;
    await writeJSON(proxyPath, cfg);
    res.json({ ok: true, enabled: entry.enabled });
  });

  router.post("/api/proxy/test", async (req, res) => {
    const { name } = req.body;
    const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
    const target = cfg.targets.find((t) => t.name === name);
    if (!target) { res.status(404).json({ ok: false, message: "Target not found" }); return; }

    try {
      const resp = await fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "aix-test", version: "1.0.0" } },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        res.json({ ok: true, message: `Connected (HTTP ${resp.status})` });
      } else {
        res.json({ ok: false, message: `HTTP ${resp.status}` });
      }
    } catch (err) {
      res.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Registry CRUD ──────────────────────────────────────────────────

  router.get("/api/registry/security-levels", (_req, res) => {
    res.json(SECURITY_LEVELS);
  });

  router.get("/api/registry", async (req, res) => {
    const registry = await readRegistry(registryPath);
    let entries = registry.entries;

    const tag = req.query.tag as string | undefined;
    if (tag) {
      entries = entries.filter((e) => e.tags.includes(tag));
    }

    const level = req.query.level as string | undefined;
    if (level && (level as SecurityLevel) in SECURITY_LEVELS) {
      entries = entries.filter((e) => e.securityLevel === level);
    }

    const search = req.query.search as string | undefined;
    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    res.json({ entries, total: entries.length });
  });

  router.get("/api/registry/tags", async (_req, res) => {
    const registry = await readRegistry(registryPath);
    const tagMap: Record<string, number> = {};
    for (const e of registry.entries) {
      for (const t of e.tags) {
        tagMap[t] = (tagMap[t] ?? 0) + 1;
      }
    }
    res.json({ tags: tagMap });
  });

  router.get("/api/registry/contributors", async (_req, res) => {
    const registry = await readRegistry(registryPath);
    const map: Record<string, { count: number; entries: { id: string; name: string; securityLevel: string }[] }> = {};
    for (const e of registry.entries) {
      const name = e.contributor || "Anonymous";
      if (!map[name]) map[name] = { count: 0, entries: [] };
      map[name].count++;
      map[name].entries.push({ id: e.id, name: e.name, securityLevel: e.securityLevel });
    }
    const contributors = Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
    res.json({ contributors, total: contributors.length });
  });

  router.get("/api/registry/:id", async (req, res) => {
    const registry = await readRegistry(registryPath);
    const entry = registry.entries.find((e) => e.id === req.params.id);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }

    const related = entry.relatedIds
      .map((rid) => registry.entries.find((e) => e.id === rid))
      .filter(Boolean) as McpRegistryEntry[];

    res.json({ ...entry, related });
  });

  router.post("/api/registry", async (req, res) => {
    const entry = req.body as McpRegistryEntry;
    if (!entry.id || !entry.name) { res.status(400).json({ error: "id and name required" }); return; }

    const registry = await readRegistry(registryPath);
    if (registry.entries.some((e) => e.id === entry.id)) {
      res.status(409).json({ error: "id already exists" });
      return;
    }

    entry.usageCount = entry.usageCount ?? 0;
    entry.version = entry.version || "1.0.0";
    entry.verified = entry.verified ?? false;
    entry.securityLevel = entry.securityLevel ?? "S4";
    entry.contributor = entry.contributor || "Anonymous";
    entry.tags = entry.tags ?? [];
    entry.relatedIds = entry.relatedIds ?? [];
    entry.capabilities = entry.capabilities ?? { tools: [], prompts: [], resources: [] };

    registry.entries.push(entry);
    await writeRegistry(registryPath, registry);
    res.json({ ok: true, entry });
  });

  router.put("/api/registry/:id", async (req, res) => {
    const registry = await readRegistry(registryPath);
    const idx = registry.entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: "not found" }); return; }

    registry.entries[idx] = { ...registry.entries[idx], ...req.body, id: req.params.id };
    await writeRegistry(registryPath, registry);
    res.json({ ok: true, entry: registry.entries[idx] });
  });

  router.delete("/api/registry/:id", async (req, res) => {
    const registry = await readRegistry(registryPath);
    registry.entries = registry.entries.filter((e) => e.id !== req.params.id);
    await writeRegistry(registryPath, registry);
    res.json({ ok: true });
  });

  router.post("/api/registry/:id/install", async (req, res) => {
    const registry = await readRegistry(registryPath);
    const entry = registry.entries.find((e) => e.id === req.params.id);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }

    try {
      if (entry.install.type === "plugin" && entry.install.pluginSource) {
        const cfg = await readJSON<PluginsConfig>(configPath, { plugins: [] });
        if (!cfg.plugins.some((p) => p.source === entry.install.pluginSource)) {
          cfg.plugins.push({ source: entry.install.pluginSource, enabled: true });
          await writeJSON(configPath, cfg);
        }
      } else if (entry.install.type === "proxy" && entry.install.proxyUrl) {
        const cfg = await readJSON<ProxyConfig>(proxyPath, { targets: [] });
        if (!cfg.targets.some((t) => t.url === entry.install.proxyUrl)) {
          cfg.targets.push({ name: entry.name, url: entry.install.proxyUrl, enabled: true });
          await writeJSON(proxyPath, cfg);
        }
      }

      entry.usageCount++;
      await writeRegistry(registryPath, registry);
      res.json({ ok: true, message: `Installed ${entry.name}. Restart server to apply.`, usageCount: entry.usageCount });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/api/registry/:id/copy", async (req, res) => {
    const registry = await readRegistry(registryPath);
    const entry = registry.entries.find((e) => e.id === req.params.id);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }

    entry.usageCount++;
    await writeRegistry(registryPath, registry);
    res.json({ ok: true, usageCount: entry.usageCount });
  });

  // ─── Security Level Upgrade ──────────────────────────────────────

  router.post("/api/registry/:id/sandbox", async (req, res) => {
    const registry = await readRegistry(registryPath);
    const entry = registry.entries.find((e) => e.id === req.params.id);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }

    const current = entry.securityLevel;
    if (current === "S1") {
      res.json({ ok: true, message: "Already at highest level (S1)", current, target: "S1", score: 100, checks: [] });
      return;
    }

    const targetLevel = nextSecurityLevel(current);
    const result = await sandboxValidateEntry(entry, targetLevel);
    res.json({ ...result, current, message: result.ok ? `Sandbox passed for ${current} → ${targetLevel}` : `Sandbox failed for ${current} → ${targetLevel}` });
  });

  router.post("/api/registry/:id/upgrade", async (req, res) => {
    const registry = await readRegistry(registryPath);
    const entry = registry.entries.find((e) => e.id === req.params.id);
    if (!entry) { res.status(404).json({ error: "not found" }); return; }

    const current = entry.securityLevel;
    if (current === "S1") {
      res.json({ ok: false, message: "Already at highest level (S1)", current, target: "S1", score: 100, checks: [] });
      return;
    }

    const targetLevel = nextSecurityLevel(current);
    const result = await sandboxValidateEntry(entry, targetLevel);

    if (result.ok) {
      entry.securityLevel = targetLevel;
      entry.verified = targetLevel === "S2" || targetLevel === "S1" ? true : entry.verified;
      await writeRegistry(registryPath, registry);
    }

    res.json({
      ...result,
      current: result.ok ? targetLevel : current,
      target: targetLevel,
      message: result.ok
        ? `Sandbox passed and upgraded from ${current} to ${targetLevel}`
        : `Sandbox blocked upgrade to ${targetLevel} — score ${result.score}`,
    });
  });

  // ─── LLM Config & Recommend ──────────────────────────────────────

  router.get("/api/llm/config", async (_req, res) => {
    const cfg = await readLlmConfig(llmConfigPath);
    const safe = {
      ...cfg,
      providers: cfg.providers.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) })),
    };
    res.json(safe);
  });

  router.put("/api/llm/config", async (req, res) => {
    const incoming = req.body as LlmConfig;
    if (!incoming.providers || !Array.isArray(incoming.providers)) {
      res.status(400).json({ error: "providers array required" });
      return;
    }

    const existing = await readLlmConfig(llmConfigPath);
    for (const p of incoming.providers) {
      if (p.apiKey && /^\w{4}\*{4}\w{4}$/.test(p.apiKey)) {
        const old = existing.providers.find((o) => o.id === p.id);
        if (old) p.apiKey = old.apiKey;
      }
    }

    await writeLlmConfig(llmConfigPath, incoming);
    res.json({ ok: true });
  });

  router.post("/api/llm/test", async (req, res) => {
    const { providerId } = req.body;
    const cfg = await readLlmConfig(llmConfigPath);
    const provider = getProvider(cfg, providerId);
    if (!provider) { res.json({ ok: false, message: "Provider not found or not enabled" }); return; }

    try {
      const result = await chatCompletion(provider, [
        { role: "user", content: "Reply with exactly: OK" },
      ]);
      res.json({ ok: true, message: `Connected to ${provider.name} (${result.model})` });
    } catch (err) {
      res.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  });

  function buildRegistrySummary(entries: McpRegistryEntry[]): string {
    return entries.map((e) =>
      `- [${e.id}] ${e.name}: ${e.summary} (tags: ${e.tags.join(", ")}; tools: ${e.capabilities.tools.join(", ") || "none"}; verified: ${e.verified})`
    ).join("\n");
  }

  const SYSTEM_PROMPT_BASE = `你是 AIX MCP Server 的智能助手，负责帮助用户选择和推荐合适的 MCP 服务。
你了解所有已注册的 MCP 服务。当用户描述需求时，从注册表中推荐最合适的服务。

回复规则：
1. 对于推荐请求，回复 JSON 数组格式：[{"id": "entry-id", "reason": "推荐理由"}]
2. 推荐理由用中文，简洁明了
3. 最多推荐 5 个
4. 如果没有合适的，返回空数组 []
5. 只返回 JSON，不要其他内容`;

  const CHAT_SYSTEM_PROMPT = `你是 AIX MCP Server 的智能助手，帮助用户了解和选择 MCP 服务。
你可以回答关于 MCP 服务的问题，推荐合适的服务，解释各服务的功能和用法。
在推荐服务时，引用注册表中的 id（用 [[id]] 格式标记），前端会自动将其渲染为可点击的链接。
用中文回复，简洁友好。`;

  router.post("/api/llm/recommend", async (req, res) => {
    const { query, providerId } = req.body;
    if (!query) { res.status(400).json({ error: "query required" }); return; }

    const cfg = await readLlmConfig(llmConfigPath);
    const provider = getProvider(cfg, providerId);
    if (!provider) { res.json({ error: "no_provider", message: "No LLM provider configured or enabled" }); return; }

    const registry = await readRegistry(registryPath);
    const summary = buildRegistrySummary(registry.entries);

    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT_BASE}\n\n当前注册表：\n${summary}` },
      { role: "user", content: query },
    ];

    try {
      const result = await chatCompletion(provider, messages);
      let recommendations: { id: string; reason: string }[] = [];

      try {
        const jsonMatch = result.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) recommendations = JSON.parse(jsonMatch[0]);
      } catch { /* LLM returned non-JSON, treat as empty */ }

      const entries = recommendations
        .map((r) => {
          const entry = registry.entries.find((e) => e.id === r.id);
          return entry ? { ...entry, reason: r.reason } : null;
        })
        .filter(Boolean);

      res.json({ entries, provider: provider.id, model: provider.model });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/api/llm/chat", async (req, res) => {
    const { messages: userMessages, providerId } = req.body as { messages: ChatMessage[]; providerId?: string };
    if (!userMessages || !Array.isArray(userMessages)) { res.status(400).json({ error: "messages required" }); return; }

    const cfg = await readLlmConfig(llmConfigPath);
    const provider = getProvider(cfg, providerId);
    if (!provider) { res.json({ error: "no_provider", message: "No LLM provider configured or enabled" }); return; }

    const registry = await readRegistry(registryPath);
    const summary = buildRegistrySummary(registry.entries);

    const messages: ChatMessage[] = [
      { role: "system", content: `${CHAT_SYSTEM_PROMPT}\n\n当前注册表：\n${summary}` },
      ...userMessages,
    ];

    try {
      const result = await chatCompletion(provider, messages);
      res.json({ content: result.content, provider: result.provider, model: result.model });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
