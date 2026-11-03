import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-preact';
import { BrandColors } from './BrandColors.jsx';
import { GradientEditor } from '../editor/GradientEditor.jsx';
import { Row, NumberField, Slider, Select, Segmented, Button, IconButton } from '../ui.jsx';
import { solidFill, normalizeStroke, normalizeShadow, SHADOW_PRESETS } from '../../shared/design.js';
import { gradientParams } from '../../shared/gradient.js';
import { beginDesignTransient, endDesignTransient } from './store.js';

export function StyleNumber({ label, value, onInput, min = 0, max = 500, step = 1, precision = 0, disabled = false }) {
  return <Row label={label}><NumberField value={value} min={min} max={max} step={step} precision={precision} disabled={disabled} width={90} onStart={beginDesignTransient} onChange={onInput} onCommit={() => endDesignTransient()} /></Row>;
}
export function FillControls({ value, onChange, onInput, aspect = 1, none = true, label = 'Fill' }) {
  const options = [...(none ? [{ value: 'none', label: 'None' }] : []), { value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }];
  return <>
    <Row label={label} stacked><Segmented value={value?.type || 'none'} options={options} onChange={(type) => onChange(type === 'none' ? null : type === 'solid' ? solidFill(value?.color) : { type: 'gradient', gradient: gradientParams(value?.gradient), alpha: value?.alpha ?? 1 })} /></Row>
    {value?.type === 'solid' && <BrandColors value={value.color} onChange={color=>onChange({...value,color})} />}
    {value?.type === 'solid' && <Row label="Color"><input type="color" aria-label={`${label} color`} value={value.color} onFocus={beginDesignTransient} onInput={(e) => onInput({ ...value, color: e.currentTarget.value })} onChangeCapture={() => endDesignTransient()} onBlur={() => endDesignTransient()} /></Row>}
    {value?.type === 'gradient' && <GradientEditor renderColors={(color,change)=><BrandColors value={color} onChange={change}/>} params={value.gradient} aspect={aspect} onChange={(patch) => onChange({ ...value, gradient: gradientParams({ ...value.gradient, ...patch }) })} onStart={beginDesignTransient} onInput={(patch) => onInput({ ...value, gradient: gradientParams({ ...value.gradient, ...patch }) })} onCommit={() => endDesignTransient()} onCancel={() => endDesignTransient(false)} />}
    {value && <Row label="Opacity"><Slider min={0} max={1} value={value.alpha ?? 1} onStart={beginDesignTransient} onInput={(alpha) => onInput({ ...value, alpha })} onCommit={() => endDesignTransient()} /><span>{Math.round((value.alpha ?? 1) * 100)}%</span></Row>}
  </>;
}
export function StrokeControls({ layer, onChange, onInput }) {
  const s = layer.stroke;
  const patch = (v, live = false) => (live ? onInput : onChange)({ ...s, ...v });
  return <>
    <Row label="Stroke"><Button class="small" onClick={() => onChange(s ? null : normalizeStroke({}, layer.type))}>{s ? 'Remove Stroke' : 'Add Stroke'}</Button></Row>
    {s && <>
      <StyleNumber label="Size" value={s.width} onInput={(width) => patch({ width }, true)} />
      <Row label="Position"><Select value={s.align} options={['inside','center','outside'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(align) => patch({ align })} /></Row>
      <Row label="Style"><Select value={s.dash} options={['solid','dashed','dotted'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(dash) => patch({ dash })} /></Row>
      <Row label="Join"><Select value={s.join} options={['round','bevel','miter'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(join) => patch({ join })} /></Row>
      <FillControls label="Stroke Fill" value={s.fill} none={false} aspect={layer.w / layer.h} onChange={(fill) => patch({ fill })} onInput={(fill) => patch({ fill }, true)} />
    </>}
  </>;
}
export function ShadowControls({ layer, onChange, onInput }) {
  const shadows = layer.shadows || [];
  const update = (i, props, live = false) => (live ? onInput : onChange)(shadows.map((s, n) => n === i ? { ...s, ...props } : s));
  return <>
    {shadows.map((s, i) => {
      const angle = Math.atan2(s.y, s.x) * 180 / Math.PI, distance = Math.hypot(s.x, s.y);
      const offset = (a, d) => ({ x: Math.cos(a * Math.PI / 180) * d, y: Math.sin(a * Math.PI / 180) * d });
      return <div class="dz-shadow" key={i}>
        <Row label={`Drop Shadow ${i + 1}`}><IconButton icon={ArrowUp} title="Move shadow up" disabled={!i} onClick={() => { const next = [...shadows]; [next[i-1],next[i]] = [next[i],next[i-1]]; onChange(next); }} /><IconButton icon={ArrowDown} title="Move shadow down" disabled={i === shadows.length - 1} onClick={() => { const next = [...shadows]; [next[i+1],next[i]] = [next[i],next[i+1]]; onChange(next); }} /><IconButton icon={Trash2} title="Remove shadow" onClick={() => onChange(shadows.filter((_, n) => n !== i))} /></Row>
        <BrandColors value={s.color} onChange={color=>update(i,{color})} /><Row label="Color"><input type="color" aria-label={`Shadow ${i + 1} color`} value={s.color} onFocus={beginDesignTransient} onInput={(e) => update(i, { color: e.currentTarget.value }, true)} onChangeCapture={() => endDesignTransient()} onBlur={() => endDesignTransient()} /></Row>
        <Row label="Opacity"><Slider min={0} max={1} value={s.alpha} onStart={beginDesignTransient} onInput={(alpha) => update(i, { alpha }, true)} onCommit={() => endDesignTransient()} /><span>{Math.round(s.alpha * 100)}%</span></Row>
        <StyleNumber label="Angle" value={angle} min={-180} max={180} onInput={(a) => update(i, offset(a, distance), true)} />
        <StyleNumber label="Distance" value={distance} max={2000} onInput={(d) => update(i, offset(angle, d), true)} />
        <StyleNumber label="Spread" value={s.spread} onInput={(spread) => update(i, { spread }, true)} />
        <StyleNumber label="Size" value={s.blur} onInput={(blur) => update(i, { blur }, true)} />
      </div>;
    })}
    <Button icon={Plus} disabled={shadows.length >= 32} onClick={async () => { const name = await window.api.popupMenu(Object.keys(SHADOW_PRESETS).map((name) => ({ id: name, label: name }))); if (name && SHADOW_PRESETS[name]) onChange([...shadows, normalizeShadow(SHADOW_PRESETS[name])]); }}>Add Layer Style…</Button>
  </>;
}
