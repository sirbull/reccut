import test from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_DEFAULTS, makeClip, redactLabel } from '../src/shared/model.js';
import { highlightOutline } from '../src/shared/shapes.js';
import { highlightProgress } from '../src/shared/highlight.js';

test('highlight: streken tegnes først, så forstørres området, og slutten går baklengs', () => {
  const start = highlightProgress(0, 5, 1);
  assert.equal(start.stroke, 0);
  assert.equal(start.zoom, 0);
  const early = highlightProgress(0.3, 5, 1);
  assert.ok(early.stroke > 0 && early.stroke < 1);
  assert.equal(early.zoom, 0);
  const full = highlightProgress(2.5, 5, 1);
  assert.equal(full.stroke, 1);
  assert.equal(full.zoom, 1);
  // Symmetrisk: like langt fra slutten som fra starten.
  const late = highlightProgress(4.7, 5, 1);
  assert.ok(Math.abs(late.stroke - early.stroke) < 1e-9 && late.zoom === early.zoom);
  assert.equal(highlightProgress(5, 5, 1).zoom, 0);
});

test('highlight: korte klipp deler tiden mellom inn og ut', () => {
  const mid = highlightProgress(0.5, 1, 2);
  assert.equal(mid.stroke, 1);
  assert.equal(mid.zoom, 1);
});

test('highlight: uten strek begynner forstørrelsen med en gang', () => {
  const p = highlightProgress(0.2, 5, 1, false);
  assert.equal(p.stroke, 0);
  assert.ok(p.zoom > 0);
});

test('highlight: omrisset starter øverst til venstre og følger rotasjonen', () => {
  const g = { shape: 'rect', cx: 100, cy: 50, w: 200, h: 100, rot: 0 };
  const sharp = highlightOutline(g, 0);
  assert.deepEqual(sharp[0], [0, 0]);
  assert.equal(sharp.length, 5);
  const round = highlightOutline(g, 0.5);
  assert.ok(round.length > 20);
  for (const [x, y] of round) assert.ok(x >= -1e-9 && x <= 200 + 1e-9 && y >= -1e-9 && y <= 100 + 1e-9);
  const rotated = highlightOutline({ ...g, rot: Math.PI / 2 }, 0);
  assert.ok(Math.abs(rotated[0][0] - 150) < 1e-9 && Math.abs(rotated[0][1] + 50) < 1e-9);
  const ellipse = highlightOutline({ ...g, shape: 'ellipse' }, 0);
  for (const [x, y] of ellipse) assert.ok(Math.abs(((x - 100) / 100) ** 2 + ((y - 50) / 50) ** 2 - 1) < 1e-9);
});

test('highlight: eget navn og standardverdier med strek og skygge på', () => {
  const c = makeClip('redact', { props: { mode: 'highlight', ...HIGHLIGHT_DEFAULTS } });
  assert.equal(redactLabel(c), 'Highlight Area');
  assert.equal(c.props.stroke, true);
  assert.equal(c.props.dropShadow, true);
  assert.ok(c.props.zoom > 1);
});
