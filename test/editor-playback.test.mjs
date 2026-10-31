import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

// Kjør den faktiske editoradapteren med en deterministisk spiller og tilstand.
const bundle = (await build({
  entryPoints: ['src/renderer/editor/playback.js'], bundle: true, write: false,
  format: 'cjs', platform: 'browser',
  plugins: [{ name: 'playback-fixtures', setup(b) {
    b.onResolve({ filter: /\/store\.js$|^\.\/store\.js$/ }, () => ({ path: 'store', namespace: 'fixture' }));
    b.onResolve({ filter: /\/prefs\.js$/ }, () => ({ path: 'prefs', namespace: 'fixture' }));
    b.onResolve({ filter: /\/player\.js$/ }, () => ({ path: 'player', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ resolveDir: process.cwd(), contents: {
      store: `import { signal } from '@preact/signals';
        for (const key of ['playing', 'project', 'skim', 'skimming', 'sourceMediaId', 'browserPlayhead']) state[key] = signal(state[key].value);
        export const { playing, project, skim, skimming, sourceMediaId, browserPlayhead } = state;
        export const motionVersion = {value: 0};
        export const getTime = () => state.time;
        export const setTime = t => state.time = t;
        export const getSourceTime = () => state.sourceTime;
        export const setSourceTime = t => { state.sourceTime = t; browserPlayhead.value = {mediaId: sourceMediaId.value, t}; };
        export const loadMotion = () => {};`,
      prefs: `export const prefs = state.prefs;`,
      player: `export const fileUrl = p => p;
        export function createPlayer(options) {
          state.playerOptions = options;
          return {
            seek(t) { options.setTime(t); state.seeks.push(t); },
            play(rate) { state.starts.push({time: options.getTime(), rate, project: options.getProject()}); state.playing.value = true; },
            pause() { state.playing.value = false; },
            toggle() { if (state.playing.value) this.pause(); else this.play(1); },
            shuttle(dir) { if (dir) this.play(dir); else this.pause(); },
            invalidate() {},
          };
        }`,
    }[path] }));
  } }],
})).outputFiles[0].text;

function setup() {
  const state = {
    time: 2, sourceTime: 0, playing: { value: false }, project: { value: { id: 'timeline', width: 1920, height: 1080, fps: 30, clips: {}, media: {
      source: { id: 'source', name: 'Source', kind: 'video', duration: 100, streams: {main: {path: '/source.mp4', hasVideo: true}} },
      other: { id: 'other', name: 'Other', kind: 'video', duration: 20, streams: {main: {path: '/other.mp4', hasVideo: true}} },
      still: { id: 'still', name: 'Still', kind: 'image', streams: {main: {path: '/still.png'}} },
    } } },
    sourceMediaId: { value: null }, browserPlayhead: { value: null },
    skim: { value: { T: 8 } }, skimming: { value: true },
    prefs: { value: { playbackFromSkimmer: true, stillDur: 7 } }, starts: [], seeks: [],
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle, { module, exports: module.exports, state });
  return { state, playback: module.exports };
}

test('space, reverse and shuttle start at the timeline pointer when enabled', () => {
  for (const [method, arg, rate] of [['toggle', undefined, 1], ['play', 1, 1], ['playReverse', undefined, -1], ['shuttle', 1, 1]]) {
    const { state, playback } = setup();
    playback[method](arg);
    assert.equal(state.starts[0].time, 8);
    assert.equal(state.starts[0].rate, rate);
    assert.equal(state.skim.value, null);
  }
});

test('playhead is used when the preference or skimming is off, or no pointer is present', () => {
  for (const change of [
    s => s.prefs.value.playbackFromSkimmer = false,
    s => s.skimming.value = false,
    s => s.skim.value = null,
    s => s.skim.value = { T: NaN },
  ]) {
    const { state, playback } = setup();
    change(state);
    playback.toggle();
    assert.equal(state.starts[0].time, 2);
    assert.equal(state.seeks.length, 0);
  }
});

test('browser previews never seek the project timeline', () => {
  for (const preview of [{ T: 99, project: { clips: {} } }, { T: 99, mediaId: 'source' }]) {
    const { state, playback } = setup();
    state.skim.value = preview;
    playback.toggle();
    assert.equal(state.starts[0].time, 2);
    assert.equal(state.starts[0].project, state.project.value);
  }
});

test('pause and rate changes never jump to the mouse; seeking clears stale previews', () => {
  for (const method of ['toggle', 'playReverse']) {
    const { state, playback } = setup();
    state.playing.value = true;
    playback[method]();
    assert.equal(state.playing.value, false);
    assert.equal(state.time, 2);
    assert.equal(state.seeks.length, 0);
  }
  const { state, playback } = setup();
  state.playing.value = true;
  playback.shuttle(1);
  assert.equal(state.starts[0].time, 2);
  playback.seek(4);
  assert.equal(state.time, 4);
  assert.equal(state.skim.value, null);
});

test('selected source stays in the viewer after leaving the browser and hovering the timeline', () => {
  const { state, playback } = setup();
  state.playing.value = true;
  state.skimming.value = false;
  playback.openSource('source', 13.8);
  assert.equal(state.playing.value, false);
  assert.equal(state.time, 2);
  assert.equal(playback.getViewerTime(), 13.8);
  assert.equal(state.playerOptions.getProject().name, 'Source');
  assert.deepEqual(Object.keys(state.playerOptions.getProject().media), ['source']);
  state.skim.value = { T: 8 };
  assert.equal(playback.getViewerTime(), 13.8);
  state.skim.value = { T: 5, mediaId: 'other', project: playback.mediaPreviewProject(state.project.value.media.other) };
  assert.equal(state.playerOptions.getProject().name, 'Source');
  assert.equal(playback.getViewerTime(), 13.8);
  state.skim.value = null;
  assert.equal(playback.getViewerTime(), 13.8);
});

test('source transport, reverse and shuttle never move or play the timeline', () => {
  for (const [method, arg] of [['toggle'], ['play', 1], ['playReverse'], ['shuttle', 1]]) {
    const { state, playback } = setup();
    playback.openSource('source', 13.8);
    playback[method](arg);
    assert.equal(state.starts[0].project.name, 'Source');
    assert.equal(state.starts[0].time, 13.8);
    state.playerOptions.setTime(15);
    assert.equal(state.sourceTime, 15);
    assert.equal(state.browserPlayhead.value.t, 15);
    assert.equal(state.time, 2);
    playback.pause();
    playback.seekViewer(16);
    assert.equal(playback.getViewerTime(), 16);
    assert.equal(state.time, 2);
  }
});

test('source playback starts at the source skimmer and remains on the source', () => {
  const { state, playback } = setup();
  playback.openSource('source', 13.8);
  state.skim.value = { T: 25, mediaId: 'source', project: playback.sourceProject.value };
  playback.toggle();
  assert.equal(state.starts[0].time, 25);
  assert.equal(state.starts[0].project.name, 'Source');
  assert.equal(state.time, 2);
});

test('timeline activation restores its position and source can be reopened at its own position', () => {
  const { state, playback } = setup();
  playback.openSource('source', 13.8);
  playback.play();
  playback.showTimeline();
  assert.equal(state.playing.value, false);
  assert.equal(state.playerOptions.getProject(), state.project.value);
  assert.equal(playback.getViewerTime(), 2);
  playback.openSource('source');
  assert.equal(playback.getViewerTime(), 13.8);
  playback.seek(4);
  assert.equal(state.sourceMediaId.value, null);
  assert.equal(playback.getViewerTime(), 4);
});

test('switching sources resets position and source seeking respects duration', () => {
  const { state, playback } = setup();
  playback.openSource('source', 13.8);
  playback.openSource('other');
  assert.equal(playback.getViewerTime(), 0);
  assert.equal(state.playerOptions.getProject().name, 'Other');
  playback.seekViewer(100);
  assert.equal(playback.getViewerTime(), 20);
  playback.seekViewer(-5);
  assert.equal(playback.getViewerTime(), 0);
  playback.openSource('still');
  assert.equal(playback.sourceProject.value.duration, 7);
});
