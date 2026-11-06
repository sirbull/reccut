// Shared by the three helpers. This file decides what may leave the program.
#include <stdio.h>
#include <string.h>

static int optShortcuts = 1, optGame = 0, optMouse = 0;

static void readOptions(int argc, char **argv) {
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--no-shortcuts")) optShortcuts = 0;
    if (!strcmp(argv[i], "--game")) optGame = 1;
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

static int gameKey(const char *name) {
  for (size_t i = 0; i < sizeof GAME_KEYS / sizeof *GAME_KEYS; i++) {
    if (!strcmp(name, GAME_KEYS[i])) return 1;
  }
  return 0;
}

static void press(const char *name, int down) {
  printf("%c %s\n", down ? 'D' : 'U', name);
  fflush(stdout);
}
