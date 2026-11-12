import { signal } from '@preact/signals';

const api = window.api;
export const tts = signal({ installed: false, downloading: false, progress: 0, sizeBytes: 0 });
export const refreshTts = () => api.ttsStatus().then((state) => (tts.value = state)).catch(() => {});
api.onTtsChanged?.((state) => (tts.value = state));

export const voicePackagesOpen = signal(null);
export const voicePackageRequests = signal(new Set());
let checking = false;
export function openVoicePackages({ lang = null, reason = '', firstRun = false } = {}) {
  voicePackagesOpen.value = { lang, reason, firstRun };
  api.voicePackagesMarkAsked().catch(() => {});
}
export async function maybeAskVoicePackages() {
  if (checking || voicePackagesOpen.value) return;
  checking = true;
  try {
    const state = await api.voicePackagesStatus();
    if (!state.voicePackagesAsked && !voicePackagesOpen.value) openVoicePackages({ firstRun: true });
  } catch {}
  finally { checking = false; }
}
