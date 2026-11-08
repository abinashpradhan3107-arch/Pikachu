import { z } from "zod";
import { requireApiUser, handleRoute, json, readJson, rateLimit } from "@/lib/api";
import { generateDailyPlan, upsertDailyPlan } from "@/lib/plan/engine";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { completeChat } from "@/lib/ai/client";
import { getAcademicContext } from "@/lib/ai/context";
import { buildToolPrompt } from "@/lib/ai/prompts";
import { queryOne } from "@/lib/db";
import type { StudyTask } from "@/lib/types";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  regenerate: z.boolean().optional(),
});

function planText(tasks: StudyTask[]): string {
  return tasks
    .map(
      (task, index) =>
        `${index + 1}. ${task.title} — ${task.duration_minutes} min — ${task.task_type} — ${task.priority} priority${
          task.description ? ` — ${task.description}` : ""
        }`,
    )
    .join("\n");
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    rateLimit(`plan:${user.id}`, 10, 60_000);
    const body = bodySchema.parse(await readJson(request));

    const result = generateDailyPlan(user.id, body.date, {
      regenerate: body.regenerate,
    });

    const config = getAiRuntimeConfig(user.id);
    let aiBriefing: string | null = null;
    let aiError: string | null = null;

    if (config.configured && result.tasks.length > 0 && !result.needsSetup) {
      try {
        const context = getAcademicContext(user.id, profile.timezone);
        const prompt = buildToolPrompt(
          { tool: "daily-briefing", planText: planText(result.tasks) },
          context,
        );
        aiBriefing = await completeChat(config, prompt.messages, {
          maxTokens: 400,
          temperature: 0.5,
          timeoutMs: 45_000,
        });
        upsertDailyPlan(user.id, result.date, result.summary, result.totalMinutes, aiBriefing);
      } catch (error) {
        aiError =
          error instanceof Error
            ? error.message
            : "The AI briefing could not be generated.";
      }
    }

    const plan = queryOne<{ ai_briefing: string | null; summary: string | null }>(
      "SELECT ai_briefing, summary FROM daily_plans WHERE user_id = ? AND date = ?",
      [user.id, result.date],
    );

    return json({
      ...result,
      aiBriefing: aiBriefing ?? plan?.ai_briefing ?? null,
      aiError,
      aiConfigured: config.configured,
    });
  });
}
