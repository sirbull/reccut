import { signal, effect } from '@preact/signals';
import { project, projectEpoch, projectFolders, projectPath } from '../editor/store.js';
import { prefs } from '../prefs.js';
import { fileUrl } from '../player.js';
import { newLayer, normalizeLayer, fitBox } from '../../shared/design.js';
import { designFileName } from '../../shared/designExport.js';
import { frameExportSettings } from '../../shared/frameExport.js';
import { uid } from '../../shared/model.js';
import { currentDesignId, currentDesign, designCommit, selection, selectedLayers } from './store.js';
import { prepareDesignLayers } from './layered.js';
import { clearDesignRenderCache } from '../../shared/designRender.js';
import { toast } from '../ui.jsx';

const api = window.api;
const sep = api.platform === 'win32' ? '\\' : '/';
export const imageVersion = signal(0);
const images = new Map();
let cacheGeneration = 0;
effect(() => {
  projectEpoch.value; cacheGeneration++;
  for (const entry of images.values()) entry.preview?.close?.();
  images.clear(); clearDesignRenderCache(); imageVersion.value = imageVersion.peek() + 1;
});
export async function designDir(sub = 'Assets') {
  const file = projectPath.value;
  const folders = projectFolders.value || (file ? await api.projectFolders(file) : null);
  return `${folders?.designs || `${await api.baseDir()}${sep}Designs`}${sep}${sub}`;
}
export function imagePath(layer, p = project.value) {
  if (layer.data?.startsWith('data:image/')) return layer.data;
  if (layer.asset) return p.designAssets?.[layer.asset]?.path;
  const m = p.media?.[layer.media];
  return m?.kind === 'image' ? m.streams?.main?.proxy || m.streams?.main?.path || m.path : null;
}
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not read ${path.split(/[\\/]/).pop()}.`));
    img.src = path.startsWith('data:image/')?path:fileUrl(path);
  });
}
export function ensureImage(path) {
  if (!path) return Promise.resolve(null);
  let entry = images.get(path);
  if (entry) return entry.promise;
  entry = { image: null, preview: null, error: null };
  images.set(path, entry);
  const generation = cacheGeneration;
  entry.promise = loadImage(path).then(async (img) => {
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error('The image has no visible pixels.');
    let preview = img;
    if (Math.max(img.naturalWidth, img.naturalHeight) > 4096) {
      const k = 4096 / Math.max(img.naturalWidth, img.naturalHeight);
      preview = await createImageBitmap(img, { resizeWidth: Math.max(1, Math.round(img.naturalWidth * k)), resizeHeight: Math.max(1, Math.round(img.naturalHeight * k)), resizeQuality: 'high' });
    }
    if (generation !== cacheGeneration) { preview?.close?.(); return null; }
    entry.image = img; entry.preview = preview; imageVersion.value++;
    return img;
  }).catch((err) => { if (generation === cacheGeneration) { entry.error = err; imageVersion.value++; } return null; });
  return entry.promise;
}
export function getImageAtPath(path, full = false) { const entry=images.get(path);return full?entry?.image||null:entry?.preview||null; }
export function getImage(layer, full = false) {
  const path = imagePath(layer), entry = images.get(path);
  return full ? entry?.image || null : entry?.preview || null;
}
export function imageMissing(layer) {
  const path = imagePath(layer);
  const entry = images.get(path);
  return !path || Boolean(entry?.error) || (!entry?.image && Boolean(project.value.designAssets?.[layer.asset]?.missing));
}
export async function loadDesignImages(design, p = project.value) {
  const layers = design.layers.filter((l) => l.type === 'image' && !l.hidden);
  await Promise.all(layers.filter(l=>l.cutout?.enabled).map(l=>ensureImage(p.designAssets?.[l.cutout.asset]?.path)));
  const loaded = await Promise.all(layers.map((l) => ensureImage(imagePath(l, p))));
  return layers.filter((_, i) => !loaded[i]);
}
export async function chooseImage(copy = prefs.value.importCopy) {
  const epoch = projectEpoch.value, designId = currentDesignId.value;
  const path = await api.openFileDialog({ title: copy ? 'Place Embedded' : 'Place Linked', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'psd', 'psb'] }] });
  if (path && epoch === projectEpoch.value) await placeFiles([path], { copy, epoch, designId });
}
export function requestPlace(paths, point = null, alternate = false) {
  return placeFiles(paths, { point, copy: alternate ? !prefs.value.importCopy : prefs.value.importCopy });
}
export async function placeFiles(paths, { copy = prefs.value.importCopy, point = null, designId = currentDesignId.value, epoch = projectEpoch.value, copied: ownFile = false } = {}) {
  const assets = [], groups = new Map();
  for (const original of paths) {
    try {
      if (!/\.(png|jpe?g|webp|gif|bmp|svg|psd|psb)$/i.test(original)) throw new Error('Choose a PNG, JPEG, WebP, GIF, BMP, SVG, PSD or PSB image.');
      const name = original.split(/[\\/]/).pop();
      let files = [{ path: original, name, owned: ownFile }];
      if (/\.(psd|psb|svg)$/i.test(original)) {
        const base = designFileName(name.replace(/\.[^.]+$/, ''));
        const prepared = await prepareDesignLayers(original, `${await designDir()}${sep}${base}${sep}${uid()}`, epoch);
        if (!prepared) continue;
        files = prepared.files;
      }
      const group = files.length > 1 ? uid() : null;
      for (const file of files) {
        if (epoch !== projectEpoch.value) return;
        let path = file.path;
        const image = await ensureImage(path);
        if (!image) throw new Error(`Could not read ${file.name}.`);
        if (epoch !== projectEpoch.value) return;
        if (copy && !file.owned) [path] = await api.copyIntoProject([path], await designDir(), { unique: true });
        const asset = { id: uid(), name: file.name, path, copied: copy || file.owned, origin: 'placed', width: image.naturalWidth, height: image.naturalHeight, missing: false };
        if (path !== file.path) await ensureImage(path);
        assets.push(asset);
        if (group) groups.set(asset.id, { group, groupName: name.replace(/\.[^.]+$/, '') });
      }
    } catch (err) { toast(`Could not place ${original.split(/[\\/]/).pop()}: ${err.message}`, { kind: 'error' }); }
  }
  if (epoch !== projectEpoch.value || !project.value.designs?.[designId] || !assets.length) return;
  const ids = [];
  designCommit((p) => {
    const d = p.designs[designId];
    for (const asset of assets) {
      p.designAssets[asset.id] = asset;
      const b = fitBox(asset.width, asset.height, d.width * 0.9, d.height * 0.9);
      const l = newLayer('image', { asset: asset.id, name: asset.name, ...groups.get(asset.id), x: point ? point.x - b.w / 2 : (d.width - b.w) / 2, y: point ? point.y - b.h / 2 : (d.height - b.h) / 2, w: b.w, h: b.h, fit: 'contain' });
      d.layers.push(l); ids.push(l.id);
    }
  });
  if (currentDesignId.value === designId) selection.value = ids;
}
export function placeProjectImage(media) {
  const d = currentDesign.value;
  if (!d || media.kind !== 'image') return;
  const st = media.streams?.main || {};
  const b = fitBox(st.width || d.width, st.height || d.height, d.width * 0.9, d.height * 0.9);
  const l = newLayer('image', { media: media.id, name: media.name, x: (d.width - b.w) / 2, y: (d.height - b.h) / 2, w: b.w, h: b.h, fit: 'contain' });
  designCommit((p) => { p.designs[d.id].layers.push(l); }); selection.value = [l.id];
}
export async function copyLayers(cut = false) {
  const epoch = projectEpoch.value, design = currentDesign.value, layers = selectedLayers(), p = project.value;
  if (!design || !layers.length) return;
  const assets = {}, media = {};
  const reference = (id) => { if (id && p.designAssets[id]) assets[id] = p.designAssets[id]; };
  for (const l of layers) {
    reference(l.asset); reference(l.cutout?.asset); reference(l.mask?.asset);
    if (l.media && imagePath(l, p)) {
      const m = p.media[l.media];
      media[l.media] = { id: l.media, path: imagePath(l, p), name: m.name, copied: false, origin: 'placed', width: m.streams?.main?.width, height: m.streams?.main?.height };
    }
  }
  await api.writeDesignClipboard(JSON.stringify({ format: 'reccut-design-layers', version: 2, project: p.id, design: design.id, width: design.width, height: design.height, layers, assets, media }));
  if (cut && projectEpoch.value === epoch) {
    const ids = new Set(layers.map((l) => l.id));
    designCommit((p) => { if (p.designs[design.id]) p.designs[design.id].layers = p.designs[design.id].layers.filter((l) => !ids.has(l.id)); });
  }
}
export async function pasteImage(inPlace = false) {
  const epoch = projectEpoch.value, designId = currentDesignId.value;
  if (!designId) return;
  const data = await api.readDesignClipboard();
  if (epoch !== projectEpoch.value) return;
  if (data.image?.byteLength) {
    const path = await api.writeDesignImage(`${await designDir()}${sep}Pasted ${Date.now()}.png`, data.image);
    await placeFiles([path], { copy: false, copied: true, epoch, designId });
    return;
  }
  let copied;
  try { copied = JSON.parse(data.text); } catch {}
  if (copied?.format !== 'reccut-design-layers') {
    if (!data.text?.trim()) { toast('The clipboard has no image, text or Design layers.'); return; }
    const d = project.value.designs[designId], w = d.width * 0.8, h = d.height * 0.3;
    const l = newLayer('text', { text: data.text.slice(0, 100000), x: (d.width-w)/2, y: (d.height-h)/2, w, h, size: Math.max(6, d.height*0.1) });
    designCommit((p) => { p.designs[designId].layers.push(l); });
    if (currentDesignId.value === designId) selection.value = [l.id];
    return;
  }
  if (!Array.isArray(copied.layers) || copied.layers.length > 2000) throw new Error('The copied layers are invalid.');
  const sameProject = copied.project === project.value.id, registrations = {}, assetIds = new Map(), mediaIds = new Map();
  const register = async (records, mapping, existing) => {
    if (!records || typeof records !== 'object' || Array.isArray(records)) return;
    for (const [old, asset] of Object.entries(records).slice(0, 6000)) {
      if (sameProject && existing?.[old]) { mapping.set(old, old); continue; }
      if (!asset || typeof asset.path !== 'string' || !/^(?:\/|[a-z]:[\\/])/i.test(asset.path)) continue;
      let path = asset.path, copiedFile = Boolean(asset.copied);
      if (copiedFile) [path] = await api.copyIntoProject([path], await designDir(), { unique: true });
      const id = uid(); mapping.set(old, id);
      registrations[id] = { ...asset, id, path, copied: copiedFile, missing: false };
    }
  };
  await register(copied.assets, assetIds, project.value.designAssets);
  // Cross-project Edit image references become ordinary Design assets.
  if (!sameProject) await register(copied.media, mediaIds, null);
  if (epoch !== projectEpoch.value || !project.value.designs?.[designId]) return;
  const target = project.value.designs[designId], groups = new Map();
  const layers = copied.layers.map(normalizeLayer).filter(Boolean).map((l) => {
    if (l.group && !groups.has(l.group)) groups.set(l.group, uid());
    const next = { ...l, id: uid(), group: groups.get(l.group) || null, locked: false };
    if (!inPlace && copied.width > 0 && copied.height > 0) {
      next.x = (l.x + l.w / 2) / copied.width * target.width - l.w / 2;
      next.y = (l.y + l.h / 2) / copied.height * target.height - l.h / 2;
    }
    if (l.asset) next.asset = assetIds.get(l.asset) || (sameProject ? l.asset : uid());
    if (l.media && !sameProject) { next.asset = mediaIds.get(l.media) || uid(); next.media = null; }
    for (const key of ['cutout','mask']) if (l[key]?.asset) next[key] = { ...l[key], asset: assetIds.get(l[key].asset) || (sameProject ? l[key].asset : uid()) };
    return next;
  });
  if (!layers.length) return;
  designCommit((p) => { Object.assign(p.designAssets, registrations); p.designs[designId].layers.push(...layers); });
  if (currentDesignId.value === designId) selection.value = layers.map((l) => l.id);
  loadDesignImages(project.value.designs[designId]);
}
export async function locateImage(layer) {
  const epoch = projectEpoch.value;
  const path = await api.openFileDialog({ title: 'Relink Image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }] });
  if (!path) return;
  images.delete(path);
  const img = await ensureImage(path);
  if (!img || epoch !== projectEpoch.value) { if (!img) toast('Could not read that image.', { kind: 'error' }); return; }
  designCommit((p) => {
    if (layer.asset && p.designAssets[layer.asset]) Object.assign(p.designAssets[layer.asset], { path, missing: false, copied: false, width: img.naturalWidth, height: img.naturalHeight });
    else if (layer.media) {
      const a = { id: uid(), path, name: path.split(/[\\/]/).pop(), origin: 'placed', copied: false, width: img.naturalWidth, height: img.naturalHeight };
      p.designAssets[a.id] = a;
      for (const d of Object.values(p.designs)) for (const l of d.layers) if (l.media === layer.media) { l.asset = a.id; l.media = null; }
    }
  });
}
export async function captureFrameAsset(source, time, { signal } = {}) {
  const epoch = projectEpoch.value;
  if (signal?.aborted) return;
  const frame = frameExportSettings(source, { time, width: source.width, height: source.height });
  let offline = false;
  const used = new Set(Object.values(source.clips || {}).filter((c) => c.enabled !== false && c.start <= frame.time && c.start + c.dur > frame.time).map((c) => c.mediaId));
  for (const id of used) { const m = source.media?.[id]; if (m?.path && !(await api.exists(m.path))) offline = true; }
  const output = `${await designDir('Frames')}${sep}${designFileName(`${project.value.name} ${frame.time.toFixed(3)}s`)}.png`;
  if (epoch !== projectEpoch.value || signal?.aborted) return;
  const file = await new Promise((resolve, reject) => {
    let id, timer, stopped = false;
    const early = [];
    const cleanups = [];
    const finish = (error, file) => {
      if (stopped) return;
      stopped = true; clearTimeout(timer); cleanups.forEach((off) => off());
      if (error) reject(error); else resolve(file);
    };
    const done = (result) => { if (!id) early.push(result); else if (result.id === id) finish(null, result.file); };
    cleanups.push(api.onExportDone(done));
    cleanups.push(api.onTasks((tasks) => {
      const t = tasks.find((t) => t.id === id);
      if (t?.state === 'error' || t?.state === 'canceled') finish(new Error(t.error || 'Frame capture canceled.'));
    }));
    cleanups.push(effect(() => { if (projectEpoch.value !== epoch) { if (id) api.cancelTask(id); finish(new Error('The project changed.')); } }));
    if (signal) {
      const abort = () => { if (id) api.cancelTask(id); finish(new Error('Frame capture canceled.')); };
      signal.addEventListener('abort', abort, { once: true });
      cleanups.push(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) { abort(); return; }
    }
    timer = setTimeout(() => { if (id) api.cancelTask(id); finish(new Error('Frame capture timed out. Try again.')); }, 120000);
    api.startExport({ project: source, settings: { frame, output, sourceMedia: 'original', quiet: true } }).then((jobId) => {
      id = jobId;
      if (stopped) { api.cancelTask(id); return; }
      early.forEach(done);
      api.listTasks().then((tasks) => {
        const t = tasks.find((t) => t.id === id);
        if (t?.state === 'error' || t?.state === 'canceled') finish(new Error(t.error || 'Frame capture canceled.'));
      }).catch((err) => finish(err));
    }).catch((err) => finish(err));
  });
  if (projectEpoch.value !== epoch || signal?.aborted) return;
  const image = await ensureImage(file);
  if (!image) throw new Error('Could not load the captured frame.');
  if (projectEpoch.value !== epoch || signal?.aborted) return;
  const asset = { id: uid(), name: file.split(/[\\/]/).pop(), path: file, copied: true, origin: 'frame', width: image.naturalWidth, height: image.naturalHeight };
  if (offline) toast('This frame includes missing media shown as Media Offline.', { kind: 'error' });
  return asset;
}
export async function captureFrame(source, time) {
  const epoch = projectEpoch.value, designId = currentDesignId.value;
  if (!project.value.designs?.[designId]) return;
  const asset = await captureFrameAsset(source, time);
  if (!asset || epoch !== projectEpoch.value || !project.value.designs?.[designId]) return;
  const d = project.value.designs[designId];
  // Keep the entire frame visible and give its handles the source aspect ratio.
  const box = fitBox(asset.width, asset.height, d.width, d.height, 'contain');
  const l = newLayer('image', { asset: asset.id, name: 'Video frame', ...box, fit: 'contain' });
  designCommit((p) => { p.designAssets[asset.id] = asset; p.designs[designId].layers.unshift(l); });
  if (currentDesignId.value === designId) selection.value = [l.id];
  return l;
}
