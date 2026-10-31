import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createExtensionHost, validatePlugin, validateAI, toAnthropic, toCompatible, fromCompatible } = require('../src/main/extensions.js');
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
  host.installPlugin(manifest);
  let cancel;
  const ctx = { isCanceled: () => false, progress: () => {}, setCancel: (fn) => (cancel = fn) };
  const r = await host.processFile({ id: 'copy', input, outputDir: dir }, ctx);
  assert.equal(fs.readFileSync(r.output, 'utf8'), 'source');
  assert.equal(fs.readFileSync(input, 'utf8'), 'source');
  host.installPlugin({
    ...manifest,
    id: 'slow',
    args: [
      '-e',
      "require('fs').writeFileSync(process.argv[2], 'partial');setTimeout(()=>{},30000)",
      '{input}',
      '{output}',
    ],
  });
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
