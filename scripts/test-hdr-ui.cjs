// Real app, isolated profile, no downloads. Run after npm run build and npm run docs.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
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
        const fixtureArg=process.argv.indexOf('--fixtures');
        if(fixtureArg>=0){
          const dir=path.resolve(process.argv[fixtureArg+1]);
          require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../src/shared/model.js')],bundle:true,platform:'node',outfile:path.join(profile,'model.cjs')});
          const {newProject,makeClip}=require(path.join(profile,'model.cjs')),p=newProject('Mixed HDR and SDR test');
          p.width=320;p.height=180;p.fps=24;p.duration=.25;
          const sources=['pq.mov','sdr-white.mp4'].map(f=>path.join(dir,f));sources.forEach(f=>assert.ok(fs.existsSync(f)));
          await js(`window.__hdrAnalysis=[];window.api.onAnalyzed(p=>window.__hdrAnalysis.push(p));void 0`);
          const imported=await js(`window.api.importMedia(${JSON.stringify(sources)})`);
          assert.deepEqual(imported.failed,[]);assert.equal(imported.items.length,2);
          assert.equal(imported.items[0].streams.main.color.hdr,'pq');assert.equal(imported.items[0].streams.main.needsProxy,true);
          await wait(`${JSON.stringify(imported.items.map(m=>m.id))}.every(id=>window.__hdrAnalysis.some(p=>p.mediaId===id&&p.patch.thumbs?.files?.length))`);
          const analyzed=await js(`window.__hdrAnalysis`);
          for(const [lane,m] of imported.items.entries()){
            for(const patch of analyzed.filter(p=>p.mediaId===m.id))Object.assign(m.streams[patch.stream],patch.patch);
            p.media[m.id]=m;const c=makeClip('video',{media:m,lane,dur:.25,props:lane?{cropL:.49}:{}});p.clips[c.id]=c;if(!lane)p.primary.push(c.id);
          }
          const file=path.join(profile,'mixed.reccut');fs.writeFileSync(file,JSON.stringify(p));win.webContents.send('project:open',file);
          await wait(`document.querySelector('.project-btn').textContent.includes('Mixed HDR and SDR test')`);
        }
        win.show(); win.focus();
        await js(`document.querySelector('.help-btn').click()`);
        await wait(`!!document.querySelector('.palette input')`);
        await js(`{const e=document.querySelector('.palette input'); e.value='HDR PQ';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await wait(`document.querySelector('.palette').textContent.includes('Prepare HDR PQ Export')`);
        await js(`[...document.querySelectorAll('.palette-item')].find(e=>e.textContent.includes('Prepare HDR PQ Export')).click()`);
        await wait(`!!document.querySelector('.ex-settings')&&document.querySelector('.ex-settings').textContent.includes('10-bit HEVC, BT.2020/PQ')`);
        assert.ok(await js(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='hdr-pq')`));
        assert.ok(await js(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='mp4-hevc')`));
        assert.ok(await js(`document.querySelector('.ex-settings').textContent.includes('Supports timeline transitions, video effects')`));
        assert.ok(await js(`document.querySelector('.ex-settings').textContent.includes('HDR and SDR clips can share one timeline')`));
        fs.writeFileSync(path.join(profile, 'hdr-export.png'), (await win.webContents.capturePage()).toPNG());
        await click('Standard');
        await wait(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='sdr')`);
        await js(`document.querySelector('.help-btn').click()`);
        await wait(`!!document.querySelector('.palette input')`);
        await js(`{const e=document.querySelector('.palette input');e.value='Prepare SDR Export';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await wait(`document.querySelector('.palette').textContent.includes('Prepare SDR Export')`);
        await js(`[...document.querySelectorAll('.palette-item')].find(e=>e.textContent.includes('Prepare SDR Export')).click()`);
        await wait(`[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='sdr')&&[...document.querySelectorAll('.ex-settings select')].some(s=>s.value==='mp4-h264')`);
        if(fixtureArg>=0){
          await wait(`document.querySelector('.ex-settings').textContent.includes('Original HDR and SDR media are combined before the final SDR conversion')`);
          await click('Optimized media');
          await wait(`document.querySelector('.ex-settings').textContent.includes('This project uses the SDR preview conversion instead')`);
          await click('Originals');
          await wait(`document.querySelector('.ex-settings').textContent.includes('Original HDR and SDR media are combined before the final SDR conversion')`);
        }
        fs.writeFileSync(path.join(profile,'mixed-sdr-export.png'),(await win.webContents.capturePage()).toPNG());
        await js(`document.querySelector('.help-btn').click()`);
        await wait(`!!document.querySelector('.palette input')`);
        await js(`{const e=document.querySelector('.palette input'); e.value='HDR PQ';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await wait(`document.querySelector('.palette').textContent.includes('Prepare HDR PQ Export')`);
        await js(`window.api.openHelp({commands:[],request:{article:'hdr'}})`);
        const help = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/build/help.html'));
        await wait(`document.body.innerText.includes('Export HDR PQ (Early Access)')&&document.body.innerText.includes('203-nit reference white')&&document.body.innerText.includes('Mix HDR and SDR; choose either output')&&document.body.innerText.includes('All ten timeline transitions are supported')`, help);
        const site = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await site.loadFile(path.resolve(__dirname, '../docs/docs/index.html'), { hash: 'hdr' });
        await wait(`document.body.innerText.includes('Export HDR PQ (Early Access)')&&document.body.innerText.includes('10,000 nits')&&document.body.innerText.includes('Mix HDR and SDR; choose either output')`, site);
        console.log('Mixed-color UI passed: HDR/SDR presets, Quick Search, output notices, app handbook and generated website. Screenshots:', profile);
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
