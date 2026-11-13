import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_LANE, DEFAULT_CAPTION_STYLE, computeFrame, makeClip, newProject } from '../src/shared/model.js';
import { placeFree, splitCaptions, splitClip, trimClip } from '../src/shared/ops.js';
import { groupWords } from '../src/shared/speech.js';
import { CAPTION_PRESETS, activeWordIndex, captionWordTimes, splitCaptionWords, wordsForCaption } from '../src/shared/captionWords.js';
import { drawCaption } from '../src/shared/render.js';

const w = (start, end, text) => ({ start, end, text });
const WORDS = [w(10, 10.3, 'Make'), w(10.3, 10.6, 'every'), w(10.6, 11, 'word'), w(11, 11.5, 'count.'), w(12.2, 12.5, 'Then'), w(12.5, 13, 'stop.')];

function setup() {
  const p = newProject('Short captions');
  const [seg] = groupWords(WORDS.slice(0, 4));
  const c = makeClip('caption', { start: seg.start, dur: seg.end - seg.start, lane: CAPTION_LANE, props: { text: seg.text, words: wordsForCaption(seg.start, seg.words), align: null, pos: null } });
  placeFree(p, c, seg.start, CAPTION_LANE);
  return { p, c: p.clips[c.id] };
}

test('Whisper words reach the caption, one time pair per word in the text', () => {
  const groups = groupWords(WORDS);
  assert.equal(groups[0].words.length, 4);
  assert.deepEqual(wordsForCaption(groups[0].start, groups[0].words), [[0, 0.3], [0.3, 0.6], [0.6, 1], [1, 1.5]]);
  assert.equal(wordsForCaption(0, [w(1, 2, 'U. S.')]).length, 2, 'a word with a space is split so the count matches the text');
});

test('the spoken word follows the clip when it is moved and trimmed', () => {
  const { p, c } = setup();
  const times = captionWordTimes(c);
  assert.equal(activeWordIndex(times, 0.4), 1);
  assert.equal(activeWordIndex(times, -0.1), -1);
  trimClip(p, c.id, 'start', 0.3);
  // The first word is trimmed away: at the new start, "every" is spoken.
  assert.equal(activeWordIndex(captionWordTimes(p.clips[c.id]), p.clips[c.id].in), 1);
});

test('edited text falls back to evenly spread timing', () => {
  const { c } = setup();
  c.props.text = 'Make every single word count';
  const times = captionWordTimes(c);
  assert.equal(times.length, 5);
  assert.equal(times[0].a, 0);
  assert.ok(Math.abs(times.at(-1).b - c.dur) < 0.02);
});

test('long captions split into short ones with their own word timing', () => {
  const { p, c } = setup();
  const parts = splitCaptionWords(c, 2);
  assert.deepEqual(parts.map((x) => x.text), ['Make every', 'word count.']);
  assert.equal(parts[0].start, 10);
  assert.equal(parts[1].start, 10.6);
  assert.deepEqual(parts[1].words, [[0, 0.4], [0.4, 0.9]]);
  const r = splitCaptions(p, 2);
  assert.deepEqual(r, { before: 1, after: 2 });
  const caps = Object.values(p.clips).filter((x) => x.type === 'caption').sort((a, b) => a.start - b.start);
  assert.deepEqual(caps.map((x) => [x.start, x.dur, x.props.text]), [[10, 0.6, 'Make every'], [10.6, 0.9, 'word count.']]);
  assert.deepEqual(splitCaptions(p, 2), { before: 0, after: 0 }, 'short captions are left alone');
});

test('captions break at punctuation and pauses', () => {
  const c = makeClip('caption', { start: 0, dur: 3, lane: CAPTION_LANE, props: { text: 'Yes. No way', words: [[0, 0.3], [0.4, 0.7], [1.5, 2]] } });
  assert.deepEqual(splitCaptionWords(c, 4).map((x) => x.text), ['Yes.', 'No', 'way']);
});

test('blade splits the words between the two captions', () => {
  const { p, c } = setup();
  const right = splitClip(p, c.id, 10.65);
  assert.equal(p.clips[c.id].props.text, 'Make every');
  assert.equal(p.clips[right].props.text, 'word count.');
  // The right half keeps source times, so "word" is spoken at its start.
  assert.equal(activeWordIndex(captionWordTimes(p.clips[right]), p.clips[right].in), 0);
});

test('presets only use known style fields', () => {
  for (const preset of CAPTION_PRESETS) for (const key of Object.keys(preset.style)) assert.ok(key in DEFAULT_CAPTION_STYLE, `${preset.id}.${key}`);
});

// A canvas stand-in that records what is drawn.
function recorder() {
  const calls = [];
  const ctx = {
    calls,
    font: '',
    measureText: (t) => ({ width: String(t).length * 10 }),
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {},
    roundRect: () => calls.push(['box']),
    fillText: (t, x, y) => calls.push(['fill', t, ctx.fillStyle, ctx.globalAlpha]),
    strokeText: (t) => calls.push(['stroke', t]),
  };
  return ctx;
}

test('without animation a caption is drawn line by line, as before', () => {
  const { p, c } = setup();
  const ctx = recorder();
  drawCaption(ctx, p, c, 10.4);
  assert.deepEqual(ctx.calls.filter((x) => x[0] === 'fill').map((x) => x[1]), ['Make every word count.']);
});

test('word animation colours the spoken word and reveal hides the rest', () => {
  const { p, c } = setup();
  p.captionStyle = { ...p.captionStyle, anim: 'highlight', highlightColor: '#ff0000', bg: false };
  const ctx = recorder();
  drawCaption(ctx, p, c, 10.4);
  const fills = ctx.calls.filter((x) => x[0] === 'fill');
  assert.deepEqual(fills.map((x) => x[1]).sort(), ['Make', 'count.', 'every', 'word']);
  assert.equal(fills.find((x) => x[1] === 'every')[2], '#ff0000');
  assert.equal(fills.find((x) => x[1] === 'Make')[2], '#ffffff');

  p.captionStyle.anim = 'reveal';
  const r = recorder();
  drawCaption(r, p, c, 10.4);
  assert.deepEqual(r.calls.filter((x) => x[0] === 'fill').map((x) => x[1]).sort(), ['Make', 'every']);

  p.captionStyle.uppercase = true;
  const u = recorder();
  drawCaption(u, p, c, 10.4);
  assert.ok(u.calls.some((x) => x[1] === 'MAKE'));
});

test('the frame carries its time to the caption renderer', () => {
  const { p } = setup();
  assert.equal(computeFrame(p, 10.5).T, 10.5);
});

test('a word wider than a portrait frame shrinks the caption to fit', async () => {
  const { captionLayout } = await import('../src/shared/render.js');
  const style = CAPTION_PRESETS.find((x) => x.id === 'one-word').style;
  const measure = (font, text, maxW) => (maxW == null ? text.length * parseFloat(font.split(' ')[1]) * 0.7 : [text]);
  const L = captionLayout({ width: 1080, height: 1920, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...style } }, { props: { text: 'Unbelievable' } }, measure);
  assert.ok(L.widths[0] * 1.1 <= 1080 * 0.92 + 1, 'room is kept for the pop');
  assert.ok(L.size < style.size * (1920 / 1080));
});
