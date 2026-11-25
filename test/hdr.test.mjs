import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip } from '../src/shared/model.js';
import { HDR_WHITE, hdrDecodeFilters, hdrEncoderArgs, hdrExportIssues, hlgDisplayLinear, isHdrExport, pqDecode, pqEncode } from '../src/shared/hdr.js';

function example() {
  const p = newProject();
  const media = { id: 'v', kind: 'video', name: 'HDR source', path: '/original.mov', duration: 1, streams: { main: { path: '/original.mov', color: { hdr: 'pq', primaries: 'bt2020', transfer: 'smpte2084', space: 'bt2020nc', range: 'tv' } } } };
  p.media.v = media;
  const c = makeClip('video', { media }); p.clips[c.id] = c; p.primary = [c.id]; p.duration = 1;
  return { p, c, s: { color: 'hdr-pq', format: 'mp4-hevc', sourceMedia: 'original' } };
}

test('PQ is absolute luminance, including the 203 nit reference white and 10000 nit peak', () => {
  assert.equal(HDR_WHITE, 203);
  assert.ok(Math.abs(pqEncode(100) - .5080784215) < 1e-9);
  assert.ok(Math.abs(pqEncode(1000) - .7518270962) < 1e-9);
  for (const n of [0, .01, 1, 100, 203, 1000, 4000, 10000]) assert.ok(Math.abs(pqDecode(pqEncode(n)) - n) < 1e-6, String(n));
});

test('HLG correction uses scene luminance instead of independent channel OOTFs', () => {
  const sceneBlue = .203 * (.0593 * .203) ** (1 / 1.2 - 1);
  const blue = hlgDisplayLinear([0, 0, sceneBlue ** 1.2 * 1000 / 203]);
  assert.ok(Math.abs(blue[2] - 1) < .002);
  assert.deepEqual(hlgDisplayLinear([0, 0, 0]), [0, 0, 0]);
  const white = hlgDisplayLinear([1000 / 203, 1000 / 203, 1000 / 203]);
  assert.ok(Math.abs(white[0] - 1000 / 203) < 1e-12);
});

test('HDR is opt-in; audio and still export keep their normal paths', () => {
  assert.equal(isHdrExport({}), false);
  assert.equal(isHdrExport({ color: 'sdr' }), false);
  assert.equal(isHdrExport({ color: 'hdr-pq' }), true);
  assert.equal(isHdrExport({ color: 'hdr-pq', audioOnly: true }), false);
  assert.equal(isHdrExport({ color: 'hdr-pq', frame: {} }), false);
});

test('PQ and HLG decode to float without the SDR tone mapper; untagged video defaults to BT.709', () => {
  const { p } = example();
  const pq = hdrDecodeFilters(p.media.v.streams.main);
  assert.match(pq.vf, /tin=smpte2084.*t=linear:p=bt2020:m=gbr:r=full:npl=203/);
  assert.doesNotMatch(pq.vf, /tonemap|p=bt709|format=rgba/);
  assert.equal(pq.hlg, false);
  const hlg = hdrDecodeFilters({ color: { hdr: 'hlg', range: 'pc' }, interlaced: true });
  assert.equal(hlg.hlg, true); assert.match(hlg.vf, /^bwdif=.*tin=arib-std-b67.*rin=full/);
  assert.match(hdrDecodeFilters({}).vf, /tin=bt709:pin=bt709:min=bt709:rin=limited/);
});

test('basic video edits, linear exposure, audio effects and cuts pass HDR preflight', () => {
  const { p, c, s } = example();
  Object.assign(c.props, { exposure: -1, x: 10, cropL: .1, opacity: .5, afx: [{ type: 'compressor' }], cleanVoice: { main: 1 } });
  c.kf.exposure = [[0, 0], [1, 1]];
  assert.deepEqual(hdrExportIssues(p, s), []);
  assert.ok(Math.abs(pqDecode(pqEncode(1000 * 2)) - 2000) < 1e-6);
});

test('unsupported edits, proxy use and incompatible codecs fail before rendering', () => {
  const { p, c, s } = example();
  c.props.saturation = .1;
  c.props.vfx = [{ type: 'blur' }];
  c.props.follow = { clipId: 'other' };
  c.transition = { type: 'dissolve' };
  const issues = hdrExportIssues(p, { ...s, format: 'mp4-h264', sourceMedia: 'optimized' }).join('\n');
  for (const term of ['HEVC', 'original', 'saturation', 'vfx', 'tracking']) assert.ok(issues.includes(term), term);
  assert.deepEqual(hdrExportIssues(p, { color: 'sdr' }), []);
});

test('hidden, disabled and out-of-range unsupported clips do not block a basic HDR export', () => {
  const { p, s } = example();
  const c = makeClip('recording', { start: 2, dur: 1, lane: 1 }); p.clips[c.id] = c;
  assert.deepEqual(hdrExportIssues(p, { ...s, range: { in: 0, out: 1 } }), []);
  c.start = 0; c.enabled = false; assert.deepEqual(hdrExportIssues(p, s), []);
  c.enabled = true; p.lanes[1] = { hidden: true }; assert.deepEqual(hdrExportIssues(p, s), []);
});

test('HDR output is 10-bit PQ/BT.2020 with no fabricated mastering data', () => {
  const args = hdrEncoderArgs();
  assert.ok(args.includes('yuv420p10le')); assert.ok(args.includes('smpte2084')); assert.ok(args.includes('hvc1'));
  assert.match(args.join(' '), /tin=linear.*t=smpte2084.*npl=203/);
  assert.doesNotMatch(args.join(' '), /master-display|max-cll|tonemap/);
  assert.ok(!hdrEncoderArgs({ container: 'mkv' }).includes('hvc1'));
});
