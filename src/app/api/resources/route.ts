import { queryAll } from "@/lib/db";
import { requireApiUser, handleRoute, json } from "@/lib/api";
import type { Resource } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");
    const resources = courseId
      ? queryAll<Resource>(
          `SELECT id, user_id, course_id, title, kind, url, source, verified, duration_minutes,
             channel, description, lms_module_id, created_at, updated_at,
             substr(COALESCE(content, ''), 1, 240) AS content
           FROM resources WHERE user_id = ? AND course_id = ?
           ORDER BY created_at DESC LIMIT 200`,
          [user.id, courseId],
        )
      : queryAll<Resource>(
          `SELECT id, user_id, course_id, title, kind, url, source, verified, duration_minutes,
             channel, description, lms_module_id, created_at, updated_at,
             substr(COALESCE(content, ''), 1, 240) AS content
           FROM resources WHERE user_id = ?
           ORDER BY created_at DESC LIMIT 200`,
          [user.id],
        );
    return json({ resources });
  });
}
