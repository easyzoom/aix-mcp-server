import { readFile, writeFile } from "node:fs/promises";

export interface LlmProvider {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "ollama";
  baseUrl: string;
  apiKey?: string;
  model: string;
  enabled: boolean;
}

export interface LlmConfig {
  defaultProvider: string;
  providers: LlmProvider[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
}

export async function readLlmConfig(path: string): Promise<LlmConfig> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as LlmConfig;
  } catch {
    return { defaultProvider: "", providers: [] };
  }
}

export async function writeLlmConfig(path: string, config: LlmConfig): Promise<void> {
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
}

export function getProvider(config: LlmConfig, providerId?: string): LlmProvider | undefined {
  const id = providerId ?? config.defaultProvider;
  return config.providers.find((p) => p.id === id && p.enabled);
}

export function maskApiKey(key?: string): string {
  if (!key || key.length < 8) return key ? "****" : "";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

async function callOpenAI(provider: LlmProvider, messages: ChatMessage[]): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: provider.model, messages, temperature: 0.7 }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(provider: LlmProvider, messages: ChatMessage[]): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/messages`;
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 2048,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Anthropic API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

async function callOllama(provider: LlmProvider, messages: ChatMessage[]): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/api/chat`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: provider.model, messages, stream: false }),
    signal: AbortSignal.timeout(60000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Ollama API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

export async function chatCompletion(provider: LlmProvider, messages: ChatMessage[]): Promise<ChatResponse> {
  let content: string;

  switch (provider.type) {
    case "openai":
      content = await callOpenAI(provider, messages);
      break;
    case "anthropic":
      content = await callAnthropic(provider, messages);
      break;
    case "ollama":
      content = await callOllama(provider, messages);
      break;
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }

  return { content, provider: provider.id, model: provider.model };
}
