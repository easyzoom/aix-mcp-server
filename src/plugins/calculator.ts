import { z } from "zod";
import type { McpPlugin } from "../plugin.js";

const plugin: McpPlugin = {
  name: "calculator",
  description: "Math expression evaluator",

  register(server) {
    server.registerTool(
      "calculator",
      {
        title: "Calculator",
        description: "Evaluate a mathematical expression and return the result",
        inputSchema: z.object({
          expression: z.string().describe("Math expression to evaluate, e.g. '2 + 3 * 4'"),
        }),
      },
      async ({ expression }) => {
        try {
          const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
          if (sanitized !== expression.trim()) {
            return {
              content: [{ type: "text", text: `Invalid characters in expression: ${expression}` }],
              isError: true,
            };
          }
          const result = new Function(`return (${sanitized})`)();
          return {
            content: [{ type: "text", text: `${expression} = ${result}` }],
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
