import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesignAdjustments, normalizeDesignCurve, designCurveLUT, applyDesignPixelAdjustments } from '../src/shared/designAdjustments.js';
import { newLayer, normalizeDesign, solidFill } from '../src/shared/design.js';
import { imageFilter } from '../src/shared/designRender.js';
import { extractDesignStyle, applyDesignStyle } from '../src/shared/designTemplates.js';

const correct = (rgba, adjust) => [...applyDesignPixelAdjustments(new Uint8ClampedArray(rgba), adjust)];
test('corrections on images, text and shapes survive save/load with independent curve arrays', () => {
  const adjust = { exposure: 1.25, hue: -40, saturation: 1.5, curves: { red: [[0,0],[.5,.7],[1,1]] } };
  const layers = ['image','text','shape'].map(type => newLayer(type, { adjust }));
  const loaded = normalizeDesign(JSON.parse(JSON.stringify({ layers })));
  for (const l of loaded.layers) assert.deepEqual(l.adjust, normalizeDesignAdjustments(adjust));
  layers[0].adjust.curves.red[1][1] = .2;
  assert.equal(layers[1].adjust.curves.red[1][1], .7);
  assert.equal(adjust.curves.red[1][1], .7);
});
test('legacy image adjustments retain their values and neutral extended defaults', () => {
  const legacy = {brightness:-.3,contrast:.4,saturation:-1,hue:40,blur:10,grayscale:1};
  const a = newLayer('image', {adjust:legacy}).adjust;
  for (const [key, value] of Object.entries(legacy)) assert.equal(a[key], value);
  assert.equal(a.exposure, 0); assert.equal(a.enabled, true);
  assert.equal(imageFilter(a), 'brightness(0.7) contrast(1.4) saturate(0) hue-rotate(40deg) blur(10px) grayscale(1)');
});
test('malformed corrections and curve points normalize to finite, bounded values', () => {
  const a = normalizeDesignAdjustments({ exposure:100, hue:-999, saturation:Infinity, tint:NaN, curves:{rgb:[[1,1],[.4,.8],[.4,.2],[NaN,.5],[-1,-2]]} });
  assert.equal(a.exposure,4); assert.equal(a.hue,-180); assert.equal(a.saturation,0); assert.equal(a.tint,0);
  assert.deepEqual(a.curves.rgb,[[0,0],[.4,.8],[1,1]]);
  for (const v of [null, '', [], [[.5,.2]], [[0,1],[0,0]]]) assert.deepEqual(normalizeDesignCurve(v),[[0,0],[1,1]]);
});
test('neutral and bypassed corrections preserve every byte including alpha and transparent RGB', () => {
  const rgba = [12,84,250,128, 100,200,255,0, 255,255,255,255];
  assert.deepEqual(correct(rgba, normalizeDesignAdjustments()), rgba);
  assert.deepEqual(correct(rgba, {enabled:false,exposure:4,temperature:1,curves:{rgb:[[0,1],[1,0]]}}), rgba);
  assert.equal(imageFilter({enabled:false,brightness:1,blur:200}), 'none');
});
test('one exposure stop doubles linear light, preserves alpha and clamps highlights', () => {
  // sRGB 100 -> linear .1274 -> .2549 -> sRGB 138.
  assert.deepEqual(correct([100,100,100,127, 255,255,255,255, 80,90,100,0], {exposure:1}), [138,138,138,127, 255,255,255,255, 80,90,100,0]);
  assert.ok(correct([150,150,150,255], {exposure:-1})[0] < 150);
});
test('highlight and shadow controls concentrate on their respective tonal ranges', () => {
  const ramp = [30,30,30,255, 220,220,220,255];
  const shadows = correct(ramp, {shadows:.5}), highlights = correct(ramp, {highlights:-.5});
  assert.ok(shadows[0]-30 > shadows[4]-220);
  assert.ok(220-highlights[4] > 30-highlights[0]);
  assert.equal(shadows[3],255); assert.equal(highlights[7],255);
});
test('white balance warms/cools and tint shifts green/magenta', () => {
  const pixel = [128,128,128,80];
  const warm = correct(pixel,{temperature:1}), cool = correct(pixel,{temperature:-1});
  assert.ok(warm[0]>warm[2]); assert.ok(cool[0]<cool[2]);
  const magenta = correct(pixel,{tint:1}), green = correct(pixel,{tint:-1});
  assert.ok(magenta[0]>magenta[1]); assert.ok(green[1]>green[0]); assert.equal(warm[3],80);
});
test('curve interpolation is bounded, exact at points and monotonic without overshoot', () => {
  const p = [[0,.1],[.2,.15],[.5,.7],[.8,.85],[1,.9]], lut = designCurveLUT(p,1001);
  for (const [x,y] of p) assert.ok(Math.abs(lut[Math.round(x*1000)]-y)<1e-6);
  for (let i=1;i<lut.length;i++) assert.ok(lut[i]>=lut[i-1]&&lut[i]>=.1-1e-6&&lut[i]<=.9+1e-6);
  const inverted = correct([50,100,200,55],{curves:{rgb:[[0,1],[1,0]]}});
  assert.deepEqual(inverted,[205,155,55,55]);
});
test('RGB and individual channel curves combine without changing other channels or alpha', () => {
  const rgba = [128,128,128,64];
  const result = correct(rgba,{curves:{red:[[0,0],[.5,.8],[1,1]]}});
  assert.ok(result[0]>128); assert.deepEqual(result.slice(1),[128,128,64]);
  const combined = correct(rgba,{curves:{rgb:[[0,0],[.5,.7],[1,1]],blue:[[0,0],[.7,.4],[1,1]]}});
  assert.ok(combined[0]>128); assert.equal(combined[0],combined[1]); assert.ok(combined[2]<128);
});
test('reusable styles retain corrections for every layer type without sharing state', () => {
  for (const type of ['image','text','shape']) {
    const source = newLayer(type,{adjust:{exposure:.75,curves:{blue:[[0,0],[.5,.6],[1,1]]}}});
    const entry = {id:'corrected',type,style:extractDesignStyle(source,720)};
    const target = newLayer(type,{x:77,fill:solidFill('#ff0000')});
    const applied = applyDesignStyle(target,entry,720);
    assert.deepEqual(applied.adjust,source.adjust); assert.equal(applied.x,77);
    applied.adjust.curves.blue[1][1]=.1;
    assert.equal(source.adjust.curves.blue[1][1],.6); assert.equal(entry.style.adjust.curves.blue[1][1],.6);
  }
});
