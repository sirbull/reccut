// Builds the list of every option in Settings for Quick Search (Ctrl Space), from the Settings sources.
// Each Section title and Row label becomes a search entry that opens Settings at that pane and highlights the row,
// so a new option is findable without anyone keeping a list by hand. npm run build runs this;
// test/quick-search.test.mjs fails if src/renderer/help/settingsIndex.json is out of date.
// Usage: node scripts/build-settings-index.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'src/renderer/help/settingsIndex.json');

// Which Settings pane each component is shown in (see the pane switch in src/renderer/Settings.jsx).
// A component added to a pane there must be added here too.
export const COMPONENTS = {
  'src/renderer/Settings.jsx': {
    GeneralPane: 'general',
    EditingPane: 'editing',
    PlaybackPane: 'playback',
    ImportPane: 'import',
    AudioPane: 'audio',
    ExportPane: 'export',
    KeyboardPane: 'keyboard',
    AiModelsSection: 'extensions',
  },
  'src/renderer/Extensions.jsx': { ExtensionsPane: 'extensions', ToolServersPane: 'extensions', ReccutMcpPane: 'extensions' },
  'src/renderer/SubtitleModels.jsx': { LocalSubtitleModels: 'extensions' },
  'src/renderer/voiceover/AiVoice.jsx': { AiVoiceSettings: 'extensions' },
  'src/renderer/design/Online.jsx': { OnlineSettings: 'design' },
  'src/renderer/Plugins.jsx': { PluginsPane: 'plugins' },
};
const PANE_LABELS = { general: 'General', editing: 'Editing', playback: 'Playback', import: 'Import', audio: 'Audio & Video', export: 'Export', design: 'Design', extensions: 'AI', plugins: 'Plugins', keyboard: 'Keyboard' };
// Fields of the Add your own server form are not options.
const IGNORE = new Set(['Name', 'What it is for', 'Type', 'Address', 'Command', 'Arguments', 'Key variable (optional)', 'App']);

function clean(s) {
  const t = s.replace(/\s+/g, ' ').replace(/[“”]/g, '"').trim();
  // Headings written in capitals read better as titles in a search list.
  return t === t.toUpperCase() && /[A-Z]{3}/.test(t) ? t.toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase()) : t;
}

// Splits a source file into top-level components with their bodies.
function components(src) {
  const re = /^(?:export )?(?:function ([A-Z]\w*)\s*\(|const ([A-Z]\w*)\s*=\s*\()/gm;
  const starts = [...src.matchAll(re)].map((m) => ({ name: m[1] || m[2], at: m.index }));
  return starts.map((s, i) => ({ name: s.name, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
}

const PATTERN = new RegExp(
  [
    /<Section\s+[^>]*?title="([^"]+)"/.source, // 1 section title
    /<header><h3>([^<]+)<\/h3>/.source, // 2 hand-made section header
    /<[A-Z]\w*\s+[^>]*?label=(?:"([^"]+)"|\{'([^']+)'\}|\{withTip\('([^']+)')/.source, // 3, 4, 5 row label
    /\b(?:toggle|seconds)\(\s*'(\w+)'\s*,\s*'([^']+)'/.source, // 6 pref key, 7 label
  ].join('|'),
  'g',
);

function entries(body) {
  const found = [];
  let section = '';
  for (const m of body.matchAll(PATTERN)) {
    if (m[1] || m[2]) {
      section = clean(m[1] || m[2]);
      found.push({ section, label: section, kind: 'section' });
      continue;
    }
    const label = clean(m[3] || m[4] || m[5] || m[7]);
    if (IGNORE.has(label)) continue;
    found.push({ section, label, kind: 'row', ...(m[6] ? { pref: m[6] } : {}) });
  }
  return found;
}

export function buildIndex() {
  const out = [];
  const seen = new Set();
  for (const [file, map] of Object.entries(COMPONENTS)) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    for (const c of components(src)) {
      const pane = map[c.name];
      if (!pane) continue;
      for (const e of entries(c.body)) {
        const key = `${pane}|${e.section}|${e.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ pane, paneLabel: PANE_LABELS[pane], ...e });
      }
    }
  }
  // The panes themselves, so "keyboard settings" or "AI settings" finds them.
  for (const [pane, paneLabel] of Object.entries(PANE_LABELS)) out.push({ pane, paneLabel, section: '', label: `${paneLabel} Settings`, kind: 'pane' });
  return out;
}

export const indexText = () => JSON.stringify(buildIndex(), null, 1) + '\n';
const current = () => (fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = indexText();
  if (process.argv.includes('--check')) {
    if (current() !== text) {
      console.error('src/renderer/help/settingsIndex.json is out of date. Run npm run build.');
      process.exit(1);
    }
  } else if (current() !== text) fs.writeFileSync(OUT, text);
}
