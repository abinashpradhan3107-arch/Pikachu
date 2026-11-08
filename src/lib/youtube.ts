import type { VideoRecommendation } from "@/lib/types";

const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && YOUTUBE_ID.test(id) ? id : null;
    }
    if (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com" ||
      url.hostname === "m.youtube.com" ||
      url.hostname === "music.youtube.com"
    ) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && YOUTUBE_ID.test(id) ? id : null;
      }
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
      if (match?.[2]) return match[2];
    }
    return null;
  } catch {
    return null;
  }
}

export function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export type VerifiedVideo = {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  thumbnailUrl: string;
};

export async function verifyYouTubeVideo(input: string): Promise<VerifiedVideo> {
  const videoId = extractYouTubeId(input);
  if (!videoId) {
    throw new Error("Enter a valid YouTube video URL.");
  }
  const url = canonicalYouTubeUrl(videoId);
  let response: Response;
  try {
    response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json" } },
    );
  } catch {
    throw new Error("Could not reach YouTube to verify that video. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error("That video could not be verified on YouTube. It may be private or unavailable.");
  }
  let payload: {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("YouTube returned an unexpected response while verifying that video.");
  }
  if (!payload.title) {
    throw new Error("YouTube did not return video details.");
  }
  return {
    videoId,
    title: payload.title,
    channel: payload.author_name ?? "YouTube",
    url,
    thumbnailUrl: payload.thumbnail_url ?? thumbnailFor(videoId),
  };
}

export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 1440 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Math.round(Number(seconds ?? 0) / 60);
  return total > 0 ? total : null;
}

function channelScore(channel: string): number {
  const normalized = channel.toLowerCase();
  if (normalized.includes("nptel")) return 40;
  if (normalized.includes("mit opencourseware") || normalized.includes("mit ocw")) return 38;
  if (normalized.includes("iit")) return 34;
  if (normalized.includes("stanford")) return 28;
  if (normalized.includes("yale")) return 24;
  if (normalized.includes("harvard")) return 24;
  if (normalized.includes("khan academy")) return 18;
  if (normalized.includes("crash course")) return 12;
  return 5;
}

export type VideoSearchCandidate = VerifiedVideo & {
  durationMinutes: number | null;
  description: string;
  channelScore: number;
  query: string;
};

export async function searchYouTubeVideos(
  apiKey: string,
  query: string,
  maxResults = 4,
): Promise<VideoSearchCandidate[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("key", apiKey);

  const searchResponse = await fetch(searchUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!searchResponse.ok) {
    const body = await searchResponse.text();
    if (searchResponse.status === 403) {
      throw new Error(
        "YouTube API rejected the request. Check that the YouTube Data API v3 is enabled and your quota is available.",
      );
    }
    throw new Error(`YouTube search failed (HTTP ${searchResponse.status}): ${body.slice(0, 200)}`);
  }
  const searchPayload = (await searchResponse.json()) as {
    items?: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        description?: string;
      };
    }[];
  };
  const items = (searchPayload.items ?? []).filter(
    (item) => item.id?.videoId && item.snippet?.title,
  );
  if (!items.length) return [];

  const ids = items.map((item) => item.id!.videoId!).join(",");
  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.searchParams.set("part", "contentDetails");
  detailsUrl.searchParams.set("id", ids);
  detailsUrl.searchParams.set("key", apiKey);
  const detailsResponse = await fetch(detailsUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  const detailsPayload = detailsResponse.ok
    ? ((await detailsResponse.json()) as {
        items?: { id?: string; contentDetails?: { duration?: string } }[];
      })
    : { items: [] };
  const durationMap = new Map(
    (detailsPayload.items ?? []).map((item) => [
      item.id ?? "",
      parseIsoDuration(item.contentDetails?.duration),
    ]),
  );

  const verified = await Promise.all(
    items.map(async (item): Promise<VideoSearchCandidate | null> => {
      const videoId = item.id!.videoId!;
      try {
        const verifiedVideo = await verifyYouTubeVideo(canonicalYouTubeUrl(videoId));
        const channel = verifiedVideo.channel || item.snippet?.channelTitle || "YouTube";
        return {
          ...verifiedVideo,
          durationMinutes: durationMap.get(videoId) ?? null,
          description: item.snippet?.description ?? "",
          channelScore: channelScore(channel),
          query,
        };
      } catch {
        return null;
      }
    }),
  );

  return verified
    .filter((item): item is VideoSearchCandidate => Boolean(item))
    .filter((item) => !item.durationMinutes || item.durationMinutes >= 3)
    .sort((a, b) => b.channelScore - a.channelScore);
}

export type RecommendationDraft = {
  topic: string;
  courseId: string | null;
  chapterId: string | null;
  priority: string;
  reason: string;
  video: VideoSearchCandidate;
};

export function recommendationReason(
  topic: string,
  courseTitle: string | null,
  examDays: number | null,
): { reason: string; priority: "high" | "medium" | "low" } {
  if (examDays != null && examDays <= 7) {
    return {
      reason: `Directly supports ${topic}${courseTitle ? ` in ${courseTitle}` : ""}, with an exam in ${examDays} day${examDays === 1 ? "" : "s"}. Watch at 1.25× and pause for worked examples.`,
      priority: "high",
    };
  }
  if (examDays != null && examDays <= 21) {
    return {
      reason: `Builds the foundation for ${topic}${courseTitle ? ` in ${courseTitle}` : ""} while there is still time for practice.`,
      priority: "medium",
    };
  }
  return {
    reason: `Reinforces ${topic}${courseTitle ? ` from ${courseTitle}` : ""} and fits the next unscheduled chapter in your plan.`,
    priority: "low",
  };
}

export function videoRowToPublic(row: VideoRecommendation) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    videoId: row.video_id,
    channel: row.channel,
    durationMinutes: row.duration_minutes,
    topic: row.topic,
    reason: row.reason,
    priority: row.priority,
    thumbnailUrl: row.thumbnail_url ?? thumbnailFor(row.video_id),
    verified: Boolean(row.verified),
    status: row.status,
    createdAt: row.created_at,
    courseId: row.course_id,
    chapterId: row.chapter_id,
  };
}
