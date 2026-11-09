# PROJECT STATUS — Cortex AI Academic Assistant

## Overall Status

- **Build:** passes — `npx tsc --noEmit`, `npm run build` (52 routes, zero TypeScript errors), `npm run lint` (0 errors; 34 warnings, all unused-variable, mostly pre-existing extension JS).
- **Extension loads in Chrome:** fixed and confirmed loaded by the user (`content script v5 loaded` observed in the console); content script is now **v6** (completion probe + video observer) and needs a ↻ reload to emit the new marker.
- **Login detection:** confirmed working against the live page (`login confirmed - authenticated UI detected`).
- **Extraction:** confirmed against the live page — `lectures=15` on the Lectures tab, `assignments=13` on the Assignments tab, `course "382"`.
- **Backend writes:** observed end-to-end in the user's browser on 2026-11-08 — `sync successful, server counts: {"courses":1,"chapters":2,"lectures":13,"assignments":11}`, rows then read back from SQLite. Offline schema suite re-run after the capability work: 41/41 pass.
- **Sync against the real LMS:** observed end-to-end for lectures and assignments (see "Observed in the user's browser"). Lecture `url` / `duration_minutes` / attached notes are new in this round and **BUILT BUT UNTESTED** live.
- **Moodle (`moodle.iitj.ac.in`):** probe-only content script added. **BUILT BUT UNTESTED** — no Moodle selector has been observed, so it logs match counts and syncs nothing.
- **Automated watched (capability 6):** observed live in the user's browser on
  2026-11-09 — `[Cortex LMS] video completion: progress=88% known=13 match=url`,
  the video page then extracted `lectures=1` (the completed lecture merged in
  even though no lecture cards were on screen), and the Catch-up backlog
  dropped the watched lecture on tab focus with **no click**. **NEEDS MY
  INPUT:** the `completion probe:` counts for card-based indicators (green
  ticks on the lecture list) were not captured yet.

---

## Product capabilities (built 2026-11-09)

| # | Capability | What was built | Status |
|---|-----------|----------------|--------|
| 1 | Display all synced lectures, notes and materials | `courses-view.tsx` renders a per-chapter **"LMS Lectures & Resources"** block inside each expanded course (title, duration, chapter heading, Open-in-LMS button, watched toggle, notes/slides beside their lecture). `lms-view.tsx` "Synced from LMS" enriched with duration, chapter, link, watched toggle and a separate notes list. | BUILT BUT UNTESTED |
| 2 | Autonomous daily study plan with time slots | `engine.ts` assigns `start_time` ("HH:MM") from `profile.preferred_start_hour` + `break_minutes`; every task description carries a **Before watching** tip and an **After watching** takeaway; assignment tasks state days-to-deadline (or say the LMS gave no readable date instead of guessing one); `timeWindowLabel()` renders `6:00 PM – 7:30 PM` on `/plan` and `/dashboard`. | BUILT BUT UNTESTED |
| 3 | Backlog / catch-up + mark-as-watched + auto-reschedule | New `resources.watched_at` column (idempotent `ensureColumn`) and `PATCH /api/resources/:id {watched}` — a two-way toggle that never deletes a row. Catch-up panels on `/dashboard` and `/courses`. `/api/dashboard` calls `rescheduleMissedTasks()` on every read and reports `rescheduled`, so missed tasks roll into the next block automatically. | BUILT BUT UNTESTED |
| 4 | Exam countdown, priority matrix, weak-subject detection | `chapterPriorityBand()` moved to pure `src/lib/plan/priority.ts` so the browser and the planner run the **same** rules (importing `engine.ts` client-side would pull in `node:sqlite`). High/Medium/Low matrix on `/courses` (nearest exam per course drives the boost; `profile.weak_subjects` matched against chapter/course titles). New `quiz_attempts` table + `/api/quiz-attempts`; `QuizRunner` reports every submitted score; accuracy rows on `/dashboard` and `/progress`; a **20-minute targeted revision** block is injected when weak chapters exist. | BUILT BUT UNTESTED |
| 5 | Continuous extension observation of LMS tabs | MutationObserver + retry ladder on Masai (existing), now also capturing lecture `url`, duration and document links next to each card. Moodle hosts added to `host_permissions`, `content_scripts` and `web_accessible_resources`; `probeMoodle()` runs on Moodle and logs selector match counts only. | BUILT BUT UNTESTED |
| 6 | Automated "Mark as Watched" (zero manual clicks) | `content.js` probes every lecture card for completion indicators (`.completed`/`.done`, `[data-completed="true"]`, `[data-status="completed"]`, check/tick SVGs, aria/title labels, `Completed`/`100%` badge text) and sends `completed: boolean` on **every** lecture; probes are scoped per card and log **match counts only** (`completion probe: items=… matched=…`) so they can be checked against the live DOM rather than trusted. An HTML5 `<video>` `timeupdate` listener fires a completion signal past **85%** progress and resolves the lecture by exact URL/heading/title match (never a guess). `extension-sync` sets `resources.watched_at` when `completed === true`, **preserves** any existing `watched_at` (never un-watches), and auto-completes related pending `study_tasks` (exact `resource_url` match, exact title match for tasks planned before links existed, and chapter tasks only when **every** lecture in that chapter is watched; practice/assignment tasks untouched). `/dashboard`, `/courses` and `/lms` refetch on tab focus so the status appears immediately and watched lectures drop out of the Catch-up backlog automatically; the manual button stays only as a fallback. | BUILT BUT UNTESTED |

Explicitly **NOT DONE**:

- **Announcements / exam dates pulled from LMS** — NOT DONE. No announcement list has ever been observed on the live page, so no selector was guessed. Exam countdown reads the existing `exams` table.
- **Moodle content extraction** — NOT DONE. Blocked on observing real Moodle markup (`probeMoodle()` output).
- **Assignment due dates** — NOT DONE for the Masai LMS: its rendered dates (`1 Nov, 11:45 AM - 12:20 PM (IST)`) are not machine-parseable, so `due_at` stays `NULL` and the "Due this week"/"Overdue" tiles read 0.

**NEEDS MY INPUT:** reload the extension and re-run a sync so the new `url` / `duration / notes` capture can be confirmed against the live page; report the `[Cortex LMS] completion probe:` counts from a lecture list (so a probe that matches structurally — e.g. `class .done=13` on every card — can be narrowed before it marks everything watched); supply the Moodle probe output if Moodle sync is wanted.


---

## Status by Bug

| Bug | Status | Notes |
|-----|--------|-------|
| 1. Content script execution | BUILT BUT UNTESTED | Retry ladder + working `MutationObserver`. Confirmed running on the live page. |
| 2. Background API URL / pairing | BUILT BUT UNTESTED | Popup pairing works (user paired with `http://localhost:3000`). **Observed failing live:** worker logged `attempting sync to same-origin` → `Failed to fetch`, because MV3 service workers reset `pairedCortexUrl` to `''` on restart and only `onInstalled` restored it (install-time only). Fix: `getApiBaseUrl()` is now async and reads `chrome.storage.local` on every call, plus module-load hydration. |
| 3. SQLite writes | BUILT BUT UNTESTED | **Was completely broken** — see "Backend defects found". Fixed and verified offline against the real schema. |
| 4. API authentication | BUILT BUT UNTESTED | `requireApiUser()` + Zod validation; unauthenticated calls get 401. |
| 5. LMS extraction | **Confirmed on live page** (counts only) | Real `data-testid` selectors; 15 lectures / 13 assignments observed. Field-level accuracy still unverified. |
| 6. Sync engine + dashboard display | BUILT BUT UNTESTED | Endpoint returns real `counts` read back from SQLite. Dashboard now renders a Catch-up backlog panel, weak-topic/quiz-accuracy rows and time slots. |
| 7. Extension permissions | BUILT BUT UNTESTED | `activeTab`, `storage`, `webNavigation`; hosts = LMS + `localhost:3000`/`3001`. |

---

## Backend defects found (all fixed)

These were verified empirically with an offline test that runs the **exact**
SQL and parameter arrays from `route.ts` against the **exact** table
definitions from `db.ts`.

| # | Defect | Effect |
|---|--------|--------|
| 1 | `NOW()` used in all 6 statements | **SQLite has no `NOW()`** — every write threw `no such function: NOW`. Sync could never save anything. |
| 2 | Course INSERT: 9 params for 10 placeholders | `Too few parameter values` |
| 3 | Chapters INSERT: 6 params for 7 placeholders | same |
| 4 | Resources INSERT: 7 params for 6 placeholders | `Too many parameter values` |
| 5 | Assignments INSERT: 11 value slots for 12 columns | malformed SQL |
| 6 | `resources.source` set to `NULL` | `source` is `NOT NULL` — constraint failure |
| 7 | `new Date('1 Nov, 11:45 AM - 12:20 PM (IST)').toISOString()` | **throws** — LMS date format is unparseable |
| 8 | `chapters.unit` received the week number | wrong column; `order_index` was never populated |
| 9 | `courses.lms_source` set to `0` | column is `TEXT`; `lms_course_id` was never set |
| 10 | `assertSameOrigin` rejected `Origin: chrome-extension://<id>` vs `Host: localhost:3000` | **HTTP 403 `Cross-origin request blocked.`** — observed live in the service worker console. Fixed by allowing well-formed `chrome-extension://` origins **only** on `/api/lms/extension-sync` (opt-in flag); every other endpoint keeps the strict same-host rule. |
| 11 | Extension posted `{ courseData, timestamp }`, route expected a flat payload | would have returned HTTP 400 on the next hop. Route now accepts both shapes. |

**Fix:** all timestamps now bound as `?` with `nowIso()`, matching
`src/app/api/courses/route.ts`. Column/placeholder counts aligned.
Unparseable due dates stored as `NULL` rather than inventing a year.
Assignment status mapped onto the app's `pending | completed | missed`.

The origin gate (defect 10) was exercised against the **running dev server**
with no session cookie, so nothing was written: extension origin → `401`,
localhost origin → `401`, foreign origin → `403`, malformed extension origin
→ `403`. The payload shapes (defect 11) were exercised offline against the
real Zod schema: wrapped accepted, flat accepted, missing `courseId` rejected.

Whether the **session cookie** is actually attached by the service worker
(`sameSite: "lax"` + `Origin: chrome-extension://`) is still **not observed** —
a live `401` while signed in would mean it is not.

---

## Observed in the user's browser (2026-11-08)

The lectures path was observed working end to end in Chrome, from the LMS page
through to the SQLite file:

```
[Cortex LMS] sync stage: extract
[Cortex LMS] sync counts: courses=1, chapters=2, lectures=15, assignments=0
[Cortex LMS] attempting sync to http://localhost:3000
[Cortex LMS] sync stage: sqlite_save
[Cortex LMS] sync stage: done
[Cortex LMS] sync successful, server counts: {"courses":1,"chapters":2,"lectures":13,"assignments":0}
```

The rows were then read back from `C:\code\Pikachu\.data\study-assistant.db`:
course `382` "Algorithmic Thinking in Business" (`lms_source=iitj-learn`),
chapters `382-week-12` / `382-week-13`, and 13 lecture resources with real
titles, 0 duplicate ids, 0 blank titles.

The 15 sent vs 13 stored difference: lecture ids are `lms-<course>-<slug of
title>`, so two cards sharing a title collapse to one id and are skipped by the
duplicate guard. Deliberately not changed — new ids would leave the existing 13
rows in place and add near-duplicates beside them.

UI hop observed in the same session: `/courses` listed "Algorithmic Thinking
in Business" with the `iitj-learn` badge and both Week chapters ("0 of 2
chapters complete"); `/assignments` listed `All · 11` with every quiz titled,
linked to the right course, status `completed`, `No due date`. Consequence of
`due_at = null`: the "Due this week" and "Overdue" tiles both read 0.

The 13 synced lectures are stored as `resources`. They were previously shown
on **no** page: `/lms` filters its "Imported material" list to
`source === "manual"` (that list has a delete control, so LMS rows must not go
there). A new read-only **"Synced from LMS"** section was added to
`src/components/lms-view.tsx` listing `source === "lms"` rows — title, course,
kind, synced date, no edit/delete. **Observed working in the user's browser**:
the section rendered all 13 lecture cards.

Still not observed: cookie behaviour under a 401, dashboard rendering of
`counts`, field-level accuracy of dates/statuses, Moodle.

Assignments path observed in the same session: `server counts: {..., "assignments":11}`,
read back from the DB as 11 rows with real titles (`lms-382-asg-quiz-1-...`),
all mapped to status `completed`, all with `due_at = null` (the LMS renders
`1 Nov, 11:45 AM - 12:20 PM (IST)`, which is not parseable, so NULL is stored
rather than a guessed year). Whether *every* assignment is genuinely completed,
and whether 11 vs the 13 cards seen earlier is duplicate-title collapse or a
different page state, is unverified.

---

## Dashboard Sync Metrics

The endpoint `src/app/api/lms/extension-sync/route.ts` now returns:

```json
{ "success": true, "syncedAt": "...", "coursesSynced": 1, "userId": "...",
  "counts": { "courses": 1, "chapters": 2, "lectures": 15, "assignments": 13 } }
```

`counts` is read back from SQLite with `COUNT(*)` per table — real values, not
the payload size.

| Metric | Where the value comes from | Status |
|--------|---------------------------|--------|
| Last sync time | `syncedAt` — `nowIso()` | BUILT BUT UNTESTED |
| Courses / chapters / lectures / assignments | `counts` — `COUNT(*)` in `route.ts` | BUILT BUT UNTESTED (offline-verified; observed live as `13` lectures / `11` assignments) |
| Attached notes | `counts.notes` — `COUNT(*)` of `kind = 'note'` | BUILT BUT UNTESTED |
| User id | `userId` — from the session cookie | BUILT BUT UNTESTED |
| Dashboard UI panel | `backlog`, `backlogCount`, `quizAccuracy`, `rescheduled` rendered by `dashboard-view.tsx` | BUILT BUT UNTESTED |
| Sync error / stage | returned only to the extension console, not the API | NOT IMPLEMENTED |

Because the extension does not report stage/errors to the API, the
**service worker console** remains the only place sync *progress* is visible;
the dashboard now shows the *result* (backlog, rescheduled count, accuracy).

---

## Schema changes in this round (all additive, idempotent)

| Change | How it is applied | Data safety |
|--------|-------------------|-------------|
| `resources.watched_at TEXT` | new `ensureColumn()` — `PRAGMA table_info` then `ALTER TABLE` if absent | Existing rows untouched (`NULL` = not watched). Nothing deleted. |
| `study_tasks.start_time TEXT` | same `ensureColumn()` path | Old tasks keep `NULL`; UI hides the slot rather than inventing one. |
| `quiz_attempts` table | `CREATE TABLE IF NOT EXISTS` + index | New table only. |
| `study_tasks` INSERT gains `start_time` | one extra `?` bound to `task.start_time ?? null` | Backward compatible — omitted/null is valid. |

`.data/study-assistant.db` was never wiped, vacuumed, or migrated destructively;
20 tables load cleanly from the schema source in the offline suite.

---

## Known Risks

1. **Cookie delivery to the backend.** `background.js` sends `credentials: 'include'`
   and the manifest allows `http://localhost:3000/*`. Whether Chrome attaches the
   `cortex_session cookie to a service-worker fetch has not been observed.
   An `HTTP 401` while signed in would mean this.
2. **Deployment URL.** Only localhost hosts are allowed. A deployed Cortex URL
   must be added to `host_permissions`.
3. **Field-level accuracy.** Counts are confirmed; whether every title/date/status
   is parsed correctly has not been checked against the database.
4. **Announcements** — NOT IMPLEMENTED. No announcement list was ever observed on
   the live page, so no selector was guessed.
5. **Instructor, semester, weightage and "days remaining" are not stored** — the
   API schema has no field for them.

---

## Constraints Honoured

- No tables dropped, no data deleted. Duplicate handling is skip-only.
- No LMS passwords or session cookies stored by the extension.
- The backend identifies the user from the session; it never trusts a `user_id`
  from the extension.
- Moodle: only manifest host permissions and a **count-only probe** were added.
  No Moodle selector is guessed and nothing syncs from Moodle yet.
- No status label here claims a test verified a feature; live observations are
  described as observations, everything else is BUILT BUT UNTESTED / NOT DONE /
  NEEDS MY INPUT.

---

## Next Steps

1. Reload the extension at `chrome://extensions` — `manifest.json`,
   `content.js` and `background.js` all changed in this round (Moodle hosts,
   url/duration/notes capture, and the v6 completion probe / video observer).
2. Open the Masai **Lectures** tab and let it sync; confirm `counts` now
   includes `notes`, and check `/courses` → expanded course → **"LMS Lectures
   & Resources"** shows durations and working Open-in-LMS links (the 13
   existing rows have `url = NULL` and should be repaired by the additive
   update on the next sync).
3. **Automated watched (new):** ~~video path~~ **observed live** — `video
   completion: progress=88% match=url` and the backlog dropped on focus.
   Still open: on the Lectures tab, read the
   `[Cortex LMS] completion probe: items=13 matched=…` line from the console
   and report it — this shows which completion indicators actually exist in
   the live DOM (card-based detection, independent of the video path).
4. Switch back to the Cortex tab (focus it) — the Catch-up backlog must drop
   the watched lecture without a manual refresh. The **Mark as watched**
   button remains only as an optional fallback.
5. Toggle **Mark watched** manually on one lecture and confirm it sticks after
   a refresh, then check the Catch-up backlog count drops on `/dashboard`.
6. Generate a plan and confirm tasks show time slots (`6:00 PM – 7:30 PM`).
7. Take a quiz so `quiz_attempts` has a row, then confirm `/progress` shows
   the accuracy badge.
8. If Moodle sync is wanted: open a Moodle course page and report the
   `[Cortex LMS] moodle probe` lines from the console so real selectors can
   be adopted.

---

*Status updated after recording the first live observation of capability 6
(video completion at 88%, focus refetch dropping the backlog). Offline
suites: route 66/66, origin 4/4, payload 6/6, plan 8/8; `npm run build`
(52 routes) and `npm run lint` (0 errors) pass. Card-based completion probe
counts still NEEDS MY INPUT.*
