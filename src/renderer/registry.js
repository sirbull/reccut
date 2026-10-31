// Alle kommandoer i appen på ett sted: navn, menyplassering, hurtigtast og hva de gjør.
// Menylinjen, tastaturet, kommandosøket (Cmd K) og listen over hurtigtaster bygges fra denne listen,
// så en snarvei står alltid likt i menyen, i søket og i hjelpen.
import { signal } from '@preact/signals';
import {
  audioSkimming,
  canRedo,
  canUndo,
  getTime,
  project,
  projectPath,
  redo,
  room,
  saveNow,
  selectedTransition,
  selection,
  skim,
  skimming,
  snapping,
  tool,
  undo,
} from './editor/store.js';
import * as commands from './editor/commands.js';
import * as playback from './editor/playback.js';
import { toast } from './ui.jsx';
import { setPrefs } from './prefs.js';
import { RAMP_PRESETS } from '../shared/model.js';

const api = window.api;
export const isMac = api.platform === 'darwin';

// Hjelpen og kommandosøket.
export const helpOpen = signal(null); // null eller { article?, query? }
export const paletteOpen = signal(false);

const EDIT = ['edit'];
const ALL = ['record', 'edit', 'export'];

function setTool(t) {
  tool.value = t;
}

function toggleSignal(sig, pref, on, off) {
  sig.value = !sig.value;
  if (sig === skimming && !sig.value) skim.value = null;
  setPrefs({ [pref]: sig.value });
  toast(sig.value ? on : off, { timeout: 1200 });
}

function deselectAll() {
  selection.value = [];
  selectedTransition.value = null;
  commands.browserPicked.value = [];
}

function deleteMarker() {
  const p = project.value;
  const t = getTime();
  const near = [...(p.markers || [])].sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  if (!near) return toast('There are no markers to delete.');
  commands.deleteMarkerAt(near.id);
}

function showInspector(tab) {
  commands.inspectorTab.value = tab;
  if (!selection.value.length) commands.selectClipAtPlayhead();
}

function showBrowser(tab) {
  commands.browserTab.value = tab;
}

function viewerFullscreen() {
  document.querySelector('.viewer')?.requestFullscreen?.();
}

/**
 * keys: hurtigtast i Electron-format. CmdOrCtrl er Cmd på Mac og Ctrl på Windows, Alt er Option på Mac.
 * mac/win: egen tast per plattform når de er forskjellige. also: flere taster for samme kommando.
 * register: hurtigtasten registreres i menyen (bare for taster med Cmd eller Ctrl som også skal virke i tekstfelt).
 * rooms: hvor kommandoen virker. help: hjelpeartikkelen som forklarer den.
 */
export const COMMANDS = [
  /* File */
  { id: 'newProject', label: 'New Project', menu: 'File', keys: 'CmdOrCtrl+N', register: true, rooms: ALL, run: () => (commands.newProjectOpen.value = true), help: 'projects', desc: 'Create a project with its own folder for media, recordings and exports.' },
  { id: 'openProject', label: 'Open Project', menu: 'File', keys: 'CmdOrCtrl+O', register: true, rooms: ALL, run: () => (commands.projectsOpen.value = true), help: 'projects', desc: 'Show recent projects or open another project file.' },
  { id: 'save', label: 'Save', menu: 'File', keys: 'CmdOrCtrl+S', register: true, rooms: ALL, run: () => saveNow().then(() => toast('Project saved.', { timeout: 2000 })), help: 'projects', desc: 'Projects are saved automatically. This saves right away.' },
  { id: 'revealProject', label: isMac ? 'Reveal Project in Finder' : 'Show Project in Explorer', menu: 'File', keys: 'Shift+CmdOrCtrl+R', rooms: ALL, run: () => projectPath.value && api.reveal(projectPath.value), help: 'projects' },
  { id: 'import', label: 'Import Media', menu: 'File', group: 'media', keys: 'CmdOrCtrl+I', register: true, rooms: ALL, run: () => ((room.value = 'edit'), commands.importDialog()), help: 'import', desc: 'Import video, audio and images. Choose to copy them into the project folder or leave them in place.' },
  { id: 'optimize', label: 'Optimize Media', menu: 'File', group: 'media', keys: 'Alt+CmdOrCtrl+O', run: () => commands.optimizeMedia(), help: 'optimize', desc: 'Convert the selected clips to a high quality format that is smooth to edit. Runs in the background.' },
  { id: 'syncAudio', label: 'Synchronize Audio', menu: 'File', group: 'media', keys: 'Alt+CmdOrCtrl+G', run: () => commands.autoSyncAudio(), help: 'sync', keywords: 'auto sync audio merge external microphone recorder', desc: 'In the browser: merge audio files into the video clips they belong to. On the timeline: place audio clips under the matching video.' },
  { id: 'removeSync', label: 'Remove Synchronized Audio', menu: 'File', group: 'media', keys: 'Shift+Alt+CmdOrCtrl+G', run: () => commands.removeSyncedAudio(), help: 'sync', desc: 'Remove merged audio from the selected clips and switch the camera audio back on.' },
  { id: 'importTemplate', label: 'Import Title Template', menu: 'File', group: 'media', keys: 'Shift+Alt+CmdOrCtrl+I', run: () => commands.importTitleTemplate(), help: 'templates', keywords: 'after effects reccut-title lower third custom' },
  { id: 'templateKit', label: 'Get the Template Kit', menu: 'Help', group: 'help', keys: 'Shift+Alt+CmdOrCtrl+K', rooms: ALL, run: () => commands.downloadTemplateKit(), help: 'templates', keywords: 'after effects script jsx lower third design' },
  { id: 'relink', label: 'Relink File', menu: 'File', group: 'media', keys: 'Alt+CmdOrCtrl+L', run: () => { const id = commands.browserTargets()[0]; return id ? commands.relinkDialog(id) : toast('Select a clip in the browser or on the timeline first.'); }, help: 'offline', keywords: 'missing offline media find reconnect', desc: 'Point the selected media to a new file, for example when it is missing or has been moved.' },
  { id: 'export', label: 'Export', menu: 'File', group: 'export', keys: 'CmdOrCtrl+E', register: true, rooms: ALL, run: () => (room.value === 'edit' ? (commands.exportOpen.value = true) : (room.value = 'export')), help: 'export', desc: 'Export the project to a video, audio or image sequence file.' },
  { id: 'prefs', label: 'Preferences', menu: isMac ? 'App' : 'File', group: 'prefs', keys: 'CmdOrCtrl+,', register: true, rooms: ALL, run: () => (commands.prefsOpen.value = true), help: 'preferences' },

  /* Edit */
  { id: 'undo', label: 'Undo', menu: 'Edit', keys: 'CmdOrCtrl+Z', register: true, text: 'undo', run: undo, enabled: canUndo },
  { id: 'redo', label: 'Redo', menu: 'Edit', keys: 'Shift+CmdOrCtrl+Z', register: true, text: 'redo', run: redo, enabled: canRedo },
  { id: 'cut', label: 'Cut', menu: 'Edit', group: 'clip', keys: 'CmdOrCtrl+X', register: true, text: 'cut', run: commands.cutSelection },
  { id: 'copy', label: 'Copy', menu: 'Edit', group: 'clip', keys: 'CmdOrCtrl+C', register: true, text: 'copy', run: commands.copySelection },
  { id: 'paste', label: 'Paste', menu: 'Edit', group: 'clip', keys: 'CmdOrCtrl+V', register: true, text: 'paste', run: commands.paste },
  { id: 'delete', label: 'Delete', menu: 'Edit', group: 'clip', keys: 'Backspace', also: ['Delete'], run: () => commands.deleteSelection(true), help: 'timeline', desc: 'Delete the selection. Clips in the storyline close the gap.' },
  { id: 'deleteGap', label: 'Delete and Leave Gap', menu: 'Edit', group: 'clip', keys: 'Shift+Backspace', also: ['Shift+Delete'], run: () => commands.deleteSelection(false), help: 'timeline' },
  { id: 'selectAll', label: 'Select All', menu: 'Edit', group: 'select', keys: 'CmdOrCtrl+A', register: true, text: 'selectAll', run: commands.selectAll, desc: 'Select all clips, or all media when the browser is in use.' },
  { id: 'deselectAll', label: 'Deselect All', menu: 'Edit', group: 'select', keys: 'Shift+CmdOrCtrl+A', run: deselectAll },
  { id: 'selectClip', label: 'Select Clip at Playhead', menu: 'Edit', group: 'select', keys: 'C', run: commands.selectClipAtPlayhead },
  { id: 'append', label: 'Append to Storyline', menu: 'Edit', group: 'add', keys: 'E', run: () => commands.addBrowserSelection('append'), help: 'adding', desc: 'Add the browser selection to the end of the storyline.' },
  { id: 'insert', label: 'Insert', menu: 'Edit', group: 'add', keys: 'W', run: () => commands.addBrowserSelection('insert'), help: 'adding', desc: 'Insert the browser selection at the playhead and push the rest to the right.' },
  { id: 'connect', label: 'Connect to Storyline', menu: 'Edit', group: 'add', keys: 'Q', run: () => commands.addBrowserSelection('connect'), help: 'adding', desc: 'Place the browser selection above the storyline at the playhead.' },
  { id: 'overwrite', label: 'Overwrite', menu: 'Edit', group: 'add', keys: 'D', run: () => commands.addBrowserSelection('overwrite'), help: 'adding', desc: 'Replace what is in the storyline from the playhead.' },
  { id: 'addTransition', label: 'Add Cross Dissolve', menu: 'Edit', group: 'insertfx', keys: 'CmdOrCtrl+T', run: () => commands.addTransition('dissolve'), help: 'transitions', keywords: 'transition crossfade audio', desc: 'Add a cross dissolve, or an audio crossfade when two audio clips are selected.' },
  { id: 'addTitle', label: 'Add Title', menu: 'Edit', group: 'insertfx', mac: 'Ctrl+T', win: 'Alt+T', run: () => commands.addTitle('center'), help: 'titles' },
  { id: 'addLowerThird', label: 'Add Lower Third', menu: 'Edit', group: 'insertfx', mac: 'Shift+Ctrl+T', win: 'Shift+Alt+T', run: () => commands.addTitle('lt-bar'), help: 'lower-thirds', keywords: 'supring name super chyron', desc: 'Add an animated lower third at the playhead. Type the name and title in the inspector.' },
  { id: 'addCaption', label: 'Add Caption', menu: 'Edit', group: 'insertfx', keys: 'Alt+C', run: () => commands.addCaption(), help: 'captions' },
  { id: 'group', label: 'Group Clips', menu: 'Edit', group: 'group', keys: 'CmdOrCtrl+G', run: commands.groupSelected, help: 'grouping', desc: 'Group video and audio so they move, cut and delete together.' },
  { id: 'ungroup', label: 'Ungroup', menu: 'Edit', group: 'group', keys: 'Shift+CmdOrCtrl+G', run: commands.ungroupSelected, help: 'grouping' },
  { id: 'findCommand', label: 'Quick Search', menu: 'Help', group: 'search', keys: 'Ctrl+Space', also: ['CmdOrCtrl+K'], rooms: ALL, anywhere: true, run: () => (paletteOpen.value = !paletteOpen.value), help: 'search', keywords: 'find command palette console fx effects tools search everything' },

  /* Mark */
  { id: 'setIn', label: 'Set Range Start', menu: 'Mark', keys: 'I', run: () => commands.setRange('in'), help: 'range' },
  { id: 'setOut', label: 'Set Range End', menu: 'Mark', keys: 'O', run: () => commands.setRange('out'), help: 'range' },
  { id: 'clearRange', label: 'Clear Range', menu: 'Mark', keys: 'Alt+X', run: commands.clearRange, help: 'range' },
  { id: 'addMarker', label: 'Add Marker', menu: 'Mark', group: 'marker', keys: 'M', run: commands.addMarker, help: 'markers' },
  { id: 'deleteMarker', label: 'Delete Marker', menu: 'Mark', group: 'marker', keys: 'Ctrl+M', run: deleteMarker, help: 'markers' },
  { id: 'prevEdit', label: 'Previous Edit', menu: 'Mark', group: 'go', keys: 'Up', run: () => commands.jumpEdit(-1), help: 'playback' },
  { id: 'nextEdit', label: 'Next Edit', menu: 'Mark', group: 'go', keys: 'Down', run: () => commands.jumpEdit(1), help: 'playback' },
  { id: 'goStart', label: 'Go to Start', menu: 'Mark', group: 'go', keys: 'Home', run: commands.goHome, help: 'playback' },
  { id: 'goEnd', label: 'Go to End', menu: 'Mark', group: 'go', keys: 'End', run: commands.goEnd, help: 'playback' },
  { id: 'prevFrame', label: 'Previous Frame', menu: 'Mark', group: 'frame', keys: 'Left', run: () => commands.stepFrames(-1), help: 'playback' },
  { id: 'nextFrame', label: 'Next Frame', menu: 'Mark', group: 'frame', keys: 'Right', run: () => commands.stepFrames(1), help: 'playback' },
  { id: 'back10', label: 'Back 10 Frames', menu: 'Mark', group: 'frame', keys: 'Shift+Left', run: () => commands.stepFrames(-10), help: 'playback' },
  { id: 'forward10', label: 'Forward 10 Frames', menu: 'Mark', group: 'frame', keys: 'Shift+Right', run: () => commands.stepFrames(10), help: 'playback' },

  /* Clip */
  { id: 'blade', label: 'Blade', menu: 'Clip', keys: 'CmdOrCtrl+B', run: commands.blade, help: 'cutting', desc: 'Cut the selected clips, or the storyline clip, at the playhead.' },
  { id: 'bladeAll', label: 'Blade All', menu: 'Clip', keys: 'Shift+CmdOrCtrl+B', run: commands.bladeAll, help: 'cutting', desc: 'Cut every clip under the playhead.' },
  { id: 'trimStart', label: 'Trim Start to Playhead', menu: 'Clip', keys: 'Alt+[', run: () => commands.trimToPlayhead('start'), help: 'trimming' },
  { id: 'trimEnd', label: 'Trim End to Playhead', menu: 'Clip', keys: 'Alt+]', run: () => commands.trimToPlayhead('end'), help: 'trimming' },
  { id: 'nudgeLeft', label: 'Nudge Left One Frame', menu: 'Clip', keys: ',', run: () => commands.nudge(-1), help: 'trimming' },
  { id: 'nudgeRight', label: 'Nudge Right One Frame', menu: 'Clip', keys: '.', run: () => commands.nudge(1), help: 'trimming' },
  { id: 'toggleEnabled', label: 'Enable or Disable', menu: 'Clip', group: 'state', keys: 'V', run: commands.toggleEnabled, help: 'enable', desc: 'Switch the selected clip, or the selected audio component, off and on. It stays on the timeline, greyed out.' },
  { id: 'solo', label: 'Solo', menu: 'Clip', group: 'state', keys: 'Alt+S', run: commands.toggleSolo, help: 'audio' },
  { id: 'expandAudio', label: 'Expand Audio', menu: 'Clip', group: 'audio', mac: 'Ctrl+S', win: 'Alt+E', run: commands.toggleExpandAudio, help: 'audio', desc: 'Show the audio below the video, with one strip per audio component.' },
  { id: 'detachAudio', label: 'Detach Audio', menu: 'Clip', group: 'audio', mac: 'Ctrl+Shift+S', win: 'Alt+Shift+E', run: commands.detachSelectedAudio, help: 'audio' },
  { id: 'autoSync', label: 'Auto Sync Audio', menu: 'Clip', group: 'audio', keys: 'Alt+CmdOrCtrl+G', menuOnly: true, run: () => commands.autoSyncAudio(), help: 'sync' },
  { id: 'volumeUp', label: 'Volume Up 1 dB', menu: 'Clip', group: 'audio', mac: 'Ctrl+=', win: 'Alt+=', run: () => commands.adjustVolume(1), help: 'audio' },
  { id: 'volumeDown', label: 'Volume Down 1 dB', menu: 'Clip', group: 'audio', mac: 'Ctrl+-', win: 'Alt+-', run: () => commands.adjustVolume(-1), help: 'audio' },
  { id: 'retime', label: 'Show Speed Controls', menu: 'Clip', submenu: 'Retime', keys: 'CmdOrCtrl+R', run: commands.openRetime, help: 'speed' },
  { id: 'speedNormal', label: 'Normal Speed (100%)', menu: 'Clip', submenu: 'Retime', keys: 'Alt+CmdOrCtrl+R', run: () => commands.setSpeedSelected(1), help: 'speed' },
  { id: 'speedSlow', label: 'Slow 50%', menu: 'Clip', submenu: 'Retime', keys: 'Shift+Alt+-', run: () => commands.setSpeedSelected(0.5), help: 'speed' },
  { id: 'speedFast', label: 'Fast 2x', menu: 'Clip', submenu: 'Retime', keys: 'Shift+Alt+=', run: () => commands.setSpeedSelected(2), help: 'speed' },
  { id: 'reverse', label: 'Reverse Clip', menu: 'Clip', submenu: 'Retime', keys: 'Alt+R', run: () => commands.toggleReverse(), help: 'speed', keywords: 'backwards' },
  ...RAMP_PRESETS.map((r, i) => ({ id: `ramp:${r.id}`, label: `Speed Ramp: ${r.label}`, menuLabel: r.label, menu: 'Clip', submenu: 'Speed Ramp', keys: i < 6 ? `Shift+Alt+${i + 1}` : undefined, run: () => commands.applyRamp(r.id), help: 'speed' })),
  { id: 'ramp:none', label: 'Remove Speed Ramp', menuLabel: 'Remove Ramp', menu: 'Clip', submenu: 'Speed Ramp', keys: 'Shift+Alt+0', run: () => commands.applyRamp(null), help: 'speed' },
  { id: 'freeze', label: 'Add Freeze Frame', menu: 'Clip', submenu: 'Retime', keys: 'Alt+F', run: commands.addFreezeFrame, help: 'speed' },
  { id: 'lift', label: 'Lift from Storyline', menu: 'Clip', group: 'story', keys: 'Alt+CmdOrCtrl+Up', run: commands.liftSelected, help: 'timeline' },
  { id: 'overwriteDown', label: 'Overwrite to Storyline', menu: 'Clip', group: 'story', keys: 'Alt+CmdOrCtrl+Down', run: commands.overwriteSelectedToPrimary, help: 'timeline' },
  { id: 'insertGap', label: 'Insert Gap', menu: 'Clip', group: 'story', keys: 'Alt+W', run: commands.insertGapAtPlayhead, help: 'timeline' },

  /* Tools */
  { id: 'tool:select', label: 'Select Tool', menu: 'Tools', keys: 'A', run: () => setTool('select'), checked: () => tool.value === 'select', help: 'tools' },
  { id: 'tool:trim', label: 'Trim Tool', menu: 'Tools', keys: 'T', run: () => setTool('trim'), checked: () => tool.value === 'trim', help: 'tools', desc: 'Roll edit points, slip a clip, or slide it with Option.' },
  { id: 'tool:position', label: 'Position Tool', menu: 'Tools', keys: 'P', run: () => setTool('position'), checked: () => tool.value === 'position', help: 'tools', desc: 'Move clips freely and leave gaps.' },
  { id: 'tool:range', label: 'Range Selection Tool', menu: 'Tools', keys: 'R', run: () => setTool('range'), checked: () => tool.value === 'range', help: 'tools' },
  { id: 'tool:blade', label: 'Blade Tool', menu: 'Tools', keys: 'B', run: () => setTool('blade'), checked: () => tool.value === 'blade', help: 'tools' },
  { id: 'tool:zoom', label: 'Zoom Tool', menu: 'Tools', keys: 'Z', run: () => setTool('zoom'), checked: () => tool.value === 'zoom', help: 'tools' },
  { id: 'tool:hand', label: 'Hand Tool', menu: 'Tools', keys: 'H', run: () => setTool('hand'), checked: () => tool.value === 'hand', help: 'tools' },

  /* View */
  { id: 'roomRecord', label: 'Record', menu: 'View', keys: 'CmdOrCtrl+1', register: true, rooms: ALL, run: () => (room.value = 'record'), checked: () => room.value === 'record', help: 'recording' },
  { id: 'roomEdit', label: 'Edit', menu: 'View', keys: 'CmdOrCtrl+2', register: true, rooms: ALL, run: () => (room.value = 'edit'), checked: () => room.value === 'edit', help: 'editing' },
  { id: 'roomExport', label: 'Export', menu: 'View', keys: 'CmdOrCtrl+3', register: true, rooms: ALL, run: () => (room.value = 'export'), checked: () => room.value === 'export', help: 'export' },
  { id: 'browser:media', label: 'Show Media', menu: 'View', group: 'browser', keys: 'Shift+CmdOrCtrl+1', run: () => showBrowser('media'), help: 'browser' },
  { id: 'browser:titles', label: 'Show Titles', menu: 'View', group: 'browser', keys: 'Alt+CmdOrCtrl+1', run: () => showBrowser('titles'), help: 'titles' },
  { id: 'browser:transitions', label: 'Show Transitions', menu: 'View', group: 'browser', keys: 'Shift+CmdOrCtrl+5', run: () => showBrowser('transitions'), help: 'transitions' },
  { id: 'browser:effects', label: 'Show Effects', menu: 'View', group: 'browser', keys: 'CmdOrCtrl+5', run: () => showBrowser('effects'), help: 'effects' },
  { id: 'browser:captions', label: 'Show Captions', menu: 'View', group: 'browser', keys: 'Shift+CmdOrCtrl+7', run: () => showBrowser('captions'), help: 'captions' },
  { id: 'inspector:video', label: 'Show Video Inspector', menu: 'View', group: 'inspector', keys: 'CmdOrCtrl+4', run: () => showInspector('video'), help: 'inspector' },
  { id: 'inspector:audio', label: 'Show Audio Inspector', menu: 'View', group: 'inspector', keys: 'Alt+CmdOrCtrl+4', run: () => showInspector('audio'), help: 'audio' },
  { id: 'inspector:color', label: 'Show Color', menu: 'View', group: 'inspector', keys: 'CmdOrCtrl+6', run: () => showInspector('color'), help: 'color' },
  { id: 'inspector:effects', label: 'Show Clip Effects', menu: 'View', group: 'inspector', keys: 'Alt+CmdOrCtrl+5', run: () => showInspector('effects'), help: 'effects' },
  { id: 'inspector:info', label: 'Show Clip Info', menu: 'View', group: 'inspector', keys: 'CmdOrCtrl+8', run: () => showInspector('info'), help: 'inspector' },
  { id: 'zoomIn', label: 'Zoom In', menu: 'View', group: 'zoom', keys: 'CmdOrCtrl+=', run: () => commands.zoom(1.5), help: 'timeline' },
  { id: 'zoomOut', label: 'Zoom Out', menu: 'View', group: 'zoom', keys: 'CmdOrCtrl+-', run: () => commands.zoom(1 / 1.5), help: 'timeline' },
  { id: 'zoomFit', label: 'Zoom to Fit', menu: 'View', group: 'zoom', keys: 'Shift+Z', run: commands.zoomFit, help: 'timeline' },
  { id: 'skimming', label: 'Skimming', menu: 'View', group: 'toggles', keys: 'S', run: () => toggleSignal(skimming, 'skimming', 'Skimming on', 'Skimming off'), checked: () => skimming.value, help: 'skimming' },
  { id: 'audioSkimming', label: 'Audio Skimming', menu: 'View', group: 'toggles', keys: 'Shift+S', run: () => toggleSignal(audioSkimming, 'audioSkimming', 'Audio skimming on', 'Audio skimming off'), checked: () => audioSkimming.value, help: 'skimming' },
  { id: 'snapping', label: 'Snapping', menu: 'View', group: 'toggles', keys: 'N', run: () => toggleSignal(snapping, 'snapping', 'Snapping on', 'Snapping off'), checked: () => snapping.value, help: 'timeline' },
  { id: 'viewerFullscreen', label: 'Play Full Screen', menu: 'View', group: 'screen', keys: 'Shift+CmdOrCtrl+F', run: viewerFullscreen, help: 'playback' },

  /* Playback */
  { id: 'play', label: 'Play or Pause', menu: 'Playback', keys: 'Space', run: playback.toggle, help: 'playback' },
  { id: 'playReverse', label: 'Play Reverse', menu: 'Playback', keys: 'Shift+Space', run: playback.playReverse, help: 'playback' },
  { id: 'shuttleBack', label: 'Play Backward (faster each press)', menu: 'Playback', group: 'jkl', keys: 'J', run: () => playback.shuttle(-1), help: 'playback' },
  { id: 'stop', label: 'Stop', menu: 'Playback', group: 'jkl', keys: 'K', run: () => playback.shuttle(0), help: 'playback' },
  { id: 'shuttleForward', label: 'Play Forward (faster each press)', menu: 'Playback', group: 'jkl', keys: 'L', run: () => playback.shuttle(1), help: 'playback' },

  /* Help */
  { id: 'help', label: 'Reccut Help', menu: 'Help', group: 'help', keys: 'F1', rooms: ALL, run: () => (helpOpen.value = {}), help: 'search' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', menu: 'Help', group: 'help', keys: 'Alt+CmdOrCtrl+K', rooms: ALL, run: () => (helpOpen.value = { article: 'shortcuts' }), help: 'shortcuts' },
  { id: 'escape', label: 'Deselect', keys: 'Escape', hidden: true, run: deselectAll },
];

export const byId = new Map(COMMANDS.map((c) => [c.id, c]));

/* Hurtigtaster */

// Hurtigtasten for denne plattformen.
export function keysFor(cmd) {
  const main = isMac ? cmd.mac ?? cmd.keys : cmd.win ?? cmd.keys;
  return [main, ...(cmd.also || [])].filter(Boolean);
}

const CODE = {
  Space: 'Space', Plus: 'Equal', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Backspace: 'Backspace', Delete: 'Delete',
  Home: 'Home', End: 'End', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma',
  '.': 'Period', '/': 'Slash', '=': 'Equal', '-': 'Minus', ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '\\': 'Backslash',
};

// Gjør en hurtigtast om til det et tastetrykk må ha: tastekode og modifikatorer.
function parse(accel) {
  const parts = accel.split('+').filter(Boolean);
  const key = accel.endsWith('++') ? 'Plus' : parts.pop();
  const m = { meta: false, ctrl: false, alt: false, shift: false };
  for (const p of parts) {
    if (p === 'CmdOrCtrl') m[isMac ? 'meta' : 'ctrl'] = true;
    else if (p === 'Cmd' || p === 'Command') m.meta = true;
    else if (p === 'Ctrl' || p === 'Control') m.ctrl = true;
    else if (p === 'Alt' || p === 'Option') m.alt = true;
    else if (p === 'Shift') m.shift = true;
  }
  let code = CODE[key];
  if (!code && /^[A-Z]$/i.test(key)) code = `Key${key.toUpperCase()}`;
  if (!code && /^\d$/.test(key)) code = `Digit${key}`;
  if (!code && /^F\d{1,2}$/.test(key)) code = key;
  return { ...m, code };
}

const parsed = new Map();
function parsedKeys(cmd) {
  if (!parsed.has(cmd.id)) parsed.set(cmd.id, keysFor(cmd).map(parse));
  return parsed.get(cmd.id);
}

// Tegn for tegnsettingstaster, så de også virker på tastaturer der tasten ligger et annet sted.
const CHAR = { BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Equal: '=', Minus: '-', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\' };

function codeMatches(k, e) {
  if (k.code === e.code) return true;
  if (k.code === 'Minus' && e.code === 'NumpadSubtract') return true;
  if (k.code === 'Equal' && (e.code === 'NumpadAdd' || e.key === '+')) return true;
  return Boolean(CHAR[k.code]) && e.key === CHAR[k.code];
}

export function commandForEvent(e, currentRoom, { includeRegistered = false } = {}) {
  for (const cmd of COMMANDS) {
    if (cmd.menuOnly || (cmd.register && !includeRegistered)) continue;
    if (!(cmd.rooms || EDIT).includes(currentRoom)) continue;
    for (const k of parsedKeys(cmd)) {
      if (!codeMatches(k, e)) continue;
      if (k.meta !== e.metaKey || k.ctrl !== e.ctrlKey || k.alt !== e.altKey) continue;
      // Pluss ligger ofte på Shift, så Shift sjekkes ikke for den.
      if (k.shift !== e.shiftKey && !(k.code === 'Equal' && e.key === '+' && !k.shift)) continue;
      return cmd;
    }
  }
  return null;
}

// Vises i menyer og søk: ⌘⇧B på Mac, Ctrl+Shift+B på Windows.
const MAC_SYMBOLS = { meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
const KEY_NAMES = { Space: 'Space', Left: '←', Right: '→', Up: '↑', Down: '↓', Backspace: isMac ? '⌫' : 'Backspace', Delete: isMac ? '⌦' : 'Delete', Escape: 'Esc', Plus: '+', Home: 'Home', End: 'End' };
export function formatAccel(accel) {
  if (!accel) return '';
  const parts = accel.split('+').filter(Boolean);
  const key = accel.endsWith('++') ? 'Plus' : parts.pop();
  const k = parse(accel);
  const name = KEY_NAMES[key] || key.toUpperCase();
  if (isMac) return `${k.ctrl ? MAC_SYMBOLS.ctrl : ''}${k.alt ? MAC_SYMBOLS.alt : ''}${k.shift ? MAC_SYMBOLS.shift : ''}${k.meta ? MAC_SYMBOLS.meta : ''}${name}`;
  return [k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift', name].filter(Boolean).join('+');
}

export function shortcutText(cmd) {
  return formatAccel(keysFor(cmd)[0]);
}

/* Kjøring */

export function runCommand(id) {
  const cmd = typeof id === 'string' ? byId.get(id) : id;
  if (!cmd) return false;
  const rooms = cmd.rooms || EDIT;
  if (!rooms.includes(room.value)) room.value = 'edit';
  if (cmd.enabled && !cmd.enabled()) return false;
  Promise.resolve()
    .then(() => cmd.run())
    .catch((err) => toast(`${cmd.label} failed: ${err.message}`, { kind: 'error' }));
  return true;
}

/* Menylinjen */

const MENU_ORDER = isMac ? ['App', 'File', 'Edit', 'Mark', 'Clip', 'Tools', 'Playback', 'View', 'Window', 'Help'] : ['File', 'Edit', 'Mark', 'Clip', 'Tools', 'Playback', 'View', 'Help'];

function itemFor(cmd) {
  const accel = keysFor(cmd)[0];
  const it = { id: cmd.id, label: cmd.menuLabel || cmd.label, accelerator: accel, register: Boolean(cmd.register) };
  if (cmd.checked) it.checked = Boolean(cmd.checked());
  if (cmd.enabled) it.enabled = Boolean(cmd.enabled());
  return it;
}

// Menyene sendes til hovedprosessen, som bygger den ekte menylinjen.
export function menuTemplate() {
  const out = [];
  for (const name of MENU_ORDER) {
    if (name === 'App') {
      out.push({ label: 'Reccut', submenu: [{ role: 'about', label: 'About Reccut' }, { separator: true }, itemFor(byId.get('prefs')), { separator: true }, { role: 'hide', label: 'Hide Reccut' }, { role: 'hideOthers', label: 'Hide Others' }, { separator: true }, { role: 'quit', label: 'Quit Reccut' }] });
      continue;
    }
    if (name === 'Window') {
      out.push({ label: 'Window', role: 'windowMenu' });
      continue;
    }
    const items = [];
    let lastGroup;
    const subs = new Map();
    for (const cmd of COMMANDS) {
      if (cmd.menu !== name || cmd.hidden) continue;
      if (isMac && cmd.id === 'prefs') continue;
      if (cmd.submenu) {
        if (!subs.has(cmd.submenu)) {
          const sub = { label: cmd.submenu, submenu: [] };
          subs.set(cmd.submenu, sub);
          if (lastGroup !== undefined && lastGroup !== 'sub') items.push({ separator: true });
          lastGroup = 'sub';
          items.push(sub);
        }
        subs.get(cmd.submenu).submenu.push(itemFor(cmd));
        continue;
      }
      const g = cmd.group || '';
      if (lastGroup !== undefined && g !== lastGroup) items.push({ separator: true });
      lastGroup = g;
      items.push(itemFor(cmd));
    }
    // Speed Ramp ligger inne i Retime, som i Final Cut Pro.
    const retime = subs.get('Retime');
    const ramp = subs.get('Speed Ramp');
    if (retime && ramp) {
      items.splice(items.indexOf(ramp), 1);
      retime.submenu.push({ separator: true }, ramp);
    }
    if (name === 'View') items.push({ separator: true }, { role: 'togglefullscreen', label: 'Enter Full Screen' });
    if (name === 'File' && !isMac) items.push({ separator: true }, { role: 'quit', label: 'Quit' });
    // På Mac gir rollen help et søkefelt i Hjelp-menyen som finner og åpner menyvalg.
    out.push({ label: name, ...(name === 'Help' ? { role: 'help' } : {}), submenu: items.filter((x, i, a) => !(x.separator && (i === 0 || a[i - 1]?.separator))) });
  }
  return out;
}
