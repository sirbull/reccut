import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockKey,
  chosenTake,
  detectSpeech,
  encodeWav,
  freeAudioLane,
  levelEnvelope,
  nextMissing,
  orphanTakes,
  parseScript,
  peakInfo,
  planAssembly,
  plainLine,
  progress,
  readingTime,
  roomToneFill,
  roomToneLevel,
  splitSentences,
  trimFor,
} from '../src/shared/voiceover.js';

const lines = (blocks) => blocks.filter((b) => b.kind === 'line');

test('scripts from Typeloom keep sections and synopsis, and only spoken text is recorded', () => {
  // Slik ser et Typeloom-prosjekt ut etter readTypeloom i hovedprosessen.
  const text = 'Title: Launch film\n\n# Act One\n= We meet the product.\n\nWelcome to the future of editing.\nIt starts with your voice.\n\nSecond paragraph here.\n\n## The demo\n\nWatch this.';
  const b = parseScript(text);
  assert.deepEqual(b.map((x) => x.kind), ['title', 'heading', 'note', 'line', 'line', 'heading', 'line']);
  assert.equal(b[3].text, 'Welcome to the future of editing. It starts with your voice.');
  assert.equal(b[0].text, 'Launch film');
  assert.notEqual(b[3].section, b[6].section);
  assert.equal(b[3].section, b[4].section);
  assert.notEqual(b[3].para, b[4].para);
});

test('screenplays become dialogue lines with the speaker and direction', () => {
  const b = parseScript('INT. KITCHEN - NIGHT\n\nAnna pours coffee.\n\nANNA (V.O.)\n(quietly)\nWe start now.\n\nBEN\nAlready?');
  assert.equal(b[0].kind, 'heading');
  const d = lines(b).filter((x) => x.speaker);
  assert.deepEqual(d.map((x) => [x.speaker, x.text, x.direction]), [['ANNA', 'We start now.', 'quietly'], ['BEN', 'Already?', '']]);
});

test('markdown is read as plain speech, and lists are separate lines', () => {
  assert.equal(plainLine('**Bold** and _soft_ with a [link](http://x) and `code`'), 'Bold and soft with a link and code');
  const b = lines(parseScript('Intro line.\n\n- First point\n- Second point'));
  assert.deepEqual(b.map((x) => x.text), ['Intro line.', 'First point', 'Second point']);
});

test('split by sentence and by line, without breaking common abbreviations', () => {
  assert.deepEqual(splitSentences('Dr. Smith is here. Is he? Yes! 3 more.'), ['Dr. Smith is here.', 'Is he?', 'Yes!', '3 more.']);
  const s = lines(parseScript('One. Two three.\n\nFour.', { split: 'sentence' }));
  assert.deepEqual(s.map((x) => x.text), ['One.', 'Two three.', 'Four.']);
  assert.equal(s[0].para, s[1].para);
  assert.notEqual(s[1].para, s[2].para);
  assert.equal(lines(parseScript('a\nb', { split: 'line' })).length, 2);
});

test('keys follow the words, so takes survive edits around a line, and repeated lines differ', () => {
  const a = parseScript('Hello there.\n\nSecond.');
  const b = parseScript('# New intro\n\nAdded first.\n\nHello there.\n\nSecond.');
  assert.equal(lines(a)[0].key, lines(b)[1].key);
  assert.equal(blockKey('Hello, there!'), blockKey('hello there'));
  const r = lines(parseScript('Again.\n\nAgain.'));
  assert.notEqual(r[0].key, r[1].key);
});

function tone(rate, parts) {
  // parts: [[sekunder, amplitude]], sinus på 220 Hz pluss litt støy.
  const total = parts.reduce((a, [d]) => a + d, 0);
  const out = new Float32Array(Math.round(total * rate));
  let i = 0,
    seed = 1;
  for (const [d, amp] of parts) {
    const n = Math.round(d * rate);
    for (let k = 0; k < n; k++, i++) {
      seed = (seed * 16807) % 2147483647;
      out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / rate) + 0.002 * (seed / 2147483647 - 0.5);
    }
  }
  return out;
}

test('speech detection finds where the voice starts and ends, and trims with air', () => {
  const rate = 16000;
  const s = tone(rate, [[0.8, 0], [1.5, 0.3], [0.6, 0]]);
  const sp = detectSpeech(levelEnvelope(s, rate));
  assert.ok(sp, 'speech found');
  assert.ok(Math.abs(sp.start - 0.8) < 0.05, `start ${sp.start}`);
  assert.ok(Math.abs(sp.end - 2.3) < 0.05, `end ${sp.end}`);
  const t = trimFor(sp, 2.9, { preRoll: 0.1, postRoll: 0.3 });
  assert.ok(t.found && Math.abs(t.in - 0.7) < 0.06 && Math.abs(t.out - 2.6) < 0.06);
  // Soft start (a breath or an "s") is included up to the noise floor.
  const soft = tone(rate, [[0.5, 0], [0.15, 0.01], [1, 0.3], [0.5, 0]]);
  const ss = detectSpeech(levelEnvelope(soft, rate));
  assert.ok(ss.start < 0.6, `soft start ${ss.start}`);
});

test('silence and steady noise are not speech, and untrimmed takes keep the whole file', () => {
  const rate = 16000;
  assert.equal(detectSpeech(levelEnvelope(tone(rate, [[2, 0]]), rate)), null);
  assert.equal(detectSpeech(levelEnvelope(tone(rate, [[2, 0.05]]), rate)), null);
  assert.deepEqual(trimFor(null, 3), { in: 0, out: 3, found: false });
  assert.equal(detectSpeech(new Float32Array(0)), null);
});

test('clipping and peak level are measured', () => {
  const s = new Float32Array(1000).fill(0.5);
  assert.equal(peakInfo(s).clipped, false);
  assert.ok(Math.abs(peakInfo(s).peakDb + 6.02) < 0.05);
  s.fill(1, 0, 10);
  assert.equal(peakInfo(s).clipped, true);
});

test('takes are written as 24-bit WAV', () => {
  const buf = encodeWav([new Float32Array([0, 1, -1, 0.5])], 48000);
  const v = new DataView(buf);
  assert.equal(String.fromCharCode(...new Uint8Array(buf, 0, 4)), 'RIFF');
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(34, true), 24);
  assert.equal(v.getUint32(40, true), 12);
  assert.equal(buf.byteLength, 44 + 12);
  const s24 = (o) => (v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16));
  assert.equal(s24(47), 8388607);
  assert.equal(s24(50), -8388607);
  assert.equal(new DataView(encodeWav([new Float32Array(2)], 44100, 16)).getUint16(34, true), 16);
});

test('the chosen take is the selected one, then a starred one, then the latest, never a bad one', () => {
  const vo = { takes: [{ id: 'a', key: 'k', at: 1 }, { id: 'b', key: 'k', at: 2, star: true }, { id: 'c', key: 'k', at: 3 }], selected: {} };
  assert.equal(chosenTake(vo, 'k').id, 'b');
  vo.selected.k = 'a';
  assert.equal(chosenTake(vo, 'k').id, 'a');
  vo.takes[0].bad = true;
  assert.equal(chosenTake(vo, 'k').id, 'b');
  assert.equal(chosenTake(vo, 'none'), null);
});

test('stitching lays the chosen takes out in script order with pauses that follow the structure', () => {
  const blocks = parseScript('One. Two.\n\nThree.\n\n# Part two\n\nFour.', { split: 'sentence' });
  const L = lines(blocks);
  const take = (b, id, len, dur = len + 1) => ({ id, key: b.key, in: 0.5, out: 0.5 + len, duration: dur, at: 0 });
  const vo = { takes: [take(L[0], 'a', 1), take(L[1], 'b', 2), take(L[2], 'c', 1), take(L[3], 'd', 1)], selected: {} };
  const pacing = { sentence: 0.3, paragraph: 0.8, section: 2 };
  const plan = planAssembly(blocks, vo, { start: 10, pacing });
  assert.deepEqual(plan.items.map((i) => [i.take.id, i.at, i.dur]), [['a', 10, 1], ['b', 11.3, 2], ['c', 14.1, 1], ['d', 17.1, 1]]);
  assert.deepEqual(plan.gaps, [{ at: 11, dur: 0.3 }, { at: 13.3, dur: 0.8 }, { at: 15.1, dur: 2 }]);
  assert.equal(plan.end, 18.1);
  // Video: the pause is the take's own sound as far as the file goes, and nothing is left as a black gap.
  const tight = planAssembly(blocks, vo, { start: 0, pacing, room: 'tight' });
  assert.equal(tight.gaps.length, 0);
  assert.equal(tight.items[0].dur, 1.3);
  assert.equal(tight.items[2].dur, 1.5);
  assert.equal(tight.items[2].dur + tight.items[2].at, tight.items[3].at);
  // Audio: own sound first, then a gap for the rest.
  const fill = planAssembly(blocks, vo, { start: 0, pacing, room: 'fill' });
  assert.deepEqual(fill.gaps.map((g) => g.dur), [0.3, 1.5]);
  // Lines without takes are skipped, and from limits where the stitch starts.
  assert.deepEqual(planAssembly(blocks, { takes: [vo.takes[3]] }).items.map((i) => i.take.id), ['d']);
  assert.deepEqual(planAssembly(blocks, vo, { from: L[2].index }).items.map((i) => i.take.id), ['c', 'd']);
});

test('the voice goes on one free audio lane, and room tone fills the pauses', () => {
  const clips = { x: { id: 'x', lane: -1, start: 5, dur: 2 }, y: { id: 'y', lane: -2, start: 0, dur: 1 }, z: { id: 'z', lane: 0, start: 0, dur: 100 } };
  assert.equal(freeAudioLane(clips, 0, 4), -1);
  assert.equal(freeAudioLane(clips, 2, 10), -2);
  assert.equal(freeAudioLane(clips, 0, 10), -3);
  assert.equal(freeAudioLane(clips, 0, 10, new Set(['x'])), -1);
  const pieces = roomToneFill([{ at: 1, dur: 0.5 }, { at: 3, dur: 6 }], 4, 0);
  assert.deepEqual(pieces, [{ at: 1, in: 0, dur: 0.5 }, { at: 3, in: 0.5, dur: 3.5 }, { at: 6.5, in: 0, dur: 2.5 }]);
  assert.deepEqual(roomToneFill([{ at: 0, dur: 1 }], 0), []);
});

test('progress, next missing line, reading time and takes whose line was removed', () => {
  const blocks = parseScript('A b c.\n\nD e.\n\nF.');
  const L = lines(blocks);
  const vo = { takes: [{ id: '1', key: L[0].key }, { id: '2', key: 'gone' }], selected: {} };
  assert.deepEqual(progress(blocks, vo), { done: 1, total: 3 });
  assert.equal(nextMissing(blocks, vo, L[0].index), L[1].index);
  assert.equal(nextMissing(blocks, vo, L[2].index), L[1].index);
  assert.deepEqual(orphanTakes(blocks, vo).map((t) => t.id), ['2']);
  assert.equal(readingTime(blocks, 60), 6);
});

test('a room tone with sound in it never hides the voice, and is reported as not quiet', () => {
  const rate = 16000;
  const take = levelEnvelope(tone(rate, [[0.6, 0], [1.2, 0.3], [0.6, 0]]), rate);
  const sp = detectSpeech(take, { floorDb: -20 });
  assert.ok(sp && Math.abs(sp.start - 0.6) < 0.05, 'a too high room floor is ignored');
  // Takes without silence use the room floor to find the voice.
  assert.ok(detectSpeech(levelEnvelope(tone(rate, [[0.05, 0], [1.5, 0.3], [0.05, 0]]), rate), { floorDb: -70 }));
  assert.equal(roomToneLevel(levelEnvelope(tone(rate, [[3, 0]]), rate)).quiet, true);
  assert.equal(roomToneLevel(levelEnvelope(tone(rate, [[2, 0], [1, 0.3]]), rate)).quiet, false);
});

test('the studio timeline: deleted lines are left out, a pause can be set by hand, and gain normalizes', async () => {
  const { peaks, normalizeGain, peakDbIn } = await import('../src/shared/voiceover.js');
  const blocks = parseScript('One.\n\nTwo.\n\nThree.');
  const L = lines(blocks);
  const take = (b, id, extra = {}) => ({ id, key: b.key, in: 0, out: 1, duration: 1, ...extra });
  const vo = { takes: [take(L[0], 'a', { pause: 0.1 }), take(L[1], 'b'), take(L[2], 'c')], selected: {}, skip: { [L[1].key]: true } };
  const plan = planAssembly(blocks, vo, { pacing: { sentence: 0.3, paragraph: 0.8, section: 2 } });
  assert.deepEqual(plan.items.map((i) => [i.take.id, i.at]), [['a', 0], ['c', 1.1]]);
  assert.equal(normalizeGain(-12), 9);
  assert.equal(normalizeGain(-50), 24);
  assert.equal(normalizeGain(-120), 0);
  const pk = peaks(new Float32Array([0, 0.5, 0, 0, 0.25, 0]), 200, 0.01);
  assert.deepEqual(Array.from(pk), [0.5, 0, 0.25]);
  assert.ok(Math.abs(peakDbIn(pk, 0.02, 0.03) + 12.04) < 0.01);
});

test('two people: the same line lines up for comparing, a dialogue interleaves, and a muted person takes no time', async () => {
  const { planStudio, chosenTake: pick } = await import('../src/shared/voiceover.js');
  const blocks = parseScript('One.\n\nTwo.\n\nThree.');
  const L = lines(blocks);
  const pacing = { sentence: 0.3, paragraph: 0.5, section: 1 };
  const t = (b, id, person, len) => ({ id, key: b.key, person, in: 0, out: len, duration: len });
  // Both read every line: same slots, the slot is as long as the longest.
  const both = { takes: [t(L[0], 'a1', 'p1', 1), t(L[0], 'b1', 'p2', 2), t(L[1], 'a2', 'p1', 1), t(L[1], 'b2', 'p2', 1)], selected: {} };
  const people = [{ id: 'p1', active: true }, { id: 'p2', active: true }];
  let plan = planStudio(blocks, both, { pacing, people });
  assert.deepEqual(plan.items.map((i) => [i.take.id, i.at]), [['a1', 0], ['b1', 0], ['a2', 2.5], ['b2', 2.5]]);
  // Mute B: A is tight again, B is still shown where it belongs.
  plan = planStudio(blocks, both, { pacing, people: [{ id: 'p1', active: true }, { id: 'p2', active: false }] });
  assert.deepEqual(plan.items.filter((i) => i.active).map((i) => [i.take.id, i.at]), [['a1', 0], ['a2', 1.5]]);
  // Dialogue: A says line 1 and 3, B says line 2.
  const dlg = { takes: [t(L[0], 'a1', 'p1', 1), t(L[1], 'b2', 'p2', 2), t(L[2], 'a3', 'p1', 1)], selected: {} };
  plan = planStudio(blocks, dlg, { pacing, people });
  assert.deepEqual(plan.items.map((i) => [i.take.id, i.person, i.at]), [['a1', 'p1', 0], ['b2', 'p2', 1.5], ['a3', 'p1', 4]]);
  assert.deepEqual(plan.gaps, [{ at: 1, dur: 0.5 }, { at: 3.5, dur: 0.5 }]);
  // Choices and deletes are per person; old choices belong to the first person.
  const v = { takes: [t(L[0], 'x', undefined, 1), t(L[0], 'y', undefined, 1), t(L[0], 'z', 'p2', 1)], selected: { [L[0].key]: 'x' }, skip: { [`p2|${L[0].key}`]: true } };
  assert.equal(pick(v, L[0].key, 'p1').id, 'x');
  assert.equal(pick(v, L[0].key, 'p2').id, 'z');
  assert.deepEqual(planStudio(blocks, v, { people }).items.map((i) => i.take.id), ['x']);
});
