import type { McpServer } from "@modelcontextprotocol/server";

export interface McpPlugin {
  name: string;
  description?: string;
  register(server: McpServer, config?: Record<string, unknown>): void;
}

export interface PluginEntry {
  source: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface PluginsConfig {
  plugins: PluginEntry[];
}
