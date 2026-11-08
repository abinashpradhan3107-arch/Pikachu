# Cortex — AI Study Assistant for IIT Jodhpur

Cortex is a self-hosted, dark-mode study workspace that combines an AI academic mentor,
a deterministic study planner, exam/assignment tracking, verified video recommendations,
Moodle sync, notes, quizzes, and progress analytics in one place.

It is built for a single student per account and stores everything in a local SQLite
database. No LMS passwords are collected and no institutional login is bypassed.

---

## Features

**Workspace**
- Dashboard with today's plan, streak, exam countdown, pending work, and AI status
- Study plan with an interactive calendar, priority engine, task completion, and rescheduling
- AI chat with streaming responses, saved threads, course/chapter context, and study modes
  (ask, beginner, notes, quiz, exam, assignment, revision, coach)
- Nine AI tools: revision notes, practice quiz, concept explainer, exam priority map,
  assignment guide, active recall, study coach, daily briefing, and material summarizer
- Focus timer with break reminders

**Academics**
- Courses and chapters with progress, confidence, difficulty, and status tracking
- Exams with countdowns, weights, syllabus, and AI preparation priorities
- Assignments with due dates, statuses, and source links
- Verified lecture recommendations (NPTEL, MIT OCW, IIT channels preferred)

**Library and analytics**
- Notes and auto-generated quizzes with an interactive quiz runner
- Moodle Web Services sync plus text/PDF import and a browser bookmarklet fallback
- Progress page with an 84-day heatmap, weekly chart, study streaks, weak topics,
  deterministic weekly report, and AI coach
- Settings for profile, weak subjects, AI provider, API keys, memory explanation,
  password change, data export, and account deletion

**Security**
- Email/password auth with scrypt password hashing and HTTP-only session cookies
- Per-user AES-256-GCM encryption for AI keys and Moodle tokens
- Server-side ownership checks on every record
- Basic in-memory rate limiting for auth and AI endpoints
- Account deletion and full JSON data export

---

## Tech stack

- Next.js 16 (App Router, Turbopack) and React 19
- TypeScript and Tailwind CSS v4
- `node:sqlite` (`DatabaseSync`) — no external database server required
- OpenAI-compatible Chat Completions API with SSE streaming
- Optional YouTube Data API v3 and Moodle Web Services REST API

---

## Requirements

- Node.js 22.5 or newer (Node 24+ recommended; `node:sqlite` is used directly)
- npm
- Optional: an OpenAI-compatible LLM API key
- Optional: a YouTube Data API v3 key
- Optional: a Moodle site that allows Web Services tokens

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
copy .env.example .env.local        # Windows
# cp .env.example .env.local        # macOS / Linux

# 3. Generate an encryption secret and paste it into APP_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. Start the development server
npm run dev
```

Open <http://localhost:3000>, register an account, and complete the onboarding wizard.
Onboarding creates your profile, first courses/chapters, and exams. You can add an AI key
during onboarding or later in **Settings → AI provider**.

Production build:

```bash
npm run build
npm start
```

---

## AI setup

Cortex talks to any OpenAI-compatible Chat Completions endpoint.

### Option A — save a key in the app (recommended)

1. Open **Settings → AI provider**.
2. Pick a preset (OpenAI, OpenRouter, Groq, or Ollama) or enter a custom base URL.
3. Enter the model name and API key, then click **Save AI settings**.
4. Click **Test connection** to verify the key and model.

The key is encrypted with AES-256-GCM before it is written to SQLite and is never sent
back to the browser. The UI only shows a masked value.

Common presets:

| Provider | Base URL | Example model |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

### Option B — environment fallback

Set these in `.env.local` to provide a default for every account:

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
LLM_PROVIDER=openai
```

`LLM_API_KEY` is accepted as an alias for `OPENAI_API_KEY`. A key saved in the UI takes
precedence over the environment key.

> AI features fail gracefully with a clear “Connect an AI provider” message when no key
> is configured. Planning, tracking, notes, and analytics keep working without AI.

---

## YouTube video recommendations

Cortex never invents video IDs and never displays an unverified link.

- **Manual add** — paste any YouTube URL. The server verifies it with YouTube's public
  oEmbed endpoint before saving, then shows the real title, channel, and thumbnail.
- **AI generation** — requires a YouTube Data API v3 key. Set it in **Settings → AI
  provider → YouTube Data API key**, or via `YOUTUBE_API_KEY` in `.env.local`.

To create a key:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create/select a project and enable **YouTube Data API v3**.
3. Create an API key under **APIs & Services → Credentials**.
4. Paste it into Settings or `.env.local`.

Recommendations prefer NPTEL, MIT OpenCourseWare, and IIT channels, and every candidate
is re-verified before display.

---

## LMS / Moodle setup

Cortex uses the official Moodle **Web Services REST** API with a user-issued token.
It never asks for your Moodle password and never automates the institutional login page.

### Connect a Moodle site

1. Log in to your Moodle site.
2. Open **Profile → Preferences → Security keys** (or `/user/managetoken.php`).
3. Create a token for the **Moodle mobile web service** (or another service that exposes
   the read functions below).
4. In Cortex, open **LMS**, enter the site URL (for example
   `https://lms.iitj.ac.in`) and paste the token.
5. Click **Connect and sync**.

The integration reads course lists, course contents, assignments, announcements/forums,
calendar events, and site info. It does **not** submit assignments or change your LMS data.

If your site administrator has disabled Web Services or token creation, use one of the
built-in fallbacks:

- **Import text** — paste lecture notes, syllabus text, or announcement text.
- **Import PDF** — upload a PDF; text is extracted with `unpdf`.
- **Bookmarklet** — copy the one-line bookmarklet from the LMS page and run it on a course
  page to capture the visible text into Cortex.

Tokens are encrypted at rest and are never returned by the API.

---

## Data, privacy, and security

| Item | Location / behavior |
| --- | --- |
| SQLite database | `.data/study-assistant.db` (override with `DATABASE_PATH`) |
| Encryption secret | `APP_SECRET`, or auto-generated at `.data/app-secret` |
| Sessions | HTTP-only cookie, 30 days, `Secure` in production |
| Passwords | scrypt with per-user salt |
| AI / Moodle secrets | AES-256-GCM encrypted per user |
| Data export | `GET /api/export` returns JSON |
| Account deletion | Settings → Danger zone (requires password) |

Keep `.data/` and `.env.local` out of version control and back up the database file.
Losing `APP_SECRET` (or `.data/app-secret`) makes saved AI/LMS secrets unrecoverable.

---

## Configuration reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_SECRET` | Recommended | Encrypts API keys and LMS tokens. Auto-generated if absent. |
| `DATABASE_PATH` | No | SQLite file path. Defaults to `.data/study-assistant.db`. |
| `OPENAI_API_KEY` / `LLM_API_KEY` | No | Default LLM key for all users. |
| `OPENAI_BASE_URL` | No | Default OpenAI-compatible base URL. |
| `OPENAI_MODEL` | No | Default model name. |
| `LLM_PROVIDER` | No | Label shown in the UI (for example `openai`, `groq`). |
| `YOUTUBE_API_KEY` | No | Enables AI video recommendation search. |

---

## Using Cortex

1. **Onboarding** — set your timezone, study hours, session length, goals, and weak subjects.
2. **Courses** — add your semester courses and chapters, then mark status/confidence.
3. **Exams and assignments** — add real dates; the planner prioritizes work by urgency.
4. **Study Plan** — generate a day plan, complete tasks, and reschedule missed work.
5. **AI Chat** — ask questions with course context, or switch to quiz/revision/coach modes.
6. **AI Tools** — generate notes, quizzes, briefings, and revision material.
7. **LMS** — connect Moodle or import material manually.
8. **Videos** — add verified links or generate recommendations when a YouTube key is set.
9. **Progress** — review streaks, weekly reports, weak topics, and reschedule overdue tasks.
10. **Settings** — manage profile, AI keys, memory, password, export, and deletion.

Keyboard shortcut: `Ctrl/Cmd + K` opens the command palette.

---

## Project structure

```
src/
  app/
    (app)/              Authenticated pages (dashboard, plan, chat, courses, …)
    api/                JSON and SSE route handlers
    login, register     Auth pages
    onboarding/         First-run wizard
  components/           Client views and UI primitives
  lib/
    ai/                 LLM client, prompts, context, config
    lms/                Moodle client and sync
    plan/               Deterministic planning engine
    auth.ts             Sessions and server guards
    db.ts               SQLite schema and helpers
    crypto.ts           scrypt + AES-256-GCM
    security.ts         URL/SSRF and input safety
    stats.ts            Dashboard/progress analytics
    validation.ts       Zod request schemas
.data/                  Local database and generated secret (gitignored)
```

---

## Troubleshooting

**“Connect an AI provider”**
No usable key was found. Save one in Settings or set `OPENAI_API_KEY` in `.env.local`,
then restart the dev server.

**AI test fails**
Check the base URL includes `/v1` where required, the model name is available on your
account, and the key has chat-completion access. Local Ollama must be running and
reachable from the Next.js server.

**Video generation is disabled**
Add a YouTube Data API v3 key. Manual links still work without one and are verified
through oEmbed.

**Moodle connection fails**
Confirm the site URL, that Web Services are enabled, that the token belongs to the
mobile service, and that the service exposes the read functions Cortex needs. If token
creation is disabled, use text/PDF import or the bookmarklet.

**Styles are missing after a fresh install**
Tailwind v4 is wired through the `@tailwindcss/turbopack` loader in `next.config.ts`.
Keep that loader rule and the `@import "tailwindcss";` line in `src/app/globals.css`.
