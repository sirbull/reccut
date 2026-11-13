// Bygger dokumentasjonssiden på nettstedet (docs/docs/index.html) fra håndboken i appen.
// Kjør med `npm run docs` etter at hjelpetekstene i src/renderer/help er endret.
// `--check` feiler hvis siden ikke stemmer med håndboken.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ARTICLES, SECTIONS } from '../src/renderer/help/articles.js';
import { plainText } from '../src/renderer/help/search.js';
import { HOME, HOME_ID, homeImages } from '../src/renderer/help/home.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/docs');
const check = process.argv.includes('--check');

// Kommandolisten og standard hurtigtaster hentes fra appens register, for macOS og Windows.
const bundle = (await build({
  stdin: { contents: "export { COMMANDS, defaultKeys, formatAccel } from './src/renderer/registry.js';", resolveDir: root },
  bundle: true, write: false, format: 'cjs', platform: 'browser', logLevel: 'silent',
  plugins: [{ name: 'services', setup(b) {
    b.onResolve({ filter: /\/editor\/commands\.js$|\/editor\/playback\.js$|\/editor\/fullscreen\.js$|\/design\/export\.js$|\/player\.js$|\/ui\.jsx$/ }, ({ path: p }) => ({ path: p, external: true }));
  } }],
})).outputFiles[0].text;
function commandsFor(platform) {
  const module = { exports: {} };
  const services = new Proxy({ toast() {}, fileUrl: (p) => p }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  vm.runInNewContext(bundle, {
    module, exports: module.exports, require: () => services, structuredClone,
    window: { api: { platform, onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [], hideFromCapture() {} }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, performance: { now: () => 0 },
  });
  const { COMMANDS, defaultKeys, formatAccel } = module.exports;
  return new Map(COMMANDS.map((c) => [c.id, { ...c, shortcut: formatAccel(defaultKeys(c)[0]) }]));
}
const mac = commandsFor('darwin'), win = commandsFor('win32');
const commands = [...win.values()].filter((c) => !c.hidden).map((c) => ({
  id: c.id, label: c.label, menu: c.menu === 'App' ? 'Reccut' : c.menu || 'Other', submenu: c.submenu, desc: c.desc, help: c.help,
  mac: mac.get(c.id)?.shortcut || '', win: c.shortcut || '', macLabel: mac.get(c.id)?.label || c.label,
}));
const commandById = new Map(commands.map((c) => [c.id, c]));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const articleIds = new Set(ARTICLES.map((a) => a.id));
const keycap = (c) => (c && (c.mac || c.win) ? `<kbd data-mac="${esc(c.mac || c.win)}" data-win="${esc(c.win || c.mac)}">${esc(c.win || c.mac)}</kbd>` : '');
const label = (c) => (c.macLabel !== c.label ? `<span data-mac="${esc(c.macLabel)}" data-win="${esc(c.label)}">${esc(c.label)}</span>` : esc(c.label));
const images = new Set();

function inline(text) {
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\{\{key:([\w:.-]+)\}\}|\[\[(run|article):([\w:.-]+)\|(.+?)\]\]/g;
  let html = '', last = 0;
  for (const m of text.matchAll(re)) {
    html += esc(text.slice(last, m.index));
    if (m[1]) html += `<strong>${inline(m[1])}</strong>`;
    else if (m[2]) html += `<code>${esc(m[2])}</code>`;
    else if (m[3]) html += keycap(commandById.get(m[3]));
    else if (m[4] === 'article') {
      if (!articleIds.has(m[5])) throw new Error(`Unknown article link: ${m[5]}`);
      html += `<a href="#${esc(m[5])}">${esc(m[6])}</a>`;
    } else html += `<strong>${esc(m[6])}</strong>${keycap(commandById.get(m[5])) ? ` ${keycap(commandById.get(m[5]))}` : ''}`;
    last = m.index + m[0].length;
  }
  return html + esc(text.slice(last));
}

const slug = (s) => plainText(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
function body(article) {
  const toc = [];
  const html = article.body.trim().split(/\n\s*\n/).map((block) => {
    const t = block.trim();
    const image = /^!\[(.*?)\]\(([^)]+)\)$/.exec(t);
    if (image) {
      images.add(image[2]);
      return `<figure><a href="help/${esc(image[2])}" data-zoom><img src="help/${esc(image[2])}" alt="${esc(image[1])}" loading="lazy"></a><figcaption>${inline(image[1])}</figcaption></figure>`;
    }
    if (t.startsWith('### ')) return `<h4>${inline(t.slice(4))}</h4>`;
    if (t.startsWith('## ')) {
      const id = `${article.id}--${slug(t.slice(3))}`;
      toc.push({ id, text: plainText(t.slice(3)) });
      return `<h3 id="${esc(id)}">${inline(t.slice(3))}</h3>`;
    }
    const lines = t.split('\n');
    if (lines.every((l) => /^- /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\d+\. /.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    if (t.startsWith('> ')) return `<blockquote>${inline(t.replace(/^> /gm, ''))}</blockquote>`;
    return `<p>${inline(t.replace(/\n/g, ' '))}</p>`;
  }).join('\n');
  return { html, toc };
}

function commandReference(shortcutsOnly) {
  const list = commands.filter((c) => !shortcutsOnly || c.mac || c.win);
  const menus = [...new Set(list.map((c) => c.menu))];
  return `<p class="dim">${list.length} commands with their default shortcuts. You can change shortcuts in Settings › Keyboard.</p>` + menus.map((menu) => `<section class="cmd-group"><h3 id="${shortcutsOnly ? 'shortcuts' : 'commands'}--${slug(menu)}">${esc(menu)}</h3><dl>${
    list.filter((c) => c.menu === menu).map((c) => `<div class="cmd"><dt>${label(c)}${keycap(c) ? ` ${keycap(c)}` : ''}</dt>${!shortcutsOnly && c.desc ? `<dd>${esc(c.desc)}${c.help && articleIds.has(c.help) ? ` <a href="#${esc(c.help)}">Read guide</a>` : ''}</dd>` : ''}</div>`).join('')
  }</dl></section>`).join('');
}

const titleOf = (id) => ARTICLES.find((a) => a.id === id)?.title;
const rendered = ARTICLES.map((a) => {
  const { html, toc } = body(a);
  const reference = ['shortcuts', 'command-reference'].includes(a.id) ? commandReference(a.id === 'shortcuts') : '';
  const related = commands.filter((c) => c.help === a.id && !reference);
  return `<article id="${esc(a.id)}" data-section="${esc(a.section)}">
<p class="eyebrow">${esc(a.section)}</p><h1>${esc(a.title)}</h1><p class="summary">${esc(a.summary)}</p>
${toc.length > 1 ? `<nav class="toc" aria-label="On this page"><strong>On this page</strong>${toc.map((h) => `<a href="#${esc(h.id)}">${esc(h.text)}</a>`).join('')}</nav>` : ''}
${html}
${reference}
${related.length ? `<section class="related"><h3>Commands in Reccut</h3><ul>${related.map((c) => `<li>${label(c)} <span class="where">${esc([c.menu, c.submenu].filter(Boolean).join(' › '))}</span> ${keycap(c)}</li>`).join('')}</ul></section>` : ''}
${a.see?.length ? `<section class="related"><h3>Continue reading</h3><ul>${a.see.map((id) => `<li><a href="#${esc(id)}">${esc(titleOf(id))}</a></li>`).join('')}</ul></section>` : ''}
</article>`;
}).join('\n');

// Forsiden, fra src/renderer/help/home.js, som i hjelpevinduet.
const linkTo = (id) => {
  if (!articleIds.has(id)) throw new Error(`Unknown article link on the home page: ${id}`);
  return `<a href="#${esc(id)}">${esc(titleOf(id))}</a>`;
};
for (const file of homeImages()) images.add(file);
const homePage = `<article id="${HOME_ID}" class="home">
<img class="home-logo" src="../media/reccut-wordmark.svg" alt="Reccut" width="188" height="56">
<h1>${esc(HOME.tagline)}</h1><p class="summary">${esc(HOME.intro)}</p>
<figure class="home-hero"><a href="help/${esc(HOME.hero.image)}" data-zoom><img src="help/${esc(HOME.hero.image)}" alt="${esc(HOME.hero.caption)}"></a><figcaption>${esc(HOME.hero.caption)}</figcaption></figure>
<h2 class="home-h">Get started</h2>
<div class="home-start">${HOME.start.map((x) => `<a href="#${esc(x.article)}"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></a>`).join('')}</div>
<h2 class="home-h">What you can do</h2>
<div class="home-features">${HOME.features.map((f) => `<section class="home-card"><a href="#${esc(f.links[0])}" aria-label="Read about ${esc(f.title)}"><img src="help/${esc(f.image)}" alt="" loading="lazy"></a><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p><ul>${f.links.map((id) => `<li>${linkTo(id)}</li>`).join('')}</ul></section>`).join('')}</div>
<h2 class="home-h">Reference</h2>
<ul class="home-reference">${HOME.reference.map((id) => `<li>${linkTo(id)}</li>`).join('')}</ul>
</article>`;

const index = ARTICLES.map((a) => ({ id: a.id, s: a.section, t: a.title, m: a.summary, k: a.keywords || '', b: plainText(a.body) }));
const nav = SECTIONS.map((s) => `<div class="sec"><h2>${esc(s)}</h2>${ARTICLES.filter((a) => a.section === s).map((a) => `<a href="#${esc(a.id)}" data-id="${esc(a.id)}">${esc(a.title)}</a>`).join('')}</div>`).join('');

const page = `<!doctype html>
<!-- Generert fra håndboken i appen (src/renderer/help) med npm run docs. Ikke rediger for hånd. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reccut Docs</title>
<meta name="description" content="The Reccut user handbook: recording, editing, audio, color, AI Agent, export and design. The same guides that ship with the app.">
<link rel="icon" type="image/png" href="../media/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
:root { --bg:#0b0c0e; --bg2:#111215; --card:#16171b; --line:#24262c; --text:#f2f2f4; --body:#c5c5ca; --muted:#9a9ca5; --accent:#0a84ff; --link:#8abfff; }
* { box-sizing:border-box; }
html { scroll-padding-top:84px; }
body { margin:0; background:var(--bg); color:var(--body); font:400 16px/1.75 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing:antialiased; }
a { color:var(--link); }
img { display:block; max-width:100%; height:auto; }
.topbar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:24px; height:64px; padding:0 24px; backdrop-filter:blur(14px) saturate(1.4); background:color-mix(in srgb, var(--bg) 80%, transparent); border-bottom:1px solid var(--line); }
.topbar .brand img { height:28px; width:auto; }
.topbar .links { display:flex; gap:22px; margin-left:auto; font-size:15px; }
.topbar .links a { color:var(--muted); text-decoration:none; }
.topbar .links a:hover, .topbar .links a[aria-current] { color:var(--text); }
.menu-btn { display:none; margin-left:auto; background:var(--card); color:var(--text); border:1px solid var(--line); border-radius:999px; padding:6px 14px; font:inherit; font-size:14px; }
.layout { display:grid; grid-template-columns:290px minmax(0,1fr); max-width:1280px; margin:0 auto; }
aside { position:sticky; top:64px; height:calc(100vh - 64px); overflow-y:auto; padding:20px 16px 40px; border-right:1px solid var(--line); }
.search { display:block; position:sticky; top:0; background:var(--bg); padding-bottom:8px; }
.search input { width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--text); font:inherit; font-size:14px; }
.sec h2 { margin:22px 8px 6px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.sec a { display:block; padding:5px 8px; border-radius:7px; color:var(--body); text-decoration:none; font-size:14px; line-height:1.45; }
.sec a:hover { background:var(--card); color:var(--text); }
.sec a[aria-current] { background:#0a84ff22; color:var(--text); }
aside footer { margin:24px 8px 0; font-size:12px; color:var(--muted); }
main { padding:40px clamp(16px,5vw,72px) 100px; min-width:0; }
article, #results { max-width:820px; margin:0 auto; overflow-wrap:anywhere; }
.js article:not(.shown) { display:none; }
.js #results:not(.shown) { display:none; }
article + article { border-top:1px solid var(--line); margin-top:64px; padding-top:48px; }
.js article + article { border:0; margin:0; padding:0; }
.eyebrow { color:var(--link); font-size:11px; text-transform:uppercase; letter-spacing:.09em; margin:0 0 4px; }
h1 { color:var(--text); font-size:clamp(28px,4vw,36px); line-height:1.2; letter-spacing:-.025em; margin:0 0 14px; }
h3 { color:var(--text); font-size:20px; line-height:1.35; margin:36px 0 12px; }
h4 { color:var(--text); font-size:16px; margin:24px 0 8px; }
strong { color:var(--text); }
.summary { font-size:18px; line-height:1.6; color:#bcbcc3; margin-bottom:26px; }
.toc { display:flex; flex-direction:column; gap:4px; border:1px solid var(--line); background:var(--bg2); border-radius:12px; padding:16px 20px; margin:24px 0; font-size:14px; }
.toc a { text-decoration:none; } .toc a:hover { text-decoration:underline; }
li { margin:6px 0; }
code { background:var(--card); padding:2px 5px; border-radius:4px; font-size:.9em; }
kbd { display:inline-block; font:500 12px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color:var(--text); background:var(--card); border:1px solid #34363e; border-bottom-width:2px; border-radius:5px; padding:1px 6px; white-space:nowrap; }
blockquote { margin:20px 0; border-left:3px solid #559eee; padding:12px 18px; background:#0a84ff10; border-radius:0 8px 8px 0; }
figure { margin:28px 0; }
figure img { border-radius:10px; border:1px solid var(--line); }
figcaption { font-size:13px; color:var(--muted); margin-top:8px; }
.related { margin-top:44px; border-top:1px solid var(--line); padding-top:8px; }
.related ul { list-style:none; padding:0; }
.where, .dim { color:var(--muted); font-size:13px; }
.cmd-group dl { margin:0; }
.cmd { padding:10px 0; border-bottom:1px solid var(--line); }
.cmd dt { color:var(--text); font-weight:500; }
.cmd dd { margin:2px 0 0; font-size:14px; }
.sec a.overview { margin-top:14px; font-weight:600; }
.home { max-width:980px; }
.home-logo { height:56px; width:auto; margin:8px 0 28px; }
.home h1 { font-size:clamp(30px,4.6vw,44px); max-width:760px; }
.home .summary { max-width:780px; }
.home-hero { margin:32px 0 8px; }
.home-hero img { width:100%; box-shadow:0 30px 80px -30px #000; }
.home-h { margin:48px 0 16px; font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.home-start { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
.home-start a { display:block; padding:14px 16px; border:1px solid var(--line); border-radius:12px; background:var(--bg2); text-decoration:none; color:var(--body); }
.home-start a:hover, .home-card:hover { border-color:#3a3d45; }
.home-start b { display:block; color:var(--text); font-size:15px; }
.home-start span { display:block; font-size:13px; line-height:1.5; color:var(--muted); margin-top:2px; }
.home-features { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:18px; }
.home-card { border:1px solid var(--line); border-radius:14px; background:var(--bg2); overflow:hidden; padding-bottom:14px; }
.home-card img { width:100%; aspect-ratio:16/9; object-fit:cover; object-position:top left; border-bottom:1px solid var(--line); }
.home-card h3 { margin:16px 18px 4px; font-size:18px; }
.home-card p { margin:0 18px 8px; font-size:14px; line-height:1.6; }
.home-card ul, .home-reference { list-style:none; padding:0; margin:0 18px; font-size:14px; }
.home-card li { margin:3px 0; }
.home-reference { display:flex; flex-wrap:wrap; gap:8px 26px; margin:0; }
.hit { display:block; padding:16px; margin:12px 0; border:1px solid var(--line); border-radius:12px; text-decoration:none; color:var(--body); }
.hit:hover { border-color:#3a3d45; background:var(--bg2); }
.hit b { display:block; color:var(--text); font-size:17px; margin:2px 0 4px; }
.hit span { font-size:14px; }
mark { color:#fce29a; background:#f7c94820; border-radius:2px; }
dialog { padding:0; border:0; background:transparent; max-width:96vw; }
dialog::backdrop { background:rgba(0,0,0,.85); }
dialog img { max-width:96vw; max-height:94vh; border-radius:10px; cursor:zoom-out; }
@media (max-width:900px) {
  .layout { display:block; }
  .menu-btn { display:inline-block; }
  .topbar .links { display:none; }
  aside { display:none; position:fixed; inset:64px 0 0; z-index:15; height:auto; background:var(--bg); border:0; }
  body.nav-open aside { display:block; }
  body.nav-open { overflow:hidden; }
}
</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="../"><img src="../media/reccut-wordmark.svg" alt="Reccut" width="94" height="28"></a>
  <div class="links"><a href="../">Home</a><a href="./" aria-current="page">Docs</a><a href="https://github.com/sirbull/reccut/releases">Download</a><a href="https://github.com/sirbull/reccut">GitHub</a></div>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="sidebar">Contents</button>
</header>
<div class="layout">
<aside id="sidebar">
  <label class="search"><input type="search" placeholder="Search the docs…" aria-label="Search the docs"></label>
  <nav aria-label="Handbook chapters"><div class="sec"><a class="overview" href="#${HOME_ID}" data-id="${HOME_ID}">Overview</a></div>${nav}</nav>
  <footer>${ARTICLES.length} guides. The same handbook is built into Reccut under Help.</footer>
</aside>
<main>
<div id="results" aria-live="polite"></div>
${homePage}
${rendered}
</main>
</div>
<dialog id="zoom"><img alt=""></dialog>
<script>
const INDEX = ${JSON.stringify(index).replace(/</g, '\\u003c')};
const doc = document.documentElement; doc.classList.add('js');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
if (isMac) document.querySelectorAll('[data-mac]').forEach((el) => { el.textContent = el.dataset.mac; });
const input = document.querySelector('.search input'), results = document.getElementById('results');
const norm = (s) => String(s || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
const STOP = new Set(['how','do','i','can','a','an','the','to','my','in','is','what','where','of','and','for','with']);
const terms = (q) => { const all = norm(q).split(' ').filter(Boolean); const k = all.filter((w) => !STOP.has(w)); return k.length ? k : all; };
const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const mark = (s, ts) => { let h = escHtml(s); if (!ts.length) return h; const re = new RegExp('(' + ts.map((t) => t.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')).join('|') + ')', 'ig'); return h.replace(re, '<mark>$1</mark>'); };
function search(q) {
  const ts = terms(q);
  const hits = INDEX.map((a) => {
    const head = norm(a.t), rest = norm(a.m + ' ' + a.k + ' ' + a.b);
    let score = 0, matched = 0;
    for (const w of ts) { if (head.includes(w)) { score += 14; matched++; } else if (rest.includes(w)) { score += 5; matched++; } }
    return matched ? { a, score: score + (matched === ts.length ? 50 : 0) } : null;
  }).filter(Boolean).sort((x, y) => y.score - x.score);
  results.innerHTML = '<p class="eyebrow">Search</p><h1>Results for “' + escHtml(q) + '”</h1><p class="dim">' + hits.length + ' guides</p>' +
    hits.map(({ a }) => { const lower = a.b.toLowerCase(); const i = Math.min(...ts.map((t) => lower.indexOf(t)).filter((n) => n >= 0).concat([0])); const start = Math.max(0, i - 60);
      return '<a class="hit" href="#' + a.id + '"><span class="eyebrow">' + escHtml(a.s) + '</span><b>' + mark(a.t, ts) + '</b><span>' + (start ? '…' : '') + mark(a.b.slice(start, start + 200), ts) + '…</span></a>'; }).join('') +
    (hits.length ? '' : '<p>No matches. Try a shorter word such as “camera”, “trim” or “export”.</p>');
}
function show() {
  const q = input.value.trim();
  document.querySelectorAll('article.shown, #results.shown').forEach((el) => el.classList.remove('shown'));
  if (q) { search(q); results.classList.add('shown'); return; }
  const hash = decodeURIComponent(location.hash.slice(1));
  const target = hash && document.getElementById(hash);
  const article = target ? target.closest('article') : null;
  const el = article || document.getElementById('${HOME_ID}');
  el.classList.add('shown');
  document.querySelectorAll('.sec a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.id === el.id));
  document.title = el.id === '${HOME_ID}' ? 'Reccut Docs' : el.querySelector('h1').textContent + ' · Reccut Docs';
  if (target && target !== article) target.scrollIntoView();
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { input.value = ''; document.body.classList.remove('nav-open'); show(); });
input.addEventListener('input', show);
document.querySelector('.menu-btn').addEventListener('click', (e) => { const open = document.body.classList.toggle('nav-open'); e.currentTarget.setAttribute('aria-expanded', open); });
const zoom = document.getElementById('zoom');
document.addEventListener('click', (e) => { const a = e.target.closest('[data-zoom]'); if (!a) return; e.preventDefault(); zoom.querySelector('img').src = a.href; zoom.querySelector('img').alt = a.querySelector('img').alt; zoom.showModal(); });
zoom.addEventListener('click', () => zoom.close());
show();
</script>
</body>
</html>
`;

const target = path.join(out, 'index.html');
const stale = [];
if (!check || !fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== page) stale.push('docs/docs/index.html');
for (const file of images) {
  const from = path.join(root, 'assets/help', file), to = path.join(out, 'help', file);
  if (!fs.existsSync(from)) throw new Error(`Missing handbook image ${file}`);
  if (!fs.existsSync(to) || !fs.readFileSync(to).equals(fs.readFileSync(from))) stale.push(`docs/docs/help/${file}`);
  if (!check) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
}
const extra = fs.existsSync(path.join(out, 'help')) ? fs.readdirSync(path.join(out, 'help')).filter((f) => !images.has(f)) : [];
if (check) {
  stale.push(...extra.map((f) => `docs/docs/help/${f}`));
  if (stale.length) { console.error(`The docs site is out of date. Run npm run docs.\n${stale.join('\n')}`); process.exit(1); }
  console.log('The docs site matches the handbook.');
} else {
  for (const f of extra) fs.rmSync(path.join(out, 'help', f));
  fs.writeFileSync(target, page);
  console.log(`Wrote docs/docs/index.html with ${ARTICLES.length} guides, ${commands.length} commands and ${images.size} images.`);
}
