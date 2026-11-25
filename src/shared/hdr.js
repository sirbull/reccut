// Display-linear BT.2020 throughout HDR export. One working unit is 203 cd/m².
// SDR export and the tone-mapped editing preview retain their existing pipeline.
import { defaultProps } from './model.js';
import { videoFormat } from './formats.js';

export const HDR_WHITE = 203;
export const HDR_PEAK = 10000;
export const HDR_COLOR = 'hdr-pq';
export const isHdrExport = (s) => s.color === HDR_COLOR && !s.audioOnly && !s.frame;

export function pqEncode(nits) {
  const y = Math.max(0, Math.min(10000, nits)) / 10000;
  const p = y ** (2610 / 16384);
  return ((3424 / 4096 + 2413 / 128 * p) / (1 + 2392 / 128 * p)) ** (2523 / 32);
}

export function pqDecode(signal) {
  const p = Math.max(0, Math.min(1, signal)) ** (32 / 2523);
  return 10000 * (Math.max(p - 3424 / 4096, 0) / (2413 / 128 - 2392 / 128 * p)) ** (16384 / 2610);
}

export function hlgDisplayLinear(rgb) {
  // Undo zimg's per-channel OOTF, then apply BT.2100's luminance-dependent OOTF.
  // Initial HLG interpretation: 1000 nit display, gamma 1.2, zero black.
  const scene = rgb.map(x => Math.max(0, x * HDR_WHITE / 1000) ** (1 / 1.2));
  const y = scene[0] * 0.2627 + scene[1] * 0.678 + scene[2] * 0.0593;
  return scene.map(x => x * y ** 0.2 * 1000 / HDR_WHITE);
}

const known = v => v && v !== 'unknown' && v !== 'unspecified';
const safeTag = (v, fallback) => known(v) && /^[a-z0-9_-]+$/i.test(v) ? v : fallback;

export function hdrDecodeFilters(stream) {
  const c = stream.color || {};
  const hdr = c.hdr || (c.transfer === 'smpte2084' ? 'pq' : c.transfer === 'arib-std-b67' ? 'hlg' : null);
  const transfer = hdr === 'pq' ? 'smpte2084' : hdr === 'hlg' ? 'arib-std-b67' : safeTag(c.transfer, 'bt709');
  const primaries = safeTag(c.primaries, hdr ? 'bt2020' : 'bt709');
  const matrix = safeTag(c.space, hdr ? 'bt2020nc' : 'bt709');
  const z = `zscale=tin=${transfer}:pin=${primaries}:min=${matrix}:rin=${c.range === 'pc' ? 'full' : 'limited'}:t=linear:p=${primaries}:m=gbr:r=full:npl=${HDR_WHITE}`;
  // Correct the HLG OOTF in source BT.2020, before any primary conversion.
  return { vf: [stream.interlaced && 'bwdif=mode=send_frame:deint=interlaced', z, 'format=gbrpf32le', 'zscale=p=bt2020'].filter(Boolean).join(','), hlg: hdr === 'hlg' };
}

// First public stage deliberately accepts a finite set of edits. Unknown visual
// edits fail preflight, rather than silently rendering an SDR approximation.
const VIDEO_PROPS = new Set(['x', 'y', 'scale', 'rotation', 'anchorX', 'anchorY', 'opacity', 'vFadeIn', 'vFadeOut', 'cropL', 'cropR', 'cropT', 'cropB', 'exposure']);
const AUDIO_PROPS = new Set(['volume', 'aFadeIn', 'aFadeOut', 'aLead', 'aTail', 'audioOff', 'audioGain', 'audioMono', 'cleanVoice', 'audioEffects', 'preservePitch', 'pan', 'afx']);
const empty = v => v == null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length);

export function hdrExportIssues(project, settings) {
  if (!isHdrExport(settings)) return [];
  const issues = new Set();
  const fmt = videoFormat(settings.format);
  if (fmt.ffCodec !== 'libx265' || !['mp4', 'mov', 'mkv'].includes(fmt.container)) issues.add('HDR requires HEVC in MP4, MOV or MKV. Choose the HDR PQ preset.');
  if (settings.sourceMedia === 'optimized') issues.add('HDR requires original media. Select Originals instead of optimized media.');
  const a = settings.range?.in ?? 0, b = settings.range?.out ?? project.duration;
  for (const clip of Object.values(project.clips)) {
    if (clip.enabled === false || clip.type === 'audio' || clip.type === 'gap' || clip.start >= b || clip.start + clip.dur <= a || project.lanes?.[clip.lane]?.hidden) continue;
    const name = clip.name || clip.type;
    const fail = why => issues.add(`${name}: ${why}`);
    if (!['video', 'image', 'title', 'caption'].includes(clip.type)) { fail('this clip type is not supported by HDR export yet.'); continue; }
    if (clip.transition || clip.transitionOut || clip.slideshowId || clip.linkedTo || clip.props?.follow) fail('transitions, slideshows and tracking links are not supported by HDR export yet.');
    if (clip.props?.blendMode && clip.props.blendMode !== 'source-over') fail('HDR currently supports Normal blend mode.');
    const media = project.media[clip.mediaId];
    if (media?.offline) fail('the original media is offline.');
    if (media?.cameraLut) fail('camera LOG/LUT processing is not supported by HDR export yet.');
    if (clip.type !== 'video') continue;
    const stream = media?.streams?.main;
    if (!stream?.path) fail('the original video is unavailable.');
    if (stream?.alpha) fail('video with an alpha channel is not supported by HDR export yet.');
    if ((stream?.color?.hdr || ['smpte2084', 'arib-std-b67'].includes(stream?.color?.transfer)) && known(stream.color.primaries) && stream.color.primaries !== 'bt2020') fail('HDR input must use BT.2020 primaries.');
    const defaults = defaultProps('video', media);
    for (const [key, value] of Object.entries(clip.props || {})) {
      if (VIDEO_PROPS.has(key) || AUDIO_PROPS.has(key) || empty(value) || JSON.stringify(value) === JSON.stringify(defaults[key])) continue;
      fail(`“${key}” is not supported by HDR export yet.`);
    }
    for (const key of Object.keys(clip.kf || {})) {
      if (!VIDEO_PROPS.has(key) && !AUDIO_PROPS.has(key) && clip.kf[key]?.length) fail(`animated “${key}” is not supported by HDR export yet.`);
    }
  }
  return [...issues];
}

export function hdrEncoderArgs({ crf = 23, bitrate = 0, container = 'mp4' } = {}) {
  // RGBA32F readback is packed as gbrpf32le, still in reference-white units.
  // PQ encodes absolute luminance; no tone mapping or invented mastering metadata.
  const vf = `zscale=pin=bt2020:tin=linear:min=gbr:rin=full:t=smpte2084:p=bt2020:m=bt2020nc:r=limited:npl=${HDR_WHITE},format=yuv420p10le`;
  return ['-vf', vf, '-c:v', 'libx265', '-preset', 'medium', '-pix_fmt', 'yuv420p10le',
    ...(bitrate > 0 ? ['-b:v', `${Math.round(bitrate * 1000)}k`] : ['-crf', String(crf)]),
    '-x265-params', 'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:repeat-headers=1',
    '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', '-color_range', 'tv',
    ...(container === 'mkv' ? [] : ['-tag:v', 'hvc1'])];
}
