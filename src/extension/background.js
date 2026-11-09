// Cortex LMS Background Script
// Handles persistent LMS synchronization and messaging
// BUG 2 FIX: Configurable Cortex app URL + secure extension pairing

// ============================================================
// Sync state (declared once, before use)
// ============================================================

let pairedCortexUrl = '';
let isSyncing = false;
let lastSync = 0;

// ============================================================
// BUG 2 FIX: Extension-Cortex pairing mechanism
// ============================================================

// Get paired Cortex URL from storage
async function getPairedCortexUrl() {
  try {
    const result = await chrome.storage.local.get('cortexUrl');
    return result.cortexUrl || '';
  } catch (err) {
    console.error('Failed to get paired Cortex URL:', err);
    return '';
  }
}

// Set paired Cortex URL (called during pairing flow)
async function setPairedCortexUrl(url) {
  try {
    await chrome.storage.local.set({ cortexUrl: url });
    pairedCortexUrl = url;
    console.log('[Cortex LMS] paired Cortex URL set');
  } catch (err) {
    console.error('Failed to set paired Cortex URL:', err);
  }
}

/**
 * Normalise a stored Cortex URL to "<protocol>//<host>".
 * Returns '' when empty or unparseable.
 */
function normalizeBaseUrl(raw) {
  if (!raw) return '';
  const candidate = String(raw).startsWith('http') ? String(raw) : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_e) {
    console.error('[Cortex LMS] Invalid Cortex URL:', raw);
    return '';
  }
}

/**
 * Get the API base URL for the Cortex backend.
 *
 * Reads chrome.storage on EVERY call. Manifest V3 service workers are
 * ephemeral: pairedCortexUrl is reset to '' whenever the worker restarts,
 * and onInstalled only fires on install/update - not on restart. Reading
 * storage here is what keeps pairing alive across restarts.
 */
async function getApiBaseUrl() {
  const stored = await getPairedCortexUrl();
  if (stored) {
    pairedCortexUrl = stored;
  }
  return normalizeBaseUrl(stored || pairedCortexUrl);
}

// Hydrate the in-memory value as soon as the worker starts, so the first
// diagnostic log after a restart already shows the right target.
getPairedCortexUrl().then((url) => {
  if (url) {
    pairedCortexUrl = url;
    console.log('[Cortex LMS] restored paired Cortex URL');
  }
});

// ============================================================
// DIAGNOSTIC: Sync stage tracking and counts
// Logs stage, counts and error names only.
// Never logs cookies, tokens, passwords or full page HTML.
// ============================================================

let syncStage = 'idle';

let syncCounts = {
  courses: 0,
  chapters: 0,
  lectures: 0,
  assignments: 0
};

let syncError = {
  stage: '',
  message: ''
};

/**
 * Set the current sync stage and log it
 * @param {string} stage - One of: pair, extract, backend, sqlite_save, done
 */
function setSyncStage(stage) {
  syncStage = stage;
  console.log(`[Cortex LMS] sync stage: ${stage}`);
}

/**
 * Set sync counts and log them
 * @param {Object} counts - courses, chapters, lectures, assignments
 */
function setSyncCounts(counts) {
  syncCounts = { ...syncCounts, ...counts };
  console.log(
    `[Cortex LMS] sync counts: courses=${syncCounts.courses}, ` +
    `chapters=${syncCounts.chapters}, lectures=${syncCounts.lectures}, ` +
    `assignments=${syncCounts.assignments}`
  );
}

/**
 * Set sync error and log it with the stage name
 * @param {string} stage - The sync stage where the error occurred
 * @param {string} message - Error message (no cookies, tokens, or passwords)
 */
function setSyncError(stage, message) {
  const text = String(message || 'Unknown error').substring(0, 200);
  syncError = { stage, message: text };
  console.error(`[Cortex LMS] sync error at stage "${stage}": ${text}`);
}

/**
 * Clear sync error
 */
function clearSyncError() {
  syncError = { stage: '', message: '' };
}

// ============================================================
// BUG 3 FIX: Send extracted data to Cortex backend
// ============================================================

/**
 * Secure sync course data to Cortex backend.
 * Does NOT store LMS passwords or session cookies.
 *
 * @param {Object} courseData - Extracted course data
 * @param {string} timestamp - ISO timestamp
 */
async function syncCourseData(courseData, timestamp) {
  if (isSyncing) {
    console.log('[Cortex LMS] sync skipped: previous sync still running');
    return;
  }

  isSyncing = true;
  clearSyncError();

  try {
    const apiBase = await getApiBaseUrl();

    if (!apiBase) {
      setSyncStage('pair');
      setSyncError('pair', 'No Cortex app paired. Open the extension popup and pair first.');
      console.log('[Cortex LMS] sync blocked: no paired Cortex URL in chrome.storage');
      return;
    }

    setSyncStage('backend');
    console.log('[Cortex LMS] attempting sync to', apiBase || 'same-origin');

    const response = await fetch(`${apiBase}/api/lms/extension-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Send the Cortex session cookie so the backend can identify the user.
      // The backend never trusts a user id supplied by this extension.
      credentials: 'include',
      body: JSON.stringify({
        courseData,
        timestamp: timestamp || new Date().toISOString()
      })
    });

    if (response.ok) {
      let result = {};
      try {
        result = await response.json();
      } catch (e) {
        result = {};
      }
      lastSync = Date.now();
      setSyncStage('sqlite_save');
      setSyncCounts({
        courses: result?.counts?.courses ?? syncCounts.courses,
        chapters: result?.counts?.chapters ?? syncCounts.chapters,
        lectures: result?.counts?.lectures ?? syncCounts.lectures,
        assignments: result?.counts?.assignments ?? syncCounts.assignments
      });
      setSyncStage('done');
      console.log('[Cortex LMS] sync successful, server counts:', JSON.stringify(result?.counts || null));
    } else {
      const errText = await response.text();
      setSyncError('backend', `LMS sync failed: HTTP ${response.status}`);
      // Truncated: never log full HTML
      console.error('[Cortex LMS] sync failed body (truncated):', errText.substring(0, 100));

      if (response.status === 401 || response.status === 403) {
        try {
          chrome.runtime.sendMessage({
            type: 'pairing-required',
            message: 'Please sign in to Cortex and pair the extension first.'
          });
        } catch (e) {
          // No receiver open - ignore
        }
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    setSyncError('backend', msg);
  } finally {
    isSyncing = false;
  }
}

// ============================================================
// Message handling
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'course-data': {
      const cd = message.data;
      if (cd) {
        setSyncStage('extract');
        setSyncCounts({
          courses: cd.courseId ? 1 : 0,
          chapters: Array.isArray(cd.chapters) ? cd.chapters.length : 0,
          lectures: Array.isArray(cd.lectures) ? cd.lectures.length : 0,
          assignments: Array.isArray(cd.assignments) ? cd.assignments.length : 0
        });
      }
      syncCourseData(message.data, message.timestamp);
      sendResponse({ status: 'received' });
      break;
    }

    case 'navigation':
      lastSync = 0;
      console.log('[Cortex LMS] LMS navigation detected - will resync on next interval');
      sendResponse({ status: 'navigation' });
      break;

    case 'set-cortex-url':
      setSyncStage('pair');
      setPairedCortexUrl(message.url);
      sendResponse({ status: 'url-set' });
      break;

    case 'check-for-updates':
      if (message.data && message.data.courseId) {
        syncCourseData(message.data, message.timestamp);
      }
      sendResponse({ status: 'checked' });
      break;

    case 'sync-now':
      if (message.data && message.data.courseId) {
        syncCourseData(message.data, message.timestamp);
      }
      sendResponse({ status: 'sync-triggered' });
      break;

    case 'get-sync-status':
      sendResponse({ stage: syncStage, counts: syncCounts, error: syncError, lastSync });
      break;

    default:
      sendResponse({ status: 'ignored' });
  }
  return true;
});

// Restore previously paired URL on install/upgrade
chrome.runtime.onInstalled.addListener(async () => {
  const savedUrl = await getPairedCortexUrl();
  if (savedUrl) {
    pairedCortexUrl = savedUrl;
    console.log('[Cortex LMS] restored previously paired Cortex URL');
  }
});

// Periodic check every 5 minutes (only when the LMS tab is active)
setInterval(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('iitj-learn.masaischool.com')) {
      chrome.tabs.sendMessage(tab.id, { type: 'check-for-updates' });
    }
  } catch (err) {
    console.debug('[Cortex LMS] periodic sync check ignored:', err.message);
  }
}, 300000);
