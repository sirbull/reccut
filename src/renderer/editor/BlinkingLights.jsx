// Innstillingene for Blinking Lights. Tallene og fargene bruker de vanlige nøkkelbildekontrollene
// (vfx.<effekt-id>.<nøkkel>), så lyset kan animeres og følge noe i bildet.
import { useState } from 'preact/hooks';
import { vfxProp } from '../../shared/model.js';
import { LIGHT_DEFAULTS, LIGHT_PRESETS, matchingPreset } from '../../shared/lights.js';
import { commit } from './store.js';
import { prefs, setPrefs } from '../prefs.js';
import { Button, Row, Select, Toggle } from '../ui.jsx';
import { Param, PatternChoice } from './Inspector.jsx';

const SHAPES = [{ value: 'round', label: 'Round' }, { value: 'ellipse', label: 'Elliptical' }, { value: 'wide', label: 'Wide diffuse' }];
const COLOR_MODES = [{ value: 'single', label: 'Single' }, { value: 'alternate', label: 'Alternate' }, { value: 'blend', label: 'Blend (center to edge)' }];
const TRANSITIONS = [{ value: 'hard', label: 'Hard switch' }, { value: 'smooth', label: 'Gradual' }];
const PATTERNS = ['single', 'double', 'triple', 'alternating', 'random'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const BLENDS = [{ value: 'screen', label: 'Screen' }, { value: 'add', label: 'Add' }, { value: 'softLight', label: 'Soft Light' }, { value: 'overlay', label: 'Overlay' }];

export function BlinkingLights({ clip, effect }) {
  const [name, setName] = useState('');
  const p = { ...LIGHT_DEFAULTS, ...effect.p };
  const saved = prefs.value.lightPresets || [];
  const current = matchingPreset(p, [...LIGHT_PRESETS, ...saved]);
  const patch = (values) => commit((q) => Object.assign(q.clips[clip.id].props.vfx.find((x) => x.id === effect.id).p, values));
  const num = (key, label, min, max, { step = 1, scale = 1, unit = '', precision = 0, keyframes = true } = {}) => (
    <Param clip={clip} prop={vfxProp(effect.id, key)} label={label} min={min} max={max} step={step} scale={scale} unit={unit} precision={precision} def={LIGHT_DEFAULTS[key]} keyframes={keyframes} />
  );
  const pct = (key, label, min, max) => num(key, label, min, max, { scale: 100, unit: '%' });
  const ms = (key, label, max) => num(key, label, 0, max, { scale: 1000, unit: 'ms' });
  const choice = (key, label, options) => <Row label={label}><Select value={p[key]} options={options} onChange={(v) => patch({ [key]: v })} /></Row>;
  const color = (key, label) => <PatternChoice clip={clip} prop={vfxProp(effect.id, key)} label={label} color />;
  const toggle = (key, label) => <Row label={label}><Toggle checked={Boolean(p[key])} onChange={(v) => patch({ [key]: v })} /></Row>;
  const group = (title, children, open = false) => <details class="vfx-advanced light-group" open={open}><summary>{title}</summary>{children}</details>;
  const applyPreset = (id) => {
    const preset = [...LIGHT_PRESETS, ...saved].find((x) => x.id === id);
    if (preset) patch(structuredClone({ ...LIGHT_DEFAULTS, ...preset.p }));
  };
  const savePreset = () => {
    const label = name.trim() || `My light ${saved.length + 1}`;
    const keep = Object.fromEntries(Object.keys(LIGHT_DEFAULTS).map((k) => [k, p[k]]));
    setPrefs({ lightPresets: [...saved, { id: `user-${Date.now().toString(36)}`, label, p: keep }] });
    setName('');
  };
  const removeKeyframes = () => commit((q) => {
    const c = q.clips[clip.id], prefix = vfxProp(effect.id, '');
    for (const key of Object.keys(c.kf || {})) if (key.startsWith(prefix)) delete c.kf[key];
    for (const key of Object.keys(c.expressions || {})) if (key.startsWith(prefix)) delete c.expressions[key];
  });
  const animated = Object.keys(clip.kf || {}).some((key) => key.startsWith(vfxProp(effect.id, '')));
  const userPreset = saved.find((x) => x.id === current);

  return <>
    <Row label="Preset">
      <Select value={current} onChange={applyPreset} options={[
        ...LIGHT_PRESETS.map((x) => ({ value: x.id, label: x.label })),
        ...saved.map((x) => ({ value: x.id, label: `★ ${x.label}` })),
        { value: 'custom', label: 'Custom' },
      ]} />
    </Row>
    <Row label="Save as preset">
      <input class="text-input light-preset-name" value={name} placeholder="Preset name" aria-label="Preset name"
        onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') savePreset(); }} />
      <Button class="small" onClick={savePreset}>Save</Button>
      {userPreset && <Button class="small" title={`Delete the saved preset ${userPreset.label}`}
        onClick={() => setPrefs({ lightPresets: saved.filter((x) => x.id !== userPreset.id) })}>Delete</Button>}
    </Row>
    {group('Position & Shape', <>
      {pct('x', 'Position X', -100, 200)}
      {pct('y', 'Position Y', -100, 200)}
      {pct('size', 'Size', 1, 400)}
      {p.shape !== 'wide' && pct('softness', 'Softness', 0, 100)}
      {choice('shape', 'Shape', SHAPES)}
      {p.shape !== 'round' && <>
        {num('rotation', 'Rotation', -180, 180, { unit: '°' })}
        {num('spread', 'Spread', 0.2, 6, { step: 0.1, precision: 1, unit: '×' })}
      </>}
      <p class="hint">Position is a share of the picture: below 0 % or above 100 % puts the light outside the frame, so only its spill shows. Drag the light in the viewer to place it; drag the outer handle to resize it.</p>
    </>, true)}
    {group('Colors & Light Sources', <>
      {color('primary', p.dual ? 'Light 1 color' : 'Primary color')}
      {color('secondary', p.dual ? 'Light 2 color' : 'Secondary color')}
      {!p.dual && choice('colorMode', 'Color mode', COLOR_MODES)}
      {!p.dual && p.colorMode === 'alternate' && choice('transition', 'Color transition', TRANSITIONS)}
      {pct('saturation', 'Saturation', 0, 150)}
      {toggle('dual', 'Dual light mode')}
      {p.dual && <>
        {pct('x2', 'Light 2 position X', -100, 200)}
        {pct('y2', 'Light 2 position Y', -100, 200)}
        {pct('size2', 'Light 2 size', 1, 400)}
        {pct('phase2', 'Light 2 phase offset', 0, 100)}
        <p class="hint">Both lights share the flash pattern and speed. Phase offset 50 % makes them take turns.</p>
      </>}
    </>)}
    {group('Flash Pattern', <>
      {choice('pattern', 'Pattern', PATTERNS)}
      {num('frequency', 'Frequency', 0.05, 30, { step: 0.05, precision: 2, unit: 'Hz' })}
      {ms('duration', 'Flash duration', 1000)}
      {ms('attack', 'Attack', 1000)}
      {ms('decay', 'Decay', 2000)}
      {['double', 'triple'].includes(p.pattern) && ms('pause', 'Pause', 1000)}
      {pct('phase', 'Phase offset', 0, 100)}
      {pct('randomness', 'Randomness', 0, 100)}
      {pct('base', 'Base level', 0, 100)}
      <p class="hint">Frequency is how many times the pattern repeats per second. Attack and Decay shape each flash; Base level keeps the light partly on between flashes.</p>
    </>)}
    {group('Intensity & Blending', <>
      {pct('intensity', 'Intensity', 0, 800)}
      {pct('opacity', 'Opacity', 0, 100)}
      {pct('glow', 'Glow / bloom', 0, 200)}
      {num('falloff', 'Falloff', 0.2, 5, { step: 0.1, precision: 1 })}
      {pct('exposure', 'Exposure influence', 0, 200)}
      {choice('blend', 'Blend mode', BLENDS)}
      {toggle('core', 'Visible light source')}
      {p.core && <>
        {pct('coreSize', 'Source size', 1, 50)}
        {pct('coreIntensity', 'Source intensity', 0, 300)}
        {pct('coreGlow', 'Source glow', 0, 200)}
      </>}
      <p class="hint">Exposure influence brightens the picture under the light, so it looks lit rather than tinted. Turn on Visible light source for a lamp or sign that is in the shot.</p>
    </>)}
    {group('Animation', <>
      {num('seed', 'Random seed', 0, 9999, { keyframes: false })}
      <p class="hint">Use the diamonds to animate position, size, colors, frequency and intensity. To make the light follow something, add a position keyframe, move the playhead and drag the light again. Flashes follow the clip’s own time, so they stay the same when you move or trim the clip.</p>
      {animated && <Button class="small" onClick={removeKeyframes}>Remove light keyframes</Button>}
    </>)}
  </>;
}
