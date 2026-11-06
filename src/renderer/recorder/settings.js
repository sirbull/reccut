import { computed, effect, signal } from '@preact/signals';
import { FLAT_MIX, normalizeMix } from './mixer.js';
import { RECORDING_AUDIO_FORMATS, recordingVideoFormat } from '../../shared/recordingFormats.cjs';
import { SIDE_LAYOUT } from '../../shared/model.js';

const isMac = window.api.platform === 'darwin';

export const MODIFIERS = isMac
  ? [
      { value: 'Control+Alt', label: 'Ctrl + Option + 1 to 7', short: '⌃⌥' },
      { value: 'Command+Alt', label: 'Cmd + Option + 1 to 7', short: '⌘⌥' },
      { value: 'Command+Shift', label: 'Cmd + Shift + 1 to 7', short: '⌘⇧' },
    ]
  : [
      { value: 'Control+Shift', label: 'Ctrl + Shift + 1 to 7', short: 'Ctrl+Shift+' },
      { value: 'Control+Alt', label: 'Ctrl + Alt + 1 to 7', short: 'Ctrl+Alt+' },
    ];

export const CAMERA_HEIGHTS = [
  { value: 720, label: '720p' },
  { value: 1080, label: '1080p' },
  { value: 1440, label: '1440p' },
  { value: 2160, label: '4K' },
];
export const CAMERA_FPS = [24, 25, 30, 50, 60].map((fps) => ({ value: fps, label: `${fps} fps` }));
export const MIC_CHANNELS = [
  { value: 'stereo', label: 'Stereo' },
  { value: 'mono', label: 'Mono (both inputs mixed)' },
  { value: 'left', label: 'Left only (input 1)' },
  { value: 'right', label: 'Right only (input 2)' },
];

// Keeps the user's choice through unplugging: another device stands in while it
// is gone, and it comes back when it returns, except during a recording.
// ponytail: matches on deviceId, which can change on another USB port. Match on label too if that bites.
export function pickDevice(id, wanted, devices, busy = false) {
  const connected = (x) => devices.some((d) => d.id === x);
  if (!busy && wanted && connected(wanted)) return { id: wanted, wanted };
  if (id === null || (id && !connected(id))) return { id: devices[0]?.id ?? '', wanted: wanted || id || '' };
  return { id, wanted };
}

export const LAYOUTS = [
  { n: 1, label: 'Camera', cls: 'full-cam' },
  { n: 2, label: 'Screen', cls: 'screen' },
  { n: 3, label: 'Top left', cls: 'screen', cam: 'tl' },
  { n: 4, label: 'Top right', cls: 'screen', cam: 'tr' },
  { n: 5, label: 'Bottom left', cls: 'screen', cam: 'bl' },
  { n: 6, label: 'Bottom right', cls: 'screen', cam: 'br' },
  { n: 7, label: 'Camera left', cls: 'screen', cam: 'side left' },
  // ponytail: 8 is the pause shortcut, so this layout is click only.
  { n: 8, label: 'Camera right', cls: 'screen', cam: 'side right', noKey: true },
];

const DEFAULTS = {
  screenId: null,
  cameraId: null,
  micId: null,
  // Siste valg brukeren gjorde. Enheten tas i bruk igjen når den kobles til på nytt.
  cameraWanted: null,
  micWanted: null,
  cameraHeight: 1080,
  cameraFps: 30,
  // Et lydkort legger inngang 1 på venstre kanal og inngang 2 på høyre.
  micChannel: 'stereo',
  // Millisekunder. Et HDMI-kamera ligger etter mikrofonen.
  micDelay: 0,
  systemAudio: false,
  noiseSuppression: true,
  micMixer: { ...FLAT_MIX },
  layout: 6,
  pipSize: 'medium',
  pipShape: 'rect',
  // Malen for kamera ved siden av skjermen, også når oppsettet velges under opptak.
  sideSize: SIDE_LAYOUT.size,
  sideShape: SIDE_LAYOUT.shape,
  showPipOnScreen: false,
  mirror: false,
  fps: 30,
  videoFormat: 'mp4',
  audioFormat: 'auto',
  hideFromCapture: false,
  captureVisibilityVersion: 1,
  modifier: MODIFIERS[0].value,
  backgroundShortcuts: false,
  // Needs the Keystroke Add-on, which the user installs separately.
  showKeys: false,
  cursorZoom: true,
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
    if (!['circle', 'square', 'rect', 'portrait'].includes(s.pipShape)) s.pipShape = 'rect';
    if (!['circle', 'square', 'rect', 'portrait', 'tall'].includes(s.sideShape)) s.sideShape = SIDE_LAYOUT.shape;
    if (!MODIFIERS.some((m) => m.value === s.modifier)) s.modifier = MODIFIERS[0].value;
    s.micMixer = normalizeMix(s.micMixer);
    s.videoFormat = recordingVideoFormat(s.videoFormat).value;
    if (s.audioFormat !== 'auto' && !RECORDING_AUDIO_FORMATS.some((f) => f.value === s.audioFormat)) s.audioFormat = 'auto';
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
