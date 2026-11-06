// Editing tools for the AI agent. The same registry gives the model its tool list, validates arguments
// and makes the edit, so documentation and behaviour cannot drift apart.
import { makeVideoEffect } from './videoEffects.js';
import { addMediaClip, autoFormat, bladeAt, deleteClips, moveClip, placeFree, setSpeed, setTransition, trimClip } from './ops.js';
import { CAPTION_LANE, TITLE_TEMPLATES, TRANSITIONS, deepClone, makeClip, primaryAt, round, titleText, uid } from './model.js';
import { BUILTIN_TEMPLATES, TEMPLATE_FORMAT, templateDefaults, validateTemplate } from './titletemplates.js';
import { fitCaptions } from './srt.js';
import { FILM_IDS } from './filmLooks.js';
const PROPERTY_RANGES = {
  exposure: [-1, 1],
  contrast: [-1, 1],
  saturation: [-1, 1],
  temperature: [-1, 1],
  tint: [-1, 1],
  highlights: [-1, 1],
  shadows: [-1, 1],
  ...Object.fromEntries(['lift', 'gamma', 'gain'].flatMap((w) => ['X', 'Y', 'L'].map((k) => [w + k, [-1, 1]]))),
  filmMix: [0, 1],
  opacity: [0, 1],
  volume: [-60, 12],
  micVolume: [-60, 12],
  sysVolume: [-60, 12],
  blur: [0, 100],
  vFadeIn: [0, 30],
  vFadeOut: [0, 30],
  aFadeIn: [0, 30],
  aFadeOut: [0, 30],
};
const VISUAL = ['video', 'image', 'recording', 'title'];
export function validateAIActions(p, actions) {
  if (!Array.isArray(actions) || actions.length > 100) throw new Error('Too many proposed edits.');
  return actions.map((a) => {
    const c = typeof a?.clipId === 'string' && Object.hasOwn(p.clips, a.clipId) && p.clips[a.clipId];
    if (!c) throw new Error('A proposed edit refers to a clip that no longer exists.');
    if (a.type === 'rename') {
      if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200) throw new Error('Invalid clip name.');
      return { type: a.type, clipId: c.id, name: a.name.trim() };
    }
    if (a.type === 'setProperty') {
      const range = Object.hasOwn(PROPERTY_RANGES, a.property) && PROPERTY_RANGES[a.property];
      if (
        !range ||
        typeof a.value !== 'number' ||
        !Number.isFinite(a.value) ||
        a.value < range[0] ||
        a.value > range[1]
      )
        throw new Error('Unsupported property or value in proposed edit.');
      const audio = ['volume', 'micVolume', 'sysVolume'].includes(a.property) || a.property.startsWith('aFade');
      if (['micVolume', 'sysVolume'].includes(a.property) && c.type !== 'recording')
        throw new Error('Component volume applies only to recordings.');
      if (!(audio ? ['video', 'audio', 'recording'] : VISUAL).includes(c.type))
        throw new Error('This property does not apply to the clip.');
      if (c.kf?.[a.property]?.length)
        throw new Error('This property has keyframes. Edit those in the inspector first.');
      if (a.property.includes('Fade') && a.value > c.dur) throw new Error('A fade cannot be longer than its clip.');
      return { type: a.type, clipId: c.id, property: a.property, value: a.value };
    }
    if (a.type === 'addEffect') {
      if (
        !['video', 'image', 'recording'].includes(c.type) ||
        !['chroma', 'luma', 'blur', 'saturation', 'contrast', 'opacity'].includes(a.effect)
      )
        throw new Error('Unsupported effect proposal.');
      return { type: a.type, clipId: c.id, effect: a.effect };
    }
    throw new Error('Unsupported AI action.');
  });
}
export function applyAIActions(p, actions) {
  const valid = validateAIActions(p, actions); // Validate the whole batch before any mutation.
  for (const a of valid) {
    const c = p.clips[a.clipId];
    if (a.type === 'rename') c.name = a.name;
    else if (a.type === 'setProperty') c.props[a.property] = a.value;
    else {
      const e = makeVideoEffect(a.effect);
      if (c.type === 'recording') e.target = p.media[c.mediaId]?.streams?.camera?.hasVideo ? 'camera' : 'screen';
      c.props.vfx = [...(c.props.vfx || []), e];
    }
  }
}


// Validates a patch against existing settings: only known keys, same type as now, sane sizes.
// This lets the agent change any simple setting a person can change, without a list per setting.
export function checkPatch(current, patch, what) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error(`${what} must be an object.`);
  for (const [k, v] of Object.entries(patch)) {
    const now = Object.hasOwn(current, k) ? current[k] : undefined;
    if (now === undefined || now === null || typeof now === 'object') throw new Error(`${what}: ${k} cannot be changed this way.`);
    if (typeof v !== typeof now || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && v.length > 2000))
      throw new Error(`${what}: ${k} must be a ${typeof now}, like ${JSON.stringify(now)}.`);
  }
  return patch;
}
const MAX_TIME = 24 * 3600;
const STACK_EFFECTS = ['chroma', 'luma', 'blur', 'saturation', 'contrast', 'opacity'];
function clipOf(p, id) {
  const c = typeof id === 'string' && Object.hasOwn(p.clips, id) && p.clips[id];
  if (!c) throw new Error(`No clip with id ${JSON.stringify(id)}. Call get_timeline for current ids.`);
  return c;
}
function time(v, name, optional = false) {
  if (v == null && optional) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_TIME) throw new Error(`${name} must be a number of seconds.`);
  return round(v);
}
function text(v, name, max = 2000) {
  if (typeof v !== 'string' || v.length > max) throw new Error(`${name} must be text up to ${max} characters.`);
  return v;
}
function lane(v, min, fallback) {
  if (v == null) return fallback;
  if (!Number.isInteger(v) || v < min || v > 50 || v === 0) throw new Error(`lane must be a non-zero integer from ${min} to 50. Lane 0 is the storyline.`);
  return v;
}
function summary(p, c) {
  return {
    id: c.id,
    type: c.type,
    name: c.type === 'title' ? titleText(c) : c.name || p.media[c.mediaId]?.name || c.type,
    lane: c.lane,
    start: c.start,
    end: round(c.start + c.dur),
    duration: c.dur,
    ...(c.mediaId ? { mediaId: c.mediaId, sourceIn: c.in } : {}),
    ...(c.enabled === false ? { enabled: false } : {}),
    ...((c.speed ?? 1) !== 1 ? { speed: c.speed } : {}),
    ...(c.transition ? { transitionIn: c.transition } : {}),
    ...(c.transitionOut ? { transitionOut: c.transitionOut } : {}),
    ...(c.type === 'caption' || (c.type === 'title' && !c.props.template) ? { text: String(c.props.text ?? '').slice(0, 1000) } : {}),
    ...(c.props?.subtext ? { subtext: String(c.props.subtext).slice(0, 500) } : {}),
    ...(c.props?.fields ? { fields: c.props.fields } : {}),
    properties: Object.fromEntries(Object.entries(c.props || {}).filter(([k, v]) => Object.hasOwn(PROPERTY_RANGES, k) && v)),
    ...(c.props?.vfx?.length ? { effectStack: c.props.vfx.map((e) => e.type) } : {}),
    // Sporing: bare en oversikt, ikke punktene i sporet.
    ...(c.props?.tracks?.length ? { tracks: c.props.tracks.map((t) => ({ id: t.id, name: t.name, seconds: round((t.frames.length - 1) / t.fps) })) } : {}),
    ...(c.props?.follow ? { followsTrack: { videoClipId: c.props.follow.clipId, trackId: c.props.follow.trackId, mode: 'live', rotation: Boolean(c.props.follow.rotation), scale: Boolean(c.props.follow.scale) } } : {}),
    ...(c.props?.trackedKeys?.length ? { hasTrackingKeyframes: true } : {}),
  };
}
const titleList = () =>
  TITLE_TEMPLATES.map((t) => `${t.id}${t.props.fields ? ` [fields: ${Object.keys(t.props.fields).join(', ')}]` : ''}`).join('; ');
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const num = (description) => ({ type: 'number', description });
const ids = { type: 'array', items: { type: 'string' }, description: 'Clip ids from get_timeline.' };

// read(p, args, ctx) only inspects. edit(draft, args) changes the project and is one undo step.
export const TOOLS = [
  {
    name: 'get_timeline',
    description:
      'Read the project: format, duration, playhead, selection, the primary storyline order and every clip with timing, text, properties and effects. Optionally limit to a time window.',
    parameters: obj({ from: num('Window start in timeline seconds.'), to: num('Window end in timeline seconds.') }),
    read(p, a, ctx) {
      const from = time(a.from, 'from', true) ?? 0,
        to = time(a.to, 'to', true) ?? Infinity;
      const all = Object.values(p.clips)
        .filter((c) => c.start < to && c.start + c.dur > from)
        .sort((x, y) => x.lane - y.lane || x.start - y.start);
      const clips = all.slice(0, 400);
      return {
        name: p.name,
        width: p.width,
        height: p.height,
        fps: p.fps,
        duration: p.duration,
        playhead: ctx?.time ?? 0,
        selected: ctx?.selection ?? [],
        primaryStoryline: p.primary,
        markers: (p.markers || []).map((m) => ({ time: m.t ?? m.time, name: m.name })),
        customTitleTemplates: Object.values(p.templates || {}).map((t) => ({ id: t.id, name: t.name, fields: t.fields.map((f) => f.id), colors: t.colors.map((c) => c.id) })),
        clips: clips.map((c) => summary(p, c)),
        ...(all.length > clips.length ? { omittedClips: all.length - clips.length } : {}),
      };
    },
  },
  {
    name: 'list_media',
    description: 'List the media library: ids, names, kind (video, audio, image, recording), duration, size and whether each item is already used.',
    parameters: obj({}),
    read(p) {
      const used = new Set(Object.values(p.clips).map((c) => c.mediaId));
      return Object.values(p.media).map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        duration: m.duration,
        ...(m.width ? { width: m.width, height: m.height } : {}),
        ...(m.kind === 'recording' ? { streams: Object.keys(m.streams || {}) } : {}),
        used: used.has(m.id),
      }));
    },
  },
  {
    name: 'add_media_to_timeline',
    description:
      'Place media on the timeline. mode "append" adds to the end of the primary storyline, "insert" inserts at `at` and pushes later clips right, "overwrite" replaces storyline content from `at`, "connect" puts it on a lane above (B-roll, overlays) or below (audio) at `at`. Audio files always go to a lane below. Use sourceIn and duration to use only part of the source.',
    parameters: obj(
      {
        mediaId: { type: 'string' },
        mode: { type: 'string', enum: ['append', 'insert', 'overwrite', 'connect'] },
        at: num('Timeline seconds for insert, overwrite and connect.'),
        lane: { type: 'integer', description: 'For connect: 1 and up above the storyline, -1 and down for audio.' },
        sourceIn: num('Seconds into the source where the clip starts.'),
        duration: num('Clip length in seconds.'),
        includeAudio: { type: 'boolean' },
      },
      ['mediaId'],
    ),
    edit(p, a) {
      const m = typeof a.mediaId === 'string' && Object.hasOwn(p.media, a.mediaId) && p.media[a.mediaId];
      if (!m) throw new Error('Unknown mediaId. Call list_media.');
      const mode = a.mode ?? 'append';
      if (!['append', 'insert', 'overwrite', 'connect'].includes(mode)) throw new Error('Unsupported mode.');
      const sourceIn = time(a.sourceIn, 'sourceIn', true),
        duration = time(a.duration, 'duration', true);
      if (m.kind !== 'image' && m.duration && (sourceIn ?? 0) + (duration ?? 0) > m.duration + 0.01)
        throw new Error(`The source is only ${m.duration} s long.`);
      if (duration === 0) throw new Error('duration must be above zero.');
      autoFormat(p, m);
      const id = addMediaClip(p, m, mode, time(a.at, 'at', true), lane(a.lane, -50, undefined), {
        in: sourceIn,
        dur: duration ?? (sourceIn != null && m.kind !== 'image' ? m.duration - sourceIn : undefined),
        includeAudio: a.includeAudio,
      });
      return summary(p, p.clips[id]);
    },
  },
  {
    name: 'split_clips',
    description: 'Cut (blade) clips at a timeline time. Without clipIds, cuts every clip under that time. Returns the ids of the new right-hand pieces.',
    parameters: obj({ at: num('Timeline seconds.'), clipIds: ids }, ['at']),
    edit(p, a) {
      const list = a.clipIds == null ? null : a.clipIds.map((id) => clipOf(p, id).id);
      return { newClipIds: bladeAt(p, time(a.at, 'at'), list) };
    },
  },
  {
    name: 'delete_clips',
    description: 'Delete clips. With ripple (default) the storyline closes the gap; ripple false leaves a gap so later clips keep their times.',
    parameters: obj({ clipIds: ids, ripple: { type: 'boolean' } }, ['clipIds']),
    edit(p, a) {
      if (!Array.isArray(a.clipIds) || !a.clipIds.length) throw new Error('clipIds is required.');
      deleteClips(p, a.clipIds.map((id) => clipOf(p, id).id), { ripple: a.ripple !== false });
      return { deleted: a.clipIds.length };
    },
  },
  {
    name: 'trim_clip',
    description:
      'Move the start or end edge of a clip by `seconds` (positive moves the edge right, later). Trimming the start by +2 removes the first two seconds; trimming the end by -2 removes the last two. Limited by available source media. Storyline clips ripple.',
    parameters: obj({ clipId: { type: 'string' }, edge: { type: 'string', enum: ['start', 'end'] }, seconds: num('Signed seconds.') }, ['clipId', 'edge', 'seconds']),
    edit(p, a) {
      const c = clipOf(p, a.clipId);
      if (!['start', 'end'].includes(a.edge) || typeof a.seconds !== 'number' || !Number.isFinite(a.seconds)) throw new Error('Give edge and seconds.');
      trimClip(p, c.id, a.edge, a.seconds);
      return summary(p, p.clips[c.id]);
    },
  },
  {
    name: 'move_clip',
    description:
      'Move a clip. For lanes other than 0 give start (timeline seconds) and lane. For lane 0 give primaryIndex, the position in the storyline order (0 is first).',
    parameters: obj({ clipId: { type: 'string' }, start: num('Timeline seconds.'), lane: { type: 'integer' }, primaryIndex: { type: 'integer' } }, ['clipId']),
    edit(p, a) {
      const c = clipOf(p, a.clipId);
      const to = a.lane == null ? c.lane : a.lane === 0 ? 0 : lane(a.lane, -50);
      if (to === 0 && a.primaryIndex != null && (!Number.isInteger(a.primaryIndex) || a.primaryIndex < 0)) throw new Error('primaryIndex must be 0 or more.');
      moveClip(p, c.id, { start: time(a.start, 'start', true) ?? c.start, lane: to, primaryIndex: a.primaryIndex });
      return summary(p, p.clips[c.id]);
    },
  },
  {
    name: 'add_title',
    description: `Add a title or graphic on a lane above the storyline. Templates: ${'TITLES'}. Also the custom templates listed by get_timeline. Plain templates use text and subtext; templates with fields take a fields object (text is put in the first field when fields are omitted) and colors.`,
    parameters: obj(
      {
        template: { type: 'string' },
        text: { type: 'string' },
        subtext: { type: 'string' },
        fields: { type: 'object', additionalProperties: { type: 'string' } },
        colors: { type: 'object', additionalProperties: { type: 'string' }, description: 'Template colour ids to hex colours.' },
        at: num('Timeline seconds.'),
        duration: num('Seconds, default 4.'),
        lane: { type: 'integer', description: '1 or higher, default 1.' },
      },
      ['at'],
    ),
    edit(p, a) {
      const custom = typeof a.template === 'string' && Object.hasOwn(p.templates || {}, a.template) && p.templates[a.template];
      const tpl = custom
        ? { label: custom.name, props: { template: custom.id, ...templateDefaults(custom) } }
        : TITLE_TEMPLATES.find((t) => t.id === (a.template ?? 'center'));
      if (!tpl) throw new Error('Unknown title template.');
      const at = time(a.at, 'at'),
        dur = time(a.duration, 'duration', true) || 4;
      const clip = makeClip('title', { start: at, dur, lane: 1, name: tpl.label });
      Object.assign(clip.props, deepClone(tpl.props));
      if (clip.props.template) {
        const fields = a.fields ?? (a.text != null ? { [Object.keys(clip.props.fields)[0]]: a.text } : {});
        for (const [k, v] of Object.entries(fields)) {
          if (!Object.hasOwn(clip.props.fields, k)) throw new Error(`Template ${tpl.label} has no field ${k}.`);
          clip.props.fields[k] = text(v, k);
        }
        for (const [k, v] of Object.entries(a.colors || {})) {
          if (!Object.hasOwn(clip.props.colors, k) || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`Invalid colour ${k}.`);
          clip.props.colors[k] = v;
        }
      } else {
        if (a.text != null) clip.props.text = text(a.text, 'text');
        if (a.subtext != null) clip.props.subtext = text(a.subtext, 'subtext');
      }
      placeFree(p, clip, at, lane(a.lane, 1, 1));
      return summary(p, clip);
    },
  },
  {
    name: 'add_captions',
    description:
      'Add subtitles (captions) at timeline times. replace true removes all existing captions first (use it for a full subtitle track, for example a translation). Timing is fitted to subtitle rules: at least 1 s on screen, extended into following silence when the text needs more reading time, a short gap before the next caption, no overlaps. Returns warnings for captions that are too fast to read (over 17 characters per second), longer than two lines of 42 characters or longer than 7 s. Fix every warning by shortening or merging the text and call again with replace true. One caption is one complete phrase; use \n for a line break.',
    parameters: obj(
      {
        captions: {
          type: 'array',
          items: obj({ start: num('Timeline seconds.'), end: num('Timeline seconds.'), text: { type: 'string' } }, ['start', 'end', 'text']),
        },
        replace: { type: 'boolean' },
      },
      ['captions'],
    ),
    edit(p, a) {
      if (!Array.isArray(a.captions) || !a.captions.length || a.captions.length > 3000) throw new Error('Give 1 to 3000 captions.');
      const items = a.captions.map((c) => {
        const start = time(c?.start, 'start'),
          end = time(c?.end, 'end');
        if (end <= start) throw new Error('A caption must end after it starts.');
        if (!text(c.text, 'text', 500).trim()) throw new Error('A caption needs text.');
        return { start, end, text: c.text };
      });
      if (a.replace) for (const c of Object.values(p.clips)) if (c.lane === CAPTION_LANE) delete p.clips[c.id];
      const fitted = fitCaptions(items, { fps: p.fps });
      for (const c of fitted.items) {
        const clip = makeClip('caption', { start: c.start, dur: round(c.end - c.start), lane: CAPTION_LANE, props: { text: c.text, align: null, pos: null }, name: 'Caption' });
        p.clips[clip.id] = clip;
      }
      return { added: fitted.items.length, warnings: fitted.warnings.slice(0, 80), ...(fitted.warnings.length > 80 ? { moreWarnings: fitted.warnings.length - 80 } : {}) };
    },
  },
  {
    name: 'set_clip_properties',
    description:
      `Change properties on one or many clips in one undo step. Any simple property shown by get_clip can be set with a value of the same type (for example x, y, scale, rotation, anchorX, anchorY (pixels from the centre of the clip, or of the PiP frame; scale and rotation pivot here), cameraOffsetX, cameraOffsetY (-1..1, moves the camera picture inside its PiP frame, 1 is right and down), title font, size, color, showCamera, pipSize). Colour (all -1..1, 0 is neutral): exposure (1 is +2 stops), contrast, highlights (negative recovers bright areas), shadows (positive lifts dark areas), saturation, temperature (positive warmer), tint (positive magenta, negative green). Colour wheels: liftX/liftY/liftL for shadows, gammaX/gammaY/gammaL for midtones, gainX/gainY/gainL for highlights; L is brightness, X/Y push the colour towards a hue at amount a: orange (0.5a, 0.87a), teal (-0.87a, -0.5a), red (0.87a, 0.5a), blue (0, -a), green (-0.87a, 0.5a), magenta (0.87a, -0.5a); a is usually 0.05 to 0.3. Other: opacity 0..1; volume, micVolume, sysVolume in dB -60..12 (0 unchanged; recordings: micVolume is camera/mic audio, sysVolume screen audio); blur 0..100 px; film: a film look id, or "" for none (${FILM_IDS.join(', ')}; ortho is red-blind black and white like The Lighthouse, bw* are black and white with a lens filter), with filmMix 0..1 for its strength (1 if not set); vFadeIn, vFadeOut, aFadeIn, aFadeOut in seconds; name; enabled (false hides and mutes); text and subtext for plain titles and captions.`,
    parameters: obj(
      {
        edits: {
          type: 'array',
          items: obj({ clipId: { type: 'string' }, properties: { type: 'object', description: 'For example {"exposure": 0.1, "temperature": -0.1}.' } }, ['clipId', 'properties']),
        },
      },
      ['edits'],
    ),
    edit(p, a) {
      if (!Array.isArray(a.edits) || !a.edits.length || a.edits.length > 500) throw new Error('Give 1 to 500 edits.');
      const numeric = [],
        other = [];
      for (const e of a.edits) {
        const c = clipOf(p, e?.clipId),
          props = e.properties && typeof e.properties === 'object' ? e.properties : {};
        for (const [k, v] of Object.entries(props)) {
          if (Object.hasOwn(PROPERTY_RANGES, k)) numeric.push({ type: 'setProperty', clipId: c.id, property: k, value: v });
          else if (k === 'film') {
            if (v !== '' && !FILM_IDS.includes(v)) throw new Error(`Unknown film look ${JSON.stringify(v)}.`);
            other.push([c, k, v || undefined]);
          } else if (k === 'name') numeric.push({ type: 'rename', clipId: c.id, name: v });
          else if (k === 'enabled' && typeof v === 'boolean') other.push([c, k, v]);
          else if (k === 'template') throw new Error('Add a new title to change its template.');
          else if (c.kf?.[k]?.length) throw new Error(`${k} on clip ${c.id} has keyframes. Edit those in the inspector.`);
          else other.push([c, k, checkPatch(c.props, { [k]: v }, `Clip ${c.id}`)[k]]);
        }
      }
      applyAIActions(p, numeric);
      for (const [c, k, v] of other) k === 'enabled' ? (c.enabled = v) : (c.props[k] = v);
      return { changedClips: new Set(a.edits.map((e) => e.clipId)).size };
    },
  },
  {
    name: 'get_clip',
    description: 'Read every property of one clip, as shown in the inspector, and which properties have keyframes.',
    parameters: obj({ clipId: { type: 'string' } }, ['clipId']),
    read(p, a) {
      const c = clipOf(p, a.clipId);
      const props = Object.fromEntries(Object.entries(c.props).filter(([, v]) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => typeof x !== 'object'))));
      return { ...summary(p, c), properties: props, keyframed: Object.keys(c.kf || {}).filter((k) => c.kf[k]?.length), ...(c.props.fields ? { fields: c.props.fields } : {}) };
    },
  },
  {
    name: 'set_project_settings',
    description:
      'Change the project: name, frame size (width and height, even numbers, for example 1920×1080, 1080×1920 for vertical, 1080×1080 square), frame rate (fps) and the caption style (font, size, weight, color, outlineColor, outlineWidth, bg, bgColor, bgOpacity, shadow, align, position "bottom" or "top", maxLines).',
    parameters: obj({ name: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, fps: { type: 'number' }, captionStyle: { type: 'object' } }),
    edit(p, a) {
      if (a.name != null) p.name = text(a.name, 'name', 200).trim() || p.name;
      for (const k of ['width', 'height'])
        if (a[k] != null) {
          if (!Number.isInteger(a[k]) || a[k] < 16 || a[k] > 8192 || a[k] % 2) throw new Error(`${k} must be an even number from 16 to 8192.`);
          p[k] = a[k];
        }
      if (a.fps != null) {
        if (![23.976, 24, 25, 29.97, 30, 50, 59.94, 60].includes(a.fps)) throw new Error('fps must be 23.976, 24, 25, 29.97, 30, 50, 59.94 or 60.');
        p.fps = a.fps;
      }
      if (a.width != null || a.height != null || a.fps != null) p.autoFormat = false;
      if (a.captionStyle != null) p.captionStyle = { ...p.captionStyle, ...checkPatch(p.captionStyle || {}, a.captionStyle, 'captionStyle') };
      return { name: p.name, width: p.width, height: p.height, fps: p.fps, captionStyle: p.captionStyle };
    },
  },
  {
    name: 'create_title_template',
    description: `Design a new animated title, lower third (supering), callout or end card and add it to the project's title library, then place it with add_title. Give replaceId to change a template you made earlier; titles using it update. Format: {name, category, anchor (bottom-left, bottom-right, top-left, top-right, center, bottom, top, left or right: the corner it sticks to in other aspect ratios), size [1920,1080], font (sans, serif, mono, rounded, condensed or a font name), timing {in, out} in seconds, fields [{id, label, default}], colors [{id, label, default "#rrggbb"}], layers}. Coordinates are pixels in the 1920×1080 design. Text layer: {type "text", id, text "{{fieldId}}", size, weight, color "#hex" or "{{colorId}}", x, y (top of the text), align left|center|right, uppercase, letterSpacing (em), shadow, opacity, z}. Rectangle: {type "rect", id, x, y, w, h, color, radius, opacity, z, hideIfEmpty textLayerId}. Numbers can be expressions using other layers: width(id), height(id), left(id), right(id), top(id), bottom(id), max(a,b), min(a,b) with + - * /. Each layer can have "in" and "out" animations: {x, y, opacity, scale, scaleX, scaleY, rotation, reveal, revealY: [[progress 0..1, value, ease], ...]}; ease is linear, in, out, inOut, back or hold; x and y are offsets, reveal wipes from the left (revealFrom "right"), revealY from the bottom; pivot [0.5, 0.5] centres scale and rotation. "in" plays over timing.in at the start and "out" over timing.out at the end. Example: ${'EXAMPLE'}`,
    parameters: obj({ template: { type: 'object' }, replaceId: { type: 'string' } }, ['template']),
    edit(p, a) {
      if (!a.template || typeof a.template !== 'object' || JSON.stringify(a.template).length > 60000) throw new Error('template must be an object under 60 kB.');
      const id = a.replaceId != null ? a.replaceId : `custom-${uid()}`;
      if (a.replaceId != null && !Object.hasOwn(p.templates || {}, id)) throw new Error('replaceId must be a custom template in this project.');
      const tpl = validateTemplate({ ...a.template, format: TEMPLATE_FORMAT, id });
      if (tpl.layers.length > 60 || !tpl.fields.every((f) => /^[\w-]{1,40}$/.test(f.id))) throw new Error('Use at most 60 layers and simple field ids.');
      p.templates = { ...(p.templates || {}), [id]: tpl };
      return { templateId: id, fields: tpl.fields.map((f) => f.id), colors: tpl.colors.map((c) => c.id) };
    },
  },
  {
    name: 'get_story',
    description:
      'Read the story saved in the project: the brief (purpose, audience, length, tone), the outline or paper edit, notes about each media item, and the attached documents such as a script, storyboard or interview questions. Give document to read one in full (from is a character offset for long ones).',
    parameters: obj({ document: { type: 'string' }, from: { type: 'integer' } }),
    read(p, a) {
      const st = p.story || {};
      const docs = st.documents || [];
      if (a.document != null) {
        const d = docs.find((x) => x.name === a.document);
        if (!d) throw new Error('No document with that name.');
        const from = Number.isInteger(a.from) && a.from > 0 ? a.from : 0;
        return { name: d.name, from, text: d.text.slice(from, from + 30000), ...(d.text.length > from + 30000 ? { next: from + 30000 } : {}) };
      }
      return {
        brief: st.brief || '',
        outline: st.outline || '',
        mediaNotes: st.mediaNotes || {},
        documents: docs.map((d) => ({ name: d.name, characters: d.text.length, start: d.text.slice(0, 300) })),
      };
    },
  },
  {
    name: 'set_story',
    description:
      'Save the story to the project so it is kept for later requests: brief (what the video is for, audience, length, tone, must-have moments), outline (the paper edit: beats in order with the chosen takes and why), and mediaNotes (a short log of what each media item contains, by media id, so long footage need not be inspected again). Fields you leave out are kept.',
    parameters: obj({ brief: { type: 'string' }, outline: { type: 'string' }, mediaNotes: { type: 'object', additionalProperties: { type: 'string' } } }),
    edit(p, a) {
      const st = { brief: '', outline: '', documents: [], mediaNotes: {}, ...(p.story || {}) };
      if (a.brief != null) st.brief = text(a.brief, 'brief', 20000);
      if (a.outline != null) st.outline = text(a.outline, 'outline', 60000);
      if (a.mediaNotes != null) {
        if (typeof a.mediaNotes !== 'object') throw new Error('mediaNotes must be an object.');
        st.mediaNotes = { ...st.mediaNotes };
        for (const [id, note] of Object.entries(a.mediaNotes)) {
          if (!Object.hasOwn(p.media, id)) throw new Error(`Unknown media id ${id}.`);
          st.mediaNotes[id] = text(note, 'note', 4000);
        }
      }
      p.story = st;
      return { saved: true };
    },
  },
  {
    name: 'add_video_effect',
    description: `Add an effect to the top-to-bottom effect stack of a video, image or recording clip: ${STACK_EFFECTS.join(', ')}. chroma removes a green/blue screen; luma keys dark areas.`,
    parameters: obj({ clipId: { type: 'string' }, effect: { type: 'string', enum: STACK_EFFECTS } }, ['clipId', 'effect']),
    edit(p, a) {
      applyAIActions(p, [{ type: 'addEffect', clipId: clipOf(p, a.clipId).id, effect: a.effect }]);
      return summary(p, p.clips[a.clipId]);
    },
  },
  {
    name: 'add_transition',
    description: `Add a transition on a storyline (lane 0) clip. edge "start" blends from the previous clip, "end" transitions out. Types: ${TRANSITIONS.map((t) => t.id).join(', ')}.`,
    parameters: obj(
      { clipId: { type: 'string' }, type: { type: 'string', enum: TRANSITIONS.map((t) => t.id) }, duration: num('Seconds, 0.1 to 4.'), edge: { type: 'string', enum: ['start', 'end'] } },
      ['clipId', 'type'],
    ),
    edit(p, a) {
      const c = clipOf(p, a.clipId);
      if (c.lane !== 0) throw new Error('Transitions go on storyline clips (lane 0).');
      if (!TRANSITIONS.some((t) => t.id === a.type)) throw new Error('Unknown transition type.');
      setTransition(p, c.id, a.type, time(a.duration, 'duration', true) ?? 1, a.edge === 'end' ? 'end' : 'start');
      return summary(p, c);
    },
  },
];
for (const t of TOOLS) t.description = t.description.replace('TITLES', titleList()).replace('EXAMPLE', JSON.stringify(BUILTIN_TEMPLATES[0]));
export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));
// What is visible at a time, as text. Lets models without image input check the composition.
export function describeAt(p, T) {
  const on = Object.values(p.clips).filter((c) => c.enabled !== false && c.start <= T && T < c.start + c.dur);
  return { time: T, primary: primaryAt(p, T)?.clip?.id ?? null, clips: on.sort((a, b) => a.lane - b.lane).map((c) => summary(p, c)) };
}

// Light and colour of a picture as numbers, so the agent can judge exposure, contrast, colour cast and
// saturation, compare clips and match a reference image, also with models that cannot see images.
export function lookStats({ data, width, height }) {
  const n = width * height,
    hist = new Uint32Array(256);
  let sum = 0,
    sat = 0,
    warm = 0,
    green = 0,
    mid = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const r = data[i] / 255,
      g = data[i + 1] / 255,
      b = data[i + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b,
      max = Math.max(r, g, b);
    hist[Math.min(255, Math.round(y * 255))]++;
    sum += y;
    sat += max ? (max - Math.min(r, g, b)) / max : 0;
    if (y > 0.15 && y < 0.85) {
      warm += r - b;
      green += g - (r + b) / 2;
      mid++;
    }
  }
  const pct = (q) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= q * n) return i / 255;
    return 1;
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  let low = 0,
    high = 0;
  for (let i = 0; i < 6; i++) low += hist[i];
  for (let i = 250; i < 256; i++) high += hist[i];
  return {
    brightness: r2(sum / n),
    blackPoint: r2(pct(0.02)),
    median: r2(pct(0.5)),
    whitePoint: r2(pct(0.98)),
    crushedBlacks: r2(low / n),
    clippedHighlights: r2(high / n),
    saturation: r2(sat / n),
    warmth: r2(mid ? warm / mid : 0),
    greenCast: r2(mid ? green / mid : 0),
  };
}
export const LOOK_GUIDE =
  'Look values are 0..1 except warmth and greenCast. Natural footage: brightness 0.35-0.5, blackPoint under 0.08, whitePoint 0.85-0.97, crushedBlacks and clippedHighlights under 0.02, saturation 0.2-0.4. warmth is red minus blue in midtones (about 0 is neutral, positive is warm); greenCast above 0.02 looks green, below -0.02 magenta.';

// Moves cut points that fall in a pause so the cut keeps a short breath of silence, never more.
export function snapToPauses(sourceIn, sourceOut, pauses = [], pad = 0.15) {
  for (const [a, b] of pauses) {
    if (sourceIn >= a && sourceIn <= b) sourceIn = Math.max(a, b - pad);
    if (sourceOut >= a && sourceOut <= b) sourceOut = Math.min(b, a + pad);
  }
  return [round(sourceIn), round(sourceOut)];
}
// Places a whole planned edit in one step: storyline segments in order, overlays and titles timed
// relative to a storyline segment (attachTo index + offset), so the plan stays right while it is built.
export function buildSequence(p, a) {
  const list = (v, max, name) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.length > max) throw new Error(`${name} must be a list of at most ${max}.`);
    return v;
  };
  const storyline = list(a.storyline, 500, 'storyline'),
    overlays = list(a.overlays, 500, 'overlays'),
    titles = list(a.titles, 200, 'titles');
  const source = (x, i, name) => {
    const m = typeof x?.mediaId === 'string' && Object.hasOwn(p.media, x.mediaId) && p.media[x.mediaId];
    if (!m) throw new Error(`${name}[${i}]: unknown mediaId.`);
    const sIn = time(x.sourceIn, `${name}[${i}].sourceIn`),
      sOut = time(x.sourceOut, `${name}[${i}].sourceOut`);
    if (sOut <= sIn + 0.04) throw new Error(`${name}[${i}]: sourceOut must be after sourceIn.`);
    if (m.kind !== 'image' && m.duration && sOut > m.duration + 0.05) throw new Error(`${name}[${i}]: the source is only ${m.duration} s long.`);
    return { m, sIn, dur: round(sOut - sIn) };
  };
  if (a.replace) {
    p.clips = {};
    p.primary = [];
  }
  const story = storyline.map((x, i) => {
    const { m, sIn, dur } = source(x, i, 'storyline');
    autoFormat(p, m);
    return addMediaClip(p, m, 'append', null, null, { in: sIn, dur, includeAudio: x.includeAudio });
  });
  const at = (x, i, name) => {
    if (x.attachTo == null) return time(x.at, `${name}[${i}].at`);
    if (!Number.isInteger(x.attachTo) || !story[x.attachTo]) throw new Error(`${name}[${i}].attachTo must be a storyline index.`);
    return round(Math.max(0, p.clips[story[x.attachTo]].start + (Number.isFinite(x.offset) ? x.offset : 0)));
  };
  const placed = overlays.map((x, i) => {
    const { m, sIn, dur } = source(x, i, 'overlays');
    const id = addMediaClip(p, m, 'connect', at(x, i, 'overlays'), lane(x.lane, -50, m.kind === 'audio' ? -1 : 1), { in: sIn, dur, includeAudio: x.includeAudio ?? m.kind === 'audio' });
    if (x.speed != null) {
      if (typeof x.speed !== 'number' || x.speed < 0.1 || x.speed > 20) throw new Error(`overlays[${i}].speed must be 0.1 to 20.`);
      setSpeed(p, id, x.speed);
    }
    if (x.volume != null) applyAIActions(p, [{ type: 'setProperty', clipId: id, property: 'volume', value: x.volume }]);
    return p.clips[id];
  });
  const made = titles.map((x, i) => TOOL_MAP.get('add_title').edit(p, { ...x, attachTo: undefined, offset: undefined, at: at(x, i, 'titles') }));
  return {
    storyline: story.map((id, i) => ({ index: i, clipId: id, start: p.clips[id].start, end: round(p.clips[id].start + p.clips[id].dur) })),
    overlays: placed.map((c) => ({ clipId: c.id, start: c.start, end: round(c.start + c.dur), lane: c.lane })),
    titles: made.map((t) => ({ clipId: t.id, start: t.start, end: t.end })),
  };
}
export const BUILD_SEQUENCE_SCHEMA = obj(
  {
    replace: { type: 'boolean', description: 'Remove everything on the timeline first, including captions.' },
    storyline: {
      type: 'array',
      description: 'Main segments in playback order, for example the good takes of a talking head.',
      items: obj({ mediaId: { type: 'string' }, sourceIn: num('Source seconds.'), sourceOut: num('Source seconds.'), includeAudio: { type: 'boolean' } }, ['mediaId', 'sourceIn', 'sourceOut']),
    },
    overlays: {
      type: 'array',
      description: 'Connected clips: screen recordings or B-roll above (lane 1 and up, no audio by default), music or sound below (lane -1 and down).',
      items: obj(
        {
          mediaId: { type: 'string' },
          sourceIn: num('Source seconds.'),
          sourceOut: num('Source seconds.'),
          attachTo: { type: 'integer', description: 'Storyline index the overlay is timed against.' },
          offset: num('Seconds after the start of that storyline segment.'),
          at: num('Absolute timeline seconds, instead of attachTo.'),
          lane: { type: 'integer' },
          speed: num('Playback speed, for example 2 to speed up a slow screen action.'),
          volume: num('dB.'),
          includeAudio: { type: 'boolean' },
        },
        ['mediaId', 'sourceIn', 'sourceOut'],
      ),
    },
    titles: {
      type: 'array',
      items: obj(
        {
          template: { type: 'string' },
          text: { type: 'string' },
          subtext: { type: 'string' },
          fields: { type: 'object' },
          colors: { type: 'object' },
          attachTo: { type: 'integer' },
          offset: num('Seconds.'),
          at: num('Timeline seconds.'),
          duration: num('Seconds.'),
          lane: { type: 'integer' },
        },
        [],
      ),
    },
  },
  [],
);

// Documents the user attaches in the chat are kept with the project story, so later requests can use them.
export function addStoryDocument(p, name, body) {
  const st = { brief: '', outline: '', documents: [], mediaNotes: {}, ...(p.story || {}) };
  st.documents = [...st.documents.filter((d) => d.name !== name), { name: String(name).slice(0, 200), text: String(body).slice(0, 300000) }].slice(-20);
  p.story = st;
}
