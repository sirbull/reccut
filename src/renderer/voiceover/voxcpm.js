// Only reviewed, published voices in the catalog are exposed to the user.
import catalog from '../../main/ttsCatalog.json';
export const VOXCPM_MOODS = catalog.voxcpm?.moods || [];
export const VOXCPM_VOICES = (catalog.voxcpm?.languages || []).flatMap((l) => l.voices.map((v) => ({ ...v, lang: l.lang })));
export const voxcpmById = (id) => VOXCPM_VOICES.find((v) => v.id === id) || null;
export const voxcpmFor = (lang) => VOXCPM_VOICES.filter((v) => v.lang === lang);
export const voxcpmMood = (id = 'neutral') => VOXCPM_MOODS.find((m) => m.id === id) || null;
export const voxcpmLabel = (id) => `${voxcpmById(id)?.name || id} (VoxCPM2)`;
export const voxcpmPreviewKey = (voice, mood = 'neutral') => `voxcpm:${voice}:${mood}`;
