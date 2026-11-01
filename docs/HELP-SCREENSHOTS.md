# Handbook photography

Every bundled help screenshot uses **Into the Wild**, a real, editable 42-second nature project. The user's seven videos in `~/Downloads/Nature-video` are copied into the project's Media folder. The original files are never modified. Only screenshots are bundled with the application; the source videos are not added to the repository.

The generated project is saved at `~/Movies/Reccut/Help Demo - Into the Wild/Into the Wild.reccut`. It contains all seven shots, two editable titles, cross dissolves, chapter markers and a separate ambient demo track. The supplied footage has no audible sound; `Ambient pad - demo.wav` is a locally synthesized sample for the audio illustrations, clearly labelled as demo audio.

| Supplied file | Name in the demo |
| --- | --- |
| 14205-255658030_medium.mp4 | Mountain lake |
| 203449-921267347_medium.mp4 | Forest light |
| 139816-773444570_medium.mp4 | Falling water |
| 129496-744385571_medium.mp4 | Quiet coast |
| 181177-865745746_medium.mp4 | Coastal ridge |
| 158530-816999763_medium.mp4 | Blossoms and bees |
| 215173_medium.mp4 | River gorge |

## Refresh screenshots

Run `npm run help:screenshots`. Optional first and second arguments set the source folder and generated project folder:

```sh
npm run help:screenshots -- "$HOME/Downloads/Nature-video" "$HOME/Movies/Reccut/Help Demo - Into the Wild"
```

The output folder is a generated baseline; keep personal edits in a separately named project before regenerating it. An existing destination without the generator's marker is rejected to avoid overwriting unrelated work.

`help-demo.mjs` prepares the project, source copies, real thumbnails, waveform and layered SVG title artwork. `capture-help.cjs` bundles `help-photography.jsx` with the actual application and photographs the real interface in Electron. It uses an isolated profile and never reads saved AI credentials or the user's other projects. Hardware input hooks and camera/microphone/display permission requests are disabled for the capture session. File browsing is restricted to the demo folder; Finder favourites, connected drives and unrelated media are excluded. The Record illustration feeds a nature clip into the preview; it does not record the user's desktop or camera.

Each screenshot variation starts from the same baseline and has no project save path, so changing colours, speed, crop or offline state for a picture cannot autosave over the real demo. Stabilization pictures use actual motion analysis of Forest light. The missing-media guide deliberately shows the application's offline card surrounded by the nature project. AI settings use a fictional model ID without an API key, and no model request or paid generation is sent. The layer-import screenshot uses the demo's real SVG title artwork.

JPEGs are saved in `assets/help` and copied into `build/help`. The generated [capture manifest](help-screenshots.json) lists all images. Inspect the welcome page, editor overview, titles, colour wheels, export, recording preview and dialogs at normal reading size after each refresh. `npm run test:help` validates article references, images and Help/Quick Search interactions without requiring the nature videos.
