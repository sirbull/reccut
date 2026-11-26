// Brand profiles (one per channel or client) and .reccut-brand export and import.
// Titles, lower thirds, effect presets and Design elements belong to a profile; the Design defaults
// (color roles, fonts, saved colors and logo) are swapped when the user switches profile.
import { signal } from '@preact/signals';
import { prefs, setPrefs } from './prefs.js';
import { toast } from './ui.jsx';
import { BRAND_PACK_FORMAT, DEFAULT_PROFILE, PROFILE_LIMIT, activeProfileId, brandItems, brandPack, brandProfiles, designBrandLayers, inProfile, readBrandPack, uniqueProfileName } from '../shared/brandLibrary.js';
import { designBrand } from '../shared/designBrand.js';
import { uid } from '../shared/model.js';
import { brandLogo, loadBrandLogo } from './design/brand.js';

const api = window.api;
// { mode: 'new' | 'rename', id?, name, copy? }
export const profileDialog = signal(null);
export const profiles = () => brandProfiles(prefs.value);
export const activeProfile = () => profiles().find((p) => p.id === activeProfileId(prefs.value));

const HEX = /^#[0-9a-f]{6}$/i;
function designSnapshot(p = prefs.value) {
  return { brand: designBrand(p.designBrand), fonts: { ...(p.designBrandFonts || {}) }, colors: (Array.isArray(p.designColors) ? p.designColors : []).filter((c) => HEX.test(c)).slice(0, 20) };
}
function designPatch(design) {
  const fonts = design?.fonts && typeof design.fonts === 'object' ? Object.fromEntries(['title', 'body'].filter((k) => typeof design.fonts[k] === 'string').map((k) => [k, design.fonts[k].slice(0, 200)])) : {};
  return { designBrand: designBrand(design?.brand || {}), designBrandFonts: fonts, designColors: (Array.isArray(design?.colors) ? design.colors : []).filter((c) => HEX.test(c)).slice(0, 20) };
}
const failed = (err) => toast(err.message, { kind: 'error' });

export async function switchBrandProfile(id) {
  const from = activeProfileId(prefs.value);
  const list = profiles(), target = list.find((p) => p.id === id);
  if (!target || id === from) return;
  setPrefs({ brandProfiles: list.map((p) => (p.id === from ? { ...p, design: designSnapshot() } : p)), brandProfile: id, ...designPatch(target.design) });
  try {
    await api.switchBrandLogo(from, id);
    await loadBrandLogo();
  } catch (err) {
    failed(err);
  }
  toast(`Brand profile: ${target.name}`, { timeout: 2000 });
}

export function openNewProfile() {
  if (profiles().length >= PROFILE_LIMIT) return toast(`You can have up to ${PROFILE_LIMIT} Brand profiles.`);
  profileDialog.value = { mode: 'new', name: uniqueProfileName(profiles(), 'New Brand'), copy: false };
}
export function openRenameProfile() {
  const p = activeProfile();
  profileDialog.value = { mode: 'rename', id: p.id, name: p.name };
}
// A new profile starts empty with Reccut's default colors and fonts, or as a copy of the current Design defaults and logo.
export async function createProfile(name, { copy = false } = {}) {
  const list = profiles();
  if (list.length >= PROFILE_LIMIT) throw new Error(`You can have up to ${PROFILE_LIMIT} Brand profiles.`);
  const profile = { id: uid(), name: uniqueProfileName(list, name), design: copy ? designSnapshot() : { brand: designBrand({}), fonts: {}, colors: [] } };
  setPrefs({ brandProfiles: [...list, profile] });
  if (copy && brandLogo.value?.path) await api.setBrandProfileLogo(profile.id, brandLogo.value).catch(failed);
  await switchBrandProfile(profile.id);
  return profile;
}
export function renameProfile(id, name) {
  const list = profiles();
  setPrefs({ brandProfiles: list.map((p) => (p.id === id ? { ...p, name: uniqueProfileName(list, name, id) } : p)) });
}
export async function deleteProfile(id = activeProfileId(prefs.value)) {
  const list = profiles(), profile = list.find((p) => p.id === id);
  if (!profile) return;
  if (list.length < 2) return toast('Make another profile before deleting this one.');
  const items = inProfile(brandItems(prefs.value.brandItems), id).length, elements = inProfile(designBrandLayers(prefs.value.designBrandLayers), id).length;
  if (!confirm(`Delete the Brand profile “${profile.name}” with ${items} saved item${items === 1 ? '' : 's'} and ${elements} Design element${elements === 1 ? '' : 's'}? Clips and designs that use them keep their look.`)) return;
  if (activeProfileId(prefs.value) === id) await switchBrandProfile(list.find((p) => p.id !== id).id);
  setPrefs({
    brandProfiles: profiles().filter((p) => p.id !== id),
    brandItems: brandItems(prefs.value.brandItems).filter((i) => (i.profile || DEFAULT_PROFILE) !== id),
    designBrandLayers: designBrandLayers(prefs.value.designBrandLayers).filter((s) => (s.profile || DEFAULT_PROFILE) !== id),
  });
  await api.removeBrandProfile(id).catch(() => {});
}

const FILTERS = [{ name: 'Reccut Brand', extensions: ['reccut-brand'] }];
// Saves the active profile with its images and logo in one file, to use on another computer or share.
export async function exportProfile() {
  const profile = activeProfile();
  const file = await api.saveFileDialog({ title: 'Export Brand', defaultPath: `${profile.name.replace(/[\\/:*?"<>|]/g, '_')}.reccut-brand`, filters: FILTERS });
  if (!file) return;
  const pack = brandPack({ profile, items: inProfile(brandItems(prefs.value.brandItems), profile.id), elements: inProfile(designBrandLayers(prefs.value.designBrandLayers), profile.id), design: designSnapshot() });
  const result = await api.exportBrand(file, pack, null);
  toast(result.missing ? `Exported ${profile.name}. ${result.missing} missing image${result.missing === 1 ? ' was' : 's were'} left out.` : `Exported ${profile.name}.`, { timeout: 3000 });
}
// Imports a .reccut-brand file as a new profile and switches to it.
export async function importProfile(file = null) {
  if (profiles().length >= PROFILE_LIMIT) throw new Error(`You can have up to ${PROFILE_LIMIT} Brand profiles. Delete one first.`);
  file ||= await api.openFileDialog({ title: 'Import Brand', filters: FILTERS });
  if (!file) return null;
  const raw = await api.importBrand(file);
  if (raw?.format !== BRAND_PACK_FORMAT) throw new Error('This is not a Reccut Brand file.');
  const id = uid(), data = readBrandPack(raw, id);
  const patch = designPatch(data.design);
  const profile = { id, name: uniqueProfileName(profiles(), data.name), design: { brand: patch.designBrand, fonts: patch.designBrandFonts, colors: patch.designColors } };
  setPrefs({
    brandProfiles: [...profiles(), profile],
    brandItems: [...brandItems(prefs.value.brandItems), ...data.items],
    designBrandLayers: [...designBrandLayers(prefs.value.designBrandLayers), ...data.elements],
  });
  if (raw.logo?.path) await api.setBrandProfileLogo(id, raw.logo).catch(failed);
  await switchBrandProfile(id);
  toast(`Imported ${profile.name}: ${data.items.length} item${data.items.length === 1 ? '' : 's'} and ${data.elements.length} Design element${data.elements.length === 1 ? '' : 's'}${data.skipped ? `. ${data.skipped} unsupported item${data.skipped === 1 ? ' was' : 's were'} skipped` : ''}.`, { timeout: 4000 });
  return profile;
}

// The profile menu shown in the Brand tab and the Brand panel in Design.
export async function profileMenu() {
  const active = activeProfileId(prefs.value);
  const id = await api.popupMenu([
    ...profiles().map((p) => ({ id: `switch:${p.id}`, label: p.name, checked: p.id === active })),
    { separator: true },
    { id: 'new', label: 'New Profile…' },
    { id: 'rename', label: 'Rename Profile…' },
    { id: 'delete', label: 'Delete Profile…', enabled: profiles().length > 1 },
    { separator: true },
    { id: 'export', label: 'Export Brand…' },
    { id: 'import', label: 'Import Brand…' },
  ]);
  try {
    if (id?.startsWith('switch:')) await switchBrandProfile(id.slice(7));
    else if (id === 'new') openNewProfile();
    else if (id === 'rename') openRenameProfile();
    else if (id === 'delete') await deleteProfile();
    else if (id === 'export') await exportProfile();
    else if (id === 'import') await importProfile();
  } catch (err) {
    failed(err);
  }
}
