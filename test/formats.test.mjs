import test from 'node:test';
import assert from 'node:assert/strict';
import { couldNotRead, cropForAspect, customFormatId, outputGeometry, toCustom, videoBitrate, videoFormat, VIDEO_FORMATS } from '../src/shared/formats.js';

const p = { width: 3840, height: 2160 };

test('original størrelse beholder prosjektets format', () => {
  const g = outputGeometry(p, {});
  assert.equal(g.w, 3840);
  assert.equal(g.h, 2160);
  assert.deepEqual(g.matrix, [1, 1, 0, 0]);
});

test('forhåndsinnstilt høyde skalerer ned med samme sideforhold', () => {
  const g = outputGeometry(p, { size: { preset: 1080 } });
  assert.equal(g.w, 1920);
  assert.equal(g.h, 1080);
});

test('beskjæring til 9:16 gir stående video', () => {
  const crop = cropForAspect(p, 9 / 16);
  const g = outputGeometry(p, { crop, size: { preset: 1080 } });
  assert.equal(g.w, 1080);
  assert.equal(g.h, 1920);
  // Utsnittet ligger midt i bildet
  const [sx, , tx] = g.matrix;
  assert.ok(Math.abs(tx + crop.x * 3840 * sx) < 1e-6);
});

test('egen størrelse med tilpass gir svarte kanter, fyll beskjærer', () => {
  const contain = outputGeometry(p, { size: { preset: 'custom', w: 1080, h: 1080 }, fit: 'contain' });
  assert.equal(contain.w, 1080);
  assert.ok(contain.matrix[3] > 0, 'kanter oppe og nede');
  const cover = outputGeometry(p, { size: { preset: 'custom', w: 1080, h: 1080 }, fit: 'cover' });
  assert.ok(cover.matrix[2] < 0, 'sidene beskjæres');
  const stretch = outputGeometry(p, { size: { preset: 'custom', w: 1080, h: 1080 }, fit: 'stretch' });
  assert.notEqual(stretch.matrix[0], stretch.matrix[1]);
});

test('størrelser rundes til partall', () => {
  const g = outputGeometry(p, { size: { preset: 'custom', w: 1001, h: 777 } });
  assert.equal(g.w % 2, 0);
  assert.equal(g.h % 2, 0);
});

test('egen bitrate overstyrer kvalitet', () => {
  const fmt = VIDEO_FORMATS[0];
  assert.equal(videoBitrate(fmt, 'high', 1920, 1080, 30, 8), 8e6);
  assert.ok(videoBitrate(fmt, 'high', 1920, 1080, 30) > 1e6);
});

test('RAW-video: lenke og Locate når dekoderen mangler', () => {
  const r = couldNotRead([], [{ tool: 'redline', file: '/c/a.R3D' }, { tool: 'redline', file: '/c/b.nev' }]);
  assert.match(r.text, /a\.R3D is RED R3D\. Install REDCINE-X PRO/);
  assert.match(r.text, /b\.nev is Nikon N-RAW/);
  assert.deepEqual(r.locate.map((l) => [l.tool, l.files]), [['redline', ['/c/a.R3D']], ['redline', ['/c/b.nev']]]);
  assert.deepEqual(couldNotRead(['x.crm']).links, []);
  assert.match(couldNotRead(['x.crm']).text, /Cinema RAW Development/);
  const mixed = couldNotRead(['a.mp4'], [{ tool: 'artcmd', file: '/c/C001.mxf' }]);
  assert.match(mixed.text, /^Could not read a\.mp4\. .*ARRIRAW/);
  assert.equal(mixed.links[0].label, 'Get ARRI Reference Tool');
});

test('mediaCopies counts optimized media and proxy-only files in the sequence once each', async () => {
  const { mediaCopies } = await import('../src/shared/formats.js');
  const m = (id, st) => ({ id, kind: 'video', streams: { main: { hasVideo: true, ...st } } });
  const p = {
    media: { a: m('a', { optimized: '/o.mp4' }), b: m('b', { proxy: '/p.webm', needsProxy: true }), c: m('c', {}), d: m('d', { proxy: '/p.webm', needsProxy: true }) },
    clips: { 1: { mediaId: 'a' }, 2: { mediaId: 'b' }, 3: { mediaId: 'b' }, 4: { mediaId: 'c' } },
  };
  assert.deepEqual(mediaCopies(p), { optimized: 1, proxies: 1 }, 'd is not in the sequence');
});

test('advanced format: container and codecs are chosen separately and kept valid', () => {
  const f = videoFormat('custom:mov/prores-hq/pcm');
  assert.equal(f.ext, 'mov');
  assert.equal(f.ffCodec, 'prores_ks');
  assert.equal(f.profile, 3);
  assert.equal(f.audio, 'pcm');
  // WebM holder verken H.264 eller AAC.
  assert.equal(customFormatId('webm', 'h264', 'aac'), 'custom:webm/av1/opus');
  assert.equal(videoFormat('custom:mkv/hevc/none').audio, null);
  assert.equal(toCustom('mov-prores'), 'custom:mov/prores/pcm');
  assert.equal(toCustom('webm-vp9'), 'custom:webm/vp9/opus');
  assert.equal(toCustom('gif'), 'custom:mp4/h264/aac');
});
