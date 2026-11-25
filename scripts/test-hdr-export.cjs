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
  const { app, BrowserWindow, ipcMain } = electron;
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
          c.props.exposure = -1;
          const dark = await run(p), darkFields = samplePlanar(decode(dark), 320, 180, 'pq');
          assert.ok(Math.abs(darkFields[4].measured[0] * WHITE - 500) < 12, 'minus one stop halves 1000 nit white');
          c.props.exposure = 0; c.lane = 1; p.primary = [];
          const top = makeClip('video', { media: p.media.source, dur: .25, lane: 2, props: { exposure: -2, opacity: .5 } }); p.clips[top.id] = top;
          const blend = await run(p), blendFields = samplePlanar(decode(blend), 320, 180, 'pq');
          assert.ok(Math.abs(blendFields[4].measured[0] * WHITE - 625) < 15, 'linear alpha: 1000*.5 + 250*.5 = 625 nits');
          report.cases.push({ name: 'linear exposure and two-layer alpha', minusOneStopNits: darkFields[4].measured[0] * WHITE, blendNits: blendFields[4].measured[0] * WHITE });
          delete p.clips[top.id]; c.lane = 0; p.primary = [c.id];
          c.props.saturation = .2;
          await assert.rejects(run(p), /saturation.*not supported/);
          c.props.saturation = 0;
          await assert.rejects(run(p, { sourceMedia: 'optimized' }), /original media/);
          report.cases.push({ name: 'unsupported grading and SDR proxies rejected', passed: true });
        }
      }
      // SDR reference white must be 203 nits for video, raster images and text.
      const whiteFile = path.join(dir, 'sdr-white.mp4'), whiteImage = path.join(dir, 'sdr-white.png');
      ff(['-f', 'lavfi', '-i', 'color=white:s=320x180:r=24:d=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', whiteFile]);
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
        for (let at = 0; at < data.length; at += count) out.push(data[at + 1000] * WHITE);
        return out;
      };
      const forward = frameNits(await run(moving.p));
      assert.equal(forward.length, 4);
      forward.forEach((v, i) => assert.ok(Math.abs(v - (500 + i * 100)) < 15, `trim frame ${i}: ${v}`));
      moving.c.reverse = true;
      const reverse = frameNits(await run(moving.p));
      reverse.forEach((v, i) => assert.ok(Math.abs(v - (900 - i * 100)) < 15, `reverse frame ${i}: ${v}`));
      report.cases.push({ name: 'original frame timing after trim and reverse', forwardNits: forward, reverseNits: reverse });
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
        const folder = option('--samples');
        for (const name of fs.readdirSync(folder).filter(f => /\.mp4$/i.test(f))) {
          const file = path.join(folder, name), before = fs.statSync(file), meta = info(file), st = meta.streams.find(s => s.codec_type === 'video');
          const color = { space: st.color_space, transfer: st.color_transfer, primaries: st.color_primaries, range: st.color_range };
          const { p, m } = projectFor(file, color, st.width, st.height, Number(meta.format.duration));
          m.streams.main.hasAudio = meta.streams.some(s => s.codec_type === 'audio');
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
