import { signal, effect } from '@preact/signals';
import { project, projectEpoch, projectFolders } from '../editor/store.js';
import { prefs } from '../prefs.js';
import { fileUrl } from '../player.js';
import { newLayer, fitBox } from '../../shared/design.js';
import { designFileName } from '../../shared/designExport.js';
import { frameExportSettings } from '../../shared/frameExport.js';
import { uid } from '../../shared/model.js';
import { currentDesignId, currentDesign, designCommit, selection, placeRequest } from './store.js';
import { toast } from '../ui.jsx';

const api = window.api;
const sep = api.platform === 'win32' ? '\\' : '/';
export const imageVersion = signal(0);
const images = new Map();
let cacheGeneration = 0;
effect(() => {
  projectEpoch.value; cacheGeneration++;
  for (const entry of images.values()) entry.preview?.close?.();
  images.clear(); imageVersion.value++;
});
export async function designDir(sub = 'Assets') {
  return `${projectFolders.value?.designs || `${await api.baseDir()}${sep}Designs`}${sep}${sub}`;
}
export function imagePath(layer, p = project.value) {
  if (layer.asset) return p.designAssets?.[layer.asset]?.path;
  const m = p.media?.[layer.media];
  return m?.kind === 'image' ? m.streams?.main?.proxy || m.streams?.main?.path || m.path : null;
}
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not read ${path.split(/[\\/]/).pop()}.`));
    img.src = fileUrl(path);
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
export function getImage(layer, full = false) {
  const path = imagePath(layer), entry = images.get(path);
  return full ? entry?.image || null : entry?.preview || null;
}
export function imageMissing(layer) {
  const path = imagePath(layer);
  return !path || Boolean(images.get(path)?.error);
}
export async function loadDesignImages(design, p = project.value) {
  const layers = design.layers.filter((l) => l.type === 'image' && !l.hidden);
  const loaded = await Promise.all(layers.map((l) => ensureImage(imagePath(l, p))));
  return layers.filter((_, i) => !loaded[i]);
}
export async function chooseImage() {
  const path = await api.openFileDialog({ title: 'Place Image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'psd'] }] });
  if (path) requestPlace([path]);
}
export function requestPlace(paths, point = null) {
  if (prefs.value.designImportRemember) { placeFiles(paths, { point }).catch((err) => toast(err.message, { kind: 'error' })); return; }
  placeRequest.value = { paths, point, epoch: projectEpoch.value, designId: currentDesignId.value, copy: prefs.value.importCopy };
}
export async function placeFiles(paths, { copy = prefs.value.importCopy, point = null, designId = currentDesignId.value, epoch = projectEpoch.value } = {}) {
  const assets = [];
  for (const original of paths) {
    try {
      if (!/\.(png|jpe?g|webp|gif|bmp|svg|psd)$/i.test(original)) throw new Error('Choose a PNG, JPEG, WebP, GIF, BMP, SVG or PSD image.');
      let path = original, copied = copy;
      const name = original.split(/[\\/]/).pop();
      if (/\.psd$/i.test(path)) {
        const doc = await api.psdLayers(path);
        const out = await api.psdExtract(path, doc.layers.filter((l) => l.visible).map((l) => l.index), 'merged', `${await designDir()}${sep}${uid()}`);
        path = out[0].path; copied = true;
      }
      const image = await ensureImage(path);
      if (!image) throw new Error(`Could not read ${name}.`);
      if (epoch !== projectEpoch.value) return;
      if (copy && path === original) [path] = await api.copyIntoProject([path], await designDir(), { unique: true });
      const asset = { id: uid(), name, path, copied, origin: 'placed', width: image.naturalWidth, height: image.naturalHeight, missing: false };
      if (path !== original) await ensureImage(path);
      assets.push(asset);
    } catch (err) { toast(`Could not place ${original.split(/[\\/]/).pop()}: ${err.message}`, { kind: 'error' }); }
  }
  if (epoch !== projectEpoch.value || !project.value.designs?.[designId] || !assets.length) return;
  const ids = [];
  designCommit((p) => {
    const d = p.designs[designId];
    for (const asset of assets) {
      p.designAssets[asset.id] = asset;
      const b = fitBox(asset.width, asset.height, d.width * 0.9, d.height * 0.9);
      const l = newLayer('image', { asset: asset.id, name: asset.name, x: point ? point.x - b.w / 2 : (d.width - b.w) / 2, y: point ? point.y - b.h / 2 : (d.height - b.h) / 2, w: b.w, h: b.h, fit: 'contain' });
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
export async function pasteImage() {
  const epoch = projectEpoch.value, designId = currentDesignId.value;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type), image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0); image.close();
    const png = await canvas.convertToBlob({ type: 'image/png' });
    const path = await api.writeDesignImage(`${await designDir()}${sep}Pasted ${Date.now()}.png`, new Uint8Array(await png.arrayBuffer()));
    await placeFiles([path], { copy: false, epoch, designId });
    if (epoch === projectEpoch.value) designCommit((p) => { for (const a of Object.values(p.designAssets)) if (a.path === path) a.copied = true; });
    return;
  }
  toast('The clipboard has no image.');
}
export async function locateImage(layer) {
  const epoch = projectEpoch.value;
  const path = await api.openFileDialog({ title: 'Locate Image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }] });
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
export async function captureFrame(source, time) {
  const epoch = projectEpoch.value, designId = currentDesignId.value;
  const frame = frameExportSettings(source, { time, width: source.width, height: source.height });
  const output = `${await designDir('Frames')}${sep}${designFileName(`${project.value.name} ${frame.time.toFixed(3)}s`)}.png`;
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
  if (projectEpoch.value !== epoch || !project.value.designs?.[designId]) return;
  const image = await ensureImage(file);
  if (!image) throw new Error('Could not load the captured frame.');
  if (projectEpoch.value !== epoch || !project.value.designs?.[designId]) return;
  const asset = { id: uid(), name: file.split(/[\\/]/).pop(), path: file, copied: true, origin: 'frame', width: image.naturalWidth, height: image.naturalHeight };
  const d = project.value.designs[designId];
  const l = newLayer('image', { asset: asset.id, name: 'Video frame', w: d.width, h: d.height, fit: 'cover' });
  designCommit((p) => { p.designAssets[asset.id] = asset; p.designs[designId].layers.unshift(l); });
  if (currentDesignId.value === designId) selection.value = [l.id];
}
