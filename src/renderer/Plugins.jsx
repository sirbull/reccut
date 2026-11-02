// Programtillegg som verktøy: Plugins-knappen viser de installerte, og hvert kan åpnes i et lite,
// flyttbart vindu over resten av appen, med innstillingene sine og en knapp som bruker det på valgt klipp.
import { useEffect, useRef, useState } from 'preact/hooks';
import { computed, signal } from '@preact/signals';
import { FileUp, Puzzle, Settings2, Sparkles, X } from 'lucide-preact';
import { Button, IconButton, Modal, Row, Section, Select, Slider, Toggle, toast } from './ui.jsx';
import TERMS from '../shared/pluginTerms.json';
import { commit, getTime, importPaths, project, room, selectedClips } from './editor/store.js';
import { snapshot } from './editor/playback.js';
import { TOOL_MAP } from '../shared/aiEdits.js';
import { applyProcessor } from './editor/ProcessorEffects.jsx';
import { aiChatOpen, aiDraft } from './Extensions.jsx';
import * as commands from './editor/commands.js';
import { prefs, setPrefs } from './prefs.js';

const api = window.api;
export const openPlugins = signal([]); // ids, last is on top
export const plugins = signal([]);
// Plugins that come with Reccut. They cannot be removed, only set up.
const HIGGSFIELD_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5 21 7.5v9l-5.5-3"/><path d="M8.5 9.2l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z" fill="#ffffff" stroke="none"/></svg>';
export const BUILTIN = [
  {
    id: 'higgsfield',
    builtin: true,
    room: 'edit',
    name: 'Higgsfield AI Video',
    description: 'Generate video shots from a description or a start image, with models like Kling, Seedance, Wan and Hailuo. Needs a Higgsfield account; each video is billed there.',
    icon: HIGGSFIELD_ICON,
  },
];
export const allPlugins = computed(() => [...BUILTIN, ...plugins.value]);
// Each section has its own plugins. Processors work on video clips, so they belong to Edit.
const ROOM_NAMES = { record: 'Record', edit: 'Edit', export: 'Export', design: 'Design' };
export const pluginRoom = (p) => p.room || 'edit';

// Plugin settings: the user's own defaults for a plugin's params, kept with the app preferences.
// The window starts from them, and the agent uses them unless it chooses other values.
export const hasSettings = (p) => p.builtin || p.params?.length > 0;
export function pluginDefaults(p) {
  const saved = prefs.value.pluginSettings?.[p.id] || {};
  return Object.fromEntries((p.params || []).map((x) => [x.id, Object.hasOwn(saved, x.id) ? saved[x.id] : x.default]));
}
function saveDefaults(id, values) {
  setPrefs({ pluginSettings: { ...(prefs.value.pluginSettings || {}), [id]: values } });
}
// The gear in a plugin's window opens Settings → Plugins with that plugin's settings open.
export const settingsFocus = signal(null);
export function openPluginSettings(id) {
  settingsFocus.value = id;
  localStorage.setItem('settingsPane', 'plugins');
  if (commands.prefsOpen.value) {
    commands.prefsOpen.value = false;
    setTimeout(() => (commands.prefsOpen.value = true));
  } else commands.prefsOpen.value = true;
}
const reload = () => api.pluginsList().then((list) => (plugins.value = list || []), () => {});
reload();
window.addEventListener('reccut:processors-changed', reload);

// Plugin files opened from Finder or Explorer (double-click) or with Install plugin file… are reviewed first.
export const pluginReview = signal(null); // { manifest, script, pkg?, updates? }
export const exportingPlugin = signal(null); // plugin id
export async function openPluginFile(file) {
  try {
    pluginReview.value = await api.pluginsReadFile(file);
  } catch (e) {
    toast(e.message, { kind: 'error', timeout: 9000 });
  }
}
export async function choosePluginFile() {
  const file = await api.openFileDialog({ title: 'Install Plugin', filters: [{ name: 'Reccut Plugin', extensions: ['reccut-plugin'] }] });
  if (file) openPluginFile(file);
}
api.onOpenPlugin?.(openPluginFile);
api.pluginsPendingOpen?.().then((file) => file && openPluginFile(file), () => {});

// What a plugin will run, and the user's acceptance that installing it is their own responsibility.
// Used for plugins the agent made, plugin files and processor manifests.
export function PluginReview({ review, onDone, compact = false }) {
  const [ok, setOk] = useState(false),
    [busy, setBusy] = useState(false);
  const m = review.manifest;
  const install = async () => {
    setBusy(true);
    try {
      if (review.pkg) await api.pluginsInstallPackage(review.pkg, { accepted: true });
      else await api.pluginsInstall(m, { accepted: true });
      await reload();
      window.dispatchEvent(new Event('reccut:processors-changed'));
      openPlugin(m.id);
      toast(review.updates ? `${m.name} was updated to version ${m.version}.` : `${m.name} is installed. Find it under Plugins in the toolbar.`, { kind: 'success' });
      onDone(true);
    } catch (e) {
      toast(e.message, { kind: 'error', timeout: 9000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="processor-review">
      <b class="plugin-title">
        <PluginIcon plugin={m} size={24} /> {m.name}
        <small class="dim">
          {' '}
          version {m.version || 1}
          {m.author ? ` · by ${m.author}` : ''}
        </small>
      </b>
      {review.updates && <p class="hint">Updates the installed version {review.updates}. The plugin keeps its place and settings window.</p>}
      {(m.description || review.description) && <p>{m.description || review.description}</p>}
      {m.params?.length > 0 && <p class="hint">Settings in its window: {m.params.map((p) => p.label).join(', ')}.</p>}
      <details open={!compact}>
        <summary>What it runs</summary>
        <pre>
          {m.kind === 'python' ? 'Python 3' : m.kind === 'ffmpeg' ? 'FFmpeg' : m.executable}
          {'\n'}
          {JSON.stringify(m.args.map((a) => (a === m.args[0] && m.kind === 'python' ? '<script below>' : a)), null, 2)}
          {review.script && `\n\n${review.script}`}
        </pre>
      </details>
      <ul class="terms">
        {TERMS.install.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <label class="terms-accept">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.currentTarget.checked)} />
        I understand that I install and use this plugin at my own risk and am responsible for it.
      </label>
      <div class="extension-actions">
        <Button onClick={() => onDone(false)}>Cancel</Button>
        <Button variant="primary" disabled={!ok || busy} onClick={install}>
          {review.updates ? 'Update plugin' : 'Install plugin'}
        </Button>
      </div>
    </div>
  );
}

// Share a plugin as a file others can install by double-clicking it. Requires accepting the creator terms.
function ExportDialog({ id }) {
  const p = plugins.value.find((x) => x.id === id);
  const [author, setAuthor] = useState(p?.author || ''),
    [ok, setOk] = useState(false);
  const close = () => (exportingPlugin.value = null);
  if (!p) return null;
  return (
    <Modal title={`Share ${p.name}`} width={560} onClose={close}>
      <p class="hint">
        Creates a .reccut-plugin file. Others install it by double-clicking it, after reviewing what it runs. Sharing is free.
      </p>
      <label class="plugin-param">
        <span>Creator name (optional, shown to people who install it)</span>
        <input class="text-input" value={author} maxLength={120} onInput={(e) => setAuthor(e.currentTarget.value)} />
      </label>
      <ul class="terms">
        {TERMS.share.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <label class="terms-accept">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.currentTarget.checked)} />I accept the terms for sharing plugins.
      </label>
      <div class="extension-actions">
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!ok}
          onClick={async () => {
            try {
              const file = await api.pluginsExport(id, { accepted: true, author });
              if (!file) return;
              close();
              toast(`Saved ${file.split(/[\\/]/).pop()}.`, { kind: 'success', actions: [{ label: api.platform === 'darwin' ? 'Reveal' : 'Show', onClick: () => api.reveal(file) }] });
            } catch (e) {
              toast(e.message, { kind: 'error' });
            }
          }}
        >
          Export…
        </Button>
      </div>
    </Modal>
  );
}

export function openPlugin(id) {
  openPlugins.value = [...openPlugins.value.filter((x) => x !== id), id];
}

// The icon is an SVG the plugin brings; as an <img> it cannot run anything.
export function PluginIcon({ plugin, size = 18 }) {
  return plugin.icon ? (
    <img class="plugin-icon" width={size} height={size} alt="" src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(plugin.icon)))}`} />
  ) : (
    <Puzzle size={size} class="plugin-icon" />
  );
}

export function PluginsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    reload();
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  const r = room.value;
  const name = ROOM_NAMES[r] || 'Edit';
  const list = allPlugins.value.filter((p) => pluginRoom(p) === r);
  return (
    <div class="tasks" ref={ref}>
      <button class="btn secondary small" aria-expanded={open} onClick={() => setOpen(!open)} title={`${name} plugins: tools for this section, installed or made with the AI agent`}>
        <Puzzle size={14} />
        Plugins
      </button>
      {open && (
        <div class="popover plugins-pop">
          <header>
            <b>{name} plugins</b>
          </header>
          {!list.length && (
            <p class="hint plugin-empty">
              No {name} plugins yet.
              {r !== 'edit' && ' Plugins for this section are not supported yet; they will be listed here when they are.'}
            </p>
          )}
          {list.map((p) => (
            <button
              key={p.id}
              class="plugin-item"
              onClick={() => {
                openPlugin(p.id);
                setOpen(false);
              }}
            >
              <PluginIcon plugin={p} size={22} />
              <span>
                <b>{p.name}</b>
                {p.description && <small>{p.description}</small>}
              </span>
            </button>
          ))}
          <div class="plugin-actions">
            {r === 'edit' && (
              <>
              <button
                class="link"
                onClick={() => {
                  aiDraft.value = 'Make a plugin that ';
                  aiChatOpen.value = true;
                  setOpen(false);
                }}
              >
                <Sparkles size={12} /> Make a plugin with AI…
              </button>
              <button
                class="link"
                onClick={() => {
                  choosePluginFile();
                  setOpen(false);
                }}
              >
                <FileUp size={12} /> Install file…
              </button>
              </>
            )}
            <button
              class="link"
              onClick={() => {
                localStorage.setItem('settingsPane', 'plugins');
                commands.prefsOpen.value = true;
                setOpen(false);
              }}
            >
              Manage…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PluginWindows() {
  return (
    <>
      {openPlugins.value.map((id, i) => {
        const p = allPlugins.value.find((x) => x.id === id);
        return p ? <PluginWindow key={`${id}:${p.version || 1}`} plugin={p} z={60 + i} /> : null;
      })}
      {pluginReview.value && (
        <Modal title={pluginReview.value.updates ? 'Update Plugin' : 'Install Plugin'} width={620} onClose={() => (pluginReview.value = null)}>
          <PluginReview review={pluginReview.value} onDone={() => (pluginReview.value = null)} />
        </Modal>
      )}
      {exportingPlugin.value && <ExportDialog id={exportingPlugin.value} />}
    </>
  );
}

function PluginWindow({ plugin, z }) {
  const key = `pluginWindow:${plugin.id}`;
  const [pos, setPos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key)) || null;
    } catch {
      return null;
    }
  });
  const at = pos || { x: Math.max(16, window.innerWidth - 360 - (openPlugins.value.indexOf(plugin.id) % 4) * 24), y: 90 + (openPlugins.value.indexOf(plugin.id) % 4) * 24 };
  const drag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const start = { x: e.clientX - at.x, y: e.clientY - at.y };
    let last = at;
    const move = (ev) => setPos((last = { x: Math.min(window.innerWidth - 80, Math.max(0, ev.clientX - start.x)), y: Math.min(window.innerHeight - 40, Math.max(0, ev.clientY - start.y)) }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(key, JSON.stringify(last));
      } catch {}
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    openPlugin(plugin.id);
  };
  return (
    <div class="plugin-window" style={{ left: `${at.x}px`, top: `${at.y}px`, zIndex: z }} role="dialog" aria-label={plugin.name} onPointerDown={() => openPlugin(plugin.id)}>
      <header onPointerDown={drag}>
        <PluginIcon plugin={plugin} />
        <b>{plugin.name}</b>
        {hasSettings(plugin) && <IconButton icon={Settings2} title={`${plugin.name} settings`} onClick={() => openPluginSettings(plugin.id)} />}
        <IconButton icon={X} title="Close" onClick={() => (openPlugins.value = openPlugins.value.filter((x) => x !== plugin.id))} />
      </header>
      <div class="plugin-body">{plugin.id === 'higgsfield' ? <HiggsfieldTool /> : <ProcessorTool plugin={plugin} />}</div>
    </div>
  );
}

// Controls for a plugin's params: slider, list or switch.
function ParamControls({ params, values, onChange }) {
  return params.map((p) => (
    <label class="plugin-param" key={p.id} title={p.hint || ''}>
      <span>
        {p.label}
        {p.type === 'number' && (
          <small>
            {values[p.id]}
            {p.unit ? ` ${p.unit}` : ''}
          </small>
        )}
      </span>
      {p.type === 'number' ? (
        <Slider value={values[p.id]} min={p.min} max={p.max} step={p.step} onInput={(v) => onChange({ ...values, [p.id]: v })} onCommit={(v) => onChange({ ...values, [p.id]: v })} />
      ) : p.type === 'choice' ? (
        <Select value={values[p.id]} options={p.options} onChange={(v) => onChange({ ...values, [p.id]: v })} />
      ) : (
        <Toggle checked={values[p.id]} onChange={(v) => onChange({ ...values, [p.id]: v })} />
      )}
    </label>
  ));
}

// A plugin's settings, shown in Settings → Plugins.
function PluginSettings({ plugin }) {
  const [values, setValues] = useState(() => pluginDefaults(plugin));
  if (plugin.id === 'higgsfield') return <GenerationSettings />;
  const change = (next) => {
    setValues(next);
    saveDefaults(plugin.id, next);
  };
  return (
    <div class="generation-settings plugin-settings">
      <p class="hint">Default values when you open the plugin, and when the AI agent uses it. You can still change them in the plugin's window each time.</p>
      <ParamControls params={plugin.params} values={values} onChange={change} />
      <button
        class="link"
        onClick={() => {
          const reset = Object.fromEntries(plugin.params.map((p) => [p.id, p.default]));
          setValues(reset);
          saveDefaults(plugin.id, reset);
        }}
      >
        Reset to the plugin's defaults
      </button>
    </div>
  );
}

// An installed processor: its settings as controls, applied to the selected video clip.
function ProcessorTool({ plugin }) {
  const [values, setValues] = useState(() => pluginDefaults(plugin));
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const clip = selectedClips.value.find((c) => c.type === 'video');
  const run = async () => {
    setBusy(true);
    setStatus(`Processing ${clip.name || project.value.media[clip.mediaId]?.name || 'clip'}… Progress is in Background tasks.`);
    try {
      await applyProcessor(clip.id, plugin.id, values);
      setStatus('Done. The clip uses the processed source; Undo restores the original.');
    } catch (e) {
      setStatus('');
      toast(e.message, { kind: 'error', timeout: 10000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
        {plugin.description && <p class="hint">{plugin.description}</p>}
        <ParamControls params={plugin.params || []} values={values} onChange={setValues} />
        <p class="hint">{clip ? `Applies to: ${clip.name || project.value.media[clip.mediaId]?.name || 'selected clip'}` : 'Select a video clip on the timeline.'}</p>
        <Button variant="primary" disabled={busy || !clip} onClick={run}>
          {busy ? 'Processing…' : 'Apply to selected clip'}
        </Button>
        {status && <p class="hint">{status}</p>}
    </>
  );
}

// Higgsfield as a tool: describe a shot, optionally start from the frame at the playhead, and get a clip.
function HiggsfieldTool() {
  const [cfg, setCfg] = useState(null),
    [prompt, setPrompt] = useState(''),
    [duration, setDuration] = useState('5'),
    [start, setStart] = useState('none'),
    [place, setPlace] = useState(true),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const settingsOpen = commands.prefsOpen.value;
  useEffect(() => {
    if (!settingsOpen) api.genConfig().then(setCfg, () => setCfg({}));
  }, [settingsOpen]);
  if (!cfg) return null;
  if (!cfg.hasKey) return <GenerationSettings onSaved={setCfg} />;
  const generate = async () => {
    setBusy(true);
    setStatus('');
    try {
      let image;
      if (start === 'playhead') {
        const cv = snapshot();
        if (!cv) throw new Error('Show the timeline in the viewer to start from the frame at the playhead.');
        const k = Math.min(1, 1568 / Math.max(cv.width, cv.height)),
          out = document.createElement('canvas');
        out.width = Math.round(cv.width * k);
        out.height = Math.round(cv.height * k);
        out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
        image = out.toDataURL('image/jpeg', 0.9);
      }
      const req = { prompt: prompt.trim(), duration: Number(duration), image };
      if (cfg.confirm) {
        const est = await api.genEstimate(req);
        const price = est.usd != null ? `about $${Number(est.usd).toFixed(2)}` : 'an unknown price';
        if (!confirm(`Generate a ${duration} s video with ${est.model} for ${price}? It is billed to your Higgsfield account.`)) return;
      }
      const T = getTime();
      setStatus('Generating… This takes one to several minutes. Progress is in Background tasks.');
      const r = await api.genVideo(req);
      const [m] = await importPaths([r.file], null);
      if (!m) throw new Error('The video was downloaded but could not be imported.');
      if (place) commit((d) => TOOL_MAP.get('add_media_to_timeline').edit(d, { mediaId: m.id, mode: 'connect', at: T, lane: 1 }));
      setStatus(place ? 'Done. The clip is in the Media library and placed at the playhead.' : 'Done. The clip is in the Media library.');
    } catch (e) {
      setStatus('');
      toast(e.message, { kind: 'error', timeout: 10000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <textarea
        class="text-input"
        rows={4}
        value={prompt}
        maxLength={2500}
        placeholder="Describe the shot: subject, action, setting, camera movement, light and style."
        onInput={(e) => setPrompt(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <label class="plugin-param">
        <span>Length</span>
        <Select value={duration} options={['5', '10'].map((v) => ({ value: v, label: `${v} seconds` }))} onChange={setDuration} />
      </label>
      <label class="plugin-param">
        <span>Start from</span>
        <Select
          value={start}
          options={[
            { value: 'none', label: 'The description only' },
            { value: 'playhead', label: 'The frame at the playhead' },
          ]}
          onChange={setStart}
        />
      </label>
      <div class="plugin-param inline">
        <span>Place at the playhead</span>
        <Toggle checked={place} onChange={setPlace} />
      </div>
      <Button variant="primary" disabled={busy || !prompt.trim()} onClick={generate}>
        {busy ? 'Generating…' : 'Generate video'}
      </Button>
      {status && <p class="hint">{status}</p>}
    </>
  );
}

// Higgsfield account: key ID and secret are stored encrypted in the main process.
function GenerationSettings({ onSaved }) {
  const [cfg, setCfg] = useState(null),
    [keyId, setKeyId] = useState(''),
    [secret, setSecret] = useState('');
  useEffect(() => {
    api.genConfig().then(setCfg, (e) => toast(e.message, { kind: 'error' }));
  }, []);
  if (!cfg) return null;
  const save = async (extra = {}) => {
    try {
      const next = await api.genSave({ ...cfg, keyId: keyId.trim(), keySecret: secret.trim(), ...extra });
      setCfg(next);
      setKeyId('');
      setSecret('');
      toast(extra.clearKey ? 'Higgsfield key removed.' : 'Higgsfield settings saved.', { kind: 'success' });
      onSaved?.(next);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  return (
    <div class="generation-settings">
      <p class="hint">
        Create an API key in{' '}
        <button class="link" onClick={() => api.openExternal('https://console.higgsfield.ai')}>
          Higgsfield Console
        </button>{' '}
        and add credits. Each generation is billed to your Higgsfield account. Your description and any start image are sent
        to Higgsfield. The AI agent can use it too.
      </p>
      <Row label="Key ID" stacked>
        <input class="text-input" autoComplete="off" value={keyId} placeholder={cfg.hasKey ? 'Key saved · leave blank to keep it' : 'Key ID'} onInput={(e) => setKeyId(e.currentTarget.value)} />
      </Row>
      <Row label="Secret" stacked>
        <input type="password" class="text-input" autoComplete="off" value={secret} placeholder={cfg.hasKey ? 'Saved' : 'Secret'} onInput={(e) => setSecret(e.currentTarget.value)} />
      </Row>
      <Row label="Text to video model" stacked hint="An endpoint ID from the Higgsfield API docs.">
        <input class="text-input" value={cfg.textModel} onInput={(e) => setCfg({ ...cfg, textModel: e.currentTarget.value })} />
      </Row>
      <Row label="Image to video model" stacked>
        <input class="text-input" value={cfg.imageModel} onInput={(e) => setCfg({ ...cfg, imageModel: e.currentTarget.value })} />
      </Row>
      <Row label="Ask before each generation" hint="Shows the estimated price first.">
        <Toggle checked={cfg.confirm} onChange={(confirm) => setCfg({ ...cfg, confirm })} />
      </Row>
      <div class="extension-actions">
        <Button variant="primary" onClick={() => save()}>
          Save
        </Button>
        <Button disabled={!cfg.hasKey} onClick={() => save({ clearKey: true })}>
          Remove key
        </Button>
      </div>
    </div>
  );
}

// Settings → Plugins: the built-in plugins, the installed ones, and installing new ones.
export function PluginsPane() {
  const [candidate, setCandidate] = useState(null);
  const open = settingsFocus.value;
  useEffect(() => {
    reload();
    if (open) setTimeout(() => document.getElementById(`plugin-${open}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  }, []);
  const loadManifest = async () => {
    const file = await api.openFileDialog({ title: 'Install Command-Line Processor', filters: [{ name: 'Reccut processor manifest', extensions: ['json'] }] });
    if (!file) return;
    try {
      const text = await api.readText(file);
      if (text.length > 50000) throw new Error('Manifest is too large.');
      setCandidate(JSON.parse(text));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  const remove = async (p) => {
    if (!confirm(`Remove ${p.name}? Clips that already use its output are not changed.`)) return;
    try {
      await api.pluginsRemove(p.id);
      openPlugins.value = openPlugins.value.filter((x) => x !== p.id);
      await reload();
      window.dispatchEvent(new Event('reccut:processors-changed'));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  return (
    <>
      <Section title="Plugins" collapsible={false}>
        <p class="hint">
          Plugins are tools you open from Plugins in the toolbar, each in its own small window. Ask the AI agent to make
          one, install a .reccut-plugin file (or double-click it), or install a JSON manifest for a command-line tool.
          Plugins run with your permissions, so install only plugins you trust.
        </p>
        {allPlugins.value.map((p) => (
          <div key={p.id} id={`plugin-${p.id}`}>
            <div class="processor-row">
              <PluginIcon plugin={p} size={22} />
              <div style="flex:1">
                <b>{p.name}</b>
                <small>
                  {p.builtin ? 'Built in' : `Version ${p.version || 1}`}
                  {p.author ? ` · by ${p.author}` : ''}
                  {p.description ? ` · ${p.description}` : ''}
                </small>
              </div>
              <div class="extension-actions">
                <Button class="small" onClick={() => openPlugin(p.id)}>
                  Open
                </Button>
                {hasSettings(p) && (
                  <Button class={`small${open === p.id ? ' active' : ''}`} icon={Settings2} onClick={() => (settingsFocus.value = open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                    Settings
                  </Button>
                )}
                {p.kind && (
                  <Button class="small" onClick={() => (exportingPlugin.value = p.id)} title="Save it as a file others can install">
                    Share…
                  </Button>
                )}
                {!p.builtin && (
                  <Button class="small" onClick={() => remove(p)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {open === p.id && <PluginSettings key={`${p.id}:${p.version || 1}`} plugin={p} />}
          </div>
        ))}
        <div class="extension-actions">
          <Button onClick={choosePluginFile}>Install plugin file…</Button>
          <Button onClick={loadManifest}>Install processor manifest…</Button>
          <Button
            onClick={() => {
              aiDraft.value = 'Make a plugin that ';
              aiChatOpen.value = true;
              commands.prefsOpen.value = false;
            }}
          >
            Make a plugin with AI…
          </Button>
        </div>
        {candidate && <PluginReview review={{ manifest: candidate }} onDone={() => setCandidate(null)} />}
      </Section>
      <Section title="Other plugin formats" collapsible={false}>
        <p class="hint">
          Native OFX and Adobe plugins cannot be loaded. CorridorKey needs a command-line adapter (install it as a
          processor manifest), or processing in its own app followed by importing the result.
        </p>
      </Section>
    </>
  );
}
