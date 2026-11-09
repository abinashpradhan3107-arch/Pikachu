export type User = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

export type PublicUser = Omit<User, "password_hash">;

export type Profile = {
  user_id: string;
  college: string;
  program: string | null;
  year: number | null;
  timezone: string;
  study_hours: number;
  preferred_start_hour: number;
  session_length: number;
  break_minutes: number;
  learning_style: string | null;
  explanation_level: string;
  goals: string | null;
  weak_subjects: string | null;
  onboarding_completed: number;
  created_at: string;
  updated_at: string;
};

export type AiSettings = {
  user_id: string;
  provider: string;
  base_url: string;
  model: string;
  api_key_enc: string | null;
  temperature: number;
  youtube_api_key_enc: string | null;
  updated_at: string;
};

export type Course = {
  id: string;
  user_id: string;
  code: string | null;
  title: string;
  description: string | null;
  color: string | null;
  instructor: string | null;
  credits: number | null;
  lms_url: string | null;
  lms_course_id: string | null;
  lms_source: string | null;
  lms_progress: number | null;
  archived: number;
  created_at: string;
  updated_at: string;
};

export type Chapter = {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  unit: string | null;
  status: "not_started" | "in_progress" | "completed" | string;
  difficulty: "easy" | "medium" | "hard" | string;
  confidence: number;
  estimated_minutes: number;
  notes: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type Exam = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  exam_date: string;
  start_time: string | null;
  exam_type: string;
  weight: number | null;
  location: string | null;
  syllabus: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Assignment = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "pending" | "submitted" | "graded" | string;
  source: string;
  source_url: string | null;
  lms_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StudyTask = {
  id: string;
  user_id: string;
  course_id: string | null;
  chapter_id: string | null;
  exam_id: string | null;
  assignment_id: string | null;
  date: string;
  title: string;
  description: string | null;
  task_type: string;
  duration_minutes: number;
  priority: string;
  status: "pending" | "completed" | "missed" | string;
  resource_url: string | null;
  resource_title: string | null;
  ai_generated: number;
  rescheduled_from: string | null;
  completed_at: string | null;
  sort_order: number;
  start_time: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyPlan = {
  id: string;
  user_id: string;
  date: string;
  summary: string | null;
  ai_briefing: string | null;
  total_minutes: number;
  generated_at: string;
};

export type Resource = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  kind: string;
  url: string | null;
  content: string | null;
  source: string;
  verified: number;
  duration_minutes: number | null;
  channel: string | null;
  description: string | null;
  lms_module_id: string | null;
  watched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Announcement = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  content: string | null;
  url: string | null;
  published_at: string | null;
  source: string;
  lms_id: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  type: string;
  start_at: string;
  end_at: string | null;
  url: string | null;
  source: string;
  lms_id: string | null;
  created_at: string;
};

export type LmsConnection = {
  id: string;
  user_id: string;
  provider: string;
  site_url: string;
  token_enc: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  site_name: string | null;
  lms_username: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatThread = {
  id: string;
  user_id: string;
  title: string;
  mode: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  created_at: string;
};

export type Note = {
  id: string;
  user_id: string;
  course_id: string | null;
  chapter_id: string | null;
  title: string;
  content: string;
  kind: string;
  created_at: string;
  updated_at: string;
};

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  difficulty?: string;
};

export type Quiz = {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  questions_json: string;
  created_at: string;
};

export type VideoRecommendation = {
  id: string;
  user_id: string;
  course_id: string | null;
  chapter_id: string | null;
  topic: string | null;
  title: string;
  url: string;
  video_id: string;
  channel: string | null;
  duration_minutes: number | null;
  reason: string | null;
  priority: string;
  thumbnail_url: string | null;
  verified: number;
  status: string;
  created_at: string;
};

export type CourseWithProgress = Course & {
  total_chapters: number;
  completed_chapters: number;
  progress: number;
  next_exam_date: string | null;
  next_exam_title: string | null;
};
