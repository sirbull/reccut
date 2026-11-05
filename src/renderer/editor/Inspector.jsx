import { PATTERN_SHAPES, PATTERN_DISTRIBUTIONS, patternClipProps } from '../../shared/designPattern.js';
import { baseValueAt } from '../../shared/model.js';
import { ExpressionControls } from './ExpressionControls.jsx';
// Inspektøren viser egenskapene til valgt klipp, med nøkkelbilder og myke overganger.
import { ProcessorEffects } from './ProcessorEffects.jsx';
import { RemoveEffectButton } from './RemoveEffectButton.jsx';
import { VideoEffects } from './VideoEffects.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { ArrowDown, ArrowUp, Captions, ChevronLeft, ChevronRight, Circle, Diamond, EyeOff, Film, PenTool, RectangleHorizontal, SquareDashed, Gauge, Info, MonitorPlay, Palette, Plus, RotateCcw, Sparkles, Trash2, Type, Volume2, Wand2 } from 'lucide-preact';
import {
  audioComponents,
  FRAME_RATES,
  CLIP_COLORS,
  componentVolumeProp,
  ANIMATION_PRESETS,
  RAMP_PRESETS,
  CAPTION_LANE,
  CAMERA_COLOR_PROPS,
  COLOR_LOOKS,
  DEFAULT_CAPTION_STYLE,
  EASINGS,
  EFFECTS,
  SHADOW_DEFAULTS,
  REDACT_MODES,
  REDACT_SHAPES,
  redactLabel,
  TITLE_STYLES,
  TRANSITIONS,
  parseTransitionSelection,
  applyAnimationPreset,
  clipHasAudio,
  defaultProps,
  formatTimecode,
  titleText,
  isElastic,
  isVisual,
  keyframeIndexAt,
  kfTime,
  kfToTimeline,
  removeKeyframe,
  setKeyframeEase,
  sourceTime,
  valueAt,
} from '../../shared/model.js';
import { shadowStyle } from '../../shared/shadow.js';
import { IMAGE_FITS, KEN_BURNS_MODES, enableKenBurns } from '../../shared/imageMotion.js';
import { recordingChildren, setClipDuration, setSpeed, setTransition } from '../../shared/ops.js';
import { GRADE_PROPS, CAMERA_LOGS } from '../../shared/grade.js';
import { FILM_LOOKS } from '../../shared/filmLooks.js';
import { BUILTIN_TEMPLATES, findTemplate, templateDefaults } from '../../shared/titletemplates.js';
import { beginTransient, commit, endPreview, projectPath, renameProject, endTransient, enterGroup, getWave, mirror, previewEdit, motionVersion, project, selectedClips, selectedGroup, selectedTransition, selection, tasks, timeSig, updateTransient, waveVersion } from './store.js';
import { groupPositionClips, groupVisuals, setGroupOpacity, setGroupPosition } from '../../shared/groupSettings.js';
import { seek } from './playback.js';
import { setKeyframe } from './keyframes.js';
import { addEffect, addMaskToSelected, applyFilm, previewFilm, attachPip, detachPip, separatePipTrack, browserTab, browserFocus, browserPicked, browserSelection, browserRange, captionEditRequest, deleteMask, penMode, startPen, inspectorTab, newProjectOpen, selectedMask, reanalyzeMotion, stabilizeSelected, toggleComponent } from './commands.js';
import { prefs } from '../prefs.js';
import { STAB_DEFAULTS, getMotion, stabilizeAt } from '../../shared/stabilize.js';
import { attachToTrack, deleteTrack, detach, removeTrackingKeyframes, trackArea, trackForward, trackRedaction, tracksFor } from './track.js';
import { AUDIO_EFFECTS, AUDIO_PRESETS, EQ_BANDS, EQ_PRESETS, biquadResponse, eqCoefs, makeEffect, presetEffects } from '../../shared/audiofx.js';
import { MASK_MODES, MASK_SHAPES, canMask, defaultPoints, ellipsePoints, maskKey, maskList, setMaskShape } from '../../shared/shapes.js';
import { Button, IconButton, NumberField, Row, Section, Segmented, Select, Slider, Toggle } from '../ui.jsx';

export function Inspector() {
  const clips = selectedClips.value;
  const transId = selectedTransition.value;
  const p = project.value;

  const source = browserTab.value === 'media' && browserFocus.value && browserPicked.value.includes(browserSelection.value) && p.media[browserSelection.value];
  if (source) return <MediaInspector key={source.id} media={source} />;

  if (transId?.startsWith('ax:') && p.clips[transId.slice(3)]?.axfade) return <CrossfadeInspector clip={p.clips[transId.slice(3)]} />;
  const transition = parseTransitionSelection(transId);
  if (transId && p.clips[transition.id]?.[transition.key]) return <TransitionInspector clip={p.clips[transition.id]} edge={transition.edge} />;
  if (clips.length) return <ClipInspector clip={clips[0]} clips={clips} group={Boolean(selectedGroup.value)} />;
  return <ProjectInspector />;
}

function GroupVideoTab({ clips }) {
  const p = project.value;
  const ids = clips.map((c) => c.id);
  const visuals = groupVisuals(p, ids);
  const positioned = groupPositionClips(p, ids);
  const T = timeSig.value;
  const field = (label, value, min, max, unit, change) => <Row label={label}>
    <NumberField value={value} min={min} max={max} unit={unit} precision={unit === '%' ? 1 : 0}
      onStart={beginTransient} onChange={(v) => updateTransient((q) => change(q, v))} onCommit={() => endTransient(true)} />
  </Row>;
  return <>
      {!!visuals.length && <Section title="Compositing">
        {field('Opacity', (valueAt(visuals[0], 'opacity', T) ?? 1) * 100, 0, 100, '%', (q, v) => setGroupOpacity(q, ids, v / 100, T))}
        <p class="hint">Applies to the group’s visual clips. The value shown is from the first visual clip.</p>
      </Section>}
      {!!positioned.length && <Section title="Transform">
        {field('Position X', valueAt(positioned[0], 'x', T) ?? 0, -p.width, p.width, 'px', (q, v) => setGroupPosition(q, ids, 'x', v, T))}
        {field('Position Y', valueAt(positioned[0], 'y', T) ?? 0, -p.height, p.height, 'px', (q, v) => setGroupPosition(q, ids, 'y', v, T))}
        <p class="hint">Moves the clips together, preserving their offsets and animation.</p>
      </Section>}
  </>;
}

function MediaInspector({ media }) {
  const p = project.value;
  const range = browserRange.value?.mediaId === media.id ? browserRange.value : null;
  const stream = media.streams.screen || media.streams.main || media.streams.camera;
  const duration = media.kind === 'image' ? prefs.value.stillDur : media.duration;
  const hasAudio = media.kind !== 'audio' && Object.values(media.streams).some((s) => s.hasAudio);
  return (
    <div class="inspector panel">
      <div class="insp-head"><Info size={16} /><b title={media.name}>{media.name}</b></div>
      <div class="insp-body">
        <Section title="Media properties" collapsible={false}>
          <InfoRow label="Name">{media.name}</InfoRow>
          <InfoRow label="Type">{media.kind === 'recording' ? 'Recording' : media.kind === 'audio' ? 'Audio' : media.kind === 'image' ? 'Image' : 'Video'}</InfoRow>
          <InfoRow label="Duration">{fmtTc(duration, p.fps)}</InfoRow>
          <InfoRow label="Source in">{fmtTc(range?.in || 0, p.fps)}</InfoRow>
          <InfoRow label="Source out">{fmtTc(range?.out ?? duration, p.fps)}</InfoRow>
          {range && <InfoRow label="Selected duration">{fmtTc(range.out - range.in, p.fps)}</InfoRow>}
          {stream?.width && stream?.height && <InfoRow label="Resolution">{`${stream.width} × ${stream.height}`}</InfoRow>}
          <InfoRow label="Frame rate">{(stream?.fps || media.fps) ? `${stream?.fps || media.fps} fps` : null}</InfoRow>
          {hasAudio && <Row label="Include audio">
            <input type="checkbox" aria-label="Include audio when adding to the timeline" checked={media.includeAudio !== false} onChange={(e) => {
              const checked = e.currentTarget.checked;
              commit((q) => { q.media[media.id].includeAudio = checked; });
            }} />
          </Row>}
          {hasAudio && <p class="hint">Include the clip’s audio when adding it to the timeline.</p>}
        </Section>
        <Section title="File">
          <InfoRow label="Location" title={media.path}>{media.path}</InfoRow>
          <InfoRow label="Status">{media.offline ? 'Offline' : 'Available'}</InfoRow>
          <MediaColorRows media={media} />
          <div class="info-actions"><Button variant="secondary" class="small" disabled={media.offline} onClick={() => window.api.reveal(media.path)}>
            {window.api.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Explorer'}
          </Button></div>
        </Section>
      </div>
    </div>
  );
}

// Fanene som i Final Cut Pro: et ikon for hver del, og klippet velges bare ved å markere det.
function tabsFor(clip, media) {
  const tabs = [];
  if (clip.type === 'title' && !clip.props.patternKind) tabs.push({ id: 'text', label: 'Text', icon: Type });
  if (clip.type === 'caption') tabs.push({ id: 'caption', label: 'Caption', icon: Captions });
  if (clip.type === 'recording') tabs.push({ id: 'recording', label: 'Recording', icon: MonitorPlay });
  if (clip.type === 'redact') tabs.push({ id: 'redact', label: 'Redact', icon: EyeOff });
  if (isVisual(clip) && clip.type !== 'gap' && clip.type !== 'redact') tabs.push({ id: 'video', label: 'Video', icon: Film });
  if (clip.type === 'video' || clip.type === 'image' || clip.type === 'recording' || clip.type === 'adjustment') tabs.push({ id: 'color', label: 'Color', icon: Palette });
  if (clip.type === 'video' || clip.type === 'image' || clip.type === 'recording' || clip.type === 'title' || clip.type === 'adjustment') tabs.push({ id: 'effects', label: 'Effects', icon: Wand2 });
  if (canMask(clip)) tabs.push({ id: 'masks', label: 'Masks', icon: SquareDashed });
  if (clipHasAudio(clip, media)) tabs.push({ id: 'audio', label: 'Audio', icon: Volume2 });
  if (['video', 'recording', 'audio'].includes(clip.type)) tabs.push({ id: 'speed', label: clip.speed === 0 ? 'Freeze' : 'Speed', icon: Gauge });
  tabs.push({ id: 'info', label: 'Info', icon: Info });
  return tabs;
}

// Fanene som gir mening for flere klipp samtidig. Endringene i dem kopieres til alle (mirror i store.js).
const MULTI_TABS = ['video', 'color', 'effects', 'audio'];

function ClipInspector({ clip, clips = [clip], group = false }) {
  const p = project.value;
  const media = p.media[clip.mediaId];
  const multi = clips.length > 1;
  const tabs = multi
    ? tabsFor(clip, media).filter((t) => MULTI_TABS.includes(t.id) && clips.every((c) => tabsFor(c, p.media[c.mediaId]).some((x) => x.id === t.id)))
    : tabsFor(clip, media);
  if (group && groupVisuals(p, clips.map((c) => c.id)).length && !tabs.some((t) => t.id === 'video')) tabs.unshift({ id: 'video', label: 'Video', icon: Film });
  const tab = tabs.find((t) => t.id === inspectorTab.value) ? inspectorTab.value : tabs[0]?.id;
  const title = group ? `Group · ${clips.length} clips` : multi ? `${clips.length} clips selected` : clip.type === 'title' ? titleText(clip) : clip.type === 'redact' ? redactLabel(clip) : clip.type === 'caption' ? 'Caption' : clip.type === 'gap' ? 'Gap' : clip.name || media?.name || 'Clip';
  const ids = clips.map((c) => c.id).join();
  useLayoutEffect(() => {
    if (!multi || (group && tab === 'video')) return;
    mirror.from = clip.id;
    mirror.to = clips.slice(1).map((c) => c.id);
    return () => {
      mirror.from = null;
      mirror.to = [];
    };
  }, [ids, group, tab]);
  const mediaIds = [...new Set(clips.map((c) => c.mediaId).filter((id) => p.media[id] && p.media[id].kind !== 'audio'))];

  return (
    <div class="inspector panel">
      <div class="insp-tabs">
        {tabs.map((t) => (
          <button key={t.id} data-tab={t.id} class={tab === t.id ? 'active' : ''} title={t.label} onClick={() => (inspectorTab.value = t.id)}>
            <t.icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div class="insp-head">
        <span class={`type-dot t-${clip.type}`} style={clip.colorLabel ? { background: CLIP_COLORS.find((c) => c.id === clip.colorLabel)?.color } : undefined} />
        <b title={title}>{title}</b>
        <Toggle checked={clips.every((c) => c.enabled)} onChange={(v) => commit((q) => clips.forEach((c) => q.clips[c.id] && (q.clips[c.id].enabled = v)))} />
      </div>
      <div class="insp-body">
        {group ? <>
          <p class="hint">Change shared settings here, or double click a clip to edit the group’s contents.</p>
          <Button class="small" onClick={() => enterGroup(clip.id)}>Edit Group</Button>
        </> : multi && <p class="hint">{tabs.length ? 'Changes apply to all selected clips. The values shown are from the first clip.' : 'These clips have no settings in common.'}</p>}
        {tab === 'text' && <TextTab clip={clip} />}
        {tab === 'caption' && <CaptionTab clip={clip} />}
        {tab === 'recording' && <RecordingTab clip={clip} media={media} />}
        {tab === 'video' && (group ? <GroupVideoTab clips={clips} /> : <VideoTab clip={clip} />)}
        {tab === 'redact' && <RedactTab clip={clip} />}
        {tab === 'masks' && <MasksTab clip={clip} />}
        {tab === 'effects' && <EffectsTab clip={clip} multi={multi} />}
        {tab === 'audio' && <AudioTab clip={clip} />}
        {tab === 'color' && <ColorTab clip={clip} mediaIds={multi ? mediaIds : null} />}
        {tab === 'speed' && <SpeedTab clip={clip} />}
        {tab === 'info' && <InfoTab clip={clip} media={media} />}
      </div>
    </div>
  );
}

/* Egenskaper med nøkkelbilder */

// Mens Alt/Option holdes får navn og diamanter som støtter expressions en ƒx-peker (se .alt-held i app.css).
const altHeld = (on) => document.documentElement.classList.toggle('alt-held', on);
addEventListener('keydown', (e) => altHeld(e.altKey));
addEventListener('keyup', (e) => altHeld(e.altKey));
addEventListener('blur', () => altHeld(false));

function setValue(c, prop, v, T) {
  if (c.kf?.[prop]?.length) setKeyframe(c, prop, kfTime(c, T), v);
  else c.props[prop] = v;
}

export function Param({ clip, prop, label, min, max, step = 1, unit = '', precision = 0, scale = 1, slider = true, center, keyframes = true, def }) {
  const [expressionOpen, setExpressionOpen] = useState(false);
  const expression = clip.expressions?.[prop];
  const expressionActive = expression && expression.enabled !== false;
  const canExpress = keyframes && prop !== 'layout';
  const T = timeSig.value;
  const inside = T >= clip.start && T <= clip.start + clip.dur;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur);
  const raw = baseValueAt(clip, prop, Tc) ?? def ?? 0;
  const value = raw * scale;
  const s = kfTime(clip, Tc);
  const list = clip.kf?.[prop] || [];
  const kfIndex = keyframeIndexAt(clip, prop, s);
  const atKf = kfIndex >= 0;
  const id = clip.id;
  const apply = (v) => updateTransient((q) => setValue(q.clips[id], prop, v / scale, Tc));
  const prev = list.filter(([t]) => t < s - 1e-3).at(-1);
  const next = list.find(([t]) => t > s + 1e-3);
  const goto = (t) => seek(kfToTimeline(clip, t));
  const fallback = def ?? (clip.props.patternKind ? patternClipProps(clip.props.patternKind)[prop] : undefined) ?? defaultProps(clip.type)[prop] ?? 0;
  const isDefault = !expression && !list.length && raw === fallback;

  return (
    <>
      <div class="param" data-prop={prop}>
        <span class={`param-label${canExpress ? ' can-express' : ''}`} title={canExpress ? `${label} · Alt/Option-click for expressions` : label}
          role={canExpress ? 'button' : undefined} tabIndex={canExpress ? 0 : undefined}
          onClick={e=>{if(canExpress && e.altKey){e.preventDefault();setExpressionOpen(v=>!v);}}}
          onKeyDown={e=>{if(canExpress && e.altKey && ['Enter',' '].includes(e.key)){e.preventDefault();setExpressionOpen(v=>!v);}}}>
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
              class={`kf-btn${atKf ? ' on' : list.length ? ' has' : ''}${expressionActive ? ' expression' : ''}${canExpress ? ' can-express' : ''}`}
              disabled={!inside}
              title={`${atKf ? 'Remove keyframe' : 'Add keyframe at the playhead'}${expressionActive ? ` · Active expression: ${expression.preset}` : ''} · Alt/Option-click for expressions`}
              onClick={e => {
                if(e.altKey && canExpress){e.preventDefault();setExpressionOpen(v=>!v);return;}
                commit((q) => {
                  const c = q.clips[id];
                  if (atKf) removeKeyframe(c, prop, s);
                  else setKeyframe(c, prop, s, raw);
                });
              }}
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
              if(c.expressions) delete c.expressions[prop];
              c.props[prop] = fallback;
            })
          }
        />
      </div>
      {canExpress && expression && !expressionOpen && <div class="ease-row"><button class="link" onClick={()=>setExpressionOpen(true)}>ƒx {expression.preset}{expression.enabled===false?' (disabled)':''}</button></div>}
      {canExpress && expressionOpen && <ExpressionControls clip={clip} prop={prop} min={min} max={max} scale={scale} baseValue={raw} onClose={()=>setExpressionOpen(false)}/>}
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
      {clip.props.patternKind && <PatternSection clip={clip}/>}
      {clip.type === 'image' && <Section title="Image framing & motion" data-section="image-motion">
        <Row label="Fit"><Select value={clip.props.imageFit || 'contain'} options={IMAGE_FITS}
          onChange={(imageFit) => commit((q) => { q.clips[clip.id].props.imageFit = imageFit; })} /></Row>
        <Row label="Ken Burns"><Toggle checked={Boolean(clip.props.kenBurns)} onChange={(on) => commit((q) => {
          const c = q.clips[clip.id]; if (on) enableKenBurns(c, c.props.kenBurnsMode, c.props.kenBurnsAmount); else c.props.kenBurns = false;
        })} /></Row>
        {clip.props.kenBurns && <>
          <Row label="Movement"><Select value={clip.props.kenBurnsMode || 'in'} options={KEN_BURNS_MODES}
            onChange={(mode) => commit((q) => { q.clips[clip.id].props.kenBurnsMode = mode; })} /></Row>
          <Param clip={clip} prop="kenBurnsAmount" label="Zoom / travel" min={1} max={60} scale={100} unit="%" keyframes={false} />
          <p class="hint">Slow, eased motion across the image. Crop and ordinary Transform controls remain available.</p>
        </>}
      </Section>}
      <Section title="Compositing">
        <Param clip={clip} prop="opacity" label={clip.type === 'adjustment' ? 'Layer strength' : 'Opacity'} min={0} max={100} scale={100} unit="%" />
        {clip.type === 'adjustment' && <p class="hint">Processes the combined picture on lower video tracks during this layer’s duration. Clips above it and captions stay unchanged. Use Color, Effects and Masks to build the look.</p>}
      </Section>
      {clip.type !== 'adjustment' && <Section title="Transform">
        <Param clip={clip} prop="x" label="Position X" min={-p.width} max={p.width} unit="px" slider={false} />
        <Param clip={clip} prop="y" label="Position Y" min={-p.height} max={p.height} unit="px" slider={false} />
        <Param clip={clip} prop="scale" label="Scale" min={10} max={400} scale={100} unit="%" />
        <Param clip={clip} prop="rotation" label="Rotation" min={-180} max={180} unit="°" center={0} />
        <p class="hint">Drag the clip in the viewer to move it. Alt/Option-click a property name or diamond to choose an expression.</p>
      </Section>}
      {(clip.type === 'video' || clip.type === 'recording') && <TrackSection clip={clip} />}
      {clip.type !== 'adjustment' && clip.lane > 0 && <FollowSection clip={clip} />}
      {clip.type === 'video' && <StabilizeSection clip={clip} />}
      {(clip.type === 'video' || clip.type === 'image') && (
        <Section title="Crop">
          <Param clip={clip} prop="cropL" label="Left" min={0} max={49} scale={100} unit="%" />
          <Param clip={clip} prop="cropR" label="Right" min={0} max={49} scale={100} unit="%" />
          <Param clip={clip} prop="cropT" label="Top" min={0} max={49} scale={100} unit="%" />
          <Param clip={clip} prop="cropB" label="Bottom" min={0} max={49} scale={100} unit="%" />
        </Section>
      )}
      {clip.type !== 'adjustment' && <AnimationPresets clip={clip} />}
      <Section title="Fade">
        <PlainNumber clip={clip} prop="vFadeIn" label="Fade in" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="vFadeOut" label="Fade out" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
    </>
  );
}

function PatternChoice({ clip, prop, label, options, color = false }) {
  const T = Math.max(clip.start, Math.min(timeSig.value, clip.start + clip.dur)), s = kfTime(clip, T);
  const value = valueAt(clip, prop, T) ?? clip.props[prop], at = keyframeIndexAt(clip, prop, s) >= 0;
  const set = v => commit(q => setValue(q.clips[clip.id], prop, v, T));
  return <Row label={label}>
    {color ? <ColorField value={value} onLive={v=>updateTransient(q=>setValue(q.clips[clip.id],prop,v,T))}/> : <Select value={value} options={options} onChange={set}/>}
    <button class={`kf-btn${at?' on':clip.kf?.[prop]?.length?' has':''}`} title={at?'Remove keyframe':`Keyframe ${label} at the playhead`} onClick={()=>commit(q=>{
      const c=q.clips[clip.id];if(at)removeKeyframe(c,prop,s);else setKeyframe(c,prop,s,value);
    })}><Diamond size={11}/></button>
  </Row>;
}

function PatternSection({ clip }) {
  const kind = valueAt(clip, 'patternKind', timeSig.value);
  const number = (key,label,min,max,step=1,scale=1) => <Param clip={clip} prop={`pattern.${key}`} label={label} min={min} max={max} step={step} scale={scale} precision={step<1?1:0}/>;
  return <Section title="Pattern Background" collapsible={false}>
    <PatternChoice clip={clip} prop="patternKind" label="Pattern" options={[{value:'dots',label:'Shapes'},{value:'grid',label:'Grid'}]}/>
    {kind==='dots'&&<PatternChoice clip={clip} prop="patternShape" label="Symbol" options={PATTERN_SHAPES}/>}
    <PatternChoice clip={clip} prop="patternBackground" label="Background" color/>
    <PatternChoice clip={clip} prop="patternColor" label="Pattern Color" color/>
    <PatternChoice clip={clip} prop="patternDistribution" label="Size Distribution" options={PATTERN_DISTRIBUTIONS}/>
    {number('size',kind==='grid'?'Line Width':'Symbol Size',.5,256,.5)}
    {number('spacingX','Spacing X',4,1024,.5)}{number('spacingY','Spacing Y',4,1024,.5)}
    {number('random','Size Variation',0,100,1,100)}{number('strength','Distribution Strength',0,100,1,100)}
    {number('seed','Random Seed',0,99999)}
    {kind==='dots'&&number('rotation','Symbol Rotation',-36000,36000)}
    {number('offsetX','Offset X',-4096,4096)}{number('offsetY','Offset Y',-4096,4096)}
    <p class="hint">Use diamonds to animate the background. Symbol, pattern, colors and distribution switch at their keyframes. Alt/Option-click a numeric property name or diamond for automatic motion.</p>
  </Section>;
}

// Sladding: stil, form, styrke og plassering. Plassering og størrelse kan animeres med nøkkelbilder,
// så sladden kan følge noe som beveger seg.
function RedactTab({ clip }) {
  const p = project.value;
  const pr = clip.props;
  const set = (patch) => commit((q) => Object.assign(q.clips[clip.id].props, patch));
  const mode = REDACT_MODES.find((m) => m.id === pr.mode) || REDACT_MODES[0];
  return (
    <>
      <Section title="Style">
        <Segmented value={pr.mode} onChange={(v) => set({ mode: v })} options={REDACT_MODES.map((m) => ({ value: m.id, label: m.label, title: m.desc }))} />
        <p class="hint">{mode.desc}</p>
        {pr.mode === 'solid' ? (
          <Row label="Color">
            <ColorField value={pr.color || '#000000'} onLive={(v) => updateTransient((q) => (q.clips[clip.id].props.color = v))} />
          </Row>
        ) : (
          <Param clip={clip} prop="amount" label="Amount" min={0} max={100} scale={100} unit="%" keyframes={false} />
        )}
        {pr.mode === 'pixelate' && (
          <Row label="Whole blocks at edge">
            <Toggle checked={Boolean(pr.wholeBlocks)} onChange={(v) => set({ wholeBlocks: v })} />
          </Row>
        )}
        {pr.shape !== 'full' && (
          <Row label="Redact outside">
            <Toggle checked={Boolean(pr.invert)} onChange={(v) => set({ invert: v })} />
          </Row>
        )}
        <Param clip={clip} prop="opacity" label="Opacity" min={0} max={100} scale={100} unit="%" />
      </Section>
      <Section title="Shape">
        <Segmented
          value={pr.shape || 'rect'}
          onChange={(v) =>
            commit((q) => {
              const c = q.clips[clip.id];
              // Fri form starter som formen slik den er nå, så den ikke hopper.
              if (v === 'path' && !c.props.points) c.props.points = c.props.shape === 'ellipse' ? ellipsePoints(c.props.w, c.props.h) : defaultPoints(c.props.w, c.props.h);
              c.props.shape = v;
            })
          }
          options={REDACT_SHAPES.map((s) => ({ value: s.id, label: s.label }))}
        />
        {pr.shape === 'path' && (
          <>
            <Row label="Smooth curve">
              <Toggle checked={pr.smooth === true} onChange={(v) => set({ smooth: v })} />
            </Row>
            <ShapeKeyframe clip={clip} prop="points" />
          </>
        )}
        {pr.shape === 'full' && <p class="hint">The effect covers the whole picture. Use the Masks tab to draw where it works, with the pen or with shapes that you can animate.</p>}
        {pr.shape !== 'full' && <Param clip={clip} prop="x" label="Position X" min={-p.width} max={p.width} unit="px" slider={false} />}
        {pr.shape !== 'full' && <Param clip={clip} prop="y" label="Position Y" min={-p.height} max={p.height} unit="px" slider={false} />}
        {pr.shape !== 'path' && pr.shape !== 'full' && <Param clip={clip} prop="w" label="Width" min={8} max={p.width * 1.5} unit="px" />}
        {pr.shape !== 'path' && pr.shape !== 'full' && <Param clip={clip} prop="h" label="Height" min={8} max={p.height * 1.5} unit="px" />}
        {pr.shape !== 'full' && <Param clip={clip} prop="rotation" label="Rotation" min={-180} max={180} unit="°" center={0} />}
        {pr.shape !== 'full' && <Param clip={clip} prop="feather" label="Soft edge" min={0} max={200} unit="px" />}
        {pr.shape === 'path' && <p class="hint">Drag the points in the viewer. Double click the outline to add a point, and Option (Alt) click a point to remove it.</p>}
        {pr.shape !== 'full' && <p class="hint">Drag the box in the viewer to move it, and drag its corners and edges to resize it. Add keyframes, or use Tracking below, to make it follow something that moves.</p>}
      </Section>
      {pr.shape !== 'full' && <FollowSection clip={clip} />}
      <Section title="Fade">
        <PlainNumber clip={clip} prop="vFadeIn" label="Fade in" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="vFadeOut" label="Fade out" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
    </>
  );
}

const trackBusy = () => tasks.value.find((t) => t.title === 'Tracking motion' && (t.state === 'running' || t.state === 'queued'));
const trackLabel = (job) => (job ? `Tracking ${Math.round((job.progress || 0) * 100)} %` : 'Track Forward');

// Sporing i videoen: et område følges, og sporet lagres på klippet (se track.js).
function TrackSection({ clip }) {
  const job = trackBusy();
  const tracks = clip.props.tracks || [];
  return (
    <Section title="Tracking" data-section="tracking">
      <Row label="Show area">
        <Toggle checked={trackArea.value === clip.id} onChange={(v) => (trackArea.value = v ? clip.id : null)} />
      </Row>
      <Button class="small" disabled={Boolean(job)} onClick={() => trackForward(clip.id)}>
        {trackLabel(job)}
      </Button>
      {tracks.map((t) => (
        <Row key={t.id} label={t.name}>
          <span class="value">{((t.frames.length - 1) / t.fps).toFixed(1)} s</span>
          <IconButton icon={Trash2} title="Delete track" onClick={() => deleteTrack(clip.id, t.id)} />
        </Row>
      ))}
      <p class="hint">Turn on Show area, put the area over what you want to follow, and press Track Forward. It follows from the playhead to the end of the clip. Then select a clip above this video (a redaction, title or image) and attach it under Follow Track.</p>
    </Section>
  );
}

// Fest klippet til et spor i videoen under: posisjon, rotasjon og eventuelt skala blir nøkkelbilder.
function FollowSection({ clip }) {
  const p = project.value;
  const [rotation, setRotation] = useState(true);
  const [scale, setScale] = useState(false);
  const [live, setLive] = useState(true);
  const [picked, setPicked] = useState('');
  const options = tracksFor(p, clip);
  const redact = clip.type === 'redact';
  const follow = clip.props.follow;
  const tracked = Boolean(clip.props.trackedKeys?.length);
  if (!options.length && !redact && !follow && !tracked) return null;
  const value = options.some((o) => o.value === picked) ? picked : options[0]?.value;
  const job = trackBusy();
  const opts = { rotation, scale, live };
  const current = follow && options.find((o) => o.value === `${follow.clipId}/${follow.trackId}`);
  return (
    <Section title="Follow Track" data-section="follow">
      {follow && (
        <Row label={current ? `Following ${current.label}` : 'The track is gone'}>
          <Button class="small" onClick={() => detach(clip.id)}>
            Detach
          </Button>
        </Row>
      )}
      {tracked && (
        <Row label="Tracking keyframes">
          <Button class="small" onClick={() => removeTrackingKeyframes(clip.id)}>
            Remove
          </Button>
        </Row>
      )}
      <Row label="Mode">
        <Segmented
          value={live ? 'live' : 'keyframes'}
          onChange={(v) => setLive(v === 'live')}
          options={[
            { value: 'live', label: 'Live', title: 'The clip always follows the track as it is now. Move the clip to change where it sits relative to the object.' },
            { value: 'keyframes', label: 'Keyframes', title: 'Writes keyframes you can adjust one by one. They do not change if you track again.' },
          ]}
        />
      </Row>
      {options.length > 0 && (
        <Row label="Track">
          <Select value={value} options={options} onChange={setPicked} />
        </Row>
      )}
      <Row label="Rotation">
        <Toggle checked={rotation} onChange={setRotation} />
      </Row>
      <Row label="Scale (experimental)">
        <Toggle checked={scale} onChange={setScale} />
      </Row>
      <div class="row">
        {options.length > 0 && (
          <Button class="small" onClick={() => attachToTrack(clip.id, ...value.split('/'), opts)}>
            Attach
          </Button>
        )}
        {redact && (
          <Button class="small" disabled={Boolean(job)} onClick={() => trackRedaction(clip.id, opts)}>
            {trackLabel(job)}
          </Button>
        )}
      </div>
      <p class="hint">
        Attach makes this clip follow the track, keeping the place it has at the playhead relative to the object. {live ? 'Live always uses the track as it is now, and moving the clip moves it relative to the object. ' : 'Keyframes writes position and rotation keyframes you can adjust one by one. '}{redact ? 'Track Forward follows what the redaction covers in the video below and attaches it in one step. ' : ''}Scale follows the object as it gets closer or further away.
      </p>
    </Section>
  );
}

/* Lydeffekter på klippet: en kjede som behandles ovenfra og ned. */

function AudioFxSection({ clip }) {
  const list = clip.props.afx || [];
  const edit = (fn) => commit((q) => fn(q.clips[clip.id].props));
  const live = (id, patch) => updateTransient((q) => Object.assign(q.clips[clip.id].props.afx.find((e) => e.id === id).p, patch));
  const move = (i, d) =>
    edit((pr) => {
      const a = [...pr.afx];
      const j = i + d;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
      pr.afx = a;
    });
  const addOptions = [
    { value: '', label: 'Add Effect…' },
    ...Object.entries(AUDIO_EFFECTS).map(([id, e]) => ({ value: id, label: `${e.category}: ${e.label}` })),
  ];
  const presetOptions = [{ value: '', label: 'Add Template…' }, ...AUDIO_PRESETS.map((p) => ({ value: p.id, label: `${p.category === 'Repair' ? 'Fix' : p.category}: ${p.label}` }))];
  return (
    <Section title="Audio Effects" data-section="afx">
      <div class="afx-add">
        <Select value="" options={addOptions} onChange={(v) => v && edit((pr) => (pr.afx = [...(pr.afx || []), makeEffect(v)]))} />
        <Select value="" options={presetOptions} onChange={(v) => v && edit((pr) => (pr.afx = [...(pr.afx || []), ...presetEffects(v)]))} />
      </div>
      {!list.length && <p class="hint">Add an equalizer, noise reduction, reverb, distortion and more, or a template such as Voice Clean Up or Telephone. You can also drag effects from the Audio Effects browser onto the clip.</p>}
      {list.map((e, i) => {
        const def = AUDIO_EFFECTS[e.type];
        if (!def) return null;
        return (
          <div key={e.id} class={`afx-item${e.on === false ? ' off' : ''}`} data-afx-item={e.type}>
            <div class="afx-head">
              <Toggle checked={e.on !== false} onChange={(v) => edit((pr) => (pr.afx.find((x) => x.id === e.id).on = v))} />
              <b title={def.desc}>{def.label}</b>
              <IconButton icon={ArrowUp} size={12} title="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} size={12} title="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
              <RemoveEffectButton label={def.label} adjusted={def.params.some((p) => (e.p[p.id] ?? p.def) !== p.def)} onRemove={() => edit((pr) => (pr.afx = pr.afx.filter((x) => x.id !== e.id)))} />
            </div>
            {e.type === 'eq' ? (
              <EqEditor effect={e} onLive={(patch) => live(e.id, patch)} onSet={(patch) => edit((pr) => Object.assign(pr.afx.find((x) => x.id === e.id).p, patch))} />
            ) : (
              def.params.map((prm) => <FxParam key={prm.id} prm={prm} value={e.p[prm.id] ?? prm.def} onLive={(v) => live(e.id, { [prm.id]: v })} onSet={(v) => edit((pr) => (pr.afx.find((x) => x.id === e.id).p[prm.id] = v))} />)
            )}
          </div>
        );
      })}
    </Section>
  );
}

// Én parameter i en lydeffekt: glidebryter (logaritmisk for frekvenser), valg eller av og på.
function FxParam({ prm, value, onLive, onSet }) {
  if (prm.toggle)
    return (
      <Row label={prm.label}>
        <Toggle checked={Boolean(value)} onChange={(v) => onSet(v ? 1 : 0)} />
      </Row>
    );
  if (prm.choices)
    return (
      <Row label={prm.label}>
        <Segmented value={value} onChange={onSet} options={prm.choices.map((c, i) => ({ value: c, label: prm.labels?.[i] ?? `${c} ${prm.unit}`.trim() }))} />
      </Row>
    );
  const scale = prm.scale || 1;
  const toSlider = (v) => (prm.log ? Math.log(v / prm.min) / Math.log(prm.max / prm.min) : v);
  const fromSlider = (t) => (prm.log ? Math.round(prm.min * Math.pow(prm.max / prm.min, t)) : t);
  return (
    <div class="param">
      <span class="param-label" title={prm.label}>
        {prm.label}
      </span>
      <Slider value={toSlider(value)} min={prm.log ? 0 : prm.min} max={prm.log ? 1 : prm.max} step={prm.log ? 0.001 : prm.step} center={prm.center} onStart={beginTransient} onInput={(t) => onLive(fromSlider(t))} onCommit={() => endTransient(true)} />
      <NumberField value={value * scale} min={prm.min * scale} max={prm.max * scale} step={prm.step * scale} precision={scale !== 1 || prm.step >= 1 ? 0 : prm.step >= 0.1 ? 1 : 2} unit={prm.unit} onStart={beginTransient} onChange={(v) => onLive(v / scale)} onCommit={() => endTransient(true)} />
      <span />
      <span />
    </div>
  );
}

// Grafisk equalizer: ti bånd med kurve over, og ferdige innstillinger.
function EqEditor({ effect, onLive, onSet }) {
  const ref = useRef(null);
  const g = EQ_BANDS.map((_, i) => effect.p[`b${i}`] || 0);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    const c = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = H / 2 - (db / 18) * (H / 2);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    const coefs = eqCoefs(effect.p, 48000);
    c.strokeStyle = '#f7c948';
    c.lineWidth = 2 * dpr;
    c.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const f = 20 * Math.pow(1000, x / W);
      const db = coefs.reduce((s, k) => s + biquadResponse(k, f, 48000), 0);
      const y = H / 2 - (Math.max(-18, Math.min(18, db)) / 18) * (H / 2);
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }, [JSON.stringify(effect.p)]);
  return (
    <div class="eq">
      <Row label="Preset">
        <Select value={EQ_PRESETS.find((pr) => pr.g.every((v, i) => v === g[i]))?.id || ''} options={[{ value: '', label: 'Custom' }, ...EQ_PRESETS.map((pr) => ({ value: pr.id, label: pr.label }))]} onChange={(v) => v && onSet(Object.fromEntries(EQ_PRESETS.find((pr) => pr.id === v).g.map((x, i) => [`b${i}`, x])))} />
      </Row>
      <canvas ref={ref} class="eq-curve" />
      <div class="eq-bands">
        {EQ_BANDS.map((f, i) => (
          <label key={f} title={`${f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}: ${g[i] > 0 ? '+' : ''}${g[i]} dB. Double click to reset.`}>
            <input
              type="range"
              min={-18}
              max={18}
              step={0.5}
              value={g[i]}
              onPointerDown={beginTransient}
              onInput={(ev) => onLive({ [`b${i}`]: Number(ev.currentTarget.value) })}
              onChange={() => endTransient(true)}
              onDblClick={() => onSet({ [`b${i}`]: 0 })}
            />
            <span>{f >= 1000 ? `${f / 1000}k` : f}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Nøkkelbilde for punktene i en fri form: hele formen lagres ved spillhodet, og formen glir
// mellom nøkkelbildene. Så lenge det finnes nøkkelbilder, lager endringer i visningen nye.
function ShapeKeyframe({ clip, prop }) {
  const T = timeSig.value;
  const inside = T >= clip.start && T <= clip.start + clip.dur;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur);
  const s = kfTime(clip, Tc);
  const list = clip.kf?.[prop] || [];
  const atKf = keyframeIndexAt(clip, prop, s) >= 0;
  const prev = list.filter(([t]) => t < s - 1e-3).at(-1);
  const next = list.find(([t]) => t > s + 1e-3);
  const goto = (t) => seek(kfToTimeline(clip, t));
  return (
    <div class="param" data-prop={prop}>
      <span class="param-label">Shape</span>
      <span class="hint" style={{ margin: 0 }}>{list.length ? `${list.length} keyframe${list.length > 1 ? 's' : ''}` : 'Not animated'}</span>
      <span />
      <div class="kf-ctl">
        <IconButton icon={ChevronLeft} size={12} title="Previous shape keyframe" disabled={!prev} onClick={() => prev && goto(prev[0])} />
        <button
          class={`kf-btn${atKf ? ' on' : list.length ? ' has' : ''}`}
          disabled={!inside}
          title={atKf ? 'Remove shape keyframe' : 'Add a shape keyframe at the playhead'}
          onClick={() =>
            commit((q) => {
              const c = q.clips[clip.id];
              if (atKf) removeKeyframe(c, prop, s);
              else setKeyframe(c, prop, s, [...(valueAt(c, prop, Tc) || [])]);
            })
          }
        >
          <Diamond size={11} />
        </button>
        <IconButton icon={ChevronRight} size={12} title="Next shape keyframe" disabled={!next} onClick={() => next && goto(next[0])} />
      </div>
      <span />
    </div>
  );
}

// Masker: formene bestemmer hva av klippet som vises. Flere masker kan legges sammen,
// trekkes fra hverandre eller snittes. Alle mål, og punktene i en fri form, kan animeres.
function MasksTab({ clip }) {
  const p = project.value;
  const masks = maskList(clip);
  const sel = selectedMask.value?.clipId === clip.id ? selectedMask.value.id : null;
  const T = timeSig.value;
  const setMask = (id, patch) => commit((q) => Object.assign(q.clips[clip.id].props.masks.find((m) => m.id === id), patch));
  return (
    <>
      <Section title="Add Mask">
        <div class="mask-add">
          <Button class="small" icon={RectangleHorizontal} onClick={() => addMaskToSelected('rect')}>
            Rectangle
          </Button>
          <Button class="small" icon={Circle} onClick={() => addMaskToSelected('ellipse')}>
            Ellipse
          </Button>
          <Button class="small" icon={PenTool} onClick={() => addMaskToSelected('path')}>
            Freeform
          </Button>
          <Button class="small" variant={penMode.value?.clipId === clip.id ? 'primary' : 'secondary'} icon={PenTool} onClick={() => (penMode.value ? (penMode.value = null) : startPen(clip.id))}>
            {penMode.value?.clipId === clip.id ? 'Drawing…' : 'Draw with Pen'}
          </Button>
        </div>
        {penMode.value?.clipId === clip.id && <p class="hint">Click in the viewer to place points. Drag while clicking for a smooth curve. Click the first point, double click or press Return to close the shape. Backspace removes the last point, Escape cancels.</p>}
        {clip.type === 'redact' && clip.props.shape === 'full' && !masks.length && <p class="hint">This effect covers the whole picture. Draw a mask with the pen to choose where it works.</p>}
        {!masks.length && <p class="hint">A mask shows only what is inside a shape. Use it to cut out a person, frame a detail, make a spotlight or hide part of the picture. Shapes can be animated with keyframes.</p>}
      </Section>
      {masks.map((m, i) => {
        const key = (prop) => maskKey(m.id, prop);
        const open = sel === m.id;
        return (
          <Section key={m.id} title={m.name || `Mask ${i + 1}`} data-mask={m.id}>
            <div class="mask-head">
              <Button class="small" variant={open ? 'primary' : 'secondary'} onClick={() => (selectedMask.value = open ? null : { clipId: clip.id, id: m.id })}>
                {open ? 'Done Editing' : 'Edit in Viewer'}
              </Button>
              <IconButton icon={Trash2} title="Delete mask" onClick={() => deleteMask(clip.id, m.id)} />
            </div>
            <Segmented value={m.shape} onChange={(v) => commit((q) => setMaskShape(q.clips[clip.id], m.id, v, T, p.width, p.height))} options={MASK_SHAPES.map((s) => ({ value: s.id, label: s.label }))} />
            <Row label="Mode">
              <Select value={i === 0 && m.mode === 'intersect' ? 'add' : m.mode} onChange={(v) => setMask(m.id, { mode: v })} options={MASK_MODES.filter((x) => i > 0 || x.id !== 'intersect').map((x) => ({ value: x.id, label: x.label, title: x.desc }))} />
            </Row>
            <Row label="Invert">
              <Toggle checked={Boolean(m.invert)} onChange={(v) => setMask(m.id, { invert: v })} />
            </Row>
            {m.shape === 'path' && (
              <Row label="Smooth curve">
                <Toggle checked={Boolean(m.smooth)} onChange={(v) => setMask(m.id, { smooth: v })} />
              </Row>
            )}
            {m.shape === 'path' && <ShapeKeyframe clip={clip} prop={key('points')} />}
            <Param clip={clip} prop={key('x')} label="Position X" min={-p.width} max={p.width} unit="px" slider={false} def={0} />
            <Param clip={clip} prop={key('y')} label="Position Y" min={-p.height} max={p.height} unit="px" slider={false} def={0} />
            {m.shape !== 'path' && <Param clip={clip} prop={key('w')} label="Width" min={8} max={p.width * 2} unit="px" def={Math.round(p.width * 0.5)} />}
            {m.shape !== 'path' && <Param clip={clip} prop={key('h')} label="Height" min={8} max={p.height * 2} unit="px" def={Math.round(p.height * 0.5)} />}
            <Param clip={clip} prop={key('rotation')} label="Rotation" min={-180} max={180} unit="°" center={0} def={0} />
            <Param clip={clip} prop={key('feather')} label="Feather" min={0} max={300} unit="px" def={0} />
            <Param clip={clip} prop={key('expand')} label="Expansion" min={-300} max={300} unit="px" center={0} def={0} />
            <Param clip={clip} prop={key('opacity')} label="Opacity" min={0} max={100} scale={100} unit="%" def={1} />
          </Section>
        );
      })}
      {masks.length > 0 && <p class="hint">Click Edit in Viewer, then drag the shape or its handles in the viewer. For a freeform mask, drag the points, double click the outline to add a point and Option (Alt) click a point to remove it. Add keyframes to animate the shape.</p>}
    </>
  );
}

// Stabilisering som i Final Cut Pro: analysen skjer i bakgrunnen, og resultatet kan justeres.
function StabilizeSection({ clip }) {
  motionVersion.value;
  const p = project.value;
  const media = p.media[clip.mediaId];
  const path = media?.streams?.main?.motion;
  const pr = { ...STAB_DEFAULTS, ...clip.props };
  const job = tasks.value.find((t) => t.title === `Analyzing motion in ${media?.name}` && (t.state === 'running' || t.state === 'queued'));
  const data = path ? getMotion(path) : null;
  const info = data && pr.stabilize ? stabilizeAt(clip, path, clip.in) : null;
  const live = (patch) => updateTransient((q) => Object.assign(q.clips[clip.id].props, patch));
  const slider = (key, label) => (
    <Row label={label}>
      <Slider value={pr[key]} min={0} max={1} step={0.01} disabled={!pr.stabilize || info?.method === 'tripod'} onStart={beginTransient} onInput={(v) => live({ [key]: v })} onCommit={() => endTransient(true)} />
      <span class="value narrow">{Math.round(pr[key] * 100)} %</span>
    </Row>
  );
  return (
    <Section title="Stabilization" data-section="stabilize">
      <Row label="Stabilize">
        <Toggle checked={Boolean(clip.props.stabilize)} onChange={(v) => stabilizeSelected(v)} />
      </Row>
      {clip.props.stabilize && (
        <>
          {job ? (
            <p class="hint">Analyzing camera motion: {Math.round((job.progress || 0) * 100)} %</p>
          ) : !path ? (
            <p class="hint">Waiting for the analysis.</p>
          ) : null}
          <Row label="Method">
            <Segmented
              value={pr.stabMethod}
              onChange={(v) => setProp(clip, { stabMethod: v })}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'smooth', label: 'Smooth' },
                { value: 'tripod', label: 'Tripod' },
              ]}
            />
          </Row>
          {pr.stabMethod === 'auto' && info && <p class="hint">Automatic uses {info.method === 'tripod' ? 'Tripod, because the camera hardly moves' : 'Smooth, because the camera moves'}.</p>}
          {slider('stabX', 'Smooth X')}
          {slider('stabY', 'Smooth Y')}
          {slider('stabRot', 'Smooth rotation')}
          <Row label="Zoom">
            <Segmented
              value={pr.stabZoom > 0 ? 'manual' : 'auto'}
              onChange={(v) => setProp(clip, { stabZoom: v === 'auto' ? 0 : Math.max(0.01, (info?.auto || 1.1) - 1) })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </Row>
          {pr.stabZoom > 0 ? (
            <Row label="Amount">
              <Slider value={pr.stabZoom} min={0.01} max={0.6} step={0.005} onStart={beginTransient} onInput={(v) => live({ stabZoom: v })} onCommit={() => endTransient(true)} />
              <span class="value narrow">{Math.round((1 + pr.stabZoom) * 100)} %</span>
            </Row>
          ) : (
            info && (
              <Row label="Auto zoom">
                <span class="value">{Math.round(info.auto * 100)} %</span>
              </Row>
            )
          )}
          <p class="hint">Higher values give smoother movement but need more zoom to hide the edges. Tripod removes all camera movement. Turn a slider to 0 to leave that direction as it is. With manual zoom, black edges can show when the correction is large.</p>
          {path && !job && (
            <Button variant="ghost" class="small" onClick={() => reanalyzeMotion(clip.id)}>
              Analyze Again
            </Button>
          )}
        </>
      )}
    </Section>
  );
}

function EffectsTab({ clip, multi }) {
  const shadowTime = Math.min(Math.max(timeSig.value, clip.start), clip.start + clip.dur);
  const shadowAmount = valueAt(clip, 'shadow', shadowTime) || 0;
  const shadow = shadowStyle(clip, shadowTime, project.value.height);
  const active = EFFECTS.filter((fx) => (clip.props.fx || []).includes(fx.id) || clip.props[fx.prop] || clip.kf?.[fx.prop]?.length);
  const available = EFFECTS.filter((fx) => !active.includes(fx));
  const add = (id) => addEffect(id);
  const remove = (fx) =>
    commit((q) => {
      const c = q.clips[clip.id];
      c.props.fx = (c.props.fx || []).filter((x) => x !== fx.id);
      c.props[fx.prop] = 0;
      delete c.kf[fx.prop];
      if (fx.id === 'shadow') for (const [key, value] of Object.entries(SHADOW_DEFAULTS)) {
        c.props[key] = value;
        delete c.kf[key];
      }
    });
  return (
    <>
      <VideoEffects clip={clip} />
      {!multi && clip.type !== 'adjustment' && <ProcessorEffects clip={clip} />}
      <Section title="Effects">
        {active.length === 0 && <p class="hint">No effects yet. Add one below, or drag one from the Effects browser.</p>}
        {active.map((fx) => (
          <div key={fx.id} class="fx-item" data-fx={fx.id}>
            <div class="fx-head">
              <b>{fx.label}</b>
              <RemoveEffectButton label={fx.label} adjusted={(clip.props[fx.prop] ?? 0) !== fx.def || Boolean(clip.kf?.[fx.prop]?.length) || (fx.id === 'shadow' && Object.entries(SHADOW_DEFAULTS).some(([key, value]) => (clip.props[key] ?? value) !== value || clip.kf?.[key]?.length)) || (fx.id === 'border' && (clip.props.borderColor || '#ffffff') !== '#ffffff')} onRemove={() => remove(fx)} />
            </div>
            <Param clip={clip} prop={fx.prop} label="Amount" min={fx.min * (fx.scale || 1)} max={fx.max * (fx.scale || 1)} scale={fx.scale || 1} unit={fx.unit} center={fx.min < 0 ? 0 : undefined} />
            {fx.id === 'shadow' && <>
              <Row label="Color">
                <ColorField value={shadow.color} onLive={(v) => updateTransient((q) => (q.clips[clip.id].props.shadowColor = v))} />
              </Row>
              <Param clip={clip} prop="shadowSoftness" label="Softness" min={0} max={500} scale={100} unit="%" def={1} />
              <Param clip={clip} prop="shadowOpacity" label="Opacity" min={0} max={100} scale={100} unit="%" def={Math.min(1, 0.75 * shadowAmount)} />
              <Param clip={clip} prop="shadowOffsetX" label="Position X" min={-project.value.width} max={project.value.width} unit="px" center={0} def={0} />
              <Param clip={clip} prop="shadowOffsetY" label="Position Y" min={-project.value.height} max={project.value.height} unit="px" center={0} def={project.value.height * 0.012 * shadowAmount} />
            </>}
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

// Nivåer fra lydbølgen innenfor klippet: topp og gjennomsnitt i dBFS, etter volumet på klippet.
function clipLevels(clip, comp, wave) {
  if (!wave || !comp) return null;
  const off = comp.stream.offset || 0;
  const a = Math.max(0, Math.floor((clip.in - off) * wave.rate));
  const b = Math.min(wave.peaks.length, Math.ceil((clip.in - off + clip.dur * (clip.speed || 1)) * wave.rate));
  if (b <= a) return null;
  let peak = 0;
  let sum = 0;
  for (let i = a; i < b; i++) {
    const v = wave.peaks[i] / 255;
    if (v > peak) peak = v;
    sum += v * v;
  }
  const gain = (clip.props[componentVolumeProp(clip, comp.key)] || 0);
  const db = (v) => (v > 0 ? 20 * Math.log10(v) + gain : -Infinity);
  return { peak: db(peak), avg: db(Math.sqrt(sum / (b - a)) * 0.7), a, b };
}

function LevelMeter({ clip, comp }) {
  waveVersion.value;
  const wave = getWave(comp?.stream?.wave);
  const ref = useRef(null);
  const lv = clipLevels(clip, comp, wave);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !wave || !lv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cv.clientWidth * dpr);
    cv.height = Math.round(cv.clientHeight * dpr);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const mid = cv.height / 2;
    const gain = Math.pow(10, (clip.props[componentVolumeProp(clip, comp.key)] || 0) / 20);
    for (let px = 0; px < cv.width; px++) {
      const i0 = lv.a + Math.floor((px / cv.width) * (lv.b - lv.a));
      const i1 = Math.max(i0 + 1, lv.a + Math.floor(((px + 1) / cv.width) * (lv.b - lv.a)));
      let m = 0;
      for (let i = i0; i < i1; i++) m = Math.max(m, wave.peaks[i] || 0);
      const v = Math.min(1.2, (m / 255) * gain);
      g.fillStyle = v >= 1 ? '#ff453a' : v > 0.7 ? '#ffd60a' : 'rgba(120, 220, 150, 0.9)';
      const h = Math.max(0.5, Math.min(1, v) * mid * 0.95);
      g.fillRect(px, mid - h, 1, h * 2);
    }
  }, [wave, lv?.a, lv?.b, clip.props.volume, clip.props.micVolume, clip.props.sysVolume, comp?.key]);
  if (!comp) return null;
  const f = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} dBFS` : 'Silent');
  return (
    <>
      <canvas ref={ref} class="level-wave" />
      {lv ? (
        <div class="levels">
          <span class={lv.peak >= 0 ? 'clip' : ''}>Peak {f(lv.peak)}</span>
          <span>Average {f(lv.avg)}</span>
        </div>
      ) : (
        <p class="hint">Analyzing audio</p>
      )}
      {lv && lv.peak >= 0 && <p class="hint warn">The audio clips (goes over 0 dBFS). Lower the volume a little.</p>}
    </>
  );
}

// Lydfanen: nivåer, volum per lydspor, toning, lydinfo fra filen og redigering.
function AudioTab({ clip }) {
  const isMac = window.api.platform === 'darwin';
  const media = project.value.media[clip.mediaId];
  const comps = audioComponents(clip, media);
  const main = comps.find((c) => !c.off) || comps[0];
  const d = useDetails(main?.stream?.path);
  const a = d?.audio?.[0];
  const props = [...new Set(comps.map((c) => componentVolumeProp(clip, c.key)))];
  return (
    <>
      <Section title="Levels">
        <LevelMeter clip={clip} comp={main} />
      </Section>
      <AudioComponentsSection clip={clip} />
      <Section title="Volume">
        {props.length <= 1 ? (
          <Param clip={clip} prop={props[0] || 'volume'} label="Volume" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />
        ) : (
          comps
            .filter((c, i, list) => list.findIndex((x) => componentVolumeProp(clip, x.key) === componentVolumeProp(clip, c.key)) === i)
            .map((c) => <Param key={c.key} clip={clip} prop={componentVolumeProp(clip, c.key)} label={componentVolumeProp(clip, c.key) === 'volume' ? 'Synced audio' : c.label} min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />)
        )}
        <p class="hint">{isMac ? 'Option' : 'Alt'} click the volume line on the clip to add keyframes. {isMac ? 'Control' : 'Alt'} + and {isMac ? 'Control' : 'Alt'} - change the level by 1 dB.</p>
      </Section>
      <Section title="Fade">
        <PlainNumber clip={clip} prop="aFadeIn" label="Fade in" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="aFadeOut" label="Fade out" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
      <AudioFxSection clip={clip} />
      {a && (
        <Section title="Audio Format">
          <InfoRow label="Source">{main.label}</InfoRow>
          <InfoRow label="Codec">{codecName(a.codec, a.profile)}</InfoRow>
          <InfoRow label="Sample rate">{a.sampleRate ? `${(a.sampleRate / 1000).toLocaleString('en-GB')} kHz` : null}</InfoRow>
          <InfoRow label="Channels">{a.layout ? `${a.layout}${a.channels ? ` (${a.channels})` : ''}` : null}</InfoRow>
          <InfoRow label="Bit rate">{a.bitrate ? `${a.bitrate} kbit/s` : null}</InfoRow>
        </Section>
      )}
      {!clip.props.audioDetached && <AudioEditSection clip={clip} />}
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
          <p class="hint">An equal power crossfade between the two clips. Press Delete to remove it. The default length is set in Settings.</p>
        </Section>
      </div>
    </div>
  );
}

const lookEdit = (id, l) => (q) => {
  const c = q.clips[id];
  for (const [k, v] of Object.entries(l.v)) {
    c.props[k] = v;
    delete c.kf[k];
  }
};

function ColorTab({ clip, mediaIds }) {
  const look = COLOR_LOOKS.find((l) => Object.entries(l.v).every(([k, v]) => Math.abs((clip.props[k] || 0) - v) < 1e-3 && !clip.kf?.[k]));
  const p = project.value;
  return (
    <>
      {clip.type === 'recording' && clip.recordingPart !== 'screen' && p.media[clip.mediaId]?.streams?.camera?.hasVideo && <CameraColorSection clip={clip} />}
      {mediaIds?.length > 0 && (
        <Section title="Camera LUT">
          <CameraLutRow media={p.media[mediaIds[0]]} ids={mediaIds} />
          <p class="hint">Applies to every clip from the selected files.</p>
        </Section>
      )}
      <Section title="Looks">
        <div class="looks" data-section="looks" onPointerLeave={endPreview}>
          {COLOR_LOOKS.map((l) => (
            <button
              key={l.id}
              class={`look look-${l.id}${look?.id === l.id ? ' active' : ''}`}
              onPointerEnter={() => previewEdit(lookEdit(clip.id, l))}
              onClick={() => commit(lookEdit(clip.id, l))}
            >
              <span class="swatch" />
              {l.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Film Looks">
        <FilmPicker clip={clip} />
        {clip.props.film && <Param clip={clip} prop="filmMix" label="Strength" min={0} max={100} scale={100} />}
        <p class="hint">Simulated film stocks, black and white filters and creative styles, applied on top of the correction below. Point at a look to see it in the viewer, and click to use it.</p>
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
        <div class="wheels" data-section="wheels">
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
              delete c.props.film;
            })
          }
        >
          Reset Color
        </Button>
      </Section>
    </>
  );
}

function CameraColorSection({ clip }) {
  return (
    <Section title="Camera Color">
      <p class="hint">{clip.recordingPart === 'camera' ? 'Adjust only this PiP clip. Raise Exposure if your face is too dark. Changes are saved with the project and included in your export.' : 'Adjust only the camera image, in picture in picture or full screen. If your face is too dark, raise Exposure. These adjustments are included in your export.'}</p>
      <Param clip={clip} prop="cameraExposure" label="Exposure" min={-100} max={100} scale={100} center={0} />
      <Param clip={clip} prop="cameraContrast" label="Contrast" min={-100} max={100} scale={100} center={0} />
      <Param clip={clip} prop="cameraSaturation" label="Saturation" min={-100} max={100} scale={100} center={0} />
      <Param clip={clip} prop="cameraTemperature" label="Temperature" min={-100} max={100} scale={100} center={0} />
      <Button
        variant="secondary"
        icon={RotateCcw}
        onClick={() => commit((q) => {
          const c = q.clips[clip.id];
          Object.assign(c.props, CAMERA_COLOR_PROPS);
          for (const key of Object.keys(CAMERA_COLOR_PROPS)) delete c.kf[key];
        })}
      >
        Reset Camera Color
      </Button>
    </Section>
  );
}

// Filmlookene i grupper. Musa over en look viser den i seeren, klikk velger den.
function FilmPicker({ clip }) {
  const ids = [clip.id];
  const item = (id, label) => (
    <button key={id} class={`film-item${(clip.props.film || '') === id ? ' active' : ''}`} onPointerEnter={() => previewFilm(id, ids)} onClick={() => applyFilm(id, ids)}>
      {label}
    </button>
  );
  return (
    <div class="film-list" onPointerLeave={endPreview}>
      {item('', 'None')}
      {[...new Set(FILM_LOOKS.map((f) => f.group))].flatMap((g) => [
        <div key={g} class="film-group">
          {g}
        </div>,
        ...FILM_LOOKS.filter((f) => f.group === g).map((f) => item(f.id, f.label)),
      ])}
    </div>
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
  const hasCam = clip.recordingPart !== 'screen' && media?.streams?.camera?.hasVideo;
  const camera = recordingChildren(project.value, clip.id)[0];
  const parents = clip.recordingPart === 'camera' ? Object.values(project.value.clips).filter((c) => c.recordingPart === 'screen' && c.mediaId === clip.mediaId && (!recordingChildren(project.value, c.id).length || c.id === clip.linkedTo)) : [];
  const rec = media?.rec || {};
  const switches = (clip.kf.layout || []).filter(([t]) => t >= clip.in && t <= clip.in + clip.dur);
  return (
    <>
      {clip.recordingPart === 'camera' && (
        <Section title="PiP Connection">
          <Row label="Screen recording" stacked>
            <Select value={clip.linkedTo || ''} options={[{ value: '', label: 'Detached' }, ...parents.map((c) => ({ value: c.id, label: `${c.name || 'Screen'} (${formatShort(c.start)})` }))]} onChange={(id) => id ? attachPip(clip.id, id) : detachPip(clip.id)} />
          </Row>
          <p class="hint">{clip.linkedTo ? 'PiP follows the screen when you move, trim or cut either clip. Select this PiP clip to adjust its color and effects separately.' : 'PiP has its own timing. Choose a screen recording to link and synchronize it again.'} Microphone and system audio stay on the screen clip.</p>
          {clip.linkedTo && <Button onClick={() => detachPip(clip.id)}>Detach PiP</Button>}
        </Section>
      )}
      {clip.recordingPart === 'screen' && (
        <Section title="PiP Track">
          <p class="hint">{camera ? 'The camera is on the video track above this clip. Select PiP to adjust its color, shape and effects.' : 'The camera has been detached or removed from this screen clip.'}</p>
          {camera && <><Button onClick={() => { selection.value = [camera.id]; inspectorTab.value = 'color'; }}>Adjust PiP</Button><Button onClick={() => detachPip(clip.id)}>Detach PiP</Button></>}
        </Section>
      )}
      {!clip.recordingPart && hasCam && media?.streams?.screen?.hasVideo && (
        <Section title="PiP Track">
          <p class="hint">Put the camera on a separate video track, linked to this screen recording. You can then select and adjust PiP on its own.</p>
          <Button onClick={() => separatePipTrack(clip.id)}>Show PiP on Separate Track</Button>
        </Section>
      )}
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
              <button key={t} class={Math.abs(t - s) < 0.05 ? 'on' : ''} onClick={() => seek(kfToTimeline(clip, t))}>
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
      {hasCam && <CameraColorSection clip={clip} />}
      {clip.recordingPart !== 'camera' && <Section title="Overlays">
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
      </Section>}
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

export async function loadSystemFonts() {
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

// Supring eller tittel fra mal: skriv navn og tittel, velg farger, og juster animasjonene.
// Klippets lengde på tidslinjen bestemmer hvor lenge den står; inn og ut skjer automatisk.
function TemplateTab({ clip }) {
  const p = project.value;
  const pr = clip.props;
  const tpl = findTemplate(pr.template, p.templates || {});
  if (!tpl) return <p class="hint">The template for this title is missing.</p>;
  const choices = [...BUILTIN_TEMPLATES, ...Object.values(p.templates || {})].map((t) => ({ value: t.id, label: `${t.category}: ${t.name}` }));
  const live = (fn) => updateTransient((q) => fn(q.clips[clip.id].props));
  const hold = Math.max(0, clip.dur - (pr.inDur ?? 0) - (pr.outDur ?? 0));
  const switchTo = (id) =>
    commit((q) => {
      const t = findTemplate(id, q.templates || {});
      const c = q.clips[clip.id];
      const d = templateDefaults(t);
      // Teksten beholdes når du bytter mal; farger og tider følger den nye malen.
      c.props.template = id;
      c.props.fields = { ...d.fields, ...Object.fromEntries(Object.entries(c.props.fields || {}).filter(([k]) => k in d.fields)) };
      c.props.colors = d.colors;
      c.props.font = d.font;
      c.props.inDur = d.inDur;
      c.props.outDur = d.outDur;
      c.name = t.name;
    });
  return (
    <>
      <Section title="Template">
        <Select value={pr.template} options={choices} onChange={switchTo} />
      </Section>
      <Section title="Text">
        {(tpl.fields || []).map((f) => (
          <Row key={f.id} label={f.label} stacked>
            <input
              class="text-input"
              value={pr.fields?.[f.id] ?? ''}
              placeholder={f.default}
              onKeyDown={(e) => e.stopPropagation()}
              onFocus={beginTransient}
              onBlur={() => endTransient(true)}
              onInput={(e) => {
                const v = e.currentTarget.value;
                live((x) => (x.fields = { ...(x.fields || {}), [f.id]: v }));
              }}
            />
          </Row>
        ))}
        <Row label="Font">
          <FontSelect value={pr.font || 'sans'} onChange={(v) => setProp(clip, { font: v })} />
        </Row>
      </Section>
      {(tpl.colors || []).length > 0 && (
        <Section title="Colors">
          {tpl.colors.map((c) => (
            <Row key={c.id} label={c.label}>
              <ColorField value={pr.colors?.[c.id] ?? c.default} onLive={(v) => live((x) => (x.colors = { ...(x.colors || {}), [c.id]: v }))} />
            </Row>
          ))}
        </Section>
      )}
      <Section title="Animation">
        <Row label="Animate in">
          <NumberField value={pr.inDur ?? 0.6} min={0} max={5} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => live((x) => (x.inDur = v))} onCommit={() => endTransient(true)} />
        </Row>
        <Row label="Animate out">
          <NumberField value={pr.outDur ?? 0.5} min={0} max={5} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => live((x) => (x.outDur = v))} onCommit={() => endTransient(true)} />
        </Row>
        <Row label="On screen">
          <span class="value">{hold.toFixed(1)} s</span>
        </Row>
        <Row label="Total length">
          <NumberField value={clip.dur} min={0.5} max={600} step={0.1} precision={1} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setClipDuration(q, clip.id, v))} onCommit={() => endTransient(true)} />
        </Row>
        <p class="hint">The title animates in at the start of the clip and out at the end. Drag the end of the clip on the timeline to keep it on screen longer. Position and size are in the Video tab.</p>
      </Section>
    </>
  );
}

function TextTab({ clip }) {
  const pr = clip.props;
  const id = clip.id;
  if (pr.template) return <TemplateTab clip={clip} />;
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
  const textRef = useRef(null);
  const editRequest = captionEditRequest.value;
  useEffect(() => {
    if (editRequest !== id) return;
    textRef.current?.focus();
    captionEditRequest.value = null;
  }, [id, editRequest]);
  return (
    <>
      <Section title="Caption">
        <textarea
          class="text-input caption-text"
          ref={textRef}
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
  const working = st?.optimized ? 'Optimized media' : st?.proxy && media.kind !== 'image' ? (color?.hdr ? 'Tone mapped proxy, original on export' : 'Proxy, original on export') : 'Original';
  return (
    <>
      {color && (
        <Row label="Color">
          <span class="value">
            {color.bits}-bit{color.hdr ? `, HDR ${color.hdr === 'pq' ? 'PQ' : 'HLG'}, shown tone mapped` : color.primaries === 'bt2020' ? ', Rec. 2020' : ', SDR'}
          </span>
        </Row>
      )}
      {st && media.kind !== 'audio' && <CameraLutRow media={media} />}
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

// Kamera-LUT: gjør LOG-opptak om til vanlige farger. Gjelder alle klipp fra filen, i visningen og eksporten.
function CameraLutRow({ media, ids = [media.id] }) {
  const v = media.cameraLut || '';
  const custom = v && !CAMERA_LOGS.some((x) => x.id === v);
  const set = (cameraLut) => commit((q) => ids.forEach((id) => (q.media[id].cameraLut = cameraLut || undefined)));
  const choose = async () => {
    const file = await window.api.openFileDialog({ title: 'Choose a LUT', filters: [{ name: '3D LUT', extensions: ['cube'] }] });
    if (file) set(file);
  };
  const options = [
    { value: '', label: 'None' },
    ...CAMERA_LOGS.map((x) => ({ value: x.id, label: x.label })),
    ...(custom ? [{ value: v, label: v.split(/[\\/]/).pop() }] : []),
    { value: 'choose', label: 'Choose LUT File…' },
  ];
  return (
    <Row label="Camera LUT">
      <Select value={v} options={options} title={custom ? v : undefined} onChange={(x) => (x === 'choose' ? choose() : set(x))} />
    </Row>
  );
}

/* Filinfo leses når fanen vises og huskes for resten av økten. */
const detailsCache = new Map();
function useDetails(path) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!path || detailsCache.has(path)) return;
    detailsCache.set(path, null);
    window.api
      .mediaDetails(path)
      .then((d) => detailsCache.set(path, d), () => detailsCache.set(path, false))
      .then(() => force((n) => n + 1));
  }, [path]);
  return path ? detailsCache.get(path) : null;
}

const fmtBytes = (n) => (n == null ? '' : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const fmtDate = (t) => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const fmtTc = (t, fps) => formatTimecode(Math.max(0, t), fps);
const CODECS = { h264: 'H.264', hevc: 'HEVC (H.265)', prores: 'Apple ProRes', vp9: 'VP9', vp8: 'VP8', av1: 'AV1', dnxhd: 'Avid DNxHD/HR', mjpeg: 'Motion JPEG', mpeg2video: 'MPEG-2', aac: 'AAC', mp3: 'MP3', opus: 'Opus', flac: 'FLAC', pcm_s16le: 'Linear PCM 16-bit', pcm_s24le: 'Linear PCM 24-bit', pcm_s32le: 'Linear PCM 32-bit', pcm_f32le: 'Linear PCM 32-bit float', vorbis: 'Vorbis', ac3: 'Dolby Digital (AC-3)', eac3: 'Dolby Digital Plus' };
const codecName = (c, profile) => `${CODECS[c] || c}${profile ? ` ${profile}` : ''}`;

function InfoRow({ label, children, title }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <Row label={label}>
      <span class="value" title={title || (typeof children === 'string' ? children : undefined)}>
        {children}
      </span>
    </Row>
  );
}

// Clip info som i Final Cut Pro: klippet på tidslinjen, filen det kommer fra, og bilde og lyd i filen.
function InfoTab({ clip, media }) {
  const p = project.value;
  const st = media && (Object.values(media.streams).find((x) => x.hasVideo && !x.syncedFrom) || Object.values(media.streams).find((x) => x.hasAudio && !x.syncedFrom));
  const d = useDetails(media?.kind === 'recording' ? st?.path : media?.path);
  const v = d?.video?.[0];
  const a = d?.audio?.[0];
  return (
    <>
      <Section title="Clip">
        <Row label="Name">
          <input
            class="text-input small"
            value={clip.name || media?.name || ''}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => commit((q) => (q.clips[clip.id].name = e.currentTarget.value.trim() || null))}
          />
        </Row>
        <InfoRow label="Start">{fmtTc(clip.start, p.fps)}</InfoRow>
        <Row label="Duration">
          {isElastic(clip) ? (
            <NumberField value={clip.dur} min={0.1} max={3600} step={0.1} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setClipDuration(q, clip.id, v))} onCommit={() => endTransient(true)} />
          ) : (
            <span class="value">{fmtTc(clip.dur, p.fps)}</span>
          )}
        </Row>
        {media && media.kind !== 'image' && <InfoRow label="Source in">{fmtTc(clip.in, p.fps)}</InfoRow>}
        {media && media.kind !== 'image' && <InfoRow label="Source out">{fmtTc(clip.in + clip.dur * (clip.speed || 1), p.fps)}</InfoRow>}
        <InfoRow label="Lane">{clip.lane === 0 ? 'Storyline' : clip.lane === CAPTION_LANE ? 'Captions' : clip.lane > 0 ? `Video ${clip.lane + 1}` : `Audio ${-clip.lane}`}</InfoRow>
        <InfoRow label="Speed">{clip.speed === 0 ? 'Freeze frame' : clip.ramp ? 'Speed ramp' : (clip.speed ?? 1) !== 1 ? `${Math.round((clip.speed ?? 1) * 100)} %` : null}</InfoRow>
        <InfoRow label="Group">{clip.group ? 'Grouped' : null}</InfoRow>
      </Section>
      {media && (
        <Section title="File">
          <InfoRow label="File" title={media.path}>
            {media.name}
          </InfoRow>
          <InfoRow label="Location" title={media.path}>
            {media.offline ? 'Offline' : media.path.split(/[\\/]/).slice(-2, -1)[0]}
          </InfoRow>
          <InfoRow label="Format">{d?.container ? d.container.replace(/,$/, '').split(',')[0].toUpperCase() : null}</InfoRow>
          <InfoRow label="Size">{d ? fmtBytes(d.size) : null}</InfoRow>
          <InfoRow label="Bit rate">{d?.bitrate ? `${(d.bitrate / 1000).toFixed(1)} Mbit/s` : null}</InfoRow>
          <InfoRow label="Created">{d ? fmtDate(d.meta?.creation_time ? Date.parse(d.meta.creation_time) : d.created) : null}</InfoRow>
          <InfoRow label="Camera">{[d?.meta?.make, d?.meta?.model].filter(Boolean).join(' ') || null}</InfoRow>
          <InfoRow label="Software">{d?.meta?.software || null}</InfoRow>
          <div class="info-actions">
            <Button variant="secondary" class="small" onClick={() => window.api.reveal(media.path)} disabled={media.offline}>
              {window.api.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Explorer'}
            </Button>
          </div>
        </Section>
      )}
      {v && (
        <Section title="Video">
          <InfoRow label="Codec">{codecName(v.codec, v.profile)}</InfoRow>
          <InfoRow label="Resolution">{`${v.width} × ${v.height}`}</InfoRow>
          <InfoRow label="Frame rate">{v.fps ? `${v.fps} fps` : null}</InfoRow>
          <InfoRow label="Bit rate">{v.bitrate ? `${(v.bitrate / 1000).toFixed(1)} Mbit/s` : null}</InfoRow>
          <MediaColorRows media={media} />
        </Section>
      )}
      {!v && media && <MediaColorRows media={media} />}
      {a && (
        <Section title="Audio">
          <InfoRow label="Codec">{codecName(a.codec, a.profile)}</InfoRow>
          <InfoRow label="Sample rate">{a.sampleRate ? `${(a.sampleRate / 1000).toLocaleString('en-GB')} kHz` : null}</InfoRow>
          <InfoRow label="Channels">{a.layout ? `${a.layout}${a.channels ? ` (${a.channels})` : ''}` : null}</InfoRow>
          <InfoRow label="Bit rate">{a.bitrate ? `${a.bitrate} kbit/s` : null}</InfoRow>
        </Section>
      )}
      {d === null && media && !media.offline && <p class="hint">Reading file info</p>}
    </>
  );
}

function TransitionInspector({ clip, edge = 'start' }) {
  const t = clip[edge === 'end' ? 'transitionOut' : 'transition'];
  return (
    <div class="inspector panel">
      <div class="insp-head">
        <span class="type-dot t-transition" />
        <b>Transition</b>
      </div>
      <div class="insp-body">
        <Section title="Transition">
          <Row label="Type">
            <Select value={t.type} options={TRANSITIONS.map((x) => ({ value: x.id, label: x.label }))} onChange={(v) => commit((q) => setTransition(q, clip.id, v, t.dur, edge))} />
          </Row>
          <Row label="Duration">
            <NumberField value={t.dur} min={0.1} max={4} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setTransition(q, clip.id, t.type, v, edge))} onCommit={() => endTransient(true)} />
          </Row>
          <Row label="Crossfade audio">
            <Toggle checked={t.audio !== false} onChange={(v) => commit((q) => (q.clips[clip.id][edge === 'end' ? 'transitionOut' : 'transition'].audio = v))} />
          </Row>
          <p class="hint">Drag the transition handles on the timeline to change its duration. Press Delete to remove it. Transitions at a cut use extra frames before and after when available.</p>
        </Section>
      </div>
    </div>
  );
}

export const FORMATS = [
  { value: '7680x4320', label: '8K UHD (7680 × 4320)' },
  { value: '3840x2160', label: '4K UHD (3840 × 2160)' },
  { value: '2560x1440', label: '1440p (2560 × 1440)' },
  { value: '1920x1080', label: '1080p HD (1920 × 1080)' },
  { value: '1280x720', label: '720p HD (1280 × 720)' },
  { value: '1080x1920', label: 'Vertical (1080 × 1920)' },
  { value: '1080x1350', label: 'Portrait 4:5 (1080 × 1350)' },
  { value: '1080x1080', label: 'Square (1080 × 1080)' },
];

export function ProjectSettings({ name = true }) {
  const p = project.value;
  const current = `${p.width}x${p.height}`;
  const fmt = !p.customFormat && FORMATS.some((f) => f.value === current) ? current : 'custom';
  const fpsList = FRAME_RATES;
  return (
    <>
      {name && <Row label="Name" stacked>
        <input
          class="text-input"
          value={p.name}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onChange={(e) => {
            const input = e.currentTarget;
            const name = input.value.trim();
            if (!name || name === p.name) return void (input.value = p.name);
            if (!projectPath.value) return void commit((q) => (q.name = name));
            renameProject(name).then((ok) => ok || (input.value = p.name));
          }}
        />
      </Row>}
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

