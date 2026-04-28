import { readFile, writeFile } from "node:fs/promises";

/**
 * S1 = builtin or official trusted source, sandbox verified
 * S2 = verified third-party, community reviewed
 * S3 = community contributed, basic checks passed
 * S4 = unverified / user-added, use with caution
 */
export type SecurityLevel = "S1" | "S2" | "S3" | "S4";

export const SECURITY_LEVELS: Record<SecurityLevel, { label: string; color: string; description: string }> = {
  S1: { label: "Official",    color: "#22c55e", description: "Built-in or official trusted source, sandbox verified" },
  S2: { label: "Verified",    color: "#3b82f6", description: "Third-party verified, community reviewed" },
  S3: { label: "Community",   color: "#eab308", description: "Community contributed, basic checks passed" },
  S4: { label: "Unverified",  color: "#ef4444", description: "Unverified, use at your own risk" },
};

export interface McpRegistryEntry {
  id: string;
  name: string;
  version: string;
  date: string;
  source: string;
  summary: string;
  description: string;
  tags: string[];
  usageCount: number;
  enabled?: boolean;
  relatedIds: string[];
  verified: boolean;
  securityLevel: SecurityLevel;
  contributor: string;
  license: string;
  install: {
    type: "plugin" | "proxy" | "standalone";
    pluginSource?: string;
    proxyUrl?: string;
    cursorConfig?: Record<string, unknown>;
    claudeConfig?: Record<string, unknown>;
    command?: string;
  };
  capabilities: {
    tools: string[];
    prompts: string[];
    resources: string[];
  };
}

export interface McpRegistry {
  entries: McpRegistryEntry[];
}

function normalizeEntry(entry: McpRegistryEntry): McpRegistryEntry {
  return {
    ...entry,
    version: entry.version || "1.0.0",
    enabled: entry.enabled ?? true,
    contributor: entry.contributor || "Anonymous",
    securityLevel: entry.securityLevel || "S4",
    capabilities: entry.capabilities ?? { tools: [], prompts: [], resources: [] },
    tags: entry.tags ?? [],
    relatedIds: entry.relatedIds ?? [],
  };
}

export async function readRegistry(path: string): Promise<McpRegistry> {
  try {
    const registry = JSON.parse(await readFile(path, "utf-8")) as McpRegistry;
    return { entries: (registry.entries ?? []).map(normalizeEntry) };
  } catch {
    return { entries: [] };
  }
}

export async function writeRegistry(path: string, registry: McpRegistry): Promise<void> {
  await writeFile(path, JSON.stringify(registry, null, 2) + "\n");
}
