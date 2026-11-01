// Både hendelsens mål og fokus sjekkes: snarveier må aldri overta tastene i et felt.
export function isTyping(event) {
  const editable = (el) => Boolean(el && (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable ||
    el.closest?.('[role="textbox"], [role="combobox"]')
  ));
  return editable(globalThis.document?.activeElement) ||
    (event?.composedPath?.() || [event?.target]).some(editable);
}

// Felt der man skriver tekst og mellomrom trengs. Tallfelt, glidere, knapper og menyer teller ikke.
const TEXT_TYPES = ['', 'text', 'search', 'password', 'email', 'url', 'tel'];
export function writingText(event) {
  const writable = (el) => Boolean(el && (
    el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest?.('[role="textbox"]') ||
    (el.tagName === 'INPUT' && TEXT_TYPES.includes(el.getAttribute('type') || '') && !el.classList.contains('num-field'))
  ));
  return writable(globalThis.document?.activeElement) || writable(event?.target);
}

// Modal windows own all keys. Floating plugin windows own keys while focused.
export function dialogOwnsKeyboard(event) {
  const doc = globalThis.document;
  if (doc?.querySelector('.modal-backdrop, .help-window, .palette, dialog[open]')) return true;
  const inDialog = (el) => Boolean(el?.closest?.('[role="dialog"], .plugin-window'));
  return inDialog(doc?.activeElement) ||
    (event?.composedPath?.() || [event?.target]).some(inDialog);
}

export function commandsBlocked(event) {
  return globalThis.document?.hasFocus?.() === false || Boolean(event?.isComposing) ||
    isTyping(event) || dialogOwnsKeyboard(event);
}

// Synchronise native accelerators with DOM focus and dialog changes. Restrict the
// observer to scope changes so typing and playback do not continually re-register keys.
export function watchKeyboardScope(notify) {
  let previous;
  let composing = false;
  const update = () => {
    const blocked = composing || commandsBlocked();
    if (previous !== blocked) { previous = blocked; notify(blocked); }
  };
  const composition = (event) => { composing = event.type === 'compositionstart'; update(); };
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  document.addEventListener('compositionstart', composition);
  document.addEventListener('compositionend', composition);
  window.addEventListener('focus', update);
  window.addEventListener('blur', update);
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'role'] });
  update();
  return () => {
    observer.disconnect();
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
    document.removeEventListener('compositionstart', composition);
    document.removeEventListener('compositionend', composition);
    window.removeEventListener('focus', update);
    window.removeEventListener('blur', update);
  };
}
