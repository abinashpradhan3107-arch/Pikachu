import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#9aa1aa]">
        <Icon className="size-5" />
      </div>
      <h3 className="text-[0.92rem] font-semibold text-[#f2f2ef]">{title}</h3>
      <p className="mt-1.5 max-w-md text-[0.8rem] leading-relaxed text-[#9aa1aa]">
        {description}
      </p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({
  lines = 4,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)} aria-label="Loading">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-3.5"
          style={{ width: `${Math.max(38, 96 - index * 11)}%` }}
        />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}
