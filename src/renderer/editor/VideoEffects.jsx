import { effectWarning } from '../../shared/effectSupport.js';
import { useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Copy } from 'lucide-preact';
import {
  VIDEO_EFFECTS,
  effectParams,
  makeVideoEffect,
  sampleScreenColor,
  estimateBackground,
} from '../../shared/videoEffects.js';
import { beginTransient, commit, endTransient, updateTransient, project } from './store.js';
import { readClipFrame, readClipFrames, encodeReference } from './sourceFrame.js';
import { Button, IconButton, NumberField, Row, Section, Select, Toggle, toast } from '../ui.jsx';
import { RemoveEffectButton } from './RemoveEffectButton.jsx';
import { GradientEditor } from './GradientEditor.jsx';
import { AiKeying } from './AiKeying.jsx';

export function VideoEffects({ clip }) {
  const [busy, setBusy] = useState(false),
    [target, setTarget] = useState(clip.type === 'recording' ? 'camera' : 'main');
  const streams = project.value.media[clip.mediaId]?.streams || {};
  const targets = ['camera', 'screen'].filter((key) => streams[key]?.hasVideo && (!clip.recordingPart || clip.recordingPart === key));
  const effectTarget =
    clip.type === 'recording' ? (targets.includes(target) ? target : targets[0] || 'screen') : 'main';
  const list = clip.props.vfx || [];
  const edit = (fn) =>
    commit((q) => {
      const pr = q.clips[clip.id]?.props;
      if (pr) fn(pr);
    });
  const patch = (id, values) => edit((pr) => Object.assign(pr.vfx.find((e) => e.id === id).p, values));
  const patchLive = (id, values) => updateTransient((q) => {
    const effect = q.clips[clip.id]?.props.vfx?.find((e) => e.id === id);
    if (effect) Object.assign(effect.p, values);
  });
  const add = async (type, auto = false) => {
    const warning = effectWarning(clip, type);
    if (warning) return toast(warning, { timeout: 4000 });
    const e = makeVideoEffect(type);
    e.target = effectTarget;
    if (auto) {
      setBusy(true);
      try {
        const f = await readClipFrame(clip, effectTarget);
        e.p.color = sampleScreenColor(f.data, f.width, f.height);
      } catch (err) {
        toast(err.message, { kind: 'error' });
        return;
      } finally {
        setBusy(false);
      }
    }
    edit((pr) => (pr.vfx = [...(pr.vfx || []), e]));
  };
  const analyze = async () => {
    setBusy(true);
    try {
      const times = Array.from({ length: 9 }, (_, i) => clip.start + (clip.dur * (i + 0.5)) / 9);
      const frames = await readClipFrames(clip, effectTarget, times);
      const e = makeVideoEffect('difference');
      e.target = effectTarget;
      e.p.reference = encodeReference(estimateBackground(frames));
      edit((pr) => (pr.vfx = [...(pr.vfx || []), e]));
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const sample = async (e, reference = false) => {
    setBusy(true);
    try {
      const f = await readClipFrame(clip, e.target || 'main');
      patch(
        e.id,
        reference ? { reference: encodeReference(f) } : { color: sampleScreenColor(f.data, f.width, f.height) },
      );
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const move = (i, d) =>
    edit((pr) => {
      const a = [...pr.vfx];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      pr.vfx = a;
    });
  const number = (e, key, label, min, max, step = 0.01) => {
    const p = effectParams(e);
    return (
      <Row label={label}>
        <NumberField
          value={p[key]}
          min={min}
          max={max}
          step={step}
          precision={step < 1 ? 2 : 0}
          onStart={beginTransient}
          onChange={(v) => updateTransient((q) => (q.clips[clip.id].props.vfx.find((x) => x.id === e.id).p[key] = v))}
          onCommit={() => endTransient(true)}
        />
      </Row>
    );
  };
  const adjustment = clip.type === 'adjustment';
  if (!['video', 'image', 'recording', 'adjustment'].includes(clip.type)) return null;
  return (
    <Section title={adjustment ? 'Adjustment effect stack' : 'Keying & effect stack'} data-section="vfx">
      {clip.type === 'recording' && (
        <Row label="Add effects to">
          <Select
            value={effectTarget}
            options={targets.map((key) => ({ value: key, label: key === 'camera' ? 'Camera' : 'Screen' }))}
            onChange={setTarget}
          />
        </Row>
      )}
      {!adjustment && <>
      <Button disabled={busy} variant="secondary" onClick={() => add('chroma', true)}>
        Remove solid background
      </Button>
      {clip.type !== 'image' && (clip.speed !== 0 || clip.ramp) && (
        <Button disabled={busy} variant="secondary" onClick={analyze}>
          {busy ? 'Reading source…' : 'Remove static background'}
        </Button>
      )}
      <p class="hint">
        Static background removal analyzes nine frames. Keep the camera and lighting fixed; the subject must move enough
        to reveal the background in most samples. Use a clean reference frame for better control.
      </p>
      <p class="hint">
        Samples the border of the source frame at the playhead. Effects run from top to bottom, before color correction
        and the clip effects below. Add the same effect more than once.
      </p>
      <AiKeying clip={clip} />
      </>}
      {adjustment && <p class="hint">Effects run from top to bottom on the combined picture below this layer, before its Color settings. Reduce Layer strength in Video to blend the whole look. Add a mask to limit where it applies.</p>}
      {list.map((e, i) => {
        const def = VIDEO_EFFECTS.find((d) => d.type === e.type);
        if (!def) return <div key={e.id} class="afx-item"><div class="afx-head">
          <b>Unavailable effect: {e.type}</b>
          <RemoveEffectButton label={e.type} adjusted={true}
            onRemove={() => edit((pr) => (pr.vfx = pr.vfx.filter((x) => x.id !== e.id)))} />
        </div></div>;
        const p = effectParams(e),
          keyer = ['chroma', 'luma', 'difference'].includes(e.type);
        return (
          <div key={e.id} class={`afx-item vfx-item${e.on === false ? ' off' : ''}`} data-vfx={e.type}>
            <div class="afx-head">
              <Toggle
                checked={e.on !== false}
                onChange={(v) => edit((pr) => (pr.vfx.find((x) => x.id === e.id).on = v))}
              />
              <b>
                {def.label}
                {clip.type === 'recording' ? ` · ${e.target || 'main'}` : ''}
              </b>
              <IconButton
                icon={ArrowUp}
                size={12}
                title="Move effect up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              />
              <IconButton
                icon={ArrowDown}
                size={12}
                title="Move effect down"
                disabled={i === list.length - 1}
                onClick={() => move(i, 1)}
              />
              <IconButton
                icon={Copy}
                size={12}
                title="Duplicate effect"
                onClick={() =>
                  edit((pr) => {
                    const copy = structuredClone(e);
                    copy.id = makeVideoEffect(e.type).id;
                    pr.vfx.splice(i + 1, 0, copy);
                  })
                }
              />
              <RemoveEffectButton
                label={def.label}
                adjusted={Object.entries(e.p || {}).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(def.defaults[key]))}
                onRemove={() => edit((pr) => (pr.vfx = pr.vfx.filter((x) => x.id !== e.id)))}
              />
            </div>
            {e.type === 'solid' && <Row label="Color">
              <input type="color" class="color" value={p.color} aria-label="Solid color"
                onInput={(ev) => patchLive(e.id, { color: ev.currentTarget.value })}
                onChangeCapture={() => endTransient(true)} onBlur={() => endTransient(true)}
                onKeyDown={(ev) => ev.stopPropagation()} />
              <span class="gradient-hex">{p.color.toUpperCase()}</span>
            </Row>}
            {e.type === 'gradient' && <GradientEditor key={`${clip.id}:${e.id}`} params={p}
              aspect={(() => {
                const stream = streams[e.target || 'main'];
                return stream?.width > 0 && stream?.height > 0 ? stream.width / stream.height : project.value.width / project.value.height;
              })()}
              onChange={(values) => patch(e.id, values)} onStart={beginTransient}
              onInput={(values) => patchLive(e.id, values)}
              onCommit={() => endTransient(true)} onCancel={() => endTransient(false)} />}
            {e.type === 'chroma' && (
              <Row label="Screen color">
                <input
                  type="color"
                  class="color"
                  value={p.color}
                  onChange={(ev) => patch(e.id, { color: ev.currentTarget.value })}
                />
                {!adjustment && <Button class="small" disabled={busy} onClick={() => sample(e)}>
                  Auto sample
                </Button>}
              </Row>
            )}
            {e.type === 'difference' && (
              <>
                <Button class="small" disabled={busy} onClick={() => sample(e, true)}>
                  {p.reference ? 'Replace background reference' : 'Capture clean background'}
                </Button>
                <p class="hint">
                  Place the playhead on a frame showing only the background, with the subject out of shot. Keep the
                  camera and lighting fixed. The reference is saved in the project.
                </p>
              </>
            )}
            {def.controls ? <>
              {def.presets && <Row label="Preset"><Select value="" options={[
                { value: '', label: 'Choose a look…' }, ...def.presets.map((preset) => ({ value: preset.id, label: preset.label })),
              ]} onChange={(id) => { const preset = def.presets.find((x) => x.id === id); if (preset) patch(e.id, structuredClone(preset.p)); }} /></Row>}
              {def.controls.map(([key, label, min, max, step]) => typeof p[key] === 'boolean'
                ? <Row label={label}><Toggle checked={p[key]} onChange={(v) => patch(e.id, { [key]: v })} /></Row>
                : number(e, key, label, min, max, step))}
              {def.advancedControls && <details class="vfx-advanced"><summary>Advanced</summary>
                {def.advancedControls.map(([key, label, min, max, step]) => number(e, key, label, min, max, step))}
              </details>}
              {e.type === 'filmGrain' && <p class="hint">Organic grain follows the image’s light and shade. Use Advanced for dust, scratches and gate weave.</p>}
              {e.type === 'chromatic' && <p class="hint">Lens fringing grows toward the edges and leaves the lens center clear. Use RGB split for a uniform channel offset.</p>}
              {['noise', 'glitch', 'vhs', 'filmGrain'].includes(e.type) && <p class="hint">Animation follows the timeline. Speed 0 freezes the pattern; Seed changes it.</p>}
            </> : ['solid', 'gradient'].includes(e.type) ? <>
              {number(e, 'amount', 'Strength', 0, 1)}
              <Row label="Preserve source alpha"><Toggle checked={p.preserveAlpha}
                onChange={(v) => patch(e.id, { preserveAlpha: v })} /></Row>
            </> : keyer ? (
              <>
                {number(e, 'similarity', e.type === 'luma' ? 'Black threshold' : 'Tolerance', 0, 1)}
                {number(e, 'softness', 'Softness', 0.001, 1)}
                {e.type === 'chroma' && number(e, 'motionBlur', 'Motion blur', 0, 1)}
                <details class="vfx-advanced">
                  <summary>Advanced</summary>
                  {e.type === 'chroma' && <>
                    {number(e, 'detail', 'Recover fine detail', 0, 1)}
                    <p class="hint">Restore translucent hair and fine edges. Raise gradually to avoid restoring dark background patches.</p>
                    {number(e, 'shadows', 'Preserve source shadows', 0, 1)}
                    {p.shadows > 0 && number(e, 'shadowRange', 'Shadow color range', 0, 0.8)}
                    <p class="hint">Retain shadows using an unshadowed Screen color sample. Adjust Shadow color range if needed.</p>
                    {number(e, 'edgeColor', 'Recover edge color', 0, 1)}
                    {number(e, 'despill', 'Remove color spill', 0, 1)}
                  </>}
                  {number(e, 'black', 'Matte black', 0, Math.max(0, p.white - 0.01))}
                  {number(e, 'white', 'Matte white', Math.min(1, p.black + 0.01), 1)}
                  {number(e, 'gamma', 'Matte gamma', 0.1, 4)}
                  {number(e, 'choke', 'Shrink / expand edge', -8, 8, 1)}
                  {number(e, 'feather', 'Edge feather (px)', 0, 8, 1)}
                  <Row label="Invert matte">
                    <Toggle checked={p.invert} onChange={(v) => patch(e.id, { invert: v })} />
                  </Row>
                  <Row label="View">
                    <Select
                      value={p.view}
                      options={[
                        { value: 'result', label: 'Composite' },
                        { value: 'matte', label: 'Black & white matte' },
                      ]}
                      onChange={(v) => patch(e.id, { view: v })}
                    />
                  </Row>
                  {p.view === 'matte' && (
                    <p class="hint">Exports use this black &amp; white matte, so you can reuse it in another project. Choose Composite to export the keyed picture instead.</p>
                  )}
                </details>
              </>
            ) : (
              number(
                e,
                'amount',
                'Amount',
                0,
                e.type === 'blur' ? 60 : e.type === 'opacity' ? 1 : 3,
                e.type === 'blur' ? 1 : 0.01,
              )
            )}
          </div>
        );
      })}
      <Select
        value=""
        options={[
          { value: '', label: 'Add stack effect…' },
          ...VIDEO_EFFECTS.filter((d) => !adjustment || d.type !== 'difference').map((d) => ({ value: d.type, label: d.label })),
        ]}
        onChange={(v) => v && add(v)}
      />
      {!adjustment && <p class="hint">
        For complex moving backgrounds, use an external AI processor below. Reference keying does not identify people or
        reconstruct hidden detail.
      </p>}
    </Section>
  );
}
