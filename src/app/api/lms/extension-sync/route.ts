import { run } from '@/lib/db';
import { nowIso } from '@/lib/utils';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { courseData, timestamp } = body;

    if (!courseData?.courseId) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing course data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const courseId = courseData.courseId;
    const now = nowIso();

    // Store chapters
    for (const chapter of courseData.chapters) {
      await run(
        `INSERT INTO chapters (id, user_id, course_id, title, unit, status, difficulty, confidence, estimated_minutes, notes, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'not_started', 'medium', 3, 60, ?, ?, NOW(), NOW())
         ON CONFLICT(id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()`,
        [chapter.id, '', courseId, chapter.title, chapter.order, JSON.stringify({ syncedAt: timestamp })]
      );
    }

    // Store lectures as resources
    for (const lecture of courseData.lectures) {
      await run(
        `INSERT INTO resources (id, user_id, course_id, title, kind, url, source, verified, duration_minutes, lms_module_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'lecture', ?, NULL, 1, NULL, ?, NOW(), NOW())`,
        [lecture.id, '', courseId, lecture.title, lecture.url, lecture.chapterId, lecture.duration]
      );
    }

    // Store assignments
    for (const assignment of courseData.assignments) {
      const dueAt = assignment.dueDate ? new Date(assignment.dueDate).toISOString() : null;
      await run(
        `INSERT INTO assignments (id, user_id, course_id, title, description, due_at, status, source, source_url, lms_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'lms', ?, ?, NOW(), NOW())`,
        [assignment.id, '', courseId, assignment.title, assignment.title, dueAt, assignment.dueDate]
      );
    }

    // Store announcements
    for (const announcement of courseData.announcements) {
      await run(
        `INSERT INTO announcements (id, user_id, course_id, title, content, url, published_at, source, lms_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, 'lms', ?, NOW())`,
        [announcement.id, '', courseId, announcement.title, announcement.content]
      );
    }

    return new NextResponse(
      JSON.stringify({ success: true, syncedAt: now, coursesSynced: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Extension sync error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Sync failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}