import { useState } from 'preact/hooks';
import { HUE_BANDS, HUE_SATURATION_DEFAULTS } from '../../shared/hueSaturation.js';
import { effectParams } from '../../shared/videoEffects.js';
import { vfxProp } from '../../shared/model.js';
import { commit } from './store.js';
import { Param } from './Inspector.jsx';

export function HueSaturationControls({ clip, effect }) {
  const [selected, setSelected] = useState('red');
  const p = effectParams(effect), k = (key) => vfxProp(effect.id, key);
  const keys = (id) => ['Hue', 'Saturation', 'Center', 'Width'].map((suffix) => `${id}${suffix}`);
  const changed = (id) => keys(id).some((key) => p[key] !== HUE_SATURATION_DEFAULTS[key] || clip.kf?.[k(key)]?.length || clip.expressions?.[k(key)]);
  const band = HUE_BANDS.find((b) => b.id === selected);
  const param = (key, label, min, max, options = {}) => <Param clip={clip} prop={k(key)} label={label}
    min={min} max={max} def={HUE_SATURATION_DEFAULTS[key]} {...options} />;
  const reset = () => commit((q) => {
    const c = q.clips[clip.id], e = c.props.vfx.find((x) => x.id === effect.id);
    for (const key of keys(selected)) {
      e.p[key] = HUE_SATURATION_DEFAULTS[key];
      if (c.kf) delete c.kf[k(key)];
      if (c.expressions) delete c.expressions[k(key)];
    }
  });
  return <div class="hue-saturation-controls">
    <p class="hint">Choose a source color to adjust its hue and saturation independently.</p>
    <div class="hue-bands" role="group" aria-label="Source color range">
      {HUE_BANDS.map((b) => <button key={b.id} type="button" class={`hue-band${changed(b.id) ? ' modified' : ''}`}
        style={{ '--band-color': b.color }} aria-label={b.label} aria-pressed={selected === b.id}
        title={`${b.label}${changed(b.id) ? ' · adjusted' : ''}`} onClick={() => setSelected(b.id)}>
        <span class="hue-band-swatch" />
      </button>)}
    </div>
    <div class="hue-band-heading">
      <b>{band.label}</b>
      <button class="link small-link" disabled={!changed(selected)} onClick={reset}>Reset this range</button>
    </div>
    {param(`${selected}Hue`, 'Hue shift', -180, 180, { unit: '°', center: 0 })}
    {param(`${selected}Saturation`, 'Saturation', -100, 100, { scale: 100, unit: '%', center: 0 })}
    <details class="vfx-advanced">
      <summary>Refine color range</summary>
      {param(`${selected}Center`, 'Target hue', 0, 360, { unit: '°' })}
      {param(`${selected}Width`, 'Range width', 10, 200, { scale: 100, unit: '%' })}
      <p class="hint">Target hue selects the original color. Narrow the range to isolate a shade, or widen it to include nearby colors. The edges blend smoothly.</p>
    </details>
    {param('amount', 'Strength', 0, 100, { scale: 100, unit: '%' })}
    <p class="hint">All matching colors are affected. To recolor a red jacket, choose Reds and adjust Hue shift. Other red objects will change too. Use a masked adjustment layer to limit the area.</p>
  </div>;
}
