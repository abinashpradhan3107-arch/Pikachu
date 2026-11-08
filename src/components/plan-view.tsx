"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FocusTimer } from "@/components/focus-timer";
import { Markdown } from "@/components/ui/markdown";
import { Modal } from "@/components/ui/modal";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { Chapter, Course, Exam, StudyTask } from "@/lib/types";
import {
  cn,
  formatDate,
  minutesToLabel,
  relativeDay,
} from "@/lib/utils";

type PlanProfile = {
  timezone: string;
  study_hours: number;
  session_length: number;
  break_minutes: number;
};

type GenerateResponse = {
  date: string;
  tasks: StudyTask[];
  summary: string;
  totalMinutes: number;
  rescheduled: number;
  needsSetup: boolean;
  message?: string;
  aiBriefing?: string | null;
  aiError?: string | null;
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "badge-red",
  medium: "badge-accent",
  low: "badge-green",
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthDays(date: Date) {
  const first = monthStart(date);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = new Date(first.getFullYear(), first.getMonth(), index + 1);
    return dateKey(day);
  });
}

export function PlanView({
  today,
  profile,
}: {
  today: string;
  profile: PlanProfile;
}) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(new Date(`${today}T12:00:00`)));
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    duration_minutes: "45",
    task_type: "study",
    priority: "medium",
    course_id: "",
    chapter_id: "",
    description: "",
    resource_url: "",
  });

  const range = useMemo(() => {
    const days = monthDays(visibleMonth);
    return { from: days[0], to: days[days.length - 1] };
  }, [visibleMonth]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [taskData, courseData, chapterData, examData] = await Promise.all([
        apiFetch<{ tasks: StudyTask[] }>(`/api/tasks?from=${range.from}&to=${range.to}`),
        apiFetch<{ courses: Course[] }>("/api/courses"),
        apiFetch<{ chapters: Chapter[] }>("/api/chapters"),
        apiFetch<{ exams: Exam[] }>("/api/exams"),
      ]);
      setTasks(taskData.tasks);
      setCourses(courseData.courses);
      setChapters(chapterData.chapters);
      setExams(examData.exams);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => monthDays(visibleMonth), [visibleMonth]);
  const leadingBlanks = useMemo(() => {
    const first = new Date(`${days[0]}T12:00:00`);
    return first.getDay();
  }, [days]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, StudyTask[]>();
    for (const task of tasks) {
      const list = map.get(task.date) ?? [];
      list.push(task);
      map.set(task.date, list);
    }
    return map;
  }, [tasks]);

  const examsByDate = useMemo(() => {
    const map = new Map<string, Exam[]>();
    for (const exam of exams) {
      const list = map.get(exam.exam_date) ?? [];
      list.push(exam);
      map.set(exam.exam_date, list);
    }
    return map;
  }, [exams]);

  const selectedTasks = tasksByDate.get(selectedDate) ?? [];
  const selectedExams = examsByDate.get(selectedDate) ?? [];
  const selectedPending = selectedTasks.filter((task) => task.status !== "completed");
  const selectedMinutes = selectedTasks.reduce((sum, task) => sum + task.duration_minutes, 0);
  const monthMinutes = tasks.reduce((sum, task) => sum + task.duration_minutes, 0);

  function moveMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    setVisibleMonth(monthStart(new Date(`${today}T12:00:00`)));
    setSelectedDate(today);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    const parsed = new Date(`${date}T12:00:00`);
    if (parsed.getMonth() !== visibleMonth.getMonth() || parsed.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(monthStart(parsed));
    }
    setBriefing(null);
    setSummary(null);
  }

  async function generate(regenerate: boolean) {
    setGenerating(true);
    try {
      const result = await apiFetch<GenerateResponse>("/api/plan/generate", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate, regenerate }),
      });
      setSummary(result.summary);
      setBriefing(result.aiBriefing ?? null);
      if (result.needsSetup) {
        toast.warning("Add courses first", result.summary);
      } else {
        toast.success(regenerate ? "Plan regenerated" : "Plan ready", result.summary);
        if (result.aiError) toast.warning("AI briefing unavailable", result.aiError);
      }
      await load();
    } catch (caught) {
      toast.error("Could not generate the plan", errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function reschedule() {
    setRescheduling(true);
    try {
      const result = await apiFetch<{ moved: number; message: string }>("/api/plan/reschedule", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate }),
      });
      toast.info("Reschedule complete", result.message);
      await load();
    } catch (caught) {
      toast.error("Could not reschedule", errorMessage(caught));
    } finally {
      setRescheduling(false);
    }
  }

  async function toggleTask(task: StudyTask) {
    setBusyTask(task.id);
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
      await load();
    } catch (caught) {
      toast.error("Could not update the task", errorMessage(caught));
    } finally {
      setBusyTask(null);
    }
  }

  async function deleteTask(task: StudyTask) {
    setBusyTask(task.id);
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      toast.success("Task removed");
      await load();
    } catch (caught) {
      toast.error("Could not delete the task", errorMessage(caught));
    } finally {
      setBusyTask(null);
    }
  }

  async function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          date: selectedDate,
          title: form.title.trim(),
          duration_minutes: Number(form.duration_minutes),
          task_type: form.task_type,
          priority: form.priority,
          course_id: form.course_id || null,
          chapter_id: form.chapter_id || null,
          description: form.description.trim() || null,
          resource_url: form.resource_url.trim() || null,
        }),
      });
      toast.success("Task added", `Scheduled for ${formatDate(selectedDate)}.`);
      setAddOpen(false);
      setForm({
        title: "",
        duration_minutes: "45",
        task_type: "study",
        priority: "medium",
        course_id: "",
        chapter_id: "",
        description: "",
        resource_url: "",
      });
      await load();
    } catch (caught) {
      toast.error("Could not add the task", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const courseChapters = form.course_id
    ? chapters.filter((chapter) => chapter.course_id === form.course_id)
    : [];

  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-lg" />
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="skeleton h-[480px] rounded-xl" />
          <div className="skeleton h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load your plan"
        description={error}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Plan · Calendar"
        title="Study plan"
        description="Generate a realistic sequence for any day, check tasks off, and reschedule missed work without losing momentum."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={reschedule} disabled={rescheduling}>
              {rescheduling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Reschedule missed
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => generate(selectedTasks.length > 0)}
              disabled={generating}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {selectedTasks.length ? "Regenerate day" : "Generate day"}
            </button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => moveMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
              <p className="min-w-[150px] text-center text-[0.86rem] font-semibold text-[#f2f2ef]">{monthLabel}</p>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => moveMonth(1)} aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.68rem] text-[#6d747d]">
                {minutesToLabel(monthMinutes)} planned this month
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
                Today
              </button>
            </div>
          </div>

          <div className="calendar-grid border-b border-white/[0.06] px-2 pt-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="pb-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-[#555c66]">
                {day}
              </div>
            ))}
          </div>

          <div className="calendar-grid gap-1 p-2">
            {Array.from({ length: leadingBlanks }).map((_, index) => (
              <div key={`blank-${index}`} className="min-h-[76px] rounded-lg" />
            ))}
            {days.map((day) => {
              const dayTasks = tasksByDate.get(day) ?? [];
              const dayExams = examsByDate.get(day) ?? [];
              const completed = dayTasks.filter((task) => task.status === "completed").length;
              const isSelected = day === selectedDate;
              const isToday = day === today;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={cn(
                    "group relative flex min-h-[76px] flex-col rounded-lg border p-1.5 text-left transition-colors",
                    isSelected
                      ? "border-[#e7b44b]/45 bg-[#e7b44b]/[0.075]"
                      : "border-transparent hover:border-white/10 hover:bg-white/[0.03]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[0.66rem] font-semibold",
                        isToday
                          ? "bg-[#e7b44b] text-[#1b1405]"
                          : isSelected
                            ? "text-[#f3c96b]"
                            : "text-[#9aa1aa]",
                      )}
                    >
                      {Number(day.slice(-2))}
                    </span>
                    {dayExams.length ? (
                      <GraduationCap className="size-3 text-[#f08a8a]" aria-label="Exam day" />
                    ) : null}
                  </div>
                  <div className="mt-1 flex-1 space-y-0.5">
                    {dayTasks.slice(0, 2).map((task) => (
                      <p
                        key={task.id}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[0.56rem] leading-tight",
                          task.status === "completed"
                            ? "bg-white/[0.03] text-[#6d747d] line-through"
                            : task.priority === "high"
                              ? "bg-[#f08a8a]/10 text-[#ffb4b4]"
                              : "bg-white/[0.05] text-[#c6cbd1]",
                        )}
                      >
                        {task.title}
                      </p>
                    ))}
                    {dayTasks.length > 2 ? (
                      <p className="px-1 text-[0.54rem] text-[#6d747d]">+{dayTasks.length - 2} more</p>
                    ) : null}
                  </div>
                  {dayTasks.length ? (
                    <div className="mt-1 flex items-center gap-1">
                      <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-[#6ee7b7]"
                          style={{ width: `${Math.round((completed / dayTasks.length) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[0.52rem] text-[#6d747d]">{completed}/{dayTasks.length}</span>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 text-[0.62rem] text-[#6d747d]">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#e7b44b]" /> Selected
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#f08a8a]" /> Exam
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#6ee7b7]" /> Completed
            </span>
          </div>
        </section>

        <div className="space-y-4">
          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
              <div>
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#6d747d]">
                  {relativeDay(selectedDate, today)}
                </p>
                <h2 className="mt-0.5 text-[0.98rem] font-semibold tracking-tight text-[#f2f2ef]">
                  {formatDate(selectedDate, profile.timezone, { weekday: "long" })}
                </h2>
                <p className="mt-0.5 text-[0.7rem] text-[#9aa1aa]">
                  {selectedTasks.length} task{selectedTasks.length === 1 ? "" : "s"} · {minutesToLabel(selectedMinutes)}
                  {selectedPending.length ? ` · ${selectedPending.length} open` : ""}
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5" /> Add
              </button>
            </div>

            <div className="px-4 py-3.5">
              {selectedExams.map((exam) => (
                <div key={exam.id} className="mb-2 rounded-lg border border-[#f08a8a]/20 bg-[#f08a8a]/[0.06] px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[0.76rem] font-semibold text-[#ffb4b4]">
                    <GraduationCap className="size-3.5" /> {exam.title}
                  </p>
                  <p className="mt-0.5 text-[0.66rem] text-[#9aa1aa]">
                    {exam.exam_type} · {exam.start_time ?? "time not set"} · {exam.location ?? "location not set"}
                  </p>
                </div>
              ))}

              {summary || briefing ? (
                <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                  {summary ? <p className="text-[0.74rem] leading-relaxed text-[#c6cbd1]">{summary}</p> : null}
                  {briefing ? (
                    <div className="mt-2 border-t border-white/[0.06] pt-2">
                      <p className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[#e7b44b]">
                        <Sparkles className="size-3" /> AI briefing
                      </p>
                      <Markdown className="text-[0.76rem]">{briefing}</Markdown>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedTasks.length ? (
                <div className="space-y-2">
                  {selectedTasks.map((task) => {
                    const course = courses.find((item) => item.id === task.course_id);
                    const done = task.status === "completed";
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border px-2.5 py-2",
                          done
                            ? "border-white/[0.05] bg-white/[0.01] opacity-65"
                            : "border-white/[0.07] bg-white/[0.02]",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => void toggleTask(task)}
                          disabled={busyTask === task.id}
                          className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                            done
                              ? "border-[#6ee7b7]/40 bg-[#6ee7b7]/15 text-[#6ee7b7]"
                              : "border-white/20 text-transparent hover:border-[#e7b44b]/60 hover:text-[#e7b44b]",
                          )}
                          aria-label={done ? "Mark incomplete" : "Mark complete"}
                        >
                          {busyTask === task.id ? (
                            <Loader2 className="size-3 animate-spin text-[#9aa1aa]" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className={cn("text-[0.78rem] font-medium text-[#f2f2ef]", done && "line-through")}>
                              {task.title}
                            </p>
                            <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", PRIORITY_STYLES[task.priority])}>
                              {task.priority}
                            </span>
                            {task.ai_generated ? <span className="badge px-1.5 py-0.5 text-[0.56rem]">AI</span> : null}
                          </div>
                          <p className="mt-0.5 text-[0.64rem] text-[#6d747d]">
                            {course ? `${course.title} · ` : ""}
                            {minutesToLabel(task.duration_minutes)} · {task.task_type}
                          </p>
                          {task.description ? (
                            <p className="mt-1 text-[0.68rem] leading-relaxed text-[#9aa1aa]">{task.description}</p>
                          ) : null}
                          {task.resource_url ? (
                            <a
                              href={task.resource_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-[0.66rem] font-medium text-[#f3c96b] hover:underline"
                            >
                              {task.resource_title ?? "Open resource"} <ArrowRight className="size-3" />
                            </a>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteTask(task)}
                          disabled={busyTask === task.id}
                          className="btn btn-ghost btn-icon shrink-0 p-1 text-[#6d747d] hover:text-[#f08a8a]"
                          aria-label="Delete task"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="Nothing scheduled"
                  description="Generate a plan for this day, or add a task manually."
                  action={
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => generate(false)} disabled={generating}>
                        {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                        Generate
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
                        <Plus className="size-3.5" /> Add task
                      </button>
                    </>
                  }
                  className="border-0 bg-transparent py-5"
                />
              )}
            </div>
          </section>

          <FocusTimer sessionLength={profile.session_length} breakMinutes={profile.break_minutes} />

          <section className="surface p-4">
            <SectionHeader title="Planning rules" />
            <ul className="space-y-2 text-[0.72rem] leading-relaxed text-[#9aa1aa]">
              <li className="flex gap-2">
                <Clock className="mt-0.5 size-3.5 shrink-0 text-[#6d747d]" />
                Plans respect your {profile.study_hours}h daily target and {profile.session_length}m session length.
              </li>
              <li className="flex gap-2">
                <ArrowLeft className="mt-0.5 size-3.5 shrink-0 text-[#6d747d]" />
                Missed pending tasks move into the next available days without stacking unrealistically.
              </li>
              <li className="flex gap-2">
                <GraduationCap className="mt-0.5 size-3.5 shrink-0 text-[#6d747d]" />
                Exams within 7 days dominate priority, followed by low-confidence chapters.
              </li>
            </ul>
          </section>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Add a task · ${formatDate(selectedDate)}`}
        description="Use this for anything the planner cannot infer — a custom revision block, a lab prep session, or a reading target."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="add-task-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add task
            </button>
          </>
        }
      >
        <form id="add-task-form" onSubmit={addTask} className="space-y-3">
          <div>
            <label className="label" htmlFor="task-title">Task title</label>
            <input
              id="task-title"
              className="input"
              required
              minLength={2}
              placeholder="Revise graph traversal proofs"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="task-duration">Duration (minutes)</label>
              <input
                id="task-duration"
                type="number"
                min={5}
                max={480}
                className="input"
                value={form.duration_minutes}
                onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="task-type">Type</label>
              <select
                id="task-type"
                className="input"
                value={form.task_type}
                onChange={(event) => setForm({ ...form, task_type: event.target.value })}
              >
                <option value="study">Study</option>
                <option value="practice">Practice</option>
                <option value="revision">Revision</option>
                <option value="assignment">Assignment</option>
                <option value="video">Video</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="task-priority">Priority</label>
              <select
                id="task-priority"
                className="input"
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="task-course">Course (optional)</label>
              <select
                id="task-course"
                className="input"
                value={form.course_id}
                onChange={(event) => setForm({ ...form, course_id: event.target.value, chapter_id: "" })}
              >
                <option value="">No course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code ? `${course.code} — ` : ""}{course.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.course_id ? (
            <div>
              <label className="label" htmlFor="task-chapter">Chapter (optional)</label>
              <select
                id="task-chapter"
                className="input"
                value={form.chapter_id}
                onChange={(event) => setForm({ ...form, chapter_id: event.target.value })}
              >
                <option value="">No chapter</option>
                {courseChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="task-description">Description (optional)</label>
            <textarea
              id="task-description"
              className="input"
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="task-resource">Resource URL (optional)</label>
            <input
              id="task-resource"
              type="url"
              className="input"
              placeholder="https://…"
              value={form.resource_url}
              onChange={(event) => setForm({ ...form, resource_url: event.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
