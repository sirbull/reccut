// Shared package selection rules; rendering and installation are separate.
import { LANGUAGES, languageById } from './tts.js';

export function voiceLanguageForLocale(locale) {
  const l = String(locale || '').toLowerCase().replaceAll('_', '-');
  if (/^(nb|nn|no)(-|$)/.test(l)) return 'nb';
  if (l.startsWith('en-gb')) return 'en-gb';
  if (l.startsWith('pt-br')) return 'pt-br';
  const short = l.split('-')[0];
  return LANGUAGES.some((v) => v.id === short) ? short : 'en-us';
}

export function voicePackageRows(catalog, state = {}) {
  const label = (lang) => languageById(lang)?.label || lang;
  const model = catalog.voxcpm;
  const languages = model?.languages || [];
  return [
    ...(model ? [{ key: 'voxcpm:model', engine: 'voxcpm', name: 'VoxCPM2 model', languages: languages.map((l) => l.lang),
      use: 'Reads scripts with expressive moods. Shared by all VoxCPM2 voice packages.',
      detail: languages.length ? 'Download once, then add small voice packages for each language.' : 'Voice packages are being prepared.',
      size: model.model.files.reduce((n, f) => n + f.size, 0), license: model.license, installed: Boolean(state.voxcpm?.installed),
      unavailable: !state.voxcpm?.supported ? 'Requires an Apple Silicon Mac.' : !languages.length ? 'No voice packages available yet.' : '',
    }, ...languages.map((l) => ({ key: `voxcpm:${l.lang}`, engine: 'voxcpm', lang: l.lang, name: `${label(l.lang)} · VoxCPM2`, languages: [l.lang],
      use: `Reads ${label(l.lang)} scripts with expressive moods and delivery styles.`,
      detail: `${l.voices.length} synthetic ${l.voices.length === 1 ? 'voice' : 'voices'}, ${model.moods.length} expressions, including ${model.moods.filter((m) => ['warm', 'sensual'].includes(m.id)).map((m) => m.label.toLowerCase()).join(' and ') || 'neutral speech'}. Uses the shared VoxCPM2 model.`,
      size: l.voices.reduce((n, v) => n + v.reference.size, 0), license: model.license,
      installed: Boolean(state.voxcpm?.engine && state.voxcpm?.installed && state.voxcpm?.languages?.[l.lang]?.installed), unavailable: state.voxcpm?.supported ? '' : 'Requires an Apple Silicon Mac.',
      dependency: 'voxcpm:model', samples: l.voices.flatMap((v) => model.moods.map((m) => ({ name: `${v.name} · ${m.label}`, path: `voxcpm/${v.id}-${m.id}.ogg` }))),
    }))] : []),
    { key: 'kokoro', engine: 'kokoro', name: 'Kokoro voices', languages: LANGUAGES.filter((l) => l.voices).map((l) => l.id),
      use: 'Reads scripts in English, Spanish, French, Italian, Brazilian Portuguese and Hindi. Other languages are read with an accent.',
      detail: '41 voices and ready made styles. Includes the shared eSpeak NG pronunciation add-on (GPL).',
      size: catalog.model.files.reduce((n, f) => n + f.size, 0), license: catalog.model.license, installed: Boolean(state.installed), addon: true,
      samples: [{ name: 'Heart (US)', path: 'kokoro/af_heart.ogg' }, { name: 'George (UK)', path: 'kokoro/bm_george.ogg' }],
    },
    ...(catalog.piper?.voices || []).map((v) => ({ key: `piper:${v.id}`, engine: 'piper', voice: v.id, name: `${label(v.lang)} · ${v.name}`, lang: v.lang, languages: [v.lang],
      use: `Reads scripts in ${label(v.lang)}${v.gender ? ` with a ${v.gender.toLowerCase()} voice` : ''}.`,
      detail: `${v.speakers.length ? `${v.speakers.length} voices. ` : ''}A smaller download. Uses the shared eSpeak NG pronunciation add-on (GPL).`,
      size: v.sizeBytes, license: v.license, installed: Boolean(state.piper?.[v.id]?.installed), addon: true,
      samples: [{ name: 'Listen', path: `piper/${v.id}-0.ogg` }],
    })),
  ];
}

export function selectedVoicePackages(rows, picked) {
  const keys = new Set([...picked].filter((key) => rows.some((r) => r.key === key && !r.installed && !r.unavailable)));
  for (const row of rows) if (keys.has(row.key) && row.dependency) {
    const dependency = rows.find((r) => r.key === row.dependency);
    if (dependency && !dependency.installed && !dependency.unavailable) keys.add(dependency.key);
  }
  return rows.filter((r) => keys.has(r.key));
}

export function voicePackageBytes(rows, picked, catalog, state) {
  const selected = selectedVoicePackages(rows, picked);
  return selected.reduce((n, r) => n + r.size, 0) + (selected.some((r) => r.addon) && !state.addon ? catalog.phonemizer.size : 0);
}

export function suggestedVoicePackages(rows, locales) {
  const suggested = new Set();
  for (const lang of new Set(locales.filter(Boolean).map(voiceLanguageForLocale))) {
    const own = rows.filter((r) => r.languages.includes(lang) && !r.installed && !r.unavailable);
    // Prefer an approved VoxCPM package, then the lightweight native voice.
    const choice = own.find((r) => r.dependency) || own.find((r) => r.engine === 'piper') || own.find((r) => r.engine === 'kokoro');
    if (choice) suggested.add(choice.key);
  }
  return suggested;
}

export async function installVoicePackages(api, rows, picked, { onError = () => {}, onSettled = () => {}, refresh = async () => {} } = {}) {
  const selected = selectedVoicePackages(rows, picked);
  const languages = selected.filter((r) => r.engine === 'voxcpm' && r.lang);
  // A language install includes the model and engine. Do not enqueue them twice.
  const work = selected.filter((r) => r.key !== 'voxcpm:model' || !languages.length);
  await Promise.all(work.map(async (row) => {
    try {
      if (row.engine === 'kokoro') await api.ttsInstall();
      else if (row.engine === 'piper') await api.ttsPiperInstall(row.voice);
      else await api.ttsVoxcpmInstall(row.lang || null);
    } catch (error) { onError(row, error); }
    finally { onSettled(row); await refresh(); }
  }));
}
