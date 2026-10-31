import { useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-preact';
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

export function VideoEffects({ clip }) {
  const [busy, setBusy] = useState(false),
    [target, setTarget] = useState(clip.type === 'recording' ? 'camera' : 'main');
  const streams = project.value.media[clip.mediaId]?.streams || {};
  const targets = ['camera', 'screen'].filter((key) => streams[key]?.hasVideo);
  const effectTarget =
    clip.type === 'recording' ? (targets.includes(target) ? target : targets[0] || 'screen') : 'main';
  const list = clip.props.vfx || [];
  const edit = (fn) =>
    commit((q) => {
      const pr = q.clips[clip.id]?.props;
      if (pr) fn(pr);
    });
  const patch = (id, values) => edit((pr) => Object.assign(pr.vfx.find((e) => e.id === id).p, values));
  const add = async (type, auto = false) => {
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
  if (!['video', 'image', 'recording'].includes(clip.type)) return null;
  return (
    <Section title="Keying & effect stack" data-section="vfx">
      {clip.type === 'recording' && (
        <Row label="Add effects to">
          <Select
            value={effectTarget}
            options={targets.map((key) => ({ value: key, label: key === 'camera' ? 'Camera' : 'Screen' }))}
            onChange={setTarget}
          />
        </Row>
      )}
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
      {list.map((e, i) => {
        const def = VIDEO_EFFECTS.find((d) => d.type === e.type);
        if (!def) return <p class="hint">Unavailable effect: {e.type}</p>;
        const p = effectParams(e),
          keyer = ['chroma', 'luma', 'difference'].includes(e.type);
        return (
          <div key={e.id} class={`afx-item${e.on === false ? ' off' : ''}`} data-vfx={e.type}>
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
              <IconButton
                icon={Trash2}
                size={12}
                title="Remove effect"
                onClick={() => edit((pr) => (pr.vfx = pr.vfx.filter((x) => x.id !== e.id)))}
              />
            </div>
            {e.type === 'chroma' && (
              <Row label="Screen color">
                <input
                  type="color"
                  class="color"
                  value={p.color}
                  onChange={(ev) => patch(e.id, { color: ev.currentTarget.value })}
                />
                <Button class="small" disabled={busy} onClick={() => sample(e)}>
                  Auto sample
                </Button>
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
            {keyer ? (
              <>
                {number(e, 'similarity', e.type === 'luma' ? 'Black threshold' : 'Tolerance', 0, 1)}
                {number(e, 'softness', 'Softness', 0.001, 1)}
                <details class="vfx-advanced">
                  <summary>Advanced</summary>
                  {e.type === 'chroma' && number(e, 'despill', 'Remove color spill', 0, 1)}
                  {number(e, 'black', 'Matte black', 0, Math.max(0, p.white - 0.01))}
                  {number(e, 'white', 'Matte white', Math.min(1, p.black + 0.01), 1)}
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
                    <p class="hint">Matte view also appears in exports. Return to Composite before exporting.</p>
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
          ...VIDEO_EFFECTS.map((d) => ({ value: d.type, label: d.label })),
        ]}
        onChange={(v) => v && add(v)}
      />
      <p class="hint">
        For complex moving backgrounds, use an external AI processor below. Reference keying does not identify people or
        reconstruct hidden detail.
      </p>
    </Section>
  );
}
