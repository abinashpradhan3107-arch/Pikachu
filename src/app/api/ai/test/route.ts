import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { testAiConnection } from "@/lib/ai/client";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const config = getAiRuntimeConfig(user.id);
    if (!config.configured) {
      throw new ApiError(400, "Add an API key and model first.");
    }
    const reply = await testAiConnection(config);
    return json({ ok: true, reply, model: config.model });
  });
}
