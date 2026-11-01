// Innstillinger (Cmd ,), bygd som i Final Cut Pro: faner med ikoner øverst, og en kommandoeditor
// for hurtigtaster. Alle valg lagres med en gang og gjelder hele appen.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AudioLines, Bot, Download, FolderOpen, Keyboard, Play, Puzzle, RotateCcw, Scissors, Search, Settings2, Share, Upload, X } from 'lucide-preact';
import { prefs, setPrefs } from './prefs.js';
import { audioSkimming, skimming, snapping } from './editor/store.js';
import * as commands from './editor/commands.js';
import { Button, NumberField, Row, Section, Segmented, Toggle, toast } from './ui.jsx';
import {
  COMMANDS,
  accelFromEvent,
  conflictsFor,
  defaultKeys,
  formatAccel,
  isCustomized,
  isMac,
  keysFor,
  recordingShortcut,
  resetAllShortcuts,
  resetShortcut,
  sameAccel,
  setShortcut,
} from './registry.js';

const api = window.api;

const PANES = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'editing', label: 'Editing', icon: Scissors },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'import', label: 'Import', icon: Download },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'export', label: 'Export', icon: Share },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'ai', label: 'AI', icon: Bot },
];

const seconds = (key, label, min, max, step = 0.1, hint) => (
  <Row label={label} key={key}>
    <NumberField value={prefs.value[key]} min={min} max={max} step={step} precision={step < 1 ? (step < 0.1 ? 2 : 1) : 0} unit="s" width={84} onChange={(v) => setPrefs({ [key]: Math.round(v * 100) / 100 })} />
    {hint && <span class="hint inline">{hint}</span>}
  </Row>
);

const toggle = (key, label, after) => (
  <Row label={label} key={key}>
    <Toggle
      checked={Boolean(prefs.value[key])}
      onChange={(v) => {
        setPrefs({ [key]: v });
        after?.(v);
      }}
    />
  </Row>
);

// Lange baner vises med de siste mappene; hele banen står i verktøytipset.
function shortPath(p) {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…${p.includes('\\') ? '\\' : '/'}${parts.slice(-3).join(p.includes('\\') ? '\\' : '/')}` : p;
}

function FolderRow({ label, value, onChoose, placeholder }) {
  return (
    <Row label={label} stacked>
      <button class="path-btn" title={value || placeholder} onClick={onChoose}>
        <FolderOpen size={14} />
        <span>{shortPath(value) || placeholder}</span>
      </button>
    </Row>
  );
}

function GeneralPane() {
  const [location, setLocation] = useState(localStorage.getItem('projectLocation') || '');
  useEffect(() => {
    if (!location) api.baseDir().then(setLocation);
  }, []);
  return (
    <>
      <Section title="Projects" collapsible={false}>
        <FolderRow
          label="Default location for new projects"
          value={location}
          onChoose={async () => {
            const dir = await api.chooseDir(location);
            if (dir) {
              localStorage.setItem('projectLocation', dir);
              setLocation(dir);
            }
          }}
        />
        {toggle('reopenLast', 'Open the last project when Reccut starts')}
        <p class="hint">Projects are saved automatically after every change, and earlier versions are kept in Project History.</p>
      </Section>
      <Section title="Updates" collapsible={false}>
        {toggle('checkUpdates', 'Check for new versions on GitHub once a day')}
        <p class="hint">Reccut works fully offline. When there is a connection, it can tell you about a new version and download the installer for you. Nothing is installed without you opening it.</p>
      </Section>
      <Section title="Media" collapsible={false}>
        {toggle('checkOfflineOnFocus', 'Look for missing media when you return to Reccut')}
        <p class="hint">Finds a drive that has been connected again, and shows missing files as Media Offline.</p>
      </Section>
      <Section title="Reset" collapsible={false}>
        <Button
          variant="secondary"
          icon={RotateCcw}
          onClick={() => {
            if (!confirm('Reset all settings, including keyboard shortcuts, to the defaults?')) return;
            localStorage.removeItem('prefs');
            location && localStorage.setItem('projectLocation', location);
            window.location.reload();
          }}
        >
          Reset All Settings
        </Button>
      </Section>
    </>
  );
}

function EditingPane() {
  return (
    <>
      <Section title="Default Durations" collapsible={false}>
        {seconds('transitionDur', 'Transitions', 0.1, 10)}
        {seconds('audioCrossfadeDur', 'Audio crossfades', 0.05, 10, 0.05)}
        {seconds('stillDur', 'Still images', 0.5, 60)}
        {seconds('titleDur', 'Titles and lower thirds', 0.5, 60)}
        {seconds('freezeDur', 'Freeze frames', 0.2, 60)}
      </Section>
      <Section title="Timeline" collapsible={false}>
        <Row label="Snapping">
          <Toggle
            checked={snapping.value}
            onChange={(v) => {
              snapping.value = v;
              setPrefs({ snapping: v });
            }}
          />
        </Row>
        {toggle('playheadAfterEdit', 'Move the playhead to the end of added clips')}
        <p class="hint">After Append, Insert, Connect and Overwrite (E, W, Q and D) the playhead jumps to the end of the new clip, ready for the next one.</p>
      </Section>
    </>
  );
}

function PlaybackPane() {
  const p = prefs.value;
  return (
    <>
      <Section title="Skimming" collapsible={false}>
        <Row label="Skimming">
          <Toggle
            checked={skimming.value}
            onChange={(v) => {
              skimming.value = v;
              setPrefs({ skimming: v });
            }}
          />
        </Row>
        <Row label="Audio skimming">
          <Toggle
            checked={audioSkimming.value}
            onChange={(v) => {
              audioSkimming.value = v;
              setPrefs({ audioSkimming: v });
            }}
          />
        </Row>
      </Section>
      <Section title="Playback" collapsible={false}>
        <Row label="Viewer">
          <Segmented
            value={p.viewerQuality}
            onChange={(v) => setPrefs({ viewerQuality: v })}
            options={[
              { value: 'quality', label: 'Better quality' },
              { value: 'performance', label: 'Better performance' },
            ]}
          />
        </Row>
        <p class="hint">Better performance draws the viewer at half resolution, which helps on slower computers with large projects. Exports always use full quality.</p>
        {toggle('loopPlayback', 'Loop playback')}
        {toggle('preservePitch', 'Keep the pitch when the speed changes')}
      </Section>
    </>
  );
}

function ImportPane() {
  const p = prefs.value;
  return (
    <>
      <Section title="Files" collapsible={false}>
        <Segmented
          value={p.importCopy ? 'copy' : 'keep'}
          onChange={(v) => setPrefs({ importCopy: v === 'copy' })}
          options={[
            { value: 'copy', label: 'Copy to project folder' },
            { value: 'keep', label: 'Leave files in place' },
          ]}
        />
        <p class="hint">Used when you drag files in, and the first choice in the Import window.</p>
      </Section>
      <Section title="Transcoding and Analysis" collapsible={false}>
        {toggle('importOptimize', 'Create optimized media')}
        {toggle('importAnalyzeStab', 'Analyze video for stabilization')}
        <p class="hint">Runs in the background after import, so Stabilize Clip works right away.</p>
      </Section>
    </>
  );
}

function AudioPane() {
  return (
    <>
      <Section title="Auto Sync Audio" collapsible={false}>
        {toggle('syncGroup', 'Group synced audio with the video')}
        {toggle('syncMuteCamera', 'Switch off the camera audio after syncing')}
        <p class="hint">The camera audio is kept in the clip, so you can switch it back on with V or in the Audio tab.</p>
      </Section>
      <Section title="Defaults" collapsible={false}>
        {seconds('audioCrossfadeDur', 'Audio crossfade length', 0.05, 10, 0.05)}
      </Section>
    </>
  );
}

function ExportPane() {
  const p = prefs.value;
  return (
    <Section title="Destination" collapsible={false}>
      <Segmented
        value={p.exportDirMode}
        onChange={async (v) => {
          if (v === 'custom' && !p.exportDir) {
            const dir = await api.chooseDir(null);
            if (!dir) return;
            setPrefs({ exportDirMode: 'custom', exportDir: dir });
          } else setPrefs({ exportDirMode: v });
        }}
        options={[
          { value: 'project', label: "Project's Exports folder" },
          { value: 'custom', label: 'Another folder' },
        ]}
      />
      {p.exportDirMode === 'custom' && (
        <FolderRow
          label="Export to"
          value={p.exportDir}
          onChoose={async () => {
            const dir = await api.chooseDir(p.exportDir);
            if (dir) setPrefs({ exportDir: dir });
          }}
        />
      )}
      <p class="hint">Where exported files go unless you choose another folder in the export window.</p>
    </Section>
  );
}

/* Hurtigtaster: kommandoeditor */

const MENUS = ['All', 'File', 'Edit', 'Mark', 'Clip', 'Tools', 'Playback', 'View', 'Help'];

/* Tillegg: installerte tillegg, innstillingene deres, og eksemplene som følger med. */
function PluginsPane() {
  const [list, setList] = useState(null);
  const [bundled, setBundled] = useState([]);
  const load = async () => {
    setList(await api.pluginsList());
    setBundled(await api.pluginsBundled());
  };
  useEffect(() => {
    load();
  }, []);
  const install = async (dir) => {
    if (!dir && !confirm('Plugins run programs on your computer. Only install plugins from sources you trust. Continue?')) return;
    try {
      const id = await api.pluginsInstall(dir || null);
      if (id) toast('The plugin is installed.', { kind: 'success', timeout: 3000 });
    } catch (err) {
      toast(err.message, { kind: 'error', timeout: 8000 });
    }
    load();
  };
  const setValue = async (pl, key, value) => {
    const values = { ...pl.settings, [key]: value };
    await api.pluginsSettings(pl.id, values);
    load();
  };
  const installed = new Set((list || []).map((p) => p.id));
  return (
    <>
      <Section title="Installed Plugins" collapsible={false}>
        {list && !list.length && <p class="hint">No plugins yet. Install one of the plugins below, or a plugin folder you have.</p>}
        {(list || []).map((pl) => (
          <div key={pl.id} class="afx-item" data-plugin={pl.id}>
            <div class="afx-head">
              <b>{pl.manifest.name}</b>
              <span class="hint" style={{ margin: 0 }}>{pl.manifest.version}</span>
              <Button
                class="small"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`Remove ${pl.manifest.name}?`)) return;
                  await api.pluginsRemove(pl.id);
                  load();
                }}
              >
                Remove
              </Button>
            </div>
            <p class="hint">{pl.manifest.description}</p>
            {pl.errors.length > 0 && <p class="hint warn">Problems: {pl.errors.join(', ')}</p>}
            {(pl.manifest.settings || []).map((st) => (
              <Row key={st.id} label={st.label} stacked>
                <div class="plugin-setting">
                  <input class="text-input" value={pl.settings[st.id] ?? st.default ?? ''} onChange={(e) => setValue(pl, st.id, e.currentTarget.value)} />
                  {(st.type === 'file' || st.type === 'folder') && (
                    <Button
                      class="small"
                      onClick={async () => {
                        const v = st.type === 'folder' ? await api.chooseDir(pl.settings[st.id] || '') : await api.openFileDialog({ title: st.label });
                        if (v) setValue(pl, st.id, v);
                      }}
                    >
                      Choose…
                    </Button>
                  )}
                </div>
              </Row>
            ))}
            {pl.manifest.homepage && <p class="hint">More information: {pl.manifest.homepage}</p>}
          </div>
        ))}
        <div class="afx-add">
          <Button class="small" onClick={() => install()}>
            Install Plugin Folder…
          </Button>
          <Button class="small" variant="ghost" onClick={() => api.pluginsOpenFolder()}>
            Show Plugins Folder
          </Button>
        </div>
        <p class="hint">A plugin is a folder with a plugin.json that describes a program Reccut runs on a clip, for example an AI keyer. Reccut prepares the frames, runs the program, and replaces the clip with the result. Plugins run programs on your computer, so only install plugins you trust.</p>
      </Section>
      <Section title="Included with Reccut" collapsible={false}>
        {bundled.map((b) => (
          <div key={b.id} class="afx-item">
            <div class="afx-head">
              <b>{b.manifest.name}</b>
              <Button class="small" disabled={installed.has(b.id)} onClick={() => install(b.dir)}>
                {installed.has(b.id) ? 'Installed' : 'Install'}
              </Button>
            </div>
            <p class="hint">{b.manifest.description}</p>
          </div>
        ))}
      </Section>
    </>
  );
}

/* AI-assistenten: leverandør, modell og egen API-nøkkel (lagres kryptert i hovedprosessen). */
const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI-compatible' },
];

function AiPane() {
  const [cfg, setCfg] = useState(null);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    api.aiConfig().then(setCfg);
  }, []);
  if (!cfg) return null;
  const save = async (patch) => setCfg(await api.aiSetConfig(patch));
  const test = async () => {
    setStatus('Testing…');
    try {
      const r = await api.aiTest();
      setStatus(`Works. Answered by ${r.model}.`);
    } catch (err) {
      setStatus(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };
  return (
    <>
      <Section title="AI Assistant" collapsible={false}>
        <p class="hint">The assistant is a chat panel in the editor that can look at your project and edit it for you, for example cut out pauses, add titles and captions, key a green screen or clean up audio. Every change it makes can be undone. Open it with the AI button in the toolbar or from the View menu.</p>
        <Row label="Service">
          <Segmented value={cfg.provider} options={AI_PROVIDERS} onChange={(v) => save({ provider: v })} />
        </Row>
        {cfg.provider === 'openai' && (
          <Row label="Address" stacked hint="For OpenAI use https://api.openai.com/v1. Local models work too, for example LM Studio (http://localhost:1234/v1) or Ollama (http://localhost:11434/v1).">
            <input class="text-input" value={cfg.baseUrl} onChange={(e) => save({ baseUrl: e.currentTarget.value })} />
          </Row>
        )}
        <Row label="Model" stacked hint={cfg.provider === 'anthropic' ? 'claude-opus-5-5 is the most capable. claude-sonnet-5-5 is faster and costs less.' : 'The model name the service uses, for example gpt-5.'}>
          <input class="text-input" value={cfg.model} placeholder={cfg.provider === 'anthropic' ? 'claude-opus-5-5' : 'Model name'} onChange={(e) => save({ model: e.currentTarget.value })} />
        </Row>
        <Row label="API key" stacked hint={cfg.encrypted ? 'Stored encrypted on this computer, and only sent to the service you chose.' : 'Stored on this computer, and only sent to the service you chose.'}>
          <div class="plugin-setting">
            <input class="text-input" type="password" value={key} placeholder={cfg.hasKey ? 'A key is saved' : cfg.provider === 'anthropic' ? 'sk-ant-…' : 'Not needed for local models'} onInput={(e) => setKey(e.currentTarget.value)} />
            <Button
              class="small"
              disabled={!key}
              onClick={async () => {
                await save({ apiKey: key });
                setKey('');
                setStatus('The key is saved.');
              }}
            >
              Save
            </Button>
            {cfg.hasKey && (
              <Button class="small" variant="ghost" onClick={() => save({ apiKey: '' })}>
                Remove
              </Button>
            )}
          </div>
        </Row>
        <div class="afx-add">
          <Button class="small" onClick={test} disabled={cfg.provider === 'anthropic' && !cfg.hasKey}>
            Test Connection
          </Button>
          {status && <span class="hint inline">{status}</span>}
        </div>
        <p class="hint">Reccut works fully offline. The assistant is the only part that sends anything over the internet, and only when you write to it: your message, an overview of the project (names, times and settings, not the media files), and pictures from the viewer when it checks its work. Usage is billed by the service on your own account.</p>
      </Section>
    </>
  );
}

function KeyboardPane() {
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState('All');
  const [recording, setRecording] = useState(null); // kommando-id
  const [pending, setPending] = useState(null); // { id, accel, conflicts }
  const [onlyChanged, setOnlyChanged] = useState(false);
  prefs.value;
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMANDS.filter((c) => !c.hidden && !c.menuOnly && c.menu)
      .filter((c) => menu === 'All' || (c.menu === 'App' ? 'File' : c.menu) === menu)
      .filter((c) => !onlyChanged || isCustomized(c))
      .filter((c) => !q || `${c.label} ${c.menu} ${c.keywords || ''} ${keysFor(c).map(formatAccel).join(' ')}`.toLowerCase().includes(q));
  }, [query, menu, onlyChanged, prefs.value.shortcuts]);

  // Tar opp en ny hurtigtast: Esc avbryter.
  useEffect(() => {
    recordingShortcut.value = Boolean(recording);
    if (!recording) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const accel = accelFromEvent(e);
      if (!accel) return;
      const conflicts = conflictsFor(accel, recording);
      if (conflicts.length) setPending({ id: recording, accel, conflicts });
      else setShortcut(recording, accel);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      recordingShortcut.value = false;
    };
  }, [recording]);

  const changed = Object.keys(prefs.value.shortcuts || {}).length;
  return (
    <div class="keyboard-pane">
      <div class="kb-toolbar">
        <div class="search small">
          <Search size={13} />
          <input placeholder="Search commands or keys" value={query} onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <label class="kb-changed">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.currentTarget.checked)} /> Changed only ({changed})
        </label>
        <Button variant="secondary" class="small" disabled={!changed} onClick={() => confirm('Reset all keyboard shortcuts to the defaults?') && resetAllShortcuts()}>
          Reset All
        </Button>
      </div>
      <div class="kb-body">
        <nav class="kb-menus">
          {MENUS.map((m) => (
            <button key={m} class={menu === m ? 'active' : ''} onClick={() => setMenu(m)}>
              {m}
            </button>
          ))}
        </nav>
        <div class="kb-list">
          {pending && (
            <div class="kb-conflict">
              <b>{formatAccel(pending.accel)}</b> is used by {pending.conflicts.map((c) => c.label).join(', ')}.
              <span class="actions">
                <Button
                  variant="primary"
                  class="small"
                  onClick={() => {
                    // Den nye kommandoen får tasten, de andre mister den (og beholder eventuelle andre taster).
                    for (const c of pending.conflicts) setShortcut(c.id, keysFor(c).filter((k) => !sameAccel(k, pending.accel))[0] ?? '');
                    setShortcut(pending.id, pending.accel);
                    setPending(null);
                  }}
                >
                  Use It Here
                </Button>
                <Button class="small" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              </span>
            </div>
          )}
          {list.map((c) => {
            const keys = keysFor(c);
            const custom = isCustomized(c);
            const rec = recording === c.id;
            return (
              <div key={c.id} class={`kb-row${custom ? ' custom' : ''}`}>
                <div class="kb-label">
                  <span>{c.label}</span>
                  <small>
                    {c.menu === 'App' ? 'Reccut' : c.menu}
                    {c.submenu ? ` › ${c.submenu}` : ''}
                    {custom && defaultKeys(c)[0] ? ` · default ${formatAccel(defaultKeys(c)[0])}` : ''}
                  </small>
                </div>
                <button class={`kb-key${rec ? ' recording' : ''}`} title="Click and press the new shortcut" onClick={() => setRecording(rec ? null : c.id)}>
                  {rec ? 'Press keys…' : keys.length ? keys.map((k) => <kbd key={k} class="keycap">{formatAccel(k)}</kbd>) : <span class="dim">None</span>}
                </button>
                <div class="kb-actions">
                  {keys.length > 0 && (
                    <button class="icon-btn" title="Remove shortcut" onClick={() => setShortcut(c.id, '')}>
                      <X size={13} />
                    </button>
                  )}
                  {custom && (
                    <button class="icon-btn" title="Back to default" onClick={() => resetShortcut(c.id)}>
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {list.length === 0 && <p class="dim pad">No commands match.</p>}
        </div>
      </div>
      <div class="kb-footer">
        <span class="hint">Click a shortcut and press the new keys. Esc cancels. Shortcuts without {isMac ? 'Cmd, Control or Option' : 'Ctrl or Alt'} only work outside text fields.</span>
        <span class="kb-io">
          <Button
            variant="ghost"
            class="small"
            icon={Upload}
            onClick={async () => {
              const file = await api.saveFileDialog({ title: 'Export Keyboard Shortcuts', defaultPath: 'Reccut Shortcuts.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
              if (file) await api.writeText(file, JSON.stringify({ format: 'reccut-shortcuts', platform: api.platform, shortcuts: prefs.value.shortcuts || {} }, null, 2));
            }}
          >
            Export
          </Button>
          <Button
            variant="ghost"
            class="small"
            icon={Download}
            onClick={async () => {
              const file = await api.openFileDialog({ title: 'Import Keyboard Shortcuts', filters: [{ name: 'JSON', extensions: ['json'] }] });
              if (!file) return;
              try {
                const data = JSON.parse(await api.readText(file));
                if (data.format !== 'reccut-shortcuts' || typeof data.shortcuts !== 'object') throw new Error('Not a Reccut shortcut file.');
                const valid = Object.fromEntries(Object.entries(data.shortcuts).filter(([id, v]) => COMMANDS.some((c) => c.id === id) && typeof v === 'string'));
                setPrefs({ shortcuts: valid });
                toast(`Imported ${Object.keys(valid).length} shortcuts.`, { kind: 'success' });
              } catch (err) {
                toast(err.message, { kind: 'error' });
              }
            }}
          >
            Import
          </Button>
        </span>
      </div>
    </div>
  );
}

export function SettingsWindow() {
  const [pane, setPane] = useState(localStorage.getItem('settingsPane') || 'general');
  const close = () => (commands.prefsOpen.value = false);
  const ref = useRef(null);
  const show = (id) => {
    setPane(id);
    localStorage.setItem('settingsPane', id);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.kb-key.recording')) {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const current = PANES.find((p) => p.id === pane) || PANES[0];
  return (
    <div class="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class={`settings-window pane-${current.id}`} ref={ref} onKeyDown={(e) => e.stopPropagation()}>
        <header class="settings-toolbar">
          {PANES.map((p) => (
            <button key={p.id} data-pane={p.id} class={pane === p.id ? 'active' : ''} onClick={() => show(p.id)}>
              <p.icon size={20} />
              <span>{p.label}</span>
            </button>
          ))}
          <button class="icon-btn settings-close" title="Close" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div class="settings-body">
          {current.id === 'general' && <GeneralPane />}
          {current.id === 'editing' && <EditingPane />}
          {current.id === 'playback' && <PlaybackPane />}
          {current.id === 'import' && <ImportPane />}
          {current.id === 'audio' && <AudioPane />}
          {current.id === 'export' && <ExportPane />}
          {current.id === 'keyboard' && <KeyboardPane />}
          {current.id === 'plugins' && <PluginsPane />}
          {current.id === 'ai' && <AiPane />}
        </div>
      </div>
    </div>
  );
}
