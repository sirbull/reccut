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
  { ...common, entryPoints: [path.join(root, 'src/shared/designTemplates.js')], outfile: path.join(out, 'designTemplates.cjs'), format: 'cjs', platform: 'node', target: 'node24' },
  { ...common, entryPoints: [path.join(root, 'src/renderer/help/Handbook.jsx')], outfile: path.join(out, 'help.js'), format: 'esm', platform: 'browser' },
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
  { ...common, entryPoints: [path.join(root, 'src/worker/segment.js')], outfile: path.join(out, 'segment.js'), format: 'esm', platform: 'browser' },
  { ...common, entryPoints: [path.join(root, 'src/worker/transcribe.js')], outfile: path.join(out, 'transcribe.js'), format: 'esm', platform: 'browser' },
];

function copyStatic() {
  for (const f of ['index.html', 'help.html', 'export.html', 'transcribe.html', 'segment.html']) {
    const src = fs.existsSync(path.join(root, 'src/renderer', f)) ? path.join(root, 'src/renderer', f) : path.join(root, 'src/worker', f);
    fs.copyFileSync(src, path.join(out, f));
  }
  fs.copyFileSync(path.join(root, 'src/renderer/help/handbook.css'), path.join(out, 'handbook.css'));
  const licenses=path.join(root,'assets/licenses');
  if(fs.existsSync(licenses))fs.cpSync(licenses,path.join(out,'licenses'),{recursive:true});
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
  // Whisper kjører med onnxruntime-web, som trenger wasm-filene lokalt.
  const ort = path.join(root, 'node_modules/onnxruntime-web/dist');
  const ortOut = path.join(out, 'ort');
  fs.mkdirSync(ortOut, { recursive: true });
  for (const f of fs.readdirSync(ort)) {
    if (/^ort-wasm-simd-threaded(\.(jsep|asyncify|jspi))?\.(wasm|mjs)$/.test(f)) fs.copyFileSync(path.join(ort, f), path.join(ortOut, f));
  }
}

copyStatic();
if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
