import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

// Stream-level fixture for the native protocol, not a replacement for the
// production client. Responses can be delayed/corrupted or omitted by a test.
export function fakeVoxcpmProcess({ handle = async () => {}, announce = true } = {}) {
  const children = [], requests = [];
  const spawn = (exe, args, options) => {
    const child = new EventEmitter();
    Object.assign(child, { exe, args, options, stdout: new PassThrough(), signals: [], closed: false });
    child.respond = (value) => { if (!child.closed) child.stdout.write(JSON.stringify(value) + '\n'); };
    child.close = (code = 0) => { if (child.closed) return; child.closed = true; child.stdout.end(); child.emit('close', code); };
    child.kill = (signal) => { child.signals.push(signal); child.killed = signal; setImmediate(() => child.close(null)); return true; };
    let rest = '';
    child.stdin = new Writable({ write(chunk, _encoding, done) {
      rest += chunk.toString();
      while (rest.includes('\n')) {
        const at = rest.indexOf('\n'), request = JSON.parse(rest.slice(0, at)); rest = rest.slice(at + 1);
        requests.push({ ...request, child });
        Promise.resolve().then(() => handle(request, child)).then((result) => {
          if (result !== false) child.respond({ type: 'done', id: request.id, rate: 48000 });
        }, () => child.respond({ type: 'error', id: request.id, error: 'Fixture error' }));
      }
      done();
    } });
    children.push(child);
    if (announce) setImmediate(() => {
      if (args[0] === '--protocol') { child.respond({ type: 'protocol', protocol: 1 }); child.close(); }
      else child.respond({ type: 'ready', protocol: 1, rate: 48000 });
    });
    return child;
  };
  return { spawn, children, requests };
}
