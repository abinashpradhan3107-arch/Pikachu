import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson } from "@/lib/api";
import { noteCreateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Note, Quiz } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const notes = queryAll<Note>(
      "SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [user.id],
    );
    const quizzes = queryAll<Quiz>(
      "SELECT * FROM quizzes WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [user.id],
    );
    return json({ notes, quizzes });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = noteCreateSchema.parse(await readJson(request));
    const id = crypto.randomUUID();
    const now = nowIso();
    run(
      `INSERT INTO notes (id, user_id, course_id, chapter_id, title, content, kind, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        id,
        user.id,
        body.course_id ?? null,
        body.title,
        body.content,
        body.kind ?? "note",
        now,
        now,
      ],
    );
    return json({ note: queryOne<Note>("SELECT * FROM notes WHERE id = ?", [id]) }, 201);
  });
}
