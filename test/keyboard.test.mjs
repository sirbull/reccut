import test from 'node:test';
import assert from 'node:assert/strict';
import { isTyping } from '../src/renderer/keyboard.js';

test('input, textarea, select and editable content reserve the keyboard', () => {
  for (const target of [
    { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
    { tagName: 'SPAN', isContentEditable: true },
    { tagName: 'DIV', closest: () => ({ role: 'textbox' }) },
  ]) assert.equal(isTyping({ target }), true);
  assert.equal(isTyping({ target: { tagName: 'CANVAS' } }), false);
});

test('focused fields and composed event paths block shortcuts even when the target differs', () => {
  globalThis.document = { activeElement: { tagName: 'TEXTAREA' } };
  try {
    assert.equal(isTyping({ target: { tagName: 'BODY' } }), true);
    assert.equal(isTyping(), true, 'native menu accelerators have no DOM event');
    document.activeElement = { tagName: 'BODY' };
    assert.equal(isTyping({ target: document.activeElement, composedPath: () => [{ tagName: 'INPUT' }] }), true);
    assert.equal(isTyping(), false);
  } finally {
    delete globalThis.document;
  }
});
