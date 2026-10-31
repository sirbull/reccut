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
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: {
      store: `export const { playing, project, skim, skimming } = state;
        export const motionVersion = {value: 0};
        export const getTime = () => state.time;
        export const setTime = t => state.time = t;
        export const loadMotion = () => {};`,
      prefs: `export const prefs = state.prefs;`,
      player: `export const fileUrl = p => p;
        export function createPlayer(options) {
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
    time: 2, playing: { value: false }, project: { value: { clips: {} } },
    skim: { value: { T: 8 } }, skimming: { value: true },
    prefs: { value: { playbackFromSkimmer: true } }, starts: [], seeks: [],
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
