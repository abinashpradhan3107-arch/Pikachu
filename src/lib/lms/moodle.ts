import { queryAll, queryOne, run } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { Course, LmsConnection } from "@/lib/types";
import { assertSafeRemoteUrl } from "@/lib/security";
import { courseColor, nowIso, stripHtml, truncate } from "@/lib/utils";

// LMS platform detection helpers
const MOODLE_PATTERNS = [
  /[?&]moodlews/,
  /\/webservice\//i,
  /moodle\.org/i,
  /powered by moodle/i,
  /moodle-lib/i,
  /moodle\//i,
];
const CANVAS_PATTERNS = [/canvas\.net/i, /learning\.management\.system/i, /data-canvas/i];
const BLACKBOARD_PATTERNS = [/blackboard/i, /bblearn/i, /webapps\/blackboard/i];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/** Simple fetch with error handling. */
async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Attempt to identify the LMS platform from the site root HTML/headers. */
export async function detectLMSPlatform(siteUrl: string): Promise<"moodle" | "custom" | "canvas" | "blackboard" | "unknown"> {
  const base = siteUrl.replace(/\/+$/, "");
  const clean = base.includes("://") ? base : `https://${base}`;

  // 1) Try oembed or a shallow GET to check headers/body shape
  let res: Response | null = null;
  try {
    res = await safeFetch(`${clean}/oembed?url=${encodeURIComponent(clean)}&format=json`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    // ignore
  }

  // 2) If oembed failed or returned nothing, try a plain GET of the site root
  if (!res) {
    try {
      const r = await safeFetch(clean, { method: "GET", headers: { "Accept": "text/html" } });
      if (r) res = r;
    } catch {
      // ignore
    }
  }

  if (!res || !res.body) return "unknown";

  const text = await res.text();
  const lower = text.toLowerCase();

  // 3) Moodle markers
  if (
    matchesAny(lower, [
      /[?&]moodlews/,
      /\/webservice\//i,
      /moodle\.org/i,
      /powered by moodle/i,
      /moodle-lib/i,
      /moodle\//i,
    ]) ||
    (res.headers.get("x-powered-by")?.includes("PHP") ?? false) ||
    lower.includes('name="logintoken"') ||
    lower.includes('action="/login/"') ||
    lower.includes('name="username"') ||
    lower.includes('name="password"')
  ) {
    return "moodle";
  }

  // 4) Canvas-ish markers
  if (matchesAny(lower, CANVAS_PATTERNS)) {
    return "canvas";
  }

  // 5) Blackboard-ish markers
  if (matchesAny(lower, BLACKBOARD_PATTERNS)) {
    return "blackboard";
  }

  // 6) Anything that looks like an LMS but we can't classify
  if (lower.includes("course") && (lower.includes("assignment") || lower.includes("syllabus"))) {
    return "custom";
  }

  return "unknown";
}

export type MoodleSiteInfo = {
  sitename?: string;
  username?: string;
  userid?: number;
  release?: string;
  functions?: { name: string }[];
};

type MoodleError = {
  exception?: string;
  errorcode?: string;
  message?: string;
};

function baseUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function appendParams(
  search: URLSearchParams,
  params: Record<string, unknown>,
  prefix = "",
) {
  for (const [key, value] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          appendParams(search, item as Record<string, unknown>, `${name}[${index}]`);
        } else {
          search.append(`${name}[${index}]`, String(item));
        }
      });
    } else if (typeof value === "object") {
      appendParams(search, value as Record<string, unknown>, name);
    } else {
      search.append(name, String(value));
    }
  }
}

export async function moodleCall<T>(
  siteUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const url = `${baseUrl(siteUrl)}/webservice/rest/server.php`;
  const search = new URLSearchParams();
  search.set("wstoken", token);
  search.set("wsfunction", wsfunction);
  search.set("moodlewsrestformat", "json");
  appendParams(search, params);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: search.toString(),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`Moodle returned HTTP ${response.status}. Check the LMS URL.`);
  }
  const payload = (await response.json()) as T & MoodleError;
  if (payload && typeof payload === "object" && (payload.exception || payload.errorcode)) {
    throw new Error(
      `Moodle error: ${payload.message ?? payload.errorcode ?? payload.exception}`,
    );
  }
  return payload;
}

export async function testMoodleConnection(
  siteUrl: string,
  token: string,
): Promise<MoodleSiteInfo> {
  await assertSafeRemoteUrl(siteUrl, { allowHttpLocalhost: true });
  const info = await moodleCall<MoodleSiteInfo>(siteUrl, token, "core_webservice_get_site_info");
  if (!info?.userid) {
    throw new Error("Moodle did not return a user. The token may be invalid.");
  }
  return info;
}

function moodleFileUrl(fileurl: string | undefined): string | null {
  if (!fileurl) return null;
  try {
    const url = new URL(fileurl);
    url.searchParams.delete("token");
    url.searchParams.delete("wstoken");
    return url.toString();
  } catch {
    return null;
  }
}

function isGenericSection(name: string | undefined): boolean {
  if (!name) return true;
  const normalized = name.toLowerCase().trim();
  return [
    "general",
    "general information",
    "announcements",
    "course information",
    "introduction",
  ].includes(normalized);
}

export type SyncResult = {
  courses: number;
  chaptersAdded: number;
  assignments: number;
  resources: number;
  announcements: number;
  events: number;
  warnings: string[];
  siteName: string;
};

export async function syncMoodle(userId: string): Promise<SyncResult> {
  const connection = queryOne<LmsConnection>(
    "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
    [userId],
  );
  if (!connection) throw new Error("Connect your LMS first.");
  const token = decryptSecret(connection.token_enc);
  if (!token) throw new Error("The saved LMS token could not be decrypted. Reconnect your LMS.");

  const info = await testMoodleConnection(connection.site_url, token);
  const siteName = info.sitename ?? connection.site_name ?? "Moodle";
  const warnings: string[] = [];
  const now = nowIso();

  const lmsCourses = await moodleCall<
    {
      id: number;
      shortname?: string;
      fullname?: string;
      summary?: string;
      progress?: number | null;
      visible?: number;
    }[]
  >(connection.site_url, token, "core_enrol_get_users_courses", {
    userid: info.userid,
  });

  let coursesTouched = 0;
  let chaptersAdded = 0;
  let resourcesTouched = 0;
  let assignmentsTouched = 0;
  let announcementsTouched = 0;
  let eventsTouched = 0;

  const localCourses: Course[] = [];

  for (const lmsCourse of lmsCourses) {
    if (!lmsCourse.id || lmsCourse.visible === 0) continue;
    const existing = queryOne<Course>(
      "SELECT * FROM courses WHERE user_id = ? AND lms_source = 'moodle' AND lms_course_id = ?",
      [userId, String(lmsCourse.id)],
    );
    let courseId = existing?.id;
    if (courseId) {
      run(
        `UPDATE courses SET title = ?, code = ?, description = ?, lms_url = ?,
         lms_progress = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        [
          lmsCourse.fullname ?? existing?.title ?? "LMS course",
          lmsCourse.shortname ?? existing?.code ?? null,
          stripHtml(lmsCourse.summary ?? ""),
          `${baseUrl(connection.site_url)}/course/view.php?id=${lmsCourse.id}`,
          lmsCourse.progress ?? existing?.lms_progress ?? null,
          now,
          courseId,
          userId,
        ],
      );
    } else {
      courseId = crypto.randomUUID();
      run(
        `INSERT INTO courses
         (id, user_id, code, title, description, color, lms_url, lms_course_id, lms_source,
          lms_progress, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'moodle', ?, 0, ?, ?)`,
        [
          courseId,
          userId,
          lmsCourse.shortname ?? null,
          lmsCourse.fullname ?? "LMS course",
          stripHtml(lmsCourse.summary ?? ""),
          courseColor(localCourses.length + 1),
          `${baseUrl(connection.site_url)}/course/view.php?id=${lmsCourse.id}`,
          String(lmsCourse.id),
          lmsCourse.progress ?? null,
          now,
          now,
        ],
      );
    }
    const courseRow = queryOne<Course>("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (courseRow) localCourses.push(courseRow);
    coursesTouched += 1;

    // Course structure, files and links.
    try {
      const sections = await moodleCall<
        {
          id: number;
          name?: string;
          summary?: string;
          modules?: {
            id: number;
            name?: string;
            modname?: string;
            description?: string;
            url?: string;
            contents?: {
              type?: string;
              filename?: string;
              fileurl?: string;
              filesize?: number;
              mimetype?: string;
            }[];
          }[];
        }[]
      >(connection.site_url, token, "core_course_get_contents", {
        courseid: lmsCourse.id,
      });

      const chapterCount = queryOne<{ count: number }>(
        "SELECT COUNT(*) AS count FROM chapters WHERE course_id = ? AND user_id = ?",
        [courseId, userId],
      );
      const canAddChapters = (chapterCount?.count ?? 0) === 0;

      for (const section of sections) {
        if (canAddChapters && !isGenericSection(section.name)) {
          run(
            `INSERT INTO chapters
             (id, user_id, course_id, title, unit, status, difficulty, confidence,
              estimated_minutes, notes, order_index, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'not_started', 'medium', 3, 60, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              userId,
              courseId,
              truncate(section.name ?? "Untitled section", 160),
              section.name ?? null,
              "Imported from LMS course structure.",
              section.id ?? 0,
              now,
              now,
            ],
          );
          chaptersAdded += 1;
        }

        for (const mod of section.modules ?? []) {
          const file = mod.contents?.find((content) => content.fileurl);
          const external = mod.contents?.find((content) => content.type === "url");
          const rawUrl = file ? moodleFileUrl(file.fileurl) : mod.url ?? null;
          if (!mod.name) continue;
          const kind =
            mod.modname === "resource" || file?.mimetype?.includes("pdf")
              ? "pdf"
              : mod.modname === "url"
                ? "link"
                : mod.modname === "quiz"
                  ? "quiz"
                  : mod.modname === "assign"
                    ? "assignment"
                    : "material";
          const existingResource = queryOne<{ id: string }>(
            "SELECT id FROM resources WHERE user_id = ? AND lms_module_id = ?",
            [userId, `module:${mod.id}`],
          );
          if (existingResource) {
            run(
              "UPDATE resources SET title = ?, url = ?, description = ?, updated_at = ? WHERE id = ?",
              [
                mod.name,
                rawUrl,
                stripHtml(mod.description ?? ""),
                now,
                existingResource.id,
              ],
            );
          } else {
            run(
              `INSERT INTO resources
               (id, user_id, course_id, title, kind, url, content, source, verified,
                duration_minutes, channel, description, lms_module_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NULL, 'moodle', 1, NULL, NULL, ?, ?, ?, ?)`,
              [
                crypto.randomUUID(),
                userId,
                courseId,
                truncate(mod.name, 240),
                kind,
                rawUrl ?? external?.fileurl ?? null,
                stripHtml(mod.description ?? ""),
                `module:${mod.id}`,
                now,
                now,
              ],
            );
          }
          resourcesTouched += 1;
        }
      }
    } catch (error) {
      warnings.push(
        `Could not read materials for ${lmsCourse.fullname ?? "a course"}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    // Completion percentage where the course tracks completion.
    try {
      const completion = await moodleCall<{
        completionstatus?: {
          completed?: boolean;
          completions?: { complete?: boolean }[];
        };
      }>(connection.site_url, token, "core_completion_get_course_completion_status", {
        courseid: lmsCourse.id,
        userid: info.userid,
      });
      const completions = completion.completionstatus?.completions ?? [];
      if (completions.length) {
        const complete = completions.filter((item) => item.complete).length;
        run("UPDATE courses SET lms_progress = ?, updated_at = ? WHERE id = ?", [
          Math.round((complete / completions.length) * 100),
          now,
          courseId,
        ]);
      }
    } catch {
      // Completion tracking is optional.
    }
  }

  // Assignments.
  try {
    const courseIds = localCourses
      .map((course) => course.lms_course_id)
      .filter((id): id is string => Boolean(id));
    if (courseIds.length) {
      const assignmentPayload = await moodleCall<{
        courses?: {
          id: number;
          assignments?: {
            id: number;
            name?: string;
            intro?: string;
            duedate?: number;
            allowsubmissionsfromdate?: number;
            cmid?: number;
          }[];
        }[];
      }>(connection.site_url, token, "mod_assign_get_assignments", {
        courseids: courseIds.map((id) => Number(id)),
      });
      for (const course of assignmentPayload.courses ?? []) {
        const localCourse = localCourses.find(
          (item) => item.lms_course_id === String(course.id),
        );
        for (const assignment of course.assignments ?? []) {
          const lmsId = `assign:${assignment.id}`;
          const dueAt = assignment.duedate
            ? new Date(assignment.duedate * 1000).toISOString()
            : null;
          const sourceUrl =
            assignment.cmid && localCourse
              ? `${baseUrl(connection.site_url)}/mod/assign/view.php?id=${assignment.cmid}`
              : null;
          const existing = queryOne<{ id: string; status: string }>(
            "SELECT id, status FROM assignments WHERE user_id = ? AND lms_id = ?",
            [userId, lmsId],
          );
          if (existing) {
            run(
              `UPDATE assignments SET title = ?, description = ?, due_at = ?, source_url = ?, updated_at = ?
               WHERE id = ?`,
              [
                assignment.name ?? "LMS assignment",
                stripHtml(assignment.intro ?? ""),
                dueAt,
                sourceUrl,
                now,
                existing.id,
              ],
            );
          } else {
            run(
              `INSERT INTO assignments
               (id, user_id, course_id, title, description, due_at, status, source, source_url,
                lms_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', 'moodle', ?, ?, ?, ?)`,
              [
                crypto.randomUUID(),
                userId,
                localCourse?.id ?? null,
                assignment.name ?? "LMS assignment",
                stripHtml(assignment.intro ?? ""),
                dueAt,
                sourceUrl,
                lmsId,
                now,
                now,
              ],
            );
          }
          assignmentsTouched += 1;
        }
      }
    }
  } catch (error) {
    warnings.push(
      `Assignments could not be synced: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  // Calendar events (Moodle's upcoming events feed).
  try {
    const calendar = await moodleCall<{
      events?: {
        id: number;
        name?: string;
        description?: string;
        timestart?: number;
        timeduration?: number;
        courseid?: number;
        url?: string;
        eventtype?: string;
      }[];
    }>(connection.site_url, token, "core_calendar_get_calendar_upcoming_view", {});
    for (const event of calendar.events ?? []) {
      if (!event.id || !event.timestart) continue;
      const localCourse = localCourses.find(
        (course) => course.lms_course_id === String(event.courseid),
      );
      const lmsId = `event:${event.id}`;
      const startAt = new Date(event.timestart * 1000).toISOString();
      const endAt = event.timeduration
        ? new Date((event.timestart + event.timeduration) * 1000).toISOString()
        : null;
      const existing = queryOne<{ id: string }>(
        "SELECT id FROM events WHERE user_id = ? AND lms_id = ?",
        [userId, lmsId],
      );
      if (existing) {
        run(
          "UPDATE events SET title = ?, start_at = ?, end_at = ?, url = ? WHERE id = ?",
          [event.name ?? "LMS event", startAt, endAt, event.url ?? null, existing.id],
        );
      } else {
        run(
          `INSERT INTO events
           (id, user_id, course_id, title, type, start_at, end_at, url, source, lms_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'moodle', ?, ?)`,
          [
            crypto.randomUUID(),
            userId,
            localCourse?.id ?? null,
            event.name ?? "LMS event",
            event.eventtype ?? "event",
            startAt,
            endAt,
            event.url ?? null,
            lmsId,
            now,
          ],
        );
      }
      eventsTouched += 1;
    }
  } catch (error) {
    warnings.push(
      `Calendar events could not be synced: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  // Announcements / news forums, where the token has permission.
  try {
    const courseIds = localCourses
      .map((course) => course.lms_course_id)
      .filter((id): id is string => Boolean(id));
    if (courseIds.length) {
      const forums = await moodleCall<
        {
          id: number;
          course: number;
          name?: string;
          type?: string;
        }[]
      >(connection.site_url, token, "mod_forum_get_forums_by_courses", {
        courseids: courseIds.map((id) => Number(id)),
      });
      const announcementForums = forums
        .filter(
          (forum) =>
            forum.type === "news" ||
            /announcement|news/i.test(forum.name ?? ""),
        )
        .slice(0, 8);
      for (const forum of announcementForums) {
        try {
          const discussions = await moodleCall<{
            discussions?: {
              id: number;
              name?: string;
              message?: string;
              created?: number;
            }[];
          }>(connection.site_url, token, "mod_forum_get_forum_discussions", {
            forumid: forum.id,
          });
          const localCourse = localCourses.find(
            (course) => course.lms_course_id === String(forum.course),
          );
          for (const discussion of discussions.discussions ?? []) {
            const lmsId = `forum:${discussion.id}`;
            const existing = queryOne<{ id: string }>(
              "SELECT id FROM announcements WHERE user_id = ? AND lms_id = ?",
              [userId, lmsId],
            );
            const published = discussion.created
              ? new Date(discussion.created * 1000).toISOString()
              : null;
            if (!existing) {
              run(
                `INSERT INTO announcements
                 (id, user_id, course_id, title, content, url, published_at, source, lms_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'moodle', ?, ?)`,
                [
                  crypto.randomUUID(),
                  userId,
                  localCourse?.id ?? null,
                  discussion.name ?? "Announcement",
                  stripHtml(discussion.message ?? ""),
                  `${baseUrl(connection.site_url)}/mod/forum/discuss.php?d=${discussion.id}`,
                  published,
                  lmsId,
                  now,
                ],
              );
            }
            announcementsTouched += 1;
          }
        } catch {
          // The token may not have forum permissions.
        }
      }
    }
  } catch (error) {
    warnings.push(
      `Announcements could not be synced: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  run(
    `UPDATE lms_connections
     SET status = 'connected', last_sync_at = ?, last_error = NULL, site_name = ?, lms_username = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [now, siteName, info.username ?? null, now, connection.id, userId],
  );

  return {
    courses: coursesTouched,
    chaptersAdded,
    assignments: assignmentsTouched,
    resources: resourcesTouched,
    announcements: announcementsTouched,
    events: eventsTouched,
    warnings,
    siteName,
  };
}

export function getMoodleFileUrl(
  userId: string,
  resourceId: string,
): { url: string; title: string } | null {
  const resource = queryOne<{
    title: string;
    url: string | null;
    source: string;
  }>("SELECT title, url, source FROM resources WHERE id = ? AND user_id = ?", [
    resourceId,
    userId,
  ]);
  if (!resource?.url || resource.source !== "moodle") return null;
  const connection = queryOne<LmsConnection>(
    "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
    [userId],
  );
  if (!connection) return null;
  const token = decryptSecret(connection.token_enc);
  if (!token) return null;
  try {
    const fileUrl = new URL(resource.url);
    const site = new URL(connection.site_url);
    if (fileUrl.hostname !== site.hostname) return null;
    fileUrl.searchParams.set("token", token);
    return { url: fileUrl.toString(), title: resource.title };
  } catch {
    return null;
  }
}

export function getLmsOverview(userId: string) {
  const connection = queryOne<LmsConnection>(
    "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
    [userId],
  );
  const courses = queryAll<Course>(
    "SELECT * FROM courses WHERE user_id = ? AND lms_source = 'moodle' ORDER BY title ASC",
    [userId],
  );
  const resources = queryAll<{
    id: string;
    title: string;
    kind: string;
    url: string | null;
    course_id: string | null;
    description: string | null;
    source: string;
  }>(
    `SELECT id, title, kind, url, course_id, description, source FROM resources
     WHERE user_id = ? AND source = 'moodle' ORDER BY created_at DESC LIMIT 80`,
    [userId],
  );
  const announcements = queryAll<{
    id: string;
    title: string;
    content: string | null;
    url: string | null;
    course_id: string | null;
    published_at: string | null;
  }>(
    `SELECT id, title, content, url, course_id, published_at FROM announcements
     WHERE user_id = ? AND source = 'moodle' ORDER BY COALESCE(published_at, created_at) DESC LIMIT 20`,
    [userId],
  );
  return {
    connection: connection
      ? {
          id: connection.id,
          siteUrl: connection.site_url,
          siteName: connection.site_name,
          username: connection.lms_username,
          status: connection.status,
          lastSyncAt: connection.last_sync_at,
          lastError: connection.last_error,
        }
      : null,
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      code: course.code,
      lmsUrl: course.lms_url,
      lmsCourseId: course.lms_course_id,
      progress: course.lms_progress,
    })),
    resources,
    announcements,
  };
}
