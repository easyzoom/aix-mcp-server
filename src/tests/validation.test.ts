import test from "node:test";
import assert from "node:assert/strict";
import { validateRegistry } from "../validation.js";
import type { McpRegistry } from "../registry.js";

test("registry validation catches duplicate ids and missing install config", () => {
  const registry: McpRegistry = {
    entries: [
      {
        id: "dup",
        name: "One",
        version: "1.0.0",
        date: "2026-01-01",
        source: "https://example.com/one",
        summary: "One service",
        description: "One service description.",
        tags: [],
        usageCount: 0,
        relatedIds: [],
        verified: false,
        securityLevel: "S4",
        contributor: "AIX",
        license: "MIT",
        install: { type: "plugin" },
        capabilities: { tools: [], prompts: [], resources: [] },
      },
      {
        id: "dup",
        name: "Two",
        version: "bad",
        date: "2026-01-01",
        source: "https://example.com/two",
        summary: "Two service",
        description: "Two service description.",
        tags: [],
        usageCount: 0,
        relatedIds: ["missing"],
        verified: false,
        securityLevel: "S4",
        contributor: "AIX",
        license: "MIT",
        install: { type: "standalone", command: "npx two" },
        capabilities: { tools: ["two"], prompts: [], resources: [] },
      },
    ],
  };

  const issues = validateRegistry(registry);

  assert.ok(issues.some((issue) => issue.level === "error" && issue.message.includes("duplicate id")));
  assert.ok(issues.some((issue) => issue.path.endsWith("install.pluginSource")));
  assert.ok(issues.some((issue) => issue.message.includes("related id")));
});
