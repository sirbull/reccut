// Hjelpeartiklene. Teksten er på engelsk, som resten av appen. Se Help.jsx for formatet:
// ## overskrift, - punkt, ![bildetekst](fil.jpg), **fet**, {{key:kommando}} og [[run:kommando|Tekst]].
export const SECTIONS = ['Getting Started', 'Recording', 'Media', 'Editing', 'Audio', 'Look', 'Export', 'Reference'];

export const ARTICLES = [
  {
    id: 'welcome',
    section: 'Getting Started',
    title: 'Welcome to Reccut',
    summary: 'Record your screen and camera, edit like in Final Cut Pro, and export to almost any format.',
    keywords: 'overview rooms start',
    body: `
Reccut has three rooms, shown at the top of the window. Switch between them with {{key:roomRecord}}, {{key:roomEdit}} and {{key:roomExport}}.

- **Record** captures your screen, camera and microphone, with keystrokes and cursor zoom.
- **Edit** is a magnetic timeline editor with the tools and shortcuts from Final Cut Pro.
- **Export** turns the project, or any file, into the format you need.

![The Edit room: browser on the left, viewer in the middle, inspector on the right and the timeline below.](overview.jpg)

Everything belongs to a project. A project is a folder that holds the project file, your recordings, copied media, optimized media and exports.

## Finding things fast

Press {{key:findCommand}} and type what you want to do, for example "blade", "sync" or "color". Press Enter and the command runs, or the tool or panel opens. On a Mac you can also search in the Help menu, like in other Mac apps. Every command shows its shortcut in the menus and in the search.

[[run:findCommand|Search commands]] [[run:shortcuts|Show all shortcuts]]
`,
    see: ['projects', 'search', 'shortcuts'],
  },
  {
    id: 'projects',
    section: 'Getting Started',
    title: 'Projects and Folders',
    summary: 'Every project gets its own folder with all its files.',
    keywords: 'new open save location folder trash',
    body: `
When you create a project, you give it a name and choose where it should be saved. Reccut creates a folder with that name, containing:

- **the project file** (.reccut), saved automatically after every change
- **Media**, for files you import with "Copy to project folder"
- **Recordings**, for everything you record while the project is open
- **Optimized Media**, for clips converted to an edit friendly format
- **Exports**, the default place for finished videos

![New Project: name, location and format.](newproject.jpg)

The open project is shown at the top of the window. Click it to open another project. The Projects window lists recent projects; use Open Other to open a project file from anywhere, and the ⋯ button to reveal a project, remove it from the list or move it to the Trash.

[[run:newProject|New Project]] [[run:openProject|Open Project]] [[run:revealProject|Reveal Project Folder]]
`,
    see: ['import', 'recording'],
  },
  {
    id: 'search',
    section: 'Getting Started',
    title: 'Quick Search',
    summary: 'Press Control Space, type the name of anything, and it is applied or opened.',
    keywords: 'command palette find help menu console fx console effects tools',
    body: `
Press {{key:findCommand}} anywhere in Reccut, even while you are typing in a field. A search window opens in the middle of the screen. Type a few letters of what you want and press Enter:

- **Effects** are applied to the selected clips (or the clip under the playhead), and the effect is shown and highlighted in the inspector so you can adjust it right away.
- **Transitions** are added at the selected edit, or the edit nearest the playhead.
- **Titles** are added at the playhead.
- **Looks** and **animations** are applied to the selected clips.
- **Settings** such as Exposure, Scale or Volume open the right tab in the inspector, and the setting is highlighted with its number field ready to type in.
- **Tools** are switched on and the tool button flashes.
- **Commands** run, and **media** is found and highlighted in the browser.
- **Help** articles open in the help window.

![Quick Search. The label on the left shows what kind of result it is, and commands show their shortcut.](palette.jpg)

The top right corner shows how many clips are selected, so you know what an effect will be applied to. Press {{key:findCommand}} again or Escape to close it. You can also open it with Cmd K (Ctrl K on Windows) or the question mark at the top right.

On a Mac the Help menu also has a search field. Type a word and macOS points to the menu item, just like in other Mac apps. The help window ({{key:help}}) has its own search with articles and pictures.
`,
    see: ['shortcuts', 'effects'],
  },
  /* Opptak */
  {
    id: 'recording',
    section: 'Recording',
    title: 'Recording Screen and Camera',
    summary: 'Screen, camera and microphone are recorded separately, so everything can be changed afterwards.',
    keywords: 'record capture webcam pip layout keystrokes cursor zoom system audio',
    body: `
Choose a screen, a camera and a microphone in the Record room. Turn on system audio to record the sound from your computer.

![The Record room. The layouts at the bottom switch between camera, screen and picture in picture.](record.jpg)

- The layout buttons, or the global shortcuts shown on them, switch between camera full screen, screen only and the camera in a corner. They work even when another app is in front.
- Choose the camera shape (circle, square or 16:9), size and mirroring.
- **Show keystrokes** shows shortcuts you press, but never normal typing and never Reccut's own shortcuts.
- **Cursor zoom** zooms in on the mouse pointer while you hold the chosen key.
- The recording is saved in the Recordings folder of the open project and added to its media. If the timeline is empty, it is also placed on the timeline.

Everything is saved as separate files, so in the editor you can still change the layout, camera shape, overlays and the level of the microphone and system audio.
`,
    see: ['projects', 'editing'],
  },

  /* Media */
  {
    id: 'import',
    section: 'Media',
    title: 'Importing Media',
    summary: 'Copy files into the project, or leave them where they are.',
    keywords: 'import copy leave in place formats drag',
    body: `
Choose Import Media ({{key:import}}) and select files, or drag files into the browser or the timeline. Almost any video, audio and image format works, including ProRes, DNxHR, 10-bit H.264, HEVC, MKV, MXF, WAV, AIFF, FLAC, HEIC and camera RAW photos.

![Import options.](import.jpg)

- **Copy to project folder** copies the files into the Media folder of the project. The project keeps working if the originals are moved or a drive is disconnected.
- **Leave files in place** refers to the files where they are, which saves disk space.
- **Create optimized media** converts the clips to an edit friendly format in the background.
- **Synchronize audio files with video** matches audio files to the video clips and merges them, ready for editing.

Your choices are remembered and used when you drag files in. Files that cannot be played directly are converted in the background, and files that cannot be read are listed in a message.

[[run:import|Import Media]]
`,
    see: ['optimize', 'sync', 'hdr'],
  },
  {
    id: 'browser',
    section: 'Media',
    title: 'The Browser',
    summary: 'Filmstrips you can skim, select and drag to the timeline.',
    keywords: 'browser filmstrip select multiple range skim',
    body: `
The browser shows every clip as a small filmstrip with its waveform. Hold the pointer over a clip to skim it. Drag across a clip to select a range, then add it with E, W, Q or D.

![Media in the browser. Badges show optimized media, merged audio, HDR and RAW.](browser.jpg)

- Click to select a clip, {{key:selectAll}} to select all media while you work in the browser, Cmd or Ctrl click to add a clip, and Shift click to select a row of clips.
- Right click for more: Synchronize Audio, Optimize Media, Reveal in Finder and Remove from Project.
- Drag several selected clips to the timeline to place them one after another.

The browser tabs hold titles, transitions, effects and captions. Show them with {{key:browser:media}}, {{key:browser:titles}}, {{key:browser:transitions}}, {{key:browser:effects}} and {{key:browser:captions}}.
`,
    see: ['adding', 'skimming', 'sync'],
  },
  {
    id: 'optimize',
    section: 'Media',
    title: 'Optimized Media',
    summary: 'Convert clips to a high quality format that is smooth to edit.',
    keywords: 'optimize transcode proxy prores convert background',
    body: `
Camera files are often hard to decode, which makes skimming and playback heavy. Optimize Media ({{key:optimize}}) converts the selected clips in the background:

- 8-bit clips become H.264 with a keyframe every half second, at very high quality.
- 10-bit and HDR clips become 10-bit VP9, so the extra precision is kept for color correction.

The files are saved in the Optimized Media folder of the project and used for playback and export from then on. Progress is shown at the top of the window, where you can also cancel it. The original files are never changed.

You can also choose Create optimized media when you import.

[[run:optimize|Optimize Selected Media]]
`,
    see: ['import', 'hdr'],
  },
  {
    id: 'hdr',
    section: 'Media',
    title: 'HDR, 10-bit and RAW',
    summary: 'How Reccut handles HDR video, 10-bit clips and camera RAW photos.',
    keywords: 'hdr pq hlg 10 bit raw dng cr2 nef arw tone mapping',
    body: `
**HDR video** (PQ and HLG, for example from iPhones and mirrorless cameras) is detected when you import it, and marked HDR in the browser. Reccut shows and exports it tone mapped to normal SDR, so it looks right on every screen, and keeps 10 bits in the working copy for color correction. Exporting in HDR is not supported yet.

**10-bit clips** keep their precision: optimized media stays 10-bit, and color correction is calculated in 16-bit floating point.

**Camera RAW photos** (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2 and more) are imported using the full size JPEG the camera stores inside the file, with the camera's white balance and the right orientation. The RAW data itself is not developed. RAW video formats such as Blackmagic RAW, R3D and ProRes RAW are not supported.

The Info tab in the inspector shows the bit depth, HDR format and which file is used for playback.

![Info tab.](info.jpg)
`,
    see: ['color', 'optimize'],
  },
  {
    id: 'layers',
    section: 'Media',
    title: 'Photoshop and Illustrator Layers',
    summary: 'Import a PSD or SVG and choose which layers to use.',
    keywords: 'photoshop psd psb illustrator ai svg layers layered graphics logo',
    body: `
Import a Photoshop file (.psd or .psb) or an SVG with layers, and Reccut shows its layers with small previews. Tick the layers you want; hidden layers start unticked.

![Choosing layers from a Photoshop file.](layers.jpg)

- **Separate layers**: each layer becomes an image with transparency, in the size of the document, so the layers line up exactly. With Add to the timeline, they are stacked above the storyline, the bottom layer lowest, and grouped so they move together. Animate each layer in the Video tab, for example to slide a logo in.
- **One merged image**: the ticked layers are combined into one image.

The images are saved in the project's Media folder.

Photoshop files in RGB, grayscale and CMYK, 8, 16 and 32 bit, are supported, with layer groups, names and opacity. Blend modes, masks, adjustment layers and layer styles are not applied.

**Illustrator:** save the artwork as SVG (File > Save As > SVG, or Export As SVG). Each top level layer in Illustrator becomes a layer in Reccut, drawn sharp at a large size. Illustrator files (.ai) cannot be read directly; you can also export them from Illustrator as a Photoshop file with layers.
`,
    see: ['import'],
  },
  {
    id: 'offline',
    section: 'Media',
    title: 'Media Offline and Relinking',
    summary: 'Missing files are shown as a test card with the file name.',
    keywords: 'offline missing relink moved disconnected drive test card',
    body: `
If a file the project uses has been moved, renamed or is on a drive that is not connected, Reccut shows a test card instead of the picture, in the style of the classic television test card. The name of the missing file is at the top and MEDIA OFFLINE at the bottom. The card is drawn for the format of the project, so the circle stays round in 16:9, 4:3, square and vertical projects. Exports show the same card, so nothing is silently left out.

![The Media Offline test card.](offline.jpg)

- Missing media gets a red OFFLINE badge in the browser, and its clips are striped red on the timeline.
- Reccut checks again when the project opens and every time you come back to the window, so a drive that is connected again is found automatically.
- If optimized media or a playable copy still exists, the clip keeps playing from that.
- To find a file yourself, right click the clip in the browser and choose Relink File ({{key:relink}}), then pick the file. The clips on the timeline keep all their edits.
- Copy to project folder when you import, and the project keeps working even if the originals are moved.

[[run:relink|Relink File]]
`,
    see: ['import', 'projects'],
  },
  {
    id: 'sync',
    section: 'Media',
    title: 'Synchronizing Audio',
    summary: 'Line up sound from an external recorder with your video automatically.',
    keywords: 'sync synchronize audio external recorder microphone merge auto sync waveform',
    body: `
Reccut compares the sound in your video clips with audio files from an external recorder or microphone, and finds where they match. It works on the loudness of the sound, so different microphones and levels do not matter.

## In the browser: merge before you edit

Select the video clips and the audio files that belong to them (for example everything with {{key:selectAll}}), then choose Synchronize Audio ({{key:syncAudio}}) or right click and choose it there.

- Each audio file is added to the matching video clips as an extra audio track. One long recording can match many video clips, and one clip can get audio from several recorders.
- The camera audio is switched off, but kept. When you drag the clip to the timeline it brings both tracks, with the camera audio switched off. Switch between them whenever you like.
- Remove Synchronized Audio ({{key:removeSync}}) takes the merged audio away again.

## On the timeline: place audio under the video

Put an audio clip below the timeline, select it and choose Auto Sync Audio ({{key:autoSync}}), or right click it.

- If the audio is longer than the video, it is trimmed to the video. If it is shorter, it is just moved to the right place.
- Every video clip is compared with the whole recording, so each piece is placed where its sound matches, even when the clips are in a different order than they were recorded.
- If the audio matches several clips, you choose Sync to First Clip or Split and Place, which puts a piece under each clip.
- The synced audio can be grouped with the video, and the camera audio switched off (but kept). These choices are remembered, and are also in Preferences.
- Select several audio clips to sync them all at once, or select video clips too to sync only to those.
`,
    see: ['audio', 'grouping', 'enable'],
  },

  /* Redigering */
  {
    id: 'editing',
    section: 'Editing',
    title: 'The Timeline',
    summary: 'A magnetic storyline with connected clips above and audio below.',
    keywords: 'timeline storyline magnetic lanes tracks connected',
    body: `
The main row is the **storyline**. Clips in it always sit next to each other, so there are never accidental gaps. Video, images and titles can be connected above the storyline, and audio is placed below. Connected clips move with the storyline clip they sit on.

![The timeline with track headers on the left.](timeline.jpg)

- The track headers hide a track, mute it or lock it. Use + Video and + Audio to add tracks, or drop a clip on the empty row at the top or bottom.
- Lift from Storyline ({{key:lift}}) moves a clip up so you can place it freely; Overwrite to Storyline ({{key:overwriteDown}}) brings it back.
- Insert Gap ({{key:insertGap}}) adds an empty space at the playhead.
- Zoom with {{key:zoomIn}} and {{key:zoomOut}}, or {{key:zoomFit}} to fit everything.
- Snapping ({{key:snapping}}) makes clips and the playhead snap to edits and markers.
`,
    see: ['tools', 'adding', 'grouping'],
  },
  {
    id: 'timeline',
    section: 'Editing',
    title: 'Moving and Deleting Clips',
    summary: 'Delete closes the gap; Shift Delete leaves it.',
    keywords: 'delete move gap lift overwrite storyline',
    body: `
Drag a clip in the storyline to move it; the other clips make room. Drag connected clips freely in time and between tracks.

- Delete ({{key:delete}}) removes the selection and closes the gap.
- Delete and Leave Gap ({{key:deleteGap}}) leaves an empty space.
- Cut, copy and paste work as usual ({{key:cut}}, {{key:copy}}, {{key:paste}}). Pasted clips are placed at the playhead.
- Comma and period nudge a clip one frame ({{key:nudgeLeft}} {{key:nudgeRight}}).
`,
    see: ['editing', 'tools'],
  },
  {
    id: 'tools',
    section: 'Editing',
    title: 'Tools',
    summary: 'Select, Trim, Position, Range, Blade, Zoom and Hand.',
    keywords: 'tools select trim position range blade zoom hand cursor',
    body: `
The tools are in the toolbar above the timeline. The pointer changes to show what will happen.

![The timeline toolbar with tools, snapping, skimming and audio skimming.](toolbar.jpg)

- **Select** ({{key:tool:select}}) selects, moves and trims clips.
- **Trim** ({{key:tool:trim}}) rolls the edit between two clips, slips the content inside a clip, or slides a clip with Option (Alt).
- **Position** ({{key:tool:position}}) moves clips freely and leaves gaps behind.
- **Range** ({{key:tool:range}}) selects a part of the timeline.
- **Blade** ({{key:tool:blade}}) cuts where you click.
- **Zoom** ({{key:tool:zoom}}) zooms in where you click; Option (Alt) click zooms out.
- **Hand** ({{key:tool:hand}}) drags the timeline around.
`,
    see: ['trimming', 'cutting', 'range'],
  },
  {
    id: 'adding',
    section: 'Editing',
    title: 'Adding Clips to the Timeline',
    summary: 'Append, insert, connect or overwrite.',
    keywords: 'append insert connect overwrite e w q d drag',
    body: `
Select a clip or a range in the browser, then:

- **Append** ({{key:append}}) adds it to the end of the storyline.
- **Insert** ({{key:insert}}) puts it at the playhead and pushes the rest to the right.
- **Connect** ({{key:connect}}) places it above the storyline at the playhead.
- **Overwrite** ({{key:overwrite}}) replaces what is in the storyline from the playhead.

You can also drag clips from the browser to the timeline, or drop files straight from the Finder or Explorer.
`,
    see: ['browser', 'editing'],
  },
  {
    id: 'cutting',
    section: 'Editing',
    title: 'Cutting Clips',
    summary: 'Blade at the playhead or with the Blade tool.',
    keywords: 'blade cut split razor',
    body: `
Blade ({{key:blade}}) cuts the selected clips, or the storyline clip, at the playhead. Blade All ({{key:bladeAll}}) cuts every clip under the playhead. With the Blade tool ({{key:tool:blade}}) you cut where you click, and a line shows where the cut will be.

When you cut through every clip in a group, the right hand pieces become a new group.
`,
    see: ['trimming', 'grouping'],
  },
  {
    id: 'trimming',
    section: 'Editing',
    title: 'Trimming',
    summary: 'Drag edges, roll, slip and slide.',
    keywords: 'trim roll slip slide edge playhead',
    body: `
Drag the start or end of a clip to trim it. In the storyline, the following clips move along.

- Trim Start ({{key:trimStart}}) and Trim End ({{key:trimEnd}}) trim the selected clip to the playhead.
- With the Trim tool, drag an edit point to roll it, drag inside a clip to slip it, and hold Option (Alt) to slide it.
- With expanded audio you can drag the audio edges past the video, for J and L cuts.
`,
    see: ['tools', 'audio'],
  },
  {
    id: 'enable',
    section: 'Editing',
    title: 'Switching Clips Off',
    summary: 'V switches a clip off and on. It stays on the timeline, greyed out.',
    keywords: 'disable enable v toggle grey component mute',
    body: `
Enable or Disable ({{key:toggleEnabled}}) switches the selected clips off and on. A clip that is off stays on the timeline, but greyed out, and is not seen or heard.

It works the same for audio components: expand the audio ({{key:expandAudio}}), click one of the audio tracks in the clip, and press {{key:toggleEnabled}} to switch only that track off or on.
`,
    see: ['audio', 'sync'],
  },
  {
    id: 'grouping',
    section: 'Editing',
    title: 'Grouping Clips',
    summary: 'Keep video and audio together.',
    keywords: 'group ungroup link attach follow',
    body: `
Select clips, for example a video clip and the audio below it, and choose Group Clips ({{key:group}}). Grouped clips have a link badge.

- Moving the video moves the audio too, even if the audio starts before the video.
- A click selects the whole group; Option (Alt) click selects one clip.
- Deleting the video in the storyline deletes the grouped audio.
- Copy and paste makes a new group.

Ungroup ({{key:ungroup}}) separates them again.
`,
    see: ['sync', 'cutting'],
  },
  {
    id: 'range',
    section: 'Editing',
    title: 'Ranges',
    summary: 'Mark a part of the timeline with I and O.',
    keywords: 'range in out mark selection',
    body: `
Set the start of a range with {{key:setIn}} and the end with {{key:setOut}}, or drag with the Range tool ({{key:tool:range}}). Playback and export can use the range. Clear it with {{key:clearRange}}.
`,
    see: ['export'],
  },
  {
    id: 'markers',
    section: 'Editing',
    title: 'Markers',
    summary: 'Mark moments to come back to.',
    keywords: 'marker mark note',
    body: `
Add a marker at the playhead with {{key:addMarker}}. Markers are shown above the timeline; click one to jump to it, or right click to delete it. Delete Marker ({{key:deleteMarker}}) removes the marker closest to the playhead. The playhead and clips snap to markers.
`,
    see: ['playback'],
  },
  {
    id: 'playback',
    section: 'Editing',
    title: 'Playback and Navigation',
    summary: 'Space, J K L, arrows and full screen.',
    keywords: 'play pause reverse jkl frame step full screen home end',
    body: `
![The viewer with the transport controls.](viewer.jpg)

- {{key:play}} plays and pauses. {{key:playReverse}} plays backwards.
- {{key:shuttleBack}} {{key:stop}} {{key:shuttleForward}}: play backward, stop, play forward. Press J or L again to go faster.
- {{key:prevFrame}} and {{key:nextFrame}} step one frame, with Shift ten frames.
- {{key:prevEdit}} and {{key:nextEdit}} jump to the previous and next edit.
- {{key:goStart}} and {{key:goEnd}} go to the start and end.
- {{key:viewerFullscreen}} plays full screen.

Reversed clips and backwards playback use a reversed copy made in the background, so they play smoothly with sound.
`,
    see: ['skimming', 'speed'],
  },
  {
    id: 'skimming',
    section: 'Editing',
    title: 'Skimming',
    summary: 'Preview by moving the pointer, with sound.',
    keywords: 'skim skimming audio scrub preview',
    body: `
With skimming on ({{key:skimming}}), the viewer shows the frame under the pointer when you move over the timeline or a clip in the browser. Audio skimming ({{key:audioSkimming}}) plays short pieces of sound while you skim.
`,
    see: ['browser', 'playback'],
  },
  {
    id: 'speed',
    section: 'Editing',
    title: 'Speed, Reverse and Freeze',
    summary: 'Slow motion, fast forward, speed ramps, reverse and freeze frames.',
    keywords: 'speed retime slow fast ramp reverse backwards freeze hold',
    body: `
Show Speed Controls ({{key:retime}}) opens the Speed tab for the selected clip.

![The Speed tab.](speed.jpg)

- Choose a preset speed or type your own. Slow 50% is {{key:speedSlow}}, Fast 2x is {{key:speedFast}} and Normal is {{key:speedNormal}}.
- **Reverse** ({{key:reverse}}) plays the clip backwards, with sound.
- **Speed ramps** change the speed smoothly across the clip. The presets have shortcuts from {{key:ramp:to0}} upwards, and Remove Ramp is {{key:ramp:none}}.
- **Freeze Frame** ({{key:freeze}}) holds the frame at the playhead.
- Preserve pitch keeps voices sounding natural when the speed changes.
`,
    see: ['playback'],
  },
  {
    id: 'transitions',
    section: 'Editing',
    title: 'Transitions',
    summary: 'Dissolves, wipes, pushes and audio crossfades.',
    keywords: 'transition dissolve crossfade wipe push fade',
    body: `
Add Cross Dissolve ({{key:addTransition}}) adds a dissolve at the selected edit. More transitions are in the Transitions browser ({{key:browser:transitions}}); hold the pointer over one to preview it, and drag it to an edit.

Select two audio clips that touch and press {{key:addTransition}} to add an audio crossfade. The default length is set in Preferences.
`,
    see: ['audio', 'preferences'],
  },
  {
    id: 'titles',
    section: 'Editing',
    title: 'Titles',
    summary: 'Titles from templates, with animation, any font, color, position and size.',
    keywords: 'title text font chapter end card',
    body: `
Add Title ({{key:addTitle}}) adds a title at the playhead. The Titles browser ({{key:browser:titles}}) has lower thirds, titles and your own templates, each with a live preview: hold the pointer over one to see the animation, click to add it at the playhead, or drag it to the timeline.

![The Titles browser.](titles.jpg)

Select the title to change it in the inspector: the text in the Text tab, and position, size, rotation and opacity in the Video tab. You can also drag the title in the viewer.
`,
    see: ['lower-thirds', 'templates'],
  },
  {
    id: 'lower-thirds',
    section: 'Editing',
    title: 'Lower Thirds',
    summary: 'Type a name and title, set the length, and the animation in and out takes care of itself.',
    keywords: 'lower third supring name super chyron animation in out',
    body: `
Add Lower Third ({{key:addLowerThird}}) puts an animated lower third at the playhead, or pick one of the designs under Lower Thirds in the Titles browser: Bar, Line, Box, Split, News Band, Minimal, Tag and Right Corner.

![A lower third on the timeline, with the Text tab on the right.](lowerthird-full.jpg)

- Type the **name** and the **title** in the Text tab. The box grows with the text.
- The lower third **animates in at the start of the clip and out at the end**. Drag the end of the clip on the timeline to keep it on screen longer; the animations stay the same.
- Change how long the animations take under Animation, if you like. "On screen" shows how long it stands still.
- Change the **colors** and the **font**, or switch to another design with Template. Your text is kept.
- Move it and change its size in the Video tab, or drag it in the viewer.
- In vertical and square projects the lower third stays in its corner.

![The Text tab for a lower third.](lowerthird.jpg)
`,
    see: ['templates', 'titles'],
  },
  {
    id: 'templates',
    section: 'Editing',
    title: 'Your Own Templates (After Effects)',
    summary: 'Design lower thirds in After Effects and use them in Reccut.',
    keywords: 'template after effects jsx script reccut-title custom design kit export',
    body: `
Reccut titles are made from templates in an open format, .reccut-title. You can make your own in After Effects with the Template Kit ({{key:templateKit}}), or by hand.

The kit has:

- **Reccut Lower Third Starter.jsx**, which builds a ready made lower third composition in After Effects.
- **Export to Reccut.jsx**, which saves the open composition as a .reccut-title file.
- An example template and **FORMAT.md**, which describes the format.

## In After Effects

- Run the starter script with File > Scripts > Run Script File, and change the design.
- Write **{{name}}** and **{{title}}** where the user's text goes. Other words in braces, such as {{company}}, become extra fields.
- Keep the composition markers **in** and **out**. The animation before "in" plays at the start of the clip, the animation after "out" at the end, and the part between them lasts as long as the clip.
- Use text layers, shape layers with a rectangle and solids. Position, scale, rotation and opacity can be animated.
- Layer comments decide how Reccut uses a layer: **color=accent** makes the color changeable, **w=width(name) + 64** lets a box follow the text.
- Run Export to Reccut.jsx and save the file.

## In Reccut

Import the template ({{key:importTemplate}}), drop the .reccut-title file on Reccut, or click Import Template under Custom in the Titles browser. It is saved in the project, shows a live preview, and works like the built in lower thirds.

[[run:templateKit|Get the Template Kit]] [[run:importTemplate|Import Template]]
`,
    see: ['lower-thirds'],
  },
  {
    id: 'captions',
    section: 'Editing',
    title: 'Captions',
    summary: 'Subtitles with full styling, import, export and automatic captions.',
    keywords: 'captions subtitles srt vtt transcribe whisper',
    body: `
Add Caption ({{key:addCaption}}) adds a caption at the playhead. The Captions tab ({{key:browser:captions}}) generates captions automatically from speech, and imports and exports SRT and WebVTT. Captions can have one to three lines, any font, color, outline and background, and can be placed anywhere. When exporting, burn them in, embed them, or save them as a separate file.
`,
    see: ['export'],
  },
  {
    id: 'effects',
    section: 'Editing',
    title: 'Effects',
    summary: 'Blur, vignette, black and white, shadows, borders and more.',
    keywords: 'effects blur vignette sepia shadow border rounded',
    body: `
The Effects browser ({{key:browser:effects}}) shows every effect with a live preview. Drag an effect onto a clip, or select clips and click it. Adjust or remove effects in the Effects tab of the inspector ({{key:inspector:effects}}). All values can have keyframes.
`,
    see: ['keyframes', 'color'],
  },
  {
    id: 'inspector',
    section: 'Editing',
    title: 'The Inspector',
    summary: 'Select a clip and adjust it on the right, like in Final Cut Pro.',
    keywords: 'inspector properties keyframes animation easing position scale opacity crop info audio tabs',
    body: `
Select a clip and its properties appear in the inspector on the right. The icons at the top switch between the parts of the clip, and you only see the ones that fit the clip:

- **Text** for titles and lower thirds: the text, template, colors, font and animation.
- **Video** ({{key:inspector:video}}): opacity, position, scale, rotation, crop, animation presets and fades.
- **Color** ({{key:inspector:color}}): looks, light, color and color wheels.
- **Effects** ({{key:inspector:effects}}): the effects on the clip.
- **Audio** ({{key:inspector:audio}}): levels, audio components, volume, fades and the audio format.
- **Speed**: speed, reverse, ramps and freeze frames.
- **Info** ({{key:inspector:info}}): clip info.

![The Video tab with crop.](video.jpg)

## Clip info

The Info tab shows the clip on the timeline (name, start, duration, source in and out, lane and speed), the file it comes from (name, folder, format, size, bit rate, when it was recorded, camera and software) and the video and audio inside it (codec, resolution, frame rate, color, sample rate and channels). Rename the clip in the Name field.

![Clip info.](info.jpg)

## Keyframes

Click the diamond next to a value to add a keyframe at the playhead, and change the value at another time to animate it. Keyframes are shown on the selected clip; drag them to move them, and right click one to choose easing (Linear, Ease In, Ease Out, Ease In and Out or Hold). Number fields can be dragged sideways, clicked to type a value, or reached with Tab.
`,
    see: ['color', 'audio', 'lower-thirds'],
  },
  {
    id: 'keyframes',
    section: 'Editing',
    title: 'Keyframes',
    summary: 'Animate any value over time.',
    keywords: 'keyframe animate easing',
    body: `
Most values in the inspector, including position, scale, opacity, color, effects and volume, can have keyframes. Click the diamond to add one, use the arrows to jump between them, and right click a keyframe on the clip to change its easing.
`,
    see: ['inspector'],
  },

  /* Lyd */
  {
    id: 'audio',
    section: 'Audio',
    title: 'Audio Editing',
    summary: 'Volume, fades, components, J and L cuts, detach and solo.',
    keywords: 'audio volume fade expand detach solo components j cut l cut',
    body: `
![The Audio tab with audio components.](audio.jpg)

- Drag the volume line on a clip, or use {{key:volumeUp}} and {{key:volumeDown}}. Option (Alt) click the line to add a volume keyframe.
- Drag the fade handles at the top corners of the audio to fade in and out.
- **Expand Audio** ({{key:expandAudio}}) shows the audio below the video. Drag its edges past the video for J and L cuts.
- The **Levels** at the top of the Audio tab show the waveform of the clip with its peak and average level. Red means the audio clips (goes over 0 dBFS). Audio Format shows the codec, sample rate and channels of the file.
- **Audio components**: a clip can have several audio tracks, for example the camera microphone and synchronized audio from a recorder. Switch them on and off in the Audio tab, in the right click menu, or by clicking one in the expanded audio and pressing {{key:toggleEnabled}}. A track that is off is kept, greyed out.
- **Detach Audio** ({{key:detachAudio}}) turns the audio into separate clips.
- **Solo** ({{key:solo}}) plays only the selected clips.
`,
    see: ['sync', 'enable', 'transitions'],
  },

  /* Utseende */
  {
    id: 'color',
    section: 'Look',
    title: 'Color Correction',
    summary: 'Light, color and color wheels, calculated in high precision.',
    keywords: 'color correction grade exposure contrast highlights shadows saturation temperature tint wheels lift gamma gain looks',
    body: `
Select a clip and show Color ({{key:inspector:color}}).

![Color wheels for shadows, midtones and highlights.](color.jpg)

- **Looks** apply a ready made style in one click.
- **Light**: exposure, contrast, highlights and shadows.
- **Color**: saturation, temperature (warm or cool) and tint (green or magenta).
- **Color wheels**: drag the dot in Shadows, Midtones or Highlights to tint that part of the picture, and use the slider below to make it lighter or darker. Double click a wheel to reset it.

The correction runs on the graphics card in 16-bit floating point. 10-bit clips keep their smooth gradients, even when you push the shadows. The same calculation is used in the viewer and the export. Every value can have keyframes, and Reset Color sets everything back.
`,
    see: ['hdr', 'effects'],
  },

  /* Eksport */
  {
    id: 'export',
    section: 'Export',
    title: 'Exporting',
    summary: 'Quick export from the editor, or every option in the Export room.',
    keywords: 'export render share format mp4 mov prores gif audio crop size',
    body: `
Export ({{key:export}}) in the Edit room opens a quick export. More Options goes to the Export room, which also converts any file you drop on it.

![Quick export.](quickexport.jpg)

![The Export room with format, size, crop and captions.](exportroom.jpg)

- Formats include MP4 (H.264, HEVC), MOV, ProRes, WebM, MKV, animated GIF and audio only.
- Choose a preset, or set the size, frame rate, quality or bit rate yourself.
- Crop to another aspect ratio, for example 9:16 for Shorts, and move the crop in the preview.
- Captions can be burned in, embedded or saved as SRT or WebVTT.

Exports are saved in the Exports folder of the project by default, and run in the background so you can keep working.
`,
    see: ['captions', 'range'],
  },

  /* Referanse */
  {
    id: 'preferences',
    section: 'Reference',
    title: 'Preferences',
    summary: 'Default durations, skimming, sync and import choices.',
    keywords: 'preferences settings default duration',
    body: `
Open Preferences with {{key:prefs}}.

![Preferences.](prefs.jpg)

- Default lengths for transitions, audio crossfades, still images, titles and freeze frames.
- Skimming, audio skimming, snapping and preserve pitch.
- Whether Auto Sync Audio groups the audio with the video and switches off the camera audio.

[[run:prefs|Open Preferences]]
`,
  },
  { id: 'shortcuts', section: 'Reference', title: 'Keyboard Shortcuts', summary: 'Every shortcut in Reccut, grouped by menu.', keywords: 'keys keyboard hotkeys', body: '' },
];
