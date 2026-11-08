import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Video,
} from "lucide-react";
import { getAuthContext } from "@/lib/auth";

const FEATURES = [
  {
    icon: CalendarCheck2,
    title: "A daily plan that adapts",
    body: "A deterministic priority engine ranks your chapters by exam proximity, confidence, difficulty, and workload. Missed tasks reschedule into realistic slots.",
  },
  {
    icon: MessageSquareText,
    title: "An AI mentor grounded in your data",
    body: "Chat, notes, quizzes, and explanations use your real courses, syllabus, exams, and progress — not generic answers.",
  },
  {
    icon: GraduationCap,
    title: "Exam-mode preparation",
    body: "Countdowns, syllabus coverage, weak-topic detection, priority maps, and a day-by-day revision sequence.",
  },
  {
    icon: Video,
    title: "Verified video recommendations",
    body: "Search prioritises NPTEL, MIT OpenCourseWare, and IIT channels. Every link is verified through YouTube before it appears.",
  },
  {
    icon: PlugZap,
    title: "Moodle integration without shortcuts",
    body: "Connect with an official web-services token, or import PDFs and text. Cortex never bypasses your institution's login.",
  },
  {
    icon: BarChart3,
    title: "Progress you can actually see",
    body: "Study streaks, an 84-day heatmap, weekly completion, course progress, and a plain-language weekly report.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Add your real semester",
    body: "Courses, chapters, exams, and study constraints. Import from Moodle or paste a PDF if you prefer.",
  },
  {
    number: "02",
    title: "Generate today's plan",
    body: "Cortex ranks what matters now and builds focused study, practice, assignment, and revision blocks.",
  },
  {
    number: "03",
    title: "Learn, revise, adjust",
    body: "Ask the AI mentor, generate notes and quizzes, and let missed work reschedule itself.",
  },
];

const TOOLS = [
  { icon: FileText, label: "Revision notes" },
  { icon: ListChecks, label: "Practice quizzes" },
  { icon: Target, label: "Exam priorities" },
  { icon: ClipboardList, label: "Assignment guides" },
  { icon: Timer, label: "Focus sessions" },
  { icon: Sparkles, label: "Study coach" },
];

export default async function Home() {
  const context = await getAuthContext();
  const signedIn = Boolean(context);
  const destination = context?.profile.onboarding_completed ? "/dashboard" : "/onboarding";

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#08090b]">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08090b]/85 backdrop-blur-md">
        <div className="mx-auto flex h-15 max-w-6xl items-center gap-3 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
              <Brain className="size-4.5" />
            </span>
            <span className="text-[1rem] font-semibold tracking-tight">Cortex</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-5 text-[0.78rem] text-[#9aa1aa] md:flex">
            <a href="#features" className="transition-colors hover:text-[#f2f2ef]">Features</a>
            <a href="#how" className="transition-colors hover:text-[#f2f2ef]">How it works</a>
            <a href="#integrity" className="transition-colors hover:text-[#f2f2ef]">Data &amp; safety</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <Link href={destination} className="btn btn-primary btn-sm">
                Open workspace <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
                <Link href="/register" className="btn btn-primary btn-sm">
                  Get started <ArrowRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-70"
            style={{
              background:
                "radial-gradient(60% 55% at 50% 0%, rgba(231,180,75,0.10), transparent 70%)",
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pb-24">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.7rem] text-[#c6cbd1]">
                <span className="dot-live" />
                Built for IIT Jodhpur students
              </div>
              <h1 className="max-w-xl text-[2.45rem] font-semibold leading-[1.06] tracking-[-0.045em] sm:text-[3.15rem]">
                What should I study
                <br />
                <span className="text-[#e7b44b]">today?</span>
              </h1>
              <p className="mt-5 max-w-lg text-[0.95rem] leading-relaxed text-[#9aa1aa]">
                Cortex is an AI study assistant that turns your real courses, exams, and
                deadlines into a focused daily plan — then helps you learn, revise, and stay
                consistent.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href={signedIn ? destination : "/register"} className="btn btn-primary px-5 py-2.5">
                  {signedIn ? "Open your workspace" : "Start studying smarter"}
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/login" className="btn btn-secondary px-4 py-2.5">
                  I already have an account
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[0.72rem] text-[#6d747d]">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-[#6ee7b7]" /> No fake LMS data
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-[#6ee7b7]" /> Verified video links
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-[#6ee7b7]" /> Bring your own AI key
                </span>
              </div>
            </div>

            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2rem] opacity-60 blur-2xl"
                style={{ background: "radial-gradient(circle, rgba(231,180,75,0.10), transparent 70%)" }}
              />
              <div className="surface relative overflow-hidden p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between px-1.5 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-white/15" />
                    <span className="size-2 rounded-full bg-white/15" />
                    <span className="size-2 rounded-full bg-white/15" />
                  </div>
                  <span className="badge badge-accent">Preview</span>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#0b0d10] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#6d747d]">
                        Today · 18:00
                      </p>
                      <p className="mt-1 text-[1.02rem] font-semibold tracking-tight">
                        Your highest-leverage work
                      </p>
                    </div>
                    <span className="badge badge-green">On track</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {[
                      { time: "45m", title: "Study Fourier transforms", meta: "Signals · exam in 6 days", tone: "high" },
                      { time: "30m", title: "Practice problem set 4", meta: "Signals · active recall", tone: "medium" },
                      { time: "30m", title: "Assignment: lab report", meta: "Physics · due in 2 days", tone: "high" },
                      { time: "15m", title: "Recall + wrap-up", meta: "Close today's loop", tone: "low" },
                    ].map((task) => (
                      <div
                        key={task.title}
                        className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
                      >
                        <span className="w-8 shrink-0 text-[0.64rem] font-medium text-[#6d747d]">{task.time}</span>
                        <span
                          className="h-6 w-0.5 shrink-0 rounded-full"
                          style={{
                            background:
                              task.tone === "high" ? "#f08a8a" : task.tone === "medium" ? "#e7b44b" : "#6ee7b7",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.76rem] font-medium text-[#f2f2ef]">{task.title}</p>
                          <p className="truncate text-[0.64rem] text-[#6d747d]">{task.meta}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { label: "Streak", value: "12d" },
                      { label: "This week", value: "7.5h" },
                      { label: "Next exam", value: "6d" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                        <p className="text-[0.58rem] uppercase tracking-[0.1em] text-[#6d747d]">{stat.label}</p>
                        <p className="mt-0.5 text-[0.88rem] font-semibold text-[#f2f2ef]">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-white/[0.06] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-2xl">
              <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#e7b44b]">
                Everything in one workspace
              </p>
              <h2 className="text-[1.7rem] font-semibold tracking-[-0.035em] sm:text-[2rem]">
                Less tab-switching. More actual studying.
              </h2>
              <p className="mt-3 text-[0.88rem] leading-relaxed text-[#9aa1aa]">
                Planning, teaching, revision, and progress tracking share the same source of
                truth: the academic data you record.
              </p>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="surface surface-hover p-4.5">
                  <span className="mb-3.5 flex size-9 items-center justify-center rounded-lg border border-[#e7b44b]/20 bg-[#e7b44b]/10 text-[#e7b44b]">
                    <feature.icon className="size-4.5" />
                  </span>
                  <h3 className="text-[0.9rem] font-semibold tracking-tight text-[#f2f2ef]">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[0.78rem] leading-relaxed text-[#9aa1aa]">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-white/[0.06] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#e7b44b]">
                  How it works
                </p>
                <h2 className="text-[1.7rem] font-semibold tracking-[-0.035em] sm:text-[2rem]">
                  A calm loop, not another dashboard to maintain.
                </h2>
                <p className="mt-3 text-[0.88rem] leading-relaxed text-[#9aa1aa]">
                  The priority engine is deterministic and explainable. AI adds explanations
                  and briefings — it never invents deadlines or silently changes your data.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {TOOLS.map((tool) => (
                    <span key={tool.label} className="badge">
                      <tool.icon className="size-3" /> {tool.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {STEPS.map((step) => (
                  <div key={step.number} className="surface flex gap-4 p-4">
                    <span className="font-mono text-[0.72rem] font-semibold text-[#e7b44b]">
                      {step.number}
                    </span>
                    <div>
                      <h3 className="text-[0.9rem] font-semibold text-[#f2f2ef]">{step.title}</h3>
                      <p className="mt-1 text-[0.79rem] leading-relaxed text-[#9aa1aa]">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="integrity" className="border-t border-white/[0.06] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="surface overflow-hidden">
              <div className="grid lg:grid-cols-[1fr_1fr]">
                <div className="p-6 sm:p-8">
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#e7b44b]">
                    Data integrity by design
                  </p>
                  <h2 className="text-[1.55rem] font-semibold tracking-[-0.035em] sm:text-[1.85rem]">
                    Honest about what it knows.
                  </h2>
                  <p className="mt-3 max-w-md text-[0.85rem] leading-relaxed text-[#9aa1aa]">
                    Academic tools should be trustworthy before they are impressive. Cortex is
                    built around that constraint.
                  </p>
                  <div className="mt-6 space-y-3">
                    {[
                      {
                        icon: ShieldCheck,
                        title: "No LMS authentication bypass",
                        body: "Use an official Moodle web-services token or import files yourself. Credentials are never scraped.",
                      },
                      {
                        icon: Video,
                        title: "No fabricated video links",
                        body: "Recommendations only render after a successful YouTube verification. No hardcoded fake IDs.",
                      },
                      {
                        icon: Brain,
                        title: "AI is grounded, not omniscient",
                        body: "The assistant receives your recorded context and is instructed to admit missing information.",
                      },
                    ].map((item) => (
                      <div key={item.title} className="flex gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-[#6ee7b7]">
                          <item.icon className="size-4" />
                        </span>
                        <div>
                          <p className="text-[0.82rem] font-semibold text-[#f2f2ef]">{item.title}</p>
                          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[#9aa1aa]">{item.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/[0.06] bg-[#0b0d10] p-6 sm:p-8 lg:border-l lg:border-t-0">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#6d747d]">
                    What Cortex remembers
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {[
                      { label: "Courses & syllabus chapters", value: "Your source of truth" },
                      { label: "Exam dates & weightings", value: "Never invented" },
                      { label: "Confidence per chapter", value: "You control it" },
                      { label: "Study sessions & completions", value: "Local SQLite" },
                      { label: "Goals & weak subjects", value: "Editable in Settings" },
                      { label: "AI provider key", value: "AES-256-GCM encrypted" },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2.5 last:border-0 last:pb-0"
                      >
                        <span className="text-[0.77rem] text-[#c6cbd1]">{row.label}</span>
                        <span className="text-right text-[0.68rem] text-[#6d747d]">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-lg border border-[#e7b44b]/20 bg-[#e7b44b]/[0.06] px-3 py-2.5 text-[0.72rem] leading-relaxed text-[#c6cbd1]">
                    This is a personal study tool. It does not submit assignments or act on your
                    behalf in institutional systems.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-5 text-center">
            <h2 className="text-[1.8rem] font-semibold tracking-[-0.04em] sm:text-[2.2rem]">
              Your next study session is already waiting.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[0.88rem] leading-relaxed text-[#9aa1aa]">
              Add your semester once, connect your AI provider, and let Cortex handle the
              “what now?” problem.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href={signedIn ? destination : "/register"} className="btn btn-primary px-5 py-2.5">
                {signedIn ? "Open workspace" : "Create your workspace"}
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="btn btn-secondary px-4 py-2.5">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
              <Brain className="size-4" />
            </span>
            <div>
              <p className="text-[0.8rem] font-semibold">Cortex</p>
              <p className="text-[0.62rem] text-[#6d747d]">Personal study assistant · IIT Jodhpur</p>
            </div>
          </div>
          <p className="text-[0.68rem] leading-relaxed text-[#555c66]">
            Independent project. Not affiliated with or endorsed by IIT Jodhpur. Always keep
            your own backups of academic work.
          </p>
        </div>
      </footer>
    </div>
  );
}
