// Eksportformater. "wc" betyr maskinvarekoding via WebCodecs, "ff" betyr FFmpeg.

export const VIDEO_FORMATS = [
  { id: 'mp4-h264', label: 'MP4 (H.264)', ext: 'mp4', container: 'mp4', codec: 'avc', ffCodec: 'libx264', audio: 'aac', note: 'Plays everywhere' },
  { id: 'mp4-hevc', label: 'MP4 (HEVC / H.265)', ext: 'mp4', container: 'mp4', codec: 'hevc', ffCodec: 'libx265', audio: 'aac', note: 'Half the size of H.264' },
  { id: 'mp4-av1', label: 'MP4 (AV1)', ext: 'mp4', container: 'mp4', codec: 'av1', ffCodec: 'libaom-av1', audio: 'aac', note: 'Smallest files, newer players' },
  { id: 'webm-vp9', label: 'WebM (VP9)', ext: 'webm', container: 'webm', codec: 'vp9', ffCodec: 'libvpx-vp9', audio: 'opus', note: 'For websites' },
  { id: 'webm-av1', label: 'WebM (AV1)', ext: 'webm', container: 'webm', codec: 'av1', ffCodec: 'libaom-av1', audio: 'opus', note: 'For websites, smallest files' },
  { id: 'mov-h264', label: 'MOV (H.264)', ext: 'mov', container: 'mov', codec: 'avc', ffCodec: 'libx264', audio: 'aac', note: 'QuickTime' },
  { id: 'mov-prores', label: 'MOV (ProRes 422)', ext: 'mov', container: 'mov', codec: null, ffCodec: 'prores_ks', audio: 'pcm', note: 'For further editing, large files' },
  { id: 'mkv-h264', label: 'MKV (H.264)', ext: 'mkv', container: 'mkv', codec: 'avc', ffCodec: 'libx264', audio: 'aac', note: 'Matroska' },
  { id: 'gif', label: 'GIF (animated)', ext: 'gif', container: 'gif', codec: null, ffCodec: 'gif', audio: null, note: 'No audio, short clips' },
];

export const AUDIO_FORMATS = [
  { id: 'mp3', label: 'MP3', ext: 'mp3', ffCodec: 'libmp3lame', note: 'Plays everywhere' },
  { id: 'm4a', label: 'AAC (M4A)', ext: 'm4a', ffCodec: 'aac', note: 'Good quality, small file' },
  { id: 'wav', label: 'WAV', ext: 'wav', ffCodec: 'pcm_s16le', note: 'Uncompressed' },
  { id: 'flac', label: 'FLAC', ext: 'flac', ffCodec: 'flac', note: 'Lossless' },
  { id: 'opus', label: 'Opus (OGG)', ext: 'ogg', ffCodec: 'libopus', note: 'Very efficient' },
];

export const PRESETS = [
  { id: 'standard', label: 'Standard', desc: 'MP4 H.264 at full quality. Works for almost anything.', format: 'mp4-h264', quality: 'high', icon: 'film' },
  { id: 'web', label: 'YouTube and Web', desc: 'MP4 H.264 at 1080p with a good balance of quality and size.', format: 'mp4-h264', quality: 'medium', res: 1080, icon: 'globe' },
  { id: 'small', label: 'Smallest File', desc: 'AV1, a small file with high quality.', format: 'mp4-av1', quality: 'medium', icon: 'feather' },
  { id: 'hevc', label: 'Apple Devices', desc: 'HEVC, half the size of H.264.', format: 'mp4-hevc', quality: 'high', icon: 'apple' },
  { id: 'master', label: 'Master', desc: 'ProRes 422 for further editing in Final Cut Pro.', format: 'mov-prores', quality: 'high', icon: 'gem' },
  { id: 'gif', label: 'GIF', desc: 'Animated GIF at 720p, no audio.', format: 'gif', quality: 'medium', res: 720, fps: 15, icon: 'image' },
  { id: 'audio', label: 'Audio Only', desc: 'MP3, AAC, WAV, FLAC or Opus.', audioOnly: true, audioFormat: 'mp3', quality: 'high', icon: 'music' },
];

export const QUALITIES = [
  { id: 'low', label: 'Low', bpp: 0.05, crf: 30, audioKbps: 128 },
  { id: 'medium', label: 'Medium', bpp: 0.09, crf: 24, audioKbps: 160 },
  { id: 'high', label: 'High', bpp: 0.15, crf: 19, audioKbps: 256 },
  { id: 'max', label: 'Best', bpp: 0.26, crf: 15, audioKbps: 320 },
];

// Komprimeringsgrad per kodek i forhold til H.264.
const CODEC_EFFICIENCY = { avc: 1, hevc: 0.6, vp9: 0.65, av1: 0.5 };

export const CAPTION_EXPORT = [
  { value: 'burn', label: 'Burn into the video' },
  { value: 'embed', label: 'Embedded track (viewers can turn it on and off)' },
  { value: 'srt', label: 'Separate SRT file' },
  { value: 'vtt', label: 'Separate WebVTT file' },
  { value: 'burn+srt', label: 'Burn in and SRT file' },
  { value: 'embed+srt', label: 'Embedded track and SRT file' },
  { value: 'none', label: 'Leave out' },
];

export const CAPTION_EXPORT_AUDIO = [
  { value: 'srt', label: 'Separate SRT file' },
  { value: 'vtt', label: 'Separate WebVTT file' },
  { value: 'none', label: 'Leave out' },
];

export const SIZE_PRESETS = [
  { value: 0, label: 'Original' },
  { value: 2160, label: '4K' },
  { value: 1440, label: '1440p' },
  { value: 1080, label: '1080p' },
  { value: 720, label: '720p' },
  { value: 480, label: '480p' },
  { value: 'custom', label: 'Custom' },
];

export const CROP_ASPECTS = [
  { value: null, label: 'None' },
  { value: 16 / 9, label: '16:9' },
  { value: 9 / 16, label: '9:16' },
  { value: 1, label: '1:1' },
  { value: 4 / 5, label: '4:5' },
  { value: 'free', label: 'Free' },
];

export const FIT_MODES = [
  { value: 'contain', label: 'Fit', title: 'Shows the whole picture, with black bars if needed' },
  { value: 'cover', label: 'Fill', title: 'Fills the frame and crops the edges' },
  { value: 'stretch', label: 'Stretch', title: 'Stretches the picture to the frame' },
];

const even = (v) => Math.max(2, Math.round(v / 2) * 2);

// Beskjæringen lagres som andeler (0 til 1) av prosjektbildet.
export function cropRect(project, crop) {
  const W = project.width;
  const H = project.height;
  if (!crop) return { x: 0, y: 0, w: W, h: H };
  return { x: crop.x * W, y: crop.y * H, w: Math.max(2, crop.w * W), h: Math.max(2, crop.h * H) };
}

// Gir et utsnitt med valgt sideforhold, midt i bildet og så stort som mulig.
export function cropForAspect(project, aspect) {
  if (!aspect || aspect === 'free') return null;
  const W = project.width;
  const H = project.height;
  let w = W;
  let h = W / aspect;
  if (h > H) {
    h = H;
    w = H * aspect;
  }
  return { x: (W - w) / 2 / W, y: (H - h) / 2 / H, w: w / W, h: h / H };
}

function sizeOf(settings) {
  if (settings.size) return settings.size;
  return { preset: settings.res || 0 };
}

// Utdatastørrelse og transformasjon fra prosjektbildet til filen.
export function outputGeometry(project, settings = {}) {
  const c = cropRect(project, settings.crop);
  const size = sizeOf(settings);
  let w;
  let h;
  if (size.preset === 'custom' && size.w > 0 && size.h > 0) {
    w = size.w;
    h = size.h;
  } else if (size.preset) {
    const k = size.preset / Math.min(c.w, c.h);
    w = c.w * k;
    h = c.h * k;
  } else {
    w = c.w;
    h = c.h;
  }
  w = even(Math.min(8192, w));
  h = even(Math.min(8192, h));
  let sx = w / c.w;
  let sy = h / c.h;
  const fit = settings.fit || 'contain';
  if (fit === 'contain' || fit === 'cover') {
    const s = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
    sx = s;
    sy = s;
  }
  const tx = (w - c.w * sx) / 2 - c.x * sx;
  const ty = (h - c.h * sy) / 2 - c.y * sy;
  return { w, h, matrix: [sx, sy, tx, ty], crop: c };
}

// Bakoverkompatibel: brukes der bare størrelsen trengs.
export function outputSize(project, res) {
  const { w, h } = outputGeometry(project, { size: { preset: res || 0 } });
  return { w, h };
}

export function videoBitrate(fmt, quality, w, h, fps, customMbps) {
  if (customMbps > 0) return Math.round(customMbps * 1e6);
  const q = QUALITIES.find((x) => x.id === quality) || QUALITIES[2];
  const eff = CODEC_EFFICIENCY[fmt.codec] ?? 1;
  // Skjermopptak komprimeres godt; bpp er satt med det i tankene.
  const bps = w * h * Math.min(fps, 60) * q.bpp * eff * (fps > 30 ? 0.75 : 1);
  return Math.round(Math.max(1.5e6, Math.min(120e6, bps)));
}

export function audioKbps(settings) {
  if (settings.audioKbps > 0) return settings.audioKbps;
  return (QUALITIES.find((x) => x.id === settings.quality) || QUALITIES[2]).audioKbps;
}

export function estimateSize(settings, duration, w, h) {
  const akbps = audioKbps(settings);
  let bits = 0;
  if (settings.audioOnly) {
    const fmt = AUDIO_FORMATS.find((a) => a.id === settings.audioFormat) || AUDIO_FORMATS[0];
    const kbps = fmt.id === 'wav' ? 1536 : fmt.id === 'flac' ? 800 : akbps;
    bits = kbps * 1000 * duration;
  } else {
    const fmt = VIDEO_FORMATS.find((f) => f.id === settings.format) || VIDEO_FORMATS[0];
    if (fmt.id === 'mov-prores') bits = w * h * settings.fps * 4.4 * duration * 0.5;
    else if (fmt.id === 'gif') bits = w * h * settings.fps * 0.6 * duration * 0.3;
    else {
      const v = videoBitrate(fmt, settings.quality, w, h, settings.fps, settings.bitrate);
      bits = (v * (settings.bitrate > 0 ? 1 : 0.6) + (fmt.audio ? akbps * 1000 : 0)) * duration;
    }
  }
  return bits / 8;
}

export function formatBytes(b) {
  if (b < 1e6) return `${Math.max(1, Math.round(b / 1e3))} kB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;
  return `${(b / 1e9).toFixed(1)} GB`;
}
