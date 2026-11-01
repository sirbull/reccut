import test from 'node:test';
import assert from 'node:assert/strict';
import { gamutToRec709, parseCube } from '../src/shared/grade.js';

test('.cube: størrelse, område og verdier, rødt raskest', () => {
  const rows = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rows.push(`${r} ${g} ${b}`);
  const lut = parseCube(`# identity\nTITLE "x"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n${rows.join('\n')}\n`);
  assert.equal(lut.size, 2);
  assert.deepEqual([...lut.data.slice(3, 6)], [1, 0, 0]);
  assert.throws(() => parseCube('LUT_1D_SIZE 2\n0 0 0\n1 1 1'), /3D/);
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0 0'), /valid/);
});

test('Rec. 2020 til Rec. 709 gir den kjente matrisen', () => {
  const m = gamutToRec709([0.708, 0.292, 0.17, 0.797, 0.131, 0.046]);
  const known = [
    [1.6605, -0.5876, -0.0728],
    [-0.1246, 1.1329, -0.0083],
    [-0.0182, -0.1006, 1.1187],
  ];
  m.forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(v - known[i][j]) < 1e-3, `${i},${j}: ${v}`)));
  // Hvitt forblir hvitt.
  for (const row of gamutToRec709([0.766, 0.275, 0.225, 0.8, 0.089, -0.087])) assert.ok(Math.abs(row.reduce((a, b) => a + b) - 1) < 1e-6);
});
