// Hjelpen: artikler med bilder, søk i både artikler og kommandoer, og kommandosøket (Cmd K)
// som kjører kommandoen eller åpner verktøyet du søker etter, som Hjelp-søket i Mac-programmer.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BookOpen, Command, CornerDownLeft, Keyboard, Search, X } from 'lucide-preact';
import { ARTICLES, SECTIONS } from './articles.js';
import { COMMANDS, byId, helpOpen, isMac, paletteOpen, runCommand, shortcutText } from '../registry.js';

/* Søk */

const norm = (s) => (s || '').toLowerCase();

function score(text, words, strong) {
  let total = 0;
  for (const w of words) {
    const i = text.indexOf(w);
    if (i < 0) return -1;
    total += strong.startsWith(w) ? 6 : strong.includes(` ${w}`) ? 4 : strong.includes(w) ? 3 : 1;
  }
  return total;
}

function commandHay(c) {
  return norm(`${c.label} ${c.menuLabel || ''} ${c.menu || ''} ${c.submenu || ''} ${c.keywords || ''} ${c.desc || ''}`);
}

export function searchAll(query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { commands: [], articles: [] };
  const cmds = COMMANDS.filter((c) => !c.hidden)
    .map((c) => ({ c, s: score(commandHay(c), words, norm(c.label)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.c);
  const arts = ARTICLES.map((a) => ({ a, s: score(norm(`${a.title} ${a.keywords || ''} ${a.body}`), words, norm(a.title)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.a);
  return { commands: cmds, articles: arts };
}

function Keycap({ cmd }) {
  const t = shortcutText(cmd);
  return t ? <kbd class="keycap">{t}</kbd> : null;
}

function menuPath(c) {
  return [c.menu === 'App' ? 'OBSlite' : c.menu, c.submenu].filter(Boolean).join(' › ');
}

/* Artikkeltekst: avsnitt, overskrifter (##), punktlister (-), bilder ![tekst](fil),
   **fet**, {{key:kommando}} for en hurtigtast og [[run:kommando|Tekst]] for en knapp som kjører den. */

function inline(text, key) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\{\{key:([\w:.-]+)\}\}|\[\[run:([\w:.-]+)\|(.+?)\]\]/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<b key={`${key}b${i++}`}>{m[1]}</b>);
    else if (m[2]) {
      const c = byId.get(m[2]);
      out.push(c ? <Keycap key={`${key}k${i++}`} cmd={c} /> : m[2]);
    } else if (m[3]) {
      const c = byId.get(m[3]);
      out.push(
        <button
          key={`${key}r${i++}`}
          class="help-run"
          onClick={() => {
            helpOpen.value = null;
            runCommand(m[3]);
          }}
        >
          {m[4]}
          {c && <Keycap cmd={c} />}
        </button>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Body({ text }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks.map((b, i) => {
    const t = b.trim();
    const img = /^!\[(.*?)\]\((.+?)\)$/.exec(t);
    if (img)
      return (
        <figure key={i}>
          <img src={`help/${img[2]}`} alt={img[1]} loading="lazy" />
          {img[1] && <figcaption>{img[1]}</figcaption>}
        </figure>
      );
    if (t.startsWith('## ')) return <h3 key={i}>{inline(t.slice(3), i)}</h3>;
    if (t.split('\n').every((l) => l.trim().startsWith('- ')))
      return (
        <ul key={i}>
          {t.split('\n').map((l, j) => (
            <li key={j}>{inline(l.trim().slice(2), `${i}-${j}`)}</li>
          ))}
        </ul>
      );
    return <p key={i}>{inline(t.replace(/\n/g, ' '), i)}</p>;
  });
}

// Alle hurtigtaster, gruppert etter meny. Bygges fra registeret, så den alltid stemmer.
function ShortcutList({ filter }) {
  const menus = [...new Set(COMMANDS.filter((c) => c.menu && !c.hidden).map((c) => c.menu))];
  const f = norm(filter);
  return menus.map((menu) => {
    const list = COMMANDS.filter((c) => c.menu === menu && !c.hidden && !c.menuOnly && shortcutText(c) && (!f || norm(`${c.label} ${shortcutText(c)}`).includes(f)));
    if (!list.length) return null;
    return (
      <section key={menu} class="shortcut-group">
        <h3>{menu === 'App' ? 'OBSlite' : menu}</h3>
        <table>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>
                  <Keycap cmd={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  });
}

function Article({ id, onOpen }) {
  const a = ARTICLES.find((x) => x.id === id) || ARTICLES[0];
  const [filter, setFilter] = useState('');
  const related = COMMANDS.filter((c) => c.help === a.id && !c.hidden && !c.menuOnly);
  return (
    <article class="help-article">
      <h2>{a.title}</h2>
      {a.summary && <p class="help-summary">{a.summary}</p>}
      {a.id === 'shortcuts' ? (
        <>
          <p>
            {isMac ? 'Cmd is ⌘, Option is ⌥, Control is ⌃ and Shift is ⇧.' : 'On Windows, Ctrl is used where the Mac uses Cmd, and Alt where it uses Option.'} Every shortcut is also shown next to its command in the menus, and you can search for any command with{' '}
            <Keycap cmd={byId.get('findCommand')} />.
          </p>
          <div class="search small">
            <Search size={13} />
            <input placeholder="Filter shortcuts" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
          </div>
          <ShortcutList filter={filter} />
        </>
      ) : (
        <Body text={a.body} />
      )}
      {related.length > 0 && a.id !== 'shortcuts' && (
        <section class="help-related">
          <h3>Commands</h3>
          {related.map((c) => (
            <button
              key={c.id}
              class="help-cmd"
              title={c.desc || ''}
              onClick={() => {
                helpOpen.value = null;
                runCommand(c.id);
              }}
            >
              <span>{c.label}</span>
              <span class="where">{menuPath(c)}</span>
              <Keycap cmd={c} />
            </button>
          ))}
        </section>
      )}
      {a.see?.length > 0 && (
        <p class="help-see">
          See also:{' '}
          {a.see.map((sid, i) => (
            <span key={sid}>
              {i > 0 && ', '}
              <button class="link" onClick={() => onOpen(sid)}>
                {ARTICLES.find((x) => x.id === sid)?.title || sid}
              </button>
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

export function HelpCenter() {
  const state = helpOpen.value;
  const [current, setCurrent] = useState(state?.article || 'welcome');
  const [query, setQuery] = useState(state?.query || '');
  const bodyRef = useRef(null);
  useEffect(() => {
    if (state?.article) setCurrent(state.article);
  }, [state?.article]);
  const open = (id) => {
    setCurrent(id);
    setQuery('');
    bodyRef.current?.scrollTo(0, 0);
  };
  const close = () => (helpOpen.value = null);
  const results = useMemo(() => searchAll(query), [query]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div class="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="help-window" onKeyDown={(e) => e.stopPropagation()}>
        <aside class="help-nav">
          <div class="help-search">
            <Search size={14} />
            <input autoFocus placeholder="Search help and commands" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          </div>
          <nav>
            {SECTIONS.map((sec) => (
              <div key={sec} class="help-section">
                <h4>{sec}</h4>
                {ARTICLES.filter((a) => a.section === sec).map((a) => (
                  <button key={a.id} class={current === a.id && !query ? 'active' : ''} onClick={() => open(a.id)}>
                    {a.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <div class="help-body" ref={bodyRef}>
          <button class="icon-btn help-close" title="Close" onClick={close}>
            <X size={16} />
          </button>
          {query ? (
            <div class="help-results">
              <h2>Results for “{query}”</h2>
              {results.commands.length > 0 && <h3>Commands</h3>}
              {results.commands.map((c) => (
                <button
                  key={c.id}
                  class="help-cmd"
                  onClick={() => {
                    close();
                    runCommand(c.id);
                  }}
                >
                  <span>{c.label}</span>
                  <span class="where">{menuPath(c)}</span>
                  <Keycap cmd={c} />
                </button>
              ))}
              {results.articles.length > 0 && <h3>Help Articles</h3>}
              {results.articles.map((a) => (
                <button key={a.id} class="help-hit" onClick={() => open(a.id)}>
                  <b>{a.title}</b>
                  <span>{a.summary}</span>
                </button>
              ))}
              {!results.commands.length && !results.articles.length && <p class="dim">Nothing found. Try another word.</p>}
            </div>
          ) : (
            <Article id={current} onOpen={open} />
          )}
        </div>
      </div>
    </div>
  );
}

// Kommandosøket: skriv hva du vil gjøre, trykk Enter, så skjer det.
export function CommandPalette() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const close = () => (paletteOpen.value = false);
  const { commands, articles } = useMemo(() => {
    if (query.trim()) return searchAll(query);
    // Uten søkeord: de vanligste kommandoene.
    const common = ['import', 'syncAudio', 'optimize', 'blade', 'addTitle', 'addTransition', 'retime', 'group', 'export', 'shortcuts', 'help'];
    return { commands: common.map((id) => byId.get(id)).filter(Boolean), articles: [] };
  }, [query]);
  const items = [...commands.map((c) => ({ kind: 'cmd', c })), ...articles.map((a) => ({ kind: 'art', a }))];
  const choose = (it) => {
    close();
    if (!it) return;
    if (it.kind === 'cmd') runCommand(it.c.id);
    else helpOpen.value = { article: it.a.id };
  };
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
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
  return (
    <div class="modal-backdrop palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="palette" onKeyDown={onKey}>
        <div class="palette-input">
          <Command size={16} />
          <input autoFocus placeholder="Search commands, tools and help" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </div>
        <div class="palette-list" ref={listRef}>
          {items.length === 0 && <p class="dim">Nothing found.</p>}
          {items.map((it, i) =>
            it.kind === 'cmd' ? (
              <button key={it.c.id} class={`palette-item${i === index ? ' active' : ''}`} onPointerMove={() => setIndex(i)} onClick={() => choose(it)}>
                <span class="label">{it.c.label}</span>
                <span class="where">{menuPath(it.c)}</span>
                <Keycap cmd={it.c} />
              </button>
            ) : (
              <button key={it.a.id} class={`palette-item${i === index ? ' active' : ''}`} onPointerMove={() => setIndex(i)} onClick={() => choose(it)}>
                <BookOpen size={14} />
                <span class="label">{it.a.title}</span>
                <span class="where">Help</span>
              </button>
            )
          )}
        </div>
        <footer>
          <span>
            <CornerDownLeft size={12} /> run or open
          </span>
          <span>
            <Keyboard size={12} /> {isMac ? '⌥⌘K' : 'Ctrl+Alt+K'} all shortcuts
          </span>
        </footer>
      </div>
    </div>
  );
}
