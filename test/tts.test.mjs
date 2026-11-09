import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { VOICES, LANGUAGES, chunksForSpeech, fixPhonemesFor, normalizeEnglish, spokenText, splitPunctuation, voiceLabel } from '../src/shared/tts.js';

const require = createRequire(import.meta.url);
const { createTts, untarFile, CATALOG } = require('../src/main/tts.js');

test('English text is made readable: times, years, money, titles and decimals', () => {
  assert.equal(normalizeEnglish('Meet Dr. Smith at 3:05 in 1984.'), 'Meet Doctor Smith at 3 oh 5 in 19 84.');
  assert.equal(normalizeEnglish('It costs $2.50 or £1'), 'It costs 2 dollars and 50 cents or 1 pound');
  assert.equal(normalizeEnglish('Pi is 3.14 and pages 4-6'), 'Pi is 3 point 1 4 and pages 4 to 6');
  assert.equal(normalizeEnglish('“Quoted” (aside)'), '"Quoted" «aside»');
});

test('directions in brackets are not read, and long text is split into sentences that fit the model', () => {
  assert.equal(spokenText('That is all [pause] really.'), 'That is all really.');
  assert.deepEqual(chunksForSpeech('One. Two? Three!'), ['One.', 'Two?', 'Three!']);
  const long = `${'word, '.repeat(80)}end.`;
  const parts = chunksForSpeech(long, 120);
  assert.ok(parts.every((p) => p.length <= 120));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long.trim());
});

test('punctuation is kept between phoneme runs, with the Kokoro fixes for English only', () => {
  assert.deepEqual(splitPunctuation('Hi, there.'), [{ match: false, text: 'Hi' }, { match: true, text: ', ' }, { match: false, text: 'there' }, { match: true, text: '.' }]);
  assert.equal(fixPhonemesFor('nˈaɪnti r', 'a'), 'nˈaɪndi ɹ');
  assert.equal(fixPhonemesFor('nˈaɪnti r', 'b'), 'nˈaɪnti ɹ');
  assert.equal(fixPhonemesFor(' rosa ', 'i'), 'rosa');
});

test('every voice has a language and an installed voice file in the pinned catalog', () => {
  const files = new Set(CATALOG.model.files.map((f) => f.path));
  for (const v of VOICES) {
    assert.ok(LANGUAGES[v.lang], v.id);
    assert.ok(files.has(`voices/${v.id}.bin`), `${v.id} is in the catalog`);
  }
  assert.equal(voiceLabel('bm_lewis'), 'Lewis (English (UK), male)');
  assert.match(CATALOG.model.revision, /^[0-9a-f]{40}$/);
  assert.ok(CATALOG.model.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.size > 0));
  assert.match(CATALOG.phonemizer.integrity, /^sha512-/);
});

// En liten npm-tarball (ustar + gzip) til testene.
function tgz(files) {
  const blocks = [];
  for (const [name, data] of Object.entries(files)) {
    const h = Buffer.alloc(512);
    h.write(name, 0);
    h.write('0000644\0', 100);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    h.write('0', 156);
    h.write('ustar\0', 257);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sri = (b) => `sha512-${crypto.createHash('sha512').update(b).digest('base64')}`;

function fixture() {
  const model = Buffer.from('onnx'), voice = Buffer.from(new Float32Array(512).buffer), addon = Buffer.from('export const phonemize = async () => [];');
  const pack = tgz({ 'package/dist/phonemizer.js': addon, 'package/LICENSE': Buffer.from('x') });
  const catalog = {
    model: { repository: 'org/kokoro', revision: 'a'.repeat(40), files: [{ path: 'onnx/model_quantized.onnx', size: model.length, sha256: sha256(model) }, { path: 'voices/af_heart.bin', size: voice.length, sha256: sha256(voice) }] },
    phonemizer: { version: '1.2.1', tarball: 'https://registry.npmjs.org/phonemizer/-/phonemizer-1.2.1.tgz', integrity: sri(pack), size: pack.length, entry: 'package/dist/phonemizer.js', license: 'GPL inside' },
  };
  const bodies = new Map([[catalog.phonemizer.tarball, pack], [`https://huggingface.co/org/kokoro/resolve/${'a'.repeat(40)}/onnx/model_quantized.onnx`, model], [`https://huggingface.co/org/kokoro/resolve/${'a'.repeat(40)}/voices/af_heart.bin`, voice]]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const b = bodies.get(url);
    return { ok: Boolean(b), status: b ? 200 : 404, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  };
  return { catalog, bodies, fetchImpl, calls, addon, voice };
}

test('the AI voices download only when asked, are checked, and are served only for the pinned files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const f = fixture();
  const tts = createTts({ dir, fetchImpl: f.fetchImpl, catalog: f.catalog });
  assert.equal((await tts.status()).installed, false);
  assert.equal(f.calls.length, 0, 'nothing is downloaded before install');
  const progress = [];
  await tts.install((p) => progress.push(p));
  assert.equal(progress.at(-1), 1);
  assert.equal((await tts.status()).installed, true);
  assert.deepEqual(Buffer.from(await tts.readModelFile(tts.PHONEMIZER_KEY)), f.addon);
  const rev = 'a'.repeat(40);
  assert.deepEqual(Buffer.from(await tts.readModelFile(`https://huggingface.co/org/kokoro/resolve/${rev}/voices/af_heart.bin`)), f.voice);
  assert.ok(await tts.readModelFile('https://huggingface.co/org/kokoro/resolve/main/onnx/model_quantized.onnx'));
  assert.equal(await tts.readModelFile(`https://huggingface.co/org/kokoro/resolve/${rev}/../../manifest.json`), null);
  assert.equal(await tts.readModelFile(`https://evil.example/org/kokoro/resolve/${rev}/voices/af_heart.bin`), null);
  assert.equal(await tts.readModelFile(`https://huggingface.co/org/other/resolve/${rev}/voices/af_heart.bin`), null);
  // A fresh manager finds the installation again.
  assert.equal((await createTts({ dir, fetchImpl: f.fetchImpl, catalog: f.catalog }).status()).installed, true);
  await tts.remove();
  assert.equal((await tts.status()).installed, false);
  assert.equal(await tts.readModelFile(tts.PHONEMIZER_KEY), null);
});

test('a file that does not match its checksum stops the install and leaves nothing behind', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const f = fixture();
  f.bodies.set(`https://huggingface.co/org/kokoro/resolve/${'a'.repeat(40)}/voices/af_heart.bin`, Buffer.from('tampered'));
  const tts = createTts({ dir, fetchImpl: f.fetchImpl, catalog: f.catalog });
  await assert.rejects(tts.install(), /checksum/);
  assert.equal((await tts.status()).installed, false);
  assert.deepEqual(fs.readdirSync(dir), []);
  // The pronunciation add-on is checked against its npm integrity too.
  const g = fixture();
  g.bodies.set(g.catalog.phonemizer.tarball, tgz({ 'package/dist/phonemizer.js': Buffer.from('changed') }));
  await assert.rejects(createTts({ dir, fetchImpl: g.fetchImpl, catalog: g.catalog }).install(), /checksum/);
});

test('only regular files are read from the npm tarball', () => {
  const pack = tgz({ 'package/a.txt': Buffer.from('A'), 'package/dist/phonemizer.js': Buffer.from('JS') });
  assert.equal(untarFile(pack, 'package/dist/phonemizer.js').toString(), 'JS');
  assert.equal(untarFile(pack, 'package/missing.js'), null);
});

test('the voice model and the GPL pronunciation add-on are never packed into the installer', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const dep of ['phonemizer', 'kokoro-js']) {
    assert.ok(!pkg.dependencies?.[dep] && !pkg.devDependencies?.[dep], `${dep} is not a dependency`);
  }
  const resources = JSON.stringify(pkg.build.extraResources || []);
  assert.ok(!/kokoro|phonemizer|tts/i.test(resources));
});
