import { sourceTime, workPath } from '../../shared/model.js';
import { project, timeSig } from './store.js';
import { fileUrl } from '../player.js';
export async function readClipFrames(clip, target = 'main', times = [timeSig.value]) {
  const m = project.value.media[clip.mediaId],
    stream = m?.streams?.[target];
  if (!stream?.hasVideo) throw new Error('Select a clip with a video source.');
  const el = m.kind === 'image' ? new Image() : document.createElement('video');
  el.crossOrigin = 'anonymous';
  el.muted = true;
  el.preload = 'auto';
  const wait = (event) =>
    new Promise((resolve, reject) => {
      const done = (error) => {
        clearTimeout(timer);
        el.removeEventListener(event, loaded);
        el.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      };
      const loaded = () => done(),
        failed = () => done(new Error('Could not read this source frame.'));
      const timer = setTimeout(() => done(new Error('Timed out reading source frame.')), 20000);
      el.addEventListener(event, loaded, { once: true });
      el.addEventListener('error', failed, { once: true });
    });
  try {
    const ready = wait(m.kind === 'image' ? 'load' : 'loadeddata');
    el.src = fileUrl(workPath(stream) || m.path);
    await ready;
    const frames = [];
    for (const time of times) {
      if (m.kind !== 'image') {
        const t = Math.max(
          0,
          Math.min((el.duration || m.duration) - 0.001, sourceTime(clip, time) - (stream.offset || 0)),
        );
        if (Math.abs(el.currentTime - t) > 0.001) {
          const sought = wait('seeked');
          el.currentTime = t;
          await sought;
        }
      }
      const width = el.videoWidth || el.naturalWidth,
        height = el.videoHeight || el.naturalHeight;
      const scale = Math.min(1, 640 / Math.max(width, height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(width * scale));
      cv.height = Math.max(1, Math.round(height * scale));
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(el, 0, 0, cv.width, cv.height);
      frames.push(cx.getImageData(0, 0, cv.width, cv.height));
    }
    return frames;
  } finally {
    if (m.kind !== 'image') {
      el.removeAttribute('src');
      el.load();
    }
  }
}
export function encodeReference(frame) {
  let binary = '';
  for (const byte of frame.data) binary += String.fromCharCode(byte);
  return { width: frame.width, height: frame.height, pixels: btoa(binary) };
}

export async function readClipFrame(clip, target = 'main') {
  return (await readClipFrames(clip, target))[0];
}
