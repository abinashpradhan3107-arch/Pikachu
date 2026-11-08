import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  color,
  height = "h-1.5",
}: {
  value: number;
  className?: string;
  color?: string;
  height?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-white/[0.07]", height, className)}
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${safe}%`,
          background: color ?? "var(--accent)",
        }}
      />
    </div>
  );
}

export function RingProgress({
  value,
  size = 64,
  stroke = 5,
  color = "var(--accent)",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute text-[0.72rem] font-semibold text-[#f2f2ef]">
        {label ?? `${safe}%`}
      </span>
    </div>
  );
}
