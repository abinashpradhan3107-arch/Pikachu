"use client";

import { Coffee, Pause, Play, RotateCcw, SkipForward, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { cn, minutesToLabel } from "@/lib/utils";

type Phase = "focus" | "break";

export function FocusTimer({
  sessionLength = 45,
  breakMinutes = 10,
  className,
}: {
  sessionLength?: number;
  breakMinutes?: number;
  className?: string;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(sessionLength * 60);
  const [running, setRunning] = useState(false);
  const [rounds, setRounds] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const total = useMemo(
    () => (phase === "focus" ? sessionLength : breakMinutes) * 60,
    [phase, sessionLength, breakMinutes],
  );

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setRemaining((value) => {
        if (value > 1) return value - 1;
        return 0;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [running]);

  useEffect(() => {
    if (remaining > 0 || !running) return;
    if (phase === "focus") {
      setRounds((value) => value + 1);
      toast.success(
        "Focus block complete",
        `Take a ${breakMinutes}-minute break. Stand up, hydrate, and look away from the screen.`,
      );
      setPhase("break");
      setRemaining(breakMinutes * 60);
    } else {
      toast.info("Break over", "Start the next focus block when you are ready.");
      setPhase("focus");
      setRemaining(sessionLength * 60);
      setRunning(false);
    }
  }, [remaining, running, phase, breakMinutes, sessionLength, toast]);

  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  function reset() {
    setRunning(false);
    setPhase("focus");
    setRemaining(sessionLength * 60);
  }

  function skip() {
    if (phase === "focus") {
      setPhase("break");
      setRemaining(breakMinutes * 60);
    } else {
      setPhase("focus");
      setRemaining(sessionLength * 60);
    }
    setRunning(false);
  }

  return (
    <div className={cn("surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {phase === "focus" ? (
            <Timer className="size-4 text-[#e7b44b]" />
          ) : (
            <Coffee className="size-4 text-[#6ee7b7]" />
          )}
          <div>
            <p className="text-[0.78rem] font-semibold text-[#f2f2ef]">
              {phase === "focus" ? "Focus session" : "Break"}
            </p>
            <p className="text-[0.64rem] text-[#6d747d]">
              {phase === "focus"
                ? `${minutesToLabel(sessionLength)} focus · ${breakMinutes}m break`
                : `Next: ${minutesToLabel(sessionLength)} focus`}
            </p>
          </div>
        </div>
        <span className="badge">{rounds} done</span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative flex size-[74px] shrink-0 items-center justify-center">
          <svg width={74} height={74} className="-rotate-90">
            <circle cx={37} cy={37} r={31} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
            <circle
              cx={37}
              cy={37}
              r={31}
              fill="none"
              stroke={phase === "focus" ? "var(--accent)" : "var(--green)"}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 31}
              strokeDashoffset={2 * Math.PI * 31 * (1 - progress / 100)}
              className="transition-[stroke-dashoffset] duration-1000"
            />
          </svg>
          <span className="absolute font-mono text-[0.82rem] font-semibold tabular-nums text-[#f2f2ef]">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setRunning((value) => !value)}
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? "Pause" : remaining === total ? "Start" : "Resume"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
            <RotateCcw className="size-3.5" /> Reset
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={skip}>
            <SkipForward className="size-3.5" /> Skip
          </button>
        </div>
      </div>
      <p className="mt-3 text-[0.66rem] leading-relaxed text-[#6d747d]">
        A break reminder appears when the block ends. Timer runs in this tab only.
      </p>
    </div>
  );
}
