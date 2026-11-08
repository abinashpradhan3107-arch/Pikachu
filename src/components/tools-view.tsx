"use client";

import {
  AlertTriangle,
  BookMarked,
  Check,
  ClipboardList,
  Copy,
  FileText,
  GraduationCap,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageSquareText,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/ui/page";
import { QuizRunner } from "@/components/ui/quiz-runner";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage, localDateString } from "@/lib/client";
import type { Chapter, Course, QuizQuestion, StudyTask } from "@/lib/types";
import { cn } from "@/lib/utils";

type ToolId =
  | "notes"
  | "quiz"
  | "explain"
  | "exam-predictor"
  | "assignment"
  | "revision"
  | "coach"
  | "daily-briefing"
  | "summarize";

type ToolDef = {
  id: ToolId;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const TOOLS: ToolDef[] = [
  {
    id: "notes",
    label: "Revision notes",
    description: "Structured notes with formulas, traps, and recall questions.",
    icon: NotebookPen,
    accent: "#e7b44b",
  },
  {
    id: "quiz",
    label: "Practice quiz",
    description: "Interactive MCQs with explanations and a score.",
    icon: ListChecks,
    accent: "#7aa2ff",
  },
  {
    id: "explain",
    label: "Explain a concept",
    description: "Intuition, analogy, formal definition, worked example.",
    icon: Lightbulb,
    accent: "#c4a7ff",
  },
  {
    id: "exam-predictor",
    label: "Exam priority map",
    description: "Rank recorded topics by leverage and build a revision sequence.",
    icon: GraduationCap,
    accent: "#f08a8a",
  },
  {
    id: "assignment",
    label: "Assignment guide",
    description: "Understand the brief and build a step-by-step plan.",
    icon: ClipboardList,
    accent: "#6ee7b7",
  },
  {
    id: "revision",
    label: "Active recall",
    description: "Diagnostic questions, traps, and a 20-minute drill.",
    icon: BookMarked,
    accent: "#7dd3fc",
  },
  {
    id: "coach",
    label: "Study coach",
    description: "A realistic check-in grounded in your actual progress.",
    icon: MessageSquareText,
    accent: "#f9a8d4",
  },
  {
    id: "daily-briefing",
    label: "Daily briefing",
    description: "A short morning briefing from today's generated plan.",
    icon: Sparkles,
    accent: "#a3e635",
  },
  {
    id: "summarize",
    label: "Summarize material",
    description: "Turn imported PDF or text into a tight revision summary.",
    icon: FileText,
    accent: "#e7b44b",
  },
];

const TOPIC_TOOLS: ToolId[] = ["notes", "quiz", "explain", "revision"];

type ToolResult = {
  kind: string;
  title: string;
  markdown?: string;
  noteId?: string | null;
  quizId?: string;
  questions?: QuizQuestion[];
};

export function ToolsView() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>("notes");
  const [courseId, setCourseId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topic, setTopic] = useState("");
  const [question, setQuestion] = useState("");
  const [material, setMaterial] = useState("");
  const [difficulty, setDifficulty] = useState("undergraduate IIT");
  const [count, setCount] = useState(8);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [courseData, chapterData, settingsData] = await Promise.all([
        apiFetch<{ courses: Course[] }>("/api/courses"),
        apiFetch<{ chapters: Chapter[] }>("/api/chapters"),
        apiFetch<{ settings: { configured: boolean } }>("/api/settings/ai"),
      ]);
      setCourses(courseData.courses);
      setChapters(chapterData.chapters);
      setAiConfigured(settingsData.settings.configured);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTool = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];
  const filteredChapters = useMemo(
    () => (courseId ? chapters.filter((chapter) => chapter.course_id === courseId) : chapters),
    [chapters, courseId],
  );

  function selectTool(next: ToolId) {
    setTool(next);
    setResult(null);
    setCopied(false);
  }

  function changeCourse(next: string) {
    setCourseId(next);
    if (next && chapterId) {
      const chapter = chapters.find((item) => item.id === chapterId);
      if (chapter && chapter.course_id !== next) setChapterId("");
    }
  }

  function changeChapter(next: string) {
    setChapterId(next);
    if (next) {
      const chapter = chapters.find((item) => item.id === next);
      if (chapter) {
        setTopic(chapter.title);
        if (!courseId) setCourseId(chapter.course_id);
      }
    }
  }

  async function run() {
    if (!aiConfigured) {
      toast.warning("Connect AI first", "Add an API key in Settings to use AI tools.");
      return;
    }
    if (TOPIC_TOOLS.includes(tool) && !topic.trim() && !chapterId && !courseId) {
      toast.warning("Add a topic", "Choose a chapter, course, or type a topic first.");
      return;
    }
    if (tool === "assignment" && !question.trim()) {
      toast.warning("Paste the brief", "Add the assignment question or brief first.");
      return;
    }
    if (tool === "summarize" && material.trim().length < 20) {
      toast.warning("Add material", "Paste at least a short passage to summarize.");
      return;
    }

    setRunning(true);
    setResult(null);
    setCopied(false);
    try {
      const payload: Record<string, unknown> = {
        tool,
        courseId: courseId || null,
        chapterId: chapterId || null,
        topic: topic.trim() || undefined,
      };
      if (tool === "quiz") {
        payload.difficulty = difficulty.trim() || undefined;
        payload.count = count;
      }
      if (tool === "assignment") payload.question = question.trim();
      if (tool === "summarize") payload.text = material.trim();
      if (tool === "daily-briefing") {
        const today = localDateString();
        const taskData = await apiFetch<{ tasks: StudyTask[] }>(`/api/tasks?date=${today}`);
        const planText = taskData.tasks.length
          ? taskData.tasks
              .map(
                (task, index) =>
                  `${index + 1}. [${task.status}] ${task.title} — ${task.duration_minutes} min, ${task.priority} priority${task.description ? `\n   ${task.description}` : ""}`,
              )
              .join("\n")
          : "No tasks are planned for today yet.";
        payload.planText = planText;
      }

      const response = await apiFetch<ToolResult>("/api/ai/tool", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(response);
      toast.success(
        tool === "quiz" ? "Quiz generated" : "Result ready",
        tool === "quiz" ? "Answer the questions, then check your score." : "Review it below.",
      );
    } catch (caught) {
      toast.error("The tool could not finish", errorMessage(caught));
    } finally {
      setRunning(false);
    }
  }

  async function copyResult() {
    if (!result?.markdown) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy", "Your browser blocked clipboard access.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="skeleton h-96 rounded-xl" />
          <div className="skeleton h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load AI tools"
        description={loadError}
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
        eyebrow="AI workspace"
        title="AI tools"
        description="Grounded in your recorded courses, chapters, exams, assignments, and plan. Results that are worth keeping are saved automatically."
      />

      {aiConfigured === false ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-[0.8rem] font-semibold text-[#f2f2ef]">AI is not connected</p>
              <p className="text-[0.74rem] text-[#9aa1aa]">
                Add an OpenAI-compatible API key in Settings. Keys are encrypted at rest and never sent to the browser.
              </p>
            </div>
          </div>
          <Link href="/settings" className="btn btn-secondary btn-sm shrink-0">
            Connect AI
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-1.5">
          {TOOLS.map((item) => {
            const active = item.id === tool;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTool(item.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-[#e7b44b]/30 bg-[#e7b44b]/[0.07]"
                    : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.16] hover:bg-white/[0.03]",
                )}
              >
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10"
                  style={{ background: `color-mix(in srgb, ${item.accent} 12%, transparent)`, color: item.accent }}
                >
                  <item.icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("text-[0.8rem] font-semibold", active ? "text-[#f3c96b]" : "text-[#f2f2ef]")}>
                      {item.label}
                    </span>
                    {active ? <Check className="size-3 text-[#e7b44b]" /> : null}
                  </span>
                  <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-[#6d747d]">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="space-y-4">
          <section className="surface p-4">
            <div className="mb-4 flex items-start gap-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10"
                style={{
                  background: `color-mix(in srgb, ${selectedTool.accent} 12%, transparent)`,
                  color: selectedTool.accent,
                }}
              >
                <selectedTool.icon className="size-4" />
              </span>
              <div>
                <h2 className="text-[0.95rem] font-semibold tracking-tight text-[#f2f2ef]">
                  {selectedTool.label}
                </h2>
                <p className="mt-0.5 text-[0.74rem] text-[#9aa1aa]">{selectedTool.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="tool-course">Course</label>
                  <select
                    id="tool-course"
                    className="input"
                    value={courseId}
                    onChange={(event) => changeCourse(event.target.value)}
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
                  <label className="label" htmlFor="tool-chapter">Chapter</label>
                  <select
                    id="tool-chapter"
                    className="input"
                    value={chapterId}
                    onChange={(event) => changeChapter(event.target.value)}
                  >
                    <option value="">No specific chapter</option>
                    {filteredChapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {TOPIC_TOOLS.includes(tool) || tool === "exam-predictor" ? (
                <div>
                  <label className="label" htmlFor="tool-topic">
                    Topic {TOPIC_TOOLS.includes(tool) ? "" : "(optional)"}
                  </label>
                  <input
                    id="tool-topic"
                    className="input"
                    placeholder={
                      tool === "exam-predictor"
                        ? "Leave blank to use the selected course"
                        : "e.g. Eigenvalues and diagonalisation"
                    }
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
              ) : null}

              {tool === "quiz" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="tool-difficulty">Difficulty</label>
                    <select
                      id="tool-difficulty"
                      className="input"
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value)}
                    >
                      <option value="easy undergraduate">Easy undergraduate</option>
                      <option value="undergraduate IIT">Undergraduate IIT</option>
                      <option value="advanced">Advanced / exam-hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="tool-count">Questions</label>
                    <input
                      id="tool-count"
                      type="number"
                      min={3}
                      max={20}
                      className="input"
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    />
                  </div>
                </div>
              ) : null}

              {tool === "assignment" ? (
                <div>
                  <label className="label" htmlFor="tool-question">Assignment question or brief</label>
                  <textarea
                    id="tool-question"
                    className="input"
                    rows={5}
                    placeholder="Paste the exact question and any constraints. Cortex will not invent requirements."
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                </div>
              ) : null}

              {tool === "summarize" ? (
                <div>
                  <label className="label" htmlFor="tool-material">Material to summarize</label>
                  <textarea
                    id="tool-material"
                    className="input"
                    rows={8}
                    placeholder="Paste text from a PDF, lecture transcript, or imported course material. Only this text is used."
                    value={material}
                    onChange={(event) => setMaterial(event.target.value)}
                  />
                  <p className="mt-1.5 text-[0.66rem] text-[#6d747d]">
                    {material.trim() ? `${material.trim().length.toLocaleString()} characters` : "Long passages are truncated safely by the server."}
                  </p>
                </div>
              ) : null}

              {tool === "coach" ? (
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                  The coach uses your real courses, exams, pending assignments, recent completed work, and daily target.
                  It will say when there is not enough data instead of inventing progress.
                </p>
              ) : null}

              {tool === "daily-briefing" ? (
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                  This reads today&apos;s generated plan. Generate or regenerate the plan from the dashboard or Study Plan page first
                  if you want the briefing to reflect the latest tasks.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void run()}
                  disabled={running || aiConfigured === false}
                >
                  {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  {running ? "Working…" : `Run ${selectedTool.label.toLowerCase()}`}
                </button>
                <span className="text-[0.66rem] text-[#6d747d]">
                  AI can make mistakes. Verify anything that matters.
                </span>
              </div>
            </div>
          </section>

          {result ? (
            <section className="surface overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#6d747d]">
                    {result.kind}
                  </p>
                  <h2 className="mt-0.5 text-[0.92rem] font-semibold text-[#f2f2ef]">{result.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem]">
                    {result.noteId ? (
                      <Link href="/notes" className="font-medium text-[#f3c96b] hover:underline">
                        Saved to Notes
                      </Link>
                    ) : null}
                    {result.quizId ? (
                      <Link href="/notes?tab=quizzes" className="font-medium text-[#f3c96b] hover:underline">
                        Saved to Quizzes
                      </Link>
                    ) : null}
                  </div>
                </div>
                {result.markdown ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyResult()}>
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
              <div className="px-4 py-4">
                {result.kind === "quiz" && result.questions ? (
                  <QuizRunner questions={result.questions} title={result.title} />
                ) : result.markdown ? (
                  <Markdown>{result.markdown}</Markdown>
                ) : (
                  <p className="py-6 text-center text-[0.8rem] text-[#6d747d]">No content returned.</p>
                )}
              </div>
            </section>
          ) : (
            <section className="surface p-4">
              <EmptyState
                icon={selectedTool.icon}
                title="Nothing generated yet"
                description="Choose a tool, add the context you want it to use, then run it. Cortex will not fabricate deadlines, sources, or exam content."
                className="border-0 bg-transparent py-6"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
