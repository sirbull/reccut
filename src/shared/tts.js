// AI-stemmer (Kokoro-82M): stemmene og hvordan teksten gjøres om til noe som kan leses høyt.
// Normaliseringen for engelsk følger kokoro-js (Apache 2.0, hexgrad og Xenova).

// Språket teksten leses på. eSpeak-koden gir uttalen. Kokoro har egne stemmer for noen av
// språkene (voices: første bokstav i stemmen). De andre leses med en stemme fra et annet språk,
// så de får aksent: uttalen er riktig, men stemmen er ikke trent på språket.
export const LANGUAGES = [
  { id: 'en-us', label: 'English (US)', espeak: 'en-us', voices: 'a', english: true },
  { id: 'en-gb', label: 'English (UK)', espeak: 'en', voices: 'b', english: true },
  { id: 'es', label: 'Spanish', espeak: 'es', voices: 'e' },
  { id: 'fr', label: 'French', espeak: 'fr-fr', voices: 'f' },
  { id: 'it', label: 'Italian', espeak: 'it', voices: 'i' },
  { id: 'pt-br', label: 'Portuguese (Brazil)', espeak: 'pt-br', voices: 'p' },
  { id: 'hi', label: 'Hindi', espeak: 'hi', voices: 'h' },
  { id: 'nb', label: 'Norwegian (Bokmål)', espeak: 'nb', near: 'bf_emma' },
  { id: 'sv', label: 'Swedish', espeak: 'sv', near: 'bf_emma' },
  { id: 'da', label: 'Danish', espeak: 'da', near: 'bf_emma' },
  { id: 'de', label: 'German', espeak: 'de', near: 'bm_george' },
  { id: 'nl', label: 'Dutch', espeak: 'nl', near: 'bf_emma' },
  { id: 'fi', label: 'Finnish', espeak: 'fi', near: 'if_sara' },
  { id: 'pl', label: 'Polish', espeak: 'pl', near: 'if_sara' },
  { id: 'pt', label: 'Portuguese (Portugal)', espeak: 'pt', near: 'pf_dora' },
];
export const languageById = (id) => LANGUAGES.find((l) => l.id === id) || null;
// Språket en stemme er laget for.
export const voiceLanguage = (voice) => LANGUAGES.find((l) => l.voices === String(voice)[0]) || LANGUAGES[0];
export const hasOwnVoices = (lang) => Boolean(languageById(lang)?.voices);

// Karakterene er fra Kokoro sin egen oversikt (A er best). Stemmene med best karakter står først.
const V = (id, name, gender, grade) => ({ id, name, gender, grade, lang: id[0] });
export const VOICES = [
  V('af_heart', 'Heart', 'Female', 'A'),
  V('af_bella', 'Bella', 'Female', 'A-'),
  V('af_nicole', 'Nicole', 'Female', 'B-'),
  V('af_aoede', 'Aoede', 'Female', 'C+'),
  V('af_kore', 'Kore', 'Female', 'C+'),
  V('af_sarah', 'Sarah', 'Female', 'C+'),
  V('af_alloy', 'Alloy', 'Female', 'C'),
  V('af_nova', 'Nova', 'Female', 'C'),
  V('af_sky', 'Sky', 'Female', 'C-'),
  V('af_jessica', 'Jessica', 'Female', 'D'),
  V('af_river', 'River', 'Female', 'D'),
  V('am_fenrir', 'Fenrir', 'Male', 'C+'),
  V('am_michael', 'Michael', 'Male', 'C+'),
  V('am_puck', 'Puck', 'Male', 'C+'),
  V('am_echo', 'Echo', 'Male', 'D'),
  V('am_eric', 'Eric', 'Male', 'D'),
  V('am_liam', 'Liam', 'Male', 'D'),
  V('am_onyx', 'Onyx', 'Male', 'D'),
  V('am_santa', 'Santa', 'Male', 'D-'),
  V('am_adam', 'Adam', 'Male', 'F+'),
  V('bf_emma', 'Emma', 'Female', 'B-'),
  V('bf_isabella', 'Isabella', 'Female', 'C'),
  V('bf_alice', 'Alice', 'Female', 'D'),
  V('bf_lily', 'Lily', 'Female', 'D'),
  V('bm_fable', 'Fable', 'Male', 'C'),
  V('bm_george', 'George', 'Male', 'C'),
  V('bm_lewis', 'Lewis', 'Male', 'D+'),
  V('bm_daniel', 'Daniel', 'Male', 'D'),
  V('ef_dora', 'Dora', 'Female', ''),
  V('em_alex', 'Alex', 'Male', ''),
  V('em_santa', 'Santa', 'Male', ''),
  V('ff_siwis', 'Siwis', 'Female', 'B-'),
  V('hf_alpha', 'Alpha', 'Female', 'C'),
  V('hf_beta', 'Beta', 'Female', 'C'),
  V('hm_omega', 'Omega', 'Male', 'C'),
  V('hm_psi', 'Psi', 'Male', 'C'),
  V('if_sara', 'Sara', 'Female', 'C'),
  V('im_nicola', 'Nicola', 'Male', 'C'),
  V('pf_dora', 'Dora', 'Female', ''),
  V('pm_alex', 'Alex', 'Male', ''),
  V('pm_santa', 'Santa', 'Male', ''),
];
export const DEFAULT_VOICE = 'af_heart';
export const voiceById = (id) => VOICES.find((v) => v.id === id) || VOICES[0];
export const voiceLabel = (id) => {
  const v = voiceById(id);
  return `${v.name} (${voiceLanguage(v.id).label}, ${v.gender.toLowerCase()})`;
};
// Stemmene for et språk: de som er laget for det først, deretter de andre (med aksent).
export function voicesFor(lang) {
  const own = VOICES.filter((v) => voiceLanguage(v.id).id === lang);
  return { own, other: VOICES.filter((v) => !own.includes(v)) };
}
export const defaultVoiceFor = (lang) => voicesFor(lang).own[0]?.id || languageById(lang)?.near || DEFAULT_VOICE;
export const PREVIEW_TEXT = {
  'en-us': 'Hi, this is how I sound in the Voice Over Studio.',
  'en-gb': 'Hello, this is how I sound in the Voice Over Studio.',
  es: 'Hola, así sueno en el estudio de voz.',
  fr: 'Bonjour, voici ma voix dans le studio.',
  hi: 'नमस्ते, स्टूडियो में मेरी आवाज़ ऐसी लगती है।',
  it: 'Ciao, questa è la mia voce nello studio.',
  'pt-br': 'Olá, esta é a minha voz no estúdio.',
  nb: 'Hei, slik høres jeg ut i lydstudioet.',
  sv: 'Hej, så här låter jag i studion.',
  da: 'Hej, sådan lyder jeg i studiet.',
  de: 'Hallo, so klinge ich im Studio.',
  nl: 'Hallo, zo klink ik in de studio.',
  fi: 'Hei, tältä kuulostan studiossa.',
  pl: 'Cześć, tak brzmię w studiu.',
  pt: 'Olá, é assim que eu soo no estúdio.',
};

// Språket i et manus, ut fra vanlige småord og bokstaver. Gir et forslag, ikke en fasit.
const WORDS = {
  'en-us': 'the and is to of that it you in for with this are on be',
  nb: 'og er det som ikke på en jeg til av med har for vi deg hva',
  sv: 'och är det som inte på en jag till av med har för vi dig vad',
  da: 'og er det som ikke på en jeg til af med har for vi dig hvad',
  de: 'und ist das die der nicht ein ich zu mit es sie wir auf für',
  nl: 'en is het de een niet ik van dat met op voor zijn wij je',
  es: 'el la de que y en los es no un por con para una las',
  fr: 'le la de et est les des un une que pas pour dans vous je',
  it: 'il di che e la non un per è una sono con mi si',
  'pt-br': 'o de que e a não um para com uma os é se na',
  fi: 'ja on ei se että hän mutta tämä olen kun niin',
  pl: 'i w nie na się że jest to z do jak co ale',
};
export function detectLanguage(text) {
  const words = String(text).toLowerCase().match(/[\p{L}']+/gu) || [];
  if (words.length < 3) return null;
  let best = null,
    score = 0;
  for (const [lang, list] of Object.entries(WORDS)) {
    const set = new Set(list.split(' '));
    let n = words.filter((w) => set.has(w)).length;
    if (lang === 'nb' && /[æøå]/i.test(text)) n += 2;
    if (lang === 'da' && /\b(af|hvad|ikke|jeg)\b/i.test(text) && /æ|ø/.test(text)) n += 1;
    if (lang === 'sv' && /[äö]/i.test(text) && /å/i.test(text)) n += 2;
    if (lang === 'de' && /[äöüß]/i.test(text) && !/å/i.test(text)) n += 1;
    if (n > score) {
      score = n;
      best = lang;
    }
  }
  return score >= 2 ? best : null;
}

/* Tekst til tale */

function splitNum(m) {
  if (m.includes('.')) return m;
  if (m.includes(':')) {
    const [h, min] = m.split(':').map(Number);
    return min === 0 ? `${h} o'clock` : min < 10 ? `${h} oh ${min}` : `${h} ${min}`;
  }
  const year = parseInt(m.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return m;
  const left = m.slice(0, 2),
    right = parseInt(m.slice(2, 4), 10),
    s = m.endsWith('s') ? 's' : '';
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${s}`;
    if (right < 10) return `${left} oh ${right}${s}`;
  }
  return `${left} ${right}${s}`;
}
function money(m) {
  const unit = m[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(m.slice(1)))) return `${m.slice(1)} ${unit}s`;
  if (!m.includes('.')) return `${m.slice(1)} ${unit}${m.slice(1) === '1' ? '' : 's'}`;
  const [b, c] = m.slice(1).split('.');
  const cents = parseInt(c.padEnd(2, '0'), 10);
  return `${b} ${unit}${b === '1' ? '' : 's'} and ${cents} ${m[0] === '$' ? (cents === 1 ? 'cent' : 'cents') : cents === 1 ? 'penny' : 'pence'}`;
}
const point = (m) => {
  const [a, b] = m.split('.');
  return `${a} point ${b.split('').join(' ')}`;
};

// Engelsk tekst gjøres lesbar: tall, klokkeslett, årstall, beløp, titler og forkortelser.
export function normalizeEnglish(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/«/g, '“')
    .replace(/»/g, '”')
    .replace(/[“”]/g, '"')
    .replace(/\(/g, '«')
    .replace(/\)/g, '»')
    .replace(/[^\S \n]/g, ' ')
    .replace(/  +/g, ' ')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money)
    .replace(/\d*\.\d+/g, point)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim();
}

// Det som står i [klammer] er regi og leses ikke. Tekst i (parentes) leses.
export const spokenText = (text) =>
  String(text)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Kokoro leser omtrent 500 tegn med uttale om gangen. Lengre tekst deles i setninger,
// og setninger som fortsatt er for lange, deles ved komma.
export function chunksForSpeech(text, max = 300) {
  const out = [];
  const parts = String(text).match(/[^.!?…]+[.!?…]+["”’)\]]*|[^.!?…]+$/g) || [];
  for (let p of parts.map((x) => x.trim()).filter(Boolean)) {
    while (p.length > max) {
      const cut = Math.max(p.lastIndexOf(', ', max), p.lastIndexOf('; ', max), p.lastIndexOf(' ', max));
      const at = cut > max * 0.4 ? cut + 1 : max;
      out.push(p.slice(0, at).trim());
      p = p.slice(at).trim();
    }
    if (p) out.push(p);
  }
  return out;
}

// Etter uttalen: små rettelser fra kokoro-js for engelsk.
export function fixPhonemes(ipa, lang) {
  let s = ipa
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (lang === 'a') s = s.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return s.trim();
}
// Lyder Kokoro ikke kjenner, byttes til de nærmeste den har (særlig nordiske vokaler).
const NEAREST = { ʉ: 'y', ʏ: 'y', ɵ: 'ø', ɘ: 'ə', ɞ: 'œ', ɭ: 'l', ɫ: 'l', ɬ: 'l', ʑ: 'ʒ', ɧ: 'ʃ', ʀ: 'ʁ', ɦ: 'h', ɱ: 'm', ʍ: 'w', ɶ: 'œ', ä: 'a', ë: 'e', ï: 'i', ö: 'ø', ü: 'y' };
export function nearestSounds(ipa) {
  return String(ipa)
    .replace(/[ʉʏɵɘɞɭɫɬʑɧʀɦɱʍɶäëïöü]/g, (c) => NEAREST[c])
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '');
}
// Engelsk får rettelsene fra kokoro-js. Alle språk får de nærmeste lydene.
export const fixPhonemesFor = (ipa, lang) => nearestSounds(languageById(lang)?.english ? fixPhonemes(ipa, lang === 'en-us' ? 'a' : 'b') : ipa.trim());

// Tegnsetting sendes til modellen som den er, resten blir uttale.
export const PUNCTUATION = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;
export function splitPunctuation(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(PUNCTUATION)) {
    if (last < m.index) out.push({ match: false, text: text.slice(last, m.index) });
    if (m[0].length) out.push({ match: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ match: false, text: text.slice(last) });
  return out;
}
