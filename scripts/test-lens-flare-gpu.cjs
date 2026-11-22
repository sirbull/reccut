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
  // The kit PNGs, as data URLs: drawn as custom textures they go through the texture path.
  const kitPngs = Object.fromEntries(require(path.join(root, 'assets/lensflare/manifest.json')).assets
    .map((a) => [a.id, 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/lensflare', a.file)).toString('base64')]));
  const entry = `
    import { drawLensFlare, loadFlareSprites } from ${JSON.stringify(path.join(root, 'src/shared/lensFlareRender.js'))};
    import { FLARE_ASSETS, FLARE_DEFAULTS, makeElement } from ${JSON.stringify(path.join(root, 'src/shared/lensFlare.js'))};
    const KIT_PNGS = ${JSON.stringify(kitPngs)};
    // Light and optical center in the middle, so every element is centered at distance 1.
    const scene = (elements) => ({ ...structuredClone(FLARE_DEFAULTS), x: 0.5, y: 0.5, cx: 0.5, cy: 0.5, scale: 1, spread: 1, intensity: 1, opacity: 1, colorize: 0, blend: 'add',
      elements: elements.map((e) => ({ ...makeElement(e.asset), distance: 1, intensity: 2.5, ...e })) });
    function render(p, w, h, paint = null) {
      const img = document.createElement('canvas'), out = document.createElement('canvas');
      img.width = out.width = w; img.height = out.height = h;
      img.getContext('2d').fillRect(0, 0, w, h);
      paint?.(img.getContext('2d'));
      const ctx = out.getContext('2d', { willReadFrequently: true });
      drawLensFlare(ctx, img, w, h, p);
      return { canvas: out, px: ctx.getImageData(0, 0, w, h).data, w, h };
    }
    const at = (r, x, y) => { const i = (Math.round(y) * r.w + Math.round(x)) * 4; return [r.px[i], r.px[i + 1], r.px[i + 2]]; };
    const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    window.run = async () => {
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
      // 5. Kit elements drawn with their formulas match the PNG at 1:1 (texture pixel = screen pixel), within the
      //    rounding of an 8-bit PNG.
      report.kitVsPng = {};
      for (const a of FLARE_ASSETS.filter((x) => x.kit)) {
        const size = a.w / H, textures = { [a.id]: { name: a.id, url: KIT_PNGS[a.id], w: a.w, h: a.h } };
        const el = { distance: 1, intensity: 1, size, tint: '#ffffff', blend: 'add' };
        const formula = scene([{ ...el, asset: a.id }]), png = { ...structuredClone(formula), textures };
        png.elements[0].asset = 'custom:' + a.id;
        await loadFlareSprites({ clips: { c: { props: { vfx: [{ type: 'lensFlare', p: png }] } } } });
        const A = render(png, W, H), B = render(formula, W, H);
        let sum = 0, n = 0, max = 0;
        const x0 = Math.round(cx - a.w / 2), y0 = Math.round(cy - a.h / 2);
        for (let y = y0; y < y0 + a.h; y++) for (let x = x0; x < x0 + a.w; x++) {
          const i = (y * W + x) * 4;
          for (let k = 0; k < 3; k++) { const d = Math.abs(A.px[i + k] - B.px[i + k]); sum += d; n++; max = Math.max(max, d); }
        }
        report.kitVsPng[a.id] = { meanAbs: +(sum / n).toFixed(3), max };
        if (sum / n > 1.5 || max > 12) fail.push(a.id + ': formula differs from the PNG ' + JSON.stringify(report.kitVsPng[a.id]));
      }
      // 6. Occlusion: a dark disc over the light source dims the flare; a light outside the picture is not dimmed.
      {
        const w = 1280, h = 720, R = 0.02 * h; // the probed circle in flareVisibility
        const gray = (cover) => (c) => {
          c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#000'; c.beginPath(); c.arc(w / 2, h / 2, R * cover, 0, 2 * Math.PI); c.fill();
        };
        const p = { ...scene([{ asset: 'glow_white', size: 0.8, intensity: 0.3 }]), occlusion: 1, threshold: 0.6 };
        const lift = (q, paint, x = w / 2 + 0.12 * h) => at(render(q, w, h, paint), x, h / 2)[1] - 192;
        const open = lift(p, gray(0)), covered = lift(p, gray(1.5)), half = lift(p, gray(0.7));
        // Light just outside the right edge; its glow reaches into the picture.
        const off = [lift({ ...p, x: 1.2 }, gray(1.5), w - 2), lift({ ...p, x: 1.2, occlusion: 0 }, gray(1.5), w - 2)];
        report.occlusion = { open, half, covered, offscreen: off };
        if (!(open > 20) || covered > 1 || !(half > covered && half < open)) fail.push('occlusion does not follow the picture: ' + JSON.stringify(report.occlusion));
        if (!(off[0] > 0) || off[0] !== off[1]) fail.push('a light source outside the picture is dimmed by occlusion');
      }
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
      console.log('Procedural lens flare: no seams, clean center, ~1 px edges, resolution independent, kit formulas match the PNGs, occlusion follows the picture.');
      app.exit(0);
    } catch (error) {
      console.error(error.message || error); app.exit(1);
    } finally {
      win?.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
