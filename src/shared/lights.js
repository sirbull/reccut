// Blinking Lights: prosedyriske, blinkende lyskilder i og rundt bildet.
// Alt regnes ut fra antall sykluser (integralet av frekvensen over klippets nøkkelbildeakse), så samme
// tidspunkt gir alltid samme lys, uavhengig av bildefrekvens, scrubbing, forhåndsvisning eller eksport.
import { effectHash } from './stylizeNoise.js';

export const LIGHT_DEFAULTS = {
  // Position & Shape (posisjon i andeler av bildet, størrelse i andeler av bildehøyden)
  x: -0.08, y: 0.32, size: 0.85, softness: 0.9, shape: 'round', rotation: 0, spread: 1.6,
  // Colors & Light Sources
  primary: '#ff2020', secondary: '#2a55ff', colorMode: 'single', transition: 'hard', saturation: 1,
  dual: true, x2: 1.08, y2: 0.32, size2: 0.85, phase2: 0.5,
  // Flash Pattern (sekunder, frekvens i mønstre per sekund)
  frequency: 1.6, duration: 0.05, attack: 0.005, decay: 0.09, pause: 0.05, pattern: 'double', phase: 0, randomness: 0, base: 0,
  // Intensity & Blending
  intensity: 1.6, opacity: 1, glow: 0.5, falloff: 1.4, exposure: 0.4, blend: 'screen',
  core: false, coreSize: 0.12, coreIntensity: 1, coreGlow: 0.5,
  seed: 1,
};

const preset = (id, label, p) => ({ id, label, p: { ...LIGHT_DEFAULTS, ...p } });
export const LIGHT_PRESETS = [
  preset('police', 'Police Lights', {}),
  preset('emergencyRed', 'Emergency Red', { dual: false, x: 0.5, y: -0.12, size: 1.1, primary: '#ff1010', pattern: 'triple', frequency: 1.2, duration: 0.04, attack: 0.003, decay: 0.08, pause: 0.06, intensity: 2, blend: 'add', exposure: 0.5 }),
  preset('emergencyAmber', 'Emergency Amber', { dual: false, x: 0.85, y: -0.1, size: 1, primary: '#ff9a1a', pattern: 'single', frequency: 1.3, duration: 0.12, attack: 0.06, decay: 0.25, intensity: 1.5 }),
  preset('strobe', 'Strobe', { dual: false, x: 0.5, y: 0.4, size: 0.8, shape: 'wide', primary: '#ffffff', pattern: 'single', frequency: 8, duration: 0.015, attack: 0, decay: 0.03, intensity: 1, glow: 0.3, exposure: 0.7, blend: 'screen' }),
  preset('neon', 'Flickering Neon', { dual: false, x: 0.5, y: 0.35, size: 0.45, softness: 0.8, primary: '#ff3cc8', pattern: 'random', frequency: 9, duration: 0.03, attack: 0.01, decay: 0.05, base: 0.8, randomness: 0.7, intensity: 1.2, glow: 0.7, falloff: 2, exposure: 0.3, core: true, coreSize: 0.1, coreIntensity: 0.9 }),
  preset('broken', 'Broken Light', { dual: false, x: 0.5, y: 0.2, size: 0.6, primary: '#ffd9a0', pattern: 'random', frequency: 3, duration: 0.06, attack: 0.005, decay: 0.1, randomness: 0.9, intensity: 1.4, glow: 0.4, falloff: 1.8, core: true }),
  preset('beacon', 'Beacon', { dual: false, x: 0.5, y: 0.15, size: 0.7, primary: '#ff4030', pattern: 'single', frequency: 0.6, duration: 0.25, attack: 0.35, decay: 0.7, intensity: 1.3, glow: 0.6, exposure: 0.3, core: true, coreSize: 0.08 }),
  preset('flash', 'Camera Flash', { dual: false, x: 0.5, y: 0.45, size: 0.8, shape: 'wide', softness: 1, primary: '#ffffff', pattern: 'single', frequency: 0.25, duration: 0.015, attack: 0.002, decay: 0.45, intensity: 0.9, glow: 0.3, falloff: 1, exposure: 0.7, blend: 'screen' }),
];

// Presetet som innstillingene fortsatt er lik, ellers 'custom'.
export function matchingPreset(p, presets = LIGHT_PRESETS) {
  const keys = Object.keys(LIGHT_DEFAULTS);
  return presets.find((pr) => keys.every((k) => (p[k] ?? LIGHT_DEFAULTS[k]) === (pr.p[k] ?? LIGHT_DEFAULTS[k])))?.id || 'custom';
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const random = (seed, id, salt) => (effectHash((Math.imul(seed, 1013) + Math.imul(id, 7919) + salt * 131) >>> 0) & 65535) / 65535;
const FLASHES = { single: 1, double: 2, triple: 3, alternating: 2, random: 1 };

// Ett lysblink, u sekunder etter at det startet: rask oppbygging, hold, naturlig avtagende lys.
export function pulse(u, p) {
  if (u < 0) return 0;
  if (u < p.attack) return smooth(u / p.attack);
  u -= Math.max(0, p.attack);
  if (u < p.duration) return 1;
  const x = (u - p.duration) / Math.max(1e-4, p.decay);
  return x < 1 ? Math.exp(-4 * x) * (1 - x) : 0;
}

/**
 * Lysstyrken (0–1) og fargeblandingen (0 = primær, 1 = sekundær) ved c sykluser.
 * f er frekvensen nå. which: -1 alle blink, 0/1 bare partall/oddetall (to lys som veksler).
 */
export function flashAt(p, c, f, which = -1) {
  const n = FLASHES[p.pattern] || 1, period = 1 / Math.max(0.01, f), r = clamp(p.randomness || 0), seed = Math.round(p.seed || 0);
  const length = n * (p.attack + p.duration + p.pause) + p.decay + p.attack;
  const back = Math.min(32, Math.ceil(length / period) + 1);
  let best = 0, index = 0;
  for (let ci = Math.floor(c) - back; ci <= Math.floor(c); ci++) {
    for (let k = 0; k < n; k++) {
      const id = ci * n + k;
      if (which >= 0 && (((id % 2) + 2) % 2) !== which) continue;
      let start = p.pattern === 'alternating' ? (k * period) / 2 : k * (p.attack + p.duration + p.pause), amp = 1;
      if (p.pattern === 'random') {
        if (random(seed, id, 1) < 0.45) continue;
        start += random(seed, id, 2) * period * 0.8;
        amp = 0.4 + 0.6 * random(seed, id, 3);
      }
      if (r) {
        if (random(seed, id, 4) < r * 0.35) continue;
        start += random(seed, id, 5) * r * period * 0.25;
        amp *= 1 - r * 0.6 * random(seed, id, 6);
      }
      const v = amp * pulse((c - ci) * period - start, p);
      if (v > best) { best = v, index = id; }
    }
  }
  let level = clamp(p.base || 0) + (1 - clamp(p.base || 0)) * best;
  if (r) {
    // Rask flimring (neon, dårlig kontakt), ca. 24 ganger i sekundet, fast for hvert tidspunkt.
    const t = (c * period) * 24, i = Math.floor(t), a = random(seed, i, 7), b = random(seed, i + 1, 7);
    level *= 1 - r * 0.5 * (a + (b - a) * smooth(t - i));
  }
  const alternating = p.pattern === 'alternating';
  const mix = p.colorMode !== 'alternate' ? 0
    : p.transition === 'smooth' ? 0.5 - 0.5 * Math.cos(Math.PI * (alternating ? 2 * c : c))
    : ((((alternating ? index : Math.floor(index / n)) % 2) + 2) % 2);
  return { level, mix };
}

export const hexRgb = (hex) => /^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) : [1, 1, 1];
const saturate = (c, s) => { const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map((v) => clamp(l + (v - l) * s)); };
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Lysene som skal tegnes etter c sykluser: posisjon, form, farge og styrke for hvert av dem.
// p har allerede verdiene fra nøkkelbildene (animatedEffect i videoEffectsRender.js).
export function lightsAt(p, c) {
  p = { ...LIGHT_DEFAULTS, ...p };
  const primary = saturate(hexRgb(p.primary), p.saturation), secondary = saturate(hexRgb(p.secondary), p.saturation);
  if (!p.dual) {
    const { level, mix } = flashAt(p, c, p.frequency);
    const color = mixRgb(primary, secondary, mix);
    return { p, lights: [{ x: p.x, y: p.y, size: p.size, level, color, edge: p.colorMode === 'blend' ? secondary : color }] };
  }
  const alternating = p.pattern === 'alternating';
  const a = flashAt(p, c, p.frequency, alternating ? 0 : -1), b = flashAt(p, c + (p.phase2 || 0), p.frequency, alternating ? 1 : -1);
  return { p, lights: [
    { x: p.x, y: p.y, size: p.size, level: a.level, color: primary, edge: primary },
    { x: p.x2, y: p.y2, size: p.size2, level: b.level, color: secondary, edge: secondary },
  ] };
}

// Lysfordelingen langs radien (d i radier): myk kropp, bred glød og en valgfri synlig kjerne.
export function lightProfile(d, p) {
  const wide = p.shape === 'wide';
  const soft = Math.max(0.02, wide ? 1 : clamp(p.softness));
  const body = Math.pow(smooth((1 - d) / soft), Math.max(0.1, p.falloff * (wide ? 0.6 : 1)));
  const extent = 1 + 1.5 * clamp(p.glow, 0, 2);
  const glow = clamp(p.glow, 0, 2) * 0.35 * Math.pow(clamp(1 - d / extent), 2);
  const cs = Math.max(0.005, p.coreSize);
  const core = p.core ? p.coreIntensity * (1 - smooth(d / cs)) + p.coreGlow * 0.5 * Math.exp(-d / (cs * 2.5)) : 0;
  return { light: body + glow, core, extent };
}

const STOPS = 28;
const toCss = (c) => `rgb(${c.map((v) => Math.round(clamp(v) * 255)).join(',')})`;
function paintLight(ctx, light, p, w, h) {
  const k = clamp(p.intensity, 0, 8) * light.level;
  if (!(k > 0.0005)) return;
  const wide = p.shape === 'wide';
  const R = Math.max(1, light.size * h * (wide ? 2 : 1));
  const { extent } = lightProfile(0, p);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, R * extent);
  for (let i = 0; i < STOPS; i++) {
    const t = Math.pow(i / (STOPS - 1), 1.6), d = t * extent, f = lightProfile(d, p);
    const tint = mixRgb(light.color, light.edge, smooth(d));
    // Sterkt lys går mot hvitt, som en overeksponert lyskilde.
    const v = tint.map((ch) => ch * k * f.light);
    const hot = Math.max(0, Math.max(...v) - 1) * 0.35;
    const core = mixRgb(light.color, [1, 1, 1], 0.7).map((ch) => ch * f.core * light.level);
    gradient.addColorStop(i === STOPS - 1 ? 1 : t, toCss(i === STOPS - 1 ? [0, 0, 0] : v.map((ch, j) => ch + hot + core[j])));
  }
  ctx.save();
  ctx.translate(light.x * w, light.y * h);
  ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
  if (p.shape !== 'round') ctx.scale(clamp(p.spread, 0.1, 10), 1);
  ctx.fillStyle = gradient;
  ctx.fillRect(-R * extent, -R * extent, 2 * R * extent, 2 * R * extent);
  ctx.restore();
}

const BLEND = { screen: 'screen', add: 'lighter', softLight: 'soft-light', overlay: 'overlay' };
const makeCanvas = () => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
const layers = [];
function layer(i, w, h) {
  const cv = (layers[i] ||= makeCanvas());
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return g;
}

/**
 * Tegner bildet med lyset på ctx (w×h). Canvas 2D med radielle gradienter og blandingsmoduser
 * kjører på skjermkortet i Chromium og gir samme resultat i forhåndsvisning og eksport.
 * Exposure løfter bildet under lyset (bilde × lys), så lyset ser ut til å falle på motivet.
 */
export function drawLights(ctx, img, w, h, params, cycles) {
  const { p, lights } = lightsAt(params, cycles);
  const opacity = clamp(p.opacity);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  if (opacity > 0 && lights.some((l) => l.level > 0.0005)) {
    const lg = layer(0, w, h);
    lg.fillStyle = '#000';
    lg.fillRect(0, 0, w, h);
    lg.globalCompositeOperation = 'lighter';
    for (const light of lights) paintLight(lg, light, p, w, h);
    const exposure = clamp(p.exposure, 0, 2) * opacity;
    if (exposure > 0) {
      const eg = layer(1, w, h);
      eg.drawImage(img, 0, 0, w, h);
      eg.globalCompositeOperation = 'multiply';
      eg.drawImage(lg.canvas, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let left = exposure; left > 0; left -= 1) { ctx.globalAlpha = Math.min(1, left); ctx.drawImage(eg.canvas, 0, 0); }
    }
    let source = lg.canvas;
    if (p.blend === 'softLight' || p.blend === 'overlay') {
      // Grått er nøytralt for disse modusene, så lyset legges oppå 50 % grått.
      const ng = layer(2, w, h);
      ng.fillStyle = '#808080';
      ng.fillRect(0, 0, w, h);
      ng.globalCompositeOperation = 'lighter';
      ng.globalAlpha = 0.5;
      ng.drawImage(lg.canvas, 0, 0);
      source = ng.canvas;
    }
    ctx.globalCompositeOperation = BLEND[p.blend] || 'screen';
    ctx.globalAlpha = opacity;
    ctx.drawImage(source, 0, 0);
    // Lyset skal ikke fylle hull i et nøklet eller gjennomsiktig bilde.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.restore();
}
