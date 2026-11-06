// Shared by the three helpers. This file decides what may leave the program.
#include <stdio.h>
#include <string.h>

static int optShortcuts = 1, optGame = 0, optFull = 0, optMouse = 0;

static void readOptions(int argc, char **argv) {
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--no-shortcuts")) optShortcuts = 0;
    if (!strcmp(argv[i], "--game")) optGame = 1;
    if (!strcmp(argv[i], "--full-keyboard")) optGame = optFull = 1;
    if (!strcmp(argv[i], "--mouse")) optMouse = 1;
  }
}

// The left half of the keyboard, for games. Only with --game, and every other key stays
// behind the shortcut filter. test/keystrokes.test.mjs holds this list to the overlay.
static const char *const GAME_KEYS[] = {
  "1", "2", "3", "4", "5",
  "Q", "W", "E", "R", "T",
  "A", "S", "D", "F", "G",
  "Z", "X", "C", "V", "B",
  "Tab", "Space", "Shift", "Control", "Alt", "Meta",
};

// The rest of the keyboard, only with --full-keyboard. The numeric keypad, Home, End and the
// other keys the overlay does not draw stay behind the shortcut filter.
static const char *const FULL_KEYS[] = {
  "Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Delete",
  "Backquote", "6", "7", "8", "9", "0", "Minus", "Equal", "Backspace",
  "Y", "U", "I", "O", "P", "BracketLeft", "BracketRight", "Backslash",
  "H", "J", "K", "L", "Semicolon", "Quote", "Enter",
  "N", "M", "Comma", "Period", "Slash",
  "ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight",
};

static int gameKey(const char *name) {
  for (size_t i = 0; i < sizeof GAME_KEYS / sizeof *GAME_KEYS; i++) {
    if (!strcmp(name, GAME_KEYS[i])) return 1;
  }
  for (size_t i = 0; optFull && i < sizeof FULL_KEYS / sizeof *FULL_KEYS; i++) {
    if (!strcmp(name, FULL_KEYS[i])) return 1;
  }
  return 0;
}

static void press(const char *name, int down) {
  printf("%c %s\n", down ? 'D' : 'U', name);
  fflush(stdout);
}
