import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildLicenses } from '../scripts/build-licenses.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { models } = require('../src/main/designModels.js');

const root = fileURLToPath(new URL('../', import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-license-test-'));
after(() => fs.rmSync(out, { recursive: true, force: true }));
const manifest = buildLicenses({ root, out });

test('offline license build works without downloaded models and rejects altered or missing notices', () => {
  const source = path.join(out, 'source-without-models');
  fs.mkdirSync(source);
  // Only the build inputs; deliberately leave out vendor/ and all model weights.
  for (const file of ['package.json', 'assets/licenses', 'src/main/designModels.js', 'src/main/ttsCatalog.json',
    'native/voxcpm/voices/LICENSE.txt',
    'src/renderer/design/tool-icons/LICENSE.tabler.txt', 'scripts/fetch-ffmpeg.mjs', 'docs/THIRD-PARTY-LICENSES.md']) {
    const target = path.join(source, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, file), target, { recursive: true });
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(source, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(fs.existsSync(path.join(source, 'vendor')), false);
  const fixtureOut = path.join(source, 'build/licenses');
  const offline = buildLicenses({ root: source, out: fixtureOut });
  for (const model of models) {
    const entry = offline.components.find(c => c.id === model.id.replaceAll('/', '-'));
    assert.equal(entry.version, model.revision);
    const license = model.files.find(file => /^LICENSE(?:\.txt)?$/.test(file.file));
    assert.equal(fs.readFileSync(path.join(fixtureOut, entry.files[0].file), 'utf8'),
      fs.readFileSync(path.join(root, 'assets/licenses/models', model.id, license.file), 'utf8'));
  }
  const license = path.join(source, 'assets/licenses/models', models[0].id, 'LICENSE.txt');
  fs.appendFileSync(license, '\nChanged notice\n');
  assert.throws(() => buildLicenses({ root: source, out: fixtureOut }), /Model license changed/);
  fs.unlinkSync(license);
  assert.throws(() => buildLicenses({ root: source, out: fixtureOut }), { code: 'ENOENT' });
});

test('offline notices preserve full texts, package versions and native-library distinctions', () => {
  const page = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const library = manifest.components.find((c) => c.id === 'mediabunny');
  const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/mediabunny/package.json'), 'utf8'));
  assert.equal(library.version, installed.version);
  assert.equal(fs.readFileSync(path.join(out, library.files[0].file), 'utf8'), fs.readFileSync(path.join(root, 'node_modules/mediabunny/LICENSE'), 'utf8'));
  assert.ok(!manifest.components.some(c=>['uiohook-napi','libuiohook'].includes(c.id)));
  const pdf = manifest.components.find((c) => c.id === 'pdfjs-dist');
  assert.ok(pdf.files.some(({ title }) => title.endsWith('LICENSE_LIBERATION')));
  assert.ok(pdf.files.some(({ title }) => title.endsWith('LICENSE_OPENJPEG')));
  assert.ok(page.includes("default-src 'none'"));
  assert.doesNotMatch(page, /<script[\s>]|<iframe[\s>]/i);
  assert.ok(fs.readFileSync(path.join(out, 'DISTRIBUTION.md'), 'utf8').includes('does not itself complete'));
});

function setup(packaged = false) {
  const windows = [], opened = [], folders = [];
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.webContents = {
        setWindowOpenHandler: (fn) => { this.popup = fn; },
        on: (name, fn) => { this.listeners[name] = fn; },
      };
      windows.push(this);
    }
    setMenuBarVisibility() {}
    once(name, fn) { this.listeners[name] = fn; }
    on(name, fn) { this.listeners[name] = fn; }
    show() {}
    focus() { this.focused = true; }
    isMinimized() { return false; }
    loadURL(url) { this.url = url; }
    loadFile(file) { this.file = file; }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/main/about.js'), 'utf8'), {
    module, __dirname: path.join(root, 'src/main'), URL,
    process: { resourcesPath: '/installed/Resources' },
    require(name) {
      if (name === 'electron') return {
        app: { isPackaged: packaged, getVersion: () => '7.8.9' }, BrowserWindow: FakeWindow,
        shell: { openExternal: (url) => opened.push(url), openPath: (folder) => folders.push(folder) },
      };
      if (name === 'path') return path;
      if (name === 'fs') return { readFileSync(file, encoding) {
        return fs.readFileSync(file.endsWith('manifest.json') ? path.join(out, 'manifest.json') : file, encoding);
      } };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return { about: module.exports, windows, opened, folders };
}

test('About uses the runtime version and its local link reuses a sandboxed license reader', () => {
  const s = setup();
  s.about.show();
  const about = s.windows[0];
  assert.ok(decodeURIComponent(about.url).includes('Version 7.8.9'));
  assert.ok(decodeURIComponent(about.url).includes('Third-party licenses'));
  about.popup({ url: 'reccut-licenses://show' });
  const reader = s.windows[1];
  assert.equal(reader.file, path.join(root, 'build/licenses/index.html'));
  assert.equal(reader.options.webPreferences.nodeIntegration, false);
  assert.equal(reader.options.webPreferences.contextIsolation, true);
  assert.equal(reader.options.webPreferences.sandbox, true);
  s.about.showLicenses();
  assert.equal(s.windows.length, 2);
  assert.equal(reader.focused, true);
  reader.listeners.closed();
  s.about.showLicenses();
  assert.equal(s.windows.length, 3);
});

test('installed license reader uses external resources and rejects unlisted URLs and arbitrary local paths', () => {
  const s = setup(true);
  s.about.showLicenses();
  const reader = s.windows[0];
  assert.equal(reader.file, path.join('/installed/Resources', 'licenses', 'index.html'));
  for (const url of ['https://example.com/', 'https://github.com.evil.test/Vanilagy/mediabunny', 'file:///etc/passwd', 'javascript:alert(1)', 'reccut-licenses://folder/../../', 'https://user:password@github.com/Vanilagy/mediabunny']) {
    assert.equal(reader.popup({ url }).action, 'deny');
  }
  assert.equal(s.opened.length, 0);
  assert.equal(s.folders.length, 0);
  reader.popup({ url: 'https://github.com/Vanilagy/mediabunny' });
  assert.deepEqual(s.opened, ['https://github.com/Vanilagy/mediabunny']);
  let prevented = false;
  reader.listeners['will-navigate']({ preventDefault() { prevented = true; } }, 'reccut-licenses://folder');
  assert.equal(prevented, true);
  assert.deepEqual(s.folders, [path.join('/installed/Resources', 'licenses')]);
});
