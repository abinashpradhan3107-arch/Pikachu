# MANUAL TEST — Cortex LMS Integration

## Purpose
Test the full pipeline: Chrome extension → Cortex backend API → SQLite → dashboard.

You will need:
- Chrome (or Edge) on this computer
- A Cortex account on the app running locally
- Your IIT Jodhpur LMS login (`https://iitj-learn.masaischool.com/`)

**Never type your LMS password into the extension or into Cortex.** The extension only needs the Cortex app URL.

---

## Step 0 — Load the extension into Chrome

1. Open Chrome and type `chrome://extensions` in the address bar, press Enter.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (button appears top-left).
4. Select this folder: `C:\code\Pikachu\src\extension`
5. The card **Cortex LMS Sync 2.0.0** should appear.

**Already loaded from a previous round?** The extension files changed (Moodle
permission, lecture link/duration/notes capture, **and the new v6 completion
probe / video observer**), so click the **↻ reload**
circular-arrow button on the card, then reload any open LMS tabs.

**Success looks like:**
- The card appears with no red error text.
- Clicking **Details** shows no "Errors" button, or the Errors button is greyed out.

**Failure looks like:**
- Red banner: *"Could not load icon..."* or *"Could not load css..."* → a file listed in `manifest.json` is missing. Tell me the exact filename.
- *"Manifest file is missing or unreadable"* → you selected the wrong folder.
- An **Errors** button appears on the card → click it and copy the first red line to me.

---

## Step 1 — Start the app and open the dashboard

1. In a terminal in `C:\code\Pikachu`, run: `npm run dev`
2. Wait for the line that says the app is ready and note the URL (usually `http://localhost:3000`).
3. Open that URL in Chrome and sign in to Cortex.
4. Go to `/dashboard`.

**Success looks like:**
- The dev server prints a "Ready" line with no red errors.
- The dashboard page loads and shows your name or your study data.

**Failure looks like:**
- The server exits with an error → copy the last 10 lines to me.
- The page shows "Application error" or a 500 → tell me the URL and the error text.

---

## Step 2 — Pair the extension with Cortex

1. Click the **Cortex LMS Sync** icon in the Chrome toolbar (puzzle-piece icon → pin it first if needed).
2. In the popup, type your Cortex URL exactly as shown by the dev server, e.g. `http://localhost:3000`.
3. Click **Pair with Cortex**.

**Success looks like:**
- The popup shows: `Paired with http://localhost:3000` followed by `Open the LMS tab to sync.`
- Reopening the popup still shows the same URL in the text box.

**Failure looks like:**
- `Enter a valid URL...` → the URL has a typo; it must start with `http://` or `https://`.
- `Failed to save...` → tell me, and include the message shown on the extension card's Errors button.

---

## Step 3 — Log in to the LMS in Chrome

1. Open a new tab and go to `https://iitj-learn.masaischool.com/`.
2. Sign in normally with your IIT Jodhpur credentials (including MFA if prompted).

**Success looks like:**
- You land on your LMS home page and can see your courses/program.

**Failure looks like:**
- Login loop, CAPTCHA, or "invalid credentials" → resolve the login first; nothing else can be tested until the LMS page loads.

---

## Step 4 — Read the browser console on the LMS page

1. Stay on the LMS tab. Press `F12` (or right-click → **Inspect**) and open the **Console** tab.
2. Wait 5–10 seconds, and click one of your courses so the page renders content.
3. Look for lines starting with `[Cortex LMS]`.

**Success looks like** — you see some of these, in roughly this order:
```
[Cortex LMS] sync stage: extract
[Cortex LMS] sync counts: courses=1, chapters=3, lectures=5, assignments=2
[Cortex LMS] attempting sync to http://localhost:3000
[Cortex LMS] sync stage: sqlite_save
[Cortex LMS] sync stage: done
[Cortex LMS] sync successful, server counts: ...
```
The numbers may be 0 while the selectors are still being tuned — **counts of 0 are not a crash**, they mean nothing was detected on that page.

**Failure looks like:**
- **No `[Cortex LMS]` lines at all** → the content script did not run. Confirm the extension is enabled and the tab URL starts with `https://iitj-learn.masaischool.com/`, then reload the tab.
- `[Cortex LMS] sync error at stage "pair": No Cortex app paired...` → redo Step 2.
- `[Cortex LMS] sync error at stage "backend": Failed to fetch` → the Cortex app is not running, the URL is wrong, or the extension lacks permission for that host. Tell me this exact line.
- `[Cortex LMS] sync error at stage "backend": LMS sync failed: HTTP 401` → the extension's request reached Cortex but was not signed in. Sign in to Cortex in the same Chrome profile, then reload the LMS tab.
- Anything that prints a cookie, token, or password → that is a bug; copy the line to me.

---

## Step 5 — Check the dashboard and record what it shows

1. Go back to the Cortex tab at `/dashboard`.
2. Look for these panels, in order down the page:
   - **Today's plan** — each task should show a time slot in amber, e.g. `6:00 PM – 7:30 PM`.
   - **Catch-up backlog** — unwatched LMS lectures, each with a **Mark watched** button.
   - **Next exam** — a countdown in days.
   - **Weak topics** — confidence dots, and a `quiz NN%` badge once you have submitted a quiz.

**Success looks like:**
- All four panels render without crashing, even if some are empty (an empty backlog says "Nothing waiting").

**Failure looks like:**
- A panel is missing entirely, or the page throws an error.
- Time slots are missing on every task → the plan was generated before this build; click **Generate** again on `/plan`.

Record exactly what you see: the label names, the numbers, and any error text.

---

## Step 6 — Verify Moodle still works (regression check)

Only do this if you already had a working Moodle token.

1. In Cortex, open **Settings → LMS connection**.
2. Confirm your existing Moodle (`moodle.iitj.ac.in`) token still shows as connected, or reconnect it.

**Success looks like:**
- The token is accepted and Moodle courses/materials still load as before.

**Failure looks like:**
- The token is rejected, or Moodle data disappears → tell me immediately; this must not regress.

---

## Step 7 — Capability 1: lectures shown on /courses

1. In Cortex open `/courses` and click **Show chapters** on your synced course.
2. Scroll to **"LMS Lectures & Resources"** under the chapter list.

**Success looks like:**
- Each lecture shows its title, duration (e.g. `1h 20m`), a **Mark watched** button and an external-link button.
- Notes/slides extracted by the extension appear as separate rows with working links.

**Failure looks like:**
- Section missing → the extension has not re-synced yet; go back to the LMS Lectures tab and reload it.
- Links missing → the rows predate this build; the next sync repairs `url` additively (never overwrites).

---

## Step 8 — Capability 3: backlog and mark-as-watched

1. On `/courses`, note the **Catch-up backlog** count at the top.
2. Click **Mark watched** on one lecture.
3. Refresh the page (`F5`).

**Success looks like:**
- The count drops by one and stays dropped after refresh; the lecture now shows a green check.
- Clicking **Mark unwatched** puts it back.

**Failure looks like:**
- The count resets after refresh → the toggle did not persist; tell me, include the browser console error.

---

## Step 9 — Capability 2: plan time slots and links

1. Open `/plan` and pick today.
2. Check each task for a time slot and, where an LMS link exists, an **Open … in LMS** link.

**Success looks like:**
- Slots run back-to-back from your preferred start hour with breaks between them.
- Task descriptions contain a "Before:" and an "After:" sentence.

**Failure looks like:**
- No slots at all → regenerate the plan (old tasks have no `start_time`).

---

## Step 10 — Capability 4: priority matrix and quiz accuracy

1. Open `/courses` and scroll to **Topic priority matrix** (High / Medium / Low columns).
2. Open `/tools`, generate a quiz, answer it and click **Check answers**.
3. Go to `/progress` → **Weak topics** and look for the `quiz NN%` badge.

**Success looks like:**
- The matrix lists your chapters with reasons like `low confidence`, `exam in N days`.
- The accuracy badge appears after submitting the quiz.

**Failure looks like:**
- Matrix columns all empty → no chapters recorded yet.
- No badge → the score was not recorded; check the browser console for a failed `POST /api/quiz-attempts`.

---

## Step 11 — Moodle probe (only if you want Moodle sync)

1. Open `https://moodle.iitj.ac.in/` and press `F12` → **Console**.
2. Look for `[Cortex LMS] moodle probe` lines.

**Success looks like:**
- Lines listing selector match counts, e.g. `li.activity=0 ... shell=yes`.
- Nothing is sent to Cortex from Moodle — that is intentional until real selectors are confirmed.

Send me those lines verbatim (they contain counts only, no page content).

---

## Step 12 — Capability 6: automated "Mark as Watched" (no clicks)

1. Reload the extension (Step 0) and open the Masai **Lectures** tab with the
   console open (`F12` → Console).
2. Look for the probe line and copy it verbatim:
   ```
   [Cortex LMS] completion probe: items=13 matched=0 | data-completed=true=0 class .completed=0 ...
   ```
   `matched` and the per-indicator counts tell us which completion indicators
   actually exist in the live DOM (counts only — no page content).
3. Open a lecture with a video and let it play past **85%** (scrub the
   progress bar if you don't want to watch it all).
4. Look for `[Cortex LMS] video completion: progress=85%+ known=13 match=url`
   (the match may also say `heading` or `page-title`; `match=none` means the
   lecture could not be identified — copy the line either way).
5. Switch to the Cortex tab (just focus it — **do not press F5**) and open
   `/dashboard`.

**Success looks like:**
- The lecture no longer appears in the **Catch-up backlog** (count dropped)
  and shows a green watched state on `/courses` and `/lms` — with **zero
  clicks**.
- On `/plan` or `/dashboard`, the study task for that lecture is marked
  completed automatically.
- The **Mark watched** button is still there as a fallback, but you did not
  need it.

**Failure looks like:**
- `match=none` on the video line, or `matched=0` on the probe line while the
  LMS clearly shows a green tick → copy both lines to me; they name exactly
  which indicator to add. Nothing is guessed, so an unrecognised indicator
  simply stays unmarked.
- Backlog only drops after pressing `F5` → the focus refetch did not run;
  tell me which page you were on.
- A lecture you did **not** watch shows as watched → copy the probe line
  immediately (a probe matched structurally); the manual **Mark unwatched**
  button restores it while we narrow the selector.

---

## What to send back

1. Step 0: did the extension load (or reload cleanly), and any red error text?
2. Step 2: what the popup showed after pairing.
3. Step 4: copy/paste every `[Cortex LMS]` line you saw.
4. Step 5: what each of the four dashboard panels showed (or "nothing").
5. Step 7–10: for each, "works" or the exact failure text.
6. Step 6: whether Moodle still worked.
7. Step 11: the probe lines, if you want Moodle sync.
8. Step 12: the `completion probe:` line and any `video completion:` line.

Do not paste your LMS password, session cookie, or Moodle token into the chat.
Diagnostics are stage/counts/errors only — never cookies, tokens, or full page HTML.
