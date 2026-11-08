import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { assignmentUpdateSchema } from "@/lib/validation";
import { normalizeDueAt, nowIso } from "@/lib/utils";
import type { Assignment } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const body = assignmentUpdateSchema.parse(await readJson(request));
    const assignment = queryOne<Assignment>(
      "SELECT * FROM assignments WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!assignment) throw new ApiError(404, "Assignment not found.");

    run(
      `UPDATE assignments SET course_id = ?, title = ?, description = ?, due_at = ?,
       status = ?, source_url = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [
        body.course_id !== undefined ? body.course_id : assignment.course_id,
        body.title ?? assignment.title,
        body.description !== undefined ? body.description : assignment.description,
        body.due_at !== undefined ? normalizeDueAt(body.due_at) : assignment.due_at,
        body.status ?? assignment.status,
        body.source_url !== undefined ? body.source_url || null : assignment.source_url,
        nowIso(),
        id,
        user.id,
      ],
    );
    return json({
      assignment: queryOne<Assignment>("SELECT * FROM assignments WHERE id = ?", [id]),
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
    const assignment = queryOne<Assignment>(
      "SELECT * FROM assignments WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!assignment) throw new ApiError(404, "Assignment not found.");
    run("DELETE FROM assignments WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}
