import test from 'node:test';
import assert from 'node:assert/strict';
import { findOffset, isConfident, prepareEnvelope } from '../src/shared/sync.js';

// Lager en tale-lignende lydstyrkekurve: tilfeldige utbrudd med pauser.
function speech(seconds, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  while (out.length < seconds * 100) {
    const burst = 10 + Math.floor(rnd() * 40);
    const level = 60 + rnd() * 180;
    for (let i = 0; i < burst; i++) out.push(level * (0.6 + 0.4 * rnd()));
    const pause = 5 + Math.floor(rnd() * 30);
    for (let i = 0; i < pause; i++) out.push(rnd() * 8);
  }
  return out.slice(0, seconds * 100);
}

test('finner forskyvningen mellom kameralyd og ekstern mikrofon', () => {
  const ext = speech(120, 7);
  // Kameraet startet 23,45 sekunder inn i det eksterne opptaket, med annet nivå og støy.
  const cam = ext.slice(2345, 2345 + 3000).map((v, i) => Math.min(255, v * 0.5 + ((i * 7919) % 13)));
  const r = findOffset(prepareEnvelope(cam), prepareEnvelope(ext));
  assert.ok(r, 'fant et treff');
  assert.ok(Math.abs(r.lag - 2345) <= 1, `lag ${r.lag}`);
  assert.ok(r.score > 0.5, `score ${r.score}`);
});

test('kort eksternt klipp midt i et langt videoklipp', () => {
  const cam = speech(90, 3);
  const ext = cam.slice(4000, 4800);
  const r = findOffset(prepareEnvelope(cam), prepareEnvelope(ext));
  assert.ok(Math.abs(r.lag + 4000) <= 1, `lag ${r.lag}`);
});

test('ingen treff når lyden ikke hører sammen', () => {
  for (const [a, b] of [[11, 99], [5, 6], [21, 22], [8, 31]]) {
    const r = findOffset(prepareEnvelope(speech(30, a)), prepareEnvelope(speech(60, b)));
    assert.ok(!isConfident(r), `score ${r?.score} peak ${r?.peak}`);
  }
  const ext = speech(120, 7);
  assert.ok(isConfident(findOffset(prepareEnvelope(ext.slice(2345, 5345)), prepareEnvelope(ext))));
});

/* Plassering i prosjektet */

import { newProject } from '../src/shared/model.js';
import { addMediaClip, bladeAt, deleteClips, groupClips, moveClip, pasteClips, copyClips, ungroupClips } from '../src/shared/ops.js';
import { applySync, planSync } from '../src/shared/sync.js';

function syncProject() {
  const ext = speech(200, 7);
  const waves = {
    '/w/ext': { rate: 100, peaks: ext },
    // To videoklipp fra samme kamera: det første startet 20 s inn i lydopptaket, det andre 120 s inn.
    '/w/v1': { rate: 100, peaks: ext.slice(2000, 6000).map((v) => v * 0.4) },
    '/w/v2': { rate: 100, peaks: ext.slice(12000, 16000).map((v) => v * 0.6) },
  };
  const mk = (id, duration, kind, wave) => ({ id, kind, path: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30, streams: { main: { path: `/m/${id}`, hasVideo: kind !== 'audio', hasAudio: true, duration, wave } } });
  const p = newProject('s');
  p.media.v1 = mk('v1', 40, 'video', '/w/v1');
  p.media.v2 = mk('v2', 40, 'video', '/w/v2');
  p.media.ext = mk('ext', 200, 'audio', '/w/ext');
  // Første klipp bruker 10 til 30 sekunder av v1.
  const v1 = addMediaClip(p, p.media.v1, 'append', 0, 0, { in: 10, dur: 20 });
  const v2 = addMediaClip(p, p.media.v2, 'append');
  const a = addMediaClip(p, p.media.ext, 'connect', 0, -1);
  return { p, v1, v2, a, waveFor: (path) => waves[path] };
}

test('autosynk finner begge videoklippene og legger lyden riktig', () => {
  const { p, v1, v2, a, waveFor } = syncProject();
  const m = planSync(p, a, waveFor);
  assert.deepEqual(m.map((x) => x.videoId), [v1, v2]);
  assert.ok(Math.abs(m[0].at - 30) < 0.02, `at ${m[0].at}`);
  assert.ok(Math.abs(m[1].at - 120) < 0.02, `at ${m[1].at}`);

  const placed = applySync(p, a, m, { mode: 'split', muteCamera: true });
  assert.equal(placed.length, 2);
  const [c1, c2] = placed.map((id) => p.clips[id]);
  // Lyden er klippet til hvert videoklipp og ligger rett under det.
  assert.ok(Math.abs(c1.in - 30) < 0.02 && Math.abs(c1.dur - 20) < 0.02 && Math.abs(c1.start - 0) < 0.02);
  assert.ok(Math.abs(c2.in - 120) < 0.02 && Math.abs(c2.start - 20) < 0.02 && Math.abs(c2.dur - 40) < 0.02);
  assert.equal(c1.group, p.clips[v1].group);
  assert.equal(c2.group, p.clips[v2].group);
  assert.notEqual(c1.group, c2.group);
  assert.equal(p.clips[v1].props.volume, -60);
});

test('kort lydklipp legges riktig uten å klippes', () => {
  const { p, v1, a, waveFor } = syncProject();
  // Lydklippet dekker bare 35 til 45 s av opptaket, altså midt i det første videoklippet.
  Object.assign(p.clips[a], { in: 35, dur: 10 });
  const m = planSync(p, a, waveFor);
  assert.equal(m[0].videoId, v1);
  applySync(p, a, m, { mode: 'first' });
  const c = p.clips[a];
  assert.equal(c.in, 35);
  assert.equal(c.dur, 10);
  assert.ok(Math.abs(c.start - 5) < 0.02, `start ${c.start}`);
});

test('gruppert lyd følger videoen når den flyttes og slettes med den', () => {
  const { p, v1, v2, a } = syncProject();
  Object.assign(p.clips[a], { start: 18, dur: 6 });
  groupClips(p, [v1, a]);
  // Flytt det første klippet bak det andre: lyden følger med, også delen utenfor kanten.
  moveClip(p, v1, { lane: 0, primaryIndex: 1 });
  assert.equal(p.clips[v1].start, 40);
  assert.equal(p.clips[a].start, 58);
  // Kopier og lim inn gir en ny gruppe.
  const ids = pasteClips(p, copyClips(p, [v1, a]), 0);
  const groups = new Set(ids.map((id) => p.clips[id].group));
  assert.equal(groups.size, 1);
  assert.notEqual([...groups][0], p.clips[v1].group);
  // Kutt gjennom begge gir to grupper.
  assert.equal(p.clips[v1].start, 60);
  const rights = bladeAt(p, 79, [v1, a]);
  assert.equal(rights.length, 2);
  assert.equal(p.clips[rights[0]].group, p.clips[rights[1]].group);
  assert.notEqual(p.clips[rights[0]].group, p.clips[v1].group);
  assert.equal(p.clips[a].group, p.clips[v1].group);
  deleteClips(p, [v1]);
  assert.equal(p.clips[a], undefined);
  assert.ok(p.clips[v2]);
  ungroupClips(p, ids);
  assert.ok(ids.every((id) => !p.clips[id].group));
});
