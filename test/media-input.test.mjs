import test from 'node:test';
import assert from 'node:assert/strict';
import { inputErrorText, missingDevice, resolveDevice } from '../src/shared/mediaInput.js';

const mics = [
  { id: 'default', label: 'Default - Virtual Input (RØDE Connect)' },
  { id: 'new-id', label: 'Virtual Input (RØDE Connect)' },
  { id: 'amd', label: 'Microphone Array (AMD Audio Device)' },
];

test('a saved microphone is kept while its id exists', () => {
  assert.equal(resolveDevice('amd', 'Microphone Array (AMD Audio Device)', mics), 'amd');
});

test('a microphone whose id changed is found again by its name', () => {
  assert.equal(resolveDevice('old-id', 'Virtual Input (RØDE Connect)', mics), 'new-id');
});

test('an unknown microphone falls back to the system default instead of failing', () => {
  assert.equal(resolveDevice('old-id', 'Gone USB Mic', mics), null);
  assert.equal(resolveDevice('old-id', '', mics), null);
  assert.equal(resolveDevice('', 'Virtual Input (RØDE Connect)', mics), null);
});

test('Chromium errors with empty messages get a readable text', () => {
  const over = Object.assign(new Error(''), { name: 'OverconstrainedError', constraint: 'deviceId' });
  assert.ok(missingDevice(over));
  assert.ok(!missingDevice({ name: 'NotAllowedError' }));
  assert.match(inputErrorText(over, 'the microphone'), /Could not find the microphone/);
  assert.match(inputErrorText({ name: 'NotReadableError', message: '' }), /Another app may be using it/);
  assert.match(inputErrorText({ name: 'NotAllowedError' }, 'the microphone'), /no access to the microphone/);
  assert.doesNotMatch(inputErrorText({ name: 'TypeError', message: '' }), /: $/);
});
