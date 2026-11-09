"use client";

import {
  AlertTriangle,
  FileText,
  ListChecks,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Chip, PageHeader } from "@/components/ui/page";
import { QuizRunner } from "@/components/ui/quiz-runner";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import { recordQuizAttempt } from "@/lib/quiz-tracking";
import type { Course, Note, Quiz, QuizQuestion } from "@/lib/types";
import { cn, formatDateTime, safeJsonParse, truncate } from "@/lib/utils";

type Tab = "notes" | "quizzes";

const KIND_STYLES: Record<string, string> = {
  note: "badge",
  revision: "badge-blue",
  summary: "badge-accent",
  briefing: "badge-green",
  coach: "badge",
};

function kindLabel(kind: string): string {
  return kind
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function excerpt(content: string): string {
  return truncate(
    content
      .replace(/```[\s\S]*?```/g, " [code] ")
      .replace(/[#>*_`~-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    180,
  );
}

export function NotesView() {
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
  const [search, setSearch] = useState("");
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", content: "", courseId: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);
  const [deleteQuizTarget, setDeleteQuizTarget] = useState<Quiz | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [notesData, courseData] = await Promise.all([
        apiFetch<{ notes: Note[]; quizzes: Quiz[] }>("/api/notes"),
        apiFetch<{ courses: Course[] }>("/api/courses"),
      ]);
      setNotes(notesData.notes);
      setQuizzes(notesData.quizzes);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "quizzes") setTab("quizzes");
  }, []);

  const visibleNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) =>
      `${note.title} ${note.content} ${note.kind}`.toLowerCase().includes(query),
    );
  }, [notes, search]);

  const visibleQuizzes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return quizzes;
    return quizzes.filter((quiz) => quiz.title.toLowerCase().includes(query));
  }, [quizzes, search]);

  function courseName(courseId: string | null): string {
    if (!courseId) return "General";
    return courses.find((course) => course.id === courseId)?.title ?? "General";
  }

  async function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/notes", {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title.trim(),
          content: createForm.content.trim(),
          course_id: createForm.courseId || null,
          kind: "note",
        }),
      });
      toast.success("Note saved");
      setCreateOpen(false);
      setCreateForm({ title: "", content: "", courseId: "" });
      await load();
    } catch (caught) {
      toast.error("Could not save the note", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(note: Note) {
    setEditing(note);
    setEditForm({ title: note.title, content: note.content });
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch(`/api/notes/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editForm.title.trim(), content: editForm.content.trim() }),
      });
      toast.success("Note updated");
      setEditing(null);
      await load();
    } catch (caught) {
      toast.error("Could not update the note", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeNote() {
    if (!deleteNoteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/notes/${deleteNoteTarget.id}`, { method: "DELETE" });
      toast.success("Note deleted");
      if (activeNote?.id === deleteNoteTarget.id) setActiveNote(null);
      setDeleteNoteTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the note", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function removeQuiz() {
    if (!deleteQuizTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/quizzes/${deleteQuizTarget.id}`, { method: "DELETE" });
      toast.success("Quiz deleted");
      if (activeQuiz?.id === deleteQuizTarget.id) setActiveQuiz(null);
      setDeleteQuizTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the quiz", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load your library"
        description={error}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  const activeQuizQuestions = activeQuiz
    ? safeJsonParse<QuizQuestion[]>(activeQuiz.questions_json, [])
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Notes & quizzes"
        description="Everything you save from AI tools and chat lives here. Notes are editable and quizzes stay interactive."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New note
          </button>
        }
      />

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={tab === "notes"} onClick={() => setTab("notes")}>
            Notes · {notes.length}
          </Chip>
          <Chip active={tab === "quizzes"} onClick={() => setTab("quizzes")}>
            Quizzes · {quizzes.length}
          </Chip>
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6d747d]" />
          <input
            className="input pl-9"
            placeholder={tab === "notes" ? "Search notes…" : "Search quizzes…"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {tab === "notes" ? (
        !visibleNotes.length ? (
          <EmptyState
            icon={NotebookPen}
            title={notes.length ? "No notes match your search" : "No notes yet"}
            description={
              notes.length
                ? "Try a different search term."
                : "Generate revision notes from AI Tools, or write your own note here."
            }
            action={
              notes.length ? (
                <button type="button" className="btn btn-secondary" onClick={() => setSearch("")}>
                  Clear search
                </button>
              ) : (
                <>
                  <Link href="/tools" className="btn btn-primary">
                    <NotebookPen className="size-4" /> Generate notes
                  </Link>
                  <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" /> Write a note
                  </button>
                </>
              )
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleNotes.map((note) => (
              <article key={note.id} className="surface surface-hover flex flex-col overflow-hidden">
                <button
                  type="button"
                  className="flex-1 px-3.5 pt-3.5 text-left"
                  onClick={() => setActiveNote(note)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", KIND_STYLES[note.kind] ?? "badge")}>
                      {kindLabel(note.kind)}
                    </span>
                    <span className="text-[0.62rem] text-[#555c66]">{formatDateTime(note.updated_at)}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-[0.88rem] font-semibold leading-snug text-[#f2f2ef]">
                    {note.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-4 text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                    {excerpt(note.content)}
                  </p>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] px-3.5 py-2.5">
                  <span className="truncate text-[0.66rem] text-[#6d747d]">{courseName(note.course_id)}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon p-1.5"
                      aria-label={`Edit ${note.title}`}
                      onClick={() => openEdit(note)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon p-1.5 hover:text-[#f08a8a]"
                      aria-label={`Delete ${note.title}`}
                      onClick={() => setDeleteNoteTarget(note)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : !visibleQuizzes.length ? (
        <EmptyState
          icon={ListChecks}
          title={quizzes.length ? "No quizzes match your search" : "No quizzes yet"}
          description={
            quizzes.length
              ? "Try a different search term."
              : "Generate a practice quiz from AI Tools. Every quiz is saved here so you can retake it."
          }
          action={
            quizzes.length ? (
              <button type="button" className="btn btn-secondary" onClick={() => setSearch("")}>
                Clear search
              </button>
            ) : (
              <Link href="/tools" className="btn btn-primary">
                <ListChecks className="size-4" /> Generate a quiz
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleQuizzes.map((quiz) => {
            const questions = safeJsonParse<QuizQuestion[]>(quiz.questions_json, []);
            return (
              <article key={quiz.id} className="surface surface-hover flex flex-col overflow-hidden">
                <button
                  type="button"
                  className="flex-1 px-3.5 pt-3.5 text-left"
                  onClick={() => setActiveQuiz(quiz)}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg border border-[#7aa2ff]/20 bg-[#7aa2ff]/10 text-[#7aa2ff]">
                      <ListChecks className="size-3.5" />
                    </span>
                    <span className="badge badge-blue px-1.5 py-0.5 text-[0.56rem]">
                      {questions.length} question{questions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-[0.88rem] font-semibold leading-snug text-[#f2f2ef]">
                    {quiz.title}
                  </h3>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-[#9aa1aa]">
                    {courseName(quiz.course_id)} · created {formatDateTime(quiz.created_at)}
                  </p>
                  <p className="mt-2 text-[0.72rem] font-medium text-[#f3c96b]">Open and practise →</p>
                </button>
                <div className="flex items-center justify-end border-t border-white/[0.06] px-3.5 py-2.5">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon p-1.5 hover:text-[#f08a8a]"
                    aria-label={`Delete ${quiz.title}`}
                    onClick={() => setDeleteQuizTarget(quiz)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[0.7rem] leading-relaxed text-[#6d747d]">
        Looking for imported course material? PDFs and pasted text are managed from the{" "}
        <Link href="/lms" className="font-medium text-[#f3c96b] hover:underline">
          LMS &amp; imports
        </Link>{" "}
        page.
      </div>

      <Modal
        open={Boolean(activeNote)}
        onClose={() => setActiveNote(null)}
        title={activeNote?.title ?? "Note"}
        description={activeNote ? `${kindLabel(activeNote.kind)} · ${courseName(activeNote.course_id)}` : undefined}
        size="xl"
        footer={
          activeNote ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  openEdit(activeNote);
                  setActiveNote(null);
                }}
              >
                <Pencil className="size-4" /> Edit
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setActiveNote(null)}>
                Done
              </button>
            </>
          ) : undefined
        }
      >
        {activeNote ? <Markdown>{activeNote.content}</Markdown> : null}
      </Modal>

      <Modal
        open={Boolean(activeQuiz)}
        onClose={() => setActiveQuiz(null)}
        title={activeQuiz?.title ?? "Quiz"}
        description={activeQuiz ? `${courseName(activeQuiz.course_id)} · ${activeQuizQuestions.length} questions` : undefined}
        size="xl"
      >
        {activeQuiz ? (
          <QuizRunner
            questions={activeQuizQuestions}
            onSubmitted={({ score, total }) =>
              recordQuizAttempt({
                score,
                total,
                courseId: activeQuiz.course_id,
                quizTitle: activeQuiz.title,
              })
            }
          />
        ) : null}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Write a note"
        description="A plain note. Markdown is supported."
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="create-note-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Save note
            </button>
          </>
        }
      >
        <form id="create-note-form" onSubmit={createNote} className="space-y-3">
          <div>
            <label className="label" htmlFor="note-title">Title</label>
            <input
              id="note-title"
              className="input"
              required
              placeholder="e.g. Thermodynamics — key cycles"
              value={createForm.title}
              onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="note-course">Course</label>
            <select
              id="note-course"
              className="input"
              value={createForm.courseId}
              onChange={(event) => setCreateForm({ ...createForm, courseId: event.target.value })}
            >
              <option value="">General</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code ? `${course.code} — ` : ""}
                  {course.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="note-content">Content</label>
            <textarea
              id="note-content"
              className="input"
              rows={12}
              required
              placeholder="Write in Markdown. Headings, lists, formulas, and code blocks are supported."
              value={createForm.content}
              onChange={(event) => setCreateForm({ ...createForm, content: event.target.value })}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit note"
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="edit-note-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              Save changes
            </button>
          </>
        }
      >
        <form id="edit-note-form" onSubmit={saveEdit} className="space-y-3">
          <div>
            <label className="label" htmlFor="edit-note-title">Title</label>
            <input
              id="edit-note-title"
              className="input"
              required
              value={editForm.title}
              onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-note-content">Content</label>
            <textarea
              id="edit-note-content"
              className="input"
              rows={14}
              required
              value={editForm.content}
              onChange={(event) => setEditForm({ ...editForm, content: event.target.value })}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteNoteTarget)}
        onClose={() => setDeleteNoteTarget(null)}
        onConfirm={() => void removeNote()}
        title="Delete this note?"
        description={deleteNoteTarget ? `“${deleteNoteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete note"
        busy={deleting}
      />

      <ConfirmDialog
        open={Boolean(deleteQuizTarget)}
        onClose={() => setDeleteQuizTarget(null)}
        onConfirm={() => void removeQuiz()}
        title="Delete this quiz?"
        description={deleteQuizTarget ? `“${deleteQuizTarget.title}” and its questions will be removed.` : ""}
        confirmLabel="Delete quiz"
        busy={deleting}
      />
    </div>
  );
}
