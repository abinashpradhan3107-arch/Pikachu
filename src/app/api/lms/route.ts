import { queryAll, queryOne } from "@/lib/db";
import { requireApiUser, handleRoute, json } from "@/lib/api";
import type {
  Announcement,
  CalendarEvent,
  LmsConnection,
  Resource,
} from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const connection = queryOne<LmsConnection>(
      "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
      [user.id],
    );

    const counts = queryOne<{
      courses: number;
      assignments: number;
      resources: number;
      announcements: number;
      events: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM courses WHERE user_id = ? AND lms_course_id IS NOT NULL) AS courses,
        (SELECT COUNT(*) FROM assignments WHERE user_id = ? AND source = 'moodle') AS assignments,
        (SELECT COUNT(*) FROM resources WHERE user_id = ? AND source = 'moodle') AS resources,
        (SELECT COUNT(*) FROM announcements WHERE user_id = ? AND source = 'moodle') AS announcements,
        (SELECT COUNT(*) FROM events WHERE user_id = ? AND source = 'moodle') AS events`,
      [user.id, user.id, user.id, user.id, user.id],
    );

    const announcements = queryAll<Announcement>(
      "SELECT * FROM announcements WHERE user_id = ? ORDER BY COALESCE(published_at, created_at) DESC LIMIT 12",
      [user.id],
    );
    const events = queryAll<CalendarEvent>(
      "SELECT * FROM events WHERE user_id = ? ORDER BY start_at ASC LIMIT 24",
      [user.id],
    );
    const materials = queryAll<Resource>(
      `SELECT id, user_id, course_id, title, kind, url, source, verified, duration_minutes,
         channel, description, lms_module_id, created_at, updated_at, NULL AS content
       FROM resources WHERE user_id = ? AND source = 'moodle'
       ORDER BY created_at DESC LIMIT 40`,
      [user.id],
    );

    return json({
      connected: Boolean(connection),
      connection: connection
        ? {
            status: connection.status,
            siteUrl: connection.site_url,
            siteName: connection.site_name,
            username: connection.lms_username,
            lastSyncAt: connection.last_sync_at,
            lastError: connection.last_error,
          }
        : null,
      counts: counts ?? {
        courses: 0,
        assignments: 0,
        resources: 0,
        announcements: 0,
        events: 0,
      },
      announcements,
      events,
      materials,
    });
  });
}
