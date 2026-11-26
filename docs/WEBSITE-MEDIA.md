# Website media

Refreshed on 5 November 2026 using the current Reccut source. No application version change is required for a website media update.

## Brand — 26 November 2026

`assets/help/brand.jpg` and `assets/help/brand-design.jpg` show the Brand tab in Edit and Brand in Design for an English demo profile, Northwind Studio, with saved titles, lower thirds, effect presets and Design elements. No media files are used; the previews draw Reccut's own sample scene. To photograph them again after `npm run build`:

```sh
node scripts/capture-brand.cjs
```

The script uses a temporary, isolated app profile and does not open or change the user's projects or Brand. Run `npm run docs` afterwards to copy the images to the website.

## Voice Over Studio — 12 November 2026

`media/voice-over-studio.jpg` shows the actual studio renderer with a four-paragraph English demo script, real narration waveforms, a starred take, audio effect templates, AI Clean Voice and the Send to Edit subtitle option. The spoken narration is also in English (`en-us`), generated locally with Kokoro-82M, voice `af_heart`, using the model and eSpeak NG pronunciation add-on pinned in `ttsCatalog.json`. No Lingit voices or other system speech engines are used for the finished image. No user recording or manuscript is included.

All published website text, screenshot scripts and spoken voice examples must be in English. To photograph the studio again, prepare a directory containing `script.txt` (four English paragraphs) and matching English narration in `line-0.wav` through `line-3.wav`, then run:

```sh
node scripts/capture-voiceover.cjs "<demo-directory>"
```

The script uses a temporary, isolated app profile, disables screen capture and denies microphone/camera access. It does not open or modify the user's projects. It captures the current application interface, rather than generating or reconstructing it. Audio stays in the local demo folder; only the screenshot is published.

The accompanying website text covers retakes, automatic trimming, pauses and room tone, local AI voices, AI noise removal, sound effects and caption export. The captions section describes Export Captions Only, SRT/WebVTT, embedded tracks and burned-in subtitles. Speech models are described as optional downloads, matching the current app.

## Demo projects

The local demo folder is `~/Movies/Reccut/Website Demos - 2026-11-05/`:

- `Into the Wild/Into the Wild.reccut`: seven nature clips, dissolves, two titles, music, and a layered film cover in Design. Includes its own media and cache.
- `Portrait/Portrait.reccut`: a filled 9:16 version, linked to the copied nature footage.
- `Square/Square.reccut`: a filled 1:1 version, linked to the copied nature footage.
- `Echoes - Screen and Camera/Echoes of Quite Recent.reccut`: the current gameplay demo. Uses the original separate screen and camera files from `Test 2/Recordings/Recording 2026-11-05 22.35.43`, with the same source range as the user's Echoes sequence: 24.764454–36.629590 seconds. Keeps linked screen and PiP clips on V1/V2, adds the game link on V3, a cut at five seconds, a 0.7-second picture fade-in and a 0.4-second audio fade-in.
- `Gameplay recording demo/Gameplay recording demo.reccut`: the earlier composite-video example, retained locally. It is superseded by the separate-track project above.

The original Help Demo project is preserved. Keep the demo folder together when moving the projects.

## Capture

Run `npm run build` first, then:

```sh
node scripts/capture-website.cjs \
  "$HOME/Movies/Reccut/Help Demo - Into the Wild/Into the Wild.reccut" \
  "$HOME/Movies/Reccut/Website Demos - 2026-11-05"
```

Use a new destination for a new set of demos. Append `--resume` to photograph an existing demo folder again. The script uses a separate application profile, disables hardware capture, and photographs the actual renderer. Still images go through Reccut's frame exporter; film looks are applied by Reccut. The Export screenshot uses three real background export jobs. Temporary capture files are kept in the printed temporary folder if a run needs diagnosis.

After capture, check the image dimensions against the HTML attributes and inspect the results. Window height can vary with the available display. Finished video conversions remain in the demo project's Exports folder.

## Updated assets

| Website area | Assets |
| --- | --- |
| Main editor | `overview.jpg`, `timeline.jpg` |
| Quick Search | `quick-search.jpg`, with the query `color` |
| Titles | `still-title.jpg`, `still-lowerthird.jpg` |
| Color tools | `color-tile-grade.jpg`, `color-tile-wheels.jpg` and `color-tile-vectorscope.jpg`, from `scripts/capture-features.cjs`. `ba-before.jpg` and `ba-after.jpg` are no longer shown on the page |
| Film looks | All six `look-*.jpg` examples, shown as one strip of portrait crops |
| Film look comparisons | Six matching `look-*-before.jpg` originals, shown with a draggable before/after slider when a film look is opened |
| Output formats | `fmt-169.jpg`, `fmt-916.jpg`, `fmt-11.jpg`, rendered from the same shot |
| Design | `design.jpg`, showing the cover stored in the nature project |
| Export | `export-queue.jpg`, `exportroom.jpg` |
| Recording | `record-gameplay.mp4` (8 seconds, muted H.264 loop), `record-gameplay.jpg`, `record-gameplay-edit.jpg` |
| Finished gameplay edit | `echoes-edited.mp4`, including the game link, fades and microphone audio. Not linked from the page |
| Multicam | `multicam-window.jpg`, copied from `assets/help` (see `MULTICAM-CAPTURES.md`). The city clips are sample footage, not cameras recording one event; the caption says so. `multicam-result.jpg` is no longer shown on the page |

The green-screen comparison contains no application chrome and remains applicable. The page header separately uses the existing nature reel, `reel.mp4` and `reel-poster.jpg`.

Each film look and its `-before` original is rendered from the same timeline time, at 1280 × 720, with titles disabled. The original has no film look applied. To regenerate just these pairs, append `--resume --looks-only` to the nature-project capture command above. The enlarged comparison starts at 50/50 and supports mouse/touch dragging and the native range input's keyboard controls. Other screenshots still open as ordinary image previews.

To capture a new recording demo, run `node scripts/capture-recording.cjs [raw-recording-directory] [new-demo-directory] [reference-project.reccut]`. Defaults point to the raw recording and `~/Movies/Reccut/Test 2/Test 3.reccut`. Only that recording's source range is read from the reference project; unrelated media and sequences are excluded. Original files and the reference project are unchanged.

The raw screen and camera feed the real recording engine separately through canvas streams, with the camera's audio routed internally as microphone input. No live screen, camera or microphone is accessed. The capture uses a separate app profile. The saved edit directly references local copies of the raw recording, rather than a flattened video. Its title reads “Play the game yourself at sirbull.itch.io/echoes-of-quite-recent”.

The website's recorder loop is muted; the finished edit and project retain the microphone audio. MP4 is used instead of GIF to keep the animated demo small and preserve legible interface text. The original quality export remains in the project's Exports folder; the website uses a compressed copy. Frame exports at 0, 0.35, 0.8 and 3.5 seconds are retained in the capture workspace for fade/title verification.

## Effects handbook images — 17 November 2026

`assets/help/effects-hue-saturation.jpg`, `effects-light-leaks.jpg`, `effects-blinking-lights.jpg` and `effects-blend-mode.jpg` are photographed from the real editor with the nature clips from the Into the Wild demo (Falling water, Coastal ridge, Quiet coast, Mountain lake, Blossoms and bees). Run `npm run build`, then:

```sh
node scripts/capture-effects.cjs "$HOME/Movies/Reccut/Website Demos - 2026-11-05/Into the Wild/Media"
```

The script uses a temporary, isolated app profile like the other capture scripts and writes to `assets/help`. Run `npm run docs` afterwards to copy the images to the website handbook. Lens Flare images are not part of this script.

## Captions handbook images (22 November 2026)

`assets/help/captions-own-style.jpg`, `captions-several.jpg` and `captions-styles.jpg` are photographed from the real editor with the Coastal ridge clip from the Into the Wild demo and three typed captions. Run `npm run build`, then:

```sh
node scripts/capture-captions.cjs "$HOME/Movies/Reccut/Website Demos - 2026-11-05/Into the Wild/Media"
```

The script uses a temporary, isolated app profile and writes to `assets/help`. Run `npm run docs` afterwards to copy the images to the website handbook. The right click menu is a native menu and cannot be photographed this way, so the handbook describes it in text.

## Highlights cards — 22 November 2026

The Highlights section has seven cards with a small picture and a short text. Two pictures are photographed from the real editor; the others are cropped from handbook images so only the picture area shows:

| Card | Asset | Source |
| --- | --- | --- |
| Lens flares | `feature-lens-flare.jpg`, `feature-lens-flare-studio.jpg` | `scripts/capture-lensflare.cjs --website` |
| Cut to the beat | `feature-beat-grid.jpg` | `scripts/capture-features.cjs` |
| Search what is said | `feature-transcript-search.jpg` | `scripts/capture-features.cjs` |
| Light leaks | `feature-light-leaks.jpg` | `assets/help/effects-light-leaks.jpg` |
| Double exposures | `feature-blend-modes.jpg` | `assets/help/effects-blend-mode.jpg` |
| Change one color | `feature-hue-saturation.jpg` | `assets/help/effects-hue-saturation.jpg` |
| Redactions that follow | `feature-redact-tracking.jpg` | `assets/help/tracking-follow.jpg` |

The demo media is in `~/Movies/Reccut/Website Demos - 2026-11-22/Feature Cards/Media` and is made by `node scripts/feature-demo-media.mjs`: a synthesized 100 BPM drum and bass loop (24 bars of 4/4) and three English takes spoken by Kokoro (`af_heart` and `am_fenrir`), using the Kokoro model and eSpeak NG add-on downloaded in the app. No system voices are used.

Run `npm run build`, then `node scripts/capture-features.cjs`. The script uses a temporary, isolated app profile with a copy of the installed Whisper model from `~/Library/Application Support/Reccut Development`, and downloads nothing. The beat grid is the real beat detection of the demo loop (the script checks that it finds 100 BPM), with six nature clips cut every second bar on V1. Transcript Search shows the real Whisper Base transcription of the three takes, searched for “sunrise”. The beat grid picture is cropped by the script to leave out the empty area below the tracks.

## Color tools — 22 November 2026

`scripts/capture-features.cjs` photographs the color tools at 2x as three tiles: `color-tile-grade.jpg` (the Mountain lake clip with a light teal and orange grade: contrast 14, highlights −15, shadows 6, saturation 6, temperature 4, shadows wheel toward teal, highlights wheel toward orange), `color-tile-wheels.jpg` (the Color Wheels section of the Color tab) and `color-tile-vectorscope.jpg` (the vectorscope of the same frame, from the four-scope view). The media browser is hidden for the pictures. The tiles sit in one row above the film look strip, with the title on the picture like the looks. The large before/after slider was removed from the page; each film look in the strip still opens a before/after comparison.

All pictures from `capture-features.cjs` are taken at 2x (the window is twice the size with zoom 2), so they stay sharp on high-density screens.

## Voice Over Studio picture — 22 November 2026

`media/voice-over-studio.jpg` was photographed again so it looks like a microphone session: four green takes on the Narrator track (the app's color for the first person), a recorded room tone set in the header, and room tone filling the pauses between the takes on the Room tone track. The narration is still Kokoro `af_heart` with the same four-line English script, but `scripts/feature-demo-media.mjs` now places it in a simulated room at 48 kHz: a pink noise floor around −56 dBFS with a low rumble, a breath before each sentence, and room sound before and after the speech. `roomtone.wav` is five seconds of the same room. The demo folder is `~/Movies/Reccut/Website Demos - 2026-11-22/Voice Over`; photograph it with `node scripts/capture-voiceover.cjs "<that folder>"`. The takes are trimmed like microphone takes, against the room tone's noise floor. The capture profile marks the voice package list as shown, so it does not cover the studio. The picture is 2400 × 1368.

## Lens flare card (22 November 2026)

The Lens flares card shows a blue flare alone on black (`feature-lens-flare.jpg`, 1600 × 900), rendered by the same renderer as the export. Clicking it opens `feature-lens-flare-studio.jpg` instead of a larger copy (the card image's `data-full` attribute): the same flare in Flare Studio on the Black background, with the spectral ghost selected, photographed at 2x (2400 px wide). The flare is defined as `WEBSITE_FLARE` in `scripts/capture-lensflare.cjs`: Anamorphic-style streaks, a 12-ray starburst, diffraction, light lens dust and a row of blue procedural ghosts and rings. Run `npm run build`, then `node scripts/capture-lensflare.cjs --website`; it writes both pictures to `docs/media`. The Mountain lake clip from the Help Demo project is only used to host the effect; it is not visible.
