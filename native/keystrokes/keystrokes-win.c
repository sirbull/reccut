// Reccut Keystroke Add-on for Windows. See README.md.
// Reads the keyboard with a low-level hook and writes what filter.h allows to stdout only.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include "filter.h"

static DWORD mainThread;
static BYTE down[256];

static int isModifier(DWORD vk) {
  switch (vk) {
    case VK_SHIFT: case VK_LSHIFT: case VK_RSHIFT:
    case VK_CONTROL: case VK_LCONTROL: case VK_RCONTROL:
    case VK_MENU: case VK_LMENU: case VK_RMENU:
    case VK_LWIN: case VK_RWIN:
      return 1;
  }
  return 0;
}

static const char *keyName(DWORD vk, char *buf) {
  if ((vk >= 'A' && vk <= 'Z') || (vk >= '0' && vk <= '9')) {
    buf[0] = (char)vk;
    buf[1] = 0;
    return buf;
  }
  if (vk >= VK_F1 && vk <= VK_F24) {
    snprintf(buf, 8, "F%lu", (unsigned long)(vk - VK_F1 + 1));
    return buf;
  }
  if (vk >= VK_NUMPAD0 && vk <= VK_NUMPAD9) {
    snprintf(buf, 12, "Numpad%lu", (unsigned long)(vk - VK_NUMPAD0));
    return buf;
  }
  switch (vk) {
    case VK_RETURN: return "Enter";
    case VK_ESCAPE: return "Escape";
    case VK_BACK: return "Backspace";
    case VK_DELETE: return "Delete";
    case VK_TAB: return "Tab";
    case VK_SPACE: return "Space";
    case VK_LEFT: return "ArrowLeft";
    case VK_RIGHT: return "ArrowRight";
    case VK_UP: return "ArrowUp";
    case VK_DOWN: return "ArrowDown";
    case VK_PRIOR: return "PageUp";
    case VK_NEXT: return "PageDown";
    case VK_HOME: return "Home";
    case VK_END: return "End";
    case VK_INSERT: return "Insert";
    case VK_OEM_1: return "Semicolon";
    case VK_OEM_PLUS: return "Equal";
    case VK_OEM_COMMA: return "Comma";
    case VK_OEM_MINUS: return "Minus";
    case VK_OEM_PERIOD: return "Period";
    case VK_OEM_2: return "Slash";
    case VK_OEM_3: return "Backquote";
    case VK_OEM_4: return "BracketLeft";
    case VK_OEM_6: return "BracketRight";
    case VK_OEM_5: return "Backslash";
    case VK_OEM_7: return "Quote";
    case VK_MULTIPLY: return "NumpadMultiply";
    case VK_ADD: return "NumpadAdd";
    case VK_SUBTRACT: return "NumpadSubtract";
    case VK_DECIMAL: return "NumpadDecimal";
    case VK_DIVIDE: return "NumpadDivide";
  }
  return NULL;
}

static const char *modifierName(DWORD vk) {
  switch (vk) {
    case VK_LSHIFT: case VK_RSHIFT: return "Shift";
    case VK_LCONTROL: case VK_RCONTROL: return "Control";
    case VK_LMENU: return "Alt";
    case VK_LWIN: case VK_RWIN: return "Meta";
  }
  return NULL;
}

static void gamePress(DWORD vk, int pressed) {
  if (!optGame || (pressed && down[VK_RMENU])) return;
  char buf[16];
  const char *name = isModifier(vk) ? modifierName(vk) : keyName(vk, buf);
  if (name && gameKey(name)) press(name, pressed);
}

static void emit(DWORD vk) {
  if (!optShortcuts) return;
  // AltGr types characters such as @ { } on many keyboards. It is typing, not a shortcut.
  if (down[VK_RMENU]) return;
  int ctrl = down[VK_LCONTROL] || down[VK_RCONTROL];
  int alt = down[VK_LMENU];
  int shift = down[VK_LSHIFT] || down[VK_RSHIFT];
  int win = down[VK_LWIN] || down[VK_RWIN];
  char buf[16];
  const char *name = keyName(vk, buf);
  if (!name) return;
  int standalone = vk == VK_ESCAPE || (vk >= VK_F1 && vk <= VK_F24);
  // Only shortcuts leave this program. Normal typing is dropped here.
  // A key already sent as a press is not sent again as a shortcut of its own.
  if (!ctrl && !alt && !win && (!standalone || (optGame && gameKey(name)))) return;
  int mods = (ctrl ? 1 : 0) | (alt ? 2 : 0) | (shift ? 4 : 0) | (win ? 8 : 0);
  printf("K %s %d\n", name, mods);
  fflush(stdout);
}

static LRESULT CALLBACK onKey(int code, WPARAM wp, LPARAM lp) {
  if (code == HC_ACTION) {
    const KBDLLHOOKSTRUCT *k = (const KBDLLHOOKSTRUCT *)lp;
    DWORD vk = k->vkCode & 0xff;
    int pressed = wp == WM_KEYDOWN || wp == WM_SYSKEYDOWN;
    if (!pressed) {
      if (down[vk]) gamePress(vk, 0);
      down[vk] = 0;
    } else if (!down[vk]) {
      down[vk] = 1;
      gamePress(vk, 1);
      if (!isModifier(vk)) emit(vk);
    }
  }
  return CallNextHookEx(NULL, code, wp, lp);
}

static LRESULT CALLBACK onMouse(int code, WPARAM wp, LPARAM lp) {
  if (code == HC_ACTION) {
    switch (wp) {
      case WM_LBUTTONDOWN: press("MouseLeft", 1); break;
      case WM_LBUTTONUP: press("MouseLeft", 0); break;
      case WM_RBUTTONDOWN: press("MouseRight", 1); break;
      case WM_RBUTTONUP: press("MouseRight", 0); break;
      case WM_MBUTTONDOWN: press("MouseMiddle", 1); break;
      case WM_MBUTTONUP: press("MouseMiddle", 0); break;
    }
  }
  return CallNextHookEx(NULL, code, wp, lp);
}

// Reccut holds stdin open. When it closes (Reccut stopped or quit), so does this program.
static DWORD WINAPI watchStdin(LPVOID arg) {
  (void)arg;
  char buf[64];
  DWORD n;
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  while (ReadFile(in, buf, sizeof buf, &n, NULL) && n > 0) {}
  PostThreadMessage(mainThread, WM_QUIT, 0, 0);
  return 0;
}

int main(int argc, char **argv) {
  if (argc > 1 && (!strcmp(argv[1], "--check") || !strcmp(argv[1], "--request"))) {
    puts("granted");
    return 0;
  }
  mainThread = GetCurrentThreadId();
  MSG msg;
  PeekMessage(&msg, NULL, WM_USER, WM_USER, PM_NOREMOVE);
  readOptions(argc, argv);
  // Only the hooks this recording uses. With mouse alone no keyboard hook is installed.
  int keyboard = optShortcuts || optGame;
  HHOOK hook = keyboard ? SetWindowsHookExW(WH_KEYBOARD_LL, onKey, GetModuleHandleW(NULL), 0) : NULL;
  HHOOK mouse = optMouse ? SetWindowsHookExW(WH_MOUSE_LL, onMouse, GetModuleHandleW(NULL), 0) : NULL;
  if ((keyboard && !hook) || (optMouse && !mouse)) {
    puts("E unavailable");
    fflush(stdout);
    return 2;
  }
  HANDLE t = CreateThread(NULL, 0, watchStdin, NULL, 0, NULL);
  if (t) CloseHandle(t);
  puts("READY");
  fflush(stdout);
  while (GetMessage(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessage(&msg);
  }
  if (hook) UnhookWindowsHookEx(hook);
  if (mouse) UnhookWindowsHookEx(mouse);
  return 0;
}
