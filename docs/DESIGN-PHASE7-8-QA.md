# Design phases 7 and 8: verification

Date: 2026-11-03. Environment: Apple M1 Pro, macOS, Electron 45.1.0. Scope: tasks 7.1–7.5, 8.1–8.2, help/features documentation and the Mac build portion of final review. Version remains 0.9.0; no public release or version bump was requested.

## Implementation

| Task | Result |
|---|---|
| 7.1 Feed preview | Generic video-list previews at 360, 246 and 168 CSS pixels, plus a phone layout with a 328 px image in a 360 px frame. Light/dark backgrounds, sequence duration badge and optional progress bar. Designs fit completely inside the preview tile. |
| 7.2 Safe zones/readability | Preset metadata defines generic overlay areas. Canvas guides never enter the export renderer. On-demand text checks report fitted size at a 168 px feed tile, sampled fill contrast below 3:1 and overlap with overlay areas; Select targets the affected layer. |
| 7.3 Variants | Independent copies with new layer/group IDs, shared variant-family metadata, comparison and an undoable favorite marker. No designs are deleted. |
| 7.4 Sizes/export | New sizes preserve source/crop/mask references, scale styles, respect anchors or relative centers, and constrain rotated layer bounds. In-place resizing accepts one size. Batch export supports PNG/JPEG/WebP with dimensions in names and clear partial-progress/errors. |
| 7.5 Paired thumbnail | Export room and Easy Export offer a design picker. JPEG bytes are prepared before the video job starts and written after its matching completion, using the actual video basename. Existing JPEGs are preserved and reported as a conflict. |
| 8.1 Open Image | Dialog and empty-room drop create a separate design at the displayed image dimensions, with only the image and transparent background. Embedded/linked preference applies. JPEG orientation is honored. |
| 8.2 Canvas operations | Draft canvas crop with ratio presets, handles, moving, Enter/Escape and one-step undo. Quarter-turn rotation and flips transform all content, including hidden/locked layers and anchors. Canvas Size uses a nine-point content anchor without scaling. |

The contrast calculation uses sRGB relative luminance and the [W3C contrast-ratio definition](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum). The requested 3:1 threshold is a design warning, not an accessibility-conformance certification. Samples include the lower layers and text box; transparent backgrounds are evaluated on white. Text outlines and shadows can improve the actual result beyond the fill-only check.

## Automated checks

`npm test`: **466 passed, 0 failed, 0 skipped**. Production build succeeds and `git diff --check` passes. No npm dependencies or package versions changed.

New tests cover all built-in templates across wide, portrait and square sizes, with anchors and with rotated unanchored layers; bounds/source preservation; all nine canvas-size anchors; crop translations; rotation/flip round trips and anchor transforms; independent variant families; readability size/contrast/safe-zone rules, including fitted portrait text; exact-size Open Image and oversize rejection; JPEG snapshot timing, early export completion, matching job IDs, cancellation, errors and listener cleanup; exact-basename filesystem writes and preservation of existing JPEGs/Unicode video names.

The complete prior capture, masks, templates, player, packaging, history and command/help suites also pass.

## Native Electron workflows

Development QA used isolated temporary userData/projects. A temporary development launcher disabled only the native recording keyboard hook. No system clipboard access was used. The final packaged app ran normally without that launcher/preload, under its own temporary profile.

- **EXIF image workflow:** a generated JPEG fixture had stored pixels 4032×3024 with orientation 6. Its source pixels were deliberately rotated so applying the EXIF orientation restores an upright portrait. Chromium opened it as **3024×4032**, with one complete image layer and full crop. Open Image through the real dialog and a native file drop on the empty room both worked; neither added Edit media.
- **Background/crop/export:** removed the background from that portrait, added a gradient, selected a square canvas crop and exported transparent PNG. Output was **3024×3024** with corner alpha **0**. The image's original source crop remained `[0,0,1,1]`, and the independent mask remained available. The result was visually inspected upright. This is a generated orientation fixture based on a sample photo, not a claim to have tested every camera/HEIC format.
- **Canvas operations:** native pointer drag changed a 400×300 draft crop to **300×200**; Enter applied and one Undo restored **400×300**. Cancel left the draft unapplied. Rotate/flip preserved source IDs; round trips restored geometry. Actual tiny-canvas pixels verified clockwise rotation and horizontal reflection of a colored source matrix.
- **Canvas Size:** all nine buttons appeared; the top-left anchor could be selected and applied. All nine positional outcomes are covered by pure tests.
- **Variants:** made a family of three designs; comparison showed all three and favoriting one retained all of them.
- **Feed:** actual CSS image widths were **360, 246, 168 and 328**; four duration badges appeared. Dark and light modes were exercised, and the feed was visually inspected.
- **Readability:** rendered gray text on gray produced approximately **1.0:1**; small lower-right text produced size and overlay warnings. The Properties check and Select button worked with no recorded renderer errors.
- **Resize:** two target sizes created two designs with all bounds inside; a single Undo removed both. Pure tests additionally cover every built-in layout across the target ratios.
- **Batch output:** the real batch dialog saved **six PNGs** with dimensions in the filenames, including slash-containing/emoji design names sanitized safely.
- **Video/JPEG pairing:** an actual three-second video export created `Paired 📷.mp4` and `Paired 📷.jpg`. The 320×180 JPEG retained the original green design, even though the live design changed to red immediately after queuing (sample pixel **[0,255,1,255]**).
- **Read-only output:** an actual directory with mode 0555 produced a read-only error message.
- **Disk full:** mounted a temporary 16 MiB HFS+ disk image, filled it to 65,536 free bytes, and attempted a large PNG. The real write returned **ENOSPC**, displayed the clear free-space message and removed the incomplete PNG. Only the filler file remained. The disk image was detached afterward.

Temporary fixtures, screenshots and JSON results are under `/tmp/reccut-phase7/` and are not runtime dependencies. The initial orientation fixture was corrected before the final workflow check so that its stored pixels and EXIF tag described an upright photo consistently.

## Distribution and final review

Ran the actual `npm run dist:mac` pipeline with an isolated output directory. It fetched/verified existing resources, built production bundles, ad-hoc signed the ARM64 app and created a **458 MiB DMG**. Code-sign verification and disk-image checksum verification passed. Existing notarization/identity limitations remain unchanged.

The finished packaged app launched normally using `--user-data-dir=/tmp/reccut-phase7-package-profile`, loaded the test project, exposed the new Open Image/Preview/Canvas/Readability controls and thumbnail IPC, and rendered the four correct feed widths. `app.isPackaged` was true, `app.getVersion()` was 0.9.0 and `window.qa` was undefined. A minimum-window-width check found a toolbar overflow; the toolbar now wraps so the final zoom control remains reachable.

Earlier phase reports record model licenses and offline packaged model loading, old-project compatibility, independent histories, relocated-project packaging and 300-layer performance. The model manifest/licenses and dependency set did not change in this phase. Help and FEATURES now cover the implementation through phase 8.

## Remaining practical limits

- Windows/Linux and Intel Mac runtime, install and GPU checks remain outside this Mac session. No notarized/public release was produced.
- Preview layouts and safe areas are generic guides, not destination-platform requirements. Sizes without predefined safe metadata have no overlay guide.
- Readability is an on-demand heuristic. Fill contrast on white transparency, compositing, outlines and shadows can differ from the eventual background/viewing environment.
- Canvas backgrounds adapt to a new crop size; source image pixels and mask files are retained rather than destructively cropped. Open Image rejects sources over 8192 pixels per side with guidance to use Place Image instead.
- A video can finish while its JPEG fails to save; that failure is reported and the completed video is retained. Existing same-name JPEGs are not overwritten. The JPEG snapshot is fixed before the video starts.
- The previous phase reports remain explicit about manual interactions/platform combinations that have not been exhaustively repeated; these are not represented as a universal release-quality guarantee.
