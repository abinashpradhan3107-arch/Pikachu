import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { examCreateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Course, Exam } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const exams = queryAll<Exam>(
      "SELECT * FROM exams WHERE user_id = ? ORDER BY exam_date ASC",
      [user.id],
    );
    return json({ exams });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = examCreateSchema.parse(await readJson(request));
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
      `INSERT INTO exams
       (id, user_id, course_id, title, exam_date, start_time, exam_type, weight,
        location, syllabus, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.id,
        body.course_id ?? null,
        body.title,
        body.exam_date,
        body.start_time ?? null,
        body.exam_type ?? "midterm",
        body.weight ?? null,
        body.location ?? null,
        body.syllabus ?? null,
        body.notes ?? null,
        now,
        now,
      ],
    );
    return json(
      { exam: queryOne<Exam>("SELECT * FROM exams WHERE id = ?", [id]) },
      201,
    );
  });
}
