import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockKey,
  chosenTake,
  detectSpeech,
  encodeWav,
  freeAudioLane,
  htmlToScript,
  scriptCaptions,
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
  moveStudioClip,
  planStudio,
  takeFades,
  splitStudioClip,
  allStudioTakes,
  deleteStudioClips,
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

test('clicks from pressing record and stop are not counted as speech', () => {
  const rate = 16000;
  const s = tone(rate, [[0.1, 0.6], [0.6, 0], [1, 0.3], [0.6, 0], [0.1, 0.6], [0.1, 0]]);
  const sp = detectSpeech(levelEnvelope(s, rate), { skipStart: 0.3, skipEnd: 0.4 });
  assert.ok(Math.abs(sp.start - 0.7) < 0.05 && Math.abs(sp.end - 1.7) < 0.05, `${sp.start} to ${sp.end}`);
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
  assert.deepEqual(plan.gaps.map(({ at, dur }) => ({ at, dur })), [{ at: 11, dur: 0.3 }, { at: 13.3, dur: 0.8 }, { at: 15.1, dur: 2 }]);
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
  const pieces = roomToneFill([{ at: 1, dur: 0.5 }, { at: 3, dur: 6 }], 4, 0, 0);
  assert.deepEqual(pieces, [{ at: 1, in: 0, dur: 0.5 }, { at: 3, in: 0.5, dur: 3.5 }, { at: 6.5, in: 0, dur: 2.5 }]);
  // Klikket fra start og stopp i hver ende av romlyden kommer aldri med.
  const cut = roomToneFill([{ at: 0, dur: 9 }], 5, 0);
  assert.ok(cut.every((p) => p.in >= 0.5 && p.in + p.dur <= 4.5 + 1e-9), JSON.stringify(cut));
  assert.ok(Math.abs(cut.reduce((a, p) => a + p.dur, 0) - 9) < 1e-6);
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

test('two people: the same line lines up for comparing, a dialogue interleaves, and mute preserves timing', async () => {
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
  // Mute B: both tracks keep their slots and lengths; only B becomes inactive.
  plan = planStudio(blocks, both, { pacing, people: [{ id: 'p1', active: true }, { id: 'p2', active: false }] });
  assert.deepEqual(plan.items.filter((i) => i.active).map((i) => [i.take.id, i.at]), [['a1', 0], ['a2', 2.5]]);
  // V on one clip: it keeps its place but is off.
  plan = planStudio(blocks, { ...both, takes: both.takes.map((x) => (x.id === 'b1' ? { ...x, disabled: true } : x)) }, { pacing, people });
  assert.deepEqual(plan.items.map((i) => [i.take.id, i.at, i.active]), [['a1', 0, true], ['b1', 0, false], ['a2', 2.5, true], ['b2', 2.5, true]]);
  // Dialogue: A says line 1 and 3, B says line 2.
  const dlg = { takes: [t(L[0], 'a1', 'p1', 1), t(L[1], 'b2', 'p2', 2), t(L[2], 'a3', 'p1', 1)], selected: {} };
  plan = planStudio(blocks, dlg, { pacing, people });
  assert.deepEqual(plan.items.map((i) => [i.take.id, i.person, i.at]), [['a1', 'p1', 0], ['b2', 'p2', 1.5], ['a3', 'p1', 4]]);
  assert.deepEqual(plan.gaps.map(({ at, dur }) => ({ at, dur })), [{ at: 1, dur: 0.5 }, { at: 3.5, dur: 0.5 }]);
  // Choices and deletes are per person; old choices belong to the first person.
  const v = { takes: [t(L[0], 'x', undefined, 1), t(L[0], 'y', undefined, 1), t(L[0], 'z', 'p2', 1)], selected: { [L[0].key]: 'x' }, skip: { [`p2|${L[0].key}`]: true } };
  assert.equal(pick(v, L[0].key, 'p1').id, 'x');
  assert.equal(pick(v, L[0].key, 'p2').id, 'z');
  assert.deepEqual(planStudio(blocks, v, { people }).items.map((i) => i.take.id), ['x']);
});

test('formatted paste turns headings into sections and keeps paragraphs apart', () => {
  const html = '<html><head><style>p{}</style></head><body><!--StartFragment--><h1 class=x>Act&nbsp;One</h1>\n<p>Hello <b>there</b>.<br>Second line.</p><p>Fish &amp; chips &#8211; ok</p><h2></h2><ul><li>One</li><li>Two</li></ul></body></html>';
  assert.equal(htmlToScript(html), '# Act One\n\nHello there.\nSecond line.\n\nFish & chips \u2013 ok\n\nOne\nTwo');
});

test('noisy lead-in before the voice is trimmed, even when the room tone was quieter', () => {
  const rate = 16000;
  // Rom med støy (ca. -40 dB) i ett sekund, så stemmen, så stille igjen. Romlyden ble målt mye lavere.
  const s = tone(rate, [[1, 0.012], [1, 0.3], [0.8, 0.012]]);
  const sp = detectSpeech(levelEnvelope(s, rate), { floorDb: -75, skipStart: 0.3, skipEnd: 0.4 });
  assert.ok(sp.start > 0.8 && sp.start < 1.05, `start ${sp.start}`);
  assert.ok(sp.end > 1.95 && sp.end < 2.25, `end ${sp.end}`);
});

test('subtitles from the script follow each clip, split long lines and leave out directions', () => {
  const caps = scriptCaptions([
    { text: 'Noen synes det er spennende. Andre synes det er skremmende.', start: 10, dur: 4 },
    { text: '[smiling] For bare hundre år siden virket det umulig å snakke med noen på den andre siden av kloden. I dag gjør vi det uten å tenke over det.', start: 15, dur: 8 },
  ]);
  assert.equal(caps[0].text, 'Noen synes det er spennende. Andre synes det er skremmende.');
  assert.deepEqual([caps[0].start, caps[0].end], [10, 14]);
  assert.ok(caps.length >= 3 && caps.slice(1).every((c) => c.text.length <= 84 && !c.text.includes('[')));
  assert.equal(caps[1].start, 15);
  assert.ok(Math.abs(caps.at(-1).end - 23) < 0.01);
});

test('each pause knows the line before it, so its room tone can be deleted', () => {
  const pieces = roomToneFill([{ at: 1, dur: 1, after: 'a' }, { at: 4, dur: 1, after: 'b' }], 5, 0);
  assert.deepEqual([...new Set(pieces.map((p) => p.after))], ['a', 'b']);
});

test('a take dragged from the media browser starts with the settings from the studio', async () => {
  const { mediaClip } = await import('../src/shared/ops.js');
  const fx = [{ id: 'a', type: 'eq', on: true, p: { preset: 'podcast' } }];
  const media = { id: 'm', kind: 'audio', name: 'Line 1 take 2', duration: 4, streams: { main: { hasAudio: true } }, clipDefaults: { in: 0.4, dur: 2.5, props: { volume: -3, aFadeIn: 0.02, aFadeOut: 0.04, afx: fx }, kf: { volume: [[0.5, -3], [2, -9]] } } };
  const c = mediaClip(media);
  assert.deepEqual([c.in, c.dur, c.props.volume, c.props.aFadeOut], [0.4, 2.5, -3, 0.04]);
  assert.deepEqual(c.kf.volume, [[0.5, -3], [2, -9]]);
  assert.equal(c.props.afx[0].type, 'eq');
  assert.notEqual(c.props.afx[0].id, 'a', 'each clip gets its own effect ids');
  c.kf.volume[0][1] = 0;
  assert.equal(media.clipDefaults.kf.volume[0][1], -3, 'the media is not changed by editing the clip');
  // A range marked in the browser wins over the studio trim.
  assert.deepEqual([mediaClip(media, { in: 1, dur: 1 }).in, mediaClip(media, { in: 1, dur: 1 }).dur], [1, 1]);
});

test('cutting a take splits it, and deleting a part closes the gap', async () => {
  const { addCut, takeParts, takeLength, itemParts } = await import('../src/shared/voiceover.js');
  const take = { in: 0.5, out: 4.5, cuts: addCut([], 2) };
  assert.deepEqual(takeParts(take), [[0.5, 2], [2, 4.5]]);
  // Delete an "eh" from 2 to 2.6: the part after moves up against the part before.
  take.cuts = addCut(take.cuts, 2, 2.6);
  assert.deepEqual(take.cuts, [[2, 2.6]]);
  assert.deepEqual(takeParts(take), [[0.5, 2], [2.6, 4.5]]);
  assert.ok(Math.abs(takeLength(take) - 3.4) < 1e-9);
  const parts = itemParts({ take, at: 10, in: 0.5, dur: 3.4 });
  assert.deepEqual(parts.map((p) => [p.at, p.in, p.dur]), [[10, 0.5, 1.5], [11.5, 2.6, 1.9]]);
  // Cutting away the start moves where the clip begins.
  take.cuts = addCut(take.cuts, 0, 1);
  assert.deepEqual(takeParts(take), [[1, 2], [2.6, 4.5]]);
});

test('moving a studio clip changes the preceding pause and shifts every later voice together', () => {
  const blocks = parseScript('First.\n\nSecond.\n\nThird.');
  const L = lines(blocks);
  const vo = { takes: L.map((b, i) => ({ id: `t${i}`, key: b.key, person: i === 2 ? 'p2' : 'p1', in: 0.5, out: 2.5, duration: 8 })) };
  const options = { pacing: { sentence: 0.3, paragraph: 0.5, section: 1 }, people: [{ id: 'p1', active: true }, { id: 'p2', active: true }] };
  const initial = planStudio(blocks, vo, options);
  moveStudioClip(vo, initial, 't1', 1.25);
  const moved = planStudio(blocks, vo, options);
  assert.deepEqual(moved.items.map((x) => x.at), [0, 3.75, 6.25]);
  assert.deepEqual(moved.items.map((x) => [x.in, x.dur]), initial.items.map((x) => [x.in, x.dur]), 'moving does not trim the audio');
  const gap = moved.gaps[0];
  assert.equal(gap.dur, 1.75);
  assert.equal(gap.person, 'p1');
  const fill = roomToneFill([gap], 5);
  assert.ok(fill[0].at <= gap.at && fill.at(-1).at + fill.at(-1).dur >= gap.at + gap.dur - 0.001, 'room tone covers the newly opened pause');
  // A second pointermove is relative to the same starting plan, not cumulative.
  moveStudioClip(vo, initial, 't1', 0.75);
  assert.equal(planStudio(blocks, vo, options).items[1].at, 3.25);
  moveStudioClip(vo, initial, 't1', -20);
  assert.equal(planStudio(blocks, vo, options).items[1].at, 2, 'clips stop against the preceding voice');
});

test('the first studio clip can open and close a leading pause with room tone', () => {
  const blocks = parseScript('First.\n\nSecond.');
  const vo = { takes: lines(blocks).map((b, i) => ({ id: `t${i}`, key: b.key, in: 0, out: 1, duration: 2 })) };
  const initial = planAssembly(blocks, vo);
  moveStudioClip(vo, initial, 't0', 2);
  const plan = planAssembly(blocks, vo);
  assert.equal(plan.items[0].at, 2);
  assert.equal(plan.items[1].at, initial.items[1].at + 2);
  assert.deepEqual(plan.gaps[0], { at: 0, dur: 2, after: null, person: 'p1' });
  assert.ok(roomToneFill(plan.gaps, 5).some((x) => x.at === 0 && x.after === null));
  const offset = planAssembly(blocks, vo, { start: 10 });
  assert.equal(offset.items[0].at, 12, 'Send to Edit preserves the leading pause at the insertion time');
  assert.equal(planAssembly(blocks, vo, { from: lines(blocks)[1].index }).items[0].at, 0, 'sending from a later line does not copy the lead-in');
  moveStudioClip(vo, plan, 't0', -20);
  assert.equal(planAssembly(blocks, vo).items[0].at, 0);
});

test('moving clips accounts for room tone already extended from the previous recording', () => {
  const blocks = parseScript('One.\n\nTwo.');
  const vo = { takes: lines(blocks).map((b, i) => ({ id: `t${i}`, key: b.key, in: 0, out: 1, duration: 5 })) };
  const options = { room: 'fill', pacing: { paragraph: 0.5 } };
  const initial = planAssembly(blocks, vo, options);
  assert.equal(initial.items[0].dur, 1.5);
  moveStudioClip(vo, initial, 't1', 1);
  assert.equal(planAssembly(blocks, vo, options).items[1].at, 2.5, 'existing filled pause is not subtracted twice');
});

test('fades fit short clips and the edge parts of a cut recording', () => {
  assert.deepEqual(takeFades({ in: 0, out: 0.1, fadeIn: 0.3, fadeOut: 0.3 }), { fadeIn: 0.05, fadeOut: 0.05 });
  assert.deepEqual(takeFades({ in: 0, out: 3, cuts: [[0.1, 1]], fadeIn: 0.3, fadeOut: 0.3 }), { fadeIn: 0.05, fadeOut: 0.3 });
  assert.deepEqual(takeFades({ in: 0, out: 1, cuts: [[0, 1]], fadeIn: 0.3, fadeOut: 0.3 }), { fadeIn: 0, fadeOut: 0 });
});


function splitFixture() {
  const blocks = parseScript('First line.\n\nSecond line.');
  const vo = { takes: lines(blocks).map((b, i) => ({ id: `take${i}`, key: b.key, file: 'voice.wav', in: 0.5, out: 4.5, duration: 6, gain: 0, fadeIn: 0.2, fadeOut: 0.3, volKf: [[0.5, -2], [4.5, -8]] })) };
  return { blocks, vo, initial: planAssembly(blocks, vo) };
}

test('studio splitting creates independent persistent clips without adding a pause or changing the source', () => {
  const { blocks, vo, initial } = splitFixture();
  const original = JSON.stringify(vo.takes[0]);
  assert.deepEqual(splitStudioClip(vo, initial, 'take0', 1.5, ['left', 'right']), ['left', 'right']);
  const plan = planAssembly(blocks, vo);
  assert.deepEqual(plan.items.map((x) => [x.take.id, x.at, x.in, x.dur]), [['left', 0, 0.5, 1.5], ['right', 1.5, 2, 2.5], ['take1', initial.items[1].at, 0.5, 4]]);
  assert.equal(plan.end, initial.end);
  assert.equal(vo.takes.length, 2, 'splitting does not make a competing retake');
  const { clips, ...source } = vo.takes[0];
  assert.equal(JSON.stringify(source), original);
  assert.notEqual(clips[0].volKf, clips[1].volKf);
  clips[0].volKf[0][1] = -20;
  assert.equal(clips[1].volKf[0][1], -2);
  assert.equal(source.volKf[0][1], -2);
  const reloaded = JSON.parse(JSON.stringify(vo));
  assert.deepEqual(planAssembly(blocks, reloaded), planAssembly(blocks, vo), 'independent clips survive project save and reopen');
});

test('split clips can be trimmed, given different levels, moved and split again independently', () => {
  const { blocks, vo, initial } = splitFixture();
  splitStudioClip(vo, initial, 'take0', 1.5, ['left', 'right']);
  const left = allStudioTakes(vo).find((x) => x.id === 'left');
  const right = allStudioTakes(vo).find((x) => x.id === 'right');
  left.out -= 0.5;
  right.gain = -12;
  right.volKf = null;
  const trimmed = planAssembly(blocks, vo);
  assert.equal(trimmed.items[0].dur, 1);
  assert.equal(trimmed.items[1].in, 2);
  assert.equal(trimmed.items[1].take.gain, -12);
  assert.equal(trimmed.items[0].take.gain, 0);
  assert.equal(trimmed.items[1].at, 1);
  moveStudioClip(vo, trimmed, 'right', 0.75);
  const moved = planAssembly(blocks, vo);
  assert.equal(moved.items[0].at, 0);
  assert.equal(moved.items[1].at, 1.75);
  assert.equal(moved.items[2].at, trimmed.items[2].at + 0.75);
  assert.equal(moved.gaps[0].after, 'left');
  assert.equal(moved.gaps[0].dur, 0.75);
  assert.ok(roomToneFill(moved.gaps, 5).some((x) => x.after === 'left'));
  splitStudioClip(vo, moved, 'right', 2.75, ['middle', 'end']);
  const twice = planAssembly(blocks, vo);
  assert.deepEqual(twice.items.slice(0, 3).map((x) => x.take.id), ['left', 'middle', 'end']);
  assert.equal(twice.items[1].take.gain, -12);
  assert.equal(twice.items[2].take.gain, -12);
  assert.equal(twice.end, moved.end);
});

test('deleting one split clip retains its sibling and source and closes up the following material', () => {
  const { blocks, vo, initial } = splitFixture();
  splitStudioClip(vo, initial, 'take0', 1.5, ['left', 'right']);
  deleteStudioClips(vo, ['left']);
  const plan = planAssembly(blocks, vo);
  assert.deepEqual(plan.items.map((x) => x.take.id), ['right', 'take1']);
  assert.equal(plan.items[0].at, 0);
  assert.equal(plan.items[0].in, 2);
  assert.equal(plan.items[1].at, initial.items[1].at - 1.5);
  assert.equal(vo.takes[0].in, 0.5);
  assert.equal(vo.takes[0].out, 4.5);
  deleteStudioClips(vo, ['right']);
  assert.deepEqual(planAssembly(blocks, vo).items.map((x) => x.take.id), ['take1']);
});

test('cutting outside or at a clip edge does not create empty clips', () => {
  const { vo, initial } = splitFixture();
  for (const at of [-1, 0, 0.01, 3.99, 4, 20, NaN]) assert.equal(splitStudioClip(vo, initial, 'take0', at, ['left', 'right']), null);
  assert.equal(vo.takes[0].clips, undefined);
});

test('splitting a clip with its own room-tone tail preserves the next line timing', () => {
  for (const time of [0.5, 1.2]) {
    const blocks = parseScript('One.\n\nTwo.');
    const vo = { takes: lines(blocks).map((b, i) => ({ id: `t${i}`, key: b.key, in: 0, out: 1, duration: 4 })) };
    const options = { room: 'fill', pacing: { paragraph: 0.5 } };
    const initial = planAssembly(blocks, vo, options);
    assert.equal(initial.items[0].dur, 1.5);
    splitStudioClip(vo, initial, 't0', time, ['left', 'right']);
    const split = planAssembly(blocks, vo, options);
    assert.equal(split.items[2].at, initial.items[1].at, `next line stays in place when splitting at ${time}`);
    assert.equal(split.end, initial.end);
  }
});

test('every new studio pause is automatically covered by room tone, including long gaps between split clips', () => {
  const { blocks, vo, initial } = splitFixture();
  splitStudioClip(vo, initial, 'take0', 1.5, ['left', 'right']);
  // A pause entered below the timeline uses the same fill as an A-tool move.
  allStudioTakes(vo).find((c) => c.id === 'left').pause = 12;
  let plan = planAssembly(blocks, vo);
  moveStudioClip(vo, plan, 'left', 2);
  plan = planAssembly(blocks, vo);
  const inner = plan.gaps.find((g) => g.after === 'left');
  assert.equal(inner.dur, 12);
  assert.equal(plan.gaps[0].at, 0);
  assert.equal(plan.gaps[0].dur, 2);
  const pieces = roomToneFill(plan.gaps, 5);
  assert.ok(pieces.filter((p) => p.after === 'left').length > 1, 'the recorded room tone repeats automatically for long pauses');
  for (const gap of plan.gaps) {
    const fill = pieces.filter((p) => p.after === gap.after).sort((a, b) => a.at - b.at);
    let covered = gap.at;
    for (const piece of fill) {
      assert.ok(piece.at <= covered + 0.001, 'no silence between room-tone pieces');
      covered = Math.max(covered, piece.at + piece.dur);
      assert.ok(piece.in >= 0.5 && piece.in + piece.dur <= 4.5 + 0.001, 'fill avoids recording start and stop clicks');
      assert.equal(piece.person, gap.person);
    }
    assert.ok(covered >= gap.at + gap.dur - 0.001, 'room tone reaches the next clip');
  }
  // Close the gap again: room tone is recalculated and leaves no obsolete pieces.
  moveStudioClip(vo, plan, 'right', -12);
  const closed = planAssembly(blocks, vo);
  assert.ok(!closed.gaps.some((g) => g.after === 'left'));
  assert.ok(!roomToneFill(closed.gaps, 5).some((p) => p.after === 'left'));
});

test('mute and solo retain every clip, manual pause, room-tone gap and total duration in every pacing mode', () => {
  const blocks = parseScript('First.\n\nSecond.\n\nThird.');
  const L = lines(blocks);
  const vo = { leadIn: 0.6, takes: [
    { id: 'a', key: L[0].key, person: 'p1', in: 0.5, out: 1.5, duration: 3, pause: 1.2 },
    { id: 'b', key: L[0].key, person: 'p2', in: 0, out: 3, duration: 5, clips: [
      { id: 'b1', sourceTakeId: 'b', key: L[0].key, person: 'p2', in: 0, out: 1, duration: 5, pause: 0.3 },
      { id: 'b2', sourceTakeId: 'b', key: L[0].key, person: 'p2', in: 2, out: 3, duration: 5, pause: 1.2 },
    ] },
    { id: 'c', key: L[1].key, person: 'p2', in: 0, out: 4, duration: 5 },
    { id: 'd', key: L[2].key, person: 'p1', in: 0, out: 1, duration: 2 },
  ] };
  const geometry = (plan) => ({ ...plan, items: plan.items.map(({ active, ...it }) => it) });
  for (const room of [false, 'fill', 'tight']) {
    const options = { room, pacing: { paragraph: 0.8 } };
    const initial = planStudio(blocks, vo, { ...options, people: [{ id: 'p1', active: true }, { id: 'p2', active: true }] });
    for (const active of [[true, false], [false, true], [false, false]]) {
      const plan = planStudio(blocks, vo, { ...options, people: active.map((on, i) => ({ id: `p${i + 1}`, active: on })) });
      assert.deepEqual(geometry(plan), geometry(initial), `${room}: mute/solo must only change active flags`);
      assert.ok(plan.items.every((it) => it.active === active[it.person === 'p1' ? 0 : 1]));
    }
  }
});
