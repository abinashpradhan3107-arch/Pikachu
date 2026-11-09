"use client";

import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import { chapterPriorityBand } from "@/lib/plan/priority";
import type { Chapter, Course, Exam, Resource } from "@/lib/types";
import { COURSE_COLORS, cn, daysBetween, minutesToLabel, pct, statusLabel } from "@/lib/utils";

type CourseForm = {
  code: string;
  title: string;
  description: string;
  instructor: string;
  credits: string;
  color: string;
};

type ChapterForm = {
  title: string;
  unit: string;
  status: string;
  difficulty: string;
  confidence: string;
  estimated_minutes: string;
  notes: string;
};

const EMPTY_COURSE: CourseForm = {
  code: "",
  title: "",
  description: "",
  instructor: "",
  credits: "",
  color: COURSE_COLORS[0],
};

const EMPTY_CHAPTER: ChapterForm = {
  title: "",
  unit: "",
  status: "not_started",
  difficulty: "medium",
  confidence: "3",
  estimated_minutes: "60",
  notes: "",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "badge-green",
  in_progress: "badge-accent",
  not_started: "badge",
};

const DIFFICULTY_STYLES: Record<string, string> = {
  hard: "badge-red",
  medium: "badge-accent",
  easy: "badge-green",
};

type MatrixEntry = {
  chapter: Chapter;
  course: Course | null;
  score: number;
  reasons: string[];
};

export function CoursesView({
  today,
  weakSubjects,
}: {
  today: string;
  weakSubjects: string[];
}) {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [courseModal, setCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState<CourseForm>(EMPTY_COURSE);
  const [chapterModal, setChapterModal] = useState(false);
  const [chapterCourse, setChapterCourse] = useState<Course | null>(null);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [chapterForm, setChapterForm] = useState<ChapterForm>(EMPTY_CHAPTER);
  const [saving, setSaving] = useState(false);
  const [deleteCourseTarget, setDeleteCourseTarget] = useState<Course | null>(null);
  const [deleteChapterTarget, setDeleteChapterTarget] = useState<Chapter | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [courseData, chapterData, resourceData, examData] = await Promise.all([
        apiFetch<{ courses: Course[] }>("/api/courses"),
        apiFetch<{ chapters: Chapter[] }>("/api/chapters"),
        // Additive LMS and exam data: if either call fails the courses must
        // still render, so they degrade to empty lists instead of erroring.
        apiFetch<{ resources: Resource[] }>("/api/resources").catch(() => ({
          resources: [] as Resource[],
        })),
        apiFetch<{ exams: Exam[] }>("/api/exams").catch(() => ({ exams: [] as Exam[] })),
      ]);
      setCourses(courseData.courses);
      setChapters(chapterData.chapters);
      setResources(resourceData.resources);
      setExams(examData.exams);
      setExpanded((current) => {
        if (current.size) return current;
        return new Set(courseData.courses.slice(0, 2).map((course) => course.id));
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chaptersByCourse = useMemo(() => {
    const map = new Map<string, Chapter[]>();
    for (const chapter of chapters) {
      const list = map.get(chapter.course_id) ?? [];
      list.push(chapter);
      map.set(chapter.course_id, list);
    }
    return map;
  }, [chapters]);

  const courseById = useMemo(() => {
    const map = new Map<string, Course>();
    for (const course of courses) map.set(course.id, course);
    return map;
  }, [courses]);

  // Synced-from-LMS material only. Manual resources are untouched here.
  const lmsLectures = useMemo(
    () => resources.filter((item) => item.source === "lms" && item.kind === "lecture"),
    [resources],
  );
  const lmsNotes = useMemo(
    () => resources.filter((item) => item.source === "lms" && item.kind === "note"),
    [resources],
  );
  // Catch-up backlog: lectures the extension synced but never marked watched.
  const backlog = useMemo(() => lmsLectures.filter((item) => !item.watched_at), [lmsLectures]);

  // Nearest upcoming exam per course - drives both the countdown and the
  // exam-proximity boost in the priority matrix.
  const examByCourse = useMemo(() => {
    const map = new Map<string, { exam: Exam; days: number }>();
    for (const exam of exams) {
      if (!exam.course_id) continue;
      const days = daysBetween(today, exam.exam_date.slice(0, 10));
      if (days < 0) continue;
      const existing = map.get(exam.course_id);
      if (!existing || days < existing.days) map.set(exam.course_id, { exam, days });
    }
    return map;
  }, [exams, today]);

  const nearestExam = useMemo(() => {
    let best: { exam: Exam; days: number } | null = null;
    for (const entry of examByCourse.values()) {
      if (!best || entry.days < best.days) best = entry;
    }
    return best;
  }, [examByCourse]);

  // High / Medium / Low matrix computed with the SAME function the planning
  // engine uses (src/lib/plan/priority.ts), so what is shown is what is
  // scheduled - not a second copy of the rules.
  const priorityMatrix = useMemo(() => {
    const bands: Record<"high" | "medium" | "low", MatrixEntry[]> = {
      high: [],
      medium: [],
      low: [],
    };
    for (const chapter of chapters) {
      const course = courseById.get(chapter.course_id) ?? null;
      const nearest = examByCourse.get(chapter.course_id);
      const weak = weakSubjects.some((subject) => {
        const needle = subject.trim().toLowerCase();
        if (!needle) return false;
        return (
          chapter.title.toLowerCase().includes(needle) ||
          (course?.title ?? "").toLowerCase().includes(needle)
        );
      });
      const result = chapterPriorityBand({
        chapter,
        daysToExam: nearest ? nearest.days : null,
        isWeakSubject: weak,
      });
      bands[result.band].push({ chapter, course, score: result.score, reasons: result.reasons });
    }
    for (const band of ["high", "medium", "low"] as const) {
      bands[band].sort((a, b) => b.score - a.score);
    }
    return bands;
  }, [chapters, courseById, examByCourse, weakSubjects]);

  function openCreateCourse() {
    setEditingCourse(null);
    setCourseForm(EMPTY_COURSE);
    setCourseModal(true);
  }

  function openEditCourse(course: Course) {
    setEditingCourse(course);
    setCourseForm({
      code: course.code ?? "",
      title: course.title,
      description: course.description ?? "",
      instructor: course.instructor ?? "",
      credits: course.credits != null ? String(course.credits) : "",
      color: course.color ?? COURSE_COLORS[0],
    });
    setCourseModal(true);
  }

  async function saveCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: courseForm.code.trim() || null,
        title: courseForm.title.trim(),
        description: courseForm.description.trim() || null,
        instructor: courseForm.instructor.trim() || null,
        credits: courseForm.credits ? Number(courseForm.credits) : null,
        color: courseForm.color,
      };
      if (editingCourse) {
        await apiFetch(`/api/courses/${editingCourse.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Course updated", payload.title);
      } else {
        await apiFetch("/api/courses", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Course added", "Add chapters to make planning specific.");
      }
      setCourseModal(false);
      await load();
    } catch (caught) {
      toast.error("Could not save the course", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeCourse() {
    if (!deleteCourseTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/courses/${deleteCourseTarget.id}`, { method: "DELETE" });
      toast.success("Course deleted", "Its chapters and tasks were removed too.");
      setDeleteCourseTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the course", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  function openCreateChapter(course: Course) {
    setChapterCourse(course);
    setEditingChapter(null);
    setChapterForm(EMPTY_CHAPTER);
    setChapterModal(true);
  }

  function openEditChapter(course: Course, chapter: Chapter) {
    setChapterCourse(course);
    setEditingChapter(chapter);
    setChapterForm({
      title: chapter.title,
      unit: chapter.unit ?? "",
      status: chapter.status,
      difficulty: chapter.difficulty,
      confidence: String(chapter.confidence),
      estimated_minutes: String(chapter.estimated_minutes),
      notes: chapter.notes ?? "",
    });
    setChapterModal(true);
  }

  async function saveChapter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chapterCourse) return;
    setSaving(true);
    try {
      const payload = {
        title: chapterForm.title.trim(),
        unit: chapterForm.unit.trim() || null,
        status: chapterForm.status,
        difficulty: chapterForm.difficulty,
        confidence: Number(chapterForm.confidence),
        estimated_minutes: Number(chapterForm.estimated_minutes),
        notes: chapterForm.notes.trim() || null,
      };
      if (editingChapter) {
        await apiFetch(`/api/chapters/${editingChapter.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Chapter updated");
      } else {
        await apiFetch("/api/chapters", {
          method: "POST",
          body: JSON.stringify({ ...payload, course_id: chapterCourse.id }),
        });
        toast.success("Chapter added", `Added to ${chapterCourse.title}.`);
      }
      setChapterModal(false);
      await load();
    } catch (caught) {
      toast.error("Could not save the chapter", errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeChapter() {
    if (!deleteChapterTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/chapters/${deleteChapterTarget.id}`, { method: "DELETE" });
      toast.success("Chapter deleted");
      setDeleteChapterTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the chapter", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function quickStatus(chapter: Chapter, status: string) {
    try {
      await apiFetch(`/api/chapters/${chapter.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setChapters((current) =>
        current.map((item) => (item.id === chapter.id ? { ...item, status } : item)),
      );
    } catch (caught) {
      toast.error("Could not update the chapter", errorMessage(caught));
    }
  }

  // Two-way "Mark as watched" toggle on a synced lecture. The row itself is
  // never deleted - un-toggling only clears watched_at.
  async function toggleWatched(resource: Resource) {
    const watched = !resource.watched_at;
    setWatching(resource.id);
    try {
      await apiFetch(`/api/resources/${resource.id}`, {
        method: "PATCH",
        body: JSON.stringify({ watched }),
      });
      setResources((current) =>
        current.map((item) =>
          item.id === resource.id
            ? { ...item, watched_at: watched ? new Date().toISOString() : null }
            : item,
        ),
      );
    } catch (caught) {
      toast.error("Could not update the lecture", errorMessage(caught));
    } finally {
      setWatching(null);
    }
  }

  function toggleCourse(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load your courses"
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
        title="Courses & syllabus"
        description="This is the source of truth for planning, revision, and AI answers. Record only what is real."
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreateCourse}>
            <Plus className="size-4" /> Add course
          </button>
        }
      />

      {lmsLectures.length ? (
        <section className="surface p-4">
          <SectionHeader
            title="Catch-up backlog"
            description={`${backlog.length} of ${lmsLectures.length} synced LMS lectures not marked as watched yet`}
            action={
              <Link href="/lms" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                Synced from LMS
              </Link>
            }
          />
          {backlog.length ? (
            <div className="space-y-1.5">
              {backlog.slice(0, 6).map((lecture) => (
                <LmsResourceRow
                  key={lecture.id}
                  resource={lecture}
                  busy={watching === lecture.id}
                  onToggle={toggleWatched}
                />
              ))}
              {backlog.length > 6 ? (
                <p className="pt-0.5 text-[0.64rem] text-[#6d747d]">
                  +{backlog.length - 6} more unwatched lecture{backlog.length - 6 === 1 ? "" : "s"} —
                  open a course below to see all of them.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="py-3 text-center text-[0.74rem] text-[#6d747d]">
              Nothing waiting. Every synced lecture is marked watched — new ones appear here
              automatically as the extension syncs them.
            </p>
          )}
        </section>
      ) : null}

      {!courses.length ? (
        <EmptyState
          icon={BookOpen}
          title="Add your first course"
          description="Courses and chapters let Cortex build a plan that is actually about your semester — not generic advice."
          action={
            <button type="button" className="btn btn-primary" onClick={openCreateCourse}>
              <Plus className="size-4" /> Add course
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {courses.map((course) => {
            const courseChapters = chaptersByCourse.get(course.id) ?? [];
            const completed = courseChapters.filter((chapter) => chapter.status === "completed").length;
            const progress = pct(completed, courseChapters.length);
            const isOpen = expanded.has(course.id);
            const courseLectures = lmsLectures.filter((item) => item.course_id === course.id);
            const courseNotes = lmsNotes.filter((item) => item.course_id === course.id);
            const chapterIds = new Set(courseChapters.map((chapter) => chapter.id));
            const unassigned = [...courseLectures, ...courseNotes].filter(
              (item) => !item.lms_module_id || !chapterIds.has(item.lms_module_id),
            );
            return (
              <section key={course.id} className="surface overflow-hidden">
                <div className="h-1 w-full" style={{ background: course.color ?? "var(--accent)" }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {course.code ? (
                          <span className="badge px-1.5 py-0.5 text-[0.6rem]">{course.code}</span>
                        ) : null}
                        {course.lms_source ? (
                          <span className="badge badge-blue px-1.5 py-0.5 text-[0.58rem]">
                            {course.lms_source}
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-1.5 truncate text-[1rem] font-semibold tracking-tight text-[#f2f2ef]">
                        {course.title}
                      </h2>
                      <p className="mt-0.5 text-[0.7rem] text-[#6d747d]">
                        {[course.instructor, course.credits != null ? `${course.credits} credits` : null]
                          .filter(Boolean)
                          .join(" · ") || "No instructor or credits recorded"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon p-1.5"
                        onClick={() => openEditCourse(course)}
                        aria-label={`Edit ${course.title}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon p-1.5 hover:text-[#f08a8a]"
                        onClick={() => setDeleteCourseTarget(course)}
                        aria-label={`Delete ${course.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {course.description ? (
                    <p className="mt-2 line-clamp-2 text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                      {course.description}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[0.68rem]">
                      <span className="text-[#9aa1aa]">
                        {completed} of {courseChapters.length} chapters complete
                      </span>
                      <span className="font-medium text-[#f2f2ef]">{progress}%</span>
                    </div>
                    <ProgressBar value={progress} color={course.color ?? "var(--accent)"} />
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm px-1.5"
                      onClick={() => toggleCourse(course.id)}
                    >
                      {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      {isOpen ? "Hide chapters" : "Show chapters"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openCreateChapter(course)}
                    >
                      <Plus className="size-3.5" /> Chapter
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="border-t border-white/[0.06] bg-black/15 px-3 py-2.5">
                    {courseChapters.length ? (
                      <div className="space-y-1.5">
                        {courseChapters.map((chapter) => (
                          <div
                            key={chapter.id}
                            className="group flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p
                                  className={cn(
                                    "text-[0.76rem] font-medium text-[#f2f2ef]",
                                    chapter.status === "completed" && "line-through opacity-70",
                                  )}
                                >
                                  {chapter.title}
                                </p>
                                <span
                                  className={cn(
                                    "badge px-1.5 py-0.5 text-[0.54rem]",
                                    STATUS_STYLES[chapter.status] ?? "badge",
                                  )}
                                >
                                  {statusLabel(chapter.status)}
                                </span>
                                <span
                                  className={cn(
                                    "badge px-1.5 py-0.5 text-[0.54rem]",
                                    DIFFICULTY_STYLES[chapter.difficulty] ?? "badge",
                                  )}
                                >
                                  {chapter.difficulty}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[0.62rem] text-[#6d747d]">
                                {chapter.unit ? `${chapter.unit} · ` : ""}
                                confidence {chapter.confidence}/5 · {chapter.estimated_minutes}m
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {chapter.status !== "completed" ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-icon p-1 text-[#6ee7b7] opacity-0 transition-opacity group-hover:opacity-100"
                                  onClick={() => void quickStatus(chapter, "completed")}
                                  aria-label="Mark complete"
                                >
                                  <GraduationCap className="size-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-icon p-1 text-[#6d747d] opacity-0 transition-opacity group-hover:opacity-100"
                                  onClick={() => void quickStatus(chapter, "in_progress")}
                                  aria-label="Reopen chapter"
                                >
                                  <Layers className="size-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon p-1 text-[#6d747d]"
                                onClick={() => openEditChapter(course, chapter)}
                                aria-label={`Edit ${chapter.title}`}
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon p-1 text-[#6d747d] hover:text-[#f08a8a]"
                                onClick={() => setDeleteChapterTarget(chapter)}
                                aria-label={`Delete ${chapter.title}`}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-3 text-center text-[0.72rem] text-[#6d747d]">
                        No chapters yet. Add the units you are actually covering.
                      </p>
                    )}

                    {courseLectures.length || courseNotes.length ? (
                      <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#6d747d]">
                            {"LMS Lectures & Resources"}
                          </p>
                          <span className="shrink-0 text-[0.6rem] text-[#6d747d]">
                            {courseLectures.filter((item) => !item.watched_at).length} unwatched
                          </span>
                        </div>
                        <div className="space-y-2">
                          {courseChapters.map((chapter) => {
                            const items = [
                              ...courseLectures.filter((item) => item.lms_module_id === chapter.id),
                              ...courseNotes.filter((item) => item.lms_module_id === chapter.id),
                            ];
                            if (!items.length) return null;
                            return (
                              <div key={chapter.id}>
                                <p className="mb-1 truncate text-[0.6rem] font-medium text-[#9aa1aa]">
                                  {chapter.title}
                                </p>
                                <div className="space-y-1.5">
                                  {items.map((item) => (
                                    <LmsResourceRow
                                      key={item.id}
                                      resource={item}
                                      busy={watching === item.id}
                                      onToggle={toggleWatched}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {unassigned.length ? (
                            <div>
                              <p className="mb-1 text-[0.6rem] font-medium text-[#9aa1aa]">
                                Not linked to a chapter yet
                              </p>
                              <div className="space-y-1.5">
                                {unassigned.map((item) => (
                                  <LmsResourceRow
                                    key={item.id}
                                    resource={item}
                                    busy={watching === item.id}
                                    onToggle={toggleWatched}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {chapters.length ? (
        <section className="surface p-4">
          <SectionHeader
            title="Topic priority matrix"
            description={
              nearestExam
                ? `Classified for ${nearestExam.exam.title} in ${nearestExam.days} day${
                    nearestExam.days === 1 ? "" : "s"
                  } — the exact ranking your daily plan schedules by.`
                : "The exact High / Medium / Low ranking your daily plan schedules by."
            }
            action={
              <Link href="/exams" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
                Exams
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["high", "High priority", "badge-red"],
                ["medium", "Medium priority", "badge-accent"],
                ["low", "Low priority", "badge-green"],
              ] as const
            ).map(([band, label, badgeClass]) => (
              <div key={band} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-[#f2f2ef]">
                    {band === "high" ? <Target className="size-3.5 text-[#f08a8a]" /> : null}
                    {label}
                  </p>
                  <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", badgeClass)}>
                    {priorityMatrix[band].length}
                  </span>
                </div>
                {priorityMatrix[band].length ? (
                  <ul className="space-y-1.5">
                    {priorityMatrix[band].slice(0, 6).map(({ chapter, course, reasons }) => (
                      <li
                        key={chapter.id}
                        className="rounded-md border border-white/[0.05] bg-black/20 px-2 py-1.5"
                      >
                        <p className="truncate text-[0.72rem] font-medium text-[#f2f2ef]">
                          {chapter.title}
                        </p>
                        <p className="mt-0.5 truncate text-[0.6rem] text-[#6d747d]">
                          {course?.code || course?.title || "—"} · {reasons.slice(0, 2).join(", ")}
                        </p>
                      </li>
                    ))}
                    {priorityMatrix[band].length > 6 ? (
                      <li className="text-[0.62rem] text-[#6d747d]">
                        +{priorityMatrix[band].length - 6} more
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="py-2 text-[0.66rem] text-[#6d747d]">Nothing in this band.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface p-4">
        <SectionHeader
          title="How chapters drive your plan"
          description="Confidence and difficulty are not decoration — they change what Cortex schedules first."
        />
        <div className="grid gap-2 text-[0.74rem] leading-relaxed text-[#9aa1aa] sm:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="mb-1 font-semibold text-[#f2f2ef]">Exam proximity</p>
            Chapters for a course with a nearby exam move up automatically.
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="mb-1 font-semibold text-[#f2f2ef]">Low confidence</p>
            Confidence 1–2 triggers extra practice and revision blocks.
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="mb-1 font-semibold text-[#f2f2ef]">Hard + untouched</p>
            Difficult chapters that have not started are surfaced as weak topics.
          </div>
        </div>
      </section>

      <Modal
        open={courseModal}
        onClose={() => setCourseModal(false)}
        title={editingCourse ? "Edit course" : "Add a course"}
        description="Use the real course title and code from your semester registration."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCourseModal(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="course-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editingCourse ? "Save changes" : "Add course"}
            </button>
          </>
        }
      >
        <form id="course-form" onSubmit={saveCourse} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[0.4fr_1fr]">
            <div>
              <label className="label" htmlFor="course-code">Course code</label>
              <input
                id="course-code"
                className="input"
                placeholder="CSL 201"
                value={courseForm.code}
                onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="course-title">Course title</label>
              <input
                id="course-title"
                className="input"
                required
                minLength={2}
                placeholder="Data Structures & Algorithms"
                value={courseForm.title}
                onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="course-instructor">Instructor (optional)</label>
              <input
                id="course-instructor"
                className="input"
                placeholder="Prof. …"
                value={courseForm.instructor}
                onChange={(event) => setCourseForm({ ...courseForm, instructor: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="course-credits">Credits (optional)</label>
              <input
                id="course-credits"
                type="number"
                min={0}
                max={30}
                step={0.5}
                className="input"
                value={courseForm.credits}
                onChange={(event) => setCourseForm({ ...courseForm, credits: event.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="course-description">Description (optional)</label>
            <textarea
              id="course-description"
              className="input"
              rows={2}
              placeholder="Scope, prerequisites, or anything useful to remember."
              value={courseForm.description}
              onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })}
            />
          </div>
          <div>
            <span className="label">Colour</span>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCourseForm({ ...courseForm, color })}
                  className={cn(
                    "size-7 rounded-full border-2 transition-transform",
                    courseForm.color === color ? "scale-110 border-white" : "border-transparent",
                  )}
                  style={{ background: color }}
                  aria-label={`Choose colour ${color}`}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={chapterModal}
        onClose={() => setChapterModal(false)}
        title={editingChapter ? "Edit chapter" : "Add a chapter"}
        description={chapterCourse ? `In ${chapterCourse.title}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setChapterModal(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="chapter-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editingChapter ? "Save changes" : "Add chapter"}
            </button>
          </>
        }
      >
        <form id="chapter-form" onSubmit={saveChapter} className="space-y-3">
          <div>
            <label className="label" htmlFor="chapter-title">Chapter or unit title</label>
            <input
              id="chapter-title"
              className="input"
              required
              placeholder="Graph traversal and shortest paths"
              value={chapterForm.title}
              onChange={(event) => setChapterForm({ ...chapterForm, title: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="chapter-unit">Module / unit (optional)</label>
              <input
                id="chapter-unit"
                className="input"
                placeholder="Unit 3"
                value={chapterForm.unit}
                onChange={(event) => setChapterForm({ ...chapterForm, unit: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="chapter-status">Status</label>
              <select
                id="chapter-status"
                className="input"
                value={chapterForm.status}
                onChange={(event) => setChapterForm({ ...chapterForm, status: event.target.value })}
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="chapter-difficulty">Difficulty</label>
              <select
                id="chapter-difficulty"
                className="input"
                value={chapterForm.difficulty}
                onChange={(event) => setChapterForm({ ...chapterForm, difficulty: event.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="chapter-confidence">Confidence (1–5)</label>
              <select
                id="chapter-confidence"
                className="input"
                value={chapterForm.confidence}
                onChange={(event) => setChapterForm({ ...chapterForm, confidence: event.target.value })}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} — {value <= 2 ? "shaky" : value === 3 ? "okay" : "solid"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="chapter-minutes">Estimated study time (minutes)</label>
              <input
                id="chapter-minutes"
                type="number"
                min={10}
                max={1200}
                className="input"
                value={chapterForm.estimated_minutes}
                onChange={(event) => setChapterForm({ ...chapterForm, estimated_minutes: event.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="chapter-notes">Notes (optional)</label>
            <textarea
              id="chapter-notes"
              className="input"
              rows={2}
              placeholder="What is actually covered, or what you find hard."
              value={chapterForm.notes}
              onChange={(event) => setChapterForm({ ...chapterForm, notes: event.target.value })}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteCourseTarget)}
        onClose={() => setDeleteCourseTarget(null)}
        onConfirm={() => void removeCourse()}
        title="Delete this course?"
        description={
          deleteCourseTarget
            ? `“${deleteCourseTarget.title}” and its chapters, tasks, exams, and assignments will be permanently removed.`
            : ""
        }
        confirmLabel="Delete course"
        busy={deleting}
      />

      <ConfirmDialog
        open={Boolean(deleteChapterTarget)}
        onClose={() => setDeleteChapterTarget(null)}
        onConfirm={() => void removeChapter()}
        title="Delete this chapter?"
        description={deleteChapterTarget ? `“${deleteChapterTarget.title}” will be removed.` : ""}
        confirmLabel="Delete chapter"
        busy={deleting}
      />
    </div>
  );
}

/**
 * One synced LMS row: lecture or attached note/slide. Read-only except the
 * "Mark as watched" toggle - nothing here can edit or delete synced data.
 */
function LmsResourceRow({
  resource,
  busy,
  onToggle,
}: {
  resource: Resource;
  busy: boolean;
  onToggle: (resource: Resource) => void;
}) {
  const isLecture = resource.kind === "lecture";
  const watched = Boolean(resource.watched_at);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
          !isLecture
            ? "bg-[#8ab4f8]/10 text-[#8ab4f8]"
            : watched
              ? "bg-[#6ee7b7]/10 text-[#6ee7b7]"
              : "bg-[#e7b44b]/10 text-[#e7b44b]",
        )}
      >
        {!isLecture ? (
          <FileText className="size-3.5" />
        ) : watched ? (
          <Check className="size-3.5" />
        ) : (
          <PlayCircle className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[0.74rem] font-medium text-[#f2f2ef]",
            isLecture && watched && "opacity-70",
          )}
        >
          {resource.title}
        </p>
        <p className="mt-0.5 text-[0.62rem] text-[#6d747d]">
          {resource.duration_minutes ? `${minutesToLabel(resource.duration_minutes)} · ` : ""}
          {!isLecture
            ? "Notes & material"
            : watched
              ? "Watched"
              : "Not watched yet"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {resource.url ? (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-icon p-1.5 text-[#f3c96b]"
            aria-label={`Open ${resource.title} in the LMS`}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
        {isLecture ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => onToggle(resource)}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}{" "}
            {watched ? "Mark unwatched" : "Mark watched"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
