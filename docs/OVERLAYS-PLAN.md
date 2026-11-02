# Input overlays: implementation plan

Two overlays that show what the user presses while recording:

1. **Keyboard and mouse**: a compact gaming keyboard (Esc, 1 to 5, Tab Q W E R T, Caps A S D F G, Shift Z X C V B, Ctrl Alt Space) and a mouse with left, right and middle buttons and the wheel. Pressed keys light up.
2. **Game controller**: sticks that move, triggers that fill, and buttons that light up. Looks: Xbox style, PlayStation style or generic. Face labels: ABXY or shapes, chosen separately from the look.

Both are recorded as event data and drawn at render time, like keystrokes, clicks and cursor zoom today. Each overlay is its own linked clip on a track above the recording, so it can be turned on or off, moved and scaled after recording.

This plan was written on a machine where it could not be finished. Windows Defender flagged `node_modules/electron/dist/electron.exe` as `Trojan:Win32/Cinjo.O!cl` (cloud heuristic, very likely a false positive) after the app was launched with remote debugging from Playwright, and then blocked Electron. No game controller was available. **Ship an overlay only when it works end to end in the running app.** If a part cannot be made to work well, leave it out and write down why.

## What is already verified

- `uiohook-napi` (already a dependency, used by `src/main/input.js`) reports `keydown` and `keyup` for every key with correct timing, also for keys that are not shortcuts, and also for injected input. Tested in plain Node on Windows 11: F13 held for 250 ms gave down at 316 ms and up at 572 ms. Shift down and up were also reported.
- Key codes from `UiohookKey` are physical positions (scan codes), so W A S D sit in the same place on Norwegian and US layouts. `UiohookKey.W` is 17, `Space` is 57.
- `@kmamal/sdl` 0.11.13 exists on npm (SDL bindings for Node). Not tested.

## How the code works today

- `src/main/input.js` `InputTracker.onKey` records only shortcuts, on purpose, so typed text and passwords never end up in a recording. Events go into `this.session` (`cursor`, `zooms`, `clicks`, `keys`) and are returned by `endSession()`.
- `src/main/main.js` `removePauses()` (around line 495) cuts paused time out of `cursor`, `clicks` and `keys`. `recording.json` is written after that.
- `src/main/media.js` `recordingMedia()` copies the event lists into `media.rec`.
- `src/shared/model.js` `keysAt`, `clicksAt`, `cursorAt` read events at source time `s`. `src/shared/render.js` `drawRecording()` draws them.
- Linked tracks: the PiP clip is a `recording` clip with `recordingPart: 'camera'` and `linkedTo` the screen clip. `src/shared/ops.js` `syncRecordingTracks()` copies timing (`start`, `in`, `dur`, `speed`, `ramp`, `reverse`, `freezeAt`) from the parent and keeps the child on a higher lane. `splitClip()` splits children through `recordingChildren()`. `timingChildren()` is used for keyframe shifts and locking.
- Side by side (layouts 7 and 8) is drawn in `drawRecording()`. Overlays must sit on top of it.

## Part 1: keyboard and mouse

### 1.1 Recording

- New recorder setting `recordAllInput` (default off) in `src/renderer/recorder/settings.js`, with a toggle under Overlays in `Recorder.jsx`: "Record all keys and mouse buttons". Hint: "Everything you type is saved with the recording, including passwords. Use it for games and keyboard tutorials." Send it to main the same way `setZoomKey` is sent.
- In `InputTracker`, when enabled, push `[t, name, 1]` on `keydown` and `[t, name, 0]` on `keyup` into `session.input`. Use the raw `UiohookKey` name (`'W'`, `'Space'`, `'Shift'`, `'Ctrl'`). Ignore key repeat: only push a down when the key is not already down.
- Mouse: listen to `mousedown` and `mouseup` and push `['Mouse1' | 'Mouse2' | 'Mouse3']` the same way (`e.button` 1 left, 2 right, 3 middle). `wheel`: push `[t, e.rotation < 0 ? 'WheelUp' : 'WheelDown', 1]` and nothing on release.
- When recording stops or pauses, close every key that is still down with a `0` event at that time.
- `removePauses()`: trim `input` like `keys`, and make sure a key that is down across a pause gets an up at the pause start and a down at the resume.
- `recordingMedia()`: add `input: rec.input || []` to `media.rec`.

### 1.2 Model

- `pressedAt(input, s)` in `model.js`: build once per events array (cache in a `WeakMap`) a map from key name to `[[down, up], ...]`, then look up with binary search. Return a `Map` of name to a value 0 to 1: 1 while held, then fading to 0 over 0.08 s after release. Wheel events count as held for 0.15 s.
- New linked clip: `type: 'recording'`, `recordingPart: 'input'`, `linkedTo` the screen clip (or the full recording clip). Before choosing this, check every `recordingPart` branch in `model.js`, `ops.js`, `render.js`, `srt.js`, `attributes.js`, `commands.js`, `Inspector.jsx` and `Timeline.jsx`. Many test `recordingPart !== 'camera'` or `!== 'screen'` and would wrongly draw video, mix audio or show camera settings for an input clip. `visualStreams` already returns nothing for it. `clipHasAudio`, `audioComponents` and `speechSources` must return nothing. If too many branches leak, use a new clip type `'input'` with `mediaId` and `linkedTo` instead, and add it to `isVisual`, `drawClip` and the timeline.
- Generalise linking in `ops.js`: a `linkedChildren(project, id)` for all linked parts, used by `splitClip`, `timingChildren`, `syncRecordingTracks`, the anchor skip in `withSync`, `recordingEditId` and slip. Keep `recordingChildren()` meaning the PiP only, since the Inspector and PiP commands depend on that.
- Props: `inputKeyboard: true`, `inputMouse: true`, `inputAccent: '#2f6fff'`, `inputStyle: 'outline'`. Position and size use the normal clip `x`, `y`, `scale`. Default placement: bottom left, about 22% of the frame width.
- Command "Show Input Overlay on Separate Track" (clip context menu and Inspector › Recording › Overlays) when `media.rec.input?.length`. Do not add it automatically.

### 1.3 Drawing

- `drawInputOverlay(ctx, pressed, props, W, H)` in `render.js`, called from `drawClip` for the input clip. Rounded key outlines, white at 70% opacity; pressed keys filled with the accent colour and the label in white. Mouse drawn with canvas paths, not an image. All sizes relative to `H`, so preview and export match.
- Layout as data (rows of `{ name, label, w }`), so a full keyboard can be added later without new drawing code.

### 1.4 Tests and manual checks

- Tests: `pressedAt` (hold, release fade, repeat ignored, wheel), `removePauses` with held keys, split and trim keep the input clip in sync, no audio or speech from the input clip.
- In the running app: record a game or Notepad for 20 s with the setting on, hold W and D together, click left and right, scroll. Check in the editor that the overlay matches the video frame by frame at 0.25x speed. Export and check the file. Check that with the setting off, nothing beyond shortcuts is recorded.

## Part 2: game controller

### 2.1 Spike first (stop here if it fails)

The browser Gamepad API in Electron gives data only while the Reccut window has focus. During recording the game has focus, so it is not usable. Before writing any UI, prove this in the main process:

1. `npm i @kmamal/sdl`, add it to `asarUnpack` like `uiohook-napi`. Check that it loads in Electron 45 (`require` in `src/main`).
2. Set the SDL hint for background joystick events (`SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS=1`) before opening controllers. Open the first controller with `sdl.controller.openDevice`.
3. With a game in focus, log button and axis events for 30 s. Test an Xbox controller and a DualSense or DualShock 4, over USB and Bluetooth, on Windows and macOS. On macOS check whether Input Monitoring permission is needed.
4. Check that the game still gets the input (SDL must not take the device exclusively), and that latency is under one frame at 60 fps.

If any of this fails on a platform, do not ship the controller overlay for that platform.

### 2.2 Recording format

- Sample at 60 Hz while recording, and only push when something changes: `[t, buttons, lx, ly, rx, ry, lt, rt]`. `buttons` is a bit mask by position, not by brand: south, east, west, north, L1, R1, L3, R3, back, start, guide, dpad up, down, left, right, touchpad. Axes rounded to 3 decimals, `-1..1`; triggers `0..1`.
- Saved as `rec.pad` with the same pause handling as `input`. Store `rec.padType` from SDL (`xbox`, `ps4`, `ps5`, other) as the default look only.

### 2.3 Drawing

- Linked clip `recordingPart: 'pad'` (same linking as part 1), props `padLook: 'xbox' | 'playstation' | 'generic'` and `padLabels: 'abxy' | 'shapes' | 'none'`. Both can be changed after recording, since data is stored by position.
- Xbox look: left stick upper left, D-pad lower left. PlayStation and generic: D-pad upper left, sticks below and symmetric. Sticks drawn as a circle with a dot at the axis position; triggers as bars that fill; L3 and R3 light the stick.
- Draw generic outlines and the letter or shape symbols only. No brand logos.
- `padAt(pad, s)`: binary search to the last sample, linear interpolation of axes to the next sample if it is less than 50 ms away.

### 2.4 Tests and manual checks

- Tests: `padAt` interpolation, bit mask decoding, pause trimming.
- In the running app: record a game with each controller, check stick circles and buttons against the video at 0.25x speed, switch look and labels in the editor, and export.

## Out of scope

- Live overlay in the Record room preview. Add it only after the editor version works.
- Remapping, custom layouts and images of real controllers.
