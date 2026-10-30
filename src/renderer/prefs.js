// Innstillinger for hele appen (Preferences, Cmd ,).
import { signal } from '@preact/signals';

const DEFAULTS = {
  transitionDur: 1,
  audioCrossfadeDur: 1,
  stillDur: 4,
  titleDur: 4,
  freezeDur: 2,
  skimming: true,
  audioSkimming: true,
  snapping: true,
  preservePitch: true,
  syncMuteCamera: false,
  syncGroup: true,
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('prefs') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = signal(load());

export function setPrefs(patch) {
  prefs.value = { ...prefs.value, ...patch };
  try {
    localStorage.setItem('prefs', JSON.stringify(prefs.value));
  } catch {}
}
