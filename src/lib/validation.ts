import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  college: z.string().trim().max(120).optional(),
  program: z.string().trim().max(120).optional().nullable(),
  year: z.coerce.number().int().min(1).max(6).optional().nullable(),
  timezone: z.string().trim().min(3).max(60).optional(),
  study_hours: z.coerce.number().min(0.5).max(16).optional(),
  preferred_start_hour: z.coerce.number().int().min(0).max(23).optional(),
  session_length: z.coerce.number().int().min(15).max(120).optional(),
  break_minutes: z.coerce.number().int().min(0).max(60).optional(),
  learning_style: z.string().trim().max(80).optional().nullable(),
  explanation_level: z.enum(["beginner", "undergraduate", "advanced"]).optional(),
  goals: z.string().trim().max(2000).optional().nullable(),
  weak_subjects: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
});

export const courseCreateSchema = z.object({
  code: z.string().trim().max(30).optional().nullable(),
  title: z.string().trim().min(2, "Enter a course title.").max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  instructor: z.string().trim().max(120).optional().nullable(),
  credits: z.coerce.number().min(0).max(30).optional().nullable(),
  color: z.string().trim().max(20).optional().nullable(),
});

export const courseUpdateSchema = courseCreateSchema.partial().extend({
  archived: z.coerce.boolean().optional(),
});

export const chapterCreateSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string().trim().min(1, "Enter a chapter title.").max(240),
  unit: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  confidence: z.coerce.number().int().min(1).max(5).optional(),
  estimated_minutes: z.coerce.number().int().min(10).max(1200).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

export const chapterUpdateSchema = chapterCreateSchema.partial().omit({ course_id: true });

export const examCreateSchema = z.object({
  course_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2, "Enter an exam title.").max(160),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  start_time: z.string().trim().max(20).optional().nullable(),
  exam_type: z.enum(["quiz", "midterm", "endsem", "viva", "practical", "other"]).optional(),
  weight: z.coerce.number().min(0).max(100).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  syllabus: z.string().trim().max(8000).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const examUpdateSchema = examCreateSchema.partial();

export const assignmentCreateSchema = z.object({
  course_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2, "Enter an assignment title.").max(240),
  description: z.string().trim().max(8000).optional().nullable(),
  due_at: z.string().trim().max(40).optional().nullable(),
  source_url: z.string().url().optional().nullable().or(z.literal("")),
});

export const assignmentUpdateSchema = assignmentCreateSchema.partial().extend({
  status: z.enum(["pending", "submitted", "graded", "missed"]).optional(),
});

export const taskCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(2, "Enter a task title.").max(240),
  description: z.string().trim().max(3000).optional().nullable(),
  course_id: z.string().uuid().optional().nullable(),
  chapter_id: z.string().uuid().optional().nullable(),
  task_type: z.enum(["study", "practice", "revision", "assignment", "video", "custom"]).optional(),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  priority: z.enum(["high", "medium", "low"]).optional(),
  resource_url: z.string().url().optional().nullable().or(z.literal("")),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(240).optional(),
  description: z.string().trim().max(3000).optional().nullable(),
  status: z.enum(["pending", "completed", "missed"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  duration_minutes: z.coerce.number().int().min(5).max(480).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
});

export const chatSchema = z.object({
  threadId: z.string().uuid().optional().nullable(),
  message: z.string().trim().min(1, "Type a question.").max(20_000),
  mode: z
    .enum(["ask", "beginner", "notes", "quiz", "exam", "assignment", "revision", "coach"])
    .optional(),
  courseId: z.string().uuid().optional().nullable(),
  chapterId: z.string().uuid().optional().nullable(),
});

export const toolSchema = z.object({
  tool: z.enum([
    "notes",
    "quiz",
    "explain",
    "exam-predictor",
    "assignment",
    "revision",
    "coach",
    "daily-briefing",
    "summarize",
  ]),
  topic: z.string().trim().max(300).optional(),
  courseId: z.string().uuid().optional().nullable(),
  chapterId: z.string().uuid().optional().nullable(),
  examId: z.string().uuid().optional().nullable(),
  question: z.string().trim().max(20_000).optional(),
  text: z.string().trim().max(60_000).optional(),
  planText: z.string().trim().max(12_000).optional(),
  difficulty: z.string().trim().max(60).optional(),
  count: z.coerce.number().int().min(3).max(20).optional(),
});

export const aiSettingsSchema = z.object({
  provider: z.string().trim().max(60).optional(),
  baseUrl: z.string().trim().url("Enter a valid API base URL.").max(300),
  model: z.string().trim().min(1, "Enter a model name.").max(160),
  apiKey: z.string().trim().max(500).optional(),
  youtubeApiKey: z.string().trim().max(500).optional(),
  temperature: z.coerce.number().min(0).max(1.5).optional(),
});

export const lmsConnectSchema = z.object({
  siteUrl: z.string().trim().url("Enter your LMS URL."),
  token: z.string().trim().min(10, "Paste your Moodle web service token.").max(500).optional(),
});

export const noteCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(200_000),
  course_id: z.string().uuid().optional().nullable(),
  kind: z.string().trim().max(40).optional(),
});

export const noteUpdateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  content: z.string().trim().min(1).max(200_000).optional(),
});

export const videoCreateSchema = z.object({
  url: z.string().trim().url("Enter a YouTube link."),
  topic: z.string().trim().max(200).optional(),
  courseId: z.string().uuid().optional().nullable(),
  durationMinutes: z.coerce.number().int().min(1).max(600).optional().nullable(),
});

export const importSchema = z.object({
  title: z.string().trim().min(1).max(240),
  courseId: z.string().uuid().optional().nullable(),
  text: z.string().trim().min(20, "Add some text to import.").max(400_000),
  kind: z.enum(["note", "pdf", "link", "material"]).optional(),
  sourceUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  profile: profileSchema,
  courses: z
    .array(
      z.object({
        code: z.string().trim().max(30).optional().nullable(),
        title: z.string().trim().min(2).max(160),
        color: z.string().trim().max(20).optional().nullable(),
        chapters: z.array(z.string().trim().min(1).max(240)).max(80).optional(),
      }),
    )
    .max(12)
    .optional(),
  exams: z
    .array(
      z.object({
        courseIndex: z.coerce.number().int().min(0).max(20).optional().nullable(),
        title: z.string().trim().min(2).max(160),
        exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        exam_type: z.enum(["quiz", "midterm", "endsem", "viva", "practical", "other"]).optional(),
        syllabus: z.string().trim().max(4000).optional().nullable(),
      }),
    )
    .max(20)
    .optional(),
  ai: z
    .object({
      baseUrl: z.string().trim().url().max(300),
      model: z.string().trim().min(1).max(160),
      apiKey: z.string().trim().max(500),
      provider: z.string().trim().max(60).optional(),
    })
    .optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});
