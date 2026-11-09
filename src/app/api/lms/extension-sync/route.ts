import { requireApiUser, handleRoute, json, readJson, ApiError } from '@/lib/api';
import { run, queryOne, queryAll } from '@/lib/db';
import { nowIso } from '@/lib/utils';
import { z } from 'zod';

// ============================================================
// BUG 4 FIX: Authentication and Zod validation
// ============================================================

const extensionCourseDataSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string().optional(),
  chapters: z.array(z.object({
    id: z.string(),
    title: z.string(),
    order: z.number().optional(),
  })).optional(),
  lectures: z.array(z.object({
    id: z.string(),
    title: z.string(),
    chapterId: z.string().optional(),
    duration: z.string().optional(),
    url: z.string().optional(),
    // Automated watched state observed by the extension: a completion
    // indicator on the lecture card, or video playback past 85%.
    completed: z.boolean().optional(),
    watched: z.boolean().optional(),
    // Note/slide/PDF links found next to the lecture card on the LMS page.
    notes: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })).optional(),
  })).optional(),
  assignments: z.array(z.object({
    id: z.string(),
    title: z.string(),
    dueDate: z.string().optional(),
    status: z.string().optional(),
  })).optional(),
  announcements: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string().optional(),
  })).optional(),
});

interface ExtensionCourseData {
  courseId: string;
  courseTitle?: string;
  chapters?: Array<{ id: string; title: string; order?: number }>;
  lectures?: Array<{
    id: string;
    title: string;
    chapterId?: string;
    duration?: string;
    url?: string;
    completed?: boolean;
    watched?: boolean;
    notes?: Array<{ title: string; url: string }>;
  }>;
  assignments?: Array<{ id: string; title: string; dueDate?: string; status?: string }>;
  announcements?: Array<{ id: string; title: string; content?: string }>;
}

/**
 * Parse an LMS due date into an ISO timestamp.
 * The LMS renders values like "1 Nov, 11:45 AM - 12:20 PM (IST)", which
 * `new Date()` cannot parse. Returning null is honest; guessing a year would
 * invent a deadline that may be wrong.
 */
function parseDueAt(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Map an LMS assignment status onto the app's pending|completed|missed. */
function mapAssignmentStatus(value?: string): string {
  const normalised = (value || '').trim().toLowerCase();
  if (normalised === 'complete' || normalised === 'completed' || normalised === 'submitted') {
    return 'completed';
  }
  if (normalised === 'missed' || normalised === 'overdue') {
    return 'missed';
  }
  return 'pending';
}

/**
 * Parse a duration shown next to an LMS lecture ("1h 20m", "45 min", "1:20:00")
 * into whole minutes. Returns null when nothing unambiguous is present - a
 * missing duration is honest, a guessed one is not.
 */
function parseDurationMinutes(value?: string): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = clock[3] ? Number(clock[3]) : 0;
    const total = hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
    return total > 0 ? total : null;
  }
  const hours = /(\d+)\s*(?:h|hr|hrs|hour|hours)\b/.exec(text);
  const minutes = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/.exec(text);
  if (!hours && !minutes) return null;
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}

/**
 * Deterministic id for a note/slide link attached to a lecture, so the same
 * link can never become two rows on a later sync.
 */
function stableLinkId(lectureId: string, url: string): string {
  const input = `${lectureId}|${url}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `lms-note-${(hash >>> 0).toString(36)}`;
}

/** Row count helper - returns 0 instead of throwing when the query fails. */
function countRows(sql: string, params: unknown[]): number {
  try {
    const row = queryOne<{ n: number }>(sql, params);
    return row ? Number(row.n) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    // Authenticated via the Cortex session cookie. Extension-origin requests
    // are allowed for this endpoint only - see assertSameOrigin in lib/api.ts.
    const { user } = await requireApiUser(request, { allowExtensionOrigin: true });

    // The extension posts { courseData, timestamp } (background.js). Accept
    // that wrapped shape as well as a flat payload.
    const raw = await readJson<Record<string, unknown>>(request);
    const unwrapped =
      raw && typeof raw === 'object' && raw.courseData && typeof raw.courseData === 'object'
        ? (raw.courseData as Record<string, unknown>)
        : raw;
    const result = extensionCourseDataSchema.safeParse(unwrapped);

    if (!result.success) {
      throw new ApiError(400, 'Invalid request data', result.error.format());
    }

    const courseData = result.data as ExtensionCourseData;
    const authenticatedUserId = user.id;
    const now = nowIso();

    // ============================================================
    // BUG 3 FIX: Parent course (created if missing)
    //
    // SQLite has no NOW() function, so every timestamp below is bound as a
    // parameter using nowIso(), matching the convention used by the rest of
    // the app (e.g. src/app/api/courses/route.ts).
    // ============================================================

    const existingCourse = await queryOne(
      'SELECT id FROM courses WHERE id = ? AND user_id = ?',
      [courseData.courseId, authenticatedUserId]
    );

    if (!existingCourse) {
      await run(
        `INSERT INTO courses
           (id, user_id, code, title, description, color, lms_url, lms_course_id, lms_source, lms_progress, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          courseData.courseId,
          authenticatedUserId,
          courseData.courseTitle || null,
          courseData.courseTitle || 'Unknown Course',
          null,
          '#',
          '',
          courseData.courseId,
          'iitj-learn',
          0,
          0,
          now,
          now,
        ]
      );
    }

    // ============================================================
    // Chapters (week groups derived from lecture titles by the extension)
    // ============================================================

    for (const chapter of courseData.chapters || []) {
      await run(
        `INSERT INTO chapters
           (id, user_id, course_id, title, unit, status, difficulty, confidence, estimated_minutes, notes, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'not_started', 'medium', 3, 60, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = EXCLUDED.title,
           order_index = EXCLUDED.order_index,
           updated_at = EXCLUDED.updated_at`,
        [
          chapter.id,
          authenticatedUserId,
          courseData.courseId,
          chapter.title,
          null,
          JSON.stringify({ syncedAt: now, source: 'lms-extension' }),
          chapter.order || 0,
          now,
          now,
        ]
      );
    }

    // ============================================================
    // Lectures -> resources (duplicate prevention by id + user + course)
    // ============================================================

    // Lectures this sync marked watched for the first time - used below to
    // auto-complete the study tasks that were scheduled from them.
    const watchedLectures: Array<{ title: string; url: string | null; chapterId: string | null }> = [];

    for (const lecture of courseData.lectures || []) {
      const existingLecture = await queryOne<{
        url: string | null;
        duration_minutes: number | null;
        watched_at: string | null;
      }>(
        `SELECT url, duration_minutes, watched_at FROM resources
         WHERE id = ? AND user_id = ? AND course_id = ? AND kind = 'lecture'`,
        [lecture.id, authenticatedUserId, courseData.courseId]
      );
      const lectureUrl = lecture.url || null;
      const lectureMinutes = parseDurationMinutes(lecture.duration);
      // Automated "Mark as Watched": the extension only sends completed=true
      // when it observed a completion indicator or the video passed 85%.
      const completed = lecture.completed === true || lecture.watched === true;
      // Set only when completed AND not already watched: an existing
      // watched_at is never overwritten, so a later sync (or completed:false)
      // can never un-watch a lecture.
      const watchedAt = completed && !existingLecture?.watched_at ? now : null;

      if (!existingLecture) {
        await run(
          `INSERT INTO resources
             (id, user_id, course_id, title, kind, url, source, verified, duration_minutes, lms_module_id, watched_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'lecture', ?, 'lms', 1, ?, ?, ?, ?, ?)`,
          [
            lecture.id,
            authenticatedUserId,
            courseData.courseId,
            lecture.title,
            lectureUrl,
            lectureMinutes,
            lecture.chapterId || null,
            watchedAt,
            now,
            now,
          ]
        );
      } else {
        // Additive repair only: the first syncs ran before the extension could
        // read the lecture link or length. Existing values are never cleared
        // and no row is ever deleted.
        if (lectureUrl && !existingLecture.url) {
          await run(
            'UPDATE resources SET url = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [lectureUrl, now, lecture.id, authenticatedUserId]
          );
        }
        if (lectureMinutes && !existingLecture.duration_minutes) {
          await run(
            'UPDATE resources SET duration_minutes = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [lectureMinutes, now, lecture.id, authenticatedUserId]
          );
        }
        // First time seen as completed: stamp watched_at. The WHERE guard
        // makes this a no-op if a manual toggle already set it.
        if (watchedAt) {
          await run(
            `UPDATE resources SET watched_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND watched_at IS NULL`,
            [now, now, lecture.id, authenticatedUserId]
          );
        }
      }

      if (watchedAt) {
        watchedLectures.push({
          title: lecture.title,
          url: lectureUrl,
          chapterId: lecture.chapterId || null,
        });
      }

      // Notes, slides and PDFs linked from the same lecture card.
      for (const note of lecture.notes || []) {
        if (!note.url) continue;
        const noteId = stableLinkId(lecture.id, note.url);
        const existingNote = await queryOne(
          `SELECT id FROM resources WHERE id = ? AND user_id = ? AND kind = 'note'`,
          [noteId, authenticatedUserId]
        );
        if (existingNote) continue;
        await run(
          `INSERT INTO resources
             (id, user_id, course_id, title, kind, url, content, source, verified, duration_minutes, lms_module_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'note', ?, NULL, 'lms', 0, NULL, ?, ?, ?)`,
          [
            noteId,
            authenticatedUserId,
            courseData.courseId,
            note.title || 'Lecture note',
            note.url,
            lecture.chapterId || null,
            now,
            now,
          ]
        );
      }
    }

    // ============================================================
    // Automated "Mark as Watched" -> related study tasks
    //
    // Only tasks the planner created FROM a lecture (task_type 'study') are
    // touched, and only while they are still pending. Practice, revision and
    // assignment tasks are never completed by this path.
    // ============================================================

    for (const watched of watchedLectures) {
      // Exact link match: tasks planned from this lecture carry its URL.
      if (watched.url) {
        await run(
          `UPDATE study_tasks SET status = 'completed', completed_at = ?, updated_at = ?
           WHERE user_id = ? AND status = 'pending' AND task_type = 'study' AND resource_url = ?`,
          [now, now, authenticatedUserId, watched.url]
        );
      }
      // Tasks planned before the extension could capture lecture links carry
      // the lecture title instead of a URL - matched exactly, within the course.
      await run(
        `UPDATE study_tasks SET status = 'completed', completed_at = ?, updated_at = ?
         WHERE user_id = ? AND status = 'pending' AND task_type = 'study' AND resource_title = ?
           AND (resource_url IS NULL OR resource_url = '') AND course_id = ?`,
        [now, now, authenticatedUserId, watched.title, courseData.courseId]
      );
    }

    // A chapter's tasks are only auto-completed once EVERY lecture in that
    // chapter is watched - watching one lecture never completes the chapter.
    if (watchedLectures.length > 0) {
      const fullyWatchedChapters = queryAll<{ id: string }>(
        `SELECT lms_module_id AS id FROM resources
          WHERE user_id = ? AND course_id = ? AND kind = 'lecture' AND lms_module_id IS NOT NULL
          GROUP BY lms_module_id
         HAVING COUNT(*) > 0 AND SUM(CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END) = COUNT(*)`,
        [authenticatedUserId, courseData.courseId],
      );
      for (const chapter of fullyWatchedChapters) {
        await run(
          `UPDATE study_tasks SET status = 'completed', completed_at = ?, updated_at = ?
           WHERE user_id = ? AND status = 'pending' AND task_type = 'study' AND chapter_id = ?`,
          [now, now, authenticatedUserId, chapter.id]
        );
      }
    }

    // ============================================================
    // Assignments (duplicate prevention by lms_id + user)
    // ============================================================

    for (const assignment of courseData.assignments || []) {
      const existingAssignment = await queryOne(
        `SELECT id FROM assignments WHERE lms_id = ? AND user_id = ?`,
        [assignment.id, authenticatedUserId]
      );

      if (!existingAssignment) {
        await run(
          `INSERT INTO assignments
             (id, user_id, course_id, title, description, due_at, status, source, source_url, lms_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'lms', NULL, ?, ?, ?)`,
          [
            assignment.id,
            authenticatedUserId,
            courseData.courseId,
            assignment.title,
            assignment.title,
            parseDueAt(assignment.dueDate),
            mapAssignmentStatus(assignment.status),
            assignment.id,
            now,
            now,
          ]
        );
      }
      // else: duplicate - skip
    }

    // ============================================================
    // Announcements (duplicate prevention by lms_id + user)
    // ============================================================

    for (const announcement of courseData.announcements || []) {
      const existingAnnouncement = await queryOne(
        `SELECT id FROM announcements WHERE lms_id = ? AND user_id = ?`,
        [announcement.id, authenticatedUserId]
      );

      if (!existingAnnouncement) {
        await run(
          `INSERT INTO announcements
             (id, user_id, course_id, title, content, url, published_at, source, lms_id, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, 'lms', ?, ?)`,
          [
            announcement.id,
            authenticatedUserId,
            courseData.courseId,
            announcement.title,
            announcement.content || null,
            announcement.id,
            now,
          ]
        );
      }
      // else: duplicate - skip
    }

    // ============================================================
    // Real counts read back from SQLite (the response previously reported a
    // hardcoded coursesSynced: 1 and no chapter/lecture/assignment totals).
    // ============================================================

    const counts = {
      courses: countRows(
        'SELECT COUNT(*) AS n FROM courses WHERE user_id = ? AND id = ?',
        [authenticatedUserId, courseData.courseId]
      ),
      chapters: countRows(
        'SELECT COUNT(*) AS n FROM chapters WHERE user_id = ? AND course_id = ?',
        [authenticatedUserId, courseData.courseId]
      ),
      lectures: countRows(
        `SELECT COUNT(*) AS n FROM resources WHERE user_id = ? AND course_id = ? AND kind = 'lecture'`,
        [authenticatedUserId, courseData.courseId]
      ),
      watched: countRows(
        `SELECT COUNT(*) AS n FROM resources WHERE user_id = ? AND course_id = ? AND kind = 'lecture' AND watched_at IS NOT NULL`,
        [authenticatedUserId, courseData.courseId]
      ),
      watchedNow: watchedLectures.length,
      assignments: countRows(
        'SELECT COUNT(*) AS n FROM assignments WHERE user_id = ? AND course_id = ?',
        [authenticatedUserId, courseData.courseId]
      ),
      notes: countRows(
        `SELECT COUNT(*) AS n FROM resources WHERE user_id = ? AND course_id = ? AND kind = 'note'`,
        [authenticatedUserId, courseData.courseId]
      ),
    };

    return json({
      success: true,
      syncedAt: now,
      coursesSynced: 1,
      userId: authenticatedUserId,
      counts,
    });
  });
}
