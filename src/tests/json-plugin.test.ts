import test from "node:test";
import assert from "node:assert/strict";
import { validateJsonPluginDefinition } from "../json-plugin.js";

test("validates a minimal JSON plugin", () => {
  assert.doesNotThrow(() => validateJsonPluginDefinition({
    schemaVersion: 1,
    name: "hello-json",
    tools: [
      {
        name: "hello",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
        },
        response: { type: "template", text: "Hello {{name}}" },
      },
    ],
  }));
});

test("reports field paths for invalid JSON plugins", () => {
  assert.throws(
    () => validateJsonPluginDefinition({
      schemaVersion: 1,
      name: "broken",
      tools: [{ name: "oops", response: { type: "script" } }],
    }),
    /\$\.tools\[0\]\.response\.type/
  );
});
