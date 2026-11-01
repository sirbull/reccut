// Bygger grensesnittet og arbeidsvinduene til build/ med esbuild.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build');
const watch = process.argv.includes('--watch');
fs.mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  sourcemap: watch ? 'inline' : false,
  minify: !watch && !process.env.NO_MINIFY,
  target: 'chrome130',
  logLevel: 'info',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.svg': 'text' },
};

const builds = [
  { ...common, entryPoints: [path.join(root, 'src/renderer/app.jsx')], outfile: path.join(out, 'app.js'), format: 'esm', platform: 'browser' },
  {
    ...common,
    entryPoints: [path.join(root, 'src/worker/export.js')],
    outfile: path.join(out, 'export.js'),
    format: 'iife',
    platform: 'browser',
    external: ['fs', 'path', 'os', 'child_process', 'electron'],
  },
  // Lydeffektene i avspillingen (AudioWorklet).
  { ...common, entryPoints: [path.join(root, 'src/renderer/audiofx-worklet.js')], outfile: path.join(out, 'audiofx-worklet.js'), format: 'iife', platform: 'browser' },
  { ...common, entryPoints: [path.join(root, 'src/worker/transcribe.js')], outfile: path.join(out, 'transcribe.js'), format: 'esm', platform: 'browser' },
];

function copyStatic() {
  for (const f of ['index.html', 'export.html', 'transcribe.html']) {
    const src = fs.existsSync(path.join(root, 'src/renderer', f)) ? path.join(root, 'src/renderer', f) : path.join(root, 'src/worker', f);
    fs.copyFileSync(src, path.join(out, f));
  }
  // Bilder til hjelpen.
  const help = path.join(root, 'assets/help');
  const helpOut = path.join(out, 'help');
  fs.mkdirSync(helpOut, { recursive: true });
  if (fs.existsSync(help)) for (const f of fs.readdirSync(help)) fs.copyFileSync(path.join(help, f), path.join(helpOut, f));
  // Malpakken for After Effects (lastes ned fra Titles-biblioteket).
  const kit = path.join(root, 'assets/template-kit');
  const kitOut = path.join(out, 'template-kit');
  fs.mkdirSync(kitOut, { recursive: true });
  if (fs.existsSync(kit)) for (const f of fs.readdirSync(kit)) fs.copyFileSync(path.join(kit, f), path.join(kitOut, f));
  // Tillegg som følger med (eksempler og maler).
  const plugins = path.join(root, 'assets/plugins');
  if (fs.existsSync(plugins)) fs.cpSync(plugins, path.join(out, 'plugins'), { recursive: true });
  // Whisper kjører med onnxruntime-web, som trenger wasm-filene lokalt.
  const ort = path.join(root, 'node_modules/onnxruntime-web/dist');
  const ortOut = path.join(out, 'ort');
  fs.mkdirSync(ortOut, { recursive: true });
  for (const f of fs.readdirSync(ort)) {
    if (/^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(f)) fs.copyFileSync(path.join(ort, f), path.join(ortOut, f));
  }
}

copyStatic();
if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
