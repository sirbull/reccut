// Reserve for MPEG-TS (.ts, .mts, .m2ts, AVCHD fra kameraer) når FFmpeg ikke klarer å åpne filen.
// Pakkene leses direkte: PAT og PMT gir strømmene, og PES-pakkene settes sammen til rene
// bilde- og lydstrømmer som FFmpeg kan lese (rå H.264, HEVC, MPEG-2, AAC, AC-3 og MPEG-lyd).
// Tidsstemplene (PTS) gir bildefrekvens og lengde.
const fs = require('fs');

const VIDEO_TYPES = { 0x1b: 'h264', 0x24: 'hevc', 0x02: 'm2v', 0x01: 'm2v', 0x10: 'm4v' };
const AUDIO_TYPES = { 0x0f: 'aac', 0x11: 'latm', 0x81: 'ac3', 0x87: 'eac3', 0x03: 'mp2', 0x04: 'mp2' };
const EXT = { h264: '.h264', hevc: '.hevc', m2v: '.m2v', m4v: '.m4v', aac: '.aac', latm: '.latm', ac3: '.ac3', eac3: '.eac3', mp2: '.mp2' };

// Finner pakkestørrelsen: 188 byte (TS) eller 192 byte (M2TS/AVCHD med 4 byte tidskode foran).
function packetLayout(buf) {
  for (const [size, off] of [[188, 0], [192, 4], [204, 0]]) {
    let ok = 0;
    for (let i = 0; i < 8; i++) if (buf[off + i * size] === 0x47) ok++;
    if (ok >= 7) return { size, off };
  }
  return null;
}

function readPts(b, i) {
  return (((b[i] >> 1) & 0x07) * 2 ** 30) + ((((b[i + 1] << 8) | b[i + 2]) >> 1) * 2 ** 15) + (((b[i + 3] << 8) | b[i + 4]) >> 1);
}

/**
 * Leser filen og skriver strømmene til outBase + endelse. Gir
 * { video: { file, codec, fps }, audio: { file, codec }, duration } eller null om filen ikke er TS.
 */
async function demux(file, outBase) {
  const buf = await fs.promises.readFile(file);
  const layout = packetLayout(buf);
  if (!layout) return null;
  let pmtPid = -1;
  const streams = new Map(); // pid -> { kind, codec, chunks, pts: [] }
  const pending = new Map(); // pid -> pågående PES
  const flush = (pid) => {
    const p = pending.get(pid);
    const st = streams.get(pid);
    if (!p || !st) return;
    pending.delete(pid);
    const pes = Buffer.concat(p);
    if (pes.length < 9 || pes[0] !== 0 || pes[1] !== 0 || pes[2] !== 1) return;
    const headerLen = pes[8];
    if (pes[7] & 0x80) st.pts.push(readPts(pes, 9));
    st.chunks.push(pes.subarray(9 + headerLen));
  };
  for (let pos = layout.off; pos + 188 <= buf.length; pos += layout.size) {
    if (buf[pos] !== 0x47) continue;
    const start = (buf[pos + 1] & 0x40) !== 0;
    const pid = ((buf[pos + 1] & 0x1f) << 8) | buf[pos + 2];
    const afc = (buf[pos + 3] >> 4) & 3;
    let p = pos + 4;
    if (afc === 2) continue;
    if (afc === 3) p += 1 + buf[p];
    if (p >= pos + 188) continue;
    const payload = buf.subarray(p, pos + 188);
    if (pid === 0 && start) {
      // PAT: første program gir PMT.
      const t = payload.subarray(1 + payload[0]);
      const len = ((t[1] & 0x0f) << 8) | t[2];
      for (let i = 8; i + 4 <= 3 + len - 4; i += 4) {
        const prog = (t[i] << 8) | t[i + 1];
        if (prog !== 0) {
          pmtPid = ((t[i + 2] & 0x1f) << 8) | t[i + 3];
          break;
        }
      }
      continue;
    }
    if (pid === pmtPid && start) {
      const t = payload.subarray(1 + payload[0]);
      const len = ((t[1] & 0x0f) << 8) | t[2];
      const infoLen = ((t[10] & 0x0f) << 8) | t[11];
      for (let i = 12 + infoLen; i + 5 <= 3 + len - 4; ) {
        const type = t[i];
        const epid = ((t[i + 1] & 0x1f) << 8) | t[i + 2];
        const esLen = ((t[i + 3] & 0x0f) << 8) | t[i + 4];
        if (!streams.has(epid)) {
          if (VIDEO_TYPES[type]) streams.set(epid, { kind: 'video', codec: VIDEO_TYPES[type], chunks: [], pts: [] });
          else if (AUDIO_TYPES[type]) streams.set(epid, { kind: 'audio', codec: AUDIO_TYPES[type], chunks: [], pts: [] });
        }
        i += 5 + esLen;
      }
      continue;
    }
    if (!streams.has(pid)) continue;
    if (start) {
      flush(pid);
      pending.set(pid, [payload]);
    } else pending.get(pid)?.push(payload);
  }
  for (const pid of [...pending.keys()]) flush(pid);
  const all = [...streams.values()].filter((s) => s.chunks.length);
  const v = all.find((s) => s.kind === 'video');
  const a = all.find((s) => s.kind === 'audio');
  if (!v && !a) return null;
  const out = { duration: 0 };
  const span = (pts) => {
    if (pts.length < 2) return 0;
    const sorted = [...pts].sort((x, y) => x - y);
    return (sorted[sorted.length - 1] - sorted[0]) / 90000;
  };
  if (v) {
    const file2 = outBase + EXT[v.codec];
    await fs.promises.writeFile(file2, Buffer.concat(v.chunks));
    // Bildefrekvens fra tidsstemplene: vanligvis ett bilde per PES-pakke.
    const sorted = [...v.pts].sort((x, y) => x - y);
    const steps = [];
    for (let i = 1; i < sorted.length; i++) if (sorted[i] > sorted[i - 1]) steps.push(sorted[i] - sorted[i - 1]);
    steps.sort((x, y) => x - y);
    const step = steps.length ? steps[Math.floor(steps.length / 2)] : 3600;
    const fps = Math.round((90000 / step) * 1000) / 1000;
    out.video = { file: file2, codec: v.codec, fps };
    out.duration = span(v.pts) + 1 / fps;
  }
  if (a) {
    const file2 = outBase + EXT[a.codec];
    await fs.promises.writeFile(file2, Buffer.concat(a.chunks));
    out.audio = { file: file2, codec: a.codec };
    out.duration = Math.max(out.duration, span(a.pts));
  }
  return out;
}

module.exports = { demux, packetLayout };
