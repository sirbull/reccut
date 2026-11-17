# Optional add-on packages

App releases contain Reccut installers. Optional components use a separate
`addons-v<version>` release with independently versioned ZIP packages. Reccut
uses direct HTTPS addresses pinned in `src/main/addonCatalog.json`; it does not
search the latest app release to discover add-ons.

The first package release is `addons-v1.0.0`:

| Package | Contents |
| --- | --- |
| `reccut-keystrokes-mac-1.0.0.zip` | Universal macOS helper, README and MIT license |
| `reccut-keystrokes-win-x64-1.0.0.zip` | Windows x64 helper, README and MIT license |
| `reccut-keystrokes-linux-x64-1.0.0.zip` | Linux x64 helper, README and MIT license |
| `reccut-voxcpm-mac-1.0.0.zip` | Apple Silicon speech engine and component licenses |
| `reccut-voxcpm-<language>-1.0.0.zip` | Both synthetic reference voices and their MIT license, for `nb`, `en-us`, `sv`, `da` or `de` |

The catalogue pins each archive's version, size, SHA-256 and direct URL. It also
pins each extracted file by name, size and SHA-256. The app verifies archives
before extraction, accepts only the listed regular files, checks their hashes
and sets executable permissions from the catalogue. Extraction occurs in a
private staging directory. Packages cannot supply paths, symlinks, additional
executables or files outside the staging directory.

Downloads start only after the existing explicit install/consent action.
Interrupted archives can resume. Installed components are checked locally and
reused across app upgrades while their pinned package remains unchanged.
Nothing is fetched during startup, status checks or speech generation.

Whisper, BiRefNet, Kokoro and Piper model weights continue to use their existing
pinned upstream downloads. The optional phonemizer still downloads from npm on
request. These assets are not copied into add-on ZIPs or app installers.

## Publishing new packages

1. Run **Build optional add-on packages** (`.github/workflows/addons.yml`) with a
   new semantic package version. This workflow is separate from app tag builds.
2. Review the generated ZIPs and `addonCatalog.json` in the separate draft. The
   workflow verifies ZIP hashes and every extracted file before creating it.
3. Download the archives and verify them against that catalogue:

   ```bash
   node scripts/verify-addon-packages.mjs /path/to/downloads /path/to/addonCatalog.json
   ```

4. Publish the add-on release with GitHub's **pre-release** flag and do not mark
   it latest. This keeps Reccut's app updater pointed at an app release. The flag
   separates technical downloads; it does not describe the stability of the
   packages. Never replace published archives; use a new package version.
5. Copy the reviewed entries into `src/main/addonCatalog.json`, run the test
   suite, and include the catalogue in the next app release. Individual packages
   may keep older versions when only one component changes.

For offline packaging from already-built helper binaries:

```bash
node scripts/package-addons.mjs /path/to/binaries /path/to/new-output 1.0.0
```

This does not download anything or include model weights. Reference files and
licenses come from this repository. ZIP timestamps and entry order are fixed;
archives store files without compression to make package checksums reproducible
across platforms and zlib versions. Use an empty output directory.

## Compatibility with released apps

Reccut **0.9.4 and earlier** use loose helper and voice files from their matching
app release. Keep those assets and their checksums available. Adding ZIPs does
not change a previously installed app's download addresses. The new ZIP manager
ships in the next app version; 0.9.4 installers are not replaced in place.

The original 1.0.0 Windows/Linux helpers and VoxCPM engine reuse the verified
0.9.4 binaries. The macOS keystroke helper is rebuilt from the same source for
both Apple Silicon and Intel. Synthetic voice references retain their original
pinned contents.
