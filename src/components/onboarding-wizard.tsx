"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  GraduationCap,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

type CourseDraft = { code: string; title: string; chapters: string };
type ExamDraft = {
  title: string;
  exam_date: string;
  exam_type: string;
  courseIndex: string;
  syllabus: string;
};

const STEPS = [
  { title: "About you", description: "How you study", icon: UserRound },
  { title: "Courses", description: "Your real syllabus", icon: BookOpen },
  { title: "Exams", description: "What's coming up", icon: GraduationCap },
  { title: "AI provider", description: "Optional, changeable later", icon: Sparkles },
];

const PROVIDER_PRESETS = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", provider: "openai" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", provider: "openrouter" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", provider: "groq" },
  { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.1", provider: "ollama" },
];

export function OnboardingWizard({
  initialName,
  initialProfile,
}: {
  initialName: string;
  initialProfile: Profile;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialName);
  const [program, setProgram] = useState(initialProfile.program ?? "");
  const [year, setYear] = useState(initialProfile.year ? String(initialProfile.year) : "");
  const [studyHours, setStudyHours] = useState(String(initialProfile.study_hours || 3));
  const [startHour, setStartHour] = useState(String(initialProfile.preferred_start_hour ?? 18));
  const [sessionLength, setSessionLength] = useState(String(initialProfile.session_length ?? 45));
  const [breakMinutes, setBreakMinutes] = useState(String(initialProfile.break_minutes ?? 10));
  const [learningStyle, setLearningStyle] = useState(initialProfile.learning_style ?? "");
  const [explanationLevel, setExplanationLevel] = useState(initialProfile.explanation_level ?? "undergraduate");
  const [goals, setGoals] = useState(initialProfile.goals ?? "");
  const [weakSubjects, setWeakSubjects] = useState(() => {
    if (!initialProfile.weak_subjects) return "";
    try {
      return (JSON.parse(initialProfile.weak_subjects) as string[]).join(", ");
    } catch {
      return "";
    }
  });

  const [courses, setCourses] = useState<CourseDraft[]>([
    { code: "", title: "", chapters: "" },
  ]);
  const [exams, setExams] = useState<ExamDraft[]>([]);

  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("openai");

  const validCourses = useMemo(
    () => courses.filter((course) => course.title.trim().length >= 2),
    [courses],
  );

  function updateCourse(index: number, patch: Partial<CourseDraft>) {
    setCourses((current) =>
      current.map((course, position) => (position === index ? { ...course, ...patch } : course)),
    );
  }

  function updateExam(index: number, patch: Partial<ExamDraft>) {
    setExams((current) =>
      current.map((exam, position) => (position === index ? { ...exam, ...patch } : exam)),
    );
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (name.trim().length < 2) return setError("Enter your name to continue.");
      if (!program.trim()) return setError("Add your program (for example, B.Tech CSE).");
    }
    if (step === 1 && validCourses.length === 0) {
      return setError("Add at least one course so Cortex has real academic data to plan around.");
    }
    if (step === 2) {
      const invalid = exams.find((exam) => exam.title.trim().length < 2 || !exam.exam_date);
      if (invalid) return setError("Each exam needs a title and a date.");
    }
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          profile: {
            college: initialProfile.college || "IIT Jodhpur",
            program: program.trim() || null,
            year: year ? Number(year) : null,
            timezone: initialProfile.timezone || "Asia/Kolkata",
            study_hours: Number(studyHours) || 3,
            preferred_start_hour: Number(startHour) || 18,
            session_length: Number(sessionLength) || 45,
            break_minutes: Number(breakMinutes) || 10,
            learning_style: learningStyle.trim() || null,
            explanation_level: explanationLevel,
            goals: goals.trim() || null,
            weak_subjects: weakSubjects
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 20),
          },
          courses: validCourses.map((course) => ({
            code: course.code.trim() || null,
            title: course.title.trim(),
            chapters: course.chapters
              .split(/\r?\n|;/)
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 80),
          })),
          exams: exams
            .filter((exam) => exam.title.trim() && exam.exam_date)
            .map((exam) => ({
              title: exam.title.trim(),
              exam_date: exam.exam_date,
              exam_type: exam.exam_type,
              courseIndex: exam.courseIndex === "" ? null : Number(exam.courseIndex),
              syllabus: exam.syllabus.trim() || null,
            })),
          ai: apiKey.trim()
            ? {
                baseUrl: baseUrl.trim(),
                model: model.trim(),
                apiKey: apiKey.trim(),
                provider: provider.trim() || "openai",
              }
            : undefined,
        }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div className="min-h-dvh bg-[#08090b]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <p className="text-[0.92rem] font-semibold tracking-tight">Cortex setup</p>
              <p className="text-[0.66rem] text-[#6d747d]">Step {step + 1} of {STEPS.length}</p>
            </div>
          </div>
          <span className="badge">About 3 minutes</span>
        </div>

        <div className="mb-7 grid grid-cols-4 gap-2">
          {STEPS.map((item, index) => (
            <div key={item.title} className="min-w-0">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  index <= step ? "bg-[#e7b44b]" : "bg-white/[0.08]",
                )}
              />
              <p
                className={cn(
                  "mt-2 hidden truncate text-[0.66rem] font-medium sm:block",
                  index === step ? "text-[#f3c96b]" : "text-[#6d747d]",
                )}
              >
                {item.title}
              </p>
            </div>
          ))}
        </div>

        <div className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <StepIcon className="size-4 text-[#e7b44b]" />
              <h1 className="text-[1.05rem] font-semibold tracking-tight">{STEPS[step].title}</h1>
            </div>
            <p className="mt-1 text-[0.78rem] text-[#9aa1aa]">
              {step === 0
                ? "Cortex uses these constraints to build realistic study blocks, not idealised ones."
                : step === 1
                  ? "Add the courses you are actually taking this semester. Chapters can be edited later."
                  : step === 2
                    ? "Exams drive prioritisation. Add dates only if they are real and confirmed."
                    : "Optional. You can add or change your AI provider at any time in Settings."}
            </p>
          </div>

          <div className="px-5 py-5 sm:px-6">
            {step === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ob-name">Full name</label>
                  <input id="ob-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="ob-program">Program</label>
                  <input
                    id="ob-program"
                    className="input"
                    placeholder="B.Tech Computer Science"
                    value={program}
                    onChange={(event) => setProgram(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ob-year">Year</label>
                  <select id="ob-year" className="input" value={year} onChange={(event) => setYear(event.target.value)}>
                    <option value="">Select year</option>
                    {[1, 2, 3, 4, 5, 6].map((value) => (
                      <option key={value} value={value}>Year {value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ob-hours">Daily study target (hours)</label>
                  <input
                    id="ob-hours"
                    type="number"
                    min={0.5}
                    max={16}
                    step={0.5}
                    className="input"
                    value={studyHours}
                    onChange={(event) => setStudyHours(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ob-start">Preferred start hour</label>
                  <select id="ob-start" className="input" value={startHour} onChange={(event) => setStartHour(event.target.value)}>
                    {Array.from({ length: 24 }, (_, value) => (
                      <option key={value} value={value}>
                        {String(value).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ob-session">Focus session length (minutes)</label>
                  <select id="ob-session" className="input" value={sessionLength} onChange={(event) => setSessionLength(event.target.value)}>
                    {[25, 30, 40, 45, 50, 60, 75, 90].map((value) => (
                      <option key={value} value={value}>{value} minutes</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ob-break">Break length (minutes)</label>
                  <select id="ob-break" className="input" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)}>
                    {[5, 10, 15, 20, 30].map((value) => (
                      <option key={value} value={value}>{value} minutes</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ob-level">Explanation level</label>
                  <select
                    id="ob-level"
                    className="input"
                    value={explanationLevel}
                    onChange={(event) => setExplanationLevel(event.target.value)}
                  >
                    <option value="beginner">Beginner — build intuition first</option>
                    <option value="undergraduate">Undergraduate — standard depth</option>
                    <option value="advanced">Advanced — concise and rigorous</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="ob-style">Learning style (optional)</label>
                  <input
                    id="ob-style"
                    className="input"
                    placeholder="e.g. worked examples, visual diagrams, derivation-first"
                    value={learningStyle}
                    onChange={(event) => setLearningStyle(event.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="ob-goals">Goals for this semester (optional)</label>
                  <textarea
                    id="ob-goals"
                    className="input"
                    rows={3}
                    placeholder="e.g. Raise CGPA, clear backlogs, build stronger DSA fundamentals"
                    value={goals}
                    onChange={(event) => setGoals(event.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="ob-weak">Self-identified weak subjects (comma separated)</label>
                  <input
                    id="ob-weak"
                    className="input"
                    placeholder="e.g. Signals and Systems, Thermodynamics"
                    value={weakSubjects}
                    onChange={(event) => setWeakSubjects(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                {courses.map((course, index) => (
                  <div key={index} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[0.78rem] font-semibold text-[#f2f2ef]">Course {index + 1}</p>
                      {courses.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-[#f08a8a]"
                          onClick={() => setCourses((current) => current.filter((_, position) => position !== index))}
                        >
                          <Trash2 className="size-3.5" /> Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[0.4fr_1fr]">
                      <div>
                        <label className="label">Course code</label>
                        <input
                          className="input"
                          placeholder="CSL 201"
                          value={course.code}
                          onChange={(event) => updateCourse(index, { code: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Course title</label>
                        <input
                          className="input"
                          placeholder="Data Structures & Algorithms"
                          value={course.title}
                          onChange={(event) => updateCourse(index, { title: event.target.value })}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="label">Chapters / modules (one per line)</label>
                      <textarea
                        className="input font-mono text-[0.78rem]"
                        rows={5}
                        placeholder={"Arrays and complexity\nLinked lists\nStacks and queues\nTrees and traversals\nGraphs"}
                        value={course.chapters}
                        onChange={(event) => updateCourse(index, { chapters: event.target.value })}
                      />
                      <p className="mt-1 text-[0.66rem] text-[#6d747d]">
                        These become the units Cortex schedules. Leave blank if you will add them later.
                      </p>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={() => setCourses((current) => [...current, { code: "", title: "", chapters: "" }])}
                >
                  <Plus className="size-4" /> Add another course
                </button>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                {exams.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-5 py-8 text-center">
                    <CalendarClock className="mx-auto mb-2 size-5 text-[#6d747d]" />
                    <p className="text-[0.84rem] font-medium text-[#f2f2ef]">No exams added yet</p>
                    <p className="mt-1 text-[0.74rem] text-[#9aa1aa]">
                      Add known midterm or endsem dates. You can skip this and add them later.
                    </p>
                  </div>
                ) : null}
                {exams.map((exam, index) => (
                  <div key={index} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[0.78rem] font-semibold text-[#f2f2ef]">Exam {index + 1}</p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-[#f08a8a]"
                        onClick={() => setExams((current) => current.filter((_, position) => position !== index))}
                      >
                        <Trash2 className="size-3.5" /> Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="label">Exam title</label>
                        <input
                          className="input"
                          placeholder="Midterm — Data Structures"
                          value={exam.title}
                          onChange={(event) => updateExam(index, { title: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Date</label>
                        <input
                          type="date"
                          className="input"
                          value={exam.exam_date}
                          onChange={(event) => updateExam(index, { exam_date: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Type</label>
                        <select
                          className="input"
                          value={exam.exam_type}
                          onChange={(event) => updateExam(index, { exam_type: event.target.value })}
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
                        <label className="label">Course</label>
                        <select
                          className="input"
                          value={exam.courseIndex}
                          onChange={(event) => updateExam(index, { courseIndex: event.target.value })}
                        >
                          <option value="">No specific course</option>
                          {validCourses.map((course, courseIndex) => (
                            <option key={courseIndex} value={courseIndex}>
                              {course.code ? `${course.code} — ` : ""}{course.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Weight (%) optional</label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          placeholder="30"
                          disabled
                          title="Set weighting later on the Exams page"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">Syllabus notes (optional)</label>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Units 1–3, emphasis on graph algorithms"
                          value={exam.syllabus}
                          onChange={(event) => updateExam(index, { syllabus: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={() =>
                    setExams((current) => [
                      ...current,
                      { title: "", exam_date: "", exam_type: "midterm", courseIndex: "", syllabus: "" },
                    ])
                  }
                >
                  <Plus className="size-4" /> Add an exam
                </button>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="badge cursor-pointer px-2.5 py-1.5 transition-colors hover:border-[#e7b44b]/40 hover:text-[#f3c96b]"
                      onClick={() => {
                        setBaseUrl(preset.baseUrl);
                        setModel(preset.model);
                        setProvider(preset.provider);
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="label" htmlFor="ob-base">API base URL</label>
                  <input id="ob-base" className="input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="ob-model">Model</label>
                  <input id="ob-model" className="input" value={model} onChange={(event) => setModel(event.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="ob-key">API key</label>
                  <input
                    id="ob-key"
                    type="password"
                    className="input"
                    placeholder="sk-… (stored encrypted)"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="off"
                  />
                  <p className="mt-1.5 text-[0.68rem] leading-relaxed text-[#6d747d]">
                    Your key is encrypted with AES-256-GCM before it is written to the local database.
                    It is never sent to the browser after saving. You can skip this and add it in Settings.
                  </p>
                </div>
                <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.05] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#b9d8ff]">
                  If you use a local model such as Ollama, set the base URL to your local endpoint.
                  Cortex calls an OpenAI-compatible <code className="text-[#f0d9a8]">/chat/completions</code> API.
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2.5 text-[0.78rem] text-[#ffb4b4]">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-black/20 px-5 py-3.5 sm:px-6">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0 || busy}
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <div className="flex items-center gap-2">
              {step === STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {busy ? "Setting up…" : "Finish setup"}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={next} disabled={busy}>
                  Continue <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-[0.68rem] leading-relaxed text-[#555c66]">
          Your data is stored in a local SQLite database. Cortex is an independent study tool,
          not an official IIT Jodhpur service.
        </p>
      </div>
    </div>
  );
}
