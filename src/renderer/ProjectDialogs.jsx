// Prosjekter: nytt prosjekt (navn, plassering og format) og listen over prosjekter.
// Vises over alle rommene, siden både opptak og redigering hører til et prosjekt.
import { useEffect, useState } from 'preact/hooks';
import { FilePlus2, FolderOpen, FolderSearch, MoreHorizontal } from 'lucide-preact';
import { PROJECT_TEMPLATES, formatDuration } from '../shared/model.js';
import { defaultProjectName, needsProject, newProjectNamed, openProjectFile, project, projectPath, restoreProject, saveNow, saveProjectAs } from './editor/store.js';
import { mediaFiles, reduceProject } from '../shared/package.js';
import * as commands from './editor/commands.js';
import { Button, IconButton, Modal, Row, toast } from './ui.jsx';

const api = window.api;
const isMac = api.platform === 'darwin';
const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(0, Math.round(b / 1e3))} kB`);

export async function openProjectWithDialog() {
  const file = await api.openProjectDialog();
  if (!file) return false;
  await saveNow();
  try {
    await openProjectFile(file);
    return true;
  } catch (err) {
    toast(`Could not open the project: ${err.message}`, { kind: 'error' });
    return false;
  }
}

function useLocation() {
  const [location, setLocation] = useState(localStorage.getItem('projectLocation') || '');
  useEffect(() => {
    if (!location) api.baseDir().then(setLocation);
  }, []);
  const choose = async () => {
    const dir = await api.chooseDir(location);
    if (dir) {
      setLocation(dir);
      localStorage.setItem('projectLocation', dir);
    }
  };
  return [location, choose];
}

export function NewProjectDialog() {
  const required = needsProject.value;
  const [tpl, setTpl] = useState('auto');
  const [name, setName] = useState('');
  const [location, chooseLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const close = () => !required && (commands.newProjectOpen.value = false);
  const sep = api.platform === 'win32' ? '\\' : '/';
  const finalName = name.trim() || defaultProjectName();
  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const t = PROJECT_TEMPLATES.find((x) => x.id === tpl);
      await newProjectNamed(finalName, t, location);
      commands.newProjectOpen.value = false;
    } catch (err) {
      toast(`Could not create the project folder: ${err.message}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={required ? 'Welcome to Reccut' : 'New Project'}
      width={660}
      onClose={required ? null : close}
      footer={
        <>
          {required ? (
            <Button variant="secondary" icon={FolderOpen} onClick={openProjectWithDialog}>
              Open Existing Project
            </Button>
          ) : (
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          )}
          <Button variant="primary" onClick={create} disabled={busy}>
            Create Project
          </Button>
        </>
      }
    >
      {required && <p class="lead">Start by creating a project. Recordings, imported media, optimized media and exports are kept together in the project folder.</p>}
      <Row label="Name" stacked>
        <input class="text-input" placeholder={defaultProjectName()} value={name} autoFocus onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </Row>
      <Row label="Location" stacked>
        <button class="path-btn" title={location} onClick={chooseLocation}>
          <FolderOpen size={14} />
          <span>{location}</span>
        </button>
      </Row>
      <p class="hint">
        A folder named <b>{finalName}</b> is created in {location ? location.split(/[\\/]/).pop() : 'this folder'} with the project file and the folders Media, Recordings, Optimized Media and Exports ({location}
        {sep}
        {finalName}).
      </p>
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

export function ProjectsDialog() {
  const [list, setList] = useState(null);
  const load = () => api.listProjects().then(setList);
  useEffect(() => {
    load();
  }, []);
  const close = () => (commands.projectsOpen.value = false);
  const itemMenu = async (it) => {
    const current = it.path === projectPath.value;
    const id = await api.popupMenu([
      { id: 'reveal', label: isMac ? 'Reveal in Finder' : 'Show in Explorer' },
      { separator: true },
      { id: 'forget', label: 'Remove from List', enabled: !current },
      { id: 'trash', label: 'Move Project to Trash', enabled: !current },
    ]);
    if (id === 'reveal') api.reveal(it.path);
    else if (id === 'forget') {
      await api.forgetProject(it.path);
      load();
    } else if (id === 'trash') {
      if (!confirm(`Move the project "${it.name}" and its folder to the Trash? Media outside the project folder is kept.`)) return;
      await api.trashProject(it.path);
      load();
    }
  };
  return (
    <Modal
      title="Projects"
      width={600}
      onClose={close}
      footer={
        <>
          <Button
            variant="secondary"
            icon={FolderSearch}
            onClick={async () => {
              if (await openProjectWithDialog()) close();
            }}
          >
            Open Other
          </Button>
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
        </>
      }
    >
      <div class="project-list">
        {list === null && <p class="dim">Loading</p>}
        {list?.length === 0 && <p class="dim">No projects yet.</p>}
        {list?.map((it) => (
          <div key={it.path} class={`project-item${it.path === projectPath.value ? ' current' : ''}`}>
            <button
              class="open"
              title={it.path}
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
                  {new Date(it.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {formatDuration(it.duration)} · {it.folder}
                </span>
              </div>
            </button>
            <IconButton icon={MoreHorizontal} size={15} title="More" onClick={() => itemMenu(it)} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* Lagre som: nytt navn og ny plassering. Media blir der de er. */

export function SaveAsDialog() {
  const [name, setName] = useState(`${project.value.name} copy`);
  const [location, chooseLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const close = () => (commands.saveAsOpen.value = false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await saveProjectAs(location, name.trim() || project.value.name);
      close();
      toast(`Saved as ${r.name}. You are now working in the new project.`, { kind: 'success', timeout: 5000, actions: [{ label: isMac ? 'Reveal in Finder' : 'Show in Folder', onClick: () => api.reveal(r.file) }] });
    } catch (err) {
      toast(`Could not save the project: ${err.message}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Save Project As"
      width={520}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <Row label="Name" stacked>
        <input class="text-input" value={name} autoFocus onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Row>
      <Row label="Location" stacked>
        <button class="path-btn" title={location} onClick={chooseLocation}>
          <FolderOpen size={14} />
          <span>{location}</span>
        </button>
      </Row>
      <p class="hint">A new project folder with its own .reccut project file is created. The media files stay where they are. To copy everything into one folder for archiving, use Package Project instead.</p>
    </Modal>
  );
}

/* Pakk prosjektet for arkiv, som Collect Files i After Effects. */

api.onPackageDone?.((r) => {
  if (r.error) {
    if (r.error !== 'Canceled') toast(`Packaging failed: ${r.error}`, { kind: 'error', timeout: 10000 });
    return;
  }
  toast(`Project packaged: ${r.copied} files and folders, ${fmtBytes(r.bytes)}.${r.missing ? ` ${r.missing} missing files are listed in the report.` : ''}`, {
    kind: r.missing ? 'error' : 'success',
    timeout: 12000,
    actions: [
      { label: isMac ? 'Reveal in Finder' : 'Show in Folder', onClick: () => api.reveal(r.file) },
      { label: 'Open Package', onClick: () => saveNow().then(() => openProjectFile(r.file)) },
    ],
  });
});


export function PackageDialog() {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem('packageOpts') || '{}');
    } catch {
      return {};
    }
  })();
  const [opts, setOpts] = useState({ removeUnused: true, removeDisabled: true, removeOffAudio: true, removeHidden: false, includeOptimized: false, ...saved });
  const [name, setName] = useState(`${project.value.name} (Archive)`);
  const [dest, setDest] = useState(localStorage.getItem('packageDest') || '');
  const [sizes, setSizes] = useState(null);
  const close = () => (commands.packageOpen.value = false);
  useEffect(() => {
    if (!dest) api.baseDir().then(setDest);
  }, []);
  const { project: reduced, removed } = reduceProject(project.value, opts);
  const files = mediaFiles(reduced, opts);
  const paths = files.flatMap((f) => (f.dir ? [f.dir] : f.sources.map((s) => s.path)));
  const key = paths.join('|');
  useEffect(() => {
    let alive = true;
    setSizes(null);
    api.packageSizes(paths).then((s) => alive && setSizes(s));
    return () => (alive = false);
  }, [key]);
  const total = sizes ? Object.values(sizes).reduce((a, b) => a + Math.max(0, b), 0) : null;
  const missing = sizes ? Object.entries(sizes).filter(([, v]) => v < 0).map(([k]) => k) : [];
  const set = (patch) => {
    const n = { ...opts, ...patch };
    setOpts(n);
    try {
      localStorage.setItem('packageOpts', JSON.stringify(n));
    } catch {}
  };
  const chooseDest = async () => {
    const d = await api.chooseDir(dest);
    if (d) {
      setDest(d);
      localStorage.setItem('packageDest', d);
    }
  };
  const start = async () => {
    await saveNow();
    await api.packageProject({ project: reduced, files, dest, name: name.trim() || project.value.name, removed });
    close();
    toast('Packaging started. Follow the progress at the top of the window.', { timeout: 4000 });
  };
  const check = (k, label, hint) => (
    <label class="pkg-opt" title={hint}>
      <input type="checkbox" checked={Boolean(opts[k])} onChange={(e) => set({ [k]: e.currentTarget.checked })} />
      <span>
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  );
  return (
    <Modal
      title="Package Project"
      width={560}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!dest || sizes === null} onClick={start}>
            Package
          </Button>
        </>
      }
    >
      <p class="lead">Copies the project file and every file it uses into one folder, so the folder holds everything needed to open the project later, on any computer. Good for archiving and for handing a project over. Your open project is not changed.</p>
      <Row label="Name" stacked>
        <input class="text-input" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </Row>
      <Row label="Save in" stacked>
        <button class="path-btn" title={dest} onClick={chooseDest}>
          <FolderOpen size={14} />
          <span>{dest}</span>
        </button>
      </Row>
      <div class="pkg-opts">
        {check('removeUnused', 'Remove unused media', 'Media in the browser that is not used on the timeline is left out.')}
        {check('removeDisabled', 'Remove disabled clips', 'Clips that are switched off are removed. In the storyline they become gaps, so nothing moves.')}
        {check('removeOffAudio', 'Remove switched off audio', 'Synced audio that is switched off in every clip is left out.')}
        {check('removeHidden', 'Remove clips on hidden tracks', 'Clips on tracks you have hidden are removed.')}
        {check('includeOptimized', 'Include optimized media', 'Larger, but the project is smooth to edit right away. Otherwise it can be optimized again later.')}
      </div>
      <div class="pkg-summary">
        <div>
          <b>{files.length}</b> media, <b>{paths.length}</b> files and folders, <b>{total === null ? '…' : fmtBytes(total)}</b>
        </div>
        <div class="muted">
          Removed: {removed.media.length} unused media, {removed.clips.length} clips, {removed.streams.length} audio tracks
        </div>
        {missing.length > 0 && <div class="warn">{missing.length} file{missing.length > 1 ? 's are' : ' is'} missing and cannot be copied. They are listed in the report.</div>}
      </div>
      <p class="hint">
        The folder gets the project file, a Footage folder, a Recordings folder and a Package Report.txt. Thumbnails, waveforms and proxies are made again automatically when the project is opened.
      </p>
    </Modal>
  );
}

/* Versjonshistorikk: automatiske kopier av prosjektet, som kan hentes tilbake. */

export function HistoryDialog() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const close = () => (commands.historyOpen.value = false);
  const file = projectPath.value;
  const load = () => (file ? api.historyList(file).then(setList) : setList([]));
  useEffect(() => {
    saveNow().then(load);
  }, []);
  const restore = async (it) => {
    if (busy) return;
    setBusy(true);
    try {
      // Først en kopi av slik prosjektet er nå, så ingenting går tapt.
      await saveNow();
      await api.historySnapshot(file, 'before restore');
      const data = await api.historyLoad(it.file, file);
      restoreProject(data);
      close();
      toast(`Restored the version from ${new Date(it.time).toLocaleString()}. Undo (Cmd Z) brings back what you had.`, { kind: 'success', timeout: 8000 });
    } catch (err) {
      toast(`Could not restore: ${err.message}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const groups = new Map();
  for (const it of list || []) {
    const day = new Date(it.time).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    groups.set(day, [...(groups.get(day) || []), it]);
  }
  return (
    <Modal title="Project History" width={520} onClose={close} footer={<Button onClick={close}>Close</Button>}>
      <p class="lead">Reccut keeps a copy of the project every few minutes while you work, and when you close it. Older copies are thinned out, but one per hour, day, week and month is kept, so you can go far back. Restoring can be undone.</p>
      {list === null ? (
        <p class="hint">Loading…</p>
      ) : !list.length ? (
        <p class="hint">No earlier versions yet. The first copy is made a few minutes after you start working.</p>
      ) : (
        <div class="history-list">
          {[...groups].map(([day, items]) => (
            <div key={day}>
              <div class="sub-head">{day}</div>
              {items.map((it) => (
                <div key={it.file} class="history-row">
                  <span>
                    <b>{new Date(it.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</b>
                    {it.reason && <span class="muted"> {it.reason}</span>}
                  </span>
                  <span class="muted">{Math.max(1, Math.round(it.size / 1024))} kB</span>
                  <Button class="small" disabled={busy} onClick={() => restore(it)}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <p class="hint">The copies are in the Auto-Save folder next to the project file.</p>
    </Modal>
  );
}
