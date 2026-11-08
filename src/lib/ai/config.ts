import { queryOne } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { AiSettings } from "@/lib/types";
import { normalizeBaseUrl } from "@/lib/security";

export type AiRuntimeConfig = {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  temperature: number;
  youtubeApiKey: string | null;
  source: "user" | "environment" | "none";
};

export function getAiRuntimeConfig(userId: string): AiRuntimeConfig {
  const row = queryOne<AiSettings>("SELECT * FROM ai_settings WHERE user_id = ?", [
    userId,
  ]);

  const userKey = decryptSecret(row?.api_key_enc);
  const envKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY ?? null;
  const apiKey = userKey || envKey;
  const baseUrl = normalizeBaseUrl(
    row?.base_url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  );
  const model =
    row?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const provider = row?.provider || process.env.LLM_PROVIDER || "openai";
  const youtubeApiKey =
    decryptSecret(row?.youtube_api_key_enc) ||
    process.env.YOUTUBE_API_KEY ||
    null;

  return {
    configured: Boolean(apiKey && baseUrl && model),
    provider,
    baseUrl,
    model,
    apiKey,
    temperature: row?.temperature ?? 0.4,
    youtubeApiKey,
    source: userKey ? "user" : envKey ? "environment" : "none",
  };
}

export function getPublicAiSettings(userId: string) {
  const row = queryOne<AiSettings>("SELECT * FROM ai_settings WHERE user_id = ?", [
    userId,
  ]);
  const runtime = getAiRuntimeConfig(userId);
  return {
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
    temperature: runtime.temperature,
    configured: runtime.configured,
    source: runtime.source,
    hasUserKey: Boolean(row?.api_key_enc),
    hasYoutubeKey: Boolean(row?.youtube_api_key_enc) || Boolean(process.env.YOUTUBE_API_KEY),
    maskedKey: runtime.apiKey
      ? `${runtime.apiKey.slice(0, 3)}••••••••${runtime.apiKey.slice(-4)}`
      : "",
  };
}
