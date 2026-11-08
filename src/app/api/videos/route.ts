import { queryAll, queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError } from "@/lib/api";
import { videoCreateSchema } from "@/lib/validation";
import { verifyYouTubeVideo, videoRowToPublic } from "@/lib/youtube";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { nowIso } from "@/lib/utils";
import type { Course, VideoRecommendation } from "@/lib/types";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const recommendations = queryAll<VideoRecommendation>(
      "SELECT * FROM video_recommendations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [user.id],
    );
    return json({
      recommendations: recommendations.map(videoRowToPublic),
      hasYoutubeKey: Boolean(getAiRuntimeConfig(user.id).youtubeApiKey),
    });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    const body = videoCreateSchema.parse(await readJson(request));
    if (body.courseId) {
      const course = queryOne<Course>("SELECT * FROM courses WHERE id = ? AND user_id = ?", [
        body.courseId,
        user.id,
      ]);
      if (!course) throw new ApiError(404, "Course not found.");
    }
    let verified;
    try {
      verified = await verifyYouTubeVideo(body.url);
    } catch (error) {
      throw new ApiError(
        400,
        error instanceof Error ? error.message : "That video could not be verified.",
      );
    }
    const id = crypto.randomUUID();
    run(
      `INSERT INTO video_recommendations
       (id, user_id, course_id, chapter_id, topic, title, url, video_id, channel,
        duration_minutes, reason, priority, thumbnail_url, verified, status, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'medium', ?, 1, 'saved', ?)`,
      [
        id,
        user.id,
        body.courseId ?? null,
        body.topic ?? null,
        verified.title,
        verified.url,
        verified.videoId,
        verified.channel,
        body.durationMinutes ?? null,
        "Added manually and verified with YouTube.",
        verified.thumbnailUrl,
        nowIso(),
      ],
    );
    const row = queryOne<VideoRecommendation>(
      "SELECT * FROM video_recommendations WHERE id = ?",
      [id],
    );
    return json({ recommendation: row ? videoRowToPublic(row) : null }, 201);
  });
}
