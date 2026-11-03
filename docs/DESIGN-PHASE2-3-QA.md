# Design phases 2 and 3: verification

Date: 2026-11-03. Development build, Reccut 0.9.0. No version or dependency change.

Phase 2 (tasks 2.1 through 2.6) and phase 3 (tasks 3.1 through 3.7) are implemented. This does not complete phases 4 through 8 or the background-removal model preparation in phase 0.

## Phase 2

| Task | Result | Evidence |
| --- | --- | --- |
| 2.1 Fill | None, Solid and Gradient for layer fills and the design background. Shared Gradient Editor with local coordinates and transient history. | Native rotated red/blue gradient pixels and alpha checked. One and 32 stops, radial and freeform rendering checked. Gradient handle drag undoes once. |
| 2.2 Stroke | Shape/text strokes with position, width, dash and join controls. Text defaults to Outside. | Native pixels distinguish Inside, Center and Outside, including outline-only shapes. Zero alpha produces no black mask. Widths 0 and 500 render. Pure effect-bounds tests pass. |
| 2.3 Layer styles | Multiple ordered shadows, all four presets, opacity, angle, distance, spread and size. Image spread is disabled until phase 4. | Native overlap pixels confirm shadow order. Add/remove through the UI and undo checked. Blur 0 and 500 render. Zoom 0.5/1/2 gives matching blur profiles within sampling tolerance. |
| 2.4 Compositing | All native blend modes and six image adjustments, with reset. | Filter mapping tests and the native brightness -0.3 workflow pass. Layer opacity, filter and blend state are isolated by save/restore and per-layer bitmaps. |
| 2.5 Shapes | Rectangle/radius, ellipse, polygon, star, line and arrow. Shape menu and Shift+U cycling. | Point counts, ranges, radius clamps and save/load tested. Native arrow, star and ellipse drawing checked. Lines/arrows begin with a stroke and no fill. |
| 2.6 Rich text | Box-wide gradient, outlines, padded rounded boxes per line, paired highlights, tracking, leading, caps, autofit and missing-font fallback. | Escaped, unmatched and consecutive stars, wrapping, Unicode graphemes, uppercase expansion and minimum-size overflow tested. Native emoji and right-aligned Arabic render. Missing-font warnings verified in Properties and Layers. |

Linear/radial fill creation was factored into `gradientCanvasStyle` in the existing gradient renderer, so video, the Gradient Editor and Design share the same field math. Freeform uses its existing cached GPU/CPU renderer. The freeform field extends edge pixels for outside strokes. Geometry bounds remain separate from `visualBounds` so editing an effect does not move transform handles.

The optional film Look selector was skipped. `filmLooks.js` exposes RGB functions and LUT baking, but no canvas/ImageData application function. The required six Canvas adjustments are implemented without adding a second video color pipeline.

The workflow image combines a darkened frame, yellow title, black 12 px outside contour, shadow, red highlighted word, red arrow and rounded gradient NEW badge. The exported PNG was compared with an uncached drawing at the same size: maximum channel difference 0. Preview and export were also visually inspected. Temporary artifacts are under `/tmp/reccut-phase2/`, outside the repository.

## Phase 3

| Task | Result | Evidence |
| --- | --- | --- |
| 3.1 Groups | Contiguous groups at the topmost selected position, group selection/member selection, collapse, rename, transforms and ungroup. | Relative order, rotated/scaled centers and ungrouped visual positions tested. UI collapse/expand, aggregate Properties rotation/width/flip, native collapsed-group drag/drop and one-step undo pass. Locked grouping is refused. |
| 3.2 Align/distribute | Six alignments, canvas alignment for one selected layer and equal horizontal/vertical gaps for three or more layers. | Pure tests cover unequal sizes and rotated axis-aligned bounds. Group scaling preserves rotation and adds no skew, as documented in code. |
| 3.3 Clipboard | Layers plus referenced assets, cross-project registration/copying, plain text and image paste, Paste in Place and relative centers. | In-memory IPC tests exercise production copy/paste functions. Native files were copied from project A's Designs directory into a distinct project B directory and decoded there. Unit tests cover cut/copy history, plain text, groups, relative centers and PNG placement. |
| 3.4 Crop | Dimmed full source, image repositioning, eight handles, six ratio choices, Apply/Cancel and Enter/Escape. | Real pointer handles change the draft only. Enter applies once; Escape cancels. Pure tests cover bounds, fixed anchors, panning, rotation and flips. Another edit or a project switch cancels a stale crop without rolling back other changes. Reset Crop shows the full source with Contain. |
| 3.5 Layered import | PSD/PSB and layered SVG offer one image or selected layers. Existing editor parsers/extractors are reused. | Real two-layer PSD preserves transparent margins and a detail's source coordinates. Real two-group SVG, selection dialog, shared placement, grouping, assets and one-step undo checked. Unique output folders prevent overwrites. |
| 3.6 Performance | Bitmap cache by immutable layer identity and pixel scale; bounded pixel/count LRU. Main canvas and thumbnails retain separate sizes. Memoized layer rows and stable canvas allocation. | Unit cache invalidation and multiple-size reuse tests pass. Full UI trace and actual pointer drag measured with 300 mixed layers on Apple M1 Pro at display scale 2. See below. |
| 3.7 Shortcuts/help | Design registry commands, shape cycling, crop, grouping, alignment, distribution and Paste in Place. Design category in Settings and updated help. | Mac/Windows room-conflict tests pass. T can overlap Edit's T, while Cmd/Ctrl+S reports Save. Conflicting native accelerators remain unregistered. Every new command has Design room and help metadata. |

## Performance results

The scene contained 300 image, text and shape layers on a 1920 x 1080 design, including contours and shadows. The Layers panel and design thumbnail stayed mounted. A DevTools timeline trace was captured through CDP.

- Initial full UI baseline: median animation interval 25 ms. The trace showed repeated row work, layout and canvas setup.
- After row memoization, separate scale entries and stable canvas dimensions: 120 continuously updated frames had median 8.4 ms, 95th percentile 18.1 ms and one interval over 25 ms. Trace instrumentation remained enabled.
- Real pointer drag with Smart Guides and 300 layers: median 8.3 ms, 95th percentile 10 ms, no intervals over 25 ms. The drag undid once.
- Warm shared drawing plus the thumbnail: median 1.6 ms, 95th percentile 2.3 ms. These are CPU submission times, not a GPU throughput guarantee.
- Fifty rapid undos preserved all 300 layers and finite geometry.

The real drag exceeds the 60 fps target on the checked M1 Pro configuration. Results are measurements on this machine, not a cross-platform performance guarantee. The cache is bounded to 33,554,432 backing pixels and 1,200 entries. Individual layer allocations are also bounded.

## Verification and boundaries

All 410 automated tests pass, with no skipped tests. `npm run build` and `git diff --check` pass. The square/portrait frame-placement regression tests remain green: adding a frame retains the entire source and its native aspect ratio.

Application checks ran in a separate temporary profile. The existing native keyboard-hook startup problem required the same QA-only hook bypass used for phase 1. No workaround or QA globals are part of the production bundle. The system clipboard was never read, written, cleared or restored by these tests; clipboard IPC was replaced with an in-memory adapter in the isolated process.

Not covered here: other operating systems, distribution signing, physical capture devices, background-removal models/masks, saved styles/templates, automatic suggestions, final export utilities and standalone image workflows. These remain later-phase or release checks. PSD decoding retains the existing importer's support and limitations for Photoshop effects, masks and blend modes.
