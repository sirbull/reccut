import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  FolderOpen,
  ListChecks,
  Loader2,
  Plus,
  Redo2,
  Share,
  Undo2,
  Video,
  X,
} from 'lucide-preact';
import './styles/app.css';
import { Recorder } from './recorder/Recorder.jsx';
import * as engine from './recorder/engine.js';
import { modifierInfo, settings } from './recorder/settings.js';
import { Editor, handleMenu } from './editor/Editor.jsx';
import {
  canRedo,
  canUndo,
  createProjectFromRecording,
  historyVersion,
  loadInitialProject,
  openProjectFile,
  redo,
  room,
  saveNow,
  saveState,
  tasks,
  undo,
} from './editor/store.js';
import * as commands from './editor/commands.js';
import { startExport } from './editor/ExportDialog.jsx';
import { ExportRoom } from './export/ExportRoom.jsx';
import { formatDuration } from '../shared/model.js';
import { IconButton, Toasts, toast } from './ui.jsx';

const api = window.api;
const isMac = api.platform === 'darwin';

async function finishRecording() {
  const dir = await engine.stopRecording();
  if (!dir) return;
  const { project: p, path } = await createProjectFromRecording(dir);
  const s = settings.value;
  if (s.autoRender) {
    const base = s.outputDir || (await api.baseDir());
    const sep = api.platform === 'win32' ? '\\' : '/';
    await startExport(p, { preset: 'standard', format: 'mp4-h264', quality: 'high', res: 0, fps: p.fps, audioOnly: false, captions: 'none', output: `${base}${sep}${p.name}.mp4` });
  }
  const openEditor = async () => {
    if (saveState.value !== 'saved') await saveNow();
    await openProjectFile(path);
    room.value = 'edit';
  };
  toast(s.autoRender ? 'Recording saved. A finished video is being rendered in the background.' : 'Recording saved.', {
    kind: 'success',
    timeout: 15000,
    actions: [
      { label: api.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder', onClick: () => api.reveal(dir) },
      { label: 'Edit', primary: true, onClick: openEditor },
    ],
  });
}

export function toggleRecording() {
  if (engine.finishing.value) return;
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
        OBSlite
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
      <div class="spacer" />
      <TasksIndicator />
      {r === 'edit' ? (
        <div class="actions">
          <IconButton icon={Undo2} title="Undo" disabled={!canUndo()} onClick={undo} />
          <IconButton icon={Redo2} title="Redo" disabled={!canRedo()} onClick={redo} />
          <span class="sep" />
          <IconButton icon={FolderOpen} title="Projects" onClick={() => (commands.projectsOpen.value = true)} />
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
            {engine.finishing.value ? 'Saving' : rec ? 'Stop' : 'Start Recording'}
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
    return () => {
      offShortcut();
      offMenu();
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
      <Toasts />
    </div>
  );
}

// Brukes av de automatiske testene.
window.__obslite = {
  importPaths: (paths, placement) => import('./editor/store.js').then((m) => m.importPaths(paths, placement)),
  exportState: () => import('./export/state.js'),
  store: () => import('./editor/store.js'),
  openRecording: async (dir) => {
    const m = await import('./editor/store.js');
    const r = await m.createProjectFromRecording(dir);
    await m.openProjectFile(r.path);
  },
};

if (isMac) document.documentElement.classList.add('mac');
render(<App />, document.getElementById('root'));
