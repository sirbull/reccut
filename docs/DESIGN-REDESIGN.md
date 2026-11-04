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
| Click | Applies once and selects the card (blue outline). |
| Double-click or Enter | Applies once; the second click of a double-click is ignored: places a photo or element in the middle, applies a style or palette, creates a design from a template. |
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

Paid services are not built in. Users who have an account add them as a plugin: with their own key (6.4), or by signing in with their account (6.5, **Magnific** first).

The engine in `src/main/stock/` gives every source, built-in or plugin, the same two functions:

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

### 6.5 Sign-in plugins (OAuth through MCP)

Some services let the user **sign in with their own account** instead of pasting a key. The user clicks **Sign In**, the system browser opens the service's own login page, the user approves access, and Reccut gets a token. Reccut never sees or stores the password.

Never ask for a user name and password inside Reccut, even if a service would accept it. Passwords stay on the service's own page.

**Magnific** (formerly Freepik) is the first service. Checked when this plan was written; check again before building:

- Magnific's ordinary REST API uses an API key (`x-magnific-api-key` header). That fits 6.4.
- Magnific also runs an **MCP server** at `https://mcp.magnific.com` (streamable HTTP). It uses **OAuth 2.0 with the user's Magnific account**, so no API key is needed. The OAuth settings are found through `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. No manual app registration is described. Source: [docs.magnific.com/modelcontextprotocol](https://docs.magnific.com/modelcontextprotocol).
- Its stock tools: `stock_search` (keyword or visual similarity), `stock_get` (details, preview, size, formats, author), `stock_download` (the file). `stock_show`, `stock_to_creation` and the `creations_*` tools are for other clients and are not used.
- Unknown: whether stock downloads use the account's credits or need a certain plan. Find out before building. If downloads cost credits, the card shows that before download, and apply asks once per session.

How to build it:

- **Plugin kind** `reccut-mcp-source-v1`: a JSON file with `id`, `name`, `icon`, `homepage`, `server` (HTTPS URL), the tool names for search, details and download, a mapping from the tool results to the item fields in 6.2, and `credit`. Magnific ships as a ready-made file of this kind that the user turns on in Settings → AI & Plugins, so they only need to click Sign In.
- **OAuth for a desktop app**, done the standard way for native apps: authorization code flow with **PKCE**, the **system browser** (`shell.openExternal`, never an embedded login window), and a redirect to a temporary **loopback** address (`http://127.0.0.1:<random port>/callback`) that the main process listens on during sign-in. Use dynamic client registration when the server offers it, as the MCP authorization spec describes.
- **Tokens** (access and refresh) go through `safeStorage` like other secrets, never into prefs or project files. Refresh silently. When refresh fails, the source is hidden and its settings row says **Sign In Again**. **Sign Out** deletes the tokens.
- **MCP client**: a small JSON-RPC client over HTTPS in `src/main/stock/mcp.js` (`initialize`, `tools/call`). Only the tools named in the plugin file can be called. No new npm dependency: adding the official MCP SDK needs the user's approval (plan section 1.3).
- The rest is the same as other sources: results under Stock Photos and in Search, download on use into `Designs/Assets/`, credits stored, offline rule.
- Tests: a pure validator for the plugin file, the PKCE helper, and the result mapping, with a local test server standing in for the MCP server. No real Magnific account in tests.

The same plugin kind works for any other image service that offers an MCP server with OAuth. Services with ordinary OAuth but no MCP server can be added later as a third kind if one turns up.

**Envato Elements is not possible.** Envato Elements has no public API. Envato's API with OAuth only covers single purchases on Envato Market (ThemeForest and similar), not an Elements subscription. Unofficial download services break Envato's terms and must not be used. What works today: download a template from Envato in the browser and import it; PSD and PSB files come in with their layers.

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
6. Sign-in plugins (6.5): OAuth with PKCE and loopback redirect, the MCP client, and the Magnific plugin file. First confirm the Magnific credit question.
7. Reccut template catalog and **More Templates**.

---

## 9. Open questions for the user

1. **Import Image vs Place.** The main button is now **Import Image…** with Embedded/Linked in its menu. Should section 5.8 of the plan be changed to use Import everywhere (menus, help), or keep Place Embedded / Place Linked in the Design menu for Photoshop users?
2. **Template catalog.** Who makes and maintains the online templates, and in which repository?

Decided: online resources are on by default and hidden when offline. Built-in sources use Reccut's own app keys, so users never see a key. Paid services come as plugins: with the user's own key, or with sign-in through OAuth (Magnific, through its MCP server). Never a user name and password inside Reccut. Envato Elements cannot be supported, since it has no public API.

---

## 10. Not in this redesign

Generative AI images or templates, video thumbnails with motion, team libraries or sharing, a browser of the user's whole disk, Google Fonts download (possible later as an online provider for fonts, with the same rules as 6.1).


---

## 11. Progress log

### 2026-11-03: Phase A complete

- A1: Templates, Video, Text, Add Content and Brand now use a 64 px rail and one open panel. The panel expands, closes and restores its last panel and width. Smaller windows use narrower columns.
- A2: The bottom designs strip has page previews, open/rename, duplicate/variant/delete, New Design and the Export menu. The former Designs tab, left footer and title-bar export button are removed. Layers is above Properties.
- A3: Existing templates, frame capture, saved styles, image imports, project images, logo and colors are available from their new panels. Recent shows placed project assets. Video capture can create the first design; full source frames retain their aspect ratio without automatic cropping.
- A4: Library cards share selection, transient hover/focus preview, double-click/Enter apply, native drag-and-drop and context actions. Styles and colors dropped on a compatible layer affect that layer. Locked or incompatible drop targets do not redirect the change to other selected layers. Brand logos are copied into projects on use.
- A5: Sections use horizontal rows and See All grids with Back. Panel search filters existing content, and large grids show 24 items per page.
- Toolbar Resize and Readability now expose the existing tools directly. The warning dot and the new Phase B content remain pending.
- The main action is Import Image, with Import Embedded, Import Linked and Open as New Design in its menu. The existing Place Embedded/Linked Design-menu commands remain available for compatibility. Section 5.8 of the original plan and help describe this arrangement.
- Validation: 480 tests pass, production build passes, and native macOS checks cover empty-room creation, hover/undo separation, real drag-and-drop, saved styles, 500-item pagination, brand assets, camera capture across design navigation, page actions and export. See [Phase A QA](DESIGN-REDESIGN-A-QA.md).

Phase B and Phase C are not implemented by this entry. The suggestions dialog remains available; inline For This Video and Best Frames, title/subtitle/badge presets, font pairs, Elements, palettes/color roles, template tags/global Search and the readability warning dot belong to Phase B. Stock, online settings, credits, source plugins, OAuth/MCP and the template catalog belong to Phase C. No network provider or npm dependency was added.


### 2026-11-04: Phase B complete

- B1: For This Video in Templates and Best Frames in Video share a local, bounded analysis cache. Cards use the Phase A preview/select/apply/drag contract. Apply captures the original-quality frame; the full frame stays available with contain placement. Cut Out This Frame captures the selected composite and runs the existing local background-removal pipeline. Source changes cancel stale analysis; capture also checks project, design and undo/redo navigation.
- B2: Text now has Add Title, Add Subtitle and Add Badge. Sizes follow the canvas, initial text is the project name, and Brand Fonts supplies title/body fonts. Font Pairs is available in Text and Styles; unavailable local pairs are hidden. The two brand fonts and a palette made from brand colors are editable in Brand.
- B3: Elements contains shapes, editable badges including sequence duration, hand-drawn pointers, system emoji, stickers and solid/gradient/textured backgrounds. Built-in SVG artwork is rasterized through Canvas into independent project PNG assets on apply; textures are background image layers. Source artwork remains built in and works offline. My Elements saves reusable choices locally.
- B4: Styles has Recommended, Colors and Fonts. Eight built-in five-color palettes, From This Frame sampling and Brand Palette use the same pure mapping. Optional template color roles survive import/export; untagged layers use type-based fallback. Images, hidden layers and locked groups are preserved. A dropped palette or combined recommendation changes only the compatible target layer. Saved palettes and font pairs remain local.
- B5: Built-in templates have tags, Templates has By Style grouping, and Save as Template offers tags and color roles next to placeholder assignments. Search finds and ranks built-in/saved templates, text styles, elements, palettes, installed font pairs, project images, brand colors and the logo, using the existing section grids and card actions.
- B6: Resize retains its fixed toolbar position from Phase A. Readability now checks after edits with a debounce, updates a warning dot, clears stale results and exposes the existing detailed warnings and manual recheck.
- Main implementation: `src/shared/designContent.js`, `designTemplates.js`, `designLibrary.js`, plus `src/renderer/design/content.js`, `videoLibrary.js`, `VideoCards.jsx`, `OfflinePanels.jsx` and the existing room/library/frame/readability components. Help, feature list and preference defaults describe the new behavior.
- Validation: 500 tests pass, including 20 new content, metadata, async-capture, history and preview regressions. Production build, packaged arm64 app startup and native macOS interaction checks pass, including offline operation in the production renderer. See [Phase B QA](DESIGN-REDESIGN-B-QA.md).

Phase C remains pending: online providers, credits, API-key/sign-in plugins and the template catalog. Phase B adds no npm dependency, remote font download or provider request, and does not change the app version or timeline behavior.


### 2026-11-04: Video frame-picker transport

User-requested follow-up: the Video timecode is editable, accepts full frame timecodes or shorter time entries, applies on Enter/blur and cancels on Escape. Play/Pause and Space control the private preview, with five-second skip buttons and Shift-click for ten seconds. Left/Right step exactly one frame; Shift steps one second. Typing uses normal caret navigation. Capture pauses and snaps to the displayed source frame. Source changes and leaving the room stop playback. Playback ignores the Edit marked range and preserves its playhead and design history.

Files: `src/shared/designPlayback.js`, `FramePicker.jsx`, the Design frame-card/dialog timecode labels, scoped CSS, help and feature list. Validation: 507 passing tests, including seven timecode/boundary/fractional-rate regressions; production build; native Electron checks on a 70-second local square video. Manual checks cover invalid and canceled timecodes, 5/10-second skips, single-frame stepping from the panel and slider, typing caret behavior, playback/Space/pause, natural end/restart, source/room changes, history isolation and uncropped capture. See the follow-up in [Phase B QA](DESIGN-REDESIGN-B-QA.md).


### 2026-11-04: Properties and content refinements

User-requested follow-up: alignment/distribution and paragraph alignment use icon controls; Save Style moves into the section header; Save Color is centralized in Brand. Character appears first for text, with installed-font search and refresh. Local Font Access is allowed only for the main app window. Google Fonts can be opened and installed locally; no online font download provider is added.

Layers has a draggable, remembered height divider and a compact automatic height. Edit Mask now shows the actual ellipse path. Raw text selections from both canvas editing and Properties keep their range while changing Character/Text Color; optional `textStyles` store word-level overrides through model normalization and rendering. Whole layer updates that property across the text while retaining other overrides. Font packaging reports include fonts used in word ranges.

Library cards apply on a single click or Enter; double clicks insert once. Gradients and colors create independent background layers above older backgrounds. Dots and grids are native editable pattern layers with optional `pattern` data, color, size and X/Y spacing. Existing raster Dotted/Grid textures can be converted reversibly. Emoji now has 3,781 Unicode 16.0 entries with English names, categories and bounded grids. Unicode License V3 accompanies the bundled data.

Validation is recorded in [Design usability QA](DESIGN-USABILITY-QA.md). No dependency or version change; Phase C providers remain pending.
