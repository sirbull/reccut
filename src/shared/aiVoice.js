// The studio uses these rules for both auditioning and recording AI takes.
// VoxCPM2 controls its own speaking pace; do not pass Kokoro/Piper speed to it.
export function aiVoicePayload(ai, text) {
  const engine = ai.engine || 'kokoro';
  if (!['kokoro', 'piper', 'voxcpm'].includes(engine)) throw new Error('Unknown voice engine.');
  const payload = { text, engine, voice: ai.voice, lang: ai.lang };
  if (engine === 'voxcpm') payload.mood = ai.mood || 'neutral';
  else {
    payload.speed = ai.speed || 1;
    if (engine === 'piper') payload.speaker = ai.speaker || '';
  }
  return payload;
}

export function aiVoiceInstalled(ai, state) {
  const engine = ai.engine || 'kokoro';
  if (engine === 'voxcpm') return Boolean(state.voxcpm?.supported && state.voxcpm.installed && state.voxcpm.engine && state.voxcpm.languages?.[ai.lang]?.installed);
  if (engine === 'piper') return Boolean(state.piper?.[ai.voice]?.installed);
  return engine === 'kokoro' && Boolean(state.installed);
}

export function aiVoiceChoicePatch(current, choice) {
  const engine = choice.engine || 'kokoro';
  return {
    engine, voice: choice.voice, lang: choice.lang,
    mood: engine === 'voxcpm' ? (current.engine === 'voxcpm' ? current.mood || 'neutral' : 'neutral') : undefined,
    speed: engine === 'voxcpm' ? undefined : (current.engine === 'voxcpm' ? 1 : current.speed || 1),
    speaker: engine === 'piper' ? (choice.speaker || '') : undefined,
    style: undefined,
  };
}
