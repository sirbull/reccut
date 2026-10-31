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
  assert.ok(Math.abs(audio[0].gain - Math.SQRT1_2) < 1e-9, 'lik effekt midt i overgangen');
  assert.ok(Math.abs(audio[1].gain - Math.SQRT1_2) < 1e-9);
});

test('overgang uten lyd: bildet toner, lyden kuttes hardt', () => {
  const p = setup();
  const [a, b] = p.primary;
  setTransition(p, b, 'dissolve', 1, 'start', false);
  setTransition(p, b, 'dip', 2);
  assert.equal(p.clips[b].transition.audio, false, 'beholdes når typen endres');
  assert.ok(computeFrame(p, 9.5).layers[0].transition);
  const before = computeAudio(p, 9.5);
  assert.deepEqual(before.map((x) => [x.clip.id, x.gain]), [[a, 1]]);
  const after = computeAudio(p, 10.5);
  assert.deepEqual(after.map((x) => [x.clip.id, x.gain]), [[b, 1]]);
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

import { setSpeed, freezeFrame, detachAudio, setAudioCrossfade, rollEdit, slipClip, slideClip, overwritePrimary, liftFromStoryline, insertGap } from '../src/shared/ops.js';
import { sourceTime as srcT, computeAudio as audioAt, computeFrame as frameAt } from '../src/shared/model.js';

test('hastighet: halv fart dobler lengden og kildetiden følger', () => {
  const p = setup();
  const [a, b] = p.primary;
  setSpeed(p, a, 0.5);
  assert.equal(p.clips[a].dur, 20);
  assert.equal(p.clips[b].start, 20, 'resten flyttes');
  assert.equal(srcT(p.clips[a], 10), 5);
  splitClip(p, a, 10);
  const right = p.clips[p.primary[1]];
  assert.equal(right.in, 5, 'kutt bruker kildetid');
  setSpeed(p, a, 2);
  assert.equal(p.clips[a].dur, 2.5);
  const au = audioAt(p, 1).find((x) => x.clip.id === a);
  assert.equal(au.speed, 2);
  assert.equal(au.src, 2);
});

test('frosset bilde settes inn ved spillhodet og er uten lyd', () => {
  const p = setup();
  const id = freezeFrame(p, 4, 2);
  assert.equal(p.primary.length, 4);
  const f = p.clips[id];
  assert.equal(f.start, 4);
  assert.equal(srcT(f, 5.5), 4, 'samme bilde hele tiden');
  assert.equal(p.clips[p.primary[2]].start, 6);
  assert.equal(audioAt(p, 5).length, 0);
});

test('frakoblet lyd blir egne klipp og videoen blir stum', () => {
  const p = setup();
  const [a] = p.primary;
  const ids = detachAudio(p, a);
  assert.equal(ids.length, 1);
  const au = p.clips[ids[0]];
  assert.equal(au.lane, -1);
  assert.equal(au.stream, 'main');
  const sources = audioAt(p, 2);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].clip.id, ids[0]);
});

test('utvidet lyd: J-kutt lar lyden starte før bildet', () => {
  const p = setup();
  const [a, b] = p.primary;
  p.clips[b].props.aLead = 1;
  const at = audioAt(p, 9.5).map((x) => x.clip.id);
  assert.ok(at.includes(a) && at.includes(b), 'begge høres i overlappet');
  assert.equal(audioAt(p, 9.5).find((x) => x.clip.id === b).src, -0.5, 'før filens start (stille)');
  p.clips[a].props.aTail = -2;
  assert.ok(!audioAt(p, 8.5).some((x) => x.clip.id === a), 'innkortet lyd stopper før bildet');
});

test('kryssfade mellom to lydklipp i samme spor', () => {
  const p = setup();
  const m1 = addMediaClip(p, p.media.m, 'connect', 0);
  p.clips[m1].dur = 5;
  const m2 = addMediaClip(p, p.media.m, 'connect', 5);
  assert.equal(p.clips[m2].lane, -1);
  assert.ok(setAudioCrossfade(p, m1, m2, 1));
  const mid = audioAt(p, 5).filter((x) => x.clip.lane === -1);
  assert.equal(mid.length, 2);
  for (const x of mid) assert.ok(Math.abs(x.gain - Math.SQRT1_2) < 1e-6);
  const before = audioAt(p, 4.4).filter((x) => x.clip.lane === -1);
  assert.equal(before.length, 1, 'før vinduet høres bare første klipp');
});

test('roll, slip og slide', () => {
  const p = setup();
  const [a, b] = p.primary;
  trimClip(p, a, 'end', -4);
  rollEdit(p, a, b, 2);
  assert.equal(p.clips[a].dur, 8);
  assert.equal(p.clips[b].in, 2);
  assert.equal(p.duration, 14, 'total lengde uendret');
  slipClip(p, a, 1);
  assert.equal(p.clips[a].in, 1);
  assert.equal(p.clips[a].start, 0);
  const c = addMediaClip(p, p.media.a, 'append');
  trimClip(p, c, 'start', 3);
  slideClip(p, b, -1);
  assert.equal(p.clips[a].dur, 7);
  assert.equal(p.clips[c].in, 2);
  assert.equal(p.clips[b].start, 7);
});

test('overskriv, løft og sett inn mellomrom', () => {
  const p = setup();
  const img = makeClip('image', { dur: 3 });
  overwritePrimary(p, img, 8);
  assert.equal(p.duration, 18, 'lengden er uendret');
  assert.equal(p.clips[img.id].start, 8);
  liftFromStoryline(p, [img.id]);
  assert.equal(p.clips[img.id].lane, 1);
  assert.equal(frameAt(p, 9).layers[0].clip.id, img.id);
  insertGap(p, 0, 2);
  assert.equal(p.clips[p.primary[0]].type, 'gap');
  assert.equal(p.clips[img.id].start, 10, 'tilkoblet klipp følger med');
});

import { setRamp, setReverse } from '../src/shared/ops.js';
import { srcLen, instSpeed, RAMP_PRESETS } from '../src/shared/model.js';

test('baklengs spiller samme del av kilden fra slutt til start', () => {
  const p = setup();
  const [a] = p.primary;
  trimClip(p, a, 'start', 2);
  trimClip(p, a, 'end', -2);
  setReverse(p, a, true);
  const c = p.clips[a];
  assert.equal(srcT(c, c.start), 8, 'starter på slutten');
  assert.ok(Math.abs(srcT(c, c.start + c.dur) - 2) < 1e-9, 'slutter på starten');
  const right = splitClip(p, a, 2);
  assert.equal(srcT(p.clips[a], 0), 8);
  assert.ok(Math.abs(srcT(p.clips[a], 1.999) - 6.001) < 1e-6);
  assert.ok(Math.abs(srcT(p.clips[right], 2) - 6) < 1e-9, 'høyre del fortsetter der venstre slapp');
  const au = audioAt(p, 1).find((x) => x.clip.id === a);
  assert.ok(au.speed < 0, 'lyden spilles baklengs');
});

test('baklengs trimming bruker riktig ende av kilden', () => {
  const p = setup();
  const [a] = p.primary;
  trimClip(p, a, 'end', -4);
  setReverse(p, a, true);
  trimClip(p, a, 'start', 1);
  assert.equal(srcT(p.clips[a], 0), 5, 'starten på tidslinjen er slutten i kilden');
  trimClip(p, a, 'start', -10);
  assert.equal(srcT(p.clips[a], 0), 10, 'kan forlenges til filens slutt');
});

test('fartsrampe beholder kildeområdet og endrer farten jevnt', () => {
  const p = setup();
  const [a, b] = p.primary;
  setRamp(p, a, RAMP_PRESETS.find((r) => r.id === 'to0').ramp);
  const c = p.clips[a];
  assert.ok(Math.abs(srcLen(c) - 10) < 1e-6, 'samme kildelengde');
  assert.ok(c.dur > 18, 'ned mot null fart gir lengre klipp');
  assert.ok(instSpeed(c, 0) > instSpeed(c, c.dur - 0.01));
  assert.ok(Math.abs(srcT(c, c.start + c.dur) - 10) < 1e-6);
  assert.equal(p.clips[b].start, c.dur, 'resten flyttes');
  const mid = c.dur / 2;
  const before = srcT(c, mid);
  const right = splitClip(p, a, mid);
  assert.ok(Math.abs(srcT(p.clips[a], mid - 1e-9) - before) < 1e-6, 'venstre del slutter på samme sted');
  assert.ok(Math.abs(srcT(p.clips[right], mid) - before) < 1e-6, 'kuttet er sømløst');
  setRamp(p, right, null);
  assert.ok(p.clips[right].speed > 0);
});
