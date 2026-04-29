import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z, type ZodTypeAny } from "zod";
import type { McpPlugin } from "./plugin.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean";
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
}

export interface JsonPluginTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: {
    type?: "object";
    required?: string[];
    properties?: Record<string, JsonSchemaProperty>;
  };
  response:
    | { type: "template"; text: string }
    | { type: "json"; data: JsonValue };
}

export interface JsonPluginResource {
  name: string;
  uri: string;
  title?: string;
  description?: string;
  mimeType?: string;
  text?: string;
  json?: JsonValue;
}

export interface JsonPluginDefinition {
  schemaVersion?: 1;
  name: string;
  description?: string;
  tools?: JsonPluginTool[];
  resources?: JsonPluginResource[];
}

function renderTemplate(template: string, args: Record<string, unknown>, config: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const parts = key.split(".");
    const root: unknown = parts[0] === "config" ? config : args;
    const path = parts[0] === "config" ? parts.slice(1) : parts;
    let value = root;
    for (const part of path) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return "";
      }
    }
    return value === undefined || value === null ? "" : String(value);
  });
}

function zodForProperty(prop: JsonSchemaProperty, required: boolean): ZodTypeAny {
  let schema: ZodTypeAny;

  if (prop.enum && prop.enum.length > 0) {
    schema = z.enum(prop.enum.map(String) as [string, ...string[]]);
  } else if (prop.type === "number") {
    schema = z.number();
  } else if (prop.type === "integer") {
    schema = z.number().int();
  } else if (prop.type === "boolean") {
    schema = z.boolean();
  } else {
    schema = z.string();
  }

  if (prop.description) schema = schema.describe(prop.description);
  if (!required) schema = schema.optional();
  return schema;
}

function buildInputSchema(schema: JsonPluginTool["inputSchema"]): z.ZodObject<Record<string, ZodTypeAny>> {
  const required = new Set(schema?.required ?? []);
  const shape: Record<string, ZodTypeAny> = {};
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    shape[name] = zodForProperty(prop, required.has(name));
  }
  return z.object(shape);
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertString(value: unknown, path: string, required = true): void {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || value.trim() === "") fail(path, "must be a non-empty string");
}

function assertStringArray(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    fail(path, "must be an array of non-empty strings");
  }
}

function validateInputSchema(schema: unknown, path: string): void {
  if (schema === undefined) return;
  if (!isPlainObject(schema)) fail(path, "must be an object");
  if (schema.type !== undefined && schema.type !== "object") fail(`${path}.type`, "must be object");
  assertStringArray(schema.required, `${path}.required`);
  const properties = schema.properties;
  if (properties !== undefined && !isPlainObject(properties)) fail(`${path}.properties`, "must be an object");
  for (const [name, prop] of Object.entries((properties ?? {}) as Record<string, unknown>)) {
    const propPath = `${path}.properties.${name}`;
    if (!isPlainObject(prop)) fail(propPath, "must be an object");
    if (prop.type !== undefined && !["string", "number", "integer", "boolean"].includes(String(prop.type))) {
      fail(`${propPath}.type`, "must be one of string, number, integer, boolean");
    }
    assertString(prop.description, `${propPath}.description`, false);
    if (prop.enum !== undefined && (!Array.isArray(prop.enum) || prop.enum.length === 0)) {
      fail(`${propPath}.enum`, "must be a non-empty array when provided");
    }
  }
}

export function validateJsonPluginDefinition(def: unknown): asserts def is JsonPluginDefinition {
  if (!isPlainObject(def)) fail("$", "JSON plugin must be an object");
  if (def.schemaVersion !== undefined && def.schemaVersion !== 1) fail("$.schemaVersion", "must be 1");
  assertString(def.name, "$.name");
  assertString(def.description, "$.description", false);
  if (def.tools !== undefined && !Array.isArray(def.tools)) fail("$.tools", "must be an array");
  if (def.resources !== undefined && !Array.isArray(def.resources)) fail("$.resources", "must be an array");
  const tools = (def.tools ?? []) as unknown[];
  const resources = (def.resources ?? []) as unknown[];
  if (tools.length === 0 && resources.length === 0) {
    fail("$", "must define at least one tool or resource");
  }

  for (const [index, tool] of tools.entries()) {
    const path = `$.tools[${index}]`;
    if (!isPlainObject(tool)) fail(path, "must be an object");
    assertString(tool.name, `${path}.name`);
    assertString(tool.title, `${path}.title`, false);
    assertString(tool.description, `${path}.description`, false);
    validateInputSchema(tool.inputSchema, `${path}.inputSchema`);
    if (!isPlainObject(tool.response)) fail(`${path}.response`, "must be an object");
    if (tool.response.type === "template") {
      assertString(tool.response.text, `${path}.response.text`);
    } else if (tool.response.type === "json") {
      if (!("data" in tool.response)) fail(`${path}.response.data`, "is required for json responses");
    } else {
      fail(`${path}.response.type`, "must be template or json");
    }
  }

  for (const [index, resource] of resources.entries()) {
    const path = `$.resources[${index}]`;
    if (!isPlainObject(resource)) fail(path, "must be an object");
    assertString(resource.name, `${path}.name`);
    assertString(resource.uri, `${path}.uri`);
    assertString(resource.title, `${path}.title`, false);
    assertString(resource.description, `${path}.description`, false);
    assertString(resource.mimeType, `${path}.mimeType`, false);
    if (!("text" in resource) && !("json" in resource)) fail(path, "must provide text or json content");
    if ("text" in resource) assertString(resource.text, `${path}.text`);
  }
}

export async function readJsonPluginDefinition(source: string, projectRoot: string): Promise<JsonPluginDefinition> {
  const absPath = isAbsolute(source) ? source : resolve(projectRoot, source);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absPath, "utf-8"));
  } catch (err) {
    throw new Error(`${source}: ${err instanceof Error ? err.message : String(err)}`);
  }
  validateJsonPluginDefinition(parsed);
  return parsed;
}

export async function loadJsonPlugin(source: string, projectRoot: string): Promise<McpPlugin> {
  const def = await readJsonPluginDefinition(source, projectRoot);

  return {
    name: def.name,
    description: def.description,
    register(server, config = {}) {
      for (const tool of def.tools ?? []) {
        server.registerTool(
          tool.name,
          {
            title: tool.title ?? tool.name,
            description: tool.description,
            inputSchema: buildInputSchema(tool.inputSchema),
            annotations: { title: tool.title ?? tool.name, readOnlyHint: true },
          },
          async (args) => {
            if (tool.response.type === "json") {
              return { content: [{ type: "text", text: JSON.stringify(tool.response.data, null, 2) }] };
            }
            return { content: [{ type: "text", text: renderTemplate(tool.response.text, args, config) }] };
          }
        );
      }

      for (const resource of def.resources ?? []) {
        server.registerResource(
          resource.name,
          resource.uri,
          {
            title: resource.title ?? resource.name,
            description: resource.description,
            mimeType: resource.mimeType ?? (resource.json === undefined ? "text/plain" : "application/json"),
          },
          async (uri) => ({
            contents: [
              {
                uri: uri.href,
                text: resource.json === undefined ? resource.text ?? "" : JSON.stringify(resource.json, null, 2),
              },
            ],
          })
        );
      }
    },
  };
}
