import { createPlayer } from '../../src/renderer/player.js';
import { newProject, makeClip } from '../../src/shared/model.js';
import { project, selection } from '../../src/renderer/editor/store.js';
import { previewsFor, renderSelectedPreviews } from '../../src/renderer/editor/previews.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (value, message) => { if (!value) throw new Error(message); };
export async function run(file) {
  // Hidden test windows do not consistently receive animation frames on macOS.
  window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = clearTimeout;
  const elements = [];
  const createElement = document.createElement.bind(document);
  document.createElement = (type, ...args) => {
    const el = createElement(type, ...args);
    if (type === 'video' || type === 'audio') elements.push(el);
    return el;
  };
  const p = newProject('Preview integration');
  Object.assign(p, { width: 320, height: 180, duration: 2 });
  const m = { id: 'source', kind: 'video', path: file, duration: 2, streams: { main: { path: file, duration: 2, width: 320, height: 180, hasVideo: true, hasAudio: true } } };
  p.media[m.id] = m;
  for (const start of [0, 1]) {
    const c = makeClip('video', { media: m, start, in: start, dur: 1 });
    c.props.blur = 4;
    p.clips[c.id] = c; p.primary.push(c.id);
  }
  p.clips[p.primary[1]].transition = { type: 'dissolve', dur: 0.4 };
  const overlay = makeClip('title', { start: 0, dur: 2, lane: 1, props: { text: 'Rendered preview', size: 22, anim: 'none' } });
  p.clips[overlay.id] = overlay;
  project.value = p; selection.value = Object.keys(p.clips);
  let time = 0.5;
  const playing = { value: false };
  const player = createPlayer({ getProject: () => project.value, getPreviews: previewsFor, playing, getTime: () => time, setTime: t => { time = t; } });
  const canvas = document.createElement('canvas');
  document.body.append(canvas); player.attachCanvas(canvas); player.resizeCanvas(320, 180); player.start();
  async function frame(t) {
    player.seek(t);
    for (let i = 0; i < 150; i++) {
      await wait(20);
      if (player.snapshot({ fresh: true })) return new Uint8Array(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    }
    throw new Error(`Timed out waiting for preview frame at ${t}: ${JSON.stringify({ time, snapshot: Boolean(player.snapshot()), elements: elements.map(el => ({ src: el.src, duration: el.duration, time: el.currentTime, ready: el.readyState, seeking: el.seeking, error: el.error?.message })) })}`);
  }
  const times = [0.5, 0.95, 1.5], reference = [];
  for (const t of times) reference.push(await frame(t));
  await renderSelectedPreviews();
  check(previewsFor(project.value).length === 1, 'Select All should render one merged area');
  const output = previewsFor(project.value)[0];
  check(output.in === 0 && output.out === 2, 'Render must cover the full timeline');
  const differences = [];
  for (const [i, t] of times.entries()) {
    const pixels = await frame(t);
    const difference = pixels.reduce((sum, v, k) => sum + Math.abs(v - reference[i][k]), 0) / pixels.length;
    check(difference < 12, `Cached effects/overlay/transition differs from live preview: ${difference}`);
    differences.push(difference);
  }
  await frame(0); player.play(); await wait(500);
  check(playing.value && time > 0.3 && time < 1, 'Cached playback must advance the timeline clock');
  player.pause();
  project.value = { ...project.value, captionStyle: { ...project.value.captionStyle, color: '#ff0000' } };
  check(previewsFor(project.value).length === 0, 'Editing must invalidate the render');
  player.invalidate(); await frame(0.5); player.dispose();
  return { output: output.file, differences, playbackTime: time };
}
