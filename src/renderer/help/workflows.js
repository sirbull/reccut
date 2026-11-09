// Task-oriented guides. Describe the controls shipped in Reccut, not provider-specific marketing.
export const WORKFLOWS = [
  {
    id: 'selection-clipboard', section: 'Editing', title: 'Select, Copy, Paste and Undo',
    summary: 'Choose what an edit affects, reuse clips and recover from a change.',
    keywords: 'selection select all deselect clip playhead cut copy paste clipboard undo redo',
    body: `
Click a clip to select it. Use Shift-click to add or remove clips from a selection. **Select All** ({{key:selectAll}}) selects all timeline clips, or all media when the browser is in use. **Deselect All** ({{key:deselectAll}}) clears the selection. **Select Clip at Playhead** ({{key:selectClip}}) selects the clip at the current time.

## Copy or move clips

1. Select the clips you want to reuse and choose **Copy** ({{key:copy}}), or **Cut** ({{key:cut}}) to remove them and put them on the clipboard.
2. Put the playhead where you want the pasted content.
3. Choose **Paste** ({{key:paste}}). Play across the pasted area and check the surrounding timing.

Use Paste Effects or Paste Attributes when you want to copy a look or audio treatment instead of creating another clip. Grouped clips can select together; Option/Alt-click selects a single member.

## Undo and redo

**Undo** ({{key:undo}}) reverses the previous edit. **Redo** ({{key:redo}}) reapplies an undone edit until a new change replaces that redo history. For an older saved state, open Project History. In the AI chat, Undo this request can revert all timeline changes from the last request.

When a text field has focus, Cut, Copy, Paste, Select All, Undo and Redo act on the text. Click the timeline before using them on clips. In the Help window they edit or copy Help text rather than the project behind it.
`, see: ['timeline', 'grouping', 'paste-attributes', 'history'],
  },
  {
    id: 'first-edit', section: 'Getting Started', title: 'Your First Video: Record, Edit and Export',
    summary: 'A complete practice project, from an empty timeline to a finished video.',
    keywords: 'beginner tutorial quick start walkthrough first project learn editing example',
    body: `
You need a screen or a short video file and a folder where Reccut can save the project. This example makes a short tutorial with a title and a clean ending.

## Create a project

1. Choose **File → New Project** and name it Practice Tutorial. Choose a location with enough free space for your recordings.
2. Keep the automatic format if you want the first video to set the sequence size and frame rate.
3. Reccut creates the project folder. Changes to the edit are saved automatically.

![The Into the Wild nature project in the Edit room, with editable titles, transitions and an audio track.](overview.jpg)

## Add your footage

1. Open **Record**, choose the screen and microphone, and use **Test** to check your voice. Record about 20 seconds, then stop.
2. Open **Edit**. The recording is in the media library. If the timeline was empty it is added automatically.
3. Alternatively, choose **File → Import Media**, select a video, and choose **Copy to project folder**. Select it in the library and use **Append** ({{key:append}}).
4. If Sequence Settings opens, confirm the format. Press Space to play; press it again to pause.

## Make two clean cuts

1. Click the timeline ruler where your useful content starts. Select the clip and choose **Blade** ({{key:blade}}).
2. Click the unwanted beginning and press Delete. The magnetic storyline closes the gap.
3. Repeat at the end. Use **Select** ({{key:tool:select}}) to drag a clip edge when you only need a smaller adjustment.
4. Choose **Fit Timeline** ({{key:zoomFit}}) if the useful part is outside the view.

## Add a title and check the sound

1. Put the playhead near the start and open **Titles**. Drag a title above the video.
2. Select the title and change its text in the inspector. Drag its edges to set how long it stays visible.
3. Select the video and open **Audio**. Adjust its volume while listening. Red levels mean the sound is clipping.
4. Play the entire edit. Check the beginning, every cut, the title, and the ending.

## Export the result

1. Choose **File → Export** ({{key:export}}).
2. Use MP4 H.264 for this example, name the file Practice Tutorial, and start the export.
3. Watch its progress in Background tasks. The output is normally saved in the project's Exports folder.
4. Open the finished file and watch it once before sharing it.

**Expected result:** a video with its empty beginning and ending removed, a readable title, and audible speech. You can reopen the project and continue editing without changing the original recording.
`, see: ['recording', 'tools', 'export', 'projects'],
  },
  {
    id: 'ai-setup', section: 'AI and Plugins', title: 'Set Up a Cloud AI Agent',
    summary: 'Connect a provider, choose a model, and verify the connection with a harmless first request.',
    keywords: 'ai setup assistant artificial intelligence cloud api key openai claude anthropic gemini mistral groq openrouter xai deepseek credentials model connect',
    body: `
The editing agent needs a model that supports **tool calling**. A provider account, API access and usage billing are managed by that provider. Reccut connects using your own API key. Model availability depends on your account; use the model list instead of guessing a model name.

## Connect from the first-run setup

1. Open **AI** in the main toolbar. If no model is configured, Reccut shows **Set up the AI agent**.
2. Choose Google Gemini, Claude or OpenAI. The setup provides a link for creating that provider's API key.
3. Paste the key in the password field and choose **Connect**. Reccut requests the available models and saves the selected connection.
4. For another provider or an exact model, use **Settings → AI**.

![The agent setup screen. Choose a local server or one of the cloud connections.](ai-setup.jpg)

## Configure the connection yourself

1. Open **Settings → AI** and choose **Provider**. Presets include OpenAI, Anthropic Claude, Google Gemini, Mistral, OpenRouter, Groq, xAI and DeepSeek.
2. Paste your API key. If the field says **Key saved**, leaving it blank keeps the saved key.
3. Choose **Fetch models** and pick or enter an exact **Model ID**. The provider may list models that cannot use tools; select one that supports tool calling.
4. Turn **Model can see images** on only for a vision model. This lets the agent inspect rendered preview frames.
5. Choose **Save AI settings**, then **Open chat**.

![AI settings: provider, API key, exact model ID and optional image support. The screenshot uses fictional values.](ai-settings.jpg)

## Test and start editing

Send: **“Describe the current timeline. Do not change anything.”** The agent should read the project and reply. Then try **“Add a title saying Welcome at the playhead.”** Check the result in the viewer. Use **Undo this request** to remove that request's changes.

For an alternative gateway, choose **Other server or gateway**, select the API format, and enter its **API base URL**. Use the base URL expected by the service, including its version path when required, rather than a chat webpage or an individual completion endpoint.

## Keys and project data

Keys use the operating system's encrypted credential storage when available. Otherwise they are kept only in memory for the current session. **Remove key** deletes the key. Changing provider or base URL removes the old key, so enter a new one for the new connection.

The agent can send your messages, attached images, clip names, timings, captions, locally generated transcripts, look measurements and rendered frames to the configured provider. Original video and audio files are not uploaded by the chat. Provider processing is external; read its terms before using private material. Whisper Base is included. Additional local speech models are optional downloads in Settings → AI.
`, see: ['ai-local', 'ai-recipes', 'ai-troubleshooting', 'ai-plugins'],
  },
  {
    id: 'ai-local', section: 'AI and Plugins', title: 'Use a Local AI Model',
    summary: 'Connect Reccut to Ollama, LM Studio, llama.cpp or a compatible local server.',
    keywords: 'local offline ai agent localhost ollama lm studio lmstudio llama.cpp server port model tools privacy connection',
    body: `
Install and start a model server separately, then load a model that supports tool calling. Reccut does not install or host the language model. Downloading a model needs internet access; a running model on this computer can then handle the chat locally. Reccut's subtitle models are managed separately in Settings → AI; Whisper Base is included.

## Connect automatically

1. Start your local server and load a tool-capable model. Wait until the model is ready.
2. Open **AI** and choose **On this computer** in the setup.
3. Reccut looks for Ollama and LM Studio. Choose one of the models it found and choose **Use**.
4. If it finds no models, check the server and choose **Look again**. Use manual settings for a different port or llama.cpp.

## Connect manually

Open **Settings → AI**. The preset addresses in Reccut are:

- **Ollama (local)**: http://localhost:11434/v1
- **LM Studio (local)**: http://localhost:1234/v1
- **llama.cpp server (local)**: http://localhost:8080/v1

1. Choose the preset that matches your server. These presets use an OpenAI-compatible API format.
2. Leave **API key** empty for a local server that does not require authentication.
3. Choose **Fetch models**, select the exact loaded model ID, and set **Model can see images** to match its capabilities.
4. Choose **Save AI settings**. Open chat and ask **“List the clips in this project without making changes.”**

For another address, port or a server on your network, choose **Other server or gateway** and enter the actual base URL. A network server processes requests on that machine, rather than on this computer.

## If it connects but cannot edit

A model that can answer ordinary chat may still be unable to call the editing tools. Check tool-calling support in both the model and the server. Turn image support off for a text-only model. Try a small request such as **“Read the timeline and tell me its duration.”** before requesting a complete edit.

Local performance depends on model size, available memory and your hardware. Start with short, specific tasks. If the server stops, start it and load the model again before retrying in Reccut.
`, see: ['ai-setup', 'ai-troubleshooting', 'ai-recipes'],
  },
  {
    id: 'ai-recipes', section: 'AI and Plugins', title: 'AI Editing: Prompts and Worked Examples',
    summary: 'Give the agent a clear brief, point to clips, review its work and undo a whole request.',
    keywords: 'ai prompts examples agent edit tutorial script story brief translation captions graphics intro infographic reference attach undo stop',
    body: `
Set up a model first and import your footage. The agent operates on the current project and can inspect its library, timeline, transcripts and rendered frames. Select clips or move the playhead before referring to **“the selected clips”** or **“the clip under the playhead”**.

![The AI chat’s What can I ask panel, with examples of requests you can adapt.](ai-chat.jpg)

## Make a tutorial

1. Import your talking-head and screen recordings. Name them so the content is easy to recognise.
2. Send **“Make a two-minute tutorial for first-time users from my narration and screen recordings. Remove failed takes and long pauses. Keep the useful steps in order. Add a title at the start.”**
3. The agent can transcribe speech, inspect contact sheets and scene changes, and construct an edit. Long clips and the first transcription can take time.
4. Play through every cut. Check the chosen takes and whether the screen matches the narration. Ask for a specific correction, such as **“Keep the explanation after the second click; it was cut too early.”**

## Edit from a script or brief

Use **Attach…** for PDF, Typeloom, Word, Final Draft, Fountain, RTF or text documents. Attach storyboard images as images. For example: **“Use the attached script. Pick the clearest take of each line, follow its scene order, and aim for 90 seconds.”** The project can retain the story brief, documents and paper edit. A Typeloom project preserves binder order and scene information.

Without a brief, the agent may ask about the audience, length and tone. Answer those questions before expecting a complete story edit.

## Captions and translation

Try **“Create English captions, then translate them into Finnish. Keep names unchanged and use concise sentences.”** Speech recognition runs locally; caption text and transcripts can be sent to the configured chat provider for translation. Review names, punctuation and timing. The agent aims for readable lines and non-overlapping captions; a successful request is not a guarantee that every word is correct.

## Colour, graphics and audio

- **Match clips:** “Correct exposure and white balance on the selected interview clips and make them match.” Review skin tones and highlights.
- **Match a reference:** attach an image using **Image…**, paste it or drop it on the message field. Ask: “Use this image as a colour reference for the selected clip.”
- **Graphics:** “Make a five-second intro saying Getting Started on a dark blue background.” The agent can render a graphic as media and place it in the project.
- **Chart:** “Create an animated bar chart for Q1 120, Q2 180, Q3 240 and place it at 0:45.” Check values, spelling and its timing.
- **Sound:** “Put the music on its own lane at −15 dB and fade it out over the final two seconds.” Listen and adjust the balance for your footage.

## Control and review a request

**Stop** ends a running request between steps; it does not remove changes already made. **Undo this request** reverts the edit changes associated with that request. Ordinary **Undo** steps back through individual changes. Rendered media, installed plugins and external generation charges are not erased by undoing timeline edits.

The agent cannot currently create voice-over or music, or start an export. Export the reviewed edit yourself. An AI video request uses the separately configured Higgsfield plugin and may involve a paid generation.
`, see: ['ai-setup', 'ai-local', 'plugins-guide', 'caption-workflow', 'export'],
  },
  {
    id: 'ai-troubleshooting', section: 'AI and Plugins', title: 'Troubleshoot the AI Connection',
    summary: 'Resolve missing models, rejected keys, unavailable tools, image errors and stalled requests.',
    keywords: 'ai errors connection refused unauthorized 401 403 404 429 quota credits timeout tool calling models empty key vision images failed server',
    body: `
Start in **Settings → AI** and check Provider, Model ID and API base URL. Try **Fetch models**. If that fails, resolve the connection before retrying a large editing request.

## Key rejected or access denied

Check that the key belongs to the selected provider and has API access to the chosen model. Re-enter it after changing the provider or URL. Provider credits, permissions and usage limits are managed outside Reccut. Do not paste a key into the chat or an attached document.

## No models, model not found or wrong URL

Use **Fetch models** and copy the exact ID. A model name seen in a consumer chat app may differ from the API model ID. For a custom connection, check the API format and the base URL, including any required version path. Do not append a chat or completion route to the base URL.

## Connection refused on a local model

Start the local server, enable its API service if needed, and load a model. Confirm that the address and port match Reccut's preset. If your server uses a different port, use **Other server or gateway**. A server on another computer needs that computer's network address, not localhost.

## Answers arrive but the timeline never changes

Ask for a small, explicit edit and check the model's tool-calling support. The server must expose tool calling too. Questions such as “How do I add a title?” ask for help; “Add a title saying Welcome” asks for an edit. Check that footage is imported and the intended sequence is open.

## Images rejected or a text-only model fails

Turn off **Model can see images**, save settings and retry without image attachments. For colour matching or visual inspection, choose a model and server that accept images.

## A request is slow or fails partway through

Look at the chat's tool steps and Background tasks. Optional speech-model downloads and long transcriptions can take time. Check that a local server is still running and has enough memory. A provider may impose rate or quota limits. Use **Stop**, review changes already made, and retry a smaller task. Use **Undo this request** if you want to discard its timeline changes.
`, see: ['ai-setup', 'ai-local', 'background-tasks'],
  },
  {
    id: 'plugins-guide', section: 'AI and Plugins', title: 'Install, Use and Share Plugins',
    summary: 'Open plugin tools, choose defaults, generate video and review plugin packages.',
    keywords: 'plugin install share remove defaults settings higgsfield generate video key price cost image processor reccut-plugin',
    body: `
Open **Plugins** in the toolbar to see the available tools. Plugins open in small movable tool windows inside the application. **Settings → Plugins** lists their settings, sharing and removal actions. The built-in **Higgsfield AI Video** plugin is supplied with Reccut; its account is configured separately from the editing agent.

![Plugin management with the built-in video-generation tool and controls for installing additional plugins.](plugins.jpg)

## Apply a processor plugin

1. Select a video clip and open a plugin from **Plugins**.
2. Adjust the plugin's controls. Choose **Apply to selected clip**.
3. Processing runs as a background task. Wait for completion, then inspect the result in the viewer.
4. The settings gear opens its defaults in Settings. These defaults also apply when the agent uses that plugin, unless it supplies other values.

## Install a plugin file

Double-click a **.reccut-plugin** file or use **Install plugin file…**. Read the plugin description, parameters and **What it runs**. If you trust the code, accept the installation terms and choose **Install plugin**. An update keeps the plugin's identity instead of creating a second copy. A plugin can run code with your computer's permissions; the installation review is part of the application workflow.

You can ask the agent: **“Make a plugin that sharpens soft footage, with an adjustable strength slider.”** It presents a proposed processor for review. Generating a proposal does not install it automatically.

## Generate a shot with Higgsfield

1. Open **Higgsfield AI Video** and its settings. Configure your account/key and available models.
2. Describe the shot. Optionally use the frame at the playhead as a start image.
3. Check the model, duration and estimated price. Confirm the generation when prompted.
4. Wait for the generation, then inspect the imported result. Your provider account handles billing.

Generation sends the prompt and any supplied start image to the video service. It is distinct from local chat or a local video processor. Undoing an edit does not cancel a generation charge.

## Share or remove a plugin

In **Settings → Plugins**, choose **Share…**, enter the author information, review the sharing terms and export a .reccut-plugin file. Someone else can review and install that file. Choose **Remove** to uninstall a user plugin. The built-in Higgsfield tool can be configured but cannot be removed.
`, see: ['processor-guide', 'ai-recipes', 'background-tasks'],
  },
  {
    id: 'processor-guide', section: 'AI and Plugins', title: 'External Video Processors and Compatibility',
    summary: 'Understand local processing, timing requirements, generated files and unsupported plugin formats.',
    keywords: 'external processor ffmpeg python manifest executable alpha corridor key corridorkey ofx adobe ai matting segmentation',
    body: `
An external processor is a local tool connected through a Reccut JSON manifest. It can be a generated FFmpeg/Python plugin or a manifest for a trusted executable installed separately. Install the executable, model files, runtime and licence required by that tool before using it.

## Process a clip

1. Import a video and select its timeline clip.
2. Open **Effects → External processing**, or open the installed plugin tool from **Plugins**.
3. Choose the processor and its parameters, then apply it. The processor receives the full source, rather than only the visible trimmed part.
4. Wait for the background task. The result is imported and applied to the selected clip. Original media and audio remain available.

The processed result must preserve source timing and be a readable video file. Changing duration, frame rate interpretation or the start offset in a processor can make the edit point at the wrong source frames. Test on a short source first.

## Background removal with an external tool

For difficult foreground extraction, use a processor that writes video with an alpha channel, or process in a standalone application and import its result. For green and blue screens with hair, motion blur and see-through edges, CorridorKey is available as an optional plugin under Plugins. Reccut cannot load native OFX or Adobe plugins directly.

## If processing fails

Read the failed task's message. Check the executable path, installed runtime and models, input access and output format. Cancel through Background tasks if the process is no longer useful. If the file imports but the timing is wrong, undo its application and correct the processor before running it again.
`, see: ['plugins-guide', 'keying', 'background-tasks'],
  },
  {
    id: 'recording-setup', section: 'Recording', title: 'Recording Setup, Permissions and Sound',
    summary: 'Prepare a reliable screen, camera and microphone recording before the real take.',
    keywords: 'permissions screen recording input monitoring keystroke add-on microphone camera black screen silence test mixer gain clipping system audio setup',
    body: `
Create or open a project first. Check the Record room before a long take; its settings apply to new recordings.

## Choose the sources

1. Select a display or an individual window under **Screen**. Refresh the window list if needed. Window capture does not support cursor zoom.
2. Select the camera and microphone you intend to use. Disconnecting a device can make its saved selection unavailable.
3. Turn on **System audio** if the recording needs sound from the computer. Keep it off if you only need your voice.
4. For part of a display, choose **Area**, draw the box, and choose **Use Area**. Only the selected area is stored.

![Check selected sources and the microphone meter before starting a take.](record.jpg)

## Grant permissions

On macOS, allow screen recording, camera and microphone access in the system's Privacy & Security settings. If you use the Keystroke Add-on, macOS also asks to allow Input Monitoring for Reccut. Reccut provides permission controls in the recording interface. After changing system permissions, restart Reccut if the source or input tracking is still unavailable. If the Screen list only shows **No screen** after an update, even though Reccut is switched on under Screen Recording, remove Reccut from that list with the minus button, add it again and restart. On Windows, check camera and microphone access for desktop apps in system settings.

If the preview is black, check the selected source and screen permission before changing export settings.

## Set the microphone level

1. Speak at the volume you will use. Watch the meter and use **Test** for a four-second recording and playback.
2. Start with input gain at **0 dB**. Aim for clear speech without red clipping; peaks around −18 to −6 dBFS are a useful starting point.
3. Open **Microphone mixer** for input/output meters, EQ, low cut and compression. Try Flat, Clear speech, Warm voice or Bright voice and compare with Test.
4. If the input meter clips before processing, reduce the microphone or system input gain. Lowering Reccut's output does not repair already clipped sound.

Microphone processing is baked into the newly recorded microphone track. The system-audio track stays separate. These choices differ from audio effects applied later in Edit.

## Make a rehearsal

Record ten seconds, pause and resume once, change a layout, then stop. Open it in Edit and check the voice, screen, camera and timing. Choose a countdown and the floating controls before starting the real take. Keep enough free disk space in the project's recording location.
`, see: ['recording', 'recording-recovery', 'audio', 'recording-edit'],
  },
  {
    id: 'recording-recovery', section: 'Recording', title: 'Pause, Stop and Recover a Recording',
    summary: 'Know where recordings are saved and what to do after an interrupted take.',
    keywords: 'crash recovery interrupted unsaved recording pause resume stop mp4 webm control bar tray countdown save disk',
    body: `
The active project's **Recordings** folder contains the take's media and recording metadata. Screen, camera, audio and recorded events are retained for editing. The optional automatic MP4 is a rendered version; keep the recording folder if you want to change its layout and overlays later.

## Pause without leaving a gap

Use **Pause** on the floating controls, or the configured recording modifier with **9**. Repeat to resume. Paused time is removed, and recorded events follow the shortened time. The default start/stop combination is Control Option 0 on macOS and Ctrl Shift 0 on Windows; the Record room shows your configured keys. Keyboard control from another app requires **Record → Shortcuts → Allow shortcuts in other apps**, which is off by default. The floating controls work regardless of this setting.

## Stop and wait for saving

Use **Stop** or the start/stop shortcut. Allow saving to finish before moving or renaming the recording folder. If automatic rendering is on, a finished MP4 is made in the background. You can still edit the original recording.

## After a crash

1. Reopen Reccut. It checks for interrupted recordings and offers recovery.
2. Choose the take to recover. Reccut imports what it can read, with event metadata up to its last checkpoint.
3. Play the recovered beginning and ending, and check audio and camera synchronisation before editing.
4. Use discard only when you no longer need that interrupted take.

Recovery can lose the final unwritten portion; it cannot recreate data the disk never received. Project History restores edit decisions, while recording recovery repairs an interrupted media take. Use Package Project to collect a completed project's media for backup.
`, see: ['recording', 'history', 'package'],
  },
  {
    id: 'recording-edit', section: 'Recording', title: 'Change a Recording After the Take',
    summary: 'Adjust camera layouts, overlays and separately recorded sound in the editor.',
    keywords: 'recording edit camera screen pip layout corner mirror keystrokes cursor zoom clicks separate audio',
    body: `
Import the original Reccut recording, rather than only its flattened MP4. The original contains the separate sources and events needed for these controls.

1. Select the recording clip in Edit and open its recording properties in the inspector.
2. Under **Camera**, turn the camera on or off, choose **Layout at playhead**, and set shape, size, mirroring and the offset of the picture inside the frame. Layout changes are tied to the source time at the playhead.
3. Under **Overlays**, enable or disable Cursor zoom, Keystrokes for recordings made with the Keystroke Add-on, and Click highlights for older recordings that have them. The counts show how many events the recording contains.
4. Open **Audio** to enable and balance the microphone and system-audio components independently.

**Example:** record a software demonstration with a corner camera. For a section where the camera covers a button, place the playhead at that section and switch to Screen, then restore a corner layout when you want the camera to return. Play across both changes to check the result.

On recordings, source effects can target **Camera** or **Screen** separately. Check the selected target before adding keying or other stack effects.

Events cannot be recreated if they were not recorded. If you enabled an on-screen PiP during capture and it was captured into the screen source, turning off the separate camera does not remove the camera baked into that screen file.
`, see: ['recording', 'inspector', 'keying', 'audio'],
  },
  {
    id: 'sequence-settings', section: 'Getting Started', title: 'Sequence Size, Frame Rate and Versions',
    summary: 'Set the canvas and make alternative cuts without duplicating your media.',
    keywords: 'sequence settings fps resolution format vertical portrait landscape dimensions aspect ratio automatic frame rate',
    body: `
A sequence is one timeline inside a project. Sequences share the media library, but keep their own edit, dimensions, frame rate and caption style. Export uses the open sequence.

## Choose the working format

Open **File → Sequence Settings** ({{key:sequenceSettings}}), or deselect clips to see the sequence properties in the inspector. Set the width, height and frame rate to suit your intended output. Automatic projects take their initial format from the first video added to the timeline; the confirmation can be disabled in Settings → General.

**Example:** use 1920 × 1080 for a landscape tutorial or 1080 × 1920 for a portrait version. A source with a different aspect ratio fits the canvas; inspect framing after a format change.

## Make another version

1. Choose **File → Duplicate Sequence** to copy the current edit.
2. Rename it in the Media browser's sequence list, for example Tutorial – Portrait.
3. Open Sequence Settings and set the portrait dimensions. Adjust positions, crops and title sizes in this version.
4. Double-click either sequence in the browser to switch between them. Changes to one timeline do not rewrite the other's edit.

## Match motion to the frame rate

Clips play at their normal speed even when their frame rates differ. Converting 25 fps footage to 30 fps needs repeated or unevenly sampled frames; simply choosing a larger number does not create smoother camera motion. The export window checks for problematic combinations and can suggest another rate.

For smooth slow motion, footage shot at 60 fps and played at 50% supplies 30 source frames per output second in a 30 fps sequence. Check speed and the export frame rate together.
`, see: ['projects', 'speed', 'export-settings'],
  },
  {
    id: 'animation-recipe', section: 'Editing', title: 'Animate a Zoom with Keyframes',
    summary: 'A practical example using scale, easing, a hold and a return to the original framing.',
    keywords: 'animation zoom pan scale position keyframe diamond hold easing ken burns example',
    body: `
Use a video or still image with enough resolution for a small zoom. Select it and open the Video inspector. Animation affects the selected clip; it does not change the source file.

![Transform and crop controls in the Video inspector. Diamonds beside animatable properties add keyframes.](video.jpg)

1. Put the playhead one second after the clip starts. Set Scale to 100% and click its diamond to save a keyframe.
2. Move one second further and set Scale to 120%. Add or confirm the second keyframe. Change Position if the subject needs to stay centred.
3. Move another second and keep Scale at 120%, adding a keyframe for the end of the hold.
4. Move one second further and return to 100%. Play the whole animation.

**Expected result:** a zoom from 100% to 120%, a pause, and a return. Check the values in your UI: some controls display percentages while others display native units.

## Control the motion

Right-click a keyframe on the selected clip to choose Linear, Ease In, Ease Out, Ease In and Out, or Hold. Linear moves at a constant rate. Easing makes the speed change gradually. Hold keeps a value until the next keyframe, producing a step rather than a smooth change.

Drag a keyframe to change when it happens. Use the inspector's keyframe arrows to visit the exact times. New keyframes use the default in **Settings → Editing → Default keyframe interpolation**; changing the default does not rewrite existing keyframes.

Animation presets are another starting point in the Video inspector. Applying a preset can replace the properties it animates. Use Undo if it replaces motion you wanted to keep.
`, see: ['keyframes', 'inspector', 'paste-attributes'],
  },
  {
    id: 'caption-workflow', section: 'Editing', title: 'Generate, Correct and Deliver Captions',
    summary: 'From speech recognition to readable subtitles and the right export mode.',
    keywords: 'captions subtitles whisper speech model automatic transcribe language generate srt vtt timing import export burn embedded',
    body: `
Make sure the timeline contains audible speech. Automatic captions use a local speech model, separate from the chat model. No speech model is included in the installer: the first time you make captions, Reccut asks you to download one (Whisper Base, about 81 MB, is a good start). You can also download and remove models in Settings → AI. Recognition runs entirely on your computer.

## Generate captions

1. Open the **Captions** browser ({{key:browser:captions}}).
2. Choose the speech language and an installed model. Use Manage Models to install optional models or switch the active selection. Larger models can take longer and use more resources.
3. Choose **Generate captions**. Watch the background task, then inspect the caption track.
4. Play through the result. Correct names, punctuation, speaker changes and timing in the inspector and timeline.

## Import or write your own

Import SRT or WebVTT from the Captions browser. Use **Add Caption** ({{key:addCaption}}) at the playhead to write one manually. Drag caption edges to adjust timing. Caption times stay independent when you move or delete video; explicitly group captions with video when you want them to follow it.

**Example:** for a line that should run from 0:05 to 0:08, place a caption there, type the line and drag its end to 0:08. Leave enough time to read it, and avoid covering an important on-screen control.

## Style and translate

Adjust the sequence caption style: font, size, colour, outline, background, alignment and position. Reccut supports up to three lines, but short lines are easier to read. Ask the configured AI agent for translation when needed; that sends caption text to its provider. Read every translated line before publishing.

## Choose an export mode

- **Burn into the video** makes captions permanently visible. This preserves the rendered styling.
- **Embedded track** lets a compatible player switch captions on and off. Player support and styling vary.
- **Separate SRT** or **Separate WebVTT** creates a companion subtitle file. SRT is primarily text and timing, so do not expect Reccut's full visual styling to carry over.
- Combined modes can burn or embed captions while also writing SRT. **Leave out** omits them.

When exporting a custom range, check the first and last subtitle in the delivered result. Watch the exported file in the player your audience will use.
`, see: ['captions', 'ai-recipes', 'export-settings', 'background-tasks'],
  },
  {
    id: 'audio-recipe', section: 'Audio', title: 'Clean Speech and Mix Background Music',
    summary: 'A repeatable starting point for dialogue cleanup, component choice and music fades.',
    keywords: 'audio recipe speech voice cleanup music duck volume equalizer hum noise compressor limiter clipping mix',
    body: `
Start by choosing the right recording, then process it. A quiet microphone component plus an unintentionally enabled camera microphone can sound hollow even when neither is distorted.

![Audio properties include component switches, levels, volume and fades.](audio.jpg)

## Prepare the dialogue

1. Select the video and open Audio. Enable the intended microphone component; disable duplicate camera audio if an external recording replaces it.
2. Play an ordinary sentence and the loudest section. Set clip volume without red clipping.
3. In Audio Effects, try **Voice Clean Up** or add **High Pass** for low rumble and **Hum Removal** for a steady electrical tone.
4. Use **Noise Reduction** gently for steady background hiss. Compare with the effect off; aggressive reduction can affect the voice.
5. For uneven speech, try **Auto Level** or **Compressor**, and use a **Limiter** when you need to catch peaks. Compare at a similar perceived volume.

## Add music under speech

1. Import the music and connect it on an audio lane below the storyline. Trim it to the edit.
2. Lower the music while listening to the dialogue. For example, try −18 dB as a starting point, then adjust by ear.
3. Option/Alt-click the music's volume line to add four points around a spoken section. Lower the middle pair to create a quiet section with a transition on each side.
4. Drag the top-corner fade handles to fade music in and out. Play through the full mix and the ending.

## Check the delivery

Solo can help identify noise, but restore the full mix before judging the balance. Export a short range and listen through headphones and speakers. A limiter cannot repair sound that clipped in the original microphone recording.
`, see: ['audio', 'audio-effects', 'audio-reference', 'sync'],
  },
  {
    id: 'export-settings', section: 'Export', title: 'Export Controls: Format, Size, Quality and Captions',
    summary: 'Understand every group in the Export room and choose settings deliberately.',
    keywords: 'export advanced codec container format bitrate quality dimensions crop fit fps frame rate captions audio only source copies range queue',
    body: `
Quick Export is useful for the current edit. Choose **More Options**, or open **Export** ({{key:roomExport}}), for the full controls. The Export room can also convert files without placing them in an edit.

![The Export room with source, preview, output settings and export queue.](exportroom.jpg)

## Source and preview

Choose the project or a media source. Several files can be queued for conversion. The preview can show the full **Source** with its crop frame or the final **Output** framing. Preview quality in Edit does not set export resolution.

## Preset and format

Presets select a useful combination that you can change. Simple mode chooses a format and codec together. Advanced mode exposes the **Container**, **Video codec** and **Audio codec** separately. Only compatible combinations are offered. Audio only uses its own format list.

A container is the file wrapper, such as MP4 or MOV; a codec is the compression inside it, such as H.264. Choosing MOV alone does not mean the video is ProRes. See Export Format Reference for the supported combinations.

## Size, fit and crop

Set an output size or enter dimensions. The aspect lock keeps proportions while you change a dimension. **Fit** determines whether content is fitted with bars, filled by cropping, or stretched. Stretching can distort circles and faces.

Choose a crop aspect ratio and position it in the preview. For a portrait crop of a landscape video, move the crop over the important action and check the beginning, middle and end. Cropping the export does not reframe individual timeline clips for you.

## Frame rate and source media

Keep the sequence/source frame rate unless you need a specific delivery rate. A warning identifies source-rate combinations that may stutter. Where **Source media** is offered, choose whether to use available optimized copies or originals. A missing source remains a problem even if the timeline project file opens.

## Quality and bitrate

Higher quality or bitrate generally produces larger files. **Custom** quality exposes the video bitrate. Audio bitrate is separate. The estimated file size is an estimate: actual size depends on codec, content and duration. ProRes is intended for further editing and can be much larger than H.264; GIF has no sound.

## Range, captions and file

**Everything** exports the source duration. **Custom** sets From and To; check that this is the range you intend. Captions can be burned in, embedded, saved separately, combined with SRT, or left out. Container/player compatibility matters for embedded tracks.

Set the file name and destination, then start export. The queue shows running, queued, finished and failed jobs. You can keep editing while it renders; each job uses the edit/settings supplied when it was started. Cancel a running or queued job from its controls.
`, see: ['export', 'export-formats', 'export-recipes', 'caption-workflow', 'background-tasks'],
  },
  {
    id: 'export-recipes', section: 'Export', title: 'Export Examples: Web, Portrait, Master and Audio',
    summary: 'Four practical deliveries and a check of the file you actually made.',
    keywords: 'export examples youtube shorts instagram portrait vertical social prores master audio wav gif convert batch',
    body: `
## A landscape web video

Open the finished sequence, choose Export and start with **YouTube and Web**. Check the dimensions and keep a frame rate compatible with the footage. Use MP4 H.264 for broad playback compatibility. Choose burned-in captions if they must always be visible, or deliver a separate subtitle file when your destination accepts one. Watch the exported video before uploading it.

## A portrait version

Duplicate the sequence, change its size to 1080 × 1920, and reframe clips and titles in that version. Alternatively use a 9:16 crop in the Export room for a simple conversion. A single export crop has one framing choice, so a dedicated sequence gives you control when the subject moves.

## A master for further editing

Choose the **Master** preset for ProRes 422. In Advanced mode, select a supported ProRes variant if the receiving editor requires it. Use the intended dimensions and frame rate, leave enough disk space, and check caption delivery separately. A rendered master is a flattened video; **Package Project** is the way to hand over the editable project and source files.

## An audio file or silent GIF

Choose **Audio only** and a format such as WAV for an uncompressed audio file. Use MP3, AAC or Opus when the delivery needs compressed audio. For a short silent animation choose GIF and reduce the range, dimensions and frame rate to keep its size manageable. GIF does not carry audio.

## Convert several existing files

Drop files into the Export room and review each source's settings before queueing. You do not need to add them to a timeline first. Use the queue and Background tasks to check completion and any error messages.
`, see: ['export-settings', 'export-formats', 'sequence-settings', 'package'],
  },
  {
    id: 'background-tasks', section: 'Reference', title: 'Background Tasks, Progress and Cancellation',
    summary: 'Track exports, analysis, optimization, captions, packaging and plugin processing.',
    keywords: 'background tasks progress queue queued running cancel failed error finished optimize stabilize reverse transcribe export busy turquoise',
    body: `
Reccut performs long operations in background jobs. The progress control at the top of the application opens **Background tasks**. Exports also appear in the Export room's queue.

- **Queued** means the task is waiting for a worker. Heavy jobs may run in sequence to avoid exhausting the computer.
- **Running** shows the current operation and its progress when measurable.
- **Finished** means the operation completed. Use any result or reveal action shown by that task.
- **Failed** means the task ended with an error. Read its message before repeating the operation.

![Turquoise animated stripes identify clips undergoing analysis or processing.](clip-busy.jpg)

Turquoise stripes are a processing indicator, not a colour label. They can appear during stabilization, optimization or preparation of reverse media. A clip may play with its existing source while another version is being prepared.

Use **Cancel** on a queued or running job to stop it. Cancellation is not Undo: it does not remove edits you made before starting the task. **Clear finished** clears the completed entries from the list; it is not a command to delete your original media.

**Example:** if optimized media is queued behind an export, let the export finish or cancel the unneeded job. If a task fails because the output disk is full, free space or select another destination before starting it again.
`, see: ['optimize', 'export', 'recording-recovery', 'processor-guide'],
  },
  {
    id: 'troubleshooting', section: 'Reference', title: 'Troubleshooting: Picture, Sound, Editing and Export',
    summary: 'Start with the symptom and follow the relevant checks inside Reccut.',
    keywords: 'troubleshooting problem error black screen no sound offline missing media frozen slow lag stutter wrong crop cannot edit export failed help',
    body: `
## The viewer is black or shows MEDIA OFFLINE

For a recording preview, check the selected source and system permissions. In Edit, look for disabled clips, hidden video tracks, opacity at zero, masks and the playhead position. A MEDIA OFFLINE test card means a required file is unavailable: reconnect the disk or use **Relink File**. The offline card is also rendered into an export if the file is still missing.

## I cannot hear the clip

Check the system output device, lane mute, clip enabled state, audio-component switches, volume and any Solo selection. For a recording, use the microphone Test before a new take. System audio is a separate recording option. Expanded audio can have its own trimmed boundaries.

## Playback is slow

Try **Settings → Playback → Preview resolution** at Half or Third. This changes the preview, not the export size. Use optimized media for formats that are expensive to decode, and check whether stabilization, reversing or another heavy task is running. A file on a disconnected or slow disk can also delay playback.

## Shortcuts or tools do not respond

If you are typing, text input takes priority over editor keys. Click the timeline before trying an editing shortcut. Check **Settings → Keyboard** for customised or removed bindings. Locked tracks cannot be edited. The Help window has its own keyboard focus; return to Reccut for timeline shortcuts.

## A clip moves or disappears after an edit

The magnetic storyline closes gaps on deletion. Use the Position tool or the delete-with-gap command when you need to preserve timing. Grouped clips move together; Option/Alt-click selects one member. Check the active sequence and whether the clip is disabled or its track is hidden. Use Undo or Project History if needed.

## Export has the wrong picture or no captions

Check the open sequence, export source, custom range, size, fit/crop, and caption mode. Make sure keying is set to Composite rather than matte view. Check hidden tracks and disabled clips. Inspect the actual exported file in a compatible player; an embedded subtitle track may need to be enabled there.

## Export or processing fails

Read the error in Background tasks. Check free disk space, destination access and required source files. A custom processor may also need its executable, runtime or models. Try a short range to identify a troublesome section. For an AI error, use the dedicated connection guide.
`, see: ['offline', 'recording-setup', 'audio', 'ai-troubleshooting', 'export-settings'],
  },
  {
    id: 'glossary', section: 'Reference', title: 'Glossary: Editing, Colour and AI Terms',
    summary: 'Plain-English definitions for terms used in the interface and handbook.',
    keywords: 'glossary dictionary terminology definitions ripple magnetic storyline lane clip source sequence codec container lut hdr log keyframe alpha matte ai tool calling',
    body: `
## Projects and editing

- **Project:** the saved edit data and shared media library, normally inside a project folder.
- **Sequence:** one timeline, with its own format and edit, inside a project.
- **Media/source:** an imported recording, video, image or audio asset. A timeline clip refers to part of it.
- **Playhead:** the current time shown in the viewer. **Skimmer:** a temporary preview position under the pointer.
- **Magnetic storyline:** the main sequence of clips; trimming and deleting close up the surrounding edit.
- **Lane/track:** a horizontal timeline row for connected video, audio, titles or other clips.
- **Ripple:** change a duration and move following content to keep the storyline closed.
- **Roll:** move a cut while keeping the pair's total duration. **Slip:** change source content inside a fixed clip. **Slide:** move a clip while adjusting its neighbours.
- **J/L cut:** sound starts before or ends after its associated picture.
- **Source handles:** extra source material outside a clip's in/out points, useful for transitions and trim changes.

## Picture and delivery

- **Keyframe:** a saved property value at a particular time. **Easing:** how the value changes between keyframes.
- **Mask:** a shape controlling what part of a clip or effect is visible.
- **Matte:** the transparency map. White is visible, black is transparent. **Alpha:** transparency stored with the image/video.
- **Chroma key:** remove a chosen background colour. **Despill:** reduce background colour contamination at the edge.
- **LUT:** a lookup table transforming colours. A camera LUT converts a particular camera encoding; a creative look changes the style.
- **LOG:** a camera tone encoding intended for later grading. **HDR:** a wider brightness range such as PQ or HLG; Reccut previews imported HDR tone-mapped to SDR.
- **Codec:** how picture or sound is encoded. **Container:** the wrapper holding it, such as MP4 or MOV.
- **Bitrate:** data used per second; it affects file size and quality. **Frame rate:** frames shown per second.
- **Optimized media:** a generated working copy for easier playback. Keep originals available for future use.
- **Burned-in captions:** text rendered permanently into picture. **Embedded captions:** a separate selectable stream inside a file.

## Sound and AI

- **dB:** a relative level change. **dBFS:** a digital audio meter where 0 is the maximum; clipping occurs above it.
- **Compressor:** reduces differences between loud and quiet portions. **Limiter:** catches peaks above its limit.
- **Provider/endpoint:** the service and API base URL receiving model requests.
- **Model ID:** the exact identifier accepted by that server. **Tool calling:** the model's ability to request Reccut actions instead of only returning text.
- **Vision model:** accepts images as input. **Local model:** runs on a separately installed server on your computer or network.
- **Processor/plugin:** a tool that can run an operation on media, separate from the chat model itself.
`, see: ['first-edit', 'tools', 'ai-setup', 'export-settings'],
  },
  {
    id: 'command-reference', section: 'Reference', title: 'All Commands and Menu Locations',
    summary: 'The live list of application commands, their guides and your current shortcuts.',
    keywords: 'all commands menus reference list actions shortcut keyboard tool',
    body: `
This list comes from Reccut's command registry. Open **Read guide** for an explanation, or choose **Run in Reccut** to perform that action in the current project. Editing actions use the current playhead and selection and may change the timeline. A command can be unavailable when its required selection or project state is missing.

Shortcuts shown here include your changes in Settings → Keyboard. For only the commands with assigned keys, open Keyboard Shortcuts.
`, see: ['shortcuts', 'tools', 'search'],
  },
];
