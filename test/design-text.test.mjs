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

test('paired highlights preserve escaped, unmatched and consecutive literal asterisks', async () => {
  const { parseDesignText } = await import('../src/shared/designText.js');
  assert.deepEqual(parseDesignText('*Hello* world *end*'), [{ text: 'Hello', highlight: true }, { text: ' world ', highlight: false }, { text: 'end', highlight: true }]);
  assert.deepEqual(parseDesignText('unclosed *word'), [{ text: 'unclosed *word', highlight: false }]);
  assert.deepEqual(parseDesignText('\\*literal\\* *yes*'), [{ text: '*literal* ', highlight: false }, { text: 'yes', highlight: true }]);
  assert.deepEqual(parseDesignText('**outer** *inner **literal** end*'), [{ text: '**outer** ', highlight: false }, { text: 'inner **literal** end', highlight: true }]);
  assert.deepEqual(parseDesignText(''), []);
});
test('rich wrapping keeps ordinary words whole and highlights across line breaks', () => {
  const layer = newLayer('text', { text: 'one *two three*', size: 20, w: 100, h: 200, autofit: false, align: 'left' });
  const result = layoutDesignText(layer, measure);
  assert.deepEqual(result.lines, ['one two', 'three']);
  assert.deepEqual(result.lineRuns[0], [{ text: 'one ', highlight: false }, { text: 'two', highlight: true }]);
  assert.deepEqual(result.lineRuns[1], [{ text: 'three', highlight: true }]);
});
test('autofit accounts for uppercase expansion and tracking, including emoji graphemes', () => {
  const l = newLayer('text', { text: '*straße* TEST 👩‍💻', uppercase: true, tracking: 8, size: 72, w: 180, h: 90 });
  const r = layoutDesignText(l, measure);
  assert.equal(r.overflow, false); assert.ok(r.size < l.size);
  assert.ok(r.widths.every((w) => w <= l.w + 0.01)); assert.ok(r.lines.join('').includes('STRASSE'));
  const emoji = layoutDesignText(newLayer('text', { text: '👩‍💻👩‍💻', tracking: 10, size: 10, w: 100, h: 100 }), () => 20);
  assert.equal(emoji.widths[0], 30);
});
