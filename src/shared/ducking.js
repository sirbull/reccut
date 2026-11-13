// Automatisk demping (ducking): musikken senkes mens noen snakker, og kommer tilbake i pausene.
// Resultatet er vanlige volumnøkkelbilder på musikklippene, så det høres likt i avspilling og eksport,
// vises på tidslinjen og kan justeres for hånd etterpå.
//
// Talen finnes fra bølgeformene til alle andre lydkilder på tidslinjen (de samme toppverdiene som
// tegnes i klippene), med volum, fades, demping og solo slik computeAudio regner dem.

import { componentVolumeProp, computeAudio, kfTime, valueAt } from './model.js';

export const DUCK_DEFAULTS = {
  amount: -12, // dB under musikkens eget nivå mens noen snakker
  attack: 0.25, // sekunder musikken bruker på å gå ned før talen
  release: 0.8, // sekunder den bruker på å komme tilbake etter talen
  hold: 0.6, // pauser kortere enn dette holder musikken nede
  sensitivity: 12, // dB over støygulvet i hver kilde som regnes som tale
};

const STEP = 0.05;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

// Støygulvet i en bølgeform: det stille nivået mellom ordene (15. persentil av toppene som ikke er null).
function noiseFloorDb(wave) {
  const vals = wave.peaks.filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return -120;
  return db(vals[Math.floor(vals.length * 0.15)] / 255);
}

// Tidsrommene [start, slutt] der noen snakker, i tidslinjetid.
// waveOf(stream) gir { rate, peaks } for en lydstrøm, eller null når den ikke er analysert ennå.
// ignore: klipp-id-ene som ikke er tale (musikken som skal dempes).
export function speechRegions(project, waveOf, { ignore = new Set(), a = 0, b = project.duration, sensitivity = DUCK_DEFAULTS.sensitivity, hold = DUCK_DEFAULTS.hold, minLength = 0.15 } = {}) {
  const thresholds = new Map();
  const threshold = (wave) => {
    if (!thresholds.has(wave)) thresholds.set(wave, Math.max(-45, noiseFloorDb(wave) + sensitivity));
    return thresholds.get(wave);
  };
  const regions = [];
  let open = null;
  for (let T = a; T < b; T += STEP) {
    let on = false;
    for (const s of computeAudio(project, T)) {
      if (ignore.has(s.clip.id) || s.gain < 0.05) continue;
      const wave = waveOf(project.media[s.clip.mediaId]?.streams?.[s.stream]);
      if (!wave?.peaks?.length) continue;
      const span = STEP * Math.max(0.1, Math.abs(s.speed || 1));
      // Kildetiden blokken dekker (baklengs klipp går nedover i kilden).
      const lo = s.speed < 0 ? s.src - span : s.src;
      const i0 = Math.max(0, Math.floor(lo * wave.rate));
      const i1 = Math.max(i0 + 1, Math.ceil((lo + span) * wave.rate));
      let m = 0;
      for (let i = i0; i < i1 && i < wave.peaks.length; i++) if (wave.peaks[i] > m) m = wave.peaks[i];
      if (db(m / 255) > threshold(wave)) {
        on = true;
        break;
      }
    }
    if (on && !open) open = [T, T + STEP];
    else if (on) open[1] = T + STEP;
    else if (open && T - open[1] >= hold) {
      regions.push(open);
      open = null;
    }
  }
  if (open) regions.push(open);
  return regions.filter(([x, y]) => y - x >= minLength).map(([x, y]) => [r3(x), r3(Math.min(b, y))]);
}

// Volumnøkkelbildene for ett musikklipp. Erstatter klippets volumnøkkelbilder, med nivået ved
// starten av klippet som utgangspunkt. Returnerer false når ingen tale overlapper klippet.
export function duckClip(clip, regions, opts = {}) {
  const { amount, attack, release } = { ...DUCK_DEFAULTS, ...opts };
  const prop = componentVolumeProp(clip, clip.stream || 'main');
  const s = clip.start;
  const e = clip.start + clip.dur;
  // Taleperioder som ligger så tett at rampene ville overlappe, slås sammen.
  const merged = [];
  for (const [x, y] of regions) {
    if (y + release < s || x - attack > e) continue;
    const last = merged.at(-1);
    if (last && x - attack <= last[1] + release) last[1] = Math.max(last[1], y);
    else merged.push([x, y]);
  }
  if (!merged.length) return false;
  const base = valueAt(clip, prop, s) ?? 0;
  const low = base + amount;
  const pts = [];
  for (const [x, y] of merged) pts.push([x - attack, base], [x, low], [y, low], [y + release, base]);
  const at = (T) => {
    if (T <= pts[0][0] || T >= pts.at(-1)[0]) return base;
    let i = 0;
    while (pts[i + 1][0] < T) i++;
    const [t0, v0] = pts[i];
    const [t1, v1] = pts[i + 1];
    return t1 === t0 ? v1 : v0 + ((v1 - v0) * (T - t0)) / (t1 - t0);
  };
  const list = [[s, at(s)], ...pts.filter(([T]) => T > s && T < e), [e, at(e)]];
  // Punkter midt på en flat strekning trengs ikke.
  const kept = list.filter((p, i) => i === 0 || i === list.length - 1 || !(list[i - 1][1] === p[1] && list[i + 1][1] === p[1]));
  clip.kf = { ...clip.kf, [prop]: kept.map(([T, v]) => [r3(kfTime(clip, T)), r2(v), 'linear']) };
  return true;
}

// Talen under de valgte musikklippene: all annen lyd på tidslinjen, fra litt før til litt etter musikken.
// Kjøres på det vanlige prosjektet (ikke et utkast), siden den spør computeAudio mange ganger.
export function speechUnderMusic(project, ids, waveOf, opts = {}) {
  const o = { ...DUCK_DEFAULTS, ...opts };
  const music = ids.map((id) => project.clips[id]).filter(Boolean);
  if (!music.length) return [];
  const a = Math.max(0, Math.min(...music.map((c) => c.start)) - o.release);
  const b = Math.max(...music.map((c) => c.start + c.dur)) + o.attack;
  return speechRegions(project, waveOf, { ignore: new Set(music.map((c) => c.id)), a, b, sensitivity: o.sensitivity, hold: o.hold });
}

// Demper musikklippene i taleperiodene. Returnerer hvor mange klipp som fikk nøkkelbilder.
export function duckMusic(project, ids, regions, opts = {}) {
  let clips = 0;
  for (const id of ids) if (project.clips[id] && duckClip(project.clips[id], regions, opts)) clips++;
  return { clips, regions: regions.length };
}
