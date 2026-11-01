// Real app and preload, exercised with native disk-backed Files by verify-file-drop.cjs.
import '../src/renderer/app.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import { prefs, setPrefs } from '../src/renderer/prefs.js';

setPrefs({ checkUpdates: false, skimming: false, audioSkimming: false, importAnalyzeStab: false });
const wait = () => new Promise((resolve) => setTimeout(resolve, 50));
window.fileDropTest = {
  async ready() {
    for (let n = 0; n < 100 && !store.needsProject.value; n++) await wait();
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.id = 'native-drop-files'; input.hidden = true;
    document.body.append(input);
  },
  async create(location) {
    await store.newProjectNamed('Drop test', null, location);
    for (let n = 0; n < 100 && !store.projectFolders.value; n++) await wait();
  },
  prepare() {
    store.room.value = 'record';
    commands.browserTab.value = 'effects';
    setPrefs({ editorBrowserVisible: false });
  },
  send(selector, type = 'drop', internal = false) {
    const dt = new DataTransfer();
    if (internal) dt.setData('application/x-reccut', JSON.stringify({ kind: 'media', id: 'none' }));
    else for (const file of document.getElementById('native-drop-files').files) dt.items.add(file);
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Missing drop target: ${selector}`);
    const rect = el.getBoundingClientRect();
    const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rect.left + 20, clientY: rect.top + 20 });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  },
  click(label) {
    const button = [...document.querySelectorAll('.import-modal button')].find((b) => b.textContent.trim() === label);
    if (!button) throw new Error(`Missing import button: ${label}`);
    button.click();
  },
  optimize() {
    const row = [...document.querySelectorAll('.import-modal .row')].find((r) => r.textContent.includes('Create optimized media'));
    row.querySelector('[role="switch"]').click();
  },
  state: () => ({
    room: store.room.value, browser: commands.browserTab.value, visible: prefs.value.editorBrowserVisible,
    request: commands.importOptions.value, media: Object.values(store.project.value.media),
    clips: Object.keys(store.project.value.clips), folders: store.projectFolders.value,
    modal: Boolean(document.querySelector('.import-modal')), hover: Boolean(document.querySelector('.file-drop-hint')),
  }),
};
