// Build an offline reader from the installed dependencies' original license texts.
// This is a notice catalogue, not a substitute for corresponding-source delivery.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildLicenses({ root = projectRoot, out = path.join(root, 'build/licenses') } = {}) {
  const read = (file) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (!text.trim()) throw new Error(`Empty license/build input: ${file}`);
    return text;
  };
  const pkg = JSON.parse(read('package.json'));
  const components = [];
  function add(id, name, license, source, description, files, version = '') {
    components.push({ id, name, version, license, source, description,
      texts: files.map((file) => ({ title: file.replace(/^node_modules\//, ''), text: read(file) })) });
  }
  function dependency(id, name, license, source, description, files = ['LICENSE']) {
    const dir = `node_modules/${id}`;
    const installed = JSON.parse(read(`${dir}/package.json`));
    add(id.replace(/[^a-z0-9-]/gi, '-'), name, license, source, description,
      files.map((file) => `${dir}/${file}`), installed.version);
  }
  dependency('electron', 'Electron', 'MIT; Chromium and other components have additional notices', 'https://github.com/electron/electron',
    'Application runtime. Installed distributions also contain LICENSE.electron.txt and LICENSES.chromium.html in their resources.');
  dependency('preact', 'Preact', 'MIT', 'https://github.com/preactjs/preact', 'User interface.');
  dependency('@preact/signals', 'Preact Signals', 'MIT', 'https://github.com/preactjs/signals', 'Reactive interface state.');
  dependency('@preact/signals-core', 'Preact Signals Core', 'MIT', 'https://github.com/preactjs/signals', 'Reactive state primitives.');
  dependency('immer', 'Immer', 'MIT', 'https://github.com/immerjs/immer', 'Project state updates.');
  dependency('lucide-preact', 'Lucide and Feather icons', 'ISC and MIT', 'https://github.com/lucide-icons/lucide', 'Interface icons; the license text includes the Feather attribution.');
  dependency('mediabunny', 'Mediabunny', 'MPL-2.0', 'https://github.com/Vanilagy/mediabunny',
    'Media reading and export. MPL source-code rights apply to the library and changes to its covered files.');
  dependency('@huggingface/transformers', 'Transformers.js', 'Apache-2.0', 'https://github.com/huggingface/transformers.js',
    'Local model inference. Model weights have their own licenses, listed separately.');
  const ortVersion = JSON.parse(read('node_modules/onnxruntime-web/package.json')).version;
  // Supplemental notices must be reviewed together with a runtime upgrade.
  if (read('node_modules/onnxruntime-web/__commit.txt').trim() !== '8d85527a010e294a26b274749f74294b2a32cec5') {
    throw new Error('ONNX Runtime changed: update its supplemental license notices and provenance.');
  }
  const ortCommonVersion = JSON.parse(read('node_modules/onnxruntime-common/package.json')).version;
  add('onnxruntime', 'ONNX Runtime Web and Common', 'MIT and third-party notices', 'https://github.com/microsoft/onnxruntime',
    'Inference runtime, including the bundled WebAssembly files. The upstream notices describe components used by ONNX Runtime; their presence does not mean every component is enabled in this Web build.',
    ['assets/licenses/ONNXRUNTIME-LICENSE.txt', 'assets/licenses/ONNXRUNTIME-ThirdPartyNotices.txt'], `Web ${ortVersion}; Common ${ortCommonVersion}`);
  dependency('pdfjs-dist', 'PDF.js and bundled PDF components', 'Apache-2.0 and additional component licenses', 'https://github.com/mozilla/pdf.js',
    'PDF import, fonts, character maps, color profiles and WebAssembly decoders.',
    ['LICENSE', 'cmaps/LICENSE', 'iccs/LICENSE', 'standard_fonts/LICENSE_FOXIT', 'standard_fonts/LICENSE_LIBERATION',
      'wasm/LICENSE_JBIG2', 'wasm/LICENSE_OPENJPEG', 'wasm/LICENSE_QCMS', 'wasm/LICENSE_PDFJS_JBIG2', 'wasm/LICENSE_PDFJS_OPENJPEG', 'wasm/LICENSE_PDFJS_QCMS']);
  const ffmpegVersion = /const VERSION = '([^']+)'/.exec(read('scripts/fetch-ffmpeg.mjs'))?.[1];
  if (!ffmpegVersion) throw new Error('Cannot determine bundled FFmpeg version.');
  add('ffmpeg', 'FFmpeg', 'GPL-3.0-or-later', 'https://ffmpeg.org',
    'Copyright the FFmpeg developers. A separate command-line program used for import, conversion and export. Binary-specific notices accompany it in the ffmpeg resources directory.',
    ['assets/licenses/GPL-3.0.txt'], ffmpegVersion);
  add('tabler', 'Tabler Icons', 'MIT', 'https://github.com/tabler/tabler-icons', 'Design tool icons.',
    ['src/renderer/design/tool-icons/LICENSE.tabler.txt']);
  add('openmoji', 'OpenMoji', 'CC BY-SA 4.0', 'https://openmoji.org',
    'Color and outline emoji by OpenMoji contributors. Credit the artwork and retain its license; adaptations of the artwork have ShareAlike requirements.',
    ['assets/licenses/OPENMOJI-LICENSE.txt']);
  add('unicode', 'Unicode emoji data', 'Unicode License V3', 'https://www.unicode.org', 'Emoji names and sequences. System-style emoji use fonts installed on the computer.',
    ['assets/licenses/UNICODE-3.0.txt']);
  add('whisper', 'Whisper models', 'MIT', 'https://github.com/openai/whisper',
    'Local speech recognition. Converted models are obtained from onnx-community; the model manager identifies the installed revision.',
    ['assets/licenses/whisper-MIT.txt']);
  add('deepfilternet', 'DeepFilterNet 3 model', 'MIT OR Apache-2.0', 'https://github.com/Rikorose/DeepFilterNet',
    'AI noise removal (Clean Voice). The model is included with the app and runs on the computer.',
    ['assets/licenses/DeepFilterNet-MIT.txt']);
  const { models } = require(path.join(root, 'src/main/designModels.js'));
  for (const model of models) {
    const licenseFile = model.files.find((file) => /^LICENSE(?:\.txt)?$/.test(file.file));
    if (!licenseFile) throw new Error(`Missing license reference for ${model.id}.`);
    // Keep notices available offline, even before optional model weights are fetched.
    const licensePath = `assets/licenses/models/${model.id}/${licenseFile.file}`;
    if (createHash('sha256').update(read(licensePath)).digest('hex') !== licenseFile.sha256) {
      throw new Error(`Model license changed: update ${licensePath} to match the pinned model catalogue.`);
    }
    add(model.id.replaceAll('/', '-'), model.id, model.license, `https://huggingface.co/${model.id}/tree/${model.revision}`,
      'BiRefNet background-removal model weights; model terms are separate from the inference runtime.',
      [licensePath], model.revision);
  }
  // RAW support depends on platform and SDK availability. Do not label its proprietary SDK as open source.
  components.push({ id: 'blackmagic-raw', name: 'Blackmagic RAW (when included)', version: '', license: 'Blackmagic RAW SDK agreement',
    source: 'https://www.blackmagicdesign.com/developer/products/braw/sdk-and-software',
    description: 'Optional native decoder and API libraries. These are proprietary components governed by the Blackmagic RAW SDK agreement, not by the open-source licenses above.', texts: [] });

  fs.mkdirSync(path.join(out, 'texts'), { recursive: true });
  for (const component of components) {
    component.files = component.texts.map(({ title, text }, i) => {
      const file = `texts/${component.id}-${i + 1}.txt`;
      fs.writeFileSync(path.join(out, file), text);
      return { title, file };
    });
  }
  fs.copyFileSync(path.join(root, 'docs/THIRD-PARTY-LICENSES.md'), path.join(out, 'DISTRIBUTION.md'));
  const manifest = { components: components.map(({ texts, ...component }) => component) };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const entries = components.map((c) => `<section id="${escape(c.id)}"><h2>${escape(c.name)}</h2>
<p class="meta">${escape(c.license)}${c.version ? ` · ${escape(c.version)}` : ''}</p>
<p>${escape(c.description)}</p><p><a target="_blank" rel="noreferrer" href="${escape(c.source)}">${c.id === 'blackmagic-raw' ? 'SDK and terms' : 'Project and upstream source'}</a></p>
${c.texts.map((t) => `<details><summary>${escape(t.title)}</summary><pre>${escape(t.text)}</pre></details>`).join('\n')}</section>`).join('\n');
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Reccut — Third-party licenses</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#1c1c1e;color:#e8e8ea;font:14px/1.6 -apple-system,system-ui,"Segoe UI",sans-serif}
main{max-width:900px;margin:auto;padding:36px 32px 64px}h1{font-size:28px;line-height:1.2}h2{font-size:19px;margin:0}a{color:#9fc4ff;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:2px solid #9fc4ff;outline-offset:4px}
nav{display:flex;flex-wrap:wrap;gap:8px 18px;padding:18px 0}section{border-top:1px solid #3a3a3c;padding:24px 0;scroll-margin-top:20px}.meta{color:#b8b8bf;overflow-wrap:anywhere}summary{cursor:pointer;padding:8px 0;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,monospace;background:#252528;border-radius:8px;padding:16px;max-height:440px;overflow:auto}p{margin:10px 0}.intro{color:#b8b8bf}.actions{display:flex;gap:20px;flex-wrap:wrap}
@media(max-width:540px){main{padding:24px 20px}h1{font-size:24px}}
</style></head><body><main><h1>Third-party licenses</h1><p class="intro">Reccut ${escape(pkg.version)} uses open-source software, model weights and artwork. Each component retains its own license and copyright notices. Optional proprietary components have separate terms.</p>
<p class="actions"><a href="reccut-licenses://folder">Open license files and documentation</a></p>
<p>The texts below are available offline. Project links open upstream websites. Source-code and redistribution rights are described in each component's license.</p>
<nav aria-label="Components">${components.map((c) => `<a href="#${escape(c.id)}">${escape(c.name)}</a>`).join('')}</nav>
${entries}</main></body></html>\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildLicenses();
