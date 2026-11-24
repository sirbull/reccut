// Isolated HDR feasibility study. Does not launch Reccut or change src/user projects.
// node scripts/hdr-spike.cjs [--ffprobe path] [--frames 12] [--out report.json] [--fetch-probe]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
const argument = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [__filename, ...process.argv.slice(2)], { env, cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, screen } = electron;
  app.on('window-all-closed', () => {}); // Cases deliberately destroy/recreate their isolated windows.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-hdr-spike-'));
  app.setPath('userData', path.join(dir, 'profile'));
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  const ffmpeg = require('../src/main/ffmpeg-path');
  const { WHITE, patches, pattern, samplePlanar, correctHlgRgb, prepareHlgPlanar } = require('./hdr-spike/fixtures.cjs');
  const reportFile = path.resolve(argument('--out', path.join(root, 'docs/hdr-spike-results.json')));
  const frameCount = Math.max(2, Math.min(120, Number(argument('--frames', 12)) || 12));
  const report = { id: new Date().toISOString(), platform: process.platform, arch: process.arch, temporaryDirectory: dir,
    scope: 'Feasibility study on this machine only; no product HDR implementation or display/player/YouTube acceptance.',
    environment: { versions: process.versions, cpu: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(), ramGB: os.totalmem() / 1024 ** 3 }, tests: {}, errors: [] };
  const version = tool => execFileSync(tool, ['-version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0];
  const sha = file => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'), s = fs.createReadStream(file); s.on('data', b => h.update(b)); s.on('end', () => resolve(h.digest('hex'))); s.on('error', reject); });
  function command(tool, args, { binary = false, input, timeout = 180000 } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(tool, args, { windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
      const chunks = []; let stderr = '';
      const timer = setTimeout(() => child.kill(), timeout);
      child.stdout.on('data', b => chunks.push(b)); child.stderr.on('data', b => { stderr = (stderr + b).slice(-20000); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); const output = Buffer.concat(chunks); code === 0 ? resolve(binary ? output : output.toString()) : reject(Error(`${path.basename(tool)} exited ${code}: ${stderr.slice(-5000)}`)); });
      if (input) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    });
  }
  const ff = (args, options) => command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], options);
  const trc = transfer => transfer === 'pq' ? 'smpte2084' : 'arib-std-b67';
  const decodeFilter = transfer => `zscale=tin=${trc(transfer)}:min=bt2020nc:pin=bt2020:t=linear:npl=${WHITE},format=gbrpf32le`;
  async function fetchProbe() {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('--fetch-probe currently supports the pinned Windows x64 archive; use --ffprobe on other platforms.');
    const url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n9.0.2-39-g7adfbe40dc-win64-gpl-9.0.zip';
    const archive = path.join(dir, 'ffmpeg-tools.zip');
    console.log('Fetching matching ffprobe from the pinned FFmpeg archive (tools only, no models).');
    const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw Error(`Tool archive HTTP ${r.status}`);
    const { pipeline } = require('node:stream/promises');
    await pipeline(require('node:stream').Readable.fromWeb(r.body), fs.createWriteStream(archive));
    if (await sha(archive) !== '693f3e224bc184b40524a62ca47526cfebaf2504414021b92fe75f677ad868b9') throw Error('Tool archive checksum mismatch.');
    const list = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/);
    const entry = list.find(p => /\/bin\/ffprobe\.exe$/.test(p));
    if (!entry || entry.includes('..') || path.isAbsolute(entry)) throw Error('No safe ffprobe entry in archive.');
    execFileSync('tar', ['-xf', archive, '-C', dir, entry], { windowsHide: true });
    return path.join(dir, entry);
  }
  async function runCase(name, fn) {
    console.log(name);
    try { const value = await fn(); report.tests[name] = value; return value; }
    catch (error) { report.tests[name] = { status: 'error', error: error.message }; report.errors.push({ test: name, error: error.message }); }
    finally { fs.writeFileSync(path.join(dir, 'partial-results.json'), JSON.stringify(report, null, 2)); }
  }
  function save() {
    let previous = { schemaVersion: 1, runs: [] };
    if (fs.existsSync(reportFile)) previous = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    if (!Array.isArray(previous.runs)) throw Error('Refusing to overwrite an unrecognized report format.');
    report.validationLevel = report.environment.renderer?.secureContext && report.tests.T7_preview && !report.errors.length
      ? `${process.platform}-technical-feasibility` : 'incomplete-or-preliminary';
    if (report.validationLevel.endsWith('-technical-feasibility')) previous.latestValidatedRun = report.id;
    previous.runs.push(report);
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    const temporaryPaths = previous.runs.map(r => r.temporaryDirectory).filter(p => p && p !== '<temporary>');
    fs.writeFileSync(reportFile, JSON.stringify(previous, (_key, value) => {
      if (typeof value !== 'string') return value;
      for (const p of temporaryPaths) value = value.replaceAll(p, '<temporary>');
      return value.replaceAll(root, '<workspace>');
    }, 2) + '\n');
  }
  app.whenReady().then(async () => {
    let win, memoryTimer;
    try {
      report.environment.ffmpeg = { version: version(ffmpeg), sha256: await sha(ffmpeg) };
      report.environment.gpu = await app.getGPUInfo('complete');
      report.environment.gpuFeatures = app.getGPUFeatureStatus();
      report.environment.displays = screen.getAllDisplays().map(d => ({ size: d.size, colorDepth: d.colorDepth, colorSpace: d.colorSpace, displayFrequency: d.displayFrequency, depthPerComponent: d.depthPerComponent }));
      let ffprobe = argument('--ffprobe', null);
      if (!ffprobe && process.argv.includes('--fetch-probe')) ffprobe = await fetchProbe();
      if (!ffprobe) { const candidate = path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'); if (fs.existsSync(candidate)) ffprobe = candidate; }
      report.environment.ffprobe = ffprobe ? { version: version(ffprobe), sha256: await sha(ffprobe) } : null;
      const encoders = await command(ffmpeg, ['-hide_banner', '-encoders']), filters = await command(ffmpeg, ['-hide_banner', '-filters']);
      report.environment.ffmpegCapabilities = { zscale: /\bzscale\b/.test(filters), encoders: ['libx265', 'libaom-av1', 'libvpx-vp9', 'prores_ks'].filter(e => encoders.includes(e)) };
      const fixtures = [];
      await runCase('fixtures', async () => {
        for (const [w, h] of [[1920, 1080], [3840, 2160]]) for (const transfer of ['pq', 'hlg']) {
          const file = path.join(dir, `${transfer}-${h}.mov`), raw = path.join(dir, `${transfer}-${h}.gbrpf32le`);
          fs.writeFileSync(raw, pattern(w, h, transfer));
          await ff(['-stream_loop', '-1', '-f', 'rawvideo', '-pixel_format', 'gbrpf32le', '-video_size', `${w}x${h}`, '-framerate', '24', '-i', raw, '-frames:v', String(frameCount),
            '-vf', `zscale=tin=${trc(transfer)}:pin=bt2020:min=gbr:t=${trc(transfer)}:p=bt2020:m=bt2020nc:r=limited,format=yuv420p10le`,
            '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'lossless=1:pools=2:frame-threads=2:repeat-headers=1',
            '-color_primaries', 'bt2020', '-color_trc', trc(transfer), '-colorspace', 'bt2020nc', '-tag:v', 'hvc1', file]);
          fixtures.push({ file, raw, w, h, transfer });
        }
        // The SDR reference is the same source tonemapped through today's actual filter chain.
        const { videoFilters } = require('../src/main/ffmpeg');
        await ff(['-i', fixtures[0].file, '-vf', videoFilters({ color: { hdr: 'pq' } }).join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'sdr-ref.mp4')]);
        return { status: 'complete', files: fixtures, referenceWhiteNits: WHITE, hlgAssumption: '1000 nit nominal display, gamma 1.2, black 0. HLG is relative; valid patches stop at 1000 nits.', fields: { pq: patches('pq'), hlg: patches('hlg') } };
      });
      const esbuild = require('esbuild');
      const gradeSource = fs.readFileSync(path.join(root, 'src/shared/grade.js'), 'utf8');
      const gradeExtension = fs.readFileSync(path.join(__dirname, 'hdr-spike/grade-probe.txt'), 'utf8');
      const bundle = await esbuild.build({ entryPoints: [path.join(__dirname, 'hdr-spike/renderer.js')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome140',
        plugins: [{ name: 'isolated-grade-probe', setup(build) { build.onLoad({ filter: /[\\/]shared[\\/]grade\.js$/ }, () => ({
          contents: gradeSource.replace('gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, img);', 'if (img.hdrPixels) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, img.hdrPixels); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, img);') + gradeExtension,
          loader: 'js', resolveDir: path.join(root, 'src/shared'),
        })); } }],
      });
      const html = path.join(dir, 'probe.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>Reccut HDR feasibility study</title>');
      const createWindow = async () => {
        const w = new BrowserWindow({ show: false, width: 640, height: 480, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
        w.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
        await w.loadFile(html);
        await w.webContents.executeJavaScript(`window.hdrDirectory=${JSON.stringify(dir)};window.hdrRoot=${JSON.stringify(root)};`);
        await w.webContents.executeJavaScript(bundle.outputFiles[0].text);
        return w;
      };
      win = await createWindow();
      report.environment.renderer = await win.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2'),e=g?.getExtension('WEBGL_debug_renderer_info');const info={secureContext:isSecureContext,videoDecoder:typeof VideoDecoder,videoEncoder:typeof VideoEncoder,webglRenderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g?.getParameter(g.RENDERER)};g?.getExtension('WEBGL_lose_context')?.loseContext();return info})()`);
      const call = (method, value = {}) => win.webContents.executeJavaScript(`window.hdrSpike.${method}(${JSON.stringify(value)})`);
      await runCase('T1_canvas', () => call('canvas'));
      await runCase('T2_decode', () => call('decode', { fixtures }));
      await runCase('T3_linear', async () => {
        const results = [];
        for (const f of fixtures) {
          const start = performance.now();
          const bytes = await ff(['-i', f.file, '-vf', decodeFilter(f.transfer), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', 'pipe:1'], { binary: true });
          const ms = performance.now() - start, fields = samplePlanar(bytes, f.w, f.h, f.transfer);
          const throughputStart = performance.now();
          await ff(['-i', f.file, '-vf', decodeFilter(f.transfer), '-frames:v', String(frameCount), '-pix_fmt', 'gbrpf32le', '-f', 'null', '-']);
          const throughputMs = performance.now() - throughputStart;
          const correctedFields = f.transfer === 'hlg' ? fields.map(field => {
            const measured = correctHlgRgb(field.measured);
            return { ...field, measured, relativeOrWhiteError: Math.max(...measured.map((v, c) => Math.abs(v - field.expected[c]) / Math.max(field.expected[c], 1))) };
          }) : null;
          const linear = path.join(dir, `linear-${f.transfer}-${f.h}.bin`); fs.writeFileSync(linear, bytes); f.linear = linear;
          const upload = await call('upload', { file: linear, w: f.w, h: f.h });
          results.push({ transfer: f.transfer, height: f.h, decodeOneFrameMs: ms, conversionFpsIncludingStartup: frameCount / (throughputMs / 1000), throughputFrames: frameCount,
            fields, maxError: Math.max(...fields.map(p => p.relativeOrWhiteError)), correctedFields, correctedMaxError: correctedFields && Math.max(...correctedFields.map(p => p.relativeOrWhiteError)), upload });
        }
        return { status: results.every(r => r.maxError < 0.01 && r.upload.floatTexturePreserved) ? 'pass' : 'partial', results,
          hlgCaution: 'Raw zscale HLG npl=203 is verified independently against luminance-dependent BT.2100 OOTF patches. A matching encoder/decoder alone would hide per-channel OOTF errors. Explicit correction is shown separately.' };
      });
      await runCase('T4_grade', () => call('grade'));
      await runCase('T5_encoding', async () => {
        const results = [];
        for (const transfer of ['pq', 'hlg']) {
          const w = 640, h = 360, raw = path.join(dir, `encode-${transfer}.bin`);
          const data = pattern(w, h, transfer, false); fs.writeFileSync(raw, transfer === 'hlg' ? prepareHlgPlanar(data) : data);
          for (const [codec, ext, options] of [
            ['libx265', 'mp4', ['-preset', 'ultrafast', '-x265-params', `lossless=1:pools=2:frame-threads=2:repeat-headers=1${transfer === 'pq' ? ':hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(100000000,1):max-cll=10000,1200' : ''}`]],
            ['libaom-av1', 'mkv', ['-cpu-used', '8', '-crf', '0', '-row-mt', '1', '-threads', '2']],
            ['libvpx-vp9', 'webm', ['-profile:v', '2', '-lossless', '1', '-threads', '2']],
            ['prores_ks', 'mov', ['-profile:v', '3', '-qscale:v', '1', '-threads', '2']],
            ['prores_ks', 'mov', ['-profile:v', '4', '-qscale:v', '1', '-threads', '2']],
          ]) {
            const profile = codec === 'prores_ks' ? options[1] : null, file = path.join(dir, `${transfer}-${codec}${profile || ''}.${ext}`);
            try {
              await ff(['-f', 'rawvideo', '-pixel_format', 'gbrpf32le', '-video_size', `${w}x${h}`, '-framerate', '24', '-i', raw,
                '-vf', `zscale=tin=linear:pin=bt2020:min=gbr:t=${trc(transfer)}:p=bt2020:m=bt2020nc:npl=${WHITE}:r=limited,format=${codec === 'prores_ks' ? profile === '4' ? 'yuv444p10le' : 'yuv422p10le' : 'yuv420p10le'}`,
                '-c:v', codec, ...options, '-color_primaries', 'bt2020', '-color_trc', trc(transfer), '-colorspace', 'bt2020nc', file]);
              const bytes = await ff(['-i', file, '-vf', decodeFilter(transfer), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', 'pipe:1'], { binary: true });
              const rawFields = samplePlanar(bytes, w, h, transfer);
              const fields = transfer === 'hlg' ? rawFields.map(f => { const measured = correctHlgRgb(f.measured); return { ...f, measured, relativeOrWhiteError: Math.max(...measured.map((v, c) => Math.abs(v - f.expected[c]) / Math.max(f.expected[c], 1))) }; }) : rawFields;
              const maxError = Math.max(...fields.map(p => p.relativeOrWhiteError));
              const signal = await ff(['-i', file, '-vf', `zscale=tin=${trc(transfer)}:min=bt2020nc:pin=bt2020:t=${trc(transfer)}:m=gbr:r=full,format=gbrpf32le`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { binary: true });
              const encoded = new Float32Array(signal.buffer, signal.byteOffset, signal.byteLength / 4), reference = new Float32Array(pattern(w, h, transfer).buffer);
              const signalErrors = patches(transfer).map((_, k, all) => { const i = Math.floor(h * 0.3) * w + Math.floor((k + 0.5) * w / all.length), n = w * h; return Math.max(...[i, n + i, 2 * n + i].map(j => Math.abs(encoded[j] - reference[j]))); });
              const maxSignalError = Math.max(...signalErrors);
              const metadata = ffprobe ? JSON.parse(await command(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_frames', '-read_intervals', '%+#1', '-of', 'json', file])) : null;
              const stream = metadata?.streams?.[0], sideData = metadata?.frames?.[0]?.side_data_list || [];
              const tagsCorrect = stream?.color_primaries === 'bt2020' && stream?.color_transfer === trc(transfer) && stream?.color_space === 'bt2020nc';
              const tenBit = /p(10|12|16)(le|be)?$/.test(stream?.pix_fmt || '') || Number(stream?.bits_per_raw_sample) >= 10;
              const hdr10 = transfer === 'pq' && codec === 'libx265';
              const staticMetadata = !hdr10 || sideData.some(s => /Mastering display/.test(s.side_data_type)) && sideData.some(s => /Content light/.test(s.side_data_type));
              results.push({ transfer, codec, profile, file, maxError, maxSignalError, hlgOotfCompensation: transfer === 'hlg', fields, metadata, tagsCorrect, tenBit, staticMetadata, status: maxError < 0.02 && maxSignalError < 0.005 && tagsCorrect && tenBit && staticMetadata ? 'pass' : metadata ? 'fail' : 'metadata-unverified' });
            } catch (error) { results.push({ transfer, codec, profile, status: 'error', error: error.message }); }
          }
        }
        return { status: results.every(r => r.status === 'pass') ? 'technical-pass-manual-acceptance-pending' : 'incomplete-or-fail', results,
          webCodecs: await call('encoders'), manualAcceptance: { QuickTime: 'not tested', WindowsPlayer: 'not tested', VLC: 'not tested', privateYouTubeUpload: 'user task, not performed' } };
      });
      await runCase('T6_performance', async () => {
        win.destroy(); win = null;
        await new Promise(resolve => setTimeout(resolve, 200));
        let maxWorkingSetKB = 0;
        memoryTimer = setInterval(() => { maxWorkingSetKB = Math.max(maxWorkingSetKB, app.getAppMetrics().reduce((n, p) => n + p.memory.workingSetSize, 0)); }, 50);
        const baselineWorkingSetKB = app.getAppMetrics().reduce((n, p) => n + p.memory.workingSetSize, 0);
        const results = [];
        for (const height of [1080, 2160]) for (const mode of ['sdr', 'float16', 'webgl']) {
          const f = fixtures.find(f => f.h === height && f.transfer === 'pq');
          try {
            win = await createWindow();
            const result = await call('pipeline', { ...f, ffmpeg, mode, frames: frameCount, dir });
            if (mode !== 'sdr') {
              const bytes = await ff(['-i', result.file, '-vf', decodeFilter('pq'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', 'pipe:1'], { binary: true });
              const measured = samplePlanar(bytes, f.w, f.h, 'pq'); result.maxHdrError = Math.max(...measured.map(m => m.relativeOrWhiteError)); result.hdrValuesPreserved = result.maxHdrError < 0.02;
            }
            results.push(result);
          }
          catch (error) { results.push({ height, mode, error: error.message }); }
          finally { win?.destroy(); win = null; }
        }
        clearInterval(memoryTimer); memoryTimer = null;
        return { status: 'measured-sample-not-release-acceptance', framesPerCase: frameCount, layers: 5, baselineWorkingSetKB, peakSampledWorkingSetKB: maxWorkingSetKB,
          additionalWorkingSetGB: (maxWorkingSetKB - baselineWorkingSetKB) / 1024 ** 2,
          memoryLimits: '50 ms samples of Electron main/renderer/GPU processes; isolated window per case. Does not include all external FFmpeg memory, driver VRAM or an instrumented OS-wide allocation peak.', results,
          relativeTime: results.filter(r => r.mode !== 'sdr' && r.totalMs).map(r => ({ height: r.height, mode: r.mode, hdrValuesPreserved: r.hdrValuesPreserved, timesSdr: r.totalMs / results.find(b => b.height === r.height && b.mode === 'sdr').totalMs })) };
      });
      win = await createWindow();
      await runCase('T7_preview', () => call('preview'));
      const t1 = report.tests.T1_canvas;
      report.decision = { route: t1?.status === 'pass' ? 'A/B pending T2 validation' : t1?.status === 'partial' ? 'A/B with filter replacements, pending T2 validation' : 'C',
        reason: t1?.status === 'pass' || t1?.status === 'partial' ? 'Extended-range canvas results must be combined with measured HDR decoding and color-domain behavior.' : 'Canvas did not meet the full extended-range compositing acceptance criteria. Float WebGL composition is the conservative candidate.',
        platformScope: `${process.platform}-${process.arch}`, productHdrExportImplemented: false };
      save();
      console.log('Report:', reportFile); console.log('Fixtures retained:', dir); console.log('Candidate route:', report.decision.route);
      app.exit(report.errors.length ? 1 : 0);
    } catch (error) {
      report.errors.push({ test: 'harness', error: error.stack || error.message });
      try { save(); } catch (saveError) { console.error(saveError); }
      console.error(error); console.error('Fixtures:', dir); app.exit(1);
    } finally { if (memoryTimer) clearInterval(memoryTimer); win?.destroy(); }
  });
}
