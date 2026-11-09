"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/types";

export function QuizRunner({
  questions,
  title,
  onSubmitted,
}: {
  questions: QuizQuestion[];
  title?: string;
  onSubmitted?: (result: { score: number; total: number }) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () =>
      questions.reduce(
        (total, question, index) =>
          total + (answers[index] === question.answerIndex ? 1 : 0),
        0,
      ),
    [answers, questions],
  );

  if (!questions.length) {
    return (
      <p className="py-6 text-center text-[0.8rem] text-[#6d747d]">
        This quiz has no readable questions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.74rem] text-[#9aa1aa]">
          {title ? <span className="font-medium text-[#f2f2ef]">{title} · </span> : null}
          {answeredCount}/{questions.length} answered
        </p>
        {submitted ? (
          <div className="flex items-center gap-2">
            <span className="badge badge-accent">
              Score {score}/{questions.length}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
            >
              <RotateCcw className="size-3.5" /> Retry
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={answeredCount !== questions.length}
            onClick={() => {
              setSubmitted(true);
              // Report the real score so weak-topic tracking has data.
              onSubmitted?.({ score, total: questions.length });
            }}
          >
            <Check className="size-3.5" /> Check answers
          </button>
        )}
      </div>

      <div className="space-y-3">
        {questions.map((question, index) => {
          const chosen = answers[index];
          const correct = submitted && chosen === question.answerIndex;
          const wrong = submitted && chosen !== question.answerIndex;
          return (
            <article
              key={index}
              className={cn(
                "rounded-xl border p-3.5 transition-colors",
                correct
                  ? "border-[#6ee7b7]/30 bg-[#6ee7b7]/[0.04]"
                  : wrong
                    ? "border-[#f08a8a]/30 bg-[#f08a8a]/[0.04]"
                    : "border-white/[0.07] bg-white/[0.02]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[0.64rem] font-semibold text-[#9aa1aa]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.84rem] font-medium leading-relaxed text-[#f2f2ef]">
                    {question.question}
                  </p>
                  <div className="mt-2.5 grid gap-1.5">
                    {question.options.map((option, optionIndex) => {
                      const selected = chosen === optionIndex;
                      const isAnswer = submitted && optionIndex === question.answerIndex;
                      return (
                        <button
                          key={optionIndex}
                          type="button"
                          disabled={submitted}
                          onClick={() =>
                            setAnswers((current) => ({ ...current, [index]: optionIndex }))
                          }
                          className={cn(
                            "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-[0.78rem] leading-relaxed transition-colors",
                            isAnswer
                              ? "border-[#6ee7b7]/40 bg-[#6ee7b7]/10 text-[#d9f7e9]"
                              : selected
                                ? "border-[#e7b44b]/45 bg-[#e7b44b]/10 text-[#f3e6c4]"
                                : "border-white/[0.07] bg-white/[0.015] text-[#9aa1aa] hover:border-white/20 hover:text-[#f2f2ef]",
                            submitted && "cursor-default",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[0.55rem] font-semibold",
                              isAnswer
                                ? "border-[#6ee7b7]/50 text-[#6ee7b7]"
                                : selected
                                  ? "border-[#e7b44b]/50 text-[#f3c96b]"
                                  : "border-white/15 text-[#6d747d]",
                            )}
                          >
                            {isAnswer ? (
                              <Check className="size-2.5" />
                            ) : wrong && selected ? (
                              <X className="size-2.5" />
                            ) : (
                              String.fromCharCode(65 + optionIndex)
                            )}
                          </span>
                          <span className="min-w-0">{option}</span>
                        </button>
                      );
                    })}
                  </div>
                  {submitted ? (
                    <p className="mt-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                      <span className="font-semibold text-[#f2f2ef]">Why: </span>
                      {question.explanation}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
