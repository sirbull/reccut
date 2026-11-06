# Reccut Keystroke Add-on

A small helper program that shows keyboard shortcuts, and optionally game keys
and mouse buttons, in Reccut recordings.
It is **not** part of the Reccut installer. Reccut downloads it from the
GitHub release for the same version only when the user asks for it, after a
dialog that explains what it does.

## What it does

- Reads the keyboard for the whole system, also when other apps are in focus.
  This uses the same operating system feature as keyloggers
  (`WH_KEYBOARD_LL` on Windows, an event tap on macOS, XRecord on Linux),
  which is why it is kept out of the installer.
- Runs only while Reccut is recording with "Show keystrokes" turned on.
  Reccut starts it when the recording starts and stops it when it ends.
  It also quits by itself as soon as Reccut closes its input.
- Writes shortcuts to its standard output and nowhere else. It never writes
  files, never uses the network and never stores anything.
- Filters before anything leaves the program: by default only keys pressed
  together with Ctrl, Cmd or Alt (not Option alone on macOS, not AltGr), plus
  Esc and F1 to F24. Normal typing, Shift combinations and key repeats are
  dropped.
- With `--game` it also sends press and release of the left keyboard half
  (`GAME_KEYS` in [filter.h](filter.h)). This lets letters out, so Reccut only
  passes the flag after a separate consent, stored in `addon.json`. The right
  half stays behind the shortcut filter.
- With `--full-keyboard` it sends the rest of the keyboard as well (`FULL_KEYS`).
  This is nearly all typing, so it has a consent of its own. The numeric keypad,
  Home, End, Page Up, Page Down, Insert and F13 to F24 stay behind the shortcut filter.
- With `--mouse` it sends press and release of the mouse buttons, never the position.
- It only asks the system for what the flags need. With `--mouse --no-shortcuts`
  it does not read the keyboard at all.

For an agent working on a Mac, see [MAC-AGENT.md](MAC-AGENT.md).

Reccut saves what it receives in the recording file (`recording.json`: `keys`
for shortcuts, `inputs` for presses), so they can be shown, hidden or cut in Edit.
Controllers do not use this program. Reccut reads them with the Gamepad API.

## Protocol

```
reccut-keystrokes [--no-shortcuts] [--game | --full-keyboard] [--mouse]    run until stdin closes
reccut-keystrokes --check    prints granted, denied or unavailable
reccut-keystrokes --request  macOS: asks for Input Monitoring, then prints the state
```

While running, each line on stdout is one of:

```
READY                 listening
K <name> <mods>       a shortcut; mods: 1 Ctrl, 2 Alt/Option, 4 Shift, 8 Cmd/Win
D <name>              pressed (--game, --full-keyboard or --mouse)
U <name>              released (--game, --full-keyboard or --mouse)
E permission          macOS: Input Monitoring is not allowed
E unavailable         no keyboard source (for example Wayland without X11)
```

Key names follow physical US key names: `A` to `Z`, `0` to `9`, `F1` to `F24`,
`Enter`, `Escape`, `Backspace`, `Delete`, `Tab`, `Space`, `ArrowLeft`,
`Semicolon`, `Numpad1` and so on. Esc and the F keys sent as `D` are not sent as
`K` too, unless a modifier is held. `--game` adds `Shift`, `Control`, `Alt` and
`Meta`. Mouse buttons are `MouseLeft`, `MouseRight` and `MouseMiddle`.

## Building

```
# Windows (MinGW or MSYS2)
gcc -O2 -s -o reccut-keystrokes-win-x64.exe keystrokes-win.c -luser32
# macOS (universal)
clang -O2 -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 -o reccut-keystrokes-mac keystrokes-mac.c -framework ApplicationServices
# Linux (needs libx11-dev and libxtst-dev)
gcc -O2 -s -o reccut-keystrokes-linux-x64 keystrokes-linux.c -lX11 -lXtst -lpthread
```

The release workflow (`.github/workflows/build.yml`) builds all three and
attaches each file with a `.sha256` file to the release. Reccut checks the
checksum before it uses the file, and again every time it starts it.
