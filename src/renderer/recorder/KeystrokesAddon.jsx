// Show keystrokes: an optional add-on that the user downloads after reading what it does.
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Keyboard } from 'lucide-preact';
import { Button, Modal, Row, Segmented, Slider, Toggle, toast } from '../ui.jsx';
import { saveSettings, settings } from './settings.js';
import * as engine from './engine.js';

const api = window.api;
const isMac = api.platform === 'darwin';
const recordingNow = () => engine.recording.value || engine.countdown.value > 0 || engine.finishing.value;

// One warning for the whole app, so the Overlays row and the plugin list open the same dialog.
export const keystrokesConsent = signal(false);
const keyboardConsent = signal(null);
export function KeystrokesConsent() {
  if (keyboardConsent.value) return <KeyboardConsentDialog mode={keyboardConsent.value} onClose={() => (keyboardConsent.value = null)} />;
  if (!keystrokesConsent.value) return null;
  return <ConsentDialog onClose={() => (keystrokesConsent.value = false)} onInstalled={() => {
    saveSettings({ showKeys: true });
    toast('The Keystroke Add-on is installed. Show keystrokes is on under Overlays in Record.', { kind: 'success' });
  }} />;
}
// True when the plugin list should go straight to the warning. While recording, the add-on's
// window opens instead, with the download button disabled.
export async function keystrokesNeedsDownload() {
  const s = await engine.refreshKeystrokes();
  return s.supported && (!s.installed || s.damaged) && !recordingNow();
}

export const ADDON_FACTS = [
  'The add-on reads the keyboard for the whole computer while you record, also in other apps. It uses the same system feature as keyloggers, so security software may warn about it.',
  `Unless you choose more, only shortcuts leave the add-on: keys pressed with ${isMac ? 'Cmd or Ctrl' : 'Ctrl, Alt or Win'}, plus Esc and the F keys. Normal typing${isMac ? ', Option characters' : ', AltGr characters'} and Shift combinations are dropped inside the add-on and never reach Reccut. The left keyboard half, the whole keyboard and mouse buttons are off until you turn them on.`,
  'The shortcuts are saved in the recording, so you can show, hide or cut them in Edit. Delete the recording to delete them.',
  'It runs only while you record with Show keystrokes on, and stops when the recording stops. A Keys label in the recording controls shows when it is active.',
  'It is a separate file from the Reccut release on GitHub, checked with a checksum before every start. It does not write files or use the network. You can remove it at any time.',
];

function ConsentDialog({ onClose, onInstalled }) {
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

// Letters leave the add-on in these modes, so each has its own warning.
function KeyboardConsentDialog({ mode, onClose }) {
  const full = mode === 'full';
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const accept = async () => {
    try {
      engine.keystrokes.value = await api.allowKeyboard({ consent: true, mode });
      saveSettings({ inputKeyboard: mode });
      onClose();
    } catch (err) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };
  return (
    <Modal title={full ? 'Whole keyboard' : 'Left keyboard half'} width={520} onClose={onClose} class="keys-consent" footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!agreed} onClick={accept}>Turn On</Button>
    </>}>
      {full
        ? <>
          <p>This records nearly everything you type while recording. The add-on then works like a keylogger for as long as you record.</p>
          <ul class="keys-facts">
            <li>While you record, every press and release of the letters, digits, symbols, F keys, arrows, Esc, Enter, Tab, Space, Backspace, Delete and modifier keys reaches Reccut, in every app.</li>
            <li>The presses are saved with their times in the recording. Messages, addresses and passwords you type can be read back from that file, by anyone who gets the file.{isMac ? ' macOS stops the add-on in password fields.' : ' Nothing stops this in password fields.'}</li>
            <li>With Keys as you press them on, what you type is also shown in the video.</li>
            <li>The numeric keypad and keys such as Home and End do not leave the add-on, unless they are part of a shortcut.</li>
            <li>Turn this off before you record anything private. Delete the recording to delete the presses.</li>
          </ul>
        </>
        : <>
          <p>This is meant for games. It changes what the add-on lets through.</p>
          <ul class="keys-facts">
            <li>While you record, every press and release of these keys reaches Reccut, in every app: 1 to 5, Q W E R T, A S D F G, Z X C V B, Tab, Space, Shift, Ctrl, Alt and {isMac ? 'Cmd' : 'Win'}.</li>
            <li>The presses are saved with their times in the recording. Anything you type with these keys while recording, including passwords, can be partly read back from that file.{isMac ? ' macOS stops the add-on in password fields.' : ''}</li>
            <li>Keys on the right half never leave the add-on, unless they are part of a shortcut.</li>
            <li>Turn this off before you record normal work. Delete the recording to delete the presses.</li>
          </ul>
        </>}
      <label class="keys-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.currentTarget.checked)} />
        {full ? 'I understand that what I type while recording is saved in the recording, also passwords.' : 'I understand that keys from the left half are saved in the recording, also when I type.'}
      </label>
      {error && <p class="warn">{error}</p>}
    </Modal>
  );
}

// What the add-on reads, and how it is shown.
function InputOptions({ status, recording }) {
  const s = settings.value;
  const set = (key) => (v) => saveSettings({ [key]: v });
  const anySource = s.inputKeyboard !== 'off' || s.inputMouse || s.inputPad;
  const keyboardLocked = recording || status.outdated;
  const chooseKeyboard = (mode) => {
    if (keyboardLocked) return;
    if (mode === 'off' || status[mode === 'full' ? 'full' : 'game']) saveSettings({ inputKeyboard: mode });
    else keyboardConsent.value = mode;
  };
  return (
    <>
      <Row label="Shortcuts"><Toggle checked={s.inputShortcuts} disabled={recording} onChange={set('inputShortcuts')} /></Row>
      <Row label="Keyboard">
        <Segmented value={s.inputKeyboard} disabled={keyboardLocked} onChange={chooseKeyboard} options={[{ value: 'off', label: 'Off' }, { value: 'half', label: 'Left half' }, { value: 'full', label: 'Whole' }]} />
      </Row>
      {s.inputKeyboard === 'full' && <p class="hint warn">Whole keyboard is on. What you type while recording is saved in the recording, also in other apps.</p>}
      <Row label="Mouse buttons"><Toggle checked={s.inputMouse} disabled={recording || status.outdated} onChange={set('inputMouse')} /></Row>
      <Row label="Controller"><Toggle checked={s.inputPad} disabled={recording} onChange={set('inputPad')} /></Row>
      {s.inputPad && <p class="hint">{engine.padName.value || 'No controller found. Connect one and press a button on it.'}</p>}
      {status.outdated && <p class="hint warn">Update the add-on to use the keyboard modes and mouse buttons.</p>}
      <Row label="Keys as you press them"><Toggle checked={s.inputPills} onChange={set('inputPills')} /></Row>
      <Row label="Live overlay"><Toggle checked={s.inputOverlay} disabled={!anySource} onChange={set('inputOverlay')} /></Row>
      {s.inputOverlay && anySource && <>
        <Row label="Overlay X"><Slider value={s.inputX} min={0} max={1} onInput={set('inputX')} /></Row>
        <Row label="Overlay Y"><Slider value={s.inputY} min={0} max={1} onInput={set('inputY')} /></Row>
      </>}
    </>
  );
}

export function KeystrokesRows() {
  const s = settings.value;
  const status = engine.keystrokes.value;
  const [busy, setBusy] = useState(false);
  const recording = recordingNow();

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
      saveSettings({ showKeys: false, inputKeyboard: 'off', inputMouse: false, inputPad: false, inputOverlay: false });
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
          : <Button class="small" disabled={recording || busy} onClick={() => (keystrokesConsent.value = true)}>{status.damaged ? 'Reinstall Add-on…' : 'Get Add-on…'}</Button>}
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
      {ready && s.showKeys && <InputOptions status={status} recording={recording} />}
      <p class="hint">
        {ready
          ? <>The Keystroke Add-on reads the keyboard only while you record, and saves shortcuts with {isMac ? 'Cmd or Ctrl' : 'Ctrl, Alt or Win'} in the recording. {s.showKeys && s.inputKeyboard !== 'off' ? 'Keyboard is on, so those keys are saved too, also when you type. ' : 'Normal typing never leaves the add-on. '}Reccut's own shortcuts are never shown. {status.outdated && 'A newer add-on comes with this version of Reccut. '}</>
          : <>Keystrokes need an optional add-on that reads the keyboard while you record. Reccut does not include it, so the app itself never reads your keyboard. </>}
        {status.installed && <button type="button" class="link-btn" disabled={recording || busy} onClick={remove}>Remove add-on</button>}
        {ready && status.outdated && <> <button type="button" class="link-btn" disabled={recording || busy} onClick={() => (keystrokesConsent.value = true)}>Update add-on</button></>}
      </p>
    </>
  );
}
