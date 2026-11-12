// AI-støyfjerning (DeepFilterNet 3) i et skjult vindu med filtilgang.
// Inn: rå stereo f32 i 48 kHz. Ut: fire kanaler f32 (original V/H, renset V/H) på samme tid,
// så avspillingen og eksporten kan blande dem med styrken på klippet.
import * as ort from 'onnxruntime-web/wasm';

const { ipcRenderer } = require('electron');
const fs = require('fs');

ort.env.wasm.wasmPaths = new URL('./ort/', location.href).href;
ort.env.wasm.numThreads = 1;

const FRAME = 480; // 10 ms
const STATES = 45304;
const DELAY = 1440; // modellen gir ut lyden tre rammer senere
const CHUNK = 48000; // ett sekund, delelig med FRAME
const canceled = new Set();
let session = null;
let queue = Promise.resolve();

function readStereo(fd, total, from, n) {
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const avail = Math.max(0, Math.min(n, total - from));
  if (!avail) return { L, R };
  const buf = Buffer.alloc(avail * 8);
  fs.readSync(fd, buf, 0, buf.length, from * 8);
  const f = new Float32Array(buf.buffer, buf.byteOffset, avail * 2);
  for (let i = 0; i < avail; i++) {
    L[i] = f[i * 2];
    R[i] = f[i * 2 + 1];
  }
  return { L, R };
}

// Like kanaler (vanlig for mikrofoner) renses bare én gang.
function isMono(fd, total) {
  for (let pos = 0; pos < total; pos += CHUNK) {
    const { L, R } = readStereo(fd, total, pos, Math.min(CHUNK, total - pos));
    for (let i = 0; i < L.length; i++) if (Math.abs(L[i] - R[i]) > 1e-4) return false;
  }
  return true;
}

async function denoise(jobId, { input, output, model }) {
  session ||= await ort.InferenceSession.create(fs.readFileSync(model), { executionProviders: ['wasm'] });
  const total = Math.floor(fs.statSync(input).size / 8);
  const fd = fs.openSync(input, 'r');
  const out = fs.openSync(output, 'w');
  try {
    const chans = isMono(fd, total) ? 1 : 2;
    const states = Array.from({ length: chans }, () => new ort.Tensor('float32', new Float32Array(STATES), [STATES]));
    const lim = new ort.Tensor('float32', new Float32Array([100]), []);
    const frame = new Float32Array(FRAME);
    const end = total + DELAY;
    for (let pos = 0; pos < end; pos += CHUNK) {
      if (canceled.has(jobId)) throw new Error('Canceled');
      const n = Math.ceil(Math.min(CHUNK, end - pos) / FRAME) * FRAME;
      const x = readStereo(fd, total, pos, n);
      const enh = [];
      for (let c = 0; c < chans; c++) {
        const src = c ? x.R : x.L;
        const y = new Float32Array(n);
        for (let f = 0; f < n; f += FRAME) {
          frame.set(src.subarray(f, f + FRAME));
          const r = await session.run({ input_frame: new ort.Tensor('float32', frame, [FRAME]), states: states[c], atten_lim_db: lim });
          y.set(r.enhanced_audio_frame.data, f);
          states[c] = r.new_states;
        }
        enh.push(y);
      }
      // Den rensede lyden ved pos tilhører kildetiden pos - DELAY.
      const s0 = Math.max(0, pos - DELAY);
      const s1 = Math.min(total, pos + n - DELAY);
      if (s1 > s0) {
        const o = readStereo(fd, total, s0, s1 - s0);
        const rows = new Float32Array((s1 - s0) * 4);
        for (let i = 0; i < s1 - s0; i++) {
          const e = s0 + i + DELAY - pos;
          rows[i * 4] = o.L[i];
          rows[i * 4 + 1] = o.R[i];
          rows[i * 4 + 2] = enh[0][e];
          rows[i * 4 + 3] = enh[chans - 1][e];
        }
        fs.writeSync(out, Buffer.from(rows.buffer));
      }
      ipcRenderer.send('worker:progress', { jobId, progress: Math.min(1, (pos + n) / end), stage: 'Removing background noise' });
    }
  } finally {
    fs.closeSync(fd);
    fs.closeSync(out);
  }
}

// Én fil om gangen, så to jobber ikke bruker modellen samtidig.
ipcRenderer.on('worker:job', (_e, { jobId, payload }) => {
  queue = queue.then(async () => {
    try {
      await denoise(jobId, payload);
      ipcRenderer.send('worker:done', { jobId, result: payload.output });
    } catch (err) {
      ipcRenderer.send('worker:error', { jobId, error: canceled.has(jobId) ? 'Canceled' : String(err?.message || err) });
    } finally {
      canceled.delete(jobId);
    }
  });
});
ipcRenderer.on('worker:cancel', (_e, jobId) => canceled.add(jobId));
