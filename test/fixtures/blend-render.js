import { drawFrame } from '../../src/shared/render.js';
import { makeClip } from '../../src/shared/model.js';
import { addMask } from '../../src/shared/shapes.js';
import { BLEND_MODES } from '../../src/shared/blendModes.js';

export function run() {
  let checks = 0;
  const pixel = (ctx, x = 4, y = 4) => [...ctx.getImageData(x, y, 1, 1).data];
  const near = (a, b, message) => {
    checks++;
    if (a.some((v, i) => Math.abs(v - b[i]) > 3)) throw new Error(`${message}: ${a} != ${b}`);
  };
  const solid = color => {
    const c = new OffscreenCanvas(8, 8), g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 8, 8);
    return c;
  };
  const base = makeClip('image', { dur: 5 });
  const top = makeClip('video', { dur: 5, lane: 1 });
  const p = { width: 8, height: 8, fps: 30, media: {}, clips: { [base.id]: base, [top.id]: top } };
  const bottomImage = solid('rgb(128,64,192)'), topImage = solid('rgb(64,192,128)');
  const source = c => ({ img: c.id === base.id ? bottomImage : topImage, w: 8, h: 8 });
  const g = new OffscreenCanvas(8, 8).getContext('2d');
  const expected = new OffscreenCanvas(8, 8).getContext('2d');
  const frame = layers => ({ layers, captions: [], T: 2 });
  const side = clip => ({ clip, T: 2 });
  for (const blendMode of BLEND_MODES) {
    top.props.blendMode = blendMode;
    for (const opacity of [1, 0.5]) {
      top.props.opacity = opacity;
      drawFrame(g, p, frame([side(base), side(top)]), source);
      expected.globalCompositeOperation = 'source-over'; expected.globalAlpha = 1;
      expected.drawImage(bottomImage, 0, 0);
      expected.globalCompositeOperation = blendMode; expected.globalAlpha = opacity;
      expected.drawImage(topImage, 0, 0);
      near(pixel(g), pixel(expected), `${blendMode} at ${opacity}`);
    }
  }
  // A later Normal clip must cover the blended result without inheriting its mode.
  const cover = makeClip('image', { dur: 5, lane: 2 });
  drawFrame(g, p, frame([side(base), side(top), side(cover)]), source);
  near(pixel(g), pixel(topImage.getContext('2d')), 'blend state restored');

  top.props.blendMode = 'multiply'; top.props.opacity = 0.5;
  const mask = addMask(top, 'rect', 8, 8);
  top.props[`mask.${mask.id}.w`] = 4;
  drawFrame(g, p, frame([side(base), side(top)]), source);
  near(pixel(g), [80, 56, 144, 255], 'masked clip blends once with opacity');
  near(pixel(g, 0, 4), [128, 64, 192, 255], 'outside mask stays intact');
  // Preview scaling and cropped export matrices use the same compositing.
  const exportG = new OffscreenCanvas(16, 16).getContext('2d');
  drawFrame(exportG, p, frame([side(base), side(top)]), source, { matrix: [2, 2, 0, 0] });
  near(pixel(exportG, 8, 8), pixel(g), 'export matches preview');
  top.props.masks = [];
  top.props.cropL = 0.5;
  drawFrame(g, p, frame([side(base), side(top)]), source);
  near(pixel(g, 0, 4), [128, 64, 192, 255], 'crop stays transparent');
  near(pixel(g, 6, 4), [80, 56, 144, 255], 'crop preserves blend');
  top.props.cropL = 0;
  top.props.opacity = 1;
  const companion = makeClip('image', { dur: 5 });
  const companionSource = c => c.id === companion.id ? null : source(c);
  drawFrame(g, p, frame([side(base), { a: null, b: { ...side(top), companions: [companion] }, overlay: true, transition: { type: 'dissolve', p: 0.5, dur: 1 } }]), companionSource);
  near(pixel(g), [80, 56, 144, 255], 'blended slideshow side fades against lower tracks');
  // Motion blur must sample the lower picture; blending on transparency loses Multiply.
  drawFrame(g, p, frame([side(base), { a: side(top), b: side(top), overlay: true, transition: { type: 'slideLeft', p: 0.5, motionBlur: true, dur: 1 } }]), source);
  near(pixel(g, 1, 4), [32, 48, 96, 255], 'motion blurred transition preserves blend');
  // Alpha export keeps the source alpha instead of adding a black background.
  top.props.opacity = 0.5;
  drawFrame(g, p, frame([side(top)]), source, { transparent: true });
  near(pixel(g), [64, 192, 128, 128], 'transparent export');
  return `PASS: ${checks} real canvas blend checks (all modes, opacity, stacking, masks, crop, export and motion blur).`;
}
