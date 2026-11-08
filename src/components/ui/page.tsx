import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#e7b44b]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[#f2f2ef] sm:text-[1.65rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[0.83rem] leading-relaxed text-[#9aa1aa]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "var(--accent)",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={cn("surface surface-hover p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-[#6d747d]">
            {label}
          </p>
          <p className="mt-1.5 text-[1.35rem] font-semibold leading-none tracking-[-0.03em] text-[#f2f2ef]">
            {value}
          </p>
          {hint ? (
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-[#9aa1aa]">{hint}</p>
          ) : null}
        </div>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10"
          style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[0.9rem] font-semibold tracking-tight text-[#f2f2ef]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[0.74rem] text-[#9aa1aa]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  icon: Icon,
  className,
}: {
  tone?: "info" | "warning" | "success" | "danger";
  title?: string;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const tones = {
    info: "border-sky-400/20 bg-sky-400/[0.055] text-[#b9d8ff]",
    warning: "border-amber-400/20 bg-amber-400/[0.055] text-[#f0d9a8]",
    success: "border-emerald-400/20 bg-emerald-400/[0.055] text-[#b8f3d8]",
    danger: "border-red-400/20 bg-red-400/[0.055] text-[#ffc0c0]",
  };
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", tones[tone], className)}>
      <div className="flex gap-2.5">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0" /> : null}
        <div className="min-w-0 text-[0.78rem] leading-relaxed">
          {title ? <p className="mb-0.5 font-semibold text-[#f2f2ef]">{title}</p> : null}
          <div className="text-[#9aa1aa]">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[0.73rem] font-medium transition-colors",
        active
          ? "border-[#e7b44b]/40 bg-[#e7b44b]/12 text-[#f3c96b]"
          : "border-white/10 bg-white/[0.025] text-[#9aa1aa] hover:border-white/20 hover:text-[#f2f2ef]",
        className,
      )}
    >
      {children}
    </button>
  );
}
