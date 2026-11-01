import { newProject, computeFrame, TRANSITIONS } from '../src/shared/model.js';
import { addSlideshow } from '../src/shared/slideshow.js';
import { drawFrame } from '../src/shared/render.js';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export function verifySlideshowRender() {
  const W = 240, H = 135, sources = {};
  const p = newProject('Slideshow rendering'); p.width = W; p.height = H;
  for (const [id, w, h, color] of [['a', 80, 160, '#ff0000'], ['b', 160, 80, '#0000ff']]) {
    p.media[id] = { id, name: id, kind: 'image', streams: { main: { hasVideo: true, width: w, height: h } } };
    const img = document.createElement('canvas'); img.width = w; img.height = h; const g = img.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
    sources[id] = { img, w, h };
  }
  let result = addSlideshow(p, ['a', 'b'], { background: true, motion: 'none', backgroundBlur: 0, backgroundDarken: 0 });
  const output = document.createElement('canvas');
  const render = (t, scale = 1) => {
    output.width = Math.round(W * scale); output.height = Math.round(H * scale);
    const seen = new Set();
    drawFrame(output.getContext('2d'), p, computeFrame(p, t), (c) => { seen.add(c.id); return sources[c.mediaId]; }, { matrix: [scale, scale, 0, 0] });
    return { seen, pixel: (x, y) => [...output.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data] };
  };
  const mid = render(5);
  for (const [x, y] of [[120, 60], [20, 2]]) {
    const c = mid.pixel(x, y); assert(Math.abs(c[0] - 128) <= 2 && Math.abs(c[2] - 128) <= 2 && c[3] === 255, 'background and foreground must dissolve as one picture');
  }
  assert(mid.seen.size === 4, 'both image pairs must be loaded during a transition');
  assert(computeFrame(p, 4.8).layers.length === 1, 'foregrounds must not be drawn twice during transitions');
  const reduced = render(5, 0.5).pixel(120, 60); assert(Math.abs(reduced[0] - 128) <= 2 && Math.abs(reduced[2] - 128) <= 2, 'scaled export must preserve paired dissolves');
  p.clips[p.primary[1]].transition.type = 'slideLeft';
  const push = render(5);
  assert(push.pixel(119, 60)[0] > 250 && push.pixel(121, 60)[2] > 250, 'oversized blur backgrounds must stay inside their own frame during a push');
  for (const transition of TRANSITIONS) {
    p.clips[p.primary[1]].transition.type = transition.id;
    for (const t of [4.6, 4.9, 5.1, 5.4]) assert(render(t).pixel(120, 60)[3] === 255, `${transition.id} must keep slideshow composite opaque`);
  }
  // Portrait → landscape without a background must fade to black in the new
  // letterbox, rather than leaving the old portrait opaque until the cut ends.
  p.clips = {}; p.primary = [];
  result = addSlideshow(p, ['a', 'b'], { background: false, motion: 'none' });
  const top = render(5).pixel(120, 1); assert(Math.abs(top[0] - 128) <= 2 && top[2] === 0, 'portrait edge must fade out smoothly into the new letterbox');
  assert(render(5.6).pixel(120, 1)[0] === 0, 'no old foreground may remain after the dissolve');
  // Default dark blur should cover empty space while leaving the foreground clear.
  p.clips = {}; p.primary = []; addSlideshow(p, ['a'], { motion: 'none' });
  const back = render(1).pixel(20, 60), front = render(1).pixel(120, 60);
  assert(back[0] > 0 && back[0] < front[0] - 40 && back[3] === 255, 'background copy must be visibly darker and fill the frame');
}
