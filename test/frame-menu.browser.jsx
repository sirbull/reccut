// Exercise the actual App and menu handler, rather than mounting the dialog by hand.
import '../src/renderer/app.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import { setPrefs } from '../src/renderer/prefs.js';
import { fixture } from './frame-export.browser.jsx';

setPrefs({ checkUpdates: false, skimming: false, audioSkimming: false });
const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
window.frameMenuTest = {
  async ready(file) {
    for (let n = 0; n < 50 && !store.needsProject.value; n++) await wait();
    store.needsProject.value = false;
    store.room.value = 'edit';
    store.project.value = fixture(file);
    store.setTime(0.74, { force: true });
    await wait();
  },
  state: () => ({
    open: Boolean(commands.frameExportOpen.value),
    visible: Boolean(document.querySelector('.frame-export-modal')),
    focused: document.hasFocus(),
    active: document.activeElement?.tagName,
    heading: document.querySelector('.modal h2')?.textContent,
    toasts: [...document.querySelectorAll('.toast')].map((el) => el.textContent),
  }),
  close() { commands.frameExportOpen.value = null; commands.exportOpen.value = false; },
  field() {
    const input = document.createElement('input');
    input.id = 'frame-menu-field';
    document.body.append(input);
    input.focus();
  },
  blur() { document.getElementById('frame-menu-field')?.remove(); document.activeElement?.blur(); },
  export() { [...document.querySelectorAll('.frame-export-modal footer button')].find((b) => b.textContent === 'Export Frame…').click(); },
};
