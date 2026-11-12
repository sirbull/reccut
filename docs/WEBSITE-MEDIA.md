# Website media

Refreshed on 5 November 2026 using the current Reccut source. No application version change is required for a website media update.

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
| Color comparison | `ba-before.jpg`, `ba-after.jpg`, sampled at the same timeline time |
| Film looks | All six `look-*.jpg` examples |
| Film look comparisons | Six matching `look-*-before.jpg` originals, shown with a draggable before/after slider when a film look is opened |
| Output formats | `fmt-169.jpg`, `fmt-916.jpg`, `fmt-11.jpg`, rendered from the same shot |
| Design | `design.jpg`, showing the cover stored in the nature project |
| Export | `export-queue.jpg`, `exportroom.jpg` |
| Recording | `record-gameplay.mp4` (8 seconds, muted H.264 loop), `record-gameplay.jpg`, `record-gameplay-edit.jpg` |
| Finished gameplay edit | `echoes-edited.mp4`, including the game link, fades and microphone audio |

The green-screen comparison contains no application chrome and remains applicable. The page header separately uses the existing nature reel, `reel.mp4` and `reel-poster.jpg`.

Each film look and its `-before` original is rendered from the same timeline time, at 1280 × 720, with titles disabled. The original has no film look applied. To regenerate just these pairs, append `--resume --looks-only` to the nature-project capture command above. The enlarged comparison starts at 50/50 and supports mouse/touch dragging and the native range input's keyboard controls. Other screenshots still open as ordinary image previews.

To capture a new recording demo, run `node scripts/capture-recording.cjs [raw-recording-directory] [new-demo-directory] [reference-project.reccut]`. Defaults point to the raw recording and `~/Movies/Reccut/Test 2/Test 3.reccut`. Only that recording's source range is read from the reference project; unrelated media and sequences are excluded. Original files and the reference project are unchanged.

The raw screen and camera feed the real recording engine separately through canvas streams, with the camera's audio routed internally as microphone input. No live screen, camera or microphone is accessed. The capture uses a separate app profile. The saved edit directly references local copies of the raw recording, rather than a flattened video. Its title reads “Play the game yourself at sirbull.itch.io/echoes-of-quite-recent”.

The website's recorder loop is muted; the finished edit and project retain the microphone audio. MP4 is used instead of GIF to keep the animated demo small and preserve legible interface text. The original quality export remains in the project's Exports folder; the website uses a compressed copy. Frame exports at 0, 0.35, 0.8 and 3.5 seconds are retained in the capture workspace for fade/title verification.
