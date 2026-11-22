// Lens Flare i Properties: ferdige presets og de globale innstillingene (med nøkkelbilder).
// Elementene bygges og redigeres i Flare Studio (LensFlareStudio.jsx).
import { signal } from '@preact/signals';
import { Sparkles } from 'lucide-preact';
import { FLARE_BLENDS, FLARE_DEFAULTS, FLARE_PRESETS, flareModified } from '../../shared/lensFlare.js';
import { effectParams } from '../../shared/videoEffects.js';
import { propBase, setPropBase, vfxProp } from '../../shared/model.js';
import { Button, Row, Select } from '../ui.jsx';
import { commit } from './store.js';
import { prefs } from '../prefs.js';
import { Param, PatternChoice } from './Inspector.jsx';

// { clipId, effectId } når Flare Studio er åpent.
export const flareStudio = signal(null);
export const flarePresets = () => [...FLARE_PRESETS, ...(prefs.value.lensFlarePresets || [])];
// Det brukeren har valgt for bildet følger med til et nytt preset: lyskilden, sentrum og Flare color
// (fargen bare når presetet ikke har en egen farge, slik et lagret preset kan ha).
const kept = (preset) => ['x', 'y', 'cx', 'cy', ...(preset?.p.colorize > 0 ? [] : ['color', 'colorize'])];
// Elementenes nøkkelbilder hører til det gamle utseendet og fjernes; de globale beholdes.
export function applyFlarePreset(clip, effectId, preset) {
  const effect = clip?.props.vfx?.find((x) => x.id === effectId);
  if (!effect) return;
  const keep = Object.fromEntries(kept(preset).map((k) => [k, effect.p[k]]));
  effect.p = { ...structuredClone(preset.p), ...keep, preset: preset.id };
  const el = vfxProp(effectId, 'el:');
  for (const map of [clip.kf, clip.expressions]) if (map) for (const key of Object.keys(map)) if (key.startsWith(el)) delete map[key];
}
export const flareLookModified = (p) => {
  const preset = flarePresets().find((x) => x.id === p.preset);
  return flareModified({ ...p, ...Object.fromEntries(kept(preset).map((k) => [k, preset?.p[k]])) }, flarePresets());
};

export function FlareGlobals({ clip, effect }) {
  const p = effectParams(effect), k = (key) => vfxProp(effect.id, key);
  const num = (key, label, min, max, o = {}) => (
    <Param clip={clip} prop={k(key)} label={label} min={min} max={max} def={FLARE_DEFAULTS[key]}
      step={o.step ?? 1} scale={o.scale ?? 100} unit={o.unit ?? '%'} precision={o.precision ?? 0} center={o.center} />
  );
  return <>
    {/* Velger du en farge mens Color amount er 0, slås den på helt, så valget synes med en gang. */}
    <PatternChoice clip={clip} prop={k('color')} label="Flare color" color also={(c) => {
      if (!c.kf?.[k('colorize')]?.length && !(propBase(c, k('colorize')) > 0)) setPropBase(c, k('colorize'), 1);
    }} />
    {num('colorize', 'Color amount', 0, 100)}
    {num('x', 'Light X', -100, 200)}
    {num('y', 'Light Y', -100, 200)}
    {num('intensity', 'Intensity', 0, 400)}
    {num('scale', 'Global scale', 10, 400)}
    {num('spread', 'Spread', 0, 300, { center: 100 })}
    <Row label="Blend mode"><Select value={p.blend} options={FLARE_BLENDS}
      onChange={(v) => commit((q) => (q.clips[clip.id].props.vfx.find((x) => x.id === effect.id).p.blend = v))} /></Row>
    {num('occlusion', 'Occlusion', 0, 100)}
    {(p.occlusion > 0 || clip.kf?.[k('occlusion')]?.length > 0) && num('threshold', 'Threshold', 0, 100)}
    <details class="vfx-advanced"><summary>Optical center & opacity</summary>
      {num('cx', 'Center X', -100, 200)}
      {num('cy', 'Center Y', -100, 200)}
      {num('opacity', 'Opacity', 0, 100)}
    </details>
  </>;
}

export function LensFlareControls({ clip, effect }) {
  const p = effectParams(effect);
  const presets = flarePresets(), current = presets.find((x) => x.id === p.preset);
  const modified = flareLookModified(p);
  return <>
    <Row label="Preset">
      <Select value={current ? p.preset : ''} options={[
        ...(current ? [] : [{ value: '', label: 'Custom flare' }]),
        ...presets.map((x) => ({ value: x.id, label: (x.id.startsWith('user-') ? '★ ' : '') + x.label + (x.id === p.preset && modified ? ' (modified)' : '') })),
      ]} onChange={(id) => {
        const preset = presets.find((x) => x.id === id);
        if (preset) commit((q) => applyFlarePreset(q.clips[clip.id], effect.id, preset));
      }} />
    </Row>
    <Button variant="primary" icon={Sparkles} class="flare-studio-open" onClick={() => (flareStudio.value = { clipId: clip.id, effectId: effect.id })}>
      Open Flare Studio
    </Button>
    <FlareGlobals clip={clip} effect={effect} />
    <p class="hint">With the Effects tab open, drag the sun in the viewer to move the light; reflections follow on the other side of the optical center (+). Click a diamond to animate the light. Occlusion dims the flare when the picture is dark at the light, for example when something passes in front of the sun; Threshold is how bright the picture must be there to count as light. Open Flare Studio to add, edit, group and animate elements, use your own textures and save your own presets.</p>
  </>;
}
