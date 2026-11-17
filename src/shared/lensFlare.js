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

const GROUP_LABELS = { glows: 'Glows', starbursts: 'Starbursts', streaks: 'Streaks', ghosts: 'Ghosts', rings: 'Rings', arcs: 'Arcs', glints: 'Glints', diffraction: 'Diffraction', dirt: 'Lens dirt' };
export const FLARE_GROUPS = Object.entries(GROUP_LABELS).map(([id, label]) => ({ id, label }));
const words = (id) => id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const FLARE_ASSETS = manifest.assets.map((a) => ({
  id: a.id, group: a.group, label: words(a.id), file: a.file, w: a.pixel_width, h: a.pixel_height, dirt: a.type === 'dirt',
}));
export const flareAsset = (id) => FLARE_ASSETS.find((a) => a.id === id);
export const FLARE_BLENDS = [{ value: 'add', label: 'Add (linear light)' }, { value: 'screen', label: 'Screen' }];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(toSrgb(clamp(v))) * 255).toString(16).padStart(2, '0')).join('');
// Farger lagres som hex (fargevelger og nøkkelbilder i OKLab) og regnes om til lineært lys ved tegning.
export const hexLinear = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) : [1, 1, 1]);

// Kit-formatet (reccut.lensflare.preset.v1) til effektens parametere.
export function kitPreset(k) {
  return {
    preset: k.id,
    x: k.light_source_uv[0], y: k.light_source_uv[1], cx: k.optical_center_uv[0], cy: k.optical_center_uv[1],
    intensity: k.global_intensity, scale: k.global_scale, spread: k.flare_spread, opacity: k.global_opacity,
    color: '#ff9a3c', colorize: 0, blend: 'add',
    elements: k.elements.map((e) => ({
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
export const keepsOwnColors = (asset) => /rainbow|prism/.test(asset.id);

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
  const atSource = ['glows', 'starbursts', 'streaks', 'glints', 'diffraction', 'dirt'].includes(a.group);
  const size = { glows: 0.8, starbursts: 0.7, streaks: 2.5, ghosts: 0.25, rings: 0.6, arcs: 0.8, glints: 0.35, diffraction: 0.8, dirt: 1.4 }[a.group];
  return {
    id: newElementId(), asset: assetId, on: true, distance: atSource ? 1 : -0.6, ox: 0, oy: 0, size, rotation: 0,
    intensity: a.dirt ? 0.25 : 0.5, opacity: 1, tint: '#ffffff', blend: a.dirt ? 'dirt' : 'add',
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
    const [u, v] = elementCenter(p, e), [sw, sh] = elementSize(p, e, a, h), t = hexLinear(e.tint);
    const gain = t.map((v) => v * k * Math.max(0, e.intensity) * clamp(e.opacity));
    const x = u * w, y = v * h, r = Math.hypot(sw, sh) / 2;
    if (!(sw > 0) || !gain.some((c) => c > 0)) return [];
    // Lys som havner helt utenfor bildet tegnes ikke. Smuss ligger på linsen og dekker alltid hele bildet.
    if (e.blend !== 'dirt' && (x + r < 0 || x - r > w || y + r < 0 || y - r > h)) return [];
    const colorize = keepsOwnColors(a) ? 0 : clamp(p.colorize || 0);
    return [{ asset: a, x, y, w: sw, h: sh, angle: ((e.rotation || 0) * Math.PI) / 180, gain, blend: e.blend, hue, colorize }];
  });
}
