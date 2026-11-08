import { queryAll, queryOne } from "@/lib/db";
import type {
  Assignment,
  Chapter,
  Course,
  Exam,
  LmsConnection,
  Profile,
} from "@/lib/types";
import { daysBetween, dateInTimeZone, formatDate, minutesToLabel } from "@/lib/utils";

export type AcademicContext = {
  profile: Profile;
  courses: (Course & {
    total_chapters: number;
    completed_chapters: number;
    in_progress_chapters: number;
  })[];
  chapters: (Chapter & { course_title: string; course_code: string | null })[];
  exams: (Exam & { course_title: string | null })[];
  assignments: (Assignment & { course_title: string | null })[];
  lms: Pick<LmsConnection, "status" | "site_url" | "last_sync_at" | "site_name"> | null;
  today: string;
  recentCompleted: { title: string; date: string; course_title: string | null }[];
  totalCompletedMinutes: number;
};

export function getAcademicContext(userId: string, timezone = "Asia/Kolkata"): AcademicContext {
  const profile =
    queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [userId]) ??
    ({
      user_id: userId,
      college: "IIT Jodhpur",
      program: null,
      year: null,
      timezone,
      study_hours: 3,
      preferred_start_hour: 18,
      session_length: 45,
      break_minutes: 10,
      learning_style: null,
      explanation_level: "undergraduate",
      goals: null,
      weak_subjects: null,
      onboarding_completed: 1,
      created_at: "",
      updated_at: "",
    } satisfies Profile);

  const today = dateInTimeZone(profile.timezone || timezone);

  const courses = queryAll<
    Course & {
      total_chapters: number;
      completed_chapters: number;
      in_progress_chapters: number;
    }
  >(
    `SELECT c.*,
       COUNT(ch.id) AS total_chapters,
       SUM(CASE WHEN ch.status = 'completed' THEN 1 ELSE 0 END) AS completed_chapters,
       SUM(CASE WHEN ch.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_chapters
     FROM courses c
     LEFT JOIN chapters ch ON ch.course_id = c.id
     WHERE c.user_id = ? AND c.archived = 0
     GROUP BY c.id
     ORDER BY c.created_at ASC`,
    [userId],
  );

  const chapters = queryAll<Chapter & { course_title: string; course_code: string | null }>(
    `SELECT ch.*, c.title AS course_title, c.code AS course_code
     FROM chapters ch
     JOIN courses c ON c.id = ch.course_id
     WHERE ch.user_id = ? AND c.archived = 0
     ORDER BY c.title ASC, ch.order_index ASC, ch.created_at ASC`,
    [userId],
  );

  const exams = queryAll<Exam & { course_title: string | null }>(
    `SELECT e.*, c.title AS course_title
     FROM exams e
     LEFT JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = ? AND e.exam_date >= ?
     ORDER BY e.exam_date ASC
     LIMIT 12`,
    [userId, today],
  );

  const assignments = queryAll<Assignment & { course_title: string | null }>(
    `SELECT a.*, c.title AS course_title
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     WHERE a.user_id = ? AND a.status = 'pending'
     ORDER BY COALESCE(a.due_at, '9999') ASC
     LIMIT 20`,
    [userId],
  );

  const lms = queryOne<LmsConnection>(
    "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
    [userId],
  );

  const recentCompleted = queryAll<{
    title: string;
    date: string;
    course_title: string | null;
  }>(
    `SELECT t.title, t.date, c.title AS course_title
     FROM study_tasks t
     LEFT JOIN courses c ON c.id = t.course_id
     WHERE t.user_id = ? AND t.status = 'completed'
     ORDER BY t.completed_at DESC
     LIMIT 15`,
    [userId],
  );

  const completed = queryOne<{ total: number | null }>(
    "SELECT SUM(duration_minutes) AS total FROM study_tasks WHERE user_id = ? AND status = 'completed'",
    [userId],
  );

  return {
    profile,
    courses,
    chapters,
    exams,
    assignments,
    lms: lms
      ? {
          status: lms.status,
          site_url: lms.site_url,
          last_sync_at: lms.last_sync_at,
          site_name: lms.site_name,
        }
      : null,
    today,
    recentCompleted,
    totalCompletedMinutes: completed?.total ?? 0,
  };
}

export function formatAcademicContext(context: AcademicContext): string {
  const { profile } = context;
  const weakSubjects = profile.weak_subjects
    ? (JSON.parse(profile.weak_subjects) as string[]).join(", ")
    : "not specified";

  const courseLines = context.courses.length
    ? context.courses
        .map((course) => {
          const progress = course.total_chapters
            ? `${course.completed_chapters}/${course.total_chapters} chapters complete`
            : "syllabus not added yet";
          return `- ${course.code ? `[${course.code}] ` : ""}${course.title} — ${progress}${
            course.lms_progress != null ? `, LMS progress ${Math.round(course.lms_progress)}%` : ""
          }`;
        })
        .join("\n")
    : "- No courses added yet.";

  const chapterLines = context.chapters.length
    ? context.chapters
        .slice(0, 60)
        .map((chapter) => {
          const exam = context.exams.find((item) => item.course_id === chapter.course_id);
          return `- ${chapter.course_code ? `${chapter.course_code}: ` : ""}${chapter.title} — ${chapter.status.replace(
            "_",
            " ",
          )}, confidence ${chapter.confidence}/5, difficulty ${chapter.difficulty}, est. ${chapter.estimated_minutes}m${
            exam ? `, exam ${formatDate(exam.exam_date)} (${daysBetween(context.today, exam.exam_date)}d)` : ""
          }`;
        })
        .join("\n")
    : "- No syllabus chapters added yet.";

  const examLines = context.exams.length
    ? context.exams
        .map(
          (exam) =>
            `- ${exam.title}${exam.course_title ? ` (${exam.course_title})` : ""} on ${formatDate(
              exam.exam_date,
            )} — ${daysBetween(context.today, exam.exam_date)} days away${
              exam.syllabus ? `; syllabus: ${exam.syllabus.slice(0, 300)}` : ""
            }`,
        )
        .join("\n")
    : "- No upcoming exams recorded.";

  const assignmentLines = context.assignments.length
    ? context.assignments
        .map(
          (assignment) =>
            `- ${assignment.title}${assignment.course_title ? ` (${assignment.course_title})` : ""}${
              assignment.due_at ? ` due ${formatDate(assignment.due_at)}` : " — no due date"
            }${assignment.source === "moodle" ? " [from LMS]" : ""}`,
        )
        .join("\n")
    : "- No pending assignments recorded.";

  const recentLines = context.recentCompleted.length
    ? context.recentCompleted
        .slice(0, 8)
        .map(
          (item) =>
            `- ${item.date}: ${item.title}${item.course_title ? ` (${item.course_title})` : ""}`,
        )
        .join("\n")
    : "- No completed study tasks yet.";

  const lmsLine = context.lms
    ? `Connected to ${context.lms.site_name ?? context.lms.site_url} as of ${
        context.lms.last_sync_at ? formatDate(context.lms.last_sync_at) : "never synced"
      }. Only treat synced LMS records as real; never invent extra LMS data.`
    : "LMS is not connected. Do not claim to see LMS courses, deadlines, announcements, or materials. Offer the manual import or Moodle token setup instead.";

  return `CURRENT DATE: ${context.today} (${profile.timezone})
STUDENT PROFILE
- Name: ${context.profile.college ? "Student" : "Student"} at ${profile.college}
- Program: ${profile.program ?? "not specified"}${profile.year ? `, year ${profile.year}` : ""}
- Preferred explanation level: ${profile.explanation_level}
- Learning style: ${profile.learning_style ?? "not specified"}
- Daily study target: ${profile.study_hours} hours; preferred start ${profile.preferred_start_hour}:00; session length ${profile.session_length}m
- Goals: ${profile.goals ?? "not specified"}
- Self-identified weak subjects: ${weakSubjects}
- Total completed study time: ${minutesToLabel(context.totalCompletedMinutes)}

COURSES
${courseLines}

SYLLABUS / CHAPTERS
${chapterLines}

UPCOMING EXAMS
${examLines}

PENDING ASSIGNMENTS
${assignmentLines}

RECENT STUDY HISTORY
${recentLines}

LMS STATUS
${lmsLine}`;
}
