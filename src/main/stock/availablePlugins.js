// Optional sources configured with the user's own account key. No app key ships.
const sources = require('./keyProviders');
module.exports = sources.map(source => {
  const manifest = structuredClone(source);
  return {
    ...manifest,
    id: `${source.id}-personal`,
    keyLabel: `${source.name} API key`,
    keyHelpUrl: source.id === 'pixabay' ? 'https://pixabay.com/api/docs/#api_key' : 'https://www.pexels.com/api/',
    description: source.id === 'pixabay'
      ? 'Photos, illustrations and vectors with your own Pixabay API key.'
      : 'Photos with your own Pexels API key. Pexels app approval is also required.',
  };
});
