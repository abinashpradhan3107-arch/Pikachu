import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

type DbGlobal = typeof globalThis & {
  __studyAssistantDb?: DatabaseSync;
};

const globalForDb = globalThis as DbGlobal;

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
    mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
  }
  const dir = path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "study-assistant.db");
}

function createDb(): DatabaseSync {
  const db = new DatabaseSync(resolveDbPath());
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      user_agent TEXT,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      college TEXT DEFAULT 'IIT Jodhpur',
      program TEXT,
      year INTEGER,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      study_hours REAL NOT NULL DEFAULT 3,
      preferred_start_hour INTEGER NOT NULL DEFAULT 18,
      session_length INTEGER NOT NULL DEFAULT 45,
      break_minutes INTEGER NOT NULL DEFAULT 10,
      learning_style TEXT,
      explanation_level TEXT NOT NULL DEFAULT 'undergraduate',
      goals TEXT,
      weak_subjects TEXT,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'openai',
      base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      api_key_enc TEXT,
      temperature REAL NOT NULL DEFAULT 0.4,
      youtube_api_key_enc TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT,
      title TEXT NOT NULL,
      description TEXT,
      color TEXT,
      instructor TEXT,
      credits REAL,
      lms_url TEXT,
      lms_course_id TEXT,
      lms_source TEXT,
      lms_progress REAL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_lms
      ON courses(user_id, lms_source, lms_course_id)
      WHERE lms_course_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      unit TEXT,
      status TEXT NOT NULL DEFAULT 'not_started',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      confidence INTEGER NOT NULL DEFAULT 3,
      estimated_minutes INTEGER NOT NULL DEFAULT 60,
      notes TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_user ON chapters(user_id);

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      start_time TEXT,
      exam_type TEXT NOT NULL DEFAULT 'midterm',
      weight REAL,
      location TEXT,
      syllabus TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_exams_user_date ON exams(user_id, exam_date);

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      lms_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id, due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_lms
      ON assignments(user_id, lms_id)
      WHERE lms_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS study_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
      exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL,
      assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL DEFAULT 'study',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      resource_url TEXT,
      resource_title TEXT,
      ai_generated INTEGER NOT NULL DEFAULT 0,
      rescheduled_from TEXT,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON study_tasks(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON study_tasks(user_id, status);

    CREATE TABLE IF NOT EXISTS daily_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      summary TEXT,
      ai_briefing TEXT,
      total_minutes INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      url TEXT,
      content TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      verified INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER,
      channel TEXT,
      description TEXT,
      lms_module_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id, course_id);

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT,
      url TEXT,
      published_at TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      lms_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_announcements_lms
      ON announcements(user_id, lms_id)
      WHERE lms_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'event',
      start_at TEXT NOT NULL,
      end_at TEXT,
      url TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      lms_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_lms
      ON events(user_id, lms_id)
      WHERE lms_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS lms_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'moodle',
      site_url TEXT NOT NULL,
      token_enc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      last_sync_at TEXT,
      last_error TEXT,
      site_name TEXT,
      lms_username TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'ask',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_threads_user ON chat_threads(user_id, updated_at);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, created_at);

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
      topic TEXT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      video_id TEXT NOT NULL,
      channel TEXT,
      duration_minutes INTEGER,
      reason TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      thumbnail_url TEXT,
      verified INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_videos_user ON video_recommendations(user_id, created_at);
  `);
}

export const db = globalForDb.__studyAssistantDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__studyAssistantDb = db;
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const statement = db.prepare(sql);
  return statement.all(...(params as never[])) as unknown as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | null {
  const statement = db.prepare(sql);
  const row = statement.get(...(params as never[]));
  return (row as unknown as T) ?? null;
}

export function run(sql: string, params: unknown[] = []) {
  const statement = db.prepare(sql);
  return statement.run(...(params as never[]));
}

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
