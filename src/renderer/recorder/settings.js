import { computed, effect, signal } from '@preact/signals';
import { FLAT_MIX, normalizeMix } from './mixer.js';

const isMac = window.api.platform === 'darwin';

export const MODIFIERS = isMac
  ? [
      { value: 'Control+Alt', label: 'Ctrl + Option + 1 to 6', short: '⌃⌥' },
      { value: 'Command+Alt', label: 'Cmd + Option + 1 to 6', short: '⌘⌥' },
      { value: 'Command+Shift', label: 'Cmd + Shift + 1 to 6', short: '⌘⇧' },
    ]
  : [
      { value: 'Control+Shift', label: 'Ctrl + Shift + 1 to 6', short: 'Ctrl+Shift+' },
      { value: 'Control+Alt', label: 'Ctrl + Alt + 1 to 6', short: 'Ctrl+Alt+' },
    ];

const DEFAULTS = {
  screenId: null,
  cameraId: null,
  micId: null,
  systemAudio: false,
  noiseSuppression: true,
  micMixer: { ...FLAT_MIX },
  layout: 6,
  pipSize: 'medium',
  pipShape: 'rect',
  showPipOnScreen: false,
  mirror: false,
  fps: 30,
  hideFromCapture: false,
  captureVisibilityVersion: 1,
  modifier: MODIFIERS[0].value,
  backgroundShortcuts: false,
  showKeys: true,
  cursorZoom: true,
  showClicks: false,
  zoomKey: isMac ? 'MetaRight' : 'CtrlRight',
  autoRender: true,
  // Opptaksområde: hele skjermen eller et område (andeler av skjermen).
  areaMode: 'full',
  area: null,
  countdown: 3,
  // Reccut legges bort mens skjermen tas opp, og kontrollinjen vises over andre programmer.
  minimizeOnRecord: true,
  showControls: true,
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem('settings') || '{}');
    const s = { ...DEFAULTS, ...saved };
    // Older releases persisted the hidden-by-default value with every settings
    // change. Migrate once so existing installations get the visible default too;
    // explicit choices made after this migration remain saved.
    const migrateCaptureVisibility = saved.captureVisibilityVersion !== 1;
    if (migrateCaptureVisibility) {
      s.hideFromCapture = false;
      s.captureVisibilityVersion = 1;
    }
    if (!['circle', 'square', 'rect'].includes(s.pipShape)) s.pipShape = 'rect';
    if (!MODIFIERS.some((m) => m.value === s.modifier)) s.modifier = MODIFIERS[0].value;
    s.micMixer = normalizeMix(s.micMixer);
    if (migrateCaptureVisibility) {
      try { localStorage.setItem('settings', JSON.stringify(s)); } catch {}
    }
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = signal(load());

// Gjelder hele appen, også når opptaksrommet ikke er åpent.
const captureHidden = computed(() => settings.value.hideFromCapture);
effect(() => {
  window.api.hideFromCapture(captureHidden.value);
});

export function saveSettings(patch) {
  if ('micMixer' in patch) patch = { ...patch, micMixer: normalizeMix(patch.micMixer) };
  settings.value = { ...settings.value, ...patch };
  try {
    localStorage.setItem('settings', JSON.stringify(settings.value));
  } catch {}
}

export function modifierInfo() {
  return MODIFIERS.find((m) => m.value === settings.value.modifier) || MODIFIERS[0];
}
