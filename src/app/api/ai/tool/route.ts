import { z } from "zod";
import { requireApiUser, handleRoute, json, readJson, rateLimit, ApiError } from "@/lib/api";
import { toolSchema } from "@/lib/validation";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { completeChat, extractJson } from "@/lib/ai/client";
import { getAcademicContext } from "@/lib/ai/context";
import { buildToolPrompt } from "@/lib/ai/prompts";
import { run } from "@/lib/db";
import { nowIso } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/types";

const quizPayloadSchema = z.object({
  title: z.string().trim().max(200).optional(),
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(2000),
        options: z.array(z.string().trim().min(1).max(500)).length(4),
        answerIndex: z.coerce.number().int().min(0).max(3),
        explanation: z.string().trim().min(1).max(2000),
        difficulty: z.string().trim().max(20).optional(),
      }),
    )
    .min(3)
    .max(20),
});

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    rateLimit(`tool:${user.id}`, 20, 60_000);
    const body = toolSchema.parse(await readJson(request));
    const config = getAiRuntimeConfig(user.id);
    if (!config.configured) {
      throw new ApiError(
        400,
        "Connect an AI provider in Settings before using AI tools.",
      );
    }

    const context = getAcademicContext(user.id, profile.timezone);
    const prompt = buildToolPrompt(body, context);

    let content = await completeChat(config, prompt.messages, {
      maxTokens: body.tool === "quiz" ? 3500 : 4000,
      temperature: body.tool === "quiz" ? 0.5 : config.temperature,
      timeoutMs: 120_000,
    });

    if (body.tool === "quiz") {
      let parsed: z.infer<typeof quizPayloadSchema>;
      try {
        parsed = quizPayloadSchema.parse(extractJson(content));
      } catch {
        content = await completeChat(
          config,
          [
            ...prompt.messages,
            { role: "assistant", content },
            {
              role: "user",
              content:
                "That response was not valid JSON in the required shape. Return ONLY the JSON object now. No markdown fences, no commentary. Keep the same questions.",
            },
          ],
          { maxTokens: 3500, temperature: 0.2, timeoutMs: 90_000 },
        );
        parsed = quizPayloadSchema.parse(extractJson(content));
      }

      const id = crypto.randomUUID();
      const title = parsed.title || prompt.title;
      run(
        `INSERT INTO quizzes (id, user_id, course_id, title, questions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          user.id,
          body.courseId ?? null,
          title,
          JSON.stringify(parsed.questions),
          nowIso(),
        ],
      );
      return json({
        kind: "quiz",
        title,
        quizId: id,
        questions: parsed.questions as QuizQuestion[],
      });
    }

    let noteId: string | null = null;
    if (prompt.saveKind) {
      noteId = crypto.randomUUID();
      run(
        `INSERT INTO notes (id, user_id, course_id, chapter_id, title, content, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          noteId,
          user.id,
          body.courseId ?? null,
          body.chapterId ?? null,
          prompt.title.slice(0, 240),
          content,
          prompt.saveKind,
          nowIso(),
          nowIso(),
        ],
      );
    }

    return json({
      kind: prompt.saveKind ?? "answer",
      title: prompt.title,
      noteId,
      markdown: content,
    });
  });
}
