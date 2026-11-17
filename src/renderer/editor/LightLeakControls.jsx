import { useState } from 'preact/hooks';
import { LEAK_BLENDS, LEAK_DEFAULTS, LEAK_PRESETS, leakModified } from '../../shared/lightLeak.js';
import { effectParams } from '../../shared/videoEffects.js';
import { kfTime, setPropBase, uid, valueAt, vfxProp } from '../../shared/model.js';
import { Button, Row, Select } from '../ui.jsx';
import { commit, timeSig } from './store.js';
import { setKeyframe } from './keyframes.js';
import { prefs, setPrefs } from '../prefs.js';
import { Param, PatternChoice } from './Inspector.jsx';

const DIRECTIONS = [{ value: 0, label: 'Right' }, { value: 90, label: 'Up' }, { value: 180, label: 'Left' }, { value: -90, label: 'Down' }];
const Group = ({ title, children }) => <details class="vfx-advanced leak-group" open><summary>{title}</summary>{children}</details>;

// Light leaks: grouped controls. Every numeric and color setting has a keyframe diamond
// (stored as clip.kf['vfx.<id>.<key>'], in source time like all other keyframes).
export function LightLeakControls({ clip, effect }) {
  const [name, setName] = useState('');
  const p = effectParams(effect), id = effect.id, k = (key) => vfxProp(id, key);
  const presets = [...LEAK_PRESETS, ...(prefs.value.lightLeakPresets || [])];
  const current = presets.find((x) => x.id === p.preset);
  const modified = leakModified(p, presets);
  const T = Math.min(Math.max(timeSig.value, clip.start), clip.start + clip.dur);
  // Like the inspector: a keyframed setting gets a keyframe at the playhead, otherwise the base value changes.
  const put = (key, v) => commit((q) => {
    const c = q.clips[clip.id];
    if (c.kf?.[k(key)]?.length) setKeyframe(c, k(key), kfTime(c, T), v);
    else setPropBase(c, k(key), v);
  });
  const setEffect = (fn) => commit((q) => fn(q.clips[clip.id].props.vfx.find((x) => x.id === id)));
  const num = (key, label, min, max, o = {}) => (
    <Param clip={clip} prop={k(key)} label={label} min={min} max={max} def={current?.p[key] ?? LEAK_DEFAULTS[key]}
      step={o.step ?? 1} scale={o.scale ?? 100} unit={o.unit ?? '%'} precision={o.precision ?? 0} center={o.center} keyframes={o.keyframes} />
  );
  const angle = valueAt(clip, k('angle'), T) ?? p.angle;
  const animated = Object.keys(clip.kf || {}).some((prop) => prop.startsWith(`vfx.${id}.`));
  const save = () => {
    const label = name.trim() || `My light leak ${(prefs.value.lightLeakPresets || []).length + 1}`, presetId = `user-${uid()}`;
    setPrefs({ lightLeakPresets: [...(prefs.value.lightLeakPresets || []), { id: presetId, label, p: { ...p, preset: presetId } }] });
    setEffect((e) => (e.p.preset = presetId));
    setName('');
  };
  return (
    <>
      <Group title="Presets">
        <Row label="Preset">
          <Select value={current ? p.preset : ''} options={[
            ...(current ? [] : [{ value: '', label: 'Custom variant' }]),
            ...presets.map((x) => ({ value: x.id, label: x.label + (x.id === p.preset && modified ? ' (modified)' : '') })),
          ]} onChange={(v) => { const x = presets.find((y) => y.id === v); if (x) setEffect((e) => (e.p = structuredClone(x.p))); }} />
        </Row>
        <Row label="Save as preset">
          <input class="text-input" placeholder="Preset name" value={name} onInput={(ev) => setName(ev.currentTarget.value)}
            onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === 'Enter') save(); }} />
          <Button class="small" onClick={save}>Save</Button>
        </Row>
        {p.preset?.startsWith('user-') && current && <button class="link small-link" onClick={() =>
          setPrefs({ lightLeakPresets: prefs.value.lightLeakPresets.filter((x) => x.id !== p.preset) })}>Delete preset “{current.label}”</button>}
        <p class="hint">Choose a look, then adjust Intensity. Changes make a variant of the preset; the preset itself stays as it is.</p>
      </Group>
      <Group title="Colors">
        <PatternChoice clip={clip} prop={k('startColor')} label="Start color" color />
        <PatternChoice clip={clip} prop={k('endColor')} label="End color" color />
        {num('transition', 'Color transition', 0, 2, { scale: 1, step: 0.01, unit: '', precision: 2 })}
        {num('saturation', 'Saturation', 0, 200)}
        {num('variation', 'Color variation', 0, 100)}
      </Group>
      <Group title="Motion & Shape">
        <Row label="Direction">
          <Select value={DIRECTIONS.some((d) => d.value === angle) ? angle : 'custom'}
            options={[...DIRECTIONS, { value: 'custom', label: 'Custom angle' }]}
            onChange={(v) => v !== 'custom' && put('angle', Number(v))} />
        </Row>
        {num('angle', 'Angle', -180, 180, { scale: 1, unit: '°', center: 0 })}
        {num('speed', 'Speed', 0, 3, { scale: 1, step: 0.01, unit: '', precision: 2 })}
        {num('size', 'Size', 10, 300)}
        {num('softness', 'Softness', 0, 100)}
        {num('spread', 'Spread', 0, 100)}
        {num('x', 'Position X', 0, 100)}
        {num('y', 'Position Y', 0, 100)}
        {num('organic', 'Organic motion', 0, 100)}
        {num('flicker', 'Flicker', 0, 100)}
      </Group>
      <Group title="Light & Blending">
        {num('intensity', 'Intensity', 0, 200)}
        {num('opacity', 'Opacity', 0, 100)}
        <Row label="Blend mode"><Select value={p.blend} options={LEAK_BLENDS} onChange={(v) => setEffect((e) => (e.p.blend = v))} /></Row>
        {num('bloom', 'Bloom / glow', 0, 100)}
        {num('edgeBias', 'Edge bias', 0, 100)}
      </Group>
      <Group title="Animation">
        {num('seed', 'Seed', 0, 9999, { scale: 1, keyframes: false })}
        {animated && <button class="link small-link" onClick={() => commit((q) => {
          const c = q.clips[clip.id];
          for (const prop of Object.keys(c.kf)) if (prop.startsWith(`vfx.${id}.`)) delete c.kf[prop];
        })}>Remove light leak keyframes</button>}
        <p class="hint">Use the diamonds to animate a setting from the playhead; easing is chosen at each keyframe. Keyframes follow the clip when it is moved or trimmed. The light moves with the clip’s own time, so preview and export match at any frame rate. Seed changes the pattern.</p>
      </Group>
    </>
  );
}
