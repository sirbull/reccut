// Register the recording keys only in the Record room and the current keyboard scope.
// Recheck on invocation too: a queued callback can arrive after focus changes.
function createRecordingShortcuts({ globalShortcut, context, send, toggleZoom }) {
  const allowed = () => {
    const c = context();
    return Boolean(c.active) && (c.focused ? !c.blocked : Boolean(c.background && !c.otherWindowFocused));
  };
  // Reccut minimizes when a recording starts, so stop and pause must work without focus.
  // Other apps only lose these two keys while a recording runs.
  const control = () => {
    const c = context();
    return allowed() || Boolean(c.recording && !(c.focused && c.blocked));
  };
  return {
    allowed,
    refresh() {
      globalShortcut.unregisterAll();
      const c = { ...context() };
      if (!c.modifier) return [];
      const failed = [];
      const reg = (key, action, ok = allowed) => {
        if (!ok()) return;
        const accelerator = `${c.modifier}+${key}`;
        if (!globalShortcut.register(accelerator, () => {
          const current = context();
          if (ok() && current.modifier === c.modifier) action();
        })) failed.push(accelerator);
      };
      reg('0', () => send({ toggleRecord: true, keyboard: true }), control);
      reg('9', () => send({ togglePause: true, keyboard: true }), control);
      for (let n = 1; n <= 8; n++) reg(String(n), () => send({ layout: n, keyboard: true }));
      reg('M', toggleZoom);
      return failed;
    },
  };
}

module.exports = { createRecordingShortcuts };
