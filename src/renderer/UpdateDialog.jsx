import { useEffect, useRef } from 'preact/hooks';
import { Download, ExternalLink } from 'lucide-preact';
import { Button, Modal, toast } from './ui.jsx';
import { availableUpdate, updateDownload, dismissUpdate, downloadUpdate } from './updates.js';

export function UpdateDialog() {
  const release = availableUpdate.value;
  const download = updateDownload.value?.latest === release?.latest ? updateDownload.value : null;
  const dialog = useRef(null);
  useEffect(() => {
    if (!release) return;
    const previous = document.activeElement;
    const modal = dialog.current?.closest('.modal');
    const focusable = () => [...modal.querySelectorAll('button:not(:disabled), summary, a[href]')];
    (modal.querySelector('.btn.primary') || focusable()[0])?.focus();
    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const next = controls.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1);
      event.preventDefault();
      controls[(next + controls.length) % controls.length]?.focus();
    };
    modal.addEventListener('keydown', trapFocus);
    return () => {
      modal.removeEventListener('keydown', trapFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [release?.latest]);
  if (!release) return null;
  const busy = ['starting', 'downloading'].includes(download?.state);
  const done = download?.state === 'done';
  const close = () => dismissUpdate();
  const github = async () => {
    try { await window.api.openExternal(release.url); }
    catch { toast('Could not open GitHub. Please try again.', { kind: 'error' }); }
  };
  return (
    <Modal title="Reccut Update" width={480} class="update-dialog" onClose={close} footer={<>
      <Button onClick={close}>{busy ? 'Continue in Background' : done ? 'Close' : 'Later'}</Button>
      <Button icon={ExternalLink} onClick={github}>GitHub</Button>
      {release.asset && !done && <Button variant="primary" icon={Download} disabled={busy} onClick={downloadUpdate}>
        {busy ? 'Downloading…' : download?.state === 'error' ? 'Try Again' : 'Download'}
      </Button>}
      {done && <Button variant="primary" onClick={() => window.api.reveal(download.file)}>Show in Folder</Button>}
    </>}>
      <div ref={dialog}>
        <p class="update-heading">Reccut {release.latest} is available</p>
        <p class="hint">You are using version {release.current}.</p>
        {release.notes && <details class="update-notes"><summary>What’s New</summary><pre>{release.notes}</pre></details>}
        <div role="status" aria-live="polite">
          {busy ? <>
            <p>Downloading the installer to your Downloads folder…</p>
            <progress max="1" value={download.progress} aria-label="Download progress" />
            <p class="hint">{Math.round(download.progress * 100)}% · You can keep working while it downloads.</p>
          </> : done ? <p>The installer is ready in Downloads. Quit Reccut and open it to install the new version. Your projects and settings are kept.</p>
            : <p>{release.asset ? 'Download the installer for your computer with one click. Then quit Reccut and open it to install the update.' : 'Visit GitHub to see release notes and available downloads for this version.'}</p>}
          {download?.state === 'error' && <p class="update-error" role="alert">The download failed: {download.error}</p>}
        </div>
        {!busy && !done && <button type="button" class="update-skip" onClick={() => dismissUpdate(true)}>Skip This Version</button>}
      </div>
    </Modal>
  );
}
