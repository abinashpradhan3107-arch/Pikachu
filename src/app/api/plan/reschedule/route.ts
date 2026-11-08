import { z } from "zod";
import { requireApiUser, handleRoute, json, readJson } from "@/lib/api";
import { rescheduleMissedTasks } from "@/lib/plan/engine";
import { dateInTimeZone } from "@/lib/utils";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    const body = bodySchema.parse(await readJson(request).catch(() => ({})));
    const date = body.date ?? dateInTimeZone(profile.timezone);
    const moved = rescheduleMissedTasks(user.id, date);
    return json({
      moved,
      message:
        moved > 0
          ? `${moved} missed task${moved === 1 ? "" : "s"} moved into the next available slots.`
          : "No missed tasks to reschedule.",
    });
  });
}
