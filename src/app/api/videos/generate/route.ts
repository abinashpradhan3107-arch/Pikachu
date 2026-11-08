import { z } from "zod";
import { queryAll, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError, rateLimit } from "@/lib/api";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { getAcademicContext } from "@/lib/ai/context";
import {
  recommendationReason,
  searchYouTubeVideos,
  thumbnailFor,
  videoRowToPublic,
  type VideoSearchCandidate,
} from "@/lib/youtube";
import { daysBetween, nowIso } from "@/lib/utils";
import type { VideoRecommendation } from "@/lib/types";

const bodySchema = z.object({
  courseId: z.string().uuid().optional().nullable(),
});

type Topic = {
  topic: string;
  courseId: string | null;
  courseTitle: string | null;
  chapterId: string | null;
  examDays: number | null;
  score: number;
};

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user, profile } = await requireApiUser(request);
    rateLimit(`videos:${user.id}`, 6, 60_000);
    const body = bodySchema.parse(await readJson(request).catch(() => ({})));
    const config = getAiRuntimeConfig(user.id);
    if (!config.youtubeApiKey) {
      throw new ApiError(
        400,
        "Add a YouTube Data API v3 key in Settings to generate verified recommendations. You can still add individual video links manually.",
      );
    }

    const context = getAcademicContext(user.id, profile.timezone);
    if (!context.chapters.length) {
      throw new ApiError(
        400,
        "Add syllabus chapters first so recommendations are tied to your real coursework.",
      );
    }

    const examByCourse = new Map<string, number>();
    for (const exam of context.exams) {
      if (!exam.course_id) continue;
      const days = daysBetween(context.today, exam.exam_date);
      if (days < 0) continue;
      const current = examByCourse.get(exam.course_id);
      if (current == null || days < current) examByCourse.set(exam.course_id, days);
    }

    const candidates: Topic[] = context.chapters
      .filter((chapter) => chapter.status !== "completed")
      .filter((chapter) => !body.courseId || chapter.course_id === body.courseId)
      .map((chapter) => {
        const examDays = examByCourse.get(chapter.course_id) ?? null;
        let score = 20;
        if (chapter.confidence <= 2) score += 25;
        if (chapter.status === "in_progress") score += 15;
        if (examDays != null) score += Math.max(0, 30 - examDays);
        return {
          topic: chapter.title,
          courseId: chapter.course_id,
          courseTitle: context.courses.find((course) => course.id === chapter.course_id)?.title ?? null,
          chapterId: chapter.id,
          examDays,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!candidates.length) {
      throw new ApiError(400, "No unscheduled chapters found to recommend videos for.");
    }

    const existing = new Set(
      queryAll<{ video_id: string }>(
        "SELECT video_id FROM video_recommendations WHERE user_id = ?",
        [user.id],
      ).map((row) => row.video_id),
    );

    const found: {
      topic: Topic;
      video: VideoSearchCandidate;
    }[] = [];

    for (const topic of candidates) {
      const queries = [
        `${topic.topic} ${topic.courseTitle ?? ""} lecture NPTEL`.trim(),
        `${topic.topic} MIT OpenCourseWare`.trim(),
      ];
      for (const query of queries) {
        if (found.filter((item) => item.topic.chapterId === topic.chapterId).length >= 2) break;
        try {
          const results = await searchYouTubeVideos(config.youtubeApiKey, query, 4);
          for (const video of results) {
            if (existing.has(video.videoId)) continue;
            if (found.some((item) => item.video.videoId === video.videoId)) continue;
            found.push({ topic, video });
            if (found.filter((item) => item.topic.chapterId === topic.chapterId).length >= 2) break;
          }
        } catch (error) {
          if (found.length === 0) {
            throw new ApiError(
              502,
              error instanceof Error ? error.message : "YouTube search failed.",
            );
          }
        }
      }
    }

    if (!found.length) {
      throw new ApiError(
        404,
        "No verified videos matched your chapters. Try adding a more specific chapter title, or add a video link manually.",
      );
    }

    run(
      "DELETE FROM video_recommendations WHERE user_id = ? AND status = 'new'",
      [user.id],
    );

    const now = nowIso();
    for (const item of found.slice(0, 6)) {
      const { reason, priority } = recommendationReason(
        item.topic.topic,
        item.topic.courseTitle,
        item.topic.examDays,
      );
      run(
        `INSERT INTO video_recommendations
         (id, user_id, course_id, chapter_id, topic, title, url, video_id, channel,
          duration_minutes, reason, priority, thumbnail_url, verified, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'new', ?)`,
        [
          crypto.randomUUID(),
          user.id,
          item.topic.courseId,
          item.topic.chapterId,
          item.topic.topic,
          item.video.title,
          item.video.url,
          item.video.videoId,
          item.video.channel,
          item.video.durationMinutes,
          reason,
          priority,
          item.video.thumbnailUrl || thumbnailFor(item.video.videoId),
          now,
        ],
      );
    }

    const rows = queryAll<VideoRecommendation>(
      "SELECT * FROM video_recommendations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
      [user.id],
    );
    return json({ recommendations: rows.map(videoRowToPublic) });
  });
}
