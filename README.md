<h1 align="center">Reccut</h1>

<p align="center">
  Video editing and screen recording in one app.<br>
  Free and open source, for Mac, Windows and Linux.
</p>

<p align="center">
  <a href="https://github.com/sirbull/reccut/releases/latest"><b>Download</b></a>
  &nbsp;·&nbsp;
  <a href="#install">Install</a>
  &nbsp;·&nbsp;
  <a href="#is-it-safe">Is it safe?</a>
  &nbsp;·&nbsp;
  <a href="#build-from-source">Build from source</a>
  &nbsp;·&nbsp;
  <a href="docs/FEATURES.md">Full feature list</a>
</p>

<p align="center">
  <img src="docs/media/overview.jpg" alt="The Reccut video editor with imported nature footage, a title in the viewer, and video, title and music tracks on the timeline">
</p>

Reccut is a free, open-source video editor and screen recorder for Mac, Windows and Linux. Import video from your camera or phone, arrange clips on a magnetic timeline, mix sound, correct colour and add titles or subtitles. Use it for a short film, an interview, a travel video or a YouTube project.

The built-in screen recorder captures your screen, camera and microphone straight into a project. You can also use **Export** to convert files. Recording and editing run on your own machine and work offline. Optional **AI agents** can edit for you using a model you choose from a cloud provider or a local model server.

## Video editing

<p align="center">
  <img src="docs/media/timeline.jpg" alt="Timeline with colour-coded nature clips, titles above and a music track below">
</p>

Import video, audio and images into a project and build your edit from there. Skim through clips in the media browser, mark the parts you want and add them to the timeline. Video, titles and graphics can sit above the main track, with dialogue, music and sound effects below.

If you use Final Cut Pro, the magnetic main storyline and editing shortcuts will feel familiar. The main track closes gaps as you work, while connected clips stay with the shots they belong to. Use select, trim, position, range and blade tools to make the edit.

- Roll, slip and slide, J- and L-cuts, unlimited video and audio tracks
- Speed changes and speed ramps, reverse, freeze frames
- Keyframes with easing on almost everything
- Stabilization, masks drawn with a pen tool, chroma and luma keying
- Pixelate or blur faces and passwords, and follow them with keyframes
- Audio repair (noise reduction, hum removal, de-esser), EQ, compressor and 30+ presets
- Automatic audio sync with an external recorder
- Subtitles with automatic transcription by Whisper, plus SRT and WebVTT import and export

## Multicam editing

![Four camera angles beside Program, with the active angle outlined in green and the chosen sections on the multicam timeline.](assets/help/multicam-window.jpg)

Import footage from several cameras, line up recordings with shared sound and choose the picture with the number keys while playing or paused. Program starts empty and grows through the sections you choose. Keep a continuous microphone source, adjust its sound and add the result to the Edit timeline. Unfinished edits are saved as local drafts.

The [multicam guide](docs/MULTICAM.md) covers setup, synchronization, camera choices, sound, trimming, I/O ranges, draft recovery, shortcuts and troubleshooting. The same illustrated guide is available in **Help › Reccut Help › Multicam Clips**.

## Screen and camera recording

<p align="center">
  <img src="docs/media/record-gameplay.jpg" alt="Reccut recording gameplay from Echoes of Quite Recent, with the creator on camera in the lower-right corner">
  <br>
  <sub>Playing my own game, Echoes of Quite Recent, with my camera in the corner.</sub>
</p>

Record the whole screen, a single window or a selected area, with your webcam and microphone. You can also record the camera on its own. Use it for a tutorial, a presentation, gameplay or a piece to camera.

When you stop, click **Edit** to open the recording on the timeline. Trim the start and end, cut out a mistake, add subtitles or music, and export. Screen and camera are stored separately, along with the layout and cursor movements, so you can change the camera position or hide overlays after recording.

The camera appears as a separate **PiP** clip on V2, linked to the screen clip on V1. Click PiP and open **Color → Camera Color** to adjust exposure, contrast, saturation and temperature for the camera alone. Linked clips stay in sync when moved, trimmed or cut. Choose **Detach PiP** to edit its timing independently, and reconnect it in **Recording → PiP Connection**. Older combined clips can use **Show PiP on Separate Track**. Adjustments are saved with the project and included in exports.

<p align="center">
  <img src="docs/media/record-gameplay-edit.jpg" alt="The gameplay recording in Reccut’s editor, with a cut and a title on the timeline">
</p>

A global shortcut starts and stops recording from any app. Pause and resume without leaving gaps in the video. A floating control bar shows the recording time and controls without appearing in the recording. Recordings are saved as you go, with recovery after a crash.

**Keystrokes on screen** come from an optional add-on, not from Reccut itself. Reccut never reads your keyboard. To show shortcuts in a recording, open **Record → Overlays → Show keystrokes → Get Add-on**. A dialog explains what the add-on does before anything is downloaded:

- It reads the keyboard for the whole computer while you record, using the same system feature as keyloggers. Security software may warn about it, which is why it is not in the installer.
- Only shortcuts with Ctrl, Cmd, Alt or Win, plus Esc and the F keys, leave the add-on. Normal typing never does.
- The shortcuts are saved in the recording so you can show, hide or cut them in Edit.
- It runs only while you record, and a **Keys** label in the recording controls shows when it is active.

The add-on is a small program built by GitHub from [native/keystrokes](native/keystrokes) and attached to each release with a SHA-256 checksum. Reccut checks the checksum when it downloads the add-on and before every start. Remove it again under **Record → Overlays**.

## One-click background removal and advanced keying

<p align="center">
  <img src="docs/media/chroma-wipe.gif" width="640" alt="Animated before-and-after comparison: the slider moves back and forth between the original green screen and the chroma-keyed result">
  <br>
  <sub>Green screen before and after chroma key. <a href="https://sirbull.github.io/reccut/#keying">Try the interactive slider on the website.</a></sub>
</p>

Click **Remove solid background** to remove a green or blue screen with one click. Reccut samples the background colour from the source frame and applies chroma key automatically. Place the keyed clip over another video or image.

For more demanding shots, adjust **Tolerance** and **Softness**, then open **Advanced** for fine-detail recovery, source-shadow preservation, edge-colour recovery and spill removal. You can also adjust matte black, white and gamma, shrink or expand edges, add feathering and inspect the matte. Start with the automatic result and refine it as needed.

The camera recording is a separate **PiP** clip in Edit. Select it and open **Effects → Keying & effect stack** to remove its background without changing the screen recording. You can also use a mask to keep only the part of the camera image you want. For a static background without a green screen, use **Remove static background** with a fixed camera and steady lighting, or capture a clean background reference.

Draw masks with the pen tool and animate their position or shape with keyframes. Stabilization smooths shaky footage, and effects can be combined with colour correction, titles and speed ramps. Keying and masks are applied in the editor and used in both the preview and export. See [keying and background removal](docs/KEYING-AND-AI.md) for the controls and requirements.

## Titles and lower thirds

<p align="center">
  <img src="docs/media/still-title.jpg" width="49%" alt="Title Into the Wild over a mountain lake">
  <img src="docs/media/still-lowerthird.jpg" width="49%" alt="Lower third Falling water over a waterfall">
</p>

Drop a title on the timeline, type in the inspector and drag it into place in the viewer. The animation in and out follows the length of the clip. There are templates for headlines, title cards, typewriter text, end cards and a range of lower thirds, and you can design your own in After Effects with the included template kit. Photoshop and Illustrator files come in with their layers intact.

## Colour and film looks

<p align="center">
  <img src="docs/media/grade-wipe.webp" alt="A coastal ridge, wiping between the original footage and the Technicolor look">
</p>

Exposure, contrast, temperature, tint and three-way colour wheels, calculated on the GPU in 16-bit float, so 10-bit footage keeps its smooth gradients. On top of that sit more than 40 film looks, from colour stocks like Portra and Velvia to cinema film, black and white, and toned prints.

<p align="center">
  <img src="docs/media/look-velvia50.jpg" width="32%" alt="Waterfall with the Fujifilm Velvia 50 look">
  <img src="docs/media/look-vision500t.jpg" width="32%" alt="Forest with the Kodak Vision3 500T look">
  <img src="docs/media/look-goldenhour.jpg" width="32%" alt="Blossoms with the Golden hour look">
  <br>
  <img src="docs/media/look-portra400.jpg" width="32%" alt="Coastal cliff with the Kodak Portra 400 look">
  <img src="docs/media/look-bleachbypass.jpg" width="32%" alt="River gorge with the Bleach bypass look">
  <img src="docs/media/look-trix400.jpg" width="32%" alt="Beach with the Kodak Tri-X 400 look">
  <br>
  <sub>Velvia 50 · Vision3 500T · Golden hour · Portra 400 · Bleach bypass · Tri-X 400</sub>
</p>

LOG footage from Apple, Sony, Panasonic, Fujifilm and ARRI is converted with one click, or you can load your own `.cube` LUT. HDR clips are recognised and tone-mapped.

## Import formats

These are some of the formats and codecs Reccut can import. Many more are read through FFmpeg. Files that need conversion are prepared in the background for editing.

| | Video | Audio |
| --- | --- | --- |
| **Codecs** | H.264 / AVC, H.265 / HEVC (including 10-bit), AV1, VP8, VP9, ProRes, DNxHD / DNxHR, MPEG-2, MPEG-4, MJPEG, DV, WMV, VC-1 | MP3, AAC, ALAC (Apple Lossless), PCM, FLAC, Vorbis, Opus, WMA, AC-3, E-AC-3, DTS, AMR, APE (Monkey’s Audio), WavPack |
| **File formats and containers** | MP4, MOV / QuickTime, M4V, MKV, WebM, AVI, MXF, MPEG / MPG, TS, MTS / M2TS (AVCHD), VOB, 3GP, OGV | MP3, WAV, M4A / M4B, AAC, FLAC, AIFF / AIF, Ogg / OGA, Opus, WebM audio, WMA, CAF, MKA, AC3 / EAC3, DTS, AMR, APE, WV, AU, W64, RF64 |

You can also import numbered image sequences, camera RAW stills and LOG footage. HDR (PQ and HLG) is tone-mapped to SDR for editing and export. RAW video such as BRAW, R3D, N-RAW, ARRIRAW and ProRes RAW requires the appropriate external decoder; availability depends on the format and platform.

## Export and batch conversion

Export is also a video and audio converter. Drop in files, make smaller copies, change formats or extract audio, without adding anything to an editing timeline. It is included in Reccut, free and open source.

<p align="center">
  <img src="docs/media/export-queue.jpg" alt="The Export tab with a project export and two video conversions running or waiting in the background queue">
  <br>
  <sub>A project export and two file conversions in the same queue.</sub>
</p>

- **Export a project:** click the blue **Export Project** button in the editor (or Cmd/Ctrl+E). The current project opens in Export with MP4/H.264, high quality, and the sequence’s size and frame rate. Review or change the settings, then click **Export Project** in the Export tab to start the job.
- **Convert files:** import or drop video and audio files into Export. Choose settings and convert one file, or use **Convert All** to queue the imported files.
- **Make another version:** change the codec, size, crop, frame rate or quality for a smaller file, a different aspect ratio or an editing master.
- **Background queue:** follow progress, cancel jobs and open finished files while continuing to edit. Existing output files are not overwritten.

<p align="center">
  <img src="docs/media/fmt-169.jpg" height="200" alt="Waterfall in 16:9">
  &nbsp;
  <img src="docs/media/fmt-916.jpg" height="200" alt="Waterfall in 9:16">
  &nbsp;
  <img src="docs/media/fmt-11.jpg" height="200" alt="Waterfall in 1:1">
  <br>
  <sub>The same shot in landscape, portrait and square formats</sub>
</p>

Choose a preset (YouTube, Apple devices, smallest file, master, GIF, audio only) or set everything yourself: size, crop, frame rate, quality and range. Subtitles can be burned in, added as a track, or saved as separate files. Exports run in a queue in the background, and existing files are never overwritten.

| Video | Audio |
| --- | --- |
| MP4 (H.264, H.265/HEVC, AV1), WebM (VP9, AV1), MOV (H.264, ProRes 422), MKV, GIF | MP3, AAC, WAV, FLAC, Opus |

## Voice Over Studio and local AI voices

Record narration or talking-head takes from a script, compare takes and stitch
them into your edit. Use your microphone, Kokoro, language-specific Piper voices,
or expressive VoxCPM2 voices on an Apple Silicon Mac. VoxCPM offers Norwegian,
US English, Swedish, Danish and German, with two voices and ten moods per
language, including Warm and Sensual. Listen before downloading and choose the
packages you need; synthesis runs locally. See the [voice guide](docs/AI-VOICES.md)
and [0.9.3 release notes](docs/releases/0.9.3.md) for setup and known limitations.

## AI agents and model choice

Connect a model in **Settings → AI & Plugins**, import your clips and ask the AI agent to edit them. You can attach a script in the AI chat:

> “Read the script I’ve attached and make a first cut from my camera takes and screen recordings. Use the best takes and show the screen when I explain each step.”

The agent can read the script, transcribe the takes and build a sequence with camera footage, screen recordings, titles and subtitles. Review and adjust the first cut on the timeline; its changes can be undone. The result depends on the model and the material you give it.

Choose a provider and model, and add your own API key. Reccut supports OpenAI, Anthropic (Claude), Google (Gemini), Mistral, OpenRouter and other providers. You can also connect a local model through Ollama, LM Studio or llama.cpp. Choose a model with **tool calling** so the agent can use the editing tools. Cloud models use your provider account; local models run through the server you configure.

AI is optional. Recording, manual editing and export work without it. The agent can also write plugins for you to review and approve. See [model setup](docs/AI-MODELS.md) and [AI, keying and plugins](docs/KEYING-AND-AI.md).

## Open source

Reccut's source code is available under the **MIT licence**. You can build it yourself, change it and contribute improvements. There is no subscription, account requirement or watermark for recording and editing. Bug reports, fixes and documentation contributions are welcome on [GitHub](https://github.com/sirbull/reccut).

## Install

Download the latest version from [Releases](https://github.com/sirbull/reccut/releases/latest): `.dmg` for Apple Silicon Macs, `.exe` for Windows x64 and `.AppImage` for Linux x64. Intel Mac installers are available in earlier releases.

### Is it safe?

Yes. Reccut is not malware. Windows and macOS warn about it because the installer is not code-signed yet. A code-signing certificate costs money every year, and without one the system doesn't know who made the file. The warning does not mean that anything harmful was found.

You don't have to take our word for it:

- **All the source code is public** in this repository. Anyone can read it, search it or have it reviewed.
- **The installers are built by GitHub**, not on a private computer. The [build workflow](.github/workflows/build.yml) builds them from the public code, and the build logs are visible under [Actions](https://github.com/sirbull/reccut/actions).
- **You can build it yourself** from the source code. See [Build from source](#build-from-source).
- **The installer does not read your keyboard.** Keystrokes on screen need a separate add-on that you choose to download.

### Installing despite the warning

- **Windows:**
  1. If your browser says the file *isn't commonly downloaded*, choose **Keep** (in Edge: **⋯ → Keep → Show more → Keep anyway**).
  2. Open `Reccut.Setup.x.y.z.exe`. When the blue window says **Windows protected your PC**, click **More info** and then **Run anyway**.
  3. Reccut installs and starts by itself.
- **Mac:** the first time you open Reccut, macOS says it can't verify the app. Click **Done**, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to Reccut, then confirm with your password.

  If macOS instead says the app is **damaged**, run this in Terminal and open Reccut again:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Reccut.app
  ```

  If Terminal answers *Operation not permitted*, delete Reccut from Applications, run `xattr -d com.apple.quarantine ~/Downloads/Reccut-*.dmg`, and install again from the `.dmg`.

  Allow access to camera, microphone and screen recording. Restart the app after granting access.
- **Linux:** run `chmod +x Reccut-*.AppImage` and start the file. Ubuntu 22.04 and newer need `sudo apt install libfuse2`. If it closes right away with a sandbox error (Ubuntu 24.04), start it with `--no-sandbox`. Cursor zoom needs an X11 session. System audio is not recorded on Linux, and HEVC clips are converted before playback.

Reccut checks GitHub for new versions once a day and can download the installer for you. Nothing is installed until you open it yourself, and the check can be turned off in Settings.

## Build from source

Requires Node.js 20 or newer.

```bash
git clone https://github.com/sirbull/reccut.git
cd reccut
npm install      # also downloads FFmpeg
npm start        # builds the interface and starts the app
npm test         # tests the editing logic
npm run dist:mac # or dist:win / dist:linux, builds an installer
```

`npm start` runs with its own profile (**Reccut Development**), so it doesn't share settings with an installed copy.

To publish a new version, run `npm version <x.y.z> --no-git-tag-version`, commit the changes, tag the commit (for example `v0.9.3`) and push the tag. The workflow in `.github/workflows/build.yml` builds for Apple Silicon Macs, Windows x64 and Linux x64 and attaches the installers and optional add-ons to a draft release. Verify the assets and checksums before publishing the release.

| Folder | Contents |
| --- | --- |
| `src/main` | Electron main process: windows, recording to disk, keyboard hooks, FFmpeg, background jobs, projects |
| `src/shared` | Project model, editing operations and the render engine, shared by preview and export |
| `src/renderer` | The interface in Preact: record, edit, export, the command registry and the help |
| `src/worker` | Hidden windows for export and transcription |
| `assets/template-kit` | After Effects template kit and the `.reccut-title` format |

## Documentation

- **In the app:** Help → Reccut Help (F1) opens the handbook, with search and pictures. It works offline.
- [Full feature list, shortcuts and settings](docs/FEATURES.md)
- [AI, keying and plugins](docs/KEYING-AND-AI.md)
- [Third-party software, licenses and distribution requirements](docs/THIRD-PARTY-LICENSES.md)

## Licence

Reccut is released under the MIT licence.

Reccut includes separately licensed software, model weights and artwork. Open **About Reccut → Third-party licenses** for an offline component list, license texts and upstream links. You can also open the local license files and documentation from that window.

The bundled FFmpeg binaries are GPLv3-or-later; Mediabunny is MPL 2.0. These licenses have source-code and distribution requirements in addition to attribution. See [third-party licenses and distribution requirements](docs/THIRD-PARTY-LICENSES.md) for details, including the work still required before a commercial distribution.
