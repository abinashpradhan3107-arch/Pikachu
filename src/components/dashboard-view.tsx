"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  Flame,
  GraduationCap,
  ListTodo,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FocusTimer } from "@/components/focus-timer";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader, SectionHeader, StatCard } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { StudyStats } from "@/lib/stats";
import type { Profile, StudyTask } from "@/lib/types";
import { cn, formatDate, minutesToLabel, relativeDay, timeWindowLabel } from "@/lib/utils";

type DashboardData = {
  stats: StudyStats;
  profile: Profile;
  plan: { summary: string | null; ai_briefing: string | null; total_minutes: number } | null;
  backlog: Array<{
    id: string;
    title: string;
    url: string | null;
    duration_minutes: number | null;
    course_title: string | null;
    chapter_title: string | null;
    synced_at: string;
  }>;
  backlogCount: number;
  quizAccuracy: Array<{
    chapter_id: string;
    chapter_title: string | null;
    course_title: string | null;
    score: number;
    total: number;
    attempts: number;
    accuracy: number | null;
  }>;
  rescheduled: number;
  ai: { configured: boolean; source: string; model: string; hasYoutubeKey: boolean };
  lms: {
    connected: boolean;
    status?: string;
    siteName?: string | null;
    siteUrl?: string;
    lastSyncAt?: string | null;
    lastError?: string | null;
  };
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "badge-red",
  medium: "badge-accent",
  low: "badge-green",
};

function greetingFor(hour: number) {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function DashboardView({ userName }: { userName: string }) {
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("Welcome back");

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await apiFetch<DashboardData>("/api/dashboard");
      setData(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    void load();
  }, [load]);

  async function generatePlan() {
    setGenerating(true);
    try {
      const result = await apiFetch<{ summary: string; needsSetup: boolean; aiError?: string | null }>(
        "/api/plan/generate",
        { method: "POST", body: JSON.stringify({}) },
      );
      if (result.needsSetup) {
        toast.warning("Add courses first", result.summary);
      } else {
        toast.success("Today's plan is ready", result.summary);
        if (result.aiError) {
          toast.warning("Plan generated without AI briefing", result.aiError);
        }
      }
      await load();
    } catch (caught) {
      toast.error("Could not generate the plan", errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function toggleTask(task: StudyTask) {
    setToggling(task.id);
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
      await load();
    } catch (caught) {
      toast.error("Could not update the task", errorMessage(caught));
    } finally {
      setToggling(null);
    }
  }

  async function toggleWatched(resourceId: string, watched: boolean) {
    setWatching(resourceId);
    try {
      await apiFetch(`/api/resources/${resourceId}`, {
        method: "PATCH",
        body: JSON.stringify({ watched }),
      });
      await load();
    } catch (caught) {
      toast.error("Could not update the lecture", errorMessage(caught));
    } finally {
      setWatching(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="skeleton h-72 rounded-xl" />
          <div className="skeleton h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load your dashboard"
        description={error ?? "Something went wrong while loading your data."}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  const { stats, profile, plan, backlog, quizAccuracy, rescheduled, ai, lms } = data;
  const pendingToday = stats.todayTasks.filter((task) => task.status !== "completed");
  const completedToday = stats.todayTasks.filter((task) => task.status === "completed");
  const topTask = pendingToday[0] ?? null;
  const nextExam = stats.nextExam;
  const maxWeekly = Math.max(60, ...stats.weekly.map((day) => Math.max(day.minutes, day.planned)));
  // Chapters measured at under 60% quiz accuracy, excluding ones already
  // surfaced from confidence/difficulty - measured weakness, not guessed.
  const lowAccuracy = quizAccuracy.filter(
    (row) =>
      row.accuracy !== null &&
      row.accuracy < 60 &&
      !stats.weakTopics.some((chapter) => chapter.id === row.chapter_id),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={formatDate(stats.today)}
        title={`${greeting}, ${userName.split(" ")[0]}.`}
        description={
          topTask
            ? `Your next best action is ${topTask.title.toLowerCase()} — ${minutesToLabel(topTask.duration_minutes)}.`
            : stats.courses.length
              ? "Generate today's plan to turn your syllabus into a focused sequence."
              : "Add your courses and syllabus to unlock planning, exam prep, and AI tutoring."
        }
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              <RefreshCw className="size-4" /> Refresh
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={generatePlan}
              disabled={generating || !stats.courses.length}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {generating ? "Building plan…" : stats.todayTasks.length ? "Regenerate plan" : "Generate today's plan"}
            </button>
          </>
        }
      />

      {!ai.configured ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-[0.8rem] font-semibold text-[#f2f2ef]">AI features are not connected yet</p>
              <p className="text-[0.74rem] text-[#9aa1aa]">
                Add an OpenAI-compatible API key in Settings to unlock chat, notes, quizzes, and briefings.
              </p>
            </div>
          </div>
          <Link href="/settings" className="btn btn-secondary btn-sm shrink-0">
            Connect AI <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Study streak"
          value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`}
          hint={stats.streak ? "Complete one task to keep it alive." : "Complete a task today to start."}
          accent="#f08a8a"
        />
        <StatCard
          icon={Clock}
          label="Today"
          value={minutesToLabel(stats.todayMinutes)}
          hint={`${stats.todayCompleted}/${stats.todayTasks.length} tasks · ${minutesToLabel(stats.todayPlanned)} planned`}
          accent="#e7b44b"
        />
        <StatCard
          icon={TrendingUp}
          label="This week"
          value={minutesToLabel(stats.weekMinutes)}
          hint={`${stats.weeklyCompletion}% of planned time completed`}
          accent="#6ee7b7"
        />
        <StatCard
          icon={ListTodo}
          label="Open tasks"
          value={stats.tasksPending}
          hint={
            stats.overdueCount
              ? `${stats.overdueCount} overdue — reschedule from Study Plan`
              : "Nothing overdue. Keep it that way."
          }
          accent="#7aa2ff"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
              <div>
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#6d747d]">
                  What should I study today?
                </p>
                <h2 className="mt-1 text-[1rem] font-semibold tracking-tight text-[#f2f2ef]">
                  {topTask ? topTask.title : stats.todayTasks.length ? "Today's plan is complete" : "No plan yet"}
                </h2>
                <p className="mt-1 text-[0.75rem] text-[#9aa1aa]">
                  {plan?.summary ?? "Generate a plan from your recorded syllabus and deadlines."}
                </p>
              </div>
              <span className={cn("badge", topTask ? PRIORITY_STYLES[topTask.priority] : "badge-green")}>
                {topTask ? `${topTask.priority} priority` : "Ready"}
              </span>
            </div>

            <div className="px-4 py-4">
              {!stats.courses.length ? (
                <EmptyState
                  icon={BookOpen}
                  title="Your workspace needs academic data"
                  description="Add at least one course with chapters, then Cortex can build a plan that is actually about your semester."
                  action={
                    <Link href="/courses" className="btn btn-primary btn-sm">
                      Add your first course <ArrowRight className="size-3.5" />
                    </Link>
                  }
                  className="border-0 bg-transparent py-4"
                />
              ) : (
                <>
                  {plan?.ai_briefing ? (
                    <div className="mb-4 rounded-xl border border-[#e7b44b]/15 bg-[#e7b44b]/[0.045] px-3.5 py-3">
                      <p className="mb-1 flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#e7b44b]">
                        <Sparkles className="size-3.5" /> AI briefing
                      </p>
                      <Markdown className="text-[0.8rem]">{plan.ai_briefing}</Markdown>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {stats.todayTasks.length ? (
                      stats.todayTasks.slice(0, 7).map((task) => {
                        const course = stats.courses.find((item) => item.id === task.course_id);
                        const done = task.status === "completed";
                        const slot = timeWindowLabel(task.start_time, task.duration_minutes);
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "group flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                              done
                                ? "border-white/[0.05] bg-white/[0.01] opacity-70"
                                : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => void toggleTask(task)}
                              disabled={toggling === task.id}
                              className={cn(
                                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                                done
                                  ? "border-[#6ee7b7]/40 bg-[#6ee7b7]/15 text-[#6ee7b7]"
                                  : "border-white/20 text-transparent hover:border-[#e7b44b]/60 hover:text-[#e7b44b]",
                              )}
                              aria-label={done ? "Mark task incomplete" : "Mark task complete"}
                            >
                              {toggling === task.id ? (
                                <Loader2 className="size-3 animate-spin text-[#9aa1aa]" />
                              ) : (
                                <Check className="size-3.5" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p
                                  className={cn(
                                    "text-[0.8rem] font-medium text-[#f2f2ef]",
                                    done && "line-through decoration-white/30",
                                  )}
                                >
                                  {task.title}
                                </p>
                                <span className={cn("badge px-1.5 py-0.5 text-[0.6rem]", PRIORITY_STYLES[task.priority])}>
                                  {task.priority}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[0.68rem] text-[#6d747d]">
                                {slot ? (
                                  <span className="font-medium text-[#f3c96b]">{slot}</span>
                                ) : null}
                                {slot ? " · " : ""}
                                {course ? `${course.title} · ` : ""}
                                {minutesToLabel(task.duration_minutes)} · {task.task_type}
                                {task.rescheduled_from ? ` · moved from ${formatDate(task.rescheduled_from)}` : ""}
                              </p>
                              {task.description ? (
                                <p className="mt-1 line-clamp-2 text-[0.7rem] leading-relaxed text-[#9aa1aa]">
                                  {task.description}
                                </p>
                              ) : null}
                              {task.resource_url ? (
                                <a
                                  href={task.resource_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-medium text-[#f3c96b] hover:underline"
                                >
                                  {task.resource_title ??
                                    (task.task_type === "assignment" ? "Open assignment" : "Open lecture in LMS")}{" "}
                                  <ArrowRight className="size-3" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyState
                        icon={Wand2}
                        title="No tasks for today"
                        description="Generate a plan and Cortex will rank your chapters by exam proximity, confidence, and difficulty."
                        action={
                          <button type="button" className="btn btn-primary btn-sm" onClick={generatePlan} disabled={generating}>
                            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                            Generate plan
                          </button>
                        }
                        className="border-0 bg-transparent py-4"
                      />
                    )}
                  </div>

                  {stats.todayTasks.length ? (
                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                      <p className="text-[0.7rem] text-[#6d747d]">
                        {completedToday.length} of {stats.todayTasks.length} complete
                      </p>
                      <Link href="/plan" className="text-[0.72rem] font-medium text-[#f3c96b] hover:underline">
                        Open full plan
                      </Link>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="surface p-4">
              <SectionHeader title="This week" description="Completed vs planned minutes" />
              <div className="flex h-28 items-end gap-1.5">
                {stats.weekly.map((day) => {
                  const height = Math.max(4, Math.round((day.minutes / maxWeekly) * 100));
                  const plannedHeight = Math.max(4, Math.round((day.planned / maxWeekly) * 100));
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="relative flex h-24 w-full items-end justify-center gap-0.5">
                        <div
                          className="w-1/2 max-w-3 rounded-t bg-white/[0.07]"
                          style={{ height: `${plannedHeight}%` }}
                          title={`${minutesToLabel(day.planned)} planned`}
                        />
                        <div
                          className="w-1/2 max-w-3 rounded-t bg-[#e7b44b]"
                          style={{ height: `${height}%` }}
                          title={`${minutesToLabel(day.minutes)} completed`}
                        />
                      </div>
                      <span className="text-[0.6rem] text-[#6d747d]">
                        {new Intl.DateTimeFormat("en-IN", { weekday: "narrow" }).format(
                          new Date(`${day.date}T12:00:00Z`),
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <FocusTimer sessionLength={profile.session_length} breakMinutes={profile.break_minutes} />
          </div>
        </div>

        <div className="space-y-4">
          <section className="surface p-4">
            <SectionHeader
              title="Next exam"
              action={
                <Link href="/exams" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  All exams
                </Link>
              }
            />
            {nextExam ? (
              <div>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9rem] font-semibold text-[#f2f2ef]">{nextExam.title}</p>
                    <p className="mt-0.5 text-[0.72rem] text-[#9aa1aa]">
                      {nextExam.course_title ?? "General"} · {formatDate(nextExam.exam_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[1.6rem] font-semibold leading-none tracking-tight text-[#e7b44b]">
                      {nextExam.days}
                    </p>
                    <p className="text-[0.62rem] uppercase tracking-[0.1em] text-[#6d747d]">
                      day{nextExam.days === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressBar value={Math.max(0, 100 - Math.min(100, nextExam.days * 2))} />
                  <p className="mt-1.5 text-[0.68rem] text-[#6d747d]">
                    {nextExam.syllabus
                      ? nextExam.syllabus.slice(0, 120)
                      : "Add syllabus notes to make exam prep more specific."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <GraduationCap className="mx-auto mb-2 size-5 text-[#6d747d]" />
                <p className="text-[0.78rem] text-[#9aa1aa]">No upcoming exams recorded.</p>
                <Link href="/exams" className="mt-2 inline-block text-[0.72rem] font-medium text-[#f3c96b] hover:underline">
                  Add an exam
                </Link>
              </div>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="Assignments due"
              action={
                <Link href="/assignments" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  View all
                </Link>
              }
            />
            {stats.pendingAssignments.length ? (
              <div className="space-y-2">
                {stats.pendingAssignments.slice(0, 4).map((assignment) => (
                  <div key={assignment.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[0.76rem] font-medium text-[#f2f2ef]">
                        {assignment.title}
                      </p>
                      <span
                        className={cn(
                          "badge shrink-0 px-1.5 py-0.5 text-[0.6rem]",
                          assignment.days != null && assignment.days <= 2 ? "badge-red" : "badge-accent",
                        )}
                      >
                        {assignment.due_at ? relativeDay(assignment.due_at.slice(0, 10), stats.today) : "No due date"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[0.65rem] text-[#6d747d]">
                      {assignment.course_title ?? "General"} · {assignment.source === "moodle" ? "LMS" : "Manual"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[0.76rem] text-[#6d747d]">Nothing pending. Nice.</p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="Catch-up backlog"
              description="LMS lectures you have not marked as watched yet"
              action={
                <Link href="/courses" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  All lectures
                </Link>
              }
            />
            {rescheduled > 0 ? (
              <p className="mb-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[0.68rem] text-[#9aa1aa]">
                {rescheduled} missed task{rescheduled === 1 ? "" : "s"} moved into your next free study block
                automatically.
              </p>
            ) : null}
            {backlog.length ? (
              <div className="space-y-2">
                {backlog.slice(0, 5).map((lecture) => (
                  <div
                    key={lecture.id}
                    className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[#e7b44b]/10 text-[#e7b44b]">
                      <Clock className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.76rem] font-medium text-[#f2f2ef]">{lecture.title}</p>
                      <p className="mt-0.5 truncate text-[0.64rem] text-[#6d747d]">
                        {lecture.chapter_title ? `${lecture.chapter_title} · ` : ""}
                        {lecture.course_title ?? "General"}
                        {lecture.duration_minutes ? ` · ${minutesToLabel(lecture.duration_minutes)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {lecture.url ? (
                        <a
                          href={lecture.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-icon p-1.5 text-[#f3c96b]"
                          aria-label={`Open ${lecture.title} in the LMS`}
                        >
                          <ArrowRight className="size-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={watching === lecture.id}
                        onClick={() => void toggleWatched(lecture.id, true)}
                      >
                        {watching === lecture.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}{" "}
                        Mark watched
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[0.76rem] text-[#6d747d]">
                Nothing waiting. Unwatched LMS lectures show up here as the extension syncs them.
              </p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader title="Weak topics" description="Low confidence or hard and untouched" />
            {stats.weakTopics.length || lowAccuracy.length ? (
              <div className="space-y-2">
                {stats.weakTopics.slice(0, 4).map((chapter) => (
                  <div key={chapter.id} className="flex items-center gap-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#f08a8a]/10 text-[#f08a8a]">
                      <Target className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.75rem] font-medium text-[#f2f2ef]">{chapter.title}</p>
                      <p className="truncate text-[0.64rem] text-[#6d747d]">
                        {chapter.course_code ? `${chapter.course_code} · ` : ""}confidence {chapter.confidence}/5
                      </p>
                    </div>
                    <span className="badge shrink-0 px-1.5 py-0.5 text-[0.58rem]">{chapter.difficulty}</span>
                  </div>
                ))}
                {lowAccuracy.slice(0, 2).map((row) => (
                  <div key={row.chapter_id} className="flex items-center gap-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#f08a8a]/10 text-[#f08a8a]">
                      <Target className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.75rem] font-medium text-[#f2f2ef]">
                        {row.chapter_title ?? "Unknown chapter"}
                      </p>
                      <p className="truncate text-[0.64rem] text-[#6d747d]">
                        {row.course_title ? `${row.course_title} · ` : ""}quiz accuracy {row.accuracy}% over{" "}
                        {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="badge badge-red shrink-0 px-1.5 py-0.5 text-[0.58rem]">{row.accuracy}%</span>
                  </div>
                ))}
                <Link href="/progress" className="mt-1 inline-flex items-center gap-1 text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  See the full weak-topic list <ArrowRight className="size-3" />
                </Link>
              </div>
            ) : (
              <p className="py-4 text-center text-[0.76rem] text-[#6d747d]">
                No weak topics detected. Keep confidence values honest.
              </p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="Course progress"
              action={
                <Link href="/courses" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  Manage
                </Link>
              }
            />
            {stats.courses.length ? (
              <div className="space-y-3">
                {stats.courses.slice(0, 5).map((course) => (
                  <div key={course.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[0.75rem] font-medium text-[#f2f2ef]">
                        {course.code ? `${course.code} · ` : ""}{course.title}
                      </p>
                      <span className="shrink-0 text-[0.65rem] text-[#6d747d]">
                        {course.completed_chapters}/{course.total_chapters}
                      </span>
                    </div>
                    <ProgressBar value={course.progress} color={course.color ?? "var(--accent)"} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[0.76rem] text-[#6d747d]">No courses yet.</p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="LMS"
              action={
                <Link href="/lms" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  {lms.connected ? "Manage" : "Connect"}
                </Link>
              }
            />
            {lms.connected ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="dot-live" />
                  <p className="truncate text-[0.78rem] font-medium text-[#f2f2ef]">
                    {lms.siteName ?? "Moodle"}
                  </p>
                </div>
                <p className="mt-1 text-[0.68rem] text-[#6d747d]">
                  {lms.lastSyncAt ? `Last synced ${formatDate(lms.lastSyncAt)}` : "Not synced yet"}
                  {lms.status === "error" ? " · needs attention" : ""}
                </p>
              </div>
            ) : (
              <p className="text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                Connect with an official Moodle token, or import PDFs and text manually. No auth bypass.
              </p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader title="Quick actions" />
            <div className="grid gap-2">
              <Link href="/chat" className="btn btn-secondary justify-start">
                <Brain className="size-4 text-[#e7b44b]" /> Ask about today&apos;s plan
              </Link>
              <Link href="/tools" className="btn btn-secondary justify-start">
                <Sparkles className="size-4 text-[#c4a7ff]" /> Generate revision notes
              </Link>
              <Link href="/plan" className="btn btn-secondary justify-start">
                <CalendarDays className="size-4 text-[#7aa2ff]" /> Reschedule missed work
              </Link>
              <Link href="/videos" className="btn btn-secondary justify-start">
                <ClipboardList className="size-4 text-[#6ee7b7]" /> Find a verified lecture
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
