import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import type { VideoRecommendation } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const allowed = ["new", "saved", "watched", "dismissed"];
    if (!body.status || !allowed.includes(body.status)) {
      throw new ApiError(400, "Choose a valid status.");
    }
    const row = queryOne<VideoRecommendation>(
      "SELECT * FROM video_recommendations WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!row) throw new ApiError(404, "Recommendation not found.");
    run("UPDATE video_recommendations SET status = ? WHERE id = ? AND user_id = ?", [
      body.status,
      id,
      user.id,
    ]);
    return json({ ok: true });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const row = queryOne<VideoRecommendation>(
      "SELECT * FROM video_recommendations WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!row) throw new ApiError(404, "Recommendation not found.");
    run("DELETE FROM video_recommendations WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
