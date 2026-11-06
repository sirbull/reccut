import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAT_MIX, MIC_PRESETS, normalizeMix, createMicMixer, meterPercent } from '../src/renderer/recorder/mixer.js';

// Exercise graph routing and teardown without requiring microphone permissions.
function graph() {
  const nodes = [];
  const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const node = (kind) => {
    const n = { kind, connections: [], gain: param(), frequency: param(), Q: param(), threshold: param(), ratio: param(), knee: param(), attack: param(), release: param(), reduction: 0,
      connect(next, outputIndex) { this.connections.push(next); this.outputIndex = outputIndex; return next; }, disconnect() { this.connections = []; },
      getFloatTimeDomainData(data) { data.fill(kind === 'input' ? 0.25 : 0.5); },
      getFloatFrequencyData(data) { data.fill(-24); }, fftSize: 2048, frequencyBinCount: 1024,
    };
    nodes.push(n);
    return n;
  };
  let stopped = false;
  let analysers = 0;
  const track = { stop() { stopped = true; } };
  const stream = { getTracks: () => [track] };
  const context = { currentTime: 0, sampleRate: 48000,
    createMediaStreamSource: () => node('source'),
    createAnalyser: () => node(analysers++ ? 'output' : 'input'),
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createDynamicsCompressor: () => node('compressor'),
    createChannelSplitter: () => node('splitter'), createDelay: () => Object.assign(node('delay'), { delayTime: param() }),
    createMediaStreamDestination: () => Object.assign(node('destination'), { stream }),
  };
  return { context, nodes, track, stream, stopped: () => stopped };
}

test('old settings load neutral gain, malformed saved values are bounded, and presets survive serialization', () => {
  assert.deepEqual(normalizeMix(undefined), FLAT_MIX);
  assert.deepEqual(normalizeMix(null), FLAT_MIX);
  const mix = normalizeMix({ gain: Infinity, low: -50, mid: NaN, high: 44, threshold: -90, ratio: 100, compressor: 'false' });
  assert.deepEqual(mix, { ...FLAT_MIX, low: -12, high: 12, threshold: -48, ratio: 12 });
  for (const { mix } of MIC_PRESETS) assert.deepEqual(normalizeMix(JSON.parse(JSON.stringify(mix))), mix);
});

test('gain, EQ and compressor feed the recorded stream, stay disconnected from speakers, and release all nodes', () => {
  const g = graph();
  const mixer = createMicMixer(g.context, {}, FLAT_MIX);
  assert.equal(mixer.stream, g.stream);
  const [source, , input, gain, highpass, low, mid, high, compressor, output, delay, destination] = g.nodes;
  assert.deepEqual(source.connections, [input]);
  assert.deepEqual(input.connections, [gain]);
  assert.deepEqual(gain.connections, [low], 'Flat bypasses the low cut');
  assert.deepEqual(high.connections, [compressor]);
  assert.deepEqual(compressor.connections, [output]);
  assert.deepEqual(output.connections, [delay]);
  assert.deepEqual(delay.connections, [destination]);
  assert.equal(gain.gain.value, 1, '0 dB is unity gain');
  assert.equal(compressor.ratio.value, 1, 'compressor is neutral in Flat');
  mixer.set({ ...FLAT_MIX, gain: 6, low: 2, mid: -3, high: 4, highpass: true, compressor: true, threshold: -24, ratio: 4 });
  assert.ok(Math.abs(gain.gain.value - 10 ** (6 / 20)) < 1e-12);
  assert.deepEqual(gain.connections, [highpass]);
  assert.deepEqual(highpass.connections, [low]);
  assert.deepEqual([low.gain.value, mid.gain.value, high.gain.value], [2, -3, 4]);
  assert.equal(compressor.threshold.value, -24);
  assert.equal(compressor.ratio.value, 4);
  mixer.set(FLAT_MIX);
  assert.deepEqual(gain.connections, [low]);
  assert.deepEqual(highpass.connections, []);
  assert.equal(gain.gain.value, 1);
  mixer.dispose();
  assert.ok(g.nodes.every((n) => n.connections.length === 0));
  assert.equal(g.stopped(), true);
});

test('meters distinguish raw input from recorded output, show RMS and peak hold, and bound the spectrum', () => {
  const g = graph();
  const mixer = createMicMixer(g.context, {}, FLAT_MIX);
  const lv = mixer.read(0);
  assert.ok(Math.abs(lv.input - 20 * Math.log10(0.25)) < 1e-8);
  assert.ok(Math.abs(lv.output - 20 * Math.log10(0.5)) < 1e-8);
  assert.equal(lv.rms, lv.output, 'constant sample RMS');
  assert.equal(lv.held, lv.output);
  assert.equal(lv.spectrum.length, 24);
  assert.ok(lv.spectrum.every((n) => n >= 0 && n <= 100));
  const output = g.nodes.find((n) => n.kind === 'output');
  output.getFloatTimeDomainData = (data) => data.fill(0);
  assert.equal(mixer.read(500).held, lv.output, 'hold the louder peak');
  assert.equal(mixer.read(2000).held, -Infinity, 'release after silence');
  assert.equal(meterPercent(-Infinity), 0);
  assert.equal(meterPercent(6), 100);
});

test('an interface input fills both sides, a mono track is left alone, and the delay is applied in seconds', () => {
  const pick = (channel, channelCount) => {
    const g = graph();
    createMicMixer(g.context, { getAudioTracks: () => [{ getSettings: () => ({ channelCount }) }] }, FLAT_MIX, { channel, delay: 150 });
    const [source, splitter, input] = g.nodes;
    return { g, source, splitter, input };
  };
  const right = pick('right', 2);
  assert.deepEqual(right.source.connections, [right.splitter]);
  assert.deepEqual(right.splitter.connections, [right.input]);
  assert.equal(right.splitter.outputIndex, 1);
  assert.equal(right.g.nodes.find((n) => n.kind === 'delay').delayTime.value, 0.15);
  const mono = pick('right', 1);
  assert.deepEqual(mono.source.connections, [mono.input], 'the right channel of a mono track would be silent');
  const stereo = pick('stereo', 2);
  assert.deepEqual(stereo.source.connections, [stereo.input]);
});

test('mono mixes both inputs at the gain stage and leaves the stereo path alone', () => {
  const mix = (channel) => {
    const g = graph();
    createMicMixer(g.context, { getAudioTracks: () => [{ getSettings: () => ({ channelCount: 2 }) }] }, FLAT_MIX, { channel });
    return g.nodes.find((n) => n.kind === 'gain');
  };
  assert.equal(mix('mono').channelCount, 1);
  assert.equal(mix('mono').channelCountMode, 'explicit');
  assert.equal(mix('stereo').channelCount, undefined);
});
