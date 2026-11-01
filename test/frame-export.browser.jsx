import { render } from 'preact';
import { ExportDialog } from '../src/renderer/editor/ExportDialog.jsx';
import { ExportFrameDialog } from '../src/renderer/editor/ExportFrameDialog.jsx';
import { exportOpen, frameExportOpen } from '../src/renderer/editor/commands.js';
import { byId } from '../src/renderer/registry.js';
import { project, playing, room, setTime } from '../src/renderer/editor/store.js';
import { newProject, makeClip } from '../src/shared/model.js';
import { makeVideoEffect } from '../src/shared/videoEffects.js';
import { addMask, maskKey } from '../src/shared/shapes.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const root = () => document.getElementById('root');
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
const change = (el, value, type = 'change') => {
  el.value = value;
  el.dispatchEvent(new Event(type, { bubbles: true }));
};

export function fixture(file, mode = 'key') {
  const p = newProject('Still frame');
  p.width = 64;
  p.height = 32;
  p.duration = 2;
  const stream = { path: file, width: 64, height: 32, hasVideo: true, hasAudio: false, duration: 2 };
  p.media.m = { id: 'm', kind: 'image', path: file, name: 'Source', duration: 2, streams: { main: stream } };
  const clip = makeClip('image', { media: p.media.m, start: 0, in: 0, dur: 2 });
  clip.id = 'subject';
  if (mode === 'key' || mode === 'matte') {
    const key = makeVideoEffect('chroma');
    key.p.color = '#00ff00';
    key.p.despill = 0;
    if (mode === 'matte') {
      key.p.view = 'matte';
      key.p.feather = 1;
    }
    clip.props.vfx = [key];
  }
  if (mode === 'mask') {
    const id = addMask(clip, 'rect', p.width, p.height);
    clip.props[maskKey(id, 'w')] = 24;
    clip.props[maskKey(id, 'h')] = 16;
    clip.props[maskKey(id, 'feather')] = 2;
  }
  p.clips[clip.id] = clip;
  p.primary = [clip.id];
  return p;
}

export function sourceImage() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#00ff00';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#ff0000';
  g.fillRect(16, 8, 32, 16);
  return c.toDataURL('image/png');
}

export async function verifyUI() {
  project.value = fixture('/source.png');
  room.value = 'export';
  byId.get('export').run();
  assert(exportOpen.value && room.value === 'export', 'Easy Export must open its dialog from any room');
  assert(byId.get('export').label === 'Easy Export' && byId.get('roomExport').label === 'Export Room', 'native Help results must have distinct labels');
  render(<ExportDialog />, root());
  await tick();
  assert(document.querySelector('h2').textContent === 'Easy Export' && button('More Options'), 'the original export dialog must be reachable');
  exportOpen.value = false;
  setTime(0.74, { force: true });
  playing.value = true;
  byId.get('exportFrame').run();
  assert(!playing.value, 'frame export must pause playback');
  const request = frameExportOpen.value;
  project.value = { ...project.value, name: 'Changed after opening' };
  setTime(1.5, { force: true });
  assert(request.project.name === 'Still frame' && request.time === 0.74, 'export must capture the sequence and playhead');
  render(<ExportFrameDialog request={request} />, root());
  await tick();
  const width = document.querySelector('[aria-label="Width in pixels"]');
  change(width, '1001', 'input');
  await tick();
  assert(document.querySelector('[aria-label="Height in pixels"]').value === '501', 'resolution must follow the aspect lock');
  const checkboxes = () => [...document.querySelectorAll('input[type="checkbox"]')];
  assert(checkboxes()[0].closest('label').getBoundingClientRect().height < 35, 'aspect ratio option must fit on one line');
  checkboxes()[1].click();
  await tick();
  change(document.querySelector('select'), 'jpeg');
  await tick();
  assert(checkboxes()[1].disabled && !checkboxes()[1].checked, 'JPEG must clearly disallow alpha');
  change(document.querySelector('select'), 'webp');
  await tick();
  assert(!checkboxes()[1].disabled && checkboxes()[1].checked, 'WebP must support alpha');
  change(width, '0', 'input');
  await tick();
  assert(button('Export Frame…').disabled && document.querySelector('[role="alert"]'), 'invalid resolution must block export');
  change(width, '101', 'input');
  await tick();
  checkboxes()[0].click();
  await tick();
  change(document.querySelector('[aria-label="Height in pixels"]'), '37', 'input');
  window.api.chooseDir = async () => '/custom';
  document.querySelector('.path-btn').click();
  await tick();
  let starts = 0, payload, dialogOptions;
  window.api.saveFileDialog = async () => null;
  window.api.startExport = async (p) => { starts++; payload = p; return 'frame-job'; };
  button('Export Frame…').click();
  await tick();
  assert(starts === 0 && frameExportOpen.value, 'canceling Save As must keep the dialog and not export');
  window.api.saveFileDialog = async (options) => { dialogOptions = options; return '/chosen/frame.webp'; };
  button('Export Frame…').click();
  await tick();
  assert(starts === 1 && !frameExportOpen.value, 'saving must enqueue exactly one frame job');
  assert(payload.settings.output === '/chosen/frame.webp' && payload.settings.frame.alpha && payload.settings.frame.width === 101 && payload.settings.frame.height === 37, 'chosen file, alpha and independent custom dimensions must reach the worker');
  assert(payload.project.name === 'Still frame' && payload.settings.frame.time === 22 / 30, 'export must keep the captured sequence and frame');
  assert(dialogOptions.filters[0].extensions[0] === 'webp', 'Save As must use the selected format');
  assert(dialogOptions.defaultPath.startsWith('/custom/'), 'Save As must start in the chosen folder');
  // Leave a populated dialog visible for a screenshot and layout inspection.
  render(null, root());
  render(<ExportFrameDialog request={request} />, root());
  await tick();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'frame dialog must fit its window');
  return { status: 'passed', checks: 16 };
}

export async function inspectImage(url) {
  const img = await createImageBitmap(await (await fetch(url)).blob());
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const at = (x, y) => [...g.getImageData(x, y, 1, 1).data];
  const bytes = g.getImageData(0, 0, c.width, c.height).data;
  let partialAlpha = false;
  for (let i = 3; i < bytes.length; i += 4) if (bytes[i] > 0 && bytes[i] < 255) partialAlpha = true;
  let hasGray = false;
  for (let i = 0; i < bytes.length; i += 4) {
    if (bytes[i] > 0 && bytes[i] < 255 && bytes[i] === bytes[i + 1] && bytes[i] === bytes[i + 2]) hasGray = true;
  }
  img.close();
  return { width: c.width, height: c.height, corner: at(0, 0), center: at(Math.floor(c.width / 2), Math.floor(c.height / 2)), partialAlpha, hasGray };
}
