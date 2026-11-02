// Automatic checks stay quiet offline. Manual checks always report the result.
import { signal } from '@preact/signals';
import { prefs } from './prefs.js';
import { toast } from './ui.jsx';

const api = window.api;
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
export const availableUpdate = signal(null);
export const updateDownload = signal(null);
let pendingCheck = null;
let retryAfter = 0;

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export async function checkForUpdates(manual = false) {
  if (!manual) {
    if (!prefs.value.checkUpdates || Date.now() < retryAfter) return;
    const last = Number(read('updateCheckedAt') || 0);
    if (last <= Date.now() && Date.now() - last < DAY) return;
  }
  let r;
  try {
    // The menu and timer share a request when they check at the same time.
    if (!pendingCheck) pendingCheck = api.checkUpdates().finally(() => { pendingCheck = null; });
    r = await pendingCheck;
    write('updateCheckedAt', String(Date.now()));
    retryAfter = 0;
  } catch {
    retryAfter = Date.now() + HOUR;
    if (manual) toast('Could not check for updates. Check your internet connection, or try again later.', { kind: 'error', timeout: 6000 });
    return;
  }
  if (!r.newer) {
    if (manual) toast(`You have the latest version (${r.current}).`, { kind: 'success', timeout: 4000 });
    return;
  }
  if (!manual && read('updateSkip') === r.latest) return;
  availableUpdate.value = r;
}

export function startUpdateChecks(canCheck = () => true) {
  const check = () => { if (canCheck()) void checkForUpdates(); };
  const online = () => { retryAfter = 0; check(); };
  const startup = setTimeout(check, 8000);
  // Also handle apps left open overnight and computers waking from sleep.
  const timer = setInterval(check, 5 * 60 * 1000);
  window.addEventListener('focus', check);
  window.addEventListener('online', online);
  return () => {
    clearTimeout(startup);
    clearInterval(timer);
    window.removeEventListener('focus', check);
    window.removeEventListener('online', online);
  };
}

export function dismissUpdate(skip = false) {
  if (skip && availableUpdate.value) write('updateSkip', availableUpdate.value.latest);
  availableUpdate.value = null;
}

export async function downloadUpdate() {
  const release = availableUpdate.value;
  if (!release?.asset || ['starting', 'downloading'].includes(updateDownload.value?.state)) return;
  updateDownload.value = { state: 'starting', latest: release.latest, progress: 0 };
  try {
    const id = await api.downloadUpdate(release.asset);
    // A tiny download may complete before the IPC response arrives.
    if (updateDownload.value.state === 'starting') updateDownload.value = { ...updateDownload.value, id, state: 'downloading' };
  } catch (err) {
    updateDownload.value = { state: 'error', latest: release.latest, error: err.message };
  }
}

api.onTasks?.((tasks) => {
  const download = updateDownload.value;
  if (!download || download.state !== 'downloading') return;
  const task = tasks.find((t) => t.id === download.id);
  if (!task) return;
  if (task.state === 'canceled') updateDownload.value = { ...download, state: 'error', error: 'Download canceled. You can try again.' };
  else updateDownload.value = { ...download, progress: task.progress };
});

api.onUpdateDownloaded?.((r) => {
  const download = updateDownload.value;
  if (!download || (download.id != null && r.id !== download.id)) return;
  updateDownload.value = { ...download, id: r.id, state: r.error ? 'error' : 'done', error: r.error, file: r.file, progress: r.error ? download.progress : 1 };
  if (!availableUpdate.value) {
    toast(r.error ? `The download failed: ${r.error}` : 'The new version is in Downloads. Quit Reccut and open the installer to update.', { kind: r.error ? 'error' : 'success', timeout: 12000 });
  }
});
