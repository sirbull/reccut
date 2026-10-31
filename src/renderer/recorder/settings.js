import { computed, effect, signal } from '@preact/signals';

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
  layout: 6,
  pipSize: 'medium',
  pipShape: 'rect',
  showPipOnScreen: false,
  mirror: false,
  fps: 30,
  hideFromCapture: true,
  modifier: MODIFIERS[0].value,
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
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
    if (!['circle', 'square', 'rect'].includes(s.pipShape)) s.pipShape = 'rect';
    if (!MODIFIERS.some((m) => m.value === s.modifier)) s.modifier = MODIFIERS[0].value;
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
  settings.value = { ...settings.value, ...patch };
  try {
    localStorage.setItem('settings', JSON.stringify(settings.value));
  } catch {}
}

export function modifierInfo() {
  return MODIFIERS.find((m) => m.value === settings.value.modifier) || MODIFIERS[0];
}
