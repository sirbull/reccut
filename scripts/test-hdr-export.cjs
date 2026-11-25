// Exercises the actual built export worker, not the isolated HDR spike.
// npm run build; node scripts/test-hdr-export.cjs --ffprobe /path/to/ffprobe [--samples /folder]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const electron = require('electron');
const option = name => process.argv[process.argv.indexOf(name) + 1];
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const proc = spawn(electron, [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
  proc.on('exit', code => { process.exitCode = code ?? 1; });
  proc.on('error', e => { console.error(e); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, protocol } = electron;
  protocol.registerSchemesAsPrivileged([{scheme:'media',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-hdr-export-'));
  app.setPath('userData', path.join(dir, 'profile'));
  app.on('window-all-closed', () => {});
  const root = path.resolve(__dirname, '..');
  const bin = require('../src/main/ffmpeg-path');
  const probe = process.argv.includes('--ffprobe') ? option('--ffprobe') : 'ffprobe';
  const { WHITE, pq, pattern, samplePlanar } = require('./hdr-spike/fixtures.cjs');
  const ff = (args, binary = false) => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 64 * 1024 ** 2, encoding: binary ? undefined : 'utf8' });
  const info = file => JSON.parse(execFileSync(probe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { windowsHide: true, encoding: 'utf8' }));
  const decode = file => ff(['-i', file, '-vf', `zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:t=linear:npl=${WHITE},format=gbrpf32le`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], true);
  let win, job = 0;
  const report = { date: new Date().toISOString(), productWorker: true, cases: [] };
  const timeout = setTimeout(() => { console.error('HDR export test timed out:', dir); app.exit(1); }, 240000);
  app.whenReady().then(async () => {
    try {
      protocol.handle('media',request=>{
        const file=path.resolve(decodeURIComponent(new URL(request.url).pathname.slice(1))),allowed=path.join(root,'build','lensflare')+path.sep;
        if(!file.startsWith(allowed))return new Response('Forbidden',{status:403});
        return new Response(fs.readFileSync(file),{headers:{'Content-Type':'image/png'}});
      });
      require('esbuild').buildSync({ entryPoints: [path.join(root, 'src/shared/model.js')], bundle: true, platform: 'node', outfile: path.join(dir, 'model.cjs') });
      const { newProject, makeClip } = require(path.join(dir, 'model.cjs'));
      const projectFor = (file, color, w = 320, h = 180, sourceDuration = 1) => {
        const p = newProject('HDR test'); p.width = w; p.height = h; p.fps = 24;
        const m = { id: 'source', name: path.basename(file), path: file, kind: 'video', duration: sourceDuration, width: w, height: h, streams: { main: { path: file, hasVideo: true, hasAudio: false, width: w, height: h, fps: 24, duration: sourceDuration, color } } };
        p.media[m.id] = m;
        const c = makeClip('video', { media: m, dur: .25 }); p.clips[c.id] = c; p.primary = [c.id]; p.duration = .25;
        return { p, c, m };
      };
      win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
      win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_d, cb) => cb({ cancel: true }));
      win.webContents.on('console-message', (_e, ...args) => { const s = args.map(String).join(' '); if (/Error|HDR|WebGL/i.test(s)) console.log('worker:', s.slice(0, 900)); });
      await win.loadFile(path.join(root, 'build/export.html'));
      report.platform = process.platform;
      report.electron = process.versions.electron;
      report.gpu = await win.webContents.executeJavaScript(`(() => { const g=new OffscreenCanvas(1,1).getContext('webgl2'); const x=g?.getExtension('WEBGL_debug_renderer_info'); return x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):'unknown'; })()`);
      const run = (p, settings = {}, worker = win) => new Promise((resolve, reject) => {
        const jobId = `hdr-test-${++job}`;
        const output = path.join(dir, `${jobId}.mp4`);
        const clean = () => { ipcMain.removeListener('worker:done', done); ipcMain.removeListener('worker:error', error); };
        const done = (_e, r) => { if (r.jobId === jobId) { clean(); resolve(r.result); } };
        const error = (_e, r) => { if (r.jobId === jobId) { clean(); reject(new Error(r.error)); } };
        ipcMain.on('worker:done', done); ipcMain.on('worker:error', error);
        worker.webContents.send('worker:job', { jobId, payload: { project: p, settings: { color: 'hdr-pq', format: 'mp4-hevc', quality: 'max', sourceMedia: 'original', captions: 'none', preview: true, output, ...settings }, ffmpeg: bin, tmpDir: dir } });
      });
      for (const transfer of ['pq', 'hlg']) {
        const file = path.join(dir, `${transfer}.mov`), raw = path.join(dir, `${transfer}.raw`), trc = transfer === 'pq' ? 'smpte2084' : 'arib-std-b67';
        fs.writeFileSync(raw, pattern(320, 180, transfer));
        ff(['-stream_loop', '-1', '-f', 'rawvideo', '-pixel_format', 'gbrpf32le', '-video_size', '320x180', '-framerate', '24', '-i', raw, '-frames:v', '12',
          '-vf', `zscale=tin=${trc}:pin=bt2020:min=gbr:t=${trc}:p=bt2020:m=bt2020nc:r=limited,format=yuv420p10le`,
          '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'lossless=1:pools=2:frame-threads=2:repeat-headers=1:log-level=error',
          '-color_primaries', 'bt2020', '-color_trc', trc, '-colorspace', 'bt2020nc', '-tag:v', 'hvc1', file]);
        const { p, c } = projectFor(file, { hdr: transfer, transfer: trc, space: 'bt2020nc', primaries: 'bt2020', range: 'tv' });
        const started = Date.now(), output = await run(p), metadata = info(output).streams[0];
        assert.equal(metadata.pix_fmt, 'yuv420p10le'); assert.equal(metadata.color_transfer, 'smpte2084');
        assert.equal(metadata.color_primaries, 'bt2020'); assert.equal(metadata.color_space, 'bt2020nc'); assert.equal(metadata.color_range, 'tv');
        assert.equal(Number(metadata.nb_frames), 6);
        const fields = samplePlanar(decode(output), 320, 180, transfer);
        const error = Math.max(...fields.map(f => f.relativeOrWhiteError));
        assert.ok(error < .025, `${transfer} luminance/primary error ${error}: ${JSON.stringify(fields)}`);
        report.cases.push({ name: `${transfer} input → PQ`, maxRelativeOrWhiteError: error, seconds: (Date.now() - started) / 1000, fields });
        console.log(`${transfer} → PQ: ${(error * 100).toFixed(3)}% max field error`);
        if (transfer === 'pq') {
          c.props.exposure = -.5; // Editor scale: 0.5 is one stop.
          const dark = await run(p), darkFields = samplePlanar(decode(dark), 320, 180, 'pq');
          assert.ok(Math.abs(darkFields[4].measured[0] * WHITE - 500) < 12, 'minus one stop halves 1000 nit white');
          c.props.exposure = 0; c.lane = 1; p.primary = [];
          const top = makeClip('video', { media: p.media.source, dur: .25, lane: 2, props: { exposure: -1, opacity: .5 } }); p.clips[top.id] = top;
          const blend = await run(p), blendFields = samplePlanar(decode(blend), 320, 180, 'pq');
          assert.ok(Math.abs(blendFields[4].measured[0] * WHITE - 625) < 15, 'linear alpha: 1000*.5 + 250*.5 = 625 nits');
          report.cases.push({ name: 'linear exposure and two-layer alpha', minusOneStopNits: darkFields[4].measured[0] * WHITE, blendNits: blendFields[4].measured[0] * WHITE });
          delete p.clips[top.id]; c.lane = 0; p.primary = [c.id];
          c.props.vfx = [{type:'unknown-effect',p:{amount:.5}}];
          await assert.rejects(run(p), /unknown-effect.*not supported/);
          c.props.vfx = [];
          await assert.rejects(run(p, { sourceMedia: 'optimized' }), /original media/);
          report.cases.push({ name: 'unknown effects and SDR proxies rejected', passed: true });
        }
      }
      // SDR reference white must be 203 nits for video, raster images and text.
      const whiteFile = path.join(dir, 'sdr-white.mp4'), whiteImage = path.join(dir, 'sdr-white.png');
      ff(['-f', 'lavfi', '-i', 'color=white:s=320x180:r=24:d=0.5', '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', whiteFile]);
      ff(['-i', whiteFile, '-frames:v', '1', whiteImage]);
      const white = projectFor(whiteFile, { primaries: 'bt709', transfer: 'bt709', space: 'bt709', range: 'tv' });
      const maxNits = (file, text = false) => {
        const bytes = decode(file), data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
        if (text) {
          // HEVC can ring at text edges. Measure the modal white interior, not
          // the brightest compression overshoot or a partially covered AA pixel.
          const bins = new Map();
          for (const v of data) if (v * WHITE > 160 && v * WHITE < 250) { const k = Math.round(v * WHITE); bins.set(k, (bins.get(k) || 0) + 1); }
          return [...bins].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
        }
        let max = 0; for (const v of data) max = Math.max(max, v * WHITE); return max;
      };
      const videoWhite = maxNits(await run(white.p));
      assert.ok(Math.abs(videoWhite - 203) < 5, `SDR video white: ${videoWhite}`);
      white.c.type = 'image'; white.m.kind = 'image'; white.m.path = whiteImage;
      const imageWhite = maxNits(await run(white.p));
      assert.ok(Math.abs(imageWhite - 203) < 5, `SDR image white: ${imageWhite}`);
      white.c.props.opacity = .5;
      const imageHalfWhite = maxNits(await run(white.p));
      assert.ok(Math.abs(imageHalfWhite - 101.5) < 5, `SDR alpha must blend after transfer conversion: ${imageHalfWhite}`);
      delete white.p.clips[white.c.id]; white.p.primary = [];
      const title = makeClip('title', { dur: .25, lane: 1, props: { text: 'White', anim: 'none', size: 32 } }); white.p.clips[title.id] = title;
      const titleWhite = maxNits(await run(white.p));
      assert.ok(titleWhite > 190 && titleWhite < 210, `SDR title white: ${titleWhite}`);
      delete white.p.clips[title.id];
      white.p.captionStyle = { ...white.p.captionStyle, size: 180, weight: 700, y: 60 };
      const caption = makeClip('caption', { dur: .25, lane: 1000, props: { text: 'White caption' } }); white.p.clips[caption.id] = caption;
      const captionWhite = maxNits(await run(white.p, { captions: 'burn' }), true);
      assert.ok(captionWhite > 190 && captionWhite < 210, `SDR caption white: ${captionWhite}`);
      report.cases.push({ name: '203 nit SDR reference white', videoWhite, imageWhite, imageHalfWhite, titleWhite, captionWhite, textMeasurement: 'Caption uses modal opaque-interior nits; lossy HEVC edge ringing is excluded.' });
      console.log('SDR video, image, title and caption reference white passed.');
      // A changing source catches timing errors that static highlight patches cannot.
      const movingRaw = path.join(dir, 'moving.raw'), movingFile = path.join(dir, 'moving.mov');
      const values = new Float32Array(320 * 180 * 3 * 12);
      for (let f = 0; f < 12; f++) values.fill(pq(100 + f * 100), f * 320 * 180 * 3, (f + 1) * 320 * 180 * 3);
      fs.writeFileSync(movingRaw, Buffer.from(values.buffer));
      ff(['-f', 'rawvideo', '-pixel_format', 'gbrpf32le', '-video_size', '320x180', '-framerate', '24', '-i', movingRaw,
        '-vf', 'zscale=tin=smpte2084:pin=bt2020:min=gbr:t=smpte2084:p=bt2020:m=bt2020nc:r=limited,format=yuv420p10le', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'lossless=1:pools=2:frame-threads=2:log-level=error',
        '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', movingFile]);
      const moving = projectFor(movingFile, { hdr: 'pq', primaries: 'bt2020', transfer: 'smpte2084', space: 'bt2020nc', range: 'tv' });
      moving.c.in = 4 / 24; moving.c.dur = moving.p.duration = 4 / 24;
      const frameNits = file => {
        const bytes = ff(['-i', file, '-vf', 'zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:t=linear:npl=203,format=gbrpf32le', '-f', 'rawvideo', 'pipe:1'], true);
        const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4), count = 320 * 180 * 3, out = [];
        for (let at = 0; at < data.length; at += count) out.push(data[at + 90 * 320 + 160] * WHITE);
        return out;
      };
      const forward = frameNits(await run(moving.p));
      assert.equal(forward.length, 4);
      forward.forEach((v, i) => assert.ok(Math.abs(v - (500 + i * 100)) < 15, `trim frame ${i}: ${v}`));
      moving.c.reverse = true;
      const reverse = frameNits(await run(moving.p));
      reverse.forEach((v, i) => assert.ok(Math.abs(v - (900 - i * 100)) < 15, `reverse frame ${i}: ${v}`));
      report.cases.push({ name: 'original frame timing after trim and reverse', forwardNits: forward, reverseNits: reverse });
      // The same project contains original PQ, HLG and SDR, with the output
      // transform applied once after composition. Samples avoid codec edges.
      const mixed=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      mixed.c.speed=0;mixed.c.freezeAt=9/24;
      const addMixed=(id,file,color,props,lane)=>{
        const item=projectFor(file,color),m={...item.m,id};mixed.p.media[id]=m;
        const c=makeClip('video',{media:m,dur:.25,lane,props});mixed.p.clips[c.id]=c;return c;
      };
      const sdrLayer=addMixed('sdr',whiteFile,{primaries:'bt709',transfer:'bt709',space:'bt709',range:'tv'},{cropL:.49},1);
      addMixed('hlg',path.join(dir,'hlg.mov'),{hdr:'hlg',primaries:'bt2020',transfer:'arib-std-b67',space:'bt2020nc',range:'tv'},{cropB:.49,cropR:.49},2);
      const rgbAt=(bytes,x,y)=>{const n=320*180,i=y*320+x,data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);return [data[2*n+i],data[i],data[n+i]];};
      const decodeSdr=file=>ff(['-i',file,'-vf','zscale=tin=bt709:pin=bt709:min=bt709:rin=limited:t=linear:p=bt709:m=gbr:r=full,format=gbrpf32le','-frames:v','1','-f','rawvideo','pipe:1'],true);
      const shoulder=y=>y<=.75?y:.75+.25*(y-.75)/(y-.5);
      const pqMixed=await run(mixed.p),pqSamples=decode(pqMixed);
      const mixedPoints=[{name:'PQ highlight',x:80,y:140,nits:1000},{name:'SDR white',x:240,y:140,nits:203},{name:'HLG highlight',x:144,y:54,nits:400},{name:'HLG midtone',x:80,y:54,nits:100},{name:'black',x:16,y:54,nits:0}];
      const mixedFormats=[];
      for(const [format,ext] of [['mp4-h264','mp4'],['mp4-hevc','mp4'],['mov-prores','mov'],['webm-vp9','webm'],['mp4-av1','mp4'],['gif','gif']]){
        const file=await run(mixed.p,{color:'sdr',format,output:path.join(dir,`mixed-sdr-${format}.${ext}`)}),metadata=info(file).streams[0];
        assert.equal(Number(metadata.width),320);assert.equal(Number(metadata.height),180);
        if(format==='gif'){mixedFormats.push({format,passed:true});continue;}
        assert.equal(metadata.color_transfer,'bt709');assert.equal(metadata.color_primaries,'bt709');assert.equal(metadata.color_space,'bt709');assert.equal(metadata.color_range,'tv');
        const bytes=decodeSdr(file),fields=mixedPoints.map(p=>{
          const hdr=rgbAt(pqSamples,p.x,p.y).map(v=>v*WHITE),sdr=rgbAt(bytes,p.x,p.y),expected=shoulder(p.nits/WHITE);
          hdr.forEach(v=>assert.ok(Math.abs(v-p.nits)<Math.max(4,p.nits*.025),`${p.name} HDR white/neutrality ${hdr}`));
          sdr.forEach(v=>assert.ok(Math.abs(v-expected)<.018,`${format} ${p.name}: ${sdr} vs ${expected}`));
          assert.ok(Math.max(...sdr)-Math.min(...sdr)<.012,`${format} ${p.name} must remain neutral: ${sdr}`);
          return {...p,hdrNits:hdr,sdrLinear:sdr,expected};
        });
        assert.ok(fields[0].sdrLinear[0]>fields[2].sdrLinear[0]+.01,'400 and 1000 nit HDR highlights remain distinct in SDR');
        mixedFormats.push({format,pixelFormat:metadata.pix_fmt,fields});
      }
      // Blend 203-nit SDR white at 50% over 1000-nit PQ: 601.5 nits,
      // then tone map. Mapping each source first gives a different result.
      sdrLayer.props.opacity=.5;
      const alphaSdr=rgbAt(decodeSdr(await run(mixed.p,{color:'sdr',format:'mov-prores',output:path.join(dir,'mixed-alpha.mov')})),240,140)[0];
      assert.ok(Math.abs(alphaSdr-shoulder(601.5/WHITE))<.01,`mixed alpha maps after composition: ${alphaSdr}`);
      const mixTr=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      mixTr.c.speed=0;mixTr.c.freezeAt=9/24;mixTr.c.dur=.125;
      const sdrMedia={...mixed.p.media.sdr,id:'transition-sdr'};mixTr.p.media[sdrMedia.id]=sdrMedia;
      const toSdr=makeClip('video',{media:sdrMedia,start:.125,dur:.125});toSdr.transition={type:'dissolve',dur:.125};mixTr.p.clips[toSdr.id]=toSdr;mixTr.p.primary.push(toSdr.id);
      const trPq=frameNits(await run(mixTr.p));assert.ok(Math.abs(trPq[3]-601.5)<18,`HDR/SDR dissolve midpoint: ${trPq}`);
      const trFile=await run(mixTr.p,{color:'sdr',format:'mp4-h264'}),trBytes=ff(['-i',trFile,'-vf','zscale=tin=bt709:pin=bt709:min=bt709:rin=limited:t=linear:p=bt709:m=gbr:r=full,format=gbrpf32le','-f','rawvideo','pipe:1'],true);
      const trData=new Float32Array(trBytes.buffer,trBytes.byteOffset,trBytes.length/4),trSdr=Array.from({length:6},(_,i)=>trData[i*320*180*3+90*320+160]);
      trSdr.forEach((v,i)=>assert.ok(Math.abs(v-shoulder(trPq[i]/WHITE))<.012,`HDR/SDR dissolve SDR frame ${i}: ${v}`));
      // Saturated BT.2020 primaries fit inside Rec.709 without channel clipping
      // becoming an arbitrary hue shift. Neutral highlight ramp stays monotonic.
      const gamut=projectFor(path.join(dir,'pq.mov'),{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      const gamutBytes=decodeSdr(await run(gamut.p,{color:'sdr',format:'mov-prores',output:path.join(dir,'gamut-sdr.mov')}));
      const primaries=[240,272,304].map(x=>rgbAt(gamutBytes,x,54));
      primaries.flat().forEach(v=>assert.ok(v>-.008&&v<1.008,`SDR gamut fit bounds: ${v}`));
      const fittedPrimaries=[[1,.0584,.1145],[0,.9217,.2609],[0,.0289,.5347]];
      primaries.forEach((rgb,i)=>rgb.forEach((v,c)=>assert.ok(Math.abs(v-fittedPrimaries[i][c])<.018,`Rec.709 primary hue/luminance fit ${i}: ${rgb}`)));
      const grayLevels=[16,48,80,112,144,176,208].map(x=>rgbAt(gamutBytes,x,54)[0]);
      grayLevels.forEach((v,i)=>{if(i)assert.ok(v>=grayLevels[i-1]-.002,'highlight ordering');});
      report.cases.push({name:'mixed PQ, HLG and SDR in one project, exported to HDR and SDR',formats:mixedFormats,alphaSdr,transitionPqNits:trPq,transitionSdrLinear:trSdr,widePrimarySdr:primaries,grayLevels});
      console.log('Mixed PQ/HLG/SDR: both outputs, SDR codecs, alpha, transition and gamut fit passed.');
      const effectsProject=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      effectsProject.c.speed=0;effectsProject.c.freezeAt=9/24;
      const fxCases={blur:{amount:4},saturation:{amount:.7},contrast:{amount:1.1},opacity:{amount:.8},solid:{amount:.1,color:'#487cff'},gradient:{amount:.1},noise:{amount:.1},rgbSplit:{amount:.1},chromatic:{amount:.3},scanlines:{amount:.3},glitch:{amount:.1},glow:{amount:.1,radius:4},motionBlur:{amount:12},hueSaturation:{redHue:15},filmGrain:{amount:.1},vhs:{amount:.2},chroma:{},luma:{},lightLeak:{},lights:{base:.3},lensFlare:{occlusion:1}};
      const effectResults=[];
      for(const [type,p] of Object.entries(fxCases)){
        effectsProject.c.props.vfx=[{id:'fx',type,p}];
        const nits=frameNits(await run(effectsProject.p))[0];
        assert.ok(Number.isFinite(nits)&&nits>250&&nits<3000,`${type} must preserve HDR headroom: ${nits}`);
        effectResults.push({type,nits});
      }
      effectsProject.c.props.vfx=[];
      Object.assign(effectsProject.c.props,{contrast:.2,saturation:.1,temperature:.1,highlights:-.1,shadows:.1,gainL:.1});
      const gradeNits=frameNits(await run(effectsProject.p))[0];assert.ok(gradeNits>250&&gradeNits<3000);
      report.cases.push({name:'native HDR source effects and color grading',effectResults,gradeNits});
      effectsProject.c.props.film='portra400';effectsProject.c.props.filmMix=.7;
      const filmNits=frameNits(await run(effectsProject.p))[0];assert.ok(filmNits>250&&filmNits<3000);
      report.cases.push({name:'HDR film look preserves highlight scale',filmNits});
      const masked=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      masked.c.speed=0;masked.c.freezeAt=9/24;
      Object.assign(masked.c.props,{vfx:[{id:'fill',type:'solid',p:{amount:1,color:'#ffffff'}}],masks:[{id:'m',effect:'fill',shape:'rect',mode:'add'}],'mask.m.x':-80,'mask.m.y':0,'mask.m.w':160,'mask.m.h':180});
      const maskBytes=decode(await run(masked.p)),maskData=new Float32Array(maskBytes.buffer,maskBytes.byteOffset,maskBytes.length/4);
      assert.ok(Math.abs(maskData[90*320+80]*WHITE-203)<8,'masked effect applies inside');
      assert.ok(Math.abs(maskData[90*320+240]*WHITE-1000)<20,'masked effect preserves HDR outside');
      masked.c.props.vfx=[];masked.c.props.masks[0].effect=null;
      const visibleBytes=decode(await run(masked.p)),visibleData=new Float32Array(visibleBytes.buffer,visibleBytes.byteOffset,visibleBytes.length/4);
      assert.ok(Math.abs(visibleData[90*320+80]*WHITE-1000)<20);assert.ok(visibleData[90*320+240]*WHITE<1);
      masked.c.props.masks=[];
      const adjust=makeClip('adjustment',{dur:.25,lane:1,props:{exposure:-.5}});masked.p.clips[adjust.id]=adjust;
      const adjustmentNits=frameNits(await run(masked.p))[0];assert.ok(Math.abs(adjustmentNits-500)<15);
      adjust.props.exposure=0;adjust.props.vfx=[{id:'fade',type:'opacity',p:{amount:.5}}];
      const adjustmentAlphaNits=frameNits(await run(masked.p))[0];assert.ok(Math.abs(adjustmentAlphaNits-1000)<25,'transparent adjustment must not add light twice');
      report.cases.push({name:'HDR effect masks, visibility masks and adjustment layers',adjustmentNits});
      const natural=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      natural.c.in=4/24;natural.c.props.vfx=[{id:'motion',type:'naturalMotionBlur',p:{amount:.5,rollingShutter:true}}];
      const naturalNits=frameNits(await run(natural.p));assert.ok(naturalNits.every(n=>Number.isFinite(n)&&n>250&&n<1500));
      report.cases.push({name:'HDR temporal motion reconstruction',naturalNits});
      const barRaw=path.join(dir,'moving-bar.raw'),barFile=path.join(dir,'moving-bar.mov'),barData=new Float32Array(320*180*3*12);
      barData.fill(pq(100));
      for(let f=0;f<12;f++)for(let y=50;y<130;y++)for(let x=40+f*6;x<80+f*6;x++)for(let c=0;c<3;c++)barData[f*320*180*3+c*320*180+y*320+x]=pq(1000);
      fs.writeFileSync(barRaw,Buffer.from(barData.buffer));
      ff(['-f','rawvideo','-pixel_format','gbrpf32le','-video_size','320x180','-framerate','24','-i',barRaw,'-vf','zscale=tin=smpte2084:pin=bt2020:min=gbr:t=smpte2084:p=bt2020:m=bt2020nc:r=limited,format=yuv420p10le','-c:v','libx265','-preset','ultrafast','-x265-params','lossless=1:pools=2:frame-threads=2:log-level=error','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc',barFile]);
      const bar=projectFor(barFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});bar.c.in=4/24;
      const row=file=>{const bytes=ff(['-i',file,'-vf','select=eq(n\\,2),zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:t=linear:npl=203,format=gbrpf32le','-frames:v','1','-f','rawvideo','pipe:1'],true),data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);return Array.from(data.subarray(90*320,91*320),v=>v*WHITE);};
      const sharp=row(await run(bar.p));bar.c.props.vfx=[{id:'natural',type:'naturalMotionBlur',p:{amount:1}}];const blurred=row(await run(bar.p));
      const intermediate=r=>r.filter(v=>v>200&&v<900).length;
      assert.ok(Math.max(...blurred)>900,'temporal blur retains HDR peak');assert.ok(intermediate(blurred)>intermediate(sharp)+1,`motion reconstruction must spread an HDR moving edge: ${intermediate(sharp)} → ${intermediate(blurred)}`);
      assert.ok(blurred[76]>550&&blurred[76]<750,'HDR moving-edge integration uses linear light');
      Object.assign(bar.c.props,{masks:[{id:'motionMask',effect:'natural',shape:'rect',mode:'add'}],'mask.motionMask.w':640,'mask.motionMask.h':360,'mask.motionMask.opacity':.5});
      bar.c.props['mask.motionMask.opacity']=1;const fullMasked=row(await run(bar.p));bar.c.props['mask.motionMask.opacity']=.5;
      const halfMasked=row(await run(bar.p));
      // Fit the complete edge profile: lossy HEVC can ring at one edge pixel.
      // The fitted strength distinguishes one 50% blend from accidental 25% coverage.
      let numerator=0,denominator=0,error=0,fullError=0;
      for(let i=0;i<sharp.length;i++){const delta=blurred[i]-sharp[i];numerator+=(halfMasked[i]-sharp[i])*delta;denominator+=delta*delta;error+=(halfMasked[i]-(sharp[i]+delta*.5))**2;fullError+=(fullMasked[i]-blurred[i])**2;}
      const measuredMaskStrength=numerator/denominator,maskProfileRmseNits=Math.sqrt(error/sharp.length),fullMaskProfileRmseNits=Math.sqrt(fullError/sharp.length);
      assert.ok(Math.abs(measuredMaskStrength-.5)<.05&&maskProfileRmseNits<10,`half-opacity motion mask applies once: ${measuredMaskStrength}, RMSE ${maskProfileRmseNits}`);
      assert.ok(fullMaskProfileRmseNits<3,'a full-opacity mask preserves the unmasked reconstruction');
      report.cases.push({name:'HDR moving-edge temporal blur',sharpEdgePixels:intermediate(sharp),blurredEdgePixels:intermediate(blurred),peakNits:Math.max(...blurred),linearEdgeNits:blurred[76],measuredMaskStrength,maskProfileRmseNits,fullMaskProfileRmseNits});
      const referenceFilters=require('../src/main/ffmpeg').decodeFilters({color:{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'}});
      const reference=ff(['-ss',String(9/24),'-i',movingFile,'-vf',`${referenceFilters},scale=32:18,format=rgba`,'-frames:v','1','-f','rawvideo','pipe:1'],true);
      const diff=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});diff.c.speed=0;diff.c.freezeAt=9/24;
      diff.c.props.vfx=[{id:'key',type:'difference',p:{reference:{width:32,height:18,pixels:reference.toString('base64')}}}];
      const removedNits=frameNits(await run(diff.p))[0];assert.ok(removedNits<1,`matching viewer reference removes background: ${removedNits}`);
      const black=Buffer.alloc(32*18*4);for(let i=3;i<black.length;i+=4)black[i]=255;diff.c.props.vfx[0].p.reference.pixels=black.toString('base64');
      const retainedNits=frameNits(await run(diff.p))[0];assert.ok(Math.abs(retainedNits-1000)<25,'difference matte retains original HDR RGB');
      report.cases.push({name:'HDR background-reference matte with original HDR foreground',removedNits,retainedNits});
      const colors=projectFor(path.join(dir,'pq.mov'),{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      colors.c.props.vfx=[{id:'hsl',type:'hueSaturation',p:{redHue:60}}];
      const hueFields=samplePlanar(decode(await run(colors.p)),320,180,'pq'),redShift=hueFields[7].measured;
      assert.ok(redShift[0]>.8&&redShift[1]>.8&&redShift[2]<.1,'selective HDR red hue shifts towards yellow');
      colors.c.props.vfx=[{id:'sat',type:'saturation',p:{amount:0}}];
      const monoRed=samplePlanar(decode(await run(colors.p)),320,180,'pq')[7].measured;
      assert.ok(monoRed.every(v=>Math.abs(v-.2627)<.03),'HDR saturation uses BT.2020 luminance');
      colors.c.props.vfx=[{id:'fill',type:'solid',p:{color:'#ff0000',amount:1}}];
      const fillRed=samplePlanar(decode(await run(colors.p)),320,180,'pq')[4].measured;
      [.627403896,.069097289,.016391439].forEach((v,i)=>assert.ok(Math.abs(fillRed[i]-v)<.025,'sRGB fill converts to BT.2020'));
      const grayHue=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});grayHue.c.speed=0;grayHue.c.freezeAt=9/24;grayHue.c.props.hue=90;
      const grayHueBytes=decode(await run(grayHue.p)),grayHueData=new Float32Array(grayHueBytes.buffer,grayHueBytes.byteOffset,grayHueBytes.length/4),grayHueNits=[grayHueData[2*320*180+90*320+160],grayHueData[90*320+160],grayHueData[320*180+90*320+160]].map(v=>v*WHITE);
      assert.ok(grayHueNits.every(v=>Math.abs(v-1000)<25),'HDR Hue Shift keeps gray neutral');
      report.cases.push({name:'HDR hue, luminance and generated-color gamut',redShift,monoRed,fillRed,grayHueNits});
      const keyRaw=path.join(dir,'hdr-key.raw'),keyFile=path.join(dir,'hdr-key.mov'),keyData=new Float32Array(320*180*3),keyRGB=[0,177/255,64/255].map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      const green2020=[[.627403896,.329283038,.043313066],[.069097289,.919540395,.011362316],[.016391439,.088013308,.895595253]].map(row=>row.reduce((s,x,i)=>s+x*keyRGB[i],0)*WHITE);
      for(let y=0;y<180;y++)for(let x=0;x<320;x++){const color=x>=120&&x<200&&y>=50&&y<130?[1000,1000,1000]:green2020,i=y*320+x;keyData[i]=pq(color[1]);keyData[320*180+i]=pq(color[2]);keyData[2*320*180+i]=pq(color[0]);}
      fs.writeFileSync(keyRaw,Buffer.from(keyData.buffer));
      ff(['-stream_loop','-1','-f','rawvideo','-pixel_format','gbrpf32le','-video_size','320x180','-framerate','24','-i',keyRaw,'-frames:v','12','-vf','zscale=tin=smpte2084:pin=bt2020:min=gbr:t=smpte2084:p=bt2020:m=bt2020nc:r=limited,format=yuv420p10le','-c:v','libx265','-preset','ultrafast','-x265-params','lossless=1:pools=2:frame-threads=2:log-level=error','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc',keyFile]);
      const composite=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});composite.c.speed=0;composite.c.freezeAt=9/24;
      const fg={...composite.m,id:'key-foreground',path:keyFile,streams:{main:{...composite.m.streams.main,path:keyFile}}};composite.p.media[fg.id]=fg;
      const keyed=makeClip('video',{media:fg,lane:1,dur:.25,props:{vfx:[{id:'key',type:'chroma',p:{color:'#00b140'}},{id:'blur',type:'blur',p:{amount:10}},{id:'alpha',type:'opacity',p:{amount:.8}}]}});composite.p.clips[keyed.id]=keyed;
      const keyedBytes=decode(await run(composite.p)),keyedData=new Float32Array(keyedBytes.buffer,keyedBytes.byteOffset,keyedBytes.length/4),keyedRow=Array.from(keyedData.subarray(90*320,91*320),v=>v*WHITE);
      assert.ok(Math.min(...keyedRow)>930&&Math.max(...keyedRow)<1070,'key → blur → opacity preserves HDR without dark alpha fringes');
      report.cases.push({name:'HDR key, wide Gaussian blur and opacity without dark fringes',minimumNits:Math.min(...keyedRow),maximumNits:Math.max(...keyedRow)});
      keyed.props.vfx=[{id:'key',type:'chroma',p:{color:'#00b140'}},{id:'fill',type:'solid',p:{color:'#ffffff',amount:.5,preserveAlpha:false}}];
      const filledBytes=decode(await run(composite.p)),filledData=new Float32Array(filledBytes.buffer,filledBytes.byteOffset,filledBytes.length/4),filledRow=Array.from(filledData.subarray(90*320,91*320),v=>v*WHITE);
      // Test fill coverage in flat foreground/background regions. The 4:2:0
      // key plate has chroma reconstruction at its boundary, independent of fill.
      const flatRegionNits=[[0,100],[140,180],[220,320]].map(([a,b])=>filledRow.slice(a,b).reduce((s,v)=>s+v,0)/(b-a));
      assert.ok(flatRegionNits.every(v=>Math.abs(v-601.5)<8),'partial color fill composites premultiplied coverage correctly after keying');
      report.cases.push({name:'HDR fill over keyed transparency',flatRegionNits,expectedNits:601.5});
      console.log('HDR effects and grading passed.');
      const transitionResults=[];
      for(const type of ['dissolve','dip','dipWhite','slideLeft','slideRight','slideUp','wipe','circle','zoom','blur']){
        const {p,c,m}=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
        c.speed=0;c.freezeAt=9/24;c.dur=.125;
        const next=makeClip('video',{media:m,start:.125,dur:.125,props:{exposure:-1}});next.speed=0;next.freezeAt=9/24;next.transition={type,dur:.125};p.clips[next.id]=next;p.primary.push(next.id);
        const nits=frameNits(await run(p));
        assert.ok(Math.abs(nits[0]-1000)<20,`${type} start: ${nits}`);
        assert.ok(Math.abs(nits.at(-1)-250)<10,`${type} end: ${nits}`);
        if(['dissolve','zoom','blur'].includes(type))assert.ok(Math.abs(nits[3]-625)<20,`${type} linear midpoint: ${nits}`);
        if(type==='dip')assert.ok(nits[3]<1,'dip reaches black');
        if(type==='dipWhite')assert.ok(Math.abs(nits[3]-203)<6,'dipWhite uses SDR reference white');
        transitionResults.push({type,nits});
      }
      report.cases.push({name:'all HDR transitions',transitionResults});
      const overlay=projectFor(movingFile,{hdr:'pq',primaries:'bt2020',transfer:'smpte2084',space:'bt2020nc',range:'tv'});
      overlay.c.speed=0;overlay.c.freezeAt=9/24;
      const top=makeClip('video',{media:overlay.m,lane:1,dur:.25,props:{exposure:-1}});top.speed=0;top.freezeAt=9/24;top.transition={type:'dissolve',dur:.25};overlay.p.clips[top.id]=top;
      const overlayNits=frameNits(await run(overlay.p));assert.ok(Math.abs(overlayNits[3]-625)<20,'overlay fade preserves lower HDR layer');
      top.transition={type:'slideLeft',dur:.25,motionBlur:true};const shutterNits=frameNits(await run(overlay.p));assert.ok(shutterNits.every(Number.isFinite));
      report.cases.push({name:'HDR overlay transitions and shutter integration',overlayNits,shutterNits});
      top.transition=null;Object.assign(top.props,{scale:.5,radius:20,border:6,shadow:.8,shadowOpacity:.6,shadowOffsetX:24,shadowOffsetY:8});
      const decoratedBytes=decode(await run(overlay.p)),decorated=new Float32Array(decoratedBytes.buffer,decoratedBytes.byteOffset,decoratedBytes.length/4),pixel=(x,y)=>decorated[y*320+x]*WHITE;
      assert.ok(Math.abs(pixel(160,90)-250)<15,'decorated video retains its HDR foreground');assert.ok(Math.abs(pixel(81,46)-1000)<30,'rounded corner reveals HDR background');assert.ok(pixel(250,90)>250&&pixel(250,90)<800,`shadow darkens HDR background without clipping: ${pixel(250,90)}`);
      report.cases.push({name:'HDR rounded corners, borders and shadows',centerNits:pixel(160,90),cornerNits:pixel(81,46),shadowNits:pixel(250,90)});
      console.log('All ten HDR transitions passed.');
      // These are read-only source checks. Output and the profile stay in the temp folder.
      if (process.argv.includes('--samples')) {
        let baseline = null;
        if (process.argv.includes('--baseline-ref')) {
          const ref = option('--baseline-ref');
          assert.match(ref, /^[a-zA-Z0-9._/-]+$/);
          const source = execFileSync('git', ['show', `${ref}:src/worker/export.js`], { cwd: root, encoding: 'utf8' });
          require('esbuild').buildSync({ stdin: { contents: source, resolveDir: path.join(root, 'src/worker'), sourcefile: 'baseline-export.js' }, bundle: true, platform: 'browser', format: 'iife', external: ['fs', 'path', 'os', 'child_process', 'electron'], outfile: path.join(dir, 'baseline.js') });
          fs.writeFileSync(path.join(dir, 'baseline.html'), '<!doctype html><script src="baseline.js"></script>');
          baseline = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
          await baseline.loadFile(path.join(dir, 'baseline.html'));
          report.sdrBaselineRef = ref;
        }
        const folder = option('--samples'),controls=[];
        for (const name of fs.readdirSync(folder).filter(f => /\.mp4$/i.test(f))) {
          const file = path.join(folder, name), before = fs.statSync(file), meta = info(file), st = meta.streams.find(s => s.codec_type === 'video');
          const color = { space: st.color_space, transfer: st.color_transfer, primaries: st.color_primaries, range: st.color_range };
          const { p, m } = projectFor(file, color, st.width, st.height, Number(meta.format.duration));
          m.streams.main.hasAudio = meta.streams.some(s => s.codec_type === 'audio');
          controls.push(m);
          const settings = { size: { preset: 'custom', w: 320, h: 180 }, fps: 24, preview: false };
          const hdr = await run(p, settings), hdrInfo = info(hdr);
          assert.equal(hdrInfo.streams[0].color_transfer, 'smpte2084');
          const sdr = await run(p, { ...settings, color: 'sdr', format: 'mp4-h264', forceFfmpeg: true });
          const sdrInfo = info(sdr);
          assert.equal(sdrInfo.streams[0].pix_fmt, 'yuv420p');
          assert.notEqual(sdrInfo.streams[0].color_transfer, 'smpte2084');
          if (baseline) {
            const old = await run(p, { ...settings, color: 'sdr', format: 'mp4-h264', forceFfmpeg: true }, baseline);
            const md5 = file => ff(['-i', file, '-map', '0:v:0', '-f', 'framemd5', '-']).split('\n').filter(line => line && !line.startsWith('#')).join('\n');
            assert.equal(md5(sdr), md5(old), 'decoded SDR frames must match the pre-HDR worker exactly');
          }
          const after = fs.statSync(file); assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
          report.cases.push({ name: `SDR control: ${name}`, hdrAndSdrExport: true, audioMuxed: hdrInfo.streams.some(s => s.codec_type === 'audio'), originalUnchanged: true, ...(baseline ? { sdrFramesMatchBaseline: true } : {}) });
          console.log('SDR control passed:', name);
        }
        if(controls.length>=2){
          const mix=newProject('SDR controls with HDR effects and transition');mix.width=320;mix.height=180;mix.fps=24;mix.duration=.5;
          controls.slice(0,2).forEach((media,i)=>{
            const m={...media,id:`control-${i}`};mix.media[m.id]=m;
            const clip=makeClip('video',{media:m,start:i*.25,dur:.25,props:i?{film:'portra400',filmMix:.4}:{vfx:[{id:'blur',type:'blur',p:{amount:2}},{id:'glow',type:'glow',p:{amount:.08,radius:3}}]}});
            if(i)clip.transition={type:'dissolve',dur:.25};mix.clips[clip.id]=clip;mix.primary.push(clip.id);
          });
          const file=await run(mix,{preview:false}),st=info(file).streams[0];assert.equal(st.color_transfer,'smpte2084');assert.equal(Number(st.nb_frames),12);
          report.cases.push({name:'real MP4 controls combined with effects, film look, audio and transition',pqFrames:Number(st.nb_frames),passed:true});
          console.log('Real MP4 edit with HDR effects and transition passed.');
        }
        baseline?.destroy();
      }
      fs.writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(report, null, 2));
      console.log('HDR product worker checks passed. Files:', dir);
      clearTimeout(timeout); win.destroy(); app.exit(0);
    } catch (e) {
      console.error(e); console.error('Test files:', dir); clearTimeout(timeout); app.exit(1);
    }
  });
}
