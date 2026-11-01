import { render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Browser } from '../src/renderer/editor/Browser.jsx';
import { Inspector } from '../src/renderer/editor/Inspector.jsx';
import { Timeline } from '../src/renderer/editor/Timeline.jsx';
import { Toasts, toasts } from '../src/renderer/ui.jsx';
import { project, selection, endPreview, historyVersion, setTime, timeSig, undo, redo, tool } from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import { newProject, makeClip, computeFrame } from '../src/shared/model.js';
import { drawFrame } from '../src/shared/render.js';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const tick = () => new Promise((r) => setTimeout(r, 60));
let image;
function Harness() {
  const [p, setP] = useState(project.value), cv = useRef(null);
  useEffect(() => { const timer = setInterval(() => setP(project.value), 20); return () => clearInterval(timer); }, []);
  useLayoutEffect(() => {
    drawFrame(cv.current.getContext('2d'), p, computeFrame(p, 1), () => ({ img: image, w: 640, h: 360 }));
  }, [p]);
  return <div class="editor" style="height:100vh;grid-template-rows:minmax(0,1fr) 250px">
    <div class="editor-top" style="grid-template-columns:240px minmax(260px,1fr) 340px">
      <Browser />
      <div class="panel" style="display:flex;flex-direction:column;justify-content:center;gap:16px;padding:20px;min-width:0">
        <canvas ref={cv} width="640" height="360" style="width:100%;height:auto;border-radius:6px" />
        <p class="hint" style="text-align:center">Adjustment layer · effects on the tracks below</p>
      </div>
      <Inspector />
    </div><Timeline /><Toasts />
  </div>;
}
export async function verifyAdjustmentUI() {
  const p = newProject('Adjustment layers'); p.width = 640; p.height = 360; p.autoFormat = false;
  p.media.m = { id: 'm', kind: 'image', name: 'Color study', streams: { main: { width: 640, height: 360, hasVideo: true } } };
  const c = makeClip('image', { media: p.media.m, dur: 8 }); p.clips[c.id] = c; p.primary = [c.id]; p.duration = 8;
  image = document.createElement('canvas'); image.width = 640; image.height = 360;
  const cx = image.getContext('2d'), gradient = cx.createLinearGradient(0, 0, 640, 360);
  gradient.addColorStop(0, '#275ca5'); gradient.addColorStop(0.5, '#b96993'); gradient.addColorStop(1, '#edb57b');
  cx.fillStyle = gradient; cx.fillRect(0, 0, 640, 360);
  cx.fillStyle = '#ffffffb0'; cx.font = 'bold 48px sans-serif'; cx.fillText('COLOR STUDY', 55, 170);
  cx.font = '18px sans-serif'; cx.fillText('Grain · analog color · soft light', 58, 205);
  project.value = p; selection.value = []; timeSig.value = 1; setTime(1); tool.value = 'select';
  commands.browserTab.value = 'effects'; commands.browserFocus.value = false; commands.inspectorTab.value = null;
  render(<Harness />, document.getElementById('root')); await tick();
  assert(document.querySelector('[data-adjustment="empty"]'), 'Effects browser must offer an adjustment layer');
  assert(document.querySelectorAll('[data-stylize]').length === 8, 'Effects browser must expose all eight creative effects');
  document.querySelector('[data-adjustment="empty"]').click(); await tick();
  const id = selection.value[0], layer = () => project.value.clips[id];
  assert(layer().type === 'adjustment' && layer().lane > 0 && !layer().mediaId, 'new adjustment must be a source-free layer above the picture');
  assert(document.querySelector(`[data-clip="${id}"] .badge`).textContent === 'ADJ', 'timeline must identify adjustment layers');
  assert(document.querySelector('[data-tab="color"]') && document.querySelector('[data-tab="masks"]'), 'adjustments need Color and Masks tabs');
  assert(!document.querySelector('.inspector [data-tab="audio"]') && !document.querySelector('.inspector [data-tab="speed"]'), 'adjustments must omit source-only tabs');
  const add = () => [...document.querySelectorAll('.inspector select')].find((s) => [...s.options].some((o) => o.textContent === 'Add stack effect…'));
  const choose = async (value) => { const s = add(); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); await tick(); };
  // Unsupported effects warn through every entry point without changing history.
  toasts.value = [];
  const before = project.value, history = historyVersion.value;
  const classic = [...document.querySelectorAll('.inspector select')].find((s) => [...s.options].some((o) => o.textContent === 'Add effect'));
  classic.value = 'shadow'; classic.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(document.querySelector('.toast')?.textContent.includes('Drop Shadow does not work on adjustment layers'), 'inspector must explain why shadow cannot be added');
  assert(project.value === before && historyVersion.value === history, 'rejected effect must not change the project or add an undo step');
  toasts.value = [];
  commands.previewEffect('shadow'); await tick();
  assert(!toasts.value.length && !layer().props.shadow, 'unsupported hover preview must be silent and leave the layer alone');
  const shadowCard = [...document.querySelectorAll('.gen-card')].find((b) => b.textContent.trim() === 'Drop Shadow');
  shadowCard.click(); await tick();
  assert(toasts.value.length === 1 && !layer().props.shadow, 'browser click must warn once and skip unsupported shadow');
  const dropEffect = async (kind, effect) => {
    const data = new DataTransfer(); data.setData('application/x-reccut', JSON.stringify({ kind, id: effect }));
    toasts.value = []; await commands.handleDrop(data, layer().lane, 1); await tick();
  };
  await dropEffect('effect', 'shadow');
  assert(toasts.value.length === 1 && toasts.value[0].text.includes('Drop Shadow') && !layer().props.shadow, 'dropping shadow onto an adjustment must warn');
  await dropEffect('afx', 'gain');
  assert(toasts.value.length === 1 && toasts.value[0].text.includes('Audio effects') && !layer().props.afx?.length, 'dropping an audio effect onto an adjustment must warn');
  toasts.value = [];
  selection.value = [c.id, id]; await tick();
  commands.previewEffect('shadow'); await tick();
  assert(project.value.clips[c.id].props.shadow > 0 && !layer().props.shadow && !toasts.value.length, 'mixed hover preview must only affect supported clips');
  endPreview();
  commands.addEffect('shadow'); await tick();
  assert(project.value.clips[c.id].props.shadow > 0 && !layer().props.shadow && !layer().props.fx.includes('shadow') && toasts.value.length === 1, 'mixed selection must add to source clips while skipping adjustment layers');
  undo(); await tick();
  assert(!project.value.clips[c.id].props.shadow, 'valid part of mixed edit must undo in one step');
  selection.value = [id]; toasts.value = []; await tick();
  commands.addEffect('border'); await tick();
  assert(layer().props.border > 0 && !toasts.value.length, 'supported frame effects must remain available without warnings');
  undo(); await tick();
  await choose('noise');
  assert(layer().props.vfx[0].type === 'noise' && document.querySelector('[data-vfx="noise"]'), 'effect stack must edit adjustments');
  assert(![...document.querySelectorAll('.inspector button')].some((b) => b.textContent.includes('Remove solid background')), 'adjustments should not offer source sampling');
  undo(); await tick(); assert(layer().props.vfx.length === 0, 'adding an effect must undo');
  redo(); await tick(); assert(layer().props.vfx.length === 1, 'adding an effect must redo');
  document.querySelector('[data-stylize="vhs"]').click(); await tick();
  assert(layer().props.vfx.length === 2 && layer().props.vfx[1].type === 'vhs', 'browser effects must append to a selected adjustment');
  const tapePreset = document.querySelector('[data-vfx="vhs"] select');
  tapePreset.value = 'ep'; tapePreset.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(layer().props.vfx[1].p.softness === 0.9 && layer().props.vfx[1].p.tracking === 0.65, 'VHS presets must set the complete analog treatment');
  undo(); await tick(); assert(layer().props.vfx[1].p.softness === 0.65, 'a preset change must undo as one edit');
  await choose('filmGrain');
  const filmPreset = document.querySelector('[data-vfx="filmGrain"] select');
  filmPreset.value = '16mm'; filmPreset.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(layer().props.vfx[2].p.size === 1.8, 'film-grain presets must be editable');
  assert(document.querySelector('[data-vfx="filmGrain"] details'), 'film damage controls must have an advanced section');
  await choose('chromatic');
  assert(layer().props.vfx[3].type === 'chromatic' && document.querySelector('[data-vfx="chromatic"]'), 'chromatic aberration must be a separate effect');
  document.querySelector('[data-tab="color"]').click(); await tick();
  const exposure = document.querySelector('[data-prop="exposure"] input[type="range"]');
  exposure.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); exposure.value = '20';
  exposure.dispatchEvent(new Event('input', { bubbles: true })); exposure.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(layer().props.exposure === 0.2 && project.value.clips[c.id].props.exposure === 0, 'Color tab must change the adjustment without editing source clips');
  commands.addMaskToSelected('ellipse'); await tick();
  assert(layer().props.masks.length === 1 && document.querySelector('[data-mask]'), 'adjustments must accept editable masks');
  undo(); await tick(); assert(!layer().props.masks?.length, 'adding a mask must undo');
  document.querySelector('[data-tab="video"]').click(); await tick();
  const opacity = document.querySelector('[data-prop="opacity"] input[type="range"]');
  opacity.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); opacity.value = '65';
  opacity.dispatchEvent(new Event('input', { bubbles: true })); opacity.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  assert(layer().props.opacity === 0.65, 'Layer strength must control adjustment opacity');
  const dt = new DataTransfer(); dt.setData('application/x-reccut', JSON.stringify({ kind: 'effect', id: 'glitch' }));
  await commands.handleDrop(dt, layer().lane + 1, 1); await tick();
  const preset = project.value.clips[selection.value[0]];
  assert(preset.type === 'adjustment' && preset.props.vfx[0].type === 'glitch', 'dragging a style to an empty video track must create an adjustment preset');
  undo(); await tick(); selection.value = [id];
  commands.inspectorTab.value = 'effects'; await tick();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'adjustment controls must fit the editor');
  return { status: 'passed', checks: 32 };
}
