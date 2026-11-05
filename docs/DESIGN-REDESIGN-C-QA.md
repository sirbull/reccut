# Design follow-up and Phase C — 2026-11-05

**Current update:** [personal API-key plugins](DESIGN-ONLINE-SETUP.md) supersede the publisher-key adapters described in the original validation below. Pixabay now uses an optional user-key plugin; Pexels still requires app approval. The follow-up suite has 550 passing tests.

## User-facing result

- Layers opens an animated insertion gap while dragging. Hover can retarget it repeatedly. Only dropping commits the order, as one Undo step. Escape, dropping outside, leaving the panel and changing designs discard feedback. Groups stay atomic, locked members prevent moving a group, and edge scrolling handles long lists. Both expanded and collapsed groups were checked with native Electron drag events. Reduced-motion preferences disable animation.
- The offline library now contains **111 text styles, 40 five-color palettes, 224 non-emoji elements/backgrounds, and 3,781 searchable emoji**. Added typography treatments, CTA labels, polygons/stars, original vector graphics, gradients and editable patterns are bundled locally. Library sections retain paging/search and single-click apply.
- Brand is a reusable set of defaults: title/body fonts, background/title/body/CTA/secondary/fill/stroke colors and an emoji style. New text/shapes and generic drawings use these choices. Explicit style and background palette cards retain their chosen example colors. Font changes update matching editable text in the current design and clear conflicting word-font overrides. Apply Brand explicitly restyles existing editable elements. CTA badges choose readable text, and pattern foregrounds follow the secondary color. Up to 50 named Brand Kits store these defaults. Brand sections have spacing and bottom padding.
- Emoji offers System, Flat and Outline. Flat/Outline are bundled OpenMoji 16.0.0 SVG artwork, used in the library and converted to independent project PNGs on placement. Properties can change one emoji's style and return to editable system text. Unsupported glyphs fall back to System. Source/license metadata travels with generated assets; the unmodified artwork and its CC BY-SA 4.0 notice ship with the app.
- A primary blue Export Design button sits at the top right. Export As contains Copy Credits. Quick PNG/Export All Sizes/Compare remain in the Design menu.

## Phase C implementation

The main-process stock host provides source manifests, validation, source settings, per-source switches, search, preview caching and download-on-use into Designs/Assets. It uses Electron net.fetch. The renderer displays local preview paths, never provider image URLs. Search results and previews expire after 24 hours; expired cache files are removed on startup. Payload sizes/timeouts, public HTTPS/declared API hosts, redirect checks, private-address DNS checks, result-field allowlists, rate-limit cooldowns and opaque download tokens are covered by the implementation.

Openverse is enabled without a key and accepts only CC0, public-domain, CC BY and CC BY-SA results. Pixabay and Pexels adapters are present but remain inactive until Reccut app credentials are supplied by its publisher. They do not ask ordinary users for app keys. Unsplash is deliberately not bundled with a desktop access key: its current official guidelines require confidential access/secret keys and recommend a proxy. Custom declarative image-source plugins can be imported/exported/removed in Settings → Design or AI. User plugin keys use safeStorage, or memory-only storage if encrypted storage is unavailable.

OAuth/MCP support implements discovery, PKCE, system-browser authorization, a temporary loopback callback with state verification, public dynamic client registration, token storage/refresh/sign-out, JSON and SSE responses, initialization and calls restricted to declared stock tools. Magnific is supplied as a sign-in source. Credit-using tools require explicit opt-in each app session before search or download. No real account was signed in and no credits were used during development.

The online template catalog accepts a configured HTTPS index, fetches previews through the main process, and validates templates with validateDesignTemplate before use. `docs/design-catalog/` contains **22 ready catalog entries, template files and PNG previews** for publication. Nothing has been published externally.

## Required external work / remaining acceptance

**Phase C is not production-complete yet.** The user confirmed there are no registered app credentials or public catalog. Remaining items are:

1. Register Reccut with Pixabay/Pexels, obtain any required app approval and establish an approved way to distribute/use its publisher credentials. The adapters currently read `RECCUT_PIXABAY_KEY` and `RECCUT_PEXELS_KEY` from the publisher's runtime environment. They are not embedded in source, preferences or project files.
2. Publish the prepared template catalog in a public repository/HTTPS location and configure its index URL. Publishing is an external action; it was not performed here.
3. Validate Magnific sign-in, stock result mappings and account/plan/download behavior with the owner's actual account. PKCE/MCP mechanics are tested against fixtures, but no live authenticated stock response schema has been verified. Numeric credit prices are not available in the public MCP documentation used here; the UI states that account credits/limits apply before enabling tools.
4. Confirm live Openverse connectivity on the target connection. A direct API probe timed out in this development environment. Quiet offline behavior and the complete stock UI/download flow were tested using a controlled provider fixture.
5. Unsplash requires a separately approved confidential-key proxy/OAuth arrangement before an adapter can be enabled. No scraping or Envato Elements integration was added.

See [publisher setup](DESIGN-ONLINE-SETUP.md) for concrete next steps.

## Validation

- Full suite: **544 tests passing**, including eight added tests for library coverage, Brand roles, bundled emoji/license coverage, source validation/mapping, cache/download/credits, disabled-network behavior, response bounds/private-address/rate limits, real loopback PKCE/state checks and MCP tool restrictions.
- Production build and git diff --check pass. No npm dependency or app version was changed.
- Native app checks: changing Title/Body Brand fonts updates existing text; old word-font overrides clear; new text and shapes inherit fonts/fill; Brand Kit saves; 36 initial emoji cards mirror Flat; single click places a local licensed emoji; per-item Outline/System transitions work; top-right primary export opens Export As with Copy Credits.
- With a main-process test provider, native search displays author/license cards, click downloads a complete local image, and a configured catalog validates/applies a template. Zero renderer errors were recorded. This fixture result is not a claim of live provider/account acceptance.
- Sources are bundled in the Mac package, including the new main-process validator and local SVG/notice files. The production arm64 Mac app starts with an isolated profile, exposes the four source settings, renders 36 local Flat emoji thumbnails and places a Flat PNG from the packaged SVG assets. Its top-right primary export opens Export As with Copy Credits. No renderer errors or QA globals are present; app.asar contains the stock validator and all 8,582 SVG files. Stock caches are isolated per application profile.

## Provider review (primary sources checked 2026-11-05)

- [Pixabay API](https://pixabay.com/api/docs/): app key, source acknowledgement, 24-hour caching, request limits and downloaded assets rather than permanent image hotlinks. App credential registration/distribution approval remains the publisher's responsibility.
- [Pexels API](https://www.pexels.com/api/documentation/) and [app eligibility](https://help.pexels.com/hc/en-us/articles/900005852323-How-do-I-get-unlimited-requests): keys, attribution, default limits and app approval requirements.
- [Unsplash guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines): keys must be confidential; no user developer-key requirement for ordinary app users. A desktop-embedded key is not shipped.
- [Openverse API](https://docs.openverse.org/api/): API access and varying per-item licenses; the implementation conservatively filters licenses allowing commercial use and modification.
- [Magnific MCP](https://docs.magnific.com/modelcontextprotocol): OAuth discovery, streamable HTTP, stock_search/stock_get/stock_download and existing account credits. Live metadata exposes a public-client registration endpoint and S256 support; no registration/login request was performed during development.
- [OpenMoji](https://github.com/hfg-gmuend/openmoji/tree/16.0.0): bundled official 16.0.0 release archives, attribution and CC BY-SA 4.0 notice.

## Personal API-key plugin verification (2026-11-05)

The latest optional Pixabay/Pexels implementation supersedes the publisher-key setup above; see [current setup](DESIGN-ONLINE-SETUP.md). The full suite passes **550 tests**. Native development-app checks using a controlled provider cover install, masked key storage, fresh connection testing, search/download/credits, key removal and Pexels approval gating. No real provider key or account was used.

A fresh arm64 directory package builds successfully and includes both plugin descriptors. Its renderer matches the final production build and contains no QA globals. The separate packaged-app interaction check did not complete: the debugger stopped responding after the system-storage availability call, so this run does not establish packaged runtime acceptance. The isolated test processes were stopped. The previous package acceptance above applies to the earlier Phase C build.
