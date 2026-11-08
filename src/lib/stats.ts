import { queryAll, queryOne } from "@/lib/db";
import type {
  Assignment,
  Chapter,
  Course,
  Exam,
  StudyTask,
} from "@/lib/types";
import { addDaysToDate, daysBetween, dateInTimeZone, pct } from "@/lib/utils";

export type HeatmapDay = { date: string; minutes: number };

export type StudyStats = {
  today: string;
  totalMinutes: number;
  weekMinutes: number;
  todayMinutes: number;
  todayPlanned: number;
  todayCompleted: number;
  streak: number;
  heatmap: HeatmapDay[];
  weekly: { date: string; minutes: number; planned: number }[];
  weeklyCompletion: number;
  activeDays: number;
  tasksCompleted: number;
  tasksPending: number;
  courses: (Course & {
    total_chapters: number;
    completed_chapters: number;
    progress: number;
  })[];
  nextExam: (Exam & { course_title: string | null; days: number }) | null;
  exams: (Exam & { course_title: string | null; days: number })[];
  pendingAssignments: (Assignment & { course_title: string | null; days: number | null })[];
  weakTopics: (Chapter & { course_title: string; course_code: string | null })[];
  todayTasks: StudyTask[];
  overdueCount: number;
};

export function getStudyStats(userId: string, timezone = "Asia/Kolkata"): StudyStats {
  const today = dateInTimeZone(timezone);
  const weekStart = addDaysToDate(today, -6);

  const totals = queryOne<{ total: number | null; count: number | null }>(
    `SELECT SUM(duration_minutes) AS total, COUNT(*) AS count
     FROM study_tasks WHERE user_id = ? AND status = 'completed'`,
    [userId],
  );

  const todayRows = queryAll<{ date: string; minutes: number; planned: number; completed: number }>(
    `SELECT date,
       SUM(CASE WHEN status = 'completed' THEN duration_minutes ELSE 0 END) AS minutes,
       SUM(duration_minutes) AS planned,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
     FROM study_tasks
     WHERE user_id = ? AND date >= ? AND date <= ?
     GROUP BY date`,
    [userId, weekStart, today],
  );

  const byDate = new Map(todayRows.map((row) => [row.date, row]));
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDate(weekStart, index);
    const row = byDate.get(date);
    return {
      date,
      minutes: row?.minutes ?? 0,
      planned: row?.planned ?? 0,
    };
  });
  const weekMinutes = weekly.reduce((sum, day) => sum + day.minutes, 0);
  const weekPlanned = weekly.reduce((sum, day) => sum + day.planned, 0);

  const completedDates = queryAll<{ date: string }>(
    `SELECT DISTINCT date FROM study_tasks
     WHERE user_id = ? AND status = 'completed'
     ORDER BY date DESC
     LIMIT 400`,
    [userId],
  );
  const completedSet = new Set(completedDates.map((row) => row.date));
  let cursor = completedSet.has(today) ? today : addDaysToDate(today, -1);
  let streak = 0;
  while (completedSet.has(cursor) && streak < 400) {
    streak += 1;
    cursor = addDaysToDate(cursor, -1);
  }

  const heatmapStart = addDaysToDate(today, -83);
  const heatmapRows = queryAll<{ date: string; minutes: number }>(
    `SELECT date, SUM(duration_minutes) AS minutes
     FROM study_tasks
     WHERE user_id = ? AND status = 'completed' AND date >= ? AND date <= ?
     GROUP BY date`,
    [userId, heatmapStart, today],
  );
  const heatmapMap = new Map(heatmapRows.map((row) => [row.date, row.minutes]));
  const heatmap = Array.from({ length: 84 }, (_, index) => {
    const date = addDaysToDate(heatmapStart, index);
    return { date, minutes: heatmapMap.get(date) ?? 0 };
  });

  const courses = queryAll<
    Course & { total_chapters: number; completed_chapters: number }
  >(
    `SELECT c.*,
       COUNT(ch.id) AS total_chapters,
       SUM(CASE WHEN ch.status = 'completed' THEN 1 ELSE 0 END) AS completed_chapters
     FROM courses c
     LEFT JOIN chapters ch ON ch.course_id = c.id
     WHERE c.user_id = ? AND c.archived = 0
     GROUP BY c.id
     ORDER BY c.created_at ASC`,
    [userId],
  ).map((course) => ({
    ...course,
    total_chapters: course.total_chapters ?? 0,
    completed_chapters: course.completed_chapters ?? 0,
    progress:
      course.total_chapters > 0
        ? pct(course.completed_chapters ?? 0, course.total_chapters)
        : course.lms_progress != null
          ? Math.round(course.lms_progress)
          : 0,
  }));

  const exams = queryAll<Exam & { course_title: string | null }>(
    `SELECT e.*, c.title AS course_title
     FROM exams e
     LEFT JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = ? AND e.exam_date >= ?
     ORDER BY e.exam_date ASC`,
    [userId, today],
  ).map((exam) => ({
    ...exam,
    days: daysBetween(today, exam.exam_date),
  }));

  const pendingAssignments = queryAll<Assignment & { course_title: string | null }>(
    `SELECT a.*, c.title AS course_title
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     WHERE a.user_id = ? AND a.status = 'pending'
     ORDER BY COALESCE(a.due_at, '9999') ASC
     LIMIT 20`,
    [userId],
  ).map((assignment) => ({
    ...assignment,
    days: assignment.due_at ? daysBetween(today, assignment.due_at.slice(0, 10)) : null,
  }));

  const weakTopics = queryAll<Chapter & { course_title: string; course_code: string | null }>(
    `SELECT ch.*, c.title AS course_title, c.code AS course_code
     FROM chapters ch
     JOIN courses c ON c.id = ch.course_id
     WHERE ch.user_id = ? AND ch.status != 'completed'
       AND (ch.confidence <= 2 OR (ch.difficulty = 'hard' AND ch.status = 'not_started'))
     ORDER BY ch.confidence ASC, ch.difficulty DESC
     LIMIT 8`,
    [userId],
  );

  const todayTasks = queryAll<StudyTask>(
    "SELECT * FROM study_tasks WHERE user_id = ? AND date = ? ORDER BY sort_order ASC, created_at ASC",
    [userId, today],
  );

  const pending = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM study_tasks WHERE user_id = ? AND status = 'pending'",
    [userId],
  );
  const overdue = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM study_tasks WHERE user_id = ? AND status = 'pending' AND date < ?",
    [userId, today],
  );

  const todayCompleted = todayTasks.filter((task) => task.status === "completed").length;
  const todayPlanned = todayTasks.reduce((sum, task) => sum + task.duration_minutes, 0);
  const todayMinutes = todayTasks
    .filter((task) => task.status === "completed")
    .reduce((sum, task) => sum + task.duration_minutes, 0);

  return {
    today,
    totalMinutes: totals?.total ?? 0,
    weekMinutes,
    todayMinutes,
    todayPlanned,
    todayCompleted,
    streak,
    heatmap,
    weekly,
    weeklyCompletion: weekPlanned ? pct(weekMinutes, weekPlanned) : 0,
    activeDays: completedDates.length,
    tasksCompleted: totals?.count ?? 0,
    tasksPending: pending?.count ?? 0,
    courses,
    nextExam: exams[0] ?? null,
    exams,
    pendingAssignments,
    weakTopics,
    todayTasks,
    overdueCount: overdue?.count ?? 0,
  };
}
