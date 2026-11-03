import { fontAvailable } from './fonts.js';
import { FRAME_FORMATS } from '../../shared/frameExport.js';
import { designFileName, fitToSize } from '../../shared/designExport.js';
import { drawDesign } from '../../shared/designRender.js';
import { project } from '../editor/store.js';
import { defaultExportDir } from '../editor/ExportDialog.jsx';
import { toast } from '../ui.jsx';
import { currentDesign } from './store.js';
import { ensureImage, imagePath } from './assets.js';

export async function saveDesignImage(design, { format = 'png', quality = 0.92, transparent = !design.background, width = design.width, limit = 0, name = design.name, dir } = {}) {
  const fmt = FRAME_FORMATS.find((f) => f.id === format);
  const height = Math.max(1, Math.round(width * design.height / design.width));
  if (!fmt || !Number.isInteger(width) || width < 1 || width > 8192 || height > 8192) throw new Error('Export sizes must be whole numbers from 1 to 8192 pixels.');
  const p = project.value, loaded = new Map();
  await Promise.all(design.layers.filter((l) => l.type === 'image' && !l.hidden).map(async (l) => {
    const img = await ensureImage(imagePath(l, p));
    if (!img) throw new Error(`Relink the missing image "${l.name}" before exporting.`);
    loaded.set(l.id, img);
    if(l.cutout?.enabled){const path=p.designAssets?.[l.cutout.asset]?.path,mask=await ensureImage(path);if(!mask)throw new Error(`Relink the cutout mask for \"${l.name}\" before exporting.`);loaded.set(`asset:${l.cutout.asset}`,mask);}
  }));
  await document.fonts.ready;
  const cv = new OffscreenCanvas(width, height), ctx = cv.getContext('2d');
  const alpha = fmt.alpha && transparent;
  // Flatten unless the user explicitly requests transparency.
  if (!alpha) { ctx.fillStyle = design.background?.color || '#ffffff'; ctx.fillRect(0, 0, width, height); }
  drawDesign(ctx, design, (l) => loaded.get(l.id) || loaded.get(`asset:${l.asset}`), { fontAvailable, scale: width / design.width, transparent: alpha });
  const encode = (q) => cv.convertToBlob({ type: fmt.mime, quality: q });
  let blob;
  if (limit > 0 && format !== 'png') {
    const result = await fitToSize(encode, Math.round(limit * 1e6), { max: quality, min: Math.min(0.4, quality) });
    if (result.over) throw new Error('This image exceeds the size limit. Reduce its width or increase the limit.');
    blob = result.data;
  } else blob = await encode(quality);
  if (limit > 0 && blob.size > limit * 1e6) throw new Error('This PNG exceeds the size limit. Choose JPEG or reduce its width.');
  const folder = dir || await defaultExportDir();
  return window.api.writeDesignImage(`${folder}${window.api.platform === 'win32' ? '\\' : '/'}${designFileName(name)}.${fmt.ext}`, new Uint8Array(await blob.arrayBuffer()));
}
export function designSaved(path) {
  toast(`Design saved: ${path.split(/[\\/]/).pop()}`, { kind: 'success', actions: [{ label: 'Reveal', onClick: () => window.api.reveal(path) }, { label: 'Open', onClick: () => window.api.openPath(path) }] });
}
export async function quickExportPNG() {
  const d = currentDesign.value;
  if (d) designSaved(await saveDesignImage(d));
}
