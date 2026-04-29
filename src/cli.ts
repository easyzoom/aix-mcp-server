#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { PluginsConfig } from "./plugin.js";
import { readRegistry } from "./registry.js";
import { validateJsonPlugins, validateRegistry } from "./validation.js";

const CONFIG_FILE = "mcp-plugins.json";
const REGISTRY_FILE = "mcp-registry.json";

function getConfigPath(): string {
  return resolve(process.cwd(), CONFIG_FILE);
}

async function readConfig(): Promise<PluginsConfig> {
  try {
    const raw = await readFile(getConfigPath(), "utf-8");
    return JSON.parse(raw) as PluginsConfig;
  } catch {
    return { plugins: [] };
  }
}

async function writeConfig(config: PluginsConfig): Promise<void> {
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

function isNpmPackage(source: string): boolean {
  return !source.startsWith("./") && !source.startsWith("../") && !source.startsWith("/");
}

async function addPlugin(source: string, opts: { config?: string }): Promise<void> {
  const config = await readConfig();

  const existing = config.plugins.find((p) => p.source === source);
  if (existing) {
    console.log(`Plugin "${source}" already exists in ${CONFIG_FILE}`);
    if (existing.enabled === false) {
      existing.enabled = true;
      await writeConfig(config);
      console.log(`  -> Re-enabled`);
    }
    return;
  }

  if (isNpmPackage(source)) {
    console.log(`Installing npm package: ${source}`);
    try {
      execSync(`npm install ${source}`, { stdio: "inherit", cwd: process.cwd() });
    } catch {
      console.error(`Failed to install ${source}`);
      process.exit(1);
    }
  }

  const entry: { source: string; enabled: boolean; config?: Record<string, unknown> } = {
    source,
    enabled: true,
  };

  if (opts.config) {
    try {
      entry.config = JSON.parse(opts.config);
    } catch {
      console.error(`Invalid JSON for --config: ${opts.config}`);
      process.exit(1);
    }
  }

  config.plugins.push(entry);
  await writeConfig(config);
  console.log(`Added "${source}" to ${CONFIG_FILE}`);
  console.log(`Run "npm run build" to apply changes.`);
}

async function removePlugin(source: string): Promise<void> {
  const config = await readConfig();
  const idx = config.plugins.findIndex((p) => p.source === source);

  if (idx === -1) {
    console.log(`Plugin "${source}" not found in ${CONFIG_FILE}`);
    return;
  }

  config.plugins.splice(idx, 1);
  await writeConfig(config);
  console.log(`Removed "${source}" from ${CONFIG_FILE}`);

  if (isNpmPackage(source)) {
    console.log(`Uninstalling npm package: ${source}`);
    try {
      execSync(`npm uninstall ${source}`, { stdio: "inherit", cwd: process.cwd() });
    } catch {
      console.error(`Note: failed to uninstall ${source} (may need manual cleanup)`);
    }
  }
}

async function listPlugins(): Promise<void> {
  const config = await readConfig();

  if (config.plugins.length === 0) {
    console.log("No plugins configured.");
    return;
  }

  console.log(`Plugins (${config.plugins.length}):\n`);

  for (const entry of config.plugins) {
    const status = entry.enabled === false ? "DISABLED" : "ENABLED";
    const type = isNpmPackage(entry.source) ? "npm" : "local";
    const configStr = entry.config ? ` config=${JSON.stringify(entry.config)}` : "";
    console.log(`  [${status}] ${entry.source} (${type})${configStr}`);
  }
}

async function validateRegistryCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const registry = await readRegistry(resolve(projectRoot, REGISTRY_FILE));
  const config = await readConfig();
  const issues = [
    ...validateRegistry(registry),
    ...(await validateJsonPlugins(projectRoot, config.plugins.map((entry) => entry.source))),
  ];

  if (issues.length === 0) {
    console.log("Registry and JSON plugins are valid.");
    return;
  }

  const errors = issues.filter((item) => item.level === "error");
  for (const item of issues) {
    const prefix = item.level === "error" ? "ERROR" : "WARN ";
    console.log(`[${prefix}] ${item.path}: ${item.message}`);
  }

  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`Validation completed with ${issues.length} warning(s).`);
}

async function enablePlugin(source: string): Promise<void> {
  const config = await readConfig();
  const entry = config.plugins.find((p) => p.source === source);
  if (!entry) {
    console.log(`Plugin "${source}" not found`);
    return;
  }
  entry.enabled = true;
  await writeConfig(config);
  console.log(`Enabled "${source}"`);
}

async function disablePlugin(source: string): Promise<void> {
  const config = await readConfig();
  const entry = config.plugins.find((p) => p.source === source);
  if (!entry) {
    console.log(`Plugin "${source}" not found`);
    return;
  }
  entry.enabled = false;
  await writeConfig(config);
  console.log(`Disabled "${source}"`);
}

function printHelp(): void {
  console.log(`
Usage: mcp-plugins <command> [options]

Commands:
  add <source>       Add a plugin (npm package or local path)
    --config '{}'    Optional JSON config to pass to the plugin

  remove <source>    Remove a plugin (and uninstall if npm)
  enable <source>    Enable a disabled plugin
  disable <source>   Disable a plugin without removing it
  list               List all configured plugins
  registry:validate  Validate mcp-registry.json and configured JSON plugins

Examples:
  mcp-plugins add mcp-plugin-github --config '{"token":"ghp_xxx"}'
  mcp-plugins add ./plugins/my-custom
  mcp-plugins disable ./plugins/system
  mcp-plugins registry:validate
  mcp-plugins list
`.trim());
}

async function main(): Promise<void> {
  const [command, source, ...rest] = process.argv.slice(2);

  const configFlag = rest.indexOf("--config");
  const configValue = configFlag !== -1 ? rest[configFlag + 1] : undefined;

  switch (command) {
    case "add":
      if (!source) { console.error("Usage: mcp-plugins add <source>"); process.exit(1); }
      await addPlugin(source, { config: configValue });
      break;
    case "remove":
      if (!source) { console.error("Usage: mcp-plugins remove <source>"); process.exit(1); }
      await removePlugin(source);
      break;
    case "enable":
      if (!source) { console.error("Usage: mcp-plugins enable <source>"); process.exit(1); }
      await enablePlugin(source);
      break;
    case "disable":
      if (!source) { console.error("Usage: mcp-plugins disable <source>"); process.exit(1); }
      await disablePlugin(source);
      break;
    case "list":
      await listPlugins();
      break;
    case "registry:validate":
      await validateRegistryCommand();
      break;
    default:
      printHelp();
      break;
  }
}

main();
