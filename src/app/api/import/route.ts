import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { importSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Course, Resource } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = importSchema.parse(await readJson(request));
    if (body.courseId) {
      const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
        body.courseId,
        user.id,
      ]);
      if (!course) throw new ApiError(404, "Course not found.");
    }
    const id = crypto.randomUUID();
    const now = nowIso();
    run(
      `INSERT INTO resources
       (id, user_id, course_id, title, kind, url, content, source, verified,
        duration_minutes, channel, description, lms_module_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 0, NULL, NULL, NULL, NULL, ?, ?)`,
      [
        id,
        user.id,
        body.courseId ?? null,
        body.title,
        body.kind ?? "note",
        body.sourceUrl || null,
        body.text,
        now,
        now,
      ],
    );
    return json(
      { resource: queryOne<Resource>("SELECT * FROM resources WHERE id = ?", [id]) },
      201,
    );
  });
}
