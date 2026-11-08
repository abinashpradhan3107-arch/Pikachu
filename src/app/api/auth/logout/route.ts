import { destroySession } from "@/lib/auth";
import { handleRoute, json } from "@/lib/api";

export async function POST() {
  return handleRoute(async () => {
    await destroySession();
    return json({ ok: true });
  });
}
