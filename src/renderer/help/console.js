// Konsollet (Ctrl mellomrom): ett søk som finner alt i appen. Kommandoer, verktøy, effekter,
// overganger, titler, looks, animasjoner, enkeltinnstillinger i inspektøren, media og hjelp.
// Det du velger, blir brukt eller åpnet, og det som endres, blir markert så du ser hvor det er.
import {
  ANIMATION_PRESETS,
  COLOR_LOOKS,
  EFFECTS,
  TITLE_TEMPLATES,
  TRANSITIONS,
  applyAnimationPreset,
  isVisual,
} from '../../shared/model.js';
import { commit, project, room, selection } from '../editor/store.js';
import * as commands from '../editor/commands.js';
import { COMMANDS, runCommand } from '../registry.js';
import { ARTICLES } from './articles.js';
import { toast } from '../ui.jsx';

/* Markering: elementet rulles frem og blinker kort. Har det et tallfelt, får det fokus. */

export function flash(selector, { focus = false, tries = 12 } = {}) {
  const attempt = (n) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) {
      if (n > 0) requestAnimationFrame(() => attempt(n - 1));
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    el.classList.remove('console-flash');
    void el.offsetWidth;
    el.classList.add('console-flash');
    setTimeout(() => el.classList.remove('console-flash'), 1800);
    if (focus) el.querySelector('input:not([type="range"]), .num-field')?.focus();
  };
  requestAnimationFrame(() => attempt(tries));
}

// Klippene en effekt eller innstilling skal gjelde: utvalget, eller klippet under spillhodet.
function visualTargets() {
  const p = project.value;
  let ids = selection.value.filter((id) => p.clips[id] && isVisual(p.clips[id]) && p.clips[id].type !== 'caption' && p.clips[id].type !== 'redact');
  if (!ids.length) {
    commands.selectClipAtPlayhead();
    ids = selection.value.filter((id) => p.clips[id] && isVisual(p.clips[id]));
  }
  return ids;
}

function needClip() {
  if (!selection.value.length) commands.selectClipAtPlayhead();
  if (!selection.value.length) {
    toast('Select a clip first, or move the playhead over one.');
    return false;
  }
  return true;
}

function showInspectorParam(tab, selector) {
  if (!needClip()) return;
  commands.inspectorTab.value = tab;
  flash(`.inspector [data-tab="${tab}"]`);
  if (selector) flash(`.inspector ${selector}`, { focus: true });
}

// Innstillinger i inspektøren som kan søkes frem direkte.
const PARAMS = [
  ['video', 'opacity', 'Opacity', 'transparency alpha'],
  ['video', 'x', 'Position X', 'move horizontal'],
  ['video', 'y', 'Position Y', 'move vertical'],
  ['video', 'scale', 'Scale', 'size zoom resize'],
  ['video', 'rotation', 'Rotation', 'rotate angle'],
  ['video', 'anchorX', 'Anchor X', 'anchor point pivot origin center'],
  ['video', 'anchorY', 'Anchor Y', 'anchor point pivot origin center'],
  ['recording', 'cameraOffsetX', 'Camera Offset X', 'pip face reframe position inside frame'],
  ['recording', 'cameraOffsetY', 'Camera Offset Y', 'pip face reframe position inside frame'],
  ['color', 'exposure', 'Exposure', 'brightness light'],
  ['color', 'contrast', 'Contrast', ''],
  ['color', 'highlights', 'Highlights', 'bright areas'],
  ['color', 'shadows', 'Shadows', 'dark areas'],
  ['color', 'saturation', 'Saturation', 'vibrance color intensity'],
  ['color', 'temperature', 'Temperature', 'white balance warm cool'],
  ['color', 'tint', 'Tint', 'green magenta white balance'],
  ['audio', 'volume', 'Volume', 'loudness gain level db'],
  ['video', 'cropL', 'Crop Left', 'crop trim edge'],
  ['video', 'cropR', 'Crop Right', 'crop trim edge'],
  ['video', 'cropT', 'Crop Top', 'crop trim edge'],
  ['video', 'cropB', 'Crop Bottom', 'crop trim edge'],
];

function itemsFor() {
  const out = [];
  for (const c of COMMANDS) {
    if (c.hidden || c.menuOnly) continue;
    out.push({ kind: 'Command', id: `cmd:${c.id}`, label: c.label, sub: [c.menu === 'App' ? 'Reccut' : c.menu, c.submenu].filter(Boolean).join(' › '), cmd: c, keywords: `${c.keywords || ''} ${c.desc || ''}`, run: () => runCommand(c.id) });
  }
  for (const fx of EFFECTS) {
    out.push({
      kind: 'Effect',
      id: `fx:${fx.id}`,
      label: fx.label,
      sub: 'Apply to the selected clips',
      keywords: `effect filter ${fx.prop}`,
      run: () => {
        const ids = visualTargets();
        if (!ids.length) return toast('Select a video, image or title clip first.');
        commands.addEffect(fx.id, ids.length === 1 ? ids[0] : null);
        commands.inspectorTab.value = 'effects';
        flash(`.inspector [data-fx="${fx.id}"]`, { focus: true });
      },
    });
  }
  for (const t of TRANSITIONS) {
    out.push({
      kind: 'Transition',
      id: `tr:${t.id}`,
      label: t.label,
      sub: 'Add at the selected edit, or the edit nearest the playhead',
      keywords: 'transition',
      run: () => {
        commands.addTransition(t.id);
        flash('.tl-transition.selected');
      },
    });
  }
  for (const t of TITLE_TEMPLATES) {
    out.push({
      kind: t.category === 'Lower Thirds' ? 'Lower Third' : 'Title',
      id: `title:${t.id}`,
      label: t.label,
      sub: t.category === 'Lower Thirds' ? 'Animated lower third at the playhead' : 'Add a title at the playhead',
      keywords: 'title text supring name super',
      run: () => {
        commands.addTitle(t.id);
        flash('.inspector [data-tab="text"]');
      },
    });
  }
  for (const l of COLOR_LOOKS) {
    out.push({
      kind: 'Look',
      id: `look:${l.id}`,
      label: l.label,
      sub: 'Color look for the selected clips',
      keywords: 'look color grade preset',
      run: () => {
        const ids = visualTargets();
        if (!ids.length) return toast('Select a video or image clip first.');
        commit((q) => {
          for (const id of ids) {
            const c = q.clips[id];
            for (const [k, v] of Object.entries(l.v)) {
              c.props[k] = v;
              delete c.kf[k];
            }
          }
        });
        commands.inspectorTab.value = 'color';
        flash('.inspector [data-section="looks"]');
      },
    });
  }
  for (const a of ANIMATION_PRESETS) {
    out.push({
      kind: 'Animation',
      id: `anim:${a.id}`,
      label: a.label,
      sub: 'Animate the selected clips',
      keywords: 'animation preset keyframes motion',
      run: () => {
        const ids = visualTargets();
        if (!ids.length) return toast('Select a clip to animate first.');
        commit((q) => ids.forEach((id) => applyAnimationPreset(q.clips[id], a.id, q.width, q.height)));
        commands.inspectorTab.value = 'video';
        flash('.inspector [data-tab="video"]');
      },
    });
  }
  for (const [tab, prop, label, kw] of PARAMS) {
    out.push({ kind: 'Setting', id: `param:${prop}`, label, sub: `Inspector › ${tab[0].toUpperCase() + tab.slice(1)}`, keywords: kw, run: () => showInspectorParam(tab, `[data-prop="${prop}"]`) });
  }
  out.push({ kind: 'Setting', id: 'param:stabilize', label: 'Stabilization', sub: 'Inspector › Video', keywords: 'stabilize shake shaky smooth tripod', run: () => showInspectorParam('video', '[data-section="stabilize"]') });
  out.push({ kind: 'Setting', id: 'param:wheels', label: 'Color Wheels', sub: 'Inspector › Color', keywords: 'lift gamma gain shadows midtones highlights grade', run: () => showInspectorParam('color', '[data-section="wheels"]') });
  out.push({ kind: 'Setting', id: 'param:components', label: 'Audio Components', sub: 'Inspector › Audio', keywords: 'audio tracks camera microphone synced switch off', run: () => showInspectorParam('audio', '.insp-body') });
  for (const m of Object.values(project.value.media)) {
    out.push({
      kind: 'Media',
      id: `media:${m.id}`,
      label: m.name,
      sub: m.offline ? 'Offline. Show in the browser' : 'Show in the browser',
      keywords: `media clip file ${m.kind}`,
      run: () => {
        commands.browserTab.value = 'media';
        commands.pickMedia(null, m.id, [m.id]);
        flash(`.browser [data-media="${m.id}"]`);
      },
    });
  }
  for (const a of ARTICLES) out.push({ kind: 'Help', id: `help:${a.id}`, label: a.title, sub: a.summary, keywords: a.keywords || '', article: a.id });
  return out;
}

const norm = (s) => (s || '').toLowerCase();

// Treff i navnet teller mest, deretter starten av et ord, så nøkkelord og beskrivelse.
function score(item, words) {
  const label = norm(item.label);
  const hay = `${label} ${norm(item.kind)} ${norm(item.sub)} ${norm(item.keywords)}`;
  let total = 0;
  for (const w of words) {
    if (!hay.includes(w)) return -1;
    total += label.startsWith(w) ? 8 : label.includes(` ${w}`) ? 6 : label.includes(w) ? 4 : 1;
  }
  if (label === words.join(' ')) total += 10;
  // Effekter, verktøy og innstillinger først når de passer like godt, som i FX Console.
  total += { Effect: 0.6, Setting: 0.5, Transition: 0.4, Title: 0.4, 'Lower Third': 0.4, Look: 0.3, Command: 0.3, Animation: 0.2, Media: 0.1, Help: 0 }[item.kind] || 0;
  return total;
}

const DEFAULT = ['cmd:import', 'fx:blur', 'param:exposure', 'tr:dissolve', 'title:lower', 'cmd:syncAudio', 'cmd:blade', 'cmd:retime', 'param:wheels', 'cmd:export'];

const KIND_ORDER = ['Command', 'Effect', 'Transition', 'Title', 'Lower Third', 'Look', 'Animation', 'Setting', 'Media', 'Help'];
const plural = (kind) => (kind === 'Media' || kind === 'Help' ? kind : `${kind}s`);

// Uten søkeord: forslagene først, så alt annet gruppert etter type, så du kan bla og lære. group gir overskriften.
function browseAll(items) {
  const suggested = DEFAULT.map((id) => items.find((x) => x.id === id)).filter(Boolean);
  const rest = items
    .filter((x) => !DEFAULT.includes(x.id))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.kind === 'Command' ? a.sub.localeCompare(b.sub) : 0) || a.label.localeCompare(b.label));
  return [
    ...suggested.map((x, i) => (i ? x : { ...x, group: 'Suggested' })),
    ...rest.map((x, i) => (i && rest[i - 1].kind === x.kind ? x : { ...x, group: plural(x.kind) })),
  ];
}

export function consoleSearch(query, limit = Infinity) {
  const items = itemsFor();
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return browseAll(items);
  return items
    .map((x) => ({ x, s: score(x, words) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}

// Verktøy, faner og paneler som en kommando åpner, markeres etterpå.
function highlightFor(cmd) {
  if (!cmd) return null;
  const [kind, name] = cmd.id.split(':');
  if (kind === 'tool') return `.tl-toolbar [data-tool="${name}"]`;
  if (kind === 'browser') return `.browser [data-tab="${name}"]`;
  if (kind === 'inspector') return `.inspector [data-tab="${name}"]`;
  if (cmd.id === 'retime') return '.inspector [data-tab="speed"]';
  if (['skimming', 'audioSkimming', 'snapping'].includes(cmd.id)) return `.tl-toolbar [data-toggle="${cmd.id}"]`;
  return null;
}

export function runItem(item, openArticle) {
  if (item.article) return openArticle(item.article);
  if (item.kind !== 'Command' && room.value !== 'edit') room.value = 'edit';
  const hl = highlightFor(item.cmd);
  Promise.resolve()
    .then(() => item.run())
    .then(() => hl && flash(hl))
    .catch((err) => toast(`${item.label} failed: ${err.message}`, { kind: 'error' }));
}
