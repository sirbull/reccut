// The same signal path feeds the meters, microphone test and recorded audio.
export const FLAT_MIX = Object.freeze({ gain: 0, low: 0, mid: 0, high: 0, highpass: false, compressor: false, threshold: -18, ratio: 3 });
export const MIC_PRESETS = [
  { id: 'flat', label: 'Flat', mix: FLAT_MIX },
  { id: 'voice', label: 'Clear speech', mix: { ...FLAT_MIX, highpass: true, mid: 2, high: 2, compressor: true } },
  { id: 'warm', label: 'Warm voice', mix: { ...FLAT_MIX, highpass: true, low: 3, mid: -1, high: -2, compressor: true } },
  { id: 'bright', label: 'Bright voice', mix: { ...FLAT_MIX, highpass: true, low: -2, mid: 1, high: 4, compressor: true } },
];

export function normalizeMix(value) {
  const source = value && typeof value === 'object' ? value : {};
  const number = (key, min, max) => typeof source[key] === 'number' && Number.isFinite(source[key])
    ? Math.round(Math.min(max, Math.max(min, source[key])) * 10) / 10 : FLAT_MIX[key];
  return {
    gain: number('gain', -24, 24), low: number('low', -12, 12), mid: number('mid', -12, 12), high: number('high', -12, 12),
    highpass: source.highpass === true, compressor: source.compressor === true,
    threshold: number('threshold', -48, 0), ratio: number('ratio', 1, 12),
  };
}

export const meterPercent = (db) => Math.min(100, Math.max(0, (db + 60) / 60 * 100));
export const meterDb = (value) => Number.isFinite(value) && value > -90 ? `${value.toFixed(1)} dBFS` : '−∞ dBFS';
export const EMPTY_LEVELS = Object.freeze({ input: -Infinity, output: -Infinity, rms: -Infinity, held: -Infinity, reduction: 0, spectrum: [] });

export function createMicMixer(context, stream, initial, { channel = 'stereo', delay: delayMs = 0 } = {}) {
  const source = context.createMediaStreamSource(stream);
  const splitter = context.createChannelSplitter(2);
  const input = context.createAnalyser();
  const gain = context.createGain();
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.Q.value = 0.707;
  const filters = [['lowshelf', 180], ['peaking', 1500], ['highshelf', 5000]].map(([type, frequency]) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    return filter;
  });
  const compressor = context.createDynamicsCompressor();
  compressor.attack.value = 0.008;
  compressor.release.value = 0.18;
  const output = context.createAnalyser();
  const delay = context.createDelay(1);
  delay.delayTime.value = delayMs / 1000;
  input.fftSize = output.fftSize = 2048;
  const destination = context.createMediaStreamDestination();
  const nodes = [source, splitter, input, gain, highpass, ...filters, compressor, output, delay, destination];
  let highpassOn = null;
  // Bypass the high-pass filter completely in Flat mode.
  const set = (value) => {
    const mix = normalizeMix(value);
    const smooth = (param, v) => param.setTargetAtTime(v, context.currentTime, 0.015);
    smooth(gain.gain, Math.pow(10, mix.gain / 20));
    smooth(highpass.frequency, 80);
    filters.forEach((filter, i) => smooth(filter.gain, mix[['low', 'mid', 'high'][i]]));
    smooth(compressor.threshold, mix.threshold);
    smooth(compressor.ratio, mix.compressor ? mix.ratio : 1);
    smooth(compressor.knee, mix.compressor ? 12 : 0);
    if (highpassOn !== mix.highpass) {
      gain.disconnect();
      highpass.disconnect();
      if (mix.highpass) gain.connect(highpass).connect(filters[0]);
      else gain.connect(filters[0]);
      highpassOn = mix.highpass;
    }
  };
  // One channel fills both sides in the recording. A mono track has no second channel to pick.
  const picked = { left: 0, right: 1 }[channel];
  if (picked !== undefined && stream.getAudioTracks()[0]?.getSettings().channelCount >= 2) source.connect(splitter).connect(input, picked);
  else source.connect(input);
  // Mixes down here, and the recorded stream gets the same signal on both sides.
  if (channel === 'mono') { gain.channelCount = 1; gain.channelCountMode = 'explicit'; }
  input.connect(gain);
  filters[0].connect(filters[1]).connect(filters[2]).connect(compressor).connect(output).connect(delay).connect(destination);
  set(initial);
  const inputData = new Float32Array(input.fftSize);
  const outputData = new Float32Array(output.fftSize);
  const frequencies = new Float32Array(output.frequencyBinCount);
  let held = -Infinity;
  let holdUntil = 0;
  return {
    stream: destination.stream,
    set,
    read(now) {
      input.getFloatTimeDomainData(inputData);
      output.getFloatTimeDomainData(outputData);
      let inPeak = 0, outPeak = 0, square = 0;
      for (let i = 0; i < outputData.length; i++) {
        inPeak = Math.max(inPeak, Math.abs(inputData[i]));
        outPeak = Math.max(outPeak, Math.abs(outputData[i]));
        square += outputData[i] ** 2;
      }
      const db = (v) => v > 0 ? 20 * Math.log10(v) : -Infinity;
      const outDb = db(outPeak);
      if (outDb >= held || now > holdUntil) { held = outDb; holdUntil = now + 1500; }
      output.getFloatFrequencyData(frequencies);
      const spectrum = Array.from({ length: 24 }, (_, i) => {
        const start = Math.max(1, Math.floor(60 * (16000 / 60) ** (i / 24) * output.fftSize / context.sampleRate));
        const end = Math.min(frequencies.length, Math.max(start + 1, Math.ceil(60 * (16000 / 60) ** ((i + 1) / 24) * output.fftSize / context.sampleRate)));
        let max = -Infinity;
        for (let bin = start; bin < end; bin++) max = Math.max(max, frequencies[bin]);
        return meterPercent(max);
      });
      return { input: db(inPeak), output: outDb, rms: db(Math.sqrt(square / outputData.length)), held, reduction: compressor.reduction, spectrum };
    },
    dispose() {
      for (const node of nodes) node.disconnect();
      destination.stream.getTracks().forEach((track) => track.stop());
    },
  };
}
