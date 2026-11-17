// Lens Flare: en lyskilde og en optisk kjede av refleksjoner (glød, stjerner, striper, ghosts, ringer).
// Teksturene og presetene kommer fra RecCut Lens Flare Kit (assets/lensflare, egenprodusert).
// Effekten lagrer en full kopi av elementene i prosjektet, så nye versjoner av presetene endrer ikke gamle prosjekter.
import manifest from '../../assets/lensflare/manifest.json' with { type: 'json' };
import anamorphicBlue from '../../assets/lensflare/presets/anamorphic_blue.json' with { type: 'json' };
import cinematicWarm from '../../assets/lensflare/presets/cinematic_warm.json' with { type: 'json' };
import concertCyan from '../../assets/lensflare/presets/concert_cyan.json' with { type: 'json' };
import flashlightWhite from '../../assets/lensflare/presets/flashlight_white.json' with { type: 'json' };
import goldenSunset from '../../assets/lensflare/presets/golden_sunset.json' with { type: 'json' };
import prismRainbow from '../../assets/lensflare/presets/prism_rainbow.json' with { type: 'json' };
import sciFiViolet from '../../assets/lensflare/presets/sci_fi_violet.json' with { type: 'json' };
import vintage35mm from '../../assets/lensflare/presets/vintage_35mm.json' with { type: 'json' };
import { toLinear, toSrgb } from './oklab.js';

const GROUP_LABELS = { glows: 'Glows', starbursts: 'Starbursts', streaks: 'Streaks', ghosts: 'Ghosts', rings: 'Rings', halos: 'Halos', arcs: 'Arcs', glints: 'Glints', diffraction: 'Diffraction', dirt: 'Lens dirt' };
export const FLARE_GROUPS = Object.entries(GROUP_LABELS).map(([id, label]) => ({ id, label }));
const words = (id) => id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Prosedyriske elementer: formen (sirkel eller N-kant), fargen og styrken regnes ut per piksel i shaderen,
// så de er skarpe i 4K og høyere. PNG-teksturene brukes fortsatt til de fotografiske elementene.
// Størrelsen er diameteren på omrisset. Tykkelse og mykhet er andeler av radien.
export const PROC_KEYS = ['blades', 'edge', 'softness', 'thickness', 'chroma', 'spectrum', 'gradient', 'phase'];
export const PROC_DEFAULTS = { blades: 0, edge: 1, softness: 0.14, thickness: 0.05, chroma: 0.02, spectrum: 0, gradient: 'angular', phase: 0 };
export const FLARE_GRADIENTS = [{ value: 'angular', label: 'Around the shape' }, { value: 'radial', label: 'Center to edge' }];
// defaults er det som skiller variantene; de settes på elementet også når Texture byttes.
const PROC_ASSETS = [
  { id: 'iris_round', group: 'ghosts', label: 'Iris ghost round', proc: 'iris', defaults: { blades: 0, spectrum: 0 } },
  { id: 'iris_polygon', group: 'ghosts', label: 'Iris ghost polygon', proc: 'iris', defaults: { blades: 6, spectrum: 0 } },
  { id: 'iris_spectral', group: 'ghosts', label: 'Iris ghost spectral', proc: 'iris', defaults: { blades: 0, spectrum: 0.85, chroma: 0.04 } },
  { id: 'ring_clean', group: 'rings', label: 'Ring', proc: 'ring', defaults: { spectrum: 0, thickness: 0.05, chroma: 0.015 } },
  { id: 'ring_spectral', group: 'rings', label: 'Ring spectral', proc: 'ring', defaults: { spectrum: 0.85, thickness: 0.06 } },
  { id: 'halo_soft', group: 'halos', label: 'Halo', proc: 'halo', defaults: { spectrum: 0, thickness: 0.35, softness: 0.08, chroma: 0.03 } },
];
export const FLARE_ASSETS = [
  ...PROC_ASSETS.map((a) => ({ ...a, w: 1, h: 1, dirt: false })),
  ...manifest.assets.map((a) => ({
    id: a.id, group: a.group, label: words(a.id), file: a.file, w: a.pixel_width, h: a.pixel_height, dirt: a.type === 'dirt',
  })),
];
export const flareAsset = (id) => FLARE_ASSETS.find((a) => a.id === id);
export const FLARE_BLENDS = [{ value: 'add', label: 'Add (linear light)' }, { value: 'screen', label: 'Screen' }];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(v) ? v : d);
// Formen til et prosedyrisk element, med gyldige verdier. Under tre lameller er formen en sirkel.
export function procParams(el, asset) {
  const q = { ...PROC_DEFAULTS, ...asset.defaults };
  for (const k of PROC_KEYS) if (el[k] !== undefined) q[k] = el[k];
  const b = Math.round(num(q.blades, 0));
  return {
    kind: asset.proc, blades: b >= 3 ? Math.min(b, 32) : 0, edge: clamp(num(q.edge, 1), 0, 4),
    softness: clamp(num(q.softness, 0)), thickness: clamp(num(q.thickness, 0.05), 0.002, 1),
    chroma: clamp(num(q.chroma, 0), 0, 0.3), spectrum: clamp(num(q.spectrum, 0)),
    gradient: q.gradient === 'radial' ? 'radial' : 'angular', phase: num(q.phase, 0) - Math.floor(num(q.phase, 0)),
  };
}
// Hvor stor flaten må være, i radier, så myk kant, ringens hale og kromatisk aberrasjon får plass.
export function procExtent(q) {
  // Ringens brede glød har sigma 2,6 · tykkelse + 0,3 · mykhet (som i shaderen); tre sigma får plass.
  const tail = q.kind === 'ring' ? 3 * (2.6 * q.thickness + 0.3 * q.softness) : 0;
  return (1 + q.chroma) * (1 + q.softness * 0.5 + tail) + 0.03;
}
const hex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(toSrgb(clamp(v))) * 255).toString(16).padStart(2, '0')).join('');
// Farger lagres som hex (fargevelger og nøkkelbilder i OKLab) og regnes om til lineært lys ved tegning.
export const hexLinear = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) : [1, 1, 1]);

// Kit-formatet (reccut.lensflare.preset.v1) til effektens parametere.
// Kit-fargene (generate_assets.py, sRGB) som de geometriske PNG-ene hadde bakt inn.
const KIT_COLORS = { amber: [1, 0.62, 0.2], blue: [0.2, 0.53, 1], purple: [0.64, 0.26, 1], green: [0.24, 0.94, 0.54] };
// Geometriske kit-teksturer tegnes prosedyrisk. scale er omrisset som andel av teksturbredden,
// thickness ringens sigma i radier. ghost_oval_pink er oval og beholder PNG-en.
const KIT_SHAPES = {
  ghost_round_amber: { asset: 'iris_round', scale: 0.65, color: 'amber' },
  ghost_hex_blue: { asset: 'iris_polygon', scale: 0.68, color: 'blue' },
  ghost_hex_purple: { asset: 'iris_polygon', scale: 0.65, color: 'purple' },
  ghost_octagon_green: { asset: 'iris_polygon', scale: 0.68, color: 'green', blades: 8 },
  ghost_prism_round: { asset: 'iris_spectral', scale: 0.65, phase: 0.58 },
  ring_rainbow: { asset: 'ring_spectral', scale: 0.59, thickness: 0.035 / 0.59, phase: 0.59 },
  ring_prism_offset: { asset: 'ring_spectral', scale: 0.59, thickness: 0.035 / 0.59, phase: 0.42 },
  ring_blue_thin: { asset: 'ring_clean', scale: 0.56, thickness: 0.022 / 0.56, color: 'blue' },
  ring_amber_wide: { asset: 'ring_clean', scale: 0.56, thickness: 0.064 / 0.56, color: 'amber' },
};
function kitElement(e, el) {
  const m = KIT_SHAPES[e.asset_id];
  if (!m) return el;
  const { asset, scale, color, ...shape } = m;
  const a = flareAsset(asset), base = color ? KIT_COLORS[color].map(toLinear) : [1, 1, 1];
  return {
    ...el, asset, size: el.size * scale, tint: hex((e.tint_linear || [1, 1, 1]).map((v, i) => v * base[i])),
    ...PROC_DEFAULTS, ...a.defaults, ...shape,
  };
}

export function kitPreset(k) {
  return {
    preset: k.id,
    x: k.light_source_uv[0], y: k.light_source_uv[1], cx: k.optical_center_uv[0], cy: k.optical_center_uv[1],
    intensity: k.global_intensity, scale: k.global_scale, spread: k.flare_spread, opacity: k.global_opacity,
    color: '#ff9a3c', colorize: 0, blend: 'add',
    elements: k.elements.map((e) => kitElement(e, {
      id: e.id, asset: e.asset_id, on: e.visible !== false, distance: e.distance, ox: e.offset_uv[0], oy: e.offset_uv[1],
      size: e.display_width_as_fraction_of_video_height, rotation: e.rotation_degrees || 0, intensity: e.intensity,
      opacity: e.opacity ?? 1, tint: hex(e.tint_linear || [1, 1, 1]),
      blend: e.blend_mode === 'lens_dirt_modulation' ? 'dirt' : e.blend_mode === 'screen' ? 'screen' : 'add',
    })),
  };
}

const KIT = [cinematicWarm, anamorphicBlue, prismRainbow, sciFiViolet, goldenSunset, vintage35mm, flashlightWhite, concertCyan];
export const FLARE_PRESETS = KIT.map((k) => ({ id: k.id, label: k.title, category: k.category, p: kitPreset(k) }));
export const FLARE_DEFAULTS = FLARE_PRESETS[0].p;
// Flare color gir elementene en ny fargetone. Regnbue- og prismeteksturer beholder sine egne farger.
// Prosedyriske elementer har sitt eget Spectrum, som shaderen holder utenfor Flare color.
export const keepsOwnColors = (asset) => !asset.proc && /rainbow|prism/.test(asset.id);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Er innstillingene endret siden presetet ble valgt?
export function flareModified(p, presets = FLARE_PRESETS) {
  const preset = presets.find((x) => x.id === p.preset);
  return !preset || Object.keys(FLARE_DEFAULTS).some((k) => k !== 'preset' && !same(p[k], preset.p[k]));
}

// Hold kilden (d=1) og optisk sentrum (d=0) i ro når spredningen endres.
export function spreadDistance(d, spread) {
  return d < 0 ? d * spread : d > 1 ? 1 + (d - 1) * spread : d;
}
// Elementets midtpunkt i UV (andel av bildets bredde og høyde): P = C + (S - C) · d + O.
export function elementCenter(p, e) {
  const d = spreadDistance(e.distance, p.spread);
  return [p.cx + (p.x - p.cx) * d + (e.ox || 0), p.cy + (p.y - p.cy) * d + (e.oy || 0)];
}
// Bredde og høyde i piksler. Bredden er en andel av videohøyden, så formen er lik i 16:9, 9:16 og 1:1.
export function elementSize(p, e, asset, height) {
  const w = Math.max(0, e.size * height * p.scale);
  return [w, (w * asset.h) / asset.w];
}

export const newElementId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
// Nytt element fra biblioteket: kilden for lys og striper, refleksjonsaksen for ghosts, ringer og buer.
export function makeElement(assetId) {
  const a = flareAsset(assetId);
  const atSource = ['glows', 'starbursts', 'streaks', 'halos', 'glints', 'diffraction', 'dirt'].includes(a.group);
  const size = { glows: 0.8, starbursts: 0.7, streaks: 2.5, ghosts: 0.25, rings: 0.6, halos: 1.2, arcs: 0.8, glints: 0.35, diffraction: 0.8, dirt: 1.4 }[a.group];
  return {
    id: newElementId(), asset: assetId, on: true, distance: atSource ? 1 : -0.6, ox: 0, oy: 0, size, rotation: 0,
    intensity: a.dirt ? 0.25 : 0.5, opacity: 1, tint: '#ffffff', blend: a.dirt ? 'dirt' : 'add',
    ...(a.proc ? { ...PROC_DEFAULTS, ...a.defaults } : {}),
  };
}

// Det som skal tegnes, i piksler: midtpunkt, størrelse, vinkel og lysstyrke (lineært lys) for hvert element.
// Global styrke og opasitet er bakt inn i hvert element. hue er Flare color i lineært lys med største kanal = 1,
// colorize hvor mye av den elementet får. only: vis bare dette elementet (solo i Flare Studio).
export function flareDraws(p, w, h, only = null) {
  const k = Math.max(0, p.intensity) * clamp(p.opacity), c = hexLinear(p.color), top = Math.max(...c, 1e-6);
  const hue = c.map((v) => v / top);
  return (p.elements || []).flatMap((e) => {
    const a = flareAsset(e.asset);
    if (!a || (only ? e.id !== only : e.on === false)) return [];
    const [u, v] = elementCenter(p, e), t = hexLinear(e.tint);
    // Et prosedyrisk element tegnes på en flate som er litt større enn omrisset (extent radier).
    const shape = a.proc ? procParams(e, a) : null, extent = shape ? procExtent(shape) : 1;
    const [sw, sh] = elementSize(p, e, a, h).map((s) => s * extent);
    const gain = t.map((v) => v * k * Math.max(0, e.intensity) * clamp(e.opacity));
    const x = u * w, y = v * h, r = Math.hypot(sw, sh) / 2;
    if (!(sw > 0) || !gain.some((c) => c > 0)) return [];
    // Lys som havner helt utenfor bildet tegnes ikke. Smuss ligger på linsen og dekker alltid hele bildet.
    if (e.blend !== 'dirt' && (x + r < 0 || x - r > w || y + r < 0 || y - r > h)) return [];
    const colorize = keepsOwnColors(a) ? 0 : clamp(p.colorize || 0);
    return [{ asset: a, x, y, w: sw, h: sh, angle: ((e.rotation || 0) * Math.PI) / 180, gain, blend: e.blend, hue, colorize, shape, extent }];
  });
}
