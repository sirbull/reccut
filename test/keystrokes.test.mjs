import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createKeystrokes, assetName, comboLabel, parseLine, appShortcut } = require('../src/main/keystrokes.js');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function release(files) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const name = url.split('/').pop();
    if (!(name in files)) return new Response('missing', { status: 404 });
    return new Response(files[name]);
  };
  return { fetchImpl, urls };
}

function fakeSpawn() {
  const started = [];
  const spawnImpl = (file, args) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stdin = { ended: false, end() { this.ended = true; proc.emit('exit', 0); } };
    proc.kill = () => proc.emit('exit', 1);
    started.push({ file, args, proc });
    return proc;
  };
  const spawnSyncImpl = (file, args) => ({ stdout: args[0] === '--check' ? 'granted\n' : 'granted\n' });
  return { spawnImpl, spawnSyncImpl, started };
}

function setup(files, platform = 'linux', arch = 'x64') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-keys-'));
  const rel = release(files);
  const sp = fakeSpawn();
  const ks = createKeystrokes({ dir: path.join(dir, 'keystrokes'), version: '1.2.3', repo: { owner: 'sirbull', name: 'reccut' }, fetchImpl: rel.fetchImpl, platform, arch, ...sp });
  return { ks, dir: path.join(dir, 'keystrokes'), ...rel, ...sp };
}

const helper = Buffer.from('#!/bin/sh\necho fake helper\n');
const files = { 'reccut-keystrokes-linux-x64': helper, 'reccut-keystrokes-linux-x64.sha256': `${sha(helper)}  reccut-keystrokes-linux-x64\n` };

test('the add-on has one helper file per platform', () => {
  assert.equal(assetName('win32', 'x64'), 'reccut-keystrokes-win-x64.exe');
  assert.equal(assetName('win32', 'arm64'), 'reccut-keystrokes-win-x64.exe');
  assert.equal(assetName('darwin', 'arm64'), 'reccut-keystrokes-mac');
  assert.equal(assetName('darwin', 'x64'), 'reccut-keystrokes-mac');
  assert.equal(assetName('linux', 'x64'), 'reccut-keystrokes-linux-x64');
  assert.equal(assetName('linux', 'arm64'), null);
});

test('nothing is downloaded or started before the user consents', async () => {
  const s = setup(files);
  assert.deepEqual({ ...s.ks.status(), permission: undefined }, { supported: true, installed: false, damaged: false, version: null, installedAt: null, outdated: false, permission: undefined, running: false });
  await assert.rejects(s.ks.install(), /accept/);
  await assert.rejects(s.ks.install({ consent: 'yes' }), /accept/);
  assert.equal(s.urls.length, 0);
  assert.equal(s.ks.start(() => {}), false);
  assert.equal(s.started.length, 0);
});

test('install downloads from the release for this version and checks the checksum', async () => {
  const s = setup(files);
  const status = await s.ks.install({ consent: true });
  assert.deepEqual(s.urls, [
    'https://github.com/sirbull/reccut/releases/download/v1.2.3/reccut-keystrokes-linux-x64.sha256',
    'https://github.com/sirbull/reccut/releases/download/v1.2.3/reccut-keystrokes-linux-x64',
  ]);
  assert.equal(status.installed, true);
  assert.equal(status.damaged, false);
  assert.equal(status.version, '1.2.3');
  assert.equal(status.permission, 'granted');
  const exe = path.join(s.dir, 'reccut-keystrokes-linux-x64');
  assert.deepEqual(fs.readFileSync(exe), helper);
  // Windows has no executable bit; there the .exe extension is what matters.
  if (process.platform !== 'win32') assert.ok(fs.statSync(exe).mode & 0o100, 'the helper is executable');
  assert.ok(JSON.parse(fs.readFileSync(path.join(s.dir, 'addon.json'), 'utf8')).consentAt);
});

test('a download that does not match its checksum is never written', async () => {
  const s = setup({ ...files, 'reccut-keystrokes-linux-x64': Buffer.from('something else') });
  await assert.rejects(s.ks.install({ consent: true }), /checksum/);
  assert.equal(fs.existsSync(path.join(s.dir, 'reccut-keystrokes-linux-x64')), false);
  assert.equal(s.ks.status().installed, false);
  const missing = setup({});
  await assert.rejects(missing.ks.install({ consent: true }), /not published for Reccut 1\.2\.3/);
});

test('a helper changed after install is reported as damaged and not started', async () => {
  const s = setup(files);
  await s.ks.install({ consent: true });
  fs.writeFileSync(path.join(s.dir, 'reccut-keystrokes-linux-x64'), 'tampered');
  const status = s.ks.status();
  assert.equal(status.damaged, true);
  assert.equal(status.permission, null);
  assert.equal(s.ks.start(() => {}), false);
  assert.equal(s.started.length, 0);
});

test('the helper runs only between start and stop, and its lines are parsed', async () => {
  const s = setup(files);
  await s.ks.install({ consent: true });
  const events = [];
  assert.equal(s.ks.start((e) => events.push(e)), true);
  assert.equal(s.ks.start(() => {}), true, 'a second start reuses the running helper');
  assert.equal(s.started.length, 1);
  assert.deepEqual(s.started[0].args, []);
  const { proc } = s.started[0];
  proc.stdout.emit('data', 'READY\nK S 1\nK Z');
  proc.stdout.emit('data', ' 5\nhello world\nK ../../x 1\nE permission\n');
  assert.deepEqual(events, [
    { type: 'ready' },
    { type: 'key', name: 'S', mods: 1 },
    { type: 'key', name: 'Z', mods: 5 },
    { type: 'error', reason: 'permission' },
  ]);
  assert.equal(s.ks.running(), true);
  s.ks.stop();
  assert.equal(proc.stdin.ended, true, 'closing stdin makes the helper quit');
  assert.equal(s.ks.running(), false);
});

test('remove deletes the add-on', async () => {
  const s = setup(files);
  await s.ks.install({ consent: true });
  s.ks.start(() => {});
  const status = await s.ks.remove();
  assert.equal(status.installed, false);
  assert.equal(status.running, false);
  assert.equal(fs.existsSync(s.dir), false);
});

test('labels, protocol and Reccut shortcuts', () => {
  assert.equal(comboLabel('S', 1 | 4, false), 'Ctrl + Shift + S');
  assert.equal(comboLabel('ArrowLeft', 8, false), 'Win + ←');
  assert.equal(comboLabel('Z', 8 | 4, true), '⇧⌘ Z');
  assert.equal(comboLabel('Enter', 8, true), '⌘ ↩');
  assert.equal(comboLabel('Escape', 0, true), 'Esc');
  assert.equal(comboLabel('Numpad1', 1, false), 'Ctrl + Num 1');
  assert.equal(parseLine('K A 99').mods, 99 & 15);
  assert.equal(parseLine('typed text'), null);
  assert.equal(appShortcut('Control+Alt', '0', 1 | 2), true);
  assert.equal(appShortcut('Control+Alt', '0', 1), false);
  assert.equal(appShortcut('Command+Shift', '9', 8 | 4), true);
  assert.equal(appShortcut('Control+Alt', '8', 1 | 2), true);
  assert.equal(appShortcut('Control+Alt', 'M', 1 | 2), true);
  assert.equal(appShortcut('Control+Shift', 'M', 1 | 4), true);
  assert.equal(appShortcut('Command+Alt', 'M', 8 | 2), true);
  assert.equal(appShortcut('Command+Shift', 'M', 8 | 4), true);
  assert.equal(appShortcut('Control+Alt', 'M', 1), false);
  assert.equal(appShortcut('Control+Alt', 'S', 1 | 2), false);
});

test('the release check never mistakes the add-on for an installer', () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../src/main/updates.js', import.meta.url), 'utf8'), {
    module, exports: module.exports, __dirname: path.resolve('src/main'), process: { platform: 'win32', arch: 'x64' },
    require: (name) => (name === 'electron' ? { app: {}, net: {}, shell: {} } : require(name)),
  });
  const assets = [{ name: 'reccut-keystrokes-win-x64.exe' }, { name: 'reccut-keystrokes-win-x64.exe.sha256' }, { name: 'Reccut-Setup-1.2.3.exe' }];
  assert.equal(module.exports.pickAsset(assets, 'win32', 'x64').name, 'Reccut-Setup-1.2.3.exe');
  assert.equal(module.exports.pickAsset(assets.slice(0, 2), 'win32', 'x64'), undefined);
});

test('the installer and the app source contain no keyboard hook', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(!pkg.build.files.some((f) => f.startsWith('native')), 'native helpers are not packaged');
  const deps = Object.keys(pkg.dependencies || {});
  assert.ok(!deps.some((d) => /hook|keyboard|keylog/i.test(d)));
  for (const dir of ['src/main', 'src/renderer', 'src/shared']) {
    for (const file of fs.readdirSync(dir, { recursive: true })) {
      if (!/\.(js|jsx|cjs|mjs)$/.test(file)) continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.doesNotMatch(text, /SetWindowsHookEx|WH_KEYBOARD_LL|CGEventTapCreate|XRecord|GetAsyncKeyState/, file);
    }
  }
});
