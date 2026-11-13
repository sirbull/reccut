# Multicam handbook screenshots

The multicam guide is available in Reccut Help and in [MULTICAM.md](MULTICAM.md). The in-app article in [articles.js](../src/renderer/help/articles.js) is the source for both versions. Regenerate the Markdown copy after editing the article.

```sh
node scripts/document-multicam.mjs
```

The pictures were captured from the Reccut 0.9.3 editor using the city-shots sample files. The interface, Program canvas, source videos, thumbnails, menus and timeline are rendered by the application. Images are saved as JPEGs, with crops for individual panels and tracks.

## Source material

The four initial camera angles use these files in order.

1. 343478_medium.mp4
2. 21116-315137080_medium.mp4
3. 84973-587646755_medium.mp4
4. 91744-636709154_medium.mp4

The later camera example adds 14385-256955049_medium.mp4. Camera 4 audio.flac is extracted losslessly from the fourth video into the temporary capture workspace to demonstrate a separate A1 source.

These city shots were recorded at different locations. Three initial files have no audio stream. The fourth and fifth have silent AAC streams. The guide therefore shows the actual Auto Sync failure message and explains the need for shared, audible sound. The level and keyframe images illustrate the controls with the silent audio source.

## Reproduce the pictures

Build Reccut, then pass the directory containing the five original videos to the capture script. The optional second argument chooses the output directory. Its default is assets/help.

```sh
npm run build
node scripts/capture-multicam.cjs "C:/path/to/Downloads/city-shots"
```

The script runs the actual application with a temporary profile and cache, imports the media and prepares a sample edit. Its main window renders offscreen. It uses local files for video and audio, with device capture disabled for this process. The original videos and the user's projects stay in their original locations. The source-removal dialog is photographed and cancelled.

Camera choices are made through the multicam keyboard handler. Other examples load ordinary multicam definitions with sound keyframes and adjusted settings. The capture checks that a new Program is empty, that a draft can be closed and resumed, and that the chosen ten seconds reach the Edit timeline.

The printed temporary directory contains inputs.json, the isolated profile and cache, and capture-report.json with the verification results. The capture-only bundle exposes its preparation helpers in that renderer. The normal application build uses its usual entry point.

## Image index

| Image | Guide example |
| --- | --- |
| multicam-window.jpg | Complete window with four camera choices and A1 sound |
| multicam-empty.jpg | Available cameras before the first Program choice |
| multicam-stacked.jpg | Selected source clips on separate Edit tracks |
| multicam-angles.jpg | Active angle outlined in green beside Program |
| multicam-panels-hidden.jpg | Files and Properties hidden |
| multicam-sync.jpg | Actual synchronization failures for silent or absent audio |
| multicam-timeline.jpg | Short Program above the longer source footage |
| multicam-reorder.jpg | Track header drag and insertion line |
| multicam-new-camera.jpg | Fifth camera added to an existing edit |
| multicam-sound-track.jpg | A1 level automation from −3 dB to −12 dB |
| multicam-panels.jpg | Lower sound controls and AI Clean Voice |
| multicam-range.jpg | I/O output boundaries and shaded source regions |
| multicam-draft.jpg | Restored draft with its Program and playhead |
| multicam-result.jpg | Multicam clips and sound in the Edit timeline |
| multicam-media-removal.jpg | Affected multicam warning and disk deletion option |

After regenerating, inspect each image and check its caption against the visible state. Run the existing handbook checks and rebuild to package the revised text and images.

```sh
node --test test/help-content.test.mjs test/help-window.test.mjs
npm run build
```
