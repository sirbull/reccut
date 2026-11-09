// Voiceover Booth: leser mikrofonen prøve for prøve. Nivået sendes hele tiden (til måleren),
// lyden bare mens det tas opp. Lyden samles i biter på omtrent 85 ms for å spare meldinger.
class VoCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.channel = 0; // 0, 1 eller -1 (blanding)
    this.chunk = new Float32Array(4096);
    this.fill = 0;
    this.peak = 0;
    this.sum = 0;
    this.count = 0;
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if ('channel' in m) this.channel = m.channel;
      if (m.record === true) {
        this.recording = true;
        this.fill = 0;
      }
      if (m.record === false) {
        this.flush();
        this.recording = false;
        this.port.postMessage({ stopped: true });
      }
    };
  }
  flush() {
    if (!this.fill) return;
    const out = this.chunk.slice(0, this.fill);
    this.port.postMessage({ samples: out }, [out.buffer]);
    this.fill = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const a = input[Math.min(Math.max(this.channel, 0), input.length - 1)];
    const b = this.channel < 0 && input.length > 1 ? input[1] : null;
    for (let i = 0; i < a.length; i++) {
      const s = b ? (a[i] + b[i]) * 0.5 : a[i];
      const abs = s < 0 ? -s : s;
      if (abs > this.peak) this.peak = abs;
      this.sum += s * s;
      this.count++;
      if (this.recording) {
        this.chunk[this.fill++] = s;
        if (this.fill === this.chunk.length) this.flush();
      }
    }
    if (this.count >= 2048) {
      this.port.postMessage({ level: { peak: this.peak, rms: Math.sqrt(this.sum / this.count) } });
      this.peak = 0;
      this.sum = 0;
      this.count = 0;
    }
    return true;
  }
}
registerProcessor('reccut-vo-capture', VoCapture);
