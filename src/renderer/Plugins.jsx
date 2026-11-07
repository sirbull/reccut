// Programtillegg som verktøy: Plugins-knappen viser de installerte, og hvert kan åpnes i et lite,
// flyttbart vindu over resten av appen, med innstillingene sine og en knapp som bruker det på valgt klipp.
import { useEffect, useRef, useState } from 'preact/hooks';
import { computed, signal } from '@preact/signals';
import { Camera, ChevronDown, FileUp, Palette, Puzzle, Scissors, Settings2, Share, Sparkles, X } from 'lucide-preact';
import { Button, IconButton, Modal, Row, Section, Select, Slider, Toggle, toast } from './ui.jsx';
import TERMS from '../shared/pluginTerms.json';
import { commit, getTime, importPaths, project, room, selectedClips } from './editor/store.js';
import { snapshot } from './editor/playback.js';
import { TOOL_MAP } from '../shared/aiEdits.js';
import { applyProcessor } from './editor/ProcessorEffects.jsx';
import { aiChatOpen, aiDraft } from './Extensions.jsx';
import * as commands from './editor/commands.js';
import { prefs, setPrefs } from './prefs.js';
import { KeystrokesConsent, KeystrokesRows, keystrokesConsent, keystrokesNeedsDownload } from './recorder/KeystrokesAddon.jsx';
import { keystrokes, refreshKeystrokes } from './recorder/engine.js';
import { CorridorKeyConsent, corridorKeyConsent } from './CorridorKeyAddon.jsx';

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
// Listed like a plugin, but it is a separate download with its own install and remove.
const KEYSTROKES_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/></svg>';
const KEYSTROKES = {
  id: 'keystrokes',
  addon: true,
  room: 'record',
  name: 'Keystroke Add-on',
  description: 'Show the shortcuts you press in your recordings. A separate download that is not part of Reccut.',
  icon: KEYSTROKES_ICON,
};
// Listed until it is installed; then it is an ordinary processor with id 'corridorkey'.
const CORRIDORKEY = {
  id: 'corridorkey-addon',
  addon: true,
  room: 'edit',
  name: 'CorridorKey',
  description: 'AI green and blue screen keying from Corridor Digital, running on this computer. A separate download of several GB that needs a strong graphics card.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M9 18c0-3 1-5 3-5s3 2 3 5"/><circle cx="12" cy="9.5" r="2"/></svg>',
};
export const allPlugins = computed(() => [...BUILTIN, KEYSTROKES, ...(plugins.value.some((p) => p.id === 'corridorkey') ? [] : [CORRIDORKEY]), ...plugins.value]);
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
  if (id === 'image-sources') sessionStorage.setItem('focus-image-sources', '1');
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
// Opens a plugin from a list. The Keystroke Add-on shows its warning first, until it is installed.
async function openFromList(p) {
  if (p.id === CORRIDORKEY.id) {
    corridorKeyConsent.value = true;
    return;
  }
  if (p.addon && (await keystrokesNeedsDownload())) {
    keystrokesConsent.value = true;
    return;
  }
  openPlugin(p.id);
  commands.prefsOpen.value = false;
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
          {!list.length && r !== 'design' && (
            <p class="hint plugin-empty">
              No {name} plugins yet.
              {r !== 'edit' && ' Plugins for this section are not supported yet; they will be listed here when they are.'}
            </p>
          )}
          {r === 'design' && <button class="plugin-item" onClick={() => {
            openPluginSettings('image-sources');setOpen(false);
          }}><Puzzle size={22}/><span><b>Image Source Plugins</b><small>Add photo sources and connect your own API key.</small></span></button>}
          {list.map((p) => (
            <button
              key={p.id}
              class="plugin-item"
              onClick={() => {
                openFromList(p);
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
                settingsFocus.value = null;
                sessionStorage.removeItem('focus-image-sources');
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
      <KeystrokesConsent />
      <CorridorKeyConsent />
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
      <div class="plugin-body">{plugin.id === 'higgsfield' ? <HiggsfieldTool /> : plugin.addon ? <KeystrokesRows /> : <ProcessorTool plugin={plugin} />}</div>
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
const PLUGIN_WORKSPACES = [
  { id: 'record', name: 'Record', icon: Camera, description: 'Tools for capturing your screen, camera and audio.' },
  { id: 'edit', name: 'Edit', icon: Scissors, description: 'Generate video and process clips on your timeline.' },
  { id: 'export', name: 'Export', icon: Share, description: 'Tools for preparing and delivering your finished videos.' },
  { id: 'design', name: 'Design', icon: Palette, description: 'Connect photo libraries and reusable templates for your designs.' },
];

function PluginWorkspace({ workspace, active, focused, count, children }) {
  const [expanded, setExpanded] = useState(active || focused);
  useEffect(() => { if (active || focused) setExpanded(true); }, [active, focused]);
  return (
    <details id={`plugin-workspace-${workspace.id}`} class={`plugin-workspace${active ? ' current' : ''}`} open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
      <summary>
        <workspace.icon size={21} aria-hidden="true" />
        <span class="plugin-workspace-label"><strong>{workspace.name}</strong><span>{workspace.description}</span></span>
        <span class="plugin-workspace-status">{active && <span class="plugin-current-badge">Current workspace</span>}<small>{workspace.id === 'design' ? 'Image sources & templates' : `${count} ${count === 1 ? 'plugin' : 'plugins'}`}</small></span>
        <ChevronDown size={16} class="plugin-workspace-chevron" aria-hidden="true" />
      </summary>
      <div class="plugin-workspace-body">{children}</div>
    </details>
  );
}

export function PluginsPane({ designSettings }) {
  const [candidate, setCandidate] = useState(null);
  const open = settingsFocus.value;
  useEffect(() => {
    reload();
    refreshKeystrokes();
  }, []);
  useEffect(() => {
    if (!open || open === 'image-sources') return;
    const timer = setTimeout(() => document.getElementById(`plugin-${open}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    return () => clearTimeout(timer);
  }, [open, allPlugins.value]);
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
  const activeRoom = Object.hasOwn(ROOM_NAMES, room.value) ? room.value : 'edit';
  const workspaces = [...PLUGIN_WORKSPACES].sort((a, b) => Number(b.id === activeRoom) - Number(a.id === activeRoom));
  const focusedRoom = open === 'image-sources' ? 'design' : open && pluginRoom(allPlugins.value.find(p => p.id === open) || {});
  const jump = id => {
    const section = document.getElementById(`plugin-workspace-${id}`);
    if (!section) return;
    section.open = true;
    section.scrollIntoView({ block: 'start', behavior: 'smooth' });
    section.querySelector('summary')?.focus({ preventScroll: true });
  };
  const pluginCard = p => {
    const addon = p.id === CORRIDORKEY.id ? {} : keystrokes.value;
    return (
    <div class="plugin-settings-card" key={p.id} id={`plugin-${p.id}`}>
      <div class="processor-row">
        <PluginIcon plugin={p} size={22} />
        <div class="plugin-settings-description">
          <b>{p.name}</b>
          <small>{p.builtin ? 'Built in' : p.addon ? (addon?.version ? `Version ${addon.version}` : 'Optional download') : `Version ${p.version || 1}`}{p.author ? ` · by ${p.author}` : ''}</small>
          {p.description && <p class="hint">{p.description}</p>}
        </div>
        <div class="extension-actions">
          <Button class="small" onClick={() => openFromList(p)}>{p.addon && (!addon?.installed || addon.damaged) ? 'Download…' : 'Open'}</Button>
          {hasSettings(p) && <Button class={`small${open === p.id ? ' active' : ''}`} icon={Settings2} onClick={() => (settingsFocus.value = open === p.id ? null : p.id)} aria-expanded={open === p.id}>Settings</Button>}
          {p.kind && <Button class="small" onClick={() => (exportingPlugin.value = p.id)} title="Save it as a file others can install">Share…</Button>}
          {!p.builtin && !p.addon && <Button class="small" onClick={() => remove(p)}>Remove</Button>}
        </div>
      </div>
      {open === p.id && <PluginSettings key={`${p.id}:${p.version || 1}`} plugin={p} />}
      {p.id === 'corridorkey' && <p class="hint">Removing CorridorKey also deletes its downloaded files (several GB).</p>}
    </div>
    );
  };
  return (
    <div class="plugins-settings">
      <div class="plugins-settings-intro">
        <h2>Plugins by workspace</h2>
        <p class="hint">Your current workspace, {ROOM_NAMES[activeRoom]}, is shown first. Open a section to manage its tools. Settings apply across your projects.</p>
      </div>
      <nav class="plugin-workspace-nav" aria-label="Plugin workspaces">
        {workspaces.map(w => <button type="button" key={w.id} class={w.id === activeRoom ? 'current' : ''} aria-label={`${w.name}${w.id === activeRoom ? ' (current workspace)' : ''}`} onClick={() => jump(w.id)}><w.icon size={15} aria-hidden="true" />{w.name}</button>)}
      </nav>
      {workspaces.map(w => {
        const list = allPlugins.value.filter(p => pluginRoom(p) === w.id);
        return <PluginWorkspace key={w.id} workspace={w} active={w.id === activeRoom} focused={focusedRoom === w.id} count={list.length}>
          {w.id === 'design' && <div class="plugin-workspace-guide"><b>Connect once, use in your designs</b><p>Openverse works without an account. Add more photo sources below using your own API key or sign-in. Find connected photos in Design → Add Content → Stock Photos. Set up online templates separately at the end of this section.</p></div>}
          {w.id !== 'design' && list.length > 0 && <p class="hint">Open these tools from the Plugins button in {w.name}.{list.some(hasSettings) && ' Use Settings to choose their defaults.'}</p>}
          {list.map(pluginCard)}
          {w.id === 'design' && designSettings}
          {!list.length && w.id !== 'design' && <p class="plugin-workspace-empty">No {w.name.toLowerCase()} plugins are installed. {w.id === 'record' ? 'Screen, camera and audio options are available in the Record workspace.' : w.id === 'export' ? 'Video format and quality options are available in the Export workspace.' : 'Install a plugin below to add a clip-processing tool.'}</p>}
          {w.id === 'edit' && <>
            <div class="plugin-install">
              <h3>Add an Edit plugin</h3>
              <p class="hint">Install a .reccut-plugin file, or ask the AI agent to create a tool. Plugins run with your permissions, so install only plugins you trust.</p>
              <div class="extension-actions">
                <Button icon={FileUp} onClick={choosePluginFile}>Install plugin file…</Button>
                <Button icon={Sparkles} onClick={() => { aiDraft.value = 'Make a plugin that '; aiChatOpen.value = true; commands.prefsOpen.value = false; }}>Make a plugin with AI…</Button>
              </div>
              <Section title="Advanced: command-line tools and other formats" open={false}>
                <p class="hint">Install a JSON processor manifest to connect a command-line tool. Native OFX and Adobe plugins cannot be loaded. CorridorKey requires a command-line adapter, or processing in its own app followed by importing the result.</p>
                <Button onClick={loadManifest}>Install processor manifest…</Button>
              </Section>
            </div>
            {candidate && <PluginReview review={{ manifest: candidate }} onDone={() => setCandidate(null)} />}
          </>}
        </PluginWorkspace>;
      })}
    </div>
  );
}
