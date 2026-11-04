# Design usability refinements

User-requested changes validated on macOS on 2026-11-04. Built on Phase B and the frame-picker transport follow-up. App version remains 0.9.0; no release was published and no npm dependency was added.

## Result

- Alignment, paragraph alignment and distribution use icons with tooltips. Save Style is a padded section-header action. Saving colors is centralized in Brand; property controls retain existing swatches.
- Character is first for text layers. Font Family offers installed-font search and refresh. Local Font Access is permitted only to the main app window. Google Fonts can be opened in the browser and installed locally; the app does not download fonts from a provider.
- Layers starts at a compact height based on its rows. Dragging the separator changes its height and saves the preference. Arrow keys/Home/End also work, and double-click restores automatic sizing.
- Mask editing draws the actual ellipse, rectangle or polygon through the same path logic used by rendering, with existing draggable handles.
- Selecting words in Properties Content or the canvas text editor retains the range when focus moves into Properties. Font family, weight, size, tracking, case, fill and highlight can be applied to that range. A notice identifies the range; Whole layer updates the chosen property across the text while retaining other overrides. Position, paragraph alignment, masks and layer effects remain layer-level controls.
- Optional textStyles ranges survive model normalization, JSON save, copying and rendering/export. Typing shifts ranges with their words. Packaging lists fonts used in ranges as well as base fonts.
- Library cards insert/apply with one click or Enter. A double click inserts once. Color/gradient backgrounds create separate layers above previous backgrounds and below ordinary content.
- Dots/grids are native shape-pattern layers, with background fill, foreground color, dot radius/line width and independent X/Y spacing. Known older raster textures offer a reversible Make Pattern Editable action. Other imported images remain ordinary images.
- Emoji contains 3,781 Unicode 16.0 sequences with English names, categories, search and bounded grids. Rendering uses the installed system emoji fallback. Newer emoji appearance depends on operating-system fonts. The Unicode License V3 notice is copied into production build/licenses.

## Validation

- npm test: 518 passing tests, zero failures/skips. Eleven added tests cover word ranges, overlapping styles, Unicode grapheme boundaries, typing/rebasing, mixed-size layout/autofit, escaped/highlight offsets, malformed metadata, whole-layer updates, native pattern tiles/normalization, JSON round trips and English emoji coverage/license. The packaging regression now includes a word-level font.
- npm run build and git diff --check pass.
- Native npm start checks use an isolated temporary profile and project. Actual mouse events test single/double clicks and the Layers divider. Word selections are tested from both Content and the inline canvas editor before changing Properties.
- Native font enumeration returns 283 family choices on the test machine. Word-only red fill and reduced weight leave the rest white/bold; renderer pixel checks find both colors. A separate canvas selection changes only Hello to serif at 130 pixels, while the base remains sans at 100 pixels. Undo restores the previous word appearance.
- Two layers initially use 128 px. A drag expands the panel to 218 px and stores the preference. Icon-only alignment controls and absence of Save Color buttons in Properties are checked.
- Native pattern controls set radius 9, X spacing 80, Y spacing 100 and background #330044 independently. Gradient insertion creates a selected shape layer above the old dotted background. Converting an old texture preserves geometry/opacity/flip and Undo restores its image asset.
- Ellipse clipping is checked with transparent corner and opaque center pixels; the visible ellipse guide is inspected. Emoji initially renders 36 boxes, See All renders 120 per page, English searches find Norway and rocket, and a single click creates an editable emoji text layer.
- Main interaction checks record no renderer errors. Rich-text, mask and pattern layouts are visually inspected.
- A production arm64 Mac app is built with electron-builder and opened with an isolated profile. It loads the saved project and word styles, exposes Character first, enumerates 283 installed font families, includes the resizable divider and emoji grid, and has no Save Color buttons in Properties. The production bundle contains no QA globals. The Unicode notice is present inside app.asar at build/licenses/UNICODE-3.0.txt.

## Implementation and sources

The existing renderer and project format are reused. New pure helpers are designRichText.js and designPattern.js. DesignSidebar.jsx handles layout preferences; textSelection.js retains character ranges; FontSelect.jsx queries the existing Chromium local-font API. Recording/timeline behavior is unchanged.

Local-font permission behavior follows the [Electron session API](https://www.electronjs.org/docs/latest/api/session). Emoji names/sequences come from [Unicode Emoji 16.0](https://unicode.org/Public/emoji/16.0/emoji-test.txt); redistribution includes the [Unicode License V3](https://www.unicode.org/license.txt). Google Fonts is linked through its [font browser](https://fonts.google.com/).

## Gradient interaction follow-up — 2026-11-04

- Removed the Stop/Point selection menu. Clicking or tabbing to a color handle selects its color and position controls directly.
- Linear gradients expose an Angle field (typing or scrubbing) and 45° presets. 0° runs left to right; 90° runs down. Angles account for source aspect ratio. The existing endpoint geometry is saved, keeping preview/export and project compatibility. Rotation keeps midpoint/length where possible and fits the endpoints inside the source when needed.
- Color-bar handles are circular. One click adds a sampled color and focuses the new handle; a double click adds only once. Horizontal dragging changes position. Dragging below the bar shows removal feedback and removes that color on release. Backspace/Delete removes the focused color, retaining at least two colors. Escape cancels an active drag.
- Focus follows a color across other stops when their position order changes, so subsequent keyboard edits/delete still target that color. Angle scrubbing uses the initial geometry throughout the gesture and creates one undo operation.
- npm test: 520 passing tests. Two new geometry tests cover landscape/portrait/square angle round trips, fractional/wrapped angles, endpoint colors, midpoint/length preservation, bounded endpoints and coincident handles. Production build and git diff --check pass.
- Native Electron checks use an isolated profile and actual mouse/keyboard events. Verified single/double click insertion, circular handles, color selection, horizontal dragging, downward deletion/feedback, Backspace/Delete, minimum two colors, Escape rollback, undo/redo, typed 37.5° and a 90° preset. Radial stops and freeform point deletion also pass. Crossing another stop retains focus and deletes the dragged color; scrubbing angle out and back restores its original geometry. No renderer errors; final layout visually inspected.

## Automatic text-style emphasis — 2026-11-04

Text styles with distinct fill/highlight colors now emphasize the longest word automatically. Unicode grapheme counting excludes punctuation; equal-length words use the first occurrence. Existing explicit asterisk highlights take priority. Automatic emphasis uses an ordinary editable character-color range, preserving the original text. Applying a style clears old character overrides for the appearance fields the style sets, so old word colors/fonts cannot override its palette. Single-color styles do not add an accent range. Card examples, canvas hover previews, drops and clicks all use applyDesignStyle; the card example no longer has a hard-coded asterisk highlight.

Validation: all 525 tests pass. Five added regressions cover all 15 built-in palettes, source immutability, repeat application, replacement of old word formatting, actual layout runs, explicit highlights, escaped stars, Norwegian/decomposed Unicode text, punctuation-only/empty text, ties, and hover/apply/undo equivalence. Native Electron mouse checks apply Bold Yellow Outline and Clean White to “En ekstraordinær tittel”. Both emphasize only “ekstraordinær”, preserve the source string, and restore old green/blue word formatting on Undo. Pixel checks find the exact yellow/red and white/red palette in both card canvases and actual design rendering. No renderer errors; native layout visually inspected. Production build and git diff --check pass.
