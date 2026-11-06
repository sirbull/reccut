# Design phase 1: completion and verification

Date: 2026-11-02

Phase 1 is implemented and functionally verified on macOS. This closes tasks 1.1 through 1.11 for the current development build. It does not mark phases 0, 2 through 8, or the final release review complete.

## What changed during completion

- Design rejects Edit-only commands and their native menu actions. Timeline import, sequence settings and video export no longer take over the Design room. Record and Export keep their existing routing.
- Place Embedded and Place Linked replace the extra placement question. The main split-button action follows the import-copy preference; Alt reverses it for drops. Linked image layers have a link indicator and Relink actions.
- Design uses Move Tool, Type Tool, Free Transform, Character, Paragraph, Tracking, Leading, All Caps, Canvas Size, Export As and Quick Export as PNG terminology.
- Cmd/Ctrl J duplicates a layer; Cmd/Ctrl D deselects. Cut, Copy, Paste, Delete, Select All, Undo and Redo route to Design. Layer clipboard transfer is supported within the same project. Cross-project clipboard transfer remains phase 3.
- Clipboard images use the installed Electron 45 asynchronous clipboard-item API in the main process, avoiding renderer clipboard permission failures. PNG placement and asset registration undo together.
- Source-video previews use the video's own dimensions. Captured frames retain their complete image and aspect ratio, following the user's correction to the original cover/crop default.
- The frame picker reuses existing cached thumbnails for its filmstrip, and uses the slider alone when none are available. Its resize observer schedules canvas updates outside observer delivery.
- Project switches clear old folder references before importing assets. Restoring a project snapshot restores Design data and clears stale Design history. Save As and project reopening retain design assets.
- Quick Export as PNG retains the canvas background and its intended transparency. Export scale controls no longer change width merely to select custom mode. Read-only destinations have a clear inline error.
- Missing images draw a bounded gray checkerboard. Select All includes hidden unlocked layers and excludes locked layers.

## Task acceptance

| Task | Result and evidence |
|---|---|
| 1.1 Data and persistence | Passed. Legacy project without Design fields opened and saved with empty fields. Pure tests cover malformed values, geometry, hit testing and sizes. Filesystem tests cover relative asset paths and moved project folders. |
| 1.2 Room and history | Passed. Title-bar and room commands work. Design menu state is checked. Edit commands are refused in Design. Mac and Windows shortcut conflict checks pass. Actual native Arrow Right moved a selected layer one pixel. Undo isolation, reopening and snapshot restoration are covered by application and state tests. |
| 1.3 New designs and list | Passed. Every size card created a design through the dialog and creation undid correctly. Custom 333x777, aspect lock, swap and invalid empty name were exercised. Rename, duplicate, confirmed delete, Canvas Size and their undo operations passed. |
| 1.4 Canvas and transforms | Passed. Native pointer gestures exercised all eight handles on a 30-degree rotated image in all four flip combinations. The opposite anchor remained fixed and each drag undid in one step. Image aspect lock, Shift release, Alt center resizing, snapped rotation, Smart Guides, Meta bypass, marquee, selection toggles, locks, zoom, wheel/scroll, Hand Tool and Space-drag passed. |
| 1.5 Type and rectangles | Passed. On-canvas Type Tool creation, Unicode/emoji and long-word editing, empty-text deletion and undo passed. Native Shift-drag created a square rectangle. Pure layout tests include blank text, long words, wrapping, minimum font size and explicit overflow for text that cannot fit at 6 px. |
| 1.6 Frames | Passed. The independent picker steps by frame and by second, reuses cached thumbnails and captures full-quality frames. Empty/audio-only timelines disable capture. A missing source produced the Media Offline card and warning. Native-source geometry and capture completion races have regression tests. Full-frame square/portrait placement is covered by capture tests and the earlier square-video application check. |
| 1.7 Images | Passed. Embedded and linked placement went through the actual IPC dialog handler and filesystem. SVG decoded correctly; a PSD was flattened by the actual PSD parser. Corrupt PNG added nothing. From Project retained a media reference. Relinking updated shared references. Native file drop, Alt reversal, clipboard PNG and same-project layer Cut/Copy/Paste passed. |
| 1.8 Layers | Passed. Range selection, Cmd toggle, rename, hide, lock, native drag reordering and context-menu actions passed with undo. Native drag testing used Chromium drag interception followed by dragEnter/dragOver/drop, rather than treating an HTML drag as ordinary pointer movement. |
| 1.9 Properties | Passed. Position, size, rotation, flips, opacity, font, weight, size, Tracking, Leading, paragraph alignment, vertical alignment, All Caps, autofit, color and mixed-selection editing passed. Each field/drag undid once. Design name, background/transparency and image fit/reset crop were also exercised. The system font API returned installed fonts successfully. |
| 1.10 Export | Passed. The real dialog saved JPEG under 2 MB and PNG/WebP with transparent corner pixels. JPEG flattened transparency to white. A PNG matched the shared renderer pixel for pixel. Unique names and emoji were checked. Quick PNG retained its canvas background. A read-only folder showed a clear error and left no partial file. |
| 1.11 Packaging | Passed. A real screen/camera recording, captured frame, embedded asset, Design-only Edit image and Arial type layer were packaged through the dialog. Original assets and the recording directory were made unavailable, the package was moved, and it reopened with no missing designs/images/media. The report listed design files and fonts. Unit/filesystem tests additionally cover cutout masks, unused assets and trim protection. |

## Complete workflow

A synthetic screen and camera were recorded through the real recording engine, file writing and finalization pipeline. The recording was imported, trimmed in Edit, captured in Design and combined with a title. JPEG export succeeded under 2 MB. Packaging and moving the project retained its recording, frame, embedded image, shared Edit image and font report. Design and Edit undo remained separate.

Synthetic sources avoid capturing personal desktop content or the physical camera during automation. This verifies the recording-to-Design pipeline, not device permissions or physical camera hardware.

## Unusual-use checks

| Case | Result |
|---|---|
| Empty timeline | Capture disabled with the specified message; placing an image still worked. |
| Audio-only project | Capture disabled. |
| Offline source | Test-card frame captured successfully and a Media Offline warning appeared. |
| Source clip deleted after capture | Existing independent PNG remained intact, verified in the first implementation workflow. |
| 8192x8192, 1x1, 100x2000 canvases | Editor remained bounded by viewport size. A 1x1 design exported at exactly 1x1. |
| 50 MP JPEG | A real 10000x5000 JPEG decoded and exported using the original image; preview was 4096x2048. The simple fixture completed import plus thumbnail export in about 285 ms. This is not a general performance budget. |
| Corrupt image / text renamed PNG | Rejected without adding an asset or layer. |
| Unsaved project | Copied asset went into the base Designs/Assets folder, then survived Save As and reopen with no missing images. |
| Previous version | Installed and built copies found were both version 0.9.0. No distinct older release was available for a separate application launch. Legacy-format load/save compatibility is covered. |
| Undo after switching rooms | Each room affected its own state. Reopening cleared both stacks. |
| HEIC | An HEIC fixture was rejected by Chromium image decoding on this machine. HEIC remains excluded from the picker, as permitted by the plan's conditional platform support. |
| Multiple windows | Outside the phase 1 requirement. |

## Validation environment and remaining release checks

- `npm test`: all 384 tests passed, none skipped.
- `npm run build`: passed.
- `git diff --check`: passed.
- No npm dependencies, project-format version or app version were changed.
- Distribution builds and Windows/Linux application runs belong to the later release review and were not performed here.
- D1 remains open: Design has no room shortcut; Cmd/Ctrl 4 remains Video Inspector. Cmd/Ctrl 1 remains Record, so the Design 100% command has no shortcut. No shared shortcut was moved.
- Ordinary startup in this QA environment still triggers the existing `uiohook-napi` native keyboard-hook crash. Application checks used an isolated profile and a temporary preload disabling that hook. Production recording code and the launcher were not changed for this workaround.
- ResizeObserver loop notifications were reproduced while switching only Record and Edit with zero designs. The callbacks were the existing viewer/timeline layout observers. They are recorded as an existing Edit-layout issue, rather than hidden or suppressed in the application. Design's frame-picker observer was made asynchronous. No other unhandled application errors remained in the checked workflows.

Temporary fixtures, screenshots and JSON check results were kept under `/tmp/reccut-phase1`. Clipboard testing used the real system clipboard. Cleanup failed: Electron refuses writing ClipboardItems returned directly by read(), and the QA process closed before the snapshot could be converted to writable items. The original clipboard content was not recovered. This is a QA cleanup failure; the application uses writeText for copied layers and only reads image ClipboardItems. The final build uses the normal entry point without QA globals or instrumentation.
