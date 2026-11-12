import { useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X } from 'lucide-preact';
import { Button, IconButton, Modal } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { endTransient } from './store.js';

// Shared by source, clip and audio effects. The preference belongs to the app, not the project.
export function RemoveEffectButton({ label, adjusted, onRemove }) {
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState(false);
  const trigger = useRef(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return <>
    <IconButton icon={X} size={13} class="effect-remove" title="Remove effect"
      onClick={(event) => {
        endTransient(true);
        trigger.current = event.currentTarget;
        if (adjusted && prefs.value.confirmEffectRemoval) {
          setSkip(false);
          setOpen(true);
        } else onRemove();
      }} />
    {open && createPortal(
      <Modal title={`Remove ${label}?`} width={420} onClose={close} footer={<>
        <Button onClick={close} autoFocus>Cancel</Button>
        <Button variant="primary" onClick={() => {
          if (skip) setPrefs({ confirmEffectRemoval: false });
          setOpen(false);
          onRemove();
        }}>Remove effect</Button>
      </>}>
        <p>Your adjustments to this effect will be lost. You can restore the effect and its settings with Undo.</p>
        <label class="effect-remove-preference"><input type="checkbox" checked={skip}
          onChange={(event) => setSkip(event.currentTarget.checked)} /> Don’t show this again</label>
      </Modal>, trigger.current?.closest('.vo-booth') || document.body, // Voice Over Studio ligger over body (z-index 900), så dialogen må inn i den.
    )}
  </>;
}
