import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { assignmentCreateSchema } from "@/lib/validation";
import { normalizeDueAt, nowIso } from "@/lib/utils";
import type { Assignment, Course } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const assignments = queryAll<Assignment>(
      "SELECT * FROM assignments WHERE user_id = ? ORDER BY COALESCE(due_at, '9999') ASC",
      [user.id],
    );
    return json({ assignments });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = assignmentCreateSchema.parse(await readJson(request));
    if (body.course_id) {
      const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
        body.course_id,
        user.id,
      ]);
      if (!course) throw new ApiError(404, "Course not found.");
    }
    const now = nowIso();
    const id = crypto.randomUUID();
    run(
      `INSERT INTO assignments
       (id, user_id, course_id, title, description, due_at, status, source, source_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 'manual', ?, ?, ?)`,
      [
        id,
        user.id,
        body.course_id ?? null,
        body.title,
        body.description ?? null,
        normalizeDueAt(body.due_at),
        body.source_url || null,
        now,
        now,
      ],
    );
    return json(
      { assignment: queryOne<Assignment>("SELECT * FROM assignments WHERE id = ?", [id]) },
      201,
    );
  });
}
