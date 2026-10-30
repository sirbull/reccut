// Opptaksmotor: kilder, live forhåndsvisning og opptak til separate filer.
import { signal } from '@preact/signals';
import { drawCamera, drawClicks, drawCursor, drawKeys } from '../../shared/render.js';
import { KEY_LIFE, easeOutCubic, lerpRect, pipRect, ZOOM_RAMP, clamp } from '../../shared/model.js';
import { settings, saveSettings } from './settings.js';

const api = window.api;

export const screens = signal([]);
export const cameras = signal([]);
export const mics = signal([]);
export const recording = signal(false);
export const elapsed = signal(0);
export const level = signal(0);
export const canvasSize = signal({ w: 1920, h: 1080 });
export const notice = signal(null);
export const finishing = signal(false);

let screenStream = null;
let cameraStream = null;
let micStream = null;
let micSource = null;
const screenVideo = makeVideo();
const cameraVideo = makeVideo();

let canvas = null;
let ctx = null;
let previewScale = 1;

const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;

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

/* Kilder */

export async function refreshScreens() {
  try {
    screens.value = await api.listScreens();
  } catch {
    screens.value = [];
  }
  if (!screens.value.some((s) => s.id === settings.value.screenId)) {
    saveSettings({ screenId: screens.value[0]?.id ?? '' });
  }
}

export async function refreshDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameras.value = devices.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  mics.value = devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  const s = settings.value;
  const patch = {};
  if (s.cameraId === null || (s.cameraId && !cameras.value.some((c) => c.id === s.cameraId))) patch.cameraId = cameras.value[0]?.id ?? '';
  if (s.micId === null || (s.micId && !mics.value.some((m) => m.id === s.micId))) patch.micId = mics.value[0]?.id ?? '';
  if (Object.keys(patch).length) saveSettings(patch);
  return patch;
}

export async function useScreen() {
  const s = settings.value;
  stop(screenStream);
  screenStream = null;
  screenVideo.srcObject = null;
  if (!s.screenId) return updateSize();
  const info = screens.value.find((x) => x.id === s.screenId);
  try {
    await api.selectScreen({ id: s.screenId, displayId: info?.displayId, systemAudio: s.systemAudio });
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
        ? { kind: 'screen', text: 'OBSlite is not allowed to record the screen. Allow it in System Settings and restart the app.', action: 'Open Settings', onAction: () => api.openPermissionSettings('screen') }
        : { kind: 'screen', text: 'Could not start screen capture.' };
  }
  updateSize();
}

export async function useCamera() {
  const id = settings.value.cameraId;
  stop(cameraStream);
  cameraStream = null;
  cameraVideo.srcObject = null;
  if (!id) return updateSize();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play().catch(() => {});
  } catch (err) {
    console.error(err);
    notice.value = { text: 'Could not start the camera. Check that no other app is using it.' };
  }
  updateSize();
}

export async function useMic() {
  const id = settings.value.micId;
  micSource?.disconnect();
  micSource = null;
  stop(micStream);
  micStream = null;
  if (!id) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: settings.value.noiseSuppression, autoGainControl: false, channelCount: 2 },
    });
    micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    audioCtx.resume();
  } catch (err) {
    console.error(err);
    notice.value = { text: 'Could not start the microphone.' };
  }
}

function updateSize() {
  if (recording.value) return;
  const apply = () => {
    let w = 1920;
    let h = 1080;
    if (screenStream && screenVideo.videoWidth) [w, h] = [screenVideo.videoWidth, screenVideo.videoHeight];
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
let lastCorner = 6;
let liveZoom = { on: false, at: 0, off: 0 };
let liveCursor = null;
let liveKeys = [];
let liveClicks = [];

export function attachCanvas(el) {
  canvas = el;
  ctx = el ? el.getContext('2d', { alpha: false }) : null;
  updateSize();
}

export function setLayout(n) {
  if (n >= 3) lastCorner = n;
  saveSettings({ layout: n });
  if (recording.value) layouts.push([round((Date.now() - t0) / 1000), n]);
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
  const target = pipRect(effectiveLayout(), lastCorner, W, H, s.pipSize, s.pipShape);
  if (!cam) cam = camFrom = camTo = target;
  else if (['x', 'y', 'w', 'h', 'a'].some((k) => Math.abs(target[k] - camTo[k]) > 0.5 || (k === 'a' && target.a !== camTo.a))) {
    camFrom = { ...cam };
    camTo = target;
    camAnimStart = now;
  }
  const t = Math.min(1, (now - camAnimStart) / 320);
  cam = t >= 1 ? camTo : lerpRect(camFrom, camTo, easeOutCubic(t));

  let rect = { x: 0, y: 0, w: W, h: H };
  if (hasScreen) {
    const sc = Math.min(W / screenVideo.videoWidth, H / screenVideo.videoHeight);
    rect = { w: screenVideo.videoWidth * sc, h: screenVideo.videoHeight * sc };
    rect.x = (W - rect.w) / 2;
    rect.y = (H - rect.h) / 2;
    ctx.drawImage(screenVideo, rect.x, rect.y, rect.w, rect.h);

    if (s.showClicks) {
      const nowS = now / 1000;
      liveClicks = liveClicks.filter((c) => nowS - c.t < 0.5);
      drawClicks(ctx, liveClicks.map((c) => ({ x: c.x, y: c.y, age: nowS - c.t })), rect);
    }
    if (s.cursorZoom && liveCursor) {
      const up = liveZoom.on ? clamp((now - liveZoom.at) / (ZOOM_RAMP * 1000), 0, 1) : 0;
      const down = liveZoom.on ? 1 : 1 - clamp((now - liveZoom.off) / (ZOOM_RAMP * 1000), 0, 1);
      const p = liveZoom.on ? easeOutCubic(up) : easeOutCubic(down) * (liveZoom.off ? 1 : 0);
      if (p > 0.01) drawCursor(ctx, rect.x + liveCursor[0] * rect.w, rect.y + liveCursor[1] * rect.h, p, rect.h);
    }
  }
  if (hasCamera && cam.a > 0.01) {
    ctx.save();
    ctx.globalAlpha = cam.a;
    drawCamera(ctx, cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight, cam, s.mirror, cam.w < W * 0.9);
    ctx.restore();
  }
  if (s.showKeys) {
    const nowS = now / 1000;
    liveKeys = liveKeys.filter((k) => nowS - k.t < KEY_LIFE);
    drawKeys(ctx, liveKeys.slice(-3).map((k) => ({ label: k.label, age: nowS - k.t })), W, H);
  }
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
ticker.onmessage = () => {
  draw();
  if (micSource) {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    level.value = clamp((20 * Math.log10(peak || 1e-6) + 60) / 60, 0, 1);
  } else level.value = 0;
  if (recording.value) elapsed.value = (Date.now() - t0) / 1000;
};
export function setActive(active) {
  ticker.postMessage(active || recording.value ? 30 : 0);
  api.setPolling(active || recording.value);
}

api.onInput((e) => {
  const now = performance.now();
  if (e.type === 'zoom') {
    liveCursor = [e.x, e.y];
    liveZoom = e.on ? { on: true, at: now, off: 0 } : { on: false, at: liveZoom.at, off: now };
  } else if (e.type === 'cursor') liveCursor = [e.x, e.y];
  else if (e.type === 'key') liveKeys.push({ label: e.label, t: now / 1000 });
  else if (e.type === 'click') {
    liveCursor = [e.x, e.y];
    liveClicks.push({ x: e.x, y: e.y, t: now / 1000 });
  }
});

/* Opptak */

let t0 = 0;
let layouts = [];
let recorders = [];

function pickMime(kind) {
  const list =
    kind === 'audio'
      ? [['audio/webm;codecs=opus', 'webm'], ['audio/mp4;codecs=opus', 'mp4']]
      : [
          ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'mp4'],
          ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
          ['video/mp4;codecs=avc1,opus', 'mp4'],
          ['video/webm;codecs=h264,opus', 'webm'],
          ['video/webm;codecs=vp9,opus', 'webm'],
          ['video/webm', 'webm'],
        ];
  return list.find(([m]) => MediaRecorder.isTypeSupported(m)) || list[list.length - 1];
}

async function startRecorder(name, tracks, kind, bitrate) {
  const [mime, ext] = pickMime(kind);
  const raw = `${name}.raw.${ext}`;
  const fileId = await api.recOpen(raw);
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
  const entry = { name, raw, file: `${name}.${ext}`, rec, fileId, chain: Promise.resolve(), startedAt: 0 };
  rec.ondataavailable = (e) => {
    if (!e.data.size) return;
    entry.chain = entry.chain.then(async () => api.recWrite(fileId, new Uint8Array(await e.data.arrayBuffer())));
  };
  entry.stopped = new Promise((resolve) => (rec.onstop = resolve));
  entry.started = new Promise((resolve) => (rec.onstart = () => resolve((entry.startedAt = Date.now()))));
  rec.start(1000);
  return entry;
}

export async function startRecording() {
  if (recording.value || finishing.value) return;
  const s = settings.value;
  if (!screenStream && !cameraStream && !micStream) {
    notice.value = { text: 'Choose at least one source before you start recording.' };
    return;
  }
  t0 = Date.now();
  layouts = [[0, effectiveLayout()]];
  await api.recBegin({ t0, base: s.outputDir });
  recorders = [];
  const { w, h } = canvasSize.value;
  if (screenStream) {
    const tracks = [...screenStream.getVideoTracks(), ...screenStream.getAudioTracks()];
    const bitrate = Math.round(clamp(w * h * s.fps * 0.1, 4e6, 60e6));
    recorders.push(await startRecorder('screen', tracks, 'video', bitrate));
  }
  const camTracks = [...(cameraStream?.getVideoTracks() || []), ...(micStream?.getAudioTracks() || [])];
  if (camTracks.length) {
    recorders.push(await startRecorder('camera', camTracks, cameraStream ? 'video' : 'audio', 8e6));
  }
  recording.value = true;
  elapsed.value = 0;
  setActive(true);
}

export async function stopRecording() {
  if (!recording.value) return null;
  recording.value = false;
  finishing.value = true;
  try {
    for (const r of recorders) if (r.rec.state !== 'inactive') r.rec.stop();
    await Promise.all(recorders.map((r) => r.stopped));
    for (const r of recorders) {
      await r.chain;
      await api.recClose(r.fileId);
    }
    const s = settings.value;
    const meta = { fps: s.fps, layouts, pip: { size: s.pipSize, shape: s.pipShape, mirror: s.mirror }, overlays: { keys: s.showKeys, cursorZoom: s.cursorZoom, clicks: s.showClicks } };
    for (const r of recorders) {
      const isCam = r.name === 'camera';
      meta[r.name] = {
        raw: r.raw,
        file: r.file,
        offset: round(Math.max(0, (r.startedAt || t0) - t0) / 1000),
        hasVideo: isCam ? Boolean(cameraStream) : true,
        hasAudio: r.rec.stream.getAudioTracks().length > 0,
      };
    }
    const dir = await api.recFinish(meta);
    return dir;
  } finally {
    finishing.value = false;
    recorders = [];
  }
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}

export async function initSources() {
  await api.requestPermissions();
  try {
    stop(await navigator.mediaDevices.getUserMedia({ audio: true, video: true }));
  } catch {
    try {
      stop(await navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch {}
  }
  await Promise.all([refreshScreens(), refreshDevices()]);
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    const patch = await refreshDevices();
    if ('cameraId' in patch) useCamera();
    if ('micId' in patch) useMic();
  });
  await Promise.all([useScreen(), useCamera(), useMic()]);
}
