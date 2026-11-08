import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { noteUpdateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Note } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = noteUpdateSchema.parse(await readJson(request));
    const note = queryOne<Note>("SELECT * FROM notes WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!note) throw new ApiError(404, "Note not found.");
    run("UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?", [
      body.title ?? note.title,
      body.content ?? note.content,
      nowIso(),
      id,
    ]);
    return json({ note: queryOne<Note>("SELECT * FROM notes WHERE id = ?", [id]) });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const note = queryOne<Note>("SELECT * FROM notes WHERE id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    if (!note) throw new ApiError(404, "Note not found.");
    run("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
