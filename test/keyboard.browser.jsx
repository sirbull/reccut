// The real application, with controls exposed only to the isolated keyboard check.
import '../src/renderer/app.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import { settings, saveSettings } from '../src/renderer/recorder/settings.js';
import { setPrefs } from '../src/renderer/prefs.js';

setPrefs({ checkUpdates: false, skimming: false, audioSkimming: false });
window.addEventListener('unhandledrejection', (event) => console.error('Keyboard check rejection:', event.reason?.name, event.reason?.message, event.reason?.stack));
const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
window.keyboardTest = {
  async ready() {
    for (let n = 0; n < 50 && !store.needsProject.value; n++) await wait();
    store.needsProject.value = false;
    store.room.value = 'edit';
    await wait();
  },
  state: () => ({ room: store.room.value, tool: store.tool.value, layout: settings.value.layout, modifier: settings.value.modifier, playing: store.playing.value }),
  edit: () => { store.room.value = 'edit'; store.tool.value = 'select'; },
  record: () => { store.room.value = 'record'; },
  background: (on) => saveSettings({ backgroundShortcuts: on }),
  settings: (on) => { commands.prefsOpen.value = on; },
  field(tag = 'textarea', type = '') {
    this.clear();
    const input = document.createElement(tag);
    input.id = 'keyboard-test-field';
    if (type) input.type = type;
    if (tag === 'div') input.contentEditable = 'true';
    document.body.append(input); input.focus();
  },
  dialog() {
    this.clear();
    const dialog = document.createElement('div');
    dialog.id = 'keyboard-test-field'; dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button'); button.textContent = 'Dialog action';
    dialog.append(button); document.body.append(dialog); button.focus();
  },
  clear() { document.getElementById('keyboard-test-field')?.remove(); document.activeElement?.blur(); },
};
