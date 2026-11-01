// Real UI components and command registry, with fictional data in a disposable renderer.
import { render } from 'preact';
import { COMMANDS, setShortcut, shortcutText } from '../src/renderer/registry.js';
import { CommandPalette, installHelpBridge } from '../src/renderer/help/Help.jsx';
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
export async function verifyPalette() {
  render(<CommandPalette />, document.getElementById('root'));
  await wait();
  const input = document.querySelector('.palette-input input');
  if (!input) throw new Error('Quick Search should render its input and search icon.');
  input.value = 'color'; input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait();
  if (!document.querySelectorAll('.palette-item').length) throw new Error('Quick Search should return results.');
  render(null, document.getElementById('root'));
  return true;
}
export const openManual = (request = {}) => window.api.openHelp({ request, commands: commands() });
export const customize = () => setShortcut('tool:blade', 'Shift+B');
installHelpBridge();
