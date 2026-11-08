"use client";

import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { PageHeader, StatCard } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { Course, Exam } from "@/lib/types";
import { cn, daysBetween, formatDate, statusLabel } from "@/lib/utils";

type ExamForm = {
  title: string;
  course_id: string;
  exam_date: string;
  start_time: string;
  exam_type: string;
  weight: string;
  location: string;
  syllabus: string;
  notes: string;
};

const EMPTY_FORM: ExamForm = {
  title: "",
  course_id: "",
  exam_date: "",
  start_time: "",
  exam_type: "midterm",
  weight: "",
  location: "",
  syllabus: "",
  notes: "",
};

const TYPE_STYLES: Record<string, string> = {
  endsem: "badge-red",
  midterm: "badge-accent",
  quiz: "badge-blue",
  viva: "badge-green",
  practical: "badge-green",
  other: "badge",
};

export function ExamsView({ today }: { today: string }) {
  const toast = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState<ExamForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [aiExam, setAiExam] = useState<Exam | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const [aiTitle, setAiTitle] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [examData, courseData, settingsData] = await Promise.all([
        apiFetch<{ exams: Exam[] }>("/api/exams"),
        apiFetch<{ courses: Course[] }>("/api/courses"),
        apiFetch<{ settings: { configured: boolean } }>("/api/settings/ai"),
      ]);
      setExams(examData.exams);
      setCourses(courseData.courses);
      setAiConfigured(settingsData.settings.configured);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = useMemo(
    () =>
      exams
        .filter((exam) => exam.exam_date >= today)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date)),
    [exams, today],
  );
  const past = useMemo(
    () =>
      exams
        .filter((exam) => exam.exam_date < today)
        .sort((a, b) => b.exam_date.localeCompare(a.exam_date)),
    [exams, today],
  );

  const nextExam = upcoming[0] ?? null;
  const thisMonth = upcoming.filter(
    (exam) => exam.exam_date.slice(0, 7) === today.slice(0, 7),
  ).length;

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, exam_date: today });
    setModalOpen(true);
  }

  function openEdit(exam: Exam) {
    setEditing(exam);
    setForm({
      title: exam.title,
      course_id: exam.course_id ?? "",
      exam_date: exam.exam_date,
      start_time: exam.start_time ?? "",
      exam_type: exam.exam_type,
      weight: exam.weight != null ? String(exam.weight) : "",
      location: exam.location ?? "",
      syllabus: exam.syllabus ?? "",
      notes: exam.notes ?? "",
    });
    setModalOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        course_id: form.course_id || null,
        exam_date: form.exam_date,
        start_time: form.start_time.trim() || null,
        exam_type: form.exam_type,
        weight: form.weight ? Number(form.weight) : null,
        location: form.location.trim() || null,
        syllabus: form.syllabus.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await apiFetch(`/api/exams/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Exam updated", payload.title);
      } else {
        await apiFetch("/api/exams", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Exam added", "It now influences your daily plan.");
      }
      setModalOpen(false);
      await load();
    } catch (caught) {
      toast.error("Could not save the exam", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/exams/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Exam deleted");
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the exam", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function generatePriorities(exam: Exam) {
    setAiExam(exam);
    setAiContent("");
    setAiTitle(`Exam priorities — ${exam.title}`);
    setAiLoading(true);
    try {
      const result = await apiFetch<{ markdown?: string; title?: string }>("/api/ai/tool", {
        method: "POST",
        body: JSON.stringify({
          tool: "exam-predictor",
          examId: exam.id,
          courseId: exam.course_id,
          topic: exam.title,
        }),
      });
      setAiContent(result.markdown ?? "");
      if (result.title) setAiTitle(result.title);
    } catch (caught) {
      const message = errorMessage(caught);
      setAiContent(`> ${message}`);
      toast.error("Could not generate priorities", message);
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load exams"
        description={error}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  function examCard(exam: Exam, isPast: boolean) {
    const days = daysBetween(today, exam.exam_date);
    const course = courses.find((item) => item.id === exam.course_id);
    return (
      <article key={exam.id} className={cn("surface p-4", isPast && "opacity-70")}>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5",
              isPast
                ? "border-white/[0.06] bg-white/[0.02]"
                : days <= 3
                  ? "border-[#f08a8a]/25 bg-[#f08a8a]/[0.07]"
                  : days <= 10
                    ? "border-[#e7b44b]/25 bg-[#e7b44b]/[0.07]"
                    : "border-white/[0.07] bg-white/[0.02]",
            )}
          >
            {isPast ? (
              <>
                <GraduationCap className="size-4 text-[#6d747d]" />
                <span className="mt-1 text-[0.58rem] text-[#6d747d]">Past</span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "text-[1.45rem] font-semibold leading-none tracking-tight",
                    days <= 3 ? "text-[#f08a8a]" : "text-[#e7b44b]",
                  )}
                >
                  {days}
                </span>
                <span className="mt-0.5 text-[0.56rem] uppercase tracking-[0.08em] text-[#6d747d]">
                  {days === 0 ? "today" : days === 1 ? "day" : "days"}
                </span>
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", TYPE_STYLES[exam.exam_type] ?? "badge")}>
                {statusLabel(exam.exam_type)}
              </span>
              {exam.weight != null ? (
                <span className="badge px-1.5 py-0.5 text-[0.56rem]">{exam.weight}% weight</span>
              ) : null}
            </div>
            <h3 className="mt-1 truncate text-[0.92rem] font-semibold text-[#f2f2ef]">{exam.title}</h3>
            <p className="mt-0.5 text-[0.7rem] text-[#9aa1aa]">
              {course ? `${course.code ? `${course.code} · ` : ""}${course.title}` : "General"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.66rem] text-[#6d747d]">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" /> {formatDate(exam.exam_date)}
              </span>
              {exam.start_time ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" /> {exam.start_time}
                </span>
              ) : null}
              {exam.location ? <span>· {exam.location}</span> : null}
            </p>
            {exam.syllabus ? (
              <p className="mt-1.5 line-clamp-2 text-[0.7rem] leading-relaxed text-[#9aa1aa]">
                {exam.syllabus}
              </p>
            ) : null}

            {!isPast ? (
              <div className="mt-2">
                <ProgressBar value={Math.max(6, 100 - Math.min(100, days * 2))} />
                <p className="mt-1 text-[0.62rem] text-[#6d747d]">
                  {days === 0
                    ? "Exam day. Focus on rest and a light review."
                    : `${days} day${days === 1 ? "" : "s"} left. Add syllabus notes for a sharper priority map.`}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void generatePriorities(exam)}
              title="Generate AI priority map"
            >
              <Sparkles className="size-3.5" /> Priorities
            </button>
            <div className="flex justify-end gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-icon p-1.5"
                onClick={() => openEdit(exam)}
                aria-label={`Edit ${exam.title}`}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon p-1.5 hover:text-[#f08a8a]"
                onClick={() => setDeleteTarget(exam)}
                aria-label={`Delete ${exam.title}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Exams & countdowns"
        description="Only record confirmed dates. Exams within 7 days dominate your plan and revision priorities."
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="size-4" /> Add exam
          </button>
        }
      />

      {!aiConfigured ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <p className="text-[0.76rem] leading-relaxed text-[#9aa1aa]">
              <span className="font-semibold text-[#f2f2ef]">AI priorities are unavailable.</span>{" "}
              Connect a provider in Settings to generate an exam priority map.
            </p>
          </div>
          <Link href="/settings" className="btn btn-secondary btn-sm shrink-0">
            Connect AI
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={GraduationCap}
          label="Upcoming exams"
          value={upcoming.length}
          hint={past.length ? `${past.length} past exam${past.length === 1 ? "" : "s"} recorded` : "No past exams recorded"}
          accent="#e7b44b"
        />
        <StatCard
          icon={CalendarClock}
          label="Next exam"
          value={nextExam ? `${daysBetween(today, nextExam.exam_date)}d` : "—"}
          hint={nextExam ? nextExam.title : "Add your next confirmed exam"}
          accent="#f08a8a"
        />
        <StatCard
          icon={Target}
          label="This month"
          value={thisMonth}
          hint="Exams falling in the current month"
          accent="#7aa2ff"
        />
      </div>

      {!exams.length ? (
        <EmptyState
          icon={GraduationCap}
          title="No exams recorded"
          description="Add real midterm, endsem, quiz, or viva dates. Cortex will not invent deadlines for you."
          action={
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus className="size-4" /> Add an exam
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[0.92rem] font-semibold text-[#f2f2ef]">Upcoming</h2>
              <span className="badge">{upcoming.length}</span>
            </div>
            {upcoming.length ? (
              <div className="space-y-2.5">{upcoming.map((exam) => examCard(exam, false))}</div>
            ) : (
              <p className="surface px-4 py-6 text-center text-[0.78rem] text-[#6d747d]">
                No upcoming exams. Add the next confirmed date when it is announced.
              </p>
            )}
          </section>

          {past.length ? (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[0.92rem] font-semibold text-[#f2f2ef]">Past</h2>
                <span className="badge">{past.length}</span>
              </div>
              <div className="space-y-2.5">{past.map((exam) => examCard(exam, true))}</div>
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit exam" : "Add an exam"}
        description="Dates should come from an official course announcement. Do not guess."
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="exam-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editing ? "Save changes" : "Add exam"}
            </button>
          </>
        }
      >
        <form id="exam-form" onSubmit={save} className="space-y-3">
          <div>
            <label className="label" htmlFor="exam-title">Exam title</label>
            <input
              id="exam-title"
              className="input"
              required
              minLength={2}
              placeholder="Midterm — Data Structures & Algorithms"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="exam-course">Course</label>
              <select
                id="exam-course"
                className="input"
                value={form.course_id}
                onChange={(event) => setForm({ ...form, course_id: event.target.value })}
              >
                <option value="">No specific course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code ? `${course.code} — ` : ""}
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="exam-type">Type</label>
              <select
                id="exam-type"
                className="input"
                value={form.exam_type}
                onChange={(event) => setForm({ ...form, exam_type: event.target.value })}
              >
                <option value="quiz">Quiz</option>
                <option value="midterm">Midterm</option>
                <option value="endsem">Endsem</option>
                <option value="viva">Viva</option>
                <option value="practical">Practical</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="exam-date">Date</label>
              <input
                id="exam-date"
                type="date"
                className="input"
                required
                value={form.exam_date}
                onChange={(event) => setForm({ ...form, exam_date: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="exam-time">Start time (optional)</label>
              <input
                id="exam-time"
                className="input"
                placeholder="09:00"
                value={form.start_time}
                onChange={(event) => setForm({ ...form, start_time: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="exam-weight">Weight (%) optional</label>
              <input
                id="exam-weight"
                type="number"
                min={0}
                max={100}
                className="input"
                placeholder="30"
                value={form.weight}
                onChange={(event) => setForm({ ...form, weight: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="exam-location">Location (optional)</label>
              <input
                id="exam-location"
                className="input"
                placeholder="Lecture Hall 2"
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="exam-syllabus">Syllabus notes (optional)</label>
            <textarea
              id="exam-syllabus"
              className="input"
              rows={3}
              placeholder="Units 1–3, emphasis on graph algorithms. Add only what the instructor confirmed."
              value={form.syllabus}
              onChange={(event) => setForm({ ...form, syllabus: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="exam-notes">Private notes (optional)</label>
            <textarea
              id="exam-notes"
              className="input"
              rows={2}
              placeholder="Room change, allowed materials, or a reminder."
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(aiExam)}
        onClose={() => setAiExam(null)}
        title={aiTitle || "Exam priorities"}
        description={
          aiExam
            ? `Informed guesses based on your recorded syllabus — not a guarantee of exam content.`
            : undefined
        }
        size="xl"
      >
        {aiLoading ? (
          <div className="space-y-3 py-4">
            <LoadingBlock lines={3} />
            <LoadingBlock lines={4} />
          </div>
        ) : aiContent ? (
          <Markdown>{aiContent}</Markdown>
        ) : (
          <p className="py-6 text-center text-[0.8rem] text-[#6d747d]">No content returned.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
        title="Delete this exam?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed from your plan.` : ""}
        confirmLabel="Delete exam"
        busy={deleting}
      />
    </div>
  );
}
