// Redigeringsrommet: bibliotek, visning og inspektør øverst, tidslinje nederst.
import { useEffect, useRef, useState } from 'preact/hooks';
import { FilePlus2, FolderOpen, Trash2 } from 'lucide-preact';
import { CAPTION_LANE, PROJECT_TEMPLATES, formatDuration } from '../../shared/model.js';
import { Browser } from './Browser.jsx';
import { Viewer } from './Viewer.jsx';
import { Inspector } from './Inspector.jsx';
import { Timeline } from './Timeline.jsx';
import { ExportDialog } from './ExportDialog.jsx';
import {
  commit,
  makeCaptionClip,
  newProjectNamed,
  openProjectFile,
  project,
  projectPath,
  redo,
  room,
  saveNow,
  selectedTransition,
  selection,
  snapping,
  skim,
  skimming,
  audioSkimming,
  tool,
  undo,
} from './store.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { Button, Modal, NumberField, Row, Section, Toggle, toast } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';

const api = window.api;
const isMac = api.platform === 'darwin';

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// Snarveier som i Final Cut Pro. På Windows brukes Ctrl for Cmd og Alt for Option.
function onKeyDown(e) {
  if (room.value !== 'edit' || isTyping() || document.querySelector('.modal-backdrop')) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const ctrlMac = isMac && e.ctrlKey && !e.metaKey;
  const alt = e.altKey;
  const code = e.code;
  let handled = true;

  if (code === 'Space') playback.toggle();
  else if (code === 'KeyJ' && !mod) playback.shuttle(-1);
  else if (code === 'KeyK' && !mod) playback.shuttle(0);
  else if (code === 'KeyL' && !mod) playback.shuttle(1);
  else if (code === 'ArrowLeft') commands.stepFrames(e.shiftKey ? -10 : -1);
  else if (code === 'ArrowRight') commands.stepFrames(e.shiftKey ? 10 : 1);
  else if (code === 'ArrowUp') commands.jumpEdit(-1);
  else if (code === 'ArrowDown') commands.jumpEdit(1);
  else if (code === 'Home') commands.goHome();
  else if (code === 'End') commands.goEnd();
  else if (code === 'KeyB' && mod) e.shiftKey ? commands.bladeAll() : commands.blade();
  else if (code === 'KeyT' && (isMac ? ctrlMac : alt) && !mod) commands.addTitle('center');
  else if (code === 'KeyT' && mod) commands.addTransition('dissolve');
  else if (code === 'KeyC' && alt && !mod) commands.addCaption();
  else if (code === 'KeyX' && alt && !mod) commands.clearRange();
  else if (code === 'BracketLeft' && alt) commands.trimToPlayhead('start');
  else if (code === 'BracketRight' && alt) commands.trimToPlayhead('end');
  else if ((code === 'Equal' || code === 'NumpadAdd') && (isMac ? ctrlMac : alt)) commands.adjustVolume(1);
  else if ((code === 'Minus' || code === 'NumpadSubtract') && (isMac ? ctrlMac : alt)) commands.adjustVolume(-1);
  // Lyd: utvid og koble fra (Control S og Control Shift S på Mac, Alt E og Alt Shift E på Windows).
  else if (isMac && ctrlMac && code === 'KeyS') e.shiftKey ? commands.detachSelectedAudio() : commands.toggleExpandAudio();
  else if (!isMac && alt && !e.ctrlKey && code === 'KeyE') e.shiftKey ? commands.detachSelectedAudio() : commands.toggleExpandAudio();
  else if (alt && !mod && !e.ctrlKey && code === 'KeyS') commands.toggleSolo();
  else if (alt && !mod && code === 'KeyF') commands.addFreezeFrame();
  else if (alt && !mod && code === 'KeyW') commands.insertGapAtPlayhead();
  else if (mod && alt && code === 'KeyR') commands.setSpeedSelected(1);
  else if (mod && !alt && code === 'KeyR') commands.openRetime();
  else if (mod && alt && code === 'ArrowUp') commands.liftSelected();
  else if (mod && alt && code === 'ArrowDown') commands.overwriteSelectedToPrimary();
  else if (mod || e.ctrlKey || alt) handled = false;
  else if (code === 'Backspace' || code === 'Delete') commands.deleteSelection(!e.shiftKey);
  else if (code === 'KeyA') tool.value = 'select';
  else if (code === 'KeyB') tool.value = 'blade';
  else if (code === 'KeyP') tool.value = 'position';
  else if (code === 'KeyH') tool.value = 'hand';
  else if (code === 'KeyT') tool.value = 'trim';
  else if (code === 'KeyR') tool.value = 'range';
  else if (code === 'KeyZ' && !e.shiftKey) tool.value = 'zoom';
  else if (code === 'KeyD') commands.addBrowserSelection('overwrite');
  else if (code === 'KeyC') commands.selectClipAtPlayhead();
  else if (code === 'KeyS') {
    skimming.value = !skimming.value;
    if (!skimming.value) skim.value = null;
  }
  else if (code === 'KeyV') commands.toggleEnabled();
  else if (code === 'KeyE') commands.addBrowserSelection('append');
  else if (code === 'KeyW') commands.addBrowserSelection('insert');
  else if (code === 'KeyQ') commands.addBrowserSelection('connect');
  // N slår lyd ved skumming av og på, Shift N slår festing av og på.
  else if (code === 'KeyN' && e.shiftKey) snapping.value = !snapping.value;
  else if (code === 'KeyN') {
    audioSkimming.value = !audioSkimming.value;
    toast(audioSkimming.value ? 'Audio skimming on' : 'Audio skimming off', { timeout: 1200 });
  }
  else if (code === 'KeyM') commands.addMarker();
  else if (code === 'KeyI') commands.setRange('in');
  else if (code === 'KeyO') commands.setRange('out');
  else if (code === 'KeyZ' && e.shiftKey) commands.zoomFit();
  else if (code === 'Comma') commands.nudge(-1);
  else if (code === 'Period') commands.nudge(1);
  else if (code === 'Escape') {
    selection.value = [];
    selectedTransition.value = null;
  } else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function handleMenu(id) {
  const typing = isTyping();
  const textCmd = { undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste', selectAll: 'selectAll' }[id];
  if (typing && textCmd) {
    document.execCommand(textCmd);
    return;
  }
  if (id === 'prefs') {
    commands.prefsOpen.value = true;
    return;
  }
  if (id === 'roomRecord') room.value = 'record';
  else if (id === 'roomEdit') room.value = 'edit';
  else if (id === 'roomExport') room.value = 'export';
  else if (room.value !== 'edit') {
    if (textCmd) document.execCommand(textCmd);
    if (id === 'export') room.value = 'export';
    else if (['newProject', 'openProject', 'import'].includes(id)) {
      room.value = 'edit';
      setTimeout(() => handleMenu(id), 50);
    }
    return;
  } else if (id === 'undo') undo();
  else if (id === 'redo') redo();
  else if (id === 'cut') commands.cutSelection();
  else if (id === 'copy') commands.copySelection();
  else if (id === 'paste') commands.paste();
  else if (id === 'selectAll') commands.selectAll();
  else if (id === 'newProject') commands.newProjectOpen.value = true;
  else if (id === 'openProject') commands.projectsOpen.value = true;
  else if (id === 'save') saveNow().then(() => toast('Project saved.', { timeout: 2000 }));
  else if (id === 'import') commands.importDialog();
  else if (id === 'export') commands.exportOpen.value = true;
  else if (id === 'zoomIn') commands.zoom(1.5);
  else if (id === 'prefs') commands.prefsOpen.value = true;
  else if (id.startsWith('speed:')) commands.setSpeedSelected(Number(id.slice(6)));
  else if (id === 'retime') commands.openRetime();
  else if (id === 'freeze') commands.addFreezeFrame();
  else if (id === 'expandAudio') commands.toggleExpandAudio();
  else if (id === 'detachAudio') commands.detachSelectedAudio();
  else if (id === 'solo') commands.toggleSolo();
  else if (id === 'lift') commands.liftSelected();
  else if (id === 'overwriteDown') commands.overwriteSelectedToPrimary();
  else if (id === 'insertGap') commands.insertGapAtPlayhead();
  else if (id === 'blade') commands.blade();
  else if (id === 'addTransition') commands.addTransition('dissolve');
  else if (id === 'toggleEnabled') commands.toggleEnabled();
  else if (id === 'zoomOut') commands.zoom(1 / 1.5);
}

// Ferdige undertekster fra Whisper legges inn i undertekstsporet.
api.onTranscribeDone(({ segments, payload }) => {
  if (payload.projectId !== project.value.id) return;
  if (!segments.length) {
    toast('No speech was found to caption.');
    return;
  }
  commit((p) => {
    for (const c of Object.values(p.clips)) if (c.lane === CAPTION_LANE) delete p.clips[c.id];
    for (const s of segments) {
      const c = makeCaptionClip(s.start, s.text, Math.max(0.5, s.end - s.start));
      p.clips[c.id] = c;
    }
  });
  toast(`Added ${segments.length} captions. Read through them and fix any mistakes in the Captions tab.`, { kind: 'success', timeout: 9000 });
});
api.onTranscribeError(({ error }) => {
  if (error !== 'Canceled') toast(`Auto captions failed: ${error}`, { kind: 'error', timeout: 10000 });
});

export function Editor({ active }) {
  const [split, setSplit] = useState(() => Number(localStorage.getItem('editorSplit')) || 0.56);
  const ref = useRef(null);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!active) playback.pause();
  }, [active]);

  const onDividerDown = (e) => {
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const move = (ev) => {
      const k = Math.min(0.78, Math.max(0.3, (ev.clientY - rect.top) / rect.height));
      setSplit(k);
      localStorage.setItem('editorSplit', String(k));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div class="editor" ref={ref} style={{ gridTemplateRows: `${split * 100}% 6px 1fr` }}>
      <div class="editor-top">
        <Browser />
        <Viewer />
        <Inspector />
      </div>
      <div class="divider" onPointerDown={onDividerDown} />
      <Timeline />
      {commands.exportOpen.value && <ExportDialog />}
      {commands.projectsOpen.value && <ProjectsDialog />}
      {commands.newProjectOpen.value && <NewProjectDialog />}
      {commands.prefsOpen.value && <PreferencesDialog />}
    </div>
  );
}

function ProjectsDialog() {
  const [list, setList] = useState(null);
  const load = () => api.listProjects().then(setList);
  useEffect(() => {
    load();
  }, []);
  const close = () => (commands.projectsOpen.value = false);
  return (
    <Modal
      title="Projects"
      width={560}
      onClose={close}
      footer={
        <Button
          variant="primary"
          icon={FilePlus2}
          onClick={() => {
            close();
            commands.newProjectOpen.value = true;
          }}
        >
          New Project
        </Button>
      }
    >
      <div class="project-list">
        {list === null && <p class="dim">Loading</p>}
        {list?.length === 0 && <p class="dim">No saved projects yet.</p>}
        {list?.map((it) => (
          <div key={it.path} class={`project-item${it.path === projectPath.value ? ' current' : ''}`}>
            <button
              class="open"
              onClick={async () => {
                await saveNow();
                await openProjectFile(it.path);
                close();
              }}
            >
              <FolderOpen size={16} />
              <div>
                <b>{it.name}</b>
                <span>
                  {new Date(it.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {formatDuration(it.duration)}
                </span>
              </div>
            </button>
            {it.path !== projectPath.value && (
              <button
                class="icon-btn"
                title="Delete project"
                onClick={async () => {
                  if (!confirm(`Delete the project "${it.name}"? Your media files are kept.`)) return;
                  await api.removeProject(it.path);
                  load();
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// Nytt prosjekt fra mal: format, bildefrekvens og eventuelt ferdig innhold.
function NewProjectDialog() {
  const [tpl, setTpl] = useState('auto');
  const [name, setName] = useState('');
  const close = () => (commands.newProjectOpen.value = false);
  const create = async () => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === tpl);
    await newProjectNamed(name.trim() || undefined, t);
    close();
  };
  return (
    <Modal
      title="New Project"
      width={640}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create}>
            Create Project
          </Button>
        </>
      }
    >
      <Row label="Name" stacked>
        <input class="text-input" placeholder="Untitled Project" value={name} autoFocus onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </Row>
      <div class="template-grid">
        {PROJECT_TEMPLATES.map((t) => (
          <button key={t.id} class={`template${tpl === t.id ? ' active' : ''}`} onClick={() => setTpl(t.id)} onDblClick={create}>
            <div class="shape-wrap">
              <div class="shape" style={{ width: Math.round(t.w * Math.min(64 / t.w, 54 / t.h)), height: Math.round(t.h * Math.min(64 / t.w, 54 / t.h)) }}>
                {t.auto ? 'Auto' : `${t.fps}`}
              </div>
            </div>
            <b>{t.label}</b>
            <span>{t.desc}</span>
          </button>
        ))}
      </div>
      <p class="hint">You can change the format, size and frame rate later in the project settings.</p>
    </Modal>
  );
}

// Innstillinger: standardlengder og skumming.
function PreferencesDialog() {
  const p = prefs.value;
  const close = () => (commands.prefsOpen.value = false);
  const num = (key, label, min, max, step = 0.1) => (
    <Row label={label}>
      <NumberField value={p[key]} min={min} max={max} step={step} precision={step < 1 ? 1 : 0} unit="s" width={84} onChange={(v) => setPrefs({ [key]: Math.round(v * 100) / 100 })} />
    </Row>
  );
  return (
    <Modal title="Preferences" width={520} onClose={close} footer={<Button variant="primary" onClick={close}>Done</Button>}>
      <Section title="Editing" collapsible={false}>
        {num('transitionDur', 'Default transition duration', 0.1, 10)}
        {num('audioCrossfadeDur', 'Default audio crossfade', 0.05, 10)}
        {num('stillDur', 'Still image duration', 0.5, 60)}
        {num('titleDur', 'Title duration', 0.5, 60)}
        {num('freezeDur', 'Freeze frame duration', 0.2, 60)}
      </Section>
      <Section title="Playback" collapsible={false}>
        <Row label="Skimming (S)">
          <Toggle
            checked={skimming.value}
            onChange={(v) => {
              skimming.value = v;
              setPrefs({ skimming: v });
            }}
          />
        </Row>
        <Row label="Audio skimming (N)">
          <Toggle
            checked={audioSkimming.value}
            onChange={(v) => {
              audioSkimming.value = v;
              setPrefs({ audioSkimming: v });
            }}
          />
        </Row>
        <Row label="Snapping (Shift N)">
          <Toggle
            checked={snapping.value}
            onChange={(v) => {
              snapping.value = v;
              setPrefs({ snapping: v });
            }}
          />
        </Row>
        <Row label="Preserve pitch when changing speed">
          <Toggle checked={p.preservePitch} onChange={(v) => setPrefs({ preservePitch: v })} />
        </Row>
      </Section>
    </Modal>
  );
}
