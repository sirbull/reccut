// Optional local processors and BYOK chat. Credentials never enter project files or localStorage.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const zlib = require('zlib');
const TERMS = require('../shared/pluginTerms.json');

function validatePlugin(raw) {
  if (raw?.format !== 'reccut-processor-v1' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(raw.id || ''))
    throw new Error('Not a Reccut processor manifest.');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 120)
    throw new Error('A processor needs a name.');
  if (!path.isAbsolute(raw.executable || '') || !fs.statSync(raw.executable).isFile())
    throw new Error('Choose an existing executable using its absolute path.');
  if (
    !Array.isArray(raw.args) ||
    raw.args.length > 100 ||
    raw.args.some((v) => typeof v !== 'string' || v.length > 8192 || v.includes('\0'))
  )
    throw new Error('Processor args must be an array of strings.');
  if (!raw.args.some((v) => v.includes('{input}')) || !raw.args.some((v) => v.includes('{output}')))
    throw new Error('Processor args must include {input} and {output}.');
  if (!['.mov', '.webm', '.mp4', '.mkv'].includes(raw.outputExtension))
    throw new Error('Output must be .mov, .webm, .mp4 or .mkv. Use an alpha-capable format for keying.');
  const params = validateParams(raw.params);
  for (const a of raw.args)
    for (const [, id] of a.matchAll(/\{param:([\w-]+)\}/g))
      if (!params.some((p) => p.id === id)) throw new Error(`Argument uses {param:${id}}, which is not defined in params.`);
  return {
    format: raw.format,
    id: raw.id,
    name: raw.name.trim(),
    executable: raw.executable,
    args: raw.args,
    outputExtension: raw.outputExtension,
    ...(typeof raw.description === 'string' && raw.description.trim() ? { description: raw.description.trim().slice(0, 1000) } : {}),
    ...(raw.icon != null ? { icon: validateIcon(raw.icon) } : {}),
    ...(params.length ? { params } : {}),
    ...(raw.kind === 'ffmpeg' || raw.kind === 'python' ? { kind: raw.kind } : {}),
    version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1,
    ...(typeof raw.author === 'string' && raw.author.trim() ? { author: raw.author.trim().slice(0, 120) } : {}),
  };
}
// The icon is shown with <img>, where SVG cannot run scripts; it is still kept small and plain.
function validateIcon(svg) {
  if (typeof svg !== 'string' || svg.length > 20000 || !/^\s*<svg[\s>]/i.test(svg) || /<script|<foreignObject|\son\w+\s*=|javascript:|<image|href\s*=\s*["'](?!#)/i.test(svg))
    throw new Error('The icon must be a small, plain SVG without scripts, links or images.');
  return svg.trim();
}
// Settings shown as controls in the plugin's window. {param:id} in args becomes the chosen value.
function validateParams(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 12) throw new Error('A processor can have up to 12 params.');
  return list.map((p) => {
    if (!/^[a-z][\w-]{0,30}$/i.test(p?.id || '') || typeof p.label !== 'string' || !p.label.trim()) throw new Error('Each param needs an id and a label.');
    const base = { id: p.id, label: p.label.trim().slice(0, 60), ...(typeof p.hint === 'string' ? { hint: p.hint.slice(0, 200) } : {}) };
    if (p.type === 'number') {
      const [min, max] = [Number(p.min), Number(p.max)];
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(`Param ${p.id} needs a min below max.`);
      const def = Number.isFinite(p.default) ? Math.min(max, Math.max(min, p.default)) : min;
      return { ...base, type: 'number', min, max, step: Number(p.step) > 0 ? Number(p.step) : (max - min) / 100, default: def, ...(typeof p.unit === 'string' ? { unit: p.unit.slice(0, 10) } : {}) };
    }
    if (p.type === 'choice') {
      const options = Array.isArray(p.options) ? p.options.filter((o) => typeof o?.value === 'string' && /^[\w.:=,+#-]{1,60}$/.test(o.value)).slice(0, 30) : [];
      if (!options.length) throw new Error(`Param ${p.id} needs options with simple values.`);
      return { ...base, type: 'choice', options: options.map((o) => ({ value: o.value, label: String(o.label || o.value).slice(0, 60) })), default: options.some((o) => o.value === p.default) ? p.default : options[0].value };
    }
    if (p.type === 'boolean') return { ...base, type: 'boolean', default: Boolean(p.default), on: String(p.on ?? '1').slice(0, 60), off: String(p.off ?? '0').slice(0, 60) };
    throw new Error(`Param ${p.id} must be a number, choice or boolean.`);
  });
}
// The value of each param for one run, checked against its definition (never free text, so no option injection).
function paramValues(plugin, given = {}) {
  const out = {};
  for (const p of plugin.params || []) {
    const v = Object.hasOwn(given, p.id) ? given[p.id] : p.default;
    if (p.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < p.min || v > p.max) throw new Error(`${p.label} must be between ${p.min} and ${p.max}.`);
      out[p.id] = String(Math.round(v * 1e6) / 1e6);
    } else if (p.type === 'choice') {
      if (!p.options.some((o) => o.value === v)) throw new Error(`Choose a value for ${p.label}.`);
      out[p.id] = v;
    } else out[p.id] = v ? p.on : p.off;
  }
  return out;
}
// Local servers (Ollama, LM Studio, llama.cpp) may use plain HTTP on this machine or the local network.
const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)$/i;
const isLocal = (endpoint) => LOCAL_HOST.test(new URL(endpoint).hostname);
function validateAI(raw) {
  const provider = raw.provider === 'anthropic' ? 'anthropic' : 'compatible';
  const url = new URL(raw.endpoint);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOST.test(url.hostname)))
  )
    throw new Error('Use HTTPS, or HTTP for a local model server on this computer or your local network.');
  const model = String(raw.model || '').trim();
  if (!model || model.length > 200) throw new Error('Enter a model ID from your provider.');
  return { provider, endpoint: url.href.replace(/\/$/, ''), model, vision: raw.vision !== false };
}
const TOOL_NAME = /^[a-z_][a-z0-9_]{0,63}$/;
const IMAGE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/;
function validateRequest({ system, messages, tools }) {
  if (typeof system !== 'string' || system.length > 100000) throw new Error('Invalid system prompt.');
  if (!Array.isArray(tools) || tools.length > 64 || tools.some((t) => !TOOL_NAME.test(t?.name) || typeof t.description !== 'string' || typeof t.parameters !== 'object'))
    throw new Error('Invalid tool list.');
  const ok = (m) =>
    (m.role === 'user' && typeof m.content === 'string' && (!m.images || (Array.isArray(m.images) && m.images.length <= 4 && m.images.every((i) => IMAGE.test(i))))) ||
    (m.role === 'assistant' && typeof m.content === 'string' && (!m.toolCalls || Array.isArray(m.toolCalls))) ||
    (m.role === 'tool' && typeof m.id === 'string' && typeof m.content === 'string' && (!m.image || IMAGE.test(m.image)));
  if (!Array.isArray(messages) || !messages.length || messages.length > 400 || !messages.every(ok) || messages[0].role !== 'user')
    throw new Error('Invalid chat history.');
  if (JSON.stringify(messages).length > 20e6) throw new Error('The conversation is too long. Start a new chat.');
}
// Provider-neutral history: user {content}, assistant {content, toolCalls:[{id,name,args}]}, tool {id, name, content, image?}.
function toAnthropic({ system, messages, tools }, model) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const content = [{ type: 'text', text: m.content || '(empty)' }];
      const img = m.image && IMAGE.exec(m.image);
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: `image/${img[1]}`, data: img[2] } });
      const block = { type: 'tool_result', tool_use_id: m.id, content };
      const last = out[out.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant') {
      const content = [
        ...(m.content.trim() ? [{ type: 'text', text: m.content }] : []),
        ...(m.toolCalls || []).map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} })),
      ];
      out.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '…' }] });
    } else
      out.push({
        role: 'user',
        content: m.images?.length
          ? [
              ...m.images.map((url) => {
                const [, type, data] = IMAGE.exec(url);
                return { type: 'image', source: { type: 'base64', media_type: `image/${type}`, data } };
              }),
              { type: 'text', text: m.content },
            ]
          : m.content,
      });
  }
  return {
    model,
    max_tokens: 8192,
    system,
    messages: out,
    ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
  };
}
function toCompatible({ system, messages, tools }, model, endpoint) {
  const out = [{ role: 'system', content: system }];
  let images = [];
  // Chat Completions accepts images only in user messages, after the tool results they belong to.
  const flush = () => {
    if (images.length)
      out.push({ role: 'user', content: [{ type: 'text', text: 'Preview images returned by the tools above.' }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] });
    images = [];
  };
  for (const m of messages) {
    if (m.role !== 'tool') flush();
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.id, content: m.content || '(empty)' });
      if (m.image) images.push(m.image);
    } else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) }
          : {}),
      });
    else
      out.push({
        role: 'user',
        content: m.images?.length ? [{ type: 'text', text: m.content }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))] : m.content,
      });
  }
  flush();
  return {
    model,
    messages: out,
    ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })) } : {}),
    ...(new URL(endpoint).hostname === 'api.openai.com' ? { max_completion_tokens: 8192 } : { max_tokens: 8192 }),
  };
}
function fromAnthropic(data) {
  const blocks = Array.isArray(data.content) ? data.content : [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
  };
}
function fromCompatible(data) {
  const msg = data.choices?.[0]?.message || {};
  return {
    text: typeof msg.content === 'string' ? msg.content : '',
    toolCalls: (msg.tool_calls || []).map((c, i) => {
      let args = null; // null tells the agent the model sent invalid JSON.
      try {
        args = typeof c.function?.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : (c.function?.arguments ?? {});
      } catch {}
      return { id: c.id || `call_${i}`, name: c.function?.name || '', args };
    }),
  };
}

// Scripts and storyboards attached in the AI chat, as plain text. PDF is not read: ask for text, Word or Fountain.
// The files in a zip (Word documents and Typeloom projects are zips), read on demand.
function zipEntries(buf, what = 'file') {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error(`The ${what} is damaged or not a zip file.`);
  const entries = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0 && buf.readUInt32LE(p) === 0x02014b50; n--) {
    const method = buf.readUInt16LE(p + 10),
      size = buf.readUInt32LE(p + 20),
      nameLen = buf.readUInt16LE(p + 28),
      local = buf.readUInt32LE(p + 42);
    entries.set(buf.toString('utf8', p + 46, p + 46 + nameLen), () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}
// Typeloom (.typeloom): binder.json gives the order, documents/<id>.json the TipTap content.
// Written out like Fountain, so scene headings, character cues and dialogue keep their meaning.
function readTypeloom(buf) {
  const zip = zipEntries(buf, 'Typeloom project');
  const json = (name) => {
    const read = zip.get(name);
    try {
      return read ? JSON.parse(read()) : null;
    } catch {
      return null;
    }
  };
  const nodes = (json('binder.json') || []).filter((n) => n && !n.trashedAt && n.type !== 'file');
  if (!nodes.length) throw new Error('The Typeloom project has no documents.');
  const inline = (n) => (n.type === 'text' ? n.text || '' : n.type === 'hardBreak' ? '\n' : (n.content || []).map(inline).join(''));
  const out = [];
  const block = (n) => {
    const t = inline(n).trim();
    switch (n.type) {
      case 'screenplaySceneHeading':
        return out.push('', t.toUpperCase(), '');
      case 'screenplayCharacter':
        return out.push('', t.toUpperCase());
      case 'screenplayParenthetical':
        return out.push(t.startsWith('(') ? t : `(${t})`);
      case 'screenplayDialogue':
        return out.push(t);
      case 'screenplayTransition':
        return out.push('', `> ${t.toUpperCase()}`, '');
      case 'heading':
        return out.push('', `# ${t}`, '');
      case 'paragraph':
      case 'screenplayAction':
        return out.push('', t);
      default:
        return (n.content || []).forEach(block);
    }
  };
  const walk = (parentId, depth) => {
    for (const n of nodes.filter((x) => (x.parentId ?? null) === parentId).sort((a, b) => a.order - b.order)) {
      out.push('', `${'#'.repeat(Math.min(6, depth))} ${n.title || 'Untitled'}`);
      const doc = n.type === 'document' && json(`documents/${n.id}.json`);
      if (doc?.synopsis) out.push(`= ${String(doc.synopsis).replace(/\s+/g, ' ')}`);
      if (doc?.contentJson) block(doc.contentJson);
      walk(n.id, depth + 1);
    }
  };
  walk(null, 1);
  const name = json('manifest.json')?.project?.name;
  return `${name ? `Title: ${name}\n` : ''}${out.join('\n')}`;
}
// PDF text with its layout: lines from the text positions, blank lines where the gap is large, so
// screenplay PDFs keep character cues and dialogue blocks apart. Scanned PDFs have no text.
async function readPdf(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 600); n++) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      const rows = [];
      for (const it of items) {
        if (!it.str?.trim()) continue;
        const [, , , d, x, y] = it.transform;
        const h = Math.abs(d) || it.height || 10;
        let row = rows.find((r) => Math.abs(r.y - y) <= h * 0.4);
        if (!row) rows.push((row = { y, h, parts: [] }));
        row.parts.push({ x, w: it.width || 0, str: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      const lines = [];
      let prev = null;
      for (const r of rows) {
        let text = '',
          end = -Infinity;
        for (const part of r.parts.sort((a, b) => a.x - b.x)) {
          text += (text && part.x - end > r.h * 0.15 && !/\s$/.test(text) ? ' ' : '') + part.str;
          end = part.x + part.w;
        }
        if (prev && prev.y - r.y > r.h * 1.8) lines.push('');
        lines.push(text.replace(/\s+/g, ' ').trim());
        prev = r;
      }
      pages.push(lines.join('\n'));
    }
  } finally {
    await task.destroy();
  }
  const text = pages.join('\n\n');
  if (!text.trim()) throw new Error('This PDF has no text, it may be scanned. Export the script as text, Word or Typeloom instead.');
  return text;
}
const xmlText = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function readDocument(file) {
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  if (buf.length > 60e6) throw new Error('The document is too large.');
  let text;
  if (ext === '.docx') {
    const xml = zipEntries(buf, 'Word document').get('word/document.xml');
    if (!xml) throw new Error('The Word document has no text.');
    text = [...xml().matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => xmlText(m[0].replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n'))).join('\n');
  } else if (ext === '.typeloom') text = readTypeloom(buf);
  else if (ext === '.pdf') text = await readPdf(buf);
  else if (ext === '.fdx')
    text = [...buf.toString('utf8').matchAll(/<Paragraph[^>]*Type="([^"]*)"[^>]*>([\s\S]*?)<\/Paragraph>/g)].map(([, type, body]) => {
      const t = xmlText(body).trim();
      return type === 'Character' ? `\n${t.toUpperCase()}` : type === 'Scene Heading' ? `\n${t.toUpperCase()}\n` : type === 'Dialogue' || type === 'Parenthetical' ? t : `\n${t}`;
    }).join('\n');
  else if (ext === '.rtf')
    text = buf.toString('latin1').replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
  else if (['.txt', '.md', '.fountain', '.srt', '.vtt', '.csv', '.json', '.html', '.htm', ''].includes(ext)) text = buf.toString('utf8');
  else throw new Error('Attach a PDF, Typeloom, Word, Final Draft, Fountain, RTF or text document.');
  if (ext === '.html' || ext === '.htm') text = xmlText(text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n'));
  return { name: path.basename(file), text: text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300000) };
}
// Python for scripts the agent writes. GUI apps on macOS get a short PATH, so also look where installers put it.
function findPython() {
  const win = process.platform === 'win32';
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...(win ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'])];
  for (const d of dirs)
    for (const n of win ? ['python.exe', 'py.exe'] : ['python3'])
      if (d && fs.existsSync(path.join(d, n))) return path.join(d, n);
  return null;
}
function createExtensionHost({ dir, safeStorage, fetchImpl = (...args) => fetch(...args), ffmpegPath = null, findInterpreter = findPython }) {
  fs.mkdirSync(dir, { recursive: true });
  const read = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      return fallback;
    }
  };
  const write = (file, data) => fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2), { mode: 0o600 });
  let sessionKey = '';
  const encrypted = () =>
    safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  function key(config) {
    if (sessionKey) return sessionKey;
    if (config.secret && encrypted()) return safeStorage.decryptString(Buffer.from(config.secret, 'base64'));
    return '';
  }
  function aiConfig() {
    const c = read('ai.json', {});
    return {
      provider: c.provider || 'compatible',
      endpoint: c.endpoint || 'https://api.openai.com/v1',
      model: c.model || '',
      vision: c.vision !== false,
      hasKey: Boolean(sessionKey || c.secret),
      encryptedStorage: encrypted(),
    };
  }
  function saveAI(raw) {
    const c = validateAI(raw),
      old = read('ai.json', {});
    const same = c.endpoint === old.endpoint && c.provider === old.provider;
    let secret = same ? old.secret : undefined;
    if (!same) sessionKey = '';
    if (raw.clearKey) {
      sessionKey = '';
      secret = undefined;
    }
    if (!raw.clearKey && typeof raw.apiKey === 'string' && raw.apiKey.trim()) {
      if (raw.apiKey.length > 8192) throw new Error('API key is too long.');
      sessionKey = raw.apiKey.trim();
      secret = encrypted() ? safeStorage.encryptString(sessionKey).toString('base64') : undefined;
    }
    write('ai.json', { ...c, ...(secret ? { secret } : {}) });
    return aiConfig();
  }
  function connection(config = read('ai.json', {}), apiKey = key(config)) {
    const c = validateAI(config);
    if (!apiKey && !isLocal(c.endpoint)) throw new Error('Paste your API key first. Cloud providers need a key; local model servers do not.');
    const anthropic = c.provider === 'anthropic';
    const headers = {
      'Content-Type': 'application/json',
      ...(anthropic
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : apiKey
          ? { Authorization: `Bearer ${apiKey}` }
          : {}),
    };
    // Never forward a credential through a redirect to another host.
    const call = async (route, init = {}) => {
      const response = await fetchImpl(`${c.endpoint}${route}`, { headers, redirect: 'error', ...init });
      if (!response.ok)
        throw new Error(`AI request failed (${response.status}). Check the endpoint, model, API key and provider limits.`);
      return response.json();
    };
    return { c, anthropic, call };
  }
  async function complete(request) {
    validateRequest(request);
    const { c, anthropic, call } = connection();
    const body = anthropic ? toAnthropic(request, c.model) : toCompatible(request, c.model, c.endpoint);
    const data = await call(anthropic ? '/messages' : '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });
    const result = anthropic ? fromAnthropic(data) : fromCompatible(data);
    if (!result.text.trim() && !result.toolCalls.length)
      throw new Error('The model returned nothing. Try another model or a shorter request.');
    return { text: result.text.slice(0, 100000), toolCalls: result.toolCalls.slice(0, 32) };
  }
  // Model IDs offered by the server, so local users don't have to guess the exact name.
  async function listModels(raw = {}) {
    const saved = read('ai.json', {}),
      config = { ...saved, ...raw, model: 'list' };
    const same = config.endpoint === saved.endpoint && config.provider === saved.provider;
    const typed = typeof raw.apiKey === 'string' && raw.apiKey.trim().slice(0, 8192);
    const { call } = connection(config, typed || (same ? key(saved) : ''));
    const data = await call('/models', { signal: AbortSignal.timeout(15000) });
    return [...new Set((data.data || data.models || []).map((m) => m.id || m.name).filter((id) => typeof id === 'string'))].sort().slice(0, 500);
  }
  // The agent may write a processor, but only the user installs it, after reviewing the script and command.
  // The agent may write a plugin, but only the user installs it, after reviewing the script and command.
  // Changing a plugin keeps its id, so it is updated in place instead of added again.
  const drafts = new Map();
  function draftProcessor(raw) {
    const kind = raw?.kind === 'python' ? 'python' : 'ffmpeg';
    const name = String(raw?.name || '').trim().slice(0, 80);
    if (!name) throw new Error('A plugin needs a name.');
    const installed = listPlugins();
    let base = null;
    if (raw.replaceId != null) {
      base = installed.find((p) => p.id === raw.replaceId) || drafts.get(raw.replaceId);
      if (!base) throw new Error('replaceId must be a plugin you made earlier. Its id is in the earlier result.');
    } else base = installed.find((p) => p.id.startsWith('ai-') && p.name.toLowerCase() === name.toLowerCase()) || null;
    const id = base?.id || `ai-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plugin'}-${randomUUID().slice(0, 6)}`;
    const current = installed.find((p) => p.id === id);
    let executable = ffmpegPath,
      args = Array.isArray(raw.args) ? raw.args : [],
      script = '';
    if (kind === 'python') {
      executable = findInterpreter();
      if (!executable) throw new Error('Python 3 was not found. Install it from python.org, then ask again.');
      script = String(raw.script || '');
      if (!script.trim() || script.length > 200000) throw new Error('Give the Python script, up to 200 kB.');
      // A new file per version: the installed version keeps working until the user installs this one.
      const folder = path.join(dir, 'scripts', id);
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, `${randomUUID().slice(0, 8)}.py`);
      fs.writeFileSync(file, script, { mode: 0o600 });
      args = [file, ...args];
    }
    const manifest = validatePlugin({ format: 'reccut-processor-v1', id, name, kind, executable, args, outputExtension: raw.outputExtension, description: raw.description, icon: raw.icon, params: raw.params, version: current ? (current.version || 1) + 1 : 1, author: current?.author });
    drafts.set(id, manifest);
    return { manifest, kind, script, description: String(raw.description || '').slice(0, 2000), ...(current ? { updates: current.version || 1 } : {}) };
  }
  const accepted = (o) => {
    if (o?.accepted !== true) throw new Error('Accept the plugin terms first.');
  };
  const scriptFolder = (id) => path.join(dir, 'scripts', id);
  // Remove script versions no installed plugin uses any more.
  function tidyScripts(id) {
    const keep = new Set((listPlugins().find((p) => p.id === id)?.args || []).map((a) => path.resolve(a)));
    const folder = scriptFolder(id);
    if (!fs.existsSync(folder)) return;
    for (const f of fs.readdirSync(folder)) if (!keep.has(path.resolve(folder, f))) fs.rmSync(path.join(folder, f), { force: true });
  }
  // A .reccut-plugin file: everything needed to install the plugin on another computer, without paths.
  function exportPlugin(id, opts = {}) {
    accepted(opts);
    const p = validatePlugin(listPlugins().find((x) => x.id === id));
    if (!p.kind) throw new Error('Only plugins made with FFmpeg or Python can be shared. This one runs a program on your computer.');
    const script = p.kind === 'python' ? fs.readFileSync(p.args[0], 'utf8') : undefined;
    const author = typeof opts.author === 'string' && opts.author.trim() ? opts.author.trim().slice(0, 120) : p.author;
    return {
      format: 'reccut-plugin-v1',
      id: p.id,
      name: p.name,
      version: p.version || 1,
      ...(author ? { author } : {}),
      ...(p.description ? { description: p.description } : {}),
      ...(p.icon ? { icon: p.icon } : {}),
      kind: p.kind,
      args: p.kind === 'python' ? p.args.slice(1) : p.args,
      ...(p.params ? { params: p.params } : {}),
      outputExtension: p.outputExtension,
      ...(script != null ? { script } : {}),
      terms: { version: TERMS.version, acceptedAt: new Date().toISOString(), ...(author ? { by: author } : {}) },
    };
  }
  // Reads a plugin file and prepares it for review. Nothing is installed or written yet.
  function readPluginFile(file) {
    if (fs.statSync(file).size > 1e6) throw new Error('The plugin file is too large.');
    try {
      return checkPackage(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      throw err instanceof SyntaxError ? new Error('This is not a Reccut plugin file.') : err;
    }
  }
  function checkPackage(pkg) {
    if (pkg?.format !== 'reccut-plugin-v1' || !['ffmpeg', 'python'].includes(pkg.kind) || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(pkg.id || '')) throw new Error('This is not a Reccut plugin file.');
    if (pkg.kind === 'python' && (typeof pkg.script !== 'string' || !pkg.script.trim() || pkg.script.length > 200000)) throw new Error('The plugin file has no script.');
    const executable = pkg.kind === 'python' ? findInterpreter() : ffmpegPath;
    if (!executable) throw new Error('This plugin needs Python 3. Install it from python.org, then open the plugin file again.');
    // {script} marks where the script goes; it gets its real path when the user installs.
    const manifest = validatePlugin({ ...pkg, format: 'reccut-processor-v1', executable, args: pkg.kind === 'python' ? ['{script}', ...(pkg.args || [])] : pkg.args });
    const current = listPlugins().find((p) => p.id === pkg.id);
    return { pkg, manifest, script: pkg.script || '', ...(current ? { updates: current.version || 1 } : {}) };
  }
  function installPackage(pkg, opts = {}) {
    accepted(opts);
    const { manifest } = checkPackage(pkg);
    if (manifest.kind === 'python') {
      fs.mkdirSync(scriptFolder(manifest.id), { recursive: true });
      const file = path.join(scriptFolder(manifest.id), `${randomUUID().slice(0, 8)}.py`);
      fs.writeFileSync(file, pkg.script, { mode: 0o600 });
      manifest.args = [file, ...manifest.args.slice(1)];
    }
    return installPlugin(manifest, opts);
  }

  // Higgsfield video generation. Credentials are stored like the AI key; requests run in the main process.
  const HF = 'https://api.higgsfield.ai';
  let hfSession = '';
  function genConfig() {
    const c = read('generation.json', {});
    return {
      textModel: c.textModel || 'kling-video/v3.0/std/text-to-video',
      imageModel: c.imageModel || 'kling-video/v3.0/std/image-to-video',
      confirm: c.confirm !== false,
      hasKey: Boolean(hfSession || c.secret),
      encryptedStorage: encrypted(),
    };
  }
  function saveGen(raw) {
    const old = read('generation.json', {});
    const model = (v, fallback) => {
      const m = String(v || fallback).trim();
      if (!/^[a-z0-9][a-z0-9._/-]{2,120}$/i.test(m) || m.includes('..')) throw new Error('Use a Higgsfield endpoint ID such as kling-video/v3.0/std/text-to-video.');
      return m;
    };
    let secret = old.secret;
    if (raw.clearKey) {
      hfSession = '';
      secret = undefined;
    } else if (raw.keyId || raw.keySecret) {
      if (!/^[\w-]{4,200}$/.test(raw.keyId || '') || !/^[\w-]{4,400}$/.test(raw.keySecret || '')) throw new Error('Paste both the key ID and the secret from Higgsfield Console.');
      hfSession = `${raw.keyId}:${raw.keySecret}`;
      secret = encrypted() ? safeStorage.encryptString(hfSession).toString('base64') : undefined;
    }
    write('generation.json', {
      textModel: model(raw.textModel, old.textModel || 'kling-video/v3.0/std/text-to-video'),
      imageModel: model(raw.imageModel, old.imageModel || 'kling-video/v3.0/std/image-to-video'),
      confirm: raw.confirm !== false,
      ...(secret ? { secret } : {}),
    });
    return genConfig();
  }
  async function hf(url, init = {}) {
    const c = read('generation.json', {});
    const cred = hfSession || (c.secret && encrypted() ? safeStorage.decryptString(Buffer.from(c.secret, 'base64')) : '');
    if (!cred) throw new Error('Set up Higgsfield in Settings → Plugins first.');
    if (!url.startsWith(`${HF}/`)) throw new Error('Unexpected Higgsfield address.');
    const res = await fetchImpl(url, { ...init, redirect: 'error', headers: { Authorization: `Key ${cred}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    if (!res.ok) {
      const hint = { 401: 'check the key', 402: 'add credits', 403: 'this model is not available to your account', 404: 'check the model ID', 422: 'a parameter is not accepted by this model', 429: 'too many requests, try again soon' }[res.status];
      throw new Error(`Higgsfield request failed (${res.status}${hint ? `: ${hint}` : ''}).`);
    }
    return res.status === 202 || res.status === 204 ? {} : res.json();
  }
  function genBody(req) {
    const prompt = String(req.prompt || '').trim();
    if (!prompt || prompt.length > 2500) throw new Error('Describe the video in up to 2500 characters.');
    const extra = req.parameters && typeof req.parameters === 'object' ? req.parameters : {};
    if (JSON.stringify(extra).length > 4000) throw new Error('Too many extra parameters.');
    const duration = Number.isInteger(req.duration) ? Math.max(1, Math.min(20, req.duration)) : undefined;
    const model = req.image ? genConfig().imageModel : genConfig().textModel;
    return { model, body: { ...extra, prompt, ...(duration ? { duration } : {}) } };
  }
  async function estimateVideo(req) {
    const { model, body } = genBody(req);
    if (req.image) body.image_url = 'https://example.com/first-frame.jpg';
    const r = await hf(`${HF}/estimate/${model}`, { method: 'POST', body: JSON.stringify(body) }).catch(() => ({}));
    return { model, usd: r.usd ?? null };
  }
  async function generateVideo(req, ctx, outputDir) {
    const { model, body } = genBody(req);
    if (req.image) {
      const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(req.image);
      if (!m) throw new Error('The start image must be a JPEG or PNG.');
      ctx.progress(0.02, 'Uploading start image');
      const up = await hf(`${HF}/files/generate-upload-url`, { method: 'POST', body: JSON.stringify({ content_type: `image/${m[1]}` }) });
      // The presigned storage URL gets only its own headers, never the Higgsfield credentials.
      const put = await fetchImpl(up.upload_url, { method: 'PUT', headers: up.upload_headers || { 'Content-Type': `image/${m[1]}` }, body: Buffer.from(m[2], 'base64') });
      if (!put.ok) throw new Error(`Uploading the start image failed (${put.status}).`);
      body.image_url = up.public_url;
    }
    ctx.progress(0.05, 'Sending to Higgsfield');
    const sent = await hf(`${HF}/${model}`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
    const id = String(sent.request_id || '');
    if (!/^[\w-]+$/.test(id)) throw new Error('Higgsfield did not accept the request.');
    let canceled = false;
    ctx.setCancel(() => {
      canceled = true;
      hf(`${HF}/requests/${id}/cancel`, { method: 'POST' }).catch(() => {});
    });
    let delay = 2000,
      state = sent;
    for (const started = Date.now(); ; ) {
      if (canceled || ctx.isCanceled()) throw new Error('Canceled');
      if (Date.now() - started > 30 * 60000) throw new Error('Higgsfield took longer than 30 minutes. Check the request in Higgsfield Console.');
      await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
      delay = Math.min(delay * 1.5, 10000);
      state = await hf(`${HF}/requests/${id}/status`).catch((e) => (/\((401|404)/.test(e.message) ? Promise.reject(e) : state));
      ctx.progress(Math.min(0.9, 0.1 + (Date.now() - started) / 300000), state.status === 'in_progress' ? 'Generating video' : 'Waiting in queue');
      if (state.status === 'completed') break;
      if (['failed', 'nsfw', 'canceled'].includes(state.status))
        throw new Error(state.status === 'nsfw' ? 'Higgsfield rejected the prompt or image (content moderation).' : `Generation ${state.status}${state.error ? `: ${String(state.error).slice(0, 300)}` : ''}.`);
    }
    const url = state.video?.url;
    if (!/^https:\/\//.test(url || '')) throw new Error('Higgsfield returned no video.');
    ctx.progress(0.92, 'Downloading video');
    const res = await fetchImpl(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Downloading the video failed (${res.status}).`);
    fs.mkdirSync(outputDir, { recursive: true });
    const file = path.join(outputDir, `Generated ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')} ${randomUUID().slice(0, 4)}.mp4`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return { file, model, requestId: id };
  }
  const listPlugins = () => read('processors.json', []);
  // Installing replaces a plugin with the same id, so a plugin is updated in place, never duplicated.
  function installPlugin(raw, opts = {}) {
    accepted(opts);
    const p = validatePlugin(raw);
    if (p.args.some((a) => a.includes('{script}'))) throw new Error('The plugin script is missing.');
    write('processors.json', [...listPlugins().filter((x) => x.id !== p.id), p]);
    drafts.delete(p.id);
    tidyScripts(p.id);
    return listPlugins();
  }
  function removePlugin(id) {
    write(
      'processors.json',
      listPlugins().filter((x) => x.id !== id),
    );
    if (/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id)) fs.rmSync(scriptFolder(id), { recursive: true, force: true });
    return listPlugins();
  }
  async function processFile({ id, input, outputDir, params }, ctx) {
    const plugin = validatePlugin(listPlugins().find((p) => p.id === id));
    const values = paramValues(plugin, params && typeof params === 'object' ? params : {});
    if (plugin.kind === 'ffmpeg' && ffmpegPath) plugin.executable = ffmpegPath; // The app's own FFmpeg, also after updates.
    if (!path.isAbsolute(input) || !fs.statSync(input).isFile()) throw new Error('Source file is missing.');
    const folder = path.join(outputDir, `processed-${randomUUID()}`);
    fs.mkdirSync(folder, { recursive: true });
    const output = path.join(folder, `result${plugin.outputExtension}`);
    const args = plugin.args.map((a) =>
      a.replace(/\{(input|output|param:([\w-]+))\}/g, (_match, name, param) => (param ? values[param] : name === 'input' ? input : output)),
    );
    try {
      if (ctx.isCanceled()) throw new Error('Canceled');
      ctx.progress(0.05, `Processing with ${plugin.name}`);
      await new Promise((resolve, reject) => {
        const child = spawn(plugin.executable, args, {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let log = '';
        child.stdout.on('data', () => {});
        child.stderr.on('data', (s) => (log = (log + s).slice(-4000)));
        ctx.setCancel(() => child.kill('SIGKILL'));
        child.once('error', reject);
        child.once('close', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(ctx.isCanceled() ? 'Canceled' : `${plugin.name} failed (${code}): ${log}`)),
        );
      });
      if (ctx.isCanceled()) throw new Error('Canceled');
      if (!fs.existsSync(output) || !fs.statSync(output).size)
        throw new Error('Processor did not create an output file.');
      ctx.progress(0.95, 'Importing processed source');
      return { output, plugin: plugin.name };
    } catch (err) {
      await fs.promises.rm(folder, { recursive: true, force: true });
      throw err;
    }
  }
  return { aiConfig, saveAI, complete, listModels, draftProcessor, exportPlugin, readPluginFile, installPackage, genConfig, saveGen, estimateVideo, generateVideo, listPlugins, installPlugin, removePlugin, processFile };
}
module.exports = { createExtensionHost, validatePlugin, validateAI, toAnthropic, toCompatible, fromCompatible, readDocument };
