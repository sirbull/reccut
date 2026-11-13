# Reccut: features, shortcuts and technical overview

[Back to README](../README.md)

Record, edit and export video in one app, for Mac, Windows and Linux. The app is split into four tabs, **Record**, **Edit**, **Export** and **Design** (Cmd 1, 2 and 3 open the first three), which can be used on their own: you can edit without having recorded, and export or convert files without having edited.

## Recording

* Screen at native resolution, **a single app window**, webcam or external camera, internal or external microphone. Audio interfaces and HDMI capture devices such as Elgato Cam Link work too, with input channel, output, camera format and microphone delay in Settings → Audio & Video
* **Start and stop recording**: Control Option 0 (Ctrl Shift 0 on Windows) starts and stops recording. The same keys with 9 pause and resume. By default these keys also work from other apps while the Record room is open. Turn off **Allow shortcuts in other apps** under **Record → Shortcuts** to limit them to Reccut outside a recording. Pauses are removed from the video, and pointer zoom and layout carry over.
* **You can see that you are recording, without it ending up in the video**: a small control bar with time, microphone level, Pause and Stop floats above other apps and is hidden from the recording (macOS and Windows). The menu bar icon on macOS shows a red dot and the time, and on Windows the system tray icon turns red. Reccut can tuck itself away while you record and come back when the recording is saved.
* **Microphone check**: shows whether it is silent, weak, good or clipping, and Test records four seconds and plays them back.
* **Recordings rescue themselves**: they are written to disk as you go (WebM, remuxed to MP4 when you stop), and if the app or the computer crashes, Reccut offers to recover the recording on the next launch, with layout and pointer movement.
* **Record just part of the screen**: choose Area, drag out the area directly on screen (free or locked to 16:9, 9:16, 1:1 or 4:3), or adjust it in the preview. Only the area is saved, and pointer zoom follows the area. A thin frame on screen shows the area and turns red while recording; it sits just outside the area and never ends up in the video.
* **Countdown** of 3, 5 or 10 seconds before recording starts, in the preview and in the middle of the area on screen
* **System audio** with one switch
* The camera image as a circle, square or 16:9, in three sizes
* Eight layouts you switch with a shortcut while recording: 1 camera, 2 screen, 3 to 6 picture in picture in each corner, 7 and 8 camera and screen side by side
* **Magnified pointer:** press the shortcut with M (Control Option M on Mac by default), and the pointer grows with an animation until you press it again
* **Keystrokes on screen with an optional add-on:** Reccut itself never reads the keyboard outside its own window. To show shortcuts in the video, download the Keystroke Add-on under Record, Overlays. A dialog explains first that it reads the keyboard for the whole computer while you record, that only shortcuts with Cmd, Ctrl, Alt or Win (plus Esc and F keys) leave it, and that they are saved in the recording so they can be changed in Edit. It runs only while recording, shows a Keys label in the recording controls, is checked with SHA-256 before every start, and can be removed at any time. It is built from `native/keystrokes` and attached to each GitHub release, never put in the installer.
* **Input overlay for games:** With the add-on installed, choose what to show under Record, Overlays: shortcuts, the left keyboard half or the whole keyboard, mouse buttons and a controller. Show them as keys when you press them, as a live overlay of a keyboard, mouse and controller, or both, and set the overlay's X and Y position in Record and per clip in Edit. Each keyboard mode has its own warning, because it saves those keys in the recording also when you type. With the left half, the right half never leaves the add-on. The whole keyboard leaves out the numeric keypad and keys such as Home and End. Controllers are read with the Gamepad API.
* Screen and camera are saved separately, together with layout and pointer. Everything can therefore be changed afterwards.
* A finished MP4 is made automatically in the background after recording (can be turned off), and the **Edit** button opens the recording in the editor
* Recordings are saved in the Recordings folder of the open project and added straight to the project's library

## Projects and folders

* A new project gets a name and a location, and the app creates its own folder with the project file and the subfolders **Media**, **Recordings**, **Optimized Media** and **Exports**. The first time the app starts, you must create or open a project.
* **Autosave with long history**: the project is saved a moment after every change, safe against crashes and power cuts, and one last time when you quit. In addition, a copy is kept every five minutes and when the app closes, in the Auto-Save folder next to the project. Older copies are thinned out: everything from the last two hours, one per hour for two days, one per day for a month, one per week for a year and one per month after that. **Project History** (Shift Option Cmd H) restores an earlier version, and this can be undone.
* **Project file**: the project is saved automatically as a .reccut file in the project folder. **Save As** (Shift Cmd S) saves it under a new name and location, and a .reccut file can be opened by double-clicking it in Finder or Explorer. The project file remembers files both by full path and relative to the project file, so a moved or copied project folder finds its files again.
* **Video scopes**: optional panel with luma and RGB waveform, RGB parade, histogram and vectorscope. Opened from View → Video Scopes or Cmd/Ctrl+7. Measures the sampled SDR image after color correction and effects. See the [video scopes guide](VIDEO-SCOPES.md).
* **Local AI models and multiple providers**: Ollama, LM Studio, llama.cpp and custom servers, in addition to several cloud services. Fetch model names directly from the server. See [model setup](AI-MODELS.md).
* **Keying and effect stack**: one-click color keying, static background analysis, clean background reference and luma key. Advanced adds spill removal, matte and edge controls. Multiple instances can be moved, duplicated, turned off and combined with masks. The same engine is used in preview and export.
* **AI and Plugins**: an editing agent that cuts stories from a script or brief, removes bad takes, subtitles and translates, color corrects, makes motion graphics and intros, can generate AI video via Higgsfield and can write its own plugins that the user approves. Plugins, including the built-in Higgsfield plugin, open as small tool windows from the Plugins button and can be shared as .reccut-plugin files. It can use OpenAI, Claude, Gemini, Mistral, OpenRouter and other providers, or local models via Ollama, LM Studio and llama.cpp. Local processing tools can be installed via a manifest. Native OFX/Adobe and direct CorridorKey integration are not implemented yet. See [usage and limitations](KEYING-AND-AI.md).
* **Package Project** (Option Shift Cmd P), like Collect Files and Reduce Project in After Effects: the project file and ALL the files it uses are copied to one folder (Footage, Recordings and the project file), so the folder contains everything needed to open the project on another machine or many years from now. Before packaging you can remove unused media, clips that are turned off (they become gaps in the primary storyline, so nothing shifts), audio that is turned off in all clips and clips on hidden tracks, choose whether optimized media is included, and trim regular video and audio files to the parts in use with optional handles on each side. Recording folders and still images are copied whole; trimming re-encodes at high quality. The window shows the number of files and their size and warns about missing files. Packaging runs in the background, checks free space and that each copy is complete, and writes a Package Report.txt listing everything that was copied and removed. The open project is not changed.
* On import you choose **Copy to project folder** or **Leave files in place**. The choice is remembered and also used when you drag files in.
* The open project is shown at the top of the window. Click it to open other projects, show them in Finder or Explorer, remove them from the list or move them to the trash.
* **Optimize Media** (Option Cmd O, also as an option on import) converts clips to a format that is easy to edit: H.264 with short GOP for 8-bit, and 10-bit VP9 for 10-bit and HDR. It runs in the background with progress at the top of the window.
* **HDR** (PQ and HLG) is detected on import and shown tone mapped to SDR, with 10 bits in the working copy. HDR export is not supported yet.
* **LOG and LUT**: Camera LUT in the Info tab converts Apple Log, S-Log3, V-Log, F-Log and LogC3 to normal colors, or applies a .cube file. Applies to all clips from the file, in the viewer and in export.
* **Image sequences**: numbered images (render_0001.png …) become one video clip with a chosen frame rate, selected in the import window.
* **RAW video** is decoded with the manufacturer's software when it is installed, and becomes ProRes 4444 on import: Blackmagic RAW (its own helper, `native/braw`, built with `node scripts/build-braw.mjs` when the SDK is installed), R3D and N-RAW (REDline from REDCINE-X PRO), ARRIRAW (art-cmd) and ProRes RAW on Mac (avconvert). If the software is missing, the user gets a link and Locate. Canon Cinema RAW Light has no decoder others can use.
* **RAW photos** (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2 and more) are imported using the camera's embedded full-size JPEG, with the correct orientation. The RAW data itself is not developed, and RAW video (BRAW, R3D, ProRes RAW) is not supported.
* **Media Offline**: if a file is missing (moved, renamed or on a disk that is not connected), a test card in the style of the old NRK test card is shown, with the file name at the top and MEDIA OFFLINE at the bottom. The card is drawn for the project's format, so the circle is always round, and it is also used in export. The app checks again when the window gets focus, and **Relink File** (right-click in the library or Option Cmd L) points the media to a new file without losing the edit.
* Badges in the library show HDR, 10-bit, RAW, optimized media and synced audio. The Info tab shows which file is used for playback.
* **List and icon view in the library**: besides the filmstrips (the default), the media can be shown as icons or as a list with duration and format. Click a clip to show it in the viewer, scrub on the bar under the picture, mark with I and O, and drag the picture to the timeline.

## Performance and updates

* **Long projects**: changes use structural sharing, so only what changes is copied, and a time index means playback, export and audio mixing only look at the clips near the playhead. The timeline only creates components for what is visible. Measured with 3,100 clips over two and a half hours: an edit takes 5 ms (previously 27 ms), and lookups for video and audio 0.05 and 0.03 ms (previously 1.3 and 1.8 ms), which also makes exporting long projects much faster.
* **Works fully offline.** When online, Reccut checks Releases on GitHub for new versions once a day, and can download the installer for your machine to Downloads. Nothing is installed until you open the file yourself. Help, Check for Updates checks right away, and the automatic check can be turned off under Settings.
* **New version on GitHub**: bump the version in package.json, create a tag like `v0.3.0` and push it. The workflow in `.github/workflows/build.yml` builds for Mac (Apple Silicon and Intel), Windows and Linux and attaches the files to a release, and the app finds it automatically.

## Editing

* Magnetic primary storyline like in Final Cut Pro, with connected tracks above (images, video, titles) and audio tracks below (music, sound effects)
* **Override Connections**: hold **Tab** while dragging, trimming, rolling or sliding a storyline clip, and the connected and grouped clips stay where they are. Tab is on every keyboard, unlike the grave key Final Cut Pro uses. Pressing or releasing Tab mid-drag updates the timeline at once.
* Tools like in Final Cut Pro: **Select (A)**, **Trim (T)** with roll at shared edges on every video/audio track and the captions track, slip inside media clips (the pointer shows back to back brackets with arrows) and slide with Option on the main storyline, **Position (P)** which moves clips and leaves gaps, **Range (R)**, **Blade (B)**, **Zoom (Z)** and **Hand (H)**. Rolling keeps the pair's outer edges and combined duration unchanged. The pointer shows what will happen.
* **Skimming**: hover over the timeline or a clip in the library, and the viewer shows the frame under the pointer, with audio played in short snippets. **S** turns skimming on and off, **Shift S** turns skimming audio on and off, and **N** turns snapping on and off, like in Final Cut Pro.
* **The library as filmstrips, like in Final Cut Pro**: each clip is shown as a filmstrip with frames and waveform. Skim over the clip and press I and O to mark a range (or drag across it), X marks the whole clip. Add the range with E, W, Q or D, or drag the yellow range down to the timeline. The edges of the range can be dragged. Row sets how much time each row shows (the whole clip down to 5 seconds), so long clips wrap over several rows, and Height makes the frames bigger or smaller.
* **Speed**: 10%, 25%, 50%, 2x, 4x, 8x, 20x or a custom value, with an option to preserve pitch. **Freeze frame** with Option F.
* **Reverse** (Reverse Clip): a reversed copy is made in the background, so playback is smooth. The export is reversed with audio.
* **Play backwards**: Shift Space, J or the button next to the play button plays the timeline backwards. If the clip has a reversed copy, it is used, so video and audio play smoothly.
* **Speed ramps** like in Final Cut Pro: Ramp to 0%, Ramp from 0%, Slow Down in the Middle, Speed Up, Slow Down and Speed Burst, or a custom start and end speed. The curve is shown in the inspector.
* **Multiple tracks**: video tracks above the primary storyline (V2, V3 and so on) and audio tracks below (A1, A2 and so on), with track headers for hide, mute and lock, and buttons for adding tracks. Drop a clip on the empty track at the top or bottom to create a new one.
* **Expand audio** (Control S, Alt E on Windows) shows the audio separately below the video, so the edges can be dragged for J and L cuts. **Detach audio** (Control Shift S, Alt Shift E) makes separate audio clips.
* **Automatic audio sync** (Auto Sync Audio): place an audio recording from an external microphone under the timeline, right-click and choose Auto Sync Audio (Option Cmd G). The app compares the audio with the audio in the video clips and places the recording right under the video it belongs to. If the audio clip is longer than the video, it is trimmed; if it is shorter, it is just placed in the right spot. If it fits under several clips, you get a choice: sync with the first clip, or split it and place a piece under each clip. The audio can be grouped with the video and the camera audio muted automatically (the choices are remembered, and are also in Preferences). If you also select video clips, it only syncs against those.
* **Color labels**: select one or more clips, right-click and choose a color under Color (red, orange, yellow, green, blue, purple, pink, brown or gray), or use Control Option 1 to 9 (Ctrl Shift Alt 1 to 9 on Windows). Control Option 0 removes the color. Applies to both video and audio, including the audio part of an expanded clip.
* **Track height like in Premiere Pro**: drag the bottom edge of the track header at the far left to make the track taller or shorter. Shift changes all video or audio tracks, double-click resets, and Option (Alt) with scrolling over the track header does the same. The height is saved in the project.
* **Clips being analyzed** get moving turquoise stripes and a progress bar at the bottom, so you can see the machine is working (stabilization, optimized media and reversed copy). Turquoise is never used as a color label.
* **Group clips** (Cmd G): any kind of clip can be grouped, including titles, lower thirds, subtitles and redactions together with video and audio. When the video moves, the rest of the group follows, including clips that start before the video. If you group a clip that is already in a group, the groups are merged. A click selects the whole group, Option click or double click selects one clip, as if you were inside the group. Shift Cmd G ungroups. Grouped clips have a link badge.
* **Multicam clips**: select clips from several cameras on top of each other, right click and choose Create Multicam Clip, or choose File › New Multicam Clip and pick the files. The window shows all angles at once and the program that goes on the timeline, with a green frame on the active angle. Auto Sync lines the angles up by their audio and says which angles could not be synchronized and why. Press 1 to 9 (or click an angle) to cut while the video plays; Shift switches without cutting. The timeline at the bottom has the angles as tracks 1, 2, 3, with zoom, skimming, snapping, trim and blade. Add to Timeline places the result as a group with an MC badge; double click to edit the clips inside, Cmd double click (or Edit Multicam Clip) to switch angles again. The file list has list, icon and filmstrip views. Audio recorded separately (A1, A2) goes under the cameras and is used for the sound; you can also choose which camera the sound comes from. Under Properties each sound source has Level, Channels (left only, right only, swap or mono), Gain, EQ with Bass, Mid and Treble, Remove rumble and Reduce noise, all set by hand and carried to the timeline as the clip level and audio effects. Properties also sets which camera to fall back to when the chosen camera has no picture, or to leave a gap. The sound in use lies at the top of the multicam timeline with a yellow level line you drag, and Option click adds keyframes; they follow to the timeline. Tracks can be reordered by dragging their headers and made taller by dragging their bottom edge. Files and Properties can be hidden with the same buttons as in Edit. Cameras can be added later by dragging a file to the New camera track, and right click › Synchronize to Audio lines up a single file. The camera views always form an even grid, with empty views showing the Reccut R. AI Clean Voice can be turned on for the sound in Properties, the same noise removal as in the Audio tab. Right click › Active Video Angle and Active Audio Angle change the camera or the sound by hand, both in the multicam window and on a multicam clip in the Edit timeline.
* **Sync in the library**: select video clips and audio files (everything with Cmd A works fine) and choose Synchronize Audio (Option Cmd G). The audio is merged into the videos as an extra audio track, and the camera audio is turned off but kept. When the clip is dragged to the timeline, it has both audio tracks, and you choose which one to use.
* **Voice Over Studio** (Option Cmd B, or **Voice Over Studio** in the Edit toolbar, or the headset and microphone button in the timeline toolbar): records narration or a talking head line by line from a script, in its own window over the editor ([src/renderer/voiceover](../src/renderer/voiceover), logic in [src/shared/voiceover.js](../src/shared/voiceover.js)).
  * **Script**: Typeloom, Word, PDF, Markdown, text, Fountain, Final Draft and RTF, read with the same reader as the AI chat, or written and pasted. Typeloom binder folders become sections and the corkboard synopsis becomes a note that is not read. Screenplays show the character and the parenthetical. Split into paragraphs, sentences or lines. The current line is highlighted and kept a third down, like a teleprompter, with a prompter view (M), text size and mirroring. The script is also added to the project story for the AI agent.
  * **Keys**: Space records and keeps, R discards and starts the line again at once, Esc discards, Backspace marks the last take as bad and goes back to it, arrows move between lines (Shift between sections), N finds the next line without a take, P plays and S stars the chosen take, Cmd Return stitches.
  * **Takes**: all takes are kept per line. The chosen take is the one clicked, else a starred one, else the latest. Takes follow their line when the script is edited (keyed by the words). Optional count in and a cue that plays the end of the previous line.
  * **Automatic trimming**: each take is trimmed where the voice starts and ends (RMS envelope, noise floor from the quietest part or from room tone, soft onsets kept), with adjustable air before and after. Clipping and takes without a voice are flagged. Room tone (5 s) sets the noise floor and fills the pauses. The first time the studio opens in a project, it asks for room tone: one click, a countdown from 3, and it records 5 seconds and stops by itself. A room tone with a voice or knock in it is rejected with a prompt to try again, and the step can be skipped. New room tones can be recorded at any time (New at the top, or New Room Tone in the side panel). All are kept in `voiceover.roomTones`, and the one in use is chosen from a menu at the top or the list in the side panel.
  * **Recording**: 24-bit WAV from an AudioWorklet, without echo cancellation, noise suppression or auto gain, with input channel choice and a meter with a -12 to -6 dB target. With Camera on, takes are WebM with picture and sound. Files go to Recordings/Voiceover in the project folder.
  * **Studio timeline** ([VoTimeline.jsx](../src/renderer/voiceover/VoTimeline.jsx), playback in [preview.js](../src/renderer/voiceover/preview.js)): the plan as it will be stitched, with waveforms, pauses and a playhead. Shift Space plays it with Web Audio, with room tone in the pauses. Select a clip to trim by dragging the edges, drag fade handles, and set volume (with Normalize to -3 dB), fades, pause after (manual or Auto from the script) and exact start and end. Delete (Backspace) leaves the line out (`voiceover.skip`) but keeps the takes; Restore Deleted brings them back. Volume and fades are carried to the clips when stitching.
  * **Sound**: each person has an effect chain (`voiceover.people[].fx`) and volume, with **Studio Voice** (new template in [audiofx.js](../src/shared/audiofx.js)) as the default. The chain uses the same editor as clip Audio Effects ([AudioFxChain.jsx](../src/renderer/editor/AudioFxChain.jsx)): add, toggle, reorder, adjust and remove effects. It is heard live in the studio timeline (same AudioWorklet as playback and export) and copied to the clips when stitching.
  * **People**: Add Person creates another voice with its own track, takes, choices, deletes and sound. Lines share slots in script order (`planStudio`), so two readings of the same line line up for comparison and a dialogue interleaves. Mute (all clips on the track are disabled but keep their place; the button lights up), solo, hide, rename and remove per track. V disables the selected clips (`take.disabled`), and Shift V disables every other clip; both keep the timing and are stitched as disabled clips. Record as chooses the person; lines with a role switch to the person with that name. Each person is stitched to their own track.
  * **Pauses**: the default space after a sentence, after a paragraph and before a section is set in Pauses above the studio timeline, in the side panel and in Settings → Editing → Voice Over Studio (with air before and after), stored in the `voPacing` preference ([Pacing.jsx](../src/renderer/voiceover/Pacing.jsx)). A clip can have its own Pause after; Default goes back, Use for all makes it the default for that kind, and Clear own pauses resets every clip.
  * **AI voices**: AI Voice adds a person read locally by VoxCPM2, Kokoro or Piper. Kokoro-82M uses [src/main/tts.js](../src/main/tts.js), worker [src/worker/tts.js](../src/worker/tts.js), voices and text in [src/shared/tts.js](../src/shared/tts.js). The language is chosen per AI person and suggested from the script (`detectLanguage`). 41 voices are made for English (US and UK), Spanish, French, Italian, Brazilian Portuguese and Hindi; Norwegian, Swedish, Danish, German, Dutch, Finnish, Polish and Portuguese (Portugal) are pronounced by eSpeak and read by a voice from another language (with an accent), with sounds the model lacks mapped to the nearest (`nearestSounds`). Listening, speed and quality grades. Download and removal are also in Settings → AI. Nothing is downloaded until asked (about 116 MB, pinned revision, SHA-256 per file). The pronunciation add-on (phonemizer.js with eSpeak NG, GPL) is downloaded from npm and checked against its sha512, never packed into the installer. Space plays the studio timeline; R reads the selected line, Shift R reads it again, and Read All Missing Lines reads the rest. Say it as overrides the text per line for pronunciation. AI takes are WAV takes like any other and start without effects.
  * **Voices made for each language** ([src/renderer/voiceover/piper.js](../src/renderer/voiceover/piper.js), catalogue in `ttsCatalog.json` under `piper`): 19 Piper voices with open licences (CC0, CC BY 4.0, Apache 2.0) for Norwegian (Talesyntese, and NVCC with ten speakers), Swedish, Danish, German (Thorsten, Kerstin, Thorsten with eight emotions), Dutch, Finnish, Polish, Spanish, French, Italian and Portuguese. Each is downloaded on its own (63 to 77 MB, pinned revision, SHA-256) and shares the pronunciation add-on with Kokoro, so Kokoro is not needed for them. The worker runs them with ONNX Runtime Web: eSpeak IPA mapped through the voice's own phoneme_id_map with Piper's start, pause and end symbols. Voices with AGPL, unclear or non-commercial licences are left out.
  * **Expressive VoxCPM2 voices** ([guide](AI-VOICES.md), [implementation](plan-voxcpm2.md)): Apple Silicon Macs have two synthetic voices each for Norwegian Bokmål, English (US), Swedish, Danish and German. All ten choices are shared across languages: Neutral, Intense, Angry, Sad, Warm, Sensual, Cheerful, Confident, Reassuring and Whispering. One approximately 3.55 GB model is shared by the small language reference packages. The separate engine and references are downloaded from the matching Reccut release, checked against hashes and never included in the installer; all 100 OGG previews are included for listening before download. Mood is saved per AI person and affects new takes, with no speed slider. The model is reused between sentences/jobs, released after 60 seconds idle and stopped on cancellation. The first voice set has accepted quality limitations, including a known Norwegian male pronunciation issue; Windows/Linux and Intel Mac VoxCPM support remain deferred.
  * **Shared Voice Packages chooser**: first studio opening, Settings → AI and missing-voice flows use one searchable package list with use, size, license, samples and explicit Download selected. Shared dependencies are counted once; status, selection and listening do not download models. Cancel/resume, individual language removal and optional shared-model removal are supported. Kokoro and Piper keep their existing speed and speaker settings.
  * **Voice styles** ([src/shared/voiceStyles.js](../src/shared/voiceStyles.js)): 17 ready made styles, dark, neutral and bright, cinematic, natural, calm and energetic, female and male, such as Trailer, Deep Narrator (the capture-the-flag voice: bm_lewis at 0.88, unprocessed), Documentary, Noir, Epic, Velvet, Storyteller, Clear Guide, Newsreader, Bright Explainer and Upbeat Host. A style is a Kokoro voice or a blend of several (style vectors mixed by weight, `bm_lewis:0.55,am_fenrir:0.45`), a speed and an effect chain (warm, broadcast, bright, cinematic with compression and a touch of hall, noir). Filter by tone, character and gender, and listen with the effects before adding.
  * **Stitch**: the chosen takes are placed in script order with pauses that follow the structure (sentence, paragraph, section). Voice goes on one free audio track, grouped, with room tone under the pauses. Talking head takes go into the storyline back to back, with the pause taken from the take's own sound. Stitching again replaces the previous stitch in the same sequence. The studio state lives in `project.voiceover` and is not part of undo, like designs.
* **AI models are downloaded when needed** ([src/renderer/AiModels.jsx](../src/renderer/AiModels.jsx)): no model weights are in the installer (Whisper, BiRefNet and Kokoro were about 350 MB together). At first start, after the project is chosen, a window lists the AI features (captions and transcripts, remove backgrounds, AI voices), says what each is used for and how large it is, and suggests Whisper Base and the background model that suits the computer. A feature that needs a missing model opens the same window focused on it (`MODEL_MISSING:<kind>`), and Settings → AI has Choose AI Models. Downloads are pinned and checked with SHA-256 ([src/main/modelPacks.js](../src/main/modelPacks.js) for background models), and the model licenses are kept in `assets/licenses` so the license reader works without the weights.
* **Record Audio** (Shift Option Cmd R, or the microphone in the timeline toolbar): a small window with an Input menu for the microphone and a Rec button. The recording is saved as 24-bit WAV in Recordings/Audio and added to the Media browser (Audio 1, Audio 2 ...), without script, countdown or trimming ([src/renderer/voiceover/quick.js](../src/renderer/voiceover/quick.js)).
* **Stereo or mono per audio source**: Channels in the Audio tab mixes a source down to mono, in playback and export. A recording input can also be set to mono in Settings → Audio & Video.
* **Audio components**: a clip can have several audio tracks (camera audio, external recorder, microphone and system audio). Turn them on and off in the Audio tab, in the right-click menu, or click a track in expanded audio and press V. A track that is off stays in place, grayed out.
* **V** turns a clip on and off. The clip stays on the timeline, but grayed out.
* **Shift V** does the opposite: every clip except the selected ones is turned off, and the selected ones are turned on. Press it again to turn the others back on.
* **Audio effects and repair**: a separate tab in the library (Shift Cmd 6) with presets and individual effects, which are heard immediately during playback and are identical in export (the same code in both). Repair: High Pass, Hum Removal (50 and 60 Hz), Noise Reduction (learns the noise from the pauses), Noise Gate, De-esser and Auto Level. 10-band equalizer with a curve and presets, Low Pass and Band Pass. Compressor, Limiter, Gain, panning and stereo width. Reverb and Echo. Distortion, Bitcrusher, Lo-fi Tape with wow, hiss and crackle, Chorus, Flanger, Tremolo and Robot. Over 30 presets, including Voice Clean Up (Option Cmd A), Podcast Voice, Telephone, Walkie-Talkie, Old Radio, Megaphone, Vinyl Record, 8-bit, Underwater and Cathedral. The effects sit in a chain in the Audio tab and can be turned on and off, reordered and removed.
* **Paste Effects and Paste Attributes** like in Final Cut Pro: copy a clip (Cmd C), select other clips and press Option Cmd V to paste all effects, or Shift Cmd V to choose in a dialog with video and audio attributes (effects, color, transform, crop, mask, stabilization, fades, volume and audio effects). Keyframes come along, with the same timing or stretched to the new clip. Remove Effects (Option Cmd X) and Remove Attributes (Shift Cmd X) remove them again.
* **Audio crossfade**: select two audio clips next to each other and press Cmd T. The default length (1 second) is set in Preferences (Cmd ,).
* Overwrite (D), Lift from Storyline (Option Cmd Up), Overwrite to Storyline (Option Cmd Down), Insert Gap (Option W), Solo (Option S) and Select Clip (C)
* **Eats almost anything, like VLC**: MP4, MOV, MKV, WebM, AVI, WMV, FLV, MPEG 1 and 2, MXF, DV, 3GP, OGV, Y4M, MPEG-TS, M2TS and AVCHD (.mts) from cameras, and raw H.264 and HEVC streams. Codecs such as ProRes (including 4444 with alpha), DNxHD and DNxHR, H.264 and HEVC in 10-bit and 4:2:2, AV1, VP9, FFV1, MJPEG and Theora. Audio in WAV, AIFF, FLAC, MP3, AAC, ALAC, Ogg, Opus, WMA, AC3, E-AC3, DTS, AMR, CAF, WavPack, TTA, Speex and more. Images in JPEG, PNG, GIF, WebP, HEIC, JPEG XL, AVIF, TIFF, TGA, EXR, HDR, DPX, JPEG 2000 and QOI. Animated GIF and WebP become video. Anything the app cannot play directly is converted in the background: interlaced video is deinterlaced, video with alpha keeps its transparency, and damaged files are read as far as possible (with a second, error-tolerant pass if the first attempt fails). If FFmpeg cannot open a TS or AVCHD file, the app unpacks it itself. Tested with 70 different files.
* Trim, cut, move, copy and paste, turn clips on and off, undo and redo
* **Keyframes with smooth easing** (Linear, Ease In, Ease Out, Ease In and Out, Hold) on opacity, position, scale, rotation, color, effects and volume. The diamonds on the clip can be dragged, and right-click lets you choose the easing.
* **Expressions** on every value with a keyframe diamond: Wiggle, Oscillate, Pulse, Rotation, Drift, Bounce, Ramp and Flicker, with Amount, speed, phase and random seed. Hold Option/Alt over a value's name or diamond (the pointer shows ƒx) and click to open the controls. The expression is added on top of the value and its keyframes, follows the clip when it is moved or trimmed, and is identical in the viewer and in export. See Help › Expressions.
* **Animation presets**: Fade In, Fade Out, Slow Zoom In and Out, Slide In from three edges, Pop In and Spin In
* Drag clips, titles and subtitles directly in the viewer to position them
* **Effects**: Blur, Vignette, Sepia, Black & White, Invert, Hue Shift, Rounded Corners, Drop Shadow and Border
* **Redaction** of passwords, faces and license plates: Pixelate (Option P), Blur (Option Shift P), Solid and Frosted. The redaction is a separate clip above the video and affects everything below. Move and resize it directly in the viewer, or draw a new area. Shape (rectangle, rounded, ellipse or freeform with points), strength, soft edge, rotation, Whole blocks at edge (Pixelate keeps the blocks along the edge whole instead of cutting them, also with masks) and Redact outside (everything outside the area is hidden). Position, size and the points of a freeform shape can be keyframed, so the redaction can follow something that moves and change shape. Identical in the viewer and in export.
* **Highlight Area** (Effects › Highlight): draw a box or circle over something important in the viewer. An outline draws itself around the area from the top left corner, then the area grabs the picture and zooms in (Magnification) with an ease in and ease out, while the rest of the picture darkens and blurs. Near the end of the clip it plays backwards, so the clip length decides how long it is shown. Square with adjustable rounded corners or circle; drag in the viewer to draw an oval or a rectangle (Shift for a perfect square or circle, Option/Alt to draw from the center), and rotate with the round handle. Settings for animation time, darkening, blur, outline on or off with color and thickness, and drop shadow on or off with size, strength (how hard the edge is), opacity, angle and distance. Can follow a track like a redaction. Identical in the viewer and in export.
* **Tracking**: follow something that moves in a video or screen recording, and attach a redaction, title, image or video to it. Select the video, put the tracking area over the object and press Track Forward; the track is saved on the clip, so you can attach clips later. Under Follow Track, choose Live (the clip always follows the track as it is now, and its own position becomes its place relative to the object) or Keyframes (position, rotation and size keyframes you can adjust, with a button that removes only the tracking keyframes). Rotation and scale (experimental, follows the object coming closer or moving away) can be turned on and off. Attached clips are grouped with the video, so they move together. For a redaction, Track Forward tracks what it covers and attaches it in one step. Works on moved, scaled and stabilized video, identical in the viewer and in export. The AI agent can do all of this too, for example "blur the face of the woman in the pink shirt".
* **Full-frame effects**: Blur, Pixelate and Frosted Glass cover the whole frame like an adjustment layer, and a mask drawn with the pen decides where they apply. This gives you full manual control over redaction.
* **The pen** (Option Cmd M), like in Premiere Pro: click points in the viewer, drag a little for smooth curves, and close with a click on the first point, a double-click or Return. Backspace removes the last point.
* **Masks** on video, images, recordings, titles and effect clips: rectangle, ellipse and freeform (Option M and Option Shift M). The shape is edited directly in the viewer: drag to move, drag the handles to resize, and in a freeform shape you drag the points, double-click the edge to add a point and Option click to remove one. Multiple masks can be added, subtracted or intersected, and each can be inverted, feathered (Feather), expanded or contracted (Expansion) and given transparency. Everything can be animated with keyframes, including the whole freeform shape (point by point, like rotoscoping). The mask follows the clip when it is moved, scaled or rotated.
* **Stabilization** (Shift Option S or Stabilize in the Video tab), like in Final Cut Pro: camera motion is analyzed in the background (hundreds of points are tracked from frame to frame, and subject motion is filtered out), and the shake is smoothed out. Choose Automatic, Smooth or Tripod, adjust X, Y and rotation separately, and let the zoom hide the edges automatically or set it yourself. The same correction is used in the viewer and in export. The analysis can also run on import.
* **Color correction**: ready-made looks, exposure, contrast, highlights, shadows, saturation, temperature and tint, and color wheels for shadows, midtones and highlights. Computed on the GPU in 16-bit floating point, so 10-bit clips keep smooth gradients. The same computation is used in the viewer and in export.
* **The inspector like in Final Cut Pro**: select a clip, and its properties are shown on the right, with icon tabs for Text, Video (position, scale, rotation, crop, animation and fades), Color, Effects, Audio, Speed and Info. Info shows the clip, the file (format, size, bitrate, recording time, camera) and the video and audio in it. Audio shows levels with peak and average, audio tracks, volume, fades and the audio format.
* **Titles** from templates (Title, Headline, Title Card, Boxed, Typewriter, End Card, Chapter) with in and out animation, all system fonts, color, position and size
* **Lower thirds** with animation: Bar, Line, Box, Split, News Band, Minimal, Tag and Right Corner. Type the name and title in the inspector, and the lower third animates in at the start and out at the end of the clip; its length on the timeline decides how long it stays. Colors, font and animation length can be adjusted, and the box grows with the text.
* **Your own templates from After Effects**: Get the Template Kit (Help menu) gives a script that creates a lower third in After Effects, and one that exports the composition to a `.reccut-title` file. The format is open JSON and documented in the kit, so templates can also be made by hand or with other tools. Imported templates are saved in the project.
* **Photoshop and Illustrator with layers**: import a PSD or PSB (or SVG from Illustrator) and choose which layers to include, as separate images stacked and grouped on the timeline, or as one flattened image. The layers are placed in the project's Media folder.
* **Transitions**: Cross Dissolve, Fade to Black, Fade to White, Push in three directions, Wipe, Circle Reveal, Zoom and Blur. Push, Wipe, Circle Reveal and Zoom can have motion blur
* All titles, transitions and effects have a live preview in the library (hover over them), drawn with the same engine as export
* **Subtitles**: one to three lines, left, centered or right, placed at the top, middle, bottom, freely with X and Y, or dragged in the viewer. Font, size, weight, text color, outline color and outline width, background with color and transparency, and shadow. Import and export of SRT and WebVTT, and automatic subtitling with Whisper.
* Recordings can be adjusted afterwards: camera on or off, switch layout at the playhead, shape and size, magnified pointer, and audio level for microphone and system audio separately
* **Project templates**: Automatic, YouTube 1080p and 4K, Shorts/Reels/TikTok, Square, Instagram Feed, Tutorial (with title card and lower third) and Cinematic. Format and frame rate can be changed freely in the project settings, including to custom values. With Automatic, the sequence takes the format of the first clip, and Sequence Settings (Cmd J) opens so you can keep it or choose something else.
* Waveforms, thumbnails, markers, in and out points, and autosave (also when the app closes right after a change)

## Export

The Export tab takes either the project or files you import directly, to convert them without going through the editor. Multiple files can be converted with the same settings at once. **Export Project** in the editor (Cmd/Ctrl E) opens the project in the Export tab with MP4/H.264, high quality and the sequence's resolution and frame rate. A marked range on the timeline carries over. Adjust the settings and press **Export Project** in the Export tab to start the job.

* Presets (Standard, YouTube and web, Smallest file, Apple devices, Master, GIF, Audio only), and every value can be overridden
* Size: original, 4K, 1440p, 1080p, 720p, 480p or custom width and height, with aspect ratio lock
* Fitting when the format changes: fit (black bars), fill (crop) or stretch
* Crop: 16:9, 9:16, 1:1, 4:5 or free, with a frame you drag in the preview or exact values in pixels
* Frame rate: same as source, common values or custom
* Quality: low to max, or a custom video bitrate in Mbit/s, and an optional audio bitrate
* Range: whole or custom from and to, with a button to use the playhead
* Subtitles burned into the image, as a separate track in the file (can be turned on and off in the player), as a separate SRT or WebVTT file, or combinations
* Export queue with progress. Existing files are never overwritten.

| Video | Audio |
| --- | --- |
| MP4 (H.264, HEVC, AV1), WebM (VP9, AV1), MOV (H.264, ProRes 422), MKV, GIF | MP3, AAC (M4A), WAV, FLAC, Opus |

## Trackpad and mouse

* Two fingers sideways move along the timeline, two fingers up and down scroll between tracks, like in Final Cut Pro. This also works over the track headers on the left.
* Pinch zooms in and out, and the point under the pointer stays where it is.
* With a mouse: the scroll wheel scrolls up and down, Shift and the scroll wheel scrolls sideways, and Ctrl or Cmd and the scroll wheel zooms one step at a time.

## Settings

Settings (Cmd ,) is built like in Final Cut Pro, with tabs at the top:

* **General**: location for new projects, open the last project on launch, check for missing media, and reset everything
* **Editing**: default lengths for transitions, crossfades, images, titles and freeze frames, snapping, and moving the playhead to the end of added clips
* **Playback**: skimming, viewer quality (better performance draws the viewer at half resolution), loop playback and pitch when speed changes
* **Import**: copy or leave files in place, optimized media and stabilization analysis
* **Audio**: the options for automatic sync
* **Export**: the project's Exports folder or another folder
* **Keyboard**: change the shortcut for any command. Search, click the key and press the new one. If the key is in use, the app tells you by which command, and you choose whether to reassign it. Reset one or all to default, and export or import the shortcuts to a file. The menus, the search and the help always show your own keys.

## Help, search and shortcuts

**Help → Reccut Help** (F1) opens a separate handbook with 74 articles, pictures, practical examples and full-text search. The help can sit next to the editor and works offline. It also covers AI setup, local models, plugins and troubleshooting. Commands and custom shortcuts are pulled from the app.

* Every tool and feature has a shortcut, and all are listed in the menus with the key next to them. The menus, the keys, the search and the shortcut list are built from one list in the code (`src/renderer/registry.js`), so they always match each other.
* **Ctrl Space** opens quick search, like FX Console: type the name of an effect, a tool, a transition, a title, a look, an animation, a setting (for example Exposure or Volume), a command or a media item, and press Enter. Effects and looks are applied to the selected clips, settings open in the inspector with the number field ready, and whatever was changed or opened flashes briefly so you can see where it is. Also works while you are typing in a field. Cmd K (Ctrl K) and the question mark at the top open the same thing. On Mac, the Help menu also has the standard search field that finds menu items.
* **F1** opens the help with articles and pictures for every part of the app, and a search that finds both articles and commands. Buttons in the articles run the command they describe.
* **Option Cmd K** shows all shortcuts, grouped by menu.


### Recording

By default the recording shortcuts also work from other apps while the Record room is open. These key combinations can override shortcuts in other apps. Turn off **Allow shortcuts in other apps** under **Record → Shortcuts** to limit them to Reccut outside a recording. During recording, the shortcuts always work in the background. Input fields and dialogs in Reccut keep their keys. The floating recording controls and the menu icon can always be used to pause and stop.

| Action | Mac (default) | Windows (default) |
| --- | --- | --- |
| Layout 1 to 8 | Ctrl Option 1 to 8 | Ctrl Shift 1 to 8 |
| Start and stop recording | Ctrl Option 0 | Ctrl Shift 0 |
| Pause and resume recording | Ctrl Option 9 | Ctrl Shift 9 |
| Magnify the pointer on and off | Ctrl Option M | Ctrl Shift M |

### Editing (like in Final Cut Pro)

| Key | Action |
| --- | --- |
| Space | Play or pause |
| Shift Space | Play backwards |
| J, K, L | Play backwards, stop, play forwards (press repeatedly for faster) |
| Left and right arrow | One frame (with Shift: ten frames) |
| Up and down arrow | Previous or next edit |
| A, T, P, R, B, Z, H | Select, Trim, Position, Range, Blade, Zoom, Hand |
| S, Shift S, N | Skimming, skimming audio, snapping |
| D, C | Overwrite at the playhead, select the clip under the playhead |
| Cmd R, Option Cmd R | Speed, normal speed |
| Option F, Option W, Option S | Freeze frame, insert gap, solo |
| Control S, Control Shift S | Expand audio, detach audio (Alt E and Alt Shift E on Windows) |
| Option Cmd Up and Down | Lift from storyline, overwrite to storyline |
| Cmd G, Shift Cmd G | Group clips, ungroup |
| Option Cmd G | Sync audio (in the library and on the timeline) |
| Option Cmd O | Optimize media |
| Option R | Play the clip in reverse |
| Shift Option 1 to 6, Shift Option 0 | Speed ramp, remove ramp |
| Shift Option minus and plus | Slow 50%, fast 2x |
| Ctrl M | Delete marker |
| Cmd 4, Option Cmd 4, Cmd 6, Option Cmd 5, Cmd 8 | Video, audio, color, effects and info in the inspector |
| Shift Cmd 1, Option Cmd 1, Cmd 5, Shift Cmd 5, Shift Cmd 7 | Media, titles, effects, transitions and subtitles in the library |
| Shift Cmd F | Play full screen |
| Shift Cmd A | Deselect all |
| Shift Cmd R | Show the project folder |
| Ctrl Space, F1, Option Cmd K | Quick search, help, all shortcuts |
| Option Cmd L | Relink File (find a missing file) |
| Shift Option S | Stabilize clip |
| Shift Ctrl T | Add lower third (Shift Alt T on Windows) |
| Shift Option Cmd I, Shift Option Cmd K | Import title template, get the template kit |
| Cmd , | Preferences |
| Cmd B, Shift Cmd B | Blade selected clips at the playhead, blade all |
| Delete, Shift Delete | Delete and close gap, delete and leave gap |
| V | Turn clip on or off |
| Shift V | Turn all other clips off (again to turn them back on) |
| Cmd T | Add cross dissolve |
| Ctrl T | Add title (Alt T on Windows) |
| Option C | Add subtitle |
| Option [ and Option ] | Trim start or end to the playhead |
| E, W, Q | Append, insert, connect above |
| Ctrl + and Ctrl - | Volume up or down 1 dB (Alt on Windows) |
| M | Marker |
| I, O, Option X | In and out point, clear range |
| Comma and period | Nudge the selected clip one frame |
| Cmd + and Cmd -, Shift Z | Zoom the timeline, zoom to fit |
| Cmd Z, Shift Cmd Z | Undo, redo |
| Cmd I, Cmd E | Import, export |
| Cmd 1, Cmd 2, Cmd 3 | Record, Edit, Export |

On Windows, Ctrl is used instead of Cmd and Alt instead of Option.

## Installing

Installers are built by GitHub Actions: the **Actions** tab, the **Bygg installasjonsfiler** workflow, the **Run workflow** button. The finished files are under **Artifacts**: `.dmg` for Mac (Apple Silicon and Intel), `.exe` for Windows and `.AppImage` for Linux (x64). With a tag like `v0.2.0` they are also attached to a release.

The app is not code signed yet:

* **Mac:** The first time, macOS says the app cannot be verified. Press **Done**, open **System Settings → Privacy & Security**, scroll down and press **Open Anyway** next to Reccut, and confirm with your password. If macOS instead says the app is **damaged**, run `xattr -dr com.apple.quarantine /Applications/Reccut.app` in Terminal. If Terminal answers *Operation not permitted*, delete the app, run `xattr -d com.apple.quarantine ~/Downloads/Reccut-*.dmg` and reinstall from the `.dmg` file. Grant access to camera, microphone and screen recording. Restart the app after granting access.
* **Windows:** Choose **More info** and **Run anyway** if SmartScreen warns you.
* **Linux:** Run `chmod +x Reccut-*.AppImage` and start the file. Ubuntu 22.04 and later need `sudo apt install libfuse2`. If it closes with a sandbox error (Ubuntu 24.04), start it with `--no-sandbox`. The magnified pointer requires an X11 session. System audio is not recorded on Linux, and HEVC clips are converted before playback.

## Running from source

Requires Node.js 20 or later.

```bash
npm install
npm start        # builds the interface and starts the app
npm test         # tests the editing logic
npm run dist:mac # or dist:win, builds an installer
```

`npm start` opens the source version with its own profile in **Reccut Development**, so an installed Reccut version does not take over the launch. Settings and recent projects are separate; existing project files can be opened with Open Project. Startup also removes `ELECTRON_RUN_AS_NODE` from the app's environment, so it opens with a graphical window from terminals inside Electron-based tools.

## Technical

| Part | Contents |
| --- | --- |
| `src/main` | Electron main process: window, recording to disk, keyboard listener, FFmpeg, background tasks, projects |
| `src/shared` | Project model, editing operations and rendering engine, shared by preview and export |
| `src/renderer` | The interface in Preact: recording, editing (library, viewer, inspector, timeline), the Export tab, the command registry and the help |
| `assets/help` | Screenshots for the help |
| `assets/template-kit` | The After Effects template kit and the description of the `.reccut-title` format |
| `src/worker` | Hidden windows for export and automatic subtitling |

Open source used: Electron, Preact, Lucide (icons), Mediabunny (decoding and encoding with WebCodecs), FFmpeg 9 (muxing, transcoding, analysis; fetched with `node scripts/fetch-ffmpeg.mjs`, which also runs after `npm install`) and Transformers.js with Whisper (subtitling). The FFmpeg binaries are GPL licensed, built without `--enable-nonfree`, and ship with the app together with LICENSE-FFmpeg.txt.


## Design

* Several independent image designs in each project, with size presets and custom canvases from 1 to 8192 pixels. A bottom pages strip opens, renames, duplicates and deletes designs, adds new ones and holds the Export menu.
* An icon rail opens one library panel at a time: Search, Templates, Video, Text, Add Content, Elements, Styles and Brand. Panels can expand or close and remember their layout. Layers sits above Properties.
* Shared library cards offer transient hover/focus previews, single-click or Enter to apply once, drag-and-drop at the canvas position, and context menus. Sections use horizontal rows, See All grids, panel search and pagination for large saved libraries. Styles and colors dropped on a compatible unlocked layer affect that layer.
* Image, text and rectangle layers, with selection, marquee, snapping, resize and rotation handles, opacity, flips, layer order, hiding and locking.
* Text Character controls come first, with searchable installed fonts and a link to Google Fonts for local installation. Word selections can carry independent fonts, weights, sizes, tracking, case and fills through save/export/copy. Save Style is a header action; saving brand colors is centralized in Brand.
* Layers/Properties has a draggable height divider, remembered per app, with a compact automatic height and keyboard support. Alignment and distribution use labeled icon buttons. Mask editing draws the actual ellipse/rectangle/polygon outline.
* Text can be edited on the canvas or in Properties, with system fonts, wrapping, automatic fitting, alignment and uppercase.
* Import Image in Add Content offers embedded and linked imports plus Open as New Design. Embedded copies images into Designs/Assets; linked references their original location. The Design menu retains Place Embedded and Place Linked. Native drop follows the import copy preference, and Alt reverses it. Images can also be pasted from the clipboard. These assets stay separate from the Edit media browser. Existing Edit images can be referenced in a design.
* The Video preview has an editable timecode, play/pause with Space, five-second skip buttons and ten-second skips with Shift. Arrow keys step one frame; Shift and arrows step one second. Navigation and playback remain separate from Edit.
* An independent Video preview captures full quality sequence frames or frames from a source video into Designs/Frames. Captured frames keep their full image and original aspect ratio, fitted inside the design without automatic cropping. Move and scale them to compose the thumbnail. Later timeline edits do not change the captured images. Use This Frame can create the first design directly from the Video panel.
* Design has its own Undo and Redo, independent of Edit. Designs save inside the existing project format, with relative asset paths for moved projects.
* Export As saves PNG, JPEG or WebP, with optional transparency, size and quality controls, and a file size limit. Quick Export as PNG uses the current canvas size and background. Exports get unique names and use the same renderer as the canvas.
* Package Project includes design assets and protects media used only by designs. The report lists system fonts that need to be installed on another computer.
* Cmd/Ctrl 4 remains the Video Inspector shortcut. Design currently opens from the title bar, View menu or command search. The 100% command has no shortcut because Cmd/Ctrl 1 continues to open Record. Design uses Cmd/Ctrl J for Duplicate Layer and Cmd/Ctrl D for Deselect.

* Solid and gradient fills, inside/center/outside strokes, multiple shadows, blend modes, image adjustments and highlighted text with line backgrounds. Linear gradients offer typed angles and presets. Round color stops support single-click insertion, drag-down removal and Backspace/Delete, with undo and a minimum of two colors.
* Rectangle, ellipse, polygon, star, line and arrow tools; groups, alignment/distribution, crop modes and layered PSD/SVG import.
* Offline Remove Background with MIT-licensed BiRefNet models, downloaded when first needed (Fast for WebGPU, about 115 MB, or Standard for any computer, about 192 MB), progress and cancellation. Cut Out Camera captures the complete camera image independently of the timeline layout. Cut Out This Frame captures the selected composite and removes its background locally.
* Nondestructive cutout masks, Erase/Restore brushes with per-stroke undo, Feather, Shift Edge, sticker outlines and shadows that follow transparency. Rectangle, ellipse and polygon masks, clipping groups and Fill Text With Image.
* 111 built-in text styles, up to 500 saved styles and 22 built-in design templates. Templates use frame, cutout, title, subtitle and logo placeholders, adapt to other canvas ratios, and import/export as .reccut-design-template files.
* Brand collects the reusable logo, title/body fonts, up to 20 colors and a palette made from those colors. My Logo is copied into projects that use it. Recent and From Project in Add Content show reusable project images.

* Local Design Suggestions scores up to 180 sampled sequence frames, avoids fades/transitions, and offers up to six frames across four suitable layouts each. Titles come from names, timeline text and captions, including Norwegian. Shuffle changes titles/layouts; choosing a card captures the complete frame at full quality and creates an editable design with one-step undo.
* Inline For This Video layout cards and Best Frames share a local analysis cache. Hover uses small previews; applying captures full-quality originals with no automatic crop. Source or project changes discard stale analyses; captures also guard against history navigation.
* Add Title, Add Subtitle and Add Badge use canvas-relative sizes, the project name and saved brand fonts. Installed font pairs apply title/body fonts together.
* Elements includes editable shapes and badges, hand-drawn pointers, 3,781 system emoji with English search/categories and paged grids, PNG stickers and separate solid/gradient/pattern background layers. Dots and grids expose colors, radius/line width and independent X/Y spacing; older raster patterns can be converted reversibly. Saved elements, palettes and font pairs stay local to the user's library.
* Recommended combines palettes and fonts. Colors offers eight built-in five-color palettes and From This Frame sampling. Optional template color roles survive import/export; other designs fall back to layer types. Palettes preserve images and locked groups; drops on a layer affect only that layer.
* Template tags, By Style grouping and global offline search across built-in/saved content, project images and brand items. Save as Template offers tags and color roles.
* Optional AI title suggestions name the configured provider and require an explicit Send Transcript action. Local suggestions work without AI or network access.

* Generic feed previews at 360, 246 and 168 pixels wide plus a phone layout, light/dark backgrounds, duration badge and optional progress bar. Canvas-only safe-zone guides and automatic debounced readability checks with a toolbar warning dot for text size, sampled contrast and overlay overlap.
* Independent design variants with comparison and favorites. Resize to multiple anchored/relative layouts and batch export selected designs with dimensions in file names.
* Also save thumbnail in video export prepares a design snapshot and writes a JPEG alongside the completed video using its actual base name. Existing JPEG files are preserved with an error message.
* Open Image or an empty-room image drop creates a design at the displayed pixel dimensions, honoring JPEG orientation. Nondestructive canvas cropping, quarter-turn rotations, flips and Canvas Size with a nine-point content anchor.

* Design Brand Kits store color roles, title/body fonts and default System/Flat/Outline emoji style. Font edits update current matching text; new elements use Brand defaults. The bundled library includes 111 text styles, 40 palettes, 178 other elements and 3,781 emoji.
* Design online resources: main-process source engine, cached previews, independent project downloads/credits, source plugins, OAuth/PKCE/MCP and configurable template catalog. Provider registration, publication and live-account acceptance remain necessary before Phase C is production complete; see DESIGN-REDESIGN-C-QA.md.

* Settings → Plugins groups tools under Record, Edit, Export and Design, with the current workspace first and expanded. Workspace shortcuts, connection statuses and setup guidance make each integration easier to find. Video tools and installation are under Edit; photo sources and the template catalog are under Design.
* Optional personal API-key photo plugins: Design → Plugins → Image Source Plugins. Add Pixabay without JSON, open its key page, save/replace/remove a locally stored key and test the connection. Pexels setup retains its app-approval gate. No shared Pixabay publisher key is required; Unsplash is not offered as a personal-key source.
