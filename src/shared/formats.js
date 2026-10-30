// Eksportformater. "wc" betyr maskinvarekoding via WebCodecs, "ff" betyr FFmpeg.

export const VIDEO_FORMATS = [
  { id: 'mp4-h264', label: 'MP4 (H.264)', ext: 'mp4', container: 'mp4', codec: 'avc', ffCodec: 'libx264', audio: 'aac', note: 'Spilles av overalt' },
  { id: 'mp4-hevc', label: 'MP4 (HEVC / H.265)', ext: 'mp4', container: 'mp4', codec: 'hevc', ffCodec: 'libx265', audio: 'aac', note: 'Halvparten så stor som H.264' },
  { id: 'mp4-av1', label: 'MP4 (AV1)', ext: 'mp4', container: 'mp4', codec: 'av1', ffCodec: 'libaom-av1', audio: 'aac', note: 'Minst fil, nyere avspillere' },
  { id: 'webm-vp9', label: 'WebM (VP9)', ext: 'webm', container: 'webm', codec: 'vp9', ffCodec: 'libvpx-vp9', audio: 'opus', note: 'For nettsider' },
  { id: 'webm-av1', label: 'WebM (AV1)', ext: 'webm', container: 'webm', codec: 'av1', ffCodec: 'libaom-av1', audio: 'opus', note: 'For nettsider, minst fil' },
  { id: 'mov-h264', label: 'MOV (H.264)', ext: 'mov', container: 'mov', codec: 'avc', ffCodec: 'libx264', audio: 'aac', note: 'QuickTime' },
  { id: 'mov-prores', label: 'MOV (ProRes 422)', ext: 'mov', container: 'mov', codec: null, ffCodec: 'prores_ks', audio: 'pcm', note: 'For videre redigering, store filer' },
  { id: 'mkv-h264', label: 'MKV (H.264)', ext: 'mkv', container: 'mkv', codec: 'avc', ffCodec: 'libx264', audio: 'aac', note: 'Matroska' },
  { id: 'gif', label: 'GIF (animert)', ext: 'gif', container: 'gif', codec: null, ffCodec: 'gif', audio: null, note: 'Uten lyd, korte klipp' },
];

export const AUDIO_FORMATS = [
  { id: 'mp3', label: 'MP3', ext: 'mp3', ffCodec: 'libmp3lame', note: 'Spilles av overalt' },
  { id: 'm4a', label: 'AAC (M4A)', ext: 'm4a', ffCodec: 'aac', note: 'God kvalitet, liten fil' },
  { id: 'wav', label: 'WAV', ext: 'wav', ffCodec: 'pcm_s16le', note: 'Ukomprimert' },
  { id: 'flac', label: 'FLAC', ext: 'flac', ffCodec: 'flac', note: 'Tapsfri' },
  { id: 'opus', label: 'Opus (OGG)', ext: 'ogg', ffCodec: 'libopus', note: 'Svært effektiv' },
];

export const PRESETS = [
  { id: 'standard', label: 'Standard', desc: 'MP4 H.264 i full kvalitet. Passer til det meste.', format: 'mp4-h264', quality: 'high', icon: 'film' },
  { id: 'web', label: 'YouTube og web', desc: 'MP4 H.264, 1080p, god balanse mellom kvalitet og størrelse.', format: 'mp4-h264', quality: 'medium', res: 1080, icon: 'globe' },
  { id: 'small', label: 'Minst fil', desc: 'AV1, liten fil med høy kvalitet.', format: 'mp4-av1', quality: 'medium', icon: 'feather' },
  { id: 'hevc', label: 'Apple-enheter', desc: 'HEVC, halvparten så stor som H.264.', format: 'mp4-hevc', quality: 'high', icon: 'apple' },
  { id: 'master', label: 'Master', desc: 'ProRes 422 for videre redigering i Final Cut Pro.', format: 'mov-prores', quality: 'high', icon: 'gem' },
  { id: 'gif', label: 'GIF', desc: 'Animert GIF uten lyd, 720p.', format: 'gif', quality: 'medium', res: 720, fps: 15, icon: 'image' },
  { id: 'audio', label: 'Bare lyd', desc: 'MP3, AAC, WAV, FLAC eller Opus.', audioOnly: true, audioFormat: 'mp3', quality: 'high', icon: 'music' },
];

export const QUALITIES = [
  { id: 'low', label: 'Lav', bpp: 0.05, crf: 30, audioKbps: 128 },
  { id: 'medium', label: 'Middels', bpp: 0.09, crf: 24, audioKbps: 160 },
  { id: 'high', label: 'Høy', bpp: 0.15, crf: 19, audioKbps: 256 },
  { id: 'max', label: 'Maks', bpp: 0.26, crf: 15, audioKbps: 320 },
];

// Komprimeringsgrad per kodek i forhold til H.264.
const CODEC_EFFICIENCY = { avc: 1, hevc: 0.6, vp9: 0.65, av1: 0.5 };

export function videoBitrate(fmt, quality, w, h, fps) {
  const q = QUALITIES.find((x) => x.id === quality) || QUALITIES[2];
  const eff = CODEC_EFFICIENCY[fmt.codec] ?? 1;
  // Skjermopptak komprimeres godt; bpp er satt med det i tankene.
  const bps = w * h * Math.min(fps, 60) * q.bpp * eff * (fps > 30 ? 0.75 : 1);
  return Math.round(Math.max(1.5e6, Math.min(120e6, bps)));
}

export function estimateSize(settings, duration, w, h) {
  const q = QUALITIES.find((x) => x.id === settings.quality) || QUALITIES[2];
  let bits = 0;
  if (settings.audioOnly) {
    const fmt = AUDIO_FORMATS.find((a) => a.id === settings.audioFormat);
    const kbps = fmt.id === 'wav' ? 1536 : fmt.id === 'flac' ? 800 : q.audioKbps;
    bits = kbps * 1000 * duration;
  } else {
    const fmt = VIDEO_FORMATS.find((f) => f.id === settings.format);
    if (fmt.id === 'mov-prores') bits = w * h * settings.fps * 4.4 * duration * 0.5;
    else if (fmt.id === 'gif') bits = w * h * settings.fps * 0.6 * duration * 0.3;
    else bits = (videoBitrate(fmt, settings.quality, w, h, settings.fps) * 0.6 + q.audioKbps * 1000) * duration;
  }
  return bits / 8;
}

export function outputSize(project, res) {
  let w = project.width;
  let h = project.height;
  if (res && Math.min(w, h) > res) {
    const k = res / Math.min(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { w: w - (w % 2), h: h - (h % 2) };
}

export function formatBytes(b) {
  if (b < 1e6) return `${Math.max(1, Math.round(b / 1e3))} kB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;
  return `${(b / 1e9).toFixed(1)} GB`;
}
