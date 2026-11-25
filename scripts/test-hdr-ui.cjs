// Real app, isolated profile, no downloads. Run after npm run build and npm run docs.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename], { env, stdio: 'inherit', windowsHide: true });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  child.on('error', e => { console.error(e); process.exitCode = 1; });
} else {
  const { app, desktopCapturer, ipcMain, BrowserWindow } = electron;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-hdr-ui-'));
  fs.mkdirSync(path.join(profile, 'videos'));
  app.setPath('appData', profile); app.setPath('userData', path.join(profile, 'profile')); app.setPath('videos', path.join(profile, 'videos'));
  desktopCapturer.getSources = async () => [];
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => handle(channel, (...args) => {
    if (/download|install/i.test(channel)) throw Error(`Unexpected download: ${channel}`);
    return handler(...args);
  });
  let started = false;
  const timeout = setTimeout(() => { console.error('HDR UI test timed out:', profile); app.exit(1); }, 90000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, cb) => cb(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/build/index.html')) return;
      started = true;
      const js = code => win.webContents.executeJavaScript(`{${code}}`);
      const wait = async (code, target = win) => {
        for (let i = 0; i < 400; i++) {
          if (await target.webContents.executeJavaScript(`{${code}}`)) return;
          await new Promise(r => setTimeout(r, 50));
        }
        throw Error(`Missing UI: ${code}`);
      };
      const click = text => js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
      try {
        await js(`localStorage.setItem('prefs',JSON.stringify({aiModelsAsked:true}));void 0`);
        const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
        win.webContents.reload(); await loaded;
        await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Create Project'&&!b.disabled)`);
        await click('Create Project');
        await wait(`!document.querySelector('[aria-label="Welcome to Reccut"]')`);
        await new Promise(r => setTimeout(r, 400));
        await click('Not Now');
        win.show(); win.focus();
        await js(`document.querySelector('.help-btn').click()`);
        await wait(`!!document.querySelector('.palette input')`);
        await js(`{const e=document.querySelector('.palette input'); e.value='HDR PQ';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await wait(`document.querySelector('.palette').textContent.includes('Prepare HDR PQ Export')`);
        await js(`[...document.querySelectorAll('.palette-item')].find(e=>e.textContent.includes('Prepare HDR PQ Export')).click()`);
        await wait(`!!document.querySelector('.ex-settings')&&document.querySelector('.ex-settings').textContent.includes('10-bit HEVC, BT.2020/PQ')`);
        assert.ok(await js(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='hdr-pq')`));
        assert.ok(await js(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='mp4-hevc')`));
        fs.writeFileSync(path.join(profile, 'hdr-export.png'), (await win.webContents.capturePage()).toPNG());
        await click('Standard');
        await wait(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='sdr')`);
        await js(`document.querySelector('.help-btn').click()`);
        await wait(`!!document.querySelector('.palette input')`);
        await js(`{const e=document.querySelector('.palette input'); e.value='HDR PQ';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await wait(`document.querySelector('.palette').textContent.includes('Prepare HDR PQ Export')`);
        await js(`window.api.openHelp({commands:[],request:{article:'hdr'}})`);
        const help = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/build/help.html'));
        await wait(`document.body.innerText.includes('Export HDR PQ (Early Access)')&&document.body.innerText.includes('203-nit reference white')`, help);
        const site = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await site.loadFile(path.resolve(__dirname, '../docs/docs/index.html'), { hash: 'hdr' });
        await wait(`document.body.innerText.includes('Export HDR PQ (Early Access)')&&document.body.innerText.includes('10,000 nits')`, site);
        console.log('HDR UI passed: preset, SDR reset, Quick Search, app handbook and generated website. Screenshot:', profile);
        clearTimeout(timeout); app.exit(0);
      } catch (e) {
        console.error(e); console.error('Profile:', profile);
        if (!win.isDestroyed()) fs.writeFileSync(path.join(profile, 'failure.png'), (await win.webContents.capturePage()).toPNG());
        clearTimeout(timeout); app.exit(1);
      }
    });
  });
  require('../src/main/main');
}
