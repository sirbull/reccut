// Innstillinger for hele appen (Preferences, Cmd ,).
import { signal } from '@preact/signals';

export const PREVIEW_RESOLUTIONS = [
  { value: 'quality', label: 'Full', scale: 1 },
  { value: 'performance', label: 'Half', scale: 1 / 2 },
  { value: 'third', label: 'Third', scale: 1 / 3 },
];

export function previewResolutionScale(quality = prefs.value.viewerQuality) {
  return PREVIEW_RESOLUTIONS.find((option) => option.value === quality)?.scale ?? 1;
}

const DEFAULTS = {
  transitionDur: 1,
  transitionAudio: true,
  audioCrossfadeDur: 1,
  stillDur: 4,
  titleDur: 4,
  freezeDur: 2,
  skimming: true,
  audioSkimming: true,
  playbackFromSkimmer: true,
  snapping: true,
  keyframeEasing: 'easeInOut',
  preservePitch: true,
  syncMuteCamera: true,
  // Egne hurtigtaster: { kommando: 'CmdOrCtrl+Shift+B' }, tom streng betyr ingen.
  shortcuts: {},
  designPanel: 'templates',
  designPanelWide: false,
  designStyles: [],
  designColors: [],
  reopenLast: true,
  checkUpdates: true,
  checkOfflineOnFocus: true,
  playheadAfterEdit: false,
  viewerQuality: 'quality',
  editorBrowserVisible: true,
  editorInspectorVisible: true,
  videoScopesVisible: false,
  videoScopesMode: 'all',
  videoScopesGain: 2,
  videoScopesLog: true,
  videoScopesSkin: true,
  loopPlayback: false,
  importAnalyzeStab: false,
  exportDirMode: 'project',
  exportDir: null,
  importCopy: true,
  importOptimize: false,
  syncGroup: true,
  askSequenceSettings: true,
  confirmEffectRemoval: true,
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
