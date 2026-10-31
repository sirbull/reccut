// Nye versjoner fra GitHub. Sjekkes automatisk én gang i døgnet (kan slås av), eller fra
// Help-menyen. Uten nett skjer ingenting, med mindre du sjekker selv.
import { prefs } from './prefs.js';
import { toast } from './ui.jsx';

const api = window.api;
const DAY = 24 * 3600 * 1000;

export async function checkForUpdates(manual = false) {
  if (!manual) {
    if (!prefs.value.checkUpdates) return;
    const last = Number(localStorage.getItem('updateCheckedAt') || 0);
    if (Date.now() - last < DAY) return;
  }
  let r;
  try {
    r = await api.checkUpdates();
    localStorage.setItem('updateCheckedAt', String(Date.now()));
  } catch (err) {
    if (manual) toast('Could not check for updates. Check your internet connection, or try again later.', { kind: 'error', timeout: 6000 });
    return;
  }
  if (!r.newer) {
    if (manual) toast(`You have the latest version (${r.current}).`, { kind: 'success', timeout: 4000 });
    return;
  }
  if (!manual && localStorage.getItem('updateSkip') === r.latest) return;
  const actions = [];
  if (r.asset) actions.push({ label: 'Download', primary: true, onClick: () => download(r.asset) });
  actions.push({ label: 'What is New', onClick: () => api.openExternal?.(r.url) });
  if (!manual) actions.push({ label: 'Skip This Version', onClick: () => localStorage.setItem('updateSkip', r.latest) });
  toast(`Reccut ${r.latest} is available. You have ${r.current}.`, { timeout: 30000, actions });
}

async function download(asset) {
  await api.downloadUpdate(asset);
  toast(`Downloading ${asset.name}. Follow the progress at the top of the window.`, { timeout: 4000 });
}

api.onUpdateDownloaded?.((r) => {
  if (r.error) toast(`The download failed: ${r.error}`, { kind: 'error', timeout: 8000 });
  else toast('The new version is in your Downloads folder. Quit Reccut and open the file to install it. Your projects are kept.', { kind: 'success', timeout: 20000 });
});
