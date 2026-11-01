// Photography controls for the actual App, bundled only by capture-help.cjs.
// These are normal project/selection/layout changes, never a reconstructed editor UI.
import '../src/renderer/app.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import * as playback from '../src/renderer/editor/playback.js';
import * as exportState from '../src/renderer/export/state.js';
import * as engine from '../src/renderer/recorder/engine.js';
import { settings, saveSettings } from '../src/renderer/recorder/settings.js';
import { prefs, setPrefs } from '../src/renderer/prefs.js';
import { helpOpen, paletteOpen } from '../src/renderer/registry.js';
import { aiChatOpen } from '../src/renderer/Extensions.jsx';
import { layerImport } from '../src/renderer/editor/layers.js';
import { CAPTION_LANE, makeClip } from '../src/shared/model.js';
import { presetEffects } from '../src/shared/audiofx.js';
import { toasts } from '../src/renderer/ui.jsx';

setPrefs({ checkUpdates: false, viewerQuality: 'quality', skimming: false, audioSkimming: false });
const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
let baseline, folders;

async function ready() {
  await document.fonts.ready;
  await wait(350);
  for (let i = 0; i < 40; i++) {
    const canvas = playback.snapshot();
    if (store.room.value !== 'edit' || canvas?.width) return true;
    await wait(100);
  }
  throw new Error('The nature preview did not finish drawing.');
}

async function init(file) {
  for (let i = 0; i < 80 && store.project.value.id !== 'reccut-nature-help-demo'; i++) await wait(100);
  if (store.project.value.id !== 'reccut-nature-help-demo') throw new Error('The nature project did not open.');
  baseline = JSON.parse(await window.api.readText(file));
  folders = await window.api.projectFolders(file);
  await reset();
  const divider = document.querySelector('.divider');
  const bounds = document.querySelector('.editor').getBoundingClientRect();
  divider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: bounds.top + bounds.height * 0.56 }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientY: bounds.top + bounds.height * 0.56 }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientY: bounds.top + bounds.height * 0.56 }));
  await ready();
}

async function reset() {
  playback.pause();
  for (const signal of [commands.exportOpen, commands.prefsOpen, commands.newProjectOpen, commands.projectsOpen, commands.packageOpen, commands.historyOpen]) signal.value = false;
  commands.importOptions.value = null; layerImport.value = null;
  aiChatOpen.value = false; paletteOpen.value = false;
  commands.browserFocus.value = false; commands.browserPicked.value = []; commands.browserSelection.value = null;
  commands.browserTab.value = 'media'; commands.inspectorTab.value = 'video';
  store.tasks.value = []; store.selectedComponent.value = null; store.selectedTransition.value = null;
  const p = structuredClone(baseline);
  p.tracks = { video: 1, audio: 1 };
  p.lanes = { 0: { h: 78 }, 1: { h: 38 }, '-1': { h: 55 } };
  // No path: screenshot variations can never autosave over the real demo project.
  store.setProject(p);
  store.projectFolders.value = folders; store.needsProject.value = false;
  store.room.value = 'edit'; store.pps.value = 29; store.tool.value = 'select';
  setPrefs({ editorBrowserVisible: true, editorInspectorVisible: true, videoScopesVisible: false });
  store.selection.value = ['shot-mountain-lake'];
  playback.seek(3);
  await ready();
}

async function shot(name) {
  await reset();
  if (name === 'titles') commands.browserTab.value = 'titles';
  if (name === 'browser') { store.selection.value = []; setPrefs({ editorInspectorVisible: false }); }
  if (name === 'video') {
    store.commit((p) => { p.clips['shot-mountain-lake'].props.cropL = 0.035; p.clips['shot-mountain-lake'].props.cropR = 0.035; });
  }
  if (name === 'color') {
    store.selection.value = ['shot-falling-water']; commands.inspectorTab.value = 'color'; playback.seek(14.5);
    store.commit((p) => Object.assign(p.clips['shot-falling-water'].props, { exposure: 0.08, contrast: 0.06, saturation: 0.08, temperature: 0.04 }));
  }
  if (name === 'info') commands.inspectorTab.value = 'info';
  if (name === 'speed') {
    store.selection.value = ['shot-forest-light']; commands.inspectorTab.value = 'speed'; playback.seek(8);
    commands.setSpeedSelected(0.5);
  }
  if (name === 'audio') {
    store.selection.value = ['source-audio']; commands.inspectorTab.value = 'audio';
    store.commit((p) => { p.clips['source-audio'].props.afx = presetEffects('voice-cleanup'); });
  }
  if (name === 'lowerthird') { store.selection.value = ['location-title']; commands.inspectorTab.value = 'text'; playback.seek(14.5); }
  if (name === 'colors') {
    ['blue', 'green', 'purple', 'blue', 'orange', 'pink', 'green'].forEach((color, i) => commands.setClipColor(color, [baseline.primary[i]]));
  }
  if (name === 'palette') {
    paletteOpen.value = true; await wait(800);
    const input = document.querySelector('.palette-input input');
    if (!input) throw new Error(`Quick Search did not open (signal ${paletteOpen.value}, root ${!!document.querySelector('.app')}).`);
    input.value = 'color'; input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (name === 'quickexport') commands.exportOpen.value = true;
  if (name === 'exportroom') { exportState.applyPreset('web'); exportState.selectedId.value = exportState.PROJECT_SOURCE; store.room.value = 'export'; }
  if (name === 'settings' || name === 'keyboard' || name === 'ai-settings' || name === 'plugins') {
    if (name === 'ai-settings') await window.api.aiSave({ provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: 'example-tool-capable-model', vision: true });
    localStorage.setItem('settingsPane', { settings: 'general', keyboard: 'keyboard', 'ai-settings': 'extensions', plugins: 'plugins' }[name]);
    commands.prefsOpen.value = true;
  }
  if (name === 'newproject') {
    localStorage.setItem('projectLocation', '/Users/Shared/Reccut Projects');
    commands.newProjectOpen.value = true; await wait();
    const input = document.querySelector('.modal input.text-input');
    if (input) { input.value = 'Into the Wild'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  if (name === 'import') {
    localStorage.setItem('importDir', folders.media);
    commands.importOptions.value = { paths: Object.values(baseline.media).slice(0, 4).map((m) => m.path) };
    for (let i = 0; i < 50; i++) {
      await wait(150);
      if (document.querySelectorAll('.ib-tile:not(.folder) .ib-thumb img').length >= 7) break;
    }
    const lake = [...document.querySelectorAll('.ib-tile')].find((el) => el.textContent.includes('Mountain lake'));
    if (!lake) throw new Error('The import screenshot must show the nature footage.');
    lake.click(); await wait(300);
    const preview = document.querySelector('.ib-preview video');
    if (preview) { preview.pause(); preview.currentTime = 3; }
  }
  if (name === 'layers') await store.importPaths([`${folders.root}/Assets/Into the Wild Title.svg`]);
  if (name === 'offline') {
    store.commit((p) => { p.media['forest-light'].offline = true; });
    store.selection.value = ['shot-forest-light']; playback.seek(8);
  }
  if (name === 'ai-setup' || name === 'ai-chat') {
    if (name === 'ai-chat') await window.api.aiSave({ provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: 'example-tool-capable-model', vision: true });
    aiChatOpen.value = true;
    if (name === 'ai-chat') {
      await wait(350);
      [...document.querySelectorAll('.agent-help-button')][0]?.click();
    }
  }
  if (name === 'record') {
    store.room.value = 'record';
    engine.notice.value = null;
    // Demonstration source only; no display, microphone or personal camera is captured.
    engine.screens.value = [{ id: 'nature-preview', kind: 'screen', name: 'Nature preview', width: 1920, height: 1080 }];
    saveSettings({ screenId: 'nature-preview', cameraId: '', micId: '', layout: 2, hideFromCapture: false, showPipOnScreen: false });
    const screen = document.body.querySelector('video');
    screen.srcObject = null; screen.src = `media://file/${encodeURIComponent(baseline.media['mountain-lake'].path)}`;
    screen.loop = true; screen.muted = true; await screen.play();
  }
  if (name === 'busy') {
    store.selection.value = ['shot-forest-light']; playback.seek(8);
    commands.stabilizeSelected(true);
  }
  await ready();
  if (name === 'color') {
    const body = document.querySelector('.inspector .insp-body');
    if (body) body.scrollTop = body.scrollHeight;
  }
  if (name === 'video') {
    [...document.querySelectorAll('.inspector .section h3')].find((h) => h.textContent === 'Crop')?.scrollIntoView({ block: 'center' });
  }
  await wait();
}

async function stabilizationReady() {
  for (let i = 0; i < 500; i++) {
    const m = store.project.value.media['forest-light'];
    if (m.streams.main.motion && !store.tasks.value.some((t) => t.kind === 'stabilize' && ['queued','running'].includes(t.state))) {
      document.querySelector('[data-section="stabilize"]')?.scrollIntoView({ block: 'start' });
      await ready(); return;
    }
    await wait(100);
  }
  throw new Error('Stabilization analysis did not complete for the nature example.');
}

function cleanFocus() { document.activeElement?.blur(); toasts.value = []; engine.notice.value = null; }
window.helpPhotography = { init, reset, shot, ready, stabilizationReady, cleanFocus, openHelp: () => { helpOpen.value = { article: 'welcome' }; } };
