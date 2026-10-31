// Lydeffektene i avspillingen. Kjører i lydtråden med samme kode som eksporten bruker.
import { createChain } from '../shared/audiofx.js';

class ReccutFx extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chain = createChain(sampleRate);
    this.L = new Float32Array(128);
    this.R = new Float32Array(128);
    this.port.onmessage = (e) => this.chain.update(e.data || []);
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
    this.L.set(inp[0]);
    this.R.set(inp[1] || inp[0]);
    this.chain.process(this.L, this.R, n);
    out[0].set(this.L.subarray(0, n));
    if (out[1]) out[1].set(this.R.subarray(0, n));
    return true;
  }
}

registerProcessor('reccut-fx', ReccutFx);
