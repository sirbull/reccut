import { timelines } from './model.js';
import { deleteClips } from './ops.js';

// Include every sequence and multicam definition, not only the visible timeline.
export function mediaRemovalPlan(project, ids) {
  const mediaIds = [...new Set(ids)].filter((id) => project.media[id]);
  const selected = new Set(mediaIds);
  const multicams = Object.values(project.multicams || {}).filter((mc) => mc.angles.some((a) => selected.has(a.mediaId)));
  const multicamIds = new Set(multicams.map((mc) => mc.id));
  const usedOnTimeline = timelines(project).some((t) => Object.values(t.clips).some((c) =>
    selected.has(c.mediaId) || multicamIds.has(c.multicam?.id)));
  return { mediaIds, multicamIds: [...multicamIds], multicamNames: multicams.map((mc) => mc.name), usedOnTimeline };
}

export function removeProjectMedia(project, ids) {
  const plan = mediaRemovalPlan(project, ids);
  const selected = new Set(plan.mediaIds), multicams = new Set(plan.multicamIds);
  for (const timeline of timelines(project)) {
    const clips = Object.values(timeline.clips).filter((c) => selected.has(c.mediaId) || multicams.has(c.multicam?.id));
    // Leave gaps so unrelated edits keep their timing. The regular clip operation
    // also removes linked recording parts and cleans up groups and transitions.
    if (clips.length) deleteClips(timeline, clips.map((c) => c.id), { ripple: false });
  }
  for (const id of plan.multicamIds) delete project.multicams[id];
  for (const id of plan.mediaIds) delete project.media[id];
}
