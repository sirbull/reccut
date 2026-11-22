const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),electron=require('electron');
if(!electron.app){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(electron,[__filename,...process.argv.slice(2)],{env,stdio:'inherit'});child.on('exit',code=>{process.exitCode=code??1;});
}else{
  const {app,BrowserWindow,ipcMain,protocol,net}=electron,{pathToFileURL}=require('node:url');
  const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'reccut-motion-source-'));
  app.setPath('userData',path.join(dir,'profile'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
  protocol.registerSchemesAsPrivileged([{scheme:'media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
  app.whenReady().then(async()=>{
    const jobs=require('../src/main/jobs');let win;
    const timeout=setTimeout(()=>{console.error('Natural motion source test timed out');app.exit(1);},60000);
    try{
      const ff=require('../src/main/ffmpeg'),file=path.join(dir,'source.mp4');
      const source=process.argv[2];
      await ff.run([...(source?['-i',path.resolve(source),'-t','2','-vf','scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,fps=30']:['-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=2']),'-an','-c:v','libx264','-crf','12','-pix_fmt','yuv420p',file]).promise;
      protocol.handle('media',async request=>{
        const file=decodeURIComponent(new URL(request.url).pathname.slice(1));
        const response=await net.fetch(pathToFileURL(file).href,{headers:request.headers});const headers=new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin','*');headers.set('Content-Type',file.endsWith('.png')?'image/png':'video/mp4');
        return new Response(response.body,{status:response.status,headers});
      });
      ipcMain.handle('motion:export',(_event,payload)=>jobs.runInWorker('export',{...payload,ffmpeg:ff.getFfmpegPath(),tmpDir:path.join(dir,'tmp')}));
      const bundle=await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/motion-blur-source.js')],bundle:true,write:false,format:'iife',globalName:'motionSourceTest'});
      const html=path.join(dir,'test.html');fs.writeFileSync(html,`<!doctype html><base href="${pathToFileURL(path.join(root,'build/')).href}"><body></body>`);
      win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:true,contextIsolation:false}});
      win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
      await win.loadFile(html);await win.webContents.executeJavaScript('void (window.exportMotion=payload=>require("electron").ipcRenderer.invoke("motion:export",payload))');
      await win.webContents.executeJavaScript(bundle.outputFiles[0].text);
      const result=await win.webContents.executeJavaScript(`motionSourceTest.run(${JSON.stringify(file)},${JSON.stringify(path.join(dir,'export.png'))}).then(result=>({result}),e=>({error:String(e),stack:e?.stack}))`);
      if(result.error)throw new Error(result.error+'\n'+result.stack);console.log(result.result);
      clearTimeout(timeout);jobs.destroyWorkers();win.destroy();fs.rmSync(dir,{recursive:true,force:true});app.exit(0);
    }catch(e){console.error(e);clearTimeout(timeout);jobs.destroyWorkers();win?.destroy();fs.rmSync(dir,{recursive:true,force:true});app.exit(1);}
  });
}
