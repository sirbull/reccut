import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

// De faktiske bibliotekkommandoene og editorens tilstand, med en styrbar spiller.
const bundle = (await build({
  stdin: { contents: `export * as commands from './src/renderer/editor/commands.js';
    export * as playback from './src/renderer/editor/playback.js';
    export * as store from './src/renderer/editor/store.js';
    export { newProject } from './src/shared/model.js';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  jsx: 'automatic', jsxImportSource: 'preact',
  plugins: [{ name: 'source-player', setup(b) {
    b.onResolve({ filter: /\/player\.js$/ }, () => ({ path: 'player', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const fileUrl = p => p;
      export function createPlayer(o) {
        fixture.player = o;
        return { seek: t => o.setTime(t, {force:true}), pause: () => o.playing.value = false,
          invalidate() {} };
      }` }));
  } }],
})).outputFiles[0].text;

function setup() {
  const module = { exports: {} };
  const fixture = {};
  vm.runInNewContext(bundle, {
    module, exports: module.exports, fixture,
    window: { addEventListener() {}, api: { onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [] } },
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {},
  });
  const { store, commands, playback, newProject } = module.exports;
  const p = newProject('Timeline');
  p.media.source = { id: 'source', name: 'Source', kind: 'video', duration: 30, streams: { main: { path: '/source.mp4', hasVideo: true } } };
  p.media.other = { ...p.media.source, id: 'other', name: 'Other' };
  store.setProject(p);
  store.setTime(4);
  return { store, commands, playback, newProject, fixture };
}

test('picking media opens its source; frame steps and I/O mark the visible source position', () => {
  const { store: s, commands: c, playback: p } = setup();
  c.pickMedia(null, 'source', ['source']);
  assert.equal(s.sourceMediaId.value, 'source');
  assert.equal(p.sourceProject.value.name, 'Source');
  p.seekViewer(6);
  c.stepFrames(1);
  assert.equal(s.getTime(), 4);
  assert.ok(Math.abs(s.getSourceTime() - (6 + 1 / 30)) < 1e-6);
  c.browserMark('in');
  const start = s.getSourceTime();
  assert.equal(c.browserRange.value.mediaId, 'source');
  assert.equal(c.browserRange.value.in, start);
  p.seekViewer(12);
  c.browserMark('out');
  assert.equal(c.browserRange.value.in, start);
  assert.equal(c.browserRange.value.out, 12);
  assert.equal(s.getTime(), 4);
  assert.equal(c.browserClipOpts(s.project.value.media.source).in, start);
});

test('I/O uses the displayed source even when another library clip has a stale skimmer', () => {
  const { store: s, commands: c, playback: p } = setup();
  c.pickMedia(null, 'source', ['source', 'other']);
  p.seekViewer(9);
  c.browserSkimPos.mediaId = 'other';
  c.browserSkimPos.t = 25;
  c.browserMark('in');
  assert.equal(c.browserRange.value.mediaId, 'source');
  assert.equal(c.browserRange.value.in, 9);
  assert.equal(s.getTime(), 4);
});

test('home and end navigate the source; opening a project clears its preview', () => {
  const { store: s, commands: c, playback: p, newProject } = setup();
  c.pickMedia(null, 'source', ['source']);
  c.goEnd();
  assert.equal(s.getSourceTime(), 30);
  c.goHome();
  assert.equal(s.getSourceTime(), 0);
  assert.equal(s.getTime(), 4);
  s.skim.value = { T: 10, mediaId: 'source', project: p.sourceProject.value };
  s.setProject(newProject('New timeline'));
  assert.equal(s.sourceMediaId.value, null);
  assert.equal(s.browserPlayhead.value, null);
  assert.equal(s.skim.value, null);
  assert.equal(p.sourceProject.value, null);
  assert.equal(p.getViewerTime(), 0);
});
