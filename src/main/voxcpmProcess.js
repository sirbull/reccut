// One local VoxCPM2 process, kept warm between speech jobs. stdout is bounded
// JSON-lines protocol; stderr is ignored so model logs never expose scripts.
const { spawn } = require('node:child_process');
const PROTOCOL = 1;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
};

// Check an engine without loading any weights. Earlier release assets were the
// one-shot CLI, so a checksum alone does not establish protocol compatibility.
function verifyVoxcpmProtocol(exe, { spawnImpl = spawn, signal, timeoutMs = 5000 } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawnImpl(exe, ['--protocol'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let output = '', failure, settled = false, timer, killTimer;
    const end = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const fail = (error) => {
      if (failure || settled) return;
      failure = error;
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000); killTimer.unref?.();
      try { child.kill('SIGTERM'); } catch {}
    };
    const abort = () => fail(signal.reason || new Error('Canceled'));
    child.once('error', () => end(new Error('Could not check the downloaded voice engine.')));
    child.once('close', (code) => {
      if (failure) { end(failure); return; }
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.type !== 'protocol' || result.protocol !== PROTOCOL) throw new Error();
        end();
      } catch { end(new Error('The downloaded VoxCPM2 engine is incompatible with this build.')); }
    });
    child.stdout.setEncoding?.('utf8');
    child.stdout.on('data', (chunk) => {
      if (settled || failure) return;
      output += chunk;
      if (output.length > 1024) fail(new Error('The downloaded voice engine returned an invalid protocol response.'));
    });
    child.stdout.on('error', () => fail(new Error('Could not check the downloaded voice engine.')));
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => fail(new Error('Checking the downloaded voice engine timed out.')), timeoutMs); timer.unref?.();
  });
}

function createVoxcpmProcess({ spawnImpl = spawn, idleTimeoutMs = 60000, startupTimeoutMs = 120000, requestTimeoutMs = 300000, killTimeoutMs = 1000 } = {}) {
  let session = null, closing = Promise.resolve(), busy = false, idleTimer, sequence = 0;
  function stop(reason = new Error('The voice engine stopped.')) {
    clearTimeout(idleTimer);
    const s = session;
    if (!s) return closing;
    if (s.stopping) return s.closed.promise;
    s.stopping = reason;
    clearTimeout(s.startupTimer);
    clearTimeout(s.requestTimer);
    s.ready.reject(reason);
    s.pending?.reject(reason);
    closing = s.closed.promise;
    s.killTimer = setTimeout(() => { try { s.child.kill('SIGKILL'); } catch {} }, killTimeoutMs);
    s.killTimer.unref?.();
    try { s.child.stdin?.end(); } catch {}
    try { s.child.kill('SIGTERM'); } catch {}
    return closing;
  }
  function finish(s, error) {
    if (s.ended) return;
    s.ended = true;
    clearTimeout(s.startupTimer); clearTimeout(s.requestTimer); clearTimeout(s.killTimer);
    s.ready.reject(s.stopping || error);
    s.pending?.reject(s.stopping || error);
    s.pending = null;
    if (session === s) session = null;
    s.closed.resolve();
  }
  function message(s, value) {
    if (s.stopping || s.ended) return;
    if (value?.type === 'ready' && !s.loaded && value.protocol === PROTOCOL && value.rate === 48000) {
      s.loaded = true; clearTimeout(s.startupTimer); s.ready.resolve();
    } else if (value?.type === 'done' && s.loaded && s.pending?.id === value.id && value.rate === 48000) {
      const request = s.pending;
      s.pending = null; clearTimeout(s.requestTimer); request.resolve();
    } else {
      // Ignore all remote error text. It may contain private input if an engine
      // has regressed; only our own fixed messages reach logs and the UI.
      stop(new Error(value?.type === 'error' || value?.type === 'fatal' ? 'The VoxCPM2 engine could not generate this voice.' : 'The VoxCPM2 engine returned an invalid response.'));
    }
  }
  async function ready(config, signal, onLoading) {
    await closing;
    signal?.throwIfAborted();
    const key = JSON.stringify([config.exe, config.sha256, config.models]);
    if (session && session.key !== key) await stop();
    signal?.throwIfAborted();
    if (!session) {
      onLoading();
      signal?.throwIfAborted();
      const child = spawnImpl(config.exe, ['--serve', ...config.models], { cwd: config.cwd, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      const s = { child, key, ready: deferred(), closed: deferred(), loaded: false, pending: null, rest: '' };
      session = s;
      child.stdout.setEncoding?.('utf8');
      child.stdout.on('data', (chunk) => {
        if (s.stopping || s.ended) return;
        s.rest += chunk;
        if (s.rest.length > 8192) { stop(new Error('The VoxCPM2 engine response is too large.')); return; }
        while (s.rest.includes('\n')) {
          const at = s.rest.indexOf('\n'), line = s.rest.slice(0, at);
          s.rest = s.rest.slice(at + 1);
          try { message(s, JSON.parse(line)); }
          catch { stop(new Error('The VoxCPM2 engine returned an invalid response.')); return; }
        }
      });
      child.stdout.on('error', () => { if (!s.ended) stop(new Error('Could not read the voice engine response.')); });
      child.stdin.on('error', () => { if (!s.ended) stop(new Error('Could not send text to the voice engine.')); });
      child.once('error', () => finish(s, new Error('Could not start the voice engine.')));
      child.once('close', () => finish(s, new Error('The VoxCPM2 engine stopped unexpectedly.')));
      s.startupTimer = setTimeout(() => stop(new Error('Loading the VoxCPM2 voice model timed out.')), startupTimeoutMs);
      s.startupTimer.unref?.();
    }
    const s = session;
    await s.ready.promise;
    signal?.throwIfAborted();
    if (s.stopping || s.ended) throw s.stopping || new Error('The voice engine stopped.');
    return s;
  }
  async function run(config, request, { signal, onLoading = () => {}, onReady = () => {} } = {}) {
    if (busy) throw new Error('The voice engine is busy.');
    signal?.throwIfAborted();
    busy = true; clearTimeout(idleTimer);
    const abort = () => { stop(signal.reason || new Error('Canceled')); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const s = await ready(config, signal, onLoading);
      onReady();
      signal?.throwIfAborted();
      const id = ++sequence, line = JSON.stringify({ ...request, id }) + '\n';
      if (Buffer.byteLength(line) > 65536) throw new Error('The voice request is too long.');
      const pending = { ...deferred(), id };
      s.pending = pending;
      s.requestTimer = setTimeout(() => stop(new Error('Generating the VoxCPM2 voice timed out.')), requestTimeoutMs);
      s.requestTimer.unref?.();
      s.child.stdin.write(line, (error) => { if (error && !s.ended) stop(new Error('Could not send text to the voice engine.')); });
      await pending.promise;
      signal?.throwIfAborted();
    } catch (error) {
      // Wait for termination before callers remove temporary WAVs. A canceled
      // process must not keep writing into the next job's working directory.
      await stop(error);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      busy = false;
      if (session && !session.stopping) {
        idleTimer = setTimeout(() => stop(), idleTimeoutMs);
        idleTimer.unref?.();
      }
    }
  }
  return { run, stop, running: () => Boolean(session && !session.stopping) };
}

module.exports = { createVoxcpmProcess, verifyVoxcpmProtocol, PROTOCOL };
