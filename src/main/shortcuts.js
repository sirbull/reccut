// Register the recording keys only in the Record room and the current keyboard scope.
// Recheck on invocation too: a queued callback can arrive after focus changes.
function createRecordingShortcuts({ globalShortcut, context, send, toggleZoom }) {
  const allowed = () => {
    const c = context();
    return Boolean(c.active) && (c.focused ? !c.blocked : Boolean(c.background && !c.otherWindowFocused));
  };
  return {
    allowed,
    refresh() {
      globalShortcut.unregisterAll();
      const c = { ...context() };
      if (!c.modifier || !allowed()) return [];
      const failed = [];
      const reg = (key, action) => {
        const accelerator = `${c.modifier}+${key}`;
        if (!globalShortcut.register(accelerator, () => {
          const current = context();
          if (allowed() && current.modifier === c.modifier) action();
        })) failed.push(accelerator);
      };
      reg('0', () => send({ toggleRecord: true, keyboard: true }));
      reg('9', () => send({ togglePause: true, keyboard: true }));
      for (let n = 1; n <= 8; n++) reg(String(n), () => send({ layout: n, keyboard: true }));
      reg('M', toggleZoom);
      return failed;
    },
  };
}

module.exports = { createRecordingShortcuts };
