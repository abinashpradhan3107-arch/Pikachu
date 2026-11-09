import type { Chapter } from "@/lib/types";

// ============================================================
// Chapter priority classification.
//
// Deliberately a PURE module: no database, no AI, no side effects. The
// planning engine (server) and the Courses page (browser) both use these
// exact rules so the High / Medium / Low matrix the student sees is the
// same classification the planner schedules by. Importing from engine.ts
// instead would drag node:sqlite into the client bundle.
// ============================================================

export function priorityFor(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export type ChapterPriority = {
  band: "high" | "medium" | "low";
  score: number;
  reasons: string[];
};

/**
 * Priority band for one chapter, using the SAME rules generateDailyPlan
 * scores with, so the Courses page shows the exact classification the
 * planner acts on instead of a second, drifting copy of the logic.
 */
export function chapterPriorityBand(input: {
  chapter: Pick<Chapter, "status" | "confidence" | "difficulty">;
  daysToExam?: number | null;
  isWeakSubject?: boolean;
}): ChapterPriority {
  const { chapter, daysToExam = null, isWeakSubject = false } = input;
  const reasons: string[] = [];
  let score = 20;

  if (chapter.status === "in_progress") {
    score += 18;
    reasons.push("already in progress");
  }
  if (chapter.confidence <= 2) {
    score += 28;
    reasons.push("low confidence");
  } else if (chapter.confidence === 3) {
    score += 12;
    reasons.push("needs reinforcement");
  }
  if (chapter.difficulty === "hard") {
    score += 10;
    reasons.push("high difficulty");
  }
  if (daysToExam !== null && daysToExam >= 0) {
    if (daysToExam <= 7) {
      score += 65;
      reasons.push(`exam in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`);
    } else if (daysToExam <= 14) {
      score += 42;
      reasons.push(`exam in ${daysToExam} days`);
    } else if (daysToExam <= 30) {
      score += 20;
      reasons.push(`exam in ${daysToExam} days`);
    }
  }
  if (isWeakSubject) {
    score += 16;
    reasons.push("self-identified weak subject");
  }

  return {
    band: priorityFor(score),
    score,
    reasons: reasons.length ? reasons : ["part of your recorded syllabus"],
  };
}
