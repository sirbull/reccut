import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { cutAndSwitch, extendProgram } from '../src/shared/multicam.js';

// De faktiske bibliotekkommandoene og editorens tilstand, med en styrbar spiller.
const bundle = (await build({
  stdin: { contents: `export * as commands from './src/renderer/editor/commands.js';
    export * as playback from './src/renderer/editor/playback.js';
    export * as store from './src/renderer/editor/store.js';
    export * as multicam from './src/renderer/editor/multicam.js';
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

function setup(api = {}) {
  const module = { exports: {} };
  const fixture = {};
  vm.runInNewContext(bundle, {
    module, exports: module.exports, fixture,
    window: { addEventListener() {}, api: { onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [], offlineMedia: async () => [], ...api } },
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {},
    structuredClone,
  });
  const { store, commands, playback, newProject, multicam } = module.exports;
  const p = newProject('Timeline');
  p.media.source = { id: 'source', name: 'Source', kind: 'video', duration: 30, streams: { main: { path: '/source.mp4', hasVideo: true } } };
  p.media.other = { ...p.media.source, id: 'other', name: 'Other' };
  store.setProject(p);
  store.setTime(4);
  return { store, commands, playback, newProject, multicam, fixture };
}

test('the New Multicam command starts with an empty program and refuses an untouched timeline export', () => {
  const { store: s, multicam: m } = setup();
  m.newMulticamClip(['source', 'other']);
  const session = m.multicamSession.value;
  assert.equal(session.mc.angles.length, 2);
  assert.equal(session.mc.cuts.length, 0);
  assert.equal(m.sendMulticamToTimeline(session.mc), false);
  assert.equal(Object.keys(s.project.value.clips).length, 0);
  assert.equal(s.canUndo(), false);
  assert.equal(m.multicamSession.value, session);
});

test('Add to Timeline exports just the selected multicam interval and reopens the same choices', () => {
  const { store: s, multicam: m } = setup();
  m.newMulticamClip(['source', 'other']);
  const mc = m.multicamSession.value.mc;
  cutAndSwitch(s.project.value, mc, 4, mc.angles[1].id);
  extendProgram(s.project.value, mc, 4, 7);
  assert.equal(m.sendMulticamToTimeline(mc), true);
  assert.equal(s.project.value.duration, 3);
  const video = Object.values(s.project.value.clips).find((clip) => clip.type === 'video');
  assert.equal(video.in, 4);
  assert.equal(video.dur, 3);
  m.editMulticam(video.id);
  assert.equal(m.multicamSession.value.editing, true);
  assert.equal(m.multicamSession.value.mc.cuts[0].t, 4);
  assert.equal(m.multicamSession.value.mc.cuts[0].end, 7);
});

test('creating a new multicam from timeline clips imports cameras while leaving Program empty', () => {
  const { store: s, commands: c, multicam: m } = setup();
  c.pickMedia(null, 'source', ['source', 'other']);
  c.addBrowserSelection('append');
  c.pickMedia(null, 'other', ['source', 'other']);
  c.addBrowserSelection('connect');
  s.selection.value = Object.keys(s.project.value.clips);
  const before = s.project.value;
  m.createMulticamFromSelection();
  const session = m.multicamSession.value;
  assert.equal(session.mc.angles.length, 2);
  assert.equal(session.mc.programMode, 'selected');
  assert.equal(session.mc.cuts.length, 0);
  assert.equal(session.replace.length, 2);
  assert.equal(s.project.value, before, 'the original timeline remains available until Add to Timeline');
});

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

test('deleting browser media asks first, preserves timeline selection on cancel and clears source state on removal', () => {
  const { store: s, commands: c } = setup();
  c.pickMedia(null, 'source', ['source', 'other']);
  c.addBrowserSelection('append');
  const clipId = Object.keys(s.project.value.clips)[0];
  s.selection.value = [clipId];
  c.pickMedia(null, 'source', ['source', 'other']);
  c.browserMarkClip();
  c.browserSkimPos.mediaId = 'source';
  s.skim.value = { mediaId: 'source', T: 2 };
  const before = s.project.value;
  c.deleteFocusedSelection();
  assert.equal(c.mediaRemovalDialog.value.usedOnTimeline, true);
  assert.equal(s.project.value, before, 'no removal before confirmation');
  c.mediaRemovalDialog.value = null; // Cancel / Escape
  assert.equal(s.project.value.clips[clipId].mediaId, 'source');
  c.deleteFocusedSelection();
  c.confirmMediaRemoval();
  assert.equal(s.project.value.media.source, undefined);
  assert.equal(s.project.value.clips[clipId], undefined);
  assert.ok(s.project.value.media.other);
  assert.equal(c.browserPicked.value.length, 0);
  for (const signal of [c.browserSelection, c.browserRange, c.browserPlayhead, s.sourceMediaId, s.skim]) assert.equal(signal.value, null);
  assert.equal(c.browserSkimPos.mediaId, null);
  s.undo();
  assert.equal(s.project.value, before, 'media and edits are restored together');
  s.redo();
  assert.equal(s.project.value.media.source, undefined);
});

test('remembering the warning choice skips subsequent dialogs and supports multiple selected media', () => {
  const { store: s, commands: c } = setup();
  c.pickMedia(null, 'source', ['source', 'other']);
  c.deleteFocusedSelection();
  assert.equal(c.mediaRemovalDialog.value.usedOnTimeline, false);
  c.confirmMediaRemoval(true);
  s.undo();
  c.pickMedia(null, 'source', ['source', 'other']);
  c.pickMedia({ ctrlKey: true }, 'other', ['source', 'other']);
  c.deleteFocusedSelection();
  assert.equal(c.mediaRemovalDialog.value, null);
  assert.equal(Object.keys(s.project.value.media).length, 0);
});

test('timeline focus deletes only timeline clips even when browser media remain selected', () => {
  const { store: s, commands: c } = setup();
  c.pickMedia(null, 'source', ['source']);
  c.addBrowserSelection('append');
  s.selection.value = Object.keys(s.project.value.clips);
  c.browserFocus.value = false;
  c.deleteFocusedSelection();
  assert.equal(Object.keys(s.project.value.clips).length, 0);
  assert.ok(s.project.value.media.source);
  assert.equal(c.mediaRemovalDialog.value, null);
});

test('a pending removal cannot affect a reopened project with the same id', () => {
  const { store: s, commands: c } = setup();
  c.pickMedia(null, 'source', ['source']);
  c.deleteFocusedSelection();
  const reopened = structuredClone(s.project.value);
  s.setProject(reopened);
  c.confirmMediaRemoval(true);
  assert.ok(s.project.value.media.source);
  c.removeBrowserMedia(['source']);
  assert.ok(c.mediaRemovalDialog.value, 'stale confirmation must not disable warnings');
});

test('disk deletion stays explicit after warnings are disabled and removes only successful media', async () => {
  const calls = [];
  const { store: s, commands: c } = setup({ trashMedia: async (items) => {
    calls.push(items.map((item) => item.id));
    return { removedIds: ['source'], trashedPaths: ['/source.mp4'],
      failed: [{ mediaId: 'other', name: 'Other', errors: [{ path: '/other.mp4', error: 'File is in use' }] }] };
  } });
  c.pickMedia(null, 'source', ['source', 'other']);
  c.removeBrowserMedia();
  c.confirmMediaRemoval(true);
  s.undo();
  c.removeBrowserMedia(['source', 'other'], { forceDialog: true });
  assert.ok(c.mediaRemovalDialog.value, 'disk deletion must offer its dialog even when project warnings are disabled');
  assert.equal(calls.length, 0);
  await c.deleteBrowserMediaFromDisk();
  assert.deepEqual(calls.map((ids) => [...ids]), [['source', 'other']]);
  assert.equal(s.project.value.media.source, undefined);
  assert.ok(s.project.value.media.other, 'failed deletion keeps the media entry');
  assert.equal(c.mediaRemovalDialog.value.busy, false);
  assert.match(c.mediaRemovalDialog.value.error, /File is in use/);
  assert.deepEqual([...c.mediaRemovalDialog.value.mediaIds], ['other']);
  s.undo();
  assert.ok(s.project.value.media.source, 'project removal remains undoable');
});

test('disk deletion prevents duplicate requests and keeps media on failure', async () => {
  let rejectDelete, calls = 0;
  const { store: s, commands: c } = setup({ trashMedia: () => {
    calls++;
    return new Promise((_resolve, reject) => { rejectDelete = reject; });
  } });
  c.removeBrowserMedia(['source']);
  const before = s.project.value;
  const pending = c.deleteBrowserMediaFromDisk();
  assert.equal(c.mediaRemovalDialog.value.busy, true);
  c.confirmMediaRemoval();
  await c.deleteBrowserMediaFromDisk();
  assert.equal(calls, 1);
  assert.equal(s.project.value, before);
  rejectDelete(new Error('Recycle Bin is unavailable'));
  await pending;
  assert.equal(s.project.value, before);
  assert.equal(c.mediaRemovalDialog.value.busy, false);
  assert.match(c.mediaRemovalDialog.value.error, /Recycle Bin is unavailable/);
});

test('completing disk deletion after a project change leaves the newly opened project intact', async () => {
  let finish;
  const { store: s, commands: c, newProject } = setup({ trashMedia: () => new Promise((resolve) => { finish = resolve; }) });
  c.removeBrowserMedia(['source']);
  const pending = c.deleteBrowserMediaFromDisk();
  const next = newProject('Other project');
  s.setProject(next);
  finish({ removedIds: ['source'], failed: [], trashedPaths: ['/source.mp4'] });
  await pending;
  assert.equal(s.project.value.id, next.id);
  assert.equal(c.mediaRemovalDialog.value, null);
});
