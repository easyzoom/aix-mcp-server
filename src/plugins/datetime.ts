import { z } from "zod";
import type { McpPlugin } from "../plugin.js";

const plugin: McpPlugin = {
  name: "datetime",
  description: "Date and time helpers",

  register(server) {
    server.registerTool(
      "current-time",
      {
        title: "Current Time",
        description: "Get the current date and time in ISO, locale, or Unix timestamp format",
        inputSchema: z.object({
          timezone: z.string().optional().describe("IANA timezone, e.g. Asia/Shanghai or UTC"),
          locale: z.string().optional().describe("BCP 47 locale, e.g. zh-CN or en-US"),
        }),
        annotations: { title: "Current Time", readOnlyHint: true },
      },
      async ({ timezone, locale }) => {
        const now = new Date();
        const resolvedLocale = locale ?? "zh-CN";
        const options: Intl.DateTimeFormatOptions = {
          dateStyle: "full",
          timeStyle: "long",
          timeZone: timezone,
        };

        try {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    iso: now.toISOString(),
                    unixSeconds: Math.floor(now.getTime() / 1000),
                    unixMilliseconds: now.getTime(),
                    locale: now.toLocaleString(resolvedLocale, options),
                    timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "format-time",
      {
        title: "Format Time",
        description: "Format an ISO date string or Unix timestamp",
        inputSchema: z.object({
          value: z.union([z.string(), z.number()]).describe("ISO date string, Unix seconds, or Unix milliseconds"),
          timezone: z.string().optional().describe("IANA timezone, e.g. Asia/Shanghai or UTC"),
          locale: z.string().optional().describe("BCP 47 locale, e.g. zh-CN or en-US"),
        }),
        annotations: { title: "Format Time", readOnlyHint: true },
      },
      async ({ value, timezone, locale }) => {
        const timestamp = typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value;
        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
          return {
            content: [{ type: "text", text: `Invalid date value: ${value}` }],
            isError: true,
          };
        }

        try {
          return {
            content: [
              {
                type: "text",
                text: date.toLocaleString(locale ?? "zh-CN", {
                  dateStyle: "full",
                  timeStyle: "long",
                  timeZone: timezone,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    );
  },
};

export default plugin;
