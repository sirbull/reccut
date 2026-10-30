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
  toast(s.autoRender ? 'Opptaket er lagret. Ferdig video lages i bakgrunnen.' : 'Opptaket er lagret.', {
    kind: 'success',
    timeout: 15000,
    actions: [
      { label: api.platform === 'darwin' ? 'Vis i Finder' : 'Vis i mappe', onClick: () => api.reveal(dir) },
      { label: 'Rediger', primary: true, onClick: openEditor },
    ],
  });
}

export function toggleRecording() {
  if (engine.finishing.value) return;
  if (engine.recording.value) finishRecording().catch((err) => toast(`Kunne ikke lagre opptaket: ${err.message}`, { kind: 'error' }));
  else engine.startRecording().catch((err) => toast(`Kunne ikke starte opptaket: ${err.message}`, { kind: 'error' }));
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
      <button class={`tasks-btn${running.length ? ' busy' : ''}`} onClick={() => setOpen(!open)} title="Bakgrunnsoppgaver">
        {running.length ? (
          <svg width="18" height="18" viewBox="0 0 36 36" class="ring">
            <circle cx="18" cy="18" r="15" />
            <circle cx="18" cy="18" r="15" class="fg" style={{ strokeDasharray: `${pct * 0.942} 100` }} />
          </svg>
        ) : (
          <ListChecks size={16} />
        )}
        {main && <span>{main.kind === 'export' ? `Eksport ${pct} %` : main.kind === 'transcribe' ? `Teksting ${pct} %` : 'Analyserer'}</span>}
      </button>
      {open && (
        <div class="popover tasks-pop">
          <header>
            <b>Bakgrunnsoppgaver</b>
            <button class="link" onClick={() => api.clearTasks()}>
              Fjern ferdige
            </button>
          </header>
          {list.length === 0 && <p class="dim">Ingen oppgaver.</p>}
          {list.map((t) => (
            <div key={t.id} class={`task ${t.state}`}>
              <div class="task-head">
                {t.state === 'done' ? <CheckCircle2 size={14} class="ok" /> : t.state === 'error' ? <CircleAlert size={14} class="err" /> : <Loader2 size={14} class="spin" />}
                <span class="title">{t.title}</span>
                {(t.state === 'running' || t.state === 'queued') && <IconButton icon={X} size={13} title="Avbryt" onClick={() => api.cancelTask(t.id)} />}
                {t.state === 'done' && t.kind === 'export' && t.result && (
                  <button class="link" onClick={() => api.reveal(t.result)}>
                    Vis
                  </button>
                )}
              </div>
              {(t.state === 'running' || t.state === 'queued') && (
                <div class="bar">
                  <div style={{ width: `${Math.round((t.progress || 0) * 100)}%` }} />
                </div>
              )}
              <div class="task-sub">{t.state === 'error' ? t.error : t.state === 'queued' ? 'I kø' : t.state === 'canceled' ? 'Avbrutt' : t.stage || ''}</div>
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
        <button class={r === 'record' ? 'active' : ''} onClick={() => (room.value = 'record')} title={`Opptak (${isMac ? '⌘' : 'Ctrl+'}1)`}>
          <Video size={14} />
          Opptak
          {rec && <span class="live-dot" />}
        </button>
        <button class={r === 'edit' ? 'active' : ''} onClick={() => (room.value = 'edit')} title={`Redigering (${isMac ? '⌘' : 'Ctrl+'}2)`}>
          <Clapperboard size={14} />
          Redigering
        </button>
      </div>
      <div class="spacer" />
      <TasksIndicator />
      {r === 'edit' ? (
        <div class="actions">
          <IconButton icon={Undo2} title="Angre" disabled={!canUndo()} onClick={undo} />
          <IconButton icon={Redo2} title="Gjør om" disabled={!canRedo()} onClick={redo} />
          <span class="sep" />
          <IconButton icon={FolderOpen} title="Prosjekter" onClick={() => (commands.projectsOpen.value = true)} />
          <IconButton icon={Plus} title={`Importer media (${isMac ? '⌘' : 'Ctrl+'}I)`} onClick={() => commands.importDialog()} />
          <button class="btn primary" onClick={() => (commands.exportOpen.value = true)} title={`Eksporter (${isMac ? '⌘' : 'Ctrl+'}E)`}>
            <Share size={15} />
            Eksporter
          </button>
        </div>
      ) : (
        <div class="actions">
          {rec && <span class="rec-timer">{formatDuration(engine.elapsed.value)}</span>}
          <button class={`record-btn${rec ? ' active' : ''}`} disabled={engine.finishing.value} onClick={toggleRecording}>
            <span class="rec-icon" />
            {engine.finishing.value ? 'Lagrer ...' : rec ? 'Stopp' : 'Start opptak'}
            <kbd>{mod.short}0</kbd>
          </button>
          {!rec && (
            <button class="btn secondary" onClick={() => (room.value = 'edit')}>
              <Clapperboard size={15} />
              Rediger
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
      <IconButton icon={X} title="Lukk" size={14} onClick={() => (engine.notice.value = null)} />
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
      </main>
      <Toasts />
    </div>
  );
}

// Brukes av de automatiske testene.
window.__obslite = {
  importPaths: (paths, placement) => import('./editor/store.js').then((m) => m.importPaths(paths, placement)),
  openRecording: async (dir) => {
    const m = await import('./editor/store.js');
    const r = await m.createProjectFromRecording(dir);
    await m.openProjectFile(r.path);
  },
};

if (isMac) document.documentElement.classList.add('mac');
render(<App />, document.getElementById('root'));
