// AI-stemmer (Kokoro-82M): stemmene og hvordan teksten gjøres om til noe som kan leses høyt.
// Normaliseringen for engelsk følger kokoro-js (Apache 2.0, hexgrad og Xenova).

// Første bokstav i stemmen er språket. eSpeak-koden brukes til uttalen.
export const LANGUAGES = {
  a: { label: 'English (US)', espeak: 'en-us', english: true },
  b: { label: 'English (UK)', espeak: 'en', english: true },
  e: { label: 'Spanish', espeak: 'es' },
  f: { label: 'French', espeak: 'fr-fr' },
  h: { label: 'Hindi', espeak: 'hi' },
  i: { label: 'Italian', espeak: 'it' },
  p: { label: 'Portuguese (Brazil)', espeak: 'pt-br' },
};

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
  return `${v.name} (${LANGUAGES[v.lang].label}, ${v.gender.toLowerCase()})`;
};
export const PREVIEW_TEXT = {
  a: 'Hi, this is how I sound in the Voice Over Studio.',
  b: 'Hello, this is how I sound in the Voice Over Studio.',
  e: 'Hola, así sueno en el estudio de voz.',
  f: 'Bonjour, voici ma voix dans le studio.',
  h: 'नमस्ते, स्टूडियो में मेरी आवाज़ ऐसी लगती है।',
  i: 'Ciao, questa è la mia voce nello studio.',
  p: 'Olá, esta é a minha voz no estúdio.',
};

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
// Andre språk: bare de generelle rettelsene.
export const fixPhonemesFor = (ipa, lang) => (LANGUAGES[lang]?.english ? fixPhonemes(ipa, lang) : ipa.trim());

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
