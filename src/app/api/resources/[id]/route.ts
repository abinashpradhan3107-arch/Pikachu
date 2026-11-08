import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import type { Resource } from "@/lib/types";

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
