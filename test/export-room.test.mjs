import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = (await build({
  stdin: { contents: "export * from './src/renderer/export/state.js'; export { project, room, playing, tasks } from './src/renderer/editor/store.js';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'cjs', platform: 'browser',
})).outputFiles[0].text;

function setup() {
  const module = { exports: {} };
  const storage = new Map();
  let starts = 0;
  vm.runInNewContext(bundle, {
    module, exports: module.exports,
    window: { addEventListener() {}, api: { onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [], startExport: () => { starts++; } } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {}, structuredClone,
  });
  return { s: module.exports, starts: () => starts };
}

test('preparing a project replaces stale conversion settings without starting an export or removing files', () => {
  const { s, starts } = setup();
  s.project.value = { ...s.project.value, width: 2160, height: 3840, fps: 59.94, range: { in: 2, out: 9 }, duration: 15 };
  s.files.value = [{ id: 'imported', name: 'Source.mov' }];
  s.selectedId.value = 'imported';
  s.setSettings({ format: 'gif', audioOnly: true, size: { preset: 'custom', w: 640, h: 480 }, fpsMode: 'custom', fps: 15, quality: 'custom', bitrate: 2, dir: '/old-output', fit: 'cover', cropAspect: 1 });
  s.setSourceOptions(s.PROJECT_SOURCE, { crop: { x: .1, y: .1, w: .5, h: .5 }, range: { in: 10, out: 12 } });
  s.playing.value = true;
  s.room.value = 'edit';
  s.prepareProjectExport();
  assert.equal(s.room.value, 'export');
  assert.equal(s.selectedId.value, s.PROJECT_SOURCE);
  assert.equal(s.selectedProject.value, s.project.value);
  assert.equal(s.playing.value, false);
  assert.equal(s.settings.value.format, 'mp4-h264');
  assert.equal(s.settings.value.audioOnly, false);
  assert.equal(s.settings.value.quality, 'high');
  assert.equal(s.settings.value.size.preset, 0);
  assert.equal(s.settings.value.size.w, 2160);
  assert.equal(s.settings.value.size.h, 3840);
  assert.equal(s.settings.value.fpsMode, 'source');
  assert.equal(s.settings.value.fps, 59.94);
  assert.equal(s.settings.value.dir, null, 'use the configured project export folder');
  assert.equal(s.settings.value.sourceMedia, 'original');
  assert.equal(s.sourceOptions(s.PROJECT_SOURCE).crop, null);
  assert.deepEqual(JSON.parse(JSON.stringify(s.sourceOptions(s.PROJECT_SOURCE).range)), { in: 2, out: 9 });
  assert.equal(s.files.value.length, 1);
  assert.equal(s.tasks.value.length, 0);
  assert.equal(starts(), 0, 'opening Export must not start rendering');
  s.setSettings({ format: 'mp4-hevc' });
  assert.equal(s.settings.value.format, 'mp4-hevc', 'suggestions remain editable');
});

test('preparing another project clears a previous range and uses the new sequence format', () => {
  const { s } = setup();
  s.project.value = { ...s.project.value, width: 3840, height: 2160, fps: 25, range: { in: 1, out: 4 }, duration: 8 };
  s.prepareProjectExport();
  s.project.value = { ...s.project.value, name: 'Second project', width: 1280, height: 720, fps: 23.976, range: null };
  s.prepareProjectExport();
  assert.equal(s.sources.value.filter(x => x.kind === 'project').length, 1, 'reuse Current Project rather than adding duplicates');
  assert.equal(s.sources.value[0].name, 'Second project');
  assert.equal(s.settings.value.size.w, 1280);
  assert.equal(s.settings.value.size.h, 720);
  assert.equal(s.settings.value.fps, 23.976);
  assert.equal(s.sourceOptions(s.PROJECT_SOURCE).range, null);
});
