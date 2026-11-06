# Design Room: implementation plan

A fourth room in Reccut, after Export, for making video thumbnails and editing images. It works like a small offline Adobe Express: layers, text, shapes, gradients, shadows, masks, background removal, templates and saved styles. It is tuned for thumbnails (size templates per service, frame picker from the video, automatic suggestions) but works as a general image editor.

This plan is written for implementing agents. Follow it task by task. Do not redesign it. When something in the code contradicts the plan, or a task cannot be done as written, stop and write the problem in the progress log (section 16) instead of improvising a different architecture.

---

## 1. How to work with this plan

### 1.1 Rules for every task

1. Read the task, then read every file it names before editing. Trace the real flow.
2. Reuse what section 4 lists. Do not write a second version of something that exists (gradients, shadows, masks, font list, toasts, modals, number fields, worker windows, project folders).
3. No new npm dependencies, except the background removal model files in phase 0. `@huggingface/transformers`, `immer`, `preact`, `@preact/signals` and `lucide-preact` are already installed.
4. Keep the code style of the file you are in: short comments, plain names, no classes where the codebase uses functions, Preact function components, signals for state, `immer` `produce` for project changes.
5. New code comments in English. Existing Norwegian comments stay as they are.
6. User-visible text in English, short, plain sentences. In the Design room, names of tools, panels, commands and settings follow the Photoshop terms in section 5.8. Never use em-dashes in UI text, help text or docs. Use a colon, comma or full stop instead.
7. Pure logic goes in `src/shared/design*.js` with no DOM access, so it can be tested with `node --test`. Functions that need text measurement take a `measure(text, font)` argument (same pattern as `captionLayout(project, clip, measure)` in `src/shared/render.js`).
8. Every task that adds logic adds or extends a test in `test/`. Run `npm test` before you finish a task. All tests must pass, including the existing ones.
9. Run `npm run build` before you finish a task. It must succeed without errors.
10. Do not commit unless the user asks. Do not change the version number.
11. When a task is done, append an entry to the progress log (section 16): task id, files changed, tests added, what you checked by hand, anything left open.

### 1.2 Definition of done for a task

- The acceptance criteria in the task are met.
- `npm test` passes and `npm run build` succeeds.
- The manual checks listed in the task were done in the running app (`npm start`), or the log says clearly which ones were not done and why.
- No `console.log` left behind. No dead code. No unused imports.

### 1.3 Stop and ask (write it in the log, then stop)

- A task needs a new npm dependency.
- A model license is not MIT, Apache 2.0 or BSD.
- A change would alter the `.reccut` project format in a way that old projects cannot open.
- A change touches recording, timeline editing or video export behaviour beyond what the task says.
- Tests that passed before your change now fail and the fix is not obvious.

---

## 2. Goals and non-goals

### Goals

- A room called **Design**, after Export in the title bar (shortcut: see D1).
- Several designs per project. Each design is a canvas with a size and a stack of layers.
- Size templates for common services, and custom sizes.
- Pick a frame from the video with a scrubber, or place your own images (like Place in Photoshop).
- Layers: image, text, shape, with groups.
- Fill (solid, linear, radial, freeform gradient), stroke, multiple drop shadows, glow, opacity, blend modes, image adjustments.
- Masks (shape masks, clipping to the layer below) and background removal that works offline.
- Fonts (system fonts), text style presets, saved user styles, design templates with placeholders.
- Automatic thumbnail suggestions made from the video.
- Thumbnail tools: feed preview, safe zones, readability check, variants, export to many sizes, file size limit.
- Open a plain image and edit it without any video.
- Everything a design uses is included when the project is packaged.

### Non-goals (do not build these unless the user asks later)

Generative AI fill, curved text on a path, a Bezier pen tool, a history panel, styles that stay linked to layers, PSD export, a WebGL editor engine, real-time collaboration, a separate `.reccut-design` document format for standalone images.

---

## 3. Locked decisions

| # | Decision |
|---|---|
| D1 | The room is called **Design**. Room id `'design'`. It comes after Export. Shortcut CmdOrCtrl+4. Today CmdOrCtrl+4 is "Show Video Inspector" in Edit (`registry.js` line 231). OPEN: the user decides whether the Video Inspector moves or Design gets another key. Until then, task 1.2 uses no key for Design and leaves the Video Inspector alone. |
| D2 | The background removal model ships inside the app (no download on first use). App size does not matter. |
| D3 | Design is independent of Edit. Images placed in Design do not appear in the Edit media browser. They are stored in `project.designAssets`. |
| D4 | When placing a file, the user chooses to copy it into the project folder or leave it where it is. The default comes from the existing preference `prefs.importCopy`. Copied files go to `<project>/Designs/Assets/`. |
| D5 | Design can also use image media that is already imported in Edit, by reference (`layer.media = mediaId`). Nothing is copied and nothing new appears in Edit. Video media is never referenced directly: a frame is captured to a PNG asset instead. |
| D6 | Files Reccut makes for Design (captured frames, background removal masks) go to `<project>/Designs/` and are registered in `project.designAssets`. |
| D7 | Package Project copies every design asset (original quality) into `Designs/` in the package, rewrites paths, and never removes Edit media that a design uses. Fonts used in designs are listed in the package report. |
| D8 | Design has its own undo history. Undo in Design never changes the timeline, and undo in Edit never changes designs. |
| D9 | Placeholder title text in templates and suggestions is the project name. AI title suggestions are an optional button that only works when the AI agent is configured, and it says that the transcript is sent to that service. |
| D10 | Plain images opened without video become a new design in the open project. |
| D11 | Rendering uses Canvas 2D only. One function draws a design, used by the editor canvas, thumbnails and export. |
| D12 | Design has its own shortcut set, like a separate program inside Reccut. Design commands use `rooms: DESIGN` only, so they may reuse keys that Edit uses (T, V, B, ⌘G, arrows and so on) without conflict. `conflictsFor()` in `registry.js` already compares keys per room. Only the room switch commands (Record, Edit, Export, Design) and app level commands (`rooms: ALL`: save, open, settings, Quick Search) are shared. Edit shortcuts never fire in Design and Design shortcuts never fire in Edit. |

---

## 4. Codebase orientation (read before phase 1)

| What | Where | How Design uses it |
|---|---|---|
| Rooms and title bar | `src/renderer/app.jsx` (`TitleBar`, and the `room` divs near line 363) | Add the Design button and `<div class="room" hidden={r !== 'design'}>`. |
| Room signal, project signal, undo, autosave | `src/renderer/editor/store.js` (`room`, `project`, `commit`, `undo`, `redo`, `scheduleSave`, `projectFolders`) | Design writes to `project.value` and calls `scheduleSave()`. Undo is separate (section 5.4). |
| Commands, shortcuts, menus, Quick Search | `src/renderer/registry.js` (`COMMANDS`, `ALL`, `EDIT`, `commandForEvent`) | Add `'design'` to `ALL`, add `roomDesign`, add Design commands with `rooms: DESIGN`. |
| Project model | `src/shared/model.js` (`newProject`, `uid`, `SEQUENCE_FIELDS`) | `designs` and `designAssets` are project level. They must NOT be added to `SEQUENCE_FIELDS`. |
| Project load and save, relative paths | `src/main/projects.js` (`SUBDIRS`, `addRelative`, `resolveRelative`, `folders`) | Add `designs: 'Designs'` to `SUBDIRS`. Extend relative path handling to `designAssets`. |
| Packaging | `src/shared/package.js` (`reduceProject`, `mediaFiles`), `src/main/packager.js` (`writePackage`), `src/renderer/ProjectDialogs.jsx` (package dialog near line 380) | Add `designFiles()`, copy them in `writePackage`, protect media used by designs. |
| Separate preview player | `src/renderer/export/ExportRoom.jsx` line 80 (`createPlayer`) and `src/renderer/player.js` | Frame picker uses its own `createPlayer` instance, like the Export room. |
| Frame export (full quality composite) | `src/shared/frameExport.js`, `src/renderer/editor/ExportFrameDialog.jsx`, IPC `export:start` in `src/main/main.js` | Capturing a frame for Design renders through the same export path. |
| Raw source frames | `src/renderer/editor/sourceFrame.js` (`readClipFrames`) | Not needed in phase 1. Optional later. |
| Gradients | `src/shared/gradient.js` (`gradientParams`, `DEFAULT_GRADIENT`), `src/shared/gradientRender.js` (`renderGradient`), `src/renderer/editor/GradientEditor.jsx` | Gradient fills store `gradientParams` objects and draw via `renderGradient`. The editor UI is reused. |
| Shapes and masks | `src/shared/shapes.js` (`MASK_SHAPES`, `MASK_MODES`, `shapePath`, `ellipsePoints`, `defaultPoints`) | Shape layers and shape masks reuse the point formats and path building. |
| Shadow math | `src/shared/shadow.js` | Naming and defaults for shadow (color, opacity, blur, offset). Design stores explicit values per shadow. |
| Text wrapping, font stacks | `src/shared/render.js` (`wrapText`, `fontFamily`), `src/shared/titletemplates.js` (`FONT_STACKS`, `fontStack`) | Reuse for text layers. |
| Font picker | `src/renderer/editor/Inspector.jsx` around line 1405 (`loadSystemFonts`, `FontSelect`) | Export `FontSelect` (and `loadSystemFonts`) and reuse. Do not copy it. |
| UI components | `src/renderer/ui.jsx` (`Toggle`, `Segmented`, `Select`, `Row`, `Section`, `Button`, `IconButton`, `NumberField`, `Slider`, `Modal`, `toast`) | Use these for every panel. |
| Title template format | `src/shared/titletemplates.js` (`TEMPLATE_FORMAT`, `validateTemplate`) | Model for the design template file format and validation. |
| Layered files | `src/main/psd.js`, `src/renderer/editor/layers.js` (`LAYERED`, `importLayered`) | PSD/SVG placed in Design can become separate layers (phase 3). |
| File drop | `src/renderer/fileDrop.js` | Dropping files on the Design canvas places them. |
| Background jobs and hidden worker windows | `src/main/jobs.js` (`add`, `runInWorker`, `getWorker`), `src/main/preload-worker.js`, `src/worker/transcribe.js` + `.html` | Background removal runs in a new worker `segment`, built the same way as `transcribe`. |
| Model cache | `src/main/main.js` around line 930 (`modelcache:get/put`) | Not used for the bundled model; the bundled model loads from local files. |
| Build | `scripts/build.mjs` (`builds`, `copyStatic`) | Add the `segment` worker entry and html, and copy the model files. |
| Package config | `package.json` `build.extraResources` | Add the bundled model folder. |
| Copy into project | IPC `media:copyIn` in `src/main/main.js` line 788 | Reuse for copying placed files into `Designs/Assets`. |
| Writing files | IPC `file:writeBinary`, `dialog:openFile`, `dialog:saveFile`, `dialog:chooseDir` | Export and saving masks. |
| Help | `src/renderer/help/articles.js`, `test/help-content.test.mjs` | Add a Design article per phase that adds user-facing features. |
| Feature list | `docs/FEATURES.md` | Add Design features when they ship. |
| Prefs | `src/renderer/prefs.js` (`importCopy`) | Default for copy vs. leave in place. |

---

## 5. Architecture

### 5.1 New files

| File | Purpose |
|---|---|
| `src/shared/design.js` | Data model: defaults, `newDesign`, `newLayer`, `normalizeDesign`, size templates, geometry (box, rotation, hit testing, bounds), z-order helpers, group helpers. Pure. |
| `src/shared/designRender.js` | `drawDesign(ctx, design, getImage, opts)` and per-layer drawing (fill, stroke, shadows, masks, clip, blend, adjustments, text). Uses Canvas 2D. No DOM other than the `ctx` and canvases it is given. |
| `src/shared/designText.js` | Text layout: wrapping, autofit, highlighted words, line metrics. Pure, takes `measure`. |
| `src/shared/designTemplates.js` | Built-in text styles and design templates, `validateDesignTemplate`, `applyTemplate`, placeholder filling, anchors for resizing. Pure. |
| `src/shared/designExport.js` | Export settings, file naming, JPEG quality search for a size limit (takes an `encode` function). Pure. |
| `src/shared/thumbScore.js` | Frame scoring for automatic suggestions (sharpness, exposure, colorfulness). Pure, works on `{ data, width, height }`. |
| `src/renderer/design/store.js` | Design room state (signals), design undo/redo, `designCommit`, selection, tool, zoom. |
| `src/renderer/design/DesignRoom.jsx` | Room layout: left panel (designs, assets, templates), center canvas, right panel (properties), layer panel. |
| `src/renderer/design/Canvas.jsx` | Canvas view: drawing, pointer handling, handles, guides, zoom and pan. |
| `src/renderer/design/LayersPanel.jsx` | Layer list. |
| `src/renderer/design/Properties.jsx` | Properties for the selected layers. |
| `src/renderer/design/FramePicker.jsx` | Scrubber over the sequence and "Use This Frame". |
| `src/renderer/design/assets.js` | Placing files, copying into the project, capturing frames, loading images for drawing (`getImage`), missing file detection, relink. |
| `src/renderer/design/NewDesignDialog.jsx` | Size templates and custom size. |
| `src/renderer/design/ExportDesignDialog.jsx` | Export of one or many designs. |
| `src/worker/segment.js`, `src/worker/segment.html` | Background removal worker (phase 4). |
| `scripts/fetch-models.mjs` | Downloads the bundled model into `vendor/models/` (phase 0). |
| `test/design.test.mjs`, `test/design-render.test.mjs`, `test/design-text.test.mjs`, `test/design-templates.test.mjs`, `test/design-export.test.mjs`, `test/thumb-score.test.mjs` | Tests. Extend `test/package.test.mjs` and `test/packager.test.mjs` for packaging. |

CSS goes into `src/renderer/styles/app.css` in one new block, all class names prefixed `dz-` (for example `.dz-canvas`, `.dz-layers`). Reuse the existing CSS variables (colors, spacing, panel classes like `panel`) used by `ExportRoom`.

### 5.2 Data model

All coordinates are in design pixels. Origin is the top left of the design. `x, y, w, h` describe the layer box before rotation. Rotation is in degrees, clockwise, around the box center. Flip is applied inside the box.

```js
// In the project (project level, not per sequence):
project.designs = { [designId]: Design }
project.designAssets = { [assetId]: Asset }

Design = {
  id: 'uid',
  name: 'Thumbnail',
  created: 1730000000000,      // Date.now(); designs are listed by created
  width: 1280, height: 720,    // 1 to 8192, whole numbers
  size: 'youtube',             // id from DESIGN_SIZES, or 'custom'
  background: Fill | null,     // null = transparent
  layers: Layer[],             // bottom to top
}

Asset = {
  id: 'uid',
  name: 'photo.jpg',
  path: '/abs/path/photo.jpg', // absolute
  rel: 'Designs/Assets/photo.jpg', // added on save by projects.js, like media
  copied: true,                // true when the file lives in the project folder
  origin: 'placed' | 'frame' | 'cutout',
  width: 4000, height: 3000,   // pixel size, read when placed
  missing: false,              // set at load time, never saved as true without checking
}

Layer (common fields) = {
  id: 'uid',
  type: 'image' | 'text' | 'shape',
  name: 'Title',
  x: 0, y: 0, w: 100, h: 100,
  rotation: 0, flipX: false, flipY: false,
  opacity: 1,                  // 0 to 1
  blend: 'source-over',        // one of BLEND_MODES
  hidden: false, locked: false,
  group: null,                 // group id; layers in a group are contiguous in z-order
  fill: Fill | null,
  stroke: Stroke | null,
  shadows: Shadow[],           // drawn bottom first
  mask: Mask | null,
  clip: false,                 // true: only visible where the layer below is opaque
  style: null,                 // id of the text style or user style it was created from (informative only)
}

Image layer adds = {
  asset: 'assetId' | null,     // exactly one of asset / media is set
  media: 'mediaId' | null,     // image media from Edit (D5)
  crop: { x: 0, y: 0, w: 1, h: 1 },   // fractions of the source image
  fit: 'cover',                // how the cropped image fills the box: 'cover' | 'contain' | 'stretch'
  adjust: { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, grayscale: 0 }, // -1..1 except hue (deg) and blur (px)
  cutout: { asset: 'assetId', enabled: true, feather: 0, shift: 0 } | null, // background removal mask (phase 4)
  outline: { color: '#ffffff', width: 0 } | null, // sticker outline around the opaque area (phase 4)
}

Text layer adds = {
  text: 'Title',               // \n for line breaks, *word* marks highlighted words
  font: 'sans',                // 'sans' | 'serif' | 'mono' or a system family name
  weight: 800,
  size: 96,                    // px at design size
  tracking: 0,                 // px letter spacing
  lineHeight: 1.1,
  align: 'left' | 'center' | 'right',
  valign: 'top' | 'middle' | 'bottom',
  uppercase: false,
  autofit: true,               // shrink font size so text fits the box
  highlight: Fill,             // fill for *highlighted* words
  box: { fill: Fill, padding: 16, radius: 12 } | null, // background behind each line
  // fill = text fill, stroke = text outline (align 'outside' draws behind the fill)
}

Shape layer adds = {
  shape: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'arrow',
  radius: 0,                   // corner radius for rect, px
  sides: 6,                    // polygon
  points: 5, inner: 0.5,       // star: number of points, inner radius fraction
  head: 1,                     // arrow head size factor
}

Fill =
  | { type: 'solid', color: '#rrggbb', alpha: 1 }
  | { type: 'gradient', gradient: gradientParams(...), alpha: 1 } // same object as src/shared/gradient.js, coordinates are fractions of the layer box

Stroke = { fill: Fill, width: 4, align: 'inside' | 'center' | 'outside', dash: [] , join: 'round' }

Shadow = { color: '#000000', alpha: 0.6, blur: 20, x: 0, y: 8, spread: 0, inner: false }
// Glow is a Shadow with x = 0, y = 0 and a light color. Inner shadows are phase 2b.

Mask = {
  shape: 'rect' | 'ellipse' | 'polygon',  // MASK_SHAPES naming from src/shared/shapes.js
  points: [[x, y], ...],       // fractions of the layer box (0..1)
  smooth: false,
  feather: 0,                  // px
  invert: false,
}
```

`BLEND_MODES` (in `design.js`): `source-over` (Normal), `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`. All are native `globalCompositeOperation` values.

`normalizeDesign(d)` fills every missing field with its default and clamps numbers, so old or hand-edited projects always load. It must never throw. Unknown layer types are dropped. It is called when a project loads and when a template is applied.

### 5.3 Size templates

`DESIGN_SIZES` in `design.js`. Each entry: `{ id, label, group, width, height, safe?, maxBytes? }`. Verify each number against the service's current help pages before shipping and note the source in a comment.

| id | label | size | notes |
|---|---|---|---|
| `youtube` | YouTube Thumbnail | 1280×720 | `maxBytes: 2_000_000`, safe zone: bottom right timestamp |
| `shorts` | YouTube Shorts | 1080×1920 | safe zone: bottom UI and right side buttons |
| `instagram-square` | Instagram Post | 1080×1080 | |
| `instagram-portrait` | Instagram Portrait | 1080×1350 | |
| `reels` | Reels / TikTok / Story | 1080×1920 | safe zones top and bottom |
| `facebook` | Facebook Link / Video | 1200×630 | |
| `linkedin` | LinkedIn | 1200×627 | |
| `x` | X Post | 1600×900 | |
| `vimeo` | Vimeo | 1920×1080 | |
| `twitch` | Twitch Offline Screen | 1920×1080 | |
| `podcast` | Podcast Cover | 3000×3000 | |
| `sequence` | Same as Sequence | project width × height | computed |
| `custom` | Custom | 1 to 8192 | |

Safe zones are rectangles in fractions of the design (`[{ x, y, w, h, label }]`) and are only drawn as an overlay, never exported.

### 5.4 Undo model (D8)

- `src/renderer/design/store.js` keeps its own `designUndo` and `designRedo` stacks. Each entry is `{ designs, designAssets }` (the two objects from `project.value`, which are immutable thanks to immer, so storing references is cheap). Max 200 entries, same as `MAX_HISTORY` in the editor store.
- `designCommit(mutator)`: `produce` over `{ designs, designAssets }`, push the previous pair, write `project.value = { ...project.value, designs, designAssets }`, call `scheduleSave()`.
- `designTransient` begin/update/end, same idea as `beginTransient` in `store.js`, for dragging handles and sliders: one undo step per drag.
- The editor `undo()` and `redo()` in `src/renderer/editor/store.js` must keep the current `designs` and `designAssets` when they restore an older project: `project.value = { ...restored, designs: project.value.designs, designAssets: project.value.designAssets }`. Add a test for this in `test/history.test.mjs` or `test/editor-state.test.mjs`, whichever already tests undo.
- The editor `commit()` stays as it is.
- The `undo` and `redo` commands in `registry.js` route by room: `run: () => (room.value === 'design' ? designUndo() : undo())`, and `enabled` likewise.
- Opening another project clears the design stacks.

### 5.5 Assets and files (D3 to D7)

Folder layout in a project folder:

```
<Project>/
  <Project>.reccut
  Media/  Recordings/  Optimized Media/  Exports/    (exist today)
  Designs/
    Assets/     placed files that were copied in
    Frames/     frames captured from the video
    Cutouts/    background removal masks (PNG, alpha only matters)
```

- When no project folder exists yet (unsaved project), use `${await api.baseDir()}/Designs` like `defaultExportDir()` does for exports.
- Placing a file (`assets.js` `placeFiles(paths, { copy })`):
  1. Read the pixel size (load it as an `Image` through `fileUrl(path)` from `src/renderer/player.js`).
  2. If `copy`, copy with `api.copyIntoProject([path], designsAssetsDir)` and use the returned path.
  3. Add an `Asset` with `origin: 'placed'`.
  4. Add an image layer that fits the design (`contain`, centered).
  5. All in one `designCommit`.
- The choice is made with the two commands **Place Embedded…** (copy) and **Place Linked…** (leave in place), as in Photoshop (section 5.8). Dropping files on the canvas uses the default from `prefs.importCopy`; holding Alt while dropping does the opposite. The Layers panel shows a small link icon on linked image layers.
- Unsupported or unreadable files: a toast naming the file, nothing is added.
- `getImage(layer)` returns a cached `ImageBitmap` (or `HTMLImageElement`) for `layer.asset` or `layer.media`. Cache key: absolute path plus file modified time if available, otherwise path. Large images (longest side over 4096) get a downscaled preview bitmap for the editor canvas. Export always uses the full image.
- Missing files: an image layer whose file cannot be loaded draws a gray checkerboard with "Missing file" and shows a warning in the layer panel with a "Locate…" button (`api.openFileDialog`), which updates the asset path for every layer using it.

### 5.6 Rendering

```js
drawDesign(ctx, design, getImage, {
  scale = 1,            // canvas pixels per design pixel
  transparent = false,  // skip background
  hideLayers = null,    // Set of layer ids not to draw (used while editing text in place)
  cache = null,         // optional Map for per-layer bitmaps (phase 3 performance)
})
```

Per layer, in this order:
1. Skip if `hidden`.
2. Draw the layer on its own offscreen canvas the size of its rotated bounds plus shadow and stroke margin, at `scale`. This is needed for masks, clip, outline and shadows on composite content.
3. Inside that canvas: content (image with crop, fit and adjustments via `ctx.filter`; text; shape path) with fill, then stroke (outside: draw stroke at 2× width under the fill; inside: clip to the path, draw stroke at 2× width; center: normal).
4. Apply cutout mask (phase 4) with `destination-in`, then outline (phase 4).
5. Apply shape mask with `destination-in` (or `destination-out` when inverted), feathered with `ctx.filter = blur(feather)`.
6. Composite onto the main canvas: shadows first (drawn from the layer canvas with `shadowColor/shadowBlur/shadowOffset`, one pass per shadow), then the layer with `globalAlpha = opacity` and `globalCompositeOperation = blend`.
7. `clip: true`: the layer is composited with `source-atop` against an accumulation of the layer directly below. Implement by drawing the base layer and its clipped layers on a group canvas first, then compositing that group with the base layer's blend and opacity.

Same function in the editor canvas, the template thumbnails and export, so they always match. Export draws at `scale = 1` on a canvas the exact design size (or `OffscreenCanvas`) and encodes with `convertToBlob` / `toBlob`.

### 5.8 Language and terminology (applies to every task)

Everything in the Design room is in English: labels, buttons, menus, tooltips, toasts, errors, help text, layer default names and template names. Use the names Photoshop uses, so it feels familiar. The data model keeps the field names from section 5.2; only the labels the user sees follow this table. When a task below uses another word for one of these things, the label in this table wins.

| Thing | Label in the UI | Photoshop-style shortcut (Design room only, see D12) |
|---|---|---|
| Layer list | **Layers** panel | |
| Right panel | **Properties** panel | |
| Select and move | **Move Tool** | V |
| Text | **Type Tool**; text layers are **type layers** | T |
| Shapes | **Rectangle Tool**, **Ellipse Tool**, **Polygon Tool**, **Line Tool**, **Custom Shape Tool** (star, arrow) | U, Shift+U cycles |
| Crop | **Crop Tool** | C |
| Pan / zoom | **Hand Tool** / **Zoom Tool** | H (and hold Space) / Z |
| Mask painting | **Brush Tool** / **Eraser Tool** | B / E |
| Pick a color from the canvas | **Eyedropper Tool** | I |
| Swap black and white while painting a mask | Switch Foreground and Background Colors | X |
| Transform handles | **Free Transform** | CmdOrCtrl+T |
| Duplicate | **Duplicate Layer** | CmdOrCtrl+J |
| Select all / none | **Select All** / **Deselect** | CmdOrCtrl+A / CmdOrCtrl+D |
| Groups | **Group Layers** / **Ungroup Layers** | CmdOrCtrl+G / Shift+CmdOrCtrl+G |
| Clip to the layer below | **Create Clipping Mask** / **Release Clipping Mask** | Alt+CmdOrCtrl+G |
| Arrange | **Bring to Front**, **Bring Forward**, **Send Backward**, **Send to Back** | Shift+CmdOrCtrl+], CmdOrCtrl+], CmdOrCtrl+[, Shift+CmdOrCtrl+[ |
| Shape mask (`layer.mask`) | **Vector Mask** (Add Vector Mask, Delete Vector Mask, Invert, Feather) | |
| Background removal result (`layer.cutout`) | **Layer Mask**, made by **Remove Background**; painting it is "Edit Layer Mask"; Feather and **Shift Edge** as in Select and Mask | |
| Effects (`shadows`, `stroke`, `outline`) | **Layer Style** with **Drop Shadow**, **Outer Glow**, **Stroke**. The sticker outline (`outline`) is shown as **Stroke** with Position: Outside on image layers. | |
| Shadow fields | **Blend Mode, Opacity, Angle, Distance, Spread, Size** (store `x, y` in the model, show Angle and Distance; Size is `blur`) | |
| Stroke fields | **Size, Position (Outside, Inside, Center), Fill Type (Color, Gradient)** | |
| Fill | **Color Fill** / **Gradient Fill**; gradient styles **Linear, Radial, Freeform** | |
| Blend modes | Normal, Darken, Multiply, Color Burn, Lighten, Screen, Color Dodge, Overlay, Soft Light, Hard Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity (Photoshop order, with separators between the groups) | |
| Opacity | **Opacity** (%) | |
| Image adjustments | **Brightness/Contrast**, **Hue/Saturation**, **Black & White**, **Gaussian Blur** | |
| Text settings | **Character** (font family, font style/weight, size, **Tracking**, **Leading**, All Caps) and **Paragraph** (alignment) sections | |
| Placing files | **Import Image…** is the main button in Add Content and the empty state. Its menu offers **Import Embedded…** (copies the file into the project, D4), **Import Linked…** (leaves it where it is) and **Open as New Design…**. The Design menu retains **Place Embedded…** and **Place Linked…** as familiar commands. A linked file that cannot be found shows a **Relink…** button. | |
| Saved styles | **Styles** panel, **New Style…** | |
| Saved colors | **Swatches** | |
| Templates | **Templates** (in the New Design dialog, like presets in New Document) | |
| Design size | **Canvas Size…** (keeps content size, adds or crops space) and **Image Size…** (scales everything) | Alt+CmdOrCtrl+C / Alt+CmdOrCtrl+I |
| Rotate / flip the whole design | **Rotate Canvas** 90° Clockwise / Counter Clockwise, **Flip Canvas Horizontal / Vertical** | |
| Export | **Export As…** and **Quick Export as PNG** | Alt+Shift+CmdOrCtrl+W for Export As |
| Zoom | **Fit on Screen**, **100%**, Zoom In, Zoom Out | CmdOrCtrl+0, CmdOrCtrl+1, CmdOrCtrl+=, CmdOrCtrl+- |
| Guides | **Smart Guides**, **Snap** | |

Every shortcut in this table must pass `conflictsFor()` against Design and `ALL` commands. Check this especially for the Cmd/Ctrl ones. New Design gets no shortcut, because CmdOrCtrl+N is New Project for the whole app. If a key in this table conflicts with an `ALL` command, leave it out and write it in the log. Do not move an `ALL` command.

### 5.7 Project format compatibility

- `newProject()` in `model.js` gets `designs: {}` and `designAssets: {}`.
- Loading a project without these fields must work (treat missing as empty). Write a test.
- Saving: `projects.js` `addRelative` and `resolveRelative` handle `designAssets` the same way as media `path`/`rel`.
- `history.js` snapshots the whole project file, so designs are included automatically. Check by restoring a snapshot in the manual test.

---

## 6. Phase 0: Preparation and spikes

Goal: settle the open technical questions before building. Output is code that stays (model fetch script, worker skeleton) plus notes in the progress log.

### Task 0.1: Choose the background removal model

1. Candidates, in this order. Read each model card and record license and size:
   - `onnx-community/BiRefNet_lite-ONNX` (or the closest BiRefNet lite ONNX export)
   - `onnx-community/ISNet-ONNX` / an ISNet general use ONNX export
   - `Xenova/modnet` (portraits only, use only as fallback)
   - Do NOT use `briaai/RMBG-1.4` or `RMBG-2.0`: their licenses do not allow free commercial use.
2. Only MIT, Apache 2.0 or BSD licensed weights are allowed. If none qualifies, stop and ask.
3. Write a throwaway test page (not committed) or use the worker from task 0.2 to run each candidate through `@huggingface/transformers` on 5 test images: a person in front of a busy background, a product photo, a screenshot of code, a landscape with no subject, a transparent PNG.
4. Record per model: load time, inference time for a 1024 px image on the dev machine, visual quality (1 to 5), output size and preprocessing needed.
5. Pick the best quality model that runs under about 5 seconds on 1024 px. Write the choice and the numbers in the log.

Acceptance: the log names the model, license, file list, size and timings.

### Task 0.2: Bundle the model and add the worker skeleton

1. `scripts/fetch-models.mjs`: downloads the chosen model files (config, preprocessor config, ONNX weights, the quantized variant if quality is acceptable) into `vendor/models/<model-name>/` if they are not there. Same style as `scripts/fetch-ffmpeg.mjs`. Verify a SHA-256 for each file (hardcode the hashes).
2. Add it to `postinstall` and to every `dist*` script in `package.json`, before `build.mjs`.
3. `package.json` `build.extraResources`: add `{ "from": "vendor/models", "to": "models" }`.
4. `.gitignore`: ignore `vendor/models/` if `vendor/ffmpeg` is ignored the same way (check first).
5. `src/worker/segment.html` and `src/worker/segment.js`, copied from the transcribe pair. Set `env.allowLocalModels = true`, `env.allowRemoteModels = false`, `env.localModelPath` to the models folder. The path differs between dev (`<repo>/vendor/models/`) and packaged (`process.resourcesPath/models/`); pass it in the job payload from the main process instead of computing it in the worker.
6. `scripts/build.mjs`: add the `segment` entry (esm, browser) and copy `segment.html`.
7. `src/main/jobs.js` needs no change: `getWorker('segment')` already loads `build/segment.html` with the worker preload.
8. In the worker, implement one job: `{ path, modelDir, maxSide }` → loads the image from `media://file/...` (`fileUrl` format), runs the model, returns `{ width, height, mask: Uint8Array }` (one byte per pixel). Check that the `media://` protocol works in the worker window; if not, read the file through a new tiny IPC in `preload-worker.js` and decode it with `createImageBitmap(new Blob([bytes]))`.
9. `src/main/main.js`: IPC `design:segment` that adds a job (`queue: 'heavy'`, title `Removing background`) and calls `jobs.runInWorker('segment', payload, ctx)`.
10. Turn the network off and check that segmentation still works. The worker must never try to download.

Acceptance: `npm run build` copies the worker. Calling `api.designSegment({ path })` from the dev tools console returns a mask for a test image with the network off. `npm run dist:mac` includes `Contents/Resources/models/...` (check with `ls` in the built app).

### Task 0.3: Canvas text checks

In a scratch page in the running app (dev tools), confirm and log:
- `ctx.letterSpacing` works in this Electron version.
- An outside stroke drawn as a 2× width stroke under the fill looks right with `lineJoin = 'round'` at 20 px and 60 px.
- Emoji, æøå, Arabic and Hebrew draw, and `ctx.direction = 'rtl'` works.
- `ctx.filter` with `brightness() contrast() saturate() hue-rotate() blur() grayscale()` works on `drawImage`.
- `OffscreenCanvas.convertToBlob({ type: 'image/jpeg', quality })` and `image/webp` work.

Acceptance: log entry with results. If something fails, note the fallback used in phase 2.

### Task 0.4: Frame capture path

Confirm and log how to capture a full quality composite frame for Design:
1. Call `api.startExport(project, { frame: frameExportSettings(...), output: '<Designs/Frames>/<name>.png', sourceMedia: 'original', quiet: true })`.
2. Check the payload of `export:done` (`src/main/main.js` around line 855). It must carry the job id and the final file path (the output name can change through `uniqueOutput`). If it does not carry the id, add it.
3. Add a `quiet` flag: the existing `api.onExportDone` toast in `ExportDialog.jsx` must skip quiet jobs. Pass `settings.quiet` through to `export:done`.
4. Measure how long a 1920×1080 frame takes. If it takes over 2 seconds, note it; the frame picker will show a spinner on the button.

Acceptance: a frame PNG is written without the "Export finished" toast. Log the timing.

---

## 7. Phase 1: The room, the canvas and a usable first version

Goal: make a YouTube thumbnail from a frame of the video plus a title, and export it. This phase must be useful on its own.

### Task 1.1: Data model and project format

Files: `src/shared/design.js`, `src/shared/model.js`, `src/main/projects.js`, `test/design.test.mjs`.

1. Implement in `design.js`: `DESIGN_SIZES`, `BLEND_MODES`, `newDesign({ name, width, height, size })`, `newLayer(type, props)`, `normalizeDesign(d)`, `normalizeLayer(l)`, `designList(project)` (sorted by `created`), `layerBounds(layer)` (axis aligned bounds after rotation), `hitTest(design, x, y)` (topmost visible, unlocked layer whose rotated box contains the point; use the inverse rotation), `fitBox(srcW, srcH, boxW, boxH, mode)` for cover/contain.
2. `model.js` `newProject()`: add `designs: {}` and `designAssets: {}`. Do not add them to `SEQUENCE_FIELDS`.
3. `projects.js`: `SUBDIRS.designs = 'Designs'`. In `addRelative`: for each asset set `rel`. In `resolveRelative`: fix `path` from `rel` when the absolute path is missing, same as media.
4. Tests:
   - `newDesign` gives valid defaults; sizes outside 1..8192 or not whole numbers throw a plain error.
   - `normalizeDesign` on `{}`, on a design with a layer missing every field, on a layer with an unknown type, on `NaN` numbers: never throws, fills defaults, drops unknown types, clamps opacity to 0..1.
   - `hitTest` with a 45° rotated layer: a point inside the rotated box but outside the unrotated box hits; the reverse case misses. Flipped layers hit the same as unflipped. Hidden and locked layers are skipped.
   - `fitBox` cover and contain for wide, tall and equal ratios.
   - A project object without `designs` passes through the design helpers without throwing (`designList` returns `[]`).

Acceptance: tests pass. An old project opens and saves without errors, and the saved file then contains `designs: {}`.

### Task 1.2: Room shell and command routing

Files: `src/renderer/app.jsx`, `src/renderer/registry.js`, `src/renderer/design/DesignRoom.jsx`, `src/renderer/design/store.js`, `src/renderer/editor/store.js`, `src/renderer/styles/app.css`.

1. `registry.js`: `const DESIGN = ['design']`; add `'design'` to `ALL`. Add `{ id: 'roomDesign', label: 'Design', menu: 'View', keys: 'CmdOrCtrl+4', register: true, rooms: ALL, run: () => (room.value = 'design'), checked: () => room.value === 'design', help: 'design' }` after `roomExport`. Leave out `keys` while D1 is open (CmdOrCtrl+4 belongs to `inspector:video`); add it only after the decision is recorded in D1.
2. `app.jsx` `TitleBar`: a fourth room button after Export with a lucide icon (`Palette` or `PenTool`, check that it exists in `lucide-preact`), label "Design", same title pattern. The `actions` area for Design shows Undo, Redo and an "Export Design…" primary button.
3. `app.jsx` room area: `<div class="room" hidden={r !== 'design'}><DesignRoom active={r === 'design'} /></div>`.
4. `design/store.js`: signals `currentDesignId`, `selection` (array of layer ids), `tool` (`'select' | 'text' | 'shape' | 'hand'`), `zoom` (`'fit'` or a number), plus `designCommit`, design transient helpers, `designUndo`, `designRedo`, `canDesignUndo`, `canDesignRedo` (section 5.4). When the project changes identity (another project opened), reset stacks, selection and `currentDesignId`.
5. `editor/store.js` `undo()` and `redo()`: keep current `designs` and `designAssets` (section 5.4). Test it.
6. `registry.js` `undo`/`redo` commands route by room.
6b. Keep Design separate from Edit (D12). Today `runCommand()` in `registry.js` (line 407) switches to Edit when a command does not belong to the current room. Menu accelerators (`register: true`) go through `handleMenu` in `app.jsx` and then `runCommand`. Without a change, pressing an Edit shortcut such as CmdOrCtrl+C or CmdOrCtrl+E in Design would throw the user into Edit. Change `runCommand` so that when `room.value === 'design'` and the command's rooms do not include `'design'`, it does nothing and returns `false`. Record and Export keep today's behaviour. Registered commands that Design needs as well (Undo, Redo, Cut, Copy, Paste, Select All, Delete) get `rooms` that include `'design'` and route by room inside `run`. Test: with `room` set to `'design'`, `runCommand('tool:blade')` returns `false` and `room` stays `'design'`; `runCommand('undo')` calls the design undo.
7. `DesignRoom.jsx`: layout with three columns (left panel 260 px, canvas, right panel 300 px) and the layer panel at the bottom of the right column. Empty state when the project has no designs: big "New Design" button and the size template grid.
8. Check `commandForEvent` usage: commands without `rooms` default to `EDIT`, so timeline shortcuts do not fire in Design. Verify that Backspace, arrows, Space and letter keys do nothing in Design yet.

Acceptance: the title bar button and View › Design open Design (and the shortcut, once D1 is decided); ⌘1 to ⌘3 still work; the View menu shows Design checked; timeline shortcuts do not run in Design; Edit undo does not touch designs (test).

### Task 1.3: New Design dialog and design list

Files: `src/renderer/design/NewDesignDialog.jsx`, `DesignRoom.jsx`.

1. A `Modal` with a grid of `DESIGN_SIZES` grouped by `group` (Video, Social, Other). Each card shows the label, the size in pixels and a small aspect rectangle.
2. Custom: width and height `NumberField`s (1..8192), a lock aspect toggle, swap button. Validation message under the fields, not a toast.
3. Name field, default "<project name> Thumbnail" (or "<project name> <label>").
4. Create: `designCommit` adds the design, opens it.
5. Left panel "Designs" list: each item shows a live thumbnail (drawn with `drawDesign` at small scale, redrawn when the design changes, throttled), name, size. Actions: rename (double click), duplicate, delete (confirm), change size (opens the dialog in "resize" mode: phase 7 adds smart reflow; in phase 1 resizing keeps layer positions relative to the center).

Acceptance: create designs of every template and a custom 333×777; rename, duplicate, delete, undo each of these.

### Task 1.4: Canvas view with selection and transform

Files: `src/renderer/design/Canvas.jsx`, `src/shared/designRender.js` (first version: solid fills, images, plain text, rectangles; no shadows or masks yet).

1. A `<canvas>` sized to the container with `devicePixelRatio`. The design is drawn centered, zoom `fit` by default. A checkerboard shows transparency.
2. Redraw on any change of the current design or images loaded (signal effect plus `requestAnimationFrame`, never more than once per frame).
3. Selection: click selects the hit layer (`hitTest`), Shift+click toggles, drag on empty area makes a marquee. Click on empty area clears.
4. Handles on the selection bounds: 8 resize handles, a rotation handle above the top edge. Shift keeps aspect while resizing (images keep aspect by default, Shift frees it). Alt resizes from the center. Shift while rotating snaps to 15°.
5. Move by dragging. Arrow keys move 1 px, Shift+arrow 10 px.
6. Snapping: to design edges and center, and to other layers' edges and centers, within 6 screen pixels. Show the guide lines while dragging. Hold Cmd/Ctrl to disable snapping.
7. Each drag is one undo step (design transient).
8. Zoom: Cmd/Ctrl + scroll, Cmd/Ctrl + `+`/`-`, Cmd/Ctrl+0 fit, Cmd/Ctrl+1 100%. Pan: Space + drag, or scroll. Register these as commands with `rooms: DESIGN`.
9. Delete/Backspace deletes the selection. CmdOrCtrl+J is Duplicate Layer. CmdOrCtrl+A is Select All (unlocked layers). CmdOrCtrl+D and Escape are Deselect. CmdOrCtrl+T shows Free Transform handles on the selection (they show on select anyway; the command exists for familiarity). Labels and keys follow section 5.8.

Tests (`test/design.test.mjs`): resize math for a rotated layer (dragging the bottom right handle of a 30° rotated layer keeps the opposite corner fixed in design space), aspect lock, center resize, rotation snapping, snapping to the nearest candidate within the threshold. Put this math in `design.js` as pure functions (`resizeLayer(layer, handle, dx, dy, { keepAspect, fromCenter })`, `snapMove(...)`) and test them there.

Acceptance: all transform interactions work on rotated and flipped layers; every drag undoes in one step.

### Task 1.5: Text and rectangle tools

1. Text tool (T): click on the canvas creates a text layer with the project name as text (D9), font `sans`, weight 800, size 10 % of the design height, white fill, centered. Double click a text layer edits it in place: an absolutely positioned, transparent `<textarea>` over the layer with the same font, while `drawDesign` hides that layer (`hideLayers`). Escape or click outside ends editing. Empty text after editing deletes the layer.
2. Shape tool (U for now, rectangle only in phase 1): drag to draw a rectangle, Shift for a square.
3. Basic text layout in `designText.js`: lines from `\n`, wrapping to the box width with `wrapText` logic, `align`, `lineHeight`. `autofit` shrinks the size until the text fits in the box (binary search on size, minimum 6 px). Tests with a fake `measure` (each character = 0.6 × size wide).

Acceptance: creating, editing and deleting text works with undo. Æøå, emoji and long words work. Text with autofit never overflows its box in the tests.

### Task 1.6: Frame picker

Files: `src/renderer/design/FramePicker.jsx`, `assets.js`.

1. A panel (left panel tab "Video") with its own `createPlayer` instance (copy the setup from `ExportRoom.jsx` line 80), showing the current sequence.
2. A scrubber with a filmstrip (reuse the existing thumbnail strip data from media if available; otherwise just a plain slider) and the timecode. Left/Right arrow keys step one frame when the picker has focus, Shift+arrow steps one second.
3. A "Use This Frame" button: captures the complete frame in full sequence resolution through the path from task 0.4 into `Designs/Frames/<project> <timecode>.png`, then adds an asset (`origin: 'frame'`) and an image layer fitted inside the design without cropping, with its original aspect ratio (`fit: 'contain'`), placed at the bottom of the stack (above the background). The button shows a spinner while the export job runs.
4. Empty timeline or audio only: the picker shows "Add video to the timeline in Edit to pick a frame. You can still place your own images." and the button is disabled.
5. Also allow picking from any video media in the project (dropdown "Sequence / <media name>"): render that media alone using `mediaPreviewProject(m)` from `src/renderer/editor/playback.js`.

Acceptance: picking a frame in a 1080p project for a 1280×720 design gives a sharp layer; for a 1080×1920 design the whole frame remains visible and can be moved and scaled; deleting the source clip afterwards leaves the design intact.

### Task 1.7: Placing images

Files: `assets.js`, `DesignRoom.jsx`, `Canvas.jsx`.

1. Two commands and a split button, **Place Embedded…** (copies into the project) and **Place Linked…** (leaves the file where it is), as in section 5.8. The main part of the button uses the default from `prefs.importCopy`. No default shortcuts. Both open `api.openMediaDialog` or `api.openFileDialog` with image filters (png, jpg, jpeg, webp, gif, bmp, svg, heic if supported by Chromium on the platform, psd).
2. Copy or link follows the command used (section 5.5). There is no extra dialog.
3. Drop files on the canvas: place at the drop point. Use `src/renderer/fileDrop.js` helpers to get paths.
4. Paste an image from the clipboard (Cmd/Ctrl+V when the canvas has focus and the clipboard holds an image): write it to `Designs/Assets/Pasted <date>.png` with `api.writeBinary` and place it (always copied).
5. "From Project" tab in the left panel: image media from Edit, click to add as `layer.media` (D5). Video media shows "Use the Video tab to pick a frame".
6. PSD and SVG: in phase 1 place them flattened (PSD through the existing proxy conversion if needed; check how `media.js` makes a PNG proxy for PSD and reuse that call). Separate layers come in phase 3.
7. Missing file display and Locate (section 5.5).

Acceptance: placing with copy puts the file in `Designs/Assets/`; placing without copy references the original; neither appears in the Edit media browser; dropping, pasting and From Project work.

### Task 1.8: Layer panel (basic)

Files: `src/renderer/design/LayersPanel.jsx`.

1. List top layer first. Each row: small preview, name, eye toggle (hidden), lock toggle, warning icon for missing files.
2. Click selects, Shift+click range selects, Cmd/Ctrl+click toggles.
3. Drag to reorder (one undo step). Cmd/Ctrl+] and Cmd/Ctrl+[ move up/down, with Shift to top/bottom.
4. Double click the name to rename.
5. Context menu (`api.popupMenu`): Duplicate, Delete, Bring to Front, Send to Back, Hide, Lock.

Acceptance: reordering changes the drawing order on the canvas; everything undoes.

### Task 1.9: Properties panel (basic)

Files: `src/renderer/design/Properties.jsx`.

1. Sections (`Section` from `ui.jsx`): Position and Size (x, y, w, h, rotation as `NumberField`s; flip buttons), Opacity (`Slider`), Fill (solid color only in phase 1), Text (font with the reused `FontSelect`, weight, size, align, line height, uppercase, autofit), Image (fit mode, reset crop), Design (background color or transparent, size, name) when nothing is selected.
2. With several layers selected, show only shared fields; changing one sets all (one undo step).
3. Slider drags are one undo step (transient).

Acceptance: every field changes the canvas live and undoes in one step.

### Task 1.10: Export

Files: `src/shared/designExport.js`, `src/renderer/design/ExportDesignDialog.jsx`, `test/design-export.test.mjs`.

1. Dialog: format (PNG, JPEG, WebP from `FRAME_FORMATS`), quality slider for JPEG/WebP, "Transparent background" for PNG/WebP, scale (1×, 2×, or exact width), "Keep under" size limit (off, the template's `maxBytes`, custom MB), file name (default `<design name>`), folder (default `defaultExportDir()`).
2. `fitToSize(encode, maxBytes, { min = 0.4, max = 0.95, steps = 7 })`: binary search on quality using an `encode(quality) → Promise<Blob|Uint8Array>` function; returns the best quality under the limit, or the minimum with `{ over: true }`. Pure, tested with a fake encoder.
3. Render with `drawDesign` on an `OffscreenCanvas` at the export size, encode, write with `api.writeBinary`. Show a toast with Reveal, like frame export.
4. File names: strip `\/:*?"<>|`, keep emoji, never empty (fallback "Design"). Never overwrite silently: if the file exists, add " 2", " 3" (test the naming function).
5. JPEG export of a transparent design: fill with the background color or white.

Tests: `fitToSize` finds the highest quality under the limit, returns `over` when impossible, never calls `encode` more than `steps + 1` times; file naming edge cases (empty, only invalid characters, emoji, 300 characters long → cut to 200).

Acceptance: a 1280×720 thumbnail with a photo exports as JPEG under 2 MB with the limit on; PNG with transparency keeps alpha; the exported file matches the canvas.

### Task 1.11: Packaging (D7)

Files: `src/shared/package.js`, `src/main/packager.js`, `src/renderer/ProjectDialogs.jsx`, `test/package.test.mjs`, `test/packager.test.mjs`.

1. `package.js`: `designMediaIds(p)` returns the set of media ids used by image layers in any design. `reduceProject` with `removeUnused` must keep those media. The trim option must not trim them (images are not trimmed today; still add a guard and a test).
2. `package.js`: `designFiles(p)` returns `[{ assetId, name, path }]` for every asset used by at least one layer (including `cutout.asset`). Unused assets are left out when `removeUnused` is on, otherwise included.
3. `ProjectDialogs.jsx`: pass `designFiles` with the payload. Include their sizes in the size estimate (`api.packageSizes`).
4. `packager.js` `writePackage`: copy each design file to `<package>/Designs/<subfolder>/` keeping the subfolder (`Assets`, `Frames`, `Cutouts`) when the file came from the project's Designs folder, otherwise into `Designs/Assets/`. Use `uniquePath`. Verify size after copy, like media. Rewrite `p.designAssets[id].path` to the copy and set `copied: true`. Missing files go into the report's missing list.
5. Report: a "Design files" section listing copied files, and a "Fonts used in designs" section listing font families (from text layers, excluding `sans`/`serif`/`mono`) with the note "Fonts are not copied. Install them on the other computer."
6. Tests: package a project with a copied asset, a not copied asset outside the project, a frame, a cutout mask, an Edit image media used only by a design, and an unused asset. After packaging: all used files exist in the package, paths point inside the package, the Edit media was not removed, the unused asset is left out with `removeUnused`, the report lists the fonts. Then move the original files away and load the packaged project: no missing assets.

Acceptance: tests pass, and a manual package and reopen from a different folder shows every design intact.

### Phase 1 workflow test (manual, in the app)

1. Record a short clip with the camera on, go to Edit, trim it, go to Design.
2. New Design → YouTube Thumbnail. Pick a frame. Add a title. Change its font and size. Move it with snapping.
3. Export JPEG with the 2 MB limit. Open the file and compare to the canvas.
4. Package the project, move the package to another folder, open it, check the design.
5. Undo in Design several times, switch to Edit, undo there: the design must not change.

### Phase 1 unusual use (manual, record results in the log)

- Empty timeline: frame picker disabled with the message, placing images works.
- Audio only project.
- Media offline: frame picker shows the Media Offline test card frame; picking it works but warns.
- Delete the source clip after picking a frame: the design is unchanged.
- Designs of 8192×8192, 1×1 and 100×2000.
- A 50 megapixel JPEG: the canvas stays responsive; export uses full resolution.
- A corrupt image file and a text file renamed to `.png`: a toast, nothing added.
- Unsaved project: files go to the base Designs folder; after Save, the design still shows them.
- Open the project in the previous Reccut version (if available): it must open (unknown fields are ignored).
- Undo right after switching rooms; undo after closing and reopening the project (stacks are empty, nothing breaks).
- Two Reccut windows are not supported today; ignore.

---

## 8. Phase 2: Styles, shapes and text effects

Goal: everything you need to style a thumbnail: gradients, strokes, shadows, glow, blend modes, adjustments, more shapes and rich text.

### Task 2.1: Fills and gradients

1. `designRender.js`: `paintFill(ctx, fill, box)`: solid → `fillStyle` with alpha; gradient → `renderGradient(fill.gradient, w, h)` drawn as a pattern clipped to the path. Gradient coordinates are fractions of the layer box.
2. Properties: Fill section with a `Segmented` (None, Solid, Gradient). Gradient uses `GradientEditor` from `src/renderer/editor/GradientEditor.jsx` with `aspect = w / h`. Check its props (`params`, `onStart`, `onInput`, `onCommit`, `onCancel`) and map them to design transient.
3. Design background uses the same Fill UI.
4. Tests: gradient fill on a rotated layer uses the layer box (not the design) for coordinates; alpha applies.

### Task 2.2: Stroke

1. `Stroke` on shapes and text (section 5.2). Align inside/center/outside as described in 5.6. Dash presets: solid, dashed, dotted. Join: round by default.
2. Stroke width 0 means no stroke. Maximum 500 px.
3. Tests: bounds include the stroke margin for center and outside strokes, not for inside.

### Task 2.3: Shadows and glow

1. A list of shadows per layer: add, remove, reorder. Fields: color, alpha, blur, x, y (or angle and distance), spread.
2. Presets in the add menu: Soft Drop Shadow, Hard Shadow, Outer Glow (x = y = 0, light color), Long Shadow (several stacked hard shadows; implement as one preset that adds 1 shadow with large offset and 0 blur).
3. Spread: draw the layer with a stroke of `spread` px in the shadow color into the shadow pass (shapes and text) or dilate the alpha (images; phase 4 adds the dilate function; until then spread is disabled for images).
4. Rendering per 5.6 step 6. Shadows extend the layer canvas margin: margin = max(blur × 2 + |offset| + spread).
5. Tests: margin calculation; shadow order.

### Task 2.4: Opacity, blend modes, image adjustments

1. Blend mode `Select` with all `BLEND_MODES` and plain labels.
2. Image adjustments: brightness, contrast, saturation, hue, blur, grayscale via `ctx.filter` (verified in 0.3). "Reset" button.
3. Optional and only if `filmLooks.js` exposes a function that works on a canvas or `ImageData` without timeline context: a "Look" `Select` applying the same looks as video. If it needs timeline context, skip and log it.

### Task 2.5: More shapes

1. Shape tool menu: rectangle (with corner radius), ellipse, polygon (3..12 sides), star (3..24 points, inner radius), line, arrow.
2. Paths are built in `design.js` as point lists in box fractions and turned into `Path2D` in the renderer. Reuse `ellipsePoints` and `shapePath` from `shapes.js` where the formats match.
3. Line and arrow use stroke only by default; arrow head scales with stroke width.
4. Tests: polygon and star point counts and that all points are inside the box; corner radius clamps to half the shortest side.

### Task 2.6: Rich text

1. Fill and gradient fill on text (gradient spans the whole text box).
2. Outline (stroke, outside by default for text).
3. Background box per line: fill, padding, corner radius.
4. Highlight: `*word*` (pairs of asterisks) draws those words with `highlight` fill. A literal asterisk is written `\*`. Parsing in `designText.js` with tests (nested, unclosed, escaped, at line start and end).
5. Tracking, line height, vertical alignment, uppercase.
6. Missing font: if `document.fonts.check()` says a family is not available, draw with the fallback stack and show a warning icon on the layer with the text "Font not installed: <name>".
7. Tests in `test/design-text.test.mjs`: highlight parsing; autofit with tracking and uppercase; wrapping with very long words (break inside the word only when a single word is wider than the box); empty text; 2000 characters (autofit stops at the minimum size and reports overflow).

### Phase 2 workflow test

Make a classic tutorial thumbnail: frame background darkened (brightness -0.3), a big yellow title with a black outside outline of 12 px and a drop shadow, one highlighted word in red, a red arrow pointing at a detail, a rounded rectangle "NEW" badge with a gradient. Export, compare with the canvas.

### Phase 2 unusual use

- Stroke 0 px and 500 px; shadow blur 0 and 500.
- Text that is only emoji; Arabic text with `align: right`.
- Gradient with one stop or 32 stops.
- Blend mode on the bottom layer with a transparent background exported as PNG.
- A font that exists only on this machine, then rename the font in the project file to something that does not exist: the warning shows, nothing crashes.

---

## 9. Phase 3: Editing tools and layer ergonomics

### Task 3.1: Groups

1. Cmd/Ctrl+G groups the selection (moves the layers to be contiguous at the position of the topmost one), Shift+Cmd/Ctrl+G ungroups.
2. Clicking a grouped layer selects the whole group; double click selects the single layer inside.
3. Transforming a group transforms every member around the group bounds center. Non-uniform scaling of a group that contains rotated layers scales each member's box and position, not its shape (no skew). Document this in a comment.
4. Layer panel shows groups as an indented block with a collapse arrow and the group name (stored as a name on the first layer: `groupName`; keep it simple).
5. Tests: grouping keeps the relative z-order; group rotate then ungroup keeps every member's visual position.

### Task 3.2: Align and distribute

1. Align left/center/right/top/middle/bottom to the selection bounds, or to the design when one layer is selected.
2. Distribute horizontally/vertically (needs 3+ layers) by equal spacing.
3. Pure functions in `design.js` with tests, including rotated layers (use axis aligned bounds).

### Task 3.3: Clipboard

1. Cmd/Ctrl+C/X/V copy layers (with the assets they reference) inside and between designs, and between projects (the clipboard holds JSON with absolute asset paths; pasting into another project registers the assets).
2. Pasting from the OS clipboard: image → place; plain text → new text layer.
3. Paste in place keeps position; paste into a design of another size keeps the relative position.

### Task 3.4: Crop tool for images

1. Double click an image layer (or the Crop button) enters crop mode: the full image shows dimmed, the visible part bright; drag the image inside the box, drag crop handles to change `crop`. Enter applies, Escape cancels. One undo step.
2. Aspect presets in crop mode: free, design, 1:1, 16:9, 9:16, 4:5.

### Task 3.5: PSD and SVG as layers

1. Placing a PSD or layered SVG asks "Place as one image" or "Place layers" (reuse `importLayered` flow in `src/renderer/editor/layers.js` and `api.psdLayers` / `api.psdExtract`). Layers become image assets under `Designs/Assets/<file name>/` and image layers at their positions.

### Task 3.6: Performance

1. Cache each layer's rendered bitmap keyed by a hash of the layer object identity (immer keeps identity for unchanged layers) plus scale. Unchanged layers are not redrawn.
2. Budget: with 300 mixed layers on a 1920×1080 design, dragging one layer redraws at 60 fps on an M1 class machine. Measure with the Performance panel and log the result.

### Task 3.7: Shortcuts and help

1. All Design commands in `registry.js` with `rooms: DESIGN`, `menu` entries in a new "Design" menu or under existing menus, and `help: 'design'`.
2. Tool shortcuts: V select, T text, U shape (cycles shapes with Shift+U), H hand, C crop. Check they do not collide with other Design commands. Collisions with Edit commands are fine (D12).
3. Shortcuts with Cmd/Ctrl are menu accelerators when `register: true`, and menu accelerators work in every room. Design commands with Cmd/Ctrl keys that Edit also uses (for example CmdOrCtrl+G, CmdOrCtrl+D, CmdOrCtrl+]) must therefore NOT use `register: true`; they are handled by `commandForEvent` with the room check. The exceptions are Undo, Redo, Copy, Cut, Paste, Select All and Delete, which stay registered and route by room inside `run` (section 5.4, task 1.2 step 6b). Use the keys and labels from section 5.8.
4. The keyboard shortcut editor (Settings and `src/renderer/keyboard.js`) shows Design commands as their own group "Design", so users see the two shortcut sets separately. Customizing a Design shortcut only checks for conflicts among Design and `ALL` commands (already the behaviour of `conflictsFor`). Test: assigning T to a Design command reports no conflict with an Edit command on T; assigning CmdOrCtrl+S reports the conflict with Save.
5. Add every Design shortcut to the help article and to Quick Search (they appear automatically when they are in `COMMANDS` with a `help` id).

### Phase 3 unusual use

- Select all with some layers locked; group a locked layer (refused with a toast).
- Rotate a group by 90°, resize it non-uniformly, ungroup: no skew, positions match.
- Copy layers from a design in project A, open project B, paste: the images show, the assets are registered in B.
- Paste a 12000 px screenshot.
- 300 layers: scroll the layer panel, reorder by dragging, undo 50 times quickly.

---

## 10. Phase 4: Background removal and masks

### Task 4.1: Remove Background

1. Image layer Properties: "Remove Background" button. Runs `api.designSegment({ path, maxSide: 1024 })` (task 0.2) as a background job with progress in the tasks indicator.
2. The mask (one byte per pixel at the model's output size) is scaled up to the source image size with smoothing and saved as a PNG in `Designs/Cutouts/<asset name> cutout.png` (white with the mask in the alpha channel). Register it as an asset (`origin: 'cutout'`), set `layer.cutout = { asset, enabled: true, feather: 0, shift: 0 }`.
3. The original image is never changed. Toggle `enabled` to compare.
4. Feather (0..50 px) and edge shift (-20..20 px: negative erodes, positive dilates) are applied at draw time. Implement `dilateAlpha(alpha, w, h, radius)` and `erodeAlpha(...)` as pure functions in `design.js` (separable max/min filter) and test them on small arrays.
5. While a job runs for a layer, the button shows progress and Cancel. Deleting the layer, undoing, or switching project cancels the job and discards the result. A result for a layer that no longer exists is ignored.
6. Shortcut for tutorial makers: in the Video tab, "Cut Out Camera" captures the camera stream alone at the playhead (`readClipFrames` for the camera clip, or a frame export of a project containing only the camera clip), places it and runs Remove Background on it.

### Task 4.2: Refine brush

1. In cutout refine mode: Erase and Restore brushes with size and hardness, painting into the cutout mask (an offscreen canvas at the mask resolution). Coordinates go through the inverse of the layer transform (rotation, flip, crop, fit) so painting is correct on any layer. Put this transform in a pure function and test it with rotated, flipped and cropped layers.
2. Strokes are one undo step each. Saving writes the mask PNG again (new file name per save, so undo can point to the old one; old files are cleaned up when no history entry and no layer references them, at project save time).

### Task 4.3: Sticker outline

1. `layer.outline = { color, width }`: draws the dilated alpha of the layer (after cutout and mask) in the outline color behind the layer. Works for images and text.
2. Uses `dilateAlpha` from 4.1.

### Task 4.4: Shape masks and clipping

1. Mask section in Properties: Add Mask (rectangle, ellipse, polygon from `MASK_SHAPES`), edit points on the canvas (drag points, like the editor's mask handles), feather, invert, remove.
2. `clip` toggle: "Clip to Layer Below". The layer panel shows clipped layers indented with a clip icon. Rendering per 5.6 step 7.
3. Image inside text: put an image above a text layer and turn on clip. Add this as a one-click "Fill Text with Image" action when a text layer and an image layer are selected.

Tests: `dilateAlpha`/`erodeAlpha`; brush coordinate transform; clip compositing on tiny canvases is not testable in Node, so test the ordering logic (which layers form a clip group) as a pure function.

### Phase 4 workflow test

Cut out the presenter from the camera recording, add a white 10 px sticker outline and a soft shadow, put a screenshot frame behind it darkened, add a title clipped to a gradient. Export.

### Phase 4 unusual use

- Images with no clear subject (landscape, code screenshot): the result may be poor; nothing crashes; the user can erase and restore by hand.
- An already transparent PNG; a 1×1 image; a 12000 px image.
- Start removal, then: delete the layer, undo, close the project, switch rooms, run it twice in a row. No orphaned layers, no stuck tasks.
- Network off: works (bundled model).
- Packaged app: the model loads from `Resources/models`.
- Refine brush on a rotated, flipped and cropped layer: painting lands under the cursor.

---

## 11. Phase 5: Styles, presets and templates

### Task 5.1: Saved styles

1. "Save Style…" on any layer: saves the style fields (for text: font, weight, size relative to design height, tracking, line height, uppercase, fill, highlight, stroke, shadows, box, outline; for shapes: fill, stroke, shadows, radius, outline; for images: adjust, shadows, outline) under a name.
2. Stored globally in `prefs` (`designStyles: [{ id, name, type, style }]`), so they work across projects. Check the size: keep at most 500 styles; refuse beyond that with a toast.
3. Styles panel (left panel tab "Styles"): built-in text styles first, then "My Styles", each with a live preview. Click applies to the selected layers of the same type (one undo step). Right click: rename, delete, update from selection.
4. Applying copies values (no live link). `layer.style` records the id for information only.

### Task 5.2: Built-in text styles

Make 15 built-in text styles in `designTemplates.js`, each with an id and a name. Include at least: Bold Yellow Outline, Clean White, Black Box, Neon Glow, Red Highlight, Gradient Pop, Retro Shadow, Minimal Serif, Code Mono, Sticker White, Big Number, Subtitle Small, News Bar, Soft Pastel, Outline Only. Use only `sans`, `serif`, `mono` or fonts that ship with macOS and Windows (Arial, Impact, Georgia, Courier New, Trebuchet MS, Verdana), so they look the same everywhere.

### Task 5.3: Design templates with placeholders

1. A template is a design with extra fields: `placeholder` on layers (`'frame' | 'cutout' | 'title' | 'subtitle' | 'logo'`) and `anchor` on layers (`{ x: 'left'|'center'|'right'|'stretch', y: 'top'|'middle'|'bottom'|'stretch' }`) used when resizing.
2. File format `reccut-design-template`, version 1, JSON. Same approach as `TEMPLATE_FORMAT` and `validateTemplate` in `titletemplates.js`. Templates do not embed images except optional small decoration images as data URLs under 1 MB each.
3. `validateDesignTemplate(data)` must reject: wrong format or newer major version, more than 200 layers, unknown layer types (drop them instead, with a warning), any image path (only data URLs or placeholders are allowed), data URLs over 1 MB, sizes outside 1..8192.
4. `applyTemplate(template, { width, height, frame, cutout, title, subtitle, logo })`: returns a new design. Placeholders get the given assets/text (title defaults to the project name, D9). Layers are moved and scaled by their anchors to the target size.
5. Built-in templates: at least 12 for 16:9, 6 for 9:16, 4 for 1:1. Every built-in template must work at all three ratios through anchors (test this: apply each built-in to 1280×720, 1080×1920, 1080×1080 and check that every layer stays inside the design).
6. Templates panel (left panel tab "Templates"): previews rendered with the current frame (if any) and the project name, grouped by ratio. Click creates a new design from it.
7. "Save as Template…" on a design; "Import Template…" and "Export Template…" (`.reccut-design-template` file) in the Templates panel menu. User templates are stored in `userData/design-templates/` through a new IPC (`design:templates:list/save/remove`), not in prefs.

### Task 5.4: Brand kit (small)

1. "My Colors": up to 20 saved colors shown at the top of every color picker in Design.
2. "My Logo": one image (copied to `userData/brand/`) used for the `logo` placeholder.

Tests (`test/design-templates.test.mjs`): validation accepts every built-in template; rejects path traversal (`../../etc/passwd`), absolute paths and `file://` URLs in any image field; rejects huge data URLs; anchors keep layers inside for every built-in at every ratio; placeholders fill correctly; a template with a missing font still applies.

### Phase 5 unusual use

- A 16:9 template applied to 9:16 and to 3000×3000.
- Import a template made by a newer version (version 2): refused with a clear message.
- Import a file that is not JSON, and a JSON file with 10 000 layers.
- Two user templates with the same name: both kept, second named "<name> 2".
- 500 saved styles: the Styles panel stays fast (virtualize or paginate if not).

---

## 12. Phase 6: Automatic suggestions from the video

### Task 6.1: Frame candidates and scoring

1. `thumbScore.js`: `scoreFrame({ data, width, height })` returns `{ sharpness, exposure, contrast, colorfulness, score }`, all 0..1. Sharpness: variance of a Laplacian on a 256 px wide grayscale version. Exposure: penalty for mean luma near 0 or 1. Colorfulness: Hasler and Süsstrunk metric. Score: weighted sum, weights in one exported constant.
2. Sampling (renderer, `assets.js` or a new `suggest.js` in `src/renderer/design/`): up to 60 times spread over the sequence, plus 0.5 s after each primary clip start. Skip times inside transitions and fades (read from the project clips). Grab frames at 256 px wide from the Design frame picker player instance (draw the player canvas into a small canvas), not through the export pipeline, so it is fast.
3. Bonus: +0.15 when a camera clip is visible at that time (the project knows camera clips; check the clip model in `model.js` for how camera is marked).
4. Pick the top 6 with a minimum distance of 5 % of the duration between picks.
5. Time cap: the whole analysis must finish under 15 s for a 3 hour sequence (it is bounded by the 60 + clip starts samples; cap clip starts at 120).

### Task 6.2: Title candidates

1. Offline sources, in order: project name, sequence names (if not "Sequence 1"), text of title clips on the timeline, the first caption lines, frequent 2 to 4 word phrases in captions (ignore stop words in English and Norwegian; a small built-in list).
2. Return up to 5 unique strings, each max 60 characters.
3. Optional "Suggest Titles with AI" button: shown only when the AI agent is configured (`api.aiConfig`). Before the first use it says "The transcript is sent to <provider name> to suggest titles." Use `api.aiComplete` with a short prompt asking for 5 short, punchy titles in the language of the transcript, one per line. Never runs automatically.

### Task 6.3: Suggestions grid

1. "Suggestions" button in the Design empty state and the Templates panel. Shows a grid: top frames × 4 suitable templates (by ratio of the chosen size) with the first title candidate.
2. Clicking a suggestion captures that frame in full quality (task 1.6 path) and creates a real, editable design from the template.
3. A "Shuffle" button tries other templates and titles.

Tests (`test/thumb-score.test.mjs`): a sharp checkerboard scores higher than its blurred version; an all black frame scores lowest; a colorful frame beats a gray one; picking respects the minimum distance; title extraction from a fake caption list gives expected phrases and skips stop words.

### Phase 6 unusual use

- A 3 second video; a 3 hour video (time it); an all black video; a screen recording without a camera; a project without captions; Norwegian speech captions.
- AI not configured: no AI button visible. AI configured but offline: a toast with the error, offline suggestions still work.

---

## 13. Phase 7: Thumbnail tools and export

### Task 7.1: Feed preview

1. A "Preview" toggle shows the design at real feed sizes in a mock video list: large (360 px wide), medium (246 px), small (168 px), and a phone layout. Light and dark backgrounds. A duration badge in the bottom right corner using the sequence duration, and a progress bar option.
2. Generic look only: no YouTube or other brand names, logos or exact UI copies.

### Task 7.2: Safe zones and readability

1. "Show Safe Zones" overlay from `DESIGN_SIZES[].safe`, drawn in the canvas view only.
2. Readability check (pure function in `design.js`, tested): warns when a text layer would be under 12 px tall at 168 px wide, when text contrast against the pixels behind it is low (sample the rendered design behind the text box, compute WCAG contrast ratio, warn under 3:1), or when a text layer overlaps a safe zone.
3. Warnings show as a small list in the right panel with "Select" buttons.

### Task 7.3: Variants

1. "Make Variant" duplicates the design and links them by a shared `variantOf` id. A "Compare" view shows all variants side by side at feed size, with a "Keep this one" action that does nothing destructive (it only marks a favorite).

### Task 7.4: Resize and export to many sizes

1. "Resize…" on a design: choose one or more target sizes. Each makes a new design (or resizes in place, if chosen) using anchors (from templates) or, for layers without anchors, keeping each layer's center relative to the design and scaling it by the smaller axis ratio. Text layers with autofit refit.
2. "Export All Sizes…": exports the chosen designs into a folder with names `<design name> <width>x<height>.<ext>`.
3. Tests: resize keeps every layer inside the design for 16:9 → 9:16 → 1:1 with and without anchors.

### Task 7.5: Thumbnail with the video export

1. In the Export room, an option "Also save thumbnail" with a design picker. When on, the chosen design is exported as JPEG next to the video with the same base name, after the video export finishes.

### Phase 7 unusual use

- Export into a read only folder: a clear error toast.
- A file name with `/` or emoji.
- Disk full (simulate with a tiny disk image on macOS if possible, otherwise note it as untested).

---

## 14. Phase 8: Standalone image editing

### Task 8.1: Open an image directly

1. "Open Image…" in Design (and dropping an image on the empty Design state): creates a new design with the image's exact pixel size and the image as the only layer, named after the file (D10).
2. macOS "Open With" and Windows file association for images are NOT added (Reccut would become a default image app); skip.

### Task 8.2: Canvas operations

1. Crop the whole design (drag a crop box on the design; all layers are moved; the design size changes).
2. Rotate the design 90° left/right and flip it (all layers transform).
3. Canvas size: change size with an anchor grid (3×3) for where the existing content goes.
4. Tests for each as pure functions on designs.

### Phase 8 workflow test

Open a phone photo (portrait, 4032×3024 with EXIF rotation: check it shows upright), remove the background, put it on a gradient, crop to 1:1, export transparent PNG.

---

## 15. Help, documentation and final review

### Task 9.1: Help articles

1. One article `design` in `src/renderer/help/articles.js` (section "Design") covering: creating a design, frames, placing images (copy or leave in place), layers, text, styles, background removal, masks, templates, suggestions, export, packaging. Add sub-articles if the existing structure does (check `catalog.js`).
2. `test/help-content.test.mjs` must pass (it checks that every `help:` id in commands exists).
3. `docs/FEATURES.md`: a Design section.

### Task 9.2: Final checklist (for the reviewing agent)

- [ ] `npm test` passes; `npm run build` succeeds; `npm run dist:mac` builds and the app starts.
- [ ] No new npm dependencies (compare `package.json` with `main` before phase 0).
- [ ] Model license recorded and allowed.
- [ ] Old projects open; new projects save `designs` and `designAssets`.
- [ ] Undo separation verified both ways.
- [ ] Packaging test passes; manual package and reopen from another folder works.
- [ ] Every user-visible string is plain English without em-dashes.
- [ ] Every "unusual use" list in phases 1 to 8 is recorded in the log with a result.
- [ ] Performance budget from task 3.6 recorded.

---

## 16. Progress log

Append one entry per task. Newest at the bottom.

```
### <task id> <short title>
Date:
Files changed:
Tests added:
Manual checks done:
Not done / open questions:
```

### First implementation scope and validation environment
Date: 2026-11-02
Scope: a usable phase 1, plus the quiet capture path from 0.4 and initial Canvas capability checks from 0.3. Phases 2 to 8 and model preparation 0.1/0.2 are not implemented. No model, npm dependency or version change was added.
Baseline: all 333 existing tests passed before changes.
Environment: the ordinary `npm start` attempt aborted in the existing `uiohook-napi` native recording hook. UI checks then ran in the actual Electron app launched by `npm start`, with an untracked temporary Node preload disabling only that hook and redirecting userData to `/tmp/reccut-design-qa-profile`. The installed app, recording source code and normal launcher were not changed for this workaround. Test projects, fixtures and screenshots were kept under `/tmp/reccut-design-workflow`. UI actions were exercised through Chromium's debugging protocol against this Electron instance. Native recording and a normal launch with the hook active remain unverified.
Decisions: D1 remains open. Design has no room shortcut and the Video Inspector retains Cmd/Ctrl 4. The plan also assigns Cmd/Ctrl 1 to both Record and 100% zoom. Record keeps its existing key; Design Actual Size uses Alt Cmd/Ctrl 1. The help documents this. Size cards are labelled as starting sizes, not service upload requirements. YouTube, Vimeo and Apple help pages were checked; the remaining service-specific recommendations need a separate publication review.

### 0.3 Initial Canvas capability checks
Date: 2026-11-02
Files changed: none for the scratch checks.
Tests added: real Electron scratch-canvas checks and `test/design-render.test.mjs`.
Manual checks done: `letterSpacing` increases measured width; the full brightness/contrast/saturation/hue/blur/grayscale filter string is accepted; RTL direction is retained; JPEG and WebP `convertToBlob` return the requested MIME types. Unicode text with emoji and Æøå was edited through the actual canvas textarea and undone. Arabic and Hebrew draw calls completed without exceptions.
Not done / open questions: detailed visual review of RTL typography and outside outlines at both 20 and 60 px is deferred with phase 2. Background models 0.1 and 0.2 are deferred in full.

### 0.4 Quiet full-resolution frame capture
Date: 2026-11-02
Files changed: `src/main/main.js`, `src/renderer/editor/ExportDialog.jsx`, `src/renderer/design/assets.js`.
Tests added: `test/design-assets.test.mjs` covers completion arriving before the start IPC response and listener cleanup.
Manual checks done: the existing export worker produced an independent 1920x1080 PNG, detected within approximately 0.3 s, without the Export finished toast. Also captured source-video time 0.500 s, verified by the picker timecode and the saved asset name. Existing export completion already carried its job id; added the quiet flag and suppressed the desktop notification for these jobs.
Not done / open questions: camera recording capture is not part of the performed workflow.

### 1.1 Data model and project format
Date: 2026-11-02
Files changed: `src/shared/design.js`, `src/shared/model.js`, `src/main/projects.js`, `src/renderer/editor/store.js`.
Tests added: `test/design.test.mjs`, `test/design-files.test.mjs`: defaults, bad numbers, unknown and duplicate layer ids, rotated hit testing, cover/contain, missing fields in legacy projects, missing assets, saved relative paths and relocated project folders.
Manual checks done: old files without Design fields load in automated filesystem tests; package reopening in Electron resolves design assets from their new relative locations. Design data stays at project level, outside SEQUENCE_FIELDS.
Not done / open questions: reopening a new project in an older installed Reccut version has not been checked.

### 1.2 Room shell and separate history
Date: 2026-11-02
Files changed: `src/renderer/app.jsx`, `src/renderer/registry.js`, `src/renderer/design/DesignRoom.jsx`, `src/renderer/design/store.js`, `src/renderer/editor/store.js`, `src/renderer/styles/app.css`.
Tests added: `test/design-state.test.mjs`: isolation of both undo/redo histories, transient commit/cancel, project reopening including the same id, locked layers, and timeline hover previews and transient cancellation preserving new designs.
Manual checks done: Design opens through the title bar; menu commands and Quick Search route to the correct room. Shortcut conflict inspection found no conflicts for the new Design commands. Real canvas and layer UI rendered at 1280x800 and at the normal desktop size. Opening the packaged project reset Design history.
Not done / open questions: room and zoom shortcuts differ from the plan as documented above. Normal launch is subject to the native-hook issue above.

### 1.3 New Design dialog and design list
Date: 2026-11-02
Files changed: `src/renderer/design/NewDesignDialog.jsx`, `src/renderer/design/DesignRoom.jsx`, `src/shared/design.js`.
Tests added: every size preset, 1x1, 8192x8192, custom dimensions, creation order, invalid dimensions and center-based canvas resizing in `test/design.test.mjs`.
Manual checks done: created a thumbnail through the real dialog. Created 1x1, 8192x8192, 100x2000 and 333x777 designs in Electron without renderer errors. The list has shared-renderer previews, inline rename, duplicate, confirmed delete and resize.
Not done / open questions: each list action is implemented but rename, duplicate, delete and aspect-lock fields have not all received individual native-pointer workflow checks.

### 1.4 Canvas selection and transforms
Date: 2026-11-02
Files changed: `src/renderer/design/Canvas.jsx`, `src/shared/design.js`, `src/shared/designRender.js`, `src/renderer/design/store.js`, `src/renderer/registry.js`, `src/renderer/styles/app.css`.
Tests added: rotated resize at all four corners, aspect lock, center resizing, minimum size, rotation snapping, nearest guide, hit testing, ordering, draw order/alpha, crop/contain geometry and hidden-text rendering.
Manual checks done: real pointer drag draws a rectangle; undo removes the entire gesture in one step. The canvas fits to the viewport and supports selection, marquee, transforms, guides, zoom and pan. Extreme design sizes do not allocate a design-sized editor canvas.
Not done / open questions: rotated handle combinations, all modifier combinations and multi-selection scaling need a longer manual ergonomics pass. The phase 3 300-layer/60 fps budget has not been measured.

### 1.5 Text and rectangle tools
Date: 2026-11-02
Files changed: `src/shared/designText.js`, `src/shared/designRender.js`, `src/renderer/design/Canvas.jsx`, `src/renderer/design/store.js`.
Tests added: `test/design-text.test.mjs`: wrapping, explicit newlines, Unicode, emoji, long words, empty text, manual font size, uppercase, autofit and overflow at the 6 px minimum.
Manual checks done: a title was created and rendered with an Arial font at thumbnail size. Double-click editing with Æøå and emoji commits in one undo step. Native pointer rectangle drawing and undo work.
Not done / open questions: at the minimum font size, impossible-to-fit text is clipped, as documented in Help. Advanced rich text and effects are phase 2.

### 1.6 Independent frame picker
Date: 2026-11-02
Files changed: `src/renderer/design/FramePicker.jsx`, `src/renderer/design/assets.js`.
Tests added: capture completion race and independent PNG registration in `test/design-assets.test.mjs`.
Manual checks done: a generated 1080p source was placed on the timeline; the actual Video panel captured a frame. Selecting a source video separately and scrubbing to 0.500 s also captured correctly. Deleting the original timeline clip did not change the design. The worker completed without renderer errors or a normal export toast.
Not done / open questions: the slider has no filmstrip. Offline-media test-card capture and the camera-on recording workflow remain untested.

### 1.7 Image assets and placement
Date: 2026-11-02
Files changed: `src/renderer/design/assets.js`, `src/renderer/design/DesignRoom.jsx`, `src/renderer/design/Canvas.jsx`, `src/main/main.js`.
Tests added: `test/design-assets.test.mjs`: CORS-safe decoding, unique copies, no Edit media registration, corrupt/unsupported/zero-size images and ignoring results after a project change. Copy IPC has an optional unique-name mode used only by Design, preserving existing Edit import behavior.
Manual checks done: copied assets go into Designs/Assets, do not appear in Edit, and export correctly. Native file drop opened the copy-choice dialog and placed the picture. A corrupt PNG added no asset. A 10000x5000 PNG placed in approximately 188 ms in this simple solid-image fixture, retained its original dimensions, and used a 4096x2048 preview. This is a functional large-image check, not a general performance guarantee.
Not done / open questions: real clipboard paste, PSD/SVG flattening, missing-file Locate, From Project and leave-in-place imports need more native UI checks. These paths are implemented. HEIC is excluded from the file filter because platform decoding was not verified. Remembered copy choice is stored in prefs; clipboard images always create a project-owned PNG.

### 1.8 Basic layer panel
Date: 2026-11-02
Files changed: `src/renderer/design/LayersPanel.jsx`, `src/renderer/design/store.js`, `src/shared/design.js`, `src/renderer/styles/app.css`.
Tests added: z-order preservation and locked-layer protection in the geometry/state tests.
Manual checks done: layers show in reverse stacking order with shared-renderer previews and type icons; title and image layers appeared correctly in the running app. Reorder, visibility, locks, range/toggle selection, rename and context menu actions are implemented.
Not done / open questions: drag reordering and every native context-menu entry still need an individual UI pass.

### 1.9 Basic properties
Date: 2026-11-02
Files changed: `src/renderer/design/Properties.jsx`, `src/renderer/editor/Inspector.jsx`, `src/renderer/design/store.js`.
Tests added: Design transients and shared changes in `test/design-state.test.mjs`.
Manual checks done: position, size, opacity, text and design sections render; the canvas showed the selected font, size and fill. Existing FontSelect is reused, and loadSystemFonts is exported. Shared properties apply to unlocked layers, and native slider/number-field drags use one transient undo step.
Not done / open questions: every numeric field and slider has not been independently dragged by hand.

### 1.10 Design image export
Date: 2026-11-02
Files changed: `src/shared/designExport.js`, `src/renderer/design/ExportDesignDialog.jsx`, `src/main/design.js`, `src/main/main.js`, `src/main/preload.js`.
Tests added: `test/design-export.test.mjs` and `test/design-files.test.mjs`: bounded quality search, impossible limits, invalid/empty/emoji/long/reserved filenames and concurrent exclusive output creation.
Manual checks done: the real export dialog saved a 1280x720 JPEG under 2 MB. A separate 333x777 transparent PNG was reloaded: its corner alpha is 0 and the white rectangle alpha is 255. JPEG/WebP encoders return the expected MIME types. A first integration run exposed a tainted canvas; fixed by setting crossOrigin before the media URL, with a regression test. Missing images block export with a clear message. Original image pixels are used for export, not the downscaled preview.
Not done / open questions: WebP export dialog, read-only destination and full-disk behavior need additional native checks. UTF-8 filenames are capped at 200 bytes so long emoji names remain valid on common filesystems.

### 1.11 Design assets in project packages
Date: 2026-11-02
Files changed: `src/shared/package.js`, `src/main/packager.js`, `src/renderer/ProjectDialogs.jsx`, `test/package.test.mjs`, `test/packager.test.mjs`.
Tests added: preserve Design-only Edit media, prevent trimming referenced sources, remove unused design assets optionally, include disabled cutout masks, copy original/external/frame/cutout assets, rewrite paths, preserve subfolders and report fonts. Real filesystem tests remove original assets after packaging.
Manual checks done: the real Package Project dialog produced an archive with design files. Moved the package directory, opened it in Electron, loaded every design asset from the moved folder and verified no missing flags and an empty Design undo history.
Not done / open questions: font installation on another machine and camera-recording bundles in this particular Design workflow have not been checked.

### 9.1 Help and feature documentation for the implemented scope
Date: 2026-11-02
Files changed: `src/renderer/help/articles.js`, `docs/FEATURES.md`, this progress log.
Tests added: existing help metadata, links, search and command-reference checks cover the Design article.
Manual checks done: documented shipped controls, independent histories, file handling, export, packaging, shortcut decisions and the later phases. UI copy is English. No application version bump or dependency change was made.
Not done / open questions: background removal, model bundling, advanced effects, groups, crop, masks, templates, suggestions, feed tools, standalone canvas operations, distribution builds and the full phase 9 review remain outside this first implementation. Do not mark the final checklist complete on the basis of this log.

### First-round validation result
Date: 2026-11-02
Checks: `npm test` passed all 367 tests, with no failures or skipped tests. `npm run build` succeeded. `git diff --check` passed. The final build is the normal production bundle, without the temporary QA entry point. No new npm dependencies or application version change were made. Distribution packaging (`dist:mac`) was not run. Test results apply to the shared workspace state at this time; unrelated tracking work was also present and was left intact.


### 1.6 Follow-up: keep the whole captured frame
Date: 2026-11-02
Files changed: `src/renderer/design/assets.js`, `test/design-assets.test.mjs`, `src/renderer/help/articles.js`, `docs/FEATURES.md`, this log.
Reason: the user reported that a square video inserted into a 16:9 thumbnail cropped out the subject's face. This request supersedes the original phase 1.6 cover/center-crop default.
Change: capture still saves the complete source-resolution PNG. Placement now uses contain geometry and a layer box matching the source aspect ratio, centered inside the design. For a 1080x1080 frame in a 1280x720 thumbnail, the layer is 720x720 at (280, 0). Its full crop remains (0, 0, 1, 1), so the whole frame is visible and the layer can be moved and scaled normally. Existing saved compositions are not automatically rewritten; selecting their image layer and changing Image > Fit to contain reveals the full saved image.
Tests added: four capture regressions for square, portrait, matching 16:9 and wider frames. They verify original capture dimensions, complete source crop, aspect-correct layer geometry, movement and undo.
Manual checks done: in the actual Electron app, captured a 1080x1080 test video with blue and red markers at the top and bottom into a 16:9 design. Both edge markers remained visible on the editor canvas, the saved layer was 720x720 with contain fit, and dragging the layer preserved its aspect ratio and full source crop. Used the same isolated QA profile/native-hook workaround documented above.
Validation: all 371 tests passed. Production build and whitespace checks passed. No version change.
Not done / open questions: this does not undo cropping already applied on the Edit timeline. Use a source video in the picker when the sequence itself is intentionally cropped.


### Phase 1 completion
Date: 2026-11-02
Status: tasks 1.1 through 1.11 are implemented and functionally verified for the development build. The complete acceptance matrix and remaining environment/release limitations are in [DESIGN-PHASE1-QA.md](DESIGN-PHASE1-QA.md). This does not complete the model spikes, later Design phases or the final distribution review.
Tests: all 384 tests pass, none skipped. Production build and whitespace checks pass. No dependencies or version change.
Manual/application checks: all preset dialogs, custom sizes, list actions and undo; 32 rotated/flipped handle combinations; center/aspect modifiers and rotation; selection, Smart Guides, zoom/pan; on-canvas Unicode type and rectangles; placement, PSD/SVG, native drop and clipboard, relink and shared Edit images; layer selection, native reordering and context actions; every phase 1 property category; empty/audio/offline video cases; synthetic screen/camera recording, trim, capture and export; transparency pixels, exact renderer comparison, size limits and a read-only destination; history, unsaved Save As, moved packages with original files unavailable and both undo histories.
Environment: the native keyboard-hook crash remains an existing startup issue, so the temporary QA-only hook workaround was used. Existing Edit ResizeObserver notifications were reproduced without any designs and documented separately. No distinct older installed release was available; both found apps were 0.9.0. Physical devices, other operating systems and distribution builds remain release checks.

### 1.1 Completion: persistence and history
Date: 2026-11-02
Files changed: `src/renderer/editor/store.js`, `src/renderer/design/assets.js`, state and asset tests.
Checks: old-file load/save, folder reset during project switches, base folders for unsaved projects, Save As, reopen, snapshot restoration and moved asset paths passed. Snapshot restoration clears stale Design history while preserving room-specific undo semantics.
Open: none for phase 1 implementation; optional older-version run unavailable as described in the matrix.

### 1.2 Completion: command isolation
Date: 2026-11-02
Files changed: `src/renderer/registry.js`, `src/renderer/design/store.js`, `test/design-commands.test.mjs`.
Checks: Design refuses Edit-only commands and native menu actions; shared clipboard/delete/history commands route by room; Mac/Windows key conflicts, room buttons and native arrow movement passed. Timeline-specific sequence settings no longer conflict with Duplicate Layer in Design. D1 remains intentionally unresolved; 100% has no shortcut because Record owns Cmd/Ctrl 1.
Open: none beyond the planned shortcut decision.

### 1.3 Completion: new designs and list
Date: 2026-11-02
Files changed: `src/renderer/design/DesignRoom.jsx`, `NewDesignDialog.jsx`.
Checks: every preset, 333x777 custom, aspect lock, swap, validation, rename, duplicate, confirmed delete, Canvas Size and undo passed in the running application.
Open: none for phase 1.

### 1.4 and 1.5 Completion: canvas and tools
Date: 2026-11-02
Files changed: `src/renderer/design/Canvas.jsx`, `src/renderer/design/store.js`, `src/shared/designRender.js`, render/state tests.
Checks: all eight handles on rotated images with four flip combinations, fixed anchors, one-step undo, aspect/center modifiers, snapped rotation, guides and bypass, selection/marquee, native arrow movement, Hand Tool, Space-pan, wheel zoom/scroll, Unicode type editing, empty-type deletion and Shift-square drawing passed. Missing images use a bounded checkerboard. Select All includes hidden unlocked layers and excludes locked ones.
Open: phase 3 performance budgets are outside this scope.

### 1.6 Completion: independent video picker
Date: 2026-11-02
Files changed: `src/renderer/design/FramePicker.jsx`, `assets.js`, `src/shared/design.js`, design/asset tests.
Checks: existing thumbnail reuse, slider, frame/second stepping, native source aspect, full-frame placement, original-resolution capture, offline warning/card and disabled empty/audio states passed. The picker schedules canvas resizing outside ResizeObserver delivery. User-requested uncropped placement supersedes the old cover default in the task text.
Open: physical camera permissions were not exercised; a synthetic camera passed the real recording/import/capture pipeline.

### 1.7 Completion: embedded/linked placement and clipboard
Date: 2026-11-02
Files changed: `src/renderer/design/assets.js`, `DesignRoom.jsx`, `LayersPanel.jsx`, `src/main/design.js`, `main.js`, `preload.js`, asset/files tests.
Checks: Place Embedded/Linked, preference/Alt drop behaviour, link indicators, native clipboard PNG, same-project layer Cut/Copy/Paste, PSD flattening, SVG, From Project, relink, corrupt files and a 50 MP JPEG passed. The installed Electron 45 clipboard API uses asynchronous ClipboardItems, with a tested main-process adapter.
Open: HEIC decoding is unsupported in the checked environment and excluded conditionally. Cross-project layer clipboard transfer remains phase 3.

### 1.8 and 1.9 Completion: Layers and Properties
Date: 2026-11-02
Files changed: `src/renderer/design/LayersPanel.jsx`, `Properties.jsx`, UI styles.
Checks: range/toggle selection, rename, visibility, locks, native drag order and context actions passed. Position/size/rotation, flips, opacity, font/weight/size, Tracking/Leading, caps, autofit, paragraph settings, fill, mixed selection, design settings and image fit/reset crop updated live and undid in one step. Labels follow section 5.8.
Open: none for phase 1.

### 1.10 Completion: Export As and Quick PNG
Date: 2026-11-02
Files changed: `src/renderer/design/export.js`, `ExportDesignDialog.jsx`, shared export/files tests.
Checks: the real dialog exported JPEG below 2 MB and transparent PNG/WebP. PNG matched the shared renderer exactly. JPEG flattened transparency correctly. Quick PNG retained the canvas background. Unique/emoji names and a read-only destination passed. Custom scale mode and limits have explicit validation.
Open: physical disk-full simulation was not required for phase 1; it remains in phase 7's test list.

### 1.11 Completion: packaging and handoff
Date: 2026-11-02
Files changed: packaging implementation from the first round, extended application validation and this acceptance matrix.
Checks: actual recording bundle, independent frame, embedded asset, Design-only Edit image and Arial font report packaged through the UI. Originals and the recording directory were made unavailable, the package was moved and reopened, all images decoded, media remained online and Design history was empty. Filesystem tests also cover cutout masks, unused assets, relative paths and trim protection.
Open: font installation on another machine and cross-platform distribution builds belong to release review.


### QA cleanup note
Date: 2026-11-02
The real system clipboard was used for the native clipboard tests. Restoring its original snapshot failed because Electron 45 does not accept read-only ClipboardItems directly in clipboard.write(). The QA process closed before conversion to new writable ClipboardItems, so the original content could not be recovered. The user was informed. This affects test cleanup, not the production layer-copy adapter, which uses writeText, or image paste, which only reads ClipboardItems.

### Phase 2 and 3 completion
Date: 2026-11-03
Status: tasks 2.1 through 2.6 and 3.1 through 3.7 are implemented. All 410 automated tests, the normal build and whitespace checks pass. Detailed application checks, performance measurements and boundaries are recorded in [DESIGN-PHASE2-3-QA.md](DESIGN-PHASE2-3-QA.md). Phases 4 through 8 and background-removal model preparation remain open. No version or dependency change.

### 2.1 Completion: fills and gradients
Date: 2026-11-03
Files changed: shared design/gradient renderers, `StyleControls.jsx`, Properties and Gradient Editor.
Checks: shared field math, local rotated coordinates, alpha, one/32 stops, freeform/radial fields, design background and one-step gradient dragging pass. Preview allocation is bounded for extreme aspect ratios.
Open: none for the required fill controls.

### 2.2 Completion: strokes
Date: 2026-11-03
Files changed: design normalization, effect bounds, renderer and Properties.
Checks: Inside/Center/Outside native pixels, outline-only shapes, text outside contour, zero alpha, zero/500 px widths, dash/join controls and margin tests pass. Effect bounds are separate from geometry bounds used by transform handles.
Open: none.

### 2.3 Completion: shadows and glow
Date: 2026-11-03
Files changed: shadow normalization/presets, renderer and Layer Styles controls.
Checks: ordered shadow bitmaps, margin/spread tests, native overlapping shadow colors, add/remove/undo, zero/500 px blur and zoom-invariant blur pass. Canvas blur uses backing-pixel units, so blur is scaled with bitmap resolution.
Open: image spread remains intentionally disabled until phase 4's alpha morphology.

### 2.4 Completion: blend modes and adjustments
Date: 2026-11-03
Files changed: renderer, Properties and style tests.
Checks: all native blend options, independent filter components and reset, opacity isolation and darkened-frame workflow pass.
Open: optional film Look selector skipped because the existing film module exposes RGB/LUT generation rather than a canvas/ImageData application function. No second color pipeline was added.

### 2.5 Completion: shapes
Date: 2026-11-03
Files changed: pure local shape geometry, normalization, Canvas, shape menu and Properties.
Checks: polygon/star point counts and bounds, radius clamps, persistence, native arrow/star/ellipse and stroke-only line/arrow defaults pass. Existing mask geometry uses a different centered pixel format, so local fractional polygon/star points remain in design.js.
Open: none.

### 2.6 Completion: rich text
Date: 2026-11-03
Files changed: `designText.js`, renderer, Properties, font checks and Layers warnings.
Checks: paired/escaped/unmatched/consecutive stars, word/grapheme wrapping, uppercase expansion, tracking/autofit, empty/long text, line backgrounds, emoji, Arabic and missing-font fallback pass. Unknown local font names are checked against fallback metrics because Chromium's fonts.check can accept undeclared families.
Open: none for phase 2.

### 3.1 Completion: groups
Date: 2026-11-03
Files changed: pure grouping/transforms, Design store, Canvas, Layers and Properties.
Checks: contiguous topmost placement and relative order, whole-group/member selection, collapse/name, aggregate numeric transforms and flips, rotation/non-uniform scaling, locked-group refusal, native group drag/drop, undo and ungrouped positions pass. Scaling rotated members preserves their rotation without skew.
Open: none.

### 3.2 Completion: align and distribute
Date: 2026-11-03
Files changed: pure geometry helpers, Design actions and Properties.
Checks: six alignments, single-layer canvas target, rotated axis-aligned bounds and equal horizontal/vertical gaps pass.
Open: none.

### 3.3 Completion: clipboard
Date: 2026-11-03
Files changed: Design asset copy/paste and tests, registry.
Checks: layers with absolute asset paths, embedded files copied into a distinct receiving project, linked references, group remapping, relative centers, Paste in Place, plain text, PNG placement and one-step history pass. All clipboard testing used memory or mocked IPC. The system clipboard was untouched.
Open: none for the planned clipboard formats.

### 3.4 Completion: crop
Date: 2026-11-03
Files changed: `designCrop.js`, crop session, Canvas and Properties.
Checks: dimmed full source, image repositioning, handles, ratios, native Enter/Escape, apply/cancel, rotated/flipped geometry and one-step undo pass. Drafts stay outside project history until Apply and cancel on a stale layer/project. Reset Crop restores Contain. Initial frame placement still retains the whole source.
Open: none.

### 3.5 Completion: layered PSD and SVG
Date: 2026-11-03
Files changed: shared editor import entry points, Design layered-import dialog and asset placement.
Checks: selected layers versus one image, real PSD transparency/source placement, real layered SVG, grouped placement, per-file unique asset directories and one-step undo pass. SVG thumbnail allocation is bounded. Existing PSD decoder limitations are unchanged.
Open: no new decoder features are part of this phase.

### 3.6 Completion: performance
Date: 2026-11-03
Files changed: bounded bitmap cache, Canvas draw scheduling/allocation, Layers row memoization and CSS containment.
Checks: immutable identity plus multiple pixel scales, invalidation and bounded storage pass. On Apple M1 Pro with 300 mixed layers, real pointer dragging measured median 8.3 ms and 95th percentile 10 ms, with no interval over 25 ms. Full UI trace, 120 consecutive updates and 50 rapid undos passed. Detailed timings are in the QA report.
Open: cross-platform distribution performance remains a release check.

### 3.7 Completion: shortcuts and help
Date: 2026-11-03
Files changed: registry, keyboard scope, Settings and Design help article.
Checks: V/T/U/Shift+U/H/C, groups, Paste in Place, align/distribute metadata, Design category and Mac/Windows room-aware conflicts pass. Crop owns Enter/Escape while open. Existing Edit shortcuts and Cmd/Ctrl+1 remain assigned as before.
Open: none for phase 3. Next implementation phase is background removal and masks, with the phase 0 model preparation as a prerequisite.


## Phase 4–5 completion log — 2026-11-03

Scope: tasks 4.1–4.4 and 5.1–5.4, with the bundled-model prerequisites 0.1–0.2. Phases 6 and later are not implemented. Detailed evidence and remaining platform/performance limits: [DESIGN-PHASE4-5-QA.md](DESIGN-PHASE4-5-QA.md).

### 0.1 Model selection
Files: `src/main/designModels.js`, `scripts/fetch-models.mjs`, package resource configuration.

Checks: read model licenses; tested five input classes with the patched BiRefNet-lite 1024 WebGPU export and MODNet; CPU BiRefNet-lite 512 was tested on a person. Original onnx-community BiRefNet-lite could not load on this M1 Pro GPU because its shader storage-buffer requirement exceeded the device limit. ISNet was excluded for its AGPL license. Chosen MIT models are pinned by revision and every shipped file by SHA-256; original license files ship with them. Primary inference measured 2.31–3.45 seconds after model initialization. CPU fallback measured 6.43 seconds, exceeding the approximate five-second target; first use also incurs model load time. These limits are explicit in the QA report.

### 0.2 Bundled worker
Files: segment worker/html, build script, main/preload IPC, model fetch script, package config and `scripts/before-pack.cjs`.

Checks: actual hidden worker with local media protocol, progress/cancel and queued jobs. Remote loading/cache disabled and CSP excludes HTTP(S). A fresh worker completed inference with networking offline and zero remote requests. Mac ARM64 application built with both model resource directories and local ORT runtimes. ONNX files are explicitly classified as data during macOS signing because the signer's binary detector crashed parsing their protobuf content; executable signing remains enabled. No additional npm dependencies.

### 4.1 Remove Background and camera shortcut
Files: `cutout.js`, `FramePicker.jsx`, Properties, assets/export, main/preload.

Checks: full-resolution independent masks, original image unchanged, feather/edge shift, progress/Cancel. Automated cancellation covers deletion, undo, project switch, explicit cancel and consecutive starts, including completion before the start IPC response. Native camera capture produced a full 600×400 frame and mask without modifying timeline/media state. Person, product, code, landscape, transparent PNG, 1×1 and 12000×100 inputs completed without crashes.

Deviation: immutable PNGs use reserved unique names `reccut-cutout-<id>.png`, preventing overwrite and allowing cleanup to distinguish generated masks from user originals. Friendly names remain in asset metadata.

### 4.2 Refine brush and file lifetime
Files: `refine.js`, Canvas, Design history store, `designCleanup.js`, project save.

Checks: native Erase/Restore, one new PNG per stroke, undo/redo resolves previous mask files. Actual pointer painting on a rotated, flipped and cropped image landed at the expected source pixel. Pure tests cover all fit modes and inverse transforms. Cleanup runs after successful atomic project save, retains undo/redo, persistent snapshots and neighboring-document references, and never removes external/original files; filesystem tests cover these protections and discarded late results.

### 4.3 Sticker outline and shadows
Files: pure alpha morphology in `designMasks.js` (re-exported from `design.js`), common renderer and StyleControls.

Checks: separable dilation/erosion against a reference, soft alpha/borders/narrow images; outline follows the final cutout and shape mask. Image shadow spread is now enabled. Native tiny-canvas pixel assertions passed. Masked PNG with 10 px white outline, feather/shift and spread shadow matched the shared renderer exactly (maximum channel difference zero).

### 4.4 Shape masks and clipping
Files: Properties, Canvas mask handles, `masks.js`, Layers, common renderer.

Checks: rectangle/ellipse/polygon data, feather/invert, hidden/orphan clipping rules, isolated clipping group with base opacity applied once. Native pixel checks verify clipping, hidden bases, inversion and final outline. Fill Text With Image groups the two selected layers, matches their geometry and is undoable. Pure tests cover group ordering.

### 5.1 Saved styles
Files: `library.js`, `LibraryPanel.jsx`, prefs, shared template/style module.

Checks: appearance-only deep copies and relative text size, same-type application in one undo step, rename/delete/update actions, persistence errors, limit 500. Native panel with 500 styles rendered one page of 24 saved cards plus 15 built-ins and refused style 501.

### 5.2 Built-in text styles
Files: `designTemplates.js`, library previews.

Checks: all 15 specified styles, safe generic font stacks, common renderer previews, native application and undo. Saved image styles have a generated preview when no project image is available.

### 5.3 Templates
Files: `designTemplates.js`, `library.js`, `LibraryPanel.jsx`, native `designLibrary.js`, main/preload/build.

Checks: 22 built-ins (12 wide, 6 tall, 4 square); every template stays within wide/tall/square and 3000×3000 canvases. Placeholder resolution, source path rejection, newer versions, unknown-layer warnings, oversized data and excessive layer counts tested. Native save/load, duplicate-name suffix, JSON rejection, version-2 rejection, import/export and card previews passed. Templates are stored atomically in userData/design-templates; project images become placeholders, not external file references.

### 5.4 Brand kit
Files: `brand.js`, `BrandColors.jsx`, fill/shadow/outline/gradient controls, native design library.

Checks: maximum 20 unique colors, shared swatches in Design color controls, logo selection/copy into userData and independent project copy when applying a template. Replacing My Logo left existing project images readable. Logo image cache reloads when switching projects.

### Verification status
All 432 automated tests pass; production build passes. Development and packaged Mac ARM64 checks are recorded in the QA report. This completes implementation of phases 4 and 5, with the documented CPU timing and cross-platform/release QA limitations. Version remains 0.9.0; no release, version bump or publication was performed.

## Phase 6 completion log — 2026-11-03

Scope: tasks 6.1–6.3 are implemented. Phase 7, phase 8 and the final cross-platform/release review remain outstanding. Verification details: [DESIGN-PHASE6-QA.md](DESIGN-PHASE6-QA.md).

### 6.1 Frame candidates and scoring
Date: 2026-11-03
Files changed: `src/shared/thumbScore.js`, `designSuggest.js`, `src/renderer/design/frameSampler.js`, `suggest.js`, `src/renderer/player.js`.
Tests added: score ordering, normalized metrics, distributed bounded sampling, fades/transitions, camera visibility, spacing, deadline/cancellation and fresh-decoder snapshots.
Manual checks done: actual square 3-second video (60 samples, 2.00 s), actual 3-hour video (61 samples, 1.17 s), 3-hour/120-clip sequence (180 samples, 3.52 s), black video, camera recording with network offline, separate-time pixel hashes, and missing-media timeout (14.005 s). Private preview players leave the timeline and Video picker alone. Unused decoder retention is disabled only for sampling.
Not done / open questions: long-video fixture is H.264 256×144 at 1 fps. Higher-resolution/long-GOP/RAW sources may produce partial results within the budget. Cross-platform measurements remain part of release QA.

### 6.2 Title candidates
Date: 2026-11-03
Files changed: `thumbScore.js`, `designSuggest.js`, `suggest.js`, Suggestions dialog.
Tests added: source priority, default sequence exclusion, Norwegian and English stop words, frequent phrases, case-insensitive uniqueness, length bounds, provider availability, transcript scope, provider changes and AI error recovery.
Manual checks done: Norwegian caption titles, no-caption project, no AI button while unconfigured, named-provider disclosure before any call, explicit Send Transcript and simulated offline-provider error retaining local suggestions. Provider and transcript checks run again before sending.
Not done / open questions: no actual provider was contacted during QA. Completion request cancellation is limited by the existing API; late responses are discarded, but an already-sent request cannot be recalled.

### 6.3 Suggestions grid and editable creation
Date: 2026-11-03
Files changed: `SuggestionsDialog.jsx`, `suggest.js`, DesignRoom, LibraryPanel, assets/library helpers, registry, CSS, help article and FEATURES.
Tests added: atomic creation from an empty Design room, full-quality source dimensions/crop, one-step undo, failed capture without a partial design, stale-session disposal, project/room/timeline changes. Existing capture tests still cover early completion before the start response.
Manual checks done: 24 cards for six frames × four templates, offline title candidates, shuffle, new editable design, full square image preserved inside a wide canvas, unchanged timeline/media, undo/redo, rapid reopen/cancel and project/room switch. Production packaged ARM64 app launched with an isolated profile and rendered 24 cards with no test helpers.
Not done / open questions: no remaining implementation items in phase 6. Generic feed preview, readability/safe zones, variants, multi-size export and video/thumbnail export pairing belong to phase 7 and are not included here.

### Phase 6 validation
All 451 automated tests pass. Production build and Mac ARM64 application packaging/start pass. No dependencies or version number changed. Final production bundles do not expose the temporary QA helper. Detailed limits and measurements are recorded in DESIGN-PHASE6-QA.md.

## Phase 7–8 completion log — 2026-11-03

Implementation now covers phases 1–8. Help/features documentation is current. The Mac build/review checks below pass; cross-platform and public-release checks remain qualified as documented in [DESIGN-PHASE7-8-QA.md](DESIGN-PHASE7-8-QA.md).

### 7.1 Feed preview
Date: 2026-11-03
Files changed: Design Preview component, toolbar/view state and CSS.
Tests added: common renderer remains covered; native CSS geometry and rendered preview checks.
Manual checks done: actual 360/246/168 px previews and 328 px phone image, duration badge, light/dark backgrounds, visually inspected generic layouts. Whole design fits the preview tile. Minimum-width toolbar was checked and its overflow fixed with wrapping.
Not done / open questions: no branded UI or platform-specific layout guarantee is included.

### 7.2 Safe zones and readability
Date: 2026-11-03
Files changed: design preset/pure helpers, Canvas overlays, Readability panel.
Tests added: known contrast pairs, small and portrait text size, safe-zone intersection, hidden/empty layers.
Manual checks done: actual 1.0:1 gray-on-gray fill warning, small-text and lower-right overlay warnings, Check Readability and Select. Guides are view state and do not enter design export.
Not done / open questions: checks are heuristic, on demand and use white under transparency. Outlines/shadows can improve legibility beyond the sampled fill.

### 7.3 Variants
Date: 2026-11-03
Files changed: pure duplication/family helpers, tools state, Compare view, design list.
Tests added: independent layer/group IDs, copied appearance, shared assets/family IDs and persistence.
Manual checks done: three variants compared, favorite marker changed, every variant retained.
Not done / open questions: none for the planned behavior.

### 7.4 Resize and export to many sizes
Date: 2026-11-03
Files changed: pure content resize, size/export dialogs, common image encoder.
Tests added: every built-in layout across wide/tall/square targets, with anchors and rotated unanchored content; source/crop/mask preservation.
Manual checks done: two sizes created in one undo step; actual batch dialog saved six dimension-named PNGs; slash/emoji names handled safely. Read-only directory and real ENOSPC on a filled temporary disk image produced clear errors and no partial image.
Not done / open questions: cross-platform filesystem/runtime checks remain release QA.

### 7.5 Thumbnail with video export
Date: 2026-11-03
Files changed: Export room/Easy Export choice, snapshot helper, main/preload exact-basename JPEG writer.
Tests added: pre-export snapshot, early completion, job matching, cancellation, listener cleanup, disk errors, Unicode paths and preserving an existing JPEG.
Manual checks done: actual MP4/JPEG pair; subsequent red edit did not change the queued green JPEG snapshot. Export-room choice/picker was available.
Not done / open questions: a same-name existing JPEG is preserved and reported rather than overwritten; a thumbnail failure retains the completed video.

### 8.1 Open Image
Date: 2026-11-03
Files changed: asset helpers, empty-room drop, dialog/button and command.
Tests added: exact displayed dimensions, one layer, transparent background, Edit-media separation, independent undo and oversize rejection.
Manual checks done: EXIF orientation-6 fixture opened at 3024×4032; native empty-room drop and Open Image dialog created correctly sized designs. Original source remained intact.
Not done / open questions: HEIC and every camera format are not part of the supported dialog/test matrix. No OS image associations were added.

### 8.2 Canvas operations
Date: 2026-11-03
Files changed: pure crop/rotation/reflection/anchor functions, Canvas draft interaction, Properties, Canvas Size anchor grid and commands.
Tests added: all nine anchors, locked/hidden layer translation, preserved source masks/crop, rotation/flip round trips and transformed anchors.
Manual checks done: full orientation-fixture background-removal/gradient/square-crop/transparent-PNG workflow; actual pointer crop 400×300 to 300×200, Enter and Undo; Cancel; pixel-matrix rotation/flip checks and nine-point grid UI.
Not done / open questions: backgrounds reflow to the new canvas; image/mask sources remain nondestructive.

### 9.1 Help and features
Date: 2026-11-03
Files changed: Design handbook article and FEATURES.
Checks: commands/help metadata tests pass; articles now cover preview, readability, variants, sizes, paired export and standalone canvas operations.
Open: none for implementation documentation.

### 9.2 Review status
- [x] All 466 tests pass; production build succeeds.
- [x] Actual dist:mac pipeline produced an ARM64 app and DMG; packaged app starts; code signature and DMG checksum verified.
- [x] No new dependencies in this round. Bundled model licenses and manifest remain as recorded in phase 4.
- [x] Prior phase reports record old-project compatibility, independent histories, moved project packaging and the 300-layer performance budget. Their tests still pass.
- [x] New product strings use English and no em-dashes. New unusual-use checks and results are recorded above.
- [ ] Cross-platform/installer/notarization release matrix and exhaustive interaction combinations noted in previous QA reports remain unverified; no universal or public-release approval is claimed.

No version bump or publication was performed. The current app version remains 0.9.0, read by About through app.getVersion().
