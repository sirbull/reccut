// Lydeffektene i avspillingen. Kjører i lydtråden med samme kode som eksporten bruker.
// Meldingen er effektlisten, eller { list, clean } når kilden er Clean Voice-filen med fire
// kanaler (original V/H, renset V/H). Da blandes de først med styrken clean.
import { cleanNoiseGain, createChain } from '../shared/audiofx.js';

class ReccutFx extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chain = createChain(sampleRate);
    this.clean = null;
    this.L = new Float32Array(128);
    this.R = new Float32Array(128);
    this.port.onmessage = (e) => {
      const d = e.data;
      this.clean = Array.isArray(d) ? null : d?.clean ?? null;
      this.chain.update((Array.isArray(d) ? d : d?.list) || []);
    };
  }

  process(inputs, outputs) {
    const inp = inputs[0];
    const out = outputs[0];
    const n = out[0].length;
    if (!inp || !inp.length) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    if (this.L.length < n) {
      this.L = new Float32Array(n);
      this.R = new Float32Array(n);
    }
    if (this.clean != null && inp.length >= 4) {
      const g = cleanNoiseGain(this.clean);
      for (let i = 0; i < n; i++) {
        this.L[i] = inp[2][i] + (inp[0][i] - inp[2][i]) * g;
        this.R[i] = inp[3][i] + (inp[1][i] - inp[3][i]) * g;
      }
    } else {
      this.L.set(inp[0]);
      this.R.set(inp[1] || inp[0]);
    }
    this.chain.process(this.L, this.R, n);
    out[0].set(this.L.subarray(0, n));
    if (out[1]) out[1].set(this.R.subarray(0, n));
    return true;
  }
}

registerProcessor('reccut-fx', ReccutFx);
