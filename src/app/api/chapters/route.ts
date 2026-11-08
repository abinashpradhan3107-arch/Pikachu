import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { chapterCreateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Chapter, Course } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");
    const chapters = courseId
      ? queryAll<Chapter>(
          "SELECT * FROM chapters WHERE user_id = ? AND course_id = ? ORDER BY order_index ASC, created_at ASC",
          [user.id, courseId],
        )
      : queryAll<Chapter>(
          "SELECT * FROM chapters WHERE user_id = ? ORDER BY created_at ASC",
          [user.id],
        );
    return json({ chapters });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = chapterCreateSchema.parse(await readJson(request));
    const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
      body.course_id,
      user.id,
    ]);
    if (!course) throw new ApiError(404, "Course not found.");
    const count = queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM chapters WHERE course_id = ?",
      [body.course_id],
    );
    const now = nowIso();
    const id = crypto.randomUUID();
    run(
      `INSERT INTO chapters
       (id, user_id, course_id, title, unit, status, difficulty, confidence,
        estimated_minutes, notes, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.id,
        body.course_id,
        body.title,
        body.unit ?? null,
        body.status ?? "not_started",
        body.difficulty ?? "medium",
        body.confidence ?? 3,
        body.estimated_minutes ?? 60,
        body.notes ?? null,
        count?.count ?? 0,
        now,
        now,
      ],
    );
    const chapter = queryOne<Chapter>("SELECT * FROM chapters WHERE id = ?", [id]);
    return json({ chapter }, 201);
  });
}
