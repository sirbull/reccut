// Pure, offline search shared by the handbook and content checks. No editor state is imported.
export const normalize = (text) => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const aliases = { ai: 'artificial intelligence assistant agent', subtitles: 'captions', subtitle: 'caption', razor: 'blade', proxy: 'optimized', proxies: 'optimized', greenscreen: 'chroma key', preferences: 'settings', hotkeys: 'shortcuts', export: 'render', ki: 'ai agent', ollama: 'local model', 'lmstudio': 'lm studio' };
const stop = new Set(['how', 'do', 'i', 'can', 'a', 'an', 'the', 'to', 'my', 'in', 'is', 'what', 'where', 'of', 'and', 'for', 'with']);
export function queryTerms(query) {
  const all = normalize(query).split(' ').filter(Boolean);
  return all.filter((w) => !stop.has(w)).length ? all.filter((w) => !stop.has(w)) : all;
}
export function plainText(text) {
  return String(text || '').replace(/!\[(.*?)\]\([^)]+\)/g, '$1').replace(/\{\{key:[^}]+\}\}/g, '').replace(/\[\[(?:run|article):[^|]+\|([^\]]+)\]\]/g, '$1').replace(/[*#`]/g, '').replace(/\s+/g, ' ').trim();
}
export function excerpt(article, query, length = 200) {
  const body = plainText(article.body || article.desc || article.summary);
  const terms = queryTerms(query);
  const lower = body.toLowerCase();
  const indices = terms.map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  const start = indices.length ? Math.max(0, Math.min(...indices) - 65) : 0;
  return `${start ? '…' : ''}${body.slice(start, start + length)}${body.length > start + length ? '…' : ''}`;
}
function rank(item, terms, title, rest) {
  const head = normalize(title), body = normalize(rest);
  let matched = 0, score = 0;
  for (const word of terms) {
    const variants = [word, ...(aliases[word] || '').split(' ').filter(Boolean)];
    if (head.includes(word)) { score += 14; matched++; }
    else if (body.includes(word)) { score += 5; matched++; }
    else if (variants.some((v) => head.includes(v) || body.includes(v))) { score += 2; matched++; }
  }
  if (!matched) return null;
  return { item, score: score + (matched === terms.length ? 50 : 0), matched };
}
export function searchHelp(query, articles, commands = [], section = '') {
  const terms = queryTerms(query);
  if (!terms.length) return { articles: [], commands: [] };
  const sorted = (items) => items.filter(Boolean).sort((a, b) => b.score - a.score || a.item.title?.localeCompare(b.item.title || '') || 0).map((x) => x.item);
  return {
    articles: sorted(articles.filter((a) => !section || a.section === section).map((a) => rank(a, terms, a.title, `${a.summary} ${a.keywords || ''} ${plainText(a.body)}`))),
    commands: section ? [] : sorted(commands.filter((c) => !c.hidden && !c.menuOnly).map((c) => rank(c, terms, c.label, `${c.menu || ''} ${c.submenu || ''} ${c.keywords || ''} ${c.desc || ''}`))),
  };
}
