export type ChatMode =
  | "ask"
  | "beginner"
  | "notes"
  | "quiz"
  | "exam"
  | "assignment"
  | "revision"
  | "coach";

export const CHAT_MODES: { id: ChatMode; label: string; description: string }[] = [
  { id: "ask", label: "Ask anything", description: "Direct academic answers and explanations" },
  { id: "beginner", label: "Explain simply", description: "Build intuition from first principles" },
  { id: "notes", label: "Make notes", description: "Structured, revision-ready notes" },
  { id: "quiz", label: "Quiz me", description: "Practice MCQs with explanations" },
  { id: "exam", label: "Exam focus", description: "Prioritise topics and plan revision" },
  { id: "assignment", label: "Assignment help", description: "Understand the task and find a path" },
  { id: "revision", label: "Revision", description: "Active recall and quick checks" },
  { id: "coach", label: "Study coach", description: "Stay consistent and adjust the plan" },
];

export const CHAT_STARTERS = [
  "Explain the hardest topic in my syllabus like I'm a beginner.",
  "What should I study today, given my exams and pending work?",
  "Quiz me on the chapter I'm least confident about.",
  "Build a 7-day revision plan for my next exam.",
];
