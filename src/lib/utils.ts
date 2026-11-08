export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | Record<string, boolean | null | undefined>
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string" || typeof input === "number") {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else if (typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key);
      }
    }
  }
  return out.join(" ");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function dateInTimeZone(
  timeZone = "Asia/Kolkata",
  date: Date = new Date(),
): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function normalizeDueAt(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:00`).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDate(
  value: string | null | undefined,
  timeZone = "Asia/Kolkata",
  opts: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

export function formatDateTime(
  value: string | null | undefined,
  timeZone = "Asia/Kolkata",
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(
  value: string | null | undefined,
  timeZone = "Asia/Kolkata",
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function relativeDay(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;
  return formatDate(date);
}

export function minutesToLabel(minutes: number): string {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const COURSE_COLORS = [
  "#E9B44C",
  "#7AA2FF",
  "#6EE7B7",
  "#F08A8A",
  "#C4A7FF",
  "#7DD3FC",
  "#F9A8D4",
  "#A3E635",
];

export function courseColor(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

export function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
