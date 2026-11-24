// Live catalog/UI smoke test. Run after npm run build. Uses a disposable profile
// and project; no microphone, camera, screen capture or model download is used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename], { env, cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, desktopCapturer, BrowserWindow } = electron;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-catalog-ui-'));
  fs.mkdirSync(path.join(profile, 'videos'));
  app.setPath('appData', profile);
  app.setPath('userData', path.join(profile, 'profile'));
  app.setPath('videos', path.join(profile, 'videos'));
  desktopCapturer.getSources = async () => [];
  let started = false, offline = false;
  const catalogRequests = [];
  const fetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    if (String(args[0]).startsWith('https://sirbull.github.io/reccut/design-catalog/')) catalogRequests.push(String(args[0]));
    return offline ? Promise.reject(Error('Offline smoke test')) : fetch(...args);
  };
  const timeout = setTimeout(() => { console.error('Catalog smoke test timed out:', profile); app.exit(1); }, 120000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/build/index.html')) return;
      started = true;
      const js = code => win.webContents.executeJavaScript(`{${code}}`);
      const wait = async (code, target = win) => {
        for (let i = 0; i < 400; i++) {
          if (await target.webContents.executeJavaScript(`{${code}}`)) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error(`UI condition not reached: ${code}`);
      };
      const click = text => js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
      try {
        await js(`localStorage.setItem('prefs',JSON.stringify({aiModelsAsked:true}));void 0`);
        const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
        win.webContents.reload(); await loaded;
        await wait(`!!document.querySelector('[aria-label="Welcome to Reccut"]')`);
        await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Create Project'&&!b.disabled)`);
        await click('Create Project');
        await wait(`!document.querySelector('[aria-label="Welcome to Reccut"]')`);
        await new Promise(resolve => setTimeout(resolve, 400));
        await click('Not Now');
        assert.deepEqual(catalogRequests, [], 'the inactive Design room must not download the catalog');
        await click('Design');
        await wait(`!!document.querySelector('.dz-rail')`);
        await js(`if(document.querySelector('.dz-library-panel-head b')?.textContent!=='Templates')document.querySelector('.dz-rail button[title="Templates"]').click()`);
        await wait(`[...document.querySelectorAll('.dz-library-section h3')].some(h=>h.textContent==='More Templates')`);
        assert.equal((await js('window.api.stockSettings()')).catalog, 'https://sirbull.github.io/reccut/design-catalog/index.json');
        const entries = await js('window.api.stockCatalog()');
        assert.equal(entries.length, 22);
        // Check the actual download and validator used by the running app.
        for (const entry of entries) {
          const template = await js(`window.api.stockCatalogFile(${JSON.stringify(entry.id)})`);
          assert.equal(template.name, entry.name);
        }
        await js(`[...document.querySelectorAll('.dz-library-section')].find(s=>s.querySelector('h3')?.textContent==='More Templates').querySelector('.dz-see-all').click()`);
        await wait(`document.querySelectorAll('.dz-library-all .dz-library-card').length===22`);
        await wait(`[...document.querySelectorAll('.dz-library-all img')].length===22&&[...document.querySelectorAll('.dz-library-all img')].every(i=>i.complete&&i.naturalWidth>0)`);
        await js(`document.querySelector('.dz-library-all').scrollIntoView({block:'start'})`);
        fs.writeFileSync(path.join(profile, 'catalog.png'), (await win.webContents.capturePage()).toPNG());
        await js(`document.querySelector('.dz-library-all .dz-library-card').click()`);
        await wait(`!!document.querySelector('.dz-canvas')`);
        await wait(`[...document.querySelectorAll('.dz-library-all .dz-library-card')].every(b=>b.getAttribute('aria-busy')==='false')`);
        assert.ok(await js(`document.querySelector('.dz-room').textContent.includes('Presenter Focus')`), 'clicking creates the selected editable design');
        fs.writeFileSync(path.join(profile, 'created-design.png'), (await win.webContents.capturePage()).toPNG());
        offline = true;
        assert.equal((await js('window.api.stockCatalog()')).length, 22, 'cached list works offline');
        await js(`window.api.stockSettings({enabled:false})`);
        assert.deepEqual(await js('window.api.stockCatalog()'), []);
        await js(`window.api.stockSettings({enabled:true,catalog:''})`);
        assert.deepEqual(await js('window.api.stockCatalog()'), []);
        assert.equal((await js('window.api.stockSettings()')).catalog, '');
        await js(`window.api.openHelp({commands:[],request:{article:'ai-plugins'}})`);
        const help = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/build/help.html'));
        assert.ok(help, 'the real handbook window opens');
        await wait(`document.body.innerText.includes('Local AI voice-over')&&document.body.innerText.includes('Use Reccut from another AI app')`, help);
        assert.ok(!await help.webContents.executeJavaScript(`document.body.innerText.includes('cannot yet create voice-over')`));
        await help.webContents.executeJavaScript(`[...document.querySelectorAll('li')].find(el=>el.textContent.includes('Local AI voice-over'))?.scrollIntoView({block:'center'})`);
        fs.writeFileSync(path.join(profile, 'handbook.png'), (await help.webContents.capturePage()).toPNG());
        await js(`window.api.openHelp({commands:[],request:{article:'design'}})`);
        await wait(`document.body.innerText.includes('More Templates')&&document.body.innerText.includes('Existing saved addresses')`, help);
        const site = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await site.loadFile(path.join(root, 'docs/docs/index.html'), { hash: 'ai-plugins' });
        await wait(`document.body.innerText.includes('Local AI voice-over')`, site);
        fs.writeFileSync(path.join(profile, 'website-docs.png'), (await site.webContents.capturePage()).toPNG());
        await site.webContents.executeJavaScript(`location.hash='design'`);
        await wait(`document.body.innerText.includes('Existing saved addresses')`, site);
        console.log(`PASS: fresh profile, 22 live templates/previews, editable design, cached offline list, disabled/cleared catalog, in-app handbook and generated website docs. Screenshots: ${profile}`);
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) {
        console.error(error);
        console.error('Test profile:', profile);
        fs.writeFileSync(path.join(profile, 'failure.png'), (await win.webContents.capturePage()).toPNG());
        console.error('UI buttons:', await js(`[...document.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),title:b.title})).slice(0,35)`));
        clearTimeout(timeout);
        app.exit(1);
      }
    });
  });
  require('../src/main/main');
}
