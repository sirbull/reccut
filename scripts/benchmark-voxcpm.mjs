// Reproducible CPU benchmark of the real VoxCPM2 adapter (phase 9). Offline: no
// installation, downloads or app settings change. Uses the catalog's settings,
// the locked synthetic references and native/voxcpm/benchmark-texts.json.
// Usage: node scripts/benchmark-voxcpm.mjs [--cpu] [--threads N] [--runs 3] [--warm 5]
//          [--quick] --out <result-dir> <engine> <model-dir>
// Writes report.json and keeps every WAV in <result-dir>. --quick is a short
// smoke run (1 process, 1 warm repetition, no long script) and is not a measurement.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const run = promisify(execFile);
const { createVoxcpmProcess } = require('../src/main/voxcpmProcess');
const { hashFile } = require('../src/main/downloadFile');
const { readWav } = require('../src/main/voxcpm');
const { chunksForSpeech, spokenText } = await import('../src/shared/tts.js');
const catalog = require('../src/main/ttsCatalog.json').voxcpm;
const root = path.resolve(import.meta.dirname, '..');
const texts = JSON.parse(await fs.readFile(path.join(root, 'native/voxcpm/benchmark-texts.json'), 'utf8'));

// ---- arguments
const argv = process.argv.slice(2), opt = { cpu: false, threads: 0, runs: 3, warm: 5, quick: false, out: null };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], num = () => { const n = Number(argv[++i]); if (!Number.isInteger(n) || n < 1 || n > 256) throw new Error(`${a} needs a positive whole number.`); return n; };
  if (a === '--cpu') opt.cpu = true;
  else if (a === '--quick') opt.quick = true;
  else if (a === '--threads') opt.threads = num();
  else if (a === '--runs') opt.runs = num();
  else if (a === '--warm') opt.warm = num();
  else if (a === '--out') opt.out = argv[++i];
  else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
  else positional.push(a);
}
if (opt.quick) { opt.runs = 1; opt.warm = 1; }
const [exe, modelDir] = positional.map((p) => path.resolve(p));
if (!exe || !modelDir || !opt.out) throw new Error('Usage: node scripts/benchmark-voxcpm.mjs [--cpu] [--threads N] [--runs 3] [--warm 5] [--quick] --out <result-dir> <engine> <model-dir>');
const out = path.resolve(opt.out);
await fs.mkdir(out, { recursive: true });
if ((await fs.readdir(out)).length) throw new Error('The result directory must be empty, so earlier results are never mixed in.');
const engineArgs = [...(opt.cpu ? ['--cpu'] : []), ...(opt.threads ? ['--threads', String(opt.threads)] : [])];

// ---- verified inputs
const models = catalog.model.files.map((f) => path.join(modelDir, f.path));
for (const [i, f] of catalog.model.files.entries()) {
  assert.equal((await fs.stat(models[i])).size, f.size, `size of ${f.path}`);
  assert.equal(await hashFile(models[i]), f.sha256, `SHA-256 of ${f.path}`);
}
const voice = (lang, gender) => {
  const v = catalog.languages.find((l) => l.lang === lang).voices.find((x) => x.gender.toLowerCase() === gender);
  return { id: v.id, file: path.join(root, 'native/voxcpm/voices', v.reference.path), spec: v.reference };
};
const voices = { enF: voice('en-us', 'female'), enM: voice('en-us', 'male'), nbF: voice('nb', 'female'), nbM: voice('nb', 'male') };
for (const v of Object.values(voices)) assert.equal(await hashFile(v.file), v.spec.sha256, `reference ${v.id}`);
const mood = (id) => catalog.moods.find((m) => m.id === id);

// ---- environment
async function tryRun(cmd, args) { try { return (await run(cmd, args, { windowsHide: true, timeout: 15000 })).stdout.trim(); } catch { return null; } }
async function environment() {
  const env = { platform: process.platform, arch: process.arch, osRelease: os.release(), osVersion: os.version?.(), cpu: os.cpus()[0]?.model?.trim(),
    logicalCpus: os.cpus().length, availableParallelism: os.availableParallelism?.(), totalMemoryBytes: os.totalmem(), node: process.version };
  env.reccutCommit = await tryRun('git', ['-C', root, 'rev-parse', 'HEAD']);
  env.reccutDirty = Boolean(await tryRun('git', ['-C', root, 'status', '--porcelain']));
  if (process.platform === 'win32') {
    env.powerScheme = await tryRun('powercfg', ['/getactivescheme']);
    env.physicalCores = Number(await tryRun('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object NumberOfCores -Sum).Sum'])) || null;
  }
  if (process.platform === 'linux') {
    const version = await fs.readFile('/proc/version', 'utf8').catch(() => '');
    env.wsl = /microsoft/i.test(version);
    env.distribution = (await fs.readFile('/etc/os-release', 'utf8').catch(() => '')).match(/^PRETTY_NAME="?([^"\n]*)/m)?.[1] || null;
    env.cgroupMemoryMax = (await fs.readFile('/sys/fs/cgroup/memory.max', 'utf8').catch(() => '')).trim() || null;
    env.cgroupCpuMax = (await fs.readFile('/sys/fs/cgroup/cpu.max', 'utf8').catch(() => '')).trim() || null;
  }
  return env;
}

// ---- engine memory (the child process, never this script)
async function memory(pid) {
  if (!pid) return null;
  if (process.platform === 'linux') {
    const s = await fs.readFile(`/proc/${pid}/status`, 'utf8').catch(() => '');
    const kb = (k) => Number(s.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1]) * 1024 || null;
    return { rss: kb('VmRSS'), peakRss: kb('VmHWM') };
  }
  if (process.platform === 'win32') {
    // Peak values are kept by Windows, so one query after the work is exact.
    const line = await tryRun('powershell', ['-NoProfile', '-Command', `$p = Get-Process -Id ${Number(pid)}; "$($p.WorkingSet64) $($p.PeakWorkingSet64) $($p.PrivateMemorySize64) $($p.PeakPagedMemorySize64)"`]);
    const [rss, peakRss, privateBytes, peakPrivateBytes] = (line || '').split(' ').map(Number);
    return line ? { rss, peakRss, privateBytes, peakPrivateBytes } : null;
  }
  const kb = Number(await tryRun('ps', ['-o', 'rss=', '-p', String(pid)]));
  return kb ? { rss: kb * 1024, peakRss: null } : null;
}

// ---- jobs
let child = null, launches = 0, seq = 0;
const client = createVoxcpmProcess({ spawnImpl: (...args) => { launches++; child = spawn(...args); return child; } });
const config = { exe, models, args: engineArgs, sha256: await hashFile(exe), cwd: out };
const base = { cfg: catalog.settings.cfg, steps: catalog.settings.steps, timesteps: catalog.settings.timesteps, temperature: catalog.settings.temperature, seed: catalog.settings.seed ?? 42 };
const jobs = [];
async function job(name, text, ref, moodId = 'neutral', extra = {}) {
  const output = path.join(out, `${String(++seq).padStart(3, '0')}-${name}.wav`);
  const started = performance.now(), launchesBefore = launches;
  let loadingAt = null, readyAt = null;
  await client.run(config, { ...base, reference: ref.file, output, text: `(${mood(moodId).prompt} ${catalog.settings.suffix})${text}` }, {
    onLoading: () => { loadingAt = performance.now(); }, onReady: () => { readyAt = performance.now(); }, ...extra,
  });
  const ended = performance.now();
  const wav = await fs.readFile(output), audio = readWav(wav);
  assert.equal(audio.rate, 48000);
  let peak = 0;
  for (const x of audio.samples) peak = Math.max(peak, Math.abs(x));
  assert.ok(peak > 0.01, `${name} is silent`);
  const newProcess = launches > launchesBefore, audioSeconds = audio.samples.length / audio.rate;
  const generateSeconds = (ended - (readyAt ?? started)) / 1000;
  const row = { name, voice: ref.id, mood: moodId, characters: text.length, newProcess, launch: launches,
    startupSeconds: newProcess ? (readyAt - loadingAt) / 1000 : 0, totalSeconds: (ended - started) / 1000, generateSeconds,
    audioSeconds, rtf: generateSeconds / audioSeconds, pcmSha256: crypto.createHash('sha256').update(wav.subarray(44)).digest('hex'),
    memory: await memory(child?.pid) };
  jobs.push(row); console.log(JSON.stringify(row));
  return row;
}

// ---- summaries
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : null; };
const stats = (xs) => ({ n: xs.length, median: quantile(xs, 0.5), p95: quantile(xs, 0.95), min: Math.min(...xs), max: Math.max(...xs) });

const report = { schema: 1, kind: opt.quick ? 'smoke (not a measurement)' : 'measurement', startedAt: new Date().toISOString(), options: opt, engineArgs,
  environment: await environment(), inputs: { engine: path.basename(exe), engineSha256: config.sha256, engineRevision: catalog.engine.revision,
    modelRevision: catalog.model.revision, models: catalog.model.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
    references: Object.values(voices).map((v) => ({ id: v.id, sha256: v.spec.sha256 })), textsVersion: texts.version, settings: catalog.settings },
  notes: ['Every new process is a new process, not a cold disk cache: the OS file cache is not flushed.',
    'Startup is spawn to ready. First audio is spawn to the first finished WAV; the adapter does not stream audio.',
    'RTF is generation time divided by audio length, without startup. RTF 3 means 12 s of work for 4 s of audio.'] };
const t0 = performance.now();
try {
  const cases = [['short-en', texts.texts['en-us'].short, voices.enF], ['short-nb', texts.texts.nb.short, voices.nbF],
    ['medium-en', texts.texts['en-us'].medium, voices.enF], ['medium-nb', texts.texts.nb.medium, voices.nbF]];
  for (let p = 1; p <= opt.runs; p++) {
    await client.stop();
    await job(`p${p}-first-short-en`, texts.texts['en-us'].short, voices.enF);
    for (let r = 1; r <= opt.warm; r++) for (const [name, text, ref] of cases) await job(`p${p}-warm${r}-${name}`, text, ref);
    if (p === 1) {
      // Switch language, reference and expression in one process, then back.
      const before = await job('switch-start', texts.texts['en-us'].short, voices.enF);
      for (const [m, ref, lang] of [['warm', voices.enM, 'en-us'], ['sensual', voices.nbF, 'nb'], ['neutral', voices.nbM, 'nb']]) await job(`switch-${lang}-${m}`, texts.texts[lang].short, ref, m);
      const back = await job('switch-back', texts.texts['en-us'].short, voices.enF);
      report.switchBackIdentical = before.pcmSha256 === back.pcmSha256;
      assert.ok(report.switchBackIdentical, 'a changed voice, language or mood leaked into the next sentence');
      for (const m of catalog.moods) await job(`mood-${m.id}`, texts.texts['en-us'].short, voices.enF, m.id);
    }
    const last = jobs.at(-1);
    report[`process${p}PeakMemory`] = last.memory;
  }
  // Warm repeats must be identical on one machine. The first job of a process
  // may differ by a sample or two (see test-voxcpm-process.mjs), so it is only recorded.
  const warmShort = jobs.filter((j) => /-warm\d+-short-en$/.test(j.name) || j.name === 'switch-start' || j.name === 'switch-back');
  assert.equal(new Set(warmShort.map((j) => j.pcmSha256)).size, 1, 'the same warm sentence must give the same PCM on this machine');
  report.repeatIdentical = true;
  report.firstJobMatchesWarm = jobs.filter((j) => j.name.endsWith('first-short-en')).map((j) => j.pcmSha256 === warmShort[0].pcmSha256);

  if (!opt.quick) {
    report.longScripts = [];
    for (const [lang, ref] of [['nb', voices.nbF], ['en-us', voices.enF]]) {
      const spoken = spokenText(texts.texts[lang].long), chunks = chunksForSpeech(spoken);
      assert.equal(chunks.join(' ').replace(/\s+/g, ' '), spoken, 'the sentence split must keep the whole text');
      const startedAt = performance.now(), rows = [];
      for (const [i, c] of chunks.entries()) rows.push(await job(`long-${lang}-${String(i + 1).padStart(2, '0')}`, c, ref));
      const audioSeconds = rows.reduce((n, r) => n + r.audioSeconds, 0), totalSeconds = (performance.now() - startedAt) / 1000;
      report.longScripts.push({ lang, sentences: chunks.length, characters: spoken.length, completeText: true, totalSeconds, audioSeconds, rtf: totalSeconds / audioSeconds });
    }
  }

  // Cancellation while loading and while generating. Time is abort to the
  // child having closed (run() rejects only after close); then the WAV folder must be removable.
  report.cancel = [];
  for (const phase of ['loading', 'generating']) {
    await client.stop();
    const ctrl = new AbortController(), work = await fs.mkdtemp(path.join(out, `cancel-${phase}-`));
    let abortedAt = 0, timer;
    const arm = () => { timer = setTimeout(() => { abortedAt = performance.now(); ctrl.abort(); }, phase === 'loading' ? 2000 : 1500); };
    const pending = client.run(config, { ...base, reference: voices.nbF.file, output: path.join(work, 'canceled.wav'), text: `(${mood('neutral').prompt} ${catalog.settings.suffix})${spokenText(texts.texts.nb.long)}` },
      { signal: ctrl.signal, ...(phase === 'loading' ? { onLoading: arm } : { onReady: arm }) });
    const outcome = await pending.then(() => 'finished', (error) => error);
    clearTimeout(timer);
    if (outcome === 'finished') throw new Error(`The ${phase} phase finished before the cancellation fired.`);
    assert.equal(outcome?.name, 'AbortError');
    const closedSeconds = (performance.now() - abortedAt) / 1000;
    assert.equal(client.running(), false);
    await fs.rm(work, { recursive: true });
    report.cancel.push({ phase, closedSeconds, cleanedUp: true });
    console.log(JSON.stringify(report.cancel.at(-1)));
  }
  await job('after-cancel', texts.texts['en-us'].short, voices.enF);
  report.cleanJobAfterCancel = true;
  await client.stop();

  const warm = jobs.filter((j) => !j.newProcess && /-warm\d+-/.test(j.name));
  const first = jobs.filter((j) => j.newProcess && j.name.endsWith('first-short-en'));
  const peaks = jobs.map((j) => j.memory?.peakRss).filter(Boolean);
  report.summary = {
    startupSeconds: stats(first.map((j) => j.startupSeconds)),
    firstAudioSeconds: stats(first.map((j) => j.totalSeconds)),
    warmRtf: stats(warm.map((j) => j.rtf)),
    warmRtfByCase: Object.fromEntries(['short-en', 'short-nb', 'medium-en', 'medium-nb'].map((c) => [c, stats(warm.filter((j) => j.name.endsWith(c)).map((j) => j.rtf))])),
    peakEngineMemoryBytes: peaks.length ? Math.max(...peaks) : null,
    cancelSeconds: Object.fromEntries(report.cancel.map((c) => [c.phase, c.closedSeconds])),
    jobs: jobs.length, launches,
  };
  // Proposed phase 9 criteria. Working goals, not approved machine requirements.
  const s = report.summary, GiB = 1024 ** 3;
  report.proposedCriteria = {
    warmRtf: { goal: 'median <= 3 and p95 <= 5', pass: s.warmRtf.median <= 3 && s.warmRtf.p95 <= 5 },
    startup: { goal: 'ready <= 60 s and first short WAV <= 90 s', pass: s.startupSeconds.max <= 60 && s.firstAudioSeconds.max <= 90 },
    memory: { goal: 'engine peak <= 8 GiB', pass: s.peakEngineMemoryBytes != null ? s.peakEngineMemoryBytes <= 8 * GiB : null },
    cancel: { goal: 'child closed and cleanup possible within 2 s', pass: report.cancel.every((c) => c.closedSeconds <= 2) },
    stability: { goal: '>= 10 jobs, voice switching and a clean job after cancel', pass: jobs.length >= 10 && report.switchBackIdentical && report.cleanJobAfterCancel },
  };
  report.status = 'completed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error?.message || error);
  process.exitCode = 1;
} finally {
  await client.stop();
  report.jobs = jobs;
  report.wallSeconds = (performance.now() - t0) / 1000;
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status === 'completed' ? 'DONE' : 'FAILED: ' + report.error}. Report and audio: ${out}`);
}
