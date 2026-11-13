import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

test('the website docs page matches the in-app handbook', () => {
  // Feiler hvis hjelpetekstene er endret uten at nettsiden er bygget på nytt med npm run docs.
  execFileSync(process.execPath, ['scripts/build-docs-site.mjs', '--check'], { stdio: 'pipe' });
});

test('the website menu links to the docs page', () => {
  assert.match(fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8'), /<a class="docs" href="docs\/" target="_blank" rel="noopener">Docs<\/a>/);
});
