import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { taskCreateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Chapter, StudyTask } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    let tasks: StudyTask[];
    if (date) {
      tasks = queryAll<StudyTask>(
        "SELECT * FROM study_tasks WHERE user_id = ? AND date = ? ORDER BY sort_order ASC, created_at ASC",
        [user.id, date],
      );
    } else if (from && to) {
      tasks = queryAll<StudyTask>(
        "SELECT * FROM study_tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, sort_order ASC",
        [user.id, from, to],
      );
    } else {
      tasks = queryAll<StudyTask>(
        "SELECT * FROM study_tasks WHERE user_id = ? ORDER BY date DESC, sort_order ASC LIMIT 300",
        [user.id],
      );
    }
    return json({ tasks });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = taskCreateSchema.parse(await readJson(request));
    if (body.chapter_id) {
      const chapter = queryOne<Chapter>(
        "SELECT * FROM chapters WHERE id = ? AND user_id = ?",
        [body.chapter_id, user.id],
      );
      if (!chapter) throw new ApiError(404, "Chapter not found.");
    }
    const count = queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM study_tasks WHERE user_id = ? AND date = ?",
      [user.id, body.date],
    );
    const now = nowIso();
    const id = crypto.randomUUID();
    run(
      `INSERT INTO study_tasks
       (id, user_id, course_id, chapter_id, exam_id, assignment_id, date, title, description,
        task_type, duration_minutes, priority, status, resource_url, resource_title, ai_generated,
        rescheduled_from, completed_at, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, 0, NULL, NULL, ?, ?, ?)`,
      [
        id,
        user.id,
        body.course_id ?? null,
        body.chapter_id ?? null,
        body.date,
        body.title,
        body.description ?? null,
        body.task_type ?? "study",
        body.duration_minutes,
        body.priority ?? "medium",
        body.resource_url || null,
        count?.count ?? 0,
        now,
        now,
      ],
    );
    return json(
      { task: queryOne<StudyTask>("SELECT * FROM study_tasks WHERE id = ?", [id]) },
      201,
    );
  });
}
