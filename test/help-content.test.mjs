import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ARTICLES, SECTIONS } from '../src/renderer/help/articles.js';
import { excerpt, plainText, searchHelp } from '../src/renderer/help/search.js';
import { AUDIO_EFFECTS } from '../src/shared/audiofx.js';
import { VIDEO_FORMATS } from '../src/shared/formats.js';

test('every handbook article has valid metadata, related links and local images', () => {
  const ids = new Set(ARTICLES.map((a) => a.id));
  assert.equal(ids.size, ARTICLES.length, 'article IDs must be unique');
  for (const a of ARTICLES) {
    assert.ok(a.title && a.summary && a.body.trim(), `${a.id}: missing reader-facing content`);
    assert.ok(SECTIONS.includes(a.section), `${a.id}: unknown chapter`);
    assert.ok(!/\bundefined\b|\[object Object\]|\bNaN\b/.test(a.body), `${a.id}: broken generated reference`);
    for (const id of a.see || []) assert.ok(ids.has(id), `${a.id}: missing related article ${id}`);
    for (const m of a.body.matchAll(/\[\[article:([^|]+)\|/g)) assert.ok(ids.has(m[1]), `${a.id}: missing inline article ${m[1]}`);
    for (const m of a.body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      assert.ok(m[1].trim(), `${a.id}: image needs a caption/alt text`);
      assert.match(m[2], /^[\w.-]+$/, 'images must be packaged local assets');
      assert.ok(fs.existsSync(new URL(`../assets/help/${m[2]}`, import.meta.url)), `${a.id}: missing image ${m[2]}`);
    }
  }
});

test('full-text search finds practical questions and aliases', () => {
  for (const [query, expected] of [
    ['how do I connect a local AI model', 'ai-local'], ['API key', 'ai-setup'],
    ['connection refused', 'ai-troubleshooting'], ['no sound', 'troubleshooting'],
    ['roll slip slide', 'tools'], ['subtitles', 'captions'], ['recover recording', 'recording-recovery'],
    ['ProRes', 'export-formats'], ['Compressor', 'audio-reference'], ['LM Studio', 'ai-local'],
  ]) assert.ok(searchHelp(query, ARTICLES).articles.slice(0, 10).some((a) => a.id === expected), `${query} should find ${expected}`);
  assert.deepEqual(searchHelp('   ', ARTICLES), { articles: [], commands: [] });
  assert.equal(searchHelp('zzzznotaword', ARTICLES).articles.length, 0);
  assert.ok(searchHelp('export', ARTICLES, [], 'Export').articles.every((a) => a.section === 'Export'));
});

test('body text, summaries and command descriptions are indexed with readable excerpts', () => {
  const commands = [{ id: 'one', label: 'Do the thing', desc: 'Repair wobble', help: 'stabilize' }];
  assert.equal(searchHelp('wobble', [], commands).commands[0].id, 'one');
  const text = plainText('## **Hello** {{key:copy}} [[article:welcome|Start here]] ![A view](view.jpg)');
  assert.equal(text, 'Hello Start here A view');
  const a = ARTICLES.find((a) => a.id === 'ai-local');
  assert.match(excerpt(a, 'localhost'), /localhost/);
});

test('effect and format references cover the shipped catalogue', () => {
  const audio = ARTICLES.find((a) => a.id === 'audio-reference').body;
  for (const e of Object.values(AUDIO_EFFECTS)) {
    assert.ok(audio.includes(`## ${e.label}`));
    for (const p of e.params) assert.ok(audio.includes(`**${p.label}**`));
  }
  const formats = ARTICLES.find((a) => a.id === 'export-formats').body;
  for (const f of VIDEO_FORMATS) assert.ok(formats.includes(f.label));
});
