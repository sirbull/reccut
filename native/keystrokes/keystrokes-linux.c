// Reccut Keystroke Add-on for Linux (X11). See README.md.
// Reads key presses with the XRecord extension and writes shortcuts to stdout only.
// Wayland sessions do not allow this; the program then reports "E unavailable".
#include <X11/XKBlib.h>
#include <X11/Xlib.h>
#include <X11/Xproto.h>
#include <X11/extensions/record.h>
#include <X11/keysym.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static Display *ctrlDpy;
static int ctrl, alt, shift, super, altgr;

static const char *keyName(KeySym s, char *buf) {
  if (s >= XK_a && s <= XK_z) { buf[0] = (char)(s - XK_a + 'A'); buf[1] = 0; return buf; }
  if (s >= XK_A && s <= XK_Z) { buf[0] = (char)s; buf[1] = 0; return buf; }
  if (s >= XK_0 && s <= XK_9) { buf[0] = (char)s; buf[1] = 0; return buf; }
  if (s >= XK_F1 && s <= XK_F24) { snprintf(buf, 8, "F%d", (int)(s - XK_F1 + 1)); return buf; }
  if (s >= XK_KP_0 && s <= XK_KP_9) { snprintf(buf, 12, "Numpad%d", (int)(s - XK_KP_0)); return buf; }
  switch (s) {
    case XK_Return: case XK_KP_Enter: return "Enter";
    case XK_Escape: return "Escape";
    case XK_BackSpace: return "Backspace";
    case XK_Delete: return "Delete";
    case XK_Tab: case XK_ISO_Left_Tab: return "Tab";
    case XK_space: return "Space";
    case XK_Left: return "ArrowLeft";
    case XK_Right: return "ArrowRight";
    case XK_Up: return "ArrowUp";
    case XK_Down: return "ArrowDown";
    case XK_Prior: return "PageUp";
    case XK_Next: return "PageDown";
    case XK_Home: return "Home";
    case XK_End: return "End";
    case XK_Insert: return "Insert";
    case XK_semicolon: return "Semicolon";
    case XK_equal: return "Equal";
    case XK_comma: return "Comma";
    case XK_minus: return "Minus";
    case XK_period: return "Period";
    case XK_slash: return "Slash";
    case XK_grave: return "Backquote";
    case XK_bracketleft: return "BracketLeft";
    case XK_bracketright: return "BracketRight";
    case XK_backslash: return "Backslash";
    case XK_apostrophe: return "Quote";
    case XK_KP_Multiply: return "NumpadMultiply";
    case XK_KP_Add: return "NumpadAdd";
    case XK_KP_Subtract: return "NumpadSubtract";
    case XK_KP_Decimal: return "NumpadDecimal";
    case XK_KP_Divide: return "NumpadDivide";
  }
  return NULL;
}

// Returns 1 for modifier keys and updates the held state.
static int modifier(KeySym s, int pressed) {
  switch (s) {
    case XK_Control_L: case XK_Control_R: ctrl = pressed; return 1;
    case XK_Alt_L: case XK_Meta_L: alt = pressed; return 1;
    case XK_Shift_L: case XK_Shift_R: shift = pressed; return 1;
    case XK_Super_L: case XK_Super_R: super = pressed; return 1;
    case XK_ISO_Level3_Shift: case XK_Mode_switch: case XK_Alt_R: altgr = pressed; return 1;
  }
  return 0;
}

static void onData(XPointer closure, XRecordInterceptData *d) {
  (void)closure;
  if (d->category == XRecordFromServer && d->data) {
    const unsigned char *raw = d->data;
    int type = raw[0] & 0x7f;
    KeyCode code = raw[1];
    if (type == KeyPress || type == KeyRelease) {
      KeySym s = XkbKeycodeToKeysym(ctrlDpy, code, 0, 0);
      int pressed = type == KeyPress;
      if (!modifier(s, pressed) && pressed && !altgr) {
        char buf[16];
        const char *name = keyName(s, buf);
        int standalone = s == XK_Escape || (s >= XK_F1 && s <= XK_F24);
        // Only shortcuts leave this program. Normal typing is dropped here.
        if (name && (ctrl || alt || super || standalone)) {
          printf("K %s %d\n", name, (ctrl ? 1 : 0) | (alt ? 2 : 0) | (shift ? 4 : 0) | (super ? 8 : 0));
          fflush(stdout);
        }
      }
    }
  }
  XRecordFreeData(d);
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
  ctrlDpy = XOpenDisplay(NULL);
  Display *dataDpy = ctrlDpy ? XOpenDisplay(NULL) : NULL;
  int major, minor;
  int ok = dataDpy && XRecordQueryVersion(ctrlDpy, &major, &minor);
  if (argc > 1 && (!strcmp(argv[1], "--check") || !strcmp(argv[1], "--request"))) {
    puts(ok ? "granted" : "unavailable");
    return 0;
  }
  if (!ok) {
    puts("E unavailable");
    fflush(stdout);
    return 2;
  }
  XRecordRange *range = XRecordAllocRange();
  range->device_events.first = KeyPress;
  range->device_events.last = KeyRelease;
  XRecordClientSpec clients = XRecordAllClients;
  XRecordContext ctx = XRecordCreateContext(ctrlDpy, 0, &clients, 1, &range, 1);
  XSync(ctrlDpy, False);
  if (!ctx) {
    puts("E unavailable");
    fflush(stdout);
    return 2;
  }
  pthread_t t;
  pthread_create(&t, NULL, watchStdin, NULL);
  puts("READY");
  fflush(stdout);
  if (!XRecordEnableContext(dataDpy, ctx, onData, NULL)) {
    puts("E unavailable");
    fflush(stdout);
    return 2;
  }
  return 0;
}
