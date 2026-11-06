# Design redesign: Phase B QA

Validated on macOS on 2026-11-04. Covers all six Phase B items in [DESIGN-REDESIGN.md](DESIGN-REDESIGN.md), building on Phase A. App version: 0.9.0. This is local development, not a published release.

## Automated validation

- `npm test`: 500 tests pass, zero failures or skips.
- `npm run build`: passes.
- `git diff --check`: passes.
- `electron-builder --mac --dir --publish never`: passes. The packaged arm64 app opens the saved local project with all eight rail panels and no QA globals. With renderer network access disabled, For This Video produces six cards, palette apply works, and Search finds built-in arrows. The production layout was visually inspected.
- Twenty additional tests cover title/subtitle/badge sizing and fonts, editable element placement, palette roles and fallback, locked groups, targeted font/palette changes, transparent frame pixels, tag/role round trips, clearing an explicit color role, search ranking and Norwegian text, shared analysis caching/cancellation, original-quality frame capture, atomic first-design creation/undo, stale navigation, failed capture, transient/late SVG previews and local saved content.

The original 480 tests remain active. The old panel migration assertion now recognizes Styles as its own panel; saved text styles remain under Text.

## Native app checks

Development checks use `npm start`, isolated temporary projects/profile, local fixture files and queued native menu/dialog choices. Actual pointer events, keyboard behavior and HTML drag-and-drop run inside Electron. QA setup/inspection globals are temporary and removed by the production build.

| Area | Result |
|---|---|
| Text presets | Title, Subtitle and Badge create editable text using the project name and configured serif/monospace brand fonts. |
| Recommended | Hover previews palette and font changes without modifying project data or undo history. Apply changes appearance once; Undo restores the original project. |
| Elements | NEW remains editable text. A hand-drawn arrow becomes a copied project PNG. A dotted texture sits behind existing layers. Native shape drag places its center at the drop point, within pointer-pixel rounding at the displayed zoom. |
| Targeted drag | A combined palette/font card changes the text layer under the drop. A different selected text layer retains its font, and the canvas background remains unchanged. |
| Search and saved items | Global search groups matching templates and text styles. A palette saved through its context menu appears in global search and can be deleted there. |
| Templates | Save as Template stores comma-separated tags and the selected layer color role through the native library service. |
| Video suggestions | Templates analyzes a local square video and shows six ranked frames with editable layout cards. Applying one captures a 600 by 600 original asset with full crop and contain placement inside a 16:9 design. Video shows the cached Best Frames. |
| From This Frame | Sampling the selected local video frame produces five palette colors. No remote image or font service is used. |
| Cutout | Cut Out This Frame works from an empty room, retains the complete 600 by 400 source and creates a separate local mask. Quick Export as PNG then writes a file successfully. |
| Readability | Small text shows the warning dot. Correcting it clears the dot. Large low-contrast text also produces a contrast warning. |
| Fonts | A saved pair using a deliberately missing font is hidden. Installed/system pairs remain available. |
| Layout | Expanded panels at 1100 and 1728 px leave 326 and 804 px canvas columns respectively, without room or toolbar overflow. Styles and cutout layouts were visually inspected. |
| Isolation | No renderer errors were recorded during the main interaction check. Temporary video preview asset names never enter the project. |

## Behavior and limits

Frame ranking reuses the existing sharpness, exposure, contrast and color scores, with priority for a visible camera stream. It does not add a face or emotion recognition model. Sampling is bounded by the existing 14-second budget; unavailable frames can be skipped. The old Suggestions dialog remains available for extra sizes, title ideas and explicit AI title suggestions.

Drawing/sticker artwork is generated from bundled code-defined SVG paths and saved as project PNG files. Textures become image layers behind content, so they use the existing renderer, asset storage and project packaging. Badges and shapes remain editable layers. Emoji uses the system font fallback and can vary by operating system.

Optional tags and color-role metadata keep the existing project/template versions. Older templates without them still work through fallback mapping. No npm dependency, app version change, recording behavior or timeline edit was added.

Phase C is still pending and is not covered by this report.


## Follow-up: editable timecode and playback controls

On 2026-11-04, the frame picker gained typed timecode, Play/Pause, five-second skip buttons and Shift-click for ten seconds. Left/Right step one frame without moving selected design layers; Shift and arrows step one second. Space controls preview playback. Arrow keys retain normal caret behavior in the timecode input. Full HH:MM:SS:FF labels use non-drop-frame frame counts, including fractional rates such as 29.97; seconds-based entries snap to the nearest source frame. Invalid values do not seek, Enter/blur applies, and Escape cancels.

- `npm test`: 507 tests pass. Seven added tests cover long and shortened timecodes, decimal comma, invalid fields, exact label round trips at 24/25/29.97/30/59.94/60 fps, boundary clamps, repeated frame steps and 5/10-second skips.
- Native `npm start` checks used a 70-second 320 by 320 video. Typed 00:01:00:12 seeks to 60.4 seconds at 30 fps. Actual pointer and keyboard events verify skip modifiers, one-frame steps from both preview and slider, caret isolation, play/pause/Space, natural end on 00:01:09:29, restart from end, source-change reset and stopping on room change.
- Typing, scrubbing, stepping and capture pause playback. Capture retains the complete square source with contain placement. Source selection, preview time and transport do not change the Edit playhead, Edit playback state, Design layers or Design undo history. No renderer errors were recorded.
- Clicking the timecode selects its text for replacement. Enter returns focus to the Video panel, so the next arrow key steps a frame instead of moving a design layer. The production build passes and the final transport layout was visually inspected. No app version or dependency changed.
