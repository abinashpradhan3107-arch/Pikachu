import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import type { Quiz } from "@/lib/types";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const quiz = queryOne<Quiz>("SELECT * FROM quizzes WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!quiz) throw new ApiError(404, "Quiz not found.");
    run("DELETE FROM quizzes WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
