"use client";

import {
  AlertTriangle,
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Chip, PageHeader, StatCard } from "@/components/ui/page";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { Course } from "@/lib/types";
import { cn, formatDate, minutesToLabel } from "@/lib/utils";

type PublicVideo = {
  id: string;
  title: string;
  url: string;
  videoId: string;
  channel: string | null;
  durationMinutes: number | null;
  topic: string | null;
  reason: string | null;
  priority: string;
  thumbnailUrl: string | null;
  verified: boolean;
  status: string;
  createdAt: string;
  courseId: string | null;
  chapterId: string | null;
};

const STATUS_FILTERS = ["all", "new", "saved", "watched", "dismissed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const PRIORITY_STYLES: Record<string, string> = {
  high: "badge-red",
  medium: "badge-accent",
  low: "badge-green",
};

const STATUS_STYLES: Record<string, string> = {
  new: "badge-blue",
  saved: "badge-accent",
  watched: "badge-green",
  dismissed: "",
};

export function VideosView() {
  const toast = useToast();
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [hasYoutubeKey, setHasYoutubeKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicVideo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ url: "", topic: "", courseId: "" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [videoData, courseData] = await Promise.all([
        apiFetch<{ recommendations: PublicVideo[]; hasYoutubeKey: boolean }>("/api/videos"),
        apiFetch<{ courses: Course[] }>("/api/courses"),
      ]);
      setVideos(videoData.recommendations);
      setHasYoutubeKey(videoData.hasYoutubeKey);
      setCourses(courseData.courses);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return videos.filter((video) => {
      if (filter !== "all" && video.status !== filter) return false;
      if (courseFilter && video.courseId !== courseFilter) return false;
      if (query) {
        const haystack = `${video.title} ${video.channel ?? ""} ${video.topic ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [videos, filter, courseFilter, search]);

  const counts = useMemo(
    () => ({
      new: videos.filter((video) => video.status === "new").length,
      saved: videos.filter((video) => video.status === "saved").length,
      watched: videos.filter((video) => video.status === "watched").length,
    }),
    [videos],
  );

  async function generate() {
    setGenerating(true);
    try {
      const result = await apiFetch<{ recommendations: PublicVideo[] }>("/api/videos/generate", {
        method: "POST",
        body: JSON.stringify({ courseId: courseFilter || null }),
      });
      setVideos(result.recommendations);
      toast.success(
        "Recommendations ready",
        "Every link was checked against YouTube before being shown.",
      );
    } catch (caught) {
      toast.error("Could not generate recommendations", errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(video: PublicVideo, status: string) {
    setBusyId(video.id);
    try {
      await apiFetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setVideos((current) =>
        current.map((item) => (item.id === video.id ? { ...item, status } : item)),
      );
      toast.success(status === "watched" ? "Marked watched" : status === "saved" ? "Saved" : "Updated");
    } catch (caught) {
      toast.error("Could not update the video", errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/videos/${deleteTarget.id}`, { method: "DELETE" });
      setVideos((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success("Recommendation removed");
      setDeleteTarget(null);
    } catch (caught) {
      toast.error("Could not remove the video", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function addVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    try {
      const result = await apiFetch<{ recommendation: PublicVideo | null }>("/api/videos", {
        method: "POST",
        body: JSON.stringify({
          url: addForm.url.trim(),
          topic: addForm.topic.trim() || undefined,
          courseId: addForm.courseId || null,
        }),
      });
      if (result.recommendation) {
        setVideos((current) => [result.recommendation as PublicVideo, ...current]);
      }
      toast.success("Video added", "The link was verified with YouTube.");
      setAddOpen(false);
      setAddForm({ url: "", topic: "", courseId: "" });
    } catch (caught) {
      toast.error("Could not add the video", errorMessage(caught));
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load video recommendations"
        description={error}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Try again
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Verified lectures"
        description="Recommendations are tied to your unscheduled chapters and checked against YouTube before display. Prefer NPTEL, MIT OpenCourseWare, and IIT channels."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add a link
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void generate()}
              disabled={generating || !hasYoutubeKey}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {generating ? "Searching…" : "Recommend videos"}
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Sparkles}
          label="New suggestions"
          value={counts.new}
          hint="Not yet saved or watched"
          accent="#7aa2ff"
        />
        <StatCard
          icon={BookOpen}
          label="Saved for later"
          value={counts.saved}
          hint="Your shortlist"
          accent="#e7b44b"
        />
        <StatCard
          icon={Check}
          label="Watched"
          value={counts.watched}
          hint="Completed lecture sessions"
          accent="#6ee7b7"
        />
      </div>

      {!hasYoutubeKey ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Video className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-[0.8rem] font-semibold text-[#f2f2ef]">YouTube search is not connected</p>
              <p className="text-[0.74rem] text-[#9aa1aa]">
                Add a YouTube Data API v3 key in Settings to generate recommendations. Manual links still work and are verified.
              </p>
            </div>
          </div>
          <Link href="/settings" className="btn btn-secondary btn-sm shrink-0">
            Open settings
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((item) => (
            <Chip key={item} active={filter === item} onClick={() => setFilter(item)}>
              {item === "all" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
              {item !== "all" ? ` · ${videos.filter((video) => video.status === item).length}` : ` · ${videos.length}`}
            </Chip>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="input sm:w-56"
            value={courseFilter}
            onChange={(event) => setCourseFilter(event.target.value)}
            aria-label="Filter by course"
          >
            <option value="">All courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code ? `${course.code} — ` : ""}
                {course.title}
              </option>
            ))}
          </select>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6d747d]" />
            <input
              className="input pl-9"
              placeholder="Search lectures…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      {!visible.length ? (
        <EmptyState
          icon={PlayCircle}
          title={videos.length ? "No videos match this view" : "No recommendations yet"}
          description={
            videos.length
              ? "Try another status, course, or search term."
              : "Generate recommendations from your unscheduled chapters, or add a specific lecture link you already trust."
          }
          action={
            videos.length ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFilter("all");
                  setCourseFilter("");
                  setSearch("");
                }}
              >
                Clear filters
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void generate()}
                  disabled={generating || !hasYoutubeKey}
                >
                  <Sparkles className="size-4" /> Recommend videos
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" /> Add a link
                </button>
              </>
            )
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((video) => {
            const course = courses.find((item) => item.id === video.courseId);
            return (
              <article key={video.id} className="surface surface-hover overflow-hidden">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block aspect-video overflow-hidden bg-black/40"
                >
                  {video.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[#6d747d]">
                      <PlayCircle className="size-8" />
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                    <span className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      <PlayCircle className="size-5" />
                    </span>
                  </span>
                  {video.durationMinutes ? (
                    <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.62rem] font-medium text-white">
                      {minutesToLabel(video.durationMinutes)}
                    </span>
                  ) : null}
                </a>

                <div className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 text-[0.84rem] font-semibold leading-snug text-[#f2f2ef] hover:text-[#f3c96b]"
                    >
                      {video.title}
                    </a>
                    <span className={cn("badge shrink-0 px-1.5 py-0.5 text-[0.56rem]", STATUS_STYLES[video.status])}>
                      {video.status}
                    </span>
                  </div>

                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.66rem] text-[#6d747d]">
                    {video.channel ? <span className="truncate">{video.channel}</span> : null}
                    {course ? (
                      <>
                        <span>·</span>
                        <span className="truncate">{course.title}</span>
                      </>
                    ) : null}
                    {video.verified ? (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-[#6ee7b7]">
                          <ShieldCheck className="size-3" /> verified
                        </span>
                      </>
                    ) : null}
                  </p>

                  {video.topic ? (
                    <p className="text-[0.68rem] text-[#9aa1aa]">
                      Topic: <span className="text-[#d9dde2]">{video.topic}</span>
                    </p>
                  ) : null}

                  {video.reason ? (
                    <p className="line-clamp-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2 text-[0.7rem] leading-relaxed text-[#9aa1aa]">
                      {video.reason}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", PRIORITY_STYLES[video.priority] ?? "")}>
                        {video.priority}
                      </span>
                      <span className="text-[0.62rem] text-[#555c66]">{formatDate(video.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {video.status !== "saved" && video.status !== "watched" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon p-1.5"
                          title="Save for later"
                          aria-label="Save for later"
                          disabled={busyId === video.id}
                          onClick={() => void updateStatus(video, "saved")}
                        >
                          {busyId === video.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <BookOpen className="size-3.5" />
                          )}
                        </button>
                      ) : null}
                      {video.status !== "watched" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon p-1.5 hover:text-[#6ee7b7]"
                          title="Mark watched"
                          aria-label="Mark watched"
                          disabled={busyId === video.id}
                          onClick={() => void updateStatus(video, "watched")}
                        >
                          <Check className="size-3.5" />
                        </button>
                      ) : null}
                      {video.status !== "dismissed" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon p-1.5"
                          title="Dismiss"
                          aria-label="Dismiss"
                          disabled={busyId === video.id}
                          onClick={() => void updateStatus(video, "dismissed")}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-icon p-1.5"
                        title="Open on YouTube"
                        aria-label="Open on YouTube"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon p-1.5 hover:text-[#f08a8a]"
                        title="Remove"
                        aria-label="Remove"
                        onClick={() => setDeleteTarget(video)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[0.7rem] leading-relaxed text-[#6d747d]">
        Every recommendation is checked with YouTube&apos;s oEmbed endpoint. Cortex never invents a video ID,
        and a private or removed video will not be displayed as a working link.
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a lecture link"
        description="Paste a YouTube link. Cortex verifies the title and channel before saving it."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </button>
            <button type="submit" form="video-form" className="btn btn-primary" disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {adding ? "Verifying…" : "Verify and add"}
            </button>
          </>
        }
      >
        <form id="video-form" onSubmit={addVideo} className="space-y-3">
          <div>
            <label className="label" htmlFor="video-url">YouTube URL</label>
            <input
              id="video-url"
              type="url"
              className="input"
              required
              placeholder="https://www.youtube.com/watch?v=…"
              value={addForm.url}
              onChange={(event) => setAddForm({ ...addForm, url: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="video-topic">Topic (optional)</label>
            <input
              id="video-topic"
              className="input"
              placeholder="e.g. Laplace transforms"
              value={addForm.topic}
              onChange={(event) => setAddForm({ ...addForm, topic: event.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="video-course">Course (optional)</label>
            <select
              id="video-course"
              className="input"
              value={addForm.courseId}
              onChange={(event) => setAddForm({ ...addForm, courseId: event.target.value })}
            >
              <option value="">No specific course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code ? `${course.code} — ` : ""}
                  {course.title}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
        title="Remove this recommendation?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed from your list.` : ""}
        confirmLabel="Remove video"
        busy={deleting}
      />
    </div>
  );
}
