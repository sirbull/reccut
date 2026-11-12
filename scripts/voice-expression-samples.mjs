// Offline candidate preparation, never a catalog approval or download.
// Usage: node scripts/voice-expression-samples.mjs <design-cli> <engine> <model-dir> [output-dir] [--all-expressions]
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVoxcpmProcess, verifyVoxcpmProtocol } = require('../src/main/voxcpmProcess');
const { hashFile } = require('../src/main/downloadFile');
const { readWav } = require('../src/main/voxcpm');
const catalog = require('../src/main/ttsCatalog.json').voxcpm;
const root = path.resolve(import.meta.dirname, '..');
const [designCli, exe, modelDir] = process.argv.slice(2, 5).map((p) => path.resolve(p));
if (!designCli || !exe || !modelDir) throw new Error('Supply a voice-design CLI, persistent engine and existing model directory. Nothing is downloaded.');
const out = path.resolve(process.argv[5] && !process.argv[5].startsWith('--') ? process.argv[5] : path.join(root, 'vendor/voice-tests/expressions'));
const run = promisify(execFile);
const ffmpeg = path.join(root, 'vendor/ffmpeg', `${process.platform === 'darwin' ? 'mac' : process.platform}-${process.arch}`, 'ffmpeg');
const newMoods = ['warm', 'sensual', 'cheerful', 'confident', 'reassuring', 'whispering'];
const languages = [
  { lang: 'en-us', label: 'Engelsk (USA)', accent: 'native American English', referenceText: "It's a pleasure to meet you. Thank you for joining me here today.", text: "Let's take a moment. We can find the right way forward together.", moods: catalog.moods.map((m) => m.id) },
  { lang: 'nb', label: 'Norsk', accent: 'native Norwegian Bokmål, Oslo dialect', text: 'Ta en liten pause. Vi finner en god vei videre sammen.', moods: newMoods },
  { lang: 'sv', label: 'Svensk', accent: 'native standard Swedish', referenceText: 'Vad trevligt att träffa dig här i dag, jag hoppas att du mår bra.', text: 'Ta en liten paus. Vi hittar en bra väg framåt tillsammans.', moods: ['neutral', 'warm', 'sensual'] },
  { lang: 'da', label: 'Dansk', accent: 'native standard Danish', referenceText: 'Det er dejligt at møde dig her i dag, jeg håber at du har det godt.', text: 'Tag en lille pause. Vi finder en god vej videre sammen.', moods: ['neutral', 'warm', 'sensual'] },
  { lang: 'de', label: 'Tysk', accent: 'native standard German', referenceText: 'Es freut mich, dich heute hier zu treffen, und ich hoffe, es geht dir gut.', text: 'Nehmen wir uns einen Moment Zeit. Gemeinsam finden wir einen guten Weg.', moods: ['neutral', 'warm', 'sensual'] },
];
if (process.argv.includes('--all-expressions')) for (const l of languages) l.moods = catalog.moods.map((m) => m.id);
await fs.mkdir(out, { recursive: true });
await verifyVoxcpmProtocol(exe);
const models = catalog.model.files.map((f) => path.join(modelDir, f.path));
for (const [i, file] of catalog.model.files.entries()) {
  if ((await fs.stat(models[i])).size !== file.size || await hashFile(models[i]) !== file.sha256) throw new Error(`Incorrect local model: ${file.path}`);
}
const reportPath = path.join(out, 'review.json');
const previous = await fs.readFile(reportPath, 'utf8').then(JSON.parse).catch(() => null);
const report = { reviewed: previous?.reviewed || false, acceptance: previous?.acceptance || null, source: 'Entirely synthetic voices; no real-person references.',
  engineRevision: catalog.engine.revision, engineSha256: await hashFile(exe), modelRevision: catalog.model.revision,
  settings: catalog.settings, moods: catalog.moods, languages, references: [], results: [] };
const config = { exe, models, sha256: report.engineSha256, cwd: out };
const client = createVoxcpmProcess();
const escaped = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function audioInfo(file) {
  const bytes = await fs.readFile(path.join(out, file)), audio = readWav(bytes);
  return { path: file, size: bytes.length, sha256: await hashFile(path.join(out, file)), duration: audio.samples.length / audio.rate, rate: audio.rate };
}
async function listeningSample(input, output) {
  await run(ffmpeg, ['-y', '-v', 'error', '-i', path.join(out, input), '-af', 'loudnorm=I=-18:TP=-2:LRA=11', '-ac', '1', '-c:a', 'libopus', '-b:a', '48k', path.join(out, output)]);
}
async function save() {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  const sections = languages.map((l) => `<section><h2>${escaped(l.label)}</h2><blockquote>${escaped(l.text)}</blockquote><p>${l.moods.length === catalog.moods.length ? 'Alle ti uttrykk.' : l.lang === 'nb' ? 'De seks nye uttrykkene.' : 'Første demonstrasjon: nøytral, varm og sensuell.'}${l.lang === 'nb' ? ' Uttalefeilen i tidligere «oss»-prøver er fortsatt uavklart.' : ''}</p>${['woman', 'man'].map((voice) => {
    const ref = report.references.find((r) => r.lang === l.lang && r.voice === voice);
    const rows = report.results.filter((r) => r.lang === l.lang && r.voice === voice);
    return `<details ${l.lang === 'en-us' ? 'open' : ''}><summary>${voice === 'woman' ? 'Kvinnestemme' : 'Mannsstemme'} · ${rows.length} prøver</summary>${ref ? `<p>Referanse (${ref.duration.toFixed(2)} s)${ref.duration >= 3 && ref.duration <= 4 ? '' : ' · må vurderes: utenfor målet på 3–4 s'}:</p><audio controls preload="none" src="${ref.sample}"></audio>` : '<p>Referanse lages …</p>'}<div class="samples">${rows.map((r) => `<article><h3>${escaped(catalog.moods.find((m) => m.id === r.mood).label)}</h3><audio controls preload="none" src="${r.sample}"></audio><small>${r.duration.toFixed(2)} sekunder</small></article>`).join('')}</div></details>`;
  }).join('')}</section>`).join('');
  await fs.writeFile(path.join(out, 'index.html'), `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VoxCPM2 · flere språk og uttrykk</title><style>body{font:16px/1.5 system-ui;background:#18191b;color:#eee;max-width:1100px;margin:36px auto;padding:0 24px}h1{font-size:30px}section{margin:40px 0}summary{cursor:pointer;font-weight:650;padding:12px 0}blockquote,article{background:#28292d;padding:16px;border-radius:10px;margin:12px 0}.samples{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}audio{width:100%;max-width:450px}h3{margin:0 0 12px}small{display:block;color:#bbb}</style><h1>Flere språk og uttrykk</h1><p>${report.acceptance ? 'Brukeren har godtatt stemmene som første versjon, med kjente kvalitetsforskjeller. Senere uttrykksprøver er laget uten ny menneskelig kvalitetsgodkjenning.' : 'Syntetiske kandidater, laget lokalt. Ingen av de nye prøvene er godkjent eller publisert i appens stemmekatalog.'}</p><p>Begynn med engelsk: sammenlign Warm og Sensual med Neutral. Prøv deretter de andre uttrykkene. Lytt etter riktig tekst, naturlig uttale, tydelig uttrykk og samme person gjennom prøvene. Sensual er ment som myk, intim og litt luftig tale. Modellen kan tolke uttrykkene forskjellig mellom språk.</p><p>Alle avspillinger har normalisert lyttenivå. Rå WAV-filer og kontrollsummer beholdes i review.json. Setninger er ikke klippet eller reparert. Talegjenkjenning brukes ikke som godkjenning.</p>${sections}</html>`);
}
try {
  // Design fresh references first, before the persistent clone process loads.
  for (const l of languages) for (const voice of ['woman', 'man']) {
    const file = `${l.lang}-${voice}-reference.wav`;
    const designPrompt = `An adult ${voice} speaking ${l.accent}. Clear, calm conversational voice. ${catalog.settings.suffix}`;
    if (l.lang === 'nb') {
      await fs.copyFile(path.join(root, 'vendor/voice-tests/norwegian', `ref-${voice === 'woman' ? 'kvinne' : 'mann'}-kort.wav`), path.join(out, file));
    } else {
      const cached = previous?.references.find((r) => r.lang === l.lang && r.voice === voice && r.text === l.referenceText && r.designPrompt === designPrompt);
      const intact = cached && await hashFile(path.join(out, file)).then((h) => h === cached.sha256).catch(() => false);
      if (!intact) {
        console.log(`Designing ${l.lang}/${voice} reference`);
        await run(designCli, ['-t', `(${designPrompt})${l.referenceText}`, '-o', path.join(out, file), '--cfg', '2', '--steps', '250', '--timesteps', '10', '--temperature', '1', '--seed', voice === 'woman' ? '42' : '73', ...models], { maxBuffer: 16 * 1024 * 1024 });
      }
    }
    const row = { lang: l.lang, voice, ...await audioInfo(file), text: l.referenceText || null, designPrompt: l.lang === 'nb' ? null : designPrompt, seed: l.lang === 'nb' ? null : voice === 'woman' ? 42 : 73, sample: file.replace('.wav', '.ogg') };
    await listeningSample(file, row.sample); report.references.push(row); await save();
    console.log(`${l.lang}/${voice} reference: ${row.duration.toFixed(2)} s`);
  }
  for (const l of languages) for (const voice of ['woman', 'man']) for (const mood of l.moods) {
    const ref = report.references.find((r) => r.lang === l.lang && r.voice === voice);
    const prompt = catalog.moods.find((m) => m.id === mood).prompt;
    const file = `${l.lang}-${voice}-${mood}.wav`, sample = file.replace('.wav', '.ogg');
    const text = `(${prompt} ${catalog.settings.suffix})${l.text}`;
    const cached = previous?.results.find((r) => r.path === file && r.promptedText === text && r.referenceSha256 === ref.sha256 && JSON.stringify(previous.settings) === JSON.stringify(report.settings) && previous.engineSha256 === report.engineSha256);
    const intact = cached && await hashFile(path.join(out, file)).then((h) => h === cached.sha256).catch(() => false);
    const started = performance.now();
    if (!intact) await client.run(config, { ...catalog.settings, seed: 42, reference: path.join(out, ref.path), output: path.join(out, file), text });
    const row = { lang: l.lang, voice, mood, ...await audioInfo(file), sample, text: l.text, promptedText: text, seed: 42, referenceSha256: ref.sha256 };
    await listeningSample(file, sample); report.results.push(row); await save();
    console.log(`${l.lang}/${voice}/${mood}: ${row.duration.toFixed(2)} s audio, ${((performance.now() - started) / 1000).toFixed(1)} s elapsed${intact ? ' (cached)' : ''}`);
  }
} finally { await client.stop(); await save(); }
console.log(`Listening page: ${path.join(out, 'index.html')}`);
