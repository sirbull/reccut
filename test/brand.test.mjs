import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TITLE_TEMPLATES, makeClip } from '../src/shared/model.js';
import { applyBrandEffects, brandEffectGroups, brandEffectsItem, brandItems, brandSection, brandTitleClip, brandTitleItem, canApplyBrandEffects, designBrandLayers, isLowerThird, renameBrandItem } from '../src/shared/brandLibrary.js';
import { libraryDropTarget } from '../src/shared/libraryDrop.js';

function title(templateId, extra = {}) {
  const tpl = TITLE_TEMPLATES.find((t) => t.id === templateId);
  const clip = makeClip('title', { start: 4, dur: 6, lane: 1, name: tpl.label });
  Object.assign(clip.props, structuredClone(tpl.props), extra);
  return clip;
}

test('a styled title is saved with its look, keyframes and length, and placed again as a new clip', () => {
  const clip = title('center', { text: 'My Channel', font: 'serif', color: '#ff0000', size: 120 });
  clip.kf.opacity = [[0, 0], [1, 1]];
  const item = brandTitleItem(clip, { name: '  Channel   title ' });
  assert.equal(item.name, 'Channel title');
  assert.equal(item.section, 'title');
  assert.equal(item.clip.dur, 6);
  clip.props.color = '#00ff00';
  assert.equal(item.clip.props.color, '#ff0000', 'the saved item is a copy');
  const { clip: placed, template } = brandTitleClip(item, 10, 2);
  assert.equal(template, null);
  assert.notEqual(placed.id, clip.id);
  assert.deepEqual([placed.start, placed.dur, placed.lane, placed.type], [10, 6, 2, 'title']);
  assert.equal(placed.props.text, 'My Channel');
  assert.equal(placed.props.font, 'serif');
  assert.deepEqual(placed.kf.opacity, [[0, 0], [1, 1]]);
});

test('lower thirds are sorted under Lower Thirds, and a custom template travels with the title', () => {
  assert.equal(brandTitleItem(title('lower')).section, 'lowerThird');
  const builtin = TITLE_TEMPLATES.find((t) => t.category === 'Lower Thirds' && t.props.template);
  if (builtin) assert.equal(brandTitleItem(title(builtin.id)).section, 'lowerThird');
  const custom = { id: 'custom-1', name: 'My Bar', category: 'Lower Thirds', anchor: 'bottom-left', layers: [] };
  const clip = title('center', { template: 'custom-1', style: 'center' });
  assert.ok(isLowerThird(clip.props, { 'custom-1': custom }));
  const item = brandTitleItem(clip, { templates: { 'custom-1': custom } });
  assert.equal(item.section, 'lowerThird');
  assert.deepEqual(item.template, custom);
  assert.deepEqual(brandTitleClip(item, 0).template, custom);
  assert.throws(() => brandTitleItem(makeClip('image')), /title/);
});

test('an effect preset keeps only the chosen parts and replaces them on other clips', () => {
  const src = makeClip('video', { dur: 5 });
  Object.assign(src.props, { fx: ['blur'], blur: 12, exposure: 0.4, opacity: 0.5, x: 300 });
  src.kf.blur = [[0, 0], [2, 12]];
  const { available, preferred } = brandEffectGroups(src);
  assert.ok(available.includes('transform'));
  assert.ok(!preferred.includes('transform'), 'position is not part of a look by default');
  const item = brandEffectsItem(src, { name: 'Dreamy' });
  assert.equal(item.section, 'effects');
  assert.ok(item.groups.includes('effects') && item.groups.includes('color'));
  assert.equal(item.clip.props.x, undefined, 'unchosen parts are not saved');
  const dst = makeClip('image', { dur: 3 });
  dst.props.x = -50;
  assert.ok(canApplyBrandEffects(item, dst));
  assert.ok(applyBrandEffects(item, dst) >= 2);
  assert.equal(dst.props.blur, 12);
  assert.equal(dst.props.exposure, 0.4);
  assert.equal(dst.props.x, -50, 'transform is left alone');
  assert.deepEqual(dst.kf.blur, [[0, 0], [2, 12]]);
  const only = brandEffectsItem(src, { groups: ['transform'] });
  assert.deepEqual(only.groups, ['transform']);
  assert.throws(() => brandEffectsItem(makeClip('video'), {}), /no effects/);
  assert.ok(!canApplyBrandEffects(item, makeClip('caption')));
});

test('stored Brand lists are validated and renamed safely', () => {
  const t = brandTitleItem(title('center'));
  const e = brandEffectsItem(Object.assign(makeClip('video'), { props: { ...makeClip('video').props, exposure: 0.2 } }));
  const list = brandItems([t, e, null, { id: 'x', name: 'Bad', kind: 'title', section: 'nope', clip: { props: {} } }, { ...e, groups: ['evil'] }]);
  assert.deepEqual(list.map((i) => i.id), [t.id, e.id]);
  assert.deepEqual(brandSection(list, 'effects').map((i) => i.id), [e.id]);
  assert.equal(renameBrandItem(list, t.id, 'Intro')[0].name, 'Intro');
  assert.equal(renameBrandItem(list, t.id, '   ')[0].name, t.name);
  assert.deepEqual(brandItems('nope'), []);
  assert.equal(designBrandLayers([{ id: 'a', name: 'Logo', width: 1280, height: 720, layers: [{}] }, { id: 'b', name: 'Empty', width: 1, height: 1, layers: [] }]).length, 1);
});

test('an effect preset dropped on the timeline targets the clip under the pointer', () => {
  const clip = makeClip('video', { start: 0, dur: 4, lane: 0 });
  const project = { clips: { [clip.id]: clip }, media: {}, lanes: {} };
  assert.equal(libraryDropTarget(project, { kind: 'brandEffects', id: 'p' }, 0, 2).id, clip.id);
  assert.equal(libraryDropTarget(project, { kind: 'brandEffects', id: 'p' }, 0, 9), null);
});

test('Brand is reachable from the browser, menus, Quick Search, the AI agent and the handbook', () => {
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const registry = read('src/renderer/registry.js');
  for (const id of ['saveToBrand', 'browser:brand', 'design:saveToBrand']) assert.match(registry, new RegExp(`id: '${id}'[^\\n]*desc: '`), `${id} needs a command with desc`);
  assert.match(read('src/renderer/editor/Browser.jsx'), /id: 'brand', label: 'Brand'/);
  assert.match(read('src/renderer/help/console.js'), /commands\.brandList\(\)[\s\S]*brandLayerSets\(\)/);
  const agent = read('src/renderer/agent.js');
  for (const tool of ['list_brand', 'apply_brand', 'save_to_brand']) assert.match(agent, new RegExp(`name: '${tool}'`));
  assert.match(agent, /brandItems, designBrandLayers, \.\.\.app/, 'get_settings leaves Brand to its own tools');
  const articles = read('src/renderer/help/articles.js');
  assert.match(articles, /id: 'brand'/);
  assert.match(read('docs/docs/index.html'), /Brand: Your Saved Titles, Lower Thirds and Effects/);
});
