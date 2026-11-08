"use client";

import {
  AlertTriangle,
  BookOpen,
  Brain,
  Check,
  Copy,
  History,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/ui/markdown";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import { CHAT_MODES, CHAT_STARTERS, type ChatMode } from "@/lib/chat-modes";
import type { Chapter, ChatThread, Course } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type ThreadSummary = ChatThread & { preview: string | null; message_count: number };

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  failed?: boolean;
};

type AiStatus = {
  configured: boolean;
  model: string;
  source: string;
};

type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "done"; threadId: string; messageId?: string; title?: string }
  | { type: "error"; message?: string };

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Cortex is thinking">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-pulse rounded-full bg-[#9aa1aa]"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}

export function ChatView() {
  const toast = useToast();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [ai, setAi] = useState<AiStatus>({ configured: false, model: "", source: "none" });
  const [mode, setMode] = useState<ChatMode>("ask");
  const [courseId, setCourseId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ThreadSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const data = await apiFetch<{ threads: ThreadSummary[] }>("/api/chat/threads");
      setThreads(data.threads);
    } catch {
      // The conversation list is non-critical; the chat surface still works.
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [threadData, aiData, courseData, chapterData] = await Promise.all([
        apiFetch<{ threads: ThreadSummary[] }>("/api/chat/threads"),
        apiFetch<{ settings: AiStatus }>("/api/settings/ai"),
        apiFetch<{ courses: Course[] }>("/api/courses"),
        apiFetch<{ chapters: Chapter[] }>("/api/chapters"),
      ]);
      setThreads(threadData.threads);
      setAi(aiData.settings);
      setCourses(courseData.courses);
      setChapters(chapterData.chapters);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openThread = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    setThreadId(id);
    setHistoryOpen(false);
    setLoadingThread(true);
    try {
      const data = await apiFetch<{ thread: ChatThread; messages: UiMessage[] }>(
        `/api/chat/threads/${id}`,
      );
      setMessages(
        data.messages.map((message) => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })),
      );
      setMode((data.thread.mode as ChatMode) || "ask");
    } catch (caught) {
      toast.error("Could not open the conversation", errorMessage(caught));
    } finally {
      setLoadingThread(false);
    }
  }, [toast]);

  function newChat() {
    if (abortRef.current) abortRef.current.abort();
    setThreadId(null);
    setMessages([]);
    setInput("");
    setHistoryOpen(false);
    setStreaming(false);
  }

  async function deleteThread() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/chat/threads?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("Conversation deleted");
      if (threadId === deleteTarget.id) newChat();
      setDeleteTarget(null);
      await loadThreads();
    } catch (caught) {
      toast.error("Could not delete the conversation", errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || streaming) return;
    if (!ai.configured) {
      toast.warning("Connect an AI provider", "Add an OpenAI-compatible key in Settings first.");
      return;
    }

    const assistantId = `stream-${Date.now()}`;
    setInput("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          threadId,
          message: text,
          mode,
          courseId: courseId || null,
          chapterId: chapterId || null,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        if (payload?.code === "AI_NOT_CONFIGURED") {
          setAi((current) => ({ ...current, configured: false }));
        }
        throw new Error(payload?.error || `The request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The AI response could not be streamed.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let nextThreadId: string | null = null;
      let finished = false;

      const handleEvent = (event: StreamEvent) => {
        if (event.type === "delta") {
          accumulated += event.delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: accumulated } : message,
            ),
          );
        } else if (event.type === "done") {
          nextThreadId = event.threadId;
          finished = true;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    id: event.messageId ?? message.id,
                    streaming: false,
                  }
                : message,
            ),
          );
        } else if (event.type === "error") {
          throw new Error(event.message || "The AI response was interrupted.");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              handleEvent(JSON.parse(raw) as StreamEvent);
            } catch (caught) {
              if (caught instanceof SyntaxError) continue;
              throw caught;
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

      if (!finished && !accumulated.trim()) {
        throw new Error("The AI returned an empty response.");
      }

      setMessages((current) =>
        current.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
      );

      if (nextThreadId) {
        setThreadId(nextThreadId);
        await loadThreads();
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, content: message.content || "Stopped." }
              : message,
          ),
        );
      } else {
        const message = errorMessage(caught);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, streaming: false, failed: !item.content }
              : item,
          ),
        );
        toast.error("The response was interrupted", message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function copyMessage(message: UiMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1600);
    } catch {
      toast.error("Could not copy", "Your browser blocked clipboard access.");
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const courseChapters = courseId
    ? chapters.filter((chapter) => chapter.course_id === courseId)
    : [];

  const activeThread = threads.find((thread) => thread.id === threadId);

  const threadList = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <History className="size-3.5 text-[#6d747d]" />
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#9aa1aa]">
            Conversations
          </p>
        </div>
        <span className="badge px-1.5 py-0.5 text-[0.58rem]">{threads.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {threads.length ? (
          threads.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                "group relative rounded-lg border transition-colors",
                thread.id === threadId
                  ? "border-[#e7b44b]/30 bg-[#e7b44b]/[0.07]"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.03]",
              )}
            >
              <button
                type="button"
                onClick={() => void openThread(thread.id)}
                className="w-full px-2.5 py-2 pr-8 text-left"
              >
                <p
                  className={cn(
                    "truncate text-[0.76rem] font-medium",
                    thread.id === threadId ? "text-[#f3c96b]" : "text-[#e4e7ea]",
                  )}
                >
                  {thread.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-[#6d747d]">
                  {thread.preview || "No messages yet"}
                </p>
                <p className="mt-1 text-[0.58rem] text-[#555c66]">
                  {formatDateTime(thread.updated_at)} · {thread.message_count} message
                  {thread.message_count === 1 ? "" : "s"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(thread)}
                className="btn btn-ghost btn-icon absolute right-1 top-1.5 p-1 text-transparent transition-colors group-hover:text-[#6d747d] hover:!text-[#f08a8a]"
                aria-label={`Delete ${thread.title}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        ) : (
          <div className="px-3 py-8 text-center">
            <MessageSquareText className="mx-auto mb-2 size-5 text-[#555c66]" />
            <p className="text-[0.74rem] text-[#6d747d]">No conversations yet.</p>
            <p className="mt-1 text-[0.66rem] text-[#555c66]">Ask your first question to begin.</p>
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.06] p-2">
        <button type="button" className="btn btn-secondary btn-sm w-full" onClick={newChat}>
          <Plus className="size-3.5" /> New conversation
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingBlock lines={2} className="max-w-xl" />
        <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          <div className="skeleton hidden h-[520px] rounded-xl lg:block" />
          <div className="skeleton h-[520px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not open AI Chat"
        description={error}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="AI mentor"
        title="Chat with Cortex"
        description="Grounded in your real courses, chapters, exams, and study plan. It will say when something is not recorded."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary lg:hidden"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" /> History
            </button>
            <button type="button" className="btn btn-primary" onClick={newChat}>
              <Plus className="size-4" /> New chat
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="surface hidden h-[calc(100dvh-10.5rem)] min-h-[520px] overflow-hidden lg:block">
          {threadList}
        </aside>

        <section className="surface flex h-[calc(100dvh-10.5rem)] min-h-[540px] flex-col overflow-hidden">
          <div className="border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-accent">
                <Brain className="size-3" />
                {ai.configured ? ai.model : "AI not connected"}
              </span>
              {activeThread ? (
                <span className="hidden min-w-0 flex-1 truncate text-[0.7rem] text-[#6d747d] sm:block">
                  {activeThread.title}
                </span>
              ) : (
                <span className="hidden flex-1 text-[0.7rem] text-[#6d747d] sm:block">
                  New conversation
                </span>
              )}
              {streaming ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={stopStreaming}>
                  <Square className="size-3" /> Stop
                </button>
              ) : null}
            </div>

            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {CHAT_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.description}
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-medium transition-colors",
                    mode === item.id
                      ? "border-[#e7b44b]/40 bg-[#e7b44b]/12 text-[#f3c96b]"
                      : "border-white/10 bg-white/[0.025] text-[#9aa1aa] hover:border-white/20 hover:text-[#f2f2ef]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                className="input py-1.5 text-[0.74rem]"
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setChapterId("");
                }}
                aria-label="Focus course"
              >
                <option value="">All courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code ? `${course.code} — ` : ""}
                    {course.title}
                  </option>
                ))}
              </select>
              <select
                className="input py-1.5 text-[0.74rem] disabled:opacity-40"
                value={chapterId}
                onChange={(event) => setChapterId(event.target.value)}
                disabled={!courseId}
                aria-label="Focus chapter"
              >
                <option value="">All chapters</option>
                {courseChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!ai.configured ? (
            <div className="flex flex-col gap-2 border-b border-amber-400/15 bg-amber-400/[0.045] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <p className="text-[0.74rem] leading-relaxed text-[#9aa1aa]">
                  <span className="font-semibold text-[#f2f2ef]">AI is not connected.</span>{" "}
                  Add an OpenAI-compatible key to start chatting.
                </p>
              </div>
              <Link href="/settings" className="btn btn-secondary btn-sm shrink-0">
                Open settings
              </Link>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            {loadingThread ? (
              <div className="mx-auto max-w-lg space-y-3">
                <LoadingBlock lines={3} />
                <LoadingBlock lines={4} />
              </div>
            ) : messages.length ? (
              <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border",
                          isUser
                            ? "border-white/10 bg-white/[0.05] text-[#c6cbd1]"
                            : "border-[#e7b44b]/25 bg-[#e7b44b]/10 text-[#e7b44b]",
                        )}
                      >
                        {isUser ? (
                          <span className="text-[0.6rem] font-semibold">You</span>
                        ) : (
                          <Brain className="size-3.5" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "group relative max-w-[88%] rounded-2xl border px-3.5 py-2.5",
                          isUser
                            ? "border-[#e7b44b]/20 bg-[#e7b44b]/[0.08]"
                            : "border-white/[0.07] bg-white/[0.02]",
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap text-[0.84rem] leading-relaxed text-[#f2f2ef]">
                            {message.content}
                          </p>
                        ) : message.content ? (
                          <Markdown className="text-[0.84rem]">{message.content}</Markdown>
                        ) : (
                          <TypingDots />
                        )}
                        {message.streaming && message.content ? (
                          <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-[#e7b44b] align-middle" />
                        ) : null}
                        {message.failed ? (
                          <p className="mt-1.5 flex items-center gap-1 text-[0.68rem] text-[#ffb4b4]">
                            <AlertTriangle className="size-3" /> The response did not complete.
                          </p>
                        ) : null}
                        {!isUser && message.content && !message.streaming ? (
                          <button
                            type="button"
                            onClick={() => void copyMessage(message)}
                            className="btn btn-ghost btn-icon absolute -right-1 -top-1 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Copy response"
                          >
                            {copiedId === message.id ? (
                              <Check className="size-3 text-[#6ee7b7]" />
                            ) : (
                              <Copy className="size-3 text-[#6d747d]" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-6 text-center">
                <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-[#e7b44b]/25 bg-[#e7b44b]/10 text-[#e7b44b]">
                  <Brain className="size-5" />
                </div>
                <h3 className="text-[0.98rem] font-semibold text-[#f2f2ef]">
                  What are you working through?
                </h3>
                <p className="mt-1 max-w-md text-[0.78rem] leading-relaxed text-[#9aa1aa]">
                  Cortex can explain concepts, build notes, quiz you, and plan revision using your
                  recorded syllabus and deadlines.
                </p>
                <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
                  {CHAT_STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void send(starter)}
                      disabled={!ai.configured}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left text-[0.75rem] leading-relaxed text-[#c6cbd1] transition-colors hover:border-[#e7b44b]/30 hover:bg-[#e7b44b]/[0.045] disabled:opacity-40"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
                {!courses.length ? (
                  <p className="mt-4 flex items-center gap-1.5 text-[0.68rem] text-[#6d747d]">
                    <BookOpen className="size-3.5" /> Add courses to make answers specific to your
                    semester.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.06] bg-black/15 px-3 py-3 sm:px-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder={
                    ai.configured
                      ? "Ask about a concept, a problem set, or what to study next…"
                      : "Connect an AI provider to start chatting…"
                  }
                  disabled={!ai.configured || streaming}
                  className="input max-h-40 min-h-[42px] flex-1 resize-none py-2.5 text-[0.84rem] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!ai.configured || streaming || !input.trim()}
                  className="btn btn-primary shrink-0 px-3 py-2.5"
                  aria-label="Send message"
                >
                  {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[0.62rem] text-[#555c66]">
                <span>Enter to send · Shift+Enter for a new line</span>
                <span className="hidden sm:inline">·</span>
                <span>Mode: {CHAT_MODES.find((item) => item.id === mode)?.label}</span>
                {courseId ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3" />
                      {courses.find((course) => course.id === courseId)?.title}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Conversations"
        description="Open a previous chat or start a new one."
        size="sm"
      >
        <div className="max-h-[55vh] overflow-y-auto">
          <div className="mb-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm w-full"
              onClick={() => {
                newChat();
                setHistoryOpen(false);
              }}
            >
              <Plus className="size-3.5" /> New conversation
            </button>
          </div>
          <div className="space-y-1">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02]"
              >
                <button
                  type="button"
                  onClick={() => void openThread(thread.id)}
                  className="min-w-0 flex-1 px-2.5 py-2 text-left"
                >
                  <p className="truncate text-[0.78rem] font-medium text-[#f2f2ef]">{thread.title}</p>
                  <p className="truncate text-[0.64rem] text-[#6d747d]">
                    {formatDateTime(thread.updated_at)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(thread)}
                  className="btn btn-ghost btn-icon m-1 shrink-0 p-1 text-[#6d747d]"
                  aria-label={`Delete ${thread.title}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {!threads.length ? (
              <p className="py-6 text-center text-[0.76rem] text-[#6d747d]">No conversations yet.</p>
            ) : null}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteThread()}
        title="Delete this conversation?"
        description={
          deleteTarget
            ? `“${deleteTarget.title}” and its messages will be removed from your workspace.`
            : ""
        }
        confirmLabel="Delete conversation"
        busy={deleting}
      />
    </div>
  );
}
