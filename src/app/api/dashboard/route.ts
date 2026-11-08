import { queryOne } from "@/lib/db";
import { requireApiUser, handleRoute, json } from "@/lib/api";
import { getStudyStats } from "@/lib/stats";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import type { LmsConnection } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    const stats = getStudyStats(user.id, profile.timezone);
    const plan = queryOne<{
      summary: string | null;
      ai_briefing: string | null;
      total_minutes: number;
    }>(
      "SELECT summary, ai_briefing, total_minutes FROM daily_plans WHERE user_id = ? AND date = ?",
      [user.id, stats.today],
    );
    const ai = getAiRuntimeConfig(user.id);
    const lms = queryOne<LmsConnection>(
      "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
      [user.id],
    );

    return json({
      stats,
      profile,
      plan: plan ?? null,
      ai: {
        configured: ai.configured,
        source: ai.source,
        model: ai.model,
        hasYoutubeKey: Boolean(ai.youtubeApiKey),
      },
      lms: lms
        ? {
            connected: true,
            status: lms.status,
            siteName: lms.site_name,
            siteUrl: lms.site_url,
            lastSyncAt: lms.last_sync_at,
            lastError: lms.last_error,
          }
        : { connected: false },
    });
  });
}
