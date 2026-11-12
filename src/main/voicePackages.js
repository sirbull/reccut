// Persist that the optional voice-package chooser has been shown. This records
// no download consent: every installation still needs an explicit user action.
const fs = require('node:fs/promises');
const path = require('node:path');

function createVoicePackages({ file, systemLanguage = 'en-US', appLanguage = 'en-GB' }) {
  let pending = Promise.resolve();
  async function status() {
    await pending;
    let asked = false;
    try { asked = JSON.parse(await fs.readFile(file, 'utf8')).voicePackagesAsked === true; }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    return { voicePackagesAsked: asked, systemLanguage, appLanguage };
  }
  function markAsked() {
    const operation = pending.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', JSON.stringify({ voicePackagesAsked: true }));
      await fs.rename(file + '.tmp', file);
    });
    pending = operation.catch(() => {});
    return operation.then(status);
  }
  return { status, markAsked };
}

module.exports = { createVoicePackages };
