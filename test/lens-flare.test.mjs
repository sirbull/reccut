import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FLARE_ASSETS, FLARE_DEFAULTS, keepsOwnColors, FLARE_PRESETS, elementCenter, elementSize, flareAsset, flareDraws, flareModified, hexLinear, makeElement, spreadDistance,
} from '../src/shared/lensFlare.js';
import { baseValueAt, setPropBase, vfxProp } from '../src/shared/model.js';
import { BROWSER_VIDEO_EFFECTS, makeVideoEffect } from '../src/shared/videoEffects.js';

const root = path.resolve(import.meta.dirname, '..');
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${msg}: ${a} ≠ ${b}`));
const flare = (over = {}) => ({ ...structuredClone(FLARE_DEFAULTS), ...over });

test('elements sit on the optical axis: P = C + (S − C) · d + O', () => {
  const p = flare({ x: 0.68, y: 0.39, cx: 0.5, cy: 0.5, spread: 1 });
  near(elementCenter(p, { distance: -0.5, ox: 0, oy: 0 }), [0.41, 0.555], 'example from the kit');
  near(elementCenter(p, { distance: 1, ox: 0, oy: 0 }), [0.68, 0.39], 'd=1 is the light source');
  near(elementCenter(p, { distance: 0, ox: 0, oy: 0 }), [0.5, 0.5], 'd=0 is the optical center');
  near(elementCenter(p, { distance: 0, ox: 0.1, oy: -0.2 }), [0.6, 0.3], 'offset is added in UV');
});

test('spread stretches the reflections but keeps the source and optical center still', () => {
  for (const s of [0, 0.5, 2.5]) {
    assert.equal(spreadDistance(1, s), 1);
    assert.equal(spreadDistance(0, s), 0);
    assert.equal(spreadDistance(0.4, s), 0.4);
  }
  assert.equal(spreadDistance(-1, 2), -2);
  assert.equal(spreadDistance(1.5, 2), 2);
});

test('moving the light moves the reflections the other way across the center', () => {
  const ghost = { distance: -0.6, ox: 0, oy: 0 };
  const a = elementCenter(flare({ x: 0.7, cx: 0.5 }), ghost), b = elementCenter(flare({ x: 0.9, cx: 0.5 }), ghost);
  assert.ok(b[0] < a[0], 'light moved right, ghost moved left');
  // Offscreen lights are allowed and still place the reflections.
  const off = elementCenter(flare({ x: 1.4, y: -0.3 }), ghost);
  assert.ok(off[0] < 0.5 && off[1] > 0.5);
});

test('size follows the picture height and keeps the texture aspect, so rings stay round in 9:16', () => {
  const streak = flareAsset('streak_warm_horizontal'), ring = flareAsset('ring_rainbow'), p = flare({ scale: 1 });
  assert.deepEqual(elementSize(p, { size: 2 }, streak, 1080), [2160, 360]);
  assert.deepEqual(elementSize(p, { size: 0.5 }, ring, 1920), [960, 960]);
  assert.deepEqual(elementSize({ ...p, scale: 2 }, { size: 0.5 }, ring, 1080), [1080, 1080]);
});

test('every texture in the manifest exists as an RGBA PNG with the stated size, and has a thumbnail', () => {
  assert.equal(FLARE_ASSETS.length, 36);
  for (const a of FLARE_ASSETS) {
    const file = path.join(root, 'assets/lensflare', a.file);
    const png = fs.readFileSync(file);
    assert.equal(png.toString('latin1', 12, 16), 'IHDR', a.id);
    assert.equal(png.readUInt32BE(16), a.w, `${a.id} width`);
    assert.equal(png.readUInt32BE(20), a.h, `${a.id} height`);
    assert.equal(png[25], 6, `${a.id} is RGBA`);
    assert.ok(fs.existsSync(path.join(root, 'assets/lensflare/thumbs/elements', `${a.id}.png`)), `${a.id} thumbnail`);
  }
  // The build copies the textures and thumbnails next to the app (build/lensflare).
  assert.match(fs.readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8'), /assets\/lensflare/);
});

test('the eight kit presets load, reference known textures and keep lens dirt off', () => {
  assert.equal(FLARE_PRESETS.length, 8);
  assert.equal(FLARE_DEFAULTS.preset, 'cinematic_warm');
  for (const { id, p } of FLARE_PRESETS) {
    assert.ok(fs.existsSync(path.join(root, 'assets/lensflare/thumbs/presets', `${id}.jpg`)), `${id} thumbnail`);
    assert.ok(p.elements.length >= 5, id);
    assert.equal(new Set(p.elements.map((e) => e.id)).size, p.elements.length, `${id} unique element ids`);
    for (const e of p.elements) {
      assert.ok(flareAsset(e.asset), `${id}: ${e.asset}`);
      if (e.blend === 'dirt') assert.equal(e.on, false, `${id}: dirt is off by default`);
    }
    assert.equal(flareModified(p), false, id);
  }
  // Kit tints are linear light: [0.96, 0.62, 1] survives the hex round trip within 8-bit precision.
  const tint = FLARE_PRESETS.find((x) => x.id === 'sci_fi_violet').p.elements.find((e) => e.asset === 'diffraction_cool_12').tint;
  hexLinear(tint).forEach((v, i) => assert.ok(Math.abs(v - [0.96, 0.62, 1][i]) < 0.01, tint));
  const changed = structuredClone(FLARE_DEFAULTS);
  changed.elements[0].intensity = 0.1;
  assert.equal(flareModified(changed), true);
});

test('draw list: hidden elements are skipped, solo shows one, offscreen sprites are culled but lens dirt is not', () => {
  const p = flare();
  const visible = p.elements.filter((e) => e.on !== false).length;
  assert.equal(flareDraws(p, 1920, 1080).length, visible);
  const first = p.elements[0];
  first.on = false;
  assert.equal(flareDraws(p, 1920, 1080).length, visible - 1, 'hidden element is not rendered');
  const solo = flareDraws(p, 1920, 1080, first.id);
  assert.equal(solo.length, 1, 'solo renders just that element, also when hidden');
  // Global intensity and opacity scale every element in linear light.
  const one = flareDraws({ ...p, intensity: 2, opacity: 0.5 }, 1920, 1080, first.id)[0];
  near(one.gain, [first.intensity, first.intensity, first.intensity], 'gain');
  assert.deepEqual(flareDraws({ ...p, intensity: 0 }, 1920, 1080), []);
  const far = { ...p, x: 30, y: 30, cx: 29, cy: 29, elements: [makeElement('ghost_hex_blue'), { ...makeElement('lens_dirt_smudges') }] };
  assert.deepEqual(flareDraws(far, 1920, 1080).map((d) => d.blend), ['dirt']);
});

test('Lens Flare is a Stylize stack effect with its own copy of the elements and keyframeable globals', () => {
  assert.ok(BROWSER_VIDEO_EFFECTS.some((e) => e.type === 'lensFlare' && e.category === 'Stylize'));
  const e = makeVideoEffect('lensFlare');
  e.p.elements[0].size = 9;
  assert.notEqual(FLARE_DEFAULTS.elements[0].size, 9, 'the project keeps a copy, presets stay untouched');
  const clip = { start: 10, in: 0, dur: 4, speed: 1, props: { vfx: [e] }, kf: {} };
  setPropBase(clip, vfxProp(e.id, 'x'), 0.2);
  assert.equal(baseValueAt(clip, vfxProp(e.id, 'x'), 11), 0.2);
  clip.kf[vfxProp(e.id, 'x')] = [[0, 0.2], [2, 0.8]];
  assert.ok(Math.abs(baseValueAt(clip, vfxProp(e.id, 'x'), 11) - 0.5) < 1e-9, 'light position animates');
  clip.kf[vfxProp(e.id, 'color')] = [[0, '#ff0000'], [2, '#0000ff']];
  const mid = baseValueAt(clip, vfxProp(e.id, 'color'), 11);
  assert.match(mid, /^#[0-9a-f]{6}$/);
  assert.notEqual(mid, '#ff0000');
});

test('Flare color recolors the flare but leaves rainbow and prism textures alone', () => {
  const p = flare({ color: '#3080ff', colorize: 0.8 });
  const draws = flareDraws(p, 1920, 1080);
  const rainbow = draws.filter((d) => keepsOwnColors(d.asset)), plain = draws.filter((d) => !keepsOwnColors(d.asset));
  assert.ok(rainbow.length && plain.length, 'the default preset has both kinds');
  assert.ok(rainbow.every((d) => d.colorize === 0));
  assert.ok(plain.every((d) => d.colorize === 0.8));
  // The hue keeps the color's balance with the strongest channel at 1, so brightness comes from the texture.
  near(plain[0].hue, hexLinear('#3080ff').map((v) => v / hexLinear('#3080ff')[2]), 'hue');
  assert.ok(FLARE_PRESETS.every((x) => x.p.colorize === 0), 'presets start with their own colors');
  assert.deepEqual(FLARE_ASSETS.filter(keepsOwnColors).map((a) => a.id).sort(), ['arc_rainbow_top', 'ghost_prism_round', 'ring_prism_offset', 'ring_rainbow']);
});
