import test from 'node:test';
import assert from 'node:assert/strict';
import { alignWords, findPauses, groupWords, matchScript, scriptLines } from '../src/shared/speech.js';

// One second of tone, half a second of near silence, one more second of tone, at 16 kHz.
function tone(parts, rate = 16000) {
  const out = new Float32Array(parts.reduce((s, [d]) => s + d * rate, 0));
  let i = 0;
  for (const [d, amp] of parts) for (let j = 0; j < d * rate; j++, i++) out[i] = amp * Math.sin(j / 5) + (Math.random() - 0.5) * 0.001;
  return out;
}
test('pauses are found from the audio level, also with background noise', () => {
  const pauses = findPauses(tone([[1, 0.3], [0.5, 0], [1, 0.3], [0.1, 0], [1, 0.3]]), 16000);
  assert.equal(pauses.length, 1, 'a 0.1 s gap is not a pause');
  assert.ok(Math.abs(pauses[0][0] - 1) < 0.03 && Math.abs(pauses[0][1] - 1.5) < 0.03);
});
test('word edges that Whisper stretched into a pause are moved to the pause', () => {
  const words = alignWords(
    [
      { start: 0.3, end: 4, text: 'app.' },
      { start: 4.5, end: 5, text: 'Today' },
    ],
    [[3.2, 4.7]],
  );
  assert.deepEqual([words[0].end, words[1].start], [3.2, 4.7]);
});
test('words become captions at pauses, sentence ends and length limits', () => {
  const w = (start, end, text) => ({ start, end, text });
  const groups = groupWords([w(0, 0.4, 'Welcome'), w(0.4, 0.8, 'everyone.'), w(2, 2.3, 'Today'), w(2.3, 2.6, 'we'), w(2.6, 3, 'start.')]);
  assert.deepEqual(groups.map((g) => g.text), ['Welcome everyone.', 'Today we start.']);
  assert.equal(groups[1].start, 2);
});

test('script lines skip scene headings, character names and stage directions', () => {
  assert.deepEqual(scriptLines('INT. KITCHEN - DAY\n\nAnna cuts bread.\n\nANNA (V.O.)\n(smiling)\nWelcome back. Today we bake bread!\n\n> CUT TO:\n# Notes'), [
    { text: 'Welcome back.', speaker: 'ANNA' },
    { text: 'Today we bake bread!', speaker: 'ANNA' },
  ]);
  assert.deepEqual(scriptLines('INTRODUCTION\nWelcome to the course.\n\nIn this part we install it.').map((l) => l.text), ['Welcome to the course.', 'In this part we install it.'], 'a narration script with headings keeps every sentence');
});
test('every take of a script line is found, also repeated takes in one file, and broken takes are not', () => {
  const words = 'Welcome back today we bake today we no sorry today we bake bread and then we eat Welcome back'
    .split(' ')
    .map((text, i) => ({ start: i, end: i + 0.8, text }));
  const [hello, bread] = matchScript(['Welcome back.', 'Today we bake bread!'], [{ mediaId: 'm', words, pauses: [[9.85, 10.6]] }]);
  assert.deepEqual(hello.takes.map((t) => t.sourceIn).sort((a, b) => a - b), [0, 17]);
  assert.equal(bread.takes[0].sourceIn, 9);
  assert.equal(bread.takes[0].match, 1);
  assert.ok(!bread.takes.some((t) => t.sourceIn === 5 && t.match === 1), 'the broken take is not a full match');
});
