// Reccut as an MCP server, so AI apps such as Claude Desktop, Claude Code, Cursor or VS Code can edit with the same
// tools and instructions as the built-in agent. Off by default. Listens only on this computer, needs a secret token,
// and refuses requests from web pages (Origin), so a website cannot reach it.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PORT = 47615;
const MAX_BODY = 10e6;

function readSettings(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { enabled: Boolean(s.enabled), port: Number.isInteger(s.port) && s.port > 1023 && s.port < 65536 ? s.port : DEFAULT_PORT, token: typeof s.token === 'string' && s.token.length >= 32 ? s.token : '' };
  } catch {
    return { enabled: false, port: DEFAULT_PORT, token: '' };
  }
}
const sameToken = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// bridge: { tools(): [{name, description, parameters}], instructions(): string, call(name, args): {content, image?, error?} }
function createMcpServer({ file, bridgePath, execPath, version, bridge, log = () => {} }) {
  let server = null,
    listening = null,
    lastError = '';
  const sessions = new Set();
  const settings = () => readSettings(file);
  function write(s) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
  }
  function status() {
    const s = settings();
    const url = `http://127.0.0.1:${s.port}/mcp`;
    const stdio = { command: execPath, args: [bridgePath, file], env: { ELECTRON_RUN_AS_NODE: '1' } };
    return {
      enabled: s.enabled,
      running: Boolean(listening),
      port: s.port,
      url,
      error: lastError,
      // Ready-made settings for the common apps. The token is only in the HTTP variants.
      setup: s.token
        ? {
            claudeDesktop: JSON.stringify({ mcpServers: { reccut: stdio } }, null, 2),
            claudeCode: `claude mcp add --transport http reccut ${url} --header "Authorization: Bearer ${s.token}"`,
            json: JSON.stringify({ mcpServers: { reccut: { url, headers: { Authorization: `Bearer ${s.token}` } } } }, null, 2),
            vscode: JSON.stringify({ servers: { reccut: { type: 'http', url, headers: { Authorization: `Bearer ${s.token}` } } } }, null, 2),
          }
        : null,
    };
  }
  const reply = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  async function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request.');
    const { id, method, params = {} } = msg;
    if (id === undefined) return null; // Notifications need no answer.
    try {
      if (method === 'initialize') {
        const asked = params.protocolVersion;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'reccut', title: 'Reccut', version },
            instructions: await bridge.instructions(),
          },
        };
      }
      if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
      if (method === 'tools/list') {
        const tools = await bridge.tools();
        return { jsonrpc: '2.0', id, result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })) } };
      }
      if (method === 'tools/call') {
        if (typeof params.name !== 'string') return rpcError(id, -32602, 'Missing tool name.');
        let r;
        try {
          r = await bridge.call(params.name, params.arguments && typeof params.arguments === 'object' ? params.arguments : {});
        } catch (e) {
          r = { content: `Error: ${e.message}`, error: true };
        }
        const content = [{ type: 'text', text: String(r.content ?? '') }];
        const m = typeof r.image === 'string' && r.image.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
        if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
        return { jsonrpc: '2.0', id, result: { content, isError: Boolean(r.error) } };
      }
      return rpcError(id, -32601, `Reccut does not support ${method}.`);
    } catch (e) {
      return rpcError(id, -32603, e.message || 'Reccut could not answer.');
    }
  }
  function onRequest(req, res) {
    const s = settings();
    const host = String(req.headers.host || '');
    // DNS rebinding and browser protection: only this computer's address, never a web page.
    if (![`127.0.0.1:${s.port}`, `localhost:${s.port}`].includes(host)) return reply(res, 403, rpcError(null, -32000, 'Forbidden host.'));
    if (req.headers.origin && !/^(null|https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/.test(req.headers.origin)) return reply(res, 403, rpcError(null, -32000, 'Requests from web pages are not allowed.'));
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!s.token || !sameToken(auth, s.token)) return reply(res, 401, rpcError(null, -32001, 'Missing or wrong token. Copy the setup again from Reccut › Settings › AI.'), { 'WWW-Authenticate': 'Bearer' });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/mcp') return reply(res, 404, rpcError(null, -32000, 'Not found. Use /mcp.'));
    if (req.method === 'DELETE') {
      sessions.delete(req.headers['mcp-session-id']);
      return reply(res, 200);
    }
    if (req.method !== 'POST') return reply(res, 405, rpcError(null, -32000, 'Use POST.'), { Allow: 'POST, DELETE' });
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reply(res, 400, rpcError(null, -32700, 'Invalid JSON.'));
      }
      const list = Array.isArray(body) ? body : [body];
      const answers = (await Promise.all(list.map(handle))).filter(Boolean);
      const headers = {};
      if (list.some((m) => m?.method === 'initialize')) {
        const sid = crypto.randomUUID();
        sessions.add(sid);
        headers['Mcp-Session-Id'] = sid;
      }
      if (!answers.length) return reply(res, 202, undefined, headers);
      reply(res, 200, Array.isArray(body) ? answers : answers[0], headers);
    });
  }
  function stop() {
    sessions.clear();
    if (!server) return Promise.resolve();
    const s = server;
    server = listening = null;
    const closed = new Promise((r) => s.close(() => r()));
    s.closeAllConnections?.();
    return closed;
  }
  async function start() {
    await stop();
    const s = settings();
    if (!s.enabled) return status();
    server = http.createServer(onRequest);
    server.requestTimeout = 0; // A long tool call, such as a voice-over, may take minutes.
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(s.port, '127.0.0.1', resolve);
      });
      listening = s.port;
      lastError = '';
    } catch (e) {
      server = null;
      lastError = e.code === 'EADDRINUSE' ? `Port ${s.port} is in use by another program. Choose another port.` : e.message;
      log(e);
    }
    return status();
  }
  async function configure({ enabled, port, newToken } = {}) {
    const s = settings();
    const next = { ...s };
    if (typeof enabled === 'boolean') next.enabled = enabled;
    if (port !== undefined) {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port from 1024 to 65535.');
      next.port = port;
    }
    if (newToken || !next.token) next.token = crypto.randomBytes(32).toString('base64url');
    write(next);
    return start();
  }
  return { start, stop, status, configure, handle };
}

module.exports = { createMcpServer, readSettings, DEFAULT_PORT };
