import { queryAll, queryOne } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import type { ChatMessage, ChatThread } from "@/lib/types";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const thread = queryOne<ChatThread>(
      "SELECT * FROM chat_threads WHERE id = ? AND user_id = ?",
      [id, user.id],
    );
    if (!thread) throw new ApiError(404, "Conversation not found.");
    const messages = queryAll<ChatMessage>(
      "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC",
      [id],
    );
    return json({ thread, messages });
  });
}
