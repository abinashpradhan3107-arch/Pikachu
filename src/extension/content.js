// Cortex LMS Content Script
// Runs on iitj-learn.masaischool.com
// Detects courses, lectures, assignments and syncs to backend

// ============================================================
// BUG 1 FIX: Immediate extraction with MutationObserver for
// dynamic React/TanStack rendering and SPA navigation
// ============================================================

// Whether extraction is currently in progress (prevent infinite loops)
let isExtracting = false;

// MutationObserver config for dynamic page changes
const observerConfig = {
  childList: true,
  subtree: true,
  attributes: true,
  // NOTE: 'data-*' is not a valid attributeFilter value - wildcards are not
  // supported, so list the real attributes we care about.
  attributeFilter: ['class', 'id', 'data-testid', 'aria-label']
};

// Extraction in-progress guard to prevent infinite loops
let lastExtractionTime = 0;
const MIN_EXTRACTION_INTERVAL = 2000; // milliseconds

// React renders the authenticated shell well after document_idle, so a single
// early attempt always misses. Retry on a ladder until markers appear.
const LOGIN_RETRY_DELAYS = [200, 700, 1400, 2500, 4000, 6000, 9000, 12000];
let loginAttempt = 0;
let loginConfirmed = false;
let lastSuccessfulExtraction = 0;

/**
 * Send a message to the background script without letting a missing receiver
 * surface as an unhandled promise rejection.
 */
function notifyBackground(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch (_e) {
    // Extension context invalidated (e.g. extension reloaded) - ignore.
  }
}

/**
 * Main initialization - start extraction immediately if DOM ready,
 * otherwise observe DOM changes for dynamic content
 */
function initializeExtraction() {
  // Attempt extraction immediately (in case the shell is already rendered),
  // then keep retrying on a ladder because React renders after document_idle.
  LOGIN_RETRY_DELAYS.forEach((delay) => {
    setTimeout(performExtraction, delay);
  });

  // Set up MutationObserver for dynamic SPA navigation and React re-renders
  // BUG 1 FIX: Observe document.body for dynamic content changes
  try {
    const observer = new MutationObserver(handleDOMChange);
    observer.observe(document.body, observerConfig);
  } catch (_e) {
    console.error('[Cortex LMS] MutationObserver not supported, falling back to polling');
    // Fallback: simple polling every 30 seconds
    window.setInterval(performExtraction, 30000);
  }

  // Also listen for hash/page navigation events with debounce
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    // Debounce navigation events to avoid rapid-fire extraction
    setTimeout(triggerResync, 500);
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    const result = originalReplaceState.apply(this, args);
    setTimeout(triggerResync, 500);
    return result;
  };
}

/**
 * Handle DOM changes from MutationObserver
 * BUG 1 FIX: Trigger resync when content changes dynamically
 * Avoid infinite extraction loops with time-based guard
 */
function handleDOMChange(_mutations) {
  // Guard: prevent extraction if too soon since last extraction
  const now = Date.now();
  if (now - lastExtractionTime < MIN_EXTRACTION_INTERVAL) {
    return;
  }

  // Check if we're still on the LMS domain.
  // NOTE: the old check tested document.body.innerHTML for 'iitj-learn', but
  // that string only exists in the URL, so it was always false and the
  // MutationObserver never fired an extraction.
  if (!document.body || location.hostname.indexOf('iitj-learn') === -1) return;

  // Trigger extraction after a brief delay to let content settle
  setTimeout(() => {
    if (Date.now() - lastExtractionTime >= MIN_EXTRACTION_INTERVAL) {
      performExtraction();
    }
  }, 500);
}

/**
 * Trigger resync after navigation
 */
function triggerResync() {
  // SPA navigation in this tab: re-extract and sync from here. The
  // background's 'check-for-updates' case has no payload to send, so the
  // content script drives the resync itself.
  void performExtraction();
}

/**
 * Core extraction function - entry point for all extraction
 * BUG 1 FIX: Starts immediately, supports dynamic rendering
 */
async function performExtraction() {
  // BUG 1 FIX: Prevent infinite extraction loops
  if (isExtracting) return;

  // Once authenticated, the retry ladder should not re-extract in a tight loop.
  if (loginConfirmed && Date.now() - lastSuccessfulExtraction < MIN_EXTRACTION_INTERVAL) {
    return;
  }

  isExtracting = true;

  try {
    // Check if user is logged into LMS
    const userLoggedIn = await checkUserLogin();
    if (!userLoggedIn) {
      loginAttempt += 1;
      if (loginAttempt <= LOGIN_RETRY_DELAYS.length) {
        console.log(
          `[Cortex LMS] extraction skipped: not logged into LMS ` +
          `(attempt ${loginAttempt}/${LOGIN_RETRY_DELAYS.length}, will retry)`
        );
      }
      notifyBackground({ type: 'auth-state-changed', authenticated: false });
      return;
    }

    // Send auth state to background (only once, to keep the console readable)
    if (!loginConfirmed) {
      loginConfirmed = true;
      console.log('[Cortex LMS] login confirmed - authenticated UI detected');
      notifyBackground({ type: 'auth-state-changed', authenticated: true });
    }

    // Extract course data
    const courseData = await extractCourseData();
    if (!courseData) {
      console.log('[Cortex LMS] extraction returned no data');
      return;
    }

    // Always report what was found, even if it is zero, so the pipeline is observable.
    const counts = {
      courses: courseData.courseId ? 1 : 0,
      chapters: (courseData.chapters || []).length,
      lectures: (courseData.lectures || []).length,
      assignments: (courseData.assignments || []).length
    };
    console.log(
      `[Cortex LMS] extracted: courses=${counts.courses}, chapters=${counts.chapters}, ` +
      `lectures=${counts.lectures}, assignments=${counts.assignments}` +
      (courseData.courseId ? ` (course "${courseData.courseId}")` : ' (no course id found)')
    );

    if (courseData.courseId) {
      notifyBackground({
        type: 'course-data',
        data: courseData,
        timestamp: new Date().toISOString()
      });
    }

    lastSuccessfulExtraction = Date.now();
  } catch (err) {
    console.error(
      '[Cortex LMS] extraction error:',
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    // Release immediately so the retry ladder and the MutationObserver can run.
    // Loop protection comes from lastExtractionTime + MIN_EXTRACTION_INTERVAL.
    isExtracting = false;
    lastExtractionTime = Date.now();
  }
}

/**
 * Check if user is logged into the LMS
 */
async function checkUserLogin() {
  // A password field means we are on a login screen.
  if (document.querySelector('input[type="password"]')) {
    return false;
  }

  // Selectors verified against the live iitj-learn.masaischool.com DOM.
  // Different pages expose different hooks, so try every known marker and
  // report which one matched for easier debugging.
  const markers = [
    ['profile-trigger', '[data-testid="navbar-profile-trigger"]'],
    ['account-menu', '[aria-label="Open account menu"]'],
    ['mobile-header', '[data-testid="app-mobile-header"]'],
    ['welcome-name', '[data-testid="dashboard-welcome-name"]'],
    ['primary-nav', '[aria-label="Primary navigation"]'],
    ['navbar', '[data-testid="navbar"]'],
    ['learn-list', '[data-testid="learn-content-list"]'],
    ['lecture-item', '[data-testid="lecture-list-item"]']
  ];

  for (const [name, sel] of markers) {
    if (document.querySelector(sel)) {
      if (!loginConfirmed) {
        console.log(`[Cortex LMS] login check: authenticated via ${name}`);
      }
      return true;
    }
  }

  return false;
}

// ============================================================
// Extraction against verified iitj-learn.masaischool.com markup
//
// Observed structure (probed on the live page):
//   [data-testid="learn-content-list"]            <section> list container
//     [data-testid="lecture-list-item"]           <div> one lecture card
//     [data-testid="assignment-list-item"]        <div> one assignment card
//       p                                        title
//       [data-testid="learn-card-section-name"]   <button> course name
//       span                                      instructor / datetime / tags
//
// Course id: ?batchId=382 in the URL, cross-checked against the
//   program-details-link href .../new-courses/382
//
// The page shows EITHER the Lectures tab OR the Assignments tab, never both,
// so a single pass extracts whichever is visible. Visiting the other tab
// triggers a second pass; the backend upserts, so nothing is lost.
// ============================================================

/** Lowercase, URL-safe id fragment. */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Convert an empty string to undefined so Zod optional() fields stay absent. */
function orUndefined(value) {
  return value ? value : undefined;
}

/** Real LMS course/program id, or null when it cannot be determined. */
function resolveCourseId() {
  try {
    const batch = new URLSearchParams(location.search).get('batchId');
    if (batch && /^\d+$/.test(batch)) return batch;
  } catch (_e) {
    // Malformed URL - fall through to the link check.
  }

  const program = document.querySelector('[data-testid="program-details-link"]');
  const href = program ? program.getAttribute('href') || '' : '';
  const match = href.match(/new-courses\/(\d+)/);
  return match ? match[1] : null;
}

/** Course name shown on the section-name button of the first card. */
function resolveCourseTitle() {
  const el = document.querySelector('[data-testid="learn-card-section-name"]');
  const text = el ? (el.innerText || '').trim() : '';
  return text || null;
}

/** Text of every leaf node inside a card, in document order. */
function cardTexts(item) {
  return [...item.querySelectorAll('*')]
    .filter((el) => !el.children.length)
    .map((el) => (el.innerText || el.textContent || '').trim())
    .filter(Boolean);
}

/** First card text matching a pattern, or ''. */
function pick(texts, pattern) {
  return texts.find((text) => pattern.test(text)) || '';
}

/**
 * Absolute http(s) URL of the first link inside a card, or '' when the card
 * carries no link. This is generic (any <a href>) rather than a guessed
 * selector: if the LMS does not expose a link, nothing is invented.
 */
function cardLink(item) {
  const anchors = [...item.querySelectorAll('a[href]')];
  if (item.matches && item.matches('a[href]')) anchors.unshift(item);
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    try {
      const url = new URL(href, location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (_e) {
      // Malformed href - skip it.
    }
  }
  return '';
}

/**
 * Duration text on a card ("1h 20m", "45 min"). A bare clock value such as
 * "19:10" is deliberately NOT treated as a duration - it is a time of day.
 */
function cardDuration(texts) {
  const unit = texts.find((text) =>
    /\b\d+\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/i.test(text) ||
    /^\s*\d{1,2}:\d{2}:\d{2}\s*$/.test(text)
  );
  return unit ? unit.slice(0, 40) : undefined;
}

/**
 * Notes, slides and handouts linked from the same lecture card. Only links
 * whose URL or label clearly indicates a document are kept, so the sync never
 * stores random navigation hrefs as study material.
 */
function cardMaterialLinks(item, lectureUrl) {
  const found = [];
  for (const anchor of item.querySelectorAll('a[href]')) {
    if (found.length >= 5) break;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    let url = '';
    try {
      url = new URL(href, location.href).href;
    } catch (_e) {
      continue;
    }
    if (lectureUrl && url === lectureUrl) continue;
    const label = (anchor.innerText || anchor.getAttribute('aria-label') || anchor.title || '').trim();
    const looksLikeDocument =
      /\.(pdf|pptx?|docx?|xlsx?|txt|md)(\?|#|$)/i.test(url) ||
      /(note|slide|handout|worksheet|deck|resource|study material)/i.test(`${label} ${url}`);
    if (!looksLikeDocument) continue;
    found.push({ title: (label || 'Lecture note').slice(0, 120), url });
  }
  return found;
}

// ============================================================
// Automated "Mark as Watched" detection
//
// The live LMS DOM has never been observed WITH a completion indicator
// visible, so no completion selector can be assumed to exist. Every candidate
// below is PROBED at runtime and scoped to a single lecture card: a lecture is
// only marked completed when an element actually matches, and match COUNTS
// (never page HTML) are logged so the probes can be verified against the real
// page rather than trusted blindly.
// ============================================================

// Candidates to check beside each lecture item (green checks / completed
// states / 100% badges, per the product spec). Unsupported selectors in a
// given browser are treated as "no match", never as an error.
const COMPLETION_PROBES = [
  ['data-completed=true', '[data-completed="true"]'],
  ['data-status=completed', '[data-status="completed"]'],
  ['data-state=completed', '[data-state="completed"]'],
  ['data-done=true', '[data-done="true"]'],
  ['class .completed', '.completed'],
  ['class .done', '.done'],
  ['class .is-completed', '.is-completed'],
  ['class .is-done', '.is-done'],
  ['class .watched', '.watched'],
  ['aria completed', '[aria-label*="completed" i]'],
  ['aria watched', '[aria-label*="watched" i]'],
  ['title completed', '[title*="completed" i]'],
  ['img alt completed', 'img[alt*="completed" i]'],
  ['svg check', 'svg[class*="check" i]'],
  ['svg tick', 'svg[class*="tick" i]'],
  ['svg complete', 'svg[class*="complete" i]'],
  ['testid completed', '[data-testid*="completed" i]'],
  ['testid watched', '[data-testid*="watched" i]'],
];

// Badge-like leaf text inside a card ("Completed", "Watched", "100%"). The
// regex is anchored so a lecture TITLE containing those words never matches.
const COMPLETION_BADGE_RE =
  /^(?:\d{1,3}%\s*)?(?:completed|watched|done)$|^\d{1,3}%$/i;

// Per-extraction probe tally { name: count }, reset before each pass.
let completionCounts = {};
let completionMatchedItems = 0;
let lastCompletionLog = '';

/**
 * Probe one lecture card for completion indicators.
 * @param {Element} item - a [data-testid="lecture-list-item"] card
 * @returns {boolean} true only when an element actually matched
 */
function probeLectureCompletion(item) {
  let matched = false;
  const countMatches = (name, selector) => {
    let n = 0;
    try {
      n = item.querySelectorAll(selector).length;
      if (item.matches && item.matches(selector)) n += 1;
    } catch (_e) {
      n = 0; // selector unsupported in this browser - honest no-match
    }
    if (n > 0) {
      completionCounts[name] = (completionCounts[name] || 0) + n;
      matched = true;
    }
  };
  COMPLETION_PROBES.forEach(([name, selector]) => countMatches(name, selector));

  const badge = [...item.querySelectorAll('*')].some(
    (el) =>
      !el.children.length &&
      COMPLETION_BADGE_RE.test((el.innerText || el.textContent || '').trim())
  );
  if (badge) {
    completionCounts['badge text'] = (completionCounts['badge text'] || 0) + 1;
    matched = true;
  }
  return matched;
}

/** Log probe counts (counts only) whenever they change - one line, no HTML. */
function logCompletionProbe(itemCount) {
  const names = COMPLETION_PROBES.map(([name]) => name).concat(['badge text']);
  const parts = names.map((name) => `${name}=${completionCounts[name] || 0}`);
  const signature =
    `items=${itemCount} matched=${completionMatchedItems} | ${parts.join(' ')}`;
  if (signature === lastCompletionLog) return;
  lastCompletionLog = signature;
  console.log(`[Cortex LMS] completion probe: ${signature}`);
}

// ============================================================
// Video playback completion (>= 85% progress)
//
// knownLectures persists across SPA navigations: a video page may not render
// the lecture list, but the lecture cards seen earlier in this tab still let
// the completion be attributed - by EXACT url or EXACT heading/title match
// only. When nothing matches, nothing is marked (no guessed mapping).
// ============================================================

const VIDEO_WATCH_RATIO = 0.85;
let knownLectures = []; // full lecture objects seen on previous passes
const forcedCompletedIds = new Set();
let lastVideoLogAt = 0;

function rememberLectures(lectures) {
  lectures.forEach((lecture) => {
    const known = knownLectures.find((item) => item.id === lecture.id);
    if (known) {
      // Later passes may capture a link the first pass missed - fill it in.
      if (lecture.url && !known.url) known.url = lecture.url;
    } else {
      knownLectures.push({ ...lecture });
    }
  });
}

/** Normalise a URL for equality checks: no hash, no trailing slash. */
function normalizeUrl(href) {
  try {
    const url = new URL(href, location.href);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch (_e) {
    return '';
  }
}

/**
 * Resolve the lecture being watched on a video page.
 * Evidence only: exact URL, then an exact heading, then the page title
 * containing the exact lecture title. Returns null when nothing matches.
 */
function resolveWatchedLecture() {
  const pageUrl = normalizeUrl(location.href);
  if (pageUrl) {
    const byUrl = knownLectures.find(
      (lecture) => lecture.url && normalizeUrl(lecture.url) === pageUrl
    );
    if (byUrl) return { lecture: byUrl, method: 'url' };
  }
  const heading = document.querySelector('h1');
  const headingText = heading ? (heading.innerText || '').trim() : '';
  if (headingText) {
    const byHeading = knownLectures.find(
      (lecture) => lecture.title && lecture.title === headingText
    );
    if (byHeading) return { lecture: byHeading, method: 'heading' };
  }
  const docTitle = (document.title || '').trim();
  if (docTitle) {
    const byTitle = knownLectures.find(
      (lecture) => lecture.title && docTitle.indexOf(lecture.title) !== -1
    );
    if (byTitle) return { lecture: byTitle, method: 'page-title' };
  }
  return null;
}

/** timeupdate handler: fires once watch progress passes 85%. */
function handleVideoProgress(event) {
  const video = event.currentTarget;
  if (video.dataset.cortexDone === '1') return;
  const duration = Number(video.duration);
  const current = Number(video.currentTime);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return;
  const progress = current / duration;
  if (progress < VIDEO_WATCH_RATIO) return;

  const resolved = resolveWatchedLecture();
  if (!resolved) {
    // Throttled: this fires ~4x/second. Counts only, no page text.
    if (Date.now() - lastVideoLogAt > 10000) {
      lastVideoLogAt = Date.now();
      console.log(
        `[Cortex LMS] video completion: progress=${Math.round(progress * 100)}% ` +
        `known=${knownLectures.length} match=none`
      );
    }
    return;
  }

  video.dataset.cortexDone = '1';
  console.log(
    `[Cortex LMS] video completion: progress=${Math.round(progress * 100)}% ` +
    `known=${knownLectures.length} match=${resolved.method}`
  );

  if (forcedCompletedIds.has(resolved.lecture.id)) return;
  forcedCompletedIds.add(resolved.lecture.id);
  // Re-extract now so the outgoing payload carries completed=true for it,
  // then once more after the extraction throttle window in case this call
  // was skipped by the 2-second guard.
  void performExtraction();
  setTimeout(() => {
    void performExtraction();
  }, MIN_EXTRACTION_INTERVAL + 150);
}

/** Attach the progress listener to every HTML5 video on the page (once each). */
function observeLectureVideos() {
  const videos = document.querySelectorAll('video');
  let attached = 0;
  videos.forEach((video) => {
    if (video.dataset.cortexWatch === '1') return;
    video.dataset.cortexWatch = '1';
    video.addEventListener('timeupdate', handleVideoProgress);
    attached += 1;
  });
  if (attached > 0) {
    console.log(`[Cortex LMS] video observer: attached=${attached} total=${videos.length}`);
  }
}

/**
 * Due date for an assignment: a machine-readable datetime attribute when the
 * LMS exposes one, otherwise the rendered text ("1 Nov, 11:45 AM - ...").
 */
function cardDueDate(item, texts) {
  const timeEl = item.querySelector('[datetime]');
  if (timeEl) {
    const raw = timeEl.getAttribute('datetime') || '';
    if (raw) return raw;
  }
  return pick(texts, /\b\d{1,2}\s+[A-Za-z]{3},\s*\d{1,2}:\d{2}/);
}

/**
 * Extract all available course data from the LMS page.
 * Selectors above are verified against the real DOM - nothing invented.
 */
async function extractCourseData() {
  const data = {
    courseId: null,
    courseTitle: null,
    chapters: [],
    lectures: [],
    assignments: [],
    announcements: [],
    lastUpdated: new Date().toISOString()
  };

  data.courseId = resolveCourseId();
  data.courseTitle = resolveCourseTitle();

  // Reset the completion probe tally for this pass.
  completionCounts = {};
  completionMatchedItems = 0;

  // ---- Lectures (visible on the Lectures tab) ----
  const lectureItems = document.querySelectorAll('[data-testid="lecture-list-item"]');
  lectureItems.forEach((item) => {
    const titleEl = item.querySelector('p');
    const title = titleEl ? (titleEl.innerText || '').trim() : '';
    if (!title) return;

    // Titles look like "#32 Week 13 - From Algorithms to Intelligence".
    // "Week 13" is real LMS terminology, so group lectures by that week.
    const weekMatch = title.match(/week\s+(\d+)/i);
    const chapterId = weekMatch && data.courseId
      ? `${data.courseId}-week-${weekMatch[1]}`
      : '';

    if (chapterId && !data.chapters.some((c) => c.id === chapterId)) {
      data.chapters.push({
        id: chapterId,
        title: `Week ${weekMatch[1]}`,
        order: Number(weekMatch[1])
      });
    }

    const lecture = {
      id: `lms-${data.courseId || 'unknown'}-${slugify(title)}`,
      title
    };
    if (chapterId) lecture.chapterId = chapterId;

    const url = cardLink(item);
    if (url) lecture.url = url;
    const duration = cardDuration(cardTexts(item));
    if (duration) lecture.duration = duration;

    const materials = cardMaterialLinks(item, url);
    if (materials.length) lecture.notes = materials;

    // Automated watched state: an observed indicator on this card, or a
    // video that already crossed 85% for this lecture. Sent on EVERY lecture
    // (true or false) so the backend always knows the observed state.
    const cardCompleted = probeLectureCompletion(item);
    if (cardCompleted) completionMatchedItems += 1;
    lecture.completed = cardCompleted || forcedCompletedIds.has(lecture.id);

    data.lectures.push(lecture);
  });

  logCompletionProbe(lectureItems.length);

  // Lectures completed from a video page that showed no lecture cards: the
  // cards were seen earlier in this tab, so re-attach the exact same data
  // (never invented) with completed=true.
  forcedCompletedIds.forEach((id) => {
    if (data.lectures.some((lecture) => lecture.id === id)) return;
    const known = knownLectures.find((lecture) => lecture.id === id);
    if (known) data.lectures.push({ ...known, completed: true });
  });

  rememberLectures(data.lectures);
  observeLectureVideos();

  // ---- Assignments (visible on the Assignments tab) ----
  const assignmentItems = document.querySelectorAll('[data-testid="assignment-list-item"]');
  assignmentItems.forEach((item) => {
    const titleEl = item.querySelector('p');
    const title = titleEl ? (titleEl.innerText || '').trim() : '';
    if (!title) return;

    const texts = cardTexts(item);

    data.assignments.push({
      id: `lms-${data.courseId || 'unknown'}-asg-${slugify(title)}`,
      title,
      dueDate: orUndefined(cardDueDate(item, texts)),
      status: orUndefined(pick(texts, /^(complete|incomplete|pending|submitted|due|not started)$/i))
    });
  });

  // ---- Announcements ----
  // NOT IMPLEMENTED: no announcement list has been probed on the live page,
  // so no selector is guessed here. Add one only after observing the markup.

  const hasMeaningfulData =
    !!data.courseId ||
    !!data.courseTitle ||
    data.chapters.length > 0 ||
    data.lectures.length > 0 ||
    data.assignments.length > 0;

  return hasMeaningfulData ? data : null;
}

// Version marker so a stale (not-reloaded) content script is obvious.
console.log('[Cortex LMS] content script v6 loaded on ' + location.href);

/**
 * Moodle probe - OBSERVATION ONLY, nothing is synced.
 *
 * moodle.iitj.ac.in has never been inspected, so no selector on it can be
 * trusted yet. This logs match counts for candidate structures (counts only,
 * no page text) so real selectors can be adopted later. The Masai extraction
 * path below never runs on Moodle, and this function never sends anything to
 * the backend.
 */
function probeMoodle() {
  const candidates = [
    'li.activity',
    '.activity-item',
    '.course-content li',
    '[data-course-id]',
    'a[href*="mod/"]',
    '.page-header-headings h1',
    'time[datetime]',
    '[role="main"] a'
  ];
  const attempt = (n) => {
    const counts = candidates
      .map((selector) => `${selector.replace(/\s+/g, '')}=${document.querySelectorAll(selector).length}`)
      .join(' ');
    const shell = document.querySelector('[data-course-id], .course-content, #page-content');
    console.log(`[Cortex LMS] moodle probe ${n}/6: ${counts} | shell=${shell ? 'yes' : 'no'}`);
    if (n < 6 && !shell) setTimeout(() => attempt(n + 1), 1500);
  };
  attempt(1);
}

// Start initialization
if (location.hostname.indexOf('moodle.iitj.ac.in') !== -1) {
  probeMoodle();
} else {
  initializeExtraction();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-course-data') {
    // extractCourseData() is async - resolve before responding, otherwise the
    // receiver would get a serialized Promise instead of the data.
    extractCourseData()
      .then((data) => sendResponse(data))
      .catch(() => sendResponse(null));
    return true;
  }
  if (message.type === 'check-for-updates') {
    // Background pings the active LMS tab every 5 minutes - run a pass so
    // completion state picked up while the tab was idle still syncs.
    void performExtraction();
    sendResponse({ status: 'extracting' });
    return false;
  }
  return false;
});
