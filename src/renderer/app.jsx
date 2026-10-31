import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clapperboard,
  FolderOpen,
  ListChecks,
  Loader2,
  Plus,
  Redo2,
  Settings,
  Share,
  Undo2,
  Video,
  X,
} from 'lucide-preact';
import './styles/app.css';
import { Recorder } from './recorder/Recorder.jsx';
import * as engine from './recorder/engine.js';
import { modifierInfo, settings } from './recorder/settings.js';
import { Editor } from './editor/Editor.jsx';
import { byId, commandForEvent, menuTemplate, runCommand } from './registry.js';
import { effect } from '@preact/signals';
import {
  canRedo,
  canUndo,
  addRecordingToProject,
  project,
  projectFolders,
  needsProject,
  historyVersion,
  loadInitialProject,
  redo,
  room,
  tasks,
  undo,
} from './editor/store.js';
import * as commands from './editor/commands.js';
import { startExport } from './editor/ExportDialog.jsx';
import { ExportRoom } from './export/ExportRoom.jsx';
import { formatDuration } from '../shared/model.js';
import { IconButton, Toasts, toast } from './ui.jsx';
import { NewProjectDialog, ProjectsDialog } from './ProjectDialogs.jsx';
import { CommandPalette, HelpCenter } from './help/Help.jsx';
import { SettingsWindow } from './Settings.jsx';
import { helpOpen, paletteOpen } from './registry.js';

const api = window.api;
const isMac = api.platform === 'darwin';

async function finishRecording() {
  const dir = await engine.stopRecording();
  if (!dir) return;
  const media = await addRecordingToProject(dir);
  const s = settings.value;
  if (s.autoRender) {
    const p = project.value;
    const sep = api.platform === 'win32' ? '\\' : '/';
    const out = projectFolders.value?.exports || (await api.baseDir());
    await startExport(p, { preset: 'standard', format: 'mp4-h264', quality: 'high', res: 0, fps: p.fps, audioOnly: false, captions: 'none', output: `${out}${sep}${media.name}.mp4` });
  }
  toast(s.autoRender ? `Recording saved in ${project.value.name}. A finished video is being rendered in the background.` : `Recording saved in ${project.value.name}.`, {
    kind: 'success',
    timeout: 15000,
    actions: [
      { label: api.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder', onClick: () => api.reveal(dir) },
      { label: 'Edit', primary: true, onClick: () => (room.value = 'edit') },
    ],
  });
}

export function toggleRecording() {
  if (engine.finishing.value) return;
  if (engine.countdown.value) return engine.abortCountdown();
  if (engine.recording.value) finishRecording().catch((err) => toast(`Could not save the recording: ${err.message}`, { kind: 'error' }));
  else engine.startRecording().catch((err) => toast(`Could not start recording: ${err.message}`, { kind: 'error' }));
}

function TasksIndicator() {
  const [open, setOpen] = useState(false);
  const list = tasks.value.filter((t) => !(t.kind === 'analyze' && t.state === 'done'));
  const running = tasks.value.filter((t) => t.state === 'running' || t.state === 'queued');
  const visible = running.length > 0 || list.some((t) => t.kind !== 'analyze');
  if (!visible && !open) return null;
  const main = running.find((t) => t.kind !== 'analyze') || running[0];
  const pct = main ? Math.round((main.progress || 0) * 100) : 100;
  return (
    <div class="tasks">
      <button class={`tasks-btn${running.length ? ' busy' : ''}`} onClick={() => setOpen(!open)} title="Background tasks">
        {running.length ? (
          <svg width="18" height="18" viewBox="0 0 36 36" class="ring">
            <circle cx="18" cy="18" r="15" />
            <circle cx="18" cy="18" r="15" class="fg" style={{ strokeDasharray: `${pct * 0.942} 100` }} />
          </svg>
        ) : (
          <ListChecks size={16} />
        )}
        {main && <span>{main.kind === 'export' ? `Exporting ${pct} %` : main.kind === 'transcribe' ? `Transcribing ${pct} %` : 'Analyzing media'}</span>}
      </button>
      {open && (
        <div class="popover tasks-pop">
          <header>
            <b>Background Tasks</b>
            <button class="link" onClick={() => api.clearTasks()}>
              Clear finished
            </button>
          </header>
          {list.length === 0 && <p class="dim">Nothing running.</p>}
          {list.map((t) => (
            <div key={t.id} class={`task ${t.state}`}>
              <div class="task-head">
                {t.state === 'done' ? <CheckCircle2 size={14} class="ok" /> : t.state === 'error' ? <CircleAlert size={14} class="err" /> : <Loader2 size={14} class="spin" />}
                <span class="title">{t.title}</span>
                {(t.state === 'running' || t.state === 'queued') && <IconButton icon={X} size={13} title="Cancel" onClick={() => api.cancelTask(t.id)} />}
                {t.state === 'done' && t.kind === 'export' && t.result && (
                  <button class="link" onClick={() => api.reveal(t.result)}>
                    Reveal
                  </button>
                )}
              </div>
              {(t.state === 'running' || t.state === 'queued') && (
                <div class="bar">
                  <div style={{ width: `${Math.round((t.progress || 0) * 100)}%` }} />
                </div>
              )}
              <div class="task-sub">{t.state === 'error' ? t.error : t.state === 'queued' ? 'Waiting' : t.state === 'canceled' ? 'Canceled' : t.stage || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TitleBar() {
  const r = room.value;
  const rec = engine.recording.value;
  const mod = modifierInfo();
  historyVersion.value;
  return (
    <header class={`titlebar${isMac ? ' mac' : ''}`}>
      <div class="brand">
        <span class="logo" />
        Reccut
      </div>
      <div class="rooms">
        <button class={r === 'record' ? 'active' : ''} onClick={() => (room.value = 'record')} title={`Record (${isMac ? '⌘' : 'Ctrl+'}1)`}>
          <Video size={14} />
          Record
          {rec && <span class="live-dot" />}
        </button>
        <button class={r === 'edit' ? 'active' : ''} onClick={() => (room.value = 'edit')} title={`Edit (${isMac ? '⌘' : 'Ctrl+'}2)`}>
          <Clapperboard size={14} />
          Edit
        </button>
        <button class={r === 'export' ? 'active' : ''} onClick={() => (room.value = 'export')} title={`Export (${isMac ? '⌘' : 'Ctrl+'}3)`}>
          <Share size={14} />
          Export
        </button>
      </div>
      <button class="project-btn" title={`${project.value.name}. Click to open or create projects.`} onClick={() => (commands.projectsOpen.value = true)}>
        <FolderOpen size={14} />
        <span>{project.value.name}</span>
      </button>
      <div class="spacer" />
      <TasksIndicator />
      <IconButton icon={CircleHelp} class="help-btn" title={`Help and command search (${isMac ? '⌘K' : 'Ctrl+K'})`} onClick={() => (paletteOpen.value = true)} />
      {r === 'edit' ? (
        <div class="actions">
          <IconButton icon={Undo2} title="Undo" disabled={!canUndo()} onClick={undo} />
          <IconButton icon={Redo2} title="Redo" disabled={!canRedo()} onClick={redo} />
          <span class="sep" />
          <IconButton icon={Settings} title={`Settings (${isMac ? '⌘' : 'Ctrl+'},)`} onClick={() => (commands.prefsOpen.value = true)} />
          <IconButton icon={Plus} title={`Import media (${isMac ? '⌘' : 'Ctrl+'}I)`} onClick={() => commands.importDialog()} />
          <button class="btn primary" onClick={() => (commands.exportOpen.value = true)} title={`Export project (${isMac ? '⌘' : 'Ctrl+'}E)`}>
            <Share size={15} />
            Export Project
          </button>
        </div>
      ) : r === 'export' ? (
        <div class="actions" />
      ) : (
        <div class="actions">
          {rec && <span class="rec-timer">{formatDuration(engine.elapsed.value)}</span>}
          <button class={`record-btn${rec ? ' active' : ''}`} disabled={engine.finishing.value} onClick={toggleRecording}>
            <span class="rec-icon" />
            {engine.finishing.value ? 'Saving' : rec ? 'Stop' : engine.countdown.value ? `Starting in ${engine.countdown.value}` : 'Start Recording'}
            <kbd>{mod.short}0</kbd>
          </button>
          {!rec && (
            <button class="btn secondary" onClick={() => (room.value = 'edit')}>
              <Clapperboard size={15} />
              Edit
            </button>
          )}
        </div>
      )}
    </header>
  );
}

function Notice() {
  const n = engine.notice.value;
  if (!n) return null;
  return (
    <div class="notice">
      <CircleAlert size={16} />
      <span>{n.text}</span>
      {n.action && (
        <button class="btn secondary small" onClick={n.onAction}>
          {n.action}
        </button>
      )}
      <IconButton icon={X} title="Close" size={14} onClick={() => (engine.notice.value = null)} />
    </div>
  );
}

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// Tastetrykk går gjennom kommandoregisteret. Taster i tekstfelt og åpne dialoger røres ikke.
// Ctrl mellomrom åpner søket fra hvor som helst, også fra tekstfelt som ellers stopper tastene.
function onKeyDownCapture(e) {
  if (document.querySelector('.help-window') || document.querySelector('.palette')) return;
  const any = commandForEvent(e, room.value);
  if (!any?.anywhere) return;
  e.preventDefault();
  e.stopPropagation();
  // Feltet som hadde fokus, slipper det, så det du skriver havner i søket.
  if (isTyping()) document.activeElement.blur();
  runCommand(any);
}

function onKeyDown(e) {
  if (isTyping() || document.querySelector('.modal-backdrop')) return;
  const cmd = commandForEvent(e, room.value);
  if (!cmd) return;
  e.preventDefault();
  e.stopPropagation();
  runCommand(cmd);
}

// Menyvalg. Klipp ut, kopier, lim inn og angre virker på teksten når du skriver i et felt.
function handleMenu(id) {
  const cmd = byId.get(id);
  if (cmd?.text && isTyping()) {
    document.execCommand(cmd.text);
    return;
  }
  if (cmd?.register && document.querySelector('.modal-backdrop') && !['roomRecord', 'roomEdit', 'roomExport'].includes(id)) return;
  runCommand(id);
}

// Knip og Ctrl + rullehjul skal aldri zoome hele vinduet; tidslinjen bruker dem selv.
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey && !e.defaultPrevented) e.preventDefault();
  },
  { passive: false }
);

// Menylinjen bygges på nytt når noe som vises med hake endres (verktøy, rom, skumming).
let menuTimer = null;
effect(() => {
  menuTemplate();
  historyVersion.value;
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => api.setMenu(menuTemplate()), 60);
});

function App() {
  const r = room.value;
  useEffect(() => {
    engine.initSources();
    loadInitialProject();
    const offShortcut = api.onShortcut((a) => {
      if (a.layout) engine.setLayout(a.layout);
      if (a.toggleRecord) toggleRecording();
    });
    const offMenu = api.onMenu(handleMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
      offShortcut();
      offMenu();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div class={`app room-${r}`}>
      <TitleBar />
      <Notice />
      <main>
        <div class="room" hidden={r !== 'record'}>
          <Recorder active={r === 'record'} />
        </div>
        <div class="room" hidden={r !== 'edit'}>
          <Editor active={r === 'edit'} />
        </div>
        <div class="room" hidden={r !== 'export'}>
          <ExportRoom active={r === 'export'} />
        </div>
      </main>
      {(commands.newProjectOpen.value || needsProject.value) && <NewProjectDialog />}
      {commands.projectsOpen.value && !needsProject.value && <ProjectsDialog />}
      {commands.prefsOpen.value && <SettingsWindow />}
      {helpOpen.value && <HelpCenter />}
      {paletteOpen.value && <CommandPalette />}
      <Toasts />
    </div>
  );
}

// Brukes av de automatiske testene.
window.__reccut = {
  importPaths: (paths, placement) => import('./editor/store.js').then((m) => m.importPaths(paths, placement)),
  exportState: () => import('./export/state.js'),
  store: () => import('./editor/store.js'),
  commands: () => import('./editor/commands.js'),
  registry: () => import('./registry.js'),
  model: () => import('../shared/model.js'),
  openRecording: async (dir) => {
    const m = await import('./editor/store.js');
    await m.addRecordingToProject(dir);
  },
};

if (isMac) document.documentElement.classList.add('mac');
render(<App />, document.getElementById('root'));
