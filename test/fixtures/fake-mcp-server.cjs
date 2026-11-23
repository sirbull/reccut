// A minimal MCP server over stdio for test/mcp.test.mjs.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let buffer = '';
const write = (m) => process.stdout.write(JSON.stringify(m) + '\n');
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    if (msg.id === undefined) continue;
    if (msg.method === 'initialize') write({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake' }, instructions: 'Fake sound server.' } });
    else if (msg.method === 'tools/list')
      write({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            { name: 'make-sound', description: 'Makes a sound effect.', inputSchema: { $schema: 'x', type: 'object', properties: { prompt: { type: 'string' } } } },
            { name: 'key_check', description: 'Says whether the key arrived.', inputSchema: { type: 'object' } },
          ],
        },
      });
    else if (msg.method === 'tools/call' && msg.params.name === 'make-sound')
      write({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            { type: 'text', text: `Made "${msg.params.arguments.prompt}". Link: https://cdn.example.com/out.mp3` },
            { type: 'image', mimeType: 'image/png', data: PNG },
            { type: 'audio', mimeType: 'audio/wav', data: Buffer.from('RIFF....WAVE').toString('base64') },
          ],
        },
      });
    else if (msg.method === 'tools/call') write({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: process.env.FAKE_KEY === 'secret-123' ? 'key ok' : 'no key' }] } });
    else write({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'nope' } });
  }
});
