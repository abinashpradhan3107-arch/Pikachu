import type { AiRuntimeConfig } from "@/lib/ai/config";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessageInput = { role: ChatRole; content: string };

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Connect an AI provider in Settings to use this feature.");
    this.name = "AiNotConfiguredError";
  }
}

function endpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}

function friendlyError(status: number, body: string): string {
  const trimmed = body.replace(/\s+/g, " ").slice(0, 300);
  if (status === 401 || status === 403) {
    return "The AI provider rejected the API key. Check the key and base URL in Settings.";
  }
  if (status === 404) {
    return `The AI provider could not find that model or endpoint. ${trimmed}`;
  }
  if (status === 429) {
    return "The AI provider rate limit was reached. Wait a moment and try again.";
  }
  if (status >= 500) {
    return "The AI provider is temporarily unavailable. Try again shortly.";
  }
  return trimmed || `The AI provider returned HTTP ${status}.`;
}

export async function completeChat(
  config: AiRuntimeConfig,
  messages: ChatMessageInput[],
  options: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!config.configured || !config.apiKey) throw new AiNotConfiguredError();

  const response = await fetch(endpoint(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? config.temperature,
      max_tokens: options.maxTokens ?? 3000,
      stream: false,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
  });

  if (!response.ok) {
    throw new Error(friendlyError(response.status, await response.text()));
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI provider returned an empty response.");
  return content.trim();
}

export async function* streamChat(
  config: AiRuntimeConfig,
  messages: ChatMessageInput[],
  options: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): AsyncGenerator<string, void, unknown> {
  if (!config.configured || !config.apiKey) throw new AiNotConfiguredError();

  const response = await fetch(endpoint(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? config.temperature,
      max_tokens: options.maxTokens ?? 3000,
      stream: true,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  });

  if (!response.ok) {
    throw new Error(friendlyError(response.status, await response.text()));
  }
  if (!response.body) throw new Error("The AI provider returned no stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: {
              delta?: { content?: string | null };
              message?: { content?: string | null };
            }[];
            error?: { message?: string };
          };
          if (parsed.error?.message) {
            throw new Error(parsed.error.message);
          }
          const delta =
            parsed.choices?.[0]?.delta?.content ??
            parsed.choices?.[0]?.message?.content ??
            "";
          if (delta) yield delta;
        } catch (error) {
          if (error instanceof Error && error.message && !/JSON/i.test(error.message)) {
            throw error;
          }
        }
      }
    }
  }

  for (const line of buffer.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as {
        choices?: { delta?: { content?: string | null } }[];
      };
      const delta = parsed.choices?.[0]?.delta?.content ?? "";
      if (delta) yield delta;
    } catch {
      // Ignore a trailing partial frame.
    }
  }
}

export function extractJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("The AI response was not valid JSON.");
  }
}

export async function testAiConnection(config: AiRuntimeConfig): Promise<string> {
  const result = await completeChat(
    config,
    [
      {
        role: "system",
        content: "You are a connection test. Reply with exactly: connection ok",
      },
      { role: "user", content: "Test" },
    ],
    { maxTokens: 12, timeoutMs: 30_000, temperature: 0 },
  );
  return result.slice(0, 80);
}
