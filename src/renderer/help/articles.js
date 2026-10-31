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
    id: 'package',
    section: 'Getting Started',
    title: 'Packaging a Project for Archiving',
    summary: 'Copy the project and every file it uses into one folder, like Collect Files in After Effects.',
    keywords: 'package collect files archive reduce consolidate backup hand over move project media folder',
    body: `
**Package Project** ({{key:package}}) in the File menu copies the project file and all the files it uses into one new folder. The folder then holds everything needed to open the project later, on any computer, which is good for archiving and for handing a project over to someone else. Your open project is not changed.

Before packaging, you can tidy up, like Reduce Project in After Effects:

- **Remove unused media**: media in the browser that is not used on the timeline is left out.
- **Remove disabled clips**: clips that are switched off are removed. In the storyline they become gaps, so the edit does not move.
- **Remove switched off audio**: synced audio that is switched off in every clip is left out.
- **Remove clips on hidden tracks**.
- **Include optimized media**: larger, but smooth to edit right away.

The window shows how many files and how much space the package needs, and warns about files that are missing. The packaging runs in the background with progress at the top of the window, and it checks that there is enough free space and that every copy is complete.

The package folder contains:

- the project file (.reccut)
- **Footage**, with every video, audio and image file
- **Recordings**, with your screen and camera recordings
- **Package Report.txt**, listing what was copied, what was removed and anything that was missing

Thumbnails, waveforms and proxies are not included. They are made again automatically when the package is opened. The paths in the package are relative, so the folder can be moved or renamed.

[[run:package|Package Project]]
`,
    see: ['projects', 'offline'],
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

The open project is shown at the top of the window. Click it to open another project. The Projects window lists recent projects; use Open Other to open a project file from anywhere, and the ⋯ button to reveal a project, remove it from the list or move it to the Trash. You can also double click a .reccut file in Finder or Explorer to open it.

## Save As

**Save As** ({{key:saveAs}}) saves the project under a new name and location, in a new project folder. The media files stay where they are, and you continue working in the new project.

## Moving a project

The project file remembers where each file is, both as a full path and relative to the project file. If you move or copy the whole project folder, for example to another disk or computer, Reccut finds the files again. Thumbnails, waveforms and proxies are made again if they are missing.

To collect everything into one folder for archiving, use Package Project.

[[run:newProject|New Project]] [[run:openProject|Open Project]] [[run:saveAs|Save As]] [[run:package|Package Project]] [[run:revealProject|Reveal Project Folder]]
`,
    see: ['package', 'import', 'recording'],
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
    keywords: 'record capture webcam pip layout keystrokes cursor zoom system audio area region crop part of screen countdown',
    body: `
Choose a screen, a camera and a microphone in the Record room. Turn on system audio to record the sound from your computer.

## Record only part of the screen

Under **Record**, choose **Area** instead of Full Screen. The screen is covered with a dark layer: drag to select the area, drag the box or its corners to adjust it, and click **Use Area** (or press Return). The buttons at the bottom lock the shape to 16:9, 9:16, 1:1 or 4:3.

- **Adjust in Preview** shows the whole screen in the preview, so you can move and resize the area there instead.
- A thin frame on the screen shows the area while you are in the Record room. It turns red while you record. It is drawn just outside the area, so it never ends up in the video.
- Only the area is saved, so the rest of the screen never ends up in the file. The cursor zoom, clicks and keystrokes follow the area.

## Countdown

Choose a countdown of 3, 5 or 10 seconds under Recording. The numbers are shown in the preview and in the middle of the area on the screen. Press the record button again to cancel it.

![The Record room. The layouts at the bottom switch between camera, screen and picture in picture.](record.jpg)

- The layout buttons, or the global shortcuts shown on them, switch between camera full screen, screen only and the camera in a corner. They work even when another app is in front.
- Choose the camera shape (circle, square or 16:9), size and mirroring.
- **Show keystrokes** shows shortcuts you press, but never normal typing and never Reccut's own shortcuts.
- **Cursor zoom** zooms in on the mouse pointer while you hold the chosen key.
- The recording is saved in the Recordings folder of the open project and added to its media. If the timeline is empty, it is also placed on the timeline.

Everything is saved as separate files, so in the editor you can still change the layout, camera shape, overlays and the level of the microphone and system audio.
`,
    see: ['projects', 'editing', 'redact'],
  },

  /* Media */
  {
    id: 'import',
    section: 'Media',
    title: 'Importing Media',
    summary: 'Copy files into the project, or leave them where they are.',
    keywords: 'import copy leave in place formats drag',
    body: `
Choose Import Media ({{key:import}}) and select files, or drag files into the browser or the timeline. Reccut reads about as many formats as VLC, so you should not need to convert anything first:

- **Video:** MP4, MOV, MKV, WebM, AVI, MXF, MPEG 1 and 2, MPEG-TS, M2TS and AVCHD (.mts) from cameras, DV, FLV, WMV, 3GP, OGV, Y4M and raw H.264 or HEVC streams. Codecs include H.264 and HEVC (also 10-bit and 4:2:2), ProRes (also 4444 with alpha), DNxHD and DNxHR, AV1, VP8, VP9, FFV1, MJPEG and Theora.
- **Audio:** WAV, AIFF, FLAC, MP3, AAC and M4A, ALAC, Ogg, Opus, WMA, AC-3, E-AC-3, DTS, AMR, CAF, WavPack, TTA, Speex, MP2 and more.
- **Images:** JPEG, PNG, GIF, WebP, TIFF, BMP, TGA, EXR, HDR, DPX, JPEG 2000, QOI and camera RAW photos, plus layered PSD and SVG files.

Interlaced video (from TV and older cameras) is deinterlaced, video with transparency keeps its alpha, and damaged files are read as far as possible.

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
    summary: 'Filmstrips you can skim, mark with I and O, and add with a key or by dragging.',
    keywords: 'browser filmstrip select multiple range skim in out mark i o append insert connect overwrite drag row height zoom',
    body: `
The browser shows every clip as a filmstrip with its waveform, like in Final Cut Pro. Hold the pointer over a clip to skim it; the viewer shows the frame under the pointer.

![Media in the browser. Badges show optimized media, merged audio, HDR and RAW.](browser.jpg)

## Mark a range

- Skim to where the range should start and press {{key:setIn}}. Skim to the end and press {{key:setOut}}. A yellow frame shows the range, and the name bar shows its start, end and length.
- You can also drag across the filmstrip to select a range, and drag the yellow edges to adjust it.
- {{key:rangeClip}} marks the whole clip, and {{key:clearRange}} removes the range.
- A click in the filmstrip places the white browser playhead. I and O use it when the pointer is not over a clip.

## Put it in the timeline

- {{key:append}} appends the range to the end of the storyline.
- {{key:insert}} inserts it at the playhead, {{key:connect}} connects it above the storyline and {{key:overwrite}} overwrites from the playhead.
- Or drag the yellow range (or the clip name for the whole clip) down to the timeline.

## Row length and height

Use **Row** above the filmstrips to choose how much time each row shows, from the whole clip down to 5 seconds. Long clips then wrap over several rows, so you can find the exact moment. **Height** makes the frames bigger or smaller. Both are remembered.

## More

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

## Trackpad and mouse

- **Two fingers sideways** move along the timeline, **two fingers up and down** scroll between the tracks, like in Final Cut Pro. This also works over the track headers on the left.
- **Pinch** to zoom in and out. The point under the pointer stays where it is, so you zoom straight into the part you are looking at.
- With a mouse, the wheel scrolls up and down, Shift and the wheel scrolls sideways, and Ctrl or Cmd and the wheel zooms one step at a time. {{key:zoomFit}} fits the whole project.
- Snapping ({{key:snapping}}) makes clips and the playhead snap to edits and markers.
`,
    see: ['tools', 'adding', 'grouping'],
  },
  {
    id: 'timeline',
    section: 'Editing',
    title: 'Moving and Deleting Clips',
    summary: 'Delete closes the gap; Shift Delete leaves it. Make tracks taller or shorter.',
    keywords: 'delete move gap lift overwrite storyline track height taller shorter resize',
    body: `
Drag a clip in the storyline to move it; the other clips make room. Drag connected clips freely in time and between tracks.

- Delete ({{key:delete}}) removes the selection and closes the gap.
- Delete and Leave Gap ({{key:deleteGap}}) leaves an empty space.
- Cut, copy and paste work as usual ({{key:cut}}, {{key:copy}}, {{key:paste}}). Pasted clips are placed at the playhead.
- Comma and period nudge a clip one frame ({{key:nudgeLeft}} {{key:nudgeRight}}).

## Track height

Drag the bottom edge of a track header (to the far left of the timeline) to make the track taller or shorter, like in Premiere Pro. Hold Shift to change all video or all audio tracks at once, and double click the edge to go back to the standard height. Option (Alt) and scrolling over a track header does the same. A taller track shows bigger thumbnails and waveforms.
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
    id: 'colors',
    section: 'Editing',
    title: 'Color Coding Clips',
    summary: 'Give clips a color to keep track of them, and see which clips are being analyzed.',
    keywords: 'color label tag code mark clips busy analyzing working turquoise',
    body: `
Select one or more clips, video or audio, right click and choose a color under **Color**: Red, Orange, Yellow, Green, Blue, Purple, Pink, Brown or Gray. No Color removes it. The clip and its name bar take the color, so you can see at a glance which clips belong together, for example interviews in one color and B-roll in another. Audio clips get the color too, and so does the audio part of a video clip when it is expanded.

![Clips with color codes.](clip-colors.jpg)

Each color also has a shortcut, {{key:color:red}} to {{key:color:gray}} in the order above, and {{key:color:none}} removes the color. They are in the Clip menu under Color too.

## Clips that are being analyzed

While Reccut works on a clip in the background, for example analyzing motion for stabilization, creating optimized media or a reversed copy, the clip gets moving **turquoise stripes** and a progress bar along the bottom. Hold the pointer over it to see what is happening. Turquoise is never used as a color code, so a working clip always stands out. The stripes disappear when the work is done.

![A clip being analyzed for stabilization.](clip-busy.jpg)
`,
    see: ['stabilize', 'optimize'],
  },
  {
    id: 'grouping',
    section: 'Editing',
    title: 'Grouping Clips',
    summary: 'Keep any clips together: video, audio, titles, captions and redactions.',
    keywords: 'group ungroup link attach follow title caption',
    body: `
Select clips and choose Group Clips ({{key:group}}). Any kind of clip can be grouped: video, audio, images, titles, lower thirds, captions and redactions. Grouped clips have a link badge. If one of the clips is already in a group, the groups are joined into one.

- Moving the video moves the rest of the group too, for example the audio, a lower third and a caption, even if a clip starts before the video.
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
Set the start of a range with {{key:setIn}} and the end with {{key:setOut}}, or drag with the Range tool ({{key:tool:range}}). {{key:rangeClip}} marks the clip under the playhead. Playback and export can use the range. Clear it with {{key:clearRange}}.

When you work in the browser, the same keys mark a range in the clip under the pointer instead. See The Browser.
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
    id: 'stabilize',
    section: 'Editing',
    title: 'Stabilization',
    summary: 'Smooth out shaky handheld video, like in Final Cut Pro.',
    keywords: 'stabilize stabilization shaky handheld smooth tripod steady camera shake',
    body: `
Select a video clip and choose Stabilize Clip ({{key:stabilize}}), or turn on Stabilize in the Video tab. Reccut analyzes the camera motion in the background (progress is shown at the top), and the clip is stabilized as soon as the analysis is done. The analysis is saved, so it only runs once per file. To have it ready before you edit, turn on Analyze video for stabilization in Settings > Import.

![Stabilization in the Video tab.](stabilize.jpg)

- **Automatic** chooses for you: if the camera hardly moves it is locked like on a tripod, otherwise the movement is smoothed.
- **Smooth** keeps the camera movement, but takes out the shake. **Smooth X**, **Smooth Y** and **Smooth rotation** set how much each direction is smoothed. At 0 a direction is left as it is.
- **Tripod** removes all camera movement in the clip.
- **Zoom**: the picture is zoomed in just enough to hide the edges that moving it would show. Automatic shows how much. Choose Manual to set the zoom yourself; with less zoom, edges can show when the correction is large.

The same correction is used in the viewer and in exports. How it works: Reccut follows hundreds of points from frame to frame, finds the camera movement (sideways, up and down, and rotation) while ignoring things that move in the picture, smooths the path and moves each frame from the shaky path to the smooth one.
`,
    see: ['inspector'],
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
    id: 'masks',
    section: 'Editing',
    title: 'Masks',
    summary: 'Show only part of a clip, with shapes you can animate.',
    keywords: 'mask masking shape matte cut out rotoscope roto freeform bezier ellipse rectangle spotlight vignette feather expansion invert animate keyframe pen tool draw',
    body: `
A mask decides which part of a clip is visible. On a Blur, Pixelate or other effect clip, the mask decides where the effect works. Use it to cut out a person, frame a detail, make a spotlight, blend two clips, or hide part of the picture.

- Select a video, image, recording or title clip and choose **Add Rectangle Mask** ({{key:mask:rect}}), **Add Ellipse Mask** ({{key:mask:ellipse}}) or **Add Freeform Mask** in the Edit menu, or use the buttons in the **Masks** tab of the inspector.
- Click **Edit in Viewer** to show the shape in the viewer. Drag it to move it, and drag the handles to resize it. Hold Option (Alt) to resize from the center.
- **Freeform** masks have points: drag a point to move it, double click the outline to add a point, and Option (Alt) click a point to remove it. Turn on **Smooth curve** for soft curves through the points.

## Draw with the pen

Choose **Draw with Pen** in the Masks tab, or **Draw Mask with Pen** ({{key:mask:pen}}), like the pen tool in Premiere Pro. Click in the viewer to place points. Drag a little while you click to make the shape smooth. Click the first point, double click or press Return to close the shape. Backspace removes the last point and Escape cancels. The shape becomes a freeform mask that you can adjust and animate.

## Settings

- **Mode**: Add shows what is inside the shape, Subtract cuts the shape out, and Intersect keeps only where it overlaps the masks above it. Several masks can be combined.
- **Invert** turns the mask inside out.
- **Feather** gives the mask a soft edge, from slightly soft to a wide fade. **Expansion** makes the mask bigger or smaller around its edge, without moving the points. **Opacity** lets some of the hidden part show through.

## Animate a mask

Position, size, rotation, feather and opacity have their own keyframe buttons. For a freeform mask, the keyframe button next to **Shape** saves all the points at the playhead. Move the playhead, drag the points to the new shape, and Reccut moves every point smoothly between the keyframes, like rotoscoping. Points you add or remove are added or removed in every keyframe, so the animation keeps working.

The mask follows the clip when you move, scale or rotate it, and it looks the same in the viewer and in the exported file.
`,
    see: ['keyframes', 'redact'],
  },
  {
    id: 'redact',
    section: 'Editing',
    title: 'Redacting Passwords and Faces',
    summary: 'Pixelate, blur or cover part of the picture.',
    keywords: 'redact censor hide password private sensitive pixelate mosaic blur face license plate black box frosted sladd',
    body: `
Use a redaction to hide something in the picture, such as a password, an email address, a face or a license plate. A redaction is a clip of its own above the video, and it affects everything below it.

- Choose **Add Pixelate** ({{key:redact:pixelate}}) or **Add Blur** ({{key:redact:blur}}) in the Edit menu, or drag Pixelate, Blur, Solid or Frosted from the **Redact** section of the Effects browser ({{key:browser:effects}}) to the timeline.
- It is placed above everything at the playhead. If a range is marked ({{key:setIn}} and {{key:setOut}}), it covers the range; otherwise it lasts to the end of the clip below.
- Drag the box in the viewer to move it, and drag its corners and edges to resize it. Hold Option (Alt) to resize from the center. Drag outside the box to draw a new area.

## Effects for the whole frame

For full manual control, use **Blur**, **Pixelate** or **Frosted Glass** from the **Whole Frame** section of the Effects browser, or Add Blur Effect and Add Pixelate Effect in the Edit menu. The effect covers the whole picture, like an adjustment layer in Premiere Pro. Then draw a mask with the pen ({{key:mask:pen}}) in the Masks tab to choose where it works. Several masks can be combined, each with feather, expansion and keyframes, so the shape can follow and change with what you hide. You can also set the shape of any redaction to Whole Frame.

## Styles

- **Pixelate** turns the area into large blocks. Good for text and faces.
- **Blur** makes it soft. Use a high amount for text.
- **Solid** covers the area with a color. This is the safest for passwords, because nothing of the original is left.
- **Frosted** combines blur and blocks, like frosted glass.

In the Redact tab of the inspector you can choose the shape (rectangle, rounded, ellipse or **Freeform**), the amount, a soft edge, rotation and **Redact outside**, which hides everything except the area.

## Follow something that moves

Position, size and rotation can have keyframes. Go to where the object starts, click the keyframe button next to Position and Size, move the playhead and drag the box to the new place. Reccut moves the box smoothly between the keyframes.

With **Freeform** you can follow any shape: drag the points in the viewer, double click the outline to add a point and Option (Alt) click a point to remove it. Click the keyframe button next to **Shape** to animate the points, so the redaction can change shape over time. See Masks.

Redactions work the same in the viewer and in the exported file.
`,
    see: ['keyframes', 'effects'],
  },
  {
    id: 'effects',
    section: 'Editing',
    title: 'Effects',
    summary: 'Blur, vignette, black and white, shadows, borders and more.',
    keywords: 'effects blur vignette sepia shadow border rounded',
    body: `
The Effects browser ({{key:browser:effects}}) shows every effect with a live preview. At the top are the redactions for hiding passwords and faces, see Redacting Passwords and Faces. Drag an effect onto a clip, or select clips and click it. Adjust or remove effects in the Effects tab of the inspector ({{key:inspector:effects}}). All values can have keyframes.
`,
    see: ['keyframes', 'color', 'redact'],
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
    id: 'audio-effects',
    section: 'Audio',
    title: 'Audio Effects and Repair',
    summary: 'Clean up voices, remove noise and hum, equalize, and add reverb, distortion and lo-fi effects.',
    keywords: 'audio effects repair fix enhance noise reduction hum removal de-esser equalizer eq compressor limiter reverb echo distortion lo-fi bitcrusher telephone radio robot underwater templates presets',
    body: `
Open the **Audio Effects** browser ({{key:browser:audio}}). Click an effect or a template to add it to the selected clips, or drag it onto a clip. The effects are heard right away when you play, and the export sounds exactly the same.

## Templates

Templates are ready made chains of effects that you can adjust afterwards.

- **Fix and Enhance**: Voice Clean Up ({{key:audio:cleanup}}), Podcast Voice, Reduce Noise, Remove Hum (50 or 60 Hz), Remove Rumble, Even Out Levels, Broadcast Loud and Quiet Pauses.
- **Space**: Small Room, Concert Hall, Cathedral, Canyon Echo, Slapback and Far Away.
- **Creative and Lo-fi**: Telephone, Walkie-Talkie, Old Radio, Megaphone, Lo-fi Tape, Vinyl Record, 8-bit, Distorted, Blown Speaker, Robot, Alien, Underwater, Dreamy, Jet Flanger and Pulse.

## Effects

- **Repair**: High Pass (rumble and wind), Hum Removal, Noise Reduction, Noise Gate, De-esser and Auto Level.
- **EQ**: a 10 band Equalizer with a curve and presets such as Voice Boost, Podcast, Bass Boost and Clear Up Muddy, Low Pass and Band Pass.
- **Dynamics**: Compressor, Limiter, Gain, and Pan and Width.
- **Space**: Reverb and Echo (with ping pong).
- **Creative and Lo-fi**: Distortion (Warm, Hard or Fuzz), Bitcrusher, Lo-fi Tape (wobble, hiss, crackle), Chorus, Flanger, Tremolo and Robot.

## Adjust the effects

The effects on a clip are listed under **Audio Effects** in the Audio tab of the inspector ({{key:inspector:audio}}). They work from top to bottom. Switch an effect on or off to compare, move it up or down, or remove it. You can also add effects and templates from the two menus at the top.

**Noise Reduction** learns the steady background noise in the pauses, so it works best on speech. It takes a second to learn when the clip starts. A constant tone or hum is treated as noise, so for those use Hum Removal or the Equalizer instead.

To use the same effects on other clips, see Copying Effects Between Clips.
`,
    see: ['audio', 'paste-attributes'],
  },
  {
    id: 'paste-attributes',
    section: 'Editing',
    title: 'Copying Effects Between Clips',
    summary: 'Paste Effects and Paste Attributes, like in Final Cut Pro.',
    keywords: 'copy paste effects attributes same look settings apply to other clips remove effects',
    body: `
Select the clip that has the effects you want and copy it ({{key:copy}}). Then select one or more other clips and:

- **Paste Effects** ({{key:pasteEffects}}) pastes everything: video effects, color, transform, crop, masks, stabilization, volume and audio effects.
- **Paste Attributes** ({{key:pasteAttributes}}) opens a window where you tick exactly what to paste, divided into video and audio attributes. Attributes that were not changed on the copied clip are greyed out. Your choices are remembered.

Keyframes come along. **Maintain Timing** keeps them at the same time from the start of the clip, and **Stretch to Fit** stretches them to the length of the clip you paste into.

A pasted attribute replaces what the clip had. Use **Remove Effects** ({{key:removeEffects}}) to remove effects, audio effects and masks, or **Remove Attributes** ({{key:removeAttributes}}) to choose what to reset. All of these are also in the Edit menu and when you right click a clip.
`,
    see: ['effects', 'audio-effects'],
  },
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
    title: 'Settings',
    summary: 'Defaults for editing, playback, import, audio and export, and your own keyboard shortcuts.',
    keywords: 'settings preferences options defaults keyboard shortcuts command editor customize',
    body: `
Open Settings with {{key:prefs}}. The icons at the top switch between the parts, like in Final Cut Pro. Every change is saved right away.

- **General**: where new projects are created, whether the last project opens at startup, looking for missing media, and Reset All Settings.
- **Editing**: default lengths of transitions, crossfades, stills, titles and freeze frames, snapping, and moving the playhead to the end of added clips.
- **Playback**: skimming, viewer quality (better performance draws the viewer at half resolution), loop playback and keeping the pitch at other speeds.
- **Import**: copy files into the project or leave them in place, create optimized media, and analyze video for stabilization.
- **Audio**: how Auto Sync Audio groups audio and switches off the camera audio.
- **Export**: whether exports go to the project's Exports folder or another folder.

![General settings.](settings.jpg)

## Keyboard shortcuts

Under **Keyboard** you can change the shortcut of any command:

- Search for a command or a key, or pick a menu on the left.
- Click the shortcut and press the new keys. Esc cancels.
- If the keys are already used, Reccut says by which command, and you choose whether to move them.
- The × removes a shortcut, and the arrow brings back the default. Changed only shows what you have changed, and Reset All goes back to the defaults.
- Export saves your shortcuts to a file, and Import loads them, for example on another computer.

The menus, the Keyboard Shortcuts list ({{key:shortcuts}}) and Quick Search always show your own shortcuts.

![The keyboard shortcut editor.](keyboard.jpg)

[[run:prefs|Open Settings]]
`,
    see: ['shortcuts', 'search'],
  },
  { id: 'shortcuts', section: 'Reference', title: 'Keyboard Shortcuts', summary: 'Every shortcut in Reccut, grouped by menu.', keywords: 'keys keyboard hotkeys', body: '' },
];
