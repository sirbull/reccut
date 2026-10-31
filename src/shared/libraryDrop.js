// Shared by the hover preview and the drop command so both choose the same target.
import { CAPTION_LANE, clipHasAudio, isVisual, primaryAt, round, transitionWindow } from './model.js';
import { Immer } from 'immer';
import { addMediaClip, autoFormat } from './ops.js';

const previewProject = new Immer({ autoFreeze: false });

// The native drag carries a snapshot of the source range and audio choice.
// Use the actual insertion operations for both the preview and the drop.
export function applyMediaDrop(project, item, lane, T) {
  const added = [];
  let t = T;
  for (const source of item.clips || (item.ids || [item.id]).map((id) => ({ id }))) {
    const media = project.media[source.id];
    if (!media) continue;
    const audio = media.kind === 'audio';
    const mode = lane === 0 && !audio ? 'insert' : 'connect';
    const targetLane = audio && lane >= 0 ? -1 : !audio && (lane < 0 || lane === CAPTION_LANE) ? 1 : lane;
    if (project.lanes?.[targetLane]?.locked) continue;
    autoFormat(project, media);
    const id = addMediaClip(project, media, mode, t, targetLane, source.opts || {});
    added.push(id);
    t = project.clips[id].start + project.clips[id].dur;
  }
  return added;
}

export function mediaDropPreview(project, item, lane, T) {
  let ids = [];
  const preview = previewProject.produce(project, (draft) => { ids = applyMediaDrop(draft, item, lane, T); });
  return ids.map((id) => {
    const clip = preview.clips[id];
    return { a: clip.start, b: clip.start + clip.dur, lane: clip.lane, label: clip.name };
  });
}

export function frameEffectPlacement(project, T, laneHint = null) {
  let start = T;
  let dur = 5;
  if (project.range && project.range.out - project.range.in > 0.05 && laneHint == null) {
    start = project.range.in;
    dur = project.range.out - project.range.in;
  } else {
    const under = primaryAt(project, T)?.clip;
    if (under && under.type !== 'gap') dur = Math.max(1, under.start + under.dur - T);
  }
  const busy = Object.values(project.clips).filter((c) => c.lane > 0 && c.lane !== CAPTION_LANE && isVisual(c) && c.start < start + dur && start < c.start + c.dur);
  const lane = laneHint && laneHint > 0 && laneHint !== CAPTION_LANE ? laneHint : Math.max(0, ...busy.map((c) => c.lane)) + 1;
  return { start, dur, lane };
}

export function libraryDropTarget(project, item, lane, T, { transitionDur = 1, tolerance = 0 } = {}) {
  if (!item) return null;
  if (item.kind === 'transition') {
    if (lane !== 0 || project.lanes?.[lane]?.locked) return null;
    const clips = project.primary.map((id) => project.clips[id]).filter(Boolean);
    const hit = clips.find((c) => T >= c.start && T < c.start + c.dur) || clips.find((c) => T >= c.start - tolerance && T <= c.start + c.dur + tolerance);
    if (!hit || hit.type === 'gap') return null;
    const index = clips.indexOf(hit);
    const atEnd = T > hit.start + hit.dur / 2;
    const next = clips[index + 1];
    const c = atEnd && next && next.type !== 'gap' ? next : hit;
    const edge = atEnd && c === hit ? 'end' : 'start';
    const prev = edge === 'start' && clips.indexOf(c) > 0 ? clips[clips.indexOf(c) - 1] : null;
    const dur = round(Math.min(c.dur, prev?.dur ?? Infinity, 4, Math.max(0.1, transitionDur)));
    const key = edge === 'end' ? 'transitionOut' : 'transition';
    const [a, b] = transitionWindow({ ...c, [key]: { type: item.id, dur } }, Boolean(prev), prev, edge);
    return { kind: 'transition', id: c.id, edge, dur, a, b, lane, label: item.label };
  }
  if (['effect', 'afx', 'apreset'].includes(item.kind)) {
    if (project.lanes?.[lane]?.locked) return null;
    const audio = item.kind !== 'effect';
    const c = Object.values(project.clips).find((c) => c.lane === lane && T >= c.start && T < c.start + c.dur && (audio ? clipHasAudio(c, project.media[c.mediaId]) : ['video', 'image', 'recording', 'title'].includes(c.type)));
    return c ? { kind: 'effect', id: c.id, a: c.start, b: c.start + c.dur, lane, label: item.label } : null;
  }
  if (item.kind === 'frameFx' || item.kind === 'redact') {
    const plan = frameEffectPlacement(project, T, lane > 0 && lane !== CAPTION_LANE ? lane : null);
    if (project.lanes?.[plan.lane]?.locked) return null;
    return { kind: 'layer', a: plan.start, b: plan.start + plan.dur, lane: plan.lane, label: item.label };
  }
  return null;
}

// Moving either side of a cut changes both halves. At an outer edge the far
// endpoint stays attached to the clip, so only the inner handle can move.
export function resizedTransitionDuration(dur, delta, handle, centered) {
  return dur + delta * (handle === 'start' ? -1 : 1) * (centered ? 2 : 1);
}
