// Forsiden til håndboken. Brukes både i hjelpevinduet (Handbook.jsx) og på nettsiden (scripts/build-docs-site.mjs).
// Bildene ligger i assets/help. Lenkene peker på artikkel-id-er i articles.js.
export const HOME_ID = 'home';

export const HOME = {
  title: 'Reccut Handbook',
  tagline: 'Record, edit and deliver video on your own computer.',
  intro: 'Reccut brings screen and camera recording, a magnetic timeline, multicam, audio cleanup, colour, titles, an AI Agent and export into one app. Your projects stay on your computer, and AI models are downloaded only when you ask for them. Start with a guided first edit, or jump to the part of Reccut you want to learn.',
  hero: { image: 'overview.jpg', caption: 'The Edit room: media, viewer, inspector and timeline.' },
  start: [
    { article: 'first-edit', title: 'Your first video', text: 'Record, edit and export a complete example.' },
    { article: 'welcome', title: 'The four rooms', text: 'Record, Edit, Export and Design at a glance.' },
    { article: 'projects', title: 'Projects and media', text: 'How a project folder keeps everything together.' },
    { article: 'shortcuts', title: 'Keyboard shortcuts', text: 'Every shortcut, grouped by menu.' },
  ],
  features: [
    { title: 'Record', image: 'record.jpg', text: 'Capture screen, camera and microphone in one take, with cursor zoom and recovery if something goes wrong.', links: ['recording', 'recording-setup', 'recording-edit'] },
    { title: 'Edit', image: 'timeline.jpg', text: 'A magnetic timeline with blade, trim, roll, slip and slide, connected clips and familiar shortcuts.', links: ['editing', 'tools', 'trimming'] },
    { title: 'Multicam', image: 'multicam-window.jpg', text: 'Line up several cameras by their sound, then press 1–9 to switch angles while the video plays.', links: ['multicam', 'sync'] },
    { title: 'Audio and voice', image: 'audio.jpg', text: 'Clean Voice removes noise locally. Mix music, add effects and record or generate voice-over.', links: ['audio', 'audio-recipe', 'voiceover'] },
    { title: 'Colour and effects', image: 'color.jpg', text: 'Grade with scopes and film looks, key green screens, track, stabilise and mask.', links: ['color', 'effects', 'keying'] },
    { title: 'Titles and captions', image: 'titles.jpg', text: 'Animated titles and lower thirds, plus captions generated on your computer.', links: ['titles', 'lower-thirds', 'caption-workflow'] },
    { title: 'AI Agent and plugins', image: 'ai-chat.jpg', text: 'Ask a cloud or local AI model to edit for you, and extend Reccut with plugins.', links: ['ai-setup', 'ai-local', 'plugins-guide'] },
    { title: 'Export and design', image: 'exportroom.jpg', text: 'Export for web, portrait, masters or audio, and make thumbnails in Design.', links: ['export', 'export-recipes', 'design'] },
  ],
  reference: ['command-reference', 'troubleshooting', 'glossary', 'preferences', 'third-party-licenses'],
};

// Alle bildene forsiden bruker, så nettsidebyggeren kan kopiere dem.
export const homeImages = () => [HOME.hero.image, ...HOME.features.map((f) => f.image)];
// Alle artiklene forsiden lenker til, så testen kan sjekke at de finnes.
export const homeLinks = () => [...HOME.start.map((s) => s.article), ...HOME.features.flatMap((f) => f.links), ...HOME.reference];
