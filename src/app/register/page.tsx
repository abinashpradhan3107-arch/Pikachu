import Link from "next/link";
import { redirect } from "next/navigation";
import { Brain, CalendarCheck2, GraduationCap, MessageSquareText, ShieldCheck } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const context = await getAuthContext();
  if (context) {
    redirect(context.profile.onboarding_completed ? "/dashboard" : "/onboarding");
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-[#0b0d10] p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/3 size-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(231,180,75,0.15), transparent 68%)" }}
        />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
            <Brain className="size-4.5" />
          </span>
          <span className="text-[1rem] font-semibold tracking-tight">Cortex</span>
        </Link>

        <div className="relative max-w-md">
          <p className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#e7b44b]">
            Set up in about 3 minutes
          </p>
          <h1 className="text-[2.1rem] font-semibold leading-[1.12] tracking-[-0.04em]">
            Your semester,
            <br />
            <span className="text-[#9aa1aa]">finally under control.</span>
          </h1>
          <p className="mt-4 text-[0.88rem] leading-relaxed text-[#9aa1aa]">
            Add your courses and exams once. Cortex handles the prioritisation, daily
            planning, revision, and exam strategy from there.
          </p>

          <div className="mt-8 space-y-4">
            {[
              {
                icon: CalendarCheck2,
                title: "A realistic daily plan",
                body: "Built around your study hours, session length, and real deadlines.",
              },
              {
                icon: MessageSquareText,
                title: "An AI mentor that knows your syllabus",
                body: "Ask questions, generate notes, and get quizzed on your actual chapters.",
              },
              {
                icon: GraduationCap,
                title: "Exam-mode preparation",
                body: "Countdowns, weak-topic detection, and a revision sequence you can follow.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-[#e7b44b]">
                  <item.icon className="size-4" />
                </span>
                <div>
                  <p className="text-[0.82rem] font-semibold text-[#f2f2ef]">{item.title}</p>
                  <p className="mt-0.5 text-[0.74rem] leading-relaxed text-[#9aa1aa]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative inline-flex items-center gap-1.5 text-[0.68rem] text-[#6d747d]">
          <ShieldCheck className="size-3.5" /> Your data stays in your own database.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
              <Brain className="size-4.5" />
            </span>
            <span className="text-[1rem] font-semibold tracking-tight">Cortex</span>
          </Link>

          <h2 className="text-[1.55rem] font-semibold tracking-[-0.03em]">Create your account</h2>
          <p className="mb-7 mt-1.5 text-[0.84rem] text-[#9aa1aa]">
            No credit card. No fabricated LMS access. Just your real academic data.
          </p>

          <AuthForm mode="register" />

          <p className="mt-8 text-center text-[0.68rem] leading-relaxed text-[#555c66]">
            Cortex is an independent study tool and is not an official IIT Jodhpur service.
          </p>
        </div>
      </main>
    </div>
  );
}
