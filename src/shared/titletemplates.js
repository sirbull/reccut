// Titelmaler (Reccut Title Template, .reccut-title): et åpent JSON-format for supringer og titler.
// En mal har tekstfelt (for eksempel navn og tittel), farger, lag (tekst og rektangler) og
// animasjoner inn og ut. Inn-animasjonen spilles i starten av klippet og ut-animasjonen på slutten;
// midtdelen strekkes til klippets lengde. De innebygde malene bruker samme format som filer
// laget i After Effects med eksportskriptet, så alt tegnes av samme motor.
//
// Mål er i pikslene til et 1920 × 1080 bilde. «anchor» sier hvilket hjørne malen hører til,
// så den havner riktig også i stående og kvadratiske prosjekter.

export const TEMPLATE_FORMAT = 'reccut-title';

const FONT_STACKS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Menlo, Consolas, "Courier New", monospace',
  rounded: '"SF Pro Rounded", ui-rounded, "Arial Rounded MT Bold", "Segoe UI", sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif',
};

function fontStack(f) {
  if (!f) return FONT_STACKS.sans;
  if (FONT_STACKS[f]) return FONT_STACKS[f];
  return `"${String(f).replace(/["\\]/g, '')}", ${FONT_STACKS.sans}`;
}

const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  hold: (t) => (t < 1 ? 0 : 1),
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Små uttrykk for mål som følger teksten, for eksempel "width(name) + 60". Ingen eval. */

function evalExpr(src, env) {
  if (typeof src === 'number') return src;
  if (typeof src !== 'string') return 0;
  const tokens = src.match(/\d+(?:\.\d+)?|[A-Za-z_][\w]*|[()+\-*/,]/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const primary = () => {
    const t = next();
    if (t === '(') {
      const v = sum();
      next();
      return v;
    }
    if (t === '-') return -primary();
    if (/^\d/.test(t || '')) return Number(t);
    if (/^[A-Za-z_]/.test(t || '')) {
      if (peek() === '(') {
        next();
        const args = [];
        if (peek() !== ')') {
          if (t === 'width' || t === 'height' || t === 'right' || t === 'bottom' || t === 'left' || t === 'top') args.push(next());
          else args.push(sum());
          while (peek() === ',') {
            next();
            args.push(sum());
          }
        }
        next();
        if (t === 'max') return Math.max(...args);
        if (t === 'min') return Math.min(...args);
        const box = env.boxes[args[0]];
        if (!box) return 0;
        if (t === 'width') return box.w;
        if (t === 'height') return box.h;
        if (t === 'right') return box.x + box.w;
        if (t === 'bottom') return box.y + box.h;
        if (t === 'left') return box.x;
        if (t === 'top') return box.y;
        return 0;
      }
      return Number(env.vars[t]) || 0;
    }
    return 0;
  };
  const product = () => {
    let v = primary();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = primary();
      v = op === '*' ? v * r : r ? v / r : 0;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = sum();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

// Bytter {{felt}} med verdier.
function fill(str, values) {
  return String(str ?? '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => (values[k] ?? ''));
}

function sample(list, p) {
  // list: [[tid 0 til 1, verdi, ease?], ...]
  if (!Array.isArray(list) || !list.length) return null;
  if (p <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1, e] = list[i];
    const [t0, v0] = list[i - 1];
    if (p <= t1) {
      const k = t1 > t0 ? (p - t0) / (t1 - t0) : 1;
      return v0 + (v1 - v0) * (EASE[e] || EASE.out)(k);
    }
  }
  return list[list.length - 1][1];
}

/**
 * Animasjonsverdier for et lag: x og y legges til, opacity og scale ganges,
 * reveal (0 til 1) viser laget fra venstre, revealY nedenfra.
 */
function animState(layer, phase, p) {
  const s = { x: 0, y: 0, opacity: 1, scaleX: 1, scaleY: 1, rotation: 0, reveal: 1, revealY: 1 };
  const anim = layer[phase];
  if (!anim || phase === 'hold') return s;
  for (const k of Object.keys(s)) {
    const v = sample(anim[k], p);
    if (v != null) s[k] = v;
  }
  if (anim.scale) {
    const v = sample(anim.scale, p);
    if (v != null) s.scaleX = s.scaleY = v;
  }
  return s;
}

// Tidspunktet i klippet gir fase og fremdrift: inn, midtdel eller ut.
export function templatePhase(local, dur, inDur, outDur) {
  const total = Math.max(0.01, dur);
  const i = Math.min(inDur, total / 2);
  const o = Math.min(outDur, total / 2);
  if (local < i) return { phase: 'in', p: clamp(local / Math.max(1e-3, i), 0, 1) };
  if (local > total - o) return { phase: 'out', p: clamp((local - (total - o)) / Math.max(1e-3, o), 0, 1) };
  return { phase: 'hold', p: 0 };
}

export function templateDefaults(tpl) {
  const fields = {};
  for (const f of tpl.fields || []) fields[f.id] = f.default ?? '';
  const colors = {};
  for (const c of tpl.colors || []) colors[c.id] = c.default ?? '#ffffff';
  return { fields, colors, font: tpl.font || 'sans', inDur: tpl.timing?.in ?? 0.6, outDur: tpl.timing?.out ?? 0.5 };
}

// Fra designmål (1920 × 1080) til bildet, ut fra hjørnet malen hører til.
function placement(tpl, W, H) {
  const [dw, dh] = tpl.size || [1920, 1080];
  const k = Math.min(W / dw, H / dh);
  const a = tpl.anchor || 'bottom-left';
  let ox = (W - dw * k) / 2;
  let oy = (H - dh * k) / 2;
  if (a.includes('left')) ox = 0;
  if (a.includes('right')) ox = W - dw * k;
  if (a.includes('top')) oy = 0;
  if (a.includes('bottom')) oy = H - dh * k;
  return { k, ox, oy };
}

// Måler tekst og regner ut plassering og størrelse for alle lag.
function layout(ctx, tpl, values, font) {
  const boxes = {};
  const env = { boxes, vars: {} };
  // To runder, så et lag kan bruke målene til et lag som kommer senere i lista.
  let out = [];
  for (let pass = 0; pass < 2; pass++) out = layoutPass(ctx, tpl, values, font, env, boxes);
  // Tegnerekkefølge: z (lavest bakerst), ellers rekkefølgen i fila.
  return out.map((it, i) => ({ ...it, i })).sort((a, b) => (a.layer.z ?? 0) - (b.layer.z ?? 0) || a.i - b.i);
}

function layoutPass(ctx, tpl, values, font, env, boxes) {
  const out = [];
  for (const layer of tpl.layers || []) {
    if (layer.type === 'text') {
      let text = fill(layer.text, values);
      if (layer.uppercase) text = text.toUpperCase();
      const size = evalExpr(layer.size ?? 48, env);
      const weight = layer.weight || 600;
      const family = fontStack(layer.font === 'template' || !layer.font ? font : layer.font);
      ctx.font = `${weight} ${size}px ${family}`;
      const spacing = (layer.letterSpacing || 0) * size;
      const w = text ? ctx.measureText(text).width + spacing * Math.max(0, text.length - 1) : 0;
      const x0 = evalExpr(layer.x ?? 0, env);
      const y0 = evalExpr(layer.y ?? 0, env);
      const align = layer.align || 'left';
      const x = align === 'center' ? x0 - w / 2 : align === 'right' ? x0 - w : x0;
      // y er toppen av teksten.
      const box = { x, y: y0, w, h: size * 1.15, text, size, weight, family, spacing, align, empty: !text };
      boxes[layer.id || `l${out.length}`] = box;
      out.push({ layer, box });
    } else if (layer.type === 'rect') {
      const box = { x: evalExpr(layer.x ?? 0, env), y: evalExpr(layer.y ?? 0, env), w: Math.max(0, evalExpr(layer.w ?? 100, env)), h: Math.max(0, evalExpr(layer.h ?? 100, env)) };
      if (layer.hideIfEmpty && boxes[layer.hideIfEmpty]?.empty) box.w = 0;
      boxes[layer.id || `l${out.length}`] = box;
      out.push({ layer, box });
    }
  }
  return out;
}

function colorOf(c, colors) {
  const s = fill(c ?? '#ffffff', colors);
  return /^#[0-9a-f]{3,8}$/i.test(s) || /^rgba?\(/i.test(s) ? s : '#ffffff';
}

/**
 * Tegner malen. local er tiden i klippet, dur klippets lengde.
 * opts: { fields, colors, font, inDur, outDur }.
 */
export function drawTemplate(ctx, tpl, local, dur, W, H, opts = {}) {
  const def = templateDefaults(tpl);
  const fields = { ...def.fields, ...(opts.fields || {}) };
  const colors = { ...def.colors, ...(opts.colors || {}) };
  const font = opts.font || def.font;
  const { phase, p } = templatePhase(local, dur, opts.inDur ?? def.inDur, opts.outDur ?? def.outDur);
  const { k, ox, oy } = placement(tpl, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  const items = layout(ctx, tpl, fields, font);
  for (const { layer, box } of items) {
    if (box.empty || box.w <= 0 || box.h <= 0) continue;
    const s = animState(layer, phase, p);
    const opacity = clamp((layer.opacity ?? 1) * s.opacity, 0, 1);
    if (opacity <= 0.001 || s.reveal <= 0 || s.revealY <= 0 || Math.abs(s.scaleX) < 1e-3 || Math.abs(s.scaleY) < 1e-3) continue;
    ctx.save();
    ctx.globalAlpha *= opacity;
    // Skalering og rotasjon rundt midten av laget (eller punktet laget oppgir).
    const px = box.x + box.w * (layer.pivot?.[0] ?? 0.5);
    const py = box.y + box.h * (layer.pivot?.[1] ?? 0.5);
    ctx.translate(px + s.x, py + s.y);
    if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
    if (s.scaleX !== 1 || s.scaleY !== 1) ctx.scale(s.scaleX, s.scaleY);
    ctx.translate(-px, -py);
    if (s.reveal < 1 || s.revealY < 1) {
      ctx.beginPath();
      const rw = box.w * clamp(s.reveal, 0, 1);
      const rh = box.h * clamp(s.revealY, 0, 1);
      const fromRight = layer.revealFrom === 'right';
      ctx.rect(fromRight ? box.x + box.w - rw : box.x, box.y + box.h - rh, rw, rh);
      ctx.clip();
    }
    if (layer.type === 'rect') {
      ctx.fillStyle = colorOf(layer.color, colors);
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(layer.radius || 0, box.h / 2, box.w / 2));
      ctx.fill();
    } else {
      ctx.font = `${box.weight} ${box.size}px ${box.family}`;
      ctx.fillStyle = colorOf(layer.color, colors);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      if (layer.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = box.size * 0.15;
        ctx.shadowOffsetY = box.size * 0.04;
      }
      if (box.spacing) {
        let x = box.x;
        for (const ch of box.text) {
          ctx.fillText(ch, x, box.y + box.size * 0.05);
          x += ctx.measureText(ch).width + box.spacing;
        }
      } else ctx.fillText(box.text, box.x, box.y + box.size * 0.05);
    }
    ctx.restore();
  }
  ctx.restore();
}

/* Kontroll av filer som importeres: bare kjente lagtyper og felter, så en ødelagt fil ikke stopper appen. */
export function validateTemplate(data) {
  if (!data || typeof data !== 'object') throw new Error('The file is not a title template.');
  if (data.format !== TEMPLATE_FORMAT) throw new Error('The file is not a Reccut title template (format must be "reccut-title").');
  if (!Array.isArray(data.layers) || !data.layers.length) throw new Error('The template has no layers.');
  const layers = data.layers.filter((l) => l && (l.type === 'text' || l.type === 'rect'));
  if (!layers.length) throw new Error('The template has no text or rectangle layers.');
  return {
    format: TEMPLATE_FORMAT,
    version: Number(data.version) || 1,
    id: String(data.id || `custom-${Math.random().toString(36).slice(2, 9)}`),
    name: String(data.name || 'Custom Title'),
    category: String(data.category || 'Custom'),
    size: Array.isArray(data.size) && data.size.length === 2 ? data.size.map(Number) : [1920, 1080],
    anchor: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'center', 'bottom', 'top', 'left', 'right'].includes(data.anchor) ? data.anchor : 'center',
    font: data.font || 'sans',
    timing: { in: Number(data.timing?.in) || 0.6, out: Number(data.timing?.out) || 0.5 },
    fields: (Array.isArray(data.fields) ? data.fields : []).map((f) => ({ id: String(f.id), label: String(f.label || f.id), default: String(f.default ?? '') })),
    colors: (Array.isArray(data.colors) ? data.colors : []).map((c) => ({ id: String(c.id), label: String(c.label || c.id), default: String(c.default || '#ffffff') })),
    layers,
  };
}

/* Innebygde supringer (lower thirds) og titler. */

const FIELDS = [
  { id: 'name', label: 'Name', default: 'Jane Doe' },
  { id: 'title', label: 'Title', default: 'Product Designer' },
];

// Vanlige animasjoner, så malene under blir korte.
const slideIn = (dx, delay = 0) => ({ x: [[delay, dx], [Math.min(1, delay + 0.7), 0, 'out']], opacity: [[delay, 0], [Math.min(1, delay + 0.35), 1, 'linear']] });
const slideOut = (dx, delay = 0) => ({ x: [[delay, 0], [1, dx, 'in']], opacity: [[delay, 1], [Math.min(1, delay + 0.45), 0, 'linear']] });
const wipeIn = (delay = 0, len = 0.6) => ({ reveal: [[delay, 0], [Math.min(1, delay + len), 1, 'inOut']] });
const wipeOut = (delay = 0, len = 0.6) => ({ reveal: [[delay, 1], [Math.min(1, delay + len), 0, 'inOut']] });
const fadeIn = (delay = 0) => ({ opacity: [[delay, 0], [Math.min(1, delay + 0.5), 1, 'linear']], y: [[delay, 14], [Math.min(1, delay + 0.6), 0, 'out']] });
const fadeOut = (delay = 0) => ({ opacity: [[delay, 1], [Math.min(1, delay + 0.6), 0, 'linear']] });

const COLORS3 = (accent, box = '#101114', text = '#ffffff') => [
  { id: 'accent', label: 'Accent', default: accent },
  { id: 'box', label: 'Background', default: box },
  { id: 'text', label: 'Text', default: text },
];

export const BUILTIN_TEMPLATES = [
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-bar',
    name: 'Bar',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.8, out: 0.6 },
    fields: FIELDS,
    colors: COLORS3('#0a84ff'),
    layers: [
      { type: 'text', id: 'name', text: '{{name}}', size: 54, weight: 700, color: '{{text}}', x: 150, y: 846, in: slideIn(-40, 0.3), out: slideOut(-30, 0.1) },
      { type: 'text', id: 'title', text: '{{title}}', size: 32, weight: 400, color: '{{text}}', x: 150, y: 914, opacity: 0.85, in: slideIn(-40, 0.42), out: slideOut(-30, 0) },
      { type: 'rect', id: 'box', z: -2, x: 120, y: 830, w: 'max(width(name), width(title)) + 64', h: 'bottom(title) - 830 + 26', color: '{{box}}', opacity: 0.78, radius: 4, in: wipeIn(0.08, 0.55), out: wipeOut(0.35, 0.65) },
      { type: 'rect', id: 'bar', z: -1, x: 104, y: 830, w: 8, h: 'height(box)', color: '{{accent}}', pivot: [0.5, 1], in: { scaleY: [[0, 0], [0.4, 1, 'out']] }, out: { scaleY: [[0.55, 1], [1, 0, 'in']] } },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-line',
    name: 'Line',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.9, out: 0.6 },
    fields: FIELDS,
    colors: [{ id: 'accent', label: 'Line', default: '#ffd60a' }, { id: 'text', label: 'Text', default: '#ffffff' }],
    layers: [
      { type: 'rect', id: 'line', x: 120, y: 900, w: 'max(width(name), width(title)) + 40', h: 4, color: '{{accent}}', in: wipeIn(0, 0.5), out: wipeOut(0.4, 0.6) },
      { type: 'text', id: 'name', text: '{{name}}', size: 58, weight: 700, color: '{{text}}', x: 120, y: 828, shadow: true, in: { y: [[0.3, 50], [0.85, 0, 'out']], revealY: [[0.3, 0], [0.8, 1, 'out']] }, out: { y: [[0, 0], [0.6, 40, 'in']], opacity: [[0.2, 1], [0.6, 0]] } },
      { type: 'text', id: 'title', text: '{{title}}', size: 30, weight: 500, color: '{{text}}', x: 120, y: 918, shadow: true, uppercase: true, letterSpacing: 0.12, in: { y: [[0.4, -36], [0.95, 0, 'out']], opacity: [[0.4, 0], [0.8, 1]] }, out: { y: [[0, 0], [0.6, -30, 'in']], opacity: [[0.1, 1], [0.6, 0]] } },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-box',
    name: 'Box',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.6, out: 0.45 },
    fields: FIELDS,
    colors: [{ id: 'box', label: 'Box', default: '#ff375f' }, { id: 'text', label: 'Text', default: '#ffffff' }],
    layers: [
      { type: 'text', id: 'name', text: '{{name}}', size: 50, weight: 800, color: '{{text}}', x: 152, y: 842, in: fadeIn(0.35), out: fadeOut(0) },
      { type: 'text', id: 'title', text: '{{title}}', size: 30, weight: 500, color: '{{text}}', x: 152, y: 904, opacity: 0.9, in: fadeIn(0.45), out: fadeOut(0) },
      { type: 'rect', id: 'box', z: -1, x: 120, y: 820, w: 'max(width(name), width(title)) + 64', h: 'bottom(title) - 820 + 26', color: '{{box}}', radius: 14, pivot: [0, 0.5], in: { scale: [[0, 0.6], [0.7, 1, 'back']], opacity: [[0, 0], [0.25, 1, 'linear']] }, out: { scale: [[0.2, 1], [1, 0.7, 'in']], opacity: [[0.4, 1], [1, 0, 'linear']] } },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-split',
    name: 'Split',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.9, out: 0.6 },
    fields: FIELDS,
    colors: COLORS3('#30d158', '#0b0c0f'),
    layers: [
      { type: 'text', id: 'name', text: '{{name}}', size: 52, weight: 700, color: '{{text}}', x: 146, y: 812, in: fadeIn(0.3), out: fadeOut(0) },
      { type: 'text', id: 'title', text: '{{title}}', size: 30, weight: 600, color: '#0b0c0f', x: 146, y: 898, in: fadeIn(0.5), out: fadeOut(0) },
      { type: 'rect', id: 'top', z: -1, x: 120, y: 796, w: 'width(name) + 52', h: 'height(name) + 26', color: '{{box}}', revealFrom: 'left', in: wipeIn(0, 0.55), out: wipeOut(0.4, 0.6) },
      { type: 'rect', id: 'bottom', z: -1, x: 120, y: 'bottom(top)', w: 'width(title) + 52', h: 'height(title) + 18', color: '{{accent}}', hideIfEmpty: 'title', in: wipeIn(0.25, 0.55), out: wipeOut(0.2, 0.6) },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-band',
    name: 'News Band',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.8, out: 0.6 },
    fields: FIELDS,
    colors: COLORS3('#e21c2a', '#ffffff', '#111111'),
    layers: [
      { type: 'rect', id: 'band', x: 0, y: 860, w: 1920, h: 86, color: '{{box}}', opacity: 0.95, in: wipeIn(0.1, 0.6), out: wipeOut(0.3, 0.7) },
      { type: 'rect', id: 'tag', x: 0, y: 946, w: 1920, h: 52, color: '{{accent}}', in: wipeIn(0.3, 0.6), out: wipeOut(0.15, 0.6) },
      { type: 'text', id: 'name', text: '{{name}}', size: 54, weight: 800, color: '{{text}}', x: 140, y: 872, in: fadeIn(0.45), out: fadeOut(0) },
      { type: 'text', id: 'title', text: '{{title}}', size: 30, weight: 600, color: '#ffffff', x: 140, y: 956, uppercase: true, letterSpacing: 0.06, in: fadeIn(0.6), out: fadeOut(0) },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-minimal',
    name: 'Minimal',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.7, out: 0.5 },
    fields: FIELDS,
    colors: [{ id: 'text', label: 'Text', default: '#ffffff' }, { id: 'accent', label: 'Accent', default: '#ffffff' }],
    layers: [
      { type: 'text', id: 'name', text: '{{name}}', size: 48, weight: 600, color: '{{text}}', x: 120, y: 850, shadow: true, in: fadeIn(0), out: fadeOut(0.2) },
      { type: 'text', id: 'title', text: '{{title}}', size: 30, weight: 400, color: '{{text}}', x: 120, y: 910, opacity: 0.8, shadow: true, in: fadeIn(0.25), out: fadeOut(0) },
      { type: 'rect', id: 'line', x: 122, y: 'bottom(title) + 10', w: 60, h: 3, color: '{{accent}}', in: wipeIn(0.4, 0.5), out: wipeOut(0, 0.5) },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-tag',
    name: 'Tag',
    category: 'Lower Thirds',
    anchor: 'bottom-left',
    timing: { in: 0.7, out: 0.5 },
    fields: FIELDS,
    colors: COLORS3('#ffd60a', '#ffffff', '#111111'),
    layers: [
      { type: 'text', id: 'name', text: '{{name}}', size: 40, weight: 700, color: '{{text}}', x: 176, y: 870, in: fadeIn(0.35), out: fadeOut(0) },
      { type: 'text', id: 'title', text: '{{title}}', size: 26, weight: 500, color: '#ffffff', x: 'right(name) + 56', y: 879, shadow: true, in: slideIn(-30, 0.5), out: fadeOut(0) },
      { type: 'rect', id: 'pill', z: -2, x: 120, y: 856, w: 'width(name) + 84', h: 74, color: '{{box}}', radius: 37, pivot: [0, 0.5], in: { scaleX: [[0, 0.2], [0.6, 1, 'back']], opacity: [[0, 0], [0.2, 1, 'linear']] }, out: { scaleX: [[0.3, 1], [1, 0.2, 'in']], opacity: [[0.6, 1], [1, 0, 'linear']] } },
      { type: 'rect', id: 'dot', z: -1, x: 140, y: 881, w: 24, h: 24, color: '{{accent}}', radius: 12, in: { scale: [[0.4, 0], [0.8, 1, 'back']] }, out: { scale: [[0, 1], [0.4, 0, 'in']] } },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'lt-right',
    name: 'Right Corner',
    category: 'Lower Thirds',
    anchor: 'bottom-right',
    timing: { in: 0.8, out: 0.6 },
    fields: FIELDS,
    colors: COLORS3('#bf5af2'),
    layers: [
      { type: 'text', id: 'name', text: '{{name}}', size: 52, weight: 700, color: '{{text}}', x: 1770, y: 846, align: 'right', in: slideIn(40, 0.3), out: slideOut(30, 0.1) },
      { type: 'text', id: 'title', text: '{{title}}', size: 30, weight: 400, color: '{{text}}', x: 1770, y: 912, align: 'right', opacity: 0.85, in: slideIn(40, 0.42), out: slideOut(30, 0) },
      { type: 'rect', id: 'box', z: -2, x: '1800 - max(width(name), width(title)) - 64', y: 830, w: 'max(width(name), width(title)) + 64', h: 'bottom(title) - 830 + 24', color: '{{box}}', opacity: 0.78, radius: 4, revealFrom: 'right', in: wipeIn(0.08, 0.55), out: wipeOut(0.35, 0.65) },
      { type: 'rect', id: 'bar', z: -1, x: 1808, y: 830, w: 8, h: 'height(box)', color: '{{accent}}', pivot: [0.5, 1], in: { scaleY: [[0, 0], [0.4, 1, 'out']] }, out: { scaleY: [[0.55, 1], [1, 0, 'in']] } },
    ],
  },
  {
    format: TEMPLATE_FORMAT,
    id: 'tt-chapter',
    name: 'Chapter',
    category: 'Titles',
    anchor: 'center',
    timing: { in: 0.9, out: 0.7 },
    fields: [
      { id: 'name', label: 'Title', default: 'Chapter One' },
      { id: 'title', label: 'Subtitle', default: 'Getting started' },
    ],
    colors: COLORS3('#0a84ff'),
    layers: [
      { type: 'text', id: 'title', text: '{{title}}', size: 34, weight: 500, color: '{{accent}}', x: 960, y: 450, align: 'center', uppercase: true, letterSpacing: 0.2, in: fadeIn(0), out: fadeOut(0.1) },
      { type: 'text', id: 'name', text: '{{name}}', size: 104, weight: 800, color: '{{text}}', x: 960, y: 500, align: 'center', shadow: true, in: { scale: [[0.15, 1.12], [0.85, 1, 'out']], opacity: [[0.15, 0], [0.55, 1, 'linear']] }, out: { scale: [[0, 1], [1, 0.94, 'in']], opacity: [[0.2, 1], [1, 0, 'linear']] } },
      { type: 'rect', id: 'rule', x: '960 - width(name) / 2', y: 'bottom(name) + 18', w: 'width(name)', h: 4, color: '{{accent}}', pivot: [0.5, 0.5], in: { scaleX: [[0.4, 0], [1, 1, 'out']] }, out: { scaleX: [[0, 1], [0.6, 0, 'in']] } },
    ],
  },
];

export function findTemplate(id, custom = {}) {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) || custom[id] || null;
}
