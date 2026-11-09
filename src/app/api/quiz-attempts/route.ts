import { queryAll, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { nowIso } from "@/lib/utils";
import { z } from "zod";

// ============================================================
// Quiz attempt recording - feeds weak-topic detection.
// Scores come from the student's own answers in QuizRunner; nothing is
// inferred and no question content is stored.
// ============================================================

const attemptSchema = z.object({
  quizTitle: z.string().min(1).max(200).optional(),
  courseId: z.string().nullish(),
  chapterId: z.string().nullish(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
});

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = await readJson(request);
    const parsed = attemptSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "Invalid attempt data.", parsed.error.format());
    }

    const { score, total, quizTitle, courseId, chapterId } = parsed.data;
    if (score > total) throw new ApiError(400, "Score cannot exceed the question count.");

    run(
      `INSERT INTO quiz_attempts (id, user_id, course_id, chapter_id, quiz_title, score, total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        user.id,
        courseId ?? null,
        chapterId ?? null,
        quizTitle ?? null,
        score,
        total,
        nowIso(),
      ],
    );

    return json({ success: true });
  });
}

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);

    // Rolled up per chapter and per course so the dashboard and progress page
    // can show accuracy without pulling every attempt.
    const byChapter = queryAll<{
      chapter_id: string | null;
      score: number;
      total: number;
      attempts: number;
    }>(
      `SELECT chapter_id, SUM(score) AS score, SUM(total) AS total, COUNT(*) AS attempts
       FROM quiz_attempts
       WHERE user_id = ? AND chapter_id IS NOT NULL
       GROUP BY chapter_id`,
      [user.id],
    );

    const byCourse = queryAll<{
      course_id: string | null;
      score: number;
      total: number;
      attempts: number;
    }>(
      `SELECT course_id, SUM(score) AS score, SUM(total) AS total, COUNT(*) AS attempts
       FROM quiz_attempts
       WHERE user_id = ? AND course_id IS NOT NULL
       GROUP BY course_id`,
      [user.id],
    );

    const rows = <T extends { score: number; total: number }>(items: T[]) =>
      items.map((row) => ({
        ...row,
        accuracy: row.total > 0 ? Math.round((row.score / row.total) * 100) : null,
      }));

    return json({ byChapter: rows(byChapter), byCourse: rows(byCourse) });
  });
}
