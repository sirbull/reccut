// Real UI components and command registry, with fictional data in a disposable renderer.
import { render } from 'preact';
import { SettingsWindow } from '../src/renderer/Settings.jsx';
import { AIChat } from '../src/renderer/Extensions.jsx';
import { COMMANDS, setShortcut, shortcutText } from '../src/renderer/registry.js';
import { installHelpBridge } from '../src/renderer/help/Help.jsx';
import { ARTICLES } from '../src/renderer/help/articles.js';

const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
export const commands = () => COMMANDS.filter((c) => !c.hidden && !c.menuOnly).map((c) => ({ id: c.id, label: c.label, menu: c.menu, submenu: c.submenu, help: c.help, desc: c.desc || '', keywords: c.keywords || '', shortcut: shortcutText(c) }));
export async function verifyReferences() {
  const ids = new Set(COMMANDS.map((c) => c.id));
  const articles = new Set(ARTICLES.map((a) => a.id));
  for (const a of ARTICLES) for (const m of a.body.matchAll(/\{\{key:([\w:.-]+)\}\}|\[\[run:([\w:.-]+)\|/g)) {
    if (!ids.has(m[1] || m[2])) throw new Error(`${a.id}: unknown command ${m[1] || m[2]}`);
  }
  for (const c of COMMANDS) if (!c.hidden && !c.menuOnly && !articles.has(c.help)) throw new Error(`${c.id}: no guide ${c.help}`);
  return { articles: ARTICLES.length, commands: commands().length };
}
export async function settings(pane = 'extensions') {
  window.demoConfigured = true;
  render(null, document.getElementById('root'));
  localStorage.setItem('settingsPane', pane);
  render(<SettingsWindow />, document.getElementById('root'));
  await wait();
}
export async function chat(setup = false) {
  render(null, document.getElementById('root'));
  window.demoConfigured = !setup;
  render(<AIChat />, document.getElementById('root'));
  await wait();
  if (!setup) {
    const help = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('What can I ask'));
    help?.click();
    await wait();
  }
}
export const openManual = (request = {}) => window.api.openHelp({ request, commands: commands() });
export const customize = () => setShortcut('tool:blade', 'Shift+B');
installHelpBridge();
