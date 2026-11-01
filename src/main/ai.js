// AI-assistenten: snakker med en språkmodell brukeren selv har valgt, med brukerens egen API-nøkkel.
// Nøkkelen lagres kryptert av operativsystemet (safeStorage) og forlater aldri hovedprosessen.
// Modellen får verktøy som kjøres i redigeringsvinduet, så alt den endrer er vanlige endringer
// som kan angres. Her gjøres bare selve forespørselen; løkken med verktøy går i vinduet.
//
// Leverandører:
//  anthropic: Claude via Anthropics offisielle SDK.
//  openai: alle tjenester med OpenAI-kompatibelt grensesnitt (OpenAI, OpenRouter, og lokale
//          modeller via LM Studio eller Ollama). Svaret gjøres om til samme form som Claude sitt.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'ai.json');

const DEFAULTS = {
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  baseUrl: 'https://api.openai.com/v1',
  maxTokens: 16000,
};

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return {};
  }
}

function getKey(raw = readRaw()) {
  const k = raw.keys?.[raw.provider || DEFAULTS.provider];
  if (!k) return '';
  try {
    if (k.enc && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(k.enc, 'base64'));
    return k.plain || '';
  } catch {
    return '';
  }
}

// Innstillingene uten nøkkelen (vinduet får bare vite om det finnes en).
function getConfig() {
  const raw = readRaw();
  const cfg = { ...DEFAULTS, ...raw };
  delete cfg.keys;
  const models = raw.models || {};
  cfg.model = models[cfg.provider] || (cfg.provider === 'anthropic' ? DEFAULTS.model : '');
  cfg.hasKey = Boolean(getKey(raw));
  cfg.encrypted = safeStorage.isEncryptionAvailable();
  return cfg;
}

function setConfig(patch) {
  const raw = readRaw();
  const next = { ...raw };
  if (patch.provider) next.provider = patch.provider;
  const provider = next.provider || DEFAULTS.provider;
  if (patch.baseUrl != null) next.baseUrl = String(patch.baseUrl).trim().replace(/\/+$/, '');
  if (patch.model != null) next.models = { ...(raw.models || {}), [provider]: String(patch.model).trim() };
  if (patch.apiKey != null) {
    const key = String(patch.apiKey).trim();
    const keys = { ...(raw.keys || {}) };
    if (!key) delete keys[provider];
    else if (safeStorage.isEncryptionAvailable()) keys[provider] = { enc: safeStorage.encryptString(key).toString('base64') };
    else keys[provider] = { plain: key };
    next.keys = keys;
  }
  fs.writeFileSync(file(), JSON.stringify(next, null, 1));
  return getConfig();
}

/* Claude */

let Anthropic = null;
function client(key) {
  Anthropic ||= require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: key });
}

const live = new Map(); // forespørsler som kan avbrytes

async function sendAnthropic(cfg, key, req, onText) {
  const params = {
    model: cfg.model || DEFAULTS.model,
    max_tokens: cfg.maxTokens || DEFAULTS.maxTokens,
    thinking: { type: 'adaptive' },
    system: req.system,
    tools: req.tools,
    messages: req.messages,
  };
  // Nektes en forespørsel av sikkerhetsfiltrene, prøver API-et selv en annen modell
  // (bare på Claude sitt eget API, og bare for modellene som støtter det).
  const fallback = /^claude-(opus-5|fable-5|sonnet-5)/.test(params.model);
  if (fallback) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  const api = fallback ? client(key).beta.messages : client(key).messages;
  const stream = api.stream(params);
  live.set(req.id, () => stream.abort());
  stream.on('text', (t) => onText(t));
  try {
    const msg = await stream.finalMessage();
    return { content: msg.content, stop_reason: msg.stop_reason, model: msg.model, usage: msg.usage };
  } finally {
    live.delete(req.id);
  }
}

/* OpenAI-kompatible tjenester */

// Claude-formatet (som vinduet bruker) til Chat Completions-formatet.
function toOpenAI(req) {
  const out = [];
  if (req.system) out.push({ role: 'system', content: req.system });
  for (const m of req.messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of blocks.filter((x) => x.type === 'tool_result')) {
        const c = typeof b.content === 'string' ? b.content : (b.content || []).map((x) => x.text || '').join('');
        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: c });
      }
      const parts = blocks.filter((b) => b.type === 'text' || b.type === 'image');
      if (parts.length) {
        out.push({
          role: 'user',
          content: parts.map((b) => (b.type === 'text' ? { type: 'text', text: b.text } : { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } })),
        });
      }
    }
  }
  return out;
}

async function sendOpenAI(cfg, key, req, onText) {
  if (!cfg.model) throw new Error('Choose a model in Settings, AI Assistant.');
  const ctrl = new AbortController();
  live.set(req.id, () => ctrl.abort());
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model: cfg.model,
        messages: toOpenAI(req),
        tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    const choice = data.choices?.[0] || {};
    const msg = choice.message || {};
    const content = [];
    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
      onText(msg.content);
    }
    for (const c of msg.tool_calls || []) {
      let input = {};
      try {
        input = JSON.parse(c.function.arguments || '{}');
      } catch {
        input = { _invalid: c.function.arguments };
      }
      content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
    }
    const stop = choice.finish_reason === 'tool_calls' || (msg.tool_calls || []).length ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : choice.finish_reason === 'content_filter' ? 'refusal' : 'end_turn';
    return { content, stop_reason: stop, model: data.model, usage: data.usage };
  } finally {
    live.delete(req.id);
  }
}

/**
 * Én forespørsel til modellen. req: { id, system, tools, messages } i Claude-formatet.
 * Teksten sendes fortløpende med onText. Gir { content, stop_reason, model }.
 */
async function send(req, onText) {
  const raw = readRaw();
  const cfg = getConfig();
  const key = getKey(raw);
  if (!key && cfg.provider === 'anthropic') throw new Error('Add your API key in Settings, AI Assistant.');
  try {
    return cfg.provider === 'openai' ? await sendOpenAI(cfg, key, req, onText) : await sendAnthropic(cfg, key, req, onText);
  } catch (err) {
    if (err.name === 'AbortError' || /aborted/i.test(err.message)) throw new Error('Stopped');
    if (err.status === 401) throw new Error('The API key was not accepted. Check it in Settings, AI Assistant.');
    if (err.status === 429) throw new Error('Too many requests right now (rate limit). Wait a little and try again.');
    if (err.status === 529 || err.status === 503) throw new Error('The service is busy right now. Try again in a moment.');
    throw err;
  }
}

function stop(id) {
  live.get(id)?.();
}

// Prøver nøkkelen med en liten forespørsel.
async function test() {
  const r = await send({ id: `test-${Date.now()}`, system: 'Answer with one word.', tools: [], messages: [{ role: 'user', content: 'Say OK.' }] }, () => {});
  return { ok: true, model: r.model };
}

module.exports = { getConfig, setConfig, send, stop, test };
