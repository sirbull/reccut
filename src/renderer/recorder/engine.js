// Opptaksmotor: kilder, live forhåndsvisning og opptak til separate filer.
import { signal } from '@preact/signals';
import { drawCamera, drawCursor, drawInputOverlay, drawKeys } from '../../shared/render.js';
import { KEY_LIFE, LAYOUT_ANIM, PAD_BUTTONS, easeOutCubic, isCorner, lerpRect, pipRect, pressLabel, screenArea, ZOOM_RAMP, clamp } from '../../shared/model.js';
import { containRect } from '../../shared/follow.js';
import { pickDevice, settings, saveSettings } from './settings.js';
import { audioOutputs, audioSink } from '../prefs.js';
import { recordingAudioChoice, recordingPlan, recordingVideoFormat } from '../../shared/recordingFormats.cjs';
import { projectFolders } from '../editor/store.js';
import { createMicMixer, EMPTY_LEVELS, normalizeMix } from './mixer.js';

const api = window.api;

export const screens = signal([]);
export const cameras = signal([]);
export const mics = signal([]);
// Det kameraet faktisk leverer. Over HDMI er det kameraet som bestemmer formatet.
export const cameraInfo = signal(null);
export const recording = signal(false);
export const elapsed = signal(0);
export const level = signal(0);
export const micLevels = signal(EMPTY_LEVELS);
export const canvasSize = signal({ w: 1920, h: 1080 });
export const notice = signal(null);
export const finishing = signal(false);
// Opptaksområde: redigeres i forhåndsvisningen (hele skjermen vises da), og nedtelling før start.
export const editingArea = signal(false);
export const countdown = signal(0);
export const paused = signal(false);
// Mikrofonen: 'none', 'silent', 'quiet', 'good' eller 'loud' (overstyrt), ut fra de siste sekundene.
export const micStatus = signal('none');
let roomActive = false;
let sourcesReady = false;

let screenStream = null;
let cameraStream = null;
let micStream = null;
let micMixer = null;
let cameraRequest = 0;
let micRequest = 0;
const screenVideo = makeVideo();
const cameraVideo = makeVideo();

let canvas = null;
let ctx = null;
let previewScale = 1;

const audioCtx = new AudioContext();

export function setMicMix(patch) {
  const mix = normalizeMix({ ...settings.value.micMixer, ...patch });
  saveSettings({ micMixer: mix });
  micMixer?.set(mix);
}

// Capture and microphone tests always use the processed signal, never the raw input.
function micTracks() {
  return micMixer?.stream.getAudioTracks() || [];
}

function makeVideo() {
  const v = document.createElement('video');
  v.muted = true;
  v.autoplay = true;
  v.playsInline = true;
  v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0';
  document.body.appendChild(v);
  return v;
}

const stop = (s) => s?.getTracks().forEach((t) => t.stop());
const ready = (v) => v.readyState >= 2 && v.videoWidth > 0;

// Området som tas opp, i andeler av skjermen, eller null for hele skjermen.
// Er kilden et enkelt programvindu (ikke en hel skjerm)?
export function isWindowSource() {
  return String(settings.value.screenId || '').startsWith('window:');
}

export function activeArea() {
  const s = settings.value;
  if (s.areaMode !== 'area' || !s.area || !s.screenId || isWindowSource()) return null;
  const a = s.area;
  const x = clamp(a.x, 0, 0.98);
  const y = clamp(a.y, 0, 0.98);
  return { x, y, w: clamp(a.w, 0.02, 1 - x), h: clamp(a.h, 0.02, 1 - y) };
}

// Området i skjermens piksler, med partall (videokoding krever det).
function areaPixels(a, vw, vh) {
  const even = (v) => Math.floor(v / 2) * 2;
  const x = Math.max(0, Math.min(even(a.x * vw), vw - 2));
  const y = Math.max(0, Math.min(even(a.y * vh), vh - 2));
  const w = Math.max(2, Math.min(even(a.w * vw + 1), even(vw - x)));
  const h = Math.max(2, Math.min(even(a.h * vh + 1), even(vh - y)));
  return { x, y, w, h };
}

// Størrelsen opptaket får med området, i piksler.
export function areaOutputSize() {
  const a = activeArea();
  if (!a || !screenVideo.videoWidth) return null;
  const r = areaPixels(a, screenVideo.videoWidth, screenVideo.videoHeight);
  return { w: r.w, h: r.h };
}

export function setArea(area, mode = 'area') {
  saveSettings({ area, areaMode: area ? mode : 'full' });
  api.setCaptureArea(activeArea());
  updateSize();
  syncFrame();
}

export function setAreaMode(mode) {
  saveSettings({ areaMode: mode });
  api.setCaptureArea(activeArea());
  if (mode === 'full') editingArea.value = false;
  updateSize();
  syncFrame();
}

export function setEditingArea(on) {
  editingArea.value = on;
  updateSize();
}

// Velg området rett på skjermen (Reccut skjules imens).
export async function pickAreaOnScreen() {
  const info = screens.value.find((x) => x.id === settings.value.screenId);
  if (!info) return;
  api.areaFrame({ visible: false });
  const r = await api.selectArea({ displayId: info.displayId, current: settings.value.area });
  if (r === 'full') setAreaMode('full');
  else if (r) setArea(r);
  syncFrame();
}

// Rammen på skjermen rundt området: synlig i Record-rommet og under opptak.
export function syncFrame() {
  const a = activeArea();
  const info = screens.value.find((x) => x.id === settings.value.screenId);
  const visible = Boolean(a && info && (roomActive || recording.value || countdown.value));
  api.areaFrame({ visible, displayId: info?.displayId, area: a, recording: recording.value, countdown: countdown.value });
}

/* Kilder */

// Ad hoc-signerte versjoner får ny identitet i macOS, så en gammel tillatelse kan stå på uten å virke.
const screenPermissionNotice = () => ({
  kind: 'screen',
  text: 'Reccut is not allowed to record the screen. Allow it in System Settings and restart the app. If Reccut is already on, remove it with the minus button and add it again.',
  action: 'Open Settings',
  onAction: () => api.openPermissionSettings('screen'),
});

export async function refreshScreens() {
  try {
    screens.value = await api.listScreens();
  } catch {
    screens.value = [];
  }
  if (!screens.value.some((s) => s.id === settings.value.screenId)) {
    saveSettings({ screenId: screens.value[0]?.id ?? '' });
  }
  // Uten tillatelse er listen tom, og useScreen stopper før den kan varsle.
  if (!screens.value.length && api.platform === 'darwin') notice.value = screenPermissionNotice();
  else if (screens.value.length && notice.value?.kind === 'screen') notice.value = null;
}

export async function refreshDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameras.value = devices.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  mics.value = devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  audioOutputs.value = devices
    .filter((d) => d.kind === 'audiooutput' && !['default', 'communications'].includes(d.deviceId))
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` }));
  const s = settings.value;
  const busy = recording.value || countdown.value > 0 || finishing.value;
  const camera = pickDevice(s.cameraId, s.cameraWanted, cameras.value, busy);
  const mic = pickDevice(s.micId, s.micWanted, mics.value, busy);
  const patch = {};
  if (camera.id !== s.cameraId) Object.assign(patch, { cameraId: camera.id, cameraWanted: camera.wanted });
  if (mic.id !== s.micId) Object.assign(patch, { micId: mic.id, micWanted: mic.wanted });
  if (Object.keys(patch).length) saveSettings(patch);
  return patch;
}

export function chooseCamera(id) {
  saveSettings({ cameraId: id, cameraWanted: id });
  useCamera();
}

export function chooseMic(id) {
  saveSettings({ micId: id, micWanted: id });
  useMic();
}

export async function useScreen() {
  const s = settings.value;
  stop(screenStream);
  screenStream = null;
  screenVideo.srcObject = null;
  if (!s.screenId) return updateSize();
  const info = screens.value.find((x) => x.id === s.screenId);
  try {
    await api.selectScreen({ id: s.screenId, displayId: info?.displayId, systemAudio: s.systemAudio, area: activeArea() });
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      audio: s.systemAudio,
      video: {
        width: { ideal: info?.width ?? 3840 },
        height: { ideal: info?.height ?? 2160 },
        frameRate: { ideal: s.fps, max: s.fps },
      },
    });
    screenVideo.srcObject = new MediaStream(screenStream.getVideoTracks());
    await screenVideo.play().catch(() => {});
    if (s.systemAudio && !screenStream.getAudioTracks().length) {
      notice.value = { text: 'System audio is not available on this computer. The screen is recorded without it.' };
    } else if (notice.value?.kind === 'screen') notice.value = null;
  } catch (err) {
    console.error(err);
    notice.value =
      api.platform === 'darwin'
        ? screenPermissionNotice()
        : { kind: 'screen', text: 'Could not start screen capture.' };
  }
  updateSize();
}

export async function useCamera() {
  const request = ++cameraRequest;
  const { cameraId: id, cameraHeight: height, cameraFps: fps } = settings.value;
  stop(cameraStream);
  cameraStream = null;
  cameraVideo.srcObject = null;
  cameraInfo.value = null;
  if (!id || (!roomActive && !recording.value)) return updateSize();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: id }, width: { ideal: Math.round(height * 16 / 9) }, height: { ideal: height }, frameRate: { ideal: fps } },
    });
    if (request !== cameraRequest) { stop(stream); return; }
    cameraStream = stream;
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play().catch(() => {});
    const got = stream.getVideoTracks()[0].getSettings();
    cameraInfo.value = `${got.width} × ${got.height}${got.frameRate ? `, ${+got.frameRate.toFixed(2)} fps` : ''}`;
  } catch (err) {
    if (request !== cameraRequest) return;
    console.error(err);
    notice.value = { text: 'Could not start the camera. Check that no other app is using it.' };
  }
  updateSize();
}

export async function useMic() {
  if (recording.value || countdown.value || finishing.value || micTest.value) return;
  releaseMic();
  const request = micRequest;
  const id = settings.value.micId;
  if (!id || !roomActive) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: settings.value.noiseSuppression, autoGainControl: false, channelCount: 2 },
    });
    if (request !== micRequest) { stop(stream); return; }
    micStream = stream;
    micMixer = createMicMixer(audioCtx, stream, settings.value.micMixer, { channel: settings.value.micChannel, delay: settings.value.micDelay });
    await audioCtx.resume();
  } catch (err) {
    if (request !== micRequest) return;
    releaseMic();
    console.error(err);
    notice.value = { text: 'Could not start the microphone.' };
  }
}

function releaseMic() {
  ++micRequest;
  micMixer?.dispose();
  micMixer = null;
  stop(micStream);
  micStream = null;
  peaks.length = 0;
  micLevels.value = EMPTY_LEVELS;
  level.value = 0;
  micStatus.value = 'none';
}

function releaseDevices() {
  cancelMicTest?.();
  ++cameraRequest;
  stop(cameraStream);
  cameraStream = null;
  cameraVideo.srcObject = null;
  cameraInfo.value = null;
  releaseMic();
}

function updateSize() {
  if (recording.value) return;
  const apply = () => {
    let w = 1920;
    let h = 1080;
    const a = activeArea();
    if (screenStream && screenVideo.videoWidth && a && !editingArea.value) {
      const r = areaPixels(a, screenVideo.videoWidth, screenVideo.videoHeight);
      [w, h] = [r.w, r.h];
    } else if (screenStream && screenVideo.videoWidth) [w, h] = [screenVideo.videoWidth, screenVideo.videoHeight];
    else if (cameraStream && cameraVideo.videoWidth) [w, h] = [cameraVideo.videoWidth, cameraVideo.videoHeight];
    w -= w % 2;
    h -= h % 2;
    canvasSize.value = { w, h };
    if (canvas) {
      previewScale = Math.min(1, 1920 / w);
      canvas.width = Math.round(w * previewScale);
      canvas.height = Math.round(h * previewScale);
      cam = null;
    }
  };
  apply();
  for (const v of [screenVideo, cameraVideo]) {
    if (v.srcObject && !v.videoWidth) v.addEventListener('loadedmetadata', apply, { once: true });
  }
}
screenVideo.addEventListener('resize', updateSize);
cameraVideo.addEventListener('resize', updateSize);

/* Live forhåndsvisning med samme oppsett og overlegg som i den ferdige videoen. */

let cam = null;
let camFrom = null;
let camTo = null;
let camAnimStart = 0;
let scr = null;
let scrFrom = null;
let scrTo = null;
let lastCorner = 6;
let liveZoom = { on: false, at: 0, off: 0 };
let liveCursor = null;
let liveKeys = [];
let inputFrame = null;

// Pekerbevegelse skal ikke vente på neste 30 Hz videobilde. Samle hendelser
// frem til neste skjermoppdatering, og animer størrelsen videre også i ro.
function scheduleInputDraw() {
  if (inputFrame !== null || (!roomActive && !recording.value)) return;
  inputFrame = requestAnimationFrame(() => {
    inputFrame = null;
    draw();
    if (liveZoom.on || (liveZoom.off && performance.now() - liveZoom.off < ZOOM_RAMP * 1000)) scheduleInputDraw();
  });
}
let pipCanvas = null;
let lastPipFrame = 0;
let pipVisible = false;
let lastPipMotion = '';

// Lite kamerabilde til vinduet over andre programmer, uavhengig av hovedvinduets synlighet.
function syncPipPreview(now, force = false) {
  const s = settings.value;
  const visible = s.showPipOnScreen && (roomActive || recording.value || countdown.value) &&
    !editingArea.value && !isWindowSource() && !document.hasFocus() &&
    ready(screenVideo) && ready(cameraVideo) && isCorner(effectiveLayout()) && cam?.a > 0.01;
  if (!visible) {
    if (pipVisible) api.recPipPreview(null);
    pipVisible = false;
    return;
  }
  const info = screens.value.find((x) => x.id === s.screenId);
  if (!info) {
    if (pipVisible) api.recPipPreview(null);
    pipVisible = false;
    return;
  }
  const { w: W, h: H } = canvasSize.value;
  const normalize = (r) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H });
  let area = activeArea();
  if (area) {
    const a = areaPixels(area, screenVideo.videoWidth, screenVideo.videoHeight);
    area = { x: a.x / screenVideo.videoWidth, y: a.y / screenVideo.videoHeight, w: a.w / screenVideo.videoWidth, h: a.h / screenVideo.videoHeight };
  }
  const motion = { from: normalize(camFrom), to: normalize(camTo), start: performance.timeOrigin + camAnimStart, duration: LAYOUT_ANIM * 1000 };
  const motionKey = JSON.stringify([info.displayId, area, motion]);
  // Flytting sendes straks; kamerabildene komprimeres sjeldnere og styrer ikke animasjonstakten.
  const needsImage = force || !pipVisible || now - lastPipFrame >= 1000 / 12;
  if (!needsImage && motionKey === lastPipMotion) return;
  let image = null;
  if (needsImage) {
    lastPipFrame = now;
    if (!pipCanvas) pipCanvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / cam.w);
    const w = Math.max(1, Math.round(cam.w * scale));
    const h = Math.max(1, Math.round(cam.h * scale));
    if (pipCanvas.width !== w || pipCanvas.height !== h) {
      pipCanvas.width = w;
      pipCanvas.height = h;
    }
    const g = pipCanvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    // Samme beskjæring, speiling og form som i opptakets forhåndsvisning.
    const sx = w / cam.w;
    const sy = h / cam.h;
    g.save();
    g.scale(sx, sy);
    g.globalAlpha = cam.a;
    drawCamera(g, cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight, { ...cam, x: 0, y: 0, a: 1 }, s.mirror, false);
    g.restore();
    image = pipCanvas.toDataURL('image/webp', 0.8);
  }
  api.recPipPreview({
    screenId: s.screenId,
    displayId: info.displayId,
    area,
    rect: normalize(cam),
    motion,
    image,
  });
  lastPipMotion = motionKey;
  pipVisible = true;
}

export function attachCanvas(el) {
  canvas = el;
  ctx = el ? el.getContext('2d', { alpha: false }) : null;
  updateSize();
}

export function setLayout(n) {
  if (isCorner(n)) lastCorner = n;
  saveSettings({ layout: n });
  if (recording.value) layouts.push([round((Date.now() - t0) / 1000), n]);
}

/* Pause og fortsett. Pausene lagres med tid, og hendelsene i dem fjernes når opptaket lagres. */
let pauses = [];

function recordedSeconds() {
  const now = Date.now();
  let p = 0;
  for (const [a, b] of pauses) p += (b ?? now) - a;
  return (now - t0 - p) / 1000;
}

export function togglePause() {
  if (!recording.value) return;
  const now = Date.now();
  if (paused.value) {
    for (const r of recorders) if (r.rec.state === 'paused') r.rec.resume();
    const last = pauses[pauses.length - 1];
    if (last && last[1] == null) last[1] = now;
    paused.value = false;
  } else {
    for (const r of recorders) if (r.rec.state === 'recording') r.rec.pause();
    pauses.push([now, null]);
    paused.value = true;
  }
  sendState();
}

// Det som er kjent om opptaket så langt (til lagring og redning etter krasj).
function currentMeta() {
  const s = settings.value;
  const meta = {
    t0,
    fps: s.fps,
    layouts,
    pauses: pauses.map(([a, b]) => [round((a - t0) / 1000), round(((b ?? Date.now()) - t0) / 1000)]),
    ...(activeArea() ? { area: activeArea() } : {}),
    ...(isWindowSource() ? { source: 'window' } : {}),
    pip: { size: s.pipSize, shape: s.pipShape, mirror: s.mirror, sideSize: s.sideSize, sideShape: s.sideShape },
    // Pekerzoom og klikk følger skjermen, så de er av når bare et vindu tas opp.
    overlays: {
      keys: Boolean(s.showKeys && s.inputPills && (keystrokesRunning.value || s.inputPad)),
      cursorZoom: s.cursorZoom && !isWindowSource(),
      ...(s.showKeys ? { inputs: { on: s.inputOverlay, keyboard: s.inputKeyboard, mouse: s.inputMouse, pad: s.inputPad, x: s.inputX, y: s.inputY } } : {}),
    },
  };
  for (const r of recorders) {
    const isCam = r.name === 'camera';
    meta[r.name] = {
      raw: r.raw,
      file: r.file,
      videoFormat: r.plan.videoFormat,
      audioFormat: r.plan.audioFormat,
      offset: round(Math.max(0, (r.startedAt || t0) - t0) / 1000),
      hasVideo: isCam ? Boolean(cameraStream) : true,
      hasAudio: r.rec.stream.getAudioTracks().length > 0,
    };
  }
  return meta;
}

function effectiveLayout() {
  const hasScreen = ready(screenVideo);
  const hasCamera = ready(cameraVideo);
  if (!hasCamera) return 2;
  if (!hasScreen) return 1;
  return settings.value.layout;
}

function draw() {
  if (!ctx) return;
  const { w: W, h: H } = canvasSize.value;
  const s = settings.value;
  const now = performance.now();
  ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const hasScreen = ready(screenVideo);
  const hasCamera = ready(cameraVideo);
  const layout = effectiveLayout();
  const side = { size: s.sideSize, shape: s.sideShape };
  const target = pipRect(layout, lastCorner, W, H, s.pipSize, s.pipShape, side);
  const scrTarget = screenArea(layout, W, H, side);
  // Fortsett fra posisjonen akkurat nå, også når en ny snarvei avbryter en pågående flytting.
  const t = Math.min(1, (now - camAnimStart) / (LAYOUT_ANIM * 1000));
  if (cam) {
    cam = t >= 1 ? camTo : lerpRect(camFrom, camTo, easeOutCubic(t));
    scr = t >= 1 ? scrTo : lerpRect(scrFrom, scrTo, easeOutCubic(t));
  }
  if (!cam) {
    cam = camFrom = camTo = target;
    scr = scrFrom = scrTo = scrTarget;
  } else if (['x', 'y', 'w', 'h', 'r', 'a'].some((k) => Math.abs(target[k] - camTo[k]) > 0.5 || (k === 'a' && target.a !== camTo.a) || Math.abs(scrTarget[k] - scrTo[k]) > 0.5)) {
    camFrom = { ...cam };
    camTo = target;
    scrFrom = { ...scr };
    scrTo = scrTarget;
    camAnimStart = now;
  }

  let rect = { x: 0, y: 0, w: W, h: H };
  const area = activeArea();
  const editing = editingArea.value && area;
  // Skjermen passes inn i sitt område: hele bildet, eller plassen ved siden av kameraet.
  const fit = (w, h, a) => {
    const r = containRect(w, h, a.w, a.h);
    return { ...r, x: r.x + a.x, y: r.y + a.y };
  };
  if (hasScreen && area && !editing) {
    // Bare området: samme utsnitt som opptaket får.
    const r = areaPixels(area, screenVideo.videoWidth, screenVideo.videoHeight);
    rect = fit(r.w, r.h, scr);
    ctx.drawImage(screenVideo, r.x, r.y, r.w, r.h, rect.x, rect.y, rect.w, rect.h);
  }
  if (hasScreen && (!area || editing)) {
    rect = fit(screenVideo.videoWidth, screenVideo.videoHeight, editing ? rect : scr);
    ctx.drawImage(screenVideo, rect.x, rect.y, rect.w, rect.h);
  }
  if (hasScreen && !editing) {
    if (s.cursorZoom && liveCursor) {
      const up = liveZoom.on ? clamp((now - liveZoom.at) / (ZOOM_RAMP * 1000), 0, 1) : 0;
      const down = liveZoom.on ? 1 : 1 - clamp((now - liveZoom.off) / (ZOOM_RAMP * 1000), 0, 1);
      const p = liveZoom.on ? easeOutCubic(up) : easeOutCubic(down) * (liveZoom.off ? 1 : 0);
      if (p > 0.01) drawCursor(ctx, rect.x + liveCursor[0] * rect.w, rect.y + liveCursor[1] * rect.h, p, rect.h);
    }
  }
  if (hasCamera && cam.a > 0.01 && !editing) {
    ctx.save();
    ctx.globalAlpha = cam.a;
    drawCamera(ctx, cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight, cam, s.mirror, cam.h < H * 0.9);
    ctx.restore();
  }
  if (s.showKeys && s.inputPills) {
    const nowS = now / 1000;
    liveKeys = liveKeys.filter((k) => nowS - k.t < KEY_LIFE);
    drawKeys(ctx, liveKeys.slice(-3).map((k) => ({ label: k.label, age: nowS - k.t })), W, H);
  }
  // Vises også før opptaket, så det kan plasseres.
  if (s.showKeys && s.inputOverlay) drawInputOverlay(ctx, { keyboard: s.inputKeyboard, mouse: s.inputMouse, pad: s.inputPad, held: liveHeld, stick: padStick, x: s.inputX, y: s.inputY }, W, H);
  if (!hasScreen && !hasCamera) {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6e6e73';
    ctx.font = `${Math.round(W / 45)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Choose a screen or camera', W / 2, H / 2);
    ctx.textAlign = 'left';
  }
}

// En Worker gir jevn takt også når vinduet ikke er synlig.
const ticker = new Worker(
  URL.createObjectURL(new Blob(['let id;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),1000/e.data)}'], { type: 'text/javascript' }))
);
// Toppnivåene de siste tre sekundene, for å si om mikrofonen er stille, svak, god eller overstyrt.
const peaks = [];
let lastState = 0;
let lastCheckpoint = 0;
ticker.onmessage = () => {
  draw();
  const now = performance.now();
  pollPad(now);
  syncPipPreview(now);
  if (micMixer) {
    const levels = micMixer.read(now);
    micLevels.value = levels;
    level.value = clamp((levels.output + 60) / 60, 0, 1);
    peaks.push([now, levels.output, levels.input]);
    while (peaks.length && now - peaks[0][0] > 3000) peaks.shift();
    const max = Math.max(...peaks.map((x) => x[1]));
    const raw = Math.max(...peaks.map((x) => x[2]));
    micStatus.value = max > -0.5 || raw > -0.5 ? 'loud' : max < -60 ? 'silent' : max < -32 ? 'quiet' : 'good';
  } else {
    level.value = 0;
    micStatus.value = 'none';
  }
  if (recording.value) elapsed.value = recordedSeconds();
  // Status til ikonet i menylinjen og kontrollinjen, fire ganger i sekundet.
  if ((recording.value || countdown.value) && now - lastState > 250) {
    lastState = now;
    sendState();
  }
  // Mellomlagring for redning etter krasj, hvert femte sekund.
  if (recording.value && now - lastCheckpoint > 5000) {
    lastCheckpoint = now;
    api.recCheckpoint(currentMeta());
  }
};

function sendState() {
  api.recState({ state: recording.value ? (paused.value ? 'paused' : 'recording') : countdown.value ? 'countdown' : 'idle', elapsed: elapsed.value, level: level.value, countdown: countdown.value, keys: keystrokesRunning.value });
}
export function setActive(active) {
  const wasActive = roomActive;
  roomActive = active;
  if (!active && !recording.value && (!finishing.value || recorders.every((r) => r.rec.state === 'inactive'))) {
    if (countdown.value) abortCountdown();
    releaseDevices();
  } else if (active && !wasActive && sourcesReady && !recording.value && !finishing.value) {
    useCamera();
    useMic();
  }
  if (active || recording.value) scheduleInputDraw();
  else if (inputFrame !== null) {
    cancelAnimationFrame(inputFrame);
    inputFrame = null;
  }
  syncFrame();
  syncPipPreview(performance.now(), true);
  ticker.postMessage(active || recording.value ? 30 : 0);
  api.setPolling(active || recording.value);
}

// Keystroke Add-on: installed state, and whether the helper is reading keys right now.
export const keystrokes = signal(null);
export const keystrokesRunning = signal(false);
export async function refreshKeystrokes() {
  try {
    keystrokes.value = await api.keystrokesStatus();
  } catch {
    keystrokes.value = { supported: false };
  }
  return keystrokes.value;
}
api.onKeystrokesRunning((on) => {
  keystrokesRunning.value = Boolean(on);
  if (!on) liveHeld.clear();
  if (!on) liveKeys = [];
  sendState();
});
api.onKeystrokesError((reason) => {
  keystrokesRunning.value = false;
  notice.value = {
    text: reason === 'permission'
      ? 'Keystrokes are not shown: macOS has not allowed Input Monitoring for Reccut. Open Record › Overlays to allow it.'
      : 'Keystrokes are not shown: the Keystroke Add-on could not read the keyboard on this computer.',
  };
});

api.onInput((e) => {
  const now = performance.now();
  if (e.type === 'zoom') {
    liveCursor = [e.x, e.y];
    liveZoom = e.on ? { on: true, at: now, off: 0 } : { on: false, at: liveZoom.at, off: now };
  } else if (e.type === 'cursor') liveCursor = [e.x, e.y];
  else if (e.type === 'key') liveKeys.push({ label: e.label, t: now / 1000 });
  else if (e.type === 'press') livePress(e.name, e.down, now);
  scheduleInputDraw();
});

// Det som er nede akkurat nå, for forhåndsvisningen. Tastatur og mus kommer fra tillegget.
const liveHeld = new Set();
function livePress(name, down, now) {
  const label = down ? pressLabel(name, liveHeld) : null;
  if (label) liveKeys.push({ label, t: now / 1000 });
  if (down) liveHeld.add(name);
  else liveHeld.delete(name);
}

// Kontrolleren leses med Gamepad API, som ikke trenger tillegget.
// Chromium viser en kontroller først når en knapp er trykket.
export const padName = signal('');
let padStick = [0, 0, 0, 0];
function pollPad(now) {
  const s = settings.value;
  const pad = s.showKeys && s.inputPad ? [...navigator.getGamepads()].find((p) => p?.mapping === 'standard') : null;
  padName.value = pad?.id || '';
  if (!pad) return;
  const presses = [];
  PAD_BUTTONS.forEach((name, i) => {
    const down = Boolean(pad.buttons[i]?.pressed);
    if (down === liveHeld.has(name)) return;
    livePress(name, down, now);
    presses.push([name, down]);
  });
  const stick = pad.axes.slice(0, 4).map((v) => (Math.abs(v) < 0.08 ? 0 : Math.round(v * 50) / 50));
  const moved = stick.length === 4 && stick.some((v, i) => v !== padStick[i]);
  if (moved) padStick = stick;
  if (recording.value && (presses.length || moved)) api.recPad(presses, moved ? stick : null);
}

/* Opptak */

let t0 = 0;
let layouts = [];
let recorders = [];

function planForTracks(tracks) {
  const s = settings.value;
  const embedsAudio = Boolean(screenStream?.getAudioTracks().length || (cameraStream && micStream));
  const choice = recordingAudioChoice(s.videoFormat, s.audioFormat, embedsAudio);
  const audioFormat = choice === 'auto' ? (embedsAudio ? recordingVideoFormat(s.videoFormat).audio[0] : 'aac') : choice;
  return recordingPlan({ ...s, audioFormat, hasVideo: tracks.some((t) => t.kind === 'video'), hasAudio: tracks.some((t) => t.kind === 'audio') }, (mime) => MediaRecorder.isTypeSupported(mime));
}

// Skjermbildet beskjæres til området før det tas opp, så resten av skjermen aldri lagres.
// Med MediaStreamTrackProcessor skjer det uten å kopiere bildet; ellers via et lerret.
let cropStop = null;
function croppedTrack(track, area, fps) {
  if (typeof MediaStreamTrackProcessor !== 'undefined' && typeof MediaStreamTrackGenerator !== 'undefined' && typeof VideoFrame !== 'undefined') {
    try {
      const proc = new MediaStreamTrackProcessor({ track });
      const gen = new MediaStreamTrackGenerator({ kind: 'video' });
      const ts = new TransformStream({
        transform(frame, ctl) {
          try {
            const vr = frame.visibleRect || { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight };
            const r = areaPixels(area, vr.width, vr.height);
            ctl.enqueue(new VideoFrame(frame, { visibleRect: { x: vr.x + r.x, y: vr.y + r.y, width: r.w, height: r.h }, displayWidth: r.w, displayHeight: r.h }));
          } catch (err) {
            console.error(err);
          } finally {
            frame.close();
          }
        },
      });
      proc.readable.pipeThrough(ts).pipeTo(gen.writable).catch(() => {});
      cropStop = () => gen.stop();
      return gen;
    } catch (err) {
      console.warn('Zero-copy cropping is unavailable, falling back to canvas', err);
    }
  }
  const vw = screenVideo.videoWidth;
  const vh = screenVideo.videoHeight;
  const r = areaPixels(area, vw, vh);
  const cv = document.createElement('canvas');
  cv.width = r.w;
  cv.height = r.h;
  const g = cv.getContext('2d', { alpha: false });
  const out = cv.captureStream(fps).getVideoTracks()[0];
  let on = true;
  const tick = () => {
    if (!on) return;
    g.drawImage(screenVideo, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    screenVideo.requestVideoFrameCallback(tick);
  };
  screenVideo.requestVideoFrameCallback(tick);
  cropStop = () => {
    on = false;
    out.stop();
  };
  return out;
}

async function startRecorder(name, tracks, bitrate) {
  const plan = planForTracks(tracks);
  const raw = `${name}.raw.${plan.rawExt}`;
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: plan.mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
  const fileId = await api.recOpen(raw);
  const entry = { name, raw, file: `${name}.${plan.ext}`, plan, rec, fileId, chain: Promise.resolve(), startedAt: 0 };
  rec.ondataavailable = (e) => {
    if (!e.data.size) return;
    entry.chain = entry.chain.then(async () => api.recWrite(fileId, new Uint8Array(await e.data.arrayBuffer())));
  };
  entry.stopped = new Promise((resolve) => (rec.onstop = resolve));
  entry.started = new Promise((resolve) => (rec.onstart = () => resolve((entry.startedAt = Date.now()))));
  rec.start(1000);
  return entry;
}

let countdownTimer = null;

export function cancelCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  countdown.value = 0;
  syncFrame();
  sendState();
  if (minimized) {
    minimized = false;
    api.restoreWindow();
  }
}

// Vinduet legges bort under opptak av skjermen, og kommer tilbake når opptaket er lagret.
let minimized = false;

export async function startRecording() {
  if (!roomActive || recording.value || finishing.value || countdown.value) return;
  if (micTest.value) {
    notice.value = { text: 'Wait for the microphone test to finish before recording.' };
    return;
  }
  await audioCtx.resume();
  if (!roomActive) return;
  const s = settings.value;
  if (!screenStream && !cameraStream && !micStream) {
    notice.value = { text: 'Choose at least one source before you start recording.' };
    return;
  }
  // Validate codec support before countdown, hiding the app or opening files.
  if (screenStream) planForTracks(screenStream.getTracks());
  const camTracks = [...(cameraStream?.getVideoTracks() || []), ...micTracks()];
  if (camTracks.length) planForTracks(camTracks);
  editingArea.value = false;
  updateSize();
  // Mikrofonen er helt stille: si fra, men ta opp likevel.
  if (micStream && micStatus.value === 'silent') notice.value = { text: 'The microphone seems to be silent. Check that it is switched on and not muted. Recording anyway.' };
  if (screenStream && s.minimizeOnRecord) {
    minimized = true;
    api.minimizeWindow();
  }
  // Nedtelling: tallene vises i kontrollinjen, i forhåndsvisningen og midt i området på skjermen.
  if (s.countdown > 0) {
    countdown.value = s.countdown;
    syncFrame();
    sendState();
    const go = await new Promise((resolve) => {
      countdownTimer = setInterval(() => {
        countdown.value -= 1;
        syncFrame();
        sendState();
        if (countdown.value <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          resolve(true);
        }
      }, 1000);
      cancelResolve = () => resolve(false);
    });
    cancelResolve = null;
    if (!go) return;
  }
  await beginRecording();
}
let cancelResolve = null;
export function abortCountdown() {
  cancelCountdown();
  cancelResolve?.();
}

async function beginRecording() {
  const s = settings.value;
  t0 = Date.now();
  pauses = [];
  paused.value = false;
  layouts = [[0, effectiveLayout()]];
  // Opptaket lagres i opptaksmappen til det åpne prosjektet.
  // The Keystroke Add-on runs only for this recording, and only when the user turned it on.
  const addonReady = s.showKeys && keystrokes.value?.installed && !keystrokes.value?.damaged;
  await api.recBegin({ t0, base: projectFolders.value?.recordings || null, keys: addonReady ? { shortcuts: s.inputShortcuts, keyboard: s.inputKeyboard, mouse: s.inputMouse, pad: s.inputPad } : null });
  recorders = [];
  const { w, h } = canvasSize.value;
  if (screenStream) {
    const area = activeArea();
    const video = area ? [croppedTrack(screenStream.getVideoTracks()[0], area, s.fps)] : screenStream.getVideoTracks();
    const tracks = [...video, ...screenStream.getAudioTracks()];
    const bitrate = Math.round(clamp(w * h * s.fps * 0.1, 4e6, 60e6));
    recorders.push(await startRecorder('screen', tracks, bitrate));
  }
  const camTracks = [...(cameraStream?.getVideoTracks() || []), ...micTracks()];
  if (camTracks.length) {
    const { width = 1920, height = 1080, frameRate = 30 } = cameraStream?.getVideoTracks()[0]?.getSettings() ?? {};
    recorders.push(await startRecorder('camera', camTracks, Math.round(clamp(width * height * frameRate * 0.1, 8e6, 60e6))));
  }
  recording.value = true;
  elapsed.value = 0;
  setActive(roomActive);
  ticker.postMessage(30);
  api.setPolling(true);
  syncFrame();
  sendState();
  api.recCheckpoint(currentMeta());
}

export async function stopRecording() {
  if (!recording.value) return null;
  if (paused.value) {
    const last = pauses[pauses.length - 1];
    if (last && last[1] == null) last[1] = Date.now();
  }
  const meta = currentMeta();
  recording.value = false;
  paused.value = false;
  finishing.value = true;
  api.recStopping();
  sendState();
  try {
    for (const r of recorders) if (r.rec.state !== 'inactive') r.rec.stop();
    await Promise.all(recorders.map((r) => r.stopped));
    if (!roomActive) releaseDevices();
    cropStop?.();
    cropStop = null;
    syncFrame();
    for (const r of recorders) {
      await r.chain;
      await api.recClose(r.fileId);
    }
    delete meta.t0;
    const result = await api.recFinish(meta);
    if (result.warnings?.length) notice.value = { text: result.warnings.join('\n') };
    return result.dir;
  } finally {
    finishing.value = false;
    recorders = [];
    setActive(roomActive);
    if (roomActive && !cameraStream && !micStream) {
      useCamera();
      useMic();
    }
    if (minimized) {
      minimized = false;
      api.restoreWindow();
    }
  }
}

/* Test av mikrofonen: fire sekunder opptak som spilles av med en gang. */
export const micTest = signal(null); // 'recording' | 'playing' | null
let cancelMicTest = null;
export async function testMic() {
  if (!micMixer || micTest.value || recording.value || countdown.value || finishing.value) return;
  micTest.value = 'recording';
  let url;
  let rec;
  let playback;
  let cancelled = false;
  let finishPlayback;
  cancelMicTest = () => {
    cancelled = true;
    if (rec && rec.state !== 'inactive') rec.stop();
    playback?.pause();
    finishPlayback?.();
  };
  try {
    await audioCtx.resume();
    if (cancelled) return;
    const { mimeType: mime } = recordingPlan({ hasVideo: false, hasAudio: true, audioFormat: 'opus' }, (m) => MediaRecorder.isTypeSupported(m));
    rec = new MediaRecorder(new MediaStream(micTracks()), { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((resolve, reject) => {
      rec.onstop = resolve;
      rec.onerror = (e) => reject(e.error || new Error('Microphone test failed'));
    });
    const timer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 4000);
    try {
      rec.start();
      await stopped;
    } finally { clearTimeout(timer); }
    if (cancelled) return;
    micTest.value = 'playing';
    url = URL.createObjectURL(new Blob(chunks, { type: mime }));
    playback = new Audio(url);
    await playback.setSinkId(audioSink.value).catch(() => {});
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 6000);
      const done = () => { clearTimeout(timeout); resolve(); };
      finishPlayback = done;
      playback.onended = done;
      playback.onerror = done;
      playback.play().catch(done);
    });
  } catch (err) {
    if (!cancelled) notice.value = { text: `Could not test the microphone: ${err.message}` };
  } finally {
    if (rec && rec.state !== 'inactive') rec.stop();
    playback?.pause();
    if (url) URL.revokeObjectURL(url);
    cancelMicTest = null;
    micTest.value = null;
    if (roomActive && !micMixer) useMic();
  }
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}

export async function initSources() {
  await api.requestPermissions();
  if (roomActive) {
    try {
      stop(await navigator.mediaDevices.getUserMedia({ audio: true, video: true }));
    } catch {
      if (roomActive) {
        try {
          stop(await navigator.mediaDevices.getUserMedia({ audio: true }));
        } catch {}
      }
    }
  }
  await Promise.all([refreshScreens(), refreshDevices()]);
  sourcesReady = true;
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    const systemMic = () => mics.value.find((m) => m.id === 'default')?.label;
    const before = systemMic();
    const patch = await refreshDevices();
    if ('cameraId' in patch) useCamera();
    // 'default' keeps its id when the system switches input, so the stream must be reopened.
    if ('micId' in patch || (settings.value.micId === 'default' && systemMic() !== before)) useMic();
  });
  await Promise.all([useScreen(), useCamera(), useMic()]);
}
