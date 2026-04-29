import { readFile, readdir } from "node:fs/promises";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { McpPlugin, PluginEntry, PluginsConfig } from "./plugin.js";
import { loadJsonPlugin } from "./json-plugin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const CONFIG_FILE = "mcp-plugins.json";

interface LoadedPlugin {
  plugin: McpPlugin;
  config?: Record<string, unknown>;
}

async function readConfig(projectRoot: string): Promise<PluginsConfig | null> {
  const configPath = join(projectRoot, CONFIG_FILE);
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as PluginsConfig;
  } catch {
    return null;
  }
}

async function importPlugin(source: string, projectRoot: string): Promise<McpPlugin> {
  let mod: { default: McpPlugin };

  if (source.endsWith(".json")) {
    return loadJsonPlugin(source, projectRoot);
  }

  if (source.startsWith("./") || source.startsWith("../") || isAbsolute(source)) {
    const absPath = isAbsolute(source) ? source : resolve(projectRoot, "dist", source + ".js");
    mod = await import(absPath);
  } else {
    const resolved = require.resolve(source, { paths: [projectRoot] });
    mod = await import(resolved);
  }

  const plugin = mod.default;
  if (!plugin?.name || typeof plugin.register !== "function") {
    throw new Error(`Invalid plugin: missing "name" or "register()" export`);
  }
  return plugin;
}

async function loadFromConfig(projectRoot: string): Promise<LoadedPlugin[]> {
  const config = await readConfig(projectRoot);
  if (!config) return [];

  const results: LoadedPlugin[] = [];

  for (const entry of config.plugins) {
    if (entry.enabled === false) {
      console.error(`  [plugin] ${entry.source} (disabled)`);
      continue;
    }

    try {
      const plugin = await importPlugin(entry.source, projectRoot);
      results.push({ plugin, config: entry.config });
    } catch (err) {
      console.error(`  [error] ${entry.source}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return results;
}

async function loadFromDirectory(): Promise<LoadedPlugin[]> {
  const pluginsDir = join(__dirname, "plugins");
  const results: LoadedPlugin[] = [];

  let files: string[];
  try {
    files = await readdir(pluginsDir);
  } catch {
    return results;
  }

  const jsFiles = files.filter((f) => f.endsWith(".js") && !f.endsWith(".d.ts"));

  for (const file of jsFiles.sort()) {
    try {
      const mod = await import(join(pluginsDir, file));
      const plugin: McpPlugin = mod.default;
      if (plugin?.name && typeof plugin.register === "function") {
        results.push({ plugin });
      }
    } catch (err) {
      console.error(`  [error] plugins/${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return results;
}

async function loadJsonFromProjectDirectory(projectRoot: string): Promise<LoadedPlugin[]> {
  const pluginsDir = join(projectRoot, "plugins");
  const results: LoadedPlugin[] = [];

  let files: string[];
  try {
    files = await readdir(pluginsDir);
  } catch {
    return results;
  }

  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    try {
      const plugin = await loadJsonPlugin(`./plugins/${file}`, projectRoot);
      results.push({ plugin });
    } catch (err) {
      console.error(`  [error] plugins/${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return results;
}

export async function loadAllPlugins(projectRoot: string): Promise<LoadedPlugin[]> {
  const configPlugins = await loadFromConfig(projectRoot);

  if (configPlugins.length > 0) {
    console.error(`[loader] Loaded ${configPlugins.length} plugin(s) from ${CONFIG_FILE}`);
    return configPlugins;
  }

  const dirPlugins = await loadFromDirectory();
  const jsonPlugins = await loadJsonFromProjectDirectory(projectRoot);
  const plugins = [...dirPlugins, ...jsonPlugins];
  if (plugins.length > 0) {
    console.error(`[loader] Loaded ${plugins.length} plugin(s) from plugins/ directory (no ${CONFIG_FILE} found)`);
  }
  return plugins;
}

export type { LoadedPlugin };
