import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAIActions, applyAIActions, TOOL_MAP, TOOLS, lookStats, checkPatch, buildSequence, snapToPauses, addStoryDocument } from '../src/shared/aiEdits.js';
import { fitCaptions } from '../src/shared/srt.js';
function project() {
  return {
    name: 'Test',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 5,
    primary: ['a'],
    markers: [],
    lanes: {},
    media: { m: { id: 'm', name: 'actor.mp4', kind: 'video', duration: 20, path: '/private/secret.mp4', streams: { main: { hasVideo: true, hasAudio: true } } } },
    clips: { a: { id: 'a', type: 'video', mediaId: 'm', name: 'Actor', dur: 5, start: 0, in: 0, lane: 0, enabled: true, props: { volume: 0 }, kf: {} } },
  };
}
const edit = (p, name, args) => TOOL_MAP.get(name).edit(p, args);
test('AI action batches reject unsupported operations and invalid numbers atomically', () => {
  for (const action of [
    { type: 'deleteFile', clipId: 'a' },
    { type: 'setProperty', clipId: 'a', property: '__proto__', value: 0 },
    { type: 'setProperty', clipId: 'a', property: 'opacity', value: NaN },
    { type: 'setProperty', clipId: 'a', property: 'opacity', value: 2 },
    { type: 'addEffect', clipId: 'a', effect: 'shell' },
    { type: 'rename', clipId: 'missing', name: 'Bad' },
    { type: 'rename', clipId: '__proto__', name: 'Bad' },
  ]) {
    const p = project(),
      before = structuredClone(p);
    assert.throws(() => applyAIActions(p, [{ type: 'rename', clipId: 'a', name: 'New' }, action]));
    assert.deepEqual(p, before);
  }
});
test('AI cannot override keyed properties, apply video effects to audio or use overlong fades', () => {
  const p = project();
  p.clips.a.kf.opacity = [
    [0, 0],
    [2, 1],
  ];
  assert.throws(() => validateAIActions(p, [{ type: 'setProperty', clipId: 'a', property: 'opacity', value: 1 }]));
  assert.throws(() => validateAIActions(p, [{ type: 'setProperty', clipId: 'a', property: 'aFadeOut', value: 10 }]));
  p.clips.a.type = 'audio';
  assert.throws(() => validateAIActions(p, [{ type: 'addEffect', clipId: 'a', effect: 'chroma' }]));
});
test('every tool has a name, description and object schema for the model', () => {
  for (const t of TOOLS) {
    assert.match(t.name, /^[a-z_]+$/);
    assert.ok(t.description.length > 20);
    assert.equal(t.parameters.type, 'object');
    assert.ok(Boolean(t.read) !== Boolean(t.edit));
  }
});
test('timeline and library reads expose no file paths or embedded pixels', () => {
  const p = project();
  p.clips.a.props.vfx = [{ type: 'difference', p: { reference: { pixels: 'secret pixels' } } }];
  const text = JSON.stringify([TOOL_MAP.get('get_timeline').read(p, {}, { time: 2, selection: ['a'] }), TOOL_MAP.get('list_media').read(p, {})]);
  assert.ok(!text.includes('/private'));
  assert.ok(!text.includes('secret pixels'));
  assert.ok(text.includes('"effectStack":["difference"]'));
});
test('agent builds a rough cut: place part of a source, split, ripple delete and trim', () => {
  const p = project();
  const added = edit(p, 'add_media_to_timeline', { mediaId: 'm', sourceIn: 10, duration: 6 });
  assert.equal(added.start, 5);
  assert.equal(added.sourceIn, 10);
  const { newClipIds } = edit(p, 'split_clips', { at: 2 });
  assert.equal(newClipIds.length, 1);
  edit(p, 'delete_clips', { clipIds: ['a'] });
  assert.equal(p.clips[newClipIds[0]].start, 0);
  edit(p, 'trim_clip', { clipId: newClipIds[0], edge: 'start', seconds: 1 });
  assert.equal(p.clips[newClipIds[0]].in, 3);
  assert.equal(p.primary.length, 2);
  assert.throws(() => edit(p, 'add_media_to_timeline', { mediaId: 'm', sourceIn: 18, duration: 5 }), /only 20 s/);
  assert.throws(() => edit(p, 'add_media_to_timeline', { mediaId: 'm', mode: 'connect', lane: 0 }));
});
test('agent adds titles, captions, properties and transitions with validation', () => {
  const p = project();
  const title = edit(p, 'add_title', { template: 'lower', text: 'Ada', subtext: 'Engineer', at: 1 });
  assert.equal(p.clips[title.id].lane, 1);
  assert.equal(p.clips[title.id].props.subtext, 'Engineer');
  const tpl = edit(p, 'add_title', { template: 'lt-bar', text: 'Grace', at: 0 });
  assert.equal(p.clips[tpl.id].props.fields.name, 'Grace');
  assert.throws(() => edit(p, 'add_title', { template: 'lt-bar', fields: { nope: 'x' }, at: 0 }));
  edit(p, 'add_captions', { captions: [{ start: 0, end: 2, text: 'Hei' }] });
  assert.equal(Object.values(p.clips).filter((c) => c.type === 'caption').length, 1);
  edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { volume: -6, aFadeOut: 1, enabled: false, tint: 0.1, gainX: 0.2 } }] });
  assert.equal(p.clips.a.props.volume, -6);
  assert.equal(p.clips.a.props.gainX, 0.2);
  assert.equal(p.clips.a.enabled, false);
  const before = structuredClone(p);
  assert.throws(() => edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { exposure: 0.2 } }, { clipId: 'a', properties: { mediaId: 'x' } }] }));
  assert.deepEqual(p, before);
  edit(p, 'add_transition', { clipId: 'a', type: 'dissolve', edge: 'end' });
  assert.equal(p.clips.a.transitionOut.type, 'dissolve');
  assert.throws(() => edit(p, 'add_transition', { clipId: title.id, type: 'dissolve' }));
});

test('caption timing follows subtitle rules and reports text that must be rewritten', () => {
  const { items, warnings } = fitCaptions(
    [
      { start: 0, end: 0.4, text: 'Hei' },
      { start: 0.9, end: 2, text: 'Tämä lause on aivan liian pitkä luettavaksi näin lyhyessä ajassa ilman tiivistämistä' },
      { start: 1.95, end: 3, text: 'Kiitos' },
      { start: 10, end: 18.5, text: 'Pitkä' },
    ],
    { fps: 25 },
  );
  assert.ok(items[0].end <= items[1].start - 0.08 + 1e-9, 'a short caption grows only up to a gap before the next');
  assert.ok(items[0].end - items[0].start >= 0.4);
  assert.ok(items[1].end <= items[2].start - 0.08 + 1e-9, 'overlaps are removed');
  assert.ok(warnings.some((w) => w.index === 1 && /too fast/.test(w.problem)));
  assert.ok(warnings.some((w) => w.index === 3 && /split/.test(w.problem)));
  const loose = fitCaptions([{ start: 5, end: 5.5, text: 'Hyvää huomenta kaikille' }]);
  assert.ok(Math.abs(loose.items[0].end - 5 - 23 / 17) < 0.01, 'reading time is added into following silence');
  assert.equal(loose.warnings.length, 0);
});
test('a full subtitle track replaces the old captions in one edit', () => {
  const p = project();
  edit(p, 'add_captions', { captions: [{ start: 0, end: 1, text: 'Hei' }] });
  const r = edit(p, 'add_captions', { replace: true, captions: [{ start: 0, end: 2, text: 'Moi' }, { start: 2, end: 4, text: 'Kiitos' }] });
  assert.equal(r.added, 2);
  assert.deepEqual(Object.values(p.clips).filter((c) => c.type === 'caption').map((c) => c.props.text).sort(), ['Kiitos', 'Moi']);
});
test('look measurements see exposure, clipping and colour casts', () => {
  const img = (fn, n = 100) => {
    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) data.set([...fn(i), 255], i * 4);
    return { data, width: n, height: 1 };
  };
  const dark = lookStats(img(() => [20, 20, 20]));
  assert.ok(dark.brightness < 0.1 && dark.crushedBlacks === 0);
  const warm = lookStats(img(() => [200, 128, 60]));
  assert.ok(warm.warmth > 0.4 && warm.saturation > 0.6);
  const green = lookStats(img(() => [100, 160, 100]));
  assert.ok(green.greenCast > 0.2);
  const clipped = lookStats(img((i) => (i < 50 ? [255, 255, 255] : [0, 0, 0])));
  assert.equal(clipped.clippedHighlights, 0.5);
  assert.equal(clipped.crushedBlacks, 0.5);
});

test('the agent can change any simple setting or clip property, but only with the same type', () => {
  assert.deepEqual(checkPatch({ snapping: true, titleDur: 4 }, { titleDur: 6 }, 'app'), { titleDur: 6 });
  for (const bad of [{ snapping: 'yes' }, { titleDur: Infinity }, { missing: 1 }, JSON.parse('{"__proto__":{"x":1}}'), null])
    assert.throws(() => checkPatch({ snapping: true, titleDur: 4, shortcuts: {} }, bad, 'app'));
  assert.throws(() => checkPatch({ shortcuts: {} }, { shortcuts: {} }, 'app'));
  const p = project();
  p.clips.a.props.x = 0;
  p.clips.a.props.color = '#ffffff';
  edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { x: 120, color: '#ff0000' } }] });
  assert.equal(p.clips.a.props.x, 120);
  assert.throws(() => edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { x: '120' } }] }));
  p.clips.a.kf.x = [[0, 0]];
  assert.throws(() => edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { x: 5 } }] }), /keyframes/);
  const info = TOOL_MAP.get('get_clip').read(p, { clipId: 'a' });
  assert.equal(info.properties.color, '#ff0000');
  assert.deepEqual(info.keyframed, ['x']);
});
test('project settings: format, frame rate and caption style are validated', () => {
  const p = project();
  p.captionStyle = { size: 44, color: '#ffffff', position: 'bottom' };
  edit(p, 'set_project_settings', { width: 1080, height: 1920, fps: 25, captionStyle: { size: 60, position: 'top' } });
  assert.deepEqual([p.width, p.height, p.fps, p.captionStyle.size, p.captionStyle.color], [1080, 1920, 25, 60, '#ffffff']);
  assert.throws(() => edit(p, 'set_project_settings', { width: 1081 }));
  assert.throws(() => edit(p, 'set_project_settings', { fps: 31 }));
  assert.throws(() => edit(p, 'set_project_settings', { captionStyle: { size: 'big' } }));
});

test('cuts that land in a pause keep a short breath, never cut into words', () => {
  assert.deepEqual(snapToPauses(4.7, 6.22, [[3.2, 4.7], [6.22, 7.22]]), [4.55, 6.37]);
  assert.deepEqual(snapToPauses(5, 6, [[3.2, 4.7]]), [5, 6], 'cuts inside speech stay where the agent put them');
});
test('a planned edit is built in one step with overlays and titles timed to the narration', () => {
  const p = project();
  p.media.s = { id: 's', name: 'screen.mov', kind: 'video', duration: 120, streams: { main: { hasVideo: true, hasAudio: true } } };
  const r = buildSequence(p, {
    replace: true,
    storyline: [
      { mediaId: 'm', sourceIn: 0.3, sourceOut: 3.3 },
      { mediaId: 'm', sourceIn: 7.4, sourceOut: 11 },
    ],
    overlays: [{ mediaId: 's', sourceIn: 40, sourceOut: 50, attachTo: 1, offset: 0.5, speed: 2 }],
    titles: [{ template: 'lower', text: 'Ada', attachTo: 0, offset: 0.2, duration: 2 }],
  });
  assert.equal(p.clips.a, undefined, 'replace starts from an empty timeline');
  assert.deepEqual(r.storyline.map((x) => [x.start, x.end]), [[0, 3], [3, 6.6]]);
  const overlay = p.clips[r.overlays[0].clipId];
  assert.deepEqual([overlay.start, overlay.dur, overlay.lane, overlay.in], [3.5, 5, 1, 40]);
  assert.ok(overlay.props.audioOff, 'screen overlays are silent by default');
  assert.equal(p.clips[r.titles[0].clipId].start, 0.2);
  const before = structuredClone(p);
  assert.throws(() => buildSequence(p, { storyline: [{ mediaId: 'm', sourceIn: 5, sourceOut: 25 }] }), /only 20 s/);
  assert.throws(() => buildSequence(p, { storyline: [], overlays: [{ mediaId: 's', sourceIn: 0, sourceOut: 1, attachTo: 3 }] }), /storyline index/);
  assert.deepEqual(p.primary, before.primary);
});
test('the agent designs its own animated title template and uses it', () => {
  const p = project();
  const made = edit(p, 'create_title_template', {
    template: {
      name: 'Speaker',
      anchor: 'bottom-left',
      fields: [{ id: 'name', default: 'Name' }],
      colors: [{ id: 'accent', default: '#00c2a8' }],
      layers: [
        { type: 'text', id: 'name', text: '{{name}}', size: 60, x: 140, y: 860 },
        { type: 'rect', id: 'bar', x: 110, y: 860, w: 8, h: 'height(name)', color: '{{accent}}', in: { scaleY: [[0, 0], [1, 1, 'out']] } },
      ],
    },
  });
  assert.match(made.templateId, /^custom-/);
  const t = edit(p, 'add_title', { template: made.templateId, fields: { name: 'Ada' }, colors: { accent: '#ff0000' }, at: 1 });
  assert.equal(p.clips[t.id].props.fields.name, 'Ada');
  assert.equal(p.clips[t.id].props.colors.accent, '#ff0000');
  assert.equal(TOOL_MAP.get('get_timeline').read(p, {}).customTitleTemplates[0].name, 'Speaker');
  edit(p, 'create_title_template', { replaceId: made.templateId, template: { name: 'Speaker 2', layers: [{ type: 'text', text: 'x' }] } });
  assert.equal(p.templates[made.templateId].name, 'Speaker 2');
  assert.throws(() => edit(p, 'create_title_template', { template: { name: 'Empty', layers: [] } }));
  assert.throws(() => edit(p, 'create_title_template', { replaceId: 'lt-bar', template: { layers: [{ type: 'text' }] } }));
});

test('the story (brief, outline, documents, media notes) is saved in the project', () => {
  const p = project();
  addStoryDocument(p, 'script.docx', 'ANNA\nHello there.');
  edit(p, 'set_story', { brief: 'A 60 s ad for young parents, warm tone.', mediaNotes: { m: 'Actor, three takes of the intro.' } });
  edit(p, 'set_story', { outline: '1. Hook: take 3 of the intro.' });
  const story = TOOL_MAP.get('get_story').read(p, {});
  assert.equal(story.brief, 'A 60 s ad for young parents, warm tone.');
  assert.equal(story.outline, '1. Hook: take 3 of the intro.');
  assert.deepEqual(story.documents.map((d) => d.name), ['script.docx']);
  assert.equal(TOOL_MAP.get('get_story').read(p, { document: 'script.docx' }).text, 'ANNA\nHello there.');
  assert.throws(() => edit(p, 'set_story', { mediaNotes: { nope: 'x' } }));
});

test('the agent sets Clean Voice on speech, never on system audio, and null turns it off', () => {
  const p = project();
  p.media.r = { id: 'r', kind: 'recording', duration: 20, streams: { screen: { hasVideo: true, hasAudio: true }, camera: { hasVideo: true, hasAudio: true } } };
  p.clips.r = { id: 'r', type: 'recording', mediaId: 'r', dur: 5, start: 0, in: 0, lane: 1, enabled: true, props: {}, kf: {} };
  edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { cleanVoice: 0.8 } }, { clipId: 'r', properties: { cleanVoice: 1 } }] });
  assert.deepEqual(p.clips.a.props.cleanVoice, { main: 0.8 });
  assert.deepEqual(p.clips.r.props.cleanVoice, { camera: 1 });
  assert.equal(TOOL_MAP.get('get_clip').read(p, { clipId: 'r' }).properties.cleanVoice.camera, 1);
  edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { cleanVoice: null } }] });
  assert.deepEqual(p.clips.a.props.cleanVoice, {});
  assert.throws(() => edit(p, 'set_clip_properties', { edits: [{ clipId: 'a', properties: { cleanVoice: 2 } }] }));
});
