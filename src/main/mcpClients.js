// Tool servers (MCP) for the AI agent. The user picks servers from the catalog, or adds their own, in Settings › AI.
// Nothing starts until a server is turned on. Keys are encrypted with the operating system's credential storage and
// passed only to the server they belong to. Tool results are data for the model, never instructions.
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const CATALOG = require('./mcpCatalog.json');

const PROTOCOL = '2025-06-18';
const SERVER_ID = /^[a-z][a-z0-9-]{1,31}$/;
const TOOL_NAME = /^[a-z_][a-z0-9_]{0,63}$/; // What every AI provider accepts, see validateRequest in extensions.js.
const MAX_TOOLS = 60; // External tools sent to the model in all, on top of Reccut's own.
const MEDIA_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const IMPORTABLE = /\.(mp3|wav|ogg|flac|aac|m4a|mp4|webm|mov|png|jpe?g|webp|gif)$/i;

// Common install folders for uv and Node.js. Apps started from the Dock or Start menu often get a short PATH.
function searchPath(env = process.env, home = os.homedir()) {
  const extra =
    process.platform === 'win32'
      ? [path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(env.APPDATA || '', 'npm'), path.join(env.ProgramFiles || 'C:\\Program Files', 'nodejs')]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(home, '.volta', 'bin')];
  return [...new Set([...(env.PATH || env.Path || '').split(path.delimiter), ...extra].filter(Boolean))];
}
function which(command, env = process.env) {
  if (path.isAbsolute(command)) return fs.existsSync(command) ? command : null;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of searchPath(env)) for (const ext of exts) {
    const file = path.join(dir, command + ext);
    try {
      if (fs.statSync(file).isFile()) return file;
    } catch {}
  }
  return null;
}
const REQUIRES = {
  uv: 'This server needs uv (a small Python tool runner). Install it from https://docs.astral.sh/uv/ and turn the server on again.',
  node: 'This server needs Node.js. Install it from https://nodejs.org and turn the server on again.',
};

// Tool names from different servers must not collide with each other or with Reccut's own tools.
function toolName(serverId, tool, taken = new Set()) {
  const base = `mcp_${serverId.replace(/-/g, '_')}_${String(tool).toLowerCase().replace(/[^a-z0-9_]+/g, '_')}`.slice(0, 64);
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 60)}_${i}`;
  return name;
}
// The model gets a plain JSON schema object; anything else becomes an empty object schema.
function cleanSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { type: 'object', properties: {} };
  const s = JSON.parse(JSON.stringify(schema));
  delete s.$schema;
  if (s.type !== 'object') return { type: 'object', properties: {} };
  if (JSON.stringify(s).length > 20000) return { type: 'object', properties: s.properties ? Object.fromEntries(Object.keys(s.properties).map((k) => [k, {}])) : {} };
  return s;
}

function validateCustom(raw) {
  const name = String(raw?.name || '').trim();
  if (!name || name.length > 60) throw new Error('Give the server a short name.');
  const id = 'custom-' + (String(raw.id || '').replace(/^custom-/, '') || crypto.randomBytes(4).toString('hex')).replace(/[^a-z0-9-]/g, '').slice(0, 24);
  if (!SERVER_ID.test(id)) throw new Error('Invalid server id.');
  const purpose = String(raw.purpose || '').trim().slice(0, 300);
  if (raw.transport === 'http') {
    let url;
    try {
      url = new URL(String(raw.url || '').trim());
    } catch {
      throw new Error('Enter the server address, for example https://example.com/mcp.');
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Use an https address. Plain http is allowed only for this computer.');
    if (url.username || url.password) throw new Error('Put the key in the key field, not in the address.');
    return { id, name, purpose, custom: true, transport: 'http', url: url.href, secret: { header: 'Authorization', prefix: 'Bearer ', label: 'Bearer token (optional)' } };
  }
  const command = String(raw.command || '').trim();
  if (!command || command.length > 500 || /[\r\n\0]/.test(command)) throw new Error('Enter the command that starts the server, for example npx.');
  const args = Array.isArray(raw.args) ? raw.args.map(String) : String(raw.args || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [];
  if (args.length > 40 || args.some((a) => a.length > 1000 || /[\r\n\0]/.test(a))) throw new Error('Too many or too long arguments.');
  const secretEnv = String(raw.secretEnv || '').trim();
  if (secretEnv && !/^[A-Z_][A-Z0-9_]{0,63}$/.test(secretEnv)) throw new Error('The key variable must look like MY_API_KEY.');
  return { id, name, purpose, custom: true, transport: 'stdio', command, args, ...(secretEnv ? { secret: { env: secretEnv, label: `${secretEnv} (optional)` } } : {}) };
}

// One JSON-RPC connection over a child process's stdin/stdout, newline delimited.
function stdioTransport(def, { env, cwd, spawnImpl = spawn }) {
  const exe = which(def.command, env);
  if (!exe) throw new Error(REQUIRES[def.requires] || `Could not find ${def.command}. Install it or give the full path.`);
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe);
  const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  const child = shell
    ? spawnImpl(`${quote(exe)} ${def.args.map(quote).join(' ')}`, { env, cwd, shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawnImpl(exe, def.args, { env, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '',
    stderr = '',
    onMessage = () => {},
    onClose = () => {};
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 50e6) return child.kill();
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        onMessage(JSON.parse(line));
      } catch {}
    }
  });
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
  child.on('error', (e) => onClose(e));
  child.on('exit', (code) => onClose(new Error(`The server stopped${code ? ` (exit code ${code})` : ''}.${stderr.trim() ? ` ${stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`)));
  child.stdin.on('error', () => {});
  return {
    send: async (msg) => void child.stdin.write(JSON.stringify(msg) + '\n'),
    set onMessage(fn) {
      onMessage = fn;
    },
    set onClose(fn) {
      onClose = fn;
    },
    close() {
      if (child.exitCode !== null || child.signalCode) return Promise.resolve();
      const exited = new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 3000).unref?.();
      });
      if (shell && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
      else child.kill();
      return exited;
    },
  };
}

// Streamable HTTP: each request is a POST; the answer is JSON or a short event stream.
function httpTransport(def, { secret, fetchImpl }) {
  let session,
    onMessage = () => {};
  const headers = () => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL,
    ...(secret ? { [def.secret.header]: (def.secret.prefix || '') + secret } : {}),
    ...(session ? { 'Mcp-Session-Id': session } : {}),
  });
  return {
    async send(msg) {
      let response;
      try {
        response = await fetchImpl(def.url, { method: 'POST', headers: headers(), body: JSON.stringify(msg), redirect: 'error', signal: AbortSignal.timeout(600000) });
      } catch (e) {
        throw new Error(`Could not reach ${new URL(def.url).host}. Check the internet connection.`);
      }
      session = response.headers.get('mcp-session-id') || session;
      if (response.status === 401 || response.status === 403) throw new Error('The server did not accept the key. Check it in Settings › AI.');
      if (!response.ok && response.status !== 202) throw new Error(`The server answered HTTP ${response.status}.`);
      const text = await response.text();
      if (!text.trim()) return;
      const rows = /^\s*[[{]/.test(text)
        ? [JSON.parse(text)].flat()
        : text.split(/\r?\n/).filter((l) => l.startsWith('data:')).flatMap((l) => {
            try {
              return [JSON.parse(l.slice(5))];
            } catch {
              return [];
            }
          });
      rows.forEach((r) => onMessage(r));
    },
    set onMessage(fn) {
      onMessage = fn;
    },
    set onClose(_fn) {},
    close() {
      if (session) fetchImpl(def.url, { method: 'DELETE', headers: headers() }).catch(() => {});
    },
  };
}

function connect(def, opts) {
  const transport = def.transport === 'http' ? httpTransport(def, opts) : stdioTransport(def, opts);
  const pending = new Map();
  let id = 0,
    closed = null;
  transport.onMessage = (msg) => {
    if (msg.id !== undefined && pending.has(msg.id) && !msg.method) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(String(msg.error.message || 'The server rejected the request.').slice(0, 500))) : p.resolve(msg.result || {});
    } else if (msg.method && msg.id !== undefined) {
      // Reccut offers the server no sampling, roots or other client features.
      transport.send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Not supported by Reccut.' } }).catch(() => {});
    }
  };
  transport.onClose = (e) => {
    closed = e;
    for (const p of pending.values()) p.reject(e);
    pending.clear();
    opts.onClose?.(e);
  };
  const request = (method, params, timeout = 600000) => {
    if (closed) return Promise.reject(closed);
    const n = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error('The tool server did not answer in time.'));
      }, timeout);
      timer.unref?.();
      pending.set(n, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
      transport.send({ jsonrpc: '2.0', id: n, method, params }).catch((e) => pending.get(n)?.reject(e));
    });
  };
  const ready = (async () => {
    const init = await request('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Reccut', version: opts.version || '0' } }, 120000);
    await transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const tools = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const r = await request('tools/list', cursor ? { cursor } : {}, 60000);
      tools.push(...(r.tools || []));
      if (!(cursor = r.nextCursor)) break;
    }
    return { instructions: typeof init.instructions === 'string' ? init.instructions.slice(0, 2000) : '', tools };
  })();
  ready.catch(() => transport.close());
  return { ready, request, close: () => Promise.resolve(transport.close()), get closed() { return closed; } };
}

function createMcpHub({ dir, safeStorage, outputDir, fetchImpl = (...a) => fetch(...a), spawnImpl, version, env = process.env }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'mcp.json');
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { servers: {}, custom: [] };
    }
  };
  const write = (data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  const sessionSecrets = new Map(); // Used when the system has no secure storage.
  const encrypted = () => safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  const connections = new Map(); // id -> { client, def, error }
  const routes = new Map(); // model tool name -> { id, tool }
  const files = new Set(); // Media files and links tool servers returned, which the agent may import.

  const defs = () => [...CATALOG.servers, ...(read().custom || [])];
  const def = (id) => {
    const d = defs().find((s) => s.id === id);
    if (!d) throw new Error('Unknown tool server.');
    return d;
  };
  function secret(id) {
    if (sessionSecrets.has(id)) return sessionSecrets.get(id);
    const s = read().servers?.[id]?.secret;
    return s && encrypted() ? safeStorage.decryptString(Buffer.from(s, 'base64')) : '';
  }
  const outFor = (d) => path.join(outputDir(), d.name.replace(/[\\/:*?"<>|]+/g, '').trim() || d.id);

  function list() {
    const saved = read();
    return {
      encryptedStorage: encrypted(),
      servers: defs().map((d) => {
        const c = connections.get(d.id);
        return {
          id: d.id,
          name: d.name,
          publisher: d.publisher || (d.custom ? 'Added by you' : ''),
          purpose: d.purpose,
          homepage: d.homepage,
          license: d.license,
          costs: d.costs,
          kinds: d.kinds || [],
          custom: Boolean(d.custom),
          transport: d.transport,
          address: d.transport === 'http' ? d.url : [d.command, ...d.args].join(' '),
          requires: d.requires,
          secretLabel: d.secret?.label,
          secretHelpUrl: d.secret?.helpUrl,
          secretRequired: Boolean(d.secret && !d.custom),
          hasSecret: Boolean(sessionSecrets.get(d.id) || saved.servers?.[d.id]?.secret),
          enabled: Boolean(saved.servers?.[d.id]?.enabled),
          status: c?.error ? 'error' : c?.tools ? 'ready' : c ? 'starting' : 'off',
          error: c?.error || '',
          tools: c?.tools?.map((t) => t.name) || [],
        };
      }),
    };
  }
  function stop(id) {
    const done = connections.get(id)?.client?.close();
    connections.delete(id);
    return done || Promise.resolve();
  }
  function save({ id, enabled, secret: key, clearSecret }) {
    const d = def(id),
      data = read();
    const s = { ...(data.servers?.[id] || {}) };
    if (clearSecret) {
      delete s.secret;
      sessionSecrets.delete(id);
    }
    if (typeof key === 'string' && key.trim()) {
      if (key.length > 8192) throw new Error('The key is too long.');
      sessionSecrets.set(id, key.trim());
      if (encrypted()) s.secret = safeStorage.encryptString(key.trim()).toString('base64');
      else delete s.secret;
    }
    if (typeof enabled === 'boolean') {
      if (enabled && d.secret && !d.custom && !s.secret && !sessionSecrets.get(id)) throw new Error(`Paste your ${d.secret.label} first.`);
      s.enabled = enabled;
    }
    write({ ...data, servers: { ...data.servers, [id]: s } });
    stop(id);
    return list();
  }
  function addCustom(raw) {
    const d = validateCustom(raw),
      data = read();
    if (CATALOG.servers.some((s) => s.id === d.id)) throw new Error('Invalid server id.');
    write({ ...data, custom: [...(data.custom || []).filter((c) => c.id !== d.id), d] });
    if (raw.secret) return save({ id: d.id, secret: raw.secret, enabled: true });
    return save({ id: d.id, enabled: true });
  }
  function removeCustom(id) {
    const data = read();
    stop(id);
    sessionSecrets.delete(id);
    const servers = { ...data.servers };
    delete servers[id];
    write({ ...data, servers, custom: (data.custom || []).filter((c) => c.id !== id) });
    return list();
  }
  async function start(id) {
    const existing = connections.get(id);
    if (existing && !existing.error && !existing.client.closed) return existing.client.ready.then(() => existing);
    const d = def(id);
    const key = secret(id);
    if (d.secret && !d.custom && !key) throw new Error(`Paste your ${d.secret.label} in Settings › AI.`);
    const out = outFor(d);
    fs.mkdirSync(out, { recursive: true });
    const childEnv = {
      ...env,
      PATH: searchPath(env).join(path.delimiter),
      ...(d.env || {}),
      ...(d.outputEnv ? { [d.outputEnv]: out } : {}),
      ...(d.secret?.env && key ? { [d.secret.env]: key } : {}),
    };
    const entry = { def: d, out };
    connections.set(id, entry);
    try {
      entry.client = connect(d, { env: childEnv, cwd: out, secret: key, fetchImpl, spawnImpl, version, onClose: (e) => connections.get(id) === entry && (entry.error = e.message) });
      const { tools, instructions } = await entry.client.ready;
      entry.tools = tools.filter((t) => t && typeof t.name === 'string' && t.name.length <= 128);
      entry.instructions = instructions;
      return entry;
    } catch (e) {
      entry.error = e.message;
      throw e;
    }
  }
  async function test(id) {
    stop(id);
    const entry = await start(id);
    return { name: entry.def.name, tools: entry.tools.map((t) => t.name) };
  }
  // The tools of every server that is turned on, named for the model. Servers that fail are reported, not fatal.
  async function tools() {
    const on = defs().filter((d) => read().servers?.[d.id]?.enabled);
    const started = await Promise.all(on.map((d) => Promise.race([start(d.id), new Promise((_, r) => setTimeout(() => r(new Error('The server took too long to start.')), 90000).unref?.())]).then((e) => ({ d, e }), (error) => ({ d, error }))));
    routes.clear();
    const taken = new Set(),
      out = [],
      servers = [];
    for (const { d, e, error } of started) {
      if (error) {
        servers.push({ id: d.id, name: d.name, error: error.message });
        continue;
      }
      servers.push({ id: d.id, name: d.name, purpose: d.purpose, hint: d.agentHint || e.instructions || '', costs: d.costs || '', folder: e.out, tools: e.tools.length });
      for (const t of e.tools) {
        if (out.length >= MAX_TOOLS) break;
        const name = toolName(d.id, t.name, taken);
        if (!TOOL_NAME.test(name)) continue;
        taken.add(name);
        routes.set(name, { id: d.id, tool: t.name });
        out.push({ name, description: `[${d.name}] ${String(t.description || t.title || t.name).slice(0, 1500)}`, parameters: cleanSchema(t.inputSchema) });
      }
    }
    return { tools: out, servers };
  }
  // Media in the result is saved to the server's folder, so the agent can import it.
  function saveBlob(dirPath, mime, base64) {
    const ext = MEDIA_EXT[String(mime).toLowerCase()] || 'bin';
    const target = path.join(dirPath, `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.${ext}`);
    fs.writeFileSync(target, Buffer.from(base64, 'base64'));
    files.add(target);
    return target;
  }
  async function call(name, args) {
    const route = routes.get(name);
    if (!route) throw new Error('This tool server is not connected. Start a new request.');
    const entry = await start(route.id);
    const r = await entry.client.request('tools/call', { name: route.tool, arguments: args && typeof args === 'object' ? args : {} });
    const parts = [];
    let image;
    for (const c of r.content || []) {
      if (c.type === 'text') parts.push(String(c.text));
      else if (c.type === 'image' && /^image\/(png|jpeg)$/.test(c.mimeType) && typeof c.data === 'string') {
        image ||= `data:${c.mimeType};base64,${c.data}`;
        parts.push(`Image saved to ${saveBlob(entry.out, c.mimeType, c.data)}`);
      } else if ((c.type === 'audio' || c.type === 'image') && typeof c.data === 'string') parts.push(`File saved to ${saveBlob(entry.out, c.mimeType, c.data)}`);
      else if (c.type === 'resource' && c.resource?.blob) parts.push(`File saved to ${saveBlob(entry.out, c.resource.mimeType, c.resource.blob)}`);
      else if (c.type === 'resource' && c.resource?.text) parts.push(String(c.resource.text));
      else if (c.type === 'resource_link' && c.uri) parts.push(`Link: ${c.uri}`);
    }
    if (r.structuredContent && !parts.length) parts.push(JSON.stringify(r.structuredContent));
    const text = parts.join('\n').slice(0, 40000);
    // Paths and links in the result, so import_media and import_url accept them.
    for (const m of text.matchAll(/(?:[A-Za-z]:\\|\/)[^\s"'<>|]+?\.\w{2,5}(?=[\s"'<>),]|$)/g)) {
      const p = path.resolve(m[0]);
      if (IMPORTABLE.test(p) && fs.existsSync(p)) files.add(p);
    }
    for (const m of text.matchAll(/https:\/\/[^\s"'<>)\]]+/g)) files.add(m[0]);
    return { content: r.isError ? `The tool reported an error: ${text}` : text || 'Done.', error: Boolean(r.isError), image };
  }
  // Download a link a tool server returned into its folder, so it can be imported.
  async function download(url, { limit = 4e9 } = {}) {
    if (!files.has(url)) throw new Error('Only links that a connected tool server returned in this session can be downloaded.');
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('Only https links can be downloaded.');
    const response = await fetchImpl(u.href, { signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`The download failed with HTTP ${response.status}.`);
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const fromName = (u.pathname.match(/\.(mp3|wav|ogg|flac|aac|m4a|mp4|webm|mov|png|jpe?g|webp|gif)$/i) || [])[1];
    const ext = MEDIA_EXT[type] || fromName?.toLowerCase();
    if (!ext) throw new Error('The link is not an audio, video or image file.');
    if (Number(response.headers.get('content-length')) > limit) throw new Error('The file is too large.');
    const dirPath = path.join(outputDir(), 'Downloads');
    fs.mkdirSync(dirPath, { recursive: true });
    const target = path.join(dirPath, `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.${ext}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > limit) throw new Error('The file is too large.');
      chunks.push(Buffer.from(chunk));
    }
    fs.writeFileSync(target, Buffer.concat(chunks));
    files.add(target);
    return target;
  }
  const allowed = (p) => files.has(p);
  const stopAll = () => Promise.all([...connections.keys()].map(stop));
  return { list, save, addCustom, removeCustom, test, tools, call, download, allowed, stopAll };
}

module.exports = { createMcpHub, toolName, cleanSchema, validateCustom, searchPath, which, CATALOG, PROTOCOL };
