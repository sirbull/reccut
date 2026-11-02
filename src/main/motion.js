// Bevegelsesanalyse for stabilisering. Leser videoen som små gråtonebilder, finner hjørnepunkter,
// følger dem fra bilde til bilde (Lucas-Kanade i en bildepyramide, kontrollert fram og tilbake)
// og finner kamerabevegelsen (forflytning og rotasjon) med RANSAC, så bevegelige ting i bildet
// ikke påvirker resultatet. Resultatet er bevegelsen mellom hvert bilde, i brøkdeler av bredden.
const { spawn } = require('child_process');

const WIDTH = 320;

/* Bilder og pyramide */

function toFloat(gray, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = gray[i];
  return out;
}

// Halv størrelse med et lite uskarphetsfilter, til neste nivå i pyramiden.
function downsample(img, w, h) {
  const nw = w >> 1;
  const nh = h >> 1;
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = x * 2;
      const sy = y * 2;
      const i = sy * w + sx;
      const r = sx + 1 < w ? 1 : 0;
      const d = sy + 1 < h ? w : 0;
      out[y * nw + x] = (img[i] + img[i + r] + img[i + d] + img[i + r + d]) * 0.25;
    }
  }
  return { img: out, w: nw, h: nh };
}

function pyramid(img, w, h, levels) {
  const out = [{ img, w, h }];
  for (let l = 1; l < levels; l++) {
    const p = out[l - 1];
    if (p.w < 40 || p.h < 30) break;
    out.push(downsample(p.img, p.w, p.h));
  }
  // Gradienter for hvert nivå (Scharr-lignende sentrale differanser).
  for (const p of out) {
    const { img: im, w: pw, h: ph } = p;
    p.gx = new Float32Array(pw * ph);
    p.gy = new Float32Array(pw * ph);
    for (let y = 1; y < ph - 1; y++) {
      for (let x = 1; x < pw - 1; x++) {
        const i = y * pw + x;
        p.gx[i] = (3 * (im[i - pw + 1] - im[i - pw - 1]) + 10 * (im[i + 1] - im[i - 1]) + 3 * (im[i + pw + 1] - im[i + pw - 1])) / 32;
        p.gy[i] = (3 * (im[i + pw - 1] - im[i - pw - 1]) + 10 * (im[i + pw] - im[i - pw]) + 3 * (im[i + pw + 1] - im[i - pw + 1])) / 32;
      }
    }
  }
  return out;
}

function sample(img, w, h, x, y) {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > w - 1.001) x = w - 1.001;
  if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + w] * (1 - fx) + img[i + w + 1] * fx) * fy;
}

/* Hjørnepunkter (Shi-Tomasi), spredt over hele bildet */

// rect [x0, y0, x1, y1] begrenser søket til et område (sporing av et objekt).
function corners(p, max = 220, rect = null) {
  const { w, h, gx, gy } = p;
  const R = 3;
  const score = new Float32Array(w * h);
  let best = 0;
  const margin = 10;
  const X0 = rect ? Math.max(margin, Math.floor(rect[0])) : margin;
  const Y0 = rect ? Math.max(margin, Math.floor(rect[1])) : margin;
  const X1 = rect ? Math.min(w - margin, Math.ceil(rect[2])) : w - margin;
  const Y1 = rect ? Math.min(h - margin, Math.ceil(rect[3])) : h - margin;
  if (X1 - X0 < 4 || Y1 - Y0 < 4) return [];
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let dy = -R; dy <= R; dy++) {
        const row = (y + dy) * w;
        for (let dx = -R; dx <= R; dx++) {
          const ix = gx[row + x + dx];
          const iy = gy[row + x + dx];
          a += ix * ix;
          b += ix * iy;
          c += iy * iy;
        }
      }
      const s = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
      score[y * w + x] = s;
      if (s > best) best = s;
    }
  }
  if (best <= 0) return [];
  // Et rutenett med de beste punktene i hver rute, så punktene ikke samler seg på ett sted.
  const cols = 10;
  const rows = Math.max(4, Math.round((10 * (rect ? Y1 - Y0 : h)) / (rect ? X1 - X0 : w)));
  const cw = (X1 - X0) / cols;
  const ch = (Y1 - Y0) / rows;
  const per = Math.max(2, Math.ceil(max / (cols * rows)));
  const pts = [];
  for (let gyi = 0; gyi < rows; gyi++) {
    for (let gxi = 0; gxi < cols; gxi++) {
      const cand = [];
      const x0 = Math.floor(X0 + gxi * cw);
      const y0 = Math.floor(Y0 + gyi * ch);
      for (let y = y0; y < y0 + ch; y += 2) for (let x = x0; x < x0 + cw; x += 2) {
        const s = score[y * w + x];
        if (s > best * 0.01) cand.push([s, x, y]);
      }
      cand.sort((m, n) => n[0] - m[0]);
      const taken = [];
      for (const [, x, y] of cand) {
        if (taken.length >= per) break;
        if (taken.some(([tx, ty]) => (tx - x) ** 2 + (ty - y) ** 2 < 36)) continue;
        taken.push([x, y]);
      }
      pts.push(...taken);
    }
  }
  return pts;
}

/* Lucas-Kanade i pyramiden */

const HALF = 5;

function trackPoint(pa, pb, x, y) {
  let gx0 = 0;
  let gy0 = 0;
  for (let l = pa.length - 1; l >= 0; l--) {
    const A = pa[l];
    const B = pb[l];
    const k = 1 / (1 << l);
    const px = x * k;
    const py = y * k;
    let G11 = 0;
    let G12 = 0;
    let G22 = 0;
    const tpl = [];
    for (let dy = -HALF; dy <= HALF; dy++) {
      for (let dx = -HALF; dx <= HALF; dx++) {
        const ix = sample(A.gx, A.w, A.h, px + dx, py + dy);
        const iy = sample(A.gy, A.w, A.h, px + dx, py + dy);
        tpl.push(sample(A.img, A.w, A.h, px + dx, py + dy), ix, iy);
        G11 += ix * ix;
        G12 += ix * iy;
        G22 += iy * iy;
      }
    }
    const det = G11 * G22 - G12 * G12;
    if (det < 1e-3) return null;
    let vx = 0;
    let vy = 0;
    for (let it = 0; it < 12; it++) {
      let b1 = 0;
      let b2 = 0;
      let n = 0;
      for (let dy = -HALF; dy <= HALF; dy++) {
        for (let dx = -HALF; dx <= HALF; dx++) {
          const diff = tpl[n] - sample(B.img, B.w, B.h, px + gx0 + vx + dx, py + gy0 + vy + dy);
          b1 += diff * tpl[n + 1];
          b2 += diff * tpl[n + 2];
          n += 3;
        }
      }
      const ux = (G22 * b1 - G12 * b2) / det;
      const uy = (G11 * b2 - G12 * b1) / det;
      vx += ux;
      vy += uy;
      if (ux * ux + uy * uy < 0.0009) break;
    }
    if (l > 0) {
      gx0 = (gx0 + vx) * 2;
      gy0 = (gy0 + vy) * 2;
    } else {
      gx0 += vx;
      gy0 += vy;
    }
  }
  const nx = x + gx0;
  const ny = y + gy0;
  const A = pa[0];
  if (nx < 2 || ny < 2 || nx > A.w - 3 || ny > A.h - 3) return null;
  return [nx, ny];
}

/* Robust tilpasning: forflytning, rotasjon og skala rundt midten av bildet */

function fitSimilarity(pairs, cx, cy) {
  // x' = a x - b y + tx, y' = b x + a y + ty (koordinater relativt til midten)
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sx2 = 0;
  let sy2 = 0;
  let su = 0;
  let sv = 0;
  let sxu = 0;
  let syv = 0;
  let sxv = 0;
  let syu = 0;
  for (const [x0, y0, x1, y1] of pairs) {
    const x = x0 - cx;
    const y = y0 - cy;
    const u = x1 - cx;
    const v = y1 - cy;
    n++;
    sx += x;
    sy += y;
    sx2 += x * x;
    sy2 += y * y;
    su += u;
    sv += v;
    sxu += x * u;
    syv += y * v;
    sxv += x * v;
    syu += y * u;
  }
  if (n < 2) return null;
  // Minste kvadrater for a, b, tx, ty: sentrer først, så er a og b uavhengige av tx og ty.
  const mx = sx / n;
  const my = sy / n;
  const mu = su / n;
  const mv = sv / n;
  const sxx = sx2 - n * mx * mx + (sy2 - n * my * my);
  if (sxx < 1e-6) return null;
  const a = (sxu - n * mx * mu + (syv - n * my * mv)) / sxx;
  const b = (sxv - n * mx * mv - (syu - n * my * mu)) / sxx;
  const tx = mu - (a * mx - b * my);
  const ty = mv - (b * mx + a * my);
  return { a, b, tx, ty };
}

function residual(m, p, cx, cy) {
  const x = p[0] - cx;
  const y = p[1] - cy;
  const u = m.a * x - m.b * y + m.tx;
  const v = m.b * x + m.a * y + m.ty;
  return Math.hypot(u - (p[2] - cx), v - (p[3] - cy));
}

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function ransac(pairs, cx, cy, thresh = 0.9) {
  if (pairs.length < 6) return null;
  let best = null;
  let bestCount = 0;
  for (let it = 0; it < 120; it++) {
    const i = Math.floor(rand() * pairs.length);
    let j = Math.floor(rand() * pairs.length);
    if (j === i) j = (j + 1) % pairs.length;
    const m = fitSimilarity([pairs[i], pairs[j]], cx, cy);
    if (!m) continue;
    let count = 0;
    for (const p of pairs) if (residual(m, p, cx, cy) < thresh) count++;
    if (count > bestCount) {
      bestCount = count;
      best = m;
    }
  }
  if (!best) return null;
  const inliers = pairs.filter((p) => residual(best, p, cx, cy) < thresh * 1.5);
  const m = fitSimilarity(inliers, cx, cy);
  return m ? { ...m, inliers: inliers.length, total: pairs.length } : null;
}

/**
 * Bevegelsen fra bilde a til bilde b (pyramider). Gir { dx, dy, da, ds, ok } der dx og dy er i
 * piksler i analysebildet. Fungerer ikke analysen (for lite detaljer, kutt), er ok false.
 */
function estimate(pa, pb) {
  const A = pa[0];
  const pts = corners(A);
  const pairs = [];
  for (const [x, y] of pts) {
    const f = trackPoint(pa, pb, x, y);
    if (!f) continue;
    // Tilbake igjen: punktet må lande der det startet, ellers er sporingen usikker.
    const back = trackPoint(pb, pa, f[0], f[1]);
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 0.6) continue;
    pairs.push([x, y, f[0], f[1]]);
  }
  const cx = A.w / 2;
  const cy = A.h / 2;
  const m = ransac(pairs, cx, cy);
  if (!m || m.inliers < 8 || m.inliers < m.total * 0.3) return { dx: 0, dy: 0, da: 0, ds: 1, ok: false, points: pairs.length };
  return { dx: m.tx, dy: m.ty, da: Math.atan2(m.b, m.a), ds: Math.hypot(m.a, m.b), ok: true, points: m.inliers };
}

// Leser videoen som gråtonebilder og kaller onFrame(gray, w, h) for hvert bilde. Gir onFrame
// false tilbake, stoppes lesingen. args er FFmpeg-argumentene, med rå gråtonebilder til stdout.
function readFrames(ffmpegPath, args, width, onFrame, isCanceled) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let w = width;
    let h = 0;
    let err = '';
    let stopped = false;
    proc.stderr.on('data', (d) => {
      err = (err + d.toString()).slice(-4000);
      if (!h) {
        const m = /Stream #\d+:\d+.*?: Video: rawvideo.*?, (\d+)x(\d+)/.exec(err);
        if (m) {
          w = Number(m[1]);
          h = Number(m[2]);
        }
      }
    });
    let pending = Buffer.alloc(0);
    let frames = 0;
    proc.stdout.on('data', (chunk) => {
      if (stopped) return;
      if (isCanceled?.()) {
        proc.kill('SIGKILL');
        return;
      }
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      if (!h) return;
      const size = w * h;
      while (pending.length >= size) {
        frames++;
        if (onFrame(pending.subarray(0, size), w, h) === false) {
          stopped = true;
          proc.kill('SIGKILL');
          return;
        }
        pending = pending.subarray(size);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (isCanceled?.()) return reject(new Error('Canceled'));
      if (!stopped && code !== 0 && frames < 2) return reject(new Error(`FFmpeg could not read the video: ${err.split('\n').slice(-3).join(' ')}`));
      resolve({ w, h, frames });
    });
  });
}

/**
 * Analyserer en video. fps settes fast, så bilde nummer i hører til tid i / fps.
 * Gir { version, fps, width, height, motions: [[dx, dy, da, ds, ok], ...] } der motions[i] er
 * bevegelsen fra bilde i - 1 til i (første er 0), og dx og dy er brøkdeler av bredden.
 */
async function analyze(ffmpegPath, file, { fps, duration, onProgress, isCanceled }) {
  const rate = Math.max(1, Math.min(120, Math.round(fps || 30)));
  const total = Math.max(1, Math.round((duration || 1) * rate));
  const motions = [[0, 0, 0, 1, 1]];
  let prev = null;
  let frames = 0;
  const args = ['-hide_banner', '-nostdin', '-i', file, '-map', '0:v:0', '-an', '-vf', `fps=${rate},scale=${WIDTH}:-2:flags=area,format=gray`, '-f', 'rawvideo', '-'];
  const { w, h } = await readFrames(ffmpegPath, args, WIDTH, (gray, w, h) => {
    const pyr = pyramid(toFloat(gray, w, h), w, h, 3);
    if (prev) {
      const m = estimate(prev, pyr);
      motions.push([m.dx / w, m.dy / w, m.da, m.ds, m.ok ? 1 : 0]);
    }
    prev = pyr;
    frames++;
    if (frames % 10 === 0) onProgress?.(Math.min(0.99, frames / total));
  }, isCanceled);
  return { version: 1, fps: rate, width: w, height: h, motions: motions.map((m) => m.map((v) => Math.round(v * 1e6) / 1e6)) };
}

/* Sporing av ett objekt: et område som følges fra bilde til bilde */

const TRACK_WIDTH = 640;

/**
 * Ett steg: området r = { cx, cy, w, h, a, s } (piksler i analysebildet, a i radianer, s skala)
 * flyttes fra bilde a til bilde b. Hjørnepunkter inne i området følges, og RANSAC finner
 * forflytning, rotasjon og skala rundt midten av området. Gir null når objektet er borte.
 */
function trackStep(pa, pb, r) {
  const hw = (r.w * r.s) / 2;
  const hh = (r.h * r.s) / 2;
  const c = Math.cos(r.a);
  const sn = Math.sin(r.a);
  const ex = Math.abs(hw * c) + Math.abs(hh * sn);
  const ey = Math.abs(hw * sn) + Math.abs(hh * c);
  const pts = corners(pa[0], 120, [r.cx - ex, r.cy - ey, r.cx + ex, r.cy + ey]).filter(([x, y]) => {
    const dx = x - r.cx;
    const dy = y - r.cy;
    return Math.abs(dx * c + dy * sn) <= hw && Math.abs(dy * c - dx * sn) <= hh;
  });
  const pairs = [];
  for (const [x, y] of pts) {
    const f = trackPoint(pa, pb, x, y);
    if (!f) continue;
    const back = trackPoint(pb, pa, f[0], f[1]);
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 1) continue;
    pairs.push([x, y, f[0], f[1]]);
  }
  const m = ransac(pairs, r.cx, r.cy, 1.5);
  if (m && m.inliers >= 5) {
    // ponytail: skalaen begrenses, så støy i små områder ikke får området til å vokse uten stopp.
    const s = Math.max(0.2, Math.min(5, r.s * Math.hypot(m.a, m.b)));
    return { ...r, cx: r.cx + m.tx, cy: r.cy + m.ty, a: r.a + Math.atan2(m.b, m.a), s };
  }
  // Få punkter (lite detaljer): bare forflytningen, som medianen av punktene.
  if (pairs.length < 3) return null;
  const med = (k) => pairs.map((p) => p[k + 2] - p[k]).sort((u, v) => u - v)[pairs.length >> 1];
  return { ...r, cx: r.cx + med(0), cy: r.cy + med(1) };
}

/**
 * Følger et område i videoen fra start til end (sekunder i filen). box = { cx, cy, w, h, a } er
 * området ved start, i brøkdeler av bredden og a i radianer. Gir { fps, start, frames } der
 * frames[i] = [cx, cy, a, s, ok] hører til tid start + i / fps. Stopper når objektet har vært
 * borte et halvt sekund.
 */
// ponytail: følger fra bilde til bilde, så små feil hoper seg opp over lange klipp. Sammenlign
// med det første bildet av området hvis det blir et problem.
async function track(ffmpegPath, file, { start, end, fps, box, onProgress, isCanceled }) {
  const rate = Math.max(1, Math.min(60, Math.round(fps || 30)));
  const total = Math.max(1, Math.round((end - start) * rate));
  const frames = [];
  let prev = null;
  let r = null;
  let lost = 0;
  const args = ['-hide_banner', '-nostdin', '-ss', String(Math.max(0, start)), '-i', file, '-t', String(Math.max(0.05, end - start)), '-map', '0:v:0', '-an', '-vf', `fps=${rate},scale=${TRACK_WIDTH}:-2:flags=area,format=gray`, '-f', 'rawvideo', '-'];
  await readFrames(ffmpegPath, args, TRACK_WIDTH, (gray, w, h) => {
    const pyr = pyramid(toFloat(gray, w, h), w, h, 4);
    if (!r) r = { cx: box.cx * w, cy: box.cy * w, w: box.w * w, h: box.h * w, a: box.a || 0, s: 1 };
    else {
      const next = trackStep(prev, pyr, r);
      if (next) {
        r = next;
        lost = 0;
      } else lost++;
    }
    prev = pyr;
    frames.push([r.cx / w, r.cy / w, r.a, r.s, lost ? 0 : 1].map((v) => Math.round(v * 1e6) / 1e6));
    if (frames.length % 10 === 0) onProgress?.(Math.min(0.99, frames.length / total));
    if (lost > rate / 2) return false;
  }, isCanceled);
  while (frames.length && !frames[frames.length - 1][4]) frames.pop();
  return { fps: rate, start, frames, lost: lost > 0 };
}

module.exports = { analyze, track, trackStep, estimate, pyramid, toFloat, corners, ransac, fitSimilarity, WIDTH };
