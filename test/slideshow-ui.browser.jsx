import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Browser } from '../src/renderer/editor/Browser.jsx';
import { SlideshowDialog } from '../src/renderer/editor/SlideshowDialog.jsx';
import { Inspector } from '../src/renderer/editor/Inspector.jsx';
import { Timeline } from '../src/renderer/editor/Timeline.jsx';
import { project, selection, setTime, timeSig, undo, redo, sequenceSettingsOpen } from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import { newProject } from '../src/shared/model.js';
import { prefs } from '../src/renderer/prefs.js';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
function Harness() {
  const [, update] = useState(0);
  useEffect(() => { const timer = setInterval(() => update((n) => n + 1), 30); return () => clearInterval(timer); }, []);
  return <div class="editor" style="height:100vh;grid-template-rows:minmax(0,1fr) 250px">
    <div class="editor-top" style="grid-template-columns:360px minmax(250px,1fr) 340px"><Browser /><div class="panel" /><Inspector /></div>
    <Timeline />{commands.slideshowDialog.value && <SlideshowDialog />}
  </div>;
}
export async function verifySlideshowUI() {
  const p = newProject('Slideshow'); p.width = 1920; p.height = 1080;
  const photo = new Image(); photo.src = window.slideshowPhotoURL; await photo.decode();
  const ids = ['slide-a', 'slide-b', 'slide-c'];
  for (const [i, id] of ids.entries()) {
    const cv = document.createElement('canvas'); cv.width = i === 0 ? 240 : 480; cv.height = i === 0 ? 360 : 270;
    const cx = cv.getContext('2d');
    if (i === 0) cx.drawImage(photo, 750, 0, 600, 900, 0, 0, 240, 360); else cx.drawImage(photo, 0, 0, cv.width, cv.height);
    const path = cv.toDataURL();
    p.media[id] = { id, kind: 'image', name: ['01 · Portrait.jpg', '02 · Landscape.jpg', '03 · Coast.jpg'][i],
      streams: { main: { path, hasVideo: true, width: cv.width, height: cv.height } } };
  }
  project.value = p; selection.value = []; sequenceSettingsOpen.value = null;
  commands.browserTab.value = 'media'; commands.browserFocus.value = true; commands.browserSelection.value = ids[0]; commands.browserPicked.value = ids;
  localStorage.setItem('browserView', 'grid'); setTime(0); timeSig.value = 0;
  render(<Harness />, document.getElementById('root')); await tick();
  const originalMenu = window.api.popupMenu; let menu;
  window.api.popupMenu = async (items) => { menu = items; return 'slideshow'; };
  try { document.querySelector(`[data-media="${ids[0]}"]`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await tick(); }
  finally { window.api.popupMenu = originalMenu; }
  assert(menu.some((item) => item.id === 'slideshow' && item.enabled), 'selected still images must expose Add as Slideshow in the context menu');
  assert(document.querySelector('[role="dialog"][aria-label="Add as Slideshow"]'), 'the menu must open the slideshow settings');
  const setNumber = async (label, value) => { const input = document.querySelector(`input[aria-label="${label}"]`); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await tick(); };
  const choose = async (label, value) => { const row = [...document.querySelectorAll('.slideshow-settings .row')].find((r) => r.querySelector('.row-label')?.textContent === label); const input = row.querySelector('select'); input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); await tick(); };
  await setNumber('Photo duration', '3.5'); await choose('Between photos', 'random');
  const checkbox = (label) => [...document.querySelectorAll('.slideshow-transition-list label')].find((l) => l.textContent === label).querySelector('input');
  checkbox('Cross Dissolve').click(); await tick();
  assert(document.querySelector('.slideshow-modal footer .primary').disabled, 'random transitions must require at least one selected type');
  checkbox('Cross Dissolve').click(); checkbox('Wipe').click(); await tick();
  await choose('Image fit', 'height'); await choose('Movement', 'kenBurns');
  await tick(300);
  const preview = document.querySelector('canvas[aria-label="Slideshow preview"]');
  const rgba = preview.getContext('2d').getImageData(preview.width / 2, preview.height / 2, 1, 1).data;
  assert(rgba[0] + rgba[1] + rgba[2] > 20, 'the dialog must render a real image preview');
  document.querySelector('.slideshow-modal footer .primary').click(); await tick();
  assert(!commands.slideshowDialog.value, 'creating the slideshow must close the dialog');
  const current = project.value, foregrounds = selection.value.map((id) => current.clips[id]);
  assert(current.primary.length === 3 && Object.keys(current.clips).length === 6, 'three selected images must create three editable image pairs');
  assert(foregrounds.every((c) => c.dur === 3.5 && c.props.imageFit === 'height' && c.props.kenBurns), 'dialog settings must reach each foreground');
  assert(foregrounds.every((c) => current.clips[c.slideshowParent].props.blur === 28), 'backgrounds must use the configured blur');
  assert(current.primary.slice(1).every((id) => ['dissolve', 'wipe'].includes(current.clips[id].transition.type)), 'only checked transition types may appear');
  assert(!sequenceSettingsOpen.value, 'slideshow creation must retain the sequence format without another dialog');
  assert(prefs.value.slideshow.duration === 3.5, 'remembered defaults must persist');
  undo(); await tick(); assert(Object.keys(project.value.clips).length === 0, 'the whole slideshow must undo in one step');
  redo(); await tick(); assert(Object.keys(project.value.clips).length === 6, 'the whole slideshow must redo in one step');
  const fg = Object.values(project.value.clips).find((c) => c.slideshowParent);
  selection.value = [fg.id]; commands.browserFocus.value = false; commands.inspectorTab.value = 'video'; await tick();
  assert(document.querySelector('[data-section="image-motion"]'), 'Ken Burns and fitting must remain editable in the Video inspector');
  commands.addEffect('kenBurns', fg.id); await tick(); assert(project.value.clips[fg.id].props.kenBurns, 'Ken Burns must also apply as an individual photo effect');
  commands.browserPicked.value = ids; commands.openSlideshow(ids); await tick(350);
  const pause = [...document.querySelectorAll('.slideshow-preview-controls button')].find((b) => b.textContent === 'Pause'); pause?.click();
  await tick();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'the slideshow dialog must fit the window');
  return { status: 'passed', checks: 16 };
}
