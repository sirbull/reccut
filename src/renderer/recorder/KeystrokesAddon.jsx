// Show keystrokes: an optional add-on that the user downloads after reading what it does.
import { useEffect, useState } from 'preact/hooks';
import { Keyboard } from 'lucide-preact';
import { Button, Modal, Row, Toggle } from '../ui.jsx';
import { saveSettings, settings } from './settings.js';
import * as engine from './engine.js';

const api = window.api;
const isMac = api.platform === 'darwin';

export const ADDON_FACTS = [
  'The add-on reads the keyboard for the whole computer while you record, also in other apps. It uses the same system feature as keyloggers, so security software may warn about it.',
  `Only shortcuts leave the add-on: keys pressed with ${isMac ? 'Cmd or Ctrl' : 'Ctrl, Alt or Win'}, plus Esc and the F keys. Normal typing${isMac ? ', Option characters' : ', AltGr characters'} and Shift combinations are dropped inside the add-on and never reach Reccut.`,
  'The shortcuts are saved in the recording, so you can show, hide or cut them in Edit. Delete the recording to delete them.',
  'It runs only while you record with Show keystrokes on, and stops when the recording stops. A Keys label in the recording controls shows when it is active.',
  'It is a separate file from the Reccut release on GitHub, checked with a checksum before every start. It does not write files or use the network. You can remove it at any time.',
];

export function ConsentDialog({ onClose, onInstalled }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const install = async () => {
    setBusy(true);
    setError('');
    try {
      const status = await api.installKeystrokes({ consent: true });
      engine.keystrokes.value = status;
      onInstalled?.(status);
      onClose();
    } catch (err) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Keystroke Add-on" width={520} onClose={busy ? undefined : onClose} class="keys-consent" footer={<>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" disabled={!agreed || busy} onClick={install}>{busy ? 'Downloading…' : 'Download and Install'}</Button>
    </>}>
      <p>Show keystrokes needs a small add-on that is not part of Reccut. Read what it does before you install it.</p>
      <ul class="keys-facts">
        {ADDON_FACTS.map((f) => <li key={f}>{f}</li>)}
      </ul>
      {isMac && <p class="hint">macOS asks you to allow Input Monitoring for Reccut the first time.</p>}
      {api.platform === 'linux' && <p class="hint">Works in X11 sessions. Wayland does not allow apps to read the keyboard.</p>}
      <label class="keys-agree">
        <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.currentTarget.checked)} />
        I understand that the add-on reads my keyboard while I record and that shortcuts are saved in the recording.
      </label>
      {error && <p class="warn">{error}</p>}
    </Modal>
  );
}

export function KeystrokesRows() {
  const s = settings.value;
  const status = engine.keystrokes.value;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const recording = engine.recording.value || engine.countdown.value > 0 || engine.finishing.value;

  useEffect(() => {
    engine.refreshKeystrokes();
  }, []);

  if (!status) return null;
  const label = <><Keyboard size={14} /> Show keystrokes</>;
  if (!status.supported) {
    return <Row label={label}><span class="hint">Not available on this computer</span></Row>;
  }

  const ready = status.installed && !status.damaged;
  const remove = async () => {
    if (!confirm('Remove the Keystroke Add-on? Keystrokes already saved in recordings are kept until you delete those recordings.')) return;
    setBusy(true);
    try {
      engine.keystrokes.value = await api.removeKeystrokes();
      saveSettings({ showKeys: false });
    } finally {
      setBusy(false);
    }
  };
  const allow = async () => {
    setBusy(true);
    try {
      engine.keystrokes.value = await api.requestKeystrokes();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Row label={label}>
        {ready
          ? <Toggle checked={Boolean(s.showKeys)} disabled={recording} onChange={(v) => saveSettings({ showKeys: v })} />
          : <Button class="small" disabled={recording || busy} onClick={() => setConsent(true)}>{status.damaged ? 'Reinstall Add-on…' : 'Get Add-on…'}</Button>}
      </Row>
      {status.damaged && <p class="hint warn">The Keystroke Add-on was changed after it was installed, so Reccut will not start it. Reinstall or remove it.</p>}
      {ready && s.showKeys && status.permission === 'denied' && (
        <div class="callout">
          <p>macOS must allow Input Monitoring for Reccut before keystrokes can be shown.</p>
          <Button class="small" disabled={busy} onClick={allow}>Allow Input Monitoring</Button>
        </div>
      )}
      {ready && s.showKeys && status.permission === 'unavailable' && (
        <p class="hint warn">{api.platform === 'linux' ? 'The add-on cannot read the keyboard in this session. It needs X11.' : 'The add-on cannot read the keyboard on this computer.'}</p>
      )}
      <p class="hint">
        {ready
          ? <>The Keystroke Add-on reads the keyboard only while you record, and saves shortcuts with {isMac ? 'Cmd or Ctrl' : 'Ctrl, Alt or Win'} in the recording. Normal typing never leaves the add-on. Reccut's own shortcuts are never shown. {status.outdated && 'A newer add-on comes with this version of Reccut. '}</>
          : <>Keystrokes need an optional add-on that reads the keyboard while you record. Reccut does not include it, so the app itself never reads your keyboard. </>}
        {status.installed && <button type="button" class="link-btn" disabled={recording || busy} onClick={remove}>Remove add-on</button>}
        {ready && status.outdated && <> <button type="button" class="link-btn" disabled={recording || busy} onClick={() => setConsent(true)}>Update add-on</button></>}
      </p>
      {consent && <ConsentDialog onClose={() => setConsent(false)} onInstalled={() => saveSettings({ showKeys: true })} />}
    </>
  );
}
