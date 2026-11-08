import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import type { ChatThread } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const threads = queryAll<ChatThread & { preview: string | null; message_count: number }>(
      `SELECT t.*,
        (SELECT content FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id) AS message_count
       FROM chat_threads t
       WHERE t.user_id = ?
       ORDER BY t.updated_at DESC
       LIMIT 50`,
      [user.id],
    );
    return json({ threads });
  });
}

export async function DELETE(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) throw new ApiError(400, "Thread id is required.");
    const thread = queryOne<ChatThread>(
      "SELECT * FROM chat_threads WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!thread) throw new ApiError(404, "Conversation not found.");
    run("DELETE FROM chat_threads WHERE id = ? AND user_id = ?", [id, user.id]);
    return json({ ok: true });
  });
}

export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = (await request.json()) as { id?: string; title?: string };
    if (!body.id || !body.title?.trim()) throw new ApiError(400, "Thread id and title are required.");
    const thread = queryOne<ChatThread>(
      "SELECT * FROM chat_threads WHERE id = ? AND user_id = ?",
      [body.id, user.id],
    );
    if (!thread) throw new ApiError(404, "Conversation not found.");
    run("UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?", [
      body.title.trim().slice(0, 120),
      new Date().toISOString(),
      body.id,
    ]);
    return json({ ok: true });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    run(
      `INSERT INTO chat_threads (id, user_id, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, 'ask', ?, ?)`,
      [id, user.id, body.title?.trim().slice(0, 120) || "New conversation", now, now],
    );
    const thread = queryOne<ChatThread>("SELECT * FROM chat_threads WHERE id = ?", [id]);
    return json({ thread }, 201);
  });
}
