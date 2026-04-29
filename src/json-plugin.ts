import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z, type ZodTypeAny } from "zod";
import type { McpPlugin } from "./plugin.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean";
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
}

interface JsonPluginTool {
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

interface JsonPluginResource {
  name: string;
  uri: string;
  title?: string;
  description?: string;
  mimeType?: string;
  text?: string;
  json?: JsonValue;
}

interface JsonPluginDefinition {
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

function validateDefinition(def: JsonPluginDefinition): void {
  if (!def.name || typeof def.name !== "string") {
    throw new Error("JSON plugin requires a string name");
  }
  for (const tool of def.tools ?? []) {
    if (!tool.name || !tool.response?.type) {
      throw new Error(`Invalid JSON plugin tool in ${def.name}`);
    }
  }
  for (const resource of def.resources ?? []) {
    if (!resource.name || !resource.uri || (!("text" in resource) && !("json" in resource))) {
      throw new Error(`Invalid JSON plugin resource in ${def.name}`);
    }
  }
}

export async function loadJsonPlugin(source: string, projectRoot: string): Promise<McpPlugin> {
  const absPath = isAbsolute(source) ? source : resolve(projectRoot, source);
  const def = JSON.parse(await readFile(absPath, "utf-8")) as JsonPluginDefinition;
  validateDefinition(def);

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
