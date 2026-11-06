import { useRef, useState } from 'preact/hooks';
import { Row, NumberField, Toggle, Select, Button } from '../ui.jsx';
import { CURVE_CHANNELS, MAX_CURVE_POINTS, normalizeDesignAdjustments, designCurveLUT, isIdentityCurve } from '../../shared/designAdjustments.js';
import { currentDesignId, changeLayers, beginDesignTransient, updateDesignTransient, endDesignTransient } from './store.js';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const CHANNEL_COLORS = { rgb: '#d4d4d8', red: '#fb7185', green: '#4ade80', blue: '#60a5fa' };
function ColorSection({ title, children, open, status }) {
  return <details class="dz-color-section" open={open}>
    <summary>{title}{status && <span class="dz-color-status">{status}</span>}</summary>
    <div class="dz-color-body">{children}</div>
  </details>;
}

export function DesignCurveEditor({ points, channel, disabled, onInput, onChange }) {
  const [selected, setSelected] = useState(0), drag = useRef(null);
  const lut = designCurveLUT(points);
  const path = Array.from(lut, (y, x) => `${x ? 'L' : 'M'}${x},${(1 - y) * 255}`).join(' ');
  const active = Math.min(selected, points.length - 1);
  const position = e => {
    const r = e.currentTarget.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp(1 - (e.clientY - r.top) / r.height)];
  };
  const move = (p, index, x, y) => p.map((point, i) => i === index ? [index === 0 ? 0 : index === p.length - 1 ? 1 : clamp(x, p[index - 1][0] + 1 / 255, p[index + 1][0] - 1 / 255), clamp(y)] : point);
  const finish = (keep = true) => { if (!drag.current) return; drag.current = null; endDesignTransient(keep); };
  const remove = () => { if (active > 0 && active < points.length - 1) { onChange(points.filter((_, i) => i !== active)); setSelected(active - 1); } };
  return <div class="dz-curves">
    <svg viewBox="0 0 255 255" class="dz-curve-graph" style={{ '--curve-color': CHANNEL_COLORS[channel] }}
      role="group" aria-label={`${channel.toUpperCase()} curve. Click to add a point, drag to adjust. Arrow keys move the selected point; Delete removes it.`}
      tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
      onPointerDown={e => {
        if (disabled || e.button !== 0) return;
        e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
        const [x, y] = position(e), r = e.currentTarget.getBoundingClientRect();
        let index = points.findIndex(p => Math.hypot((p[0] - x) * r.width, (p[1] - y) * r.height) < 12), next = points;
        if (index < 0) {
          if (points.length >= MAX_CURVE_POINTS || points.some(p => Math.abs(p[0] - x) < 1 / 255)) return;
          next = [...points, [x, y]].sort((a, b) => a[0] - b[0]); index = next.findIndex(p => p[0] === x);
        }
        beginDesignTransient(); setSelected(index); drag.current = { points: next, index };
        onInput(next);
      }}
      onPointerMove={e => { const d = drag.current; if (!d) return; const [x, y] = position(e); onInput(move(d.points, d.index, x, y)); }}
      onPointerUp={() => finish()} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish()}
      onKeyDown={e => {
        e.stopPropagation(); if (disabled) return;
        if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
        e.preventDefault(); const step = (e.shiftKey ? 10 : 1) / 255, [x, y] = points[active];
        onChange(move(points, active, x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), y + (e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0)));
      }}>
      <rect width="255" height="255" class="dz-curve-bg"/>
      {[.25,.5,.75].map(v => <path key={v} d={`M${v*255},0V255M0,${v*255}H255`} class="dz-curve-grid"/>)}
      <path d="M0,255L255,0" class="dz-curve-reference"/>
      <path d={path} class="dz-curve-line"/>
      {points.map(([x,y],i) => <circle key={i} cx={x*255} cy={(1-y)*255} r={i===active?4.5:3.5} class={i===active?'selected':''}/>)}
    </svg>
    <div class="dz-curve-axis"><span>Shadows</span><span>Highlights</span></div>
    <p class="hint">Click to add points; drag to shape the curve. Arrow keys fine-tune. Delete removes the selected point.</p>
    <Row><Button class="small" disabled={disabled || active===0 || active===points.length-1} onClick={remove}>Remove Point</Button><Button class="small" disabled={disabled} onClick={()=>{onChange([[0,0],[1,1]]);setSelected(0);}}>Reset Channel</Button></Row>
  </div>;
}

export function ColorControls({ layers }) {
  const [channel, setChannel] = useState('rgb');
  const adjustments = layers.map(l => normalizeDesignAdjustments(l.adjust)), a = adjustments[0];
  const disabled = adjustments.every(v => !v.enabled), mixed = adjustments.some(v => JSON.stringify(v) !== JSON.stringify(a));
  const adjusted = adjustments.some(v => Object.entries(v).some(([k, n]) => typeof n === 'number' && n !== 0) || CURVE_CHANNELS.some(c => !isIdentityCurve(v.curves[c])));
  // Merge each layer independently, including its other curve channels. A multi-selection
  // must never copy the first layer's crop, colours or other correction settings.
  const update = (patch, live = false) => {
    const apply = l => {
      const own = normalizeDesignAdjustments(l.adjust);
      l.adjust = normalizeDesignAdjustments({ ...own, ...patch, curves: { ...own.curves, ...patch.curves } });
    };
    if (!live) { changeLayers(apply); return; }
    const id = currentDesignId.value, ids = new Set(layers.map(l => l.id));
    updateDesignTransient(p => { for (const l of p.designs[id]?.layers || []) if (ids.has(l.id) && !l.locked) apply(l); });
  };
  const control = (key, label, min = -1, max = 1, step = .01, unit = '') => {
    const different = adjustments.some(v => v[key] !== a[key]);
    const pct = (a[key] - min) / (max - min) * 100, zero = -min / (max - min) * 100;
    return <Row key={key} label={label}><input type="range" class="slider" min={min} max={max} step={step} value={a[key]} disabled={disabled}
      aria-label={label} aria-valuetext={different ? `Mixed; first layer ${a[key]}${unit}` : `${a[key]}${unit}`}
      style={{ '--lo': `${Math.min(pct,zero)}%`, '--hi': `${Math.max(pct,zero)}%` }}
      onPointerDown={beginDesignTransient} onInput={e=>update({[key]:Number(e.currentTarget.value)},true)}
      onChangeCapture={()=>endDesignTransient()} onBlur={()=>endDesignTransient()} onKeyDown={e=>e.stopPropagation()}/>
      <NumberField value={different ? null : a[key]} min={min} max={max} step={step} precision={step<1?2:0} unit={unit} width={64} disabled={disabled}
        onStart={beginDesignTransient} onChange={value=>update({[key]:value},true)} onCommit={()=>endDesignTransient()}/></Row>;
  };
  return <ColorSection title="Color Correction" status={disabled?'Off':adjusted?'Adjusted':null}>
    <Row label="Enable"><Toggle checked={!disabled} onChange={enabled=>update({enabled})}/><Button class="small" onClick={()=>changeLayers(l=>{l.adjust=normalizeDesignAdjustments();})}>Reset All</Button></Row>
    {mixed&&<p class="hint">Selection has mixed corrections. Each control changes only that setting on the selected layers.</p>}
    <ColorSection title="Light" open>
      {control('exposure','Exposure',-4,4,.05,' EV')}{control('brightness','Brightness')}{control('contrast','Contrast')}
      {control('highlights','Highlights')}{control('shadows','Shadows')}
    </ColorSection>
    <ColorSection title="Color">
      {control('hue','Hue',-180,180,1,'°')}{control('saturation','Saturation',-1,2)}
      {control('temperature','Temperature')}{control('tint','Tint')}
      <p class="hint">Temperature: cool to warm. Tint: green to magenta.</p>
    </ColorSection>
    <ColorSection title="Curves">
      <Row label="Channel"><Select value={channel} options={CURVE_CHANNELS.map(c=>({value:c,label:c==='rgb'?'RGB':c[0].toUpperCase()+c.slice(1)}))} onChange={setChannel}/></Row>
      <DesignCurveEditor key={`${layers.map(l=>l.id).join(':')}:${channel}`} channel={channel} points={a.curves[channel]} disabled={disabled}
        onInput={points=>update({curves:{[channel]:points}},true)} onChange={points=>update({curves:{[channel]:points}})}/>
      <Button class="small" disabled={disabled} onClick={()=>update({curves:normalizeDesignAdjustments().curves})}>Reset All Curves</Button>
    </ColorSection>
    <ColorSection title="Effects">
      {control('blur','Blur',0,500,1,' px')}
      {layers.every(l=>l.type==='image') && <Row label="Repeat edges"><Toggle checked={a.repeatEdges} disabled={disabled} onChange={repeatEdges=>update({repeatEdges})}/></Row>}
      {control('grayscale','Grayscale',0,1)}
    </ColorSection>
  </ColorSection>;
}
