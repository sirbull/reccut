import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createMcpHub, toolName, cleanSchema, validateCustom, CATALOG } = require('../src/main/mcpClients.js');
const { createMcpServer } = require('../src/main/mcpServer.js');

const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`encrypted:${s}`),
  decryptString: (b) => b.toString().slice(10),
};
const tmp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-mcp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('the catalog lists official servers with pinned versions, https addresses and no keys', () => {
  assert.equal(CATALOG.format, 'reccut-mcp-catalog-v1');
  const ids = new Set();
  for (const s of CATALOG.servers) {
    assert.match(s.id, /^[a-z][a-z0-9-]{1,31}$/);
    assert.ok(!ids.has(s.id));
    ids.add(s.id);
    assert.ok(s.purpose.length > 20 && s.name && s.publisher.includes('official'), s.id);
    assert.match(s.homepage, /^https:\/\//);
    assert.ok(Array.isArray(s.kinds) && s.kinds.length);
    if (s.transport === 'http') assert.match(s.url, /^https:\/\//);
    else {
      assert.ok(['uvx', 'npx'].includes(s.command));
      // A fixed version, so an update of the package cannot change what runs without a new Reccut release.
      assert.ok(s.args.some((a) => /(@|==)\d+\.\d+\.\d+$/.test(a)), `${s.id} must pin its package version`);
    }
    if (s.secret) assert.ok(s.secret.env || s.secret.header);
    assert.ok(!JSON.stringify(s.env || {}).match(/KEY|TOKEN|SECRET/i), 'no keys in the catalog');
  }
});

test('tool names are valid for every provider and never collide', () => {
  const taken = new Set();
  const a = toolName('brave-search', 'web.search!', taken);
  assert.equal(a, 'mcp_brave_search_web_search_');
  taken.add(a);
  assert.notEqual(toolName('brave-search', 'web.search!', taken), a);
  const long = toolName('elevenlabs', 'x'.repeat(200));
  assert.ok(long.length <= 64 && /^[a-z_][a-z0-9_]{0,63}$/.test(long));
  assert.deepEqual(cleanSchema(null), { type: 'object', properties: {} });
  assert.deepEqual(cleanSchema({ $schema: 'x', type: 'object', properties: { a: { type: 'string' } } }), { type: 'object', properties: { a: { type: 'string' } } });
});

test('custom servers are validated', () => {
  assert.throws(() => validateCustom({ name: 'X', transport: 'http', url: 'http://example.com/mcp' }), /https/);
  assert.throws(() => validateCustom({ name: 'X', transport: 'http', url: 'https://user:pw@example.com/mcp' }), /key field/);
  assert.equal(validateCustom({ name: 'Local', transport: 'http', url: 'http://localhost:9000/mcp' }).url, 'http://localhost:9000/mcp');
  const s = validateCustom({ name: 'Mine', command: 'npx', args: '-y "my server" --flag', secretEnv: 'MY_KEY' });
  assert.deepEqual(s.args, ['-y', 'my server', '--flag']);
  assert.equal(s.secret.env, 'MY_KEY');
  assert.match(s.id, /^custom-/);
  assert.throws(() => validateCustom({ name: 'X', command: 'npx', secretEnv: 'bad key' }));
  assert.throws(() => validateCustom({ name: '', command: 'npx' }));
});

test('a stdio server starts, lists tools, gets its key and returns files the agent may import', async (t) => {
  const dir = tmp(t),
    out = path.join(dir, 'Generated');
  const hub = createMcpHub({ dir, safeStorage: storage, outputDir: () => out, version: 'test' });
  assert.throws(() => hub.save({ id: 'elevenlabs', enabled: true }), /Paste your/);
  const list = hub.addCustom({ name: 'Fake Sound', purpose: 'Sound effects for tests.', command: process.execPath, args: [path.resolve('test/fixtures/fake-mcp-server.cjs')], secretEnv: 'FAKE_KEY', secret: 'secret-123' });
  const custom = list.servers.find((s) => s.custom);
  assert.ok(custom.enabled && custom.hasSecret);
  assert.ok(!fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8').includes('secret-123'), 'the key is not stored as plain text');

  const { tools, servers } = await hub.tools();
  assert.equal(servers[0].name, 'Fake Sound');
  assert.equal(servers[0].hint, 'Fake sound server.');
  assert.deepEqual(tools.map((x) => x.name), [`mcp_${custom.id.replace(/-/g, '_')}_make_sound`, `mcp_${custom.id.replace(/-/g, '_')}_key_check`]);
  assert.match(tools[0].description, /^\[Fake Sound\] /);
  assert.equal(tools[0].parameters.$schema, undefined);

  assert.equal((await hub.call(tools[1].name, {})).content, 'key ok');
  const r = await hub.call(tools[0].name, { prompt: 'whoosh' });
  assert.match(r.content, /Made "whoosh"/);
  assert.match(r.image, /^data:image\/png;base64,/);
  const saved = [...r.content.matchAll(/saved to (.+)$/gm)].map((m) => m[1].trim());
  assert.equal(saved.length, 2);
  for (const f of saved) {
    assert.ok(f.startsWith(out) && fs.existsSync(f));
    assert.ok(hub.allowed(f));
  }
  assert.ok(hub.allowed('https://cdn.example.com/out.mp3'));
  await assert.rejects(hub.download('https://evil.example.com/x.mp3'), /Only links that a connected tool server returned/);
  await assert.rejects(hub.call('mcp_unknown_tool', {}), /not connected/);
  assert.equal(hub.list().servers.find((s) => s.custom).status, 'ready');
  await hub.stopAll();
});

test('a server that fails to start is reported, not fatal', async (t) => {
  const dir = tmp(t);
  const hub = createMcpHub({ dir, safeStorage: storage, outputDir: () => path.join(dir, 'out') });
  hub.addCustom({ name: 'Missing', command: 'reccut-no-such-command-xyz' });
  const { tools, servers } = await hub.tools();
  assert.equal(tools.length, 0);
  assert.match(servers[0].error, /Could not find/);
  await hub.stopAll();
});

function server(t, bridge) {
  const dir = tmp(t);
  const file = path.join(dir, 'mcp-server.json');
  const s = createMcpServer({ file, bridgePath: path.resolve('src/main/mcp-stdio.cjs'), execPath: process.execPath, version: '1.0.0', bridge });
  t.after(() => s.stop());
  return { s, file };
}
const fakeBridge = {
  instructions: async () => 'Reccut instructions.',
  tools: async () => [{ name: 'get_timeline', description: 'Read the timeline.', parameters: { type: 'object', properties: {} } }],
  call: async (name) => (name === 'preview_frames' ? { content: 'Frame.', image: 'data:image/png;base64,AAAA' } : { content: `ran ${name}` }),
};

test('Reccut as an MCP server is off by default, needs the token and refuses web pages', async (t) => {
  const { s } = server(t, fakeBridge);
  assert.equal((await s.start()).running, false);
  const port = 40000 + Math.floor(Math.random() * 20000);
  const st = await s.configure({ enabled: true, port });
  assert.ok(st.running, st.error);
  const token = st.setup.json.match(/Bearer ([\w-]+)/)[1];
  assert.ok(token.length >= 32);
  assert.ok(!st.setup.claudeDesktop.includes(token), 'the stdio setup reads the token from Reccut');
  const url = `http://127.0.0.1:${port}/mcp`;
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) });

  assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'https://evil.example' })).status, 403);

  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test' } } });
  assert.ok(init.headers.get('mcp-session-id'));
  const r = (await init.json()).result;
  assert.equal(r.protocolVersion, '2025-03-26');
  assert.equal(r.instructions, 'Reccut instructions.');
  assert.equal(r.serverInfo.name, 'reccut');
  assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const tools = (await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()).result.tools;
  assert.deepEqual(tools[0], { name: 'get_timeline', description: 'Read the timeline.', inputSchema: { type: 'object', properties: {} } });
  const call = (await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'preview_frames', arguments: {} } })).json()).result;
  assert.deepEqual(call.content, [{ type: 'text', text: 'Frame.' }, { type: 'image', mimeType: 'image/png', data: 'AAAA' }]);
  assert.equal(call.isError, false);
});

test('the stdio bridge forwards messages to the running app', async (t) => {
  const { s, file } = server(t, fakeBridge);
  const port = 40000 + Math.floor(Math.random() * 20000);
  await s.configure({ enabled: true, port });
  const child = spawn(process.execPath, [path.resolve('src/main/mcp-stdio.cjs'), file], { stdio: ['pipe', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  const lines = [];
  child.stdout.setEncoding('utf8');
  const got = new Promise((resolve) => child.stdout.on('data', (d) => (lines.push(...d.split('\n').filter(Boolean)), lines.length >= 2 && resolve())));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_timeline' } }) + '\n');
  await got;
  const [a, b] = lines.map((l) => JSON.parse(l));
  assert.equal(a.id, 1);
  assert.equal(a.result.instructions, 'Reccut instructions.');
  assert.equal(b.result.content[0].text, 'ran get_timeline');

  await s.configure({ enabled: false });
  const off = spawn(process.execPath, [path.resolve('src/main/mcp-stdio.cjs'), file], { stdio: ['pipe', 'pipe', 'inherit'] });
  t.after(() => off.kill());
  off.stdout.setEncoding('utf8');
  const msg = new Promise((resolve) => off.stdout.once('data', (d) => resolve(JSON.parse(d.split('\n')[0]))));
  off.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) + '\n');
  assert.match((await msg).error.message, /Turn on/);
});
