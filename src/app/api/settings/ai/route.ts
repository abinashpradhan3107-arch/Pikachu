import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson } from "@/lib/api";
import { aiSettingsSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/crypto";
import { getPublicAiSettings } from "@/lib/ai/config";
import { nowIso } from "@/lib/utils";
import type { AiSettings } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    return json({ settings: getPublicAiSettings(user.id) });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = aiSettingsSchema.parse(await readJson(request));
    const existing = queryOne<AiSettings>("SELECT * FROM ai_settings WHERE user_id = ?", [
      user.id,
    ]);
    const now = nowIso();

    if (existing) {
      run(
        `UPDATE ai_settings SET provider = ?, base_url = ?, model = ?,
         api_key_enc = ?, youtube_api_key_enc = ?, temperature = ?, updated_at = ?
         WHERE user_id = ?`,
        [
          body.provider ?? existing.provider,
          body.baseUrl,
          body.model,
          body.apiKey ? encryptSecret(body.apiKey) : existing.api_key_enc,
          body.youtubeApiKey
            ? encryptSecret(body.youtubeApiKey)
            : existing.youtube_api_key_enc,
          body.temperature ?? existing.temperature,
          now,
          user.id,
        ],
      );
    } else {
      run(
        `INSERT INTO ai_settings
         (user_id, provider, base_url, model, api_key_enc, youtube_api_key_enc, temperature, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          body.provider ?? "openai",
          body.baseUrl,
          body.model,
          body.apiKey ? encryptSecret(body.apiKey) : null,
          body.youtubeApiKey ? encryptSecret(body.youtubeApiKey) : null,
          body.temperature ?? 0.4,
          now,
        ],
      );
    }

    return json({ settings: getPublicAiSettings(user.id) });
  });
}
