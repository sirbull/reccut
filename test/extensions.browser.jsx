import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ProcessorEffects } from '../src/renderer/editor/ProcessorEffects.jsx';
import { VideoEffects } from '../src/renderer/editor/VideoEffects.jsx';
import { Inspector } from '../src/renderer/editor/Inspector.jsx';
import { Timeline } from '../src/renderer/editor/Timeline.jsx';
import { ExtensionsPane, AIChat } from '../src/renderer/Extensions.jsx';
import { runAgent } from '../src/renderer/agent.js';
import { PluginWindows, PluginsButton, PluginsPane, exportingPlugin, openPlugin, openPluginFile, openPlugins, plugins, settingsFocus } from '../src/renderer/Plugins.jsx';
import { prefs, setPrefs } from '../src/renderer/prefs.js';
import * as editorCommands from '../src/renderer/editor/commands.js';
import { project, commit, undo, redo, selection, timeSig, tool } from '../src/renderer/editor/store.js';
import { readClipFrame, readClipFrames } from '../src/renderer/editor/sourceFrame.js';
import { newProject, makeClip } from '../src/shared/model.js';
import { makeEffect } from '../src/shared/audiofx.js';
import { makeVideoEffect } from '../src/shared/videoEffects.js';
import { addMediaClip, recordingChildren } from '../src/shared/ops.js';
export { verifyAdjustmentUI } from './adjustment-ui.browser.jsx';
const tick = () => new Promise((r) => setTimeout(r, 50));
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

export async function verifyPip() {
  const p = newProject('PiP editing');
  const st = { path: window.sourceFile, hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 12 };
  const m = { id: 'rec', name: 'Screen recording', kind: 'recording', duration: 12, streams: { screen: { ...st }, camera: { ...st } }, rec: { layouts: [[0, 6]] } };
  p.media.rec = m;
  const id = addMediaClip(p, m, 'append');
  const cameraId = recordingChildren(p, id)[0].id;
  project.value = p;
  selection.value = [id];
  timeSig.value = 1;
  tool.value = 'select';
  editorCommands.browserFocus.value = false;
  editorCommands.inspectorTab.value = 'recording';
  render(
    <div class="editor" style="height:100vh;grid-template-rows:minmax(0,1fr) 300px">
      <div class="editor-top" style="grid-template-columns:minmax(320px,1fr) 340px">
        <div class="panel" style="display:grid;place-content:center;gap:12px;text-align:center"><h2>Screen recording + PiP</h2><p>Select the PiP clip on V2 to adjust only the camera.</p></div>
        <Inspector />
      </div>
      <Timeline />
    </div>, document.getElementById('root'),
  );
  await tick();
  assert(document.querySelectorAll('.tl-clip').length === 2, 'screen and PiP must have separate timeline clips');
  assert(document.querySelector('.pip-connection'), 'timeline must show the PiP connection');
  const el = document.querySelector(`[data-clip="${cameraId}"] .clip-label`);
  const box = el.getBoundingClientRect();
  const capture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = () => {};
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: box.left + 40, clientY: box.top + 8 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
  } finally { Element.prototype.setPointerCapture = capture; }
  await tick();
  assert(selection.value.length === 1 && selection.value[0] === cameraId, 'clicking linked PiP must select only PiP');
  document.querySelector('[data-tab="color"]').click();
  await tick();
  const slider = document.querySelector('[data-prop="cameraExposure"] input[type="range"]');
  slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  slider.value = '55';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert(project.value.clips[cameraId].props.cameraExposure === 0.55 && project.value.clips[id].props.cameraExposure === 0, 'PiP slider must edit only the camera');
  undo();
  assert(project.value.clips[cameraId].props.cameraExposure === 0, 'color adjustment must undo');
  redo();
  assert(project.value.clips[cameraId].props.cameraExposure === 0.55, 'color adjustment must redo');
  document.querySelector('[data-tab="recording"]').click();
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Detach PiP').click();
  await tick();
  assert(!project.value.clips[cameraId].linkedTo, 'Detach PiP must remove the temporal connection');
  undo();
  assert(project.value.clips[cameraId].linkedTo === id, 'detaching must be undoable');
  redo();
  await tick();
  const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === id));
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  assert(project.value.clips[cameraId].linkedTo === id, 'PiP must be relinkable from the inspector');
  const popup = window.api.popupMenu;
  let items;
  window.api.popupMenu = async (menu) => { items = menu; return null; };
  try { await editorCommands.clipContextMenu(cameraId, 1); }
  finally { window.api.popupMenu = popup; }
  assert(items.some((i) => i.id === 'detachPip') && !items.some((i) => i.id === 'detach'), 'PiP context menu must offer visual detachment without duplicating microphone audio');
  document.querySelector('[data-tab="color"]').click();
  await tick();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'PiP inspector must fit the window');
  return { status: 'passed', checks: 11 };
}
function EffectsHarness() {
  const [p, setP] = useState(project.value);
  useEffect(() => {
    const timer = setInterval(() => setP(project.value), 20);
    return () => clearInterval(timer);
  }, []);
  return (
    <div class="inspector panel" style="width:320px;height:820px;overflow:auto">
      <VideoEffects clip={p.clips.subject} />
    </div>
  );
}
export async function verifyUI() {
  const p = newProject('Keying demo');
  const m = {
    id: 'm',
    kind: 'video',
    duration: 10,
    name: 'Subject.mp4',
    streams: { main: { hasVideo: true, hasAudio: true } },
  };
  p.media.m = m;
  const c = makeClip('video', { media: m, lane: 1 });
  c.id = 'subject';
  c.name = 'Subject';
  c.props.vfx = [makeVideoEffect('chroma'), makeVideoEffect('chroma')];
  c.props.vfx[1].p.color = '#0000ff';
  p.clips.subject = c;
  project.value = p;
  selection.value = ['subject'];
  render(<EffectsHarness />, document.getElementById('root'));
  await tick();
  assert(document.querySelectorAll('[data-vfx="chroma"]').length === 2, 'two independent keyer controls should render');
  const titles = (name) => [...document.querySelectorAll(`[title="${name}"]`)];
  titles('Move effect up')[1].click();
  await tick();
  assert(project.value.clips.subject.props.vfx[0].p.color === '#0000ff', 'move up should reorder the actual stack');
  titles('Duplicate effect')[0].click();
  await tick();
  assert(project.value.clips.subject.props.vfx.length === 3, 'duplicate should add a separate instance');
  titles('Remove effect')[0].click();
  await tick();
  assert(document.querySelector('.modal') && project.value.clips.subject.props.vfx.length === 3, 'adjusted effects must ask before removal');
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Cancel').click();
  await tick();
  assert(!document.querySelector('.modal') && project.value.clips.subject.props.vfx.length === 3, 'cancel must keep all adjustments');
  titles('Remove effect')[0].click();
  await tick();
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Remove effect').click();
  await tick();
  assert(project.value.clips.subject.props.vfx.length === 2, 'remove should delete only one instance');
  undo();
  await tick();
  assert(project.value.clips.subject.props.vfx.length === 3, 'effect removal should be undoable');
  redo();
  await tick();
  const remaining = project.value.clips.subject.props.vfx.length;
  titles('Remove effect')[0].click();
  await tick();
  const checkbox = document.querySelector('.modal input[type="checkbox"]');
  checkbox.click();
  await tick();
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Cancel').click();
  await tick();
  assert(prefs.value.confirmEffectRemoval, 'cancel must not save the skip-warning preference');
  titles('Remove effect')[0].click();
  await tick();
  document.querySelector('.modal input[type="checkbox"]').click();
  await tick();
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Remove effect').click();
  await tick();
  assert(!prefs.value.confirmEffectRemoval && JSON.parse(localStorage.getItem('prefs')).confirmEffectRemoval === false, 'skip warning must persist across sessions');
  undo(); await tick();
  titles('Remove effect')[0].click(); await tick();
  assert(!document.querySelector('.modal') && project.value.clips.subject.props.vfx.length === remaining - 1, 'skip warning must remove adjusted effects directly');
  undo(); await tick();
  setPrefs({ confirmEffectRemoval: true });
  const details = document.querySelector('details');
  details.open = true;
  await tick();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'keying inspector should fit the window');
    for (const label of ['Recover fine detail', 'Preserve source shadows', 'Recover edge color', 'Matte gamma'])
    assert([...details.querySelectorAll('.row-label')].some((el) => el.textContent === label), `${label} must be available under Advanced`);
  const head = document.querySelector('[data-vfx] .afx-head');
  assert([...head.children].every((el) => el.getBoundingClientRect().bottom <= head.getBoundingClientRect().bottom + 1), 'all effect actions must fit in one header row');
  return { status: 'passed', checks: 16 };
}
export async function verifyShadowUI() {
  const p = newProject('Shadow controls');
  const m = { id: 'm', kind: 'image', streams: { main: { hasVideo: true } } };
  p.media.m = m;
  const c = makeClip('image', { media: m, lane: 0 }); c.id = 'subject';
  c.props.fx = ['shadow']; c.props.shadow = 0.6;
  p.clips.subject = c; p.primary = ['subject'];
  project.value = p; selection.value = ['subject']; timeSig.value = 0;
  editorCommands.inspectorTab.value = 'effects';
  setPrefs({ confirmEffectRemoval: true });
  render(<div style="width:320px;height:850px"><Inspector /></div>, document.getElementById('root'));
  await tick();
  const row = (prop) => document.querySelector(`[data-prop="${prop}"]`);
  const set = async (prop, value) => {
    const slider = row(prop).querySelector('.slider');
    slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    slider.value = value; slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  };
  assert(row('shadow').querySelector('.slider').max === '500', 'shadow slider must reach 500%');
  for (const prop of ['shadow', 'shadowSoftness', 'shadowOpacity', 'shadowOffsetX', 'shadowOffsetY']) {
    const slider = row(prop).querySelector('.slider').getBoundingClientRect();
    const field = row(prop).querySelector('.num-field').getBoundingClientRect();
    assert(field.left - slider.right >= 7, `${prop}: thumb must have room at the right endpoint`);
    assert(row(prop).lastElementChild.getBoundingClientRect().right <= row(prop).getBoundingClientRect().right + 1, `${prop}: controls must fit the narrow inspector`);
  }
  await set('shadow', '500');
  assert(project.value.clips.subject.props.shadow === 5, '500% must persist');
  undo(); await tick(); assert(project.value.clips.subject.props.shadow === 0.6, 'amount must undo in one step');
  redo(); await tick();
  await set('shadowSoftness', '0'); await set('shadowOpacity', '25');
  await set('shadowOffsetX', '-80'); await set('shadowOffsetY', '120');
  const color = document.querySelector('[data-fx="shadow"] input[type="color"]');
  color.value = '#3366ff'; color.dispatchEvent(new Event('input', { bubbles: true }));
  color.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(project.value.clips.subject.props.shadowColor === '#3366ff' && project.value.clips.subject.props.shadowOpacity === 0.25, 'color and opacity must persist independently');
  row('shadowOffsetX').querySelector('.kf-btn').click(); await tick();
  assert(project.value.clips.subject.kf.shadowOffsetX[0][1] === -80, 'position must support keyframes');
  row('shadowOpacity').querySelector('[title="Reset"]').click(); await tick();
  assert(project.value.clips.subject.props.shadowOpacity === 1, 'opacity reset must restore the amount-based default');
  document.querySelector('[data-fx="shadow"] [title="Remove effect"]').click(); await tick();
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Remove effect').click(); await tick();
  assert(project.value.clips.subject.props.shadowColor === '#000000' && !project.value.clips.subject.kf.shadowOffsetX, 'removal must clear all shadow settings and keyframes');
  undo(); await tick();
  assert(project.value.clips.subject.props.shadowColor === '#3366ff' && project.value.clips.subject.kf.shadowOffsetX[0][1] === -80, 'Undo must restore the entire shadow');
  return { status: 'passed', checks: 19 };
}

export async function verifyEffectRemoval() {
  const p = newProject('Remove effects');
  const m = { id: 'm', kind: 'video', duration: 10, streams: { main: { hasVideo: true, hasAudio: true } } };
  p.media.m = m;
  const c = makeClip('video', { media: m, lane: 0 }); c.id = 'subject';
  c.props.fx = ['shadow']; c.props.shadow = 0.6;
  p.clips.subject = c; p.primary = ['subject'];
  project.value = p; selection.value = ['subject'];
  editorCommands.browserFocus.value = false;
  editorCommands.inspectorTab.value = 'effects';
  setPrefs({ confirmEffectRemoval: true });
  render(<div style="width:320px;height:850px"><Inspector /></div>, document.getElementById('root'));
  await tick();
  document.querySelector('[data-fx="shadow"] [title="Remove effect"]').click(); await tick();
  assert(!document.querySelector('.modal') && !project.value.clips.subject.props.fx.includes('shadow'), 'default clip effect must delete without a warning');
  undo(); await tick();
  commit((q) => { q.clips.subject.kf.shadow = [[0, 0.3], [1, 0.8]]; }); await tick();
  const keyframes = JSON.stringify(project.value.clips.subject.kf.shadow);
  document.querySelector('[data-fx="shadow"] [title="Remove effect"]').click(); await tick();
  assert(document.querySelector('[role="dialog"]'), 'keyframed effect must warn even when its base amount is unchanged');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  assert(!document.querySelector('.modal') && JSON.stringify(project.value.clips.subject.kf.shadow) === keyframes, 'Escape must cancel without losing keyframes');
  document.querySelector('[data-fx="shadow"] [title="Remove effect"]').click(); await tick();
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Remove effect').click(); await tick();
  assert(!project.value.clips.subject.kf.shadow && project.value.clips.subject.props.shadow === 0, 'confirm must remove the effect and its keyframes');
  undo(); await tick();
  assert(JSON.stringify(project.value.clips.subject.kf.shadow) === keyframes && project.value.clips.subject.props.shadow === 0.6, 'one Undo must restore the complete effect');
  commit((q) => { q.clips.subject.props.afx = [makeEffect('gain', { db: 9 })]; });
  editorCommands.inspectorTab.value = 'audio'; await tick();
  document.querySelector('[data-afx-item="gain"] [title="Remove effect"]').click(); await tick();
  assert(document.querySelector('.modal'), 'adjusted audio effects must share the removal warning');
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Remove effect').click(); await tick();
  assert(project.value.clips.subject.props.afx.length === 0, 'confirm must remove audio effect');
  undo(); await tick();
  assert(project.value.clips.subject.props.afx[0].p.db === 9, 'Undo must restore audio settings');
  return { status: 'passed', checks: 8 };
}

export async function verifyGradientUI() {
  const p = newProject('Gradient editor');
  const m = { id: 'm', kind: 'image', name: 'Image', streams: { main: { hasVideo: true, width: 1920, height: 1080 } } };
  p.media.m = m;
  const clip = makeClip('image', { media: m, lane: 0 });
  clip.id = 'subject'; p.clips.subject = clip; p.primary = ['subject'];
  project.value = p; selection.value = ['subject'];
  render(<EffectsHarness />, document.getElementById('root'));
  await tick();
  const choose = async (select, value) => {
    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  };
  const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  const effect = () => project.value.clips.subject.props.vfx.find((e) => e.type === 'gradient');
  const add = () => [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === 'Add stack effect…'));
  await choose(add(), 'gradient');
  assert(effect() && document.querySelector('[data-gradient-mode="linear"]'), 'add menu must create an editable gradient');
  button('Add stop').click(); await tick();
  assert(effect().p.stops.length === 3, 'add stop must add a third editable stop');
  const color = document.querySelector('[aria-label="Selected gradient color"]');
  color.value = '#00ff00'; color.dispatchEvent(new Event('input', { bubbles: true }));
  color.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(effect().p.stops.some((s) => s.color === '#00ff00'), 'new stop color must be editable');
  button('Remove stop').click(); await tick();
  assert(effect().p.stops.length === 2, 'selected stop must be removable');
  undo(); await tick();
  assert(effect().p.stops.length === 3, 'stop removal must undo');
  const mode = () => document.querySelector('.gradient-editor select');
  await choose(mode(), 'radial');
  assert(document.querySelector('[data-gradient-handle="radius"]'), 'radial mode must expose radius handle');
  await choose(mode(), 'freeform');
  assert(document.querySelectorAll('[data-gradient-handle="point"]').length === 3, 'freeform must start with three points');
  button('Add point').click(); await tick();
  assert(effect().p.points.length === 4, 'freeform must accept additional points');
  const canvas = document.querySelector('.gradient-preview');
  const box = canvas.getBoundingClientRect();
  assert(Math.abs(box.width / box.height - 16 / 9) < 0.01, 'gradient preview must keep the source aspect ratio');
  canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: box.left + box.width * 0.65, clientY: box.top + box.height * 0.7 }));
  await tick();
  assert(effect().p.points.length === 5, 'double-clicking preview must add a point');
  const selected = effect().p.points.at(-1), selectedId = selected.id;
  const oldCapture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = () => {};
  const dragHandle = async (kind, id, x, y, dx, dy) => {
    const handle = document.querySelector(`[data-gradient-handle="${kind}"][data-id="${id}"]`);
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 9, clientX: x, clientY: y }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: x + dx, clientY: y + dy }));
    await tick();
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 })); await tick();
  };
  try {
    await dragHandle('point', selectedId, box.left + box.width * 0.65, box.top + box.height * 0.7, -box.width * 0.2, -box.height * 0.2);
    const moved = effect().p.points.find((s) => s.id === selectedId);
    assert(Math.abs(moved.x - 0.45) < 0.01 && Math.abs(moved.y - 0.5) < 0.01, 'dragging must update point coordinates');
    undo(); await tick();
    assert(Math.abs(effect().p.points.find((s) => s.id === selectedId).x - 0.65) < 0.01, 'whole point drag must undo in one step');
    redo(); await tick();
    const radius = effect().p.points.find((s) => s.id === selectedId).radius;
    await dragHandle('spread', selectedId, box.left + box.width * 0.6, box.top + box.height * 0.5, 20, 0);
    assert(effect().p.points.find((s) => s.id === selectedId).radius > radius + 0.05, 'spread handle must enlarge point influence');
    undo(); await tick();
    assert(effect().p.points.find((s) => s.id === selectedId).radius === radius, 'spread drag must undo');
  } finally { Element.prototype.setPointerCapture = oldCapture; }
  document.querySelector(`[data-gradient-handle="point"][data-id="${selectedId}"]`).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
  await tick();
  assert(Math.abs(effect().p.points.find((s) => s.id === selectedId).x - 0.46) < 0.01, 'point handles must support keyboard movement');
  document.querySelector('[data-vfx="gradient"] [title="Duplicate effect"]').click(); await tick();
  assert(project.value.clips.subject.props.vfx.filter((e) => e.type === 'gradient').length === 2, 'gradients must be duplicatable');
  commit((q) => { q.clips.subject.props.vfx[1].p.points[0].color = '#ffffff'; });
  assert(effect().p.points[0].color !== '#ffffff', 'duplicate gradient must own independent point settings');
  document.querySelectorAll('[data-vfx="gradient"] [title="Remove effect"]')[1].click(); await tick();
  assert(document.querySelector('.modal'), 'adjusted gradients must warn before removal');
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Remove effect').click(); await tick();
  await choose(add(), 'solid');
  assert(document.querySelector('[aria-label="Solid color"]'), 'solid must expose a color control');
  undo(); await tick();
  editorCommands.addEffect('solid'); await tick();
  assert(project.value.clips.subject.props.vfx.at(-1).type === 'solid', 'effect library command must add solid fill');
  undo(); await tick();
  editorCommands.addEffect('gradient'); await tick();
  assert(project.value.clips.subject.props.vfx.length === 2, 'effect library command must add independent gradient');
  undo(); await tick();
  document.querySelector('.gradient-editor').scrollIntoView();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'gradient controls must fit the inspector');
  return { status: 'passed', checks: 21 };
}
export async function showSettings() {
  render(
    <div style="width:660px;margin:20px auto">
      <ExtensionsPane />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  assert(document.querySelector('input[type=password]'), 'key field must be masked');
  return { status: 'passed', checks: 1 };
}
export async function verifyChat() {
  render(<AIChat />, document.getElementById('root'));
  await tick();
  await tick();
  const input = document.querySelector('.ai-compose textarea');
  input.value = 'Fade the selected clip';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click();
  for (let i = 0; i < 8; i++) await tick();
  assert(project.value.clips.subject.props.opacity === 0.5, 'the agent must edit the actual project through its tools');
  assert(document.querySelector('.ai-step'), 'tool steps must be listed in the chat');
  const revert = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Undo this request');
  assert(revert, 'a finished request with edits must offer to undo it');
  revert.click();
  assert(project.value.clips.subject.props.opacity === 1, 'undoing the request must restore the prior state');
  return { status: 'passed', checks: 4 };
}

export async function verifySource() {
  const p = structuredClone(project.value);
  p.media.m.path = window.sourceFile;
  p.media.m.streams.main.path = window.sourceFile;
  p.media.m.streams.main.duration = 2;
  p.clips.subject.dur = 2;
  project.value = p;
  const frame = await readClipFrame(p.clips.subject);
  assert(
    frame.width === 64 && frame.height === 48,
    'source reader must decode the source at its native small resolution',
  );
  const frames = await readClipFrames(p.clips.subject, 'main', [0.1, 0.6, 1.1]);
  assert(frames.length === 3, 'background analysis must read all requested frames');
  assert(
    frames[0].data.some((v, i) => v !== frames[2].data[i]),
    'seeking must decode different source times',
  );
  return { status: 'passed', checks: 3 };
}

export async function verifyProcessor() {
  const original = project.value.media.m;
  let calls = 0;
  window.api.pluginsList = async () => [];
  window.api.pluginsProcess = async () => ({
    plugin: 'Mock keyer',
    media: {
      ...structuredClone(original),
      id: 'processed-' + ++calls,
      streams: { main: { ...structuredClone(original.streams.main), hasAudio: true } },
    },
  });
  render(<ProcessorEffects clip={project.value.clips.subject} />, document.getElementById('root'));
  await tick();
  document.querySelector('section > header').click();
  await tick();
  window.api.pluginsList = async () => [{ id: 'test', name: 'Mock keyer' }];
  window.dispatchEvent(new Event('reccut:processors-changed'));
  await tick();
  const select = document.querySelector('select');
  assert(select.options.length === 2, 'newly installed processors must appear without reselecting the clip');
  select.value = 'test';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  const run = () =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Process and apply to this clip').click();
  run();
  await tick();
  await tick();
  let m = project.value.media[project.value.clips.subject.mediaId];
  assert(
    m.id === 'processed-1' && m.streams.main.hasAudio === false && m.streams.sourceAudio.hasAudio,
    'first processing must keep original audio on its own source',
  );
  render(<ProcessorEffects clip={project.value.clips.subject} />, document.getElementById('root'));
  await tick();
  run();
  await tick();
  await tick();
  m = project.value.media[project.value.clips.subject.mediaId];
  assert(
    m.id === 'processed-2' && m.streams.main.hasAudio === false && m.streams.sourceAudio.hasAudio,
    'reprocessing must not enable duplicate generated audio',
  );
  assert(project.value.media.m === original, 'original media must remain unchanged');
  undo();
  assert(project.value.clips.subject.mediaId === 'processed-1', 'undo must restore the prior processed source');
  return { status: 'passed', checks: 4 };
}

// The agent measures real decoded source frames and an attached reference image.
export async function verifyLook() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const g = cv.getContext('2d');
  g.fillStyle = '#c87a3c';
  g.fillRect(0, 0, 8, 8);
  let result;
  window.api.aiComplete = async (r) => {
    const tool = r.messages.find((m) => m.role === 'tool');
    if (tool) {
      result = JSON.parse(tool.content);
      return { text: 'Measured.', toolCalls: [] };
    }
    return { text: '', toolCalls: [{ id: 'l1', name: 'analyze_look', args: { clipIds: ['subject'], reference: true } }] };
  };
  await runAgent([{ role: 'user', content: 'Match this', images: [cv.toDataURL('image/png')] }], { signal: new AbortController().signal, onUpdate() {} });
  const clip = result.clips[0];
  assert(!clip.error && clip.source.brightness > 0 && clip.source.brightness < 1, `source frames must be measured: ${JSON.stringify(clip)}`);
  assert(result.reference[0].warmth > 0.3, 'the attached warm reference must measure as warm');
  return { status: 'passed', checks: 2 };
}

// The agent finds a command like a person would, selects a clip and runs the command from the menu.
export async function verifyCommands() {
  const script = [
    { id: 'f1', name: 'find_commands', args: { query: 'enable' } },
    { id: 's1', name: 'select', args: { clipIds: ['subject'], playhead: 0.5 } },
    { id: 'r1', name: 'run_command', args: { id: 'toggleEnabled' } },
    { id: 'g1', name: 'change_settings', args: { app: { titleDur: 6 } } },
  ];
  const results = [];
  window.api.aiComplete = async (r) => {
    const last = r.messages.at(-1);
    if (last.role === 'tool') results.push(last);
    const next = script[results.length];
    return next ? { text: '', toolCalls: [next] } : { text: 'Done.', toolCalls: [] };
  };
  await runAgent([{ role: 'user', content: 'Turn off the clip' }], { signal: new AbortController().signal, onUpdate() {} });
  assert(JSON.parse(results[0].content).some((c) => c.id === 'toggleEnabled' && c.menu === 'Clip'), 'commands must be found with their menu');
  assert(!results.some((r) => r.error), JSON.stringify(results));
  assert(project.value.clips.subject.enabled === false, 'the menu command must act on the selected clip');
  assert(JSON.parse(localStorage.getItem('prefs')).titleDur === 6, 'settings must be saved');
  undo();
  return { status: 'passed', checks: 4 };
}

// Raw footage: the agent inspects a real video, transcribes it and builds a sequence with cuts moved into pauses.
export async function verifyFootage() {
  const done = [];
  window.api.mediaScenes = async () => [[0.9, 0.6], [1.6, 0.2]];
  window.api.startTranscribe = async () => 'job1';
  window.api.onTranscribeDone = (cb) => {
    setTimeout(() => cb({ id: 'job1', segments: [{ start: 0.1, end: 0.3, text: 'Hi' }], words: [{ start: 0.1, end: 0.3, text: 'Hi' }], pauses: [[0.3, 0.9], [1.4, 1.9]] }), 10);
    return () => {};
  };
  const script = [
    { id: 'i1', name: 'inspect_media', args: { mediaId: 'm', from: 0, to: 1.8, frames: 4 } },
    { id: 't1', name: 'transcribe_speech', args: { mediaId: 'm', language: 'english', words: true } },
    { id: 'b1', name: 'build_sequence', args: { replace: true, storyline: [{ mediaId: 'm', sourceIn: 0.5, sourceOut: 1.5 }] } },
  ];
  window.api.aiComplete = async (r) => {
    const last = r.messages.at(-1);
    if (last.role === 'tool') done.push(last);
    const next = script[done.length];
    return next ? { text: '', toolCalls: [next] } : { text: 'Built.', toolCalls: [] };
  };
  await runAgent([{ role: 'user', content: 'Edit my footage' }], { signal: new AbortController().signal, onUpdate() {} });
  assert(!done.some((d) => d.error), JSON.stringify(done.map((d) => d.content)));
  const info = JSON.parse(done[0].content);
  assert(info.frameTimes.length === 4 && info.look.brightness > 0, 'the contact sheet must decode real frames');
  assert(info.sceneChanges[0][0] === 0.9, 'scene changes must be listed with their time');
  assert(done[0].image?.startsWith('data:image/jpeg'), 'the contact sheet must be sent as one image');
  assert(/0\.10 Hi/.test(done[1].content) && /pause 0\.30-0\.90/.test(done[1].content), 'words and pauses must be listed');
  const clip = Object.values(project.value.clips)[0];
  assert(clip.in === 0.75 && clip.dur === 0.8, `cuts in pauses must keep a short breath: ${clip.in} ${clip.dur}`);
  undo();
  return { status: 'passed', checks: 6 };
}

// First run: plain choices, the best model is picked from the provider's list, and the connection is tested.
export async function verifySetup() {
  let saved;
  window.api.aiConfig = async () => (saved ? { ...saved, hasKey: true } : { provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: '', hasKey: false, encryptedStorage: true });
  window.api.aiModels = async () => ['claude-3-haiku-20240307', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-opus-4-1'];
  window.api.aiSave = async (c) => ((saved = c), { ...c, hasKey: true });
  window.api.aiComplete = async () => ({ text: 'OK', toolCalls: [] });
  render(<AIChat key="setup" />, document.getElementById('root'));
  await tick();
  assert(document.querySelector('.agent-setup'), 'without a model the setup assistant is shown');
  [...document.querySelectorAll('.setup-choice')].find((b) => b.textContent.startsWith('Claude')).click();
  await tick();
  const key = document.querySelector('.agent-setup input[type=password]');
  key.value = 'sk-test';
  key.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Connect').click();
  for (let i = 0; i < 5; i++) await tick();
  assert(saved?.model === 'claude-sonnet-4-5' && saved.provider === 'anthropic' && saved.apiKey === 'sk-test', JSON.stringify(saved));
  assert(document.querySelector('.ai-compose'), 'after setup the chat opens');
  const chip = document.querySelector('.model-chip');
  assert(chip?.textContent.includes('Anthropic Claude') && chip.textContent.includes('claude-sonnet-4-5'), `the chat shows the provider and model: ${chip?.textContent}`);
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('What can I ask')).click();
  await tick();
  document.querySelector('.agent-examples button').click();
  await tick();
  assert(document.querySelector('.ai-compose textarea').value.length > 10, 'an example fills in the message');
  chip.click();
  await tick();
  assert(editorCommands.prefsOpen.value && localStorage.getItem('settingsPane') === 'extensions', 'clicking the model opens Settings → AI');
  editorCommands.prefsOpen.value = false;
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('What can I ask')).click();
  await tick();
  return { status: 'passed', checks: 6 };
}

// Motion graphics are imported and placed; a drafted processor is shown for review and only installed on request.
export async function verifyCreative() {
  const steps = [],
    installed = [];
  const png = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    return c.toDataURL('image/png');
  })();
  window.api.gfxRender = async (r) => ((steps.render = r), { file: '/gen/Intro.mp4', previews: [0, 1, 2, 3].map((t) => ({ t, url: png })) });
  window.api.importMedia = async () => ({ items: [{ id: 'g1', name: 'Intro.mp4', kind: 'video', duration: 3, path: '/gen/Intro.mp4', streams: { main: { hasVideo: true, hasAudio: false } } }], failed: [] });
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16" stroke="#fff" stroke-width="2"/></svg>';
  window.api.pluginsDraft = async (a) => ({ manifest: { format: 'reccut-processor-v1', id: 'ai-denoise-1', name: a.name, executable: '/ffmpeg', args: a.args, outputExtension: '.mp4', icon: a.icon, params: a.params }, script: '', description: 'Removes noise.' });
  window.api.pluginsInstall = async (m, opts) => (opts?.accepted === true && installed.push({ ...m, kind: 'ffmpeg', version: 1 }), installed);
  window.api.pluginsList = async () => installed;
  const script = [
    { id: 'g', name: 'create_motion_graphic', args: { name: 'Intro', code: 'function draw(ctx,t){}', duration: 3, at: 0 } },
    { id: 'p', name: 'propose_processor', args: { name: 'Denoise', description: 'Removes noise.', icon, kind: 'ffmpeg', args: ['-i', '{input}', '-vf', 'hqdn3d={param:strength}', '{output}'], params: [{ id: 'strength', label: 'Strength', type: 'number', min: 0, max: 10, default: 4 }], outputExtension: '.mp4' } },
  ];
  let n = 0;
  window.api.aiConfig = async () => ({ provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: 'user-model', hasKey: true, vision: true });
  window.api.aiComplete = async () => (script[n] ? { text: '', toolCalls: [script[n++]] } : { text: 'Done.', toolCalls: [] });
  render(<AIChat key="creative" />, document.getElementById('root'));
  for (let i = 0; i < 3; i++) await tick();
  const input = document.querySelector('.ai-compose textarea');
  input.value = 'Make an intro and remove noise';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click();
  for (let i = 0; i < 12; i++) await tick();
  assert(steps.render?.width === project.value.width && steps.render.duration === 3, 'the graphic is rendered at the project size');
  assert(Object.values(project.value.clips).some((c) => c.mediaId === 'g1' && c.start === 0), 'the graphic is imported and placed');
  assert(document.querySelector('.processor-review') && !installed.length, 'a drafted processor is shown, not installed');
  const installButton = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Install plugin');
  assert(installButton.disabled, 'installing is blocked until the user accepts responsibility');
  const accept = document.querySelector('.processor-review .terms-accept input');
  accept.click();
  await tick();
  installButton.click();
  await tick();
  await tick();
  assert(installed[0]?.id === 'ai-denoise-1', 'Install installs exactly the reviewed manifest');
  // The installed plugin opens as a tool window, is listed under Plugins and runs on the selected clip with its settings.
  let processed;
  window.api.pluginsProcess = async (r) => ((processed = r), new Promise(() => {}));
  window.dispatchEvent(new Event('reccut:processors-changed'));
  await tick();
  const p = structuredClone(project.value);
  p.clips.subject.type = 'video';
  project.value = p;
  selection.value = ['subject'];
  render(
    <div style="padding:20px;position:relative">
      <PluginsButton />
      <PluginWindows />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  assert(openPlugins.value.includes('ai-denoise-1') && document.querySelector('.plugin-window img.plugin-icon'), 'installing opens the tool window with its icon');
  [...document.querySelectorAll('.plugin-window button')].find((b) => b.textContent === 'Apply to selected clip').click();
  await tick();
  assert(processed?.id === 'ai-denoise-1' && processed.params.strength === 4, `the window applies the plugin with its settings: ${JSON.stringify(processed)}`);
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Plugins').click();
  await tick();
  assert([...document.querySelectorAll('.plugin-item')].some((b) => b.textContent.includes('Denoise')), 'the Plugins button lists the plugin');
  // A plugin file opened from Finder is reviewed and installed only after accepting the terms.
  let fromFile;
  window.api.pluginsReadFile = async () => ({ pkg: { id: 'grain' }, manifest: { id: 'grain', name: 'Film grain', version: 3, author: 'Ada', kind: 'python', args: ['{script}', '{input}', '{output}'], outputExtension: '.mov' }, script: 'print(1)', updates: 2 });
  window.api.pluginsInstallPackage = async (pkg, opts) => ((fromFile = { pkg, opts }), installed);
  await openPluginFile('/Downloads/Film grain.reccut-plugin');
  await tick();
  const dialog = [...document.querySelectorAll('.modal')].find((m) => m.textContent.includes('Film grain'));
  assert(dialog?.textContent.includes('by Ada') && dialog.textContent.includes('own risk'), 'the file is shown with its author and the responsibility terms');
  dialog.querySelector('.terms-accept input').click();
  await tick();
  [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Update plugin').click();
  await tick();
  assert(fromFile?.opts.accepted === true && fromFile.pkg.id === 'grain', 'the reviewed file is installed as an update');
  // Sharing asks for the creator terms first.
  let shared;
  window.api.pluginsExport = async (id, opts) => ((shared = { id, opts }), null);
  exportingPlugin.value = 'ai-denoise-1';
  await tick();
  const share = [...document.querySelectorAll('.modal')].find((m) => m.textContent.includes('Share Denoise'));
  const exportButton = [...share.querySelectorAll('button')].find((b) => b.textContent === 'Export…');
  assert(exportButton.disabled, 'sharing is blocked until the terms are accepted');
  share.querySelector('.terms-accept input').click();
  await tick();
  exportButton.click();
  await tick();
  assert(shared?.opts.accepted === true, 'export passes the accepted terms');
  exportingPlugin.value = null;
  return { status: 'passed', checks: 12 };
}

// Higgsfield comes with Reccut as a plugin: listed first in Settings → Plugins, set up once, then used from its window.
export async function verifyBuiltinPlugins() {
  let saved, generated;
  let cfg = { textModel: 'kling-video/v3.0/std/text-to-video', imageModel: 'kling-video/v3.0/std/image-to-video', confirm: false, hasKey: false };
  window.api.genConfig = async () => cfg;
  window.api.genSave = async (c) => ((saved = c), (cfg = { ...cfg, hasKey: true }));
  window.api.genVideo = async (r) => ((generated = r), { file: '/gen/shot.mp4', model: cfg.textModel });
  window.api.importMedia = async () => ({ items: [{ id: 'hf1', name: 'shot.mp4', kind: 'video', duration: 5, path: '/gen/shot.mp4', streams: { main: { hasVideo: true, hasAudio: false } } }], failed: [] });
  window.api.pluginsList = async () => [];
  render(
    <div style="width:700px">
      <PluginsPane />
      <PluginWindows />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  const first = document.querySelector('.processor-row');
  assert(first?.textContent.includes('Higgsfield AI Video') && first.textContent.includes('Built in'), 'Higgsfield is listed as a built-in plugin');
  assert(![...first.querySelectorAll('button')].some((b) => b.textContent === 'Remove'), 'a built-in plugin cannot be removed');
  openPlugin('higgsfield');
  await tick();
  await tick();
  const win = document.querySelector('.plugin-window');
  assert(win?.textContent.includes('Higgsfield Console'), 'without a key the window shows the setup');
  const [keyId, secret] = win.querySelectorAll('input');
  keyId.value = 'kid_1';
  keyId.dispatchEvent(new Event('input', { bubbles: true }));
  secret.value = 'sec_1';
  secret.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...win.querySelectorAll('button')].find((b) => b.textContent === 'Save').click();
  await tick();
  await tick();
  assert(saved?.keyId === 'kid_1' && saved.keySecret === 'sec_1', 'the key is saved from the window');
  const prompt = document.querySelector('.plugin-window textarea');
  assert(prompt, 'after setup the window lets you describe a shot');
  prompt.value = 'A drone shot over a fjord at sunrise';
  prompt.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('.plugin-window button')].find((b) => b.textContent === 'Generate video').click();
  for (let i = 0; i < 4; i++) await tick();
  assert(generated?.prompt === 'A drone shot over a fjord at sunrise' && generated.duration === 5, 'the window generates with the description');
  assert(Object.values(project.value.clips).some((c) => c.mediaId === 'hf1' && c.lane >= 1), 'the generated clip is imported and placed at the playhead');
  // The gear in the window opens Settings → Plugins at this plugin.
  document.querySelector('.plugin-window header button[title="Higgsfield AI Video settings"]').click();
  await tick();
  assert(editorCommands.prefsOpen.value && localStorage.getItem('settingsPane') === 'plugins' && settingsFocus.value === 'higgsfield', 'the gear opens the plugin settings');
  editorCommands.prefsOpen.value = false;
  // A plugin's saved settings are its defaults in the window; Reset goes back to the plugin's own defaults.
  let processed;
  window.api.pluginsProcess = async (r) => ((processed = r), new Promise(() => {}));
  const denoise = { id: 'd1', name: 'Denoise', kind: 'ffmpeg', version: 2, params: [{ id: 'strength', label: 'Strength', type: 'number', min: 0, max: 10, step: 1, default: 4 }] };
  plugins.value = [denoise];
  setPrefs({ pluginSettings: { d1: { strength: 7 } } });
  const p = structuredClone(project.value);
  p.clips.subject.type = 'video';
  project.value = p;
  selection.value = ['subject'];
  settingsFocus.value = 'd1';
  openPlugins.value = ['d1'];
  render(
    <div style="width:700px">
      <PluginsPane />
      <PluginWindows />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  assert(document.querySelector('#plugin-d1 .plugin-settings'), 'the focused plugin shows its settings');
  [...document.querySelectorAll('.plugin-window button')].find((b) => b.textContent === 'Apply to selected clip').click();
  await tick();
  assert(processed?.params.strength === 7, `the window starts from the saved settings: ${JSON.stringify(processed?.params)}`);
  [...document.querySelectorAll('.plugin-settings .link')].find((b) => b.textContent.includes('Reset')).click();
  await tick();
  assert(prefs.value.pluginSettings.d1.strength === 4, 'Reset restores the plugin defaults');
  openPlugins.value = [];
  return { status: 'passed', checks: 11 };
}
