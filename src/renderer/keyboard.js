// Både hendelsens mål og fokus sjekkes: snarveier må aldri overta tastene i et felt.
export function isTyping(event) {
  const editable = (el) => Boolean(el && (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable ||
    el.closest?.('[role="textbox"], [role="combobox"]')
  ));
  return editable(globalThis.document?.activeElement) ||
    (event?.composedPath?.() || [event?.target]).some(editable);
}
