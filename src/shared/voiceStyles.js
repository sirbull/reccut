// Ferdige stemmestiler for AI-stemmene i Voice Over Studio: mørke og lyse, filmatiske og vanlige.
// En stil er en Kokoro-stemme (eller en blanding av flere), en fart og en effektkjede.
// Kokoro har ingen tonehøydekontroll, så mørk og lys lages med stemmevalg, blanding, fart og EQ.
import { makeEffect } from './audiofx.js';

const eq = (g) => makeEffect('eq', Object.fromEntries(g.map((v, i) => [`b${i}`, v])));
// EQ-bånd: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k og 16k Hz.
const FX = {
  none: () => [],
  clean: () => [makeEffect('highpass', { freq: 70 }), makeEffect('deesser'), makeEffect('limiter', { ceiling: -1 })],
  warm: () => [makeEffect('highpass', { freq: 60 }), eq([0, 1, 2.5, 2, 0.5, 0, 0, 0, -1, -2]), makeEffect('compressor', { threshold: -22, ratio: 2.5, makeup: 3 }), makeEffect('limiter', { ceiling: -1 })],
  broadcast: () => [makeEffect('highpass', { freq: 80 }), eq([0, 0, 1, 0, -1, 0, 1.5, 2, 1, 0]), makeEffect('deesser'), makeEffect('compressor', { threshold: -24, ratio: 3.5, makeup: 5 }), makeEffect('limiter', { ceiling: -1 })],
  bright: () => [makeEffect('highpass', { freq: 90 }), eq([-3, -2, -1, 0, 0, 1, 2, 3, 3, 2]), makeEffect('deesser'), makeEffect('compressor', { threshold: -22, ratio: 3, makeup: 4 }), makeEffect('limiter', { ceiling: -1 })],
  cinematic: () => [
    makeEffect('highpass', { freq: 40 }),
    eq([0, 3, 4, 2, 0, -1, 0, 1, -1, -3]),
    makeEffect('compressor', { threshold: -26, ratio: 4, makeup: 6 }),
    makeEffect('reverb', { size: 0.75, damping: 0.5, mix: 0.1, predelay: 30 }),
    makeEffect('limiter', { ceiling: -1 }),
  ],
  noir: () => [makeEffect('highpass', { freq: 60 }), eq([0, 2, 3, 2, 0, -1, -1, 0, -2, -4]), makeEffect('compressor', { threshold: -24, ratio: 3, makeup: 4 }), makeEffect('reverb', { size: 0.35, damping: 0.6, mix: 0.12, predelay: 8 }), makeEffect('limiter', { ceiling: -1 })],
};

const S = (id, name, tone, character, gender, lang, voice, speed, fx, desc) => ({ id, name, tone, character, gender, lang, voice, speed, fx, desc });

export const TONES = [
  { value: 'dark', label: 'Dark' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'bright', label: 'Bright' },
];
export const CHARACTERS = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'natural', label: 'Natural' },
  { value: 'calm', label: 'Calm' },
  { value: 'energetic', label: 'Energetic' },
];

export const VOICE_STYLES = [
  // Mørke
  S('trailer', 'Trailer', 'dark', 'cinematic', 'Male', 'en-gb', 'bm_lewis:0.55,am_fenrir:0.45', 0.86, 'cinematic', 'Deep and big, with weight in the low end and a touch of hall. For trailers, intros and dramatic openings.'),
  S('deep-narrator', 'Deep Narrator', 'dark', 'natural', 'Male', 'en-gb', 'bm_lewis', 0.88, 'none', 'A deep British narrator, read slowly and left unprocessed.'),
  S('documentary', 'Documentary', 'dark', 'natural', 'Male', 'en-gb', 'bm_george:0.7,bm_lewis:0.3', 0.92, 'warm', 'Grounded and trustworthy, for documentaries and explainers that need authority.'),
  S('noir', 'Noir', 'dark', 'cinematic', 'Male', 'en-gb', 'bm_daniel:0.5,bm_lewis:0.5', 0.84, 'noir', 'Low, dry and close, in a small dark room. For mysteries and crime stories.'),
  S('late-night', 'Late Night', 'dark', 'calm', 'Male', 'en-us', 'am_michael:0.6,am_fenrir:0.4', 0.9, 'warm', 'A warm, low radio voice for slow, intimate stories.'),
  S('epic-female', 'Epic', 'dark', 'cinematic', 'Female', 'en-gb', 'bf_isabella:0.6,af_kore:0.4', 0.88, 'cinematic', 'A strong, low female voice with cinematic weight and space.'),
  S('velvet', 'Velvet', 'dark', 'calm', 'Female', 'en-us', 'af_nicole:0.6,af_kore:0.4', 0.92, 'warm', 'Soft and low, close to the microphone. For calm guides and meditative pieces.'),
  // Nøytrale
  S('storyteller', 'Storyteller', 'neutral', 'natural', 'Male', 'en-gb', 'bm_fable', 0.95, 'warm', 'A friendly British storyteller, clear and relaxed.'),
  S('clear-guide', 'Clear Guide', 'neutral', 'natural', 'Female', 'en-us', 'af_heart', 1, 'clean', 'The clearest voice in Kokoro. Good for tutorials and product videos.'),
  S('calm-guide', 'Calm Guide', 'neutral', 'calm', 'Female', 'en-gb', 'bf_emma', 0.94, 'clean', 'A calm British voice for walkthroughs, onboarding and longer tutorials.'),
  S('newsreader', 'Newsreader', 'neutral', 'natural', 'Male', 'en-us', 'am_michael', 1, 'broadcast', 'Even and polished, with broadcast processing. For news, updates and announcements.'),
  S('presenter', 'Presenter', 'neutral', 'cinematic', 'Female', 'en-us', 'af_heart:0.6,af_kore:0.4', 0.96, 'cinematic', 'A polished female presenter with a touch of cinema. For launches and brand films.'),
  // Lyse
  S('bright-explainer', 'Bright Explainer', 'bright', 'energetic', 'Female', 'en-us', 'af_bella', 1.06, 'bright', 'Upbeat and crisp. For explainers, ads and social media.'),
  S('upbeat-host', 'Upbeat Host', 'bright', 'energetic', 'Male', 'en-us', 'am_puck', 1.05, 'bright', 'Lively and friendly, like a podcast or YouTube host.'),
  S('friendly', 'Friendly', 'bright', 'natural', 'Female', 'en-us', 'af_sarah:0.6,af_heart:0.4', 1.02, 'clean', 'Light and warm, like talking to a friend.'),
  S('fresh', 'Fresh', 'bright', 'energetic', 'Female', 'en-us', 'af_sky:0.5,af_bella:0.5', 1.04, 'bright', 'Young and bright, for quick social clips.'),
  S('light-uk', 'Light (UK)', 'bright', 'calm', 'Female', 'en-gb', 'bf_lily:0.5,bf_emma:0.5', 1, 'clean', 'A light, gentle British voice.'),
];

export const styleById = (id) => VOICE_STYLES.find((s) => s.id === id) || null;
export const styleEffects = (style) => (FX[style?.fx] || FX.none)();

// Filtrerer stilene. Tomme filtre betyr alle.
export function filterStyles({ tone = '', character = '', gender = '' } = {}) {
  return VOICE_STYLES.filter((s) => (!tone || s.tone === tone) && (!character || s.character === character) && (!gender || s.gender === gender));
}
