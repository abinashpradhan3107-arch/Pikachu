import Link from "next/link";
import { redirect } from "next/navigation";
import { Brain, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const context = await getAuthContext();
  if (context) {
    redirect(context.profile.onboarding_completed ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-[#0b0d10] p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/4 size-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(231,180,75,0.16), transparent 68%)" }}
        />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
            <Brain className="size-4.5" />
          </span>
          <span className="text-[1rem] font-semibold tracking-tight">Cortex</span>
        </Link>

        <div className="relative max-w-md">
          <p className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#e7b44b]">
            Your academic operating system
          </p>
          <h1 className="text-[2.1rem] font-semibold leading-[1.12] tracking-[-0.04em]">
            Stop deciding what to study.
            <br />
            <span className="text-[#9aa1aa]">Start making progress.</span>
          </h1>
          <p className="mt-4 text-[0.88rem] leading-relaxed text-[#9aa1aa]">
            Cortex turns your real courses, exams, and deadlines into a daily plan — then
            teaches, quizzes, and coaches you through it.
          </p>

          <ul className="mt-7 space-y-3">
            {[
              "A daily plan ranked by exams, confidence, and workload",
              "An AI mentor grounded in your actual syllabus",
              "Verified NPTEL, MIT OCW, and IIT lecture recommendations",
              "Moodle sync, PDF import, notes, quizzes, and progress reports",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[0.82rem] text-[#c6cbd1]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#6ee7b7]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.68rem] text-[#6d747d]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Encrypted API keys
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" /> Real AI, not mock data
          </span>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
              <Brain className="size-4.5" />
            </span>
            <span className="text-[1rem] font-semibold tracking-tight">Cortex</span>
          </Link>

          <h2 className="text-[1.55rem] font-semibold tracking-[-0.03em]">Welcome back</h2>
          <p className="mb-7 mt-1.5 text-[0.84rem] text-[#9aa1aa]">
            Sign in to pick up your plan, chat history, and progress.
          </p>

          <AuthForm mode="login" />

          <p className="mt-8 text-center text-[0.68rem] leading-relaxed text-[#555c66]">
            By continuing you agree to keep your own backups of important academic work.
            Cortex never bypasses your institution&apos;s authentication.
          </p>
        </div>
      </main>
    </div>
  );
}
