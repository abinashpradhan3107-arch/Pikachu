import { queryAll, queryOne } from "@/lib/db";
import { requireApiUser, handleRoute, json } from "@/lib/api";
import { getStudyStats } from "@/lib/stats";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { rescheduleMissedTasks } from "@/lib/plan/engine";
import type { LmsConnection } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    const stats = getStudyStats(user.id, profile.timezone);

    // Automatic catch-up: anything still pending from an earlier day moves
    // into the next block with room, every time the dashboard is opened.
    // rescheduleMissedTasks is a no-op when there is nothing to move.
    const rescheduled = rescheduleMissedTasks(user.id, stats.today);

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

    // Backlog: LMS lectures not yet marked watched, oldest week first.
    const backlog = queryAll<{
      id: string;
      title: string;
      url: string | null;
      duration_minutes: number | null;
      course_title: string | null;
      chapter_title: string | null;
      synced_at: string;
    }>(
      `SELECT r.id, r.title, r.url, r.duration_minutes,
              r.created_at AS synced_at,
              c.title AS course_title,
              ch.title AS chapter_title
       FROM resources r
       LEFT JOIN courses c ON c.id = r.course_id AND c.user_id = r.user_id
       LEFT JOIN chapters ch ON ch.id = r.lms_module_id AND ch.user_id = r.user_id
       WHERE r.user_id = ? AND r.source = 'lms' AND r.kind = 'lecture'
         AND r.watched_at IS NULL
       ORDER BY COALESCE(ch.order_index, 999) ASC, r.created_at ASC, r.title ASC
       LIMIT 40`,
      [user.id],
    );

    // Quiz accuracy per chapter - feeds weak-topic detection with measured
    // results rather than guesswork.
    const accuracyRows = queryAll<{
      chapter_id: string;
      chapter_title: string | null;
      course_title: string | null;
      score: number;
      total: number;
      attempts: number;
    }>(
      `SELECT qa.chapter_id,
              ch.title AS chapter_title,
              c.title AS course_title,
              SUM(qa.score) AS score,
              SUM(qa.total) AS total,
              COUNT(*) AS attempts
       FROM quiz_attempts qa
       LEFT JOIN chapters ch ON ch.id = qa.chapter_id AND ch.user_id = qa.user_id
       LEFT JOIN courses c ON c.id = COALESCE(qa.course_id, ch.course_id) AND c.user_id = qa.user_id
       WHERE qa.user_id = ? AND qa.chapter_id IS NOT NULL
       GROUP BY qa.chapter_id`,
      [user.id],
    );
    const quizAccuracy = accuracyRows.map((row) => ({
      ...row,
      accuracy: row.total > 0 ? Math.round((row.score / row.total) * 100) : null,
    }));

    return json({
      stats,
      profile,
      plan: plan ?? null,
      backlog,
      backlogCount: backlog.length,
      quizAccuracy,
      rescheduled,
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
