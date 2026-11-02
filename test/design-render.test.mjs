import test from 'node:test';
import assert from 'node:assert/strict';
import { drawDesign } from '../src/shared/designRender.js';
import { newDesign, newLayer, solidFill } from '../src/shared/design.js';
function context() {
  const calls = [], stack = [];
  const ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', font: '',
    save() { stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, fillStyle: this.fillStyle }); },
    restore() { Object.assign(this, stack.pop()); },
    scale(...v) { calls.push(['scale', ...v]); }, translate(...v) { calls.push(['translate', ...v]); }, rotate(...v) { calls.push(['rotate', ...v]); },
    beginPath() {}, rect() {}, clip() {}, roundRect(...v) { calls.push(['roundRect', ...v]); },
    fill() { calls.push(['fill', this.fillStyle, this.globalAlpha]); },
    fillRect(...v) { calls.push(['fillRect', this.fillStyle, ...v]); },
    drawImage(...v) { calls.push(['drawImage', ...v]); },
    measureText(text) { return { width: text.length * parseFloat(this.font.match(/([\d.]+)px/)?.[1] || 10) * 0.6 }; },
    fillText(...v) { calls.push(['text', ...v]); },
  };
  return { ctx, calls };
}
test('design renderer uses design coordinates, z-order, opacity and hidden layer filtering', () => {
  const d = newDesign(); d.layers = [newLayer('shape',{ fill: { ...solidFill('#ff0000'), alpha: 0.5 }, opacity: 0.5, rotation: 30 }), newLayer('shape',{ fill: solidFill('#00ff00'), hidden: true }), newLayer('shape',{ fill: solidFill('#0000ff') })];
  const {ctx,calls} = context(); drawDesign(ctx,d,()=>null,{scale:0.5});
  assert.deepEqual(calls.filter((c)=>c[0]==='fill'), [['fill','#ff0000',0.25],['fill','#0000ff',1]]);
  assert.deepEqual(calls[0],['scale',0.5,0.5]); assert.ok(calls.some((c)=>c[0]==='rotate' && Math.abs(c[1]-Math.PI/6)<1e-9)); assert.equal(ctx.globalAlpha,1);
});
test('image crop and contain geometry use source pixels and text can be omitted during editing', () => {
  const d = newDesign(); const text = newLayer('text',{text:'Title'});
  d.layers = [newLayer('image',{ w:100,h:100,crop:{x:0.25,y:0,w:0.5,h:1},fit:'contain'}),text];
  const image = {width:400,height:100}; const {ctx,calls}=context();
  drawDesign(ctx,d,()=>image,{transparent:true,hideLayers:new Set([text.id])});
  assert.deepEqual(calls.find((c)=>c[0]==='drawImage'),['drawImage',image,100,0,200,100,0,25,100,50]);
  assert.ok(!calls.some((c)=>c[0]==='text' || c[0]==='fillRect'));
});
