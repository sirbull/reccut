import { useState } from 'preact/hooks';
import { FolderOpen } from 'lucide-preact';
import { moveProject, projectPath } from './store.js';
import { Modal, Row, toast } from '../ui.jsx';

export function ProjectLocation({ onMoved }) {
  const [busy, setBusy] = useState(false);
  const folder = projectPath.value?.replace(/[\\/][^\\/]+$/, '');
  if (!folder) return null;
  const choose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const location = await window.api.chooseDir(folder.replace(/[\\/][^\\/]+$/, ''));
      if (!location) return;
      const result = await moveProject(location);
      onMoved?.();
      toast(result.warning || 'Project moved and reopened in its new location.', { kind: result.warning ? 'error' : 'success' });
    } catch (err) {
      const message = err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      toast(`Could not move the project: ${message}`, { kind: 'error', timeout: 10000 });
    } finally {
      setBusy(false);
    }
  };
  return <>
    <Row label="Project location" stacked>
      <button class="path-btn project-location" title={`Move project from ${folder}`} aria-label="Change project location" disabled={busy} onClick={choose}>
        <FolderOpen size={14} />
        <span>{folder}</span>
      </button>
    </Row>
    <p class="hint">Choose a new parent folder to move this project. Reccut saves your work first, moves the project folder and reopens it automatically. Media linked from outside the project folder stays in place.</p>
    {busy && <Modal title="Moving Project" width={440}>
      <p role="status" tabIndex={-1} ref={(el) => el?.focus()}>Saving your work and moving the project. The project will reopen in its new location when the move is complete.</p>
    </Modal>}
  </>;
}
