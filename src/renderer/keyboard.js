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
