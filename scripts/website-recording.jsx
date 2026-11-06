// Photograph the real recorder with separate raw screen/camera feeds. Hardware
// capture is disabled; the persistent edit uses the original recording files.
import '../src/renderer/app.jsx';
import * as store from '../src/renderer/editor/store.js';
import * as commands from '../src/renderer/editor/commands.js';
import * as playback from '../src/renderer/editor/playback.js';
import * as engine from '../src/renderer/recorder/engine.js';
import { saveSettings } from '../src/renderer/recorder/settings.js';
import { setPrefs } from '../src/renderer/prefs.js';
import { toasts } from '../src/renderer/ui.jsx';
import { frameExportSettings } from '../src/shared/frameExport.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
setPrefs({ checkUpdates: false, skimming: false, audioSkimming: false, askSequenceSettings: false });
const devices = [
  { kind: 'videoinput', deviceId: 'echoes-camera', label: 'Recorded camera' },
  { kind: 'audioinput', deviceId: 'echoes-mic', label: 'Recorded microphone' },
];
navigator.mediaDevices.enumerateDevices = async () => [];
navigator.mediaDevices.getUserMedia = async () => { throw new Error('Hardware capture is disabled for website photography'); };
let screenVideo, cameraVideo, drawFrame, audioContext, rawMediaId, trim;

async function start(folder, range) {
  trim = range;
  for (let i = 0; i < 100 && store.project.value.id !== 'website-echoes-demo'; i++) await wait(100);
  if (store.project.value.id !== 'website-echoes-demo') throw new Error('Echoes project not loaded');
  const media = await store.addRecordingToProject(folder);
  rawMediaId = media.id;
  for(let i=0;i<450 && store.tasks.value.some(task=>task.kind==='analyze'&&['queued','running'].includes(task.state));i++) await wait(100);
  const video = async key => {
    const element = document.createElement('video');
    element.crossOrigin = 'anonymous'; element.muted = true;
    element.src = `media://file/${encodeURIComponent(media.streams[key].path)}`;
    await element.play();
    await new Promise(resolve => {
      element.addEventListener('seeked', resolve, { once: true });
      element.currentTime = range.in - media.streams[key].offset;
    });
    element.pause(); return element;
  };
  screenVideo = await video('screen'); cameraVideo = await video('camera');
  const screenCanvas = document.createElement('canvas'), cameraCanvas = document.createElement('canvas');
  screenCanvas.width = 1728; screenCanvas.height = 1118;
  cameraCanvas.width = 1920; cameraCanvas.height = 1080;
  const screenContext = screenCanvas.getContext('2d'), cameraContext = cameraCanvas.getContext('2d');
  const draw = () => {
    screenContext.drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height);
    cameraContext.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
    drawFrame = requestAnimationFrame(draw);
  };
  draw();
  audioContext = new AudioContext();
  const sound = audioContext.createMediaElementSource(cameraVideo);
  const destination = audioContext.createMediaStreamDestination();
  sound.connect(destination);
  // This feeds the recording stream only, without playing through speakers.
  cameraVideo.muted = false; cameraVideo.volume = 1; await audioContext.resume();
  navigator.mediaDevices.getDisplayMedia = async () => screenCanvas.captureStream(30);
  navigator.mediaDevices.getUserMedia = async constraints => constraints.video
    ? cameraCanvas.captureStream(30)
    : new MediaStream(destination.stream.getAudioTracks().map(track => track.clone()));
  navigator.mediaDevices.enumerateDevices = async () => devices;
  engine.screens.value = [{ id: 'echoes-demo', kind: 'screen', name: 'Echoes of Quite Recent', width: 1728, height: 1118 }];
  engine.cameras.value = [{ id: 'echoes-camera', label: 'Recorded camera' }];
  engine.mics.value = [{ id: 'echoes-mic', label: 'Recorded microphone' }];
  saveSettings({ screenId: 'echoes-demo', cameraId: 'echoes-camera', micId: 'echoes-mic', systemAudio: false,
    layout: 6, pipShape: 'circle', pipSize: 'small', mirror: false, fps: 30, videoFormat: 'mp4', countdown: 0,
    autoRender: false, minimizeOnRecord: false, showControls: false, showPipOnScreen: false, showKeys: false, cursorZoom: false });
  store.room.value = 'record'; await wait(300);
  await Promise.all([engine.useScreen(), engine.useCamera(), engine.useMic()]);
  await wait(300);
  await Promise.all([screenVideo.play(), cameraVideo.play()]);
  await engine.startRecording();
  if (!engine.recording.value) throw new Error('Separate-track recording did not start');
}

async function edit() {
  const folder = await engine.stopRecording();
  if (!folder) throw new Error('No recording was saved');
  cancelAnimationFrame(drawFrame); screenVideo.pause(); cameraVideo.pause(); await audioContext.close();
  store.commit(p => {
    p.name = 'Echoes of Quite Recent'; p.fps = trim.fps;
    p.media[rawMediaId].name = 'Echoes · screen + camera';
    p.lanes[0] = { name: 'Screen' }; p.lanes[1] = { name: 'Camera' }; p.lanes[2] = { name: 'Game link' };
    for (const c of Object.values(p.clips)) {
      c.in = trim.in; c.dur = trim.dur;
      c.name = c.recordingPart === 'camera' ? 'Camera · PiP' : 'Screen · Echoes';
      c.props.showKeys = false; c.props.cursorZoom = false;
    }
  });
  store.sequenceSettingsOpen.value = null; store.room.value = 'edit'; await wait(400);
  store.selection.value = [...store.project.value.primary];
  playback.seek(5); commands.blade();
  store.commit(p => {
    for (const c of Object.values(p.clips)) {
      if (c.start === 0) { c.props.vFadeIn = 0.7; c.props.aFadeIn = 0.4; }
    }
  });
  commands.addTitle('lower', 0.65);
  const title = store.selection.value[0];
  store.commit(p => {
    const c = p.clips[title]; c.name = 'Play the game yourself'; c.dur = trim.dur - 1.1;
    c.props.text = 'Play the game yourself at\nsirbull.itch.io/echoes-of-quite-recent';
    c.props.subtext = ''; c.props.size = 42; c.props.weight = 600; c.props.anim = 'fade';
  });
  store.selection.value = [Object.values(store.project.value.clips).find(c => c.recordingPart === 'camera' && c.start === 0).id];
  commands.inspectorTab.value = 'video'; playback.seek(3.5); commands.zoomFit();
  await document.fonts.ready; await wait(1500);
  for (let i = 0; i < 150 && !playback.snapshot({ fresh: true })?.width; i++) await wait(100);
  if (!playback.snapshot({ fresh: true })?.width) throw new Error('Separate camera preview is not ready');
  await store.saveNow();
}

async function clean() {
  document.activeElement?.blur(); engine.notice.value = null; toasts.value = []; await wait(200);
}
async function exportEdit(output) {
  const p = store.project.value;
  return window.api.startExport({project:p, settings:{ format:'mp4-h264', quality:'high', fps:p.fps,
    size:{preset:0,w:1728,h:1118}, captions:'none', sourceMedia:'original', output, quiet:true }});
}
async function exportFrame(output,time) {
  const p=store.project.value;
  return window.api.startExport({project:p,settings:{frame:frameExportSettings(p,{time,width:1728,height:1118,format:'jpeg'}),sourceMedia:'original',output,quiet:true}});
}
window.recordPhotography = { start, edit, clean, exportEdit, exportFrame };
