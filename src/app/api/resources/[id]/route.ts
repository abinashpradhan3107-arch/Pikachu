import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { nowIso } from "@/lib/utils";
import { z } from "zod";
import type { Resource } from "@/lib/types";

const watchedUpdateSchema = z.object({
  // Marks a synced lecture as watched. Un-toggling clears the flag (NULL);
  // the row itself is never deleted.
  watched: z.boolean(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const resource = queryOne<Resource>(
      "SELECT * FROM resources WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!resource) throw new ApiError(404, "Material not found.");
    return json({ resource });
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = await readJson(request);
    const parsed = watchedUpdateSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, "Invalid request data.");

    const resource = queryOne<Resource>(
      "SELECT id, source FROM resources WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!resource) throw new ApiError(404, "Material not found.");

    run(
      "UPDATE resources SET watched_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [parsed.data.watched ? nowIso() : null, nowIso(), id, user.id],
    );
    const updated = queryOne<Resource>(
      "SELECT * FROM resources WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    return json({ resource: updated });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const resource = queryOne<Resource>(
      "SELECT * FROM resources WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!resource) throw new ApiError(404, "Material not found.");
    run("DELETE FROM resources WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
