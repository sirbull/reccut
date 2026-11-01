// Real photographic input for visual review, plus exact offline animation frames.
import { applyVideoEffects } from '../src/shared/videoEffectsRender.js';
import { makeVideoEffect, VIDEO_EFFECTS } from '../src/shared/videoEffects.js';
import { stylizeSettings } from '../src/shared/stylize.js';
import { tapeLine } from '../src/shared/analog.js';
let photo;
const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const png = (cv) => cv.toDataURL('image/png').split(',')[1];
const preset = (type, id) => {
  const effect = makeVideoEffect(type);
  Object.assign(effect.p, VIDEO_EFFECTS.find((d) => d.type === type).presets?.find((p) => p.id === id)?.p);
  return effect;
};
const render = (source, effect, t) => {
  const output = canvas(source.width, source.height);
  const result = applyVideoEffects({ img: source, w: source.width, h: source.height }, { props: { vfx: effect ? [effect] : [] } }, 'main', t);
  output.getContext('2d').drawImage(result.img, 0, 0);
  return output;
};
export async function review() {
  photo = new Image(); photo.src = './photo.jpg'; await photo.decode();
  const source = canvas(1600, 900); source.getContext('2d').drawImage(photo, 0, 0, 1600, 900);
  const cases = [
    ['original', 'Original', null], ['vhs-lp', 'VHS · home video', preset('vhs', 'lp')],
    ['vhs-ep', 'VHS · worn tape', preset('vhs', 'ep')], ['film-16mm', 'Film grain · 16mm', preset('filmGrain', '16mm')],
    ['rgb-split', 'RGB split · uniform offset', makeVideoEffect('rgbSplit')], ['chromatic', 'Chromatic aberration · radial lens', makeVideoEffect('chromatic')],
  ];
  const comparison = canvas(1440, 1323), cx = comparison.getContext('2d');
  cx.fillStyle = '#171719'; cx.fillRect(0, 0, comparison.width, comparison.height);
  const images = {};
  for (const [i, [id, label, effect]] of cases.entries()) {
    const result = render(source, effect, 0.5);
    images[id] = png(result);
    const x = (i % 2) * 720, y = Math.floor(i / 2) * 441;
    cx.fillStyle = '#ddd'; cx.font = '18px sans-serif'; cx.fillText(label, x + 16, y + 27);
    cx.drawImage(result, x, y + 36, 720, 405);
  }
  images.comparison = png(comparison);
  // A detail crop lets grain and optical edges be assessed at native pixel scale.
  const detail = canvas(1440, 430), dx = detail.getContext('2d');
  for (const [i, [label, effect]] of [['Original', null], ['Fine 35mm grain', preset('filmGrain', '35mm')], ['Aged 8mm', preset('filmGrain', '8mm')]].entries()) {
    const result = render(source, effect, 0.5);
    dx.fillStyle = '#171719'; dx.fillRect(i * 480, 0, 480, 430);
    dx.fillStyle = '#ddd'; dx.font = '18px sans-serif'; dx.fillText(label, i * 480 + 12, 26);
    dx.drawImage(result, 1000, 400, 480, 394, i * 480, 36, 480, 394);
  }
  images['grain-detail'] = png(detail);
  return { images, status: 'passed' };
}
export function animationFrame(frame) {
  const W = 640, H = 360, source = canvas(W, H), g = source.getContext('2d');
  // The same slowly moving photographic source feeds every treatment.
  const t = frame / 24;
  g.drawImage(photo, 20 + t * 6, 8 + Math.sin(t) * 4, 1540, 866, 0, 0, W, H);
  const output = canvas(W * 2, H + 36), ctx = output.getContext('2d');
  ctx.fillStyle = '#171719'; ctx.fillRect(0, 0, output.width, output.height);
  ctx.fillStyle = '#ddd'; ctx.font = '18px sans-serif'; ctx.fillText('Original', 14, 25); ctx.fillText('VHS · worn tape', W + 14, 25);
  ctx.drawImage(source, 0, 36);
  ctx.drawImage(render(source, preset('vhs', 'ep'), t), W, 36);
  return png(output);
}
export function trackingFrames() {
  const effect = preset('vhs', 'ep'), result = [];
  for (let frame = 0; frame < 120; frame++) {
    const s = stylizeSettings('vhs', effect.p, frame / 24, 640, 360);
    let band = 0;
    for (let y = 0; y < 360; y += 4) band = Math.max(band, tapeLine(y, 360, s).band);
    if (band > 0.2) result.push(frame);
  }
  return result;
}
