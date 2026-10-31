// Inspektøren viser egenskapene til valgt klipp, med nøkkelbilder og myke overganger.
import { useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { ChevronLeft, ChevronRight, Diamond, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-preact';
import {
  audioComponents,
  ANIMATION_PRESETS,
  RAMP_PRESETS,
  CAPTION_LANE,
  COLOR_LOOKS,
  DEFAULT_CAPTION_STYLE,
  EASINGS,
  EFFECTS,
  TITLE_STYLES,
  TRANSITIONS,
  applyAnimationPreset,
  clipHasAudio,
  defaultProps,
  isElastic,
  isVisual,
  keyframeIndexAt,
  removeKeyframe,
  setKeyframe,
  setKeyframeEase,
  sourceTime,
  valueAt,
} from '../../shared/model.js';
import { setClipDuration, setSpeed, setTransition } from '../../shared/ops.js';
import { GRADE_PROPS } from '../../shared/grade.js';
import { beginTransient, commit, endTransient, project, selectedClips, selectedTransition, timeSig, updateTransient } from './store.js';
import { seek } from './playback.js';
import { inspectorTab, newProjectOpen, toggleComponent } from './commands.js';
import { Button, IconButton, NumberField, Row, Section, Segmented, Select, Slider, Toggle } from '../ui.jsx';

export function Inspector() {
  const clips = selectedClips.value;
  const transId = selectedTransition.value;
  const p = project.value;

  if (transId?.startsWith('ax:') && p.clips[transId.slice(3)]?.axfade) return <CrossfadeInspector clip={p.clips[transId.slice(3)]} />;
  if (transId && p.clips[transId]?.transition) return <TransitionInspector clip={p.clips[transId]} />;
  if (clips.length === 1) return <ClipInspector clip={clips[0]} />;
  if (clips.length > 1)
    return (
      <div class="inspector panel">
        <div class="insp-head">
          <b>{clips.length} clips selected</b>
        </div>
        <div class="insp-body">
          <Section title="Selection">
            <Row label="Enabled">
              <Toggle checked={clips.every((c) => c.enabled)} onChange={(v) => commit((q) => clips.forEach((c) => q.clips[c.id] && (q.clips[c.id].enabled = v)))} />
            </Row>
          </Section>
        </div>
      </div>
    );
  return <ProjectInspector />;
}

function tabsFor(clip, media) {
  const tabs = [];
  if (clip.type === 'title') tabs.push({ id: 'text', label: 'Text' });
  if (clip.type === 'caption') tabs.push({ id: 'caption', label: 'Caption' });
  if (clip.type === 'recording') tabs.push({ id: 'recording', label: 'Recording' });
  if (isVisual(clip) && clip.type !== 'gap') tabs.push({ id: 'video', label: 'Video' });
  if (clip.type === 'video' || clip.type === 'image' || clip.type === 'recording' || clip.type === 'title') tabs.push({ id: 'effects', label: 'Effects' });
  if (clipHasAudio(clip, media) && clip.type !== 'recording') tabs.push({ id: 'audio', label: 'Audio' });
  if (clip.type === 'video' || clip.type === 'image' || clip.type === 'recording') tabs.push({ id: 'color', label: 'Color' });
  if (['video', 'recording', 'audio'].includes(clip.type)) tabs.push({ id: 'speed', label: clip.speed === 0 ? 'Freeze' : 'Speed' });
  tabs.push({ id: 'info', label: 'Info' });
  return tabs;
}

function ClipInspector({ clip }) {
  const p = project.value;
  const media = p.media[clip.mediaId];
  const tabs = tabsFor(clip, media);
  const tab = tabs.find((t) => t.id === inspectorTab.value) ? inspectorTab.value : tabs[0].id;
  const title = clip.type === 'title' ? clip.props.text : clip.type === 'caption' ? 'Caption' : clip.type === 'gap' ? 'Gap' : clip.name || media?.name || 'Clip';

  return (
    <div class="inspector panel">
      <div class="panel-tabs">
        {tabs.map((t) => (
          <button key={t.id} class={tab === t.id ? 'active' : ''} onClick={() => (inspectorTab.value = t.id)}>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div class="insp-head">
        <span class={`type-dot t-${clip.type}`} />
        <b title={title}>{title}</b>
        <Toggle checked={clip.enabled} onChange={(v) => commit((q) => (q.clips[clip.id].enabled = v))} />
      </div>
      <div class="insp-body">
        {tab === 'text' && <TextTab clip={clip} />}
        {tab === 'caption' && <CaptionTab clip={clip} />}
        {tab === 'recording' && <RecordingTab clip={clip} media={media} />}
        {tab === 'video' && <VideoTab clip={clip} />}
        {tab === 'effects' && <EffectsTab clip={clip} />}
        {tab === 'audio' && <AudioTab clip={clip} />}
        {tab === 'color' && <ColorTab clip={clip} />}
        {tab === 'speed' && <SpeedTab clip={clip} />}
        {tab === 'info' && <InfoTab clip={clip} media={media} />}
      </div>
    </div>
  );
}

/* Egenskaper med nøkkelbilder */

function setValue(c, prop, v, T) {
  if (c.kf?.[prop]?.length) setKeyframe(c, prop, sourceTime(c, T), v);
  else c.props[prop] = v;
}

export function Param({ clip, prop, label, min, max, step = 1, unit = '', precision = 0, scale = 1, slider = true, center, keyframes = true }) {
  const T = timeSig.value;
  const inside = T >= clip.start && T <= clip.start + clip.dur;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur);
  const raw = valueAt(clip, prop, Tc) ?? 0;
  const value = raw * scale;
  const s = sourceTime(clip, Tc);
  const list = clip.kf?.[prop] || [];
  const kfIndex = keyframeIndexAt(clip, prop, s);
  const atKf = kfIndex >= 0;
  const id = clip.id;
  const apply = (v) => updateTransient((q) => setValue(q.clips[id], prop, v / scale, Tc));
  const prev = list.filter(([t]) => t < s - 1e-3).at(-1);
  const next = list.find(([t]) => t > s + 1e-3);
  const goto = (t) => seek(clip.start + (t - clip.in));
  const isDefault = !list.length && raw === (defaultProps(clip.type)[prop] ?? 0);

  return (
    <>
      <div class="param">
        <span class="param-label" title={label}>
          {label}
        </span>
        {slider ? (
          <Slider value={value} min={min} max={max} step={step} center={center} onStart={beginTransient} onInput={apply} onCommit={() => endTransient(true)} />
        ) : (
          <span />
        )}
        <NumberField value={value} min={min} max={max} step={step} precision={precision} unit={unit} onStart={beginTransient} onChange={apply} onCommit={() => endTransient(true)} />
        {keyframes ? (
          <div class="kf-ctl">
            <IconButton icon={ChevronLeft} size={12} title="Previous keyframe" disabled={!prev} onClick={() => prev && goto(prev[0])} />
            <button
              class={`kf-btn${atKf ? ' on' : list.length ? ' has' : ''}`}
              disabled={!inside}
              title={atKf ? 'Remove keyframe' : 'Add keyframe at the playhead'}
              onClick={() =>
                commit((q) => {
                  const c = q.clips[id];
                  if (atKf) removeKeyframe(c, prop, s);
                  else setKeyframe(c, prop, s, raw);
                })
              }
            >
              <Diamond size={11} />
            </button>
            <IconButton icon={ChevronRight} size={12} title="Next keyframe" disabled={!next} onClick={() => next && goto(next[0])} />
          </div>
        ) : (
          <span class="kf-ctl" />
        )}
        <IconButton
          icon={RotateCcw}
          size={12}
          title="Reset"
          class={isDefault ? 'invisible' : ''}
          onClick={() =>
            commit((q) => {
              const c = q.clips[id];
              delete c.kf[prop];
              c.props[prop] = defaultProps(c.type)[prop] ?? 0;
            })
          }
        />
      </div>
      {atKf && next && (
        <div class="ease-row">
          <span>Easing</span>
          <Select value={list[kfIndex][2] || 'linear'} options={EASINGS.map((e) => ({ value: e.id, label: e.label }))} onChange={(v) => commit((q) => setKeyframeEase(q.clips[id], prop, s, v))} />
        </div>
      )}
    </>
  );
}

function PlainNumber({ clip, prop, label, min, max, step, unit, precision = 1 }) {
  return (
    <Row label={label}>
      <NumberField
        value={clip.props[prop] || 0}
        min={min}
        max={max}
        step={step}
        unit={unit}
        precision={precision}
        onStart={beginTransient}
        onChange={(v) => updateTransient((q) => (q.clips[clip.id].props[prop] = v))}
        onCommit={() => endTransient(true)}
      />
    </Row>
  );
}

function setProp(clip, patch) {
  commit((q) => Object.assign(q.clips[clip.id].props, patch));
}

function AnimationPresets({ clip }) {
  const p = project.value;
  const [preset, setPreset] = useState('fadeIn');
  const animated = ['opacity', 'x', 'y', 'scale', 'rotation'].some((k) => clip.kf?.[k]?.length);
  return (
    <Section title="Animation">
      <div class="anim-row">
        <Select value={preset} options={ANIMATION_PRESETS.map((a) => ({ value: a.id, label: a.label }))} onChange={setPreset} />
        <Button variant="secondary" icon={Sparkles} onClick={() => commit((q) => applyAnimationPreset(q.clips[clip.id], preset, p.width, p.height))}>
          Apply
        </Button>
      </div>
      {animated && (
        <button
          class="link small-link"
          onClick={() =>
            commit((q) => {
              for (const k of ['opacity', 'x', 'y', 'scale', 'rotation']) delete q.clips[clip.id].kf[k];
            })
          }
        >
          Remove animation
        </button>
      )}
      <p class="hint">Presets add keyframes with easing. Drag the diamonds on the clip to retime them, and right click a diamond to change its easing.</p>
    </Section>
  );
}

function VideoTab({ clip }) {
  const p = project.value;
  return (
    <>
      <Section title="Compositing">
        <Param clip={clip} prop="opacity" label="Opacity" min={0} max={100} scale={100} unit="%" />
      </Section>
      <Section title="Transform">
        <Param clip={clip} prop="x" label="Position X" min={-p.width} max={p.width} unit="px" slider={false} />
        <Param clip={clip} prop="y" label="Position Y" min={-p.height} max={p.height} unit="px" slider={false} />
        <Param clip={clip} prop="scale" label="Scale" min={10} max={400} scale={100} unit="%" />
        <Param clip={clip} prop="rotation" label="Rotation" min={-180} max={180} unit="°" center={0} />
        <p class="hint">Tip: drag the clip directly in the viewer to move it.</p>
      </Section>
      <AnimationPresets clip={clip} />
      <Section title="Fade">
        <PlainNumber clip={clip} prop="vFadeIn" label="Fade in" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="vFadeOut" label="Fade out" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
    </>
  );
}

function EffectsTab({ clip }) {
  const active = EFFECTS.filter((fx) => (clip.props.fx || []).includes(fx.id) || clip.props[fx.prop] || clip.kf?.[fx.prop]?.length);
  const available = EFFECTS.filter((fx) => !active.includes(fx));
  const add = (id) =>
    commit((q) => {
      const c = q.clips[clip.id];
      const fx = EFFECTS.find((x) => x.id === id);
      c.props.fx = [...new Set([...(c.props.fx || []), id])];
      if (!c.props[fx.prop]) c.props[fx.prop] = fx.def;
    });
  const remove = (fx) =>
    commit((q) => {
      const c = q.clips[clip.id];
      c.props.fx = (c.props.fx || []).filter((x) => x !== fx.id);
      c.props[fx.prop] = 0;
      delete c.kf[fx.prop];
    });
  return (
    <>
      <Section title="Effects">
        {active.length === 0 && <p class="hint">No effects yet. Add one below, or drag one from the Effects browser.</p>}
        {active.map((fx) => (
          <div key={fx.id} class="fx-item">
            <div class="fx-head">
              <b>{fx.label}</b>
              <IconButton icon={Trash2} size={13} title="Remove effect" onClick={() => remove(fx)} />
            </div>
            <Param clip={clip} prop={fx.prop} label="Amount" min={fx.min * (fx.scale || 1)} max={fx.max * (fx.scale || 1)} scale={fx.scale || 1} unit={fx.unit} center={fx.min < 0 ? 0 : undefined} />
            {fx.id === 'border' && (
              <Row label="Color">
                <ColorField value={clip.props.borderColor || '#ffffff'} onLive={(v) => updateTransient((q) => (q.clips[clip.id].props.borderColor = v))} />
              </Row>
            )}
          </div>
        ))}
        {available.length > 0 && (
          <div class="anim-row">
            <Select value="" options={[{ value: '', label: 'Add effect' }, ...available.map((fx) => ({ value: fx.id, label: fx.label }))]} onChange={(v) => v && add(v)} />
          </div>
        )}
      </Section>
    </>
  );
}

// Lydkomponenter: velg hvilke lydspor klippet bruker. Det som slås av, blir liggende og kan slås på igjen.
function AudioComponentsSection({ clip }) {
  const media = project.value.media[clip.mediaId];
  const comps = audioComponents(clip, media);
  if (clip.type === 'audio' || comps.length < 2) return null;
  return (
    <Section title="Audio Components">
      {comps.map((c) => (
        <Row key={c.key} label={c.label}>
          <Toggle checked={!c.off} onChange={(v) => toggleComponent(clip.id, c.key, v)} />
        </Row>
      ))}
      <p class="hint">Switch off the audio you do not want to use. It stays with the clip, so you can switch it back on at any time. Expand the audio ({window.api.platform === 'darwin' ? 'Control S' : 'Alt E'}) to see each component on the timeline, click one and press V.</p>
    </Section>
  );
}

function AudioTab({ clip }) {
  const isMac = window.api.platform === 'darwin';
  return (
    <>
      <AudioComponentsSection clip={clip} />
      <Section title="Volume">
        <Param clip={clip} prop="volume" label="Volume" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />
        <p class="hint">{isMac ? 'Option' : 'Alt'} click the volume line on the clip to add keyframes. {isMac ? 'Control' : 'Alt'} + and {isMac ? 'Control' : 'Alt'} - change the level by 1 dB.</p>
      </Section>
      <Section title="Fade">
        <PlainNumber clip={clip} prop="aFadeIn" label="Fade in" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="aFadeOut" label="Fade out" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
      <AudioEditSection clip={clip} />
    </>
  );
}

// Utvidet og frakoblet lyd, J- og L-kutt.
function AudioEditSection({ clip }) {
  const isMac = window.api.platform === 'darwin';
  const isAv = clip.type !== 'audio';
  return (
    <Section title="Audio edits">
      {isAv && (
        <Row label="Expand audio">
          <Toggle checked={Boolean(clip.expanded)} onChange={(v) => commit((q) => (q.clips[clip.id].expanded = v))} />
        </Row>
      )}
      <Row label="Start earlier (J cut)">
        <NumberField value={clip.props.aLead || 0} min={-clip.dur + 0.1} max={10} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[clip.id].props.aLead = v))} onCommit={() => endTransient(true)} />
      </Row>
      <Row label="End later (L cut)">
        <NumberField value={clip.props.aTail || 0} min={-clip.dur + 0.1} max={10} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[clip.id].props.aTail = v))} onCommit={() => endTransient(true)} />
      </Row>
      {isAv && (
        <Button variant="secondary" onClick={() => commandsDetach()}>
          Detach Audio ({isMac ? 'Control Shift S' : 'Alt Shift E'})
        </Button>
      )}
      {!isAv && (
        <Button variant="secondary" onClick={() => import('./commands.js').then((m) => m.autoSyncAudio(clip.id))}>
          Auto Sync Audio ({isMac ? 'Option Cmd G' : 'Ctrl Alt G'})
        </Button>
      )}
      <p class="hint">Negative values shorten the audio. With expanded audio you can drag the audio edges on the timeline ({isMac ? 'Control S' : 'Alt E'}).</p>
      {!isAv && <p class="hint">Auto Sync Audio finds where this recording matches the sound in your video clips and lines it up under them.</p>}
    </Section>
  );
}

function commandsDetach() {
  import('./commands.js').then((m) => m.detachSelectedAudio());
}

const SPEEDS = [
  { value: 0.1, label: '10%' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
  { value: 8, label: '8x' },
  { value: 20, label: '20x' },
];

function SpeedTab({ clip }) {
  if (clip.speed === 0 && !clip.ramp) {
    return (
      <Section title="Freeze frame">
        <Row label="Duration">
          <NumberField value={clip.dur} min={0.1} max={600} step={0.1} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setClipDuration(q, clip.id, v))} onCommit={() => endTransient(true)} />
        </Row>
        <p class="hint">A freeze frame holds one frame of the source. You can still animate it with keyframes, for example a slow zoom.</p>
      </Section>
    );
  }
  const sp = clip.ramp ? null : clip.speed ?? 1;
  const set = (v) => commit((q) => setSpeed(q, clip.id, v));
  const media = project.value.media[clip.mediaId];
  const preparing = clip.reverse && media && Object.values(media.streams).some((st) => !st.reversed);
  return (
    <>
      <Section title="Speed" collapsible={false}>
        <div class="speed-grid">
          {SPEEDS.map((x) => (
            <button key={x.value} class={`chip${sp != null && Math.abs(sp - x.value) < 1e-6 ? ' active' : ''}`} onClick={() => set(x.value)}>
              {x.label}
            </button>
          ))}
        </div>
        {!clip.ramp && (
          <Row label="Custom">
            <NumberField value={Math.round(sp * 1000) / 10} min={2} max={5000} step={1} precision={1} unit="%" width={90} onChange={(v) => set(v / 100)} />
          </Row>
        )}
        <Row label="Reverse">
          <Toggle checked={Boolean(clip.reverse)} onChange={(v) => import('./commands.js').then((m) => m.toggleReverse(v))} />
        </Row>
        {preparing && <p class="hint">Preparing the reversed clip in the background. Until it is ready, the preview steps through frames without sound.</p>}
        <Row label="Preserve pitch">
          <Toggle checked={clip.props.preservePitch !== false} onChange={(v) => setProp(clip, { preservePitch: v })} />
        </Row>
        <Row label="Duration">
          <span class="value">{clip.dur.toFixed(2)} s</span>
        </Row>
        <p class="hint">Changing the speed keeps the same part of the source, so the clip gets longer or shorter and the rest of the storyline moves with it.</p>
      </Section>
      <RampSection clip={clip} />
      {(clip.type === 'video' || clip.type === 'recording') && (
        <Section title="Hold">
          <Button variant="secondary" onClick={() => import('./commands.js').then((m) => m.addFreezeFrame())}>
            Add Freeze Frame at Playhead (Option F)
          </Button>
        </Section>
      )}
    </>
  );
}

// Fartsrampe: farten endres jevnt gjennom klippet, som Speed Ramp i Final Cut Pro.
function RampSection({ clip }) {
  const [preset, setPreset] = useState('to0');
  const ramp = clip.ramp;
  const from = ramp ? ramp[0][1] : clip.speed ?? 1;
  const to = ramp ? ramp[ramp.length - 1][1] : clip.speed ?? 1;
  const apply = (r) => import('./commands.js').then((m) => m.applyRamp(r));
  return (
    <Section title="Speed ramp">
      <div class="anim-row">
        <Select value={preset} options={RAMP_PRESETS.map((r) => ({ value: r.id, label: r.label }))} onChange={setPreset} />
        <Button variant="secondary" onClick={() => apply(preset)}>
          Apply
        </Button>
      </div>
      {ramp && <RampCurve ramp={ramp} />}
      <Row label="Start speed">
        <NumberField value={Math.round(from * 100)} min={5} max={2000} step={5} unit="%" width={90} onChange={(v) => apply([[0, v / 100], ...(ramp ? ramp.slice(1, -1) : []), [1, to]])} />
      </Row>
      <Row label="End speed">
        <NumberField value={Math.round(to * 100)} min={5} max={2000} step={5} unit="%" width={90} onChange={(v) => apply([[0, from], ...(ramp ? ramp.slice(1, -1) : []), [1, v / 100]])} />
      </Row>
      {ramp && (
        <button class="link small-link" onClick={() => apply(null)}>
          Remove ramp (keeps the average speed)
        </button>
      )}
      <p class="hint">The speed changes smoothly through the clip. The same part of the source is used, so the clip gets longer when it slows down.</p>
    </Section>
  );
}

function RampCurve({ ramp }) {
  const max = Math.max(1, ...ramp.map(([, v]) => v));
  const pts = ramp.map(([u, v]) => `${u * 200},${40 - (v / max) * 36}`).join(' ');
  return (
    <svg class="ramp-curve" viewBox="0 0 200 42" preserveAspectRatio="none">
      <line x1="0" x2="200" y1={40 - 36 / max} y2={40 - 36 / max} class="ref" />
      <polyline points={pts} />
    </svg>
  );
}

function CrossfadeInspector({ clip }) {
  return (
    <div class="inspector panel">
      <div class="insp-head">
        <span class="type-dot t-audio" />
        <b>Audio Crossfade</b>
      </div>
      <div class="insp-body">
        <Section title="Crossfade">
          <Row label="Duration">
            <NumberField value={clip.axfade} min={0.05} max={10} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[clip.id].axfade = Math.round(v * 100) / 100))} onCommit={() => endTransient(true)} />
          </Row>
          <p class="hint">An equal power crossfade between the two clips. Press Delete to remove it. The default length is set in Preferences.</p>
        </Section>
      </div>
    </div>
  );
}

function ColorTab({ clip }) {
  const look = COLOR_LOOKS.find((l) => Object.entries(l.v).every(([k, v]) => Math.abs((clip.props[k] || 0) - v) < 1e-3 && !clip.kf?.[k]));
  return (
    <>
      <Section title="Looks">
        <div class="looks">
          {COLOR_LOOKS.map((l) => (
            <button
              key={l.id}
              class={`look look-${l.id}${look?.id === l.id ? ' active' : ''}`}
              onClick={() =>
                commit((q) => {
                  const c = q.clips[clip.id];
                  for (const [k, v] of Object.entries(l.v)) {
                    c.props[k] = v;
                    delete c.kf[k];
                  }
                })
              }
            >
              <span class="swatch" />
              {l.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Light">
        <Param clip={clip} prop="exposure" label="Exposure" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="contrast" label="Contrast" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="highlights" label="Highlights" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="shadows" label="Shadows" min={-100} max={100} scale={100} center={0} />
      </Section>
      <Section title="Color">
        <Param clip={clip} prop="saturation" label="Saturation" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="temperature" label="Temperature" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="tint" label="Tint" min={-100} max={100} scale={100} center={0} />
      </Section>
      <Section title="Color Wheels">
        <div class="wheels">
          <ColorWheel clip={clip} name="lift" label="Shadows" />
          <ColorWheel clip={clip} name="gamma" label="Midtones" />
          <ColorWheel clip={clip} name="gain" label="Highlights" />
        </div>
        <p class="hint">Drag the dot to tint an area, and the slider below to make it lighter or darker. Double click a wheel to reset it. The correction is calculated in 16-bit floating point, so 10-bit clips keep their smooth gradients.</p>
        <Button
          variant="secondary"
          icon={RotateCcw}
          onClick={() =>
            commit((q) => {
              const c = q.clips[clip.id];
              for (const k of Object.keys(GRADE_PROPS)) {
                c.props[k] = 0;
                delete c.kf[k];
              }
            })
          }
        >
          Reset Color
        </Button>
      </Section>
    </>
  );
}

// Fargehjul: punktet gir fargen (x og y), skyveknappen lysstyrken for området.
function ColorWheel({ clip, name, label }) {
  const ref = useRef(null);
  const x = clip.props[`${name}X`] || 0;
  const y = clip.props[`${name}Y`] || 0;
  const set = (patch) => updateTransient((q) => Object.assign(q.clips[clip.id].props, patch));
  const fromEvent = (e) => {
    const r = ref.current.getBoundingClientRect();
    let nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    let ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const d = Math.hypot(nx, ny);
    if (d > 1) {
      nx /= d;
      ny /= d;
    }
    // Finjustering: punktet flyttes mindre enn musen.
    return { [`${name}X`]: Math.round(nx * 0.6 * 1000) / 1000, [`${name}Y`]: Math.round(ny * 0.6 * 1000) / 1000 };
  };
  const onDown = (e) => {
    e.preventDefault();
    beginTransient();
    set(fromEvent(e));
    const move = (ev) => set(fromEvent(ev));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endTransient(true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = () =>
    commit((q) => {
      const c = q.clips[clip.id];
      for (const k of ['X', 'Y', 'L']) c.props[`${name}${k}`] = 0;
    });
  return (
    <div class="wheel-wrap">
      <div class="wheel" ref={ref} onPointerDown={onDown} onDblClick={reset} title={`${label}: drag to tint, double click to reset`}>
        <span class="puck" style={{ left: `${50 + (x / 0.6) * 50}%`, top: `${50 - (y / 0.6) * 50}%` }} />
      </div>
      <span class="wheel-label">{label}</span>
      <Slider value={clip.props[`${name}L`] || 0} min={-1} max={1} step={0.01} center={0} onInput={(v) => set({ [`${name}L`]: v })} onStart={beginTransient} onCommit={() => endTransient(true)} />
    </div>
  );
}

const LAYOUT_OPTIONS = [
  { value: 1, label: '1', title: 'Camera full screen' },
  { value: 2, label: '2', title: 'Screen only' },
  { value: 3, label: '3', title: 'Top left' },
  { value: 4, label: '4', title: 'Top right' },
  { value: 5, label: '5', title: 'Bottom left' },
  { value: 6, label: '6', title: 'Bottom right' },
];

function RecordingTab({ clip, media }) {
  const T = timeSig.value;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur);
  const s = sourceTime(clip, Tc);
  const layout = valueAt(clip, 'layout', Tc) ?? 6;
  const atSwitch = keyframeIndexAt(clip, 'layout', s, 0.05) >= 0;
  const hasCam = media?.streams?.camera?.hasVideo;
  const rec = media?.rec || {};
  const switches = (clip.kf.layout || []).filter(([t]) => t >= clip.in && t <= clip.in + clip.dur);
  return (
    <>
      {hasCam && (
        <Section title="Camera">
          <Row label="Show camera">
            <Toggle checked={clip.props.showCamera !== false} onChange={(v) => setProp(clip, { showCamera: v })} />
          </Row>
          <Row label="Layout at playhead" stacked>
            <Segmented
              value={layout}
              options={LAYOUT_OPTIONS}
              onChange={(v) =>
                commit((q) => {
                  const c = q.clips[clip.id];
                  if (!c.kf.layout) c.kf.layout = [[clip.in, layout]];
                  setKeyframe(c, 'layout', s, v);
                })
              }
            />
          </Row>
          <div class="switch-list">
            {switches.map(([t, v]) => (
              <button key={t} class={Math.abs(t - s) < 0.05 ? 'on' : ''} onClick={() => seek(clip.start + (t - clip.in))}>
                {formatShort(t - clip.in)} <b>{v}</b>
              </button>
            ))}
            {atSwitch && (
              <button class="danger" onClick={() => commit((q) => removeKeyframe(q.clips[clip.id], 'layout', s))}>
                Remove switch
              </button>
            )}
          </div>
          <Row label="Shape">
            <Segmented
              value={clip.props.pipShape}
              onChange={(v) => setProp(clip, { pipShape: v })}
              options={[
                { value: 'circle', label: 'Circle' },
                { value: 'square', label: 'Square' },
                { value: 'rect', label: '16:9' },
              ]}
            />
          </Row>
          <Row label="Size">
            <Segmented
              value={clip.props.pipSize}
              onChange={(v) => setProp(clip, { pipSize: v })}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </Row>
          <Row label="Mirror">
            <Toggle checked={clip.props.mirror} onChange={(v) => setProp(clip, { mirror: v })} />
          </Row>
        </Section>
      )}
      <Section title="Overlays">
        <Row label={`Keystrokes (${rec.keys?.length || 0})`}>
          <Toggle checked={clip.props.showKeys} onChange={(v) => setProp(clip, { showKeys: v })} />
        </Row>
        <Row label={`Cursor zoom (${rec.zooms?.length || 0})`}>
          <Toggle checked={clip.props.cursorZoom} onChange={(v) => setProp(clip, { cursorZoom: v })} />
        </Row>
        <Row label={`Click highlights (${rec.clicks?.length || 0})`}>
          <Toggle checked={clip.props.showClicks} onChange={(v) => setProp(clip, { showClicks: v })} />
        </Row>
        <p class="hint">Blade the clip (B or {window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl'} B) to turn overlays on or off for part of the recording.</p>
      </Section>
      <AudioComponentsSection clip={clip} />
      <Section title="Audio">
        {media?.streams?.camera?.hasAudio && <Param clip={clip} prop="micVolume" label="Microphone" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />}
        {media?.streams?.screen?.hasAudio && <Param clip={clip} prop="sysVolume" label="System audio" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />}
        {!media?.streams?.camera?.hasAudio && !media?.streams?.screen?.hasAudio && <p class="hint">This recording has no audio.</p>}
        <PlainNumber clip={clip} prop="aFadeIn" label="Fade in" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="aFadeOut" label="Fade out" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
      {!clip.props.audioDetached && (media?.streams?.camera?.hasAudio || media?.streams?.screen?.hasAudio) && <AudioEditSection clip={clip} />}
    </>
  );
}

function formatShort(t) {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/* Skrifter: innebygde valg pluss alle skrifter installert på maskinen */

const BUILTIN_FONTS = [
  { value: 'sans', label: 'System' },
  { value: 'rounded', label: 'System Rounded' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
];
const COMMON_FONTS = ['Arial', 'Helvetica Neue', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Futura', 'Avenir Next', 'Gill Sans', 'Segoe UI', 'Calibri', 'Roboto', 'Inter'];
const systemFonts = signal(null);

async function loadSystemFonts() {
  if (systemFonts.value) return;
  try {
    const list = await window.queryLocalFonts();
    systemFonts.value = [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  } catch {
    systemFonts.value = COMMON_FONTS;
  }
}

export function FontSelect({ value, onChange }) {
  const fonts = systemFonts.value || COMMON_FONTS;
  const options = [...BUILTIN_FONTS, ...fonts.map((f) => ({ value: f, label: f }))];
  if (!options.some((o) => o.value === value)) options.push({ value, label: value });
  return (
    <div onPointerDown={loadSystemFonts} style={{ width: '100%' }}>
      <Select value={value} options={options} onChange={onChange} />
    </div>
  );
}

function TextTab({ clip }) {
  const pr = clip.props;
  const id = clip.id;
  return (
    <>
      <Section title="Text">
        <textarea
          class="text-input"
          rows={2}
          value={pr.text}
          onKeyDown={(e) => e.stopPropagation()}
          onInput={(e) => updateTransient((q) => (q.clips[id].props.text = e.currentTarget.value))}
          onFocus={beginTransient}
          onBlur={() => endTransient(true)}
        />
        <input
          class="text-input"
          placeholder="Subtitle (optional)"
          value={pr.subtext}
          onKeyDown={(e) => e.stopPropagation()}
          onInput={(e) => updateTransient((q) => (q.clips[id].props.subtext = e.currentTarget.value))}
          onFocus={beginTransient}
          onBlur={() => endTransient(true)}
        />
      </Section>
      <Section title="Style">
        <Row label="Layout">
          <Select value={pr.style} options={TITLE_STYLES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setProp(clip, { style: v })} />
        </Row>
        <Row label="Font" stacked>
          <FontSelect value={pr.font} onChange={(v) => setProp(clip, { font: v })} />
        </Row>
        <Row label="Size">
          <NumberField value={pr.size} min={8} max={400} unit="pt" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[id].props.size = v))} onCommit={() => endTransient(true)} />
        </Row>
        <Row label="Weight">
          <Segmented
            value={pr.weight}
            onChange={(v) => setProp(clip, { weight: v })}
            options={[
              { value: 400, label: 'Regular' },
              { value: 600, label: 'Semibold' },
              { value: 800, label: 'Bold' },
            ]}
          />
        </Row>
        <Row label="Color">
          <ColorField value={pr.color} onLive={(v) => updateTransient((q) => (q.clips[clip.id].props.color = v))} />
        </Row>
        {pr.style === 'lower' && (
          <Row label="Accent">
            <ColorField value={pr.accent} onLive={(v) => updateTransient((q) => (q.clips[clip.id].props.accent = v))} />
          </Row>
        )}
        <Row label={pr.style === 'card' ? 'Background color' : 'Background'}>
          {pr.style !== 'card' && <Toggle checked={pr.bg} onChange={(v) => setProp(clip, { bg: v })} />}
          {(pr.bg || pr.style === 'card') && <ColorField value={pr.bgColor} onLive={(v) => updateTransient((q) => (q.clips[clip.id].props.bgColor = v))} />}
        </Row>
        <Row label="Build in and out">
          <Select
            value={pr.anim}
            options={[
              { value: 'none', label: 'None' },
              { value: 'fade', label: 'Fade' },
              { value: 'slide', label: 'Slide up' },
              { value: 'pop', label: 'Pop' },
              { value: 'type', label: 'Typewriter' },
            ]}
            onChange={(v) => setProp(clip, { anim: v })}
          />
        </Row>
      </Section>
    </>
  );
}

// Fargevelger: oppdateres mens du drar, og blir ett angresteg når du er ferdig.
function ColorField({ value, onLive }) {
  return (
    <input
      type="color"
      class="color"
      value={value}
      onFocus={beginTransient}
      onInput={(e) => onLive(e.currentTarget.value)}
      onChange={(e) => {
        onLive(e.currentTarget.value);
        endTransient(true);
      }}
      onBlur={() => endTransient(true)}
    />
  );
}

/* Undertekster */

function captionLines(text, max) {
  return String(text).split('\n').slice(0, max).join('\n');
}

export function CaptionStyleEditor() {
  const p = project.value;
  const st = { ...DEFAULT_CAPTION_STYLE, ...p.captionStyle };
  const set = (patch) => commit((q) => (q.captionStyle = { ...DEFAULT_CAPTION_STYLE, ...q.captionStyle, ...patch }));
  const live = (patch) => updateTransient((q) => (q.captionStyle = { ...DEFAULT_CAPTION_STYLE, ...q.captionStyle, ...patch }));
  return (
    <>
      <Row label="Font" stacked>
        <FontSelect value={st.font} onChange={(v) => set({ font: v })} />
      </Row>
      <Row label="Size">
        <NumberField value={st.size} min={12} max={160} unit="pt" onStart={beginTransient} onChange={(v) => live({ size: Math.round(v) })} onCommit={() => endTransient(true)} />
      </Row>
      <Row label="Weight">
        <Segmented
          value={st.weight}
          onChange={(v) => set({ weight: v })}
          options={[
            { value: 400, label: 'Regular' },
            { value: 600, label: 'Semibold' },
            { value: 800, label: 'Bold' },
          ]}
        />
      </Row>
      <Row label="Text color">
        <ColorField value={st.color} onLive={(v) => live({ color: v })} />
      </Row>
      <Row label="Outline">
        <ColorField value={st.outlineColor} onLive={(v) => live({ outlineColor: v })} />
        <NumberField value={st.outlineWidth} min={0} max={20} step={0.5} precision={1} unit="px" onStart={beginTransient} onChange={(v) => live({ outlineWidth: v })} onCommit={() => endTransient(true)} />
      </Row>
      <Row label="Background">
        <Toggle checked={st.bg} onChange={(v) => set({ bg: v })} />
        {st.bg && <ColorField value={st.bgColor} onLive={(v) => live({ bgColor: v })} />}
      </Row>
      {st.bg && (
        <Row label="Background opacity">
          <NumberField value={Math.round(st.bgOpacity * 100)} min={0} max={100} unit="%" onStart={beginTransient} onChange={(v) => live({ bgOpacity: v / 100 })} onCommit={() => endTransient(true)} />
        </Row>
      )}
      <Row label="Shadow">
        <Toggle checked={st.shadow} onChange={(v) => set({ shadow: v })} />
      </Row>
      <Row label="Alignment">
        <Segmented
          value={st.align}
          onChange={(v) => set({ align: v })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Row>
      <Row label="Position">
        <Segmented
          value={st.position}
          onChange={(v) => set({ position: v })}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'middle', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </Row>
      {st.position === 'custom' && (
        <div class="wh-row">
          <NumberField value={st.x} min={0} max={100} unit="% X" width={84} onStart={beginTransient} onChange={(v) => live({ x: v })} onCommit={() => endTransient(true)} />
          <NumberField value={st.y} min={0} max={100} unit="% Y" width={84} onStart={beginTransient} onChange={(v) => live({ y: v })} onCommit={() => endTransient(true)} />
        </div>
      )}
      <Row label="Max lines">
        <Segmented value={st.maxLines} onChange={(v) => set({ maxLines: v })} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
      </Row>
    </>
  );
}

function CaptionTab({ clip }) {
  const p = project.value;
  const st = { ...DEFAULT_CAPTION_STYLE, ...p.captionStyle };
  const id = clip.id;
  const pos = clip.props.pos;
  return (
    <>
      <Section title="Caption">
        <textarea
          class="text-input caption-text"
          rows={st.maxLines}
          value={clip.props.text}
          placeholder={`Type up to ${st.maxLines} lines. Press Return for a new line.`}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && String(clip.props.text).split('\n').length >= st.maxLines) e.preventDefault();
          }}
          onInput={(e) => updateTransient((q) => (q.clips[id].props.text = captionLines(e.currentTarget.value, st.maxLines)))}
          onFocus={beginTransient}
          onBlur={() => endTransient(true)}
        />
        <Row label="Start">
          <NumberField value={clip.start} min={0} max={36000} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[id].start = Math.max(0, v)))} onCommit={() => endTransient(true)} />
        </Row>
        <Row label="Duration">
          <NumberField value={clip.dur} min={0.2} max={60} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[id].dur = Math.max(0.2, v)))} onCommit={() => endTransient(true)} />
        </Row>
      </Section>
      <Section title="This caption">
        <Row label="Alignment">
          <Segmented
            value={clip.props.align || 'style'}
            onChange={(v) => setProp(clip, { align: v === 'style' ? null : v })}
            options={[
              { value: 'style', label: 'Default' },
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Row>
        <Row label="Own position">
          <Toggle checked={Boolean(pos)} onChange={(v) => setProp(clip, { pos: v ? { x: st.x, y: st.position === 'top' ? 10 : st.position === 'middle' ? 50 : 88 } : null })} />
        </Row>
        {pos && (
          <div class="wh-row">
            <NumberField value={pos.x} min={0} max={100} unit="% X" width={84} onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[id].props.pos = { ...q.clips[id].props.pos, x: v }))} onCommit={() => endTransient(true)} />
            <NumberField value={pos.y} min={0} max={100} unit="% Y" width={84} onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[id].props.pos = { ...q.clips[id].props.pos, y: v }))} onCommit={() => endTransient(true)} />
          </div>
        )}
        <p class="hint">You can also drag the caption in the viewer to place it.</p>
      </Section>
      <Section title="Style for all captions" open={false}>
        <CaptionStyleEditor />
      </Section>
    </>
  );
}

// Farge og arbeidsfiler: bitdybde, HDR, RAW og optimalisert media.
function MediaColorRows({ media }) {
  const st = Object.values(media.streams).find((x) => x.hasVideo);
  const color = st?.color;
  const working = st?.optimized ? 'Optimized media' : st?.proxy && media.kind !== 'image' ? (color?.hdr ? 'Tone mapped copy' : 'Playable copy') : 'Original';
  return (
    <>
      {color && (
        <Row label="Color">
          <span class="value">
            {color.bits}-bit{color.hdr ? `, HDR ${color.hdr === 'pq' ? 'PQ' : 'HLG'}, shown tone mapped` : color.primaries === 'bt2020' ? ', Rec. 2020' : ', SDR'}
          </span>
        </Row>
      )}
      {media.raw && (
        <Row label="RAW">
          <span class="value">Embedded full size camera preview</span>
        </Row>
      )}
      {st && media.kind !== 'image' && (
        <Row label="Playback uses">
          <span class="value">{working}</span>
        </Row>
      )}
    </>
  );
}

function InfoTab({ clip, media }) {
  return (
    <Section title="Info">
      <Row label="Start">
        <span class="value">{clip.start.toFixed(2)} s</span>
      </Row>
      <Row label="Duration">
        {isElastic(clip) ? (
          <NumberField value={clip.dur} min={0.1} max={3600} step={0.1} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setClipDuration(q, clip.id, v))} onCommit={() => endTransient(true)} />
        ) : (
          <span class="value">{clip.dur.toFixed(2)} s</span>
        )}
      </Row>
      {media && (
        <>
          <Row label="File">
            <span class="value path" title={media.path}>
              {media.name}
            </span>
          </Row>
          {media.width > 0 && (
            <Row label="Resolution">
              <span class="value">
                {media.width} × {media.height}
              </span>
            </Row>
          )}
          <MediaColorRows media={media} />
        </>
      )}
      <Row label="Lane">
        <span class="value">{clip.lane === 0 ? 'Storyline' : clip.lane === CAPTION_LANE ? 'Captions' : clip.lane > 0 ? `Lane ${clip.lane}` : `Audio ${-clip.lane}`}</span>
      </Row>
    </Section>
  );
}

function TransitionInspector({ clip }) {
  const t = clip.transition;
  return (
    <div class="inspector panel">
      <div class="insp-head">
        <span class="type-dot t-transition" />
        <b>Transition</b>
      </div>
      <div class="insp-body">
        <Section title="Transition">
          <Row label="Type">
            <Select value={t.type} options={TRANSITIONS.map((x) => ({ value: x.id, label: x.label }))} onChange={(v) => commit((q) => setTransition(q, clip.id, v, t.dur))} />
          </Row>
          <Row label="Duration">
            <NumberField value={t.dur} min={0.1} max={4} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setTransition(q, clip.id, t.type, v))} onCommit={() => endTransient(true)} />
          </Row>
          <p class="hint">Press Delete to remove it. The transition sits over the cut and uses extra frames before and after when the clips have them.</p>
        </Section>
      </div>
    </div>
  );
}

export const FORMATS = [
  { value: '3840x2160', label: '4K UHD (3840 × 2160)' },
  { value: '2560x1440', label: '1440p (2560 × 1440)' },
  { value: '1920x1080', label: '1080p HD (1920 × 1080)' },
  { value: '1280x720', label: '720p HD (1280 × 720)' },
  { value: '1080x1920', label: 'Vertical (1080 × 1920)' },
  { value: '1080x1350', label: 'Portrait 4:5 (1080 × 1350)' },
  { value: '1080x1080', label: 'Square (1080 × 1080)' },
];

export function ProjectSettings() {
  const p = project.value;
  const current = `${p.width}x${p.height}`;
  const fmt = !p.customFormat && FORMATS.some((f) => f.value === current) ? current : 'custom';
  const fpsList = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  return (
    <>
      <Row label="Name" stacked>
        <input
          class="text-input"
          value={p.name}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onChange={(e) => {
            const name = e.currentTarget.value.trim();
            if (name) commit((q) => (q.name = name));
          }}
        />
      </Row>
      <Row label="Format" stacked>
        <Select
          value={fmt}
          options={[...FORMATS, { value: 'custom', label: fmt === 'custom' ? `Custom (${p.width} × ${p.height})` : 'Custom size' }]}
          onChange={(v) => {
            const [w, h] = v === 'custom' ? [p.width, p.height] : v.split('x').map(Number);
            commit((q) => {
              q.width = w;
              q.height = h;
              q.autoFormat = false;
              if (v === 'custom') q.customFormat = true;
              else delete q.customFormat;
            });
          }}
        />
      </Row>
      {fmt === 'custom' && (
        <div class="wh-row">
          <NumberField value={p.width} min={16} max={8192} step={2} unit="W" width={84} onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.width = Math.max(16, Math.round(v / 2) * 2)))} onCommit={() => endTransient(true)} />
          <span class="dim">×</span>
          <NumberField value={p.height} min={16} max={8192} step={2} unit="H" width={84} onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.height = Math.max(16, Math.round(v / 2) * 2)))} onCommit={() => endTransient(true)} />
        </div>
      )}
      <Row label="Frame rate">
        <Select
          value={fpsList.includes(p.fps) ? String(p.fps) : 'custom'}
          options={[...fpsList.map((f) => ({ value: String(f), label: `${f} fps` })), { value: 'custom', label: fpsList.includes(p.fps) ? 'Custom' : `Custom (${p.fps})` }]}
          onChange={(v) => commit((q) => (q.fps = v === 'custom' ? 15 : Number(v)))}
        />
      </Row>
      {!fpsList.includes(p.fps) && (
        <Row label="Custom frame rate">
          <NumberField value={p.fps} min={1} max={120} precision={2} onChange={(v) => commit((q) => (q.fps = Math.round(v * 100) / 100))} />
        </Row>
      )}
    </>
  );
}

function ProjectInspector() {
  const p = project.value;
  return (
    <div class="inspector panel">
      <div class="insp-head">
        <b>Project</b>
        <IconButton icon={Plus} title="New project from template" onClick={() => (newProjectOpen.value = true)} />
      </div>
      <div class="insp-body">
        <Section title="Project settings" collapsible={false}>
          <ProjectSettings />
          <Row label="Duration">
            <span class="value">{p.duration.toFixed(1)} s</span>
          </Row>
          <Row label="Clips">
            <span class="value">{Object.keys(p.clips).length}</span>
          </Row>
          <p class="hint">Clips scale to fit a new format automatically. Use Scale and Position in the Video tab to reframe them.</p>
        </Section>
        <p class="hint pad">Select a clip on the timeline to see its properties.</p>
      </div>
    </div>
  );
}

