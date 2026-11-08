"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock,
  Flame,
  GraduationCap,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { Modal } from "@/components/ui/modal";
import { PageHeader, SectionHeader, StatCard } from "@/components/ui/page";
import { ProgressBar, RingProgress } from "@/components/ui/progress";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { StudyStats } from "@/lib/stats";
import type { Profile } from "@/lib/types";
import { cn, daysBetween, formatDate, minutesToLabel, pct, relativeDay } from "@/lib/utils";

type DashboardData = {
  stats: StudyStats;
  profile: Profile;
  plan: { summary: string | null; ai_briefing: string | null; total_minutes: number } | null;
  ai: { configured: boolean; source: string; model: string; hasYoutubeKey: boolean };
  lms: { connected: boolean };
};

type HeatCell = { date: string; minutes: number } | null;

const HEAT_LEVELS = [
  "bg-white/[0.045]",
  "bg-[#e7b44b]/20",
  "bg-[#e7b44b]/40",
  "bg-[#e7b44b]/65",
  "bg-[#e7b44b]",
];

function heatLevel(minutes: number): number {
  if (!minutes) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

function buildWeeks(heatmap: { date: string; minutes: number }[]): HeatCell[][] {
  if (!heatmap.length) return [];
  const cells: HeatCell[] = [];
  const first = new Date(`${heatmap[0].date}T12:00:00Z`);
  const leading = Number.isNaN(first.getTime()) ? 0 : first.getUTCDay();
  for (let index = 0; index < leading; index += 1) cells.push(null);
  for (const day of heatmap) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: HeatCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export function ProgressView() {
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachContent, setCoachContent] = useState("");

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
    void load();
  }, [load]);

  async function reschedule() {
    setRescheduling(true);
    try {
      const result = await apiFetch<{ moved: number; message: string }>("/api/plan/reschedule", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (result.moved) {
        toast.success("Plan adjusted", result.message);
      } else {
        toast.info("Nothing to reschedule", result.message);
      }
      await load();
    } catch (caught) {
      toast.error("Could not reschedule", errorMessage(caught));
    } finally {
      setRescheduling(false);
    }
  }

  async function openCoach() {
    setCoachOpen(true);
    if (coachContent) return;
    setCoachLoading(true);
    try {
      const result = await apiFetch<{ markdown?: string }>("/api/ai/tool", {
        method: "POST",
        body: JSON.stringify({ tool: "coach" }),
      });
      setCoachContent(result.markdown ?? "");
    } catch (caught) {
      setCoachContent(`> ${errorMessage(caught)}`);
      toast.error("Could not generate a check-in", errorMessage(caught));
    } finally {
      setCoachLoading(false);
    }
  }

  const report = useMemo(() => {
    if (!data) return null;
    const { stats } = data;
    const weekPlanned = stats.weekly.reduce((sum, day) => sum + day.planned, 0);
    const weekDone = stats.weekly.reduce((sum, day) => sum + day.minutes, 0);
    const active = stats.weekly.filter((day) => day.minutes > 0).length;
    const best = [...stats.weekly].sort((a, b) => b.minutes - a.minutes)[0];
    return {
      weekPlanned,
      weekDone,
      active,
      best,
      completion: weekPlanned ? pct(weekDone, weekPlanned) : 0,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="skeleton h-72 rounded-xl" />
          <div className="skeleton h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data || !report) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load your progress"
        description={error ?? "Something went wrong while loading your study data."}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  const { stats } = data;
  const weeks = buildWeeks(stats.heatmap);
  const maxWeekly = Math.max(60, ...stats.weekly.map((day) => Math.max(day.minutes, day.planned)));
  const upcomingExams = stats.exams.slice(0, 5);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Progress"
        title="Study analytics"
        description="Honest data from completed tasks, not estimates. Use it to spot weak topics, protect your streak, and adjust the plan."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              <RefreshCw className="size-4" /> Refresh
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void openCoach()}
              disabled={!data.ai.configured}
            >
              <Sparkles className="size-4" /> AI weekly check-in
            </button>
          </>
        }
      />

      {!data.ai.configured ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.76rem] leading-relaxed text-[#9aa1aa]">
            <span className="font-semibold text-[#f2f2ef]">AI check-ins are off.</span> The deterministic report below still
            works. Connect a provider in Settings to add a coach&apos;s interpretation.
          </p>
          <Link href="/settings" className="btn btn-secondary btn-sm shrink-0">
            Connect AI
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Total studied"
          value={minutesToLabel(stats.totalMinutes)}
          hint={`${stats.tasksCompleted} completed task${stats.tasksCompleted === 1 ? "" : "s"} all time`}
          accent="#e7b44b"
        />
        <StatCard
          icon={Flame}
          label="Current streak"
          value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`}
          hint={stats.streak ? "One completed task keeps it alive." : "Complete a task today to start."}
          accent="#f08a8a"
        />
        <StatCard
          icon={TrendingUp}
          label="This week"
          value={minutesToLabel(report.weekDone)}
          hint={`${report.completion}% of ${minutesToLabel(report.weekPlanned)} planned`}
          accent="#6ee7b7"
        />
        <StatCard
          icon={CalendarDays}
          label="Active days"
          value={stats.activeDays}
          hint={report.active ? `${report.active}/7 days this week` : "No study logged this week"}
          accent="#7aa2ff"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-4">
          <section className="surface p-4">
            <SectionHeader
              title="Consistency"
              description="Completed study minutes over the last 12 weeks"
              action={<span className="badge badge-accent px-1.5 py-0.5 text-[0.56rem]">84 days</span>}
            />
            <div className="flex gap-2 overflow-x-auto pb-1">
              <div className="mt-4 flex shrink-0 flex-col gap-[3px]">
                {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                  <span key={`${label}-${index}`} className="flex h-[13px] items-center text-[0.54rem] text-[#555c66]">
                    {index % 2 === 1 ? label : ""}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map((cell, dayIndex) => (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        className={cn(
                          "size-[13px] rounded-[3px] border border-white/[0.03]",
                          cell ? HEAT_LEVELS[heatLevel(cell.minutes)] : "bg-transparent",
                        )}
                        title={
                          cell
                            ? `${formatDate(cell.date)} · ${cell.minutes ? minutesToLabel(cell.minutes) : "no study"}`
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[0.62rem] text-[#6d747d]">
              <span>{stats.heatmap[0] ? formatDate(stats.heatmap[0].date) : "—"}</span>
              <span className="flex items-center gap-1.5">
                Less
                {HEAT_LEVELS.map((level, index) => (
                  <span key={index} className={cn("size-[9px] rounded-[2px] border border-white/[0.03]", level)} />
                ))}
                More
              </span>
              <span>{formatDate(stats.today)}</span>
            </div>
          </section>

          <section className="surface p-4">
            <SectionHeader title="This week" description="Completed vs planned minutes" />
            <div className="flex h-32 items-end gap-2">
              {stats.weekly.map((day) => {
                const height = Math.max(4, Math.round((day.minutes / maxWeekly) * 100));
                const plannedHeight = Math.max(4, Math.round((day.planned / maxWeekly) * 100));
                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="relative flex h-28 w-full items-end justify-center gap-1">
                      <div
                        className="w-1/2 max-w-4 rounded-t bg-white/[0.07]"
                        style={{ height: `${plannedHeight}%` }}
                        title={`${minutesToLabel(day.planned)} planned`}
                      />
                      <div
                        className="w-1/2 max-w-4 rounded-t bg-[#e7b44b]"
                        style={{ height: `${height}%` }}
                        title={`${minutesToLabel(day.minutes)} completed`}
                      />
                    </div>
                    <span className="text-[0.62rem] text-[#6d747d]">
                      {new Intl.DateTimeFormat("en-IN", { weekday: "narrow" }).format(
                        new Date(`${day.date}T12:00:00Z`),
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="Weekly report"
              description="A deterministic summary you can trust"
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void reschedule()}
                  disabled={rescheduling}
                >
                  {rescheduling ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Reschedule missed
                </button>
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[0.62rem] uppercase tracking-[0.1em] text-[#6d747d]">Completion</p>
                <div className="mt-2 flex items-center gap-3">
                  <RingProgress value={report.completion} size={52} stroke={5} />
                  <p className="text-[0.7rem] leading-relaxed text-[#9aa1aa]">
                    {minutesToLabel(report.weekDone)} of {minutesToLabel(report.weekPlanned)} planned.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[0.62rem] uppercase tracking-[0.1em] text-[#6d747d]">Best day</p>
                <p className="mt-2 text-[0.9rem] font-semibold text-[#f2f2ef]">
                  {report.best && report.best.minutes ? formatDate(report.best.date, "Asia/Kolkata", { weekday: "short" }) : "—"}
                </p>
                <p className="mt-0.5 text-[0.68rem] text-[#9aa1aa]">
                  {report.best && report.best.minutes ? minutesToLabel(report.best.minutes) : "No completed time yet"}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[0.62rem] uppercase tracking-[0.1em] text-[#6d747d]">Open work</p>
                <p className="mt-2 text-[0.9rem] font-semibold text-[#f2f2ef]">{stats.tasksPending} tasks</p>
                <p className="mt-0.5 text-[0.68rem] text-[#9aa1aa]">
                  {stats.overdueCount ? `${stats.overdueCount} overdue — reschedule them.` : "Nothing overdue."}
                </p>
              </div>
            </div>
            <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#9aa1aa]">
              {report.weekDone === 0
                ? "No completed study time this week. Pick the smallest useful task and complete it to restart momentum."
                : report.completion >= 85
                  ? `Strong week: ${report.completion}% of planned time completed across ${report.active} active day${report.active === 1 ? "" : "s"}. Protect the routine and keep one buffer block free.`
                  : report.completion >= 50
                    ? `You completed ${report.completion}% of planned time. The plan is roughly realistic; trim one low-value block if the remaining work feels heavy.`
                    : `You completed ${report.completion}% of planned time. The plan may be too ambitious or the week was disrupted — reduce tomorrow's target and reschedule missed work instead of stacking it.`}
            </p>
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="Course progress"
              description="Chapters completed against recorded syllabus"
              action={
                <Link href="/courses" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  Manage courses
                </Link>
              }
            />
            {stats.courses.length ? (
              <div className="space-y-3">
                {stats.courses.map((course) => (
                  <div key={course.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[0.78rem] font-medium text-[#f2f2ef]">
                        {course.code ? `${course.code} · ` : ""}
                        {course.title}
                      </p>
                      <span className="shrink-0 text-[0.66rem] text-[#6d747d]">
                        {course.completed_chapters}/{course.total_chapters} · {course.progress}%
                      </span>
                    </div>
                    <ProgressBar value={course.progress} color={course.color ?? "var(--accent)"} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No courses yet"
                description="Add courses and chapters to see real progress instead of guesses."
                action={
                  <Link href="/courses" className="btn btn-primary btn-sm">
                    Add a course <ArrowRight className="size-3.5" />
                  </Link>
                }
                className="border-0 bg-transparent py-4"
              />
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="surface p-4">
            <SectionHeader title="Weak topics" description="Low confidence or hard and untouched" />
            {stats.weakTopics.length ? (
              <div className="space-y-2.5">
                {stats.weakTopics.map((chapter) => (
                  <div key={chapter.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[0.78rem] font-medium leading-snug text-[#f2f2ef]">
                        {chapter.title}
                      </p>
                      <span className="badge shrink-0 px-1.5 py-0.5 text-[0.56rem]">{chapter.difficulty}</span>
                    </div>
                    <p className="mt-0.5 text-[0.64rem] text-[#6d747d]">
                      {chapter.course_code ? `${chapter.course_code} · ` : ""}
                      {chapter.course_title}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[0.62rem] text-[#6d747d]">Confidence</span>
                      <div className="flex gap-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <span
                            key={index}
                            className={cn(
                              "size-1.5 rounded-full",
                              index < chapter.confidence ? "bg-[#f08a8a]" : "bg-white/[0.1]",
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-[0.62rem] text-[#9aa1aa]">{chapter.confidence}/5</span>
                    </div>
                  </div>
                ))}
                <Link
                  href="/tools"
                  className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-[#f3c96b] hover:underline"
                >
                  Generate a revision sheet <ArrowRight className="size-3" />
                </Link>
              </div>
            ) : (
              <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">
                No weak topics detected. Keep confidence values honest as you study.
              </p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="Exam countdowns"
              description="Only recorded exams"
              action={
                <Link href="/exams" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                  All exams
                </Link>
              }
            />
            {upcomingExams.length ? (
              <div className="space-y-2.5">
                {upcomingExams.map((exam) => {
                  const days = daysBetween(stats.today, exam.exam_date);
                  return (
                    <div key={exam.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#9aa1aa]">
                        <GraduationCap className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.78rem] font-medium text-[#f2f2ef]">{exam.title}</p>
                        <p className="mt-0.5 text-[0.64rem] text-[#6d747d]">
                          {exam.course_title ?? "General"} · {formatDate(exam.exam_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-[1rem] font-semibold leading-none", days <= 3 ? "text-[#f08a8a]" : "text-[#e7b44b]")}>
                          {Math.max(0, days)}
                        </p>
                        <p className="text-[0.56rem] uppercase tracking-[0.08em] text-[#6d747d]">
                          {Math.abs(days) === 1 ? "day" : "days"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">
                No upcoming exams recorded. Add one to make planning exam-aware.
              </p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader title="Pending assignments" description="Due dates are never invented" />
            {stats.pendingAssignments.length ? (
              <div className="space-y-2">
                {stats.pendingAssignments.slice(0, 5).map((assignment) => (
                  <div key={assignment.id} className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.76rem] font-medium text-[#f2f2ef]">{assignment.title}</p>
                      <p className="mt-0.5 truncate text-[0.64rem] text-[#6d747d]">
                        {assignment.course_title ?? "General"} · {assignment.source === "moodle" ? "LMS" : "Manual"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "badge shrink-0 px-1.5 py-0.5 text-[0.56rem]",
                        assignment.days != null && assignment.days <= 2 ? "badge-red" : "badge-accent",
                      )}
                    >
                      {assignment.due_at ? relativeDay(assignment.due_at.slice(0, 10), stats.today) : "No due date"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">Nothing pending. Nice.</p>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader title="Quick actions" />
            <div className="grid gap-2">
              <Link href="/plan" className="btn btn-secondary justify-start">
                <CalendarDays className="size-4 text-[#7aa2ff]" /> Adjust the study plan
              </Link>
              <Link href="/tools" className="btn btn-secondary justify-start">
                <Target className="size-4 text-[#c4a7ff]" /> Drill a weak topic
              </Link>
              <Link href="/chat" className="btn btn-secondary justify-start">
                <MessageSquareText className="size-4 text-[#e7b44b]" /> Ask about your progress
              </Link>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        title="AI weekly check-in"
        description="Grounded in your recorded progress. No invented achievements."
        size="xl"
      >
        {coachLoading ? (
          <div className="space-y-3 py-4">
            <LoadingBlock lines={3} />
            <LoadingBlock lines={4} />
          </div>
        ) : coachContent ? (
          <Markdown>{coachContent}</Markdown>
        ) : (
          <p className="py-6 text-center text-[0.8rem] text-[#6d747d]">No content returned.</p>
        )}
      </Modal>
    </div>
  );
}
