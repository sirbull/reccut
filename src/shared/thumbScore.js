import { computeFrame, visualOpacity, visualStreams, valueAt, sourceTime, cameraRectAt } from './model.js';

export const FRAME_SCORE_WEIGHTS = Object.freeze({ sharpness: 0.35, exposure: 0.25, contrast: 0.2, colorfulness: 0.2 });
const clamp = value => Math.min(1, Math.max(0, value));

// Score a small copy, regardless of the source resolution. Luma stays in 0..255.
export function scoreFrame({ data, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data?.length !== width * height * 4) throw new Error('Invalid frame pixels.');
  const scale = Math.min(1, 256 / width, 512 / height), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const gray = new Float32Array(w * h);
  let sum = 0, square = 0, rg = 0, rg2 = 0, yb = 0, yb2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.min(height - 1, Math.floor((y + 0.5) / scale)) * width + Math.min(width - 1, Math.floor((x + 0.5) / scale))) * 4;
    const alpha = data[i + 3] / 255, r = data[i] * alpha, g = data[i + 1] * alpha, b = data[i + 2] * alpha;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b, a = r - g, c = (r + g) / 2 - b;
    gray[y * w + x] = luma; sum += luma; square += luma * luma; rg += a; rg2 += a * a; yb += c; yb2 += c * c;
  }
  const n = w * h, mean = sum / n, variance = Math.max(0, square / n - mean * mean);
  let lap = 0, lap2 = 0, count = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, value = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
    lap += value; lap2 += value * value; count++;
  }
  const lapVariance = count ? Math.max(0, lap2 / count - (lap / count) ** 2) : 0;
  const sharpness = lapVariance / (lapVariance + 400), exposure = clamp(1 - Math.abs(mean - 127.5) / 127.5), contrast = clamp(Math.sqrt(variance) / 64);
  // Hasler/Süsstrunk opponent-channel standard deviations and mean magnitudes.
  const colorfulness = clamp((Math.sqrt(Math.max(0, rg2 / n - (rg / n) ** 2) + Math.max(0, yb2 / n - (yb / n) ** 2)) + 0.3 * Math.hypot(rg / n, yb / n)) / 120);
  const metrics = { sharpness, exposure, contrast, colorfulness };
  return { ...metrics, score: Object.entries(FRAME_SCORE_WEIGHTS).reduce((total, [key, weight]) => total + metrics[key] * weight, 0) };
}

export function sampleFrameInfo(project, time) {
  const frame = computeFrame(project, time, { captions: false });
  if (frame.layers.some(layer => layer.transition)) return { eligible: false, camera: false };
  const clips = frame.layers.flatMap(layer => layer.clip ? [layer.clip, ...(layer.companions || [])] : []);
  if (clips.some(c => time - c.start < (c.props?.vFadeIn || 0) || c.start + c.dur - time <= (c.props?.vFadeOut || 0))) return { eligible: false, camera: false };
  const visible = clips.filter(c => visualOpacity(c, time) > 0.01);
  const eligible = visible.some(c => {
    const media = project.media[c.mediaId];
    return media && !media.offline && (c.type === 'image' || ['video', 'recording'].includes(c.type) && visualStreams(c, media).length > 0);
  });
  const camera = visible.some(c => {
    const media = project.media[c.mediaId];
    if (c.type !== 'recording' || c.recordingPart === 'screen' || !visualStreams(c, media).some(([key]) => key === 'camera') || valueAt(c, 'showCamera', time) === false) return false;
    return !media.streams.screen || cameraRectAt(c, sourceTime(c, time), project.width, project.height).a > 0.01;
  });
  return { eligible, camera };
}

export function frameSampleTimes(project) {
  const duration = Number(project.duration), fps = Math.max(1, Number(project.fps) || 30);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const frames = Math.max(1, Math.ceil(duration * fps)), times = new Set();
  const add = time => times.add(Math.max(0, Math.min(frames - 1, Math.floor(time * fps))) / fps);
  for (let i = 0; i < Math.min(60, frames); i++) add(duration * (i + 0.5) / Math.min(60, frames));
  const starts = (project.primary || []).map(id => project.clips[id]).filter(c => c?.enabled !== false && c && ['video', 'recording', 'image'].includes(c.type));
  // Spread the capped clip samples over the sequence rather than only its start.
  for (let i = 0; i < Math.min(120, starts.length); i++) {
    const c = starts[Math.floor(i * starts.length / Math.min(120, starts.length))];
    add(c.start + Math.min(0.5, c.dur / 2));
  }
  return [...times].sort((a, b) => a - b).filter(time => sampleFrameInfo(project, time).eligible);
}

export function pickFrameCandidates(frames, duration, limit = 6) {
  const selected = [], distance = Math.max(0, Number(duration) || 0) * 0.05;
  const sorted = frames.filter(f => Number.isFinite(f.time) && Number.isFinite(f.score)).sort((a, b) => b.score - a.score || a.time - b.time);
  for (const frame of sorted) {
    if (selected.every(p => Math.abs(p.time - frame.time) + 1e-7 >= distance)) selected.push(frame);
    if (selected.length >= limit) break;
  }
  return selected;
}

const STOP_WORDS = new Set(('a an the and or but is are was were be been being to of in on at for from with by as this that these those it its i you your we our they their he she his her have has had do does did not no so if then than can could will would should how what when where why about into out up down just very ' +
  'og eller men er var være vært bli blir ble blitt en ei et den det de dette denne disse som til av i på for fra med ved om over under etter før så når da der her ikke ingen bare også jeg du vi dere han hun ham henne oss vår våre din ditt dine sin sitt sine har hadde skal skulle vil ville kan kunne må måtte å hvordan hva hvem hvorfor').split(/\s+/));
const words = text => String(text || '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
export function captionPhrases(captions) {
  const counts = new Map();
  for (const caption of captions.slice(0, 10000)) {
    const tokens = words(typeof caption === 'string' ? caption : caption.props?.text ?? caption.text).slice(0, 200);
    for (let size = 2; size <= 4; size++) for (let i = 0; i + size <= tokens.length; i++) {
      const chunk = tokens.slice(i, i + size); if (chunk.some(word => STOP_WORDS.has(word))) continue;
      const phrase = chunk.join(' '); counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  return [...counts].filter(([, count]) => count > 1).sort((a, b) => b[1] * b[0].split(' ').length - a[1] * a[0].split(' ').length || b[1] - a[1] || a[0].localeCompare(b[0])).map(([phrase]) => phrase);
}
export function cleanTitle(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const chars = [...clean]; return chars.length > 60 ? chars.slice(0, 59).join('').trimEnd() + '…' : clean;
}
export function uniqueTitles(values, limit = 5) {
  const seen = new Set(), titles = [];
  for (const value of values) {
    const title = cleanTitle(value), key = title.normalize('NFKC').toLocaleLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key); titles.push(title); if (titles.length >= limit) break;
  }
  return titles;
}
export function titleCandidates(project) {
  const clips = Object.values(project.clips || {}).filter(c => c.enabled !== false).sort((a, b) => a.start - b.start);
  const captions = clips.filter(c => c.type === 'caption');
  return uniqueTitles([project.name, project.sequence?.name, ...Object.values(project.sequences || {}).map(s => s.name)].filter(name => !/^Sequence\s+\d+$/i.test(name || '')).concat(
    clips.filter(c => c.type === 'title').map(c => c.props?.text), captions.slice(0, 5).map(c => c.props?.text), captionPhrases(captions)));
}

export function suggestionTemplates(templates, width, height, offset = 0) {
  const ratio = width / height, ranked = [...templates].sort((a, b) => Math.abs(Math.log(a.design.width / a.design.height / ratio)) - Math.abs(Math.log(b.design.width / b.design.height / ratio)));
  const matches = ranked.filter(t => Math.abs(Math.log(t.design.width / t.design.height / ratio)) < 0.3), pool = matches.length >= 4 ? matches : ranked;
  return Array.from({ length: Math.min(4, pool.length) }, (_, i) => pool[(offset * 4 + i) % pool.length]);
}
