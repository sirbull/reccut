# Online Design resources: publisher setup

The offline library and Brand work without any accounts. Openverse is built in and needs no key. Pixabay is an optional plugin using each user's own API key; Reccut does not need to distribute a shared publisher key. Pexels is available for setup but still needs app approval before it can connect. Unsplash is not offered as a personal-key plugin.

## Connect your own API key

1. In Design, choose **Plugins → Image Source Plugins**. In Settings → Plugins, photo sources and the template catalog are grouped under **Design**. The current workspace is shown first; use the workspace buttons to jump between sections. The same source setup is also available in Settings → Design or AI.
2. Choose **Add Pixabay**, then **Get API Key…** to visit the provider's own website. Create/sign in to your account there and obtain your key.
3. Paste it into the masked API key field and choose **Save Key**. The field clears; the stored value is never sent back to the interface.
4. Choose **Test Connection**. This sends one fresh sample request using the saved key rather than reusing cached search results. Invalid keys and rate limits get clear feedback.
5. Search Stock Photos in Add Content or Search. Usage and limits belong to your provider account. Images and credits are copied into the project when used.

**Replace Key**, **Remove Key** and **Remove** let you manage the connection. Previously downloaded project images remain available offline. Source manifests can be exported/imported without keys. Keys use encrypted system storage when available; otherwise they remain in memory for the session. Updating a plugin's API destination clears its previous credentials so a key cannot silently move to a different service.

## Provider-specific requirements

- **Pixabay:** personal API key from https://pixabay.com/api/docs/#api_key. Searches are cached for 24 hours and source attribution is retained. There is no shared Reccut key to register or ship.
- **Pexels:** setup supports a personal key from https://www.pexels.com/api/. The service also requires approval for an app/plugin. Saving a key does not bypass that requirement; search and connection testing remain blocked until approval is recorded. For approved publisher testing, `RECCUT_PEXELS_APPROVED=1` activates the adapter. This flag is not evidence of approval and must only be supplied after Pexels approves the application.
- **Unsplash:** its official guidelines do not permit requiring users to register developer accounts for an application. An approved proxy/OAuth arrangement is still needed; simply collecting personal developer keys is not supported.

The prior `RECCUT_PIXABAY_KEY` / `RECCUT_PEXELS_KEY` publisher-key workflow is superseded by optional personal-key plugins. No provider approval, real-key test or account registration was performed during development.

## Online template catalog

Reccut's catalog is published at https://sirbull.github.io/reccut/design-catalog/index.json. New profiles use this address automatically. Open **Design → Templates → More Templates**, then click a card to create an editable design. No account, API key or model download is required. Existing designs remain editable offline. The catalog list and previews are cached for 24 hours; fetching a template needs a connection. The built-in templates remain available if the catalog cannot be reached.

**Settings → Plugins → Design → Online Template Catalog** lets you use another public HTTPS index, or clear the address and choose **Save Catalog** to disable it. Saved settings, including an empty address, are preserved on upgrade. For an older profile with an empty address, paste the Reccut catalog URL above and choose Save Catalog. Turning off online resources also disables catalog requests.

The website workflow publishes `docs/design-catalog/`, including index.json, 22 .reccut-design-template files and matching PNG previews. Preserve relative paths when adding entries or hosting a copy. Its content contains no project/media paths, secrets or personal photos.

## Magnific

Settings → Design (also available under AI) → Magnific → Sign In opens the service's own browser login. Reccut handles PKCE and a temporary localhost callback. Passwords never enter Reccut. Sign Out removes saved tokens. Without encrypted system storage, tokens remain in memory only.

After signing in, Enable stock tools explains account credit use and requests opt-in for the app session. Check the actual search/download tool response and result mappings with your account before treating this integration as production-ready. No paid call was made in development. The public documentation does not supply a reliable per-image numeric credit quote.

## Custom image sources

Import a JSON manifest in Settings → Design or AI. The format is `reccut-image-source-v1` (REST) or `reccut-mcp-source-v1` (OAuth/MCP). Search/download API URLs must use HTTPS and declared hosts. Allowed URL placeholders are `{query}`, `{page}`, `{kind}`, `{id}`, `{key}`. Sensitive headers use `{key}` rather than a literal secret. Results map an item array and fields (`id`, `preview`, `full`, `author`, `authorUrl`, `pageUrl`, `license`, `licenseVersion`, `licenseUrl`, `width`, `height`, `title`). Download JSON endpoints may return a signed `url` or `download_url`. Arbitrary plugin code is not executed.

User keys are saved separately through encrypted system storage or held in memory when encryption is unavailable. Export Source exports only the manifest; keys and OAuth tokens are excluded. Only declared MCP tool names are callable. JSON source examples are in `src/main/stock/keyProviders.js` and `src/main/stock/builtins.js`; give a custom source a new unique ID instead of replacing a built-in source.
