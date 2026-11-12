import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { VOICES, LANGUAGES, chunksForSpeech, defaultVoiceFor, detectLanguage, fixPhonemesFor, languageById, nearestSounds, normalizeEnglish, spokenText, splitPunctuation, voiceLabel, voiceLanguage, voicesFor } from '../src/shared/tts.js';

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
  assert.equal(fixPhonemesFor('nˈaɪnti r', 'en-us'), 'nˈaɪndi ɹ');
  assert.equal(fixPhonemesFor('nˈaɪnti r', 'en-gb'), 'nˈaɪnti ɹ');
  assert.equal(fixPhonemesFor(' rosa ', 'it'), 'rosa');
});

test('every voice has a language and an installed voice file in the pinned catalog', () => {
  const files = new Set(CATALOG.model.files.map((f) => f.path));
  for (const v of VOICES) {
    assert.ok(voiceLanguage(v.id).voices === v.id[0], v.id);
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
  const model = Buffer.from('onnx'), voice = Buffer.from(new Float32Array(512).buffer), addon = Buffer.from('export default async () => ({});'), data = Buffer.from('espeak data');
  const pack = tgz({ 'package/espeak-ng.js': addon, 'package/espeak-ng.data': data, 'package/COPYING': Buffer.from('x') });
  const catalog = {
    model: { repository: 'org/kokoro', revision: 'a'.repeat(40), files: [{ path: 'onnx/model_quantized.onnx', size: model.length, sha256: sha256(model) }, { path: 'voices/af_heart.bin', size: voice.length, sha256: sha256(voice) }] },
    phonemizer: { name: '@echogarden/espeak-ng-emscripten', version: '0.3.5', tarball: 'https://registry.npmjs.org/@echogarden/espeak-ng-emscripten/-/espeak-ng-emscripten-0.3.5.tgz', integrity: sri(pack), size: pack.length, entry: 'package/espeak-ng.js', data: 'package/espeak-ng.data', license: 'GPL inside' },
  };
  const bodies = new Map([[catalog.phonemizer.tarball, pack], [`https://huggingface.co/org/kokoro/resolve/${'a'.repeat(40)}/onnx/model_quantized.onnx`, model], [`https://huggingface.co/org/kokoro/resolve/${'a'.repeat(40)}/voices/af_heart.bin`, voice]]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const b = bodies.get(url);
    return { ok: Boolean(b), status: b ? 200 : 404, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  };
  return { catalog, bodies, fetchImpl, calls, addon, data, voice };
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
  assert.deepEqual(Buffer.from(await tts.readModelFile(tts.ESPEAK_DATA_KEY)), f.data);
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
  // Ingen halv modell. Uttaletillegget er kontrollert for seg og deles med Piper, så det kan bli liggende.
  assert.deepEqual(fs.readdirSync(dir).filter((x) => !['addon.json', 'espeak-ng.js', 'espeak-ng.data'].includes(x)), []);
  // The pronunciation add-on is checked against its npm integrity too.
  const g = fixture();
  g.bodies.set(g.catalog.phonemizer.tarball, tgz({ 'package/espeak-ng.js': Buffer.from('changed') }));
  await assert.rejects(createTts({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'tts-')), fetchImpl: g.fetchImpl, catalog: g.catalog }).install(), /checksum/);
});

test('only regular files are read from the npm tarball', () => {
  const pack = tgz({ 'package/a.txt': Buffer.from('A'), 'package/dist/phonemizer.js': Buffer.from('JS') });
  assert.equal(untarFile(pack, 'package/dist/phonemizer.js').toString(), 'JS');
  assert.equal(untarFile(pack, 'package/missing.js'), null);
});

test('the voice model and the GPL pronunciation add-on are never packed into the installer', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const dep of ['phonemizer', 'kokoro-js', '@echogarden/espeak-ng-emscripten']) {
    assert.ok(!pkg.dependencies?.[dep] && !pkg.devDependencies?.[dep], `${dep} is not a dependency`);
  }
  const resources = JSON.stringify(pkg.build.extraResources || []);
  assert.ok(!/kokoro|phonemizer|espeak|tts/i.test(resources));
});

test('VoxCPM2 models, references, moods and engine source are pinned independently of the installer', () => {
  const c = CATALOG.voxcpm;
  assert.ok(['Apache-2.0', 'MIT'].includes(c.license));
  assert.ok(['Apache-2.0', 'MIT'].includes(c.model.license));
  assert.match(c.model.revision, /^[0-9a-f]{40}$/);
  assert.match(c.engine.revision, /^[0-9a-f]{40}$/);
  assert.equal(c.engine.license, 'MIT');
  assert.equal(c.engine.protocol, require('../src/main/voxcpmProcess.js').PROTOCOL);
  for (const f of c.model.files) {
    assert.match(f.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(f.size) && f.size > 0);
  }
  assert.deepEqual(c.moods.map((m) => m.id), ['neutral', 'intense', 'angry', 'sad', 'warm', 'sensual', 'cheerful', 'confident', 'reassuring', 'whispering']);
  assert.equal(new Set(c.moods.map((m) => m.id)).size, c.moods.length);
  for (const mood of c.moods) {
    assert.ok(mood.label && mood.prompt);
    assert.ok(!/\b(trailer|movie|hall|stage)\b/i.test(mood.prompt + ' ' + c.settings.suffix));
  }
  assert.equal(c.settings.cfg, 3.5);
  assert.equal(c.settings.suffix, 'Dry, close-mic studio recording with no reverb.');
  for (const l of c.languages) {
    if (l.source !== 'release') {
      assert.match(l.revision, /^[0-9a-f]{40}$/);
      assert.ok(l.repository);
    }
    assert.ok(l.lang && l.voices.length);
    for (const v of l.voices) {
      assert.ok(v.id && v.name && v.reference.path && v.reference.size > 0);
      assert.match(v.reference.sha256, /^[0-9a-f]{64}$/);
      assert.match(v.id, /^[a-z0-9-]+$/);
      if (l.source === 'release') {
        assert.match(v.reference.path, /^reccut-voxcpm-[a-z0-9-]+\.wav$/);
        const reference = fs.readFileSync(new URL(`../native/voxcpm/voices/${v.reference.path}`, import.meta.url));
        assert.equal(reference.length, v.reference.size);
        assert.equal(crypto.createHash('sha256').update(reference).digest('hex'), v.reference.sha256);
      }
      for (const mood of c.moods) {
        const sample = new URL(`../assets/voice-samples/voxcpm/${v.id}-${mood.id}.ogg`, import.meta.url);
        assert.ok(fs.statSync(sample).size > 0, `${v.id}/${mood.id} has a bundled preview before the model can be offered`);
      }
    }
  }
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(!/\.gguf|reccut-voxcpm-(mac|win|linux)/i.test(JSON.stringify([pkg.build.files, pkg.build.extraResources])));
  assert.ok(!/voxcpm/i.test(JSON.stringify([pkg.dependencies, pkg.devDependencies, pkg.scripts.postinstall, pkg.scripts.dist])));
  assert.ok(pkg.build.files.includes('src/shared/tts.js'), 'the native engine can import the same sentence splitter in a packaged app');
  const ci = fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  assert.ok(ci.includes(`ref: ${c.engine.revision}`));
  assert.ok(ci.includes('voxcpm-artifacts/reccut-voxcpm-*'));
  assert.ok(ci.includes('scripts/prepare-voxcpm-voices.mjs'));
});

test('the language is chosen separately, suggested from the script, and Norwegian sounds the model lacks are mapped', () => {
  assert.equal(detectLanguage('Velkommen til fremtidens redigering. Det er ikke vanskelig, og du kan gjøre det selv.'), 'nb');
  assert.equal(detectLanguage('Welcome to the future of editing. It is not hard, and you can do it.'), 'en-us');
  assert.equal(detectLanguage('Välkommen till framtidens redigering. Det är inte svårt och du kan göra det själv.'), 'sv');
  assert.equal(detectLanguage('Willkommen in der Zukunft. Das ist nicht schwer und wir können es.'), 'de');
  assert.equal(detectLanguage('Hi'), null);
  // ʉ (hus), ɭ and ʏ are not in the Kokoro vocabulary; the nearest sounds are used. ç stays.
  assert.equal(nearestSounds('hʉːs ɭ ʏ ç'), 'hyːs l y ç');
  assert.equal(fixPhonemesFor('hʉːs', 'nb'), 'hyːs');
  // Languages with their own voices list them first, the rest only have voices with an accent.
  assert.ok(voicesFor('fr').own.every((v) => v.id.startsWith('f')));
  assert.equal(voicesFor('nb').own.length, 0);
  assert.equal(voicesFor('nb').other.length, VOICES.length);
  assert.equal(defaultVoiceFor('en-gb'), 'bf_emma');
  assert.equal(defaultVoiceFor('nb'), languageById('nb').near);
  assert.ok(LANGUAGES.every((l) => l.espeak && l.label));
});

test('voices can be blended, and every style uses real voices and valid effects', async () => {
  const { parseVoice, blendVectors, isBlend } = await import('../src/shared/tts.js');
  const { VOICE_STYLES, filterStyles, styleEffects, TONES, CHARACTERS } = await import('../src/shared/voiceStyles.js');
  const { AUDIO_EFFECTS } = await import('../src/shared/audiofx.js');
  assert.deepEqual(parseVoice('bm_lewis:3,am_fenrir:1'), [{ id: 'bm_lewis', weight: 0.75 }, { id: 'am_fenrir', weight: 0.25 }]);
  assert.equal(parseVoice('nobody:1'), null);
  assert.equal(parseVoice('bm_lewis:-1'), null);
  assert.equal(isBlend('af_heart'), false);
  assert.deepEqual(Array.from(blendVectors([new Float32Array([1, 0]), new Float32Array([0, 1])], [0.75, 0.25])), [0.75, 0.25]);
  for (const st of VOICE_STYLES) {
    assert.ok(parseVoice(st.voice), `${st.id} voice`);
    assert.ok(TONES.some((t) => t.value === st.tone) && CHARACTERS.some((c) => c.value === st.character), st.id);
    assert.ok(st.speed >= 0.5 && st.speed <= 1.5, st.id);
    assert.ok(styleEffects(st).every((e) => AUDIO_EFFECTS[e.type]), `${st.id} effects`);
  }
  // Both dark and bright, cinematic and ordinary, female and male.
  for (const tone of ['dark', 'bright']) for (const gender of ['Female', 'Male']) assert.ok(filterStyles({ tone, gender }).length, `${tone} ${gender}`);
  assert.ok(filterStyles({ character: 'cinematic' }).length >= 3);
  assert.ok(filterStyles({ character: 'natural' }).length >= 3);
});

test('Piper voices cover the languages Kokoro lacks, with open licences, pinned files and eSpeak pronunciation', () => {
  const piper = CATALOG.piper;
  assert.match(piper.revision, /^[0-9a-f]{40}$/);
  const allowed = new Set(['CC0', 'CC-BY-4.0', 'Apache-2.0', 'MIT']);
  for (const v of piper.voices) {
    assert.ok(allowed.has(v.license), `${v.id} licence ${v.license}`);
    assert.ok(languageById(v.lang), `${v.id} language`);
    assert.ok(v.espeak, `${v.id} eSpeak voice`);
    assert.equal(v.files.length, 2);
    assert.ok(v.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.size > 0 && !f.path.includes('..')));
    assert.equal(v.sizeBytes, v.files.reduce((s, f) => s + f.size, 0));
  }
  for (const lang of ['nb', 'sv', 'da', 'de', 'nl', 'fi', 'pl', 'es', 'fr', 'it', 'pt']) assert.ok(piper.voices.some((v) => v.lang === lang), `a voice for ${lang}`);
  assert.ok(!piper.voices.some((v) => /AGPL|GPL|NC/i.test(v.license)), 'no copyleft or non-commercial voices');
});

test('Piper ids follow Piper: start, a pause after every sound, end, and unknown sounds are skipped', async () => {
  const { piperIds } = await import('../src/shared/tts.js');
  const map = { '^': [1], $: [2], _: [0], h: [10], 'ˈ': [11], a: [12], ç: [13] };
  assert.deepEqual(piperIds('hˈaç?', map), [1, 0, 10, 0, 11, 0, 12, 0, 13, 0, 2]);
});

test('a Piper voice downloads with the shared pronunciation add-on, and is served only once installed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const f = fixture();
  const onnx = Buffer.from('piper-onnx'), cfg = Buffer.from('{"espeak":{"voice":"nb"}}');
  const rev = 'b'.repeat(40);
  f.catalog.piper = { repository: 'rhasspy/piper-voices', revision: rev, voices: [{ id: 'no_NO-test-medium', lang: 'nb', name: 'Test', license: 'CC0', espeak: 'nb', speakers: [], sizeBytes: onnx.length + cfg.length, files: [{ path: 'no/no_NO/test/medium/no_NO-test-medium.onnx', size: onnx.length, sha256: sha256(onnx) }, { path: 'no/no_NO/test/medium/no_NO-test-medium.onnx.json', size: cfg.length, sha256: sha256(cfg) }] }] };
  const base = `https://huggingface.co/rhasspy/piper-voices/resolve/${rev}/no/no_NO/test/medium/`;
  f.bodies.set(base + 'no_NO-test-medium.onnx', onnx);
  f.bodies.set(base + 'no_NO-test-medium.onnx.json', cfg);
  const tts = createTts({ dir, fetchImpl: f.fetchImpl, catalog: f.catalog });
  assert.equal(await tts.readModelFile(base + 'no_NO-test-medium.onnx'), null);
  await tts.installPiper('no_NO-test-medium');
  const s = await tts.status();
  assert.equal(s.piper['no_NO-test-medium'].installed, true);
  assert.equal(s.addon, true, 'the pronunciation add-on came along');
  assert.equal(s.installed, false, 'Kokoro is not needed');
  assert.deepEqual(Buffer.from(await tts.readModelFile(base + 'no_NO-test-medium.onnx')), onnx);
  assert.ok(await tts.readModelFile(tts.PHONEMIZER_KEY));
  assert.equal(await tts.readModelFile(base + 'other.onnx'), null);
  await tts.removePiper('no_NO-test-medium');
  assert.equal((await tts.status()).piper['no_NO-test-medium'].installed, false);
});
