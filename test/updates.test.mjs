import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const asset = { name: 'Reccut-1.0.0-arm64.dmg', browser_download_url: 'https://github.com/sirbull/reccut/releases/download/v1.0.0/Reccut-1.0.0-arm64.dmg', size: 4 };
function mainSetup(fetch, dir) {
  const module = { exports: {} }, revealed = [];
  vm.runInNewContext(fs.readFileSync(new URL('../src/main/updates.js', import.meta.url), 'utf8'), {
    module, exports: module.exports, __dirname: path.resolve('src/main'), process: { platform: 'darwin', arch: 'arm64' },
    require: (name) => name === 'electron' ? { app: { getVersion: () => '0.9.0', getPath: () => dir }, net: { fetch }, shell: { showItemInFolder: (file) => revealed.push(file) } } : require(name),
    AbortController, AbortSignal, setTimeout, clearTimeout, URL,
  });
  return { ...module.exports, revealed };
}
const releaseResponse = (override = {}) => Response.json({ tag_name: 'v1.0.0', assets: [asset], body: 'Changes', ...override });

test('release versions compare numerically and follow prerelease ordering', () => {
  const { newer } = mainSetup();
  for (const [a, b] of [['v1.2.10', '1.2.9'], ['1.0.0', '1.0.0-beta.4'], ['1.0.0-beta.10', '1.0.0-beta.2'], ['1.0.0-rc.1', '1.0.0-beta.9']]) {
    assert.equal(newer(a, b), true, `${a} > ${b}`);
    assert.equal(newer(b, a), false);
  }
  for (const version of ['1.0.0', '1.0.0+build.4', 'invalid']) assert.equal(newer(version, '1.0.0'), false);
});

test('installer selection matches the operating system and CPU', () => {
  const { pickAsset } = mainSetup();
  const assets = ['Reccut-arm64.dmg', 'Reccut.dmg', 'Reccut-arm64.AppImage', 'Reccut-x86_64.AppImage', 'Reccut-arm64.exe', 'Reccut-Setup.exe'].map((name) => ({ name }));
  assert.equal(pickAsset(assets, 'darwin', 'arm64').name, 'Reccut-arm64.dmg');
  assert.equal(pickAsset(assets, 'darwin', 'x64').name, 'Reccut.dmg');
  assert.equal(pickAsset(assets, 'linux', 'x64').name, 'Reccut-x86_64.AppImage');
  assert.equal(pickAsset(assets, 'win32', 'x64').name, 'Reccut-Setup.exe');
  assert.equal(pickAsset([{ name: 'Reccut-arm64.dmg' }], 'darwin', 'x64'), undefined);
  assert.equal(pickAsset([{ name: 'Reccut-x86_64.AppImage' }], 'linux', 'arm64'), undefined);
  assert.equal(pickAsset([{ name: 'Reccut-universal.dmg' }], 'darwin', 'arm64').name, 'Reccut-universal.dmg');
});

test('checks use the installed version and only allow the offered GitHub installer', async () => {
  const updates = mainSetup(async () => releaseResponse());
  const r = await updates.check();
  assert.equal(r.current, '0.9.0');
  assert.equal(r.latest, '1.0.0');
  assert.equal(r.newer, true);
  assert.equal(r.url, 'https://github.com/sirbull/reccut/releases/latest');
  assert.equal(updates.resolveAsset(r.asset).url, asset.browser_download_url);
  assert.throws(() => updates.resolveAsset({ ...r.asset, url: 'https://example.com/installer' }), /Check for updates/);
  const malicious = mainSetup(async () => releaseResponse({ assets: [{ ...asset, name: '../Reccut-arm64.dmg' }] }));
  const bad = await malicious.check();
  assert.throws(() => malicious.resolveAsset(bad.asset), /filename/);
});

test('completed downloads preserve existing installers and reveal the saved file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-updates-'));
  try {
    fs.writeFileSync(path.join(dir, asset.name), 'existing');
    const updates = mainSetup(async (url) => url.includes('api.github.com') ? releaseResponse() : new Response('test', { headers: { 'content-length': '4' } }), dir);
    const r = await updates.check(), progress = [];
    const file = await updates.download(r.asset, (p) => progress.push(p));
    assert.equal(fs.readFileSync(file, 'utf8'), 'test');
    assert.equal(fs.readFileSync(path.join(dir, asset.name), 'utf8'), 'existing');
    assert.match(file, / \(1\)\.dmg$/);
    assert.equal(progress.at(-1), 1);
    assert.equal(updates.revealed[0], file);
    assert.equal(fs.readdirSync(dir).some((name) => name.startsWith('.reccut-update-')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('incomplete, failed and canceled downloads clean temporary files and never reveal an installer', async () => {
  for (const failure of ['truncated', 'network', 'canceled']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-updates-'));
    try {
      const updates = mainSetup(async (url) => {
        if (url.includes('api.github.com')) return releaseResponse();
        if (failure === 'network') return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.error(new Error('Connection lost')); } }));
        return new Response('no');
      }, dir);
      const r = await updates.check();
      const ctrl = new AbortController();
      if (failure === 'canceled') ctrl.abort();
      await assert.rejects(updates.download(r.asset, () => {}, ctrl.signal));
      assert.deepEqual(fs.readdirSync(dir), []);
      assert.equal(updates.revealed.length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

const rendererBundle = (await build({
  entryPoints: ['src/renderer/updates.js'], bundle: true, write: false, format: 'cjs', platform: 'browser',
  plugins: [{ name: 'update-fixtures', setup(b) {
    b.onResolve({ filter: /^\.\/prefs\.js$/ }, () => ({ path: 'prefs', namespace: 'fixture' }));
    b.onResolve({ filter: /^\.\/ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'prefs' ? 'export const prefs = state.prefs;' : 'export const toast = (...args) => state.toasts.push(args);' }));
  } }],
})).outputFiles[0].text;
function rendererSetup() {
  const state = { prefs: { value: { checkUpdates: true } }, toasts: [], calls: 0, downloads: 0, now: 10 * 86400000, result: { newer: true, current: '0.9.0', latest: '1.0.0', asset: { name: 'installer' } } };
  const storage = new Map(), events = new Map(), timers = new Map();
  let seq = 0;
  const module = { exports: {} };
  vm.runInNewContext(rendererBundle, {
    module, exports: module.exports, state,
    Date: class extends Date { static now() { return state.now; } },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    setTimeout: (fn) => { timers.set(++seq, fn); return seq; }, clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { timers.set(++seq, fn); return seq; }, clearInterval: (id) => timers.delete(id),
    window: {
      addEventListener: (name, cb) => events.set(name, cb), removeEventListener: (name) => events.delete(name),
      api: {
        checkUpdates: async () => { state.calls++; if (state.offline) throw new Error('Offline'); return state.result; },
        downloadUpdate: async () => { state.downloads++; if (state.downloadError) throw new Error('Disk full'); return 42; },
        onUpdateDownloaded: (cb) => { state.downloaded = cb; }, onTasks: (cb) => { state.tasks = cb; },
      },
    },
  });
  return { updates: module.exports, state, storage, events, timers };
}

test('automatic checks respect daily scheduling, opt-out and skipped versions; manual checks bypass them', async () => {
  const { updates, state } = rendererSetup();
  await updates.checkForUpdates();
  assert.equal(updates.availableUpdate.value.latest, '1.0.0');
  updates.dismissUpdate(true);
  await updates.checkForUpdates();
  assert.equal(state.calls, 1);
  state.now += 86400001;
  await updates.checkForUpdates();
  assert.equal(updates.availableUpdate.value, null);
  state.prefs.value.checkUpdates = false;
  await updates.checkForUpdates();
  assert.equal(state.calls, 2);
  await updates.checkForUpdates(true);
  assert.equal(updates.availableUpdate.value.latest, '1.0.0');
});

test('offline checks stay quiet, retry on reconnect, and remove timers and listeners on cleanup', async () => {
  const { updates, state, events, timers } = rendererSetup();
  state.offline = true;
  const stop = updates.startUpdateChecks();
  await updates.checkForUpdates();
  assert.equal(state.toasts.length, 0);
  await updates.checkForUpdates();
  assert.equal(state.calls, 1);
  await updates.checkForUpdates(true);
  assert.equal(state.toasts.length, 1);
  state.offline = false;
  events.get('online')();
  await new Promise(setImmediate);
  assert.equal(updates.availableUpdate.value.latest, '1.0.0');
  stop();
  assert.equal(events.size, 0);
  assert.equal(timers.size, 0);
});

test('long-running sessions check again the next day and defer while recording or another dialog is open', async () => {
  const { updates, state, timers } = rendererSetup();
  let idle = false;
  const stop = updates.startUpdateChecks(() => idle);
  const tick = [...timers.values()][1];
  tick();
  assert.equal(state.calls, 0);
  idle = true;
  tick();
  await new Promise(setImmediate);
  assert.equal(state.calls, 1);
  updates.dismissUpdate();
  tick();
  assert.equal(state.calls, 1);
  state.now += 86400001;
  tick();
  await new Promise(setImmediate);
  assert.equal(state.calls, 2);
  stop();
});

test('download clicks are deduplicated, progress and completion reach the dialog, and errors allow retry', async () => {
  const { updates, state } = rendererSetup();
  await updates.checkForUpdates(true);
  await Promise.all([updates.downloadUpdate(), updates.downloadUpdate()]);
  assert.equal(state.downloads, 1);
  state.tasks([{ id: 42, state: 'running', progress: 0.5 }]);
  assert.equal(updates.updateDownload.value.progress, 0.5);
  state.downloaded({ id: 99, file: '/wrong' });
  assert.equal(updates.updateDownload.value.state, 'downloading');
  state.downloaded({ id: 42, error: 'Connection lost' });
  assert.equal(updates.updateDownload.value.state, 'error');
  await updates.downloadUpdate();
  assert.equal(state.downloads, 2);
  state.downloaded({ id: 42, file: '/Downloads/installer' });
  assert.equal(updates.updateDownload.value.state, 'done');
  assert.equal(updates.updateDownload.value.file, '/Downloads/installer');
});
