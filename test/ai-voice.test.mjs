import test from 'node:test';
import assert from 'node:assert/strict';
import { aiVoiceChoicePatch, aiVoiceInstalled, aiVoicePayload } from '../src/shared/aiVoice.js';

const vox = { engine: 'voxcpm', voice: 'nb-female-1', mood: 'sad', lang: 'nb' };

test('VoxCPM synthesis keeps identity, language and mood and omits other engines parameters', () => {
  const payload = aiVoicePayload({ ...vox, speed: 1.4, speaker: 'old-speaker', style: 'old-style' }, 'Hei.');
  assert.deepEqual(payload, { engine: 'voxcpm', voice: 'nb-female-1', mood: 'sad', lang: 'nb', text: 'Hei.' });
  assert.equal(aiVoicePayload({ ...vox, mood: undefined }, 'Hei.').mood, 'neutral');
  assert.throws(() => aiVoicePayload({ ...vox, engine: 'unknown' }, 'Hei.'), /Unknown voice engine/);
});

test('existing Kokoro and Piper projects retain their voice, speed and speaker', () => {
  assert.deepEqual(aiVoicePayload({ voice: 'af_heart', lang: 'en-us', speed: 0.8 }, 'Hello.'), {
    text: 'Hello.', engine: 'kokoro', voice: 'af_heart', lang: 'en-us', speed: 0.8,
  });
  assert.deepEqual(aiVoicePayload({ engine: 'piper', voice: 'no_NO-nvcc-medium', speaker: 'KON', lang: 'nb', speed: 1.2, mood: 'sad' }, 'Hei.'), {
    text: 'Hei.', engine: 'piper', voice: 'no_NO-nvcc-medium', speaker: 'KON', lang: 'nb', speed: 1.2,
  });
});

test('VoxCPM availability requires its own model, engine, platform and language, independently of Kokoro', () => {
  const available = { supported: true, installed: true, engine: true, languages: { nb: { installed: true } } };
  assert.equal(aiVoiceInstalled(vox, { installed: false, voxcpm: available }), true);
  for (const key of ['supported', 'installed', 'engine']) assert.equal(aiVoiceInstalled(vox, { installed: true, voxcpm: { ...available, [key]: false } }), false);
  assert.equal(aiVoiceInstalled(vox, { installed: true, voxcpm: { ...available, languages: {} } }), false);
  assert.equal(aiVoiceInstalled(vox, { installed: true }), false);
  assert.equal(aiVoiceInstalled({ ...vox, lang: 'de' }, { voxcpm: available }), false);
  assert.equal(aiVoiceInstalled({ engine: 'piper', voice: 'p' }, { piper: { p: { installed: true } } }), true);
  assert.equal(aiVoiceInstalled({ voice: 'af_heart' }, { installed: true }), true);
});

test('switching engines removes irrelevant settings while changing VoxCPM voice preserves mood', () => {
  const piper = aiVoiceChoicePatch(vox, { engine: 'piper', voice: 'p', lang: 'nb', speaker: 'KON' });
  assert.equal(piper.engine, 'piper');
  assert.equal(piper.speed, 1);
  assert.equal(piper.speaker, 'KON');
  assert.equal(piper.mood, undefined);
  const expressive = aiVoiceChoicePatch({ engine: 'piper', speed: 1.5, speaker: 'KON' }, { engine: 'voxcpm', voice: 'nb-male-1', lang: 'nb' });
  assert.equal(expressive.engine, 'voxcpm');
  assert.equal(expressive.speed, undefined);
  assert.equal(expressive.speaker, undefined);
  assert.equal(expressive.mood, 'neutral');
  assert.equal(aiVoiceChoicePatch(vox, { engine: 'voxcpm', voice: 'nb-male-1', lang: 'nb' }).mood, 'sad');
  assert.equal(aiVoiceChoicePatch({ voice: 'af_heart', speed: 0.9 }, { engine: 'kokoro', voice: 'bm_george', lang: 'en-gb' }).speed, 0.9);
});

test('warm and sensual persist when switching VoxCPM languages and stay out of Kokoro and Piper payloads', () => {
  for (const mood of ['warm', 'sensual']) {
    const ai = aiVoiceChoicePatch({ ...vox, mood }, { engine: 'voxcpm', voice: 'en-us-woman', lang: 'en-us' });
    assert.equal(ai.mood, mood);
    assert.deepEqual(aiVoicePayload(ai, 'Hello.'), { engine: 'voxcpm', voice: 'en-us-woman', lang: 'en-us', mood, text: 'Hello.' });
    for (const engine of ['kokoro', 'piper']) {
      const changed = aiVoiceChoicePatch(ai, { engine, voice: 'test', lang: 'de' });
      assert.equal(aiVoicePayload(changed, 'Hallo.').mood, undefined);
    }
  }
});
