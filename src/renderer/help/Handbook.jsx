import { render, createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Home as HomeIcon, Search, X, ZoomIn } from 'lucide-preact';
import { ARTICLES, SECTIONS } from './articles.js';
import { excerpt, plainText, queryTerms, searchHelp } from './search.js';
import { HOME, HOME_ID } from './home.js';
import wordmark from '../../../assets/reccut-wordmark.svg';

const Runtime = createContext({ commands: [] });
const headingId = (i) => `heading-${i}`;
const blocksOf = (text) => text.trim().split(/\n\s*\n/);
const menuPath = (c) => [c.menu === 'App' ? 'Reccut' : c.menu, c.submenu].filter(Boolean).join(' › ');

function Highlight({ text, query }) {
  const terms = queryTerms(query).filter(Boolean);
  if (!terms.length) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return String(text).split(new RegExp(`(${escaped})`, 'ig')).map((part, i) => terms.includes(part.toLowerCase()) ? <mark key={i}>{part}</mark> : part);
}

function Keycap({ id, command }) {
  const { commands } = useContext(Runtime);
  const c = command || commands.find((x) => x.id === id);
  return c?.shortcut ? <kbd class="keycap">{c.shortcut}</kbd> : null;
}

function Inline({ text }) {
  const { run, open, highlight } = useContext(Runtime);
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\{\{key:([\w:.-]+)\}\}|\[\[(run|article):([\w:.-]+)\|(.+?)\]\]/g;
  const result = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    result.push(<Highlight text={text.slice(last, m.index)} query={highlight} />);
    if (m[1]) result.push(<strong><Highlight text={m[1]} query={highlight} /></strong>);
    else if (m[2]) result.push(<code>{m[2]}</code>);
    else if (m[3]) result.push(<Keycap id={m[3]} />);
    else {
      // Capture values now; event handlers must never close over a mutable regex match.
      const [, , , , kind, id, label] = m;
      result.push(<button class={kind === 'run' ? 'help-run' : 'link'} onClick={() => kind === 'run' ? run(id) : open(id)}>{label}{kind === 'run' && <Keycap id={id} />}</button>);
    }
    last = m.index + m[0].length;
  }
  result.push(<Highlight text={text.slice(last)} query={highlight} />);
  return result;
}

function Body({ text, onImage }) {
  return blocksOf(text).map((block, i) => {
    const t = block.trim();
    const image = /^!\[(.*?)\]\(([^)]+)\)$/.exec(t);
    if (image) return <figure key={i}>
      <button class="handbook-image" aria-label={`Enlarge image: ${image[1]}`} onClick={() => onImage({ file: image[2], caption: image[1] })}>
        <img src={`help/${image[2]}`} alt={image[1]} loading="lazy" /><span><ZoomIn size={14} /> Enlarge</span>
      </button><figcaption>{image[1]}</figcaption>
    </figure>;
    if (t.startsWith('### ')) return <h4 key={i}><Inline text={t.slice(4)} /></h4>;
    if (t.startsWith('## ')) return <h3 id={headingId(i)} key={i} tabIndex={-1}><Inline text={t.slice(3)} /></h3>;
    const lines = t.split('\n');
    if (lines.every((l) => /^- /.test(l))) return <ul key={i}>{lines.map((l) => <li><Inline text={l.slice(2)} /></li>)}</ul>;
    if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i}>{lines.map((l) => <li><Inline text={l.replace(/^\d+\. /, '')} /></li>)}</ol>;
    if (t.startsWith('> ')) return <blockquote key={i}><Inline text={t.replace(/^> /gm, '')} /></blockquote>;
    return <p key={i}><Inline text={t.replace(/\n/g, ' ')} /></p>;
  });
}

function CommandReference({ shortcuts = false }) {
  const { commands, open, run } = useContext(Runtime);
  const [filter, setFilter] = useState('');
  const filtered = commands.filter((c) => (!shortcuts || c.shortcut) && `${c.label} ${c.shortcut} ${menuPath(c)}`.toLowerCase().includes(filter.toLowerCase()));
  const menus = [...new Set(filtered.map((c) => c.menu || 'Other'))];
  return <>
    <label class="handbook-filter">Filter {shortcuts ? 'shortcuts' : 'commands'}<input value={filter} onInput={(e) => setFilter(e.currentTarget.value)} placeholder="Name, menu or shortcut" /></label>
    <p class="dim">{filtered.length} commands. Shortcuts include your custom bindings. “Run in Reccut” acts on the current project and selection.</p>
    {menus.map((menu) => <section class="shortcut-group" key={menu}><h3>{menu === 'App' ? 'Reccut' : menu}</h3>
      {filtered.filter((c) => (c.menu || 'Other') === menu).map((c) => <div class="handbook-command" key={c.id}>
        <div><strong>{c.label}</strong><Keycap command={c} /></div>
        <p>{c.desc || `Use ${menuPath(c)} › ${c.label}. Open the guide below for its workflow.`}</p>
        <div class="handbook-command-actions"><button class="link" onClick={() => open(c.help || 'welcome')}>Read guide</button><button class="help-run" onClick={() => run(c.id)}>Run in Reccut</button></div>
      </div>)}
    </section>)}
    {!filtered.length && <p>No matching commands. Clear the filter to see all commands.</p>}
  </>;
}

function Article({ article, onImage }) {
  const { commands, open, run } = useContext(Runtime);
  const headings = blocksOf(article.body).map((b, i) => b.trim().startsWith('## ') ? { text: plainText(b.slice(3)), id: headingId(i) } : null).filter(Boolean);
  const related = commands.filter((c) => c.help === article.id);
  return <article class="help-article">
    <p class="handbook-eyebrow">{article.section}</p><h1>{article.title}</h1>
    <p class="help-summary">{article.summary}</p>
    {headings.length > 1 && <nav class="handbook-contents" aria-label="On this page"><strong>On this page</strong>{headings.map((h) => <a key={h.id} href={`#${h.id}`} onClick={(e) => { e.preventDefault(); const el = document.getElementById(h.id); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); }}>{h.text}</a>)}</nav>}
    <Body text={article.body} onImage={onImage} />
    {['shortcuts', 'command-reference'].includes(article.id) && <CommandReference shortcuts={article.id === 'shortcuts'} />}
    {!!related.length && !['shortcuts', 'command-reference'].includes(article.id) && <section class="help-related"><h3>Commands in Reccut</h3><p>These buttons run in your current project.</p>{related.map((c) => <button key={c.id} class="help-cmd" onClick={() => run(c.id)}><span>{c.label}</span><span class="where">{menuPath(c)}</span><Keycap command={c} /></button>)}</section>}
    {!!article.see?.length && <section class="help-related"><h3>Continue reading</h3>{article.see.map((id) => <button key={id} class="help-hit" onClick={() => open(id)}>{ARTICLES.find((a) => a.id === id)?.title}</button>)}</section>}
  </article>;
}

const titleOf = (id) => ARTICLES.find((a) => a.id === id)?.title || id;

// Forsiden: kort om Reccut og nøkkelfunksjonene, med lenker inn i håndboken.
function Home({ onImage }) {
  const { open } = useContext(Runtime);
  return <div class="handbook-home">
    <header class="handbook-home-hero">
      <img class="handbook-home-logo" src={`data:image/svg+xml,${encodeURIComponent(wordmark)}`} alt="Reccut" />
      <h1>{HOME.tagline}</h1>
      <p class="help-summary">{HOME.intro}</p>
      <button class="handbook-image" aria-label={`Enlarge image: ${HOME.hero.caption}`} onClick={() => onImage({ file: HOME.hero.image, caption: HOME.hero.caption })}>
        <img src={`help/${HOME.hero.image}`} alt={HOME.hero.caption} /><span><ZoomIn size={14} /> Enlarge</span>
      </button>
    </header>
    <h2>Get started</h2>
    <div class="handbook-home-start">{HOME.start.map((s) => <button key={s.article} onClick={() => open(s.article)}><b>{s.title}</b><span>{s.text}</span><ChevronRight size={16} /></button>)}</div>
    <h2>What you can do</h2>
    <div class="handbook-home-features">{HOME.features.map((f) => <section key={f.title} class="handbook-home-card">
      <button class="handbook-home-thumb" onClick={() => open(f.links[0])} aria-label={`Read about ${f.title}`}><img src={`help/${f.image}`} alt="" loading="lazy" /></button>
      <h3>{f.title}</h3><p>{f.text}</p>
      <ul>{f.links.map((id) => <li key={id}><button class="link" onClick={() => open(id)}>{titleOf(id)}</button></li>)}</ul>
    </section>)}</div>
    <h2>Reference</h2>
    <ul class="handbook-home-reference">{HOME.reference.map((id) => <li key={id}><button class="link" onClick={() => open(id)}>{titleOf(id)}</button></li>)}</ul>
  </div>;
}

function ImageDialog({ value, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => previous?.focus?.();
  }, []);
  return <dialog class="handbook-lightbox" ref={ref} onCancel={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <button class="icon-btn" aria-label="Close enlarged image" autoFocus onClick={onClose}><X size={20} /></button>
    <img src={`help/${value.file}`} alt={value.caption} /><p>{value.caption}</p>
  </dialog>;
}

export function Handbook() {
  const [runtime, setRuntime] = useState({ commands: [], platform: '' });
  const [history, setHistory] = useState([{ article: HOME_ID, query: '', section: '' }]);
  const [index, setIndex] = useState(0);
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null), bodyRef = useRef(null);
  const state = history[index];
  const home = state.article === HOME_ID || !ARTICLES.some((a) => a.id === state.article);
  const article = ARTICLES.find((a) => a.id === state.article);
  const navigate = (next) => {
    setHistory((old) => [...old.slice(0, index + 1), next]);
    setIndex(index + 1);
  };
  const open = (id) => { if (id === HOME_ID || ARTICLES.some((a) => a.id === id)) navigate({ article: id, query: '', section: '', match: state.query.trim() }); };
  const update = (patch) => setHistory((old) => old.map((v, i) => i === index ? { ...v, ...patch } : v));
  const navigationRef = useRef(null);
  navigationRef.current = (request = {}) => {
    if (request.article) open(request.article);
    if (request.query !== undefined) navigate({ article: HOME_ID, query: request.query, section: '' });
    if (request.focusSearch) inputRef.current?.focus();
  };
  useEffect(() => {
    const offState = window.handbook.onState(setRuntime);
    const offNavigate = window.handbook.onNavigate((r) => navigationRef.current(r));
    window.handbook.getState().then((s) => { setRuntime(s); navigationRef.current(s.request); }).catch((e) => setError(e.message));
    inputRef.current?.focus();
    return () => { offState(); offNavigate(); };
  }, []);
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
    document.title = `${state.query.trim() ? 'Search' : home ? HOME.title : article.title} — Reccut Help`;
    if (state.query.trim() || !state.match) return;
    const frame = requestAnimationFrame(() => {
      const terms = queryTerms(state.match);
      const headings = [...(bodyRef.current?.querySelectorAll('article h3') || [])].map((el) => ({ el, score: terms.filter((t) => el.textContent.toLowerCase().includes(t)).length })).filter((h) => h.score).sort((a, b) => b.score - a.score);
      (headings[0]?.el || bodyRef.current?.querySelector('article mark'))?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.article, state.query, state.section, state.match]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && ['f', 'k'].includes(e.key.toLowerCase())) { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => Math.min(history.length - 1, i + 1)); }
      if (e.key === 'Escape' && !image && state.query) { e.preventDefault(); update({ query: '' }); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, image, index, history.length]);
  const results = useMemo(() => searchHelp(state.query, ARTICLES, runtime.commands, state.section), [state.query, state.section, runtime.commands]);
  const run = async (id) => { try { await window.handbook.runCommand(id); } catch (e) { setError(e.message); } };
  const searching = !!state.query.trim();
  return <Runtime.Provider value={{ ...runtime, open, run, highlight: state.match || '' }}><div class="handbook">
    <aside class="help-nav">
      <div class="handbook-brand"><BookOpen size={22} /><div><strong>Reccut</strong><span>User handbook · English</span></div></div>
      <label class="help-search"><Search size={16} /><input ref={inputRef} aria-label="Search the handbook" placeholder="Search all help…" value={state.query} onInput={(e) => update({ query: e.currentTarget.value })} />{state.query && <button aria-label="Clear search" onClick={() => { update({ query: '' }); inputRef.current?.focus(); }}><X size={14} /></button>}</label>
      <nav aria-label="Handbook chapters"><div class="help-section"><button class={!searching && home ? 'active handbook-home-link' : 'handbook-home-link'} aria-current={!searching && home ? 'page' : undefined} onClick={() => open(HOME_ID)}><HomeIcon size={14} /> Overview</button></div>{SECTIONS.map((section) => <div class="help-section" key={section}><h2>{section}</h2>{ARTICLES.filter((a) => a.section === section).map((a) => <button key={a.id} class={!searching && article?.id === a.id ? 'active' : ''} aria-current={!searching && article?.id === a.id ? 'page' : undefined} onClick={() => open(a.id)}>{a.title}</button>)}</div>)}</nav>
      <footer>{ARTICLES.length} guides · Available offline</footer>
    </aside>
    <div class="handbook-main">
      <header class="handbook-toolbar"><button class="icon-btn" aria-label="Back" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={17} /></button><button class="icon-btn" aria-label="Forward" disabled={index === history.length - 1} onClick={() => setIndex(index + 1)}><ArrowRight size={17} /></button><button class="link" onClick={() => open(HOME_ID)}>Handbook</button>{(searching || !home) && <span>› {searching ? 'Search' : article.section}</span>}<span class="handbook-search-key">{runtime.platform === 'darwin' ? '⌘F' : 'Ctrl+F'} to search</span></header>
      {error && <div class="handbook-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
      <main class="help-body" ref={bodyRef} tabIndex={-1} id="handbook-content">
        {searching ? <div class="help-results"><h1>Search the handbook</h1><p role="status">{results.articles.length} guides and {results.commands.length} commands for “{state.query}”</p>
          <label class="handbook-filter">Chapter<select aria-label="Filter search by chapter" value={state.section} onChange={(e) => update({ section: e.currentTarget.value })}><option value="">All chapters</option>{SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          {results.articles.map((a) => <button key={a.id} class="help-hit" onClick={() => open(a.id)}><span class="handbook-eyebrow">{a.section}</span><b><Highlight text={a.title} query={state.query} /></b><span><Highlight text={excerpt(a, state.query)} query={state.query} /></span></button>)}
          {!!results.commands.length && <h2>Commands</h2>}{results.commands.map((c) => <div class="handbook-command" key={c.id}><div><strong><Highlight text={c.label} query={state.query} /></strong><Keycap command={c} /></div><p>{c.desc || menuPath(c)}</p><div class="handbook-command-actions"><button class="link" onClick={() => open(c.help || 'command-reference')}>Read guide</button><button class="help-run" onClick={() => run(c.id)}>Run in Reccut</button></div></div>)}
          {!results.articles.length && !results.commands.length && <p>No matches. Try a shorter term such as “camera”, “AI”, “trim” or “export”, or choose All chapters.</p>}
        </div> : home ? <Home onImage={setImage} /> : <Article key={article.id} article={article} onImage={setImage} />}
      </main>
    </div>
    {image && <ImageDialog value={image} onClose={() => setImage(null)} />}
  </div></Runtime.Provider>;
}

if (typeof document !== 'undefined' && window.handbook) render(<Handbook />, document.getElementById('root'));
