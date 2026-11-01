import test from 'node:test';
import assert from 'node:assert/strict';
import { isTyping, commandsBlocked, dialogOwnsKeyboard } from '../src/renderer/keyboard.js';

test('input, textarea, select and editable content reserve the keyboard', () => {
  for (const target of [
    { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
    { tagName: 'SPAN', isContentEditable: true },
    { tagName: 'DIV', closest: () => ({ role: 'textbox' }) },
  ]) assert.equal(isTyping({ target }), true);
  assert.equal(isTyping({ target: { tagName: 'CANVAS' } }), false);
});

test('only a focused editor outside inputs, dialogs and composition can run commands', () => {
  let focused = true, modal = null;
  globalThis.document = { activeElement: { tagName: 'BODY' }, hasFocus: () => focused, querySelector: () => modal };
  try {
    assert.equal(commandsBlocked(), false);
    focused = false;
    assert.equal(commandsBlocked(), true);
    focused = true;
    assert.equal(commandsBlocked({ isComposing: true }), true);
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      document.activeElement = { tagName };
      assert.equal(commandsBlocked(), true);
    }
    document.activeElement = { tagName: 'BUTTON' };
    modal = {};
    assert.equal(commandsBlocked(), true, 'modal buttons must not trigger the timeline');
    modal = null;
    document.activeElement = { closest: () => ({ role: 'dialog' }) };
    assert.equal(dialogOwnsKeyboard(), true, 'floating windows own their keyboard while focused');
  } finally { delete globalThis.document; }
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
