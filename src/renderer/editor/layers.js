// Import av lagdelte filer: Photoshop (PSD, PSB) og SVG fra Illustrator.
// Lagene vises i en dialog der du velger hvilke som skal med, og om de skal komme som egne
// bilder stablet på tidslinjen (gruppert, så de flyttes sammen) eller som ett sammenslått bilde.
// Bildene legges i prosjektets Media-mappe.
import { signal } from '@preact/signals';
import { addMediaClip, autoFormat, groupClips } from '../../shared/ops.js';
import { addMediaRecords, commit, getTime, projectFolders, selection, withAnalysis } from './store.js';
import { prefs } from '../prefs.js';
import { toast } from '../ui.jsx';

const api = window.api;
const sep = api.platform === 'win32' ? '\\' : '/';

// Dialogen: { file, kind, width, height, thumb, layers: [{ index, name, group, visible, thumb }] }
export const layerImport = signal(null);
const queue = [];

const baseName = (file) => file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

function outDir(file) {
  const media = projectFolders.value?.media;
  return `${media || file.replace(/[\\/][^\\/]*$/, '')}${sep}${baseName(file)} layers`;
}

/* SVG: lagene er gruppene rett under <svg>, slik Illustrator lagrer lag. */

function svgSize(svg) {
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const num = (v) => (v && /^[\d.]+(px)?$/.test(v.trim()) ? parseFloat(v) : null);
  const w = num(svg.getAttribute('width')) || (vb.length === 4 ? vb[2] : 0) || 1920;
  const h = num(svg.getAttribute('height')) || (vb.length === 4 ? vb[3] : 0) || 1080;
  return { w, h };
}

async function parseSvg(file) {
  const text = await api.readText(file);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('The SVG file could not be read.');
  const groups = [...svg.children].filter((el) => el.nodeName.toLowerCase() === 'g');
  const size = svgSize(svg);
  const layers = groups.map((g, i) => ({
    index: i,
    name: (g.getAttribute('data-name') || g.getAttribute('inkscape:label') || g.id || `Layer ${i + 1}`).replace(/_x5F_/g, '_').replace(/_/g, ' ').trim(),
    group: '',
    visible: g.getAttribute('display') !== 'none' && !/display\s*:\s*none/.test(g.getAttribute('style') || '') && g.getAttribute('visibility') !== 'hidden',
  }));
  return { text, size, layers };
}

// Lager en SVG med bare de valgte lagene, og tegner den som PNG.
function svgWith(text, keep) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  const groups = [...svg.children].filter((el) => el.nodeName.toLowerCase() === 'g');
  groups.forEach((g, i) => {
    if (!keep.includes(i)) g.remove();
    else {
      g.removeAttribute('display'); g.removeAttribute('visibility');
      g.style?.removeProperty?.('display'); g.style?.removeProperty?.('visibility');
    }
  });
  return new XMLSerializer().serializeToString(svg);
}

async function rasterize(svgText, size, maxSide, preview = false) {
  const scale = preview ? Math.min(1, maxSide / Math.max(size.w, size.h)) : Math.min(4, Math.max(1, maxSide / Math.max(size.w, size.h)));
  const w = Math.round(size.w * scale);
  const h = Math.round(size.h * scale);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const svgCache = new Map();

export async function readLayers(file) {
  if (/\.svg$/i.test(file)) {
    const parsed = await parseSvg(file);
    svgCache.set(file, parsed);
    const all = parsed.layers.map((l) => l.index);
    const thumb = (await rasterize(svgWith(parsed.text, all), parsed.size, 160, true)).toDataURL();
    const layers = [];
    for (const l of parsed.layers) layers.push({ ...l, thumb: (await rasterize(svgWith(parsed.text, [l.index]), parsed.size, 64, true)).toDataURL() });
    return { file, kind: 'svg', width: Math.round(parsed.size.w), height: Math.round(parsed.size.h), thumb, layers };
  }
  return { file, kind: 'psd', ...(await api.psdLayers(file)) };
}

export async function extractLayered(req, indices, mode, dir = outDir(req.file), maxSide = 2160) {
  if (req.kind === 'psd') return api.psdExtract(req.file, indices, mode, dir);
  const parsed = svgCache.get(req.file) || (await parseSvg(req.file));
  const out = [];
  const write = async (keep, name, label) => {
    const cv = await rasterize(svgWith(parsed.text, keep), parsed.size, maxSide);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const path = `${dir}${sep}${name.replace(/[\\/:*?"<>|]/g, '_')}.png`;
    await api.writeBinary(path, new Uint8Array(await blob.arrayBuffer()));
    out.push({ path, name: label });
  };
  const base = baseName(req.file);
  if (mode === 'merged') await write(indices, base, base);
  else for (const i of indices) await write([i], `${base} ${String(i + 1).padStart(2, '0')} ${parsed.layers[i].name}`, `${base}: ${parsed.layers[i].name}`);
  return out;
}

// Fra importen: lagdelte filer går via dialogen, én om gangen.
export async function importLayered(files, placement) {
  for (const file of files) {
    try {
      const req = await readLayers(file);
      if (req.layers.length <= 1) await finish({ ...req, placement }, req.layers.map((l) => l.index), 'merged', Boolean(placement));
      else queue.push({ ...req, placement });
    } catch (err) {
      toast(`${file.split(/[\\/]/).pop()}: ${err.message}`, { kind: 'error', timeout: 8000 });
    }
  }
  if (!layerImport.value && queue.length) layerImport.value = queue.shift();
}

export function cancelLayerImport() {
  layerImport.value = queue.shift() || null;
}

// Lager bildene, legger dem i biblioteket og eventuelt stablet på tidslinjen.
export async function finish(req, indices, mode, toTimeline) {
  if (layerImport.value === req) layerImport.value = queue.shift() || null;
  if (!indices.length) return;
  try {
    const files = await extractLayered(req, indices, mode);
    const { items, failed } = await api.importMedia(files.map((f) => f.path));
    if (failed.length) toast(`Could not read ${failed.join(', ')}.`, { kind: 'error' });
    const named = items.map((m, i) => withAnalysis({ ...m, name: files[i]?.name || m.name, layered: req.kind }));
    addMediaRecords(named);
    if (!toTimeline || !named.length) {
      toast(`Imported ${named.length === 1 ? named[0].name : `${named.length} layers from ${baseName(req.file)}`} into the browser.`, { timeout: 3500 });
      return;
    }
    // Nederste lag nederst: hvert lag får sitt eget spor over hovedsporet, og alle grupperes.
    const T = req.placement?.T ?? getTime();
    const ids = [];
    commit((p) => {
      for (const m of named) {
        autoFormat(p, m);
        const lane = 1 + ids.length;
        const id = addMediaClip(p, m, 'connect', T, lane, { dur: prefs.value.stillDur });
        if (id) ids.push(id);
      }
      if (ids.length > 1) groupClips(p, ids);
    });
    selection.value = ids;
    toast(ids.length > 1 ? `Added ${ids.length} layers, stacked and grouped. Click one to select them all, Option click to select one.` : `Added ${named[0].name}.`, { timeout: 5000 });
  } catch (err) {
    toast(`Could not import the layers: ${err.message}`, { kind: 'error', timeout: 8000 });
  }
}
