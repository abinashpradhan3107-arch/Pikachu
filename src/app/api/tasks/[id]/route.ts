import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Chapter, StudyTask } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = taskUpdateSchema.parse(await readJson(request));
    const task = queryOne<StudyTask>(
      "SELECT * FROM study_tasks WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!task) throw new ApiError(404, "Task not found.");
    const now = nowIso();

    const completedAt =
      body.status === "completed"
        ? task.completed_at ?? now
        : body.status
          ? null
          : task.completed_at;

    run(
      `UPDATE study_tasks SET title = ?, description = ?, status = ?, date = ?,
       duration_minutes = ?, priority = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        body.title ?? task.title,
        body.description !== undefined ? body.description : task.description,
        body.status ?? task.status,
        body.date ?? task.date,
        body.duration_minutes ?? task.duration_minutes,
        body.priority ?? task.priority,
        completedAt,
        now,
        id,
        user.id,
      ],
    );

    if (body.status === "completed" && task.chapter_id && task.task_type === "study") {
      const chapter = queryOne<Chapter>(
        "SELECT * FROM chapters WHERE id = ? AND user_id = ?",
        [task.chapter_id, user.id],
      );
      if (chapter && chapter.status === "not_started") {
        run("UPDATE chapters SET status = 'in_progress', updated_at = ? WHERE id = ?", [
          now,
          chapter.id,
        ]);
      }
    }

    return json({ task: queryOne<StudyTask>("SELECT * FROM study_tasks WHERE id = ?", [id]) });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const task = queryOne<StudyTask>(
      "SELECT * FROM study_tasks WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!task) throw new ApiError(404, "Task not found.");
    run("DELETE FROM study_tasks WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
