import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { createExtensionHost } = createRequire(import.meta.url)('../src/main/extensions.js');
const storage = { isEncryptionAvailable: () => false };
function hostFor(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-models-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return createExtensionHost({ dir, safeStorage: storage, ...extra });
}
test('a real loopback server lists and runs a local chat model without an API key', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, authorization: req.headers.authorization, body: body && JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/v1/models'
          ? { data: [{ id: 'downloaded-local-model' }] }
          : { choices: [{ message: { content: 'Completed locally' } }] },
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`,
    host = hostFor(t);
  assert.deepEqual(await host.listModels({ provider: 'compatible', endpoint }), ['downloaded-local-model']);
  host.saveAI({ provider: 'compatible', endpoint, model: 'downloaded-local-model', vision: false });
  const result = await host.complete({
    system: 'Local editing assistant',
    tools: [],
    messages: [{ role: 'user', content: 'Hello' }],
  });
  assert.equal(result.text, 'Completed locally');
  assert.equal(requests[1].body.model, 'downloaded-local-model');
  assert.ok(requests.every((r) => r.authorization === undefined));
});
test('switching from a cloud provider to an unsaved local server never forwards the cloud key', async (t) => {
  let sent;
  const host = hostFor(t, {
    fetchImpl: async (url, options) => {
      sent = { url, ...options };
      return { ok: true, json: async () => ({ data: [{ id: 'local' }] }) };
    },
  });
  host.saveAI({
    provider: 'compatible',
    endpoint: 'https://api.cloud.example/v1',
    model: 'cloud',
    apiKey: 'private-cloud-key',
  });
  await host.listModels({ provider: 'compatible', endpoint: 'http://localhost:1234/v1', apiKey: '' });
  assert.equal(sent.url, 'http://localhost:1234/v1/models');
  assert.equal(sent.headers.Authorization, undefined);
});
test('compatible services keep their own model, endpoint and key, without falling back', async (t) => {
  const targets = [
    'https://generativelanguage.googleapis.com/v1beta/openai',
    'https://openrouter.ai/api/v1',
    'https://api.mistral.ai/v1',
    'https://api.groq.com/openai/v1',
    'https://api.deepseek.com/v1',
  ];
  const calls = [];
  const host = hostFor(t, {
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    },
  });
  for (const [i, endpoint] of targets.entries()) {
    host.saveAI({ provider: 'compatible', endpoint, model: `provider-model-${i}`, apiKey: `provider-key-${i}` });
    await host.complete({ system: 'test', tools: [], messages: [{ role: 'user', content: 'Hi' }] });
    assert.equal(calls.at(-1).url, endpoint + '/chat/completions');
    assert.equal(calls.at(-1).headers.Authorization, `Bearer provider-key-${i}`);
    assert.equal(JSON.parse(calls.at(-1).body).model, `provider-model-${i}`);
  }
  assert.equal(calls.length, targets.length);
});
