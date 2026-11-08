// Cortex LMS Background Script
// Handles persistent LMS synchronization and messaging

let lastSync = 0;
const SYNC_INTERVAL = 300000; // 5 minutes
let isSyncing = false;

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'course-data':
      // Forward course data to our backend
      syncCourseData(message.data, message.timestamp);
      sendResponse({ status: 'received' });
      break;

    case 'navigation':
      // User navigated within LMS - mark last sync as stale, trigger check
      lastSync = 0;
      console.log('LMS navigation detected - will resync on next interval');
      break;
  }
  sendResponse?.({});
});

// Initial sync on extension install/upgrade
chrome.runtime.onInstalled.addListener(async () => {
  // Wait a moment then do initial sync check
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Note: Full sync requires authenticated session from content script
});

// Periodic sync - check every 5 minutes
setInterval(async () => {
  try {
    // Only sync if browser is still focused and LMS is likely open
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('iitj-learn.masaischool.com')) {
      // Send message to content script to check for updates
      chrome.tabs.sendMessage(tab.id, { type: 'check-for-updates' });
    }
  } catch (err) {
    // Tab might have been closed or navigated away
    console.debug('Periodic sync check ignored:', err.message);
  }
}, SYNC_INTERVAL);

// Handle check-for-updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'check-for-updates') {
    // Content script has new data - sync it
    if (message.data && message.data.courseId) {
      syncCourseData(message.data, message.timestamp);
    }
  }
});

/**
 * Sync course data to the backend API
 * @param {Object} courseData - Extracted course data from content script
 * @param {string} timestamp - ISO timestamp of extraction
 */
async function syncCourseData(courseData, timestamp) {
  // Skip if already syncing
  if (isSyncing) return;

  isSyncing = true;

  try {
    // Prepare the data for backend
    const payload = {
      courseData,
      timestamp: timestamp || new Date().toISOString()
    };

    // Send to our backend API - use same origin to include cookies/auth
    const response = await fetch('/api/lms/extension-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Credentials: 'include' would send cookies, but we need auth
      // For now, the backend will check session auth
    });

    if (response.ok) {
      const result = await response.json();
      lastSync = Date.now();
      console.log('LMS sync successful:', result);
    } else {
      const errText = await response.text();
      console.error('LMS sync failed:', response.status, errText);
    }
  } catch (error) {
    console.error('LMS sync error:', error);
  } finally {
    isSyncing = false;
  }
}

// Listen for any messages to keep background responsive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'sync-now') {
    // Immediate sync triggered from popup or UI
    if (message.data && message.data.courseId) {
      syncCourseData(message.data, message.timestamp);
    }
    sendResponse({ status: 'sync-triggered' });
  }
  return true;
});