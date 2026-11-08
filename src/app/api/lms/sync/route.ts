import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError, rateLimit } from "@/lib/api";
import { syncMoodle } from "@/lib/lms/moodle";
import { nowIso } from "@/lib/utils";
import type { LmsConnection } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    rateLimit(`lms-sync:${user.id}`, 4, 60_000);
    const connection = queryOne<LmsConnection>(
      "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
      [user.id],
    );
    if (!connection) throw new ApiError(400, "Connect your LMS first.");

    try {
      const result = await syncMoodle(user.id);
      return json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "LMS sync failed.";
      run(
        "UPDATE lms_connections SET status = 'error', last_error = ?, updated_at = ? WHERE user_id = ? AND provider = 'moodle'",
        [message, nowIso(), user.id],
      );
      throw new ApiError(502, message);
    }
  });
}
