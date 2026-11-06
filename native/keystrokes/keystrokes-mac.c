// Reccut Keystroke Add-on for macOS. See README.md.
// Reads key presses with a listen-only event tap and writes what filter.h allows to stdout only.
// macOS turns the tap off by itself in password fields (Secure Input).
#include <ApplicationServices/ApplicationServices.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include "filter.h"

static CFMachPortRef tap;

static const char *keyName(CGKeyCode k) {
  static const char *names[128] = {
    [0] = "A", [1] = "S", [2] = "D", [3] = "F", [4] = "H", [5] = "G", [6] = "Z", [7] = "X",
    [8] = "C", [9] = "V", [11] = "B", [12] = "Q", [13] = "W", [14] = "E", [15] = "R",
    [16] = "Y", [17] = "T", [18] = "1", [19] = "2", [20] = "3", [21] = "4", [22] = "6",
    [23] = "5", [24] = "Equal", [25] = "9", [26] = "7", [27] = "Minus", [28] = "8", [29] = "0",
    [30] = "BracketRight", [31] = "O", [32] = "U", [33] = "BracketLeft", [34] = "I", [35] = "P",
    [36] = "Enter", [37] = "L", [38] = "J", [39] = "Quote", [40] = "K", [41] = "Semicolon",
    [42] = "Backslash", [43] = "Comma", [44] = "Slash", [45] = "N", [46] = "M", [47] = "Period",
    [48] = "Tab", [49] = "Space", [50] = "Backquote", [51] = "Backspace", [53] = "Escape",
    [64] = "F17", [65] = "NumpadDecimal", [67] = "NumpadMultiply", [69] = "NumpadAdd",
    [75] = "NumpadDivide", [76] = "Enter", [78] = "NumpadSubtract", [79] = "F18", [80] = "F19",
    [81] = "NumpadEqual", [82] = "Numpad0", [83] = "Numpad1", [84] = "Numpad2", [85] = "Numpad3",
    [86] = "Numpad4", [87] = "Numpad5", [88] = "Numpad6", [89] = "Numpad7", [90] = "F20",
    [91] = "Numpad8", [92] = "Numpad9", [96] = "F5", [97] = "F6", [98] = "F7", [99] = "F3",
    [100] = "F8", [101] = "F9", [103] = "F11", [105] = "F13", [106] = "F16", [107] = "F14",
    [109] = "F10", [111] = "F12", [113] = "F15", [115] = "Home", [116] = "PageUp",
    [117] = "Delete", [118] = "F4", [119] = "End", [120] = "F2", [121] = "PageDown", [122] = "F1",
    [123] = "ArrowLeft", [124] = "ArrowRight", [125] = "ArrowDown", [126] = "ArrowUp",
  };
  return k < 128 ? names[k] : NULL;
}

static const char *modifierName(CGKeyCode k, CGEventFlags *mask) {
  switch (k) {
    case 56: case 60: *mask = kCGEventFlagMaskShift; return "Shift";
    case 59: case 62: *mask = kCGEventFlagMaskControl; return "Control";
    case 58: case 61: *mask = kCGEventFlagMaskAlternate; return "Alt";
    case 54: case 55: *mask = kCGEventFlagMaskCommand; return "Meta";
  }
  return NULL;
}

static const char *mouseName(CGEventType type, CGEventRef e) {
  switch (type) {
    case kCGEventLeftMouseDown: case kCGEventLeftMouseUp: return "MouseLeft";
    case kCGEventRightMouseDown: case kCGEventRightMouseUp: return "MouseRight";
    case kCGEventOtherMouseDown: case kCGEventOtherMouseUp:
      return CGEventGetIntegerValueField(e, kCGMouseEventButtonNumber) == 2 ? "MouseMiddle" : NULL;
    default: return NULL;
  }
}

static CGEventRef onEvent(CGEventTapProxy proxy, CGEventType type, CGEventRef e, void *ref) {
  (void)proxy; (void)ref;
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    CGEventTapEnable(tap, true);
    return e;
  }
  const char *button = mouseName(type, e);
  if (button) {
    if (optMouse) press(button, type == kCGEventLeftMouseDown || type == kCGEventRightMouseDown || type == kCGEventOtherMouseDown);
    return e;
  }
  CGKeyCode code = (CGKeyCode)CGEventGetIntegerValueField(e, kCGKeyboardEventKeycode);
  CGEventFlags f = CGEventGetFlags(e);
  if (type == kCGEventFlagsChanged) {
    CGEventFlags mask = 0;
    const char *modifier = modifierName(code, &mask);
    if (modifier && optGame) press(modifier, (f & mask) != 0);
    return e;
  }
  const char *name = keyName(code);
  if (!name) return e;
  if (type == kCGEventKeyUp) {
    if (optGame && gameKey(name)) press(name, 0);
    return e;
  }
  if (type != kCGEventKeyDown || CGEventGetIntegerValueField(e, kCGKeyboardEventAutorepeat)) return e;
  if (optGame && gameKey(name)) press(name, 1);
  if (!optShortcuts) return e;
  int ctrl = (f & kCGEventFlagMaskControl) != 0;
  int alt = (f & kCGEventFlagMaskAlternate) != 0;
  int shift = (f & kCGEventFlagMaskShift) != 0;
  int cmd = (f & kCGEventFlagMaskCommand) != 0;
  int standalone = !strcmp(name, "Escape") || (name[0] == 'F' && name[1] >= '1' && name[1] <= '9');
  // Option alone types characters (for example | [ ] on Nordic keyboards). Only shortcuts leave this program.
  if (!ctrl && !cmd && !standalone) return e;
  printf("K %s %d\n", name, (ctrl ? 1 : 0) | (alt ? 2 : 0) | (shift ? 4 : 0) | (cmd ? 8 : 0));
  fflush(stdout);
  return e;
}

// Reccut holds stdin open. When it closes (Reccut stopped or quit), so does this program.
static void *watchStdin(void *arg) {
  (void)arg;
  char buf[64];
  while (read(0, buf, sizeof buf) > 0) {}
  _exit(0);
  return NULL;
}

int main(int argc, char **argv) {
  if (argc > 1 && !strcmp(argv[1], "--check")) {
    puts(CGPreflightListenEventAccess() ? "granted" : "denied");
    return 0;
  }
  if (argc > 1 && !strcmp(argv[1], "--request")) {
    puts(CGRequestListenEventAccess() ? "granted" : "denied");
    return 0;
  }
  readOptions(argc, argv);
  // The tap only asks for what this recording uses. With mouse alone it never sees a key.
  CGEventMask events = 0;
  if (optShortcuts || optGame) events |= CGEventMaskBit(kCGEventKeyDown);
  if (optGame) events |= CGEventMaskBit(kCGEventKeyUp) | CGEventMaskBit(kCGEventFlagsChanged);
  if (optMouse) {
    events |= CGEventMaskBit(kCGEventLeftMouseDown) | CGEventMaskBit(kCGEventLeftMouseUp) |
              CGEventMaskBit(kCGEventRightMouseDown) | CGEventMaskBit(kCGEventRightMouseUp) |
              CGEventMaskBit(kCGEventOtherMouseDown) | CGEventMaskBit(kCGEventOtherMouseUp);
  }
  tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly,
                         events, onEvent, NULL);
  if (!tap) {
    puts("E permission");
    fflush(stdout);
    return 2;
  }
  pthread_t t;
  pthread_create(&t, NULL, watchStdin, NULL);
  CFRunLoopSourceRef src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
  CFRunLoopAddSource(CFRunLoopGetCurrent(), src, kCFRunLoopCommonModes);
  CGEventTapEnable(tap, true);
  puts("READY");
  fflush(stdout);
  CFRunLoopRun();
  return 0;
}
