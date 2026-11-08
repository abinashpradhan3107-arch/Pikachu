import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { courseCreateSchema } from "@/lib/validation";
import { courseColor, nowIso } from "@/lib/utils";
import type { Course } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const courses = queryAll<Course>(
      "SELECT * FROM courses WHERE user_id = ? AND archived = 0 ORDER BY created_at ASC",
      [user.id],
    );
    return json({ courses });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = courseCreateSchema.parse(await readJson(request));
    const count = queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM courses WHERE user_id = ?",
      [user.id],
    );
    const now = nowIso();
    const id = crypto.randomUUID();
    run(
      `INSERT INTO courses
       (id, user_id, code, title, description, color, instructor, credits, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        user.id,
        body.code ?? null,
        body.title,
        body.description ?? null,
        body.color ?? courseColor(count?.count ?? 0),
        body.instructor ?? null,
        body.credits ?? null,
        now,
        now,
      ],
    );
    const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    return json({ course }, 201);
  });
}

export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = (await readJson(request)) as { id?: string; archived?: boolean };
    if (!body.id) throw new ApiError(400, "Course id is required.");
    const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
      body.id,
      user.id,
    ]);
    if (!course) throw new ApiError(404, "Course not found.");
    run("UPDATE courses SET archived = ?, updated_at = ? WHERE id = ?", [
      body.archived ? 1 : 0,
      nowIso(),
      body.id,
    ]);
    return json({ ok: true });
  });
}
