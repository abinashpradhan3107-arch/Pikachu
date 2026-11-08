import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { examUpdateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Course, Exam } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = examUpdateSchema.parse(await readJson(request));
    const exam = queryOne<Exam>("SELECT * FROM exams WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!exam) throw new ApiError(404, "Exam not found.");
    if (body.course_id) {
      const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
        body.course_id,
        user.id,
      ]);
      if (!course) throw new ApiError(404, "Course not found.");
    }

    run(
      `UPDATE exams SET course_id = ?, title = ?, exam_date = ?, start_time = ?, exam_type = ?,
       weight = ?, location = ?, syllabus = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        body.course_id !== undefined ? body.course_id : exam.course_id,
        body.title ?? exam.title,
        body.exam_date ?? exam.exam_date,
        body.start_time !== undefined ? body.start_time : exam.start_time,
        body.exam_type ?? exam.exam_type,
        body.weight !== undefined ? body.weight : exam.weight,
        body.location !== undefined ? body.location : exam.location,
        body.syllabus !== undefined ? body.syllabus : exam.syllabus,
        body.notes !== undefined ? body.notes : exam.notes,
        nowIso(),
        id,
        user.id,
      ],
    );
    return json({ exam: queryOne<Exam>("SELECT * FROM exams WHERE id = ?", [id]) });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const exam = queryOne<Exam>("SELECT * FROM exams WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!exam) throw new ApiError(404, "Exam not found.");
    run("DELETE FROM exams WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
