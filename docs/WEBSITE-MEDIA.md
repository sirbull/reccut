# Website media

Refreshed on 5 November 2026 using the current Reccut source. No application version change is required for a website media update.

## Demo projects

The local demo folder is `~/Movies/Reccut/Website Demos - 2026-11-05/`:

- `Into the Wild/Into the Wild.reccut`: seven nature clips, dissolves, two titles, music, and a layered film cover in Design. Includes its own media and cache.
- `Portrait/Portrait.reccut`: a filled 9:16 version, linked to the copied nature footage.
- `Square/Square.reccut`: a filled 1:1 version, linked to the copied nature footage.
- `Gameplay recording demo/Gameplay recording demo.reccut`: a recording made from the supplied `echoes.mp4`, split into two clips with a lower third. Includes the complete source file in Media and the recorded excerpt in Recordings. The camera is already composited into the supplied footage.

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
| Output formats | `fmt-169.jpg`, `fmt-916.jpg`, `fmt-11.jpg`, rendered from the same shot |
| Design | `design.jpg`, showing the cover stored in the nature project |
| Export | `export-queue.jpg`, `exportroom.jpg` |
| Recording | `record-gameplay.mp4` (8 seconds, muted H.264 loop), `record-gameplay.jpg`, `record-gameplay-edit.jpg` |

The green-screen comparison contains no application chrome and remains applicable. The page header separately uses the existing nature reel, `reel.mp4` and `reel-poster.jpg`.

To capture a new recording demo, run `node scripts/capture-recording.cjs [source.mp4] [new-demo-directory]`. It defaults to `~/Downloads/echoes.mp4`. The supplied video feeds the real recording engine as a canvas stream, with its audio routed internally. No live screen, camera or microphone is accessed. The capture uses a separate app profile and saves a persistent project. The website loop is muted; the project retains the source audio. MP4 is used instead of GIF to keep the animated demo small and preserve legible interface text.
