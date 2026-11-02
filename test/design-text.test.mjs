import test from 'node:test';
import assert from 'node:assert/strict';
import { newLayer } from '../src/shared/design.js';
import { layoutDesignText } from '../src/shared/designText.js';
const measure = (text, font) => Array.from(text).length * Number(font.match(/([\d.]+)px/)[1]) * 0.6;
test('text wrapping, explicit newlines, long words, unicode and autofit', () => {
  for (const text of ['Hello world\nNext line', 'Æøå er fint 👩‍💻', 'x'.repeat(60), 'مرحبا بالعالم', 'שלום עולם', '', '😀😀😀']) {
    const l = newLayer('text', { text, w: 150, h: 100, size: 72 });
    const a = layoutDesignText(l, measure);
    assert.equal(a.overflow, false, text); assert.ok(a.height <= l.h + 0.01);
    for (const line of a.lines) assert.ok(measure(line, a.font) <= l.w + 0.01);
  }
});
test('minimum font size stops the search and reports overflow for extremely long text', () => {
  const l = newLayer('text', { text: 'word '.repeat(400), w: 100, h: 20 });
  const result = layoutDesignText(l, measure); assert.equal(result.size, 6); assert.equal(result.overflow, true);
});
test('uppercase and manual font size preserve content and mark overflow', () => {
  const l = newLayer('text', { text: 'test\nsecond', uppercase: true, autofit: false, size: 80, w: 100, h: 20 });
  const result = layoutDesignText(l, measure); assert.equal(result.size, 80); assert.equal(result.overflow, true); assert.equal(result.lines.join('').replaceAll(' ', ''), 'TESTSECOND');
});
