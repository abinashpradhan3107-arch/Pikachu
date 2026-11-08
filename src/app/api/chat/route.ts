import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, rateLimit, ApiError } from "@/lib/api";
import { chatSchema } from "@/lib/validation";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { streamChat } from "@/lib/ai/client";
import { getAcademicContext } from "@/lib/ai/context";
import { buildChatMessages, type ChatMode } from "@/lib/ai/prompts";
import { nowIso, truncate } from "@/lib/utils";
import type { ChatMessage, ChatThread } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    rateLimit(`chat:${user.id}`, 30, 60_000);
    const body = chatSchema.parse(await readJson(request));
    const config = getAiRuntimeConfig(user.id);
    if (!config.configured) {
      return json(
        {
          error: "Connect an AI provider in Settings before starting a chat.",
          code: "AI_NOT_CONFIGURED",
        },
        400,
      );
    }

    let thread: ChatThread | null = null;
    if (body.threadId) {
      thread = queryOne<ChatThread>(
        "SELECT * FROM chat_threads WHERE id = ? AND user_id = ?",
        [body.threadId, user.id],
      );
      if (!thread) throw new ApiError(404, "Conversation not found.");
    } else {
      const id = crypto.randomUUID();
      const now = nowIso();
      const title = truncate(body.message.replace(/\s+/g, " ").trim(), 72);
      run(
        `INSERT INTO chat_threads (id, user_id, title, mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, user.id, title, body.mode ?? "ask", now, now],
      );
      thread = queryOne<ChatThread>("SELECT * FROM chat_threads WHERE id = ?", [id]);
    }
    if (!thread) throw new Error("Could not create the conversation.");

    const now = nowIso();
    run(
      `INSERT INTO chat_messages (id, thread_id, user_id, role, content, created_at)
       VALUES (?, ?, ?, 'user', ?, ?)`,
      [crypto.randomUUID(), thread.id, user.id, body.message, now],
    );
    run("UPDATE chat_threads SET updated_at = ?, mode = ? WHERE id = ?", [
      now,
      body.mode ?? thread.mode,
      thread.id,
    ]);

    const history = queryAll<ChatMessage>(
      "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 40",
      [thread.id],
    );
    const context = getAcademicContext(user.id, profile.timezone);
    const course = body.courseId
      ? context.courses.find((item) => item.id === body.courseId)
      : null;
    const chapter = body.chapterId
      ? context.chapters.find((item) => item.id === body.chapterId)
      : null;
    const extraInstruction = [
      course ? `The student is currently focused on the course ${course.title}.` : "",
      chapter ? `Relevant chapter: ${chapter.title}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const messages = buildChatMessages(
      context,
      history.map((message) => ({ role: message.role, content: message.content })),
      (body.mode ?? "ask") as ChatMode,
      extraInstruction,
    );

    const encoder = new TextEncoder();
    const threadId = thread.id;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = "";
        let sentDone = false;
        const send = (payload: unknown) => {
          if (sentDone) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          for await (const delta of streamChat(config, messages, {
            maxTokens: 3500,
            temperature: config.temperature,
            timeoutMs: 150_000,
          })) {
            full += delta;
            send({ type: "delta", delta });
          }
          if (full.trim()) {
            const messageId = crypto.randomUUID();
            run(
              `INSERT INTO chat_messages (id, thread_id, user_id, role, content, created_at)
               VALUES (?, ?, ?, 'assistant', ?, ?)`,
              [messageId, threadId, user.id, full, nowIso()],
            );
            run("UPDATE chat_threads SET updated_at = ? WHERE id = ?", [
              nowIso(),
              threadId,
            ]);
            send({ type: "done", threadId, messageId, title: thread?.title ?? "Conversation" });
          } else {
            send({ type: "error", message: "The AI returned an empty response." });
          }
        } catch (error) {
          if (full.trim()) {
            run(
              `INSERT INTO chat_messages (id, thread_id, user_id, role, content, created_at)
               VALUES (?, ?, ?, 'assistant', ?, ?)`,
              [crypto.randomUUID(), threadId, user.id, full, nowIso()],
            );
          }
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "The AI response was interrupted.",
          });
        } finally {
          sentDone = true;
          try {
            controller.close();
          } catch {
            // Client already disconnected.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
