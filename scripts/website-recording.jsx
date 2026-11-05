// Documentation capture only: play the supplied file through the real recording
// engine, without accessing the user's display, microphone or camera.
import '../src/renderer/app.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import * as playback from '../src/renderer/editor/playback.js';
import * as engine from '../src/renderer/recorder/engine.js';
import { saveSettings } from '../src/renderer/recorder/settings.js';
import { setPrefs } from '../src/renderer/prefs.js';
import { toasts } from '../src/renderer/ui.jsx';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
setPrefs({ checkUpdates: false, skimming: false, audioSkimming: false, askSequenceSettings: false });
navigator.mediaDevices.enumerateDevices = async () => [];
navigator.mediaDevices.getUserMedia = async () => { throw new Error('Hardware capture is disabled for website photography'); };
let source, drawFrame, audioContext, inputFile;

async function start(file) {
  inputFile = file;
  for (let i = 0; i < 100 && store.project.value.id !== 'website-echoes-demo'; i++) await wait(100);
  if (store.project.value.id !== 'website-echoes-demo') throw new Error('Gameplay demo project not loaded');
  source = document.createElement('video');
  source.crossOrigin = 'anonymous'; source.muted = true; source.loop = true;
  source.src = `media://file/${encodeURIComponent(file)}`;
  await source.play();
  const canvas = document.createElement('canvas');
  canvas.width = 1728; canvas.height = 1118;
  const context = canvas.getContext('2d');
  const draw = () => { context.drawImage(source, 0, 0, canvas.width, canvas.height); drawFrame = requestAnimationFrame(draw); };
  draw();
  audioContext = new AudioContext();
  const sound = audioContext.createMediaElementSource(source);
  const destination = audioContext.createMediaStreamDestination();
  sound.connect(destination);
  // The element must be unmuted for its Web Audio stream to contain sound.
  // It feeds only the internal destination, never the computer's speakers.
  source.muted = false; source.volume = 1; await audioContext.resume();
  navigator.mediaDevices.getDisplayMedia = async () => new MediaStream([
    ...canvas.captureStream(25).getVideoTracks(), ...destination.stream.getAudioTracks(),
  ]);
  engine.screens.value = [{ id: 'echoes-demo', kind: 'screen', name: 'Echoes of Quite Recent', width: 1728, height: 1118 }];
  saveSettings({ screenId: 'echoes-demo', cameraId: '', micId: '', systemAudio: true, layout: 2, fps: 25, videoFormat: 'mp4', countdown: 0, autoRender: false, minimizeOnRecord: false, showControls: false, showPipOnScreen: false, showKeys: false, cursorZoom: false });
  store.room.value = 'record';
  await engine.useScreen(); await wait(500);
  source.currentTime = 0;
  await engine.startRecording();
  if (!engine.recording.value) throw new Error('Gameplay demo recording did not start');
}

async function edit() {
  const folder = await engine.stopRecording();
  if (!folder) throw new Error('No recording was saved');
  const media = await store.addRecordingToProject(folder);
  await store.importPaths([inputFile], null, { copy: false });
  store.commit(p => {
    p.media[media.id].name = 'Gameplay take';
    for (const id of p.primary) p.clips[id].name = 'Gameplay take';
  });
  store.sequenceSettingsOpen.value = null; store.room.value = 'edit';
  await wait(500);
  store.selection.value = [...store.project.value.primary];
  playback.seek(3); commands.blade();
  commands.addTitle('lower', 0.5);
  const title = store.selection.value[0];
  store.commit(p => {
    p.clips[title].name = 'Echoes of Quite Recent'; p.clips[title].dur = 5.5;
    p.clips[title].props.text = 'Echoes of Quite Recent';
    p.clips[title].props.subtext = 'Gameplay recording demo';
  });
  store.selection.value = [store.project.value.primary[1]];
  commands.inspectorTab.value = 'video'; playback.seek(4);
  commands.zoomFit();
  cancelAnimationFrame(drawFrame); source.pause(); await audioContext.close();
  await document.fonts.ready; await wait(1500);
  for (let i = 0; i < 100 && !playback.snapshot({ fresh: true })?.width; i++) await wait(100);
  if (!playback.snapshot({ fresh: true })?.width) throw new Error('Gameplay editor preview is not ready');
  await store.saveNow();
}

async function clean() {
  document.activeElement?.blur(); engine.notice.value = null; toasts.value = [];
  await wait(200);
}
window.recordPhotography = { start, edit, clean };
