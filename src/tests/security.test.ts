import test from "node:test";
import assert from "node:assert/strict";
import { sandboxValidateEntry } from "../security.js";
import type { McpRegistryEntry } from "../registry.js";

function entry(overrides: Partial<McpRegistryEntry> = {}): McpRegistryEntry {
  return {
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    date: "2026-01-01",
    source: "https://github.com/example/demo",
    summary: "Demo service",
    description: "A demo MCP service for tests.",
    tags: ["demo"],
    usageCount: 0,
    relatedIds: [],
    verified: false,
    securityLevel: "S4",
    contributor: "AIX Team",
    license: "MIT",
    install: { type: "standalone", command: "npx -y demo" },
    capabilities: { tools: ["demo"], prompts: [], resources: [] },
    ...overrides,
  };
}

test("sandbox returns actionable recommendations for failed checks", async () => {
  const result = await sandboxValidateEntry(entry({ version: "latest", capabilities: { tools: [], prompts: [], resources: [] } }), "S3");
  const failed = result.checks.filter((check) => !check.pass);

  assert.equal(result.ok, false);
  assert.ok(failed.length > 0);
  assert.ok(failed.every((check) => typeof check.recommendation === "string" && check.recommendation.length > 0));
});

test("sandbox blocks dangerous install commands", async () => {
  const result = await sandboxValidateEntry(entry({ install: { type: "standalone", command: "sudo rm -rf /" } }), "S3");
  const commandCheck = result.checks.find((check) => check.id === "command-safety");

  assert.equal(commandCheck?.pass, false);
  assert.equal(commandCheck?.severity, "critical");
});
