// Editor-side bridge: the handbook runs in its own restricted renderer.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { CornerDownLeft, Keyboard } from 'lucide-preact';
import { COMMANDS, helpOpen, isMac, paletteOpen, runCommand, shortcutText } from '../registry.js';
import { consoleSearch, runItem } from './console.js';
import { selection } from '../editor/store.js';
import { toast } from '../ui.jsx';
import { searchHelp } from './search.js';
import { ARTICLES } from './articles.js';

export const searchAll = (query) => searchHelp(query, ARTICLES, COMMANDS);
const snapshot = () => COMMANDS.filter((c) => !c.hidden && !c.menuOnly).map((c) => ({
  id: c.id, label: c.label, menu: c.menu, submenu: c.submenu, help: c.help,
  desc: c.desc || '', keywords: c.keywords || '', shortcut: shortcutText(c),
}));

export function HelpCenter() {
  const state = helpOpen.value;
  useEffect(() => {
    if (!state) return;
    window.api.openHelp({ request: state, commands: snapshot() })
      .catch((e) => toast(`Could not open Help: ${e.message}`, { kind: 'error' }));
    helpOpen.value = null;
  }, [state]);
  return null;
}

// Keep shortcuts current while Help stays open, without reopening it or changing the article.
export function installHelpBridge() {
  const off = window.api.onHelpCommand((id) => runCommand(id));
  const dispose = effect(() => {
    const commands = snapshot();
    window.api.updateHelp(commands).catch(() => {});
  });
  return () => { off(); dispose(); };
}

function Keycap({ cmd }) {
  const text = shortcutText(cmd);
  return text ? <kbd class="keycap">{text}</kbd> : null;
}

// Søket (Ctrl mellomrom), som FX Console: skriv navnet på en effekt, et verktøy, en overgang,
// en innstilling eller en kommando, trykk Enter, så blir det brukt eller åpnet og markert.
export function CommandPalette() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const close = () => (paletteOpen.value = false);
  const items = useMemo(() => consoleSearch(query), [query]);
  // Feltet får fokus med en gang, så du kan skrive uten å klikke.
  useEffect(() => {
    inputRef.current?.focus();
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  const choose = (it) => {
    close();
    if (it) runItem(it, (article) => (helpOpen.value = { article }));
  };
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.code === 'Space' && e.ctrlKey)) {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[index]);
    }
  };
  const sel = selection.value.length;
  return (
    <div class="modal-backdrop palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="palette" onKeyDown={onKey}>
        <div class="palette-input">
          <Search size={16} />
          <input ref={inputRef} autoFocus placeholder="Effects, tools, transitions, titles, settings, commands, media" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          <span class="palette-target">{sel ? `${sel} selected` : 'Nothing selected'}</span>
        </div>
        <div class="palette-list" ref={listRef}>
          {!query && <div class="palette-hint">Start typing to find anything in Reccut.</div>}
          {items.length === 0 && <p class="dim">Nothing found.</p>}
          {items.map((it, i) => (
            <button key={it.id} class={`palette-item${i === index ? ' active' : ''}`} onPointerMove={() => setIndex(i)} onClick={() => choose(it)}>
              <span class={`kind k-${it.kind.toLowerCase()}`}>{it.kind}</span>
              <span class="label">{it.label}</span>
              <span class="where">{it.sub}</span>
              {it.cmd && <Keycap cmd={it.cmd} />}
            </button>
          ))}
        </div>
        <footer>
          <span>
            <CornerDownLeft size={12} /> apply or open
          </span>
          <span>{isMac ? '⌃Space' : 'Ctrl+Space'} opens and closes</span>
          <span>
            <Keyboard size={12} /> {isMac ? '⌥⌘K' : 'Ctrl+Alt+K'} all shortcuts
          </span>
        </footer>
      </div>
    </div>
  );
}
