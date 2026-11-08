import { queryAll, queryOne, run } from "@/lib/db";
import { getAcademicContext } from "@/lib/ai/context";
import type { Assignment, Chapter, Course, Exam, Resource, StudyTask } from "@/lib/types";
import {
  addDaysToDate,
  clamp,
  courseColor,
  daysBetween,
  dateInTimeZone,
  minutesToLabel,
  nowIso,
} from "@/lib/utils";

type Candidate = {
  chapter: Chapter;
  course: Course;
  score: number;
  reasons: string[];
  exam: Exam | null;
  daysToExam: number | null;
};

export type GeneratePlanResult = {
  date: string;
  tasks: StudyTask[];
  summary: string;
  totalMinutes: number;
  rescheduled: number;
  needsSetup: boolean;
  message?: string;
};

function priorityFor(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function findResource(
  resources: Resource[],
  courseId: string,
): Resource | null {
  return (
    resources.find(
      (resource) =>
        resource.course_id === courseId &&
        (resource.kind === "video" || resource.kind === "lecture") &&
        resource.verified === 1,
    ) ??
    resources.find((resource) => resource.course_id === courseId && resource.url) ??
    null
  );
}

export function rescheduleMissedTasks(userId: string, today: string): number {
  const missed = queryAll<StudyTask>(
    `SELECT * FROM study_tasks
     WHERE user_id = ? AND status = 'pending' AND date < ?
     ORDER BY date ASC, sort_order ASC
     LIMIT 40`,
    [userId, today],
  );
  if (!missed.length) return 0;

  const profile = queryOne<{ study_hours: number }>(
    "SELECT study_hours FROM profiles WHERE user_id = ?",
    [userId],
  );
  const dailyTarget = Math.round((profile?.study_hours ?? 3) * 60);

  const planned = queryAll<{ date: string; minutes: number }>(
    `SELECT date, SUM(duration_minutes) AS minutes
     FROM study_tasks
     WHERE user_id = ? AND status = 'pending' AND date >= ? AND date <= ?
     GROUP BY date`,
    [userId, today, addDaysToDate(today, 13)],
  );
  const used = new Map(planned.map((row) => [row.date, row.minutes ?? 0]));

  let moved = 0;
  for (const task of missed) {
    let target = today;
    for (let offset = 0; offset < 14; offset += 1) {
      const day = addDaysToDate(today, offset);
      const remaining = dailyTarget - (used.get(day) ?? 0);
      if (remaining >= Math.min(task.duration_minutes, 45)) {
        target = day;
        break;
      }
      if (offset === 13) target = addDaysToDate(today, 1);
    }
    used.set(target, (used.get(target) ?? 0) + task.duration_minutes);
    run(
      `UPDATE study_tasks
       SET date = ?, rescheduled_from = COALESCE(rescheduled_from, ?), updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [target, task.date, nowIso(), task.id, userId],
    );
    moved += 1;
  }
  return moved;
}

export function generateDailyPlan(
  userId: string,
  requestedDate?: string,
  options: { regenerate?: boolean } = {},
): GeneratePlanResult {
  const context = getAcademicContext(userId);
  const today = dateInTimeZone(context.profile.timezone);
  const date = requestedDate || today;
  const now = nowIso();

  const rescheduled = date === today ? rescheduleMissedTasks(userId, today) : 0;

  const existing = queryAll<StudyTask>(
    "SELECT * FROM study_tasks WHERE user_id = ? AND date = ? ORDER BY sort_order ASC, created_at ASC",
    [userId, date],
  );

  if (!options.regenerate && existing.length > 0) {
    const plan = queryOne<{ summary: string | null; total_minutes: number }>(
      "SELECT summary, total_minutes FROM daily_plans WHERE user_id = ? AND date = ?",
      [userId, date],
    );
    return {
      date,
      tasks: existing,
      summary:
        plan?.summary ??
        `${existing.length} tasks · ${minutesToLabel(
          existing.reduce((sum, task) => sum + task.duration_minutes, 0),
        )}`,
      totalMinutes:
        plan?.total_minutes ??
        existing.reduce((sum, task) => sum + task.duration_minutes, 0),
      rescheduled,
      needsSetup: false,
    };
  }

  if (options.regenerate) {
    run(
      "DELETE FROM study_tasks WHERE user_id = ? AND date = ? AND status = 'pending' AND ai_generated = 1",
      [userId, date],
    );
  }

  const completedMinutes = existing
    .filter((task) => task.status === "completed")
    .reduce((sum, task) => sum + task.duration_minutes, 0);

  if (!context.courses.length) {
    const summary =
      "Add your courses and syllabus first. Cortex will not invent a study plan without your real academic data.";
    upsertDailyPlan(userId, date, summary, 0);
    return {
      date,
      tasks: [],
      summary,
      totalMinutes: 0,
      rescheduled,
      needsSetup: true,
      message: "Add at least one course and a few syllabus chapters to generate a plan.",
    };
  }

  const resources = queryAll<Resource>(
    "SELECT * FROM resources WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );

  const available = clamp(
    Math.round(context.profile.study_hours * 60) - completedMinutes,
    0,
    720,
  );

  if (available < 20) {
    const summary = "Today's target is already covered. Review your completed tasks or increase your daily study hours in Settings.";
    upsertDailyPlan(userId, date, summary, completedMinutes);
    return {
      date,
      tasks: existing,
      summary,
      totalMinutes: completedMinutes,
      rescheduled,
      needsSetup: false,
      message: summary,
    };
  }

  const examByCourse = new Map<string, { exam: Exam; days: number }>();
  for (const exam of context.exams) {
    if (!exam.course_id) continue;
    const days = daysBetween(date, exam.exam_date);
    if (days < 0) continue;
    const existingExam = examByCourse.get(exam.course_id);
    if (!existingExam || days < existingExam.days) {
      examByCourse.set(exam.course_id, { exam, days });
    }
  }

  const weakSubjects = new Set(
    context.profile.weak_subjects
      ? (JSON.parse(context.profile.weak_subjects) as string[]).map((item) =>
          item.toLowerCase(),
        )
      : [],
  );

  const candidates: Candidate[] = [];
  for (const chapter of context.chapters) {
    if (chapter.status === "completed") continue;
    const course = context.courses.find((item) => item.id === chapter.course_id);
    if (!course) continue;
    const examInfo = examByCourse.get(chapter.course_id) ?? null;
    const reasons: string[] = [];
    let score = 20;

    if (chapter.status === "in_progress") {
      score += 18;
      reasons.push("already in progress");
    }
    if (chapter.confidence <= 2) {
      score += 28;
      reasons.push("low confidence");
    } else if (chapter.confidence === 3) {
      score += 12;
      reasons.push("needs reinforcement");
    }
    if (chapter.difficulty === "hard") {
      score += 10;
      reasons.push("high difficulty");
    }
    if (examInfo) {
      if (examInfo.days <= 7) {
        score += 65;
        reasons.push(`exam in ${examInfo.days} day${examInfo.days === 1 ? "" : "s"}`);
      } else if (examInfo.days <= 14) {
        score += 42;
        reasons.push(`exam in ${examInfo.days} days`);
      } else if (examInfo.days <= 30) {
        score += 20;
        reasons.push(`exam in ${examInfo.days} days`);
      }
    }
    if (weakSubjects.has(course.title.toLowerCase()) || weakSubjects.has((course.code ?? "").toLowerCase())) {
      score += 16;
      reasons.push("self-identified weak subject");
    }
    if (resources.some((resource) => resource.course_id === course.id && resource.verified === 1)) {
      score += 4;
    }

    candidates.push({
      chapter,
      course,
      score,
      reasons: reasons.length ? reasons : ["part of your recorded syllabus"],
      exam: examInfo?.exam ?? null,
      daysToExam: examInfo?.days ?? null,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.chapter.order_index - b.chapter.order_index);

  const pendingAssignments = context.assignments
    .filter((assignment) => assignment.due_at)
    .map((assignment) => ({
      assignment,
      days: daysBetween(date, assignment.due_at!.slice(0, 10)),
    }))
    .filter((item) => item.days >= 0 && item.days <= 7)
    .sort((a, b) => a.days - b.days);

  const tasksToInsert: Omit<StudyTask, "id" | "created_at" | "updated_at">[] = [];
  let remaining = available;
  let order = existing.filter((task) => task.status === "completed").length;

  const revisionReserve = available >= 75 ? 15 : 0;
  let contentBudget = Math.max(0, remaining - revisionReserve);

  const assignmentBudget = Math.min(
    Math.round(available * 0.35),
    pendingAssignments.slice(0, 2).reduce((sum) => sum + 30, 0),
  );
  let assignmentUsed = 0;

  for (const item of pendingAssignments.slice(0, 2)) {
    if (assignmentUsed + 30 > assignmentBudget) break;
    const assignment: Assignment = item.assignment;
    const duration = 30;
    tasksToInsert.push({
      user_id: userId,
      course_id: assignment.course_id,
      chapter_id: null,
      exam_id: null,
      assignment_id: assignment.id,
      date,
      title: `Assignment: ${assignment.title}`,
      description: `Due in ${item.days} day${item.days === 1 ? "" : "s"}. Break the brief into steps and make visible progress.`,
      task_type: "assignment",
      duration_minutes: duration,
      priority: item.days <= 2 ? "high" : "medium",
      status: "pending",
      resource_url: assignment.source_url,
      resource_title: assignment.source === "moodle" ? "Open in LMS" : null,
      ai_generated: 1,
      rescheduled_from: null,
      completed_at: null,
      sort_order: order++,
    });
    assignmentUsed += duration;
    contentBudget -= duration;
    remaining -= duration;
  }

  for (const candidate of candidates) {
    if (contentBudget < 20 || remaining < 20) break;
    const block = clamp(
      Math.min(context.profile.session_length || 45, contentBudget, remaining),
      20,
      75,
    );
    const resource = findResource(resources, candidate.course.id);
    const priority = priorityFor(candidate.score);
    const reasonText = candidate.reasons.join(", ");
    const examText = candidate.exam
      ? ` Exam: ${candidate.exam.title} in ${candidate.daysToExam} day${
          candidate.daysToExam === 1 ? "" : "s"
        }.`
      : "";

    const studyMinutes = block >= 35 ? Math.round(block * 0.6) : block;
    const practiceMinutes = block - studyMinutes;

    tasksToInsert.push({
      user_id: userId,
      course_id: candidate.course.id,
      chapter_id: candidate.chapter.id,
      exam_id: candidate.exam?.id ?? null,
      assignment_id: null,
      date,
      title: `Study ${candidate.chapter.title}`,
      description: `${candidate.course.title} · ${reasonText}.${examText}${
        resource ? ` Suggested resource: ${resource.title}.` : ""
      }`,
      task_type: "study",
      duration_minutes: studyMinutes,
      priority,
      status: "pending",
      resource_url: resource?.url ?? null,
      resource_title: resource?.title ?? null,
      ai_generated: 1,
      rescheduled_from: null,
      completed_at: null,
      sort_order: order++,
    });

    if (practiceMinutes >= 10) {
      tasksToInsert.push({
        user_id: userId,
        course_id: candidate.course.id,
        chapter_id: candidate.chapter.id,
        exam_id: candidate.exam?.id ?? null,
        assignment_id: null,
        date,
        title: `Practice ${candidate.chapter.title}`,
        description: `Active practice on ${candidate.course.title}. Solve 5-10 questions, then write down what you got wrong.`,
        task_type: "practice",
        duration_minutes: practiceMinutes,
        priority,
        status: "pending",
        resource_url: null,
        resource_title: null,
        ai_generated: 1,
        rescheduled_from: null,
        completed_at: null,
        sort_order: order++,
      });
    }

    contentBudget -= block;
    remaining -= block;
  }

  if (revisionReserve && remaining >= revisionReserve) {
    const studied = candidates
      .filter((candidate) =>
        tasksToInsert.some((task) => task.chapter_id === candidate.chapter.id),
      )
      .slice(0, 4)
      .map((candidate) => candidate.chapter.title);
    tasksToInsert.push({
      user_id: userId,
      course_id: null,
      chapter_id: null,
      exam_id: null,
      assignment_id: null,
      date,
      title: "Active recall + wrap-up",
      description: studied.length
        ? `Close the loop on today's material: ${studied.join(" · ")}. Recall key ideas from memory before checking notes.`
        : "Spend 15 minutes recalling what you studied today without looking at your notes.",
      task_type: "revision",
      duration_minutes: revisionReserve,
      priority: "medium",
      status: "pending",
      resource_url: null,
      resource_title: null,
      ai_generated: 1,
      rescheduled_from: null,
      completed_at: null,
      sort_order: order++,
    });
    remaining -= revisionReserve;
  }

  if (!tasksToInsert.length) {
    const summary =
      "No unscheduled chapters were found. Add syllabus chapters or mark some as not started, then regenerate.";
    upsertDailyPlan(userId, date, summary, completedMinutes);
    return {
      date,
      tasks: existing,
      summary,
      totalMinutes: completedMinutes,
      rescheduled,
      needsSetup: false,
      message: summary,
    };
  }

  const insert = `INSERT INTO study_tasks
    (id, user_id, course_id, chapter_id, exam_id, assignment_id, date, title, description,
     task_type, duration_minutes, priority, status, resource_url, resource_title, ai_generated,
     rescheduled_from, completed_at, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const task of tasksToInsert) {
    run(insert, [
      crypto.randomUUID(),
      task.user_id,
      task.course_id,
      task.chapter_id,
      task.exam_id,
      task.assignment_id,
      task.date,
      task.title,
      task.description,
      task.task_type,
      task.duration_minutes,
      task.priority,
      task.status,
      task.resource_url,
      task.resource_title,
      task.ai_generated,
      task.rescheduled_from,
      task.completed_at,
      task.sort_order,
      now,
      now,
    ]);
  }

  const allTasks = queryAll<StudyTask>(
    "SELECT * FROM study_tasks WHERE user_id = ? AND date = ? ORDER BY sort_order ASC, created_at ASC",
    [userId, date],
  );
  const totalMinutes = allTasks.reduce((sum, task) => sum + task.duration_minutes, 0);
  const courseNames = Array.from(
    new Set(
      tasksToInsert
        .map((task) => context.courses.find((course) => course.id === task.course_id)?.title)
        .filter(Boolean),
    ),
  );
  const top = candidates[0];
  const summary = [
    `${minutesToLabel(totalMinutes)} planned across ${courseNames.length || 1} course${
      (courseNames.length || 1) === 1 ? "" : "s"
    }.`,
    top
      ? `Highest priority: ${top.chapter.title} (${top.course.title}) — ${top.reasons.join(", ")}.`
      : "",
    pendingAssignments.length
      ? `You also have ${pendingAssignments.length} assignment${
          pendingAssignments.length === 1 ? "" : "s"
        } due within 7 days.`
      : "",
    rescheduled
      ? `${rescheduled} missed task${rescheduled === 1 ? "" : "s"} rescheduled automatically.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  upsertDailyPlan(userId, date, summary, totalMinutes);

  return {
    date,
    tasks: allTasks,
    summary,
    totalMinutes,
    rescheduled,
    needsSetup: false,
  };
}

export function upsertDailyPlan(
  userId: string,
  date: string,
  summary: string,
  totalMinutes: number,
  aiBriefing?: string | null,
) {
  const existing = queryOne<{ id: string; ai_briefing: string | null }>(
    "SELECT id, ai_briefing FROM daily_plans WHERE user_id = ? AND date = ?",
    [userId, date],
  );
  const now = nowIso();
  if (existing) {
    run(
      `UPDATE daily_plans SET summary = ?, total_minutes = ?, ai_briefing = ?, generated_at = ?
       WHERE id = ?`,
      [
        summary,
        totalMinutes,
        aiBriefing !== undefined ? aiBriefing : existing.ai_briefing,
        now,
        existing.id,
      ],
    );
  } else {
    run(
      `INSERT INTO daily_plans (id, user_id, date, summary, ai_briefing, total_minutes, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, date, summary, aiBriefing ?? null, totalMinutes, now],
    );
  }
}

export function ensureCourseColors(userId: string) {
  const courses = queryAll<Course>(
    "SELECT * FROM courses WHERE user_id = ? AND (color IS NULL OR color = '')",
    [userId],
  );
  courses.forEach((course, index) => {
    run("UPDATE courses SET color = ? WHERE id = ?", [courseColor(index + 3), course.id]);
  });
}
