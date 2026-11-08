import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { courseUpdateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Course } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = courseUpdateSchema.parse(await readJson(request));
    const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!course) throw new ApiError(404, "Course not found.");

    run(
      `UPDATE courses SET code = ?, title = ?, description = ?, color = ?, instructor = ?,
       credits = ?, archived = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [
        body.code !== undefined ? body.code : course.code,
        body.title ?? course.title,
        body.description !== undefined ? body.description : course.description,
        body.color !== undefined ? body.color : course.color,
        body.instructor !== undefined ? body.instructor : course.instructor,
        body.credits !== undefined ? body.credits : course.credits,
        body.archived !== undefined ? (body.archived ? 1 : 0) : course.archived,
        nowIso(),
        id,
        user.id,
      ],
    );
    const updated = queryOne<Course>("SELECT * FROM courses WHERE id = ?", [id]);
    return json({ course: updated });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!course) throw new ApiError(404, "Course not found.");
    run("DELETE FROM courses WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
