// The AI Agent must know every feature: skills, chat examples and commands are checked against the real tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { TOOLS, AGENT_EFFECTS } from '../src/shared/aiEdits.js';
import { SKILLS } from '../src/shared/agentSkills.js';
import { EXAMPLES, CHAT_COMMANDS } from '../src/shared/agentExamples.js';
import { VIDEO_EFFECTS } from '../src/shared/videoEffects.js';
const require = createRequire(import.meta.url);
const CATALOG = require('../src/main/mcpCatalog.json');

const agent = fs.readFileSync('src/renderer/agent.js', 'utf8');
const runtimeTools = [...agent.slice(agent.indexOf('const RUNTIME_TOOLS'), agent.indexOf('const RUNTIME_MAP')).matchAll(/^ {4}name: '([a-z_]+)'/gm)].map((m) => m[1]);
const ALL = new Set([...TOOLS.map((t) => t.name), ...runtimeTools]);

test('the agent has its runtime tools, including skills and imports from tool servers', () => {
  for (const name of ['load_skill', 'import_url', 'import_media', 'find_commands', 'run_command', 'generate_voiceover', 'preview_frames']) assert.ok(ALL.has(name), name);
  assert.ok(ALL.size <= 64, 'Reccut’s own tools leave room for tool servers within the 128 tools providers accept');
});

test('every skill is complete and uses only tools that exist', () => {
  const ids = new Set();
  for (const s of SKILLS) {
    assert.match(s.id, /^[a-z][a-z-]+$/);
    assert.ok(!ids.has(s.id));
    ids.add(s.id);
    assert.ok(s.title && s.when && s.text.length > 200, s.id);
    for (const t of s.tools) assert.ok(ALL.has(t), `${s.id} uses unknown tool ${t}`);
    // Tool names in the text must exist too.
    for (const [, t] of s.text.matchAll(/\b([a-z]+_[a-z_]+)\b/g)) if (/^(add|get|set|run|list|import|generate|create|load|preview|analyze|inspect|transcribe|build|match|find|trim|move|split|delete|remove)_/.test(t)) assert.ok(ALL.has(t), `${s.id} mentions unknown tool ${t}`);
  }
  for (const want of ['color-grading', 'sound-design', 'transitions', 'effects']) assert.ok(ids.has(want));
});

test('the system prompt tells the model about skills and tool servers', () => {
  assert.match(agent, /load_skill/);
  assert.match(agent, /skillIndex\(\)/);
  assert.match(agent, /toolServers\(setup\.servers\)/);
  // Other AI apps using Reccut as an MCP server cannot reach Reccut's own tool servers.
  assert.match(agent, /name\.startsWith\('mcp_'\)\) throw/);
});

test('every chat example can be done with tools that exist', () => {
  const kinds = new Set(CATALOG.servers.flatMap((s) => s.kinds));
  for (const [, list] of EXAMPLES)
    for (const ex of list) {
      assert.ok(ex.text.length > 5);
      for (const t of ex.tools) assert.ok(ALL.has(t), `"${ex.text}" needs unknown tool ${t}`);
      if (ex.needs) assert.ok(kinds.has(ex.needs), `"${ex.text}" needs a ${ex.needs} server that is not in the catalog`);
    }
  assert.deepEqual(CHAT_COMMANDS.map((c) => c.label), ['/help', '/new', '/undo', '/tools', '/settings']);
});

test('the agent can add every video effect from the Effects browser', () => {
  const missing = VIDEO_EFFECTS.map((e) => e.type).filter((t) => !AGENT_EFFECTS.includes(t));
  assert.deepEqual(missing, ['difference'], 'only the background reference key, which needs a picked frame, is left out');
});

test('commands explain themselves to the agent', () => {
  // find_commands gives the model each command's desc. New commands must have one; this number may only go down.
  const src = fs.readFileSync('src/renderer/registry.js', 'utf8');
  const rows = src.split('\n').filter((l) => /^\s*\{ id: '/.test(l) && !/menuOnly: true/.test(l));
  const without = rows.filter((l) => !/\bdesc: /.test(l)).length;
  assert.ok(without <= 149, `${without} commands have no desc. Give new commands a desc so the AI Agent knows what they do.`);
});
