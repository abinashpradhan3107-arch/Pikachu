"use client";

import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Megaphone,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Callout, Chip, PageHeader, SectionHeader, StatCard } from "@/components/ui/page";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { Announcement, CalendarEvent, Chapter, Course, Resource } from "@/lib/types";
import { cn, formatDate, formatDateTime, minutesToLabel, truncate } from "@/lib/utils";

type LmsConnectionInfo = {
  status: string;
  siteUrl: string;
  siteName: string | null;
  username: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

type LmsOverview = {
  connected: boolean;
  connection: LmsConnectionInfo | null;
  counts: {
    courses: number;
    assignments: number;
    resources: number;
    announcements: number;
    events: number;
  };
  announcements: Announcement[];
  events: CalendarEvent[];
  materials: Resource[];
};

type SyncResult = {
  courses: number;
  chaptersAdded: number;
  assignments: number;
  resources: number;
  announcements: number;
  events: number;
  warnings: string[];
  siteName: string;
};

const BOOKMARKLET =
  "javascript:(()=>{const t=(window.getSelection()?.toString()||document.body.innerText||'').trim().slice(0,60000);if(!t){alert('Nothing to capture on this page.');return;}navigator.clipboard.writeText(t).then(()=>alert('Page text copied. Paste it into Cortex → LMS → Manual import.'),()=>prompt('Copy this text:',t));})();";

export function LmsView() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [overview, setOverview] = useState<LmsOverview | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [lmsResources, setLmsResources] = useState<Resource[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [watching, setWatching] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState({ siteUrl: "", token: "" });
  const [connecting, setConnecting] = useState(false);
  const [connectStep, setConnectStep] = useState<"url" | "token" | "login" | "manual" | "sync">("url");
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<"text" | "pdf">("text");
  const [textForm, setTextForm] = useState({ title: "", courseId: "", text: "", sourceUrl: "" });
  const [pdfForm, setPdfForm] = useState({ title: "", courseId: "" });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [activeResource, setActiveResource] = useState<Resource | null>(null);
  const [resourceContent, setResourceContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [overviewData, courseData, resourceData, chapterData] = await Promise.all([
        apiFetch<LmsOverview>("/api/lms"),
        apiFetch<{ courses: Course[] }>("/api/courses"),
        apiFetch<{ resources: Resource[] }>("/api/resources"),
        // Chapter titles only label the synced lectures - a failure here must
        // not break the page, so it degrades to an empty list.
        apiFetch<{ chapters: Chapter[] }>("/api/chapters").catch(() => ({
          chapters: [] as Chapter[],
        })),
      ]);
      setOverview(overviewData);
      setCourses(courseData.courses);
      setChapters(chapterData.chapters);
      setResources(resourceData.resources.filter((resource) => resource.source === "manual"));
      // Rows written by the Chrome extension (source "lms") are shown in their
      // own read-only section below - never in the manual list, which has a
      // delete control that must not touch LMS-synced data.
      setLmsResources(resourceData.resources.filter((resource) => resource.source === "lms"));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chapterTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chapter of chapters) map.set(chapter.id, chapter.title);
    return map;
  }, [chapters]);

  const lmsLectures = useMemo(
    () => lmsResources.filter((item) => item.kind === "lecture"),
    [lmsResources],
  );
  const lmsNotes = useMemo(
    () => lmsResources.filter((item) => item.kind === "note"),
    [lmsResources],
  );

  // Two-way "Mark as watched" toggle for a synced lecture. The row is never
  // deleted; un-toggling only clears watched_at.
  async function toggleWatched(resource: Resource) {
    const watched = !resource.watched_at;
    setWatching(resource.id);
    try {
      await apiFetch(`/api/resources/${resource.id}`, {
        method: "PATCH",
        body: JSON.stringify({ watched }),
      });
      setLmsResources((current) =>
        current.map((item) =>
          item.id === resource.id
            ? { ...item, watched_at: watched ? new Date().toISOString() : null }
            : item,
        ),
      );
    } catch (caught) {
      toast.error("Could not update the lecture", errorMessage(caught));
    } finally {
      setWatching(null);
    }
  }

  const materials = overview?.materials ?? [];
  const announcements = overview?.announcements ?? [];
  const events = useMemo(
    () =>
      (overview?.events ?? [])
        .filter((event) => new Date(event.start_at).getTime() >= Date.now() - 86_400_000)
        .slice(0, 8),
    [overview],
  );

  function courseName(courseId: string | null): string {
    if (!courseId) return "General";
    return courses.find((course) => course.id === courseId)?.title ?? "General";
  }

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnecting(true);
    setSyncSummary(null);
    setSyncWarnings([]);
    try {
      const result = await apiFetch<{
        ok: boolean;
        platform: string;
        authRequired?: boolean;
        message?: string;
        siteName?: string;
        sync?: SyncResult | null;
        syncError?: string;
      }>("/api/lms/connect", {
        method: "POST",
        body: JSON.stringify({
          siteUrl: connectForm.siteUrl.trim(),
          token: connectStep === "token" ? connectForm.token.trim() : undefined,
        }),
      });

      if (result.platform === "moodle") {
        // Moodle token flow
        setConnectForm((current) => ({ ...current, token: "" }));
        if (result.sync) {
          setSyncSummary(
            `Connected to ${result.siteName}. Synced ${result.sync.courses} courses, ${result.sync.assignments} assignments, ${result.sync.resources} materials, ${result.sync.announcements} announcements, and ${result.sync.events} events.`,
          );
          setSyncWarnings(result.sync.warnings);
        } else {
          setSyncSummary(`Connected to ${result.siteName}, but the initial sync did not finish.`);
        }
        if (result.syncError) {
          setSyncWarnings((current) => [...current, result.syncError as string]);
        }
        toast.success("LMS connected", "Your token is encrypted at rest and never sent to the browser.");
      } else if (result.platform === "custom" && result.authRequired) {
        // Custom LMS: open login page
        const loginUrl = `${connectForm.siteUrl}/login/index.php`;
        window.open(loginUrl, "_blank", "noopener,noreferrer");
        toast.info("LMS login opened", "A new tab opened to your LMS login page. Sign in, then return to Cortex and click Sync.");
        setConnectStep("url");
      } else if (result.platform === "unknown" || !result.ok) {
        // Unknown or failed – show manual import info
        toast.info("LMS not auto‑detected", result.message ?? "Use manual import to add materials.");
        setConnectStep("manual");
      } else {
        // Fallback: manual import
        toast.info("LMS connection", result.message ?? "Use manual import to add materials.");
        setConnectStep("manual");
      }
      await load();
    } catch (caught) {
      toast.error("Could not connect the LMS", errorMessage(caught));
    } finally {
      setConnecting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncSummary(null);
    setSyncWarnings([]);
    try {
      const result = await apiFetch<{ ok: boolean; result: SyncResult }>("/api/lms/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSyncSummary(
        `Synced ${result.result.courses} courses, ${result.result.chaptersAdded} new chapters, ${result.result.assignments} assignments, ${result.result.resources} materials, ${result.result.announcements} announcements, and ${result.result.events} events.`,
      );
      setSyncWarnings(result.result.warnings);
      toast.success("LMS synced");
      await load();
    } catch (caught) {
      toast.error("LMS sync failed", errorMessage(caught));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>("/api/lms/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("LMS disconnected", result.message);
      setDisconnectOpen(false);
      await load();
    } catch (caught) {
      toast.error("Could not disconnect", errorMessage(caught));
    } finally {
      setDisconnecting(false);
    }
  }

  async function importText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImporting(true);
    try {
      await apiFetch("/api/import", {
        method: "POST",
        body: JSON.stringify({
          title: textForm.title.trim(),
          courseId: textForm.courseId || null,
          text: textForm.text.trim(),
          kind: "note",
          sourceUrl: textForm.sourceUrl.trim() || null,
        }),
      });
      toast.success("Text imported", "You can now view it and summarize it with AI.");
      setTextForm({ title: "", courseId: textForm.courseId, text: "", sourceUrl: "" });
      await load();
    } catch (caught) {
      toast.error("Could not import the text", errorMessage(caught));
    } finally {
      setImporting(false);
    }
  }

  async function importPdf(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pdfFile) {
      toast.warning("Choose a PDF", "Select a PDF file first.");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", pdfFile);
      form.set("courseId", pdfForm.courseId);
      form.set("title", pdfForm.title.trim() || pdfFile.name.replace(/\.pdf$/i, ""));
      const result = await apiFetch<{ pages: number; characters: number }>("/api/import/pdf", {
        method: "POST",
        body: form,
      });
      toast.success(
        "PDF imported",
        `${result.pages} page${result.pages === 1 ? "" : "s"} and ${result.characters.toLocaleString()} characters extracted.`,
      );
      setPdfForm({ title: "", courseId: pdfForm.courseId });
      setPdfFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (caught) {
      toast.error("Could not import the PDF", errorMessage(caught));
    } finally {
      setImporting(false);
    }
  }

  async function openResource(resource: Resource) {
    setActiveResource(resource);
    setResourceContent("");
    setSummary(null);
    setLoadingContent(true);
    try {
      const result = await apiFetch<{ resource: Resource }>(`/api/resources/${resource.id}`);
      setResourceContent(result.resource.content ?? "");
    } catch (caught) {
      toast.error("Could not open the material", errorMessage(caught));
    } finally {
      setLoadingContent(false);
    }
  }

  async function summarizeResource() {
    if (!activeResource || !resourceContent) return;
    setSummarizing(true);
    setSummary(null);
    try {
      const result = await apiFetch<{ markdown?: string }>("/api/ai/tool", {
        method: "POST",
        body: JSON.stringify({
          tool: "summarize",
          topic: activeResource.title,
          courseId: activeResource.course_id,
          text: resourceContent.slice(0, 24_000),
        }),
      });
      setSummary(result.markdown ?? "");
      toast.success("Summary ready");
    } catch (caught) {
      toast.error("Could not summarize the material", errorMessage(caught));
    } finally {
      setSummarizing(false);
    }
  }

  async function removeResource() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/resources/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Material deleted");
      if (activeResource?.id === deleteTarget.id) setActiveResource(null);
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      toast.error("Could not delete the material", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET);
      setBookmarkletCopied(true);
      toast.success("Bookmarklet copied", "Create a browser bookmark and paste this as its URL.");
      setTimeout(() => setBookmarkletCopied(false), 2200);
    } catch {
      toast.error("Could not copy", "Your browser blocked clipboard access.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load LMS data"
        description={error ?? "Something went wrong while loading your LMS connection."}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  const connected = overview.connected && overview.connection;
  const connection = overview.connection;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Integrations"
        title="LMS & imports"
        description="Connect Moodle with an official web-services token, or bring material in manually. Cortex never bypasses your institution's login."
        actions={
          connected ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDisconnectOpen(true)}>
                <Unplug className="size-4" /> Disconnect
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void sync()} disabled={syncing}>
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </>
          ) : undefined
        }
      />

      {syncSummary ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] px-4 py-3">
          <p className="flex items-start gap-2 text-[0.78rem] leading-relaxed text-[#b8f3d8]">
            <Check className="mt-0.5 size-4 shrink-0" /> {syncSummary}
          </p>
        </div>
      ) : null}

      {syncWarnings.length ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3">
          <p className="mb-1 flex items-center gap-2 text-[0.74rem] font-semibold text-[#f0d9a8]">
            <AlertTriangle className="size-4" /> Some data could not be synced
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[0.72rem] leading-relaxed text-[#9aa1aa]">
            {syncWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          <p className="mt-2 text-[0.68rem] text-[#6d747d]">
            This usually means the token is missing a web-service permission. Ask your Moodle administrator to enable the
            required functions, or keep using manual imports.
          </p>
        </div>
      ) : null}

      {connected && connection ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={BookOpen} label="LMS courses" value={overview.counts.courses} accent="#7aa2ff" />
            <StatCard icon={ClipboardList} label="Assignments" value={overview.counts.assignments} accent="#e7b44b" />
            <StatCard icon={FileText} label="Materials" value={overview.counts.resources} accent="#6ee7b7" />
            <StatCard icon={Megaphone} label="Announcements" value={overview.counts.announcements} accent="#c4a7ff" />
            <StatCard icon={CalendarDays} label="Events" value={overview.counts.events} accent="#f08a8a" />
          </div>

          <section className="surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#6ee7b7]/20 bg-[#6ee7b7]/10 text-[#6ee7b7]">
                  <PlugZap className="size-4" />
                </span>
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-[0.9rem] font-semibold text-[#f2f2ef]">
                    {connection.siteName ?? "Moodle"}
                    <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", connection.status === "error" ? "badge-red" : "badge-green")}>
                      {connection.status}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[0.72rem] text-[#9aa1aa]">
                    {connection.siteUrl}
                    {connection.username ? ` · signed in as ${connection.username}` : ""}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-[#6d747d]">
                    {connection.lastSyncAt ? `Last synced ${formatDateTime(connection.lastSyncAt)}` : "Not synced yet"}
                  </p>
                  {connection.lastError ? (
                    <p className="mt-1 rounded-lg border border-[#f08a8a]/20 bg-[#f08a8a]/[0.06] px-2.5 py-1.5 text-[0.7rem] text-[#ffb4b4]">
                      {connection.lastError}
                    </p>
                  ) : null}
                </div>
              </div>
              <a
                href={connection.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm shrink-0"
              >
                Open Moodle <ExternalLink className="size-3.5" />
              </a>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface p-4">
              <SectionHeader
                title="Announcements"
                description="Only items returned by the LMS token"
                action={
                  <span className="badge badge-blue px-1.5 py-0.5 text-[0.56rem]">LMS</span>
                }
              />
              {announcements.length ? (
                <div className="space-y-2">
                  {announcements.map((announcement) => (
                    <article key={announcement.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[0.78rem] font-medium text-[#f2f2ef]">{announcement.title}</p>
                        <span className="shrink-0 text-[0.62rem] text-[#555c66]">
                          {formatDate(announcement.published_at ?? announcement.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[0.64rem] text-[#6d747d]">{courseName(announcement.course_id)}</p>
                      {announcement.content ? (
                        <p className="mt-1 line-clamp-3 text-[0.72rem] leading-relaxed text-[#9aa1aa]">
                          {announcement.content}
                        </p>
                      ) : null}
                      {announcement.url ? (
                        <a
                          href={announcement.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-medium text-[#f3c96b] hover:underline"
                        >
                          Open announcement <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">
                  No announcements were returned. The token may not include forum permissions.
                </p>
              )}
            </section>

            <section className="surface p-4">
              <SectionHeader title="Upcoming LMS events" description="Calendar feed from Moodle" />
              {events.length ? (
                <div className="space-y-2">
                  {events.map((event) => (
                    <article key={event.id} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#9aa1aa]">
                        <CalendarDays className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.78rem] font-medium text-[#f2f2ef]">{event.title}</p>
                        <p className="mt-0.5 text-[0.66rem] text-[#6d747d]">
                          {formatDateTime(event.start_at)}
                          {event.course_id ? ` · ${courseName(event.course_id)}` : ""}
                        </p>
                      </div>
                      {event.url ? (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-icon shrink-0 p-1.5"
                          aria-label="Open event"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">No upcoming events returned.</p>
              )}
            </section>
          </div>

          <section className="surface p-4">
            <SectionHeader
              title="Course materials"
              description="Files and links imported from your LMS courses"
              action={<span className="badge badge-blue px-1.5 py-0.5 text-[0.56rem]">LMS</span>}
            />
            {materials.length ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {materials.map((material) => {
                  const href =
                    material.kind === "pdf" && material.url
                      ? `/api/lms/file/${material.id}`
                      : material.url;
                  return (
                    <article key={material.id} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#9aa1aa]">
                        <FileText className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.76rem] font-medium text-[#f2f2ef]">{material.title}</p>
                        <p className="mt-0.5 truncate text-[0.64rem] text-[#6d747d]">
                          {courseName(material.course_id)} · {material.kind}
                        </p>
                      </div>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-icon shrink-0 p-1.5"
                          aria-label={`Open ${material.title}`}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">
                No course materials were returned. Check that the token includes course-content permissions.
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="surface p-4">
            {connectStep === "url" ? (
              // URL‑entry step – ask for the LMS website
              <form onSubmit={connect} className="space-y-3">
                <div>
                  <label className="label" htmlFor="lms-url">LMS website URL</label>
                  <input
                    id="lms-url"
                    type="url"
                    className="input"
                    required
                    placeholder="https://iitj-learn.masaischool.com"
                    value={connectForm.siteUrl}
                    onChange={(event) => setConnectForm({ ...connectForm, siteUrl: event.target.value })}
                  />
                  <p className="mt-2 text-[0.66rem] text-[#6d747d]">
                    Enter your LMS website URL. We will detect the platform and show the correct connection method.
                  </p>
                </div>
                <button type="submit" className="btn btn-primary" disabled={connecting}>
                  {connecting ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                </button>
              </form>
            ) : connectStep === "token" ? (
              // Moodle token form – shown after URL is detected as Moodle
              <form onSubmit={connect} className="space-y-3">
                <div>
                  <label className="label" htmlFor="lms-url">Moodle site URL</label>
                  <input
                    id="lms-url"
                    type="url"
                    className="input"
                    required
                    placeholder="https://moodle.iitj.ac.in"
                    value={connectForm.siteUrl}
                    onChange={(event) => setConnectForm({ ...connectForm, siteUrl: event.target.value })}
                  />
                  <p className="mt-2 text-[0.66rem] text-[#6d747d]">
                    Your official Moodle site URL.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="lms-token">Web services token</label>
                  <input
                    id="lms-token"
                    type="password"
                    className="input"
                    required
                    autoComplete="off"
                    placeholder="Paste the token from Moodle → Preferences → Security keys"
                    value={connectForm.token}
                    onChange={(event) => setConnectForm({ ...connectForm, token: event.target.value })}
                  />
                  <p className="mt-1.5 flex items-start gap-1.5 text-[0.66rem] leading-relaxed text-[#6d747d]">
                    <ShieldCheck className="mt-0.5 size-3 shrink-0" />
                    The token is encrypted with AES-256-GCM and is never sent to the browser after saving.
                  </p>
                </div>
                <button type="submit" className="btn btn-primary" disabled={connecting}>
                  {connecting ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                  {connecting ? "Connecting and syncing…" : "Connect and sync"}
                </button>
              </form>
            ) : connectStep === "login" ? (
              // Custom LMS – open login page
              <div className="space-y-4">
                <p className="text-[0.76rem] leading-relaxed text-[#9aa1aa]">
                  Opening your LMS login page…
                </p>
                <p className="text-[0.7rem] text-[#6d747d]">
                  Sign in with your institutional credentials. After logging in, return to Cortex and click <button className="btn btn-primary" onClick={() => setConnectStep("sync")}>Sync</button> to import your data.
                </p>
                <a
                  href={connectForm.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary">
                  Open LMS in new tab
                </a>
              </div>
            ) : connectStep === "manual" ? (
              // Manual import fallback
              <div className="surface p-4">
                <SectionHeader title="Manual import" description="Use this when your LMS does not allow tokens, or for handouts and scanned notes." />
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Chip active={importMode === "text"} onClick={() => setImportMode("text")}>
                    Paste text or link
                  </Chip>
                  <Chip active={importMode === "pdf"} onClick={() => setImportMode("pdf")}>
                    Upload a PDF
                  </Chip>
                </div>
                {importMode === "text" ? (
                  <form onSubmit={importText} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="import-title">Title</label>
                        <input
                          id="import-title"
                          className="input"
                          required
                          placeholder="e.g. Unit 3 handout"
                          value={textForm.title}
                          onChange={(event) => setTextForm({ ...textForm, title: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="import-course">Course</label>
                        <select
                          id="import-course"
                          className="input"
                          value={textForm.courseId}
                          onChange={(event) => setTextForm({ ...textForm, courseId: event.target.value })}
                        >
                          <option value="">General</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.code ? `${course.code} — ` : ""}
                              {course.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label" htmlFor="import-source">Source URL (optional)</label>
                      <input
                        id="import-source"
                        type="url"
                        className="input"
                        placeholder="https://…"
                        value={textForm.sourceUrl}
                        onChange={(event) => setTextForm({ ...textForm, sourceUrl: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="import-text">Text</label>
                      <textarea
                        id="import-text"
                        className="input"
                        rows={7}
                        required
                        placeholder="Paste lecture notes, a handout, or the text of a page. Minimum 20 characters."
                        value={textForm.text}
                        onChange={(event) => setTextForm({ ...textForm, text: event.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={importing}>
                      {importing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      {importing ? "Importing…" : "Import text"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={importPdf} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="pdf-title">Title (optional)</label>
                        <input
                          id="pdf-title"
                          className="input"
                          placeholder="Defaults to the file name"
                          value={pdfForm.title}
                          onChange={(event) => setPdfForm({ ...pdfForm, title: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="pdf-course">Course</label>
                        <select
                          id="pdf-course"
                          className="input"
                          value={pdfForm.courseId}
                          onChange={(event) => setPdfForm({ ...pdfForm, courseId: event.target.value })}
                        >
                          <option value="">General</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.code ? `${course.code} — ` : ""}
                              {course.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label" htmlFor="pdf-file">PDF file (max 15 MB, text layer required)</label>
                      <input
                        id="pdf-file"
                        ref={fileInput}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="input file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-[0.72rem] file:text-[#f2f2ef]"
                        onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                      />
                      <p className="mt-1.5 text-[0.66rem] text-[#6d747d]">
                        Scanned PDFs without a text layer need OCR before import. Files are parsed on the server and are not sent to a third party.
                      </p>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={importing || !pdfFile}>
                      {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                      {importing ? "Extracting text…" : "Upload and import"}
                    </button>
                  </form>
                )}
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-2.5">
                      <Link2 className="mt-0.5 size-4 shrink-0 text-[#9aa1aa]" />
                      <div>
                        <p className="text-[0.78rem] font-semibold text-[#f2f2ef]">
                          Capture text from a browser page
                        </p>
                        <p className="mt-0.5 text-[0.7rem] leading-relaxed text-[#9aa1aa]">
                          Create a bookmark whose URL is the snippet below. On any LMS page, click it to copy the visible text, then
                          paste it into Manual import. It does not log in for you or bypass permissions.
                        </p>
                      </div>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => void copyBookmarklet()}>
                      {bookmarkletCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {bookmarkletCopied ? "Copied" : "Copy bookmarklet"}
                    </button>
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2 text-[0.62rem] leading-relaxed text-[#9aa1aa]">
                    {BOOKMARKLET}
                  </pre>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <section className="surface p-4">
        <SectionHeader
          title="Manual import"
          description="Use this when your LMS does not allow tokens, or for handouts and scanned notes."
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip active={importMode === "text"} onClick={() => setImportMode("text")}>
            Paste text or link
          </Chip>
          <Chip active={importMode === "pdf"} onClick={() => setImportMode("pdf")}>
            Upload a PDF
          </Chip>
        </div>

        {importMode === "text" ? (
          <form onSubmit={importText} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="import-title">Title</label>
                <input
                  id="import-title"
                  className="input"
                  required
                  placeholder="e.g. Unit 3 handout"
                  value={textForm.title}
                  onChange={(event) => setTextForm({ ...textForm, title: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="import-course">Course</label>
                <select
                  id="import-course"
                  className="input"
                  value={textForm.courseId}
                  onChange={(event) => setTextForm({ ...textForm, courseId: event.target.value })}
                >
                  <option value="">General</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code ? `${course.code} — ` : ""}
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="import-source">Source URL (optional)</label>
              <input
                id="import-source"
                type="url"
                className="input"
                placeholder="https://…"
                value={textForm.sourceUrl}
                onChange={(event) => setTextForm({ ...textForm, sourceUrl: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="import-text">Text</label>
              <textarea
                id="import-text"
                className="input"
                rows={7}
                required
                placeholder="Paste lecture notes, a handout, or the text of a page. Minimum 20 characters."
                value={textForm.text}
                onChange={(event) => setTextForm({ ...textForm, text: event.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={importing}>
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {importing ? "Importing…" : "Import text"}
            </button>
          </form>
        ) : (
          <form onSubmit={importPdf} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pdf-title">Title (optional)</label>
                <input
                  id="pdf-title"
                  className="input"
                  placeholder="Defaults to the file name"
                  value={pdfForm.title}
                  onChange={(event) => setPdfForm({ ...pdfForm, title: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="pdf-course">Course</label>
                <select
                  id="pdf-course"
                  className="input"
                  value={pdfForm.courseId}
                  onChange={(event) => setPdfForm({ ...pdfForm, courseId: event.target.value })}
                >
                  <option value="">General</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code ? `${course.code} — ` : ""}
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pdf-file">PDF file (max 15 MB, text layer required)</label>
              <input
                id="pdf-file"
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="input file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-[0.72rem] file:text-[#f2f2ef]"
                onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
              />
              <p className="mt-1.5 text-[0.66rem] text-[#6d747d]">
                Scanned PDFs without a text layer need OCR before import. Files are parsed on the server and are not sent to a
                third party.
              </p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={importing || !pdfFile}>
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {importing ? "Extracting text…" : "Upload and import"}
            </button>
          </form>
        )}

        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Link2 className="mt-0.5 size-4 shrink-0 text-[#9aa1aa]" />
              <div>
                <p className="text-[0.78rem] font-semibold text-[#f2f2ef]">Capture text from a browser page</p>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed text-[#9aa1aa]">
                  Create a bookmark whose URL is the snippet below. On any LMS page, click it to copy the visible text, then
                  paste it into Manual import. It does not log in for you or bypass permissions.
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => void copyBookmarklet()}>
              {bookmarkletCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {bookmarkletCopied ? "Copied" : "Copy bookmarklet"}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2 text-[0.62rem] leading-relaxed text-[#9aa1aa]">
            {BOOKMARKLET}
          </pre>
        </div>
      </section>

      <section className="surface p-4">
        <SectionHeader
          title="Imported material"
          description="PDFs and pasted text saved to your library"
          action={
            <Link href="/notes" className="text-[0.7rem] font-medium text-[#f3c96b] hover:underline">
              Open notes
            </Link>
          }
        />
        {resources.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {resources.map((resource) => (
              <article key={resource.id} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#9aa1aa]">
                  <FileText className="size-3.5" />
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openResource(resource)}>
                  <p className="truncate text-[0.76rem] font-medium text-[#f2f2ef]">{resource.title}</p>
                  <p className="mt-0.5 truncate text-[0.64rem] text-[#6d747d]">
                    {courseName(resource.course_id)} · {resource.kind} · {formatDate(resource.created_at)}
                  </p>
                  {resource.content ? (
                    <p className="mt-1 line-clamp-2 text-[0.68rem] leading-relaxed text-[#9aa1aa]">
                      {truncate(resource.content, 120)}
                    </p>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon shrink-0 p-1.5 hover:text-[#f08a8a]"
                  aria-label={`Delete ${resource.title}`}
                  onClick={() => setDeleteTarget(resource)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">
            Nothing imported manually yet. Paste text or upload a PDF above.
          </p>
        )}
      </section>

      <section className="surface p-4">
        <SectionHeader
          title="Synced from LMS"
          description="Lectures the Cortex LMS Sync extension pulled in from your course page. Read-only — the only control is the watched toggle, and Cortex never edits or deletes synced rows."
        />
        {lmsResources.length ? (
          <>
            <p className="mb-3 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#6d747d]">
              {lmsLectures.length} lectures
              {lmsNotes.length ? ` · ${lmsNotes.length} notes & materials` : ""}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {lmsLectures.map((resource) => {
                const watched = Boolean(resource.watched_at);
                const chapterTitle = resource.lms_module_id
                  ? chapterTitleById.get(resource.lms_module_id)
                  : undefined;
                return (
                  <article
                    key={resource.id}
                    className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10",
                        watched
                          ? "bg-[#6ee7b7]/10 text-[#6ee7b7]"
                          : "bg-white/[0.04] text-[#9aa1aa]",
                      )}
                    >
                      {watched ? <Check className="size-3.5" /> : <BookOpen className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.76rem] font-medium text-[#f2f2ef]">
                        {resource.title}
                      </p>
                      <p className="mt-0.5 truncate text-[0.64rem] text-[#6d747d]">
                        {courseName(resource.course_id)}
                        {chapterTitle ? ` · ${chapterTitle}` : ""}
                        {resource.duration_minutes
                          ? ` · ${minutesToLabel(resource.duration_minutes)}`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-[0.6rem] text-[#6d747d]">
                        <Clock className="mr-1 inline size-3 -translate-y-px" />
                        {watched ? "Watched" : "Not watched yet"} · synced{" "}
                        {formatDate(resource.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-icon p-1.5 text-[#f3c96b]"
                          aria-label={`Open ${resource.title} in the LMS`}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={watching === resource.id}
                        onClick={() => void toggleWatched(resource)}
                      >
                        {watching === resource.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}{" "}
                        {watched ? "Mark unwatched" : "Mark watched"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {lmsNotes.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#6d747d]">
                  Notes &amp; materials from the same pages
                </p>
                <div className="space-y-1.5">
                  {lmsNotes.map((note) => {
                    const row = (
                      <>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#8ab4f8]/10 text-[#8ab4f8]">
                          <FileText className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.74rem] text-[#f2f2ef]">
                          {note.title}
                        </span>
                        {note.lms_module_id && chapterTitleById.get(note.lms_module_id) ? (
                          <span className="hidden shrink-0 text-[0.62rem] text-[#6d747d] sm:block">
                            {chapterTitleById.get(note.lms_module_id)}
                          </span>
                        ) : null}
                        {note.url ? (
                          <ExternalLink className="size-3.5 shrink-0 text-[#f3c96b]" />
                        ) : null}
                      </>
                    );
                    const className =
                      "flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2";
                    return note.url ? (
                      <a
                        key={note.id}
                        href={note.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${className} transition-colors hover:border-[#f3c96b]/40`}
                      >
                        {row}
                      </a>
                    ) : (
                      <div key={note.id} className={className}>
                        {row}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="py-5 text-center text-[0.76rem] text-[#6d747d]">
            Nothing synced yet. Open your course page in the LMS while the extension is paired.
          </p>
        )}
      </section>

      <Modal
        open={Boolean(activeResource)}
        onClose={() => setActiveResource(null)}
        title={activeResource?.title ?? "Material"}
        description={activeResource ? `${courseName(activeResource.course_id)} · ${activeResource.kind}` : undefined}
        size="xl"
        footer={
          activeResource ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void summarizeResource()}
                disabled={summarizing || !resourceContent}
              >
                {summarizing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {summarizing ? "Summarizing…" : "Summarize with AI"}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setActiveResource(null)}>
                Done
              </button>
            </>
          ) : undefined
        }
      >
        {loadingContent ? (
          <LoadingBlock lines={6} />
        ) : (
          <div className="space-y-4">
            {resourceContent ? (
              <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/[0.06] bg-black/25 px-3.5 py-3 font-sans text-[0.8rem] leading-relaxed text-[#d9dde2]">
                {resourceContent}
              </pre>
            ) : (
              <p className="py-6 text-center text-[0.8rem] text-[#6d747d]">No extracted text available.</p>
            )}
            {summary ? (
              <div className="rounded-xl border border-[#e7b44b]/15 bg-[#e7b44b]/[0.045] px-3.5 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#e7b44b]">
                  <Sparkles className="size-3.5" /> AI summary
                </p>
                <Markdown className="text-[0.8rem]">{summary}</Markdown>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => void disconnect()}
        title="Disconnect this LMS?"
        description="The saved token will be deleted. Previously imported courses, assignments, and materials are kept."
        confirmLabel="Disconnect"
        busy={disconnecting}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void removeResource()}
        title="Delete this material?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed from your library.` : ""}
        confirmLabel="Delete material"
        busy={deleting}
      />
    </div>
  );
}
