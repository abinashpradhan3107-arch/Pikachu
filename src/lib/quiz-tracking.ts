import { postJson } from "@/lib/client";

/**
 * Best-effort recording of a completed quiz score.
 *
 * Feeds weak-topic detection (GET /api/quiz-attempts). Deliberately never
 * throws: a tracking failure must not interrupt or invalidate the quiz the
 * student just finished.
 */
export function recordQuizAttempt(input: {
  score: number;
  total: number;
  courseId?: string | null;
  chapterId?: string | null;
  quizTitle?: string | null;
}): void {
  void postJson("/api/quiz-attempts", {
    score: input.score,
    total: input.total,
    courseId: input.courseId ?? null,
    chapterId: input.chapterId ?? null,
    quizTitle: input.quizTitle ?? null,
  }).catch(() => undefined);
}
