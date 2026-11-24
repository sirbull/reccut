// macOS can take a shortcut before Reccut sees it, such as Control Space for switching keyboard language when the
// user has several. Reccut reads which shortcuts macOS uses (src/main/systemShortcuts.js), and if one of its
// commands uses such a key, asks once which shortcut to use instead. Settings › Keyboard marks those keys too.
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Button, Modal, toast } from './ui.jsx';
import { COMMANDS, defaultKeys, formatAccel, isMac, keysFor, sameAccel, setShortcut } from './registry.js';
import { prefs, setPrefs } from './prefs.js';
import * as commands from './editor/commands.js';

export const systemReserved = signal([]); // [{ accel, what }]
const open = signal(false);

export const reservedFor = (accel) => systemReserved.value.find((r) => sameAccel(accel, r.accel)) || null;

// Commands with a key macOS takes, and the other keys they still have.
export function blockedCommands() {
  const out = [];
  for (const c of COMMANDS) {
    if (c.hidden) continue;
    const keys = keysFor(c);
    const taken = keys.filter((k) => reservedFor(k));
    if (!taken.length) continue;
    const free = [...keys, ...defaultKeys(c)].find((k) => !reservedFor(k));
    out.push({ cmd: c, taken, free, what: reservedFor(taken[0]).what });
  }
  return out;
}
const signature = (list) => list.map((b) => `${b.cmd.id}:${b.taken.join('/')}`).join(',');

export async function checkSystemShortcuts() {
  if (!isMac) return;
  systemReserved.value = (await window.api.systemReservedShortcuts?.().catch(() => [])) || [];
  const list = blockedCommands();
  // Ask again only when something new is blocked.
  if (list.length && prefs.value.systemShortcutsAsked !== signature(list)) open.value = true;
}

export function openKeyboardSettings(query = '') {
  localStorage.setItem('settingsPane', 'keyboard');
  localStorage.setItem('keyboardQuery', query);
  commands.prefsOpen.value = false;
  requestAnimationFrame(() => (commands.prefsOpen.value = true));
}

export function SystemShortcutsDialog() {
  useEffect(() => {
    // Check again when the user comes back, for example after changing it in System Settings.
    const again = () => document.visibilityState === 'visible' && checkSystemShortcuts();
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, []);
  if (!open.value) return null;
  const list = blockedCommands();
  if (!list.length) return null;
  const done = () => {
    setPrefs({ systemShortcutsAsked: signature(blockedCommands()) });
    open.value = false;
  };
  return (
    <Modal
      title="A shortcut is used by macOS"
      width={520}
      onClose={done}
      footer={
        <>
          <Button onClick={() => window.api.openSystemShortcutSettings().catch(() => {})}>Open macOS Keyboard Settings</Button>
          <Button variant="primary" onClick={done}>
            Done
          </Button>
        </>
      }
    >
      <p>
        macOS uses these keys itself, so they never reach Reccut. Choose another shortcut here, or turn the macOS
        shortcut off in System Settings › Keyboard › Keyboard Shortcuts.
      </p>
      {list.map(({ cmd, taken, free, what }) => (
        <div class="kb-conflict" key={cmd.id}>
          <div>
            <b>{cmd.label}</b>: {taken.map(formatAccel).join(', ')} is used by macOS to {what.charAt(0).toLowerCase() + what.slice(1)}.
          </div>
          <span class="actions">
            {free && (
              <Button
                variant="primary"
                class="small"
                onClick={() => {
                  setShortcut(cmd.id, free);
                  toast(`${cmd.label} now uses ${formatAccel(free)}.`, { kind: 'success' });
                  if (!blockedCommands().length) open.value = false;
                }}
              >
                Use {formatAccel(free)}
              </Button>
            )}
            <Button
              class="small"
              onClick={() => {
                done();
                openKeyboardSettings(cmd.label);
              }}
            >
              Choose a shortcut…
            </Button>
          </span>
        </div>
      ))}
    </Modal>
  );
}
