import { computed, signal } from '@preact/signals';
import { prefs } from '../prefs.js';
import { toast } from '../ui.jsx';
import { playing, project, room, twoUp } from './store.js';
import { dialogOwnsKeyboard } from '../keyboard.js';
import * as playback from './playback.js';
import { createPreviewConnection } from './previewConnection.js';

const api = window.api;
export const previewDisplays = signal({ displays: [], connectedDisplayIds: [], active: null, session: null });
export const externalPreviewOnly = computed(() => Boolean(previewDisplays.value.active && !prefs.value.externalPreviewShowLocal && !twoUp.value));
export const previewDisplayDialog = signal(false);
let canvas = null;
let connection = null;
let connectionSession = null;
let revision = 0;
let refresh = null;

function stopConnection() {
  clearInterval(refresh);
  refresh = null;
  connection?.close();
  connection = null;
  connectionSession = null;
}
function update(state) {
  if (connectionSession !== state.session) stopConnection();
  previewDisplays.value = state;
}
api.onExternalPreviewState((state) => { revision++; update(state); });
// Ignore a query response if a newer window/display event has already arrived.
const initialRevision = revision;
api.externalPreviewState().then((state) => { if (revision === initialRevision) update(state); }).catch(() => {});
api.onExternalPreviewError((message) => toast(message, { kind: 'error' }));
api.onExternalPreviewCommand((command) => {
  if (command === 'frameReady') { clearInterval(refresh); refresh = null; return; }
  if (room.value !== 'edit' || dialogOwnsKeyboard()) return;
  if (command === 'toggle') playback.toggle();
  if (command === 'previousFrame') playback.seekViewer(playback.getViewerTime() - 1 / project.value.fps);
  if (command === 'nextFrame') playback.seekViewer(playback.getViewerTime() + 1 / project.value.fps);
  if (command === 'start') playback.seekViewer(0);
  if (command === 'end') playback.seekViewer((playback.sourceProject.value || project.value).duration);
});
api.onExternalPreviewSignal((message) => {
  if (message.session !== previewDisplays.value.session || room.value !== 'edit') return;
  if (!message.ready) {
    if (connectionSession === message.session) connection?.receive(message.description);
    return;
  }
  stopConnection();
  const session = message.session;
  const failed = (error) => {
    if (previewDisplays.value.session !== session) return;
    stopConnection();
    api.closeExternalPreview().catch(() => {});
    toast(`Could not open external preview: ${error.message}`, { kind: 'error' });
  };
  try {
    if (!canvas) throw new Error('The editor preview is not ready.');
    const stream = canvas.captureStream(Math.min(60, project.value.fps || 30));
    stream.getVideoTracks()[0].contentHint = 'detail';
    connectionSession = session;
    connection = createPreviewConnection({
      stream,
      send: (description) => api.externalPreviewSignal({ session, description }),
      onError: failed,
      onConnected: () => { playback.invalidate(); stream.getVideoTracks()[0]?.requestFrame?.(); },
    });
    connection.offer();
    // Prime a paused canvas until the receiver confirms its first picture.
    // Thereafter, ordinary playback and edit invalidation supply all frames.
    refresh = setInterval(() => { if (!playing.value) playback.invalidate(); }, 250);
    playback.invalidate();
  } catch (error) { failed(error); }
});

export function bindPreviewCanvas(element) {
  canvas = element;
  if (!element) stopConnection();
}

export async function setPreviewDisplay(id) {
  try {
    if (!id) await api.closeExternalPreview();
    else {
      if (room.value !== 'edit') return;
      if (document.fullscreenElement) await document.exitFullscreen();
      await api.openExternalPreview(Number(id));
      // The user may have changed rooms while the native window was loading.
      if (room.value !== 'edit') await api.closeExternalPreview();
    }
  } catch (error) {
    toast(`Could not change preview screen: ${error.message}`, { kind: 'error' });
  }
}

export function suspendExternalPreview() {
  stopConnection();
  previewDisplayDialog.value = false;
  api.closeExternalPreview().catch(() => {});
}
