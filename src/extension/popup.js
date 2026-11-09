// Cortex LMS Sync - popup script
// Saves the Cortex app URL used by the background sync.
// Does NOT store LMS passwords or session cookies.

const input = document.getElementById('cortexUrl');
const saveButton = document.getElementById('save');
const statusEl = document.getElementById('status');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

function normalizeUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return '';
  const withProtocol = value.startsWith('http') ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (e) {
    return '';
  }
}

async function loadSaved() {
  try {
    const { cortexUrl } = await chrome.storage.local.get('cortexUrl');
    if (cortexUrl) {
      input.value = cortexUrl;
      setStatus(`Paired with ${cortexUrl}`, 'ok');
    }
  } catch (e) {
    setStatus('Could not read saved settings.', 'bad');
  }

  try {
    const status = await chrome.runtime.sendMessage({ type: 'get-sync-status' });
    if (status) {
      const lines = [
        `Stage: ${status.stage || 'idle'}`,
        `Courses: ${status.counts?.courses ?? 0}`,
        `Chapters: ${status.counts?.chapters ?? 0}`,
        `Lectures: ${status.counts?.lectures ?? 0}`,
        `Assignments: ${status.counts?.assignments ?? 0}`
      ];
      if (status.error && status.error.message) {
        lines.push(`Error (${status.error.stage}): ${status.error.message}`);
      }
      setStatus(lines.join('\n'), status.error && status.error.message ? 'bad' : 'ok');
    }
  } catch (e) {
    // Background may be asleep; ignore.
  }
}

saveButton.addEventListener('click', async () => {
  const url = normalizeUrl(input.value);
  if (!url) {
    setStatus('Enter a valid URL, for example http://localhost:3000', 'bad');
    return;
  }

  try {
    await chrome.storage.local.set({ cortexUrl: url });
    input.value = url;

    try {
      await chrome.runtime.sendMessage({ type: 'set-cortex-url', url });
    } catch (e) {
      // Background asleep - value is still saved in storage.
    }

    setStatus(`Paired with ${url}\nOpen the LMS tab to sync.`, 'ok');
  } catch (e) {
    setStatus('Failed to save. Check extension permissions.', 'bad');
  }
});

loadSaved();
