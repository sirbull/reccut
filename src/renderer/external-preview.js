import { createPreviewConnection } from './editor/previewConnection.js';

const api = window.preview;
const video = document.querySelector('video');
let connection;
let session;
let idle;
const firstFrame = setTimeout(() => api.command('failed'), 15000);
const activity = () => {
  document.body.classList.remove('idle');
  clearTimeout(idle);
  idle = setTimeout(() => document.body.classList.add('idle'), 2200);
};
document.addEventListener('pointermove', activity);
document.addEventListener('keydown', (event) => {
  activity();
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape') { event.preventDefault(); api.close(); return; }
  if (event.target.closest('button') && [' ', 'Enter'].includes(event.key)) return;
  const command = { ' ': 'toggle', ArrowLeft: 'previousFrame', ArrowRight: 'nextFrame', Home: 'start', End: 'end' }[event.key];
  if (command) { event.preventDefault(); api.command(command); }
});
document.querySelector('button').addEventListener('click', () => api.close());
api.onSignal((message) => {
  if (message.description?.type !== 'offer') return;
  connection?.close();
  session = message.session;
  connection = createPreviewConnection({
    send: (description) => api.signal({ session, description }),
    onStream: (stream) => {
      video.srcObject = stream;
      video.play().catch(() => api.command('failed'));
    },
    onError: () => api.command('failed'),
  });
  connection.receive(message.description);
});
video.addEventListener('playing', () => { clearTimeout(firstFrame); api.command('frameReady'); document.getElementById('status').hidden = true; });
video.addEventListener('error', () => api.command('failed'));
window.addEventListener('beforeunload', () => { connection?.close(); clearTimeout(idle); clearTimeout(firstFrame); });
activity();
api.ready();
