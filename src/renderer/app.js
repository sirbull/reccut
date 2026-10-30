import { Compositor } from './compositor.js';

const api = window.api;
const isMac = api.platform === 'darwin';
const $ = (id) => document.getElementById(id);

const MODIFIERS = isMac
  ? [
      { value: 'Control+Alt', label: 'Ctrl + Option + 1 til 6', short: '⌃⌥' },
      { value: 'Command+Alt', label: 'Cmd + Option + 1 til 6', short: '⌘⌥' },
      { value: 'Command+Shift', label: 'Cmd + Shift + 1 til 6', short: '⌘⇧' },
    ]
  : [
      { value: 'Control+Shift', label: 'Ctrl + Shift + 1 til 6', short: 'Ctrl+Shift+' },
      { value: 'Control+Alt', label: 'Ctrl + Alt + 1 til 6', short: 'Ctrl+Alt+' },
    ];

const LAYOUTS = [
  { n: 1, label: 'Kamera', mini: '<div class="mini full-cam"></div>' },
  { n: 2, label: 'Skjerm', mini: '<div class="mini screen"></div>' },
  { n: 3, label: 'Oppe venstre', mini: '<div class="mini screen"><div class="cam tl"></div></div>' },
  { n: 4, label: 'Oppe høyre', mini: '<div class="mini screen"><div class="cam tr"></div></div>' },
  { n: 5, label: 'Nede venstre', mini: '<div class="mini screen"><div class="cam bl"></div></div>' },
  { n: 6, label: 'Nede høyre', mini: '<div class="mini screen"><div class="cam br"></div></div>' },
];

const DEFAULTS = {
  screenId: null,
  cameraId: null,
  micId: null,
  layout: 6,
  pipSize: 'medium',
  pipShape: 'rect',
  mirror: false,
  fps: 30,
  outputDir: null,
  hideFromCapture: true,
  modifier: MODIFIERS[0].value,
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

const settings = loadSettings();
if (!['circle', 'square', 'rect'].includes(settings.pipShape)) settings.pipShape = 'rect';
function save() {
  try {
    localStorage.setItem('settings', JSON.stringify(settings));
  } catch {}
}

const canvas = $('canvas');
const compositor = new Compositor(canvas);
compositor.setLayout(settings.layout);
compositor.pipSize = settings.pipSize;
compositor.shape = settings.pipShape;
compositor.mirror = settings.mirror;

const screenVideo = makeVideo();
const cameraVideo = makeVideo();
compositor.screenVideo = screenVideo;
compositor.cameraVideo = cameraVideo;

let screens = [];
let screenStream = null;
let cameraStream = null;
let micStream = null;
let micSource = null;
let recorder = null;
let recordStart = 0;
let lastSavedPath = null;

function makeVideo() {
  const v = document.createElement('video');
  v.muted = true;
  v.autoplay = true;
  v.playsInline = true;
  $('sources').appendChild(v);
  return v;
}

function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/* Lyd: mikrofonen går gjennom en AudioContext, slik at nivåmåleren og
   opptaket deler samme kilde og mikrofonen kan byttes under opptak. */
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;
const audioDest = audioCtx.createMediaStreamDestination();

/* Tegnesløyfe. En Worker gir jevn takt også når vinduet er skjult. */
const ticker = new Worker(
  URL.createObjectURL(
    new Blob(
      ['let id;onmessage=(e)=>{clearInterval(id);id=setInterval(()=>postMessage(0),1000/e.data)}'],
      { type: 'text/javascript' }
    )
  )
);
ticker.onmessage = () => compositor.draw();
const setTickRate = () => ticker.postMessage(settings.fps);

/* Kilder */

async function refreshScreens() {
  try {
    screens = await api.listScreens();
  } catch {
    screens = [];
  }
  const select = $('screenSelect');
  select.innerHTML = '';
  select.append(new Option('Ingen skjerm', ''));
  for (const s of screens) {
    select.append(new Option(`${s.name} (${s.width} × ${s.height})`, s.id));
  }
  if (!screens.some((s) => s.id === settings.screenId)) {
    settings.screenId = screens[0]?.id ?? null;
  }
  select.value = settings.screenId ?? '';
}

async function refreshDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  fillDeviceSelect(
    $('cameraSelect'),
    devices.filter((d) => d.kind === 'videoinput'),
    'Intet kamera',
    'cameraId',
    'Kamera'
  );
  fillDeviceSelect(
    $('micSelect'),
    devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'),
    'Ingen mikrofon',
    'micId',
    'Mikrofon'
  );
}

function fillDeviceSelect(select, list, noneLabel, key, fallback) {
  select.innerHTML = '';
  select.append(new Option(noneLabel, ''));
  list.forEach((d, i) => select.append(new Option(d.label || `${fallback} ${i + 1}`, d.deviceId)));
  if (settings[key] === null || !list.some((d) => d.deviceId === settings[key])) {
    if (settings[key] !== '') settings[key] = list[0]?.deviceId ?? '';
  }
  select.value = settings[key] ?? '';
}

async function useScreen(id) {
  stopStream(screenStream);
  screenStream = null;
  screenVideo.srcObject = null;
  if (!id) return updateCanvasSize();

  const info = screens.find((s) => s.id === id);
  try {
    await api.selectScreen(id);
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        width: { ideal: info?.width ?? 3840 },
        height: { ideal: info?.height ?? 2160 },
        frameRate: { ideal: settings.fps, max: settings.fps },
      },
    });
    screenVideo.srcObject = screenStream;
    await screenVideo.play().catch(() => {});
    hideNotice();
  } catch (err) {
    console.error(err);
    if (isMac) {
      showNotice(
        'OBSlite har ikke tilgang til å ta opp skjermen. Gi tilgang i Systeminnstillinger og start appen på nytt.',
        'Åpne innstillinger',
        () => api.openScreenSettings()
      );
    } else {
      showNotice('Kunne ikke starte skjermopptak.');
    }
  }
  updateCanvasSize();
}

async function useCamera(id) {
  stopStream(cameraStream);
  cameraStream = null;
  cameraVideo.srcObject = null;
  if (!id) return updateCanvasSize();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: id },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: settings.fps },
      },
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play().catch(() => {});
  } catch (err) {
    console.error(err);
    showNotice('Kunne ikke starte kameraet. Sjekk at ingen andre programmer bruker det.');
  }
  updateCanvasSize();
}

async function useMic(id) {
  micSource?.disconnect();
  micSource = null;
  stopStream(micStream);
  micStream = null;
  if (!id) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: { exact: id },
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 2,
      },
    });
    micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    micSource.connect(audioDest);
    audioCtx.resume();
  } catch (err) {
    console.error(err);
    showNotice('Kunne ikke starte mikrofonen.');
  }
}

// Opptaket får alltid skjermens native oppløsning. Uten skjerm brukes kameraets.
function updateCanvasSize() {
  if (recorder) return;
  const apply = () => {
    let w = 1920;
    let h = 1080;
    if (screenStream && screenVideo.videoWidth) {
      w = screenVideo.videoWidth;
      h = screenVideo.videoHeight;
    } else if (cameraStream && cameraVideo.videoWidth) {
      w = cameraVideo.videoWidth;
      h = cameraVideo.videoHeight;
    }
    // Videokodere krever partall.
    compositor.resize(w - (w % 2), h - (h % 2));
    renderMeta();
  };
  apply();
  for (const v of [screenVideo, cameraVideo]) {
    if (v.srcObject && !v.videoWidth) v.addEventListener('loadedmetadata', apply, { once: true });
  }
}

screenVideo.addEventListener('resize', updateCanvasSize);
cameraVideo.addEventListener('resize', updateCanvasSize);

/* Opptak */

function pickFormat() {
  const candidates = [
    { mime: 'video/mp4;codecs=avc1.640033,mp4a.40.2', ext: 'mp4', label: 'MP4 (H.264)' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4', label: 'MP4 (H.264)' },
    { mime: 'video/mp4;codecs=avc1,opus', ext: 'mp4', label: 'MP4 (H.264)' },
    { mime: 'video/mp4', ext: 'mp4', label: 'MP4' },
    { mime: 'video/webm;codecs=h264,opus', ext: 'webm', label: 'WebM (H.264)' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM (VP9)' },
    { mime: 'video/webm', ext: 'webm', label: 'WebM' },
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) || candidates.at(-1);
}

function bitrate() {
  const bps = canvas.width * canvas.height * settings.fps * 0.12;
  return Math.round(Math.min(80e6, Math.max(6e6, bps)));
}

async function startRecording() {
  if (recorder) return;
  const format = pickFormat();
  const stream = canvas.captureStream(settings.fps);
  audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  try {
    await api.startRecording({ dir: settings.outputDir, ext: format.ext });
  } catch (err) {
    console.error(err);
    showNotice('Kunne ikke opprette filen. Velg en annen mappe.');
    return;
  }

  let chain = Promise.resolve();
  recorder = new MediaRecorder(stream, {
    mimeType: format.mime,
    videoBitsPerSecond: bitrate(),
    audioBitsPerSecond: 192000,
  });
  recorder.ondataavailable = (e) => {
    if (!e.data.size) return;
    chain = chain.then(async () => api.writeChunk(new Uint8Array(await e.data.arrayBuffer())));
  };
  recorder.onstop = async () => {
    await chain.catch(console.error);
    stream.getVideoTracks().forEach((t) => t.stop());
    lastSavedPath = await api.stopRecording();
    recorder = null;
    setRecordingUi(false);
    updateCanvasSize();
    if (lastSavedPath) showToast(`Lagret ${lastSavedPath.split(/[\\/]/).pop()}`);
  };
  recorder.onerror = (e) => {
    console.error(e);
    showNotice('Opptaket stoppet på grunn av en feil.');
  };

  recorder.start(1000);
  recordStart = Date.now();
  setRecordingUi(true);
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

function toggleRecording() {
  recorder ? stopRecording() : startRecording();
}

function setRecordingUi(on) {
  document.body.classList.toggle('recording', on);
  $('recordBtn').classList.toggle('active', on);
  $('recordLabel').textContent = on ? 'Stopp' : 'Start opptak';
  $('timer').hidden = !on;
  $('timer').textContent = '00:00';
  $('screenSelect').disabled = on;
  document.querySelector('[data-setting="fps"]').classList.toggle('disabled', on);
  if (on) $('toast').hidden = true;
}

setInterval(() => {
  if (!recorder) return;
  const s = Math.floor((Date.now() - recordStart) / 1000);
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  $('timer').textContent = (h ? `${h}:` : '') + `${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}, 250);

/* Grensesnitt */

function renderLayouts() {
  const mod = MODIFIERS.find((m) => m.value === settings.modifier) || MODIFIERS[0];
  $('layouts').innerHTML = LAYOUTS.map(
    (l) => `<button class="layout-btn" data-layout="${l.n}" title="${mod.short}${l.n}">
        ${l.mini}<span class="label">${l.n}  ${l.label}</span>
      </button>`
  ).join('');
  $('layouts').querySelectorAll('.layout-btn').forEach((b) => {
    b.addEventListener('click', () => setLayout(Number(b.dataset.layout)));
  });
  markLayout();
}

function markLayout() {
  $('layouts')
    .querySelectorAll('.layout-btn')
    .forEach((b) => b.classList.toggle('active', Number(b.dataset.layout) === settings.layout));
}

function setLayout(n) {
  settings.layout = n;
  compositor.setLayout(n);
  markLayout();
  save();
}

function renderMeta() {
  const format = pickFormat();
  const mbps = (bitrate() / 1e6).toFixed(0);
  $('meta').textContent = `Opptak i ${canvas.width} × ${canvas.height}  ·  ${settings.fps} fps  ·  ${format.label}  ·  ca. ${mbps} Mbit/s`;
}

function initSegmented() {
  document.querySelectorAll('.segmented').forEach((group) => {
    const key = group.dataset.setting;
    const mark = () =>
      group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === String(settings[key])));
    group.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        settings[key] = key === 'fps' ? Number(b.dataset.value) : b.dataset.value;
        save();
        mark();
        onSettingChanged(key);
      });
    });
    mark();
  });
}

function onSettingChanged(key) {
  if (key === 'pipSize') compositor.pipSize = settings.pipSize;
  if (key === 'pipShape') compositor.shape = settings.pipShape;
  if (key === 'fps') {
    setTickRate();
    useScreen(settings.screenId);
    renderMeta();
  }
}

async function applyShortcuts() {
  const failed = await api.setShortcuts(settings.modifier);
  const mod = MODIFIERS.find((m) => m.value === settings.modifier) || MODIFIERS[0];
  $('recordKey').textContent = `${mod.short}0`;
  let html = `${mod.short}1 kamera, ${mod.short}2 skjerm, ${mod.short}3 til ${mod.short}6 hjørner.<br>${mod.short}0 starter og stopper opptaket.`;
  if (failed.length) {
    html += `<br><span class="warn">Opptatt av et annet program: ${failed.join(', ')}</span>`;
  }
  if (isMac && settings.modifier === 'Command+Shift') {
    html += '<br><span class="warn">Cmd + Shift + 3, 4 og 5 brukes av macOS til skjermbilder.</span>';
  }
  if (!isMac && settings.modifier === 'Control+Alt') {
    html += '<br><span class="warn">Ctrl + Alt er det samme som AltGr på norsk tastatur og kan krasje med @, $ og lignende.</span>';
  }
  $('shortcutHint').innerHTML = html;
  renderLayouts();
}

function renderFolder(dir) {
  $('folderBtn').textContent = dir;
  $('folderBtn').title = dir;
}

let noticeAction = null;
function showNotice(text, actionLabel, action) {
  $('noticeText').textContent = text;
  $('noticeAction').hidden = !actionLabel;
  $('noticeAction').textContent = actionLabel || '';
  noticeAction = action || null;
  $('notice').hidden = false;
}
function hideNotice() {
  $('notice').hidden = true;
}

let toastTimer;
function showToast(text) {
  $('toastText').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 8000);
}

function meterLoop() {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const db = 20 * Math.log10(peak || 1e-6);
  const pct = micSource ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
  $('meterFill').style.width = `${pct}%`;
  requestAnimationFrame(meterLoop);
}

/* Oppstart */

async function init() {
  if (isMac) document.body.classList.add('mac');

  // Spør om tilgang først, så enhetene får navn i listene.
  await api.requestPermissions();
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stopStream(probe);
  } catch {
    try {
      stopStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch {}
  }

  await Promise.all([refreshScreens(), refreshDevices()]);
  save();

  $('screenSelect').addEventListener('change', (e) => {
    settings.screenId = e.target.value || null;
    save();
    useScreen(settings.screenId);
  });
  $('cameraSelect').addEventListener('change', (e) => {
    settings.cameraId = e.target.value;
    save();
    useCamera(settings.cameraId);
  });
  $('micSelect').addEventListener('change', (e) => {
    settings.micId = e.target.value;
    save();
    useMic(settings.micId);
  });
  $('screenSelect').addEventListener('focus', () => {
    if (!recorder) refreshScreens();
  });
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    const before = [settings.cameraId, settings.micId];
    await refreshDevices();
    save();
    if (settings.cameraId !== before[0]) useCamera(settings.cameraId);
    if (settings.micId !== before[1]) useMic(settings.micId);
  });

  $('mirrorToggle').checked = settings.mirror;
  $('mirrorToggle').addEventListener('change', (e) => {
    settings.mirror = compositor.mirror = e.target.checked;
    save();
  });

  $('hideToggle').checked = settings.hideFromCapture;
  api.hideFromCapture(settings.hideFromCapture);
  $('hideToggle').addEventListener('change', (e) => {
    settings.hideFromCapture = e.target.checked;
    api.hideFromCapture(settings.hideFromCapture);
    save();
  });

  const defaultDir = await api.defaultOutputDir();
  renderFolder(settings.outputDir || defaultDir);
  $('folderBtn').addEventListener('click', async () => {
    const dir = await api.chooseOutputDir(settings.outputDir);
    if (dir) {
      settings.outputDir = dir;
      save();
      renderFolder(dir);
    }
  });

  const modSelect = $('modifierSelect');
  MODIFIERS.forEach((m) => modSelect.append(new Option(m.label, m.value)));
  if (!MODIFIERS.some((m) => m.value === settings.modifier)) settings.modifier = MODIFIERS[0].value;
  modSelect.value = settings.modifier;
  modSelect.addEventListener('change', () => {
    settings.modifier = modSelect.value;
    save();
    applyShortcuts();
  });

  $('recordBtn').addEventListener('click', toggleRecording);
  $('noticeClose').addEventListener('click', hideNotice);
  $('noticeAction').addEventListener('click', () => noticeAction?.());
  $('toastReveal').addEventListener('click', () => lastSavedPath && api.reveal(lastSavedPath));

  api.onShortcut((action) => {
    if (action.layout) setLayout(action.layout);
    if (action.toggleRecord) toggleRecording();
  });

  initSegmented();
  await applyShortcuts();
  setTickRate();
  meterLoop();

  await Promise.all([useScreen(settings.screenId), useCamera(settings.cameraId), useMic(settings.micId)]);
}

init();
