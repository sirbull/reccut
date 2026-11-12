import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

// Exercise the actual studio scheduler with a deterministic Web Audio graph.
const bundle = (await build({
  entryPoints: ['src/renderer/voiceover/preview.js'], bundle: true, write: false,
  format: 'cjs', platform: 'browser',
  plugins: [{ name: 'studio-audio-fixture', setup(b) {
    b.onResolve({ filter: /\/prefs\.js$/ }, () => ({ path: 'prefs', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const audioSink = {value: ""};' }));
  } }],
})).outputFiles[0].text;

function setup() {
  const nodes = [];
  const sources = [];
  const state = { decode: null, now: 100 };
  const node = (kind) => {
    const n = { kind, connections: [], events: [], messages: [],
      connect(to) { this.connections.push(to); return to; },
      disconnect() { this.connections = []; },
      start(...args) { this.started = args; }, stop() { this.stopped = true; },
    };
    n.gain = { value: 1,
      setValueAtTime(value, at) { n.events.push(['set', value, at]); },
      linearRampToValueAtTime(value, at) { n.events.push(['ramp', value, at]); },
    };
    n.port = { postMessage: (message) => n.messages.push(message) };
    nodes.push(n);
    return n;
  };
  const buffer = (name) => ({ name, duration: 10, numberOfChannels: 1, sampleRate: 1000, getChannelData: () => new Float32Array(10000).fill(0.2) });
  class Context {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node('destination'); this.audioWorklet = { addModule: async () => {} }; }
    decodeAudioData(data) { return state.decode ? state.decode(data) : Promise.resolve(buffer(data)); }
    createGain() { return node('gain'); }
    createAnalyser() { return node('analyser'); }
    createBufferSource() { const n = node('source'); sources.push(n); return n; }
    close() { return Promise.resolve(); }
    setSinkId() { return Promise.resolve(); }
  }
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports,
    AudioContext: Context, AudioWorkletNode: class { constructor() { return node('fx'); } },
    fetch: async (url) => ({ arrayBuffer: async () => decodeURIComponent(url.split('/').at(-1)) }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout, clearTimeout, console, performance: { now: () => state.now },
  });
  return { preview: module.exports, nodes, sources, state, buffer };
}
const item = (file = 'voice.wav', patch = {}) => ({ person: 'p1', active: true, at: 0, in: 0, dur: 2,
  take: { file, in: 0, out: 2, ...patch },
});
const plan = (it) => ({ items: [it], end: it.dur, gaps: [] });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('stopping during decoding prevents the old preview from starting over the new playback', async () => {
  const { preview, state, buffer, sources } = setup();
  const pending = new Map();
  state.decode = (file) => new Promise((resolve) => pending.set(file, resolve));
  const old = preview.play(plan(item('old.wav')));
  await settle();
  preview.stop();
  const current = preview.play(plan(item('new.wav')));
  await settle();
  pending.get('new.wav')(buffer('new.wav'));
  await current;
  pending.get('old.wav')(buffer('old.wav'));
  await old;
  assert.equal(sources.length, 1);
  assert.equal(sources[0].buffer.name, 'new.wav');
  assert.equal(preview.playing.value, true);
  preview.close();
});

test('cut takes schedule only the surviving source ranges with fades that fit each edge', async () => {
  const { preview, sources } = setup();
  const it = { ...item('voice.wav', { cuts: [[0.5, 1]], fadeIn: 0.3, fadeOut: 0.3 }), dur: 1.5 };
  await preview.play(plan(it));
  assert.deepEqual(sources.map((s) => s.started.slice(1)), [[0, 0.5], [1, 1]]);
  const firstFade = sources[0].connections[0].connections[0];
  const lastFade = sources[1].connections[0].connections[0];
  assert.ok(firstFade.events.some(([kind, value, at]) => kind === 'ramp' && value === 1 && Math.abs(at - 0.31) < 1e-6));
  assert.ok(lastFade.events.some(([kind, value, at]) => kind === 'ramp' && value === 0 && Math.abs(at - 1.56) < 1e-6));
  preview.close();
});

test('a volume ramp reaches the interpolated level when the last keyframe is beyond the trim', async () => {
  const { preview, sources } = setup();
  await preview.play(plan(item('voice.wav', { volKf: [[0, 0], [4, -12]] })));
  const envelope = sources[0].connections[0];
  const endpoint = envelope.events.at(-1);
  assert.equal(endpoint[0], 'ramp');
  assert.ok(Math.abs(endpoint[1] - Math.pow(10, -6 / 20)) < 1e-6);
  assert.ok(Math.abs(endpoint[2] - 2.06) < 1e-6);
  preview.close();
});

test('voice and room tone share the person gain and effect chain, with separate tone gain', async () => {
  const { preview, sources } = setup();
  const fx = [{ id: 'echo1', type: 'echo', on: true, p: { time: 0.2 } }];
  await preview.play({ ...plan(item()), end: 3 }, 0, {
    people: [{ id: 'p1', gain: -6, fx }],
    tone: { file: 'room.wav', pieces: [{ at: 2, in: 0.5, dur: 1, person: 'p1', gain: -9 }] },
  });
  assert.equal(sources.length, 2);
  const voiceFade = sources[0].connections[0].connections[0];
  const toneFade = sources[1].connections[0].connections[0];
  const track = voiceFade.connections[0];
  assert.equal(toneFade.connections[0], track);
  assert.ok(Math.abs(track.gain.value - Math.pow(10, -6 / 20)) < 1e-6);
  assert.deepEqual(track.connections[0].messages.at(-1), fx);
  assert.ok(toneFade.events.some(([, value]) => Math.abs(value - Math.pow(10, -9 / 20)) < 1e-6));
  preview.close();
  assert.ok(sources.every((s) => s.stopped));
});

test('turning off audio skimming cancels a preview still waiting for decoding', async () => {
  const { preview, state, buffer, sources } = setup();
  let resolve;
  state.decode = () => new Promise((done) => { resolve = done; });
  const pending = preview.scrub(plan(item()), 0.5);
  await settle();
  preview.stopScrub();
  resolve(buffer('voice.wav'));
  await pending;
  assert.equal(sources.length, 0);
  preview.close();
});

test('audio skimming stops active snippets and keeps previews within the surviving cut range', async () => {
  const { preview, state, sources } = setup();
  const it = { ...item('voice.wav', { cuts: [[0.5, 1]] }), dur: 1.5 };
  await preview.scrub(plan(it), 0.48);
  assert.equal(sources.length, 1);
  assert.ok(Math.abs(sources[0].started[2] - 0.02) < 1e-6);
  state.now += 100;
  await preview.scrub(plan(it), 0.6);
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[1].started[1], 1.1);
  preview.stopScrub();
  assert.equal(sources[1].stopped, true);
  preview.close();
});

test('starting timeline playback cancels a pending skimming preview', async () => {
  const { preview, state, buffer, sources } = setup();
  const pending = new Map();
  state.decode = (file) => new Promise((resolve) => pending.set(file, resolve));
  const scrub = preview.scrub(plan(item('old.wav')), 0.5);
  await settle();
  const play = preview.play(plan(item('new.wav')));
  await settle();
  pending.get('new.wav')(buffer('new.wav'));
  await play;
  pending.get('old.wav')(buffer('old.wav'));
  await scrub;
  assert.equal(sources.length, 1);
  assert.equal(sources[0].buffer.name, 'new.wav');
  preview.close();
});

test('a disabled track and its room tone can be enabled and muted during playback without moving the playhead', async () => {
  const { preview, sources } = setup();
  const it = { ...item(), active: false };
  await preview.play({ ...plan(it), end: 3 }, 0, {
    people: [{ id: 'p1', gain: -6, muted: true }],
    tone: { file: 'room.wav', pieces: [{ at: 2, in: 0.5, dur: 1, person: 'p1' }] },
  });
  assert.equal(sources.length, 2, 'disabled clips remain scheduled so enabling does not restart playback');
  const track = sources[0].connections[0].connections[0].connections[0];
  assert.equal(sources[1].connections[0].connections[0].connections[0], track);
  assert.equal(track.gain.value, 0);
  preview.time.value = 1.25;
  preview.setGain('p1', -6, false);
  assert.ok(Math.abs(track.gain.value - Math.pow(10, -6 / 20)) < 1e-6);
  preview.setGain('p1', -6, true);
  assert.equal(track.gain.value, 0);
  assert.equal(preview.time.value, 1.25);
  assert.equal(preview.playing.value, true);
  assert.ok(sources.every((src) => !src.stopped));
  preview.close();
});

test('muting while decoding uses the latest track state when playback begins', async () => {
  const { preview, state, buffer, sources } = setup();
  let resolve;
  state.decode = () => new Promise((done) => { resolve = done; });
  const play = preview.play(plan(item()), 0, { people: [{ id: 'p1', gain: 0 }] });
  await settle();
  preview.setGain('p1', 0, true);
  resolve(buffer('voice.wav'));
  await play;
  const track = sources[0].connections[0].connections[0].connections[0];
  assert.equal(track.gain.value, 0);
  assert.equal(preview.playing.value, true);
  preview.close();
});
