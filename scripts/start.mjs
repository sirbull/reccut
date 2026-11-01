// Launch Electron as a desktop app even when the calling terminal runs inside Electron.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

await import('./build.mjs');

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.info('Starting Reccut (development)…');
const child = spawn(require('electron'), [root, '--reccut-development', ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: false,
});
const onInterrupt = () => child.kill('SIGINT');
const onTerminate = () => child.kill('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
child.on('error', (error) => {
  console.error(`Could not start Reccut: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  if (signal) console.error(`Reccut exited with signal ${signal}.`);
  process.exitCode = code ?? 1;
});
