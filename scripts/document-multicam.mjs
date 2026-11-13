// Export the in-app multicam article as a standalone Markdown guide.
// Run after changing the handbook text with node scripts/document-multicam.mjs.
import fs from 'node:fs';
import { ARTICLES } from '../src/renderer/help/articles.js';

const article = ARTICLES.find(article => article.id === 'multicam');
const shortcuts = { undo: 'Cmd/Ctrl Z', redo: 'Cmd/Ctrl Shift Z' };
const body = article.body.trim()
  .replace(/\{\{key:([^}]+)\}\}/g, (_match, id) => {
    if (!shortcuts[id]) throw new Error(`Add the default shortcut for ${id} before exporting the guide.`);
    return `**${shortcuts[id]}**`;
  })
  .replace(/\]\((multicam-[\w.-]+)\)/g, '](../assets/help/$1)');
const contents = [...body.matchAll(/^## (.+)$/gm)].map(([, title]) => {
  const anchor = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  return `- [${title}](#${anchor})`;
}).join('\n');
const markdown = `# ${article.title}\n\n${article.summary}\n\n` +
  `<!-- Generated from src/renderer/help/articles.js with node scripts/document-multicam.mjs. -->\n\n` +
  `## Contents\n\n${contents}\n\n${body}\n`;
fs.writeFileSync(new URL('../docs/MULTICAM.md', import.meta.url), markdown);
console.log('Updated docs/MULTICAM.md from the in-app handbook.');
