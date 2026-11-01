import test from 'node:test';
import assert from 'node:assert/strict';
import { FILM_LOOKS, bakeFilm } from '../src/shared/filmLooks.js';
import { gradeParams } from '../src/shared/grade.js';

const look = (id) => FILM_LOOKS.find((f) => f.id === id).fn;
const skin = [0.87, 0.67, 0.55];
const sky = [0.5, 0.7, 0.95];

test('alle filmlooks bakes til gyldige LUT-er', () => {
  for (const f of FILM_LOOKS) {
    const lut = bakeFilm(f.id);
    assert.equal(lut.data.length, 33 ** 3 * 3, f.id);
    assert.ok(lut.data.every((v) => v >= 0 && v <= 1), f.id);
  }
  assert.equal(bakeFilm('finnes-ikke'), null);
});

test('ortokromatisk: hud mørkere enn himmel, rødfilter: motsatt', () => {
  assert.ok(look('ortho')(...skin)[0] < look('ortho')(...sky)[0] - 0.15);
  assert.ok(look('bwred')(...skin)[0] > look('bwred')(...sky)[0] + 0.15);
  const [r, g, b] = look('trix400')(...skin);
  assert.ok(r === g && g === b);
});

test('gradeParams: film uten styrke gjelder fullt, styrke 0 slår av', () => {
  assert.deepEqual([gradeParams({ props: { film: 'ortho' } }, 0).filmMix, gradeParams({ props: { film: 'ortho' } }, 0).film], [1, 'ortho']);
  assert.equal(gradeParams({ props: { film: 'ortho', filmMix: 0 } }, 0), null);
  assert.equal(gradeParams({ props: { film: 'tull' } }, 0), null);
});
