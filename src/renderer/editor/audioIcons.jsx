// Et ikon for hver lydeffekt og lydmal, som viser hva den gjør. Brukes i Edit og i Voice Over Studio.
import {
  Activity, AudioLines, BookOpen, Bot, Clapperboard, BrickWall, CassetteTape, ChartSpline, Church, Cloud, Disc3, DoorClosed, Ear, Fish, Flame, Gamepad2, Grid3x3,
  Headphones, House, Landmark, Megaphone, Mic, MicVocal, Mountain, Orbit, Phone, Plane, Radio, RadioReceiver, Repeat, Scale, Shrink, SlidersHorizontal,
  Sparkles, Speaker, Telescope, TrendingDown, TrendingUp, Truck, Users, Vibrate, Volume2, VolumeX, Wind, Zap,
} from 'lucide-preact';

const EFFECTS = {
  eq: SlidersHorizontal, highpass: TrendingUp, lowpass: TrendingDown, bandpass: ChartSpline, hum: Zap, denoise: Wind, gate: DoorClosed,
  compressor: Shrink, limiter: BrickWall, deesser: Ear, autolevel: Scale, gain: Volume2, stereo: Headphones, echo: Repeat, reverb: Church,
  chorus: Users, flanger: Plane, tremolo: Vibrate, distortion: Flame, bitcrush: Grid3x3, lofi: CassetteTape, ringmod: Bot, pitch: AudioLines, voice: Mic,
};
const PRESETS = {
  'warm-narrator': BookOpen, 'deep-voice': MicVocal, 'trailer-voice': Clapperboard, 'studio-voice': Mic, 'voice-cleanup': Sparkles, podcast: Radio, 'reduce-noise': Wind, hum50: Zap, hum60: Zap, rumble: Truck, even: Scale,
  loud: Volume2, gate: VolumeX, room: House, hall: Landmark, cathedral: Church, canyon: Mountain, slapback: Repeat, faraway: Telescope,
  telephone: Phone, walkie: RadioReceiver, radio: Radio, megaphone: Megaphone, tape: CassetteTape, vinyl: Disc3, '8bit': Gamepad2,
  distorted: Flame, blown: Speaker, robot: Bot, alien: Orbit, underwater: Fish, dream: Cloud, jet: Plane, pulse: Activity,
};

// Fades tegnes som det de gjør: lyden stiger fra stille, eller faller til stille.
export const FadeInIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 20 L21 4 L21 20 Z" fill="currentColor" fill-opacity="0.25" />
  </svg>
);
export const FadeOutIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 4 L21 20 L3 20 Z" fill="currentColor" fill-opacity="0.25" />
  </svg>
);

// kind: 'afx' (enkelteffekt) eller 'apreset' (mal).
export function AudioFxIcon({ kind, id, size = 16 }) {
  const Icon = (kind === 'apreset' ? PRESETS[id] : EFFECTS[id]) || AudioLines;
  return <Icon size={size} aria-hidden="true" />;
}
