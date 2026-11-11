// Piper-stemmer: én stemme per språk, for språkene Kokoro ikke har egne stemmer for (norsk, svensk,
// dansk, tysk, nederlandsk, finsk, polsk) og som et alternativ for spansk, fransk, italiensk og portugisisk.
import catalog from '../../main/ttsCatalog.json';

export const PIPER_VOICES = catalog.piper?.voices || [];
export const piperById = (id) => PIPER_VOICES.find((v) => v.id === id) || null;
export const piperFor = (lang) => PIPER_VOICES.filter((v) => v.lang === lang);
// NVCC er Språkbankens Norsk talestyringskorpus: ti talere fra fem dialektområder.
// Koden er K (kvinne) eller M (mann) pluss området. Stedet er talerens egen dialekt.
const NVCC = {
  ON: 'Eastern Norway', SV: 'Southwest Norway', NV: 'Northwest Norway', MN: 'Mid Norway', NN: 'Northern Norway',
  KON: 'Oslo', MON: 'Oslo', KSV: 'Klepp', MSV: 'Stavanger', KNV: 'Jostedal', MNV: 'Voss',
  KMN: 'Malm', MMN: 'Steinkjer', KNN: 'Helgeland', MNN: 'Rana',
};
export function speakerLabel(voice, s) {
  if (voice.id.startsWith('no_NO-nvcc')) return `${s[0] === 'K' ? 'Female' : 'Male'}, ${NVCC[s.slice(1)] || s} (${NVCC[s] || s})`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Kort navn til personen som legges til: "Female, Oslo" for NVCC, ellers stemmen og varianten.
export function speakerName(voice, s) {
  if (voice.id.startsWith('no_NO-nvcc')) return `${s[0] === 'K' ? 'Female' : 'Male'}, ${NVCC[s] || s}`;
  return `${voice.name} ${speakerLabel(voice, s)}`;
}
export const piperLabel = (id, speaker = '') => {
  const v = piperById(id);
  if (!v) return id;
  return `${v.name}${speaker ? `, ${speakerLabel(v, speaker)}` : ''}`;
};
