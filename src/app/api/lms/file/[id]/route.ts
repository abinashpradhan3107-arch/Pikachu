import { requireApiUser, handleRoute, fail } from "@/lib/api";
import { getMoodleFileUrl } from "@/lib/lms/moodle";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const { id } = await context.params;
    const file = getMoodleFileUrl(user.id, id);
    if (!file) return fail(404, "This LMS file is not available.");

    const response = await fetch(file.url, {
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: "*/*" },
    });
    if (!response.ok || !response.body) {
      return fail(502, `The LMS file could not be fetched (HTTP ${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const safeName = file.title.replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  });
}
