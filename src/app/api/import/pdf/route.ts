import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, ApiError } from "@/lib/api";
import { nowIso } from "@/lib/utils";
import type { Course, Resource } from "@/lib/types";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Choose a PDF file to upload.");
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, "PDFs must be 15 MB or smaller.");
    }
    const name = file.name || "Imported PDF";
    if (!/\.pdf$/i.test(name) && file.type !== "application/pdf") {
      throw new ApiError(415, "Only PDF files are supported.");
    }

    const courseId = String(form.get("courseId") ?? "").trim() || null;
    if (courseId) {
      const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
        courseId,
        user.id,
      ]);
      if (!course) throw new ApiError(404, "Course not found.");
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    let text = "";
    let pages = 0;
    try {
      const pdf = await getDocumentProxy(buffer, { maxImageSize: 16_777_216 });
      pages = pdf.numPages;
      if (pages > 300) {
        throw new ApiError(413, "PDFs with more than 300 pages are not supported.");
      }
      const extracted = await extractText(pdf, { mergePages: true });
      text = Array.isArray(extracted.text) ? extracted.text.join("\n\n") : extracted.text;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        422,
        "That PDF could not be read. It may be encrypted, corrupted, or scanned without a text layer.",
      );
    }

    if (text.trim().length < 30) {
      throw new ApiError(
        422,
        "No readable text was found. Scanned PDFs need OCR before importing.",
      );
    }

    const title = String(form.get("title") ?? "").trim() || name.replace(/\.pdf$/i, "");
    const id = crypto.randomUUID();
    const now = nowIso();
    run(
      `INSERT INTO resources
       (id, user_id, course_id, title, kind, url, content, source, verified,
        duration_minutes, channel, description, lms_module_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pdf', NULL, ?, 'manual', 0, NULL, NULL, ?, NULL, ?, ?)`,
      [
        id,
        user.id,
        courseId,
        title.slice(0, 240),
        text.slice(0, 400_000),
        `Imported PDF · ${pages} page${pages === 1 ? "" : "s"}`,
        now,
        now,
      ],
    );

    const resource = queryOne<Resource>("SELECT * FROM resources WHERE id = ?", [id]);
    return json(
      {
        resource: resource
          ? { ...resource, content: resource.content?.slice(0, 300) ?? null }
          : null,
        pages,
        characters: text.length,
      },
      201,
    );
  });
}
