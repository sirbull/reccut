// Innstillinger for hele appen (Preferences, Cmd ,).
import { computed, signal } from '@preact/signals';

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
  // Tom streng følger systemets lydutgang.
  audioOutputId: '',
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
  designLayersHeight: null,
  designPanelWidth: null,
  designSidebarWidth: null,
  designRulers: false,
  designGrid: false,
  designSmartGuides: true,
  designStyles: [],
  designColors: [],
  designBrandFonts: {},
  designPalettes: [],
  designFontPairs: [],
  designElements: [],
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

// Utgangene som er koblet til nå. Er den valgte borte, spilles lyden i systemets utgang til den er tilbake.
export const audioOutputs = signal([]);
export const audioSink = computed(() => {
  const id = prefs.value.audioOutputId;
  return audioOutputs.value.some((o) => o.id === id) ? id : '';
});

export function setPrefs(patch) {
  prefs.value = { ...prefs.value, ...patch };
  try {
    localStorage.setItem('prefs', JSON.stringify(prefs.value));
  } catch {}
}
