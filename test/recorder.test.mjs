import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = (await build({
  entryPoints: ['src/renderer/recorder/engine.js'], bundle: true, write: false, format: 'cjs', platform: 'browser',
  plugins: [{ name: 'project-folder-stub', setup(b) {
    b.onResolve({ filter: /editor\/store\.js$/ }, () => ({ path: 'project-folders', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const projectFolders = { value: null };' }));
  } }],
})).outputFiles[0].text;

function setup({ getUserMedia, active = true, savedSettings = {}, apiOverrides = {} } = {}) {
  let now = 1000;
  let receive;
  let nextId = 0;
  const frames = new Map();
  const cursors = [];
  const streams = [];
  const nodes = [];
  const videosCreated = [];
  const devices = [
    { kind: 'videoinput', deviceId: 'camera', label: 'Camera' },
    { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
  ];
  let deviceChange;
  const stream = (kinds) => {
    const tracks = kinds.map((kind) => ({ kind, readyState: 'live', stop() { this.readyState = 'ended'; } }));
    const result = { getTracks: () => tracks, getVideoTracks: () => tracks.filter((t) => t.kind === 'video'), getAudioTracks: () => tracks.filter((t) => t.kind === 'audio') };
    streams.push(result);
    return result;
  };
  const param = () => ({ value: 0, setTargetAtTime() {} });
  const node = () => {
    const result = {
      gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(), knee: param(), attack: param(), release: param(),
      connect(next) { return next; }, disconnect() { this.disconnected = true; },
    };
    nodes.push(result);
    return result;
  };
  let videos = 0;
  let paints = 0;
  const ctx = new Proxy({
    globalAlpha: 1,
    fillRect: () => { paints++; },
    translate: (x, y) => cursors.push([x, y]),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  const api = new Proxy({ platform: 'darwin', listScreens: async () => [], onInput: (cb) => { receive = cb; }, ...apiOverrides }, {
    get: (target, key) => target[key] ?? (() => {}),
  });
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, console,
    window: { api }, localStorage: { getItem: () => JSON.stringify(savedSettings), setItem() {} },
    navigator: { mediaDevices: {
      enumerateDevices: async () => devices,
      addEventListener: (_, callback) => { deviceChange = callback; },
      getUserMedia: (constraints) => getUserMedia
        ? getUserMedia(constraints, stream)
        : Promise.resolve(stream([...(constraints.video ? ['video'] : []), ...(constraints.audio ? ['audio'] : [])])),
    } },
    performance: { now: () => now },
    Blob, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    MediaStream: class {
      constructor(tracks) { this.tracks = tracks; }
      getTracks() { return this.tracks; }
      getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
    },
    MediaRecorder: class {
      constructor(stream) { this.stream = stream; }
      static isTypeSupported() { return true; }
      state = 'inactive';
      start() { this.state = 'recording'; this.onstart?.(); }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    },
    Worker: class { postMessage() {} },
    AudioContext: class {
      async resume() {}
      createAnalyser() { return node(); }
      createGain() { return node(); }
      createBiquadFilter() { return node(); }
      createDynamicsCompressor() { return node(); }
      createMediaStreamSource() { return node(); }
      createMediaStreamDestination() { return Object.assign(node(), { stream: stream(['audio']) }); }
    },
    requestAnimationFrame: (fn) => { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    document: {
      body: { appendChild() {} },
      createElement: () => {
        const video = {
          style: {}, addEventListener() {}, play: async () => {},
          readyState: videos++ === 0 ? 4 : 0, videoWidth: 1920, videoHeight: 1080,
        };
        videosCreated.push(video);
        return video;
      },
    },
  });
  const engine = module.exports;
  engine.attachCanvas({ getContext: () => ctx });
  engine.setActive(active);
  return {
    streams, nodes, videos: videosCreated, devices, deviceChange: () => deviceChange(),
    engine, cursors, frames, receive: (e) => receive(e), paints: () => paints,
    frame(ms = 16) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn(now);
    },
  };
}

test('live cursor draws the latest input on the next display frame without waiting for the video timer', () => {
  const s = setup();
  s.receive({ type: 'zoom', on: true, x: 0.1, y: 0.2 });
  s.receive({ type: 'cursor', x: 0.3, y: 0.4 });
  s.receive({ type: 'cursor', x: 0.5, y: 0.6 });
  assert.equal(s.frames.size, 1, 'coalesce high-rate mouse events into one display frame');
  s.frame();
  assert.deepEqual(s.cursors.at(-1), [960, 648]);
  const paints = s.paints();
  s.frame();
  assert.ok(s.paints() > paints, 'continue the size animation when the mouse is stationary');
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
const allStopped = (streams) => streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'));

test('leaving Record releases camera, raw microphone and processed audio; returning reconnects saved devices', async () => {
  const s = setup();
  await s.engine.initSources();
  assert.ok(s.videos[1].srcObject);
  const first = [...s.streams];
  assert.equal(allStopped(first), false);
  s.engine.setActive(false);
  assert.equal(allStopped(first), true);
  assert.equal(s.videos[1].srcObject, null);
  assert.ok(s.nodes.every((n) => n.disconnected));
  assert.equal(s.engine.level.value, 0);
  assert.equal(s.engine.micStatus.value, 'none');

  const count = s.streams.length;
  await Promise.all([s.engine.useCamera(), s.engine.useMic()]);
  assert.equal(s.streams.length, count, 'source changes in Edit cannot activate devices');
  s.engine.setActive(true);
  await flush();
  assert.ok(s.videos[1].srcObject);
  assert.equal(allStopped(s.streams.slice(count)), false);
  s.engine.setActive(false);
  assert.equal(allStopped(s.streams), true);
});

test('late camera and microphone requests are stopped after leaving Record', async () => {
  const pending = [];
  const s = setup({ getUserMedia(constraints, stream) {
    if (constraints.video === true) return Promise.resolve(stream(['audio', 'video']));
    return new Promise((resolve) => pending.push(() => resolve(stream([constraints.video ? 'video' : 'audio']))));
  } });
  const initialized = s.engine.initSources();
  await flush();
  assert.equal(pending.length, 2);
  s.engine.setActive(false);
  for (const resolve of pending) resolve();
  await initialized;
  assert.equal(allStopped(s.streams), true);
  assert.equal(s.videos[1].srcObject, null);
  assert.equal(s.nodes.length, 0, 'stale microphones must not create a mixer');
});

test('a rapid return to Record keeps new requests alive and discards stale requests', async () => {
  const pending = [];
  const s = setup({ getUserMedia(constraints, stream) {
    if (constraints.video === true) return Promise.resolve(stream(['audio', 'video']));
    return new Promise((resolve) => pending.push(() => {
      const result = stream([constraints.video ? 'video' : 'audio']);
      resolve(result);
      return result;
    }));
  } });
  const initialized = s.engine.initSources();
  await flush();
  s.engine.setActive(false);
  s.engine.setActive(true);
  assert.equal(pending.length, 4);
  const current = pending.slice(2).map((resolve) => resolve());
  await flush();
  const stale = pending.slice(0, 2).map((resolve) => resolve());
  await initialized;
  assert.equal(allStopped(stale), true);
  assert.equal(allStopped(current), false);
  assert.equal(s.videos[1].srcObject, current[0]);
  s.engine.setActive(false);
  assert.equal(allStopped(s.streams), true);
});

test('initialization and device changes outside Record never open camera or microphone', async () => {
  const s = setup({ active: false });
  await s.engine.initSources();
  assert.equal(s.streams.length, 0);
  s.devices[0].deviceId = 'other-camera';
  s.devices[1].deviceId = 'other-mic';
  await s.deviceChange();
  assert.equal(s.streams.length, 0);
  s.engine.setActive(true);
  await flush();
  assert.ok(s.videos[1].srcObject);
  s.engine.setActive(false);
  assert.equal(allStopped(s.streams), true);
});

test('leaving Record cancels a microphone test and releases its devices', async () => {
  const s = setup();
  await s.engine.initSources();
  const testing = s.engine.testMic();
  await flush();
  assert.equal(s.engine.micTest.value, 'recording');
  s.engine.setActive(false);
  await testing;
  assert.equal(s.engine.micTest.value, null);
  assert.equal(s.engine.notice.value, null);
  assert.equal(allStopped(s.streams), true);
});

test('leaving Record during countdown cancels starting and releases the devices', async () => {
  const s = setup();
  await s.engine.initSources();
  const starting = s.engine.startRecording();
  await flush();
  assert.ok(s.engine.countdown.value > 0);
  s.engine.setActive(false);
  await starting;
  assert.equal(s.engine.countdown.value, 0);
  assert.equal(s.engine.recording.value, false);
  assert.equal(allStopped(s.streams), true);
});

test('stopping in Edit releases devices before saving finishes and reconnects after returning to Record', async () => {
  let finishSave;
  let metadata;
  const s = setup({ savedSettings: { countdown: 0 }, apiOverrides: {
    recFinish(meta) {
      metadata = meta;
      return new Promise((resolve) => { finishSave = resolve; });
    },
  } });
  await s.engine.initSources();
  await s.engine.startRecording();
  assert.equal(s.engine.recording.value, true);
  s.engine.setActive(false);
  const stopping = s.engine.stopRecording();
  await flush();
  assert.equal(s.engine.finishing.value, true);
  assert.equal(allStopped(s.streams), true, 'devices must be off while files are being finalized');
  assert.equal(metadata.camera.hasVideo, true);
  assert.equal(metadata.camera.hasAudio, true);
  const count = s.streams.length;
  s.engine.setActive(true);
  finishSave({ dir: '/recording' });
  assert.equal(await stopping, '/recording');
  await flush();
  assert.equal(s.engine.finishing.value, false);
  assert.ok(s.videos[1].srcObject);
  assert.equal(allStopped(s.streams.slice(count)), false);
  s.engine.setActive(false);
  assert.equal(allStopped(s.streams), true);
});

test('switching to Edit while an already stopped recording is saving releases devices immediately', async () => {
  let finishSave;
  const s = setup({ savedSettings: { countdown: 0 }, apiOverrides: {
    recFinish: () => new Promise((resolve) => { finishSave = resolve; }),
  } });
  await s.engine.initSources();
  await s.engine.startRecording();
  const stopping = s.engine.stopRecording();
  await flush();
  assert.equal(s.engine.finishing.value, true);
  assert.equal(allStopped(s.streams), false);
  s.engine.setActive(false);
  assert.equal(allStopped(s.streams), true);
  finishSave({ dir: '/recording' });
  await stopping;
  await s.engine.startRecording();
  assert.equal(s.engine.recording.value, false, 'Edit cannot start a hidden recording');
});

test('release animation keeps painting then stops, and leaving Record cancels pending input draws', () => {
  const s = setup();
  s.receive({ type: 'zoom', on: true, x: 0.1, y: 0.2 });
  s.frame(200);
  s.receive({ type: 'zoom', on: false, x: 0.2, y: 0.3 });
  s.receive({ type: 'cursor', x: 0.4, y: 0.5 });
  s.frame();
  assert.deepEqual(s.cursors.at(-1), [768, 540]);
  s.frame(200);
  assert.equal(s.frames.size, 0);
  s.receive({ type: 'zoom', on: true, x: 0.4, y: 0.5 });
  s.engine.setActive(false);
  assert.equal(s.frames.size, 0);
  s.receive({ type: 'cursor', x: 0.6, y: 0.7 });
  assert.equal(s.frames.size, 0, 'inactive recorder must not render from global input');
});
