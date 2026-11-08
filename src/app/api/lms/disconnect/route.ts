import { run } from "@/lib/db";
import { requireApiUser, handleRoute, json } from "@/lib/api";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    run("DELETE FROM lms_connections WHERE user_id = ? AND provider = 'moodle'", [
      user.id,
    ]);
    return json({
      ok: true,
      message:
        "LMS disconnected. Previously imported courses and materials were kept so you do not lose your notes.",
    });
  });
}
