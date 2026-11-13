import { AIChat, aiChatOpen } from './Extensions.jsx';
import { PluginWindows, PluginsButton } from './Plugins.jsx';
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
  PanelLeft,
  PanelRight,
  Palette,
  Redo2,
  Settings,
  Share,
  Sparkles,
  Undo2,
  Video,
  X,
} from 'lucide-preact';
import './styles/app.css';
import { Recorder } from './recorder/Recorder.jsx';
import * as engine from './recorder/engine.js';
import { modifierInfo, settings } from './recorder/settings.js';
import { Editor } from './editor/Editor.jsx';
import { byId, commandForEvent, inRoom, menuTemplate, runCommand } from './registry.js';
import { effect, signal } from '@preact/signals';
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
  sequenceSettingsOpen,
} from './editor/store.js';
import * as commands from './editor/commands.js';
import { ExportDialog, startExport } from './editor/ExportDialog.jsx';
import { ExportFrameDialog } from './editor/ExportFrameDialog.jsx';
import { DesignRoom } from './design/DesignRoom.jsx';
import { designUndo, designRedo, canDesignUndo, canDesignRedo, currentDesign, exportDesignOpen, historyVersion as designHistoryVersion } from './design/store.js';
import { ExportRoom } from './export/ExportRoom.jsx';
import { prepareProjectExport } from './export/state.js';
import { currentSequence, formatDuration } from '../shared/model.js';
import { Button, IconButton, Modal, Toasts, toast } from './ui.jsx';
import { HistoryDialog, NewProjectDialog, PackageDialog, ProjectsDialog, SaveAsDialog, SequenceSettingsDialog } from './ProjectDialogs.jsx';
import { CommandPalette, HelpCenter, installHelpBridge } from './help/Help.jsx';
import { SettingsWindow } from './Settings.jsx';
import { prefs } from './prefs.js';
import { helpOpen, paletteOpen } from './registry.js';
import wordmark from '../../assets/reccut-wordmark.svg';
import { isTyping, isSpaceInput, commandsBlocked, dialogOwnsKeyboard, watchKeyboardScope } from './keyboard.js';
import { installFileDrop } from './fileDrop.js';
import { multicamMenu } from './editor/multicam.js';
import { UpdateDialog } from './UpdateDialog.jsx';
import { startUpdateChecks } from './updates.js';
import { VoiceoverBooth } from './voiceover/Booth.jsx';
import { studioMenu } from './voiceover/VoTimeline.jsx';
import { boothOpen, openBooth } from './voiceover/state.js';
import { StudioIcon } from './voiceover/StudioIcon.jsx';
import { QuickRecord } from './voiceover/QuickRecord.jsx';
import { quickOpen } from './voiceover/quick.js';
import { AiModelsDialog, aiModelsOpen, maybeAskFirstRun } from './AiModels.jsx';
import { VoicePackagesDialog } from './VoicePackages.jsx';
import { voicePackagesOpen } from './voicePackages.js';

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

byId.get('record:toggle').run = toggleRecording;

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

// Windows: menynavnene ligger på samme linje som minimer, maksimer og lukk (titleBarOverlay i main.js).
// Menyene som åpnes er de ekte menyene fra hovedprosessen. Alt alene åpner File, som i andre Windows-programmer.
const winMenu = api.platform === 'win32';
function openMenu(label, el) {
  const r = el.getBoundingClientRect();
  return api.openMenuBar(label, r.left, r.bottom).catch(() => {});
}
function MenuStrip() {
  const menus = menuTemplate().map((m) => m.label);
  return (
    <nav class="menu-strip" aria-label="Menu bar">
      {menus.map((label) => (
        <button key={label} data-menu={label} onClick={(e) => openMenu(label, e.currentTarget)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
if (winMenu) {
  let altAlone = false;
  window.addEventListener('keydown', (e) => { altAlone = e.key === 'Alt' && (e.repeat ? altAlone : true); }, true);
  for (const type of ['pointerdown', 'wheel', 'blur']) window.addEventListener(type, () => (altAlone = false), true);
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt' || !altAlone) return;
    altAlone = false;
    const first = document.querySelector('.menu-strip button');
    if (first) { e.preventDefault(); openMenu(first.dataset.menu, first); }
  }, true);
}

function TitleBar() {
  const r = room.value;
  const rec = engine.recording.value;
  const mod = modifierInfo();
  historyVersion.value;
  designHistoryVersion.value;
  return (
    <header class={`titlebar${isMac ? ' mac' : ''}`}>
      <div class="brand">
        <img class="wordmark" src={`data:image/svg+xml,${encodeURIComponent(wordmark)}`} alt="Reccut" />
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
        <button class={r === 'design' ? 'active' : ''} onClick={() => (room.value = 'design')} title="Design"><Palette size={14} />Design</button>
      </div>
      <button class="project-btn" title={`${project.value.name}. Click for project info, or to open or create projects.`} onClick={() => (commands.projectsOpen.value = true)}>
        <FolderOpen size={14} />
        <span>{project.value.name}</span>
        {project.value.sequences && Object.keys(project.value.sequences).length > 0 && <span class="dim">/ {currentSequence(project.value).name}</span>}
      </button>
      <div class="spacer" />
      <TasksIndicator />
      <PluginsButton />
      <button class="btn secondary small ai-btn" onClick={() => (aiChatOpen.value = true)} title="AI Agent: describe an edit and it does it. The first time, it helps you set it up.">
        <Sparkles size={14} />
        AI Agent
      </button>

      <IconButton icon={CircleHelp} class="help-btn" title={`Help and command search (${isMac ? '⌘K' : 'Ctrl+K'})`} onClick={() => (paletteOpen.value = true)} />
      {r === 'edit' ? (
        <div class="actions">
          <IconButton icon={PanelLeft} title={`${prefs.value.editorBrowserVisible ? 'Hide' : 'Show'} Media Browser`} active={prefs.value.editorBrowserVisible} aria-pressed={prefs.value.editorBrowserVisible} onClick={() => runCommand('toggleBrowser')} />
          <IconButton icon={PanelRight} title={`${prefs.value.editorInspectorVisible ? 'Hide' : 'Show'} Properties`} active={prefs.value.editorInspectorVisible} aria-pressed={prefs.value.editorInspectorVisible} onClick={() => runCommand('toggleInspector')} />
          <span class="sep" />
          <IconButton icon={Undo2} title="Undo" disabled={!canUndo()} onClick={undo} />
          <IconButton icon={Redo2} title="Redo" disabled={!canRedo()} onClick={redo} />
          <span class="sep" />
          <IconButton icon={Settings} title={`Settings (${isMac ? '⌘' : 'Ctrl+'},)`} onClick={() => (commands.prefsOpen.value = true)} />
          <button class="btn secondary vo-open-btn" onClick={openBooth} title={`Voice Over Studio: record narration or a talking head from a script, with retakes, and stitch it to the timeline (${isMac ? '⌥⌘' : 'Ctrl+Alt+'}B)`}>
            <StudioIcon size={15} />
            Voice Over Studio
          </button>
          <button class="btn primary" onClick={prepareProjectExport} title="Prepare project in Export">
            <Share size={15} />
            Export Project
          </button>
        </div>
      ) : r === 'design' ? (
        <div class="actions">
          <IconButton icon={Undo2} title="Undo Design" disabled={!canDesignUndo()} onClick={designUndo} />
          <IconButton icon={Redo2} title="Redo Design" disabled={!canDesignRedo()} onClick={designRedo} />
          <button class="btn primary" disabled={!currentDesign.value} onClick={() => { exportDesignOpen.value = true; }}><Share size={15}/>Export Design…</button>
        </div>
      ) : r === 'export' ? (
        <div class="actions" />
      ) : (
        <div class="actions">
          {rec && <span class={`rec-timer${engine.paused.value ? ' paused' : ''}`}>{engine.paused.value ? 'Paused ' : ''}{formatDuration(engine.elapsed.value)}</span>}
          {rec && (
            <button class="btn secondary" onClick={engine.togglePause} title={`${engine.paused.value ? 'Resume' : 'Pause'} (${mod.short}9)`}>
              {engine.paused.value ? 'Resume' : 'Pause'}
            </button>
          )}
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

// Tastetrykk går gjennom kommandoregisteret. Taster i tekstfelt og åpne dialoger røres ikke.
function onKeyDownCapture(e) {
  if (e.defaultPrevented || e.isComposing || document.hasFocus() === false) return;
  // Mellomrom spiller alltid av, også fra knapper, glidebrytere, valglister og rullbare lister.
  // Bare tekstfelt som tar mellomrom, og åpne dialoger, beholder tasten.
  if (e.code === 'Space' && !isSpaceInput(e) && !dialogOwnsKeyboard(e)) {
    const cmd = commandForEvent(e, room.value);
    if (cmd?.id === 'play' || cmd?.id === 'playReverse') {
      e.preventDefault();
      e.stopPropagation();
      document.activeElement?.blur?.();
      runCommand(cmd);
      return;
    }
  }
  if (commandsBlocked(e)) return;
  const any = commandForEvent(e, room.value);
  if (!any?.anywhere) return;
  e.preventDefault();
  e.stopPropagation();
  runCommand(any);
}

function onKeyDown(e) {
  if (commandsBlocked(e) || e.defaultPrevented) return;
  const cmd = commandForEvent(e, room.value);
  if (!cmd) return;
  e.preventDefault();
  e.stopPropagation();
  runCommand(cmd);
}

// Menyvalg. Klipp ut, kopier, lim inn og angre virker på teksten når du skriver i et felt.
function handleMenu(id) {
  if (!document.hasFocus()) return;
  const cmd = byId.get(id);
  if (isTyping()) {
    if (cmd?.text) {
      // execCommand('paste') er sperret i Chromium; webContents limer inn som en ekte Cmd V.
      api.editText(cmd.text);
      return;
    }
    // Export dialogs are explicit actions, also when an inspector/search field
    // retains focus. Ordinary editing commands still belong to the focused field.
    if (!cmd?.allowWhileTyping) return;
    document.activeElement?.blur?.();
  }
  // Voice Over Studio har sin egen angrehistorikk og sitt eget utvalg (Cmd Z, Shift Cmd Z, Cmd A).
  if (boothOpen.value && studioMenu(id)) return;
  // Multicam-vinduet har egen angrehistorikk.
  if (multicamMenu.handle?.(id)) return;
  // Menyen bygges om etter et rombytte, så et tastetrykk rett etter byttet kan treffe den gamle menyen.
  if (dialogOwnsKeyboard() || !cmd || !inRoom(cmd)) return;
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
  designHistoryVersion.value;
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => api.setMenu(menuTemplate()), 60);
});

function App() {
  const r = room.value;
  const [fileHover, setFileHover] = useState(false);
  const [started, setStarted] = useState(false);
  // Første oppstart: når prosjektet er valgt, spør appen én gang om KI-modeller.
  useEffect(() => {
    if (started && !needsProject.value) setTimeout(maybeAskFirstRun, 600);
  }, [started, needsProject.value]);
  useEffect(() => installFileDrop(window, {
    pathForFile: api.pathForFile,
    onFiles: commands.importDroppedFiles,
    onHover: setFileHover,
    onError: (err) => toast(err.message, { kind: 'error' }),
  }), []);
  useEffect(() => {
    if (r !== 'record' && engine.recording.value) {
      finishRecording().catch((err) => toast(`Could not save the recording: ${err.message}`, { kind: 'error' }));
    }
  }, [r, engine.recording.value]);

  useEffect(() => {
    engine.initSources();
    (async () => {
      try {
        await api.startupStage?.('project');
        await loadInitialProject();
        await api.startupStage?.('recovery');
        await checkRecovery();
      } catch (err) {
        console.error('Could not restore the workspace', err);
        toast(`Could not restore the workspace: ${err.message}`, { kind: 'error' });
      } finally {
        // Let Preact commit the restored project and paint before replacing the splash.
        requestAnimationFrame(() => requestAnimationFrame(() => api.startupStage?.('ready')));
        setStarted(true);
      }
    })();
    // Nye versjoner sjekkes litt etter start, så det ikke sinker oppstarten.
    const stopUpdateChecks = startUpdateChecks(() => !engine.recording.value && !dialogOwnsKeyboard());
    const offShortcut = api.onShortcut((a) => {
      // Tray/control-bar clicks are explicit actions. Keyboard callbacks must also
      // pass the renderer check in case focus changed before native IPC arrived.
      const control = engine.recording.value || engine.countdown.value > 0;
      if (a.keyboard && (document.hasFocus()
        ? commandsBlocked()
        : !settings.value.backgroundShortcuts && !control)) return;
      if (a.layout) engine.setLayout(a.layout);
      if (a.nextCamera) engine.nextCamera();
      if (a.toggleRecord) toggleRecording();
      if (a.togglePause) engine.togglePause();
    });
    let keyboardBlocked = true;
    const scope = () => api.setShortcutScope({ blocked: keyboardBlocked, background: settings.value.backgroundShortcuts });
    const offScope = watchKeyboardScope((blocked) => { keyboardBlocked = blocked; scope(); });
    const offScopeSettings = effect(scope);
    const offHelp = installHelpBridge();
    const offMenu = api.onMenu(handleMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      stopUpdateChecks();
      window.removeEventListener('keydown', onKeyDownCapture, true);
      offShortcut();
      offScope();
      offScopeSettings();
      offMenu();
      offHelp();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div class={`app room-${r}`}>
      {winMenu && <MenuStrip />}
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
        <div class="room" hidden={r !== 'design'}><DesignRoom active={r === 'design'} /></div>
      </main>
      {commands.exportOpen.value && <ExportDialog />}
      {commands.frameExportOpen.value && <ExportFrameDialog request={commands.frameExportOpen.value} />}
      {(commands.newProjectOpen.value || needsProject.value) && <NewProjectDialog />}
      {commands.projectsOpen.value && !needsProject.value && <ProjectsDialog />}
      {commands.saveAsOpen.value && <SaveAsDialog />}
      {sequenceSettingsOpen.value && <SequenceSettingsDialog />}
      {commands.packageOpen.value && <PackageDialog />}
      {commands.historyOpen.value && <HistoryDialog />}
      {aiChatOpen.value && <AIChat key={project.value.id} />}
      <PluginWindows />
      {boothOpen.value && r === 'edit' && <VoiceoverBooth />}
      {quickOpen.value && r === 'edit' && <QuickRecord />}
      {aiModelsOpen.value && !needsProject.value && <AiModelsDialog key={String(aiModelsOpen.value.focus)} />}
      {commands.prefsOpen.value && <SettingsWindow />}
      {voicePackagesOpen.value && !needsProject.value && <VoicePackagesDialog key={voicePackagesOpen.value.lang || 'all'} />}
      {helpOpen.value && <HelpCenter />}
      {paletteOpen.value && <CommandPalette />}
      {recoverList.value.length > 0 && <RecoverDialog />}
      <UpdateDialog />
      <Toasts />
      {fileHover && <div class="file-drop-hint" role="status"><FolderOpen size={24} /><span>Drop files to import</span></div>}
    </div>
  );
}

/* Opptak som ble avbrutt av et krasj eller strømbrudd, reddes ved neste start. */
const recoverList = signal([]);
async function checkRecovery() {
  try {
    recoverList.value = (await api.recRecoverList()) || [];
  } catch {}
}

function RecoverDialog() {
  const it = recoverList.value[0];
  const [busy, setBusy] = useState(false);
  const done = () => (recoverList.value = recoverList.value.slice(1));
  const recover = async () => {
    setBusy(true);
    try {
      const dir = await api.recRecover(it.dir);
      await addRecordingToProject(dir);
      toast(`The recording was recovered and added to ${project.value.name}.`, { kind: 'success', timeout: 8000 });
    } catch (err) {
      toast(`Could not recover the recording: ${err.message}`, { kind: 'error' });
    }
    setBusy(false);
    done();
  };
  return (
    <Modal
      title="Recover Recording"
      width={480}
      onClose={null}
      footer={
        <>
          <Button
            onClick={async () => {
              if (!confirm('Move the unfinished recording to the Trash?')) return;
              await api.recDiscard(it.dir);
              done();
            }}
          >
            Discard
          </Button>
          <Button variant="primary" disabled={busy} onClick={recover}>
            {busy ? 'Recovering…' : 'Recover'}
          </Button>
        </>
      }
    >
      <p class="lead">
        Reccut was closed while recording ({it.name}, {(it.size / 1e6).toFixed(1)} MB saved). The part that was recorded is on disk and can be recovered, with layouts and cursor movements up to the last few seconds.
      </p>
    </Modal>
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
