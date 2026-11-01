// AI-assistenten i redigeringsvinduet: chatten, løkken med verktøy, og verktøyene selv.
// Modellen ser prosjektet gjennom verktøyene og endrer det med vanlige endringer (commit), så
// alt kan angres med Cmd Z, eller samlet med "Undo These Changes" under svaret.
// Samtalen sendes uendret tilbake til modellen hver gang (bare nye meldinger legges til), som
// API-et krever for at tankene (thinking) skal kunne brukes videre.
import { signal } from '@preact/signals';
import { CAPTION_LANE, TITLE_TEMPLATES, setKeyframe, titleText } from '../../shared/model.js';
import { VIDEO_FX, makeVfx } from '../../shared/vfx.js';
import { AUDIO_EFFECTS } from '../../shared/audiofx.js';
import { commit, getTime, makeCaptionClip, makeTitleClip, project, room, selection, undo, undoDepth } from './store.js';
import { COMMANDS, runCommand } from '../registry.js';
import * as commands from './commands.js';
import { seek } from './playback.js';

const api = window.api;

export const chatItems = signal([]); // det som vises: { kind: 'user'|'assistant'|'tool'|'error'|'note', text, mark? }
export const chatBusy = signal(false);

let history = []; // meldingene til API-et, bare nye legges til
let currentId = null;

export function clearChat() {
  if (chatBusy.value) return;
  history = [];
  chatItems.value = [];
}

function show(item) {
  chatItems.value = [...chatItems.value, item];
  return chatItems.value.length - 1;
}
function patch(i, fn) {
  const list = [...chatItems.value];
  list[i] = fn(list[i]);
  chatItems.value = list;
}

api.onAiText?.(({ id, text }) => {
  if (id !== currentId) return;
  const list = chatItems.value;
  const last = list[list.length - 1];
  if (last?.kind === 'assistant' && last.live) patch(list.length - 1, (x) => ({ ...x, text: x.text + text }));
  else show({ kind: 'assistant', text, live: true });
});

/* Verktøyene */

const r3 = (v) => Math.round(v * 1000) / 1000;

function clipSummary(c, p) {
  const m = c.mediaId && p.media[c.mediaId];
  const o = { id: c.id, type: c.type, name: c.name || m?.name || null, lane: c.lane, start: r3(c.start), dur: r3(c.dur) };
  if (c.mediaId) Object.assign(o, { mediaId: c.mediaId, in: r3(c.in) });
  if (c.enabled === false) o.enabled = false;
  if (c.speed != null && c.speed !== 1) o.speed = c.speed;
  if (c.type === 'title') o.text = titleText(c);
  if (c.type === 'caption') o.text = c.props.text;
  if (c.props?.vfx?.length) o.videoEffects = c.props.vfx.map((e) => e.type);
  if (c.props?.afx?.length) o.audioEffects = c.props.afx.map((e) => e.type);
  if (c.group) o.group = c.group;
  if (c.color) o.color = c.color;
  return o;
}

function projectSummary({ offset = 0, limit = 300 } = {}) {
  const p = project.value;
  const clips = Object.values(p.clips).sort((a, b) => a.start - b.start || a.lane - b.lane);
  return {
    name: p.name,
    fps: p.fps,
    width: p.width,
    height: p.height,
    duration: r3(p.duration || 0),
    playhead: r3(getTime()),
    selection: selection.value,
    range: p.range || null,
    markers: (p.markers || []).map((m) => ({ id: m.id, t: r3(m.t), name: m.name || '' })),
    media: Object.values(p.media).map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: r3(m.duration || 0), width: m.width, height: m.height })),
    clipCount: clips.length,
    clips: clips.slice(offset, offset + limit).map((c) => clipSummary(c, p)),
    ...(clips.length > offset + limit ? { more: `There are ${clips.length - offset - limit} more clips. Call again with offset ${offset + limit}.` } : {}),
  };
}

function needClips(ids) {
  const p = project.value;
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => p.clips[id]);
  if (!list.length) throw new Error('None of the clip ids exist. Call get_project to see the clips.');
  return list;
}

// Spillhodet flyttes, og vi venter litt så visningen rekker å tegne.
async function goTo(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return;
  seek(Math.max(0, t));
  await new Promise((r) => setTimeout(r, 120));
}

// Bildet i visningen som JPEG (modellen kan se det).
async function captureFrame(t) {
  if (t != null) {
    await goTo(t);
    await new Promise((r) => setTimeout(r, 400));
  }
  const cv = document.querySelector('.viewer canvas');
  if (!cv) throw new Error('The viewer is not open.');
  const w = Math.min(1024, cv.width);
  const h = Math.round((w * cv.height) / cv.width);
  const out = Object.assign(document.createElement('canvas'), { width: w, height: h });
  out.getContext('2d').drawImage(cv, 0, 0, w, h);
  return out.toDataURL('image/jpeg', 0.8).split(',')[1];
}

// Felt på klippet som modellen ikke får endre direkte (de holder sammen tidslinjen).
const LOCKED = new Set(['id', 'mediaId', 'type', 'lane', 'start', 'dur', 'in', 'kf', 'props']);

const TOOLS = [
  {
    name: 'get_project',
    description: 'Returns the project: format, playhead, selection, markers, media, and the clips on the timeline sorted by start time. Times are in seconds. Lane 0 is the main storyline, lanes above 0 are connected clips above it (titles, overlays, B-roll), negative lanes are audio below, and lane 1000 is captions.',
    input_schema: { type: 'object', properties: { offset: { type: 'integer', description: 'First clip to list, for long projects' }, limit: { type: 'integer' } } },
    run: (i) => projectSummary(i),
  },
  {
    name: 'get_clip',
    description: 'Returns everything about one clip: all properties (props) and keyframes (kf). Keyframe times are in source time of the clip, [time, value, easing].',
    input_schema: { type: 'object', properties: { clip_id: { type: 'string' } }, required: ['clip_id'] },
    run: ({ clip_id }) => {
      const c = project.value.clips[clip_id];
      if (!c) throw new Error('No clip with that id.');
      return c;
    },
  },
  {
    name: 'list_commands',
    description: 'Lists the editor commands that run_command can run (the same commands as the menus and shortcuts), with what they do. Filter with a search word, for example "speed", "audio", "key" or "transition".',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    run: ({ query = '' }) => {
      const q = query.toLowerCase();
      return COMMANDS.filter((c) => !c.anywhere && c.menu !== 'Help' && c.id !== 'prefs')
        .filter((c) => !q || `${c.id} ${c.label} ${c.keywords || ''} ${c.desc || ''}`.toLowerCase().includes(q))
        .map((c) => ({ id: c.id, label: c.label, ...(c.desc ? { desc: c.desc } : {}) }));
    },
  },
  {
    name: 'run_command',
    description: 'Runs an editor command by id, as if the user chose it in the menu. Most commands act on the selected clips and the playhead, so pass clip_ids and time to set them first. Example: blade at 12.5 with clip_ids [id] cuts that clip at 12.5 s.',
    input_schema: {
      type: 'object',
      properties: { command_id: { type: 'string' }, clip_ids: { type: 'array', items: { type: 'string' }, description: 'Select these clips first' }, time: { type: 'number', description: 'Move the playhead here first (seconds)' } },
      required: ['command_id'],
    },
    run: async ({ command_id, clip_ids, time }) => {
      const cmd = COMMANDS.find((c) => c.id === command_id);
      if (!cmd) throw new Error('Unknown command. Use list_commands.');
      if (clip_ids) selection.value = needClips(clip_ids);
      await goTo(time);
      const before = project.value;
      const ok = runCommand(cmd);
      await new Promise((r) => setTimeout(r, 250));
      if (!ok) return `${cmd.label} could not run right now (nothing to act on).`;
      const after = project.value;
      return after === before ? `Ran ${cmd.label}. The project did not change (the command may have opened a dialog or needed something else selected).` : `Ran ${cmd.label}. The project changed; there are now ${Object.keys(after.clips).length} clips. Selection: ${JSON.stringify(selection.value)}.`;
    },
  },
  {
    name: 'select_clips',
    description: 'Selects clips (the user sees the selection) and optionally moves the playhead.',
    input_schema: { type: 'object', properties: { clip_ids: { type: 'array', items: { type: 'string' } }, time: { type: 'number' } }, required: ['clip_ids'] },
    run: async ({ clip_ids, time }) => {
      selection.value = clip_ids.length ? needClips(clip_ids) : [];
      await goTo(time);
      return 'OK';
    },
  },
  {
    name: 'seek',
    description: 'Moves the playhead to a time in seconds.',
    input_schema: { type: 'object', properties: { time: { type: 'number' } }, required: ['time'] },
    run: async ({ time }) => {
      await goTo(time);
      return 'OK';
    },
  },
  {
    name: 'look_at_frame',
    description: 'Returns an image of the viewer, at the playhead or at a given time. Use it to check how something looks, for example after keying or color changes.',
    input_schema: { type: 'object', properties: { time: { type: 'number' } } },
    image: true,
    run: async ({ time }) => captureFrame(time),
  },
  {
    name: 'set_clip_props',
    description: 'Changes properties of one or more clips. props are merged into clip.props (see get_clip for the names; for example opacity 0..1, scale, x, y, rotation, volume in dB, exposure, contrast, saturation, temperature, text for titles and captions, vFadeIn and aFadeIn in seconds). Use null to remove a property. fields can set name, enabled or color on the clip itself.',
    input_schema: {
      type: 'object',
      properties: { clip_ids: { type: 'array', items: { type: 'string' } }, props: { type: 'object' }, fields: { type: 'object', properties: { name: { type: 'string' }, enabled: { type: 'boolean' }, color: { type: ['string', 'null'] } } } },
      required: ['clip_ids'],
    },
    run: ({ clip_ids, props = {}, fields = {} }) => {
      const ids = needClips(clip_ids);
      commit((p) => {
        for (const id of ids) {
          const c = p.clips[id];
          for (const [k, v] of Object.entries(props)) {
            if (v === null) delete c.props[k];
            else c.props[k] = v;
          }
          for (const [k, v] of Object.entries(fields)) if (!LOCKED.has(k)) c[k] = v;
        }
      });
      return `Changed ${ids.length} clip(s).`;
    },
  },
  {
    name: 'set_keyframe',
    description: 'Adds or changes a keyframe on a clip property so it animates. time is on the timeline in seconds. Remove all keyframes of a property with remove_all.',
    input_schema: { type: 'object', properties: { clip_id: { type: 'string' }, prop: { type: 'string' }, time: { type: 'number' }, value: {}, remove_all: { type: 'boolean' } }, required: ['clip_id', 'prop'] },
    run: ({ clip_id, prop, time, value, remove_all }) => {
      needClips([clip_id]);
      commit((p) => {
        const c = p.clips[clip_id];
        if (remove_all) return void delete c.kf[prop];
        // Nøkkelbilder lagres i klippets kildetid.
        const s = c.in + (time - c.start) * (c.speed ?? 1);
        setKeyframe(c, prop, Math.round(s * 1e6) / 1e6, value);
      });
      return 'OK';
    },
  },
  {
    name: 'add_title',
    description: `Adds a title above the storyline. template is one of: ${TITLE_TEMPLATES.map((t) => t.id).join(', ')}. text and subtext set the words.`,
    input_schema: { type: 'object', properties: { time: { type: 'number' }, duration: { type: 'number' }, template: { type: 'string' }, text: { type: 'string' }, subtext: { type: 'string' } }, required: ['time'] },
    run: ({ time, duration, template = 'center', text, subtext }) => {
      const clip = makeTitleClip(template, time);
      if (duration) clip.dur = duration;
      if (text != null) clip.props.text = text;
      if (subtext != null) clip.props.subtext = subtext;
      commit((p) => {
        const used = new Set(Object.values(p.clips).filter((c) => c.lane > 0 && c.lane < CAPTION_LANE && c.start < time + clip.dur && c.start + c.dur > time).map((c) => c.lane));
        let lane = 1;
        while (used.has(lane)) lane++;
        clip.lane = lane;
        p.clips[clip.id] = clip;
      });
      return { clip_id: clip.id };
    },
  },
  {
    name: 'add_captions',
    description: 'Adds captions (subtitles) to the caption lane. Each item has start, end (seconds) and text.',
    input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' }, text: { type: 'string' } }, required: ['start', 'end', 'text'] } } }, required: ['items'] },
    run: ({ items }) => {
      const ids = [];
      commit((p) => {
        for (const it of items) {
          const c = makeCaptionClip(it.start, it.text, Math.max(0.2, it.end - it.start));
          p.clips[c.id] = c;
          ids.push(c.id);
        }
      });
      return { clip_ids: ids };
    },
  },
  {
    name: 'add_marker',
    description: 'Adds a marker on the timeline.',
    input_schema: { type: 'object', properties: { time: { type: 'number' }, name: { type: 'string' } }, required: ['time'] },
    run: ({ time, name = '' }) => {
      commit((p) => {
        p.markers = [...(p.markers || []), { id: Math.random().toString(36).slice(2, 9), t: time, name }];
      });
      return 'OK';
    },
  },
  {
    name: 'add_video_effect',
    description: `Adds a video effect to the end of a clip's effect stack (effects run in order, so they stack). type is one of: ${Object.entries(VIDEO_FX).map(([k, v]) => `${k} (${v.desc || v.label})`).join('; ')}. params override the defaults; get_clip shows the parameter names after adding. Use run_command key:oneClick to key a green screen with automatic color.`,
    input_schema: { type: 'object', properties: { clip_ids: { type: 'array', items: { type: 'string' } }, type: { type: 'string' }, params: { type: 'object' } }, required: ['clip_ids', 'type'] },
    run: ({ clip_ids, type, params = {} }) => {
      if (!VIDEO_FX[type]) throw new Error('Unknown effect type.');
      const ids = needClips(clip_ids).filter((id) => ['video', 'image'].includes(project.value.clips[id].type));
      if (!ids.length) throw new Error('Video effects work on video and image clips.');
      commit((p) => {
        for (const id of ids) p.clips[id].props.vfx = [...(p.clips[id].props.vfx || []), makeVfx(type, params)];
      });
      return `Added ${VIDEO_FX[type].label} to ${ids.length} clip(s).`;
    },
  },
  {
    name: 'set_video_effect',
    description: 'Changes the parameters of a video effect on a clip, or switches it on or off, or removes it. effect_index is its place in clip.props.vfx (0 is first).',
    input_schema: { type: 'object', properties: { clip_id: { type: 'string' }, effect_index: { type: 'integer' }, params: { type: 'object' }, on: { type: 'boolean' }, remove: { type: 'boolean' } }, required: ['clip_id', 'effect_index'] },
    run: ({ clip_id, effect_index, params, on, remove }) => {
      needClips([clip_id]);
      commit((p) => {
        const list = p.clips[clip_id].props.vfx || [];
        if (!list[effect_index]) throw new Error('No effect at that index.');
        if (remove) list.splice(effect_index, 1);
        else {
          if (params) Object.assign(list[effect_index].p, params);
          if (on != null) list[effect_index].on = on;
        }
      });
      return 'OK';
    },
  },
  {
    name: 'add_audio_effect',
    description: `Adds an audio effect to clips with sound. type is one of: ${Object.keys(AUDIO_EFFECTS).join(', ')}. For speech, run_command audio:cleanup adds a full voice chain.`,
    input_schema: { type: 'object', properties: { clip_ids: { type: 'array', items: { type: 'string' } }, type: { type: 'string' } }, required: ['clip_ids', 'type'] },
    run: ({ clip_ids, type }) => {
      if (!AUDIO_EFFECTS[type]) throw new Error('Unknown audio effect.');
      const ids = needClips(clip_ids);
      for (const id of ids) commands.addAudioEffect(type, id);
      return `Added ${AUDIO_EFFECTS[type].label} to ${ids.length} clip(s).`;
    },
  },
  {
    name: 'add_media_to_timeline',
    description: 'Places media from the project library on the timeline. mode: append (end of the storyline), connect (above the storyline at time), or insert (at time, pushing the rest).',
    input_schema: { type: 'object', properties: { media_id: { type: 'string' }, mode: { type: 'string', enum: ['append', 'connect', 'insert'] }, time: { type: 'number' }, in: { type: 'number', description: 'Start in the media (seconds)' }, out: { type: 'number', description: 'End in the media (seconds)' } }, required: ['media_id', 'mode'] },
    run: async ({ media_id, mode, time, in: a, out: b }) => {
      const m = project.value.media[media_id];
      if (!m) throw new Error('No media with that id.');
      commands.browserPicked.value = [];
      commands.browserSelection.value = media_id;
      commands.browserRange.value = a != null || b != null ? { mediaId: media_id, in: a ?? 0, out: b ?? m.duration } : null;
      await goTo(time);
      const n = Object.keys(project.value.clips).length;
      commands.addBrowserSelection(mode);
      await new Promise((r) => setTimeout(r, 150));
      return Object.keys(project.value.clips).length > n ? `Added. Selection: ${JSON.stringify(selection.value)}` : 'Nothing was added.';
    },
  },
  {
    name: 'delete_clips',
    description: 'Deletes clips. ripple true closes the gap in the storyline (the rest moves left), false leaves a gap.',
    input_schema: { type: 'object', properties: { clip_ids: { type: 'array', items: { type: 'string' } }, ripple: { type: 'boolean' } }, required: ['clip_ids'] },
    run: ({ clip_ids, ripple = true }) => {
      selection.value = needClips(clip_ids);
      commands.deleteSelection(ripple);
      return 'OK';
    },
  },
  {
    name: 'undo',
    description: 'Undoes the last change in the project.',
    input_schema: { type: 'object', properties: {} },
    run: () => {
      undo();
      return 'OK';
    },
  },
];

const SYSTEM = `You are the editing assistant inside Reccut, a video editor with a magnetic timeline like Final Cut Pro, a screen recorder and an export room. The user talks to you in a chat panel next to the editor.

You can look at and change the open project with the tools. Every change you make is an ordinary edit, so the user can undo it. Work like this:
- Start with get_project to see what is there, and get_clip when you need the details of a clip. Do not guess clip ids.
- Prefer run_command for editing operations the editor already has (blade, trim, transitions, speed, stabilize, keying, audio cleanup and so on); list_commands shows them. Use the other tools for direct changes.
- After visual changes, look_at_frame lets you check the result.
- Times are always in seconds on the timeline unless a tool says otherwise.
- Do what was asked and nothing more. If a request is unclear or would remove a lot of material, ask first.
- When you are done, tell the user briefly what you changed, in the language they wrote in. Keep answers short; this is a small chat panel.`;

const toolDefs = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

async function runTool(block) {
  const tool = TOOLS.find((t) => t.name === block.name);
  if (!tool) return { type: 'tool_result', tool_use_id: block.id, content: `Unknown tool ${block.name}.`, is_error: true };
  try {
    if (room.value !== 'edit') room.value = 'edit';
    const out = await tool.run(block.input || {});
    if (tool.image) return { type: 'tool_result', tool_use_id: block.id, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out } }] };
    return { type: 'tool_result', tool_use_id: block.id, content: typeof out === 'string' ? out : JSON.stringify(out) };
  } catch (err) {
    return { type: 'tool_result', tool_use_id: block.id, content: err.message, is_error: true };
  }
}

// Hvis en annen modell tok over midt i et svar (fallback), sendes ikke tanker og verktøykall fra
// før byttet tilbake (det krever API-et).
function echoable(content) {
  const last = content.map((b) => b.type).lastIndexOf('fallback');
  if (last < 0) return content;
  return content.filter((b, i) => i > last || !['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use'].includes(b.type));
}

const TOOL_LABELS = {
  get_project: 'Reading the project',
  get_clip: 'Reading a clip',
  list_commands: 'Looking up commands',
  look_at_frame: 'Looking at the picture',
};

function describe(b) {
  if (TOOL_LABELS[b.name]) return TOOL_LABELS[b.name];
  if (b.name === 'run_command') return `Running ${COMMANDS.find((c) => c.id === b.input?.command_id)?.label || b.input?.command_id}`;
  return b.name.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
}

export function stopChat() {
  if (currentId) api.aiStop(currentId);
}

export async function ask(text) {
  text = text.trim();
  if (!text || chatBusy.value) return;
  chatBusy.value = true;
  const mark = undoDepth();
  show({ kind: 'user', text });
  // To brukermeldinger på rad slås sammen (for eksempel etter at et svar ble stoppet).
  const last = history[history.length - 1];
  if (last?.role === 'user') last.content = [...last.content, { type: 'text', text }];
  else history.push({ role: 'user', content: [{ type: 'text', text }] });
  try {
    for (let step = 0; step < 40; step++) {
      currentId = `ai-${Date.now()}-${step}`;
      const res = await api.aiSend({ id: currentId, system: SYSTEM, tools: toolDefs, messages: history });
      // Teksten er allerede vist mens den kom; svaret lagres slik det kom.
      const list = chatItems.value;
      if (list[list.length - 1]?.live) patch(list.length - 1, (x) => ({ ...x, live: false }));
      history.push({ role: 'assistant', content: echoable(res.content) });
      const calls = res.content.filter((b) => b.type === 'tool_use');
      if (res.stop_reason === 'pause_turn') continue;
      if (res.stop_reason === 'tool_use' && calls.length) {
        const results = [];
        for (const b of calls) {
          show({ kind: 'tool', text: describe(b) });
          results.push(await runTool(b));
        }
        history.push({ role: 'user', content: results });
        continue;
      }
      // Verktøykall som ikke ble kjørt, må likevel få et svar før neste melding.
      if (calls.length) history.push({ role: 'user', content: calls.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Not run.', is_error: true })) });
      if (res.stop_reason === 'refusal') show({ kind: 'note', text: 'The model declined this request.' });
      if (res.stop_reason === 'max_tokens') show({ kind: 'note', text: 'The answer was cut off because it got too long.' });
      break;
    }
  } catch (err) {
    show({ kind: 'error', text: /Stopped/.test(err.message) ? 'Stopped.' : err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    // Et svar som ble avbrutt, er ikke med i historikken. Står det verktøykall uten svar sist, får de et.
    const lastMsg = history[history.length - 1];
    const open = lastMsg?.role === 'assistant' ? lastMsg.content.filter((b) => b.type === 'tool_use') : [];
    if (open.length) history.push({ role: 'user', content: open.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Stopped by the user.', is_error: true })) });
  } finally {
    currentId = null;
    chatBusy.value = false;
    const changes = undoDepth() - mark;
    if (changes > 0) show({ kind: 'changes', text: `${changes} change${changes === 1 ? '' : 's'}`, mark });
  }
}

// Angrer alt assistenten gjorde i ett svar.
export function undoSince(mark) {
  let n = 0;
  while (undoDepth() > mark && n < 500) {
    undo();
    n++;
  }
  chatItems.value = chatItems.value.map((x) => (x.kind === 'changes' && x.mark === mark ? { ...x, undone: true } : x));
}

