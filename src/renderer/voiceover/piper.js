// Piper-stemmer: én stemme per språk, for språkene Kokoro ikke har egne stemmer for (norsk, svensk,
// dansk, tysk, nederlandsk, finsk, polsk) og som et alternativ for spansk, fransk, italiensk og portugisisk.
import catalog from '../../main/ttsCatalog.json';

export const PIPER_VOICES = catalog.piper?.voices || [];
export const piperById = (id) => PIPER_VOICES.find((v) => v.id === id) || null;
export const piperFor = (lang) => PIPER_VOICES.filter((v) => v.lang === lang);
// NVCC (norsk) har ti stemmer: K er kvinne og M er mann, fulgt av en kode for stemmen.
export function speakerLabel(voice, s) {
  if (voice.id.startsWith('no_NO-nvcc')) return `${s[0] === 'K' ? 'Female' : 'Male'} (${s})`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const piperLabel = (id, speaker = '') => {
  const v = piperById(id);
  if (!v) return id;
  return `${v.name}${speaker ? `, ${speakerLabel(v, speaker)}` : ''}`;
};
