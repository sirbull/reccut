# Keying, background removal and AI in Reccut

## What is implemented

The color key, the background reference key and the luma key are classic keyers. They need no AI model and run in the preview and the export. **Remove Background** in Design is a different feature: BiRefNet segments people and objects in still images, with a model downloaded when needed. AI keying of green and blue screen video is the optional CorridorKey add-on, described below.

The Effects tab on a video, image or recording clip has **Keying & effect stack**. On recordings, choose camera or screen before you add an effect.

- **Remove solid background** reads the source frame at the playhead, finds the most common edge color and applies a color keyer.
- **Remove static background** reads nine source frames from the clip. A per-pixel median estimates a background reference, and a difference keyer compares each frame with it.
- **Color key** can also be added manually, with any background color.
- **Background reference key** lets you capture a clean background frame at the playhead. The subject must be out of frame when the reference is taken.
- **Luma key** removes dark areas, or light areas with Invert matte.

**Advanced** now also has **Recover fine detail** for semi-transparent hair and fine edges, **Preserve source shadows** for shadows in the footage, **Shadow color range** for the shadow's color tolerance, **Recover edge color** for background color in edge pixels and **Matte gamma** for the midtones of the alpha matte. The new recovery controls start at 0, so existing projects keep their result. Gamma starts at 1. Shadow preservation needs a light, unshadowed Screen color sample. Subjects with the same color as the background may need a mask.

**Advanced** otherwise opens spill removal for the color keyer, matte black/white, edge shrink or expand, feather, invert and matte view. A positive edge value shrinks the foreground; a negative value expands it. Remember to switch from matte view to Composite before exporting: the view is part of the effect.

The effects run from top to bottom. You can add the same effect several times, and turn off, duplicate, remove and move each instance. Blur, Saturation, Contrast and Opacity can also be added to this stack. The stack runs before the clip's existing color correction and other clip effects. Masks can be applied afterwards. The stack parameters are static for now; the existing clip effects keep their keyframe support.

**Drop Shadow** uses the visible shape after keying, cropping and masks. Vignette and color adjustments preserve transparency, and the layers below show through the removed areas.

Use **×** next to the effect name to delete a video or audio effect. Adjusted effects show a warning with **Don’t show this again**. The choice is saved in the app settings and can be reset under **Settings → General → Projects → Warn before removing adjusted effects**. Deleting an effect with all its settings and keyframes can be undone in one step.

Preview and export use the same effect code. WebGL2 is used when available; the CPU fallback produces the same matte computation, but is slower on large images. The keyer uses no temporal smoothing that could leave traces from the previous frame. This is not a guarantee of perfect edges, hair or motion blur.

Background analysis requires a locked-off camera, stable lighting and that the background is visible in most of the samples at each pixel. A person standing still throughout the recording can become part of the reference. A clean reference frame gives better control. This is not semantic person segmentation, camera tracking or AI-based reconstruction of foreground colors. The reference is saved in the project and included in project packaging.

## External processors and CorridorKey

Under **Settings → Plugins** you can install a local processor from a JSON manifest. There is an example in [examples/local-processor.json](examples/local-processor.json). Replace the executable and arguments with your locally installed adapter. The manifest is reviewed in the interface before installation.

A processor is a separate program, not JavaScript loaded from the project file. Reccut starts the program without a shell, with each argument passed as a separate argument. `{input}` is replaced with the source file, and `{output}` with a new result file in Reccut/Processed. Processors run with the user's permissions, so only install tools you trust.

The contract is:

1. Read the whole source file from `{input}` and write one playable video to `{output}`.
2. Keep the source duration, frame rate and frame timestamps. Reccut checks the duration before the result is used, but cannot prove that an external processor has preserved every frame timestamp.
3. For keying, the result must have an alpha channel, for example ProRes 4444 MOV or VP9 with alpha in WebM. A regular H.264 MP4 has no alpha.
4. Exit with status 0 on success, and write error messages to stderr on failure.

Choose the processor under **Effects → External processing** on a regular video clip. The result is only used on that clip. The original media is kept in the library, the original audio is kept, and the source swap can be undone. The background task can be canceled. If it fails or the source changes along the way, the clip is not swapped automatically.

There is **no native OFX/Adobe host**, so installing an OFX bundle is not enough. **CorridorKey is available as an optional add-on** ([src/main/corridorkey.js](../src/main/corridorkey.js), [src/renderer/CorridorKeyAddon.jsx](../src/renderer/CorridorKeyAddon.jsx)). After the user has read what it needs and accepted its licence, Reccut downloads uv, the CorridorKey source at a fixed commit, the Python packages from its lock file and the green and blue screen weights, each checked against a known hash, and installs it as a processor plugin. Nothing of it ships with Reccut.

It is reached from **Plugins** only, like other processor plugins: choose CorridorKey there, read the facts and licence, install, then select a clip and apply it in the CorridorKey window.

Licence: CorridorKey Licence 1.0, which is CC BY-NC-SA 4.0 with additional terms. Users may process images as part of a commercial project. Section 2c says that a commercial software package that wants to incorporate the tool needs a separate written agreement with Corridor Digital (contact@corridordigital.com). That must be clarified before Reccut is sold with this integration.

Check the version you use against [CorridorKey's official documentation](https://help.corridorkey.com/docs/getting-started/), [the runtime project's CLI documentation](https://github.com/alexandremendoncaalvaro/CorridorKey-Runtime#cli-usage) and [the model project](https://github.com/nikopueringer/CorridorKey2.0). These have different input and output layouts. The example manifest is an adapter format, not confirmation that a specific CorridorKey version has been tested with Reccut.

## The editing agent

### Models and providers

Under **Settings → AI** you choose OpenAI, Anthropic Claude, Google Gemini, Mistral, OpenRouter, Groq, xAI or DeepSeek. You can also choose a local server: Ollama, LM Studio or llama.cpp. **Other server or gateway** accepts any OpenAI- or Anthropic-compatible address, for example vLLM, Jan, LocalAI, LiteLLM or a machine on the local network. **Fetch models** fetches the model IDs from the server. The model must support tool calls. Turn off **Model can see images** for models without image input.

All except Anthropic use the Chat Completions protocol. HTTP is only allowed to this machine and private network addresses. Other addresses require HTTPS. Local servers need no key. Keys are encrypted with safeStorage and live only in the main process, never in the project or in the interface.

### How it works

The agent is a loop: the model gets a tool registry, calls tools, gets the results and continues until it answers without a tool call, but at most 40 steps.

- **The tool registry** lives in [src/shared/aiEdits.js](../src/shared/aiEdits.js). Each tool has a name, description, JSON schema and the code that makes the change. So there is one source for documentation, validation and action. Editing uses the same functions as the timeline (ops.js), and each tool call becomes one undo step.
- **Read:** `get_timeline`, `list_media`.
- **Edit:** `add_media_to_timeline`, `split_clips`, `delete_clips`, `trim_clip`, `move_clip`, `add_title`, `add_captions`, `set_clip_properties` (many clips in one undo step, with all color controls and the color wheels), `add_video_effect`, `add_transition`.
- **Runtime** ([src/renderer/agent.js](../src/renderer/agent.js)):
  - `transcribe_speech` runs Whisper locally on the timeline audio and returns speech with timecodes without changing the subtitles. The result is reused until the audio changes.
  - `analyze_look` measures brightness, black and white point, clipping, saturation and color cast in each clip's source frames, and in attached reference images.
  - `preview_frames` renders the timeline with the same engine as export and measures the finished, corrected frame. The frame is also sent to the model when it can see images.
  - `search_help` searches the help articles, and `show_help` opens an article for the user.
  - `find_commands` and `run_command` give access to every command in the app, from the same registry as the menus, shortcuts and Find Command ([src/renderer/registry.js](../src/renderer/registry.js)). New commands therefore become available to the agent automatically, with menu, shortcut and description.
  - `select` selects clips and moves the playhead, as the user does before a command.
  - `get_settings` and `change_settings` read and change the settings, the recording settings and the shortcuts.
- **All properties:** `get_clip` shows everything in the inspector. `set_clip_properties` and `set_project_settings` accept every simple value that already exists, with the same type (`checkPatch`). New properties in the inspector therefore become available without extra code. Known values also have fixed limits.
  - `import_media` imports files the user has specified.
- **The handbook** is the system prompt in agent.js. It explains the magnetic timeline, the difference between source time and timeline time, tracks, subtitles, recordings and audio levels, and gives a workflow for automatic editing. Details are looked up with `search_help`, so the help and the agent do not say different things.
- **The main process** ([src/main/extensions.js](../src/main/extensions.js)) translates the neutral message history into Anthropic Messages or Chat Completions, with tools and images. Chat Completions only accepts images in user messages, so they are placed after the tool results.

The agent edits without asking at every cut. **Undo this request** undoes all changes from the last request, as long as the project has not been changed since. **Stop** interrupts between two steps.

### Raw footage: talking head and screen recordings

The agent works like an editor with an assistant who has logged the footage: text and numbers first, images only where needed.

- **Speech:** Whisper runs with word timings (the `whisper-*_timestamped` models). Pauses are measured from the audio level ([src/shared/speech.js](../src/shared/speech.js)). Whisper often stretches the last word into a pause, so the word edges are moved to the pauses. The subtitles from "Generate captions" use the same word timings and are therefore also more precise. `transcribe_speech` can transcribe one media clip in source time before it is on the timeline.
- **Screen:** `inspect_media` returns scene changes (ffmpeg, scaled down to 160 px and 4 frames per second, so even long recordings are fast), the event log from Reccut recordings (cursor zoom, and clicks in older recordings) and a contact sheet with frames and timecodes. The agent looks at the whole file first and then at shorter sections.
- **Building:** `build_sequence` lays down the whole plan in one undo step. Good takes go in the primary storyline. Screen clips are connected to the segment where they are explained, with an offset and optionally increased speed. Titles are placed the same way. Cuts that land in a measured pause keep up to 0.15 seconds of silence, so the transitions sound natural.
- **Custom titles:** `create_title_template` makes animated templates in the same format as the built-in ones (.reccut-title). The format description and an example are taken from the code. The templates are saved in the project and shown in the Titles library.

### Story, graphics, AI video and plugins

- **The story:** `get_story` and `set_story` save the brief, paper edit, notes per media clip and attached documents in the project. Documents attached in the chat (PDF, Typeloom, Word, Final Draft, Fountain, RTF and text) are read in the main process and saved in the story. PDF is read with pdf.js: lines and spacing are reconstructed from the text positions, so character names and dialogue blocks in a script stay separate. Scanned PDFs without text give a clear error message. Typeloom projects (`.typeloom`, a zip with `binder.json` and TipTap documents) are rewritten into Fountain-style scripts. The binder order, folders as headings, corkboard summaries as `= ` lines and the script elements are kept, while documents in the trash and research files are left out. If there is no script or brief, the agent should ask before it cuts, or suggest a structure.
- **Script against takes:** `match_script` ([src/shared/speech.js](../src/shared/speech.js)) aligns each line with the words in the transcripts, like ScriptSync. In a screenplay, only the dialogue is matched, with the character who speaks it. A script counts as a screenplay when a character name repeats or there are scene headings. In a voiceover script, every sentence is matched. It finds every take, including several in the same file, with match quality and number of hesitations. Scene headings, character names and directions are skipped.
- **Motion graphics:** `create_motion_graphic` lets the agent write a drawing function for canvas. It runs in a hidden window in its own empty session without network, files or Node, with a time limit per frame ([src/main/graphics.js](../src/main/graphics.js)). The frames are encoded to H.264, or to ProRes 4444 with an alpha channel for graphics over video. The clip is imported, and the agent gets four preview frames and any code errors back.
- **AI video:** Higgsfield ships as a built-in plugin (**Higgsfield AI Video**). It sits at the top of the Plugins list, cannot be removed, is set up in Settings → Plugins and has its own tool window with prompt, duration, start frame from the playhead and placement at the playhead. The agent's `generate_video` uses the same API. The key ID and secret are stored encrypted. Start frames are uploaded to a presigned address without the key. The request is sent with an Idempotency-Key, and the status is polled with increasing wait times until it is done. The price is shown and must be approved before each generation (can be turned off). Models are chosen by endpoint ID in the settings. It has been tested with a simulated API, not with a real account.
- **Plugins:** `propose_processor` creates a plugin: an FFmpeg call or a Python script with its own icon (SVG) and settings (numbers, choices or on/off), which are inserted into the arguments as `{param:id}`. The draft is shown in the chat with the full script, and nothing is installed or run until the user chooses **Install processor**. It then opens as a tool window.
  - The **Plugins** button in the toolbar lists installed plugins. Each opens in a small, movable window above the rest of the app ([src/renderer/Plugins.jsx](../src/renderer/Plugins.jsx)), with the settings as controls and **Apply to selected clip**. The windows remember their position.
  - Icons are shown as `<img>` (SVG cannot run scripts there), and scripts, links and images are also rejected.
  - Settings are never free text. Numbers are checked against min and max, and choices against a list of simple values, so values cannot smuggle in extra command line options.
  - `run_processor` runs a plugin with chosen settings, and `open_plugin` opens the window for the user.
- **Settings per plugin:** Settings → Plugins has a **Settings** button per plugin, and the gear in the plugin's window opens the same place. For plugins with parameters, the user's default values are saved in the preferences (`pluginSettings`). The window starts with them, and the agent's `run_processor` uses them when it does not specify values itself. "Reset" goes back to the plugin's own defaults. For Higgsfield, the settings contain the account, models and price confirmation.
- **One version per plugin:** When the agent changes a plugin, it passes `replaceId` (or the same name), and the plugin keeps its id and gets a higher version number. Installation replaces the plugin with the same id, so copies are never left behind. Python scripts are saved as one file per version, so the installed version keeps working until the update is installed. The old files are then deleted. **Remove** in the settings also deletes the scripts.
- **Sharing:** **Share…** creates a `.reccut-plugin` file (JSON with name, version, author, icon, settings, arguments and script, without local paths). The file type is registered in `package.json`, so double-clicking opens Reccut. The file is opened for review (`plugins:readFile`) and is not installed until the user accepts. Only plugins made with FFmpeg or Python can be shared. FFmpeg plugins always use the app's own FFmpeg, also after updates.
- **Terms:** The text lives in [src/shared/pluginTerms.json](../src/shared/pluginTerms.json), with a version. Sharing requires that the sharing terms have been accepted. Plugins can be shared for free or sold, but Reccut is not a party to the sale, and the person sharing is responsible. The acceptance is saved in the file with the date and optionally a name. All installation (from the agent, from a file or from a manifest) requires the user to tick a box confirming that they are responsible. The main process rejects installation and export without acceptance. The terms should be reviewed by a lawyer before launch.
- **The AI button** in the toolbar opens the chat. The first time, the setup is shown, and the chat opens when the connection has been tested.
- **Setup:** The first time the chat opens, the user can choose between a model on the machine (Ollama, LM Studio or llama.cpp are found automatically), Google Gemini, Claude and OpenAI. With a key, the model list is fetched and the best model is chosen (`pickModel`). The connection is tested before the chat opens. **? What can I ask** explains how to ask and has examples you can click.

### Subtitles, color and style

- **Subtitling and translation:** The agent transcribes, translates and shortens, and replaces the subtitle track with `add_captions` and `replace`. The rules live in the code (`fitCaptions` in [src/shared/srt.js](../src/shared/srt.js)), not just in the instructions:
  - at least 1 second and at most 7 seconds on screen
  - at most 17 characters per second
  - two lines of 42 characters
  - at least two frames between subtitles, and no overlap

  Short subtitles are extended into the silence after them. Subtitles that break the rules are sent back as warnings, and the agent rewrites them. The model does what it is good at (rephrasing), and the code does the math.
- **Color and exposure:** The agent measures first, then fixes errors (exposure, clipping, color cast), creates a style afterwards, and matches clips from the same scene. It checks the result with the measurements from `preview_frames`. It therefore also works with models that cannot see images.
- **Reference image:** Images are attached with **Image…**, by pasting or by dragging them in. They are sent with the message, and `analyze_look` measures them, so the agent can move each clip's numbers toward the reference.

### Limitations and next steps

- Whisper's word timings are good, but not perfectly precise. Cuts are therefore placed in measured pauses when possible.
- The agent cannot create plugins with code. Titles are data and safe. Executable processors must be installed by the user.
- The agent cannot generate voiceover, images or video yet. This fits in as separate tools that create a file and import it.
- It cannot redact faces automatically. That requires face detection and tracking.
- It cannot export or package the project.
- There is no MCP server yet.
- The agent has been tested with simulated model responses in Node and Electron. The measurements have been tested on real decoded video frames. Word timings and pauses have been tested with the Whisper model in Node on synthetic speech. It has not been tested against a real provider, and the transcription worker and `preview_frames` have not been run in the finished app.

## Project packaging

Claude had already added **Trim media to the parts that are used** to Package Project. The work has been continued with tests and bug fixes: transition handles are kept even with zero extra handles, different cuts with the same start are not confused, audio outside the recording folder is included, and incomplete packages are cleaned up on failure or cancellation.

Regular video and audio files can be trimmed. Recording folders and still images are copied whole. Trimming re-encodes at high quality and is not a bit-identical copy of the original. The size shown is an estimate; a re-encoded file can turn out larger than expected. The original project is not changed.

## Verification

- `npm test`: model, security, processor and FFmpeg integration tests.
- `npm run build`: renderer, export worker and transcription worker.
- `npm run test:render`: real WebGL2 and CPU rendering in Electron, effect stacking, compositing over another track, source reading, inspector actions and AI suggestions with undo.

Synthetic test images and short generated videos are used for functional checks. Hair, glass and complex real footage have not been quality validated, and no purchased CorridorKey installation or external API account has been used in the tests.
