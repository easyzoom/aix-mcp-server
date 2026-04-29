import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { McpRegistry, McpRegistryEntry } from "./registry.js";
import { readJsonPluginDefinition } from "./json-plugin.js";

export interface ValidationIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

function issue(level: ValidationIssue["level"], path: string, message: string): ValidationIssue {
  return { level, path, message };
}

function capabilityCount(entry: McpRegistryEntry): number {
  return (entry.capabilities?.tools?.length ?? 0) + (entry.capabilities?.prompts?.length ?? 0) + (entry.capabilities?.resources?.length ?? 0);
}

export function validateRegistry(registry: McpRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  registry.entries.forEach((entry, index) => {
    const base = `entries[${index}]`;
    if (!entry.id) issues.push(issue("error", `${base}.id`, "id is required"));
    if (entry.id && ids.has(entry.id)) issues.push(issue("error", `${base}.id`, `duplicate id "${entry.id}"`));
    if (entry.id) ids.add(entry.id);
    if (!entry.name) issues.push(issue("error", `${base}.name`, "name is required"));
    if (!entry.summary || entry.summary.length < 5) issues.push(issue("warning", `${base}.summary`, "summary should be at least 5 characters"));
    if (!entry.description || entry.description.length < 10) issues.push(issue("warning", `${base}.description`, "description should be at least 10 characters"));
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(entry.version)) issues.push(issue("warning", `${base}.version`, "version should use semantic versioning"));
    if (!entry.contributor) issues.push(issue("warning", `${base}.contributor`, "contributor is recommended for public registry entries"));
    if (!entry.license) issues.push(issue("warning", `${base}.license`, "license is recommended for public registry entries"));
    if (capabilityCount(entry) === 0) issues.push(issue("warning", `${base}.capabilities`, "declare at least one tool, prompt, or resource"));

    if (!entry.install?.type) {
      issues.push(issue("error", `${base}.install.type`, "install type is required"));
    } else if (entry.install.type === "plugin" && !entry.install.pluginSource) {
      issues.push(issue("error", `${base}.install.pluginSource`, "pluginSource is required for plugin entries"));
    } else if (entry.install.type === "proxy" && !entry.install.proxyUrl) {
      issues.push(issue("error", `${base}.install.proxyUrl`, "proxyUrl is required for proxy entries"));
    } else if (entry.install.type === "standalone" && !entry.install.command && !entry.install.cursorConfig && !entry.install.claudeConfig) {
      issues.push(issue("error", `${base}.install`, "standalone entries need a command or client config"));
    }

    for (const relatedId of entry.relatedIds ?? []) {
      if (!registry.entries.some((item) => item.id === relatedId)) {
        issues.push(issue("warning", `${base}.relatedIds`, `related id "${relatedId}" does not exist`));
      }
    }
  });

  return issues;
}

export async function validateJsonPlugins(projectRoot: string, sources: string[]): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const source of sources.filter((item) => item.endsWith(".json"))) {
    try {
      await stat(isAbsolute(source) ? source : resolve(projectRoot, source));
      await readJsonPluginDefinition(source, projectRoot);
    } catch (err) {
      issues.push(issue("error", source, err instanceof Error ? err.message : String(err)));
    }
  }
  return issues;
}
