"use client";

import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Command,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  NotebookPen,
  PlayCircle,
  PlugZap,
  Search,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { cn, initials } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Today at a glance" },
      { href: "/plan", label: "Study Plan", icon: CalendarDays, description: "Calendar and daily tasks" },
      { href: "/chat", label: "AI Chat", icon: MessageSquareText, description: "Ask your academic mentor" },
      { href: "/tools", label: "AI Tools", icon: Sparkles, description: "Notes, quizzes, revision" },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/courses", label: "Courses", icon: BookOpen, description: "Syllabus and chapter progress" },
      { href: "/exams", label: "Exams", icon: GraduationCap, description: "Countdowns and preparation" },
      { href: "/assignments", label: "Assignments", icon: ClipboardList, description: "Deadlines and submissions" },
      { href: "/videos", label: "Videos", icon: PlayCircle, description: "Verified lecture recommendations" },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/notes", label: "Notes", icon: NotebookPen, description: "Saved notes and quizzes" },
      { href: "/lms", label: "LMS", icon: PlugZap, description: "Moodle sync and imports" },
      { href: "/progress", label: "Progress", icon: BarChart3, description: "Streaks, reports, weak topics" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, description: "Profile, AI, memory, account" },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((group) => group.items);

export type ShellUser = { name: string; email: string };
export type ShellProfile = {
  study_hours: number;
  timezone: string;
  program: string | null;
  year: number | null;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentTitle(pathname: string) {
  return ALL_NAV.find((item) => isActive(pathname, item.href))?.label ?? "Cortex";
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-2.5 text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-[#555c66]">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8rem] font-medium transition-colors",
                    active
                      ? "bg-[#e7b44b]/10 text-[#f3c96b]"
                      : "text-[#9aa1aa] hover:bg-white/[0.04] hover:text-[#f2f2ef]",
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-[#e7b44b]" : "text-[#6d747d] group-hover:text-[#9aa1aa]",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                  {active ? (
                    <span className="ml-auto size-1.5 rounded-full bg-[#e7b44b]" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  user,
  profile,
  children,
}: {
  user: ShellUser;
  profile: ShellProfile;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!paletteOpen) setQuery("");
  }, [paletteOpen]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return ALL_NAV;
    return ALL_NAV.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized),
    );
  }, [query]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-[#e7b44b] text-[#1b1405]">
          <Brain className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold leading-none tracking-tight text-[#f2f2ef]">
            Cortex
          </p>
          <p className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-[#6d747d]">
            IIT Jodhpur
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon ml-auto lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-4" />
        </button>
      </div>

      <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />

      <div className="border-t border-white/[0.06] p-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e7b44b]/15 text-[0.72rem] font-semibold text-[#f3c96b]">
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.78rem] font-semibold text-[#f2f2ef]">
                {user.name}
              </p>
              <p className="truncate text-[0.66rem] text-[#6d747d]">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="btn btn-ghost btn-icon shrink-0 p-1.5"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[0.64rem] text-[#6d747d]">
            <span>{profile.study_hours}h daily target</span>
            <span className="truncate">{profile.timezone.split("/").pop()?.replace("_", " ")}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#08090b]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/[0.06] bg-[#0b0d10] lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-[280px] border-r border-white/10 bg-[#0b0d10]">
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-white/[0.06] bg-[#08090b]/88 px-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            className="btn btn-ghost btn-icon lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex min-w-0 items-center gap-1.5 text-[0.78rem]">
            <span className="hidden text-[#6d747d] sm:inline">Cortex</span>
            <ChevronRight className="hidden size-3.5 text-[#3f454d] sm:inline" />
            <span className="truncate font-medium text-[#d9dde2]">{currentTitle(pathname)}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-1.5 text-[0.72rem] text-[#6d747d] transition-colors hover:border-white/20 hover:text-[#9aa1aa] sm:flex"
            >
              <Search className="size-3.5" />
              <span>Search pages</span>
              <span className="kbd ml-2 flex items-center gap-0.5">
                <Command className="size-2.5" />K
              </span>
            </button>
            <Link href="/chat" className="btn btn-primary btn-sm">
              <MessageSquareText className="size-3.5" />
              <span className="hidden sm:inline">Ask Cortex</span>
              <span className="sm:hidden">Ask</span>
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </main>
      </div>

      <Modal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        title="Jump to"
        description="Search the workspace. Press Esc to close."
        size="sm"
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6d747d]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages…"
            className="input pl-9"
          />
        </div>
        <div className="space-y-1">
          {results.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => {
                setPaletteOpen(false);
                router.push(item.href);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <item.icon className="size-4 text-[#6d747d]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.82rem] font-medium text-[#f2f2ef]">
                  {item.label}
                </span>
                <span className="block truncate text-[0.68rem] text-[#6d747d]">
                  {item.description}
                </span>
              </span>
              <ChevronRight className="size-3.5 text-[#3f454d]" />
            </button>
          ))}
          {!results.length ? (
            <p className="px-2 py-6 text-center text-[0.78rem] text-[#6d747d]">
              No pages match “{query}”.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
