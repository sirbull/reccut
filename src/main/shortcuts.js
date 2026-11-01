// Register only the recording keys that belong to the current keyboard scope.
// Recheck on invocation too: a queued callback can arrive after focus changes.
function createRecordingShortcuts({ globalShortcut, context, send, toggleZoom }) {
  const allowed = () => {
    const c = context();
    return c.focused ? !c.blocked : Boolean(c.background && !c.otherWindowFocused);
  };
  return {
    allowed,
    refresh() {
      globalShortcut.unregisterAll();
      const c = { ...context() };
      if (!c.modifier || !allowed()) return [];
      const failed = [];
      const reg = (key, action, needsActive = false) => {
        const accelerator = `${c.modifier}+${key}`;
        if (!globalShortcut.register(accelerator, () => {
          const current = context();
          if (allowed() && current.modifier === c.modifier && (!needsActive || current.active)) action();
        })) failed.push(accelerator);
      };
      reg('0', () => send({ toggleRecord: true, keyboard: true }));
      reg('8', () => send({ togglePause: true, keyboard: true }));
      if (c.active) {
        for (let n = 1; n <= 6; n++) reg(String(n), () => send({ layout: n, keyboard: true }), true);
        if (!c.nativeInput) reg('9', toggleZoom, true);
      }
      return failed;
    },
  };
}

module.exports = { createRecordingShortcuts };
