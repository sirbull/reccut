import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import * as signals from '@preact/signals';
import { produce } from 'immer';
import { CAPTION_LANE, computeFrame, makeClip, newProject, updateDuration } from '../src/shared/model.js';
import { parseScript } from '../src/shared/voiceover.js';

// Run Send to Edit itself, keeping its real planning, clip creation and timeline operations.
const require = createRequire(import.meta.url);
const { signal } = signals;
const fixtures = new Map([
  ['../editor/store.js', 'store'], ['../prefs.js', 'prefs'],
  ['../ui.jsx', 'ui'], ['./preview.js', 'preview'],
]);
const bundle = (await build({
  entryPoints: ['src/renderer/voiceover/booth.js'], bundle: true, write: false,
  format: 'cjs', platform: 'browser', external: ['@preact/signals', 'immer'],
  plugins: [{ name: 'studio-placement-fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path }) => fixtures.has(path) ? { path: fixtures.get(path), external: true } : undefined);
  } }],
})).outputFiles[0].text;

function setup(kinds = ['video'], time = 3) {
  const p = newProject('Studio placement');
  const text = kinds.map((_, i) => `Line ${i + 1}.`).join('\n\n');
  const lines = parseScript(text).filter((b) => b.kind === 'line');
  p.voiceover = {
    script: { text }, people: [{ id: 'p1', name: 'Voice 1', fx: [], gain: 0 }],
    takes: kinds.map((kind, i) => {
      const id = `media${i}`;
      p.media[id] = { id, kind, duration: 2, name: id, streams: { main: { path: `${id}.webm`, hasVideo: kind === 'video', hasAudio: true } } };
      return { id: `take${i}`, key: lines[i].key, person: 'p1', mediaId: id, video: kind === 'video', in: 0, out: 2, duration: 2 };
    }),
  };
  const project = signal(p);
  const prefs = signal({ voRoomFill: false });
  const store = {
    project, projectFolders: signal(null), selection: signal([]), room: signal('edit'),
    getTime: () => time, scheduleSave() {}, saveNow() {},
    commit(fn) { project.value = produce(project.value, (d) => { fn(d); updateDuration(d); }); },
    makeCaptionClip: (start, text, dur) => makeClip('caption', { start, dur, lane: CAPTION_LANE, props: { text } }),
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, window: { api: { platform: 'darwin' } },
    performance, console, setTimeout, clearTimeout, structuredClone,
    require: (name) => ({ '@preact/signals': signals, store, prefs: { prefs, audioSink: signal('') }, ui: { toast() {} }, preview: {} })[name] ?? require(name),
  });
  const add = (type, start, dur, lane = 0) => {
    const c = makeClip(type, { start, dur, lane });
    project.value = produce(project.value, (d) => {
      d.clips[c.id] = c;
      if (lane === 0) d.primary.push(c.id);
      updateDuration(d);
    });
    return c.id;
  };
  const placed = () => Array.from(project.value.voiceover.placed.ids, (id) => project.value.clips[id]);
  return { project, prefs, booth: module.exports, add, placed };
}

test('mixed audio and camera takes from one person stay on their respective track types', () => {
  const s = setup(['audio', 'video', 'audio']);
  s.add('video', 0, 30);
  s.booth.stitch();
  const clips = s.placed();
  assert.deepEqual(clips.map((c) => c.type), ['audio', 'video', 'audio']);
  assert.ok(clips.filter((c) => c.type === 'audio').every((c) => c.lane < 0));
  const video = clips.find((c) => c.type === 'video');
  assert.ok(video.lane > 0);
  assert.ok(clips.every((c) => c.group === video.group));
  assert.equal(computeFrame(s.project.value, video.start + 0.5).layers.at(-1).clip.id, video.id);
});

test('camera takes go above every existing video track without moving existing clips', () => {
  const s = setup(['video', 'video']);
  const main = s.add('video', 0, 30);
  s.add('video', 0, 30, 1);
  const top = s.add('image', 20, 2, 4); // A lower free track still must not be chosen.
  const sound = s.add('audio', 4, 10, -1);
  s.add('caption', 3, 5, CAPTION_LANE);
  const before = structuredClone(s.project.value.clips);
  s.booth.stitch();
  assert.ok(s.placed().every((c) => c.lane === 5));
  for (const id of Object.keys(before)) assert.deepEqual(s.project.value.clips[id], before[id]);
  assert.equal(s.project.value.primary[0], main);
  assert.ok(s.project.value.clips[top] && s.project.value.clips[sound]);
  assert.equal(computeFrame(s.project.value, 3.5, { captions: false }).layers.at(-1).clip.id, s.placed()[0].id);
});

test('camera takes on an empty timeline use V1 at the playhead, preserving a leading gap', () => {
  const s = setup(['video', 'video'], 5);
  s.booth.stitch();
  assert.deepEqual(s.placed().map((c) => [c.lane, c.start]), [[0, 5], [0, 7]]);
  const p = s.project.value;
  assert.equal(p.clips[p.primary[0]].type, 'gap');
  assert.equal(p.clips[p.primary[0]].dur, 5);
});

test('camera takes fill an empty V1 gap without moving the following video or audio', () => {
  const s = setup(['video'], 4);
  s.add('video', 0, 2);
  s.add('gap', 2, 8);
  const next = s.add('video', 10, 5);
  const audio = s.add('audio', 10, 5, -1);
  s.booth.stitch();
  assert.deepEqual(s.placed().map((c) => [c.lane, c.start]), [[0, 4]]);
  assert.equal(s.project.value.clips[next].start, 10);
  assert.equal(s.project.value.clips[audio].start, 10);
});

test('an overlay at the playhead prevents camera takes from being hidden below it in V1', () => {
  const s = setup();
  s.add('video', 3, 5, 2);
  s.booth.stitch();
  assert.equal(s.placed()[0].lane, 3);
});

test('camera takes that extend past a gap go above the following video instead of overwriting it', () => {
  const s = setup(['video', 'video'], 3);
  s.add('gap', 0, 5);
  const next = s.add('video', 5, 5);
  s.booth.stitch();
  assert.ok(s.placed().every((c) => c.lane === 1));
  assert.equal(s.project.value.clips[next].start, 5);
  assert.equal(s.project.value.clips[next].dur, 5);
});

test('sending retakes replaces V1 clips without shifting later material', () => {
  const s = setup(['video', 'video'], 4);
  s.add('gap', 0, 10);
  const next = s.add('video', 10, 5);
  const audio = s.add('audio', 10, 5, -1);
  s.booth.stitch();
  const old = s.placed().map((c) => c.id);
  s.project.value = produce(s.project.value, (d) => {
    d.voiceover.takes[0].out = 1;
    d.voiceover.takes[0].duration = 1;
  });
  s.booth.stitch();
  assert.ok(old.every((id) => !s.project.value.clips[id]));
  assert.deepEqual(s.placed().map((c) => [c.lane, c.start, c.dur]), [[0, 4, 1], [0, 5, 2]]);
  assert.equal(s.project.value.clips[next].start, 10);
  assert.equal(s.project.value.clips[audio].start, 10);
});

test('sending overlay retakes reuses the top video track and keeps subtitles above them', () => {
  const s = setup();
  s.add('video', 0, 20);
  s.add('video', 0, 20, 3);
  s.prefs.value = { voSubtitles: true };
  s.booth.stitch();
  const old = s.placed().map((c) => c.id);
  s.booth.stitch();
  assert.ok(old.every((id) => !s.project.value.clips[id]));
  assert.equal(s.placed().find((c) => c.type === 'video').lane, 4);
  assert.equal(s.placed().find((c) => c.type === 'caption').lane, CAPTION_LANE);
});

test('camera placement avoids locked or hidden destination tracks', () => {
  const s = setup();
  s.project.value = { ...s.project.value, lanes: { 0: { locked: true }, 1: { hidden: true }, 2: { locked: true } } };
  s.booth.stitch();
  assert.equal(s.placed()[0].lane, 3);
});

const planGeometry = (plan) => JSON.parse(JSON.stringify({ ...plan, items: plan.items.map(({ active, ...it }) => it) }));

test('muting and soloing tracks only deactivate clips, preserving mixed video mode and all room-tone positions', () => {
  const s = setup(['audio', 'video', 'audio']);
  s.project.value = produce(s.project.value, (d) => {
    d.voiceover.people.push({ id: 'p2', name: 'Voice 2', fx: [], gain: 0 });
    d.voiceover.takes[1].person = 'p2';
    d.voiceover.roomTone = { mediaId: 'tone', duration: 5, file: 'room.wav' };
    d.media.tone = { id: 'tone', kind: 'audio', duration: 5, streams: { main: { hasAudio: true } } };
  });
  s.prefs.value = { voRoomFill: true };
  const initial = s.booth.studioPlan();
  const tone = JSON.parse(JSON.stringify(s.booth.tonePieces(initial, { all: true })));
  assert.ok(tone.length > 0);
  assert.equal(initial.video, false);
  const assertUnmoved = () => {
    const plan = s.booth.studioPlan();
    assert.deepEqual(planGeometry(plan), planGeometry(initial));
    assert.deepEqual(JSON.parse(JSON.stringify(s.booth.tonePieces(plan, { all: true }))), tone);
  };
  s.booth.toggleMute('p1');
  assertUnmoved();
  assert.equal(s.booth.studioPlan().items.find((it) => it.person === 'p1').active, false);
  assert.ok(s.booth.tonePieces(s.booth.studioPlan()).every((piece) => piece.person !== 'p1'), 'disabled room tone is silent');
  s.booth.toggleSolo('p1');
  assertUnmoved();
  s.booth.toggleSolo('p1');
  assertUnmoved();
  s.booth.toggleMute('p1');
  s.booth.toggleMute('p2');
  assertUnmoved();
});

test('Send to Edit keeps disabled video clips and captions in place, including when every track is disabled', () => {
  const s = setup(['video', 'video'], 4);
  s.prefs.value = { voSubtitles: true };
  s.booth.stitch();
  const initial = s.placed().map((c) => [c.type, c.start, c.dur, c.lane]);
  s.booth.toggleMute('p1');
  s.booth.stitch();
  assert.deepEqual(s.placed().map((c) => [c.type, c.start, c.dur, c.lane]), initial);
  assert.ok(s.placed().every((c) => c.enabled === false));
  s.booth.toggleMute('p1');
  s.booth.stitch();
  assert.deepEqual(s.placed().map((c) => [c.type, c.start, c.dur, c.lane]), initial);
  assert.ok(s.placed().every((c) => c.enabled === true));
});

test('Send to Edit preserves disabled audio and room tone with their original timing', () => {
  const s = setup(['audio', 'audio']);
  s.project.value = produce(s.project.value, (d) => {
    d.voiceover.roomTone = { mediaId: 'tone', duration: 5, file: 'room.wav' };
    d.media.tone = { id: 'tone', kind: 'audio', duration: 5, streams: { main: { hasAudio: true } } };
  });
  s.prefs.value = { voRoomFill: true };
  s.booth.stitch();
  const initial = s.placed().map((c) => [c.mediaId, c.start, c.dur, c.lane]);
  assert.ok(initial.some(([id]) => id === 'tone'));
  s.booth.toggleMute('p1');
  s.booth.stitch();
  assert.deepEqual(s.placed().map((c) => [c.mediaId, c.start, c.dur, c.lane]), initial);
  assert.ok(s.placed().every((c) => c.enabled === false));
});
