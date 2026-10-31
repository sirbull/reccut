// Prosjekter: nytt prosjekt (navn, plassering og format) og listen over prosjekter.
// Vises over alle rommene, siden både opptak og redigering hører til et prosjekt.
import { useEffect, useState } from 'preact/hooks';
import { FilePlus2, FolderOpen, FolderSearch, MoreHorizontal } from 'lucide-preact';
import { PROJECT_TEMPLATES, formatDuration } from '../shared/model.js';
import { defaultProjectName, needsProject, newProjectNamed, openProjectFile, projectPath, saveNow } from './editor/store.js';
import * as commands from './editor/commands.js';
import { Button, IconButton, Modal, Row, toast } from './ui.jsx';

const api = window.api;
const isMac = api.platform === 'darwin';

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
