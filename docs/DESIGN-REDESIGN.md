# Design Room: redesign plan

The Design room exists to make **video thumbnails**. Today it works, but the left panel is a row of small tabs (Designs, Video, From Project, Styles, Templates) stacked with long single-column lists, and the actions are spread between a header, a footer and the toolbar. This plan reorganizes the room around how people actually build a thumbnail, using Adobe Express as the model for layout: an icon rail on the left, one wide panel at a time, the canvas in the middle, and the designs as pages along the bottom.

Most of the functionality already exists. This is mainly a new layout plus two new things: a shared card behaviour for every library item, and optional **online resources** (stock photos, more templates) on top of the built-in offline set.

Read `docs/DESIGN-ROOM-PLAN.md` sections 1 (rules), 3 (locked decisions), 4 (codebase orientation) and 5.8 (terminology) first. They still apply unless this document says otherwise.

---

## 1. Principles

1. **Thumbnail first.** Every panel opens on what helps a thumbnail: a frame from the video, a big title, a face cut out from the background, a strong color contrast. General image editing stays possible but is never the first thing shown.
2. **Reuse, do not rebuild.** Every panel below lists the existing code it is built from. New code is mostly layout.
3. **Offline core, online extras.** Everything built in works with no network. Online sections appear only when the user has turned them on and the machine is online. Nothing breaks or waits when offline.
4. **One way to use a library item.** Templates, styles, photos, elements and palettes all behave the same (section 4).
5. **Icons with tooltips.** Toolbar and rail actions are icons. The tooltip gives the name and the shortcut, for example `Safe Zones (G)`.
6. **English UI, Photoshop terms** (plan section 5.8). One change: the user asked for **Import Image…** instead of Place Embedded / Place Linked as the main button. Update section 5.8 to match (section 9, question 1).

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Title bar (rooms)                                                            │
├────┬──────────────────────┬───────────────────────────────────────┬──────────┤
│Rail│ Panel (one at a time)│ Canvas toolbar: tools · size · view   │ Layers   │
│    │                      │                                       │          │
│ 🔍 │ Title          ⤢  ✕  │                                       │──────────│
│ ▦  │ [ Search field     ] │            Canvas                     │Properties│
│ 🎬 │                      │                                       │          │
│ T  │ Section    See All › │                                       │          │
│ ⇪  │ [card][card][card]   │                                       │          │
│ ◇  │ Section    See All › │                                       │          │
│ 🎨 │ [card][card][card]   │                                       │          │
│ ★  │                      ├───────────────────────────────────────┤          │
│    │                      │ Designs: [1][2][3][+]   Export ▾      │          │
└────┴──────────────────────┴───────────────────────────────────────┴──────────┘
```

| Area | What it holds | Built from |
|---|---|---|
| **Rail** (left, about 64 px) | One icon with a short label under it per panel (section 3), like Express. Clicking the active icon closes the panel and gives the canvas more room. | New. Replaces the `Segmented` tabs in `DesignRoom.jsx`. |
| **Panel** (about 300 px, can widen to about 560 px with the expand button) | The content of the chosen rail item. Sections with a heading, **See All ›** and a horizontal row of cards. **See All** turns the panel into a grid of that section with a back arrow. | `LibraryPanel.jsx`, `FramePicker.jsx`, the current `.dz-left` panel. |
| **Canvas toolbar** | Tools (Move, Type, Shape with chooser, Hand, Crop), then **Resize** (size presets), **Feed Preview** (F), **Safe Zones** (G), **Readability**, **Canvas** menu, zoom. All icons. | Current `.dz-toolbar` in `DesignRoom.jsx`, `tools.js`, `Readability.jsx`. |
| **Canvas** | Unchanged. Accepts drops from every panel. | `Canvas.jsx`. |
| **Designs strip** (bottom of the canvas column) | Every design in the project as a small page thumbnail, like pages in Express. Click opens, double-click renames, right-click: Duplicate, Make Variant, Delete. The last card is **+** (New Design). **Export ▾** on the right: Export As…, Quick Export as PNG, Export All Sizes…, Compare Variants. | The current Designs tab list (`Thumbnail`, rename, duplicate, delete) in `DesignRoom.jsx`, `tools.js` (`makeVariant`, `compareOpen`, `batchExportOpen`). |
| **Right column** | Layers on top, Properties below. Unchanged. | `LayersPanel.jsx`, `Properties.jsx`. |

The **Designs** tab and the header **+** disappear: the bottom strip covers both. The footer buttons in the left panel disappear: **New Design** moves to the strip, **Import Image…** moves to the Add Content panel (section 3.5) and the empty state.

When no design is open, the canvas area shows the current empty state (New Design, Suggestions, Import Image, size cards). The rail and panels stay usable. Choosing a template or a video frame then creates a design.

---

## 3. Rail panels

Order matters: it follows the usual thumbnail workflow, from start to finish.

### 3.1 Search

One field that searches every panel at once: template names and tags, text style names, element names, palette names, project images by file name and, when online is on, stock photos. Results come grouped by panel, with **See All ›** per group.

- Offline: searches built-in and saved items, and project media.
- Online: adds stock results (section 6) under their own heading with the provider name. Offline, those groups are left out and the note from 6.1 rule 4 is shown once at the bottom.
- Built from: the lists in `designTemplates.js`, `library.js` (`savedStyles`, `userTemplates`), `project.media`, `project.designAssets`.

### 3.2 Templates (first panel shown when the room opens)

| Section | Content |
|---|---|
| **For This Video** | The automatic suggestions made from the video (`suggest.js`, `SuggestionsDialog.jsx`), shown as cards instead of only in a dialog. Uses the project title and frames. Hidden when the project has no video. |
| **YouTube 16:9**, **Shorts and Reels 9:16**, **Square 1:1** | Built-in templates by ratio (`BUILTIN_DESIGN_TEMPLATES`). |
| **By Style** | Built-in templates grouped by tags: Bold, Minimal, Face + Title, Tutorial, Before/After, List / Number, Podcast, Gaming, News. Needs a `tags` field on templates (section 7). |
| **My Templates** | `userTemplates`, with Import Template… and Save as Template… as small icon buttons in the section header. |
| **More Templates** (online) | Templates from the Reccut template catalog (section 6.3). |

Above the sections: the **Size** choice (Template Size / Current Canvas) that exists today, as a small select.

Template cards show the template filled in with the real project context: the project title, the current frame and the user's logo (`templateContext()`), so what you see is what you get. This is how it works today and must stay that way.

### 3.3 Video

Thumbnail-specific and the biggest advantage over a general tool.

| Section | Content |
|---|---|
| **Pick a Frame** | The scrubber and filmstrip from `FramePicker.jsx`. |
| **Best Frames** | Frames scored by `thumbScore.js` / `frameSampler.js` (sharp, faces, expressive). One click places the frame as the background layer. |
| **Cut Out** | Place the current frame with **Remove Background** already run (`cutout.js`), for the classic "face in front of the title" look. |

### 3.4 Text

| Section | Content |
|---|---|
| Top buttons | **Add Title**, **Add Subtitle**, **Add Badge**. Each adds a type layer with a sensible size for the canvas and the project title as text (D9). Built from `addText()` in `store.js`. |
| **Text Styles** | `BUILTIN_DESIGN_STYLES`, shown as cards like today but in a two-column grid. |
| **My Styles** | `savedStyles()` with **New Style…** in the header. |
| **Font Pairs** | Title font + subtitle font combinations, applied to the title and subtitle layers at once. New, small: a list of pairs in `designTemplates.js` using fonts from `fonts.js` that exist on the machine. Pairs whose fonts are missing are hidden. |

### 3.5 Add Content

Rail label **Add Content**, with the upload icon (a rounded square with an arrow pointing up, like "Upload" in Express; `SquareArrowUp` in lucide). Everything that brings an image into the design is here.

| Section | Content |
|---|---|
| Top button | **Import Image…** with the arrow menu (Import Embedded…, Import Linked…, Open as New Design…). All formats Edit can read (`readableImage` in `src/main/media.js`). |
| Drop area | "Drop images here" under the button. Dropping works on the canvas too, as today. |
| **Recent** | Images placed in any design of this project (`project.designAssets`, origin `placed`). |
| **From Project** | Images already in Edit (`project.media`, kind `image`) as a thumbnail grid (built today). |
| **Stock Photos** (online) | Search and browse results from the enabled image sources (section 6). A search field sits at the top of this section. Hidden when offline. |

### 3.6 Elements

Graphic pieces thumbnails use all the time.

| Section | Content |
|---|---|
| **Shapes** | Rectangle, rounded rectangle, ellipse, polygon, star, line, arrow (`DESIGN_SHAPES`). |
| **Arrows and Circles** | Hand-drawn style arrows, circles and underlines for pointing at things. Built-in SVG files placed as image layers through the existing SVG import. |
| **Badges** | NEW, PART 2, FREE, VS, a number badge, a duration badge. Built-in templates of one or two layers, so text stays editable. |
| **Emoji and Stickers** | Emoji rendered from the system emoji font as large type layers, plus a few built-in PNG stickers. |
| **Backgrounds** | Solid colors, gradients (`gradient.js`) and a few textures. Applied to the design background. |
| **More Elements** (online) | Stock illustrations and icons where a provider offers them (section 6). |

### 3.7 Styles

Like Express: tabs at the top, **Recommended**, **Colors**, **Fonts**.

| Tab | Content |
|---|---|
| **Recommended** | Palette + font pair combinations as cards (five color bars and two font names, like Express). Applying one recolors the design and sets the fonts. |
| **Colors** | Palettes only, two per row. Includes **From This Frame**: a palette sampled from the current video frame (new, small, uses `frameSampler.js`). |
| **Fonts** | Font pairs only (same data as 3.4). |

Recoloring a design needs to know which color is which. Templates get **color roles** (section 7): `background`, `title`, `highlight`, `accent`, `stroke`. A palette maps its five colors to those roles. For designs not made from a template, apply the palette by layer type: first type layer gets `title`, other type layers `accent`, shapes `highlight`, the background `background`. Hover previews the result on the canvas before anything changes (section 4).

### 3.8 Brand

| Section | Content |
|---|---|
| **Logo** | My Logo (`brand.js`). Click places it. |
| **Brand Colors** | The swatches from `BrandColors.jsx`. Click a swatch to apply it to the selected layers. |
| **Brand Fonts** | One title font and one body font, saved in prefs. Used by the Add Title / Add Subtitle buttons. |
| **Brand Palette** | The brand colors shown as a palette card, applied like 3.7. |

---

## 4. One behaviour for every library card

Built from `LibraryCard` in `LibraryPanel.jsx` and `libraryPreview`, `startLibraryDrag`, `dropLibraryItem` in `library.js`. Generalize these so every panel uses them.

| Action | Result |
|---|---|
| Hover | Live preview on the canvas. Nothing is saved, nothing goes into undo. Leaving the card restores the canvas. |
| Click | Selects the card (blue outline). |
| Double-click or Enter | Applies it: places a photo or element in the middle, applies a style or palette, creates a design from a template. |
| Drag onto the canvas | Applies it at the drop point. A style or palette dropped on a layer applies to that layer only. |
| Right-click | Card menu: Apply, Save to My…, Delete (user items), Show Credits (stock items). |

Hover previews of online items use the small preview image only. The full-size file is downloaded on apply, with a progress indicator on the card.

---

## 5. Thumbnail tools in the canvas toolbar

These exist already. The redesign only gives them a clear, fixed place.

| Tool | Where it comes from |
|---|---|
| **Resize** (icon, menu of size presets plus Custom…) | `DESIGN_SIZES`, `resizeDesignContent`, the Resize dialog in `ToolsDialogs.jsx`. Replaces "Resize…" inside the Canvas menu. |
| **Feed Preview (F)** | `toggleFeedPreview` in `tools.js`, `Preview.jsx`. |
| **Safe Zones (G)** | `toggleSafeZones` in `tools.js`. |
| **Readability** | `Readability.jsx`. Shows a warning dot on the icon when text is too small or has low contrast. |
| **Canvas** menu | Make Variant, Compare Variants, Crop Canvas, rotate and flip. |

---

## 6. Online resources

### 6.1 Rules

1. **On by default.** Settings → Design → **Online Resources**: one main switch and one switch per image source, all on from the start. The settings page says in one line what is sent (search words) and to whom. Turning the main switch off hides every online section, exactly as when offline.
2. **All network calls in the main process** with `net.fetch`, like `src/main/updates.js`. The renderer never talks to a provider directly.
3. **The user never handles keys for built-in sources.** Most free image services want each app to register once and send an app key with every request, so they know which app is asking. Reccut registers itself with each built-in source and ships those app keys. The user just sees photos. If a source's terms do not allow a key inside a desktop app, that source is not built in; it can still be added as a plugin (6.4).
4. **Offline is normal and quiet.** When the machine is offline, or a source does not answer, the online sections are hidden, not shown empty or with errors. One small line at the bottom of the panel says: "Reccut is offline. Go online to get more resources." When the connection comes back, the sections reappear without a restart (listen to the browser's `online` / `offline` events and retry on panel open).
5. **Download on use, then local.** A stock image is downloaded only when it is applied, then copied into `<project>/Designs/Assets/` like Import Embedded, so the project and its package work offline afterwards (D4, D7).
6. **Credits travel with the asset.** Each downloaded asset stores where it came from (section 7). The Export dialog gets **Copy Credits**, which copies a ready text for the video description, for example `Thumbnail photo: Name / Unsplash`.
7. **Cache** search results and preview images in the app cache folder for 24 hours. Respect each provider's rate limits and show a clear message when a limit is reached.
8. **No scraping.** Use only official APIs. If a site has no API, it is not a provider.

### 6.2 Providers

The terms below are what was known when this plan was written. **Check each provider's current API terms before building it** (whether an app key may be shipped in a desktop app, attribution, hotlinking, caching, rate limits, and whether thumbnails for monetized YouTube videos are allowed). Write the result in the progress log.

| Provider | Gives | Notes to verify |
|---|---|---|
| **Pixabay** | Photos, illustrations, vectors | Free API key. Results must be cached and images downloaded rather than hotlinked permanently. Show Pixabay as the source of results. |
| **Pexels** | Photos | Free API key. Credit to Pexels and the photographer is requested. |
| **Unsplash** | Photos | Access key. Requires attribution (photographer and Unsplash), hotlinked preview URLs, and a call to the download endpoint when a photo is used. Low request limit until the app is approved for production. |
| **Openverse** | Openly licensed images | Works without a key. Licenses vary per image. Filter to licenses that allow commercial use and modification, and store the license with the asset. |

Paid services, such as **Magnific**, are not built in. Users who have an account add them as an image source plugin (6.4) with their own key.

Each provider is one small module in `src/main/stock/` with the same two functions:

```js
search({ query, page, kind }) // → { items: [{ id, provider, kind, preview, width, height, author, authorUrl, pageUrl, license }], more }
download(item, dir)           // → local file path, after any required "download" ping
```

`kind` is `photo`, `illustration`, `vector` or `icon`. IPC: `stock:providers`, `stock:search`, `stock:download`. The renderer merges results from all enabled providers, labelled by provider.

### 6.3 Reccut template catalog

Stock sites do not offer templates in Reccut's format. Host a catalog instead:

- A public GitHub repository with `.reccut-design-template` files, a preview PNG per template and an `index.json` with name, ratio, tags and version.
- The app fetches `index.json` (cached), shows previews in **More Templates**, and downloads a template on use through the existing `importTemplate` validation (`validateDesignTemplate`).
- New templates can be published without an app update. Same pattern as the update check, which already reads from GitHub.

PSD templates downloaded by the user from any site keep working through Import Image, since PSD and PSB already import as separate layers.

### 6.4 Image source plugins

For paid services (Magnific and similar) and any other image service with an API. The user installs the plugin, pastes their own key once, and the service shows up as one more source under Stock Photos and in Search, with the same card behaviour, download on use and credits as the built-in ones.

- **Where:** Settings → AI & Plugins, next to the existing processor plugins. Reuse the plugin list, import/export and sharing in `src/main/extensions.js` and `src/renderer/Extensions.jsx`.
- **Key storage:** the user's key goes through the same `safeStorage` path the extension host already uses for secrets. It never enters project files or prefs.
- **Format:** a new declarative plugin kind, `reccut-image-source-v1`. A JSON file that describes the API; no code runs. Fields: `id`, `name`, `icon`, `homepage`, `keyLabel` and `keyHelpUrl` (where the user gets a key), `search` (URL template with `{query}`, `{page}`, `{key}`, plus headers), `results` (where the item list is in the JSON answer and which fields hold id, preview URL, full URL, width, height, author, page URL, license), optional `download` (URL template and headers when the full file needs its own call), and `credit` (a template like `Image: {author} / Magnific`).
- **Built-ins use the same format.** Pixabay, Pexels, Unsplash and Openverse are written as `reccut-image-source-v1` files shipped with the app (with Reccut's app key filled in), so there is one engine in `src/main/stock/` and not one module per service. Sources whose API needs more than this format allows (for example a required "download" ping) get a small named hook in that engine, not free code in the plugin.
- **Only HTTPS**, only the hosts named in the plugin file, responses limited in size, the same 24 hour cache and the same offline rule (6.1, rule 4).
- **Validation and tests** like `validatePlugin` today: a pure validator in `src/shared/` with tests for good files, missing fields, non-HTTPS URLs and unknown placeholders.

---

## 7. Data changes

All additions are optional fields, so older projects and templates open unchanged (plan section 5.7).

| Where | Field | Use |
|---|---|---|
| `project.designAssets[id]` | `source: { provider, id, author, authorUrl, pageUrl, license }` | Credits for stock images (6.1, rule 6). |
| Design templates | `tags: string[]` | By Style sections and Search (3.2, 3.1). |
| Template layers | `colorRole: 'background' \| 'title' \| 'highlight' \| 'accent' \| 'stroke'` | Recoloring with palettes (3.7). `templateFromDesign` asks for it in Save as Template, next to the existing placeholder roles. |
| Built-in data | `DESIGN_PALETTES`, `DESIGN_FONT_PAIRS` in `src/shared/designTemplates.js` | Styles panel. |
| Prefs | `designBrandFonts`, `designOnline: { enabled: true, sources: { pixabay: true, … } }` (missing means on), `designPanel` (last open rail item), `designPanelWide` | Brand fonts, online switches, remembered layout. Plugin keys are not in prefs: they go in `safeStorage`. |

Pure logic (palette mapping, font pair choice, search ranking, credits text) goes in `src/shared/` with tests, as the plan's rule 7 requires.

---

## 8. Phases

Each phase ends with `npm test` and `npm run build` passing and a manual check in the app (`npm start`), as in plan section 1.2.

### Phase A: New layout, nothing new to learn

1. Rail + single panel + expand/close. Remember the last panel.
2. Designs strip at the bottom, with **+** and **Export ▾**. Remove the Designs tab and the header **+**.
3. Move existing content into Templates, Video, Text (styles), Add Content (Import Image, From Project), Brand.
4. Generalize the library card behaviour (section 4) to every panel.
5. Sections with **See All ›** and horizontal rows.

Done when: everything that worked before works from its new place, and nothing is reachable in two places for no reason.

### Phase B: Thumbnail content offline

1. For This Video and Best Frames as cards.
2. Text: Add Title / Subtitle / Badge, Font Pairs.
3. Elements: shapes, arrows and circles, badges, emoji, backgrounds.
4. Styles panel with palettes and color roles, including From This Frame.
5. Template tags, By Style sections, Search across all offline content.
6. **Resize** in the toolbar, Readability warning dot.

### Phase C: Online resources

1. The `reccut-image-source-v1` format, its validator and the engine in `src/main/stock/`, with Pixabay first (it allows downloading and has generous limits). Online/offline detection and the offline note.
2. Settings → Design → Online Resources (on by default).
3. Stock Photos in Add Content and in Search, download on use, credits stored, **Copy Credits** in Export.
4. The remaining built-in sources, one at a time, each after checking its terms.
5. Image source plugins in Settings → AI & Plugins, with the user's own key.
6. Reccut template catalog and **More Templates**.

---

## 9. Open questions for the user

1. **Import Image vs Place.** The main button is now **Import Image…** with Embedded/Linked in its menu. Should section 5.8 of the plan be changed to use Import everywhere (menus, help), or keep Place Embedded / Place Linked in the Design menu for Photoshop users?
2. **Template catalog.** Who makes and maintains the online templates, and in which repository?

Decided: online resources are on by default and hidden when offline. Built-in sources use Reccut's own app keys, so users never see a key. Paid services such as Magnific come as image source plugins with the user's own key.

---

## 10. Not in this redesign

Generative AI images or templates, video thumbnails with motion, team libraries or sharing, a browser of the user's whole disk, Google Fonts download (possible later as an online provider for fonts, with the same rules as 6.1).
