// Filmlooks: simulerte filmtyper, sort-hvitt-filtre og kreative stiler. Hver look er en fargefunksjon
// som bakes til en 3D-LUT første gang den brukes, og legges på etter fargekorrigeringen (clip.props.film,
// styrke i filmMix). Verdiene er skjønn ut fra hvordan filmene ser ut, ikke målte data fra produsentene.
// ponytail: bare farge og tonekurve. Korn og halasjon trenger romlige filtre, og er ikke med.

const lin = (x) => Math.pow(Math.max(x, 0), 2.2);
const gam = (x) => Math.pow(Math.max(x, 0), 1 / 2.2);
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const at = (v, i) => (Array.isArray(v) ? v[i] : v);
// S-kurve med knekkpunkt i p: k > 0 gir mer kontrast, k < 0 mindre. 0 og 1 ligger fast.
const s = (x, k, p) => (x < p ? p * Math.pow(x / p, 1 + k) : 1 - (1 - p) * Math.pow((1 - x) / (1 - p), 1 + k));

/**
 * wb: forsterkning per kanal i lineært lys (også eksponering). matrix: kanalblanding i lineært lys.
 * mono: sort-hvitt med filmens følsomhet for rødt, grønt og blått (lineært lys, summen er omtrent 1).
 * contrast/pivot: S-kurven, per kanal hvis liste. sat: metning. shadows/highlights: fargestikk i skygger
 * og høylys. black/white: hvor sort og hvitt havner (falmet), per kanal hvis liste.
 */
function film({ wb = [1, 1, 1], matrix, mono, contrast = 0, pivot = 0.42, sat = 1, shadows = [0, 0, 0], highlights = [0, 0, 0], black = 0, white = 1 }) {
  return (r, g, b) => {
    let l = [lin(r) * wb[0], lin(g) * wb[1], lin(b) * wb[2]];
    if (matrix) l = matrix.map((row) => row[0] * l[0] + row[1] * l[1] + row[2] * l[2]);
    if (mono) l = Array(3).fill(Math.max(0, mono[0] * l[0] + mono[1] * l[1] + mono[2] * l[2]));
    let c = l.map((x, i) => s(Math.min(gam(x), 1), at(contrast, i), pivot));
    const y = luma(c);
    c = c.map((x, i) => y + (x - y) * sat + shadows[i] * (1 - y) ** 2 + highlights[i] * y * y);
    return c.map((x, i) => Math.min(1, Math.max(0, at(black, i) + x * (at(white, i) - at(black, i)))));
  };
}

const PAN = [0.25, 0.6, 0.15];

export const FILM_LOOKS = [
  // Fargefilm
  { id: 'portra400', group: 'Color film', label: 'Kodak Portra 400', fn: film({ wb: [1.04, 1, 0.94], contrast: -0.08, sat: 0.88, shadows: [0, 0.01, 0.015], highlights: [0.02, 0.01, -0.01], black: 0.03, white: 0.98 }) },
  { id: 'portra160', group: 'Color film', label: 'Kodak Portra 160', fn: film({ wb: [1.02, 1, 0.97], contrast: -0.12, sat: 0.8, highlights: [0.015, 0.008, -0.005], black: 0.025, white: 0.98 }) },
  { id: 'ektar100', group: 'Color film', label: 'Kodak Ektar 100', fn: film({ wb: [1.02, 1, 0.98], contrast: 0.22, sat: 1.35 }) },
  { id: 'gold200', group: 'Color film', label: 'Kodak Gold 200', fn: film({ wb: [1.1, 1.03, 0.82], contrast: 0.08, sat: 1.08, highlights: [0.03, 0.02, -0.04], black: 0.02 }) },
  { id: 'ultramax400', group: 'Color film', label: 'Kodak UltraMax 400', fn: film({ wb: [1.06, 1.02, 0.9], contrast: 0.12, sat: 1.15, black: 0.03 }) },
  { id: 'kodachrome64', group: 'Color film', label: 'Kodachrome 64', fn: film({ wb: [1.05, 1, 0.95], matrix: [[1.12, -0.06, -0.06], [-0.03, 1.04, -0.01], [-0.02, -0.06, 1.08]], contrast: 0.3, sat: 1.25, highlights: [0.02, 0.01, -0.02] }) },
  { id: 'pro400h', group: 'Color film', label: 'Fujifilm Pro 400H', fn: film({ wb: [0.97, 1.02, 1.03], contrast: -0.1, sat: 0.85, shadows: [-0.01, 0.015, 0.01], highlights: [0, 0.01, 0.015], black: 0.04 }) },
  { id: 'superia400', group: 'Color film', label: 'Fujicolor Superia 400', fn: film({ wb: [0.98, 1.03, 0.98], contrast: 0.15, sat: 1.15, shadows: [-0.015, 0.02, 0] }) },
  { id: 'velvia50', group: 'Color film', label: 'Fujifilm Velvia 50', fn: film({ wb: [0.98, 1, 1.03], contrast: 0.32, sat: 1.55, shadows: [0, 0, 0.02] }) },
  { id: 'provia100f', group: 'Color film', label: 'Fujifilm Provia 100F', fn: film({ contrast: 0.18, sat: 1.15 }) },
  { id: 'polaroid600', group: 'Color film', label: 'Polaroid 600', fn: film({ contrast: -0.1, sat: 0.85, shadows: [-0.02, 0.01, 0.02], highlights: [0.04, 0.03, -0.02], black: 0.08, white: 0.93 }) },
  { id: 'expired', group: 'Color film', label: 'Expired film', fn: film({ wb: [1.05, 0.95, 1], contrast: -0.15, sat: 0.7, shadows: [0.02, -0.01, 0.03], highlights: [0.04, 0.02, -0.03], black: 0.06 }) },
  // Kinofilm
  { id: 'vision500t', group: 'Cinema film', label: 'Kodak Vision3 500T', fn: film({ contrast: -0.15, sat: 0.9, shadows: [-0.02, 0.005, 0.025], highlights: [0.03, 0.01, -0.02], black: 0.025 }) },
  { id: 'print2383', group: 'Cinema film', label: 'Kodak 2383 print', fn: film({ matrix: [[1, 0, 0], [0, 1, 0], [0.02, 0.06, 0.92]], contrast: 0.3, shadows: [-0.03, 0.01, 0.03], highlights: [0.03, 0.015, -0.03], white: 0.96 }) },
  { id: 'eterna250d', group: 'Cinema film', label: 'Fujifilm Eterna 250D', fn: film({ wb: [0.98, 1.01, 1], contrast: -0.18, sat: 0.72, shadows: [-0.01, 0.01, 0.01], black: 0.03 }) },
  { id: 'cinestill800t', group: 'Cinema film', label: 'CineStill 800T', fn: film({ wb: [0.88, 0.98, 1.12], contrast: 0.12, sat: 1.05, shadows: [-0.02, 0.01, 0.04], highlights: [0.04, 0, -0.02] }) },
  { id: 'technicolor', group: 'Cinema film', label: 'Technicolor three-strip', fn: film({ wb: [1.03, 1, 0.97], matrix: [[1.25, -0.15, -0.1], [-0.12, 1.2, -0.08], [-0.1, -0.15, 1.25]], contrast: 0.2, sat: 1.3 }) },
  { id: 'bleachbypass', group: 'Cinema film', label: 'Bleach bypass', fn: film({ contrast: 0.45, sat: 0.45 }) },
  { id: 'crossprocess', group: 'Cinema film', label: 'Cross processed', fn: film({ contrast: [0.35, 0.25, -0.25], sat: 1.1, black: [0, 0, 0.12], white: [1, 1, 0.85] }) },
  { id: 'aerochrome', group: 'Cinema film', label: 'Kodak Aerochrome (infrared)', fn: film({ matrix: [[0.2, 1.1, -0.3], [0.9, 0.1, 0], [0, 0, 1]], contrast: 0.15, sat: 1.2 }) },
  // Sort-hvitt: filmtyper
  { id: 'trix400', group: 'Black & white film', label: 'Kodak Tri-X 400', fn: film({ mono: PAN, contrast: 0.35, black: 0.01 }) },
  { id: 'hp5', group: 'Black & white film', label: 'Ilford HP5 Plus', fn: film({ mono: [0.27, 0.6, 0.13], contrast: 0.12, black: 0.03 }) },
  { id: 'tmax100', group: 'Black & white film', label: 'Kodak T-Max 100', fn: film({ mono: [0.24, 0.63, 0.13], contrast: 0.2 }) },
  { id: 'doublex', group: 'Black & white film', label: 'Eastman Double-X 5222', fn: film({ mono: PAN, contrast: 0.45, pivot: 0.45 }) },
  // Rødblind film: hud og lepper blir mørke, himmelen lys. The Lighthouse fikk dette med et filter som stengte ute rødt.
  { id: 'ortho', group: 'Black & white film', label: 'Orthochromatic (The Lighthouse)', fn: film({ mono: [0, 0.45, 0.55], contrast: 0.4, pivot: 0.45 }) },
  { id: 'wetplate', group: 'Black & white film', label: 'Wet plate (blue sensitive)', fn: film({ mono: [0, 0.1, 0.9], contrast: 0.25, shadows: [0.02, 0.01, -0.01], highlights: [0.02, 0.015, 0], black: 0.04 }) },
  { id: 'silent', group: 'Black & white film', label: 'Silent film', fn: film({ mono: [0.05, 0.5, 0.45], contrast: 0.15, highlights: [0.05, 0.03, -0.02], black: 0.06, white: 0.92 }) },
  { id: 'noir', group: 'Black & white film', label: 'Film noir', fn: film({ mono: [0.3, 0.6, 0.1], contrast: 0.65, pivot: 0.4 }) },
  { id: 'infrared', group: 'Black & white film', label: 'Infrared', fn: film({ mono: [0.5, 1.5, -1], contrast: 0.2 }) },
  // Sort-hvitt: fargefiltre foran objektivet
  { id: 'bwred', group: 'Black & white filters', label: 'Red filter (dark skies, light skin)', fn: film({ mono: [0.9, 0.25, -0.15], contrast: 0.25 }) },
  { id: 'bworange', group: 'Black & white filters', label: 'Orange filter', fn: film({ mono: [0.6, 0.45, -0.05], contrast: 0.2 }) },
  { id: 'bwyellow', group: 'Black & white filters', label: 'Yellow filter', fn: film({ mono: [0.38, 0.62, 0], contrast: 0.15 }) },
  { id: 'bwgreen', group: 'Black & white filters', label: 'Green filter (light foliage)', fn: film({ mono: [0.12, 0.88, 0], contrast: 0.15 }) },
  { id: 'bwblue', group: 'Black & white filters', label: 'Blue filter (dark skin)', fn: film({ mono: [0, 0.3, 0.7], contrast: 0.3 }) },
  // Sort-hvitt: tonede kopier
  { id: 'sepia', group: 'Toned prints', label: 'Sepia', fn: film({ mono: PAN, contrast: 0.1, shadows: [0.07, 0.025, -0.05], highlights: [0.08, 0.03, -0.07], black: 0.03 }) },
  { id: 'selenium', group: 'Toned prints', label: 'Selenium', fn: film({ mono: PAN, contrast: 0.25, shadows: [0.02, -0.01, 0.03], highlights: [0.01, 0.005, -0.01] }) },
  { id: 'cyanotype', group: 'Toned prints', label: 'Cyanotype', fn: film({ mono: PAN, contrast: 0.1, black: [0, 0.12, 0.3] }) },
  // Kreative stiler
  { id: 'tealorange', group: 'Creative', label: 'Teal and orange', fn: film({ contrast: 0.15, sat: 1.1, shadows: [-0.06, 0.01, 0.05], highlights: [0.06, 0.02, -0.05] }) },
  { id: 'nordicnoir', group: 'Creative', label: 'Nordic noir', fn: film({ wb: [0.95, 1, 1.08], contrast: 0.2, sat: 0.6, shadows: [-0.03, 0.01, 0.03], black: 0.03 }) },
  { id: 'goldenhour', group: 'Creative', label: 'Golden hour', fn: film({ wb: [1.15, 1.02, 0.8], contrast: 0.08, sat: 1.1, highlights: [0.04, 0.02, -0.03] }) },
  { id: 'daynight', group: 'Creative', label: 'Day for night', fn: film({ wb: [0.22, 0.3, 0.5], contrast: 0.1, sat: 0.5 }) },
  { id: 'moonlight', group: 'Creative', label: 'Moonlight', fn: film({ wb: [0.85, 0.95, 1.15], contrast: 0.2, sat: 0.35 }) },
  { id: 'matrix', group: 'Creative', label: 'Digital green', fn: film({ wb: [0.85, 1.08, 0.85], contrast: 0.25, sat: 0.7, shadows: [-0.02, 0.04, -0.01] }) },
  { id: 'neon', group: 'Creative', label: 'Neon night', fn: film({ contrast: 0.25, sat: 1.3, shadows: [0.05, -0.03, 0.08], highlights: [-0.04, 0.03, 0.05] }) },
  { id: 'pastel', group: 'Creative', label: 'Pastel dream', fn: film({ contrast: -0.25, sat: 0.75, highlights: [0.02, 0, 0.03], black: 0.08, white: 0.97 }) },
  { id: 'seventies', group: 'Creative', label: '1970s', fn: film({ wb: [1.08, 1, 0.85], contrast: -0.05, sat: 0.85, highlights: [0.02, 0.02, -0.03], black: [0.06, 0.04, 0.02] }) },
];

export const FILM_IDS = FILM_LOOKS.map((f) => f.id);

const SIZE = 33;
const baked = new Map();
// Rødt varierer raskest, som i .cube-filer.
export function bakeFilm(id) {
  if (baked.has(id)) return baked.get(id);
  const f = FILM_LOOKS.find((x) => x.id === id);
  if (!f) return null;
  const data = new Float32Array(SIZE ** 3 * 3);
  let i = 0;
  for (let b = 0; b < SIZE; b++)
    for (let g = 0; g < SIZE; g++)
      for (let r = 0; r < SIZE; r++) {
        const o = f.fn(r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1));
        data[i++] = o[0];
        data[i++] = o[1];
        data[i++] = o[2];
      }
  const lut = { size: SIZE, data, tex: null };
  baked.set(id, lut);
  return lut;
}
