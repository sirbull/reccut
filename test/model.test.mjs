import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, computeFrame, computeAudio, valueAt, setKeyframe, cameraRectAt, cursorAt, zoomAmountAt, CAPTION_LANE } from '../src/shared/model.js';
import { addMediaClip, splitClip, deleteClips, trimClip, moveClip, setTransition, placeFree, insertIntoPrimary, pasteClips, copyClips, bladeAt } from '../src/shared/ops.js';
import { parseSrt, toSrt } from '../src/shared/srt.js';

function media(id, duration, kind = 'video') {
  return { id, kind, path: `/tmp/${id}.mp4`, name: id, duration, width: 1920, height: 1080, fps: 30, streams: { main: { path: `/tmp/${id}.mp4`, hasVideo: kind !== 'audio', hasAudio: true, duration } } };
}

function setup() {
  const p = newProject('t');
  p.media.a = media('a', 10);
  p.media.b = media('b', 8);
  p.media.m = media('m', 60, 'audio');
  addMediaClip(p, p.media.a, 'append');
  addMediaClip(p, p.media.b, 'append');
  return p;
}

test('magnetisk hovedspor legger klipp etter hverandre', () => {
  const p = setup();
  const [a, b] = p.primary.map((id) => p.clips[id]);
  assert.equal(a.start, 0);
  assert.equal(b.start, 10);
  assert.equal(p.duration, 18);
});

test('kutt deler klippet og beholder kildetid', () => {
  const p = setup();
  const right = splitClip(p, p.primary[0], 4);
  assert.ok(right);
  assert.equal(p.primary.length, 3);
  assert.equal(p.clips[right].in, 4);
  assert.equal(p.clips[right].start, 4);
  assert.equal(p.clips[p.primary[0]].dur, 4);
});

test('sletting lukker mellomrommet og flytter tilkoblede klipp', () => {
  const p = setup();
  const title = makeClip('title', { start: 12, dur: 2, lane: 1 });
  placeFree(p, title, 12, 1);
  deleteClips(p, [p.primary[0]]);
  assert.equal(p.clips[p.primary[0]].start, 0);
  assert.equal(p.clips[title.id].start, 2, 'tittelen følger klipp b');
  assert.equal(p.duration, 8);
});

test('sletting med mellomrom beholder tiden', () => {
  const p = setup();
  deleteClips(p, [p.primary[0]], { ripple: false });
  assert.equal(p.clips[p.primary[0]].type, 'gap');
  assert.equal(p.clips[p.primary[1]].start, 10);
});

test('trimming i starten begrenses av kildefilen og ripler', () => {
  const p = setup();
  trimClip(p, p.primary[1], 'start', -5);
  assert.equal(p.clips[p.primary[1]].in, 0);
  trimClip(p, p.primary[0], 'start', 3);
  assert.equal(p.clips[p.primary[0]].in, 3);
  assert.equal(p.clips[p.primary[0]].dur, 7);
  assert.equal(p.clips[p.primary[1]].start, 7);
  trimClip(p, p.primary[0], 'end', 100);
  assert.equal(p.clips[p.primary[0]].dur, 7, 'kan ikke forlenges forbi filen');
});

test('nøkkelbilder interpoleres i kildetid', () => {
  const p = setup();
  const c = p.clips[p.primary[0]];
  setKeyframe(c, 'opacity', 2, 0);
  setKeyframe(c, 'opacity', 4, 1);
  assert.equal(valueAt(c, 'opacity', 3), 0.5);
  assert.equal(valueAt(c, 'opacity', 0), 0);
  assert.equal(valueAt(c, 'opacity', 9), 1);
});

test('overgang gir to lag og krysstoner lyden', () => {
  const p = setup();
  const b = p.primary[1];
  setTransition(p, b, 'dissolve', 1);
  const f = computeFrame(p, 10);
  assert.ok(f.layers[0].transition);
  assert.equal(f.layers[0].transition.p, 0.5);
  const audio = computeAudio(p, 10);
  assert.equal(audio.length, 2);
  assert.ok(Math.abs(audio[0].gain - 0.5) < 1e-9);
});

test('volum i dB og toning påvirker lyden', () => {
  const p = setup();
  const c = p.clips[p.primary[0]];
  c.props.volume = -6;
  c.props.aFadeIn = 2;
  const [x] = computeAudio(p, 1);
  assert.ok(Math.abs(x.gain - 0.5 * Math.pow(10, -6 / 20)) < 1e-6);
});

test('avslåtte klipp vises ikke og høres ikke', () => {
  const p = setup();
  p.clips[p.primary[0]].enabled = false;
  assert.equal(computeFrame(p, 1).layers.length, 0);
  assert.equal(computeAudio(p, 1).length, 0);
});

test('flytting mellom hovedspor og tilkoblet spor', () => {
  const p = setup();
  const a = p.primary[0];
  moveClip(p, a, { start: 3, lane: 1 });
  assert.equal(p.primary.length, 1);
  assert.equal(p.clips[p.primary[0]].start, 0);
  assert.equal(p.clips[a].lane, 1);
  moveClip(p, a, { lane: 0, primaryIndex: 1 });
  assert.deepEqual(p.primary.length, 2);
  assert.equal(p.clips[a].start, 8);
});

test('kutt på alle spor og kopier og lim inn', () => {
  const p = setup();
  const music = addMediaClip(p, p.media.m, 'connect', 0);
  bladeAt(p, 5);
  assert.equal(Object.values(p.clips).filter((c) => c.lane === -1).length, 2);
  const items = copyClips(p, [music]);
  const ids = pasteClips(p, items, 20);
  assert.equal(p.clips[ids[0]].start, 20);
  assert.equal(p.clips[ids[0]].lane, -2, 'flyttes til ledig spor når det overlapper');
  insertIntoPrimary(p, [makeClip('image', { dur: 3 })], 0);
  assert.equal(p.clips[p.primary[0]].type, 'image');
});

test('kamera i bilde i bilde animeres mellom oppsett', () => {
  const p = newProject();
  const m = { id: 'r', kind: 'recording', duration: 20, rec: { layouts: [[0, 6], [5, 3]] }, streams: { screen: { hasVideo: true }, camera: { hasVideo: true } } };
  const c = makeClip('recording', { media: m });
  const before = cameraRectAt(c, 4.9, 1920, 1080);
  const after = cameraRectAt(c, 6, 1920, 1080);
  const mid = cameraRectAt(c, 5.1, 1920, 1080);
  assert.ok(before.x > 1000);
  assert.ok(after.x < 100);
  assert.ok(mid.x < before.x && mid.x > after.x);
});

test('musepeker og forstørring', () => {
  const pos = cursorAt([[0, 0, 0], [0.05, 1, 1]], 0.025);
  assert.deepEqual(pos.map((v) => Math.round(v * 10) / 10), [0.5, 0.5]);
  assert.equal(zoomAmountAt([[1, 2]], 0.5), 0);
  assert.equal(zoomAmountAt([[1, 2]], 1.5), 1);
  assert.equal(zoomAmountAt([[1, 2]], 3), 0);
});

test('undertekster i eget spor', () => {
  const p = setup();
  const c = makeClip('caption', { start: 1, dur: 2, lane: CAPTION_LANE, props: { text: 'Hei' } });
  p.clips[c.id] = c;
  assert.equal(computeFrame(p, 2).captions.length, 1);
  assert.equal(computeFrame(p, 2, { captions: false }).captions.length, 0);
});

test('SRT leses og skrives', () => {
  const srt = toSrt([{ start: 1.5, end: 3.25, text: 'Hei verden' }, { start: 4, end: 5, text: 'To\nlinjer' }]);
  const back = parseSrt(srt);
  assert.equal(back.length, 2);
  assert.equal(back[0].start, 1.5);
  assert.equal(back[1].text, 'To\nlinjer');
});

import { positionMove, positionTrim } from '../src/shared/ops.js';

test('posisjonsverktøy: flytt lager mellomrom og skyver resten', () => {
  const p = setup();
  const b = p.primary[1];
  positionMove(p, b, 3);
  assert.equal(p.primary.length, 3);
  assert.equal(p.clips[p.primary[1]].type, 'gap');
  assert.equal(p.clips[b].start, 13);
  positionMove(p, b, -10);
  assert.equal(p.primary.length, 2, 'kan ikke flyttes forbi forrige klipp');
  assert.equal(p.clips[b].start, 10);
});

test('posisjonsverktøy: trim etterlater mellomrom', () => {
  const p = setup();
  const [a, b] = p.primary;
  positionTrim(p, a, 'end', -4);
  assert.equal(p.clips[a].dur, 6);
  assert.equal(p.clips[b].start, 10, 'neste klipp står stille');
  positionTrim(p, a, 'end', 10);
  assert.equal(p.clips[a].dur, 10, 'forlengelse bruker bare opp mellomrommet');
  assert.equal(p.primary.length, 2);
  positionTrim(p, b, 'start', 2);
  assert.equal(p.clips[b].start, 12);
  assert.equal(p.clips[b].in, 2);
});

import { applyAnimationPreset, setKeyframe as setKf, valueAt as val } from '../src/shared/model.js';

test('myke overganger mellom nøkkelbilder', () => {
  const p = setup();
  const c = p.clips[p.primary[0]];
  c.kf.x = [[0, 0, 'easeIn'], [2, 100]];
  assert.ok(val(c, 'x', 1) < 50, 'ease in starter sakte');
  c.kf.x[0][2] = 'easeOut';
  assert.ok(val(c, 'x', 1) > 50, 'ease out starter raskt');
  c.kf.x[0][2] = 'hold';
  assert.equal(val(c, 'x', 1.9), 0, 'hold venter til neste nøkkelbilde');
  applyAnimationPreset(c, 'fadeIn', 1920, 1080);
  assert.equal(val(c, 'opacity', 0), 0);
  assert.equal(val(c, 'opacity', 5), 1);
});

import { toVtt } from '../src/shared/srt.js';
test('WebVTT skrives og leses', () => {
  const vtt = toVtt([{ start: 61.25, end: 63, text: 'Line one\nLine two' }]);
  assert.ok(vtt.startsWith('WEBVTT'));
  const back = parseSrt(vtt);
  assert.equal(back[0].start, 61.25);
  assert.equal(back[0].text, 'Line one\nLine two');
  assert.equal(parseSrt('WEBVTT\n\n00:05.000 --> 00:06.500\nKort')[0].end, 6.5);
});
