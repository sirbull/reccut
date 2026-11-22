import { useEffect, useState } from 'preact/hooks';
import { Monitor } from 'lucide-preact';
import { Button, Modal, Select } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { needsProject } from './store.js';
import { previewDisplays, previewDisplayDialog, setPreviewDisplay } from './externalPreview.js';

const offered = new Set();
export function PreviewDisplayControl() {
  const state = previewDisplays.value;
  return (
    <label class="preview-display-control" title="Choose a separate screen for preview. Connect an extended display to use this feature.">
      <Monitor size={14} />
      <select class="select" aria-label="Preview screen" value={state.active?.id ?? ''}
        onChange={(event) => { setPreviewDisplay(event.currentTarget.value); event.currentTarget.blur(); }}>
        <option value="">Preview: Editor</option>
        {state.displays.map((display) => <option key={display.id} value={display.id}>Preview: {display.label}</option>)}
      </select>
      {state.active && <button class="fmt-btn" aria-pressed={prefs.value.externalPreviewShowLocal}
        onClick={() => setPrefs({ externalPreviewShowLocal: !prefs.value.externalPreviewShowLocal })}>
        {prefs.value.externalPreviewShowLocal ? 'Hide Preview Here' : 'Show Preview Here'}
      </button>}
    </label>
  );
}

export function PreviewDisplayOffer({ active }) {
  const state = previewDisplays.value;
  const [picked, setPicked] = useState('');
  const [dontAsk, setDontAsk] = useState(false);
  const ids = state.displays.map((display) => display.id).join(',');
  const connected = (state.connectedDisplayIds || []).join(',');
  const waitingForProject = needsProject.value;
  useEffect(() => {
    for (const id of offered) if (!state.connectedDisplayIds?.includes(id)) offered.delete(id);
    if (!active || waitingForProject || state.active || !prefs.value.askExternalPreview || !state.displays.some((d) => !offered.has(d.id))) return;
    // Wait for project setup and other dialogs to finish before offering a layout.
    const ask = () => {
      if (document.querySelector('[role="dialog"]')) return;
      state.displays.forEach((d) => offered.add(d.id));
      setPicked(String(state.displays[0].id));
      setDontAsk(false);
      previewDisplayDialog.value = true;
      clearInterval(timer);
    };
    const timer = setInterval(ask, 1000);
    ask();
    return () => clearInterval(timer);
  }, [active, waitingForProject, ids, connected, state.active?.id, prefs.value.askExternalPreview]);
  const selected = state.displays.find((d) => String(d.id) === picked) || state.displays[0];
  const close = () => {
    if (dontAsk) setPrefs({ askExternalPreview: false });
    previewDisplayDialog.value = false;
  };
  if (!active || !previewDisplayDialog.value || !selected || state.active) return null;
  return (
    <Modal title="Use a Separate Screen for Preview?" width={520} onClose={close} footer={<>
      <Button onClick={close}>Not Now</Button>
      <Button variant="primary" onClick={() => { close(); setPreviewDisplay(String(selected.id)); }}>Use This Screen</Button>
    </>}>
      <p>Another display is connected. Show a large, clean preview there and keep your timeline, media and properties on this screen.</p>
      <Select value={String(selected.id)} onChange={setPicked} options={state.displays.map((d) => ({ value: String(d.id), label: `${d.label} · ${d.width} × ${d.height}` }))} />
      <p class="hint">You can change screens or return preview to the editor at any time using the Preview screen menu above the preview. Use Show Preview Here when you want to edit directly in the picture.</p>
      <label class="effect-remove-preference"><input type="checkbox" checked={dontAsk} onChange={(event) => setDontAsk(event.currentTarget.checked)} /> Don’t ask automatically</label>
    </Modal>
  );
}
