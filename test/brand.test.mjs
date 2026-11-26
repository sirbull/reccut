import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TITLE_TEMPLATES, makeClip } from '../src/shared/model.js';
import { DEFAULT_PROFILE, activeProfileId, applyBrandEffects, brandEffectGroups, brandEffectsItem, brandItems, brandPack, brandProfiles, brandSection, brandTitleClip, brandTitleItem, canApplyBrandEffects, designBrandLayers, inProfile, isLowerThird, readBrandPack, renameBrandItem, uniqueProfileName, updatedBrandItem } from '../src/shared/brandLibrary.js';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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
  assert.match(agent, /brandItems: _items, designBrandLayers: _layers, brandProfiles: _profiles, brandProfile: _profile, \.\.\.app/, 'get_settings leaves Brand to its own tools');
  for (const tool of ['switch_brand_profile']) assert.match(agent, new RegExp(`name: '${tool}'`));
  for (const id of ['brand:newProfile', 'brand:renameProfile', 'brand:deleteProfile', 'brand:exportProfile', 'brand:importProfile']) assert.match(registry, new RegExp(`id: '${id}'[^\\n]*rooms: EDIT_DESIGN[^\\n]*desc: '`), `${id} needs a command in Edit and Design`);
  const articles = read('src/renderer/help/articles.js');
  assert.match(articles, /id: 'brand'/);
  assert.match(read('docs/docs/index.html'), /Brand: Your Saved Titles, Lower Thirds and Effects/);
});

test('profiles: older items belong to the first profile, and lists are kept apart', () => {
  assert.deepEqual(brandProfiles({}).map((p) => p.id), [DEFAULT_PROFILE]);
  const prefs = { brandProfiles: [{ id: DEFAULT_PROFILE, name: 'My Brand' }, { id: 'client', name: 'Client' }, { id: '../evil', name: 'Bad' }], brandProfile: 'client' };
  assert.deepEqual(brandProfiles(prefs).map((p) => p.id), [DEFAULT_PROFILE, 'client']);
  assert.equal(activeProfileId(prefs), 'client');
  assert.equal(activeProfileId({ ...prefs, brandProfile: 'gone' }), DEFAULT_PROFILE);
  const old = brandTitleItem(title('center'));
  const theirs = { ...brandTitleItem(title('lower')), profile: 'client' };
  assert.deepEqual(inProfile([old, theirs], DEFAULT_PROFILE).map((i) => i.id), [old.id]);
  assert.deepEqual(inProfile([old, theirs], 'client').map((i) => i.id), [theirs.id]);
  assert.equal(uniqueProfileName(brandProfiles(prefs), 'client'), 'client 2');
  assert.equal(uniqueProfileName(brandProfiles(prefs), 'Client', 'client'), 'Client');
});

test('a saved item is updated from a clip and keeps its id, name, profile and parts', () => {
  const t = { ...brandTitleItem(title('center', { text: 'Old' }), { name: 'Intro' }), profile: 'client' };
  const next = updatedBrandItem(t, title('center', { text: 'New', color: '#123456' }));
  assert.deepEqual([next.id, next.name, next.profile, next.clip.props.text, next.clip.props.color], [t.id, 'Intro', 'client', 'New', '#123456']);
  const src = makeClip('video');
  Object.assign(src.props, { exposure: 0.3, x: 40 });
  const preset = brandEffectsItem(src, { name: 'Bright', groups: ['color'] });
  const changed = makeClip('video');
  Object.assign(changed.props, { exposure: -0.2, x: 99, fx: ['blur'], blur: 4 });
  const updated = updatedBrandItem(preset, changed);
  assert.deepEqual(updated.groups, ['color'], 'the preset keeps the parts it had');
  assert.equal(updated.clip.props.exposure, -0.2);
  assert.equal(updated.clip.props.blur, undefined);
});

test('a Brand file round trip brings items, elements, images and logo into a new profile', async () => {
  const { exportBrandPack, importBrandPack } = require('../src/main/brandPack.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-brand-'));
  const png = path.join(dir, 'logo.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'not an image');
  const element = { id: 'e1', name: 'Badge', width: 1280, height: 720, layers: [{ id: 'l1', type: 'image', asset: 'a1' }], assets: { a1: { id: 'a1', path: png }, a2: { id: 'a2', path: path.join(dir, 'secret.txt') } }, media: {}, profile: 'client' };
  const item = { ...brandTitleItem(title('lower')), profile: 'client' };
  const pack = brandPack({ profile: { id: 'client', name: 'Client' }, items: [item], elements: [element], design: { brand: { roles: { title: '#ff0000' } }, fonts: { title: 'serif' }, colors: ['#00ff00'] } });
  assert.equal(pack.items[0].profile, undefined, 'profile ids stay on this computer');
  const file = path.join(dir, 'Client.reccut-brand');
  const result = await exportBrandPack(file, pack, { path: png, name: 'Logo.png' });
  assert.deepEqual(result, { images: 1, missing: 1 });
  assert.ok(!fs.readFileSync(file, 'utf8').includes(dir), 'no local paths are written to the file');
  const raw = await importBrandPack(file, path.join(dir, 'imported'));
  const data = readBrandPack(raw, 'new');
  assert.equal(data.name, 'Client');
  assert.equal(data.items.length, 1);
  assert.notEqual(data.items[0].id, item.id);
  assert.equal(data.items[0].profile, 'new');
  const asset = data.elements[0].assets.a1;
  assert.ok(asset.path.startsWith(path.join(dir, 'imported')) && fs.readFileSync(asset.path).equals(fs.readFileSync(png)));
  assert.equal(data.elements[0].assets.a2.missing, true);
  assert.ok(fs.existsSync(raw.logo.path) && raw.logo.name === 'Logo.png');
  assert.deepEqual(data.design.colors, ['#00ff00']);
  assert.throws(() => readBrandPack({ format: 'other' }, 'x'), /not a Reccut Brand/);
  fs.writeFileSync(path.join(dir, 'bad.reccut-brand'), JSON.stringify({ format: 'reccut-brand', items: [], elements: [{ id: 'e', name: 'x', width: 1, height: 1, layers: [{}], assets: { a: { path: '/etc/passwd' } } }], files: { f1: { name: '../../evil.sh', data: 'AAAA' } }, logo: { file: 'f1' } }));
  const bad = await importBrandPack(path.join(dir, 'bad.reccut-brand'), path.join(dir, 'imported'));
  assert.equal(bad.elements[0].assets.a.path, '', 'outside paths are dropped');
  assert.equal(bad.logo, null, 'only images are written');
});

test('each profile keeps its own logo', async () => {
  const { createDesignLibrary } = require('../src/main/designLibrary.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-brand-logo-'));
  const lib = createDesignLibrary(dir, (x) => x);
  const a = path.join(dir, 'a.png'), b = path.join(dir, 'b.png');
  fs.writeFileSync(a, 'A'); fs.writeFileSync(b, 'B');
  await lib.setLogo(a);
  await lib.setProfileLogo('client', b, 'Client logo');
  assert.equal(fs.readFileSync((await lib.restoreLogo('client')).path, 'utf8'), 'B');
  assert.equal(fs.readFileSync((await lib.logo()).path, 'utf8'), 'B');
  await lib.stashLogo('client');
  assert.equal(await lib.restoreLogo('empty'), null, 'a profile without a logo has none');
  await lib.stashLogo('empty');
  assert.equal((await lib.restoreLogo('client')).name, 'Client logo');
  await assert.rejects(lib.stashLogo('../x'), /Invalid profile/);
});
