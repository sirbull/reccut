// Renders the procedural lens flare elements with the real WebGL2 shader in Chromium and measures them:
// no seam at 0°/360°, no artifact in the center, ~1 px edges at any resolution, and 1080p ≈ 4K downscaled.
// Usage: node scripts/test-lens-flare-gpu.cjs [directory for the 4K PNG]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit' });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = electron;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-flare-gpu-'));
  const out = process.argv[2] ? path.resolve(process.argv[2]) : null;
  app.setPath('userData', path.join(dir, 'profile'));
  const entry = `
    import { drawLensFlare } from ${JSON.stringify(path.join(root, 'src/shared/lensFlareRender.js'))};
    import { FLARE_DEFAULTS, makeElement } from ${JSON.stringify(path.join(root, 'src/shared/lensFlare.js'))};
    // Light and optical center in the middle, so every element is centered at distance 1.
    const scene = (elements) => ({ ...structuredClone(FLARE_DEFAULTS), x: 0.5, y: 0.5, cx: 0.5, cy: 0.5, scale: 1, spread: 1, intensity: 1, opacity: 1, colorize: 0, blend: 'add',
      elements: elements.map((e) => ({ ...makeElement(e.asset), distance: 1, intensity: 2.5, ...e })) });
    function render(p, w, h) {
      const img = document.createElement('canvas'), out = document.createElement('canvas');
      img.width = out.width = w; img.height = out.height = h;
      img.getContext('2d').fillRect(0, 0, w, h);
      const ctx = out.getContext('2d', { willReadFrequently: true });
      drawLensFlare(ctx, img, w, h, p);
      return { canvas: out, px: ctx.getImageData(0, 0, w, h).data, w, h };
    }
    const at = (r, x, y) => { const i = (Math.round(y) * r.w + Math.round(x)) * 4; return [r.px[i], r.px[i + 1], r.px[i + 2]]; };
    const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    window.run = () => {
      const report = {}, fail = [];
      const W = 3840, H = 2160, cx = W / 2, cy = H / 2;
      // 1. Spectral ring and spectral 7-blade iris: walk a circle in 0.05° steps. The step across ±180° may not
      //    be larger than the largest step elsewhere on the circle.
      for (const [name, el, radius] of [
        ['spectral ring', { asset: 'ring_spectral', size: 0.8, thickness: 0.04, chroma: 0.05 }, 0.4 * H],
        ['spectral 7-blade iris', { asset: 'iris_spectral', size: 0.8, blades: 7, chroma: 0.05, spectrum: 1 }, 0.3 * H],
      ]) {
        const r = render(scene([el]), W, H), n = 7200, steps = [];
        for (let i = 0; i < n; i++) {
          const a = -Math.PI + (i / n) * 2 * Math.PI, b = a + (2 * Math.PI) / n;
          steps.push(diff(at(r, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius), at(r, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius)));
        }
        const seam = Math.max(steps[n - 1], steps[0]), elsewhere = Math.max(...steps.slice(1, n - 1));
        report[name] = { seamStep: seam, maxStepElsewhere: elsewhere, center: at(r, cx, cy) };
        if (seam > Math.max(2, elsewhere)) fail.push(name + ': visible step at 0°/360°');
      }
      // 2. Center: radial and angular spectrum through the middle; no hole, spike or NaN-black.
      for (const gradient of ['radial', 'angular']) {
        const r = render(scene([{ asset: 'iris_spectral', size: 0.8, spectrum: 1, gradient, blades: 6 }]), W, H);
        let worst = 0;
        for (let y = -6; y <= 6; y++) for (let x = -6; x < 6; x++) worst = Math.max(worst, diff(at(r, cx + x, cy + y), at(r, cx + x + 1, cy + y)));
        const c = at(r, cx, cy);
        report['center ' + gradient] = { center: c, maxNeighborStep: worst };
        if (worst > 2 || Math.max(...c) < 10) fail.push('center artifact with ' + gradient + ' spectrum');
      }
      // 3. Edge width in pixels of a hard (softness 0) circle at 1080p and 4K: the same few pixels at both.
      const edge = (w, h) => {
        const r = render(scene([{ asset: 'iris_round', size: 0.6, softness: 0, chroma: 0, edge: 0 }]), w, h);
        const row = Array.from({ length: w / 2 }, (_, x) => at(r, w / 2 + x, h / 2)[1]), body = row[Math.round(h * 0.1)];
        return row.filter((v) => v > body * 0.1 && v < body * 0.9).length;
      };
      report.edgePixels = { '1080p': edge(1920, 1080), '4K': edge(3840, 2160), '8K': edge(7680, 4320) };
      for (const v of Object.values(report.edgePixels)) if (v < 1 || v > 4) fail.push('edge is not ~1 px wide: ' + JSON.stringify(report.edgePixels));
      // 4. Resolution independence: 4K scaled down to 1080p matches a 1080p render.
      const mix = [{ asset: 'iris_polygon', size: 0.5, distance: 1 }, { asset: 'ring_spectral', size: 0.9 }, { asset: 'halo_soft', size: 1.3 }];
      const big = render(scene(mix), W, H), small = render(scene(mix), 1920, 1080);
      const half = document.createElement('canvas'); half.width = 1920; half.height = 1080;
      const hc = half.getContext('2d', { willReadFrequently: true }); hc.imageSmoothingQuality = 'high'; hc.drawImage(big.canvas, 0, 0, 1920, 1080);
      const hp = hc.getImageData(0, 0, 1920, 1080).data;
      let sum = 0, worst = 0;
      for (let i = 0; i < hp.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(hp[i + k] - small.px[i + k]); sum += d; worst = Math.max(worst, d); }
      report.downscaled4KvsHD = { meanAbs: +(sum / (hp.length * 0.75)).toFixed(3), max: worst };
      if (sum / (hp.length * 0.75) > 1) fail.push('4K and 1080p differ');
      const all = scene([...mix, { asset: 'iris_spectral', size: 0.35, distance: 1, blades: 7, chroma: 0.06 }]);
      return { report, fail, png: render(all, W, H).canvas.toDataURL('image/png') };
    };`;
  app.whenReady().then(async () => {
    let win;
    try {
      const bundle = await require(path.join(root, 'node_modules/esbuild')).build({
        stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome130',
      });
      win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      await win.loadURL('about:blank');
      await win.webContents.executeJavaScript(bundle.outputFiles[0].text);
      const { report, fail, png } = await win.webContents.executeJavaScript('run()');
      console.log(JSON.stringify(report, null, 2));
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, 'procedural-4k.png'), Buffer.from(png.split(',')[1], 'base64'));
        console.log('Wrote ' + path.join(out, 'procedural-4k.png'));
      }
      if (fail.length) throw new Error(fail.join('\n'));
      console.log('Procedural lens flare: no seams, clean center, ~1 px edges, resolution independent.');
      app.exit(0);
    } catch (error) {
      console.error(error.message || error); app.exit(1);
    } finally {
      win?.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
