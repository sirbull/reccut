const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),electron=require('electron');
if(!electron.app){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(electron,[__filename,...process.argv.slice(2)],{env,stdio:'inherit'});
  child.on('exit',code=>{process.exitCode=code??1;});
}else{
  const {app,BrowserWindow}=electron,dir=fs.mkdtempSync(path.join(os.tmpdir(),'reccut-motion-test-'));
  app.setPath('userData',path.join(dir,'profile'));
  app.whenReady().then(async()=>{
    let win;
    try{
      const bundle=await require('esbuild').build({entryPoints:[path.join(__dirname,'../test/fixtures/motion-blur-render.js')],bundle:true,write:false,format:'iife',globalName:'motionTests'});
      win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
      win.webContents.on('console-message',(_e,_level,message)=>console.log(message));
      await win.loadURL('about:blank');await win.webContents.executeJavaScript(bundle.outputFiles[0].text);
      const {report,preview}=await win.webContents.executeJavaScript('motionTests.run()');console.log(JSON.stringify(report,null,2));
      if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),Buffer.from(preview));
      app.exit(0);
    }catch(e){console.error(e);app.exit(1);}finally{win?.destroy();fs.rmSync(dir,{recursive:true,force:true});}
  });
}
