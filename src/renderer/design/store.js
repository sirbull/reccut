import {prefs} from '../prefs.js';
import {brandLayer} from '../../shared/designBrand.js';
import { signal, computed, effect, batch } from '@preact/signals';
import { produce, current as draftSnapshot } from 'immer';
import { project, projectEpoch, scheduleSave } from '../editor/store.js';
import { designList, newDesign, newLayer, reorderLayers, groupSelectionIds, groupDesignLayers, ungroupDesignLayers, alignDesignLayers, distributeDesignLayers, DESIGN_SHAPES } from '../../shared/design.js';
import { toast } from '../ui.jsx';
import { uid } from '../../shared/model.js';
import { fitDesignBadges } from './badges.js';

export const currentDesignId = signal(null);
export const selection = signal([]);
export const tool = signal('select');
export const shapeType = signal('rect');
export const zoom = signal('fit');
export const viewScale = signal(1);
export const pan = signal({ x: 0, y: 0 });
export const newDesignOpen = signal(false);
export const exportDesignOpen = signal(false);
export const historyVersion = signal(0);
export const historyNavigation = signal(0);
export const currentDesign = computed(() => project.value.designs?.[currentDesignId.value] || null);
const undoStack = [], redoStack = [];
let transient = null;
const pair = () => ({ designs: project.value.designs || {}, designAssets: project.value.designAssets || {} });
const same = (a, b) => a.designs === b.designs && a.designAssets === b.designAssets;
function fitChangedBadges(draft,previous) {
  for(const [id,design] of Object.entries(draftSnapshot(draft).designs)){
    if(design===previous.designs[id])continue;
    const fitted=fitDesignBadges(design,previous.designs[id]);
    if(fitted!==design)draft.designs[id]=fitted;
  }
}
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
  const prev = pair(), next = produce(prev, (d) => { mutator(d); fitChangedBadges(d,prev); });
  if (same(prev, next)) return;
  push(prev); write(next); scheduleSave();
}
export function beginDesignTransient() {
  endDesignTransient(); transient = { base: pair(), epoch: projectEpoch.value };
}
export function updateDesignTransient(mutator) {
  if (!transient) beginDesignTransient();
  if (transient.epoch !== projectEpoch.value) return;
  write(produce(transient.base, (d) => { mutator(d); fitChangedBadges(d,transient.base); }));
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
  historyNavigation.value++; redoStack.push(pair()); write(undoStack.pop()); historyVersion.value++; scheduleSave();
}
export function designRedo() {
  endDesignTransient();
  if (!redoStack.length) return;
  historyNavigation.value++; undoStack.push(pair()); write(redoStack.pop()); historyVersion.value++; scheduleSave();
}
export const canDesignUndo = () => (historyVersion.value, undoStack.length > 0);
export const canDesignRedo = () => (historyVersion.value, redoStack.length > 0);
export function changeDesign(mutator) {
  const id = currentDesignId.value;
  if (id) designCommit((p) => { if (p.designs[id]) mutator(p.designs[id]); });
}
export function selectedLayers() {
  const picked = currentDesign.value?.layers.filter((l) => selection.value.includes(l.id)) || [];
  const lockedGroups = new Set(picked.filter((l) => l.locked && l.group).map((l) => l.group));
  return picked.filter((l) => !l.locked && !lockedGroups.has(l.group));
}
export function changeLayers(mutator) {
  const ids = new Set(selectedLayers().map((l) => l.id));
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
  const l = brandLayer(newLayer('text', { text: project.value.name, x: x ?? (d.width - w) / 2, y: y ?? (d.height - h) / 2, w, h, size: Math.max(6, d.height * 0.1) }),prefs.value.designBrand,prefs.value.designBrandFonts);
  changeDesign((d) => { d.layers.push(l); }); selection.value = [l.id]; tool.value = 'select';
  return l;
}
export function deleteSelection() {
  const ids = new Set(selectedLayers().map((l) => l.id));
  if (!ids.size) return;
  changeDesign((d) => { d.layers = d.layers.filter((l) => !ids.has(l.id)); }); selection.value = [];
}
export function duplicateSelection() {
  const layers = selectedLayers(), groups = new Map(), copies = [];
  if (!layers.length) return;
  for (const l of layers) {
    if (l.group && !groups.has(l.group)) groups.set(l.group, uid());
    copies.push({ ...l, id: uid(), group: groups.get(l.group) || null, name: `${l.name} copy`, x: l.x + 20, y: l.y + 20 });
  }
  changeDesign((d) => { d.layers.push(...copies); }); selection.value = copies.map((l) => l.id);
}
export function moveSelection(dx, dy) { changeLayers((l) => { l.x += dx; l.y += dy; }); }
export function orderSelection(direction) {
  const ids = groupSelectionIds(currentDesign.value?.layers || [], selectedLayers().map((l) => l.id));
  if (!ids.length) return;
  if (currentDesign.value.layers.some((l) => ids.includes(l.id) && l.locked)) return toast('Unlock the group before changing its order.');
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

export function selectLayer(id, { toggle = false, single = false } = {}) {
  const layers = currentDesign.value?.layers || [];
  const ids = single ? [id] : groupSelectionIds(layers, [id]);
  selection.value = toggle ? ids.every((id) => selection.value.includes(id)) ? selection.value.filter((id) => !ids.includes(id)) : [...new Set([...selection.value, ...ids])] : ids;
}
export function groupSelection(ungroup = false) {
  try {
    changeDesign((d) => { d.layers = (ungroup ? ungroupDesignLayers : groupDesignLayers)(d.layers, selection.value); });
    selection.value = groupSelectionIds(currentDesign.value?.layers || [], selection.value);
  } catch (err) { toast(err.message); }
}
export function alignSelection(mode) {
  const layers = selectedLayers(), d = currentDesign.value;
  if (!d || !layers.length) return;
  const next = new Map(alignDesignLayers(layers, d, mode).map((l) => [l.id, l]));
  changeDesign((d) => { d.layers = d.layers.map((l) => next.get(l.id) || l); });
}
export function distributeSelection(axis) {
  const layers = selectedLayers(); if (layers.length < 3) return;
  const next = new Map(distributeDesignLayers(layers, axis).map((l) => [l.id, l]));
  changeDesign((d) => { d.layers = d.layers.map((l) => next.get(l.id) || l); });
}
export function cycleShape() {
  shapeType.value = DESIGN_SHAPES[(DESIGN_SHAPES.findIndex((s) => s.value === shapeType.value) + 1) % DESIGN_SHAPES.length].value;
  tool.value = 'shape';
}

// Retain only assets actually referenced by a layer in current or undo/redo
// snapshots. Unused asset records themselves must not keep masks forever.
effect(()=>{
  historyVersion.value;projectEpoch.value;
  if(!window.api.retainDesignCutouts)return;
  Promise.resolve().then(()=>{
    const p=project.peek(),paths=new Set();
    for(const snapshot of [pair(),...undoStack,...redoStack])for(const d of Object.values(snapshot.designs||{}))for(const l of d.layers||[])for(const id of[l.asset,l.cutout?.asset,l.mask?.asset]){const a=snapshot.designAssets?.[id];if(a?.origin==='cutout'&&a.path)paths.add(a.path);}
    window.api.retainDesignCutouts(p.id,[...paths]).catch(()=>{});
  });
});
window.api.onDesignCutoutsCollected?.(({projectId,assetIds})=>{
  if(project.peek().id!==projectId)return;
  const clean=snapshot=>produce(snapshot,d=>{for(const id of assetIds)delete d.designAssets[id];});
  for(let i=0;i<undoStack.length;i++)undoStack[i]=clean(undoStack[i]);
  for(let i=0;i<redoStack.length;i++)redoStack[i]=clean(redoStack[i]);
  write(clean(pair()));
});
