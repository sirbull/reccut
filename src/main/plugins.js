// Tillegg (plugins): eksterne programmer som behandler et klipp, for eksempel en AI-keyer som
// CorridorKey. Et tillegg er en mappe med plugin.json som beskriver programmet som skal kjøres,
// hvilket format det vil ha inn, hva det gir ut, og valgene brukeren kan gjøre.
//
// Reccut lager inndata fra klippet (video eller bildesekvens), kjører programmet, og pakker
// resultatet som en video med gjennomsiktighet (ProRes 4444) som erstatter klippet.
// Tillegg kjører programmer på maskinen, så de installeres bare fra mapper brukeren selv velger.
const { app, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');

const dir = () => path.join(app.getPath('userData'), 'plugins');
const settingsFile = () => path.join(app.getPath('userData'), 'plugin-settings.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function validate(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['plugin.json is not valid JSON.'];
  if (!m.name) errors.push('name is missing');
  if (m.type !== 'clip-processor') errors.push('type must be "clip-processor"');
  if (!m.run?.program && !(m.run?.shell && m.run?.command)) errors.push('run.program (or run.shell with run.command) is missing');
  if (!['video', 'png-sequence'].includes(m.input?.format || 'video')) errors.push('input.format must be "video" or "png-sequence"');
  if (!['video', 'png-sequence'].includes(m.output?.format || 'video')) errors.push('output.format must be "video" or "png-sequence"');
  return errors;
}

async function list() {
  await fs.promises.mkdir(dir(), { recursive: true });
  const settings = await readJson(settingsFile(), {});
  const out = [];
  for (const name of await fs.promises.readdir(dir())) {
    const pdir = path.join(dir(), name);
    const manifest = await readJson(path.join(pdir, 'plugin.json'), null);
    if (!manifest) continue;
    out.push({ id: name, dir: pdir, manifest, errors: validate(manifest), settings: settings[name] || {} });
  }
  return out;
}

// Installerer en mappe med plugin.json (kopieres inn i Reccut sin tilleggsmappe).
async function install(srcDir) {
  const manifest = await readJson(path.join(srcDir, 'plugin.json'), null);
  const errors = validate(manifest);
  if (errors.length) throw new Error(`Not a Reccut plugin: ${errors.join(', ')}.`);
  const id = (manifest.id || manifest.name).replace(/[^\w.-]+/g, '-').toLowerCase();
  const target = path.join(dir(), id);
  await fs.promises.rm(target, { recursive: true, force: true });
  await fs.promises.cp(srcDir, target, { recursive: true });
  return id;
}

async function remove(id) {
  await fs.promises.rm(path.join(dir(), id), { recursive: true, force: true });
}

async function saveSettings(id, values) {
  const all = await readJson(settingsFile(), {});
  all[id] = values;
  await fs.promises.writeFile(settingsFile(), JSON.stringify(all, null, 1));
}

// Fyller inn {navn} i argumentene.
function fill(str, vars) {
  return String(str).replace(/\{([\w.:-]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Kjører et tillegg på et utsnitt av en fil. job: { pluginId, source, from, to, fps, params, outDir, name }.
 * Gir stien til resultatet (video med gjennomsiktighet).
 */
async function run(job, ctx) {
  const all = await list();
  const plugin = all.find((p) => p.id === job.pluginId);
  if (!plugin) throw new Error('The plugin is not installed.');
  if (plugin.errors.length) throw new Error(plugin.errors.join(', '));
  const m = plugin.manifest;
  const work = path.join(app.getPath('temp'), 'reccut-plugin', `${plugin.id}-${Date.now()}`);
  const inDir = path.join(work, 'input');
  const outDir = path.join(work, 'output');
  await fs.promises.mkdir(inDir, { recursive: true });
  await fs.promises.mkdir(outDir, { recursive: true });
  const dur = Math.max(0.04, job.to - job.from);
  const fps = job.fps || 30;

  // 1. Inndata fra klippet.
  ctx.progress(0.01, 'Preparing frames');
  const inFormat = m.input?.format || 'video';
  let input;
  if (inFormat === 'png-sequence') {
    input = path.join(inDir, 'frame_%05d.png');
    await ff.run(['-ss', String(job.from), '-t', String(dur), '-i', job.source, '-map', '0:v:0', '-an', '-vf', `fps=${fps}`, input], { onProgress: (t) => ctx.progress(0.01 + 0.14 * Math.min(1, t / dur)) }).promise;
  } else {
    const ext = m.input?.extension || 'mov';
    input = path.join(inDir, `input.${ext}`);
    const codec = ext === 'mp4' ? ['-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p'] : ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'];
    await ff.run(['-ss', String(job.from), '-t', String(dur), '-i', job.source, '-map', '0:v:0', '-an', '-r', String(fps), ...codec, input], { onProgress: (t) => ctx.progress(0.01 + 0.14 * Math.min(1, t / dur)) }).promise;
  }

  // 2. Programmet.
  const outFormat = m.output?.format || 'video';
  const output = outFormat === 'video' ? path.join(outDir, `output.${m.output?.extension || 'mov'}`) : outDir;
  const vars = {
    input,
    inputDir: inDir,
    output,
    outputDir: outDir,
    pluginDir: plugin.dir,
    fps,
    ffmpeg: ff.getFfmpegPath(),
    ...Object.fromEntries((m.settings || []).map((s) => [s.id, plugin.settings[s.id] ?? s.default ?? ''])),
    ...Object.fromEntries((m.params || []).map((p) => [p.id, job.params?.[p.id] ?? p.default ?? ''])),
  };
  // Enten et program med argumenter, eller en hel kommandolinje (for Python-verktøy og lignende).
  const shellMode = Boolean(m.run.shell);
  const program = shellMode ? fill(fill(m.run.command, vars), vars) : fill(m.run.program, vars);
  const args = shellMode ? [] : (m.run.args || []).map((a) => fill(a, vars));
  ctx.progress(0.15, `Running ${m.name}`);
  const log = [];
  await new Promise((resolve, reject) => {
    const proc = spawn(program, args, { shell: shellMode, cwd: fill(m.run.cwd || '{pluginDir}', vars), windowsHide: true, env: { ...process.env, ...(m.run.env || {}) } });
    ctx.setCancel?.(() => proc.kill('SIGKILL'));
    const onData = (d) => {
      const s = d.toString();
      log.push(s);
      if (log.length > 200) log.shift();
      // Tillegget kan melde fremdrift med linjer som "PROGRESS 0.42".
      const mm = /PROGRESS\s+([\d.]+)/.exec(s);
      if (mm) ctx.progress(0.15 + 0.7 * Math.min(1, Number(mm[1])), `Running ${m.name}`);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => reject(new Error(`Could not start ${program}: ${err.message}. Check the plugin settings.`)));
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${m.name} stopped with code ${code}: ${log.join('').split('\n').filter(Boolean).slice(-4).join(' ')}`))));
  });

  // 3. Resultatet som video med gjennomsiktighet.
  ctx.progress(0.86, 'Importing the result');
  await fs.promises.mkdir(job.outDir, { recursive: true });
  const result = path.join(job.outDir, `${job.name} (${m.name}) ${Date.now().toString(36)}.mov`);
  if (outFormat === 'png-sequence') {
    const pattern = m.output?.pattern || 'frame_%05d.png';
    const files = (await fs.promises.readdir(outDir)).filter((f) => f.endsWith('.png'));
    if (!files.length) throw new Error(`${m.name} did not write any images.`);
    await ff.run(['-framerate', String(fps), '-i', path.join(outDir, pattern), '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', result]).promise;
  } else {
    if (!fs.existsSync(output)) throw new Error(`${m.name} did not write ${path.basename(output)}.`);
    await ff.run(['-i', output, '-map', '0:v:0', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', result]).promise;
  }
  fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  ctx.progress(1, 'Done');
  return result;
}

// Tillegg som følger med Reccut (eksempler og maler), klare til å installeres.
async function bundled() {
  const base = path.join(__dirname, '..', '..', 'build', 'plugins');
  const out = [];
  if (!fs.existsSync(base)) return out;
  for (const name of await fs.promises.readdir(base)) {
    const manifest = await readJson(path.join(base, name, 'plugin.json'), null);
    if (manifest) out.push({ id: name, dir: path.join(base, name), manifest });
  }
  return out;
}

function openFolder() {
  fs.mkdirSync(dir(), { recursive: true });
  return shell.openPath(dir());
}

module.exports = { list, install, remove, saveSettings, run, openFolder, validate, bundled };
