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

// Avansert: container, videokodek og lydkodek hver for seg. Formatet lagres som "custom:mov/prores-hq/pcm".
export const CONTAINERS = [
  { id: 'mp4', label: 'MP4' },
  { id: 'mov', label: 'MOV (QuickTime)' },
  { id: 'mkv', label: 'MKV (Matroska)' },
  { id: 'webm', label: 'WebM' },
];

export const VIDEO_CODECS = [
  { id: 'h264', label: 'H.264', codec: 'avc', ffCodec: 'libx264', in: ['mp4', 'mov', 'mkv'] },
  { id: 'hevc', label: 'HEVC / H.265', codec: 'hevc', ffCodec: 'libx265', in: ['mp4', 'mov', 'mkv'] },
  { id: 'av1', label: 'AV1', codec: 'av1', ffCodec: 'libaom-av1', in: ['mp4', 'mkv', 'webm'] },
  { id: 'vp9', label: 'VP9', codec: 'vp9', ffCodec: 'libvpx-vp9', in: ['mp4', 'mkv', 'webm'] },
  { id: 'prores-proxy', label: 'ProRes 422 Proxy', codec: null, ffCodec: 'prores_ks', profile: 0, rate: 0.3, in: ['mov', 'mkv'] },
  { id: 'prores-lt', label: 'ProRes 422 LT', codec: null, ffCodec: 'prores_ks', profile: 1, rate: 0.7, in: ['mov', 'mkv'] },
  { id: 'prores', label: 'ProRes 422', codec: null, ffCodec: 'prores_ks', profile: 2, rate: 1, in: ['mov', 'mkv'] },
  { id: 'prores-hq', label: 'ProRes 422 HQ', codec: null, ffCodec: 'prores_ks', profile: 3, rate: 1.5, in: ['mov', 'mkv'] },
];

export const AUDIO_CODECS = [
  { id: 'aac', label: 'AAC', in: ['mp4', 'mov', 'mkv'] },
  { id: 'opus', label: 'Opus', in: ['mp4', 'mkv', 'webm'] },
  { id: 'pcm', label: 'PCM (uncompressed)', in: ['mov', 'mkv'] },
  { id: 'none', label: 'No audio', in: ['mp4', 'mov', 'mkv', 'webm'] },
];

// Lager en gyldig kombinasjon: kodeker containeren ikke støtter byttes mot den første som passer.
export function customFormatId(container, video, audio) {
  const c = CONTAINERS.find((x) => x.id === container) || CONTAINERS[0];
  const fit = (list, id) => list.find((x) => x.id === id && x.in.includes(c.id)) || list.find((x) => x.in.includes(c.id));
  return `custom:${c.id}/${fit(VIDEO_CODECS, video).id}/${fit(AUDIO_CODECS, audio).id}`;
}

export function parseCustom(id) {
  const [container, video, audio] = String(id).replace(/^custom:/, '').split('/');
  return { container, video, audio };
}

// Formatobjektet for en id, enten et av de faste formatene eller en egen kombinasjon.
export function videoFormat(id) {
  const fixed = VIDEO_FORMATS.find((f) => f.id === id);
  if (fixed) return fixed;
  if (!String(id).startsWith('custom:')) return VIDEO_FORMATS[0];
  const want = parseCustom(id);
  const clamped = customFormatId(want.container, want.video, want.audio);
  const { container, video, audio } = parseCustom(clamped);
  const v = VIDEO_CODECS.find((x) => x.id === video);
  const a = AUDIO_CODECS.find((x) => x.id === audio);
  const c = CONTAINERS.find((x) => x.id === container);
  return { id: clamped, label: `${c.label}, ${v.label}, ${a.label}`, ext: container, container, codec: v.codec, ffCodec: v.ffCodec, profile: v.profile, rate: v.rate, audio: a.id === 'none' ? null : a.id, note: 'Custom' };
}

// Motsatt vei: et fast format som egen kombinasjon, når man bytter til avansert.
export function toCustom(id) {
  if (String(id).startsWith('custom:')) return id;
  const f = videoFormat(id);
  if (f.container === 'gif') return customFormatId('mp4', 'h264', 'aac');
  const v = VIDEO_CODECS.find((x) => x.ffCodec === f.ffCodec && (x.profile ?? 2) === (f.profile ?? 2));
  return customFormatId(f.container, v?.id, f.audio || 'none');
}

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
    const fmt = videoFormat(settings.format);
    if (fmt.ffCodec === 'prores_ks') bits = w * h * settings.fps * 4.4 * duration * 0.5 * (fmt.rate ?? 1);
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

// Kamera-RAW-video trenger produsentens dekoder. Er den installert, gjør appen klippet om til ProRes ved import
// (src/main/decoders.js). Mangler den, kommer et varsel med lenke og Locate. tool er id-en i decoders.js.
// Canon har verken kommandolinjeverktøy eller SDK, så Cinema RAW Light må konverteres i Canons program.
export const RAW_DECODERS = [
  { ext: /\.braw$/i, name: 'Blackmagic RAW', vendor: 'Blackmagic Design', app: 'Blackmagic RAW', tool: 'braw', url: 'https://www.blackmagicdesign.com/developer/products/braw/sdk-and-software' },
  { ext: /\.r3d$/i, name: 'RED R3D', vendor: 'RED', app: 'REDCINE-X PRO', tool: 'redline', url: 'https://www.red.com/downloads' },
  { ext: /\.nev$/i, name: 'Nikon N-RAW', vendor: 'RED', app: 'REDCINE-X PRO', tool: 'redline', url: 'https://www.red.com/downloads' },
  { ext: /\.(ari|arx|mxf)$/i, name: 'ARRIRAW', vendor: 'ARRI', app: 'ARRI Reference Tool', tool: 'artcmd', url: 'https://www.arri.com/en/learn-help/learn-help-camera-system/tools/arri-reference-tool' },
  { ext: /\.crm$/i, name: 'Canon Cinema RAW Light', vendor: 'Canon', app: 'Cinema RAW Development', tool: null, url: null },
];

export const rawDecoderFor = (file, tool) => RAW_DECODERS.find((d) => d.ext.test(file) && (tool === undefined || d.tool === tool)) || null;
const base = (p) => p.split(/[\\/]/).pop();

// Gir { text, links, locate } for filene som ikke kunne leses.
// failed: filnavn som ikke kunne leses. missing: [{ tool, file }] fra importen, der dekoderen ikke er installert.
// links: [{ label, url }] til produsentene. locate: [{ label, tool, files }] for å peke på verktøyet selv.
export function couldNotRead(failed, missing = []) {
  const canon = failed.filter((f) => rawDecoderFor(f)?.vendor === 'Canon');
  const other = failed.filter((f) => !canon.includes(f));
  const groups = new Map();
  for (const m of missing) {
    const d = rawDecoderFor(m.file, m.tool) || RAW_DECODERS.find((x) => x.tool === m.tool);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(m.file);
  }
  const text = [
    other.length && `Could not read ${other.join(', ')}. The file may be damaged or in an unsupported format.`,
    canon.length && `${canon.join(', ')} ${canon.length > 1 ? 'are' : 'is'} Canon Cinema RAW Light. Canon has no decoder other apps can use, so export the clip to ProRes in Cinema RAW Development first.`,
    ...[...groups].map(([d, files]) => `${files.map(base).join(', ')} ${files.length > 1 ? 'are' : 'is'} ${d.name}. Install ${d.app} from ${d.vendor}, or locate it if it is installed somewhere else, and Reccut converts the clip to ProRes when you import it.`),
  ].filter(Boolean).join(' ');
  const decoders = [...groups.keys()];
  return {
    text,
    links: decoders.filter((d) => d.url).map((d) => ({ label: `Get ${d.app}`, url: d.url })),
    locate: [...groups].map(([d, files]) => ({ label: `Locate ${d.app}…`, tool: d.tool, files })),
  };
}

/* Bildefrekvens som ikke går opp: et klipp med 25 fps i en 30 fps-eksport får noen bilder vist to ganger,
   og bevegelsen hakker. Farten regnes med, så 60 fps på 50 % passer i 30 fps. */
const fitsEvenly = (rate, fps) => {
  const r = rate >= fps ? rate / fps : fps / rate;
  return Math.abs(r - Math.round(r)) < 0.02;
};

// Gir klippene som vil hakke ved fps, og en frekvens blant candidates der færrest hakker (eller null).
export function frameRateCheck(project, fps, candidates) {
  const clips = new Map();
  const used = [];
  for (const c of Object.values(project.clips)) {
    if (c.enabled === false || c.ramp || (c.type !== 'video' && c.type !== 'recording')) continue;
    const m = project.media[c.mediaId];
    const src = Object.values(m?.streams || {}).find((s) => s.hasVideo)?.fps || m?.fps;
    const rate = src * Math.abs(c.speed ?? 1);
    if (!rate) continue;
    used.push({ rate, dur: c.dur });
    if (!fitsEvenly(rate, fps)) clips.set(`${m.id}:${rate}`, { name: m.name, fps: Math.round(rate * 100) / 100 });
  }
  const bad = (f) => used.reduce((sum, u) => sum + (fitsEvenly(u.rate, f) ? 0 : u.dur), 0);
  let best = bad(fps);
  let suggest = null;
  // Ved likt resultat vinner den laveste, som gir mindre filer.
  for (const f of [...candidates].sort((x, y) => x - y)) if (bad(f) < best) [best, suggest] = [bad(f), f];
  return { clips: [...clips.values()], suggest };
}

// Hvilke kopier sekvensen bruker: optimalisert media, og proxyer (høyst 1920 piksler) uten optimalisert media.
// Avgjør om eksporten skal tilby valget mellom originalene og kopiene.
export function mediaCopies(project) {
  const seen = new Set();
  let optimized = 0;
  let proxies = 0;
  for (const c of Object.values(project.clips)) {
    const m = project.media[c.mediaId];
    if (!m || m.kind === 'image' || seen.has(m.id)) continue;
    seen.add(m.id);
    const st = Object.values(m.streams || {}).find((s) => s.hasVideo);
    if (st?.optimized) optimized++;
    else if (st?.proxy && st.needsProxy) proxies++;
  }
  return { optimized, proxies };
}
