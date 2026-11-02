import { signal, computed, effect, batch } from '@preact/signals';
import { produce } from 'immer';
import { project, projectEpoch, scheduleSave } from '../editor/store.js';
import { designList, newDesign, newLayer, reorderLayers } from '../../shared/design.js';
import { uid } from '../../shared/model.js';

export const currentDesignId = signal(null);
export const selection = signal([]);
export const tool = signal('select');
export const zoom = signal('fit');
export const viewScale = signal(1);
export const pan = signal({ x: 0, y: 0 });
export const newDesignOpen = signal(false);
export const exportDesignOpen = signal(false);
export const historyVersion = signal(0);
export const currentDesign = computed(() => project.value.designs?.[currentDesignId.value] || null);
const undoStack = [], redoStack = [];
let transient = null;
const pair = () => ({ designs: project.value.designs || {}, designAssets: project.value.designAssets || {} });
const same = (a, b) => a.designs === b.designs && a.designAssets === b.designAssets;
function write(value) {
  project.value = { ...project.value, ...value };
  const list = designList(project.value);
  if (!project.value.designs[currentDesignId.value]) currentDesignId.value = list[0]?.id || null;
  const ids = new Set(currentDesign.value?.layers.map((l) => l.id) || []);
  if (selection.value.some((id) => !ids.has(id))) selection.value = selection.value.filter((id) => ids.has(id));
}
function push(prev) {
  undoStack.push(prev);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  historyVersion.value++;
}
effect(() => {
  projectEpoch.value;
  batch(() => {
    undoStack.length = redoStack.length = 0; transient = null;
    currentDesignId.value = null; selection.value = []; tool.value = 'select'; zoom.value = 'fit'; pan.value = { x: 0, y: 0 };
    newDesignOpen.value = exportDesignOpen.value = false; historyVersion.value = historyVersion.peek() + 1;
  });
});
export function openDesign(id) {
  endDesignTransient();
  currentDesignId.value = id; selection.value = []; zoom.value = 'fit'; pan.value = { x: 0, y: 0 };
}
export function designCommit(mutator) {
  endDesignTransient();
  const prev = pair(), next = produce(prev, (d) => { mutator(d); });
  if (same(prev, next)) return;
  push(prev); write(next); scheduleSave();
}
export function beginDesignTransient() {
  endDesignTransient(); transient = { base: pair(), epoch: projectEpoch.value };
}
export function updateDesignTransient(mutator) {
  if (!transient) beginDesignTransient();
  if (transient.epoch !== projectEpoch.value) return;
  write(produce(transient.base, (d) => { mutator(d); }));
}
export function endDesignTransient(keep = true) {
  if (!transient) return;
  const { base, epoch } = transient;
  transient = null;
  if (epoch !== projectEpoch.value) return;
  if (!keep) write(base);
  else if (!same(base, pair())) { push(base); scheduleSave(); }
}
export function designUndo() {
  endDesignTransient();
  if (!undoStack.length) return;
  redoStack.push(pair()); write(undoStack.pop()); historyVersion.value++; scheduleSave();
}
export function designRedo() {
  endDesignTransient();
  if (!redoStack.length) return;
  undoStack.push(pair()); write(redoStack.pop()); historyVersion.value++; scheduleSave();
}
export const canDesignUndo = () => (historyVersion.value, undoStack.length > 0);
export const canDesignRedo = () => (historyVersion.value, redoStack.length > 0);
export function changeDesign(mutator) {
  const id = currentDesignId.value;
  if (id) designCommit((p) => { if (p.designs[id]) mutator(p.designs[id]); });
}
export function selectedLayers() {
  return currentDesign.value?.layers.filter((l) => selection.value.includes(l.id) && !l.locked) || [];
}
export function changeLayers(mutator) {
  const ids = new Set(selection.value);
  changeDesign((d) => { for (const l of d.layers) if (ids.has(l.id) && !l.locked) mutator(l); });
}
export function addDesign(options) {
  const d = newDesign(options);
  designCommit((p) => { p.designs[d.id] = d; }); openDesign(d.id);
  return d;
}
export function addText(x, y) {
  const d = currentDesign.value;
  if (!d) return;
  const w = d.width * 0.8, h = d.height * 0.3;
  const l = newLayer('text', { text: project.value.name, x: x ?? (d.width - w) / 2, y: y ?? (d.height - h) / 2, w, h, size: Math.max(6, d.height * 0.1) });
  changeDesign((d) => { d.layers.push(l); }); selection.value = [l.id]; tool.value = 'select';
  return l;
}
export function deleteSelection() {
  const ids = new Set(selectedLayers().map((l) => l.id));
  if (!ids.size) return;
  changeDesign((d) => { d.layers = d.layers.filter((l) => !ids.has(l.id)); }); selection.value = [];
}
export function duplicateSelection() {
  const ids = new Set(selectedLayers().map((l) => l.id)), copies = [];
  if (!ids.size) return;
  changeDesign((d) => {
    d.layers = d.layers.flatMap((l) => {
      if (!ids.has(l.id) || l.locked) return [l];
      const copy = { ...l, id: uid(), name: `${l.name} copy`, x: l.x + 20, y: l.y + 20 };
      copies.push(copy.id); return [l, copy];
    });
  }); selection.value = copies;
}
export function moveSelection(dx, dy) { changeLayers((l) => { l.x += dx; l.y += dy; }); }
export function orderSelection(direction) {
  const ids = selectedLayers().map((l) => l.id);
  if (!ids.length) return;
  changeDesign((d) => {
    const next = reorderLayers(d.layers, ids, direction);
    if (next.some((l, i) => l.id !== d.layers[i].id)) d.layers = next;
  });
}
export function selectAll() { selection.value = currentDesign.value?.layers.filter((l) => !l.locked).map((l) => l.id) || []; }
export function setZoom(value) {
  zoom.value = value === 'fit' ? value : Math.min(8, Math.max(0.02, value));
  if (value === 'fit') pan.value = { x: 0, y: 0 };
}
