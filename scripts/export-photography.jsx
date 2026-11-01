// Use the real application and queue for website photography in an isolated profile.
import './help-photography.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import * as exportState from '../src/renderer/export/state.js';
import { runCommand } from '../src/renderer/registry.js';
import { toasts } from '../src/renderer/ui.jsx';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function prepare(outputDir) {
  // A short, single-frame-rate example keeps the screenshot focused on conversion.
  store.commit(p => {
    const keep = ['shot-mountain-lake', 'opening-title', 'source-audio'];
    p.clips = Object.fromEntries(keep.map(id => [id, p.clips[id]]));
    p.primary = ['shot-mountain-lake'];
    p.clips['source-audio'].dur = p.clips['shot-mountain-lake'].dur;
  });
  const paths = ['mountain-lake', 'forest-light'].map(id => store.project.value.media[id].path);
  await exportState.addFiles(paths);
  exportState.setSettings({ format: 'gif', audioOnly: true, fpsMode: 'custom', fps: 15, size: { preset: 480, w: 640, h: 480 } });
  store.room.value = 'edit';
  await wait(200);
  document.querySelector('.titlebar .actions .btn.primary').click();
  await wait(250);
  assert(store.room.value === 'export', 'Export Project must open the Export room');
  assert(!commands.exportOpen.value && !document.querySelector('.modal'), 'Export Project must not open the quick export dialog');
  assert(exportState.selectedId.value === exportState.PROJECT_SOURCE, 'Current Project must be selected rather than a conversion file');
  assert(exportState.settings.value.format === 'mp4-h264' && !exportState.settings.value.audioOnly, 'suggested project format must replace old GIF/audio settings');
  assert(exportState.settings.value.size.preset === 0 && exportState.settings.value.fps === store.project.value.fps, 'project dimensions and frame rate must be retained');
  assert(!store.tasks.value.some(t => t.kind === 'export'), 'preparing the project must not start an export');
  store.room.value = 'edit'; runCommand('export'); await wait(200);
  assert(store.room.value === 'export' && !commands.exportOpen.value, 'the export menu/shortcut command must use the same route');
  exportState.setSettings({ dir: outputDir });
  await wait(200);
  const scrub = document.querySelector('.ex-transport input');
  scrub.value = '2'; scrub.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(600);
  // Start the project through the actual footer action, then add two real conversions.
  [...document.querySelectorAll('.ex-footer button')].find(b => b.textContent.trim() === 'Export Project').click();
  for (let i = 0; i < 50 && !store.tasks.value.some(t => t.kind === 'export'); i++) await wait(100);
  for (const source of exportState.files.value) {
    await window.api.startExport({ project: source.project, settings: {
      format: 'mp4-h264', quality: 'high', fps: source.project.fps, size: { preset: 0 }, sourceMedia: 'original',
      captions: 'none', output: `${outputDir}/${source.project.name}.mp4`,
    } });
  }
  for (let i = 0; i < 100; i++) {
    const jobs = store.tasks.value.filter(t => t.kind === 'export');
    const error = jobs.find(t => t.state === 'error');
    if (error) throw new Error(error.error);
    if (jobs.length === 3 && jobs.some(t => t.state === 'running') && jobs.some(t => t.state === 'queued')) {
      toasts.value = []; window.helpPhotography.cleanFocus(); await wait(300);
      console.log('Export UI verified: button and shortcut prepare Current Project; three real jobs in the queue.');
      return;
    }
    await wait(100);
  }
  throw new Error('The demonstration export queue did not start');
}

async function cancel() {
  for (const t of store.tasks.value.filter(t => t.kind === 'export' && ['queued', 'running'].includes(t.state))) await window.api.cancelTask(t.id);
  await wait(300);
}
window.exportPhotography = { prepare, cancel };
