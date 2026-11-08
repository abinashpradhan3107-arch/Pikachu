"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Chip, PageHeader, StatCard } from "@/components/ui/page";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, localDateString } from "@/lib/client";
import type { Assignment, Course } from "@/lib/types";
import { cn, daysBetween, formatDate, relativeDay } from "@/lib/utils";

type AssignmentForm = {
  title: string;
  course_id: string;
  due_at: string;
  description: string;
  source_url: string;
};

const EMPTY_FORM: AssignmentForm = {
  title: "",
  course_id: "",
  due_at: "",
  description: "",
  source_url: "",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "badge-accent",
  submitted: "badge-blue",
  graded: "badge-green",
  missed: "badge-red",
};

const FILTERS = ["all", "pending", "submitted", "graded", "missed"] as const;
type Filter = (typeof FILTERS)[number];

function dueDateInput(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : localDateString(date);
}

export function AssignmentsView({ today }: { today: string }) {
  const toast = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState<AssignmentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [guideTarget, setGuideTarget] = useState<Assignment | null>(null);
  const [guideContent, setGuideContent] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [assignmentData, courseData] = await Promise.all([
        apiFetch<{ assignments: Assignment[] }>("/api/assignments"),
        apiFetch<{ courses: Course[] }>("/api/courses"),
      ]);
      setAssignments(assignmentData.assignments);
      setCourses(courseData.courses);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const pending = assignments.filter((item) => item.status === "pending");
    const overdue = pending.filter(
      (item) => item.due_at && dueDateInput(item.due_at) < today,
    ).length;
    const week = pending.filter((item) => {
      if (!item.due_at) return false;
      const diff = daysBetween(today, dueDateInput(item.due_at));
      return diff >= 0 && diff <= 7;
    }).length;
    return {
      pending: pending.length,
      overdue,
      week,
      done: assignments.filter((item) => item.status === "submitted" || item.status === "graded").length,
    };
  }, [assignments, today]);

  const visible = useMemo(() => {
    const list =
      filter === "all" ? assignments : assignments.filter((item) => item.status === filter);
    return [...list].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
    });
  }, [assignments, filter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(assignment: Assignment) {
    setEditing(assignment);
    setForm({
      title: assignment.title,
      course_id: assignment.course_id ?? "",
      due_at: dueDateInput(assignment.due_at),
      description: assignment.description ?? "",
      source_url: assignment.source_url ?? "",
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
        due_at: form.due_at || null,
        description: form.description.trim() || null,
        source_url: form.source_url.trim() || null,
      };
      if (editing) {
        await apiFetch(`/api/assignments/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Assignment updated");
      } else {
        await apiFetch("/api/assignments", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Assignment added", "It will appear in your plan and dashboard.");
      }
      setModalOpen(false);
      await load();
    } catch (caught) {
      toast.error("Could not save the assignment", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(assignment: Assignment, status: string) {
    setBusyId(assignment.id);
    try {
      await apiFetch(`/api/assignments/${assignment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setAssignments((current) =>
        current.map((item) => (item.id === assignment.id ? { ...item, status } : item)),
      );
      toast.success(`Marked ${status}`);
    } catch (caught) {
      toast.error("Could not update the assignment", errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/assignments/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Assignment deleted");
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the assignment", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function generateGuide(assignment: Assignment) {
    setGuideTarget(assignment);
    setGuideContent("");
    setGuideLoading(true);
    try {
      const result = await apiFetch<{ markdown?: string }>("/api/ai/tool", {
        method: "POST",
        body: JSON.stringify({
          tool: "assignment",
          courseId: assignment.course_id,
          topic: assignment.title,
          question: `${assignment.title}\n\n${assignment.description ?? ""}`.trim(),
        }),
      });
      setGuideContent(result.markdown ?? "");
    } catch (caught) {
      const message = errorMessage(caught);
      setGuideContent(`> ${message}`);
      toast.error("Could not generate a guide", message);
    } finally {
      setGuideLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
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
        title="Could not load assignments"
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
        eyebrow="Academics"
        title="Assignments"
        description="Track real deadlines and submission state. Moodle imports are labelled — manual entries are never presented as LMS data."
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="size-4" /> Add assignment
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardList} label="Pending" value={counts.pending} hint="Still open" accent="#e7b44b" />
        <StatCard
          icon={CalendarDays}
          label="Due this week"
          value={counts.week}
          hint="Within the next 7 days"
          accent="#7aa2ff"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={counts.overdue}
          hint={counts.overdue ? "Reschedule or submit" : "Nothing overdue"}
          accent="#f08a8a"
        />
        <StatCard
          icon={CheckCircle2}
          label="Submitted / graded"
          value={counts.done}
          hint="Completed items"
          accent="#6ee7b7"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Chip key={item} active={filter === item} onClick={() => setFilter(item)}>
            {item === "all" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
            {item !== "all"
              ? ` · ${assignments.filter((assignment) => assignment.status === item).length}`
              : ` · ${assignments.length}`}
          </Chip>
        ))}
      </div>

      {!visible.length ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === "all" ? "No assignments yet" : `No ${filter} assignments`}
          description={
            filter === "all"
              ? "Add an assignment manually, or connect Moodle to import official deadlines."
              : "Try another filter, or add a new assignment."
          }
          action={
            filter === "all" ? (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus className="size-4" /> Add assignment
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setFilter("all")}>
                Show all
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((assignment) => {
            const course = courses.find((item) => item.id === assignment.course_id);
            const due = dueDateInput(assignment.due_at);
            const overdue = assignment.status === "pending" && due && due < today;
            const dueSoon =
              assignment.status === "pending" && due && due >= today && daysBetween(today, due) <= 2;
            return (
              <article
                key={assignment.id}
                className={cn(
                  "surface p-3.5 transition-colors",
                  assignment.status === "graded" || assignment.status === "submitted"
                    ? "opacity-75"
                    : "surface-hover",
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      void setStatus(
                        assignment,
                        assignment.status === "submitted" ? "pending" : "submitted",
                      )
                    }
                    disabled={busyId === assignment.id}
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      assignment.status === "submitted" || assignment.status === "graded"
                        ? "border-[#6ee7b7]/40 bg-[#6ee7b7]/15 text-[#6ee7b7]"
                        : "border-white/20 text-transparent hover:border-[#e7b44b]/60 hover:text-[#e7b44b]",
                    )}
                    aria-label={
                      assignment.status === "submitted" ? "Mark pending" : "Mark submitted"
                    }
                  >
                    {busyId === assignment.id ? (
                      <Loader2 className="size-3 animate-spin text-[#9aa1aa]" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p
                        className={cn(
                          "text-[0.84rem] font-medium text-[#f2f2ef]",
                          (assignment.status === "submitted" || assignment.status === "graded") &&
                            "line-through opacity-70",
                        )}
                      >
                        {assignment.title}
                      </p>
                      <span
                        className={cn(
                          "badge px-1.5 py-0.5 text-[0.56rem]",
                          STATUS_STYLES[assignment.status] ?? "badge",
                        )}
                      >
                        {assignment.status}
                      </span>
                      {assignment.source === "moodle" ? (
                        <span className="badge badge-blue px-1.5 py-0.5 text-[0.54rem]">LMS</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.66rem] text-[#6d747d]">
                      <span>{course ? course.title : "General"}</span>
                      {due ? (
                        <>
                          <span>·</span>
                          <span
                            className={cn(
                              overdue && "font-medium text-[#ffb4b4]",
                              dueSoon && !overdue && "font-medium text-[#f3c96b]",
                            )}
                          >
                            Due {formatDate(due)}
                            {assignment.status === "pending" ? ` · ${relativeDay(due, today)}` : ""}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>·</span>
                          <span>No due date</span>
                        </>
                      )}
                    </p>
                    {assignment.description ? (
                      <p className="mt-1 line-clamp-2 text-[0.72rem] leading-relaxed text-[#9aa1aa]">
                        {assignment.description}
                      </p>
                    ) : null}
                    {assignment.source_url ? (
                      <a
                        href={assignment.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[0.66rem] font-medium text-[#f3c96b] hover:underline"
                      >
                        Open source <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void generateGuide(assignment)}
                    >
                      <Sparkles className="size-3.5" /> Guide
                    </button>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon p-1.5"
                        onClick={() => openEdit(assignment)}
                        aria-label={`Edit ${assignment.title}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon p-1.5 hover:text-[#f08a8a]"
                        onClick={() => setDeleteTarget(assignment)}
                        aria-label={`Delete ${assignment.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[0.7rem] leading-relaxed text-[#6d747d]">
        Need official deadlines?{" "}
        <Link href="/lms" className="font-medium text-[#f3c96b] hover:underline">
          Connect Moodle
        </Link>{" "}
        with a web-services token. Cortex never bypasses your institution&apos;s login.
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit assignment" : "Add an assignment"}
        description="Record the deadline exactly as announced. Do not invent dates."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="assignment-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editing ? "Save changes" : "Add assignment"}
            </button>
          </>
        }
      >
        <form id="assignment-form" onSubmit={save} className="space-y-3">
          <div>
            <label className="label" htmlFor="assignment-title">Title</label>
            <input
              id="assignment-title"
              className="input"
              required
              minLength={2}
              placeholder="Lab report 4 — op-amp circuits"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="assignment-course">Course</label>
              <select
                id="assignment-course"
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
              <label className="label" htmlFor="assignment-due">Due date</label>
              <input
                id="assignment-due"
                type="date"
                className="input"
                value={form.due_at}
                onChange={(event) => setForm({ ...form, due_at: event.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="assignment-description">Description or brief</label>
            <textarea
              id="assignment-description"
              className="input"
              rows={4}
              placeholder="Paste the assignment question or a short brief. This powers the AI guide."
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="assignment-url">Source URL (optional)</label>
            <input
              id="assignment-url"
              type="url"
              className="input"
              placeholder="https://…"
              value={form.source_url}
              onChange={(event) => setForm({ ...form, source_url: event.target.value })}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(guideTarget)}
        onClose={() => setGuideTarget(null)}
        title={guideTarget ? `Assignment guide — ${guideTarget.title}` : "Assignment guide"}
        description="A structured way to understand the task. It will not write a submission for you."
        size="xl"
      >
        {guideLoading ? (
          <div className="space-y-3 py-4">
            <LoadingBlock lines={3} />
            <LoadingBlock lines={4} />
          </div>
        ) : guideContent ? (
          <Markdown>{guideContent}</Markdown>
        ) : (
          <p className="py-6 text-center text-[0.8rem] text-[#6d747d]">No content returned.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
        title="Delete this assignment?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete assignment"
        busy={deleting}
      />
    </div>
  );
}
