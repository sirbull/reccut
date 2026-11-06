// Build/install preparation bundles ONLY the existing default Whisper Base model.
// Optional models are installed by the user's explicit action in Settings → AI.
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SubtitleModelManager } = require('../src/main/subtitleModels');
const manager = new SubtitleModelManager({
  dir: path.resolve(import.meta.dirname, '../vendor/subtitle-models'),
  ram: Math.max(4 * 1024 ** 3, (await import('node:os')).totalmem()),
  onChange: state => {
    const base = state.models.find(m => m.bundled);
    if (base?.status === 'installing') console.log('Verifying default Whisper Base…');
  },
});
await manager.ready;
await manager.downloadModel('whisper-base');
await manager.downloads.get('whisper-base')?.done;
await manager.shutdown();
console.log('Default Whisper Base is verified locally (MIT).');
