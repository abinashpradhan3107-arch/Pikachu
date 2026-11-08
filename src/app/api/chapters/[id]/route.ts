import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { chapterUpdateSchema } from "@/lib/validation";
import { nowIso } from "@/lib/utils";
import type { Chapter } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = chapterUpdateSchema.parse(await readJson(request));
    const chapter = queryOne<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!chapter) throw new ApiError(404, "Chapter not found.");

    run(
      `UPDATE chapters SET title = ?, unit = ?, status = ?, difficulty = ?, confidence = ?,
       estimated_minutes = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [
        body.title ?? chapter.title,
        body.unit !== undefined ? body.unit : chapter.unit,
        body.status ?? chapter.status,
        body.difficulty ?? chapter.difficulty,
        body.confidence ?? chapter.confidence,
        body.estimated_minutes ?? chapter.estimated_minutes,
        body.notes !== undefined ? body.notes : chapter.notes,
        nowIso(),
        id,
        user.id,
      ],
    );
    return json({
      chapter: queryOne<Chapter>("SELECT * FROM chapters WHERE id = ?", [id]),
    });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const chapter = queryOne<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!chapter) throw new ApiError(404, "Chapter not found.");
    run("DELETE FROM chapters WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
