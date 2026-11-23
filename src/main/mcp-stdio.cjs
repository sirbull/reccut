// Stdio bridge for AI apps that start MCP servers as programs (Claude Desktop and others).
// Runs with Reccut's own executable and ELECTRON_RUN_AS_NODE=1, reads the port and token from Reccut's settings file
// and forwards every message to the running app. The token never has to be copied into the AI app's settings.
//   Reccut mcp-stdio.cjs <path to mcp-server.json>
const fs = require('node:fs');
const settingsFile = process.argv[2];
let session = null;
let queue = Promise.resolve();

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
function settings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return {};
  }
}
async function forward(msg) {
  const s = settings();
  const fail = (message) => msg.id !== undefined && write({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message } });
  if (!s.enabled || !s.token) return fail('Turn on "Use Reccut from other AI apps" in Reccut › Settings › AI.');
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${s.port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${s.token}`, ...(session ? { 'Mcp-Session-Id': session } : {}) },
      body: JSON.stringify(msg),
    });
  } catch {
    return fail('Reccut is not running. Start Reccut, open a project and try again.');
  }
  session = response.headers.get('mcp-session-id') || session;
  const text = await response.text();
  if (!text.trim()) return;
  try {
    const body = JSON.parse(text);
    for (const m of [body].flat()) write(m);
  } catch {
    fail('Reccut sent an answer the bridge could not read.');
  }
}
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON.' } });
      continue;
    }
    // Answers keep the order of the requests.
    queue = queue.then(() => forward(msg)).catch(() => {});
  }
});
process.stdin.on('end', () => queue.then(() => process.exit(0)));
