import type { PluginsConfig } from "./plugin.js";
import type { ProxyConfig } from "./proxy.js";
import type { McpRegistry, SecurityLevel } from "./registry.js";

export type ManagedService =
  | {
      kind: "plugin";
      id: string;
      name: string;
      source: string;
      enabled: boolean;
      registryId?: string;
      securityLevel?: SecurityLevel;
      version?: string;
      config?: Record<string, unknown>;
    }
  | {
      kind: "proxy";
      id: string;
      name: string;
      url: string;
      enabled: boolean;
      registryId?: string;
      securityLevel?: SecurityLevel;
      version?: string;
      description?: string;
    }
  | {
      kind: "standalone";
      id: string;
      name: string;
      enabled: boolean;
      registryId: string;
      securityLevel?: SecurityLevel;
      version?: string;
      command?: string;
      source?: string;
    };

export function serviceId(kind: string, value: string): string {
  return `${kind}:${Buffer.from(value).toString("base64url")}`;
}

export function decodeServiceId(id: string): { kind: string; value: string } | null {
  const [kind, encoded] = id.split(":");
  if (!kind || !encoded) return null;
  try {
    return { kind, value: Buffer.from(encoded, "base64url").toString("utf-8") };
  } catch {
    return null;
  }
}

export function buildManagedServices(plugins: PluginsConfig, proxy: ProxyConfig, registry: McpRegistry): ManagedService[] {
  const services: ManagedService[] = [];

  for (const plugin of plugins.plugins) {
    const match = registry.entries.find((entry) => entry.install.type === "plugin" && entry.install.pluginSource === plugin.source);
    services.push({
      kind: "plugin",
      id: serviceId("plugin", plugin.source),
      name: match?.name ?? plugin.source,
      source: plugin.source,
      enabled: plugin.enabled !== false,
      registryId: match?.id,
      securityLevel: match?.securityLevel,
      version: match?.version,
      config: plugin.config,
    });
  }

  for (const target of proxy.targets) {
    const match = registry.entries.find((entry) => entry.install.type === "proxy" && entry.install.proxyUrl === target.url);
    services.push({
      kind: "proxy",
      id: serviceId("proxy", target.name),
      name: target.name,
      url: target.url,
      enabled: target.enabled !== false,
      registryId: match?.id,
      securityLevel: match?.securityLevel,
      version: match?.version,
      description: target.description,
    });
  }

  for (const entry of registry.entries.filter((item) => item.install.type === "standalone")) {
    services.push({
      kind: "standalone",
      id: serviceId("standalone", entry.id),
      name: entry.name,
      enabled: entry.enabled !== false,
      registryId: entry.id,
      securityLevel: entry.securityLevel,
      version: entry.version,
      command: entry.install.command,
      source: entry.source,
    });
  }

  return services;
}
