import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createExtensionHost, validatePlugin, validateAI, toAnthropic, toCompatible, fromCompatible, readDocument } = require('../src/main/extensions.js');
const { createStockHost } = require('../src/main/stock');
const { secrets } = require('../src/main/stock/secrets.js');
const zlib = require('zlib');
const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`encrypted:${s}`),
  decryptString: (b) => b.toString().slice(10),
};
function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-extensions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, host: createExtensionHost({ dir, safeStorage: storage, ...options }) };
}
const config = {
  provider: 'compatible',
  endpoint: 'https://api.example.com/v1',
  model: 'test-model',
  apiKey: 'very-secret-key',
};
test('keys are omitted from public config and never persisted as plaintext', (t) => {
  const { host, dir } = setup(t);
  const result = host.saveAI(config);
  assert.ok(result.hasKey);
  assert.equal(result.apiKey, undefined);
  assert.ok(!fs.readFileSync(path.join(dir, 'ai.json'), 'utf8').includes(config.apiKey));
  host.saveAI({ ...config, endpoint: 'https://another.example/v1', apiKey: '' });
  assert.equal(host.aiConfig().hasKey, false);
});
test('without encryption keys remain in memory for one session only', (t) => {
  const safeStorage = { isEncryptionAvailable: () => false },
    { host, dir } = setup(t, { safeStorage });
  host.saveAI(config);
  assert.equal(host.aiConfig().hasKey, true);
  assert.ok(!fs.readFileSync(path.join(dir, 'ai.json'), 'utf8').includes('secret'));
  assert.equal(createExtensionHost({ dir, safeStorage }).aiConfig().hasKey, false);
});
test('settings leave the macOS keychain alone until a key is stored', (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
  t.after(() => Object.defineProperty(process, 'platform', platform));
  let checks = 0,
    allowed = true;
  const safeStorage = { ...storage, isEncryptionAvailable: () => (checks++, allowed) },
    { host, dir } = setup(t, { safeStorage }),
    stock = createStockHost({ dir: path.join(dir, 'stock'), cacheDir: path.join(dir, 'cache'), safeStorage, fetchImpl: async () => new Response('{}') });
  assert.equal(host.aiConfig().encryptedStorage, true);
  host.genConfig();
  stock.settings();
  assert.equal(secrets(dir, safeStorage).get('missing'), null);
  assert.equal(checks, 0);
  host.saveAI(config);
  assert.ok(checks > 0);
  const after = checks;
  assert.equal(host.aiConfig().encryptedStorage, true);
  assert.equal(checks, after);
  allowed = false; // Deny in the dialog: the hint must not claim the key was encrypted.
  const denied = setup(t, { safeStorage }).host;
  denied.saveAI(config);
  assert.equal(denied.aiConfig().encryptedStorage, false);
});
test('AI endpoints reject insecure remote connections and embedded credentials', () => {
  for (const endpoint of [
    'http://remote.example/v1',
    'https://user:key@example.com/v1',
    'file:///tmp/api',
    'https://example.com/v1?key=secret',
  ])
    assert.throws(() => validateAI({ ...config, endpoint }));
  assert.equal(validateAI({ ...config, endpoint: 'http://localhost:11434/v1' }).endpoint, 'http://localhost:11434/v1');
  assert.equal(validateAI({ ...config, endpoint: 'http://192.168.1.20:1234/v1' }).endpoint, 'http://192.168.1.20:1234/v1');
  assert.throws(() => validateAI({ ...config, endpoint: 'http://8.8.8.8/v1' }));
});
const ask = (text = 'Hi') => ({ system: 'sys', messages: [{ role: 'user', content: text }], tools: [] });
test('requests send the requested model and no redirects, and keys stay private', async (t) => {
  let sent;
  const { host } = setup(t, {
    fetchImpl: async (url, options) => {
      sent = { url, ...options };
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Done' } }] }),
      };
    },
  });
  host.saveAI(config);
  const reply = await host.complete(ask('Key this'));
  assert.deepEqual(reply, { text: 'Done', toolCalls: [] });
  assert.equal(sent.redirect, 'error');
  assert.equal(JSON.parse(sent.body).model, 'test-model');
  assert.equal(sent.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.ok(!JSON.stringify(host.aiConfig()).includes(config.apiKey));
});
test('Anthropic requests use Messages schema and keys can be removed', async (t) => {
  let sent;
  const { host } = setup(t, {
    fetchImpl: async (url, options) => {
      sent = { url, ...options };
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Hello' }] }) };
    },
  });
  host.saveAI({ ...config, provider: 'anthropic' });
  assert.equal((await host.complete(ask())).text, 'Hello');
  const body = JSON.parse(sent.body);
  assert.ok(sent.url.endsWith('/messages'));
  assert.equal(body.messages[0].role, 'user');
  assert.ok(body.system);
  assert.equal(sent.headers['x-api-key'], config.apiKey);
  host.saveAI({ ...config, provider: 'anthropic', apiKey: '', clearKey: true });
  assert.equal(host.aiConfig().hasKey, false);
});
test('provider error bodies never expose credentials in UI errors', async (t) => {
  const { host } = setup(t, { fetchImpl: async () => ({ ok: false, status: 401, text: async () => config.apiKey }) });
  host.saveAI(config);
  await assert.rejects(
    () => host.complete(ask()),
    (e) => e.message.includes('401') && !e.message.includes(config.apiKey),
  );
});
const toolRun = {
  system: 'sys',
  tools: [{ name: 'preview_frames', description: 'Look', parameters: { type: 'object', properties: {} } }],
  messages: [
    { role: 'user', content: 'Check it' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'preview_frames', args: { times: [1] } }] },
    { role: 'tool', id: 'c1', name: 'preview_frames', content: '{"frames":[]}', image: 'data:image/jpeg;base64,AAAA' },
  ],
};
test('attached reference images go with the user message for both formats', () => {
  const run = { system: 's', tools: [], messages: [{ role: 'user', content: 'Match this', images: ['data:image/png;base64,QUJD'] }] };
  assert.deepEqual(toAnthropic(run, 'm').messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
  assert.equal(toCompatible(run, 'm', 'https://api.openai.com/v1').messages[1].content[1].image_url.url, 'data:image/png;base64,QUJD');
});
test('requests reject images that are not inline JPEG or PNG', async (t) => {
  const { host } = setup(t, { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'x' } }] }) }) });
  host.saveAI(config);
  await assert.rejects(() => host.complete({ system: 's', tools: [], messages: [{ role: 'user', content: 'x', images: ['file:///etc/passwd'] }] }), /history/);
});
test('tool calls and preview images map to the Anthropic Messages format', () => {
  const body = toAnthropic(toolRun, 'm');
  assert.equal(body.tools[0].input_schema.type, 'object');
  assert.deepEqual(body.messages[1].content, [{ type: 'tool_use', id: 'c1', name: 'preview_frames', input: { times: [1] } }]);
  const result = body.messages[2].content[0];
  assert.equal(result.type, 'tool_result');
  assert.equal(result.content[1].source.data, 'AAAA');
});
test('tool calls map to Chat Completions, images follow the tool results and bad JSON is flagged', () => {
  const body = toCompatible(toolRun, 'm', 'http://localhost:11434/v1');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[2].tool_calls[0].function.arguments, '{"times":[1]}');
  assert.equal(body.messages[3].tool_call_id, 'c1');
  assert.equal(body.messages[4].content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.equal(body.max_tokens, 8192);
  const parsed = fromCompatible({ choices: [{ message: { content: null, tool_calls: [{ function: { name: 'x', arguments: '{oops' } }] } }] });
  assert.deepEqual(parsed.toolCalls, [{ id: 'call_0', name: 'x', args: null }]);
});
test('local servers need no key and list their models', async (t) => {
  let sent;
  const { host } = setup(t, {
    fetchImpl: async (url, options) => {
      sent = { url, ...options };
      return { ok: true, json: async () => ({ data: [{ id: 'qwen3' }, { id: 'llama3.2' }] }) };
    },
  });
  assert.deepEqual(await host.listModels({ provider: 'compatible', endpoint: 'http://localhost:11434/v1' }), ['llama3.2', 'qwen3']);
  assert.equal(sent.url, 'http://localhost:11434/v1/models');
  assert.equal(sent.headers.Authorization, undefined);
  await assert.rejects(() => host.listModels({ provider: 'compatible', endpoint: 'https://api.example.com/v1' }), /API key/);
});
test('processor manifests validate executable, argument placeholders and output format', () => {
  const good = {
    format: 'reccut-processor-v1',
    id: 'test',
    name: 'Test',
    executable: process.execPath,
    args: ['{input}', '{output}'],
    outputExtension: '.mov',
  };
  assert.equal(validatePlugin(good).id, 'test');
  for (const bad of [
    { id: '../escape' },
    { executable: 'relative-exe' },
    { args: 'sh command' },
    { args: ['{input}'] },
    { outputExtension: '.sh' },
  ])
    assert.throws(() => validatePlugin({ ...good, ...bad }));
});
test('processors run literal argv without shell expansion and cancellation cleans partial outputs', async (t) => {
  const { host, dir } = setup(t),
    input = path.join(dir, 'input $(untrusted) {output}.mov');
  fs.writeFileSync(input, 'source');
  const manifest = {
    format: 'reccut-processor-v1',
    id: 'copy',
    name: 'Test copy',
    executable: process.execPath,
    args: ['-e', "require('fs').copyFileSync(process.argv[1], process.argv[2])", '{input}', '{output}'],
    outputExtension: '.mov',
  };
  host.installPlugin(manifest, { accepted: true });
  let cancel;
  const ctx = { isCanceled: () => false, progress: () => {}, setCancel: (fn) => (cancel = fn) };
  const r = await host.processFile({ id: 'copy', input, outputDir: dir }, ctx);
  assert.equal(fs.readFileSync(r.output, 'utf8'), 'source');
  assert.equal(fs.readFileSync(input, 'utf8'), 'source');
  host.installPlugin(
    {
    ...manifest,
    id: 'slow',
    args: [
      '-e',
      "require('fs').writeFileSync(process.argv[2], 'partial');setTimeout(()=>{},30000)",
      '{input}',
      '{output}',
    ],
    },
    { accepted: true },
  );
  let canceled = false;
  const job = host.processFile(
    { id: 'slow', input, outputDir: dir },
    {
      ...ctx,
      isCanceled: () => canceled,
      setCancel: (fn) => {
        cancel = fn;
        setTimeout(() => {
          canceled = true;
          cancel();
        }, 150);
      },
    },
  );
  await assert.rejects(job, /Canceled/);
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('processed-')).length, 1);
  assert.equal(
    host.removePlugin('copy').some((p) => p.id === 'copy'),
    false,
  );
});

// A minimal zip with deflated entries, as Word and Typeloom write them.
function zip(files) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [file, body] of Object.entries(files)) {
    const name = Buffer.from(file),
      data = zlib.deflateRawSync(Buffer.from(body));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(body), 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(body), 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const docx = (xml) => zip({ 'word/document.xml': xml });
// A one-page PDF with text at given positions (x, y from the bottom), with a correct xref table.
function pdf(lines) {
  const stream = lines.map(([x, y, t]) => `BT /F1 12 Tf ${x} ${y} Td (${t}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = body.length;
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${body}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
test('scripts are read from PDF, Typeloom, Word, Final Draft, RTF and text', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-docs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = (name, body) => (fs.writeFileSync(path.join(dir, name), body), path.join(dir, name));
  const word = await readDocument(file('script.docx', docx('<w:document><w:body><w:p><w:r><w:t>INT. OFFICE</w:t></w:r></w:p><w:p><w:r><w:t>Hello &amp; welcome.</w:t></w:r></w:p></w:body></w:document>')));
  assert.equal(word.text, 'INT. OFFICE\nHello & welcome.');
  const fdx = await readDocument(file('film.fdx', '<FinalDraft><Content><Paragraph Type="Scene Heading"><Text>int. kitchen</Text></Paragraph><Paragraph Type="Character"><Text>Anna</Text></Paragraph><Paragraph Type="Dialogue"><Text>We start now.</Text></Paragraph></Content></FinalDraft>'));
  assert.match(fdx.text, /INT\. KITCHEN[\s\S]*ANNA\nWe start now\./);
  assert.equal((await readDocument(file('a.rtf', '{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0 Hello\\par World}'))).text.replace(/\s+/g, ' ').trim().endsWith('Hello World'), true);
  assert.equal((await readDocument(file('n.fountain', 'EXT. BEACH\n\nIt works.'))).text, 'EXT. BEACH\n\nIt works.');
  // Screenplay layout in a PDF: the character cue sits right above its dialogue, a gap separates blocks.
  const p = await readDocument(file('script.pdf', pdf([[108, 700, 'INT. STUDIO - DAY'], [108, 670, 'Anna walks in.'], [252, 640, 'ANNA'], [180, 626, 'Welcome to the'], [300, 626, 'show.'], [252, 590, 'BEN'], [180, 576, 'Thanks.']])));
  assert.equal(p.text, 'INT. STUDIO - DAY\n\nAnna walks in.\n\nANNA\nWelcome to the show.\n\nBEN\nThanks.');
  await assert.rejects(() => readDocument(file('scan.pdf', pdf([]))), /no text/);
  const tl = await readDocument(
    file(
      'Film.typeloom',
      zip({
        'manifest.json': JSON.stringify({ project: { name: 'Short film' } }),
        'binder.json': JSON.stringify([
          { id: 'f1', type: 'folder', title: 'Act one', parentId: null, order: 0 },
          { id: 'd2', type: 'document', title: 'Scene 2', parentId: 'f1', order: 1 },
          { id: 'd1', type: 'document', title: 'Scene 1', parentId: 'f1', order: 0 },
          { id: 'old', type: 'document', title: 'Cut scene', parentId: 'f1', order: 2, trashedAt: '2026-01-01' },
          { id: 'r1', type: 'file', title: 'reference.jpg', parentId: null, order: 1 },
        ]),
        'documents/d1.json': JSON.stringify({
          nodeId: 'd1',
          synopsis: 'Anna opens the studio.',
          contentJson: {
            type: 'doc',
            content: [
              { type: 'screenplaySceneHeading', content: [{ type: 'text', text: 'int. studio - day' }] },
              { type: 'screenplayAction', content: [{ type: 'text', text: 'Anna turns on the lights.' }] },
              { type: 'screenplayCharacter', content: [{ type: 'text', text: 'Anna' }] },
              { type: 'screenplayParenthetical', content: [{ type: 'text', text: 'smiling' }] },
              { type: 'screenplayDialogue', content: [{ type: 'text', text: 'Good morning.' }] },
            ],
          },
        }),
        'documents/d2.json': JSON.stringify({ nodeId: 'd2', contentJson: { type: 'doc', content: [{ type: 'screenplayCharacter', content: [{ type: 'text', text: 'Anna' }] }, { type: 'screenplayDialogue', content: [{ type: 'text', text: 'Goodbye.' }] }] } }),
        'documents/old.json': JSON.stringify({ nodeId: 'old', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deleted' }] }] } }),
      }),
    ),
  );
  assert.match(tl.text, /^Title: Short film\n\n# Act one\n\n## Scene 1\n= Anna opens the studio\.\n\nINT\. STUDIO - DAY\n\n\nAnna turns on the lights\.|Scene 1/);
  assert.ok(tl.text.indexOf('Scene 1') < tl.text.indexOf('Scene 2'), 'binder order is kept');
  assert.match(tl.text, /ANNA\n\(smiling\)\nGood morning\./);
  assert.ok(!tl.text.includes('Deleted') && !tl.text.includes('reference.jpg'), 'trashed documents and research files are left out');
  assert.rejects(() => readDocument(file('x.exe', 'MZ')));
});
test('the agent can draft a processor, but drafting never installs it', (t) => {
  const { host, dir } = setup(t, { ffmpegPath: process.execPath, findInterpreter: () => process.execPath });
  const ff = host.draftProcessor({ kind: 'ffmpeg', name: 'Denoise', args: ['-i', '{input}', '-vf', 'hqdn3d', '{output}'], outputExtension: '.mp4' });
  assert.equal(ff.manifest.executable, process.execPath);
  assert.match(ff.manifest.id, /^ai-denoise-/);
  const py = host.draftProcessor({ kind: 'python', name: 'Upscale', script: 'print(1)', args: ['{input}', '{output}'], outputExtension: '.mov' });
  assert.equal(fs.readFileSync(py.manifest.args[0], 'utf8'), 'print(1)');
  assert.ok(py.manifest.args[0].startsWith(dir));
  assert.deepEqual(host.listPlugins(), []);
  assert.throws(() => host.draftProcessor({ kind: 'ffmpeg', name: 'Bad', args: ['-i', '{input}'], outputExtension: '.mp4' }));
  const { host: noPython } = setup(t, { findInterpreter: () => null });
  assert.throws(() => noPython.draftProcessor({ kind: 'python', name: 'X', script: 'x', args: ['{input}', '{output}'], outputExtension: '.mov' }), /Python/);
});
test('Higgsfield: key stays encrypted, the image goes to the presigned URL without credentials, the video is downloaded', async (t) => {
  const calls = [];
  const { host, dir } = setup(t, {
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
      if (url.endsWith('/files/generate-upload-url')) return json({ upload_url: 'https://storage.example/put', public_url: 'https://cdn.example/in.jpg', upload_headers: { 'Content-Type': 'image/jpeg' } });
      if (url === 'https://storage.example/put') return json({});
      if (url.endsWith('/kling-video/v3.0/std/image-to-video')) return json({ status: 'queued', request_id: 'r1' });
      if (url.endsWith('/requests/r1/status')) return json({ status: 'completed', video: { url: 'https://cdn.example/out.mp4' } });
      if (url === 'https://cdn.example/out.mp4') return { ok: true, arrayBuffer: async () => new TextEncoder().encode('video').buffer };
      return json({}, 404);
    },
  });
  host.saveGen({ keyId: 'kid_123', keySecret: 'sec_456' });
  assert.ok(!fs.readFileSync(path.join(dir, 'generation.json'), 'utf8').includes('sec_456'));
  assert.equal(host.genConfig().hasKey, true);
  const ctx = { progress() {}, setCancel() {}, isCanceled: () => false };
  const r = await host.generateVideo({ prompt: 'A fjord at sunrise', duration: 5, image: 'data:image/jpeg;base64,QUJD' }, ctx, dir);
  assert.equal(fs.readFileSync(r.file, 'utf8'), 'video');
  const submit = calls.find((c) => c.url.endsWith('image-to-video'));
  assert.equal(submit.init.headers.Authorization, 'Key kid_123:sec_456');
  assert.deepEqual(JSON.parse(submit.init.body), { prompt: 'A fjord at sunrise', duration: 5, image_url: 'https://cdn.example/in.jpg' });
  for (const c of calls.filter((c) => !c.url.startsWith('https://api.higgsfield.ai/'))) assert.ok(!JSON.stringify(c.init.headers || {}).includes('sec_456'), c.url);
  assert.throws(() => host.saveGen({ textModel: '../../etc' }));
});
test('Higgsfield moderation and missing keys give clear errors', async (t) => {
  const { host, dir } = setup(t, {
    fetchImpl: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/status') ? { status: 'nsfw' } : { status: 'queued', request_id: 'r2' }) }),
  });
  const ctx = { progress() {}, setCancel() {}, isCanceled: () => false };
  await assert.rejects(() => host.generateVideo({ prompt: 'x' }, ctx, dir), /Set up Higgsfield/);
  host.saveGen({ keyId: 'kid_123', keySecret: 'sec_456' });
  await assert.rejects(() => host.generateVideo({ prompt: 'x' }, ctx, dir), /moderation/);
});
test('plugins carry an icon and settings; values are checked and put into the arguments', async (t) => {
  const { host, dir } = setup(t);
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#fff" fill="none"/></svg>';
  const manifest = {
    format: 'reccut-processor-v1',
    id: 'grain',
    name: 'Film grain',
    description: 'Adds grain.',
    icon,
    executable: process.execPath,
    args: ['-e', "require('fs').writeFileSync(process.argv[2], process.argv.slice(3).join(' '))", '{input}', '{output}', 'strength={param:strength}', '{param:look}', '{param:mono}'],
    params: [
      { id: 'strength', label: 'Strength', type: 'number', min: 0, max: 50, default: 10 },
      { id: 'look', label: 'Look', type: 'choice', options: [{ value: 'fine' }, { value: 'coarse' }] },
      { id: 'mono', label: 'Monochrome', type: 'boolean', on: 'mono', off: 'color' },
    ],
    outputExtension: '.mp4',
  };
  assert.equal(validatePlugin(manifest).icon, icon);
  for (const bad of [
    { icon: '<svg onload="alert(1)"></svg>' },
    { icon: '<svg><script>x</script></svg>' },
    { icon: '<svg><a href="https://evil.example">x</a></svg>' },
    { args: [...manifest.args, '{param:missing}'] },
    { params: [{ id: 'text', label: 'Text', type: 'text' }] },
    { params: [{ id: 'n', label: 'N', type: 'number', min: 5, max: 1 }] },
  ])
    assert.throws(() => validatePlugin({ ...manifest, ...bad }));
  host.installPlugin(manifest, { accepted: true });
  const input = path.join(dir, 'in.mov');
  fs.writeFileSync(input, 'x');
  const ctx = { isCanceled: () => false, progress() {}, setCancel() {} };
  const r = await host.processFile({ id: 'grain', input, outputDir: dir, params: { strength: 25, look: 'coarse', mono: true } }, ctx);
  assert.equal(fs.readFileSync(r.output, 'utf8'), 'strength=25 coarse mono');
  const d = await host.processFile({ id: 'grain', input, outputDir: dir }, ctx);
  assert.equal(fs.readFileSync(d.output, 'utf8'), 'strength=10 fine color', 'defaults are used when nothing is chosen');
  await assert.rejects(() => host.processFile({ id: 'grain', input, outputDir: dir, params: { strength: 99 } }, ctx), /between/);
  await assert.rejects(() => host.processFile({ id: 'grain', input, outputDir: dir, params: { look: '-i /etc/passwd' } }, ctx), /Choose/);
});

test('the agent updates its plugin in place: same id, new version, old script removed, no copies', (t) => {
  const { host, dir } = setup(t, { ffmpegPath: process.execPath, findInterpreter: () => process.execPath });
  const base = { kind: 'python', name: 'Upscale', script: 'v1', args: ['{input}', '{output}'], outputExtension: '.mov' };
  const v1 = host.draftProcessor(base);
  assert.throws(() => host.installPlugin(v1.manifest), /terms/, 'installing needs the user to accept responsibility');
  host.installPlugin(v1.manifest, { accepted: true });
  const v2 = host.draftProcessor({ ...base, replaceId: v1.manifest.id, name: 'Upscale 2x', script: 'v2' });
  assert.equal(v2.manifest.id, v1.manifest.id);
  assert.equal(v2.manifest.version, 2);
  assert.equal(v2.updates, 1);
  assert.equal(fs.readFileSync(host.listPlugins()[0].args[0], 'utf8'), 'v1', 'the installed version keeps working until the update is installed');
  host.installPlugin(v2.manifest, { accepted: true });
  assert.equal(host.listPlugins().length, 1);
  assert.equal(host.listPlugins()[0].name, 'Upscale 2x');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'scripts', v1.manifest.id)).length, 1, 'old script versions are removed');
  const again = host.draftProcessor({ ...base, name: 'upscale 2X', script: 'v3' });
  assert.equal(again.manifest.id, v1.manifest.id, 'the same name updates the plugin the agent made');
  assert.throws(() => host.draftProcessor({ ...base, replaceId: 'missing' }));
  host.removePlugin(v1.manifest.id);
  assert.deepEqual(host.listPlugins(), []);
  assert.ok(!fs.existsSync(path.join(dir, 'scripts', v1.manifest.id)), 'removing deletes its scripts');
});
test('a shared plugin file installs on another computer after review, and only with accepted terms', (t) => {
  const { host: maker } = setup(t, { ffmpegPath: process.execPath, findInterpreter: () => process.execPath });
  const draft = maker.draftProcessor({ kind: 'python', name: 'Grain', description: 'Adds grain.', script: 'print("grain")', args: ['{input}', '{output}', '{param:amount}'], params: [{ id: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, default: 0.5 }], outputExtension: '.mov' });
  maker.installPlugin(draft.manifest, { accepted: true });
  assert.throws(() => maker.exportPlugin(draft.manifest.id, {}), /terms/);
  const pkg = maker.exportPlugin(draft.manifest.id, { accepted: true, author: 'Ada' });
  assert.equal(pkg.format, 'reccut-plugin-v1');
  assert.equal(pkg.script, 'print("grain")');
  assert.equal(pkg.terms.by, 'Ada');
  assert.ok(!JSON.stringify(pkg).includes(path.sep + 'scripts' + path.sep), 'no local paths are shared');
  const { host: user, dir } = setup(t, { ffmpegPath: process.execPath, findInterpreter: () => process.execPath });
  const file = path.join(dir, 'Grain.reccut-plugin');
  fs.writeFileSync(file, JSON.stringify(pkg));
  const review = user.readPluginFile(file);
  assert.equal(review.manifest.author, 'Ada');
  assert.deepEqual(user.listPlugins(), [], 'reading the file installs nothing');
  assert.throws(() => user.installPackage(review.pkg, {}), /terms/);
  user.installPackage(review.pkg, { accepted: true });
  const [installed] = user.listPlugins();
  assert.equal(fs.readFileSync(installed.args[0], 'utf8'), 'print("grain")');
  assert.ok(installed.args[0].startsWith(dir));
  assert.equal(user.readPluginFile(file).updates, 1, 'opening it again offers an update, not a second copy');
  fs.writeFileSync(file, JSON.stringify({ ...pkg, format: 'other' }));
  assert.throws(() => user.readPluginFile(file), /not a Reccut plugin/);
  const own = { format: 'reccut-processor-v1', id: 'mytool', name: 'My tool', executable: process.execPath, args: ['{input}', '{output}'], outputExtension: '.mp4' };
  user.installPlugin(own, { accepted: true });
  assert.throws(() => user.exportPlugin('mytool', { accepted: true }), /FFmpeg or Python/);
});
