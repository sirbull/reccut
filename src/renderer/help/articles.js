// Hjelpeartiklene. Teksten er på engelsk, som resten av appen. Se Help.jsx for formatet:
// ## heading, - bullets, numbered steps, ![caption](file), **bold**, {{key:id}}, [[run:id|label]], [[article:id|label]].
import { WORKFLOWS } from './workflows.js';
import { CATALOG_ARTICLES } from './catalog.js';
export const SECTIONS = ['Getting Started', 'Recording', 'Media', 'Editing', 'Audio', 'Look', 'AI and Plugins', 'Export', 'Design', 'Reference'];

export const ARTICLES = [
  {
    id: 'third-party-licenses', section: 'Reference', title: 'Third-party Software and Licenses',
    summary: 'Find offline license texts, component credits and information about source-code and artwork rights.',
    keywords: 'about copyright attribution license licence open source GPL LGPL MPL ffmpeg mediabunny uiohook openmoji commercial credits',
    body: `Open **About Reccut → Third-party licenses** to read the local component list and license texts. On macOS, About Reccut is in the Reccut menu. On Windows and Linux, use the Help menu. The license reader works offline; project links open upstream websites in your browser.

Choose **Open license files and documentation** in the reader to open the local notices directory. DISTRIBUTION.md contains more detail about source-code and distribution requirements. The directory also contains original license texts and a component manifest with the versions recorded at build time.

## Separate component licenses

Reccut uses Electron, Preact, Signals, Immer, Lucide, Tabler, PDF.js, Mediabunny, FFmpeg, uiohook-napi, Transformers.js and ONNX Runtime, along with model weights and artwork. Each component retains its own license and copyright notices. The application license does not replace those terms.

FFmpeg is used as a separate command-line program under GPLv3 or later. Mediabunny is MPL 2.0. The MIT-licensed uiohook-napi wrapper contains the LGPL-licensed libuiohook native library. These licenses include source-code and distribution rights, beyond the notices shown in About.

Whisper and the bundled BiRefNet models declare MIT licenses. OpenMoji graphics use CC BY-SA 4.0, and Unicode emoji data has its own license. When included, Blackmagic RAW libraries have separate proprietary SDK terms.

## Your recordings and artwork

Processing a recording with FFmpeg does not by itself make the recording GPL-licensed. Imported footage, fonts, stock images and artwork still have their own terms. Preserve attribution and license information for assets such as OpenMoji graphics and downloaded stock images. Copy Credits in Design's export options can help collect the source information stored with supported assets.

For complete terms, use the original texts in the license reader. For build-specific source delivery and native-library requirements, read DISTRIBUTION.md in the local license folder.`,
    see: ['welcome', 'design', 'export'],
  },
  {
    id: 'design', section: 'Design', title: 'Design Thumbnails and Images',
    summary: 'Make layered images from video frames, photos, text and shapes, then export or package them.',
    keywords: 'thumbnail image design canvas text layers picture photo png jpeg webp',
    body: `Open [[run:roomDesign|Design]] in the title bar. Choose New Design for a size preset or enter a custom size from 1 to 8192 pixels. You can keep several designs in a project. The bottom strip shows them as pages: click to open, double click to rename, or right click to duplicate, make a variant or delete. The + button adds a design, and Export opens the export choices.

The left rail opens Search, Templates, Video, Text, Add Content, Elements, Styles or Brand. Only one panel is open at a time. Click its rail icon again or Close panel to give the canvas more room. Expand panel widens it. The last panel and width are remembered. Layers is above Properties on the right. Dragging a layer opens an animated gap; move to another position before dropping. Groups move together. Escape or dropping outside cancels; only a completed drop adds an Undo step. The list scrolls near its edges.

## Add pictures

Open Add Content and choose Import Image. Its main action follows the import copy preference. The arrow menu offers Import Embedded, Import Linked and Open as New Design. Import Embedded copies a photo into Designs/Assets. For a layered PSD, PSB or SVG, choose Place as one image or Place layers. Select the layers to keep. Layer positions and order are preserved, and imported layers are grouped. Import Linked references the original file. The Design menu also keeps Place Embedded and Place Linked. Design pictures stay separate from the Edit media browser. Recent shows images imported into this project; From Project references images already imported in Edit.

The Video panel has its own preview and scrubber. Use This Frame saves a full quality PNG of the sequence or selected source video into Designs/Frames. The full frame is placed with its original aspect ratio, fitted inside the design without cropping. Move and resize the layer to compose the thumbnail. Changing the timeline afterwards does not change this image. Click the timecode to type HH:MM:SS:FF, HH:MM:SS, MM:SS or seconds, then press Enter or click away to seek. Escape cancels; invalid entries keep the previous position. After Enter, arrow keys are ready to step frames in the Video panel. Play/Pause and Space control this preview independently of Edit. The side buttons skip five seconds; hold Shift to skip ten. Arrow keys step one frame while the Video panel has focus; Shift and arrows step one second. Typing, scrubbing or stepping pauses playback. While typing a timecode, arrow keys move the text caret. Navigation stops at the first and last visible frame. Use This Frame can also create the first design. An empty or audio only timeline cannot supply a video frame.

Drop files to place them using the import copy preference. Hold Alt while dropping to reverse the choice. Cmd/Ctrl V pastes an image from the system clipboard. Cmd/Ctrl C and X copy and cut selected layers, and V pastes them into another design or project. Referenced images travel with the layers; embedded files are copied into the receiving project. Plain text becomes a text layer. Paste keeps relative centers when the design size changes. Shift Cmd/Ctrl V pastes in place. Linked images have a link icon. A missing image has a warning in Layers: click Relink to find the file before exporting.

## Edit layers

V selects the Move Tool, T the Type Tool, U the Shape Tool, H the Hand Tool and C the Crop Tool. Shift U cycles rectangle, ellipse, polygon, star, line and arrow. The shape menu also offers each tool. Double click text to edit it directly; Escape finishes editing. For text, Character appears first in Properties with searchable installed fonts, font refresh, weight, size, Tracking, Leading, All Caps and Text Color. Download and install a Google Font on your computer to use it here; Browse Google Fonts opens the font site. Select words in Content or while editing on the canvas to change just their font, size, weight, tracking, case or color. The selected-text notice identifies the words being formatted; Whole layer clears that selection. Position, paragraph alignment, masks and other layer controls continue to affect the layer. Rich text is retained when saving, exporting and copying layers. Fit text in box shrinks long titles, down to 6 pixels. At the minimum size, extremely long text can still be clipped.

Click or Shift click to select layers, or drag on empty canvas to make a selection box. Drag the selection to move it; guides snap to edges and centers. Hold Cmd/Ctrl to turn snapping off. With Rulers on, drag from the top or left ruler to pull out a guide. Layers snap to it, the Move Tool drags it, and dragging it back to a ruler removes it. Guides are never exported and hide with the rulers. Arrow keys move one pixel; Shift and arrows move ten. Backspace deletes; Cmd/Ctrl J duplicates a layer. Cmd/Ctrl D or Escape deselects. Cmd/Ctrl T selects Free Transform.

Drag handles to resize and use the handle above the box to rotate. Images keep their aspect ratio by default; Shift frees it. For other layers Shift locks aspect. Alt resizes from the center. Shift snaps rotation to 15 degrees. Space and drag, or scrolling, pans. Cmd/Ctrl and scrolling zooms, Cmd/Ctrl 0 fits on screen. Use the 100% command for actual size. Cmd/Ctrl 1 still opens Record, so 100% has no shortcut.

Layers are shown top first. Drag the divider above Properties to change the Layers height; the app remembers it. Double click the divider to return to the compact automatic height. The divider also supports Up/Down, Home and End keys. Drag rows to change their order; use eye and lock buttons to hide or protect a layer. Double click a layer name to rename it. Right click for more layer actions. Selecting a locked layer lets you unlock it, but does not allow transforms.

## Styles and text

Properties has Fill controls for solid colors and linear, radial or freeform gradients. The gradient spans the layer box and follows its rotation. Stroke offers Size, Position (Inside, Center, Outside), solid/dashed/dotted styles and joins. Text starts with an Outside stroke. A Size of zero hides the stroke.

Layer Styles adds Soft Drop Shadow, Hard Shadow, Outer Glow or Long Shadow. You can add several shadows, reorder them and adjust Color, Opacity, Angle, Distance, Spread and Size. Spread also follows the transparency of images. Blend Mode controls how a layer combines with the layers below it. Images also have Brightness, Contrast, Saturation, Hue, Blur and Grayscale, with Reset Adjustments.

Use paired asterisks, *words*, to give words the Highlight fill. Type \\* to keep a literal asterisk. Consecutive or unmatched asterisks remain literal. Text Effects can add a padded, rounded background box behind each line. Missing local fonts fall back to the system font and show Font not installed in Properties and Layers.

## Groups, alignment and crop

Cmd/Ctrl G groups selected layers and Shift Cmd/Ctrl G ungroups them. A click selects the group; double click selects a member. In Layers, Alt click also selects one member. Collapse a group with its arrow and double click its name to rename it. Locked group members must be unlocked before moving, regrouping or changing group order. Group resize preserves each member's rotation and does not add skew.

Align and Distribute in Properties aligns selected bounds. With one layer, alignment uses the canvas. Distribution needs at least three layers and makes the gaps equal. Rotated layers use their visible rectangular bounds.

Double click an image or choose Crop… in Properties to show the full source dimmed around the crop. This also works on locked image layers. Drag the image to reposition it and drag handles to change the crop. Hold Shift to keep the crop's shape, or Alt to scale it from the center, also with Free. Choose Free, Design, 1:1, 16:9, 9:16 or 4:5. Enter or Apply Crop applies it in one undo step; Escape or Cancel discards it. Reset Crop restores the full source within the current layer box.

## Design shortcuts

- {{key:design:select}} Move Tool, {{key:design:text}} Type Tool, {{key:design:shape}} Shape Tool.
- {{key:design:cycleShape}} Next Shape Tool, {{key:design:hand}} Hand Tool, {{key:design:crop}} Crop Tool.
- {{key:design:group}} Group Layers, {{key:design:ungroup}} Ungroup Layers.
- {{key:design:duplicate}} Duplicate Layer, {{key:design:clear}} Deselect, {{key:design:transform}} Free Transform.
- {{key:design:pasteInPlace}} Paste in Place.
- {{key:design:up}} Bring Forward, {{key:design:down}} Send Backward, {{key:design:front}} Bring to Front, {{key:design:back}} Send to Back.
- {{key:design:moveLeft1}} / {{key:design:moveRight1}} / {{key:design:moveUp1}} / {{key:design:moveDown1}} move one pixel. Shift moves ten pixels.
- {{key:design:zoomIn}} Zoom In, {{key:design:zoomOut}} Zoom Out, {{key:design:zoomFit}} Fit on Screen.
- {{key:design:export}} Export As.

Settings has a separate Design keyboard group. Shortcut conflicts are checked within the current room and against shared commands such as Save. Quick Search lists every Design command, including alignment and distribution.

## Save and export

Canvas Size changes the canvas without scaling layers. Use its nine-point content anchor to choose where existing content stays. Resize scales content for new sizes.

Design changes save with the project and have their own Undo and Redo. Undo in Design keeps the timeline intact, and Undo in Edit keeps designs intact. Opening a project clears both histories.

Export As saves PNG, JPEG or WebP using the same drawing as the canvas. PNG and WebP can omit the canvas background for transparency. JPEG uses an opaque background. Choose a width or scale and an optional file size limit in MB. Zero disables the limit. If a file cannot fit, reduce its width or raise the limit. Existing files get numbered names. Quick Export as PNG uses the current design size and canvas background, retaining transparency when the canvas has no background.

Package Project includes design assets and image media used by designs, even when Remove unused media is enabled. Fonts are listed in the package report and must be installed on the destination computer.

## Color correction

Select images, text, shapes or a mixture of layers and expand Color Correction in Properties. Light offers Exposure in stops, Brightness, Contrast, Highlights and Shadows. Color offers Hue, Saturation, Temperature and Tint. Curves has RGB, Red, Green and Blue channels: click to add points, drag to adjust, use arrow keys to fine-tune and Delete to remove a selected interior point. Effects has Blur and Grayscale. These panels collapse independently. Enable compares with the original appearance; Reset All clears the corrections. Multi-selection changes only the setting being edited, preserving each layer's other corrections. Edits can be undone, stay editable after saving, and use the same rendering for the canvas and export. Saved layer styles include color corrections.

## Cutouts and masks

Select an image and choose Remove Background in Properties. The model runs locally with the app, including without internet. Tasks shows progress and Cancel. The original image stays intact; the result is a separate mask. Feather softens the edge and Shift Edge expands or contracts it. Edit Layer Mask opens Erase and Restore brushes with Size and Hardness. Each stroke can be undone and redone. Done leaves brush mode. Sticker Outline follows the final visible edge; shadows follow it too.

Layer Mask adds a rectangle, ellipse or polygon. Edit Mask shows that shape on the canvas with draggable handles, including the ellipse outline. Edit Mask moves its handles; Feather and Invert adjust its edge. Clip to Layer Below keeps a layer inside the visible layer below. Select one text layer and one image, then Fill Text With Image to make a clipping group. The Video panel offers Cut Out Camera when the selected recording has a camera stream. Cut Out This Frame captures the selected full frame and removes its background locally, keeping the original source and a separate editable mask.

Export Design is the blue button at the top right. Copy Credits in Export As copies attribution for third-party images. Settings → Design controls online sources, sign-in and the optional online template catalog. Search terms go only to enabled sources; downloaded images stay in the project. Design → Plugins → Image Source Plugins offers optional sources such as Pixabay with your own API key. Add the source, get a key on its website, save it locally and use Test Connection. Source exports and projects never include keys. Pexels still needs app approval; Unsplash is not offered as a personal-key plugin.

## Reusable styles and templates

The Text panel offers Add Title, Add Subtitle and Add Badge, sized for the canvas and filled with the project name. Brand Fonts supplies the title and body fonts and changes matching existing text when edited. Brand also stores color roles, an emoji style and named Brand Kits; new generic elements use these defaults. Apply Brand restyles existing editable elements. Explicit library styles retain their example palette. Font Pairs applies separate title and subtitle fonts together; pairs with missing local fonts are hidden. It also offers 111 built-in text styles and My Styles. Save Style in the section header stores the selected layer's appearance. Text size adapts to the design height. Right click a saved style to rename, update from the selection, or delete it. You can store up to 500 styles.

Text styles with a second text color automatically emphasize the longest word using the same colors as their example. Equal-length words use the first one. Existing words marked with paired asterisks keep their emphasis instead. Applying a style replaces prior character overrides for that style's appearance settings. Your text and layer placement stay intact, and Undo restores the previous formatting. You can select another word in Properties to customize its color afterward.

Library sections show a horizontal row of cards. See All opens the whole section as a grid; Back returns to the sections. Search filters the current panel. Hover or focus previews a card on the canvas without saving or adding undo steps. A single click applies the card and selects it; Enter also applies it. Double clicking inserts only once. Drag an image to place it at that point. Drag a style or color onto a compatible unlocked layer to affect only that layer. Right click offers Apply and the actions available for that item.

Templates offers 22 built-in layouts for wide, tall and square designs, plus My Templates. Click a template or press Enter to create a new design using its size or the current canvas size. It uses the current frame, cutout, project title and My Logo when available. By Style groups templates by tags such as Bold, Minimal, Tutorial and News. Save as Template lets you assign picture and text placeholders, comma-separated tags and a color role for each text or shape layer. Import and export use .reccut-design-template files, without links to original project files.

Brand has the reusable Logo, Brand Colors, title/body Brand Fonts and a Brand Palette. Click a color to apply it to selected text or shapes, or to the background when nothing is selected. My Colors also stores up to 20 colors beside color controls. Save Color in Brand adds the chosen color; right click a swatch to remove it. My Logo is copied into each new design that uses it, so replacing the saved logo keeps existing projects intact.

## Elements, palettes and search

Elements offers editable shapes and badges, hand-drawn arrows, circles and underlines, system emoji, stickers, solid/gradient backgrounds and textures. Click or press Enter to add an item; drag places it at that canvas point. Badges remain text layers, including the sequence duration badge. Backgrounds, including gradients, create separate editable layers. New backgrounds are placed above older background layers and below normal content. Dots and grids have Pattern controls for background and foreground colors, symbol size or line width, and independent X/Y spacing. Symbols include circles, squares, diamonds, triangles, stars and hexagons. Size Variation randomizes their sizes; Random Seed selects a repeatable arrangement. Size Distribution makes symbols or grid lines larger in the center, at the edges, or toward the left, right, top or bottom. Distribution Strength controls how strongly sizes change. Older raster textures offer Make Pattern Editable, which can be undone. Right click an element to save it to My Elements. Emoji offers 3,781 choices, English search, categories and paged grids. Brand selects System, Flat or Outline as its default; the library follows this choice and Properties can change one emoji. Flat/Outline use bundled OpenMoji graphics with CC BY-SA 4.0 credits; their appearance depends on the installed system fonts.

Styles has Recommended, Colors and Fonts. Recommended combines a five-color palette with a font pair. Colors applies palettes alone; From This Frame samples colors locally from the frame selected in Video, or a suggested sequence frame if none was selected. Brand Palette uses your saved colors. Font pairs use installed fonts only. Right click to save palettes or font pairs for reuse, or delete saved items.

Palettes map to background, title, highlight, accent and stroke roles. For layers without roles, the first title uses the title color, other text uses accent and shapes use highlight. Applying a palette preserves photos, hidden layers and locked layers or groups. Dropping a palette on compatible text or a shape changes only that layer and keeps the background intact. Hover previews the result before applying it; Undo restores the previous appearance.

Search in the rail finds built-in and saved templates, text styles, elements, palettes, font pairs, project images, brand colors and your logo. Results are grouped by type. Exact names come first, followed by names starting with the search words. See All opens a group's grid. Search works offline.

## Design suggestions

Templates shows For This Video as cards after local analysis. Video shows Best Frames from the same analysis. Hover previews a suggestion; click or Enter captures the full-quality original. Templates creates an editable layout; Best Frames places a background image, preserving the complete frame and its aspect ratio. Either can create the first design. Changing the timeline discards stale frame suggestions. Title and Shuffle in Templates let you adjust the inline suggestions. More Suggestions opens the dialog with additional sizes, title ideas and optional AI title suggestions.

Choose Suggestions from the Design empty state, the Templates panel or the Design menu. Reccut analyzes the current sequence locally and offers up to six frames with four layouts for each. It favors clear, well-exposed frames, avoids fades and transitions, and spreads choices across the video. Camera visibility adds priority. Analysis is limited to about 14 seconds; slow or unavailable frames can be skipped.

Choose a canvas size and title, or type your own title. Offline title ideas come from the project and sequence names, timeline titles and captions, including Norwegian captions. Shuffle changes the layouts and title. Click a card to capture that frame at full quality and create a new editable design in one undo step. The entire source frame is retained without automatic cropping. The timeline and its playhead stay unchanged.

When an AI provider is configured, Suggest Titles with AI is available for sequences with captions. The first use in a Suggestions window names the provider and asks before sending up to 12,000 transcript characters. No image, audio or video file is sent by this action. AI never runs automatically, and offline suggestions remain available if the provider fails.

Closing Suggestions cancels the analysis or pending frame capture. Switching projects, rooms or changing the sequence also discards stale results.

## Preview and readability

Preview in the toolbar shows generic video-list layouts at 360, 246 and 168 pixels wide and in a phone layout. Switch light/dark backgrounds and the progress bar. The duration badge uses the current sequence duration. The whole design is fitted inside each preview.

Safe Zones highlights generic overlay areas for the selected size on the editing canvas. It also draws a safe frame that follows the shape of the canvas: action safe at 90%, title safe at 80%, a center cross and lines for a 4:3 center crop on wide or tall designs. These areas are guides, not platform requirements, and are never exported. Readability in the toolbar automatically checks for small text, low text-fill contrast and text overlapping an overlay area after edits. A warning dot appears when there are issues. Open it to review the warnings or run Check Readability again. Select jumps to the affected text layer. Checks use the layers behind the text and a white backdrop for transparency. Outlines and shadows may improve actual legibility.

## Variants and sizes

Canvas offers Make Variant. Export in the bottom strip offers Compare Variants. Each variant is independently editable. Keep this one marks a favorite without deleting any design. Favorites appear in the designs strip.

Resize in the toolbar creates designs for one or more selected sizes, scaling and positioning layers using anchors or relative centers. Resize current design requires exactly one target size. Export All Sizes saves the selected designs to a folder as PNG, JPEG or WebP, with dimensions in their file names. Existing files get unique names.

The Export room and Easy Export offer Also save thumbnail when the project has designs. Choose a design to save a JPEG next to the completed video with the same base name. Its appearance is prepared before video export starts, so later edits do not change it. An existing JPEG is kept and an error is shown rather than overwriting it.

## Open Image and canvas tools

Open as New Design in the Import Image menu, or the Open Image command, creates a separate design at the image's displayed pixel size, with just that image and a transparent canvas. Dropping images on the empty Design room does the same. The import-copy preference controls embedded or linked sources. JPEG orientation is honored. Open Image supports up to 8192 pixels per side; larger images can be placed into an existing design.

Canvas offers Crop Canvas, Rotate Canvas Left/Right and Flip Canvas Horizontally/Vertically. The Crop Tool ({{key:design:crop}}) is the same as Crop Canvas and works whatever layer is selected or locked. It has aspect presets and draggable handles; drag a handle past the canvas edge to make the design wider or taller, up to 8192 pixels per side, and drag inside to move the crop. Shift keeps the crop's shape and Alt scales it from the center. Enter or Apply Canvas Crop applies it; Escape or Cancel discards it. Cropping moves every layer and changes the canvas size. Image sources and masks stay intact, so they can still be repositioned. The canvas background adapts to the new size. All canvas operations can be undone.`,
    see: ['projects', 'package', 'export-frame'],
  },

  {
    id: 'welcome',
    section: 'Getting Started',
    title: 'Welcome to Reccut',
    summary: 'Your illustrated, searchable guide to recording, editing, AI tools and delivery. Available offline inside Reccut.',
    keywords: 'overview rooms start',
    body: `
Reccut has four rooms, shown at the top of the window. Switch between them with {{key:roomRecord}}, {{key:roomEdit}} and {{key:roomExport}}.

- **Record** captures your screen, camera and microphone, with cursor zoom.
- **Edit** is a magnetic timeline editor with the tools and shortcuts from Final Cut Pro.
- **Export** turns the project, or any file, into the format you need.
- **Design** makes thumbnails and images with separate layers.

![The Into the Wild nature project: media on the left, viewer in the centre, inspector on the right and the timeline below.](overview.jpg)

Everything belongs to a project. A project is a folder that holds the project file, your recordings, copied media, optimized media and exports.

## Start with a task

- [[article:first-edit|Make your first video]] — a complete recording, edit and export example.
- [[article:ai-setup|Connect a cloud AI agent]] or [[article:ai-local|use a local model]].
- [[article:tools|Learn the editing tools]] and [[article:creative-reference|browse creative presets]].
- [[article:troubleshooting|Solve a picture, sound or export problem]].
- [[article:command-reference|Find every command]] or [[article:glossary|look up an unfamiliar term]].

## Finding things fast

This handbook opens in its own window, so you can keep it beside your project. Search covers article text, headings, examples and commands. Try “connect local AI”, “no sound”, “roll trim” or “export captions”. Use the chapter filter to narrow results. Click an image to enlarge it. Back and Forward return to earlier guides or search results. Cmd/Ctrl F focuses search; Option/Alt Left and Right navigate history. Escape clears search or closes an enlarged image.

Press {{key:findCommand}} and type what you want to do, for example "blade", "sync" or "color". Press Enter and the command runs, or the tool or panel opens. On a Mac you can also search in the Help menu, like in other Mac apps. Every command shows its shortcut in the menus and in the search.

[[run:findCommand|Search commands]] [[run:shortcuts|Show all shortcuts]]
`,
    see: ['projects', 'search', 'shortcuts'],
  },
  {
    id: 'history',
    section: 'Getting Started',
    title: 'Project History and Autosave',
    summary: 'Autosave after changes, plus a history of earlier project versions you can restore.',
    keywords: 'autosave auto save history versions backup restore revert crash undo earlier older',
    body: `
Reccut saves the project automatically a moment after every change. Atomic writes reduce the risk of a partial project file, and the project is saved once more when you quit. Keep separate backups of important projects and media; history does not back up your source files.

In addition, a copy of the project is kept every few minutes while you work, and when you close Reccut. The copies are in the **Auto-Save** folder next to the project file, compressed. Older copies are thinned out: everything from the last two hours, one per hour for two days, one per day for a month, one per week for a year, and one per month after that.

Choose **Project History** ({{key:history}}) in the File menu to see the copies by date and time, and click **Restore** to go back to one. A copy of how the project looks right now is made first, and the restore can be undone with {{key:undo}}.

[[run:history|Project History]]
`,
    see: ['projects', 'package'],
  },
  {
    id: 'updates',
    section: 'Getting Started',
    title: 'Updates',
    summary: 'Reccut works offline and can tell you about new versions on GitHub.',
    keywords: 'update new version download github release offline',
    body: `
Reccut works fully offline. When the computer is online, Reccut checks once a day whether a new version has been released on GitHub, including while the app stays open. A small update dialog shows the new version and release notes. Choose **Download** to save the installer for your computer in Downloads, or **GitHub** to visit the release page. You can continue working while it downloads, choose **Later**, or **Skip This Version**. Nothing is installed until you quit Reccut and open the file yourself. Your projects and settings are kept.

Choose **Check for Updates** in the Help menu to check right away. Turn off the automatic check under Settings, General.

[[run:checkUpdates|Check for Updates]]
`,
    see: ['projects'],
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
- **Trim media to the parts that are used**: re-encode used portions of video and audio, with extra time on each side. Recording folders and still images are copied whole. Size is an estimate; re-encoding can increase it.

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
    keywords: 'new open save location folder trash sequence sequences timeline duplicate info',
    body: `
When you create a project, you give it a name and choose where it should be saved. Reccut creates a folder with that name, containing:

- **the project file** (.reccut), saved automatically after every change
- **Media**, for files you import with "Copy to project folder"
- **Recordings**, for everything you record while the project is open
- **Optimized Media**, for clips converted to an edit friendly format
- **Exports**, the default place for finished videos

![New Project: name, location and format.](newproject.jpg)

The open project is shown at the top of the window. Click it to see facts about the project (location, format, duration, sequences and media) and to open another project. The Projects window lists recent projects; use Open Other to open a project file from anywhere, and the ⋯ button to reveal a project, remove it from the list or move it to the Trash. You can also double click a .reccut file in Finder or Explorer to open it.

## Sequences

A project can hold several sequences, which are separate timelines that share the same media. Use them for a long and a short cut, or a vertical version of the same video.

- **New Sequence** ({{key:newSequence}}), the sequence button in the Media browser, or right click an empty spot in the browser. Choose a name, format and frame rate, then click **Create Sequence**. The settings start with the format of the open sequence. Cancel closes the window without creating a sequence.
- **Duplicate Sequence** copies the open sequence, or right click any sequence and choose Duplicate.

When a project has more than one sequence, they are listed at the top of the Media browser. Double click one to open it in the timeline. Right click to rename, duplicate or delete it. Format, frame rate and captions style belong to each sequence, so changing them in the Inspector only changes the open one. Export exports the open sequence.

Choose **Current Display** in the Format menu to match the pixel resolution of the screen containing the Reccut window, including Retina scaling. This is available when creating a sequence and when changing its format later. Moving Reccut to another screen updates the option; existing sequences keep their chosen size until you change it.

In a project made with the Automatic template, the first video you add sets the size and frame rate of the sequence, and Sequence Settings opens so you can keep that or choose another format. Turn off **Ask when adding the first clip** to skip the window; turn it back on in Settings › General. Change the format at any time with File › Sequence Settings (Cmd J), or in the Inspector when no clip is selected. Clips with another size are scaled to fit, and clips with another frame rate or codec play at their normal speed. If a clip's frame rate does not divide evenly into the export frame rate (25 fps in 30, for example), motion stutters slightly; the export window warns about this and suggests a better frame rate. Speed counts: a 60 fps clip at 50% fits a 30 fps sequence and gives smooth slow motion.

## Save As

**Save As** ({{key:saveAs}}) saves the project under a new name and location, in a new project folder. The media files stay where they are, and you continue working in the new project.

## Moving a project

The project file remembers where each file is, both as a full path and relative to the project file. If you move or copy the whole project folder, for example to another disk or computer, Reccut finds the files again. Thumbnails, waveforms and proxies are made again if they are missing.

To collect everything into one folder for archiving, use Package Project.

[[run:newProject|New Project]] [[run:openProject|Open Project]] [[run:saveAs|Save As]] [[run:package|Package Project]] [[run:revealProject|Reveal Project Folder]]
`,
    see: ['history', 'package', 'import', 'recording'],
  },
  {
    id: 'search',
    section: 'Getting Started',
    title: 'Quick Search',
    summary: 'Press Control Space, type the name of anything, and it is applied or opened.',
    keywords: 'command palette find help menu console fx console effects tools',
    body: `
Press {{key:findCommand}} when you are not typing in a field. A search window opens in the middle of the screen. Type a few letters of what you want and press Enter:

- **Effects** are applied to the selected clips (or the clip under the playhead), and the effect is shown and highlighted in the inspector so you can adjust it right away.
- **Transitions** are added at the selected edit, or the edit nearest the playhead. With the playhead at the end of the last clip, the clip fades out.
- **Titles** are added at the playhead.
- **Looks** and **animations** are applied to the selected clips.
- **Settings** such as Exposure, Scale or Volume open the right tab in the inspector, and the setting is highlighted with its number field ready to type in.
- **Tools** are switched on and the tool button flashes.
- **Commands** run, and **media** is found and highlighted in the browser.
- **Help** articles open in the help window.

![Quick Search. The label on the left shows what kind of result it is, and commands show their shortcut.](palette.jpg)

With nothing typed, scroll down to see everything you can search for, grouped by type, with the shortcut next to each command.

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
    keywords: 'record capture webcam switch cameras multicam pip layout keystrokes keystroke add-on gaming wasd mouse clicks controller gamepad input overlay cursor zoom system audio area region crop part of screen countdown shortcut hotkey global pause resume window tray menu bar control bar crash recover microphone test level',
    body: `
Choose a screen, a camera and a microphone in the Record room. Turn on system audio to record the sound from your computer.

Under **Recording → Video format**, choose MP4 (H.264), MOV (H.264), MKV (H.264), or WebM (VP9 or VP8). **Audio format** offers codecs supported by that container when recording system audio or camera with microphone; Automatic chooses a matching codec. Microphone audio without a camera is saved as a separate audio file. With no camera and system audio off, choose M4A (AAC), Ogg (Opus), WAV (16-bit PCM), FLAC or MP3, also while recording the screen. To record only audio, choose **No screen** and **No camera**. Your choices are remembered. Formats cannot be changed during countdown, recording or saving.

Recordings are written to disk continuously for crash recovery, then finalized in the selected format when you stop. Finalizing may take a moment. PCM and FLAC use uncompressed audio capture. If finalizing fails, Reccut keeps the original recording and shows a message.

## Start recording from any app

Press the record shortcut to start and stop recording: by default **Control Option 0** on a Mac and **Ctrl Shift 0** on Windows (the keys can be changed under Shortcuts in the Record room). The same keys with **9** pause and resume. By default these shortcuts work only while Reccut has focus, outside input fields and dialogs. The exception is a running recording: then all the recording shortcuts also work from other apps, so you can stop, pause and switch layouts while Reccut is in the background. To start recording and use the shortcuts from another app when you are not recording, enable **Allow shortcuts in other apps** under **Record → Shortcuts**. This explicitly enables global keys, which can override those combinations in other apps. The floating recording controls and tray menu also let you pause and stop.

While you record, you can always see that the screen is being recorded, without it ending up in the video:

- a small **control bar** floats over your other apps, with the time, the microphone level, **Pause** and **Stop**. It is hidden from the recording on macOS and Windows.
- the **Reccut icon** in the menu bar on macOS shows a red dot and the time. On Windows the icon in the taskbar tray turns red; click it for Start, Pause, Stop and Show Reccut.
- **Hide Reccut while recording** puts the Reccut window away when you start, and brings it back when the recording is saved.

Paused parts are left out of the video, and cursor zoom and layouts follow along.

## Record one window

Choose a window instead of a screen under **Screen**. Only that window is recorded, even if it is moved or covered. Click Refresh list of windows if a new window is missing. Cursor zoom is off for window recordings.

## Check the microphone

Under the microphone meter, Reccut tells you if the microphone is silent, very quiet, good or too loud. Click **Test** to record four seconds and hear them played back.

**Input gain** starts at **0 dB**. Drag the slider or type a value to raise or lower the microphone level. Open **Microphone mixer** for input and output meters in dBFS, a peak hold, average level, a frequency spectrum, three-band EQ, an 80 Hz low cut and a compressor. Aim for speech peaks between −18 and −6 dBFS. If the input clips before gain, lower the input level on the microphone or in your system settings.

Choose **Flat**, **Clear speech**, **Warm voice** or **Bright voice** as a starting point. Changes apply to both Test and new recordings, and are saved automatically when the mixer closes and between app launches. **Reset to Flat** restores 0 dB gain and neutral processing. Processing is baked into the recorded microphone audio; system audio stays separate.

## Use an audio interface or an external camera

Audio interfaces, USB microphones and HDMI capture devices such as Elgato Cam Link appear in the **Camera** and **Microphone** menus as soon as they are connected. If you unplug the one you chose, Reccut uses another device and goes back to yours when it returns.

Open **Settings → Audio & Video** for more:

- **Input channel**: a microphone in input 1 of an audio interface is recorded on the left side only. Choose **Left only (input 1)** or **Right only (input 2)** to hear it on both sides. **Mono** mixes both inputs into one signal.
- **Output**: where Reccut plays sound. **System default** follows your computer.
- **Resolution** and **Frame rate**: what Reccut asks the camera for. The line below shows what it really sends. Over HDMI the format is set on the camera.
- **Delay microphone**: an HDMI camera shows the picture slightly after the sound. If your lips are out of sync in the recording, increase this in small steps.

## Switch between cameras

With more than one camera connected, the other cameras are listed under **Camera** in the Record room. Turn on the ones you want to switch to, then press **Control Option C** on a Mac or **Ctrl Shift C** on Windows to go to the next camera, before or during the recording. The cameras you turned on stay ready, so the switch happens at once.

The recording keeps one camera file that shows the camera that was active at each moment. It is made at the size of the camera that was active when you started; a camera with another shape is cropped to fill the picture. **Mirror** and **Delay microphone** apply to all cameras, so an HDMI camera and a webcam can need different values.

## If Reccut or the computer crashes

The recording is written to disk while you record. If Reccut is closed by a crash or a power cut, it offers to **recover** the recording the next time it starts, with layouts and cursor movements up to the last few seconds.

## Record only part of the screen

Under **Record**, choose **Area** instead of Full Screen. The screen is covered with a dark layer: drag to select the area, drag the box or its corners to adjust it, and click **Use Area** (or press Return). The buttons at the bottom lock the shape to 16:9, 9:16, 1:1 or 4:3.

- **Adjust in Preview** shows the whole screen in the preview, so you can move and resize the area there instead.
- A thin frame on the screen shows the area while you are in the Record room. It turns red while you record. It is drawn just outside the area, so it never ends up in the video.
- Only the area is saved, so the rest of the screen never ends up in the file. The cursor zoom follows the area.

## Countdown

Choose a countdown of 3, 5 or 10 seconds under Recording. The numbers are shown in the preview and in the middle of the area on the screen. Press the record button again to cancel it.

![The Record room. The layouts at the bottom switch between camera, screen and picture in picture.](record.jpg)

- The layout buttons, or the shortcuts shown on them (1–8), switch between camera full screen, screen only, the camera in a corner and camera and screen side by side (7 and 8). They also work from other apps while you record. To use them from another app when you are not recording, enable **Allow shortcuts in other apps** under **Record → Shortcuts**.
- Choose the camera shape (circle, square or 16:9), size and mirroring.
- Turn on **Show PiP on screen** under Camera to see the camera over the app you are demonstrating. It follows the recording's position, size and shape, including when recording a screen area. Clicks pass through to the app underneath. It appears while Reccut is in the background and hides when you return. Use the layout shortcuts with **3–6** to switch corners. This is available for display and area capture. On macOS and Linux, the on-screen camera can also appear in the screen file; leave it off if you need a clean screen file for later editing.
- **Show keystrokes** needs the optional **Keystroke Add-on**. Reccut itself never reads the keyboard outside its own window. Click **Get Add-on**, or choose it under **Plugins** in Record, to read what the add-on does before it is downloaded: it reads the keyboard for the whole computer while you record, only shortcuts with Cmd, Ctrl, Alt or Win (plus Esc and the F keys) leave it, and they are saved in the recording so you can change them in Edit. It runs only while you record, and **Keys** in the recording controls shows when it is active. Reccut's own shortcuts are never shown. Remove the add-on under Overlays.
- With the add-on installed and **Show keystrokes** on, choose what to read: **Shortcuts**, **Keyboard** (Off, Left half or Whole), **Mouse buttons** and **Controller**. Then choose how to show it: **Keys as you press them**, a **Live overlay** of the keyboard, mouse and controller, or both. **Overlay X** and **Overlay Y** place the overlay, and you can move it per clip in Edit. Each keyboard mode asks first, because it saves those keys in the recording, also when you type. Whole saves nearly everything you type, including passwords outside macOS. Turn it off before you record normal work. A controller shows up after you press a button on it.
- A recording with keystrokes gets its own **KEYS** layer above the screen and PiP in Edit. It follows the screen when you move, trim or cut, and you can select it to change it, or delete it without touching the recording.
- **Cursor zoom** zooms in on the mouse pointer. Press the recording shortcut with **M** to turn it on and off.
- The recording is saved in the Recordings folder of the open project and added to its media. If the timeline is empty, it is also placed on the timeline.

Everything is saved as separate files, so in the editor you can still change the layout, camera shape, overlays and the level of the microphone and system audio.

Screen recordings with a camera are added as two clips: the screen on **V1** and **PiP** on **V2** (or the next available video track). They are linked, so moving, trimming, cutting or changing the speed keeps them in sync. Click PiP to select only the camera. Microphone and system audio stay on the screen clip.

To place the camera freely, select **PiP** and open **Recording** or **Video**. Drag it in the viewer, use the handles to scale and rotate it, or type values under **Transform**. The anchor point starts in the middle of the PiP, and follows it when the layout changes.

To move yourself inside the frame, use **Offset X** and **Offset Y** under **Camera**. Offset works where the frame crops the picture, so a 9:16 frame on a 16:9 camera moves sideways. Both can be keyframed.

Every recording file carries its own recording data: which part it is, how the two files line up, the layout, size and cursor events. Importing either file brings in the whole recording, with screen and camera in sync and placed as you recorded them, even if the files were moved or renamed. Keep both files in the same folder. WAV and Ogg files cannot carry this data, so keep their names if you move them.

If your camera image is too dark, select the **PiP** clip and open **Color → Camera Color** (also in **Recording**). Raise **Exposure** to brighten it, or adjust **Contrast**, **Saturation** and **Temperature**. All color and effect controls on this clip affect only the camera, including when it fills the screen. Changes are saved in the project and included in the export. **Reset Camera Color** restores the four simple controls, including their keyframes.

Choose **Detach PiP** in the Recording tab or the clip's right click menu to edit its timing independently. In **Recording → PiP Connection**, choose a screen recording to link it again; this synchronizes PiP to that screen clip. For an older recording that is still one combined timeline clip, choose **Show PiP on Separate Track** in Recording or the right click menu.
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
Choose Import Media ({{key:import}}) and select files, or drag files from Finder or File Explorer into the main window. The import window opens with the dropped files selected, so you can choose whether to copy and optimize them. Importing adds them to the media browser; dropping directly onto the timeline also places them there after confirmation. The Export room has its own drop area for batch conversion. Reccut reads about as many formats as VLC, so you should not need to convert anything first:

- **Video:** MP4, MOV, MKV, WebM, AVI, MXF, MPEG 1 and 2, MPEG-TS, M2TS and AVCHD (.mts) from cameras, DV, FLV, WMV, 3GP, OGV, Y4M and raw H.264 or HEVC streams. Codecs include H.264 and HEVC (also 10-bit and 4:2:2), ProRes (also 4444 with alpha), DNxHD and DNxHR, AV1, VP8, VP9, FFV1, MJPEG and Theora.
- **Audio:** WAV, AIFF, FLAC, MP3, AAC and M4A, ALAC, Ogg, Opus, WMA, AC-3, E-AC-3, DTS, AMR, CAF, WavPack, TTA, Speex, MP2 and more.
- **Images:** JPEG, PNG, GIF, WebP, HEIC, JPEG XL, AVIF, TIFF, BMP, TGA, EXR, HDR, DPX, JPEG 2000, QOI and camera RAW photos, plus layered PSD and SVG files. Animated GIF and WebP become video clips.
- **Image sequences:** numbered frames (render_0001.png, render_0002.png …) from animation and 3D programs. Turn on **Import numbered images as one video** in the import window and choose the frame rate. One frame is enough: the whole numbered sequence becomes one video clip. Frames with transparency keep it, and EXR, DPX and 16-bit frames keep their extra precision.

Interlaced video (from TV and older cameras) is deinterlaced, video with transparency keeps its alpha, and damaged files are read as far as possible.

![Import options.](import.jpg)

The import window works like the Finder. Pick a place or a drive on the left, open folders, and see the clips as thumbnails. Click a clip to preview it on the right. Check the box on each clip you want, or double click it. Space checks the clip you are previewing, and **Select All** checks every file in the folder. You can check clips from several folders, and drag files in from the Finder. Then choose how they are imported:

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

![Nature footage in the Media browser. Each filmstrip previews a source clip.](browser.jpg)

## Mark a range

- Skim to where the range should start and press {{key:setIn}}. Skim to the end and press {{key:setOut}}. A yellow frame shows the range, and the name bar shows its start, end and length.
- You can also drag across the filmstrip to select a range, and drag the yellow edges to adjust it.
- {{key:rangeClip}} marks the whole clip, and {{key:clearRange}} removes the range.
- A click in the filmstrip selects the whole clip and places the white browser playhead. I and O use the playhead when the pointer is not over a clip.

## Put it in the timeline

- {{key:append}} appends the range to the end of the storyline.
- {{key:insert}} inserts it at the playhead, {{key:connect}} connects it above the storyline and {{key:overwrite}} overwrites from the playhead.
- Or drag the yellow range down to the timeline. To use the whole clip, click it and drag it, no In or Out needed.

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

The files are saved in the Optimized Media folder of the project and used for playback from then on. Progress is shown at the top of the window, where you can also cancel it. The original files are never changed.

You can also choose Create optimized media when you import.

**Proxies and export.** Formats the preview cannot play directly, such as ProRes, DNxHD, MPEG-2, interlaced and HDR video, get a proxy when you import them: a copy of at most 1920 pixels that is light to edit. H.264, HEVC, VP9 and AV1 play directly. By default the export reads the original files, also ProRes, so the proxy never limits the quality. The proxy and the export prepare the picture the same way (HDR is tone mapped, other color spaces become Rec. 709), so color corrections look the same in the export as in the preview. Choose **Source media › Optimized media** in the export settings for a faster export from the copies you edit with; files that only have a proxy are then at most 1920 pixels. If an original is missing, the export uses the proxy or optimized media.

[[run:optimize|Optimize Selected Media]]
`,
    see: ['import', 'hdr'],
  },
  {
    id: 'hdr',
    section: 'Media',
    title: 'HDR, 10-bit and RAW',
    summary: 'How Reccut handles HDR video, 10-bit clips and camera RAW photos.',
    keywords: 'hdr pq hlg 10 bit raw dng cr2 nef arw tone mapping log lut cube apple log slog s-log3 vlog flog logc braw r3d prores raw',
    body: `
**HDR video** (PQ and HLG, for example from iPhones and mirrorless cameras) is detected when you import it, and marked HDR in the browser. Reccut shows and exports it tone mapped to normal SDR, so it looks right on every screen, and keeps 10 bits in the working copy for color correction. Exporting in HDR is not supported yet.

**10-bit clips** keep their precision: optimized media stays 10-bit, and color correction is calculated in 16-bit floating point.

**Camera RAW photos** (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2 and more) are imported using the full size JPEG the camera stores inside the file, with the camera's white balance and the right orientation. The RAW data itself is not developed.

**RAW video** is decoded with the camera maker's own software. When it is installed, Reccut converts the clip to ProRes 4444 when you import it, next to the original file, and uses that file from then on:
- **Blackmagic RAW:** Blackmagic RAW from Blackmagic Design (or DaVinci Resolve).
- **RED R3D and Nikon N-RAW:** REDCINE-X PRO from RED.
- **ARRIRAW:** ARRI Reference Tool (command line) from ARRI. The clip becomes Rec. 709.
- **ProRes RAW** on a Mac: Apple's own decoder (Pro Video Formats, or Final Cut Pro).

If the software is missing, Reccut shows a link to the maker's page, and **Locate** if it is installed somewhere else. Canon Cinema RAW Light has no decoder other apps can use, so export those clips to ProRes in Canon's Cinema RAW Development first.

**LOG footage** (Apple Log, S-Log3, V-Log, F-Log, LogC3) looks flat until it is converted to normal colors. Choose the camera in **Camera LUT** in the Info tab, or choose a .cube LUT file from the camera maker. It applies to every clip from the file, in the viewer and the export, before the color correction.

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

![Choosing layers from the nature project’s SVG title artwork. The same dialog is used for Photoshop layers.](layers.jpg)

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

- The track headers hide a track, mute it or lock it. To add a track, drop a clip on the empty row at the top or bottom.
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

## Select: ordinary editing

Press A, click a clip, and drag it to reorder it or change its lane. Drag an edge to trim. **Example:** move the second demonstration shot before the third, then shorten its ending. The magnetic storyline closes up around the edit.

## Trim: roll, slip and slide

Press T. Drag the edit between two adjacent clips to **roll** it: one clip grows while the other shrinks, keeping their combined duration. **Example:** move a cut later because the first shot ends too soon.

Drag inside a clip to **slip** its source content while its timeline position and duration stay fixed. **Example:** show a later part of a screen recording without changing the surrounding narration. Hold Option/Alt while dragging for a **slide**, which moves the clip and adjusts its neighbours. Available source material limits these edits.

## Position: preserve the empty time

Press P when a clip needs a fixed timeline position and gaps are intentional. **Example:** move a shot later to leave room for a title card. Unlike the magnetic Select move, this can leave a gap and overwrite content at the destination; inspect the result and use Undo if needed.

## Range: work on a time interval

Press R and drag over the timeline to mark an interval. The marked interval can define an export range or the duration of a new effect/redaction. **Example:** mark just the five seconds containing a private email address, then add a redaction. I and O also set range start and end.

## Blade: split before removing

Press B and click the point where you want two clips instead of one. Then press A, select the unwanted piece, and delete it. **Example:** cut on both sides of a failed sentence and remove only that piece. The keyboard Blade command cuts at the playhead instead of the mouse position.

## Zoom and Hand: navigate a long edit

Press Z and click around a cut to inspect it more closely; Option/Alt-click to zoom out. Press H and drag to pan across the timeline without moving clips. Use Zoom to Fit ({{key:zoomFit}}) to see the whole edit, then return to A for clip selection.
`,
    see: ['trimming', 'cutting', 'range', 'creative-reference'],
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
    see: ['browser', 'editing', 'slideshow'],
  },
  {
    id: 'slideshow', section: 'Editing', title: 'Photo Slideshows and Ken Burns',
    summary: 'Create an editable slideshow from selected images, with transitions, motion and blurred backgrounds.',
    keywords: 'slideshow photo photos images still ken burns pan zoom fill height width stretch blur background bildeserie lysbilder',
    body: `Select still images in the Media browser with Shift or Cmd/Ctrl-click. Right-click one of the selected images and choose **Add as Slideshow…**, or use **Edit → Add Selected Photos as Slideshow…**.

Set **Photo duration** and choose browser order, file-name order or a shuffled order. The slideshow appends after existing timeline content. Photo duration is the spacing between cuts; transitions are centered on those cuts, so they do not shorten the total slideshow.

## Transitions

Choose **None** for straight cuts, **Cross Dissolve only**, or **Random from selected types**. With Random, check the types you want. Choices are made once when the slideshow is created and saved with the clips; they do not change during playback. Transition length is limited to less than half a photo so neighboring transitions do not overlap. You can edit each transition later on the timeline.

## Framing and motion

- **Fit entire image** keeps the complete photo visible.
- **Fill frame** crops enough to cover the sequence.
- **Fill height** and **Fill width** preserve proportions and match that dimension; the other dimension can be cropped or leave empty space.
- **Stretch** fills both dimensions and changes proportions.

Choose **None**, **Ken Burns · pan & zoom**, or **Slow pan** for movement. Motion amount controls the zoom. Directions vary across images, and movement eases at the endpoints. An image’s motion remains continuous when the clip is split.

For a single image, apply **Ken Burns** from Effects → Photo motion, or enable it in **Video → Image framing & motion**. Choose zoom in/out or a pan direction and adjust Zoom / travel. Image fit, cropping and ordinary Transform controls remain editable.

## Dark blurred photo background

Enable **Dark, blurred copy of each photo** to create a separate image clip underneath the foreground. Each copy fills the frame, is enlarged slightly to hide blur edges, darkened and blurred. The foreground stays clear. Adjust Background blur and Darkening in the dialog, or edit the background clip’s effects and color afterward.

The image and its background share timing and transition as a single picture, including portrait-to-landscape changes. Clicking either clip lets you edit its appearance independently; timing edits, splits, copies and deletion keep the pair together.

Preview the first three photos, pause or scrub to inspect motion and transitions, then choose **Add Photos**. **Remember these settings** saves defaults for next time. Cancel leaves the timeline unchanged. Creation is one Undo step. Preview and export use the same renderer.
`, see: ['adding', 'transitions', 'keyframes', 'effects'],
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
- A click selects the whole group; Option (Alt) click or double click selects one clip, as if you were inside the group.
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
Set the start of a range with {{key:setIn}} and the end with {{key:setOut}}, or drag with the Range tool ({{key:tool:range}}). {{key:rangeClip}} marks the clip under the playhead. Playback and export can use the range. Clear it with {{key:clearRange}}, or press {{key:setIn}} and {{key:setOut}} at the same spot.

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

Playback starts at the frame under the pointer in the timeline. In Settings → Playback, turn off **Start playback at the mouse position** to always start at the playhead instead.
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
    id: 'tracking',
    section: 'Editing',
    title: 'Tracking: Attach Clips to Moving Objects',
    summary: 'Follow a face, a sign or a product in the video, and pin a redaction, title or image to it.',
    keywords: 'track tracking tracker motion follow attach pin stick object face license plate redact blur pixelate live keyframes parent sporing',
    body: `
Tracking follows something that moves in a video or screen recording, and lets other clips follow it. Use it to keep a redaction on a moving face or license plate, or to pin a title, an arrow or an image to an object. It works in two steps, so you can track first and decide later what should follow.

## 1. Track the object

1. Select the video clip and move the playhead to where the object is clearly visible.
2. In the **Video** tab, under **Tracking**, turn on **Show area**. Drag the dashed box over the object and resize it so it fits tightly.
3. Press **Track Forward**. Reccut follows the object from the playhead to the end of the clip (progress is shown on the button and at the top).

![Show area over a face in the Video tab, and the finished Track 1 under Tracking.](tracking-area.jpg)

The result is saved on the clip as **Track 1**, **Track 2** and so on, with its length. Delete a track with the trash button. If the object disappears for more than half a second, tracking stops there and tells you when.

Choose an area with detail, such as a face, text or a logo. Plain surfaces, motion blur and things that are covered are hard to follow. If tracking stops early, move the playhead to where it stopped and track again from there.

## 2. Attach a clip

1. Put the clip that should follow on a track above the video, for example a redaction, a title or an image, and place it where it should be relative to the object.
2. Select it. Under **Follow Track** choose the track and the mode, and press **Attach**.

![A pixelate redaction following the face live. The redaction and the video are grouped (link badge).](tracking-follow.jpg)

The clip keeps the place it has at the playhead relative to the object, also when it is beside it. It is grouped with the video, so they move together on the timeline. Double click a clip in the group to select only that clip.

- **Live** (default): the clip always follows the track as it is now. Track again, or move, scale or stabilize the video, and the clip follows without attaching it again. Drag the clip in the viewer to change where it sits relative to the object.
- **Keyframes**: writes position, rotation and size keyframes you can adjust one by one. **Tracking keyframes: Remove** deletes only the keyframes tracking wrote; your own keyframes outside the tracked part stay.
- **Rotation** makes the clip turn with the object.
- **Scale (experimental)** makes the clip grow and shrink as the object comes closer or moves away. Real perspective, like a sign seen from the side, is not followed.

**Detach** stops a live link. The clip stays grouped with the video; ungroup it with {{key:ungroup}} if you want.

## Redactions in one step

For a redaction, put it over what it should hide and press **Track Forward** under Follow Track. Reccut tracks what the redaction covers in the video below and attaches the redaction to it.

## With the AI agent

Ask the agent, for example "Blur the face of the woman in the pink shirt" or "Put a label that follows the car". It finds the object in the frames, adds the redaction or title, tracks the object and attaches the clip. You can adjust the result as usual.

How it works: Reccut finds corners inside the area, follows them from frame to frame and works out how the area moves, turns and changes size, ignoring points that do not move with the rest. Tracking and following work the same in the viewer and in exports.
`,
    see: ['redact', 'grouping', 'keyframes', 'stabilize'],
  },
  {
    id: 'transitions',
    section: 'Editing',
    title: 'Transitions',
    summary: 'Dissolves, wipes, pushes and audio crossfades.',
    keywords: 'transition dissolve crossfade wipe push fade motion blur',
    body: `
Add Cross Dissolve ({{key:addTransition}}) adds a dissolve at the selected edit. More transitions are in the Transitions browser ({{key:browser:transitions}}); hold the pointer over one to preview it, and drag it to an edit.

Clips above the storyline can have a transition at the start and the end, and so can effects like Pixelate and Blur. Drag a transition to the start of an effect to fade, wipe or slide the effect in.

A transition covers only the picture part of the clips, so you can still drag the audio fade handles below it. By default it also crossfades the audio. Turn that off for one transition in the inspector (Crossfade audio), or for new transitions in Preferences > Editing; the audio then cuts at the edit.

Push, Wipe, Circle Reveal and Zoom can have motion blur. Turn on Motion blur in the inspector to soften moving edges. The faster the transition, the stronger the blur. Effects like Pixelate and Blur do not have this option.

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
Add Caption ({{key:addCaption}}) adds a caption at the playhead. Double click an empty spot on the caption track to add one that starts there. The Captions tab ({{key:browser:captions}}) generates captions automatically from speech, and imports and exports SRT and WebVTT. Captions can have one to three lines, any font, color, outline and background, and can be placed anywhere. When exporting, burn them in, embed them, or save them as a separate file.

Captions keep their own timing when video clips are moved, trimmed or deleted. You can add text without selecting a video clip. Type directly in the inspector, drag a caption along the caption track to change its time, or drag it in the viewer to change its position. Only explicit grouping makes a caption follow a video clip. While an input field has focus, editor shortcuts are disabled so you can type freely.
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
- Click **Edit in Viewer** to show the shape in the viewer. Drag it to move it, and drag the handles to resize it. Hold Shift to keep the shape, and Option (Alt) to resize from the center.
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
- Drag the box in the viewer to move it, and drag its corners and edges to resize it. Hold Shift to keep the shape, and Option (Alt) to resize from the center. Drag outside the box to draw a new area.

## Effects for the whole frame

For full manual control, use **Blur**, **Pixelate** or **Frosted Glass** from the **Whole Frame** section of the Effects browser, or Add Blur Effect and Add Pixelate Effect in the Edit menu. The effect covers the whole picture, like an adjustment layer in Premiere Pro. Then draw a mask with the pen ({{key:mask:pen}}) in the Masks tab to choose where it works. Several masks can be combined, each with feather, expansion and keyframes, so the shape can follow and change with what you hide. You can also set the shape of any redaction to Whole Frame.

## Styles

- **Pixelate** turns the area into large blocks. Good for text and faces. With **Whole blocks at edge** (on for new redactions) the blocks along the edge are kept whole instead of being cut by the shape, so the edge follows the blocks and can reach a little outside the shape. Turn it off for an exact edge.
- **Blur** makes it soft. Use a high amount for text.
- **Solid** covers the area with a color. This is the safest for passwords, because nothing of the original is left.
- **Frosted** combines blur and blocks, like frosted glass.

In the Redact tab of the inspector you can choose the shape (rectangle, rounded, ellipse or **Freeform**), the amount, a soft edge, rotation and **Redact outside**, which hides everything except the area.

## Follow something that moves

The quickest way is tracking: put the redaction over the object and press **Track Forward** under **Follow Track** in the Redact tab. Reccut follows the object and keeps the redaction on it. See [[article:tracking|Tracking]].

You can also do it by hand. Position, size and rotation can have keyframes. Go to where the object starts, click the keyframe button next to Position and Size, move the playhead and drag the box to the new place. Reccut moves the box smoothly between the keyframes.

With **Freeform** you can follow any shape: drag the points in the viewer, double click the outline to add a point and Option (Alt) click a point to remove it. Click the keyframe button next to **Shape** to animate the points, so the redaction can change shape over time. See Masks.

Redactions work the same in the viewer and in the exported file.
`,
    see: ['tracking', 'keyframes', 'effects'],
  },
  {
    id: 'effects',
    section: 'Editing',
    title: 'Effects',
    summary: 'Adjustment layers, color fills, grain, glitch, VHS, glow and other video effects.',
    keywords: 'effects adjustment layer justeringslag noise grain glitch VHS analog tape RGB split scanlines glow bloom blur vignette sepia shadow border rounded solid color gradient ramp linear radial freeform points spread',
    body: `
The Effects browser ({{key:browser:effects}}) shows every effect with a live preview. At the top are the redactions for hiding passwords and faces, see Redacting Passwords and Faces. Drag an effect onto a clip, or select clips and click it. Adjust or remove effects in the Effects tab of the inspector ({{key:inspector:effects}}). The classic clip effect amounts can have keyframes. Keying and stack effects have their own controls above them.

Click the **×** beside an effect name to remove it. Adjusted effects show a warning before removal. **Don’t show this again** disables the warning for future removals; restore it in **Settings → General → Projects → Warn before removing adjusted effects**. Removing an effect and all its settings or keyframes is one Undo step.

**Drop Shadow** follows the visible pixels after keying, cropping and masks. **Amount** reaches 500% for large shadows. Choose a **Color**, adjust **Softness** (0% gives a sharp edge), set **Opacity**, and move the shadow with **Position X/Y** in project pixels. Amount, softness, opacity and position support keyframes. Transparent areas continue to show the clips underneath. Vignette and colour adjustments also preserve the source transparency.

## Adjustment layers

Choose **Adjustment layer** at the top of the Effects browser, or **Edit → Add Adjustment Layer**. This creates an empty clip on a video track above the picture. It covers the marked In/Out range when one is set, otherwise the remainder of the storyline clip at the playhead (or five seconds in empty space). Trim, extend, move, split or duplicate it like a clip.

The layer processes the combined picture on every video track below it, only during its duration. Video clips and titles on higher tracks, and captions, are unaffected. Add effects in **Effects**, set exposure, white balance, wheels or Film Looks in **Color**, and draw **Masks** to limit the affected region. **Video → Layer strength** blends the whole look, and Fade in/out can ease it in. A blank layer leaves the picture unchanged. Switch the layer off to compare. Multiple adjustment layers process in track order.

## Stylize effects

The **Stylize** section includes **Digital noise**, **Film grain**, **Digital glitch**, **VHS / analog tape**, **RGB split**, **Chromatic aberration**, **Scanlines**, and **Glow / bloom**. Click to apply to selected video/image/recording clips or an adjustment layer. With no eligible selection, a click creates an adjustment layer carrying the effect. Drag onto a clip to apply it there, or onto an empty video track for a new adjustment layer. The same effects are available under **Add stack effect…**.

Noise, film grain, glitch and VHS animate from the timeline, so seeking and exporting a frame reproduce the same pattern. **Speed 0** freezes animation and **Seed** changes its random pattern. Parameters in the stack are static; layer strength, color controls and masks support keyframes.

**VHS** treats the whole picture as a soft, low-bandwidth tape image. Color bleeds more than luminance, static changes from frame to frame, and brief tracking faults occasionally bend the picture. Choose an SP, LP or EP-inspired preset, then adjust Picture softness, Color bleed, Static noise and Tracking faults. Advanced includes chroma delay, subtle scanlines, faded color, speed and seed. These are creative tape simulations, not a measured hardware-deck profile.

**Film grain** uses irregular, spatially correlated texture and a tonal response instead of digital static. Start with fine 35mm-inspired grain, use the 16mm preset for stronger texture, or aged 8mm for optional dust, scratches, gate weave and flicker. These are procedural film-inspired looks, not scanned stock samples. Grain size is consistent across output sizes.

**RGB split** offsets channels uniformly in a chosen direction. **Chromatic aberration** models radial lens fringing: it leaves the lens center aligned and increases separation toward the edges. Use a low Amount for subtle optics, and Advanced to move the lens center.

Start with light film grain and glow for a subtle look. Use RGB split and glitch in short bursts around edits. Keep important text on a track above the adjustment layer for legibility.

## Solid color and gradient ramp

Choose **Solid color** or **Gradient ramp** under **Color fills** in the Effects browser, or from **Add stack effect…** in the inspector. These effects fill a video, image or recording source. **Strength** blends the fill with the source. Turn on **Preserve source alpha** to keep transparent areas, for example after a color key.

- **Linear**: drag the start and end handles to set the direction and length, or enter **Angle** in degrees and choose a preset. 0° runs left to right and 90° runs down. Click the color bar once to add a color. Click a round color handle to select it, then change its color or position below.
- **Radial**: drag the center and radius handles. Color stops run from the center to the outer radius. Center and Radius also have numeric controls.
- **Freeform**: double-click the preview to add a color point. Drag points to place them, choose their colors, and adjust **Point spread** with the square handle or numeric control. Larger spread gives a color more influence. Freeform uses smooth point blending; it does not include Illustrator's gradient lines.

Drag a color handle down off the color bar to remove it, or select it and press **Backspace/Delete**. At least two colors remain. Press Escape during a drag to cancel it. **Add point/stop** and **Remove point/stop** also work. A gradient supports up to 32 stops or points. Arrow keys move focused handles; Shift makes larger steps. Edits support undo and redo and are saved in the project. Gradient settings are static. Preview and export use the same renderer. Design fills use these same controls.
`,
    see: ['keying', 'ai-plugins', 'keyframes', 'color', 'redact'],
  },
  {
    id: 'keying',
    section: 'Editing',
    title: 'Keying and Background Removal',
    summary: 'Remove a solid or static background, refine edges and stack multiple keys.',
    keywords: 'greenscreen blue screen chroma key keyer matte gamma despill hair fine detail shadow edge color background remove clean plate difference stack',
    body: `
Select a video, image or recording clip and open the Effects inspector. **Remove solid background** samples the source border at the playhead and adds a color key. Use **Screen color** to select a different color.

**Remove static background** estimates a background reference from nine source frames. Keep the camera and lighting fixed. The subject must move enough to reveal the background in most samples. A stationary subject may become part of the reference. For better control, add a **Background reference key**, put the playhead on a frame with the subject out of shot, and choose **Capture clean background**.

Open **Advanced** for additional controls:

- **Recover fine detail** restores fractional coverage in hair and fine edges. Increase gradually; dark patches of background can also return.
- **Preserve source shadows** retains darker areas of the screen as translucent shadows. Select a bright, unshadowed **Screen color**. **Shadow color range** controls how close the shadow’s hue must be to that sample. These controls cannot distinguish a shadow from foreground with the same screen colour; use a mask where needed.
- **Recover edge color** reduces screen colour contamination in translucent edge pixels. **Remove color spill** reduces the dominant screen channel.
- **Matte black/white** set the transparent and opaque limits. **Matte gamma** adjusts intermediate coverage; values above 1 strengthen translucent detail.
- **Shrink / expand edge** adjusts the outline; positive values shrink the foreground. **Edge feather** softens the boundary. **Invert matte** reverses the retained areas.
- **View** switches between Composite and the black-and-white matte. Keep **Black & white matte** selected to export a reusable matte as video or with Export Frame. White retains the foreground, black removes the background, and grey represents partial coverage. Choose Composite to export the keyed picture instead. Exports include the other visible layers and subsequent effects, just as in the viewer; hide them if you need only the matte.

Fine-detail, shadow and edge-colour recovery belong to Color key. Gamma and the other matte controls also work with Background reference key and Luma key. The new recovery controls default to zero, so existing project keys keep their previous settings.

Effects run from top to bottom. Use the arrows to reorder, duplicate a key to remove another color, or switch an instance off to compare. Blur, saturation, contrast and opacity can also be added to the stack. Existing color correction and clip effects follow the stack. Masks can remove unwanted areas afterward. Stack parameters are currently static.

On recordings, choose Camera or Screen before adding an effect. Preview and export share the same renderer. Automatic background estimation is designed for a locked camera; it is not person segmentation or AI foreground reconstruction. Complex footage may need an external AI processor.
`,
    see: ['effects', 'masks', 'ai-plugins'],
  },
  {
    id: 'ai-plugins',
    section: 'AI and Plugins',
    title: 'AI Editing Agent and External Processors',
    summary: 'Let an AI model edit for you, with a cloud provider or a local model, or connect a local video processor.',
    keywords: 'ai chat agent model api key openai anthropic claude gemini mistral openrouter ollama lm studio llama local plugins corridorkey ofx processor',
    body: `
Open **Settings → AI** and choose a provider: OpenAI, Anthropic Claude, Google Gemini, Mistral, OpenRouter, Groq, xAI, DeepSeek, or a local server such as Ollama, LM Studio or llama.cpp. **Other server or gateway** takes any OpenAI-compatible or Anthropic-compatible address, also on your local network. Choose **Fetch models** to pick an exact model ID. The model must support tool calling. Turn off **Model can see images** for text-only models.

Cloud providers need your own API key and bill you for usage. Keys use encrypted operating system storage when available, otherwise session memory only. Changing the provider or address removes the previous key. Local servers need no key, and nothing leaves your computer.

## The editing agent

Choose **AI** in the toolbar. The first time, a short setup lets you choose a model on this computer, Google Gemini, Claude or OpenAI. Choose **? What can I ask** for tips and examples. Describe the result you want. The agent reads the timeline and library, places and cuts clips, trims, moves and deletes, adds titles, captions and transitions, sets volume, fades, colour and stack effects, imports files you name, and looks up this manual. It renders frames from the timeline to check its work.

- **Subtitles and translation:** "Subtitle this video in Finnish." The agent transcribes the speech with the local speech model, translates and condenses it, and replaces the captions in one step. Reccut fits the timing to common subtitle rules: at least one second on screen, no more than 17 characters per second, two lines of 42 characters, a short gap between captions and no overlaps. The agent rewrites captions that break the rules. Read through the result before you publish it.
- **Hide or follow something that moves:** "Blur the face of the man in the blue jacket." The agent finds the object in the frames, adds a redaction, tracks the object and attaches the redaction to it. It can also pin titles and images to objects, and attach clips to tracks you made yourself.
- **Colour and exposure:** "Adjust colour and exposure on every clip so they look good." The agent measures brightness, clipping, saturation and colour cast in each clip, corrects them with the colour controls and wheels, and makes clips from the same scene match.
- **Edit raw footage:** "Make a tutorial from my talking head and the screen recordings." The agent transcribes each clip with word times, finds pauses from the audio level, keeps the best take of each sentence, finds what happens in long screen recordings from scene changes, cursor zoom and contact sheets, and builds the whole edit in one step with the screen parts timed to the narration. Cuts are placed between words with a short natural pause.
- **Your own titles:** describe a lower third, callout or end card and the agent designs an animated title template for it, adds it to the Titles library and places it.
- **Tell a story:** attach a script (PDF, Typeloom project, Word, Final Draft, Fountain, RTF or text), storyboard images or a short brief with **Attach…**. The agent finds every take of every line, picks the best one and builds the edit. Without a script or brief it asks what the video is for, its length and tone before it cuts, or proposes a structure from the footage. The brief, the paper edit and the documents are saved with the project.
- **Graphics and intros:** ask for an infographic, animated chart, intro, chapter card or logo animation. The agent writes and renders it as a video clip (with transparency when it goes over footage), adds it to the library and places it.
- **AI video:** **Higgsfield AI Video** comes with Reccut as a plugin. Open it from **Plugins** in the toolbar, set up your Higgsfield key once, describe a shot and generate it, optionally starting from the frame at the playhead. The agent can use it too. You see the estimated price and confirm each generation.
- **Plugins:** ask the agent for a tool, for example "a plugin that reduces noise with a strength slider". It makes a plugin with its own icon and settings (an FFmpeg command or a Python script) and shows it to you in full. Nothing runs until you choose **Install processor**. Installed plugins are listed under **Plugins** in the toolbar and open as small tool windows you can move anywhere; choose a clip and **Apply to selected clip**. When you ask the agent to change a plugin, it updates the same plugin to a new version instead of adding another one.

## Managing and sharing plugins

In **Settings → Plugins**, tools are grouped into **Record**, **Edit**, **Export** and **Design**. Your current workspace appears first and opens automatically. Use the workspace buttons to jump to another section. Photo sources, API keys and online templates are under **Design**; video tools and plugin installation are under **Edit**. Source labels explain whether a connection is ready, needs a key or needs sign-in.

Video plugins have **Open**, **Settings**, **Share…** and **Remove**. The gear in a plugin's window opens the same settings. A plugin's settings are the values it starts with, also when the AI agent uses it; you can still change them in its window each time. Higgsfield's settings hold your account, the models and whether to ask before each generation. Share saves a .reccut-plugin file; others install it by double-clicking it. Sharing is free, and you may also sell your plugins on your own terms; you accept the sharing terms when you export. Installing any plugin, from the agent or from a file, asks you to confirm that you use it at your own risk: a plugin runs on your computer with your permissions and can change files and projects. Install only plugins you trust and keep backups.

Scripts from **Typeloom**: export the project as a Typeloom project file (.typeloom) and attach it. The binder order, scene headings, character cues, dialogue and the corkboard synopsis of each document are kept, so the agent can follow the acts and scenes. A screenplay exported as PDF works too.
- **Anything in the menus:** the agent can find and run every command in Reccut, select clips, move the playhead, change any inspector property, the project format and caption style, Settings, recording settings and keyboard shortcuts.
- **Help:** ask "where do I change the frame rate?" or "how do I stabilize a clip?" and the agent answers with the menu and shortcut, and can open the panel or help article for you. It does not change anything when you only ask.
- **Match a style:** attach an image with **Image…**, by pasting or by dropping it on the message field, and ask the agent to make the clips look like it.

Each change is an undo step, and **Undo this request** reverts everything the agent did in its last request. **Stop** ends a request between steps.

The agent cannot yet create voice-over or music, or export. What is sent to the provider: your messages and attached images, what the agent reads from the project (clip names, timings, captions, the transcript and look measurements) and, if the model can see images, rendered frames. Media files, audio and local paths are not uploaded. The speech model runs on your computer. Manage installed subtitle models in Settings → AI; Whisper Base is included, and additional models are optional downloads.

**External video processors** install from a Reccut JSON manifest pointing to a trusted local executable. On a video clip, open Effects → External processing to process the full source and apply the result to that clip. The source timing must be preserved; original audio and media remain available. Cancel through Background tasks.

Native OFX and Adobe plugins cannot be loaded directly. CorridorKey needs an adapter that writes an alpha video, or processing in its standalone app followed by importing the result. Models, licences and runtimes are installed separately. There is no bundled CorridorKey adapter or AI matting model.
`,
    see: ['ai-setup', 'ai-local', 'ai-recipes', 'plugins-guide', 'processor-guide', 'keying'],
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
- **Video** ({{key:inspector:video}}): opacity, position, scale, rotation, anchor point, crop, animation presets and fades. While this tab is open, the selected clip has handles in the viewer: drag a corner to scale, the round handle to rotate (Shift for 15° steps) and the crosshair to move the **anchor point**. Scale and rotation pivot around the anchor point. Dragging the crosshair leaves the picture where it is. **Anchor X** and **Anchor Y** have keyframe diamonds, so the anchor point can be animated.
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

**Pattern backgrounds:** in Editing, open **Titles → Backgrounds** and add Shape Background or Grid Background. The Video inspector has the same pattern controls as Design, with diamonds for animation. Size, spacing, variation, distribution strength, seed, symbol rotation and X/Y offsets interpolate between keyframes. Symbol, pattern type, colors and distribution direction switch at the next keyframe.

**Expressions:** hold Alt/Option over a property name or its diamond. When the pointer shows **ƒx**, click to add automatic motion such as Wiggle or Oscillate. See [[article:expressions|Expressions]].

New keyframes use **Ease In and Out** by default. Change this to **Linear** in Settings → Editing → Default keyframe interpolation, or use the curve button in the timeline toolbar. The default applies to all properties; existing keyframes keep their easing.
`,
    see: ['inspector', 'expressions'],
  },
  {
    id: 'expressions',
    section: 'Editing',
    title: 'Expressions',
    summary: 'Add automatic motion such as wiggle, pulse or continuous rotation to a value without setting keyframes.',
    keywords: 'expression expressions fx ƒx wiggle shake jitter oscillate sine pulse rotate spin drift bounce ramp saw flicker random seed procedural automatic animation loop alt option',
    body: `
An expression animates a value for you. Instead of placing many keyframes to make a title shake, a logo spin or a light flicker, you choose a preset and set how strong and how fast it is. Expressions are presets with settings, not code you type.

## Which values can have an expression

Every numeric value in the inspector that has a keyframe diamond can have an expression: position, scale, rotation, opacity, crop, effect amounts, color values, pattern background settings, volume and so on. Values without a diamond, and the layout value of split screens, cannot.

## Add an expression

1. Select the clip and find the value in the inspector.
2. Hold **Alt/Option** and move the pointer over the value's name or its diamond. The pointer changes to an arrow with a red **ƒx** badge when the value supports expressions.
3. Click while holding Alt/Option. The expression controls open under the value.
4. Choose a preset in the Expression menu and adjust its settings.
5. Click **Done** to close the controls.

You can also reach the name with Tab and press Alt/Option and Enter or Space. The playhead must be inside the clip to Alt-click the diamond; the name works at any time.

## Presets

- **Wiggle:** smooth random movement around the value, up and down. A new random target is reached once per cycle.
- **Oscillate:** moves smoothly back and forth, like a sine wave, between the value minus Amount and the value plus Amount.
- **Pulse:** grows from the value up to the value plus Amount and back, once per cycle.
- **Rotation:** continuous rotation. Only offered for rotation values. Amount is degrees per second.
- **Drift:** a steady change that keeps going. Amount is units per second, for example pixels per second for position.
- **Bounce:** a repeating hop above the value, like a ball bouncing on the floor.
- **Ramp:** rises from the value to the value plus Amount and jumps back, once per cycle.
- **Flicker:** jumps to a new random value between the value minus Amount and the value plus Amount at every cycle, with no smoothing.

Use a negative Amount to turn the direction around, for example a Pulse that shrinks instead of grows, or a Rotation that turns counterclockwise.

## Settings

- **Enabled:** turns the expression off without removing it, so you can compare with and without.
- **Amount:** how far the value moves, in the same unit as the value itself (pixels, percent, degrees and so on). For Rotation and Drift it is the change per second.
- **Cycles / second:** how fast the motion repeats. 2 means two cycles every second; 0.5 means one cycle every two seconds. For Rotation and Drift this is called **Speed multiplier** and multiplies Amount.
- **Phase (°):** where in the cycle the motion starts. 360° is one full cycle, so 180° starts halfway. Give two clips the same preset with different phases to keep them out of step.
- **Random Seed:** only for Wiggle and Flicker. Clips with the same seed and settings move the same way; change the seed for a different random pattern.

New expressions start with a moderate Amount for the value, a speed of 1 and a phase of 0. Rotation starts at 45 degrees per second.

## How expressions combine with keyframes

The expression is added on top of the value. Without keyframes it moves around the number in the inspector. With keyframes it moves around the keyframed animation, so you can for example animate a title across the screen with two keyframes and let Wiggle add a shake as it travels.

The number field and the slider still edit the base value, and the diamond still adds keyframes to it. The viewer, playback and export show the result with the expression added. The result stays inside the value's normal range: an opacity cannot go above 100% or below 0%, for example. The Rotation preset is not limited.

Time is counted from the start of the clip, so the motion moves with the clip when you move it on the timeline. Trimming the start of the clip keeps the motion in place, as with keyframes. Clip speed and speed ramps are taken into account.

## See, change and remove an expression

- A value with an active expression has a red diamond, and a **ƒx** link with the preset name under the value. Click the link to open the controls again. A turned off expression shows (disabled) after the name.
- The diamond's tooltip shows the active preset.
- **Remove Expression**, or None in the Expression menu, removes the expression and keeps the base value and keyframes.
- **Reset** (the arrow at the end of the row) removes the expression, the keyframes and returns the value to its default.

## Copying and groups

Expressions are saved with the project and used in exports. Copy and Paste Attributes copies them with the other attributes, and Remove Attributes removes them. With several clips selected, an expression you add or change in the inspector is applied to all of them.

When a clip follows a track in **Live** mode, the track controls position and rotation (and scale if Scale is on), so expressions on those values are not used while it follows. Use **Keyframes** mode if you want a wiggle on top of the tracked motion.

## Tips

- A small Wiggle on Position (Amount 3 to 8, about 2 cycles per second) gives a handheld camera feel.
- Pulse on Scale at 1 cycle per second makes a logo or button breathe.
- Flicker on Opacity with a small Amount and high speed looks like an old film or a faulty light.
- Rotation on a pattern background's symbol rotation gives a slowly turning background.
`,
    see: ['keyframes', 'inspector', 'effects'],
  },

  /* Lyd */
  {
    id: 'voiceover',
    section: 'Audio',
    title: 'Voice Over Studio: Narration and Talking Head',
    summary: 'Record a script line by line with retakes, read it as a teleprompter, and stitch the takes together on the timeline.',
    keywords: 'ai voice text to speech tts kokoro narrator generate read aloud record audio quick microphone voice over studio voiceover narration narrator script teleprompter prompter talking head monologue dialogue retake takes pickup punch in stitch assemble room tone typeloom word pdf markdown fountain final draft read mirror',
    body: `
Open the studio with **Voice Over Studio** in the toolbar of Edit, the headset and microphone button in the timeline toolbar, or {{key:voiceover}}.

## Just record audio

For a quick recording without a script, click the **microphone** in the timeline toolbar, or {{key:recordAudio}}. A small window opens. Choose the microphone in the **Input** menu, then press **Rec** (or Space) and press again to stop. The recording is saved as 24-bit WAV in Recordings/Audio in the project folder and added to the Media browser as Audio 1, Audio 2 and so on. Nothing is trimmed. Esc stops a recording, or closes the window.

## Where the voice ends up

The studio does not have a track of its own. It keeps the script with the takes for each line, and **Stitch to Timeline** builds the voice on the timeline of the open sequence.

## First: room tone

The first time you open the studio in a project, it asks for five seconds of room tone. Sit where you will record, click **Record Room Tone** (or press Space), and stay quiet. It counts down from 3, records 5 seconds and stops by itself. If it hears a voice or a knock, it asks you to try again. You can skip it and record it later.

Record a **new room tone** with **New** next to Room tone at the top, or **New Room Tone** in the side panel, for example when you move to another room or change the microphone. All room tones in the project are kept in a list. Choose the one to use in the Room tone menu at the top or click it in the list. It is used for new takes and for the pauses the next time you stitch. Listen to a room tone with the play button, and remove it from the list with the bin (the file stays in the project). It opens over the editor with the script on the left and the recording tools on the right. Everything you do in the studio is saved in the project, so you can close it and continue later.

## The script

Click **Open Script…** or drop a file on the left side. Typeloom projects, Word (.docx), PDF, Markdown, plain text, Fountain, Final Draft and RTF all work. You can also **Write or Paste** a script, or choose a document that is already attached to the project.

- From **Typeloom**, the binder order is kept. Folders and documents become sections, and the corkboard synopsis is shown as a note that is not read.
- In a **screenplay**, the character name is shown above each line of dialogue, with the parenthetical as a direction.
- In **Markdown**, # headings are sections, and bold, links and lists are read as plain text.
- Words in [brackets] or (parentheses) are shown dimmed, as directions.

Choose **Paragraphs**, **Sentences** or **Lines** to decide how much is one take. Sentences suit dense or technical text, paragraphs suit storytelling.

The line you are reading is highlighted and kept a third down the window, like on a teleprompter. Click any line to go there. **Prompter view** (M) hides the side panel and shows only the script in large text, and the mirror button flips it for a prompter with a beam splitter glass. Change the text size with + and -.

## Recording and retakes

Press **Space** to record the line and Space again to keep the take. The studio goes to the next line, so you can read the whole script with Space alone.

- **R** discards what you are recording and starts the line again right away. Use it the moment you stumble.
- **Esc** discards the take that is recording.
- **Backspace** marks the last take as not usable and goes back to its line, ready for a new try.
- **Up** and **Down** move between lines, **Shift** with the arrows moves between sections, and **N** goes to the next line without a take.
- **P** plays the chosen take of the line, and **S** stars it.

Each line keeps all its takes. The latest take is used, unless you star one or click another one in the list. A crossed out take is never used.

**Count in** waits one or three seconds before recording. **Cue last line** plays the end of the take before, so the new line matches its tone and pace.

## Clean edits without work

Each take is trimmed where your voice starts and ends, with a little **air before** and **air after**. Soft starts such as a breath or an s are kept. Adjust a take with the scissors in the list if needed. Takes that clip or where no voice was found are marked.

The **room tone** is used as the noise floor when the studio listens for your voice, and it fills the pauses between lines on the timeline, so the voice never drops to digital silence.

Aim for peaks between -12 and -6 dB on the meter. The studio records 24-bit WAV without echo cancellation, noise suppression or automatic gain. Choose the input channel if your interface has the microphone on input 2.

## Talking head

Turn on **Camera** to record video with each take. The takes are WebM files with the picture and the sound, and they are trimmed the same way.

## Sound: Studio Voice out of the box

Every person starts with **Studio Voice**: rumble and light noise removed, warmth and presence, soft S sounds and an even level, so it sounds like voice over straight away. Adjust it under **Sound for** in the side panel. It works like Audio Effects on a clip: add effects or templates, turn each one on or off, change the order, adjust it or remove it. **Volume** sets the level for all of the person's takes, and **Reset to Studio Voice** starts over. You hear the changes in the studio timeline while it plays, and they go with the clips when you stitch.

## AI voices

Let an AI voice read the script. Click **Add AI Voice** (or the sparkle next to Record as). The first time, Reccut downloads the voices: about 116 MB, once. They come from **Kokoro**, an open model that runs on this computer, so it is free, needs no account or key, and the script never leaves the computer.

Choose the **Language** first, so the words are pronounced right. Reccut suggests the language the script looks like it is written in. Kokoro has voices made for English (US and UK), Spanish, French, Italian, Brazilian Portuguese and Hindi, and English sounds best. Norwegian, Swedish, Danish, German, Dutch, Finnish, Polish and Portuguese (Portugal) are pronounced in that language, but read by a voice made for another language, so they have an accent. Listen to a few voices and pick the one you like.

Pick a voice from the list. **Listen** plays a short sample, and **Speed** below 1 reads slower, which often suits voice over. Each AI voice is added as a person on its own track.

- Press **Space** (or **Read line**) to let the voice read the selected line. **R** or **Read Again** makes a new take. **Read All Missing Lines** reads every line without a take, one after another, and Space or Esc stops it.
- **Say it as** under the takes is what the voice reads. If it says a name, a number or an abbreviation wrong, write it the way it sounds. The script itself is not changed. Words in [brackets] are never read.
- Takes from an AI voice work like recorded takes: trim, fades, volume, pauses, compare with other people and stitch. They are saved as WAV files in Recordings/Voiceover.
- Change the language, voice and speed under **Sound for**. AI voices start without effects, since they are already clean. Add Studio Voice or other effects if you like.

The pronunciation part is an add-on (phonemizer.js with eSpeak NG, which is GPL software). It is not part of Reccut, and is downloaded from npm and checked before use. Download or remove the AI voices in **Settings → AI**, or at the bottom of the AI Voices window.

## More than one person

Click **Add Person** to add another voice on its own track, with their own takes and their own sound. If the script has roles, the new person gets the next role name. Choose who is recording in **Record as** above the record button, or click a track. In a script with roles, going to a line switches to the person with that name.

- Lines are laid out in script order in shared slots. When two people read the same lines, their takes line up so you can compare them line by line. In a dialogue, the lines interleave as in the script.
- On each track: **mute** (not heard, not stitched, and takes no time), **S** (solo: hear only this person), the **eye** (hide the track) and **X** (remove the person from the studio; the files stay in the Media browser). Double click the name to rename.
- Choices, deletes and adjustments are per person. Stitching puts each person on their own track.

## The studio timeline

At the bottom of the studio, the takes you keep are laid out in script order, the way they will be stitched, with the pauses between them. Press **Shift Space** or the play button to listen from the playhead, with room tone in the pauses. Click in the ruler or an empty spot to move the playhead.

Click a clip to select it. The script jumps to its line.

- Drag the **yellow edges** to trim the start or the end. The clips after it move along.
- Drag the **round handles** at the top to fade in and out.
- Under the timeline: **Volume** (with **Normalize** to a peak of -3 dB), **Fade in**, **Fade out**, **Pause after**, and exact **Start** and **End**.
- **Delete** (or Backspace) removes the clip from the timeline. The takes are kept, the line is crossed out in the script, and clicking **deleted** on the line or **Restore Deleted** brings it back. Recording a new take of the line also brings it back.
- Double click a clip to hear only that clip.

Everything you adjust here goes with the clips when you stitch.

## Space between clips

**Pauses** above the studio timeline sets the default space between clips: **after a sentence** in the same paragraph, **after a paragraph** and **before a section** (a new heading or scene). The script decides which one is used. The same settings are in **Settings → Editing → Voice Over Studio**, together with the air kept before and after the voice when a take is trimmed.

To change the space after one clip, select it and change **Pause after**. **Default** takes it back to the default, and **Use for all** makes that pause the new default for all pauses of the same kind. **Clear own pauses** in Pauses takes every clip back to the defaults.

## Stitch to the timeline

**Stitch to Timeline** (Cmd or Ctrl and Return in the studio) puts the chosen takes in script order, at the playhead or at the end. The pause after each line follows the script: a short pause after a sentence, a longer one after a paragraph and the longest before a new section. Change the pauses under **Stitch**.

- Voice takes go on one audio track under the picture, grouped so they move together, with room tone in the pauses.
- Talking head takes go into the storyline, cut back to back. The pause is the take's own sound, so the picture never goes black.

After retakes, press **Stitch Again**. The clips from the last stitch are replaced, so the timeline always has the best takes. The takes are also in the Media browser, named after the line, so you can use them by hand.

The script is added to the project story, so the AI agent can use it to match the takes to the script.
`,
    see: ['audio', 'audio-effects', 'recording'],
  },
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

- **Fix and Enhance**: Studio Voice (the default in the Voice Over Studio), Voice Clean Up ({{key:audio:cleanup}}), Podcast Voice, Reduce Noise, Remove Hum (50 or 60 Hz), Remove Rumble, Even Out Levels, Broadcast Loud and Quiet Pauses.
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
![The Audio inspector with levels, volume, fades and effects for the demo audio track.](audio.jpg)

- Drag the yellow volume line on a clip, or use {{key:volumeUp}} and {{key:volumeDown}}. The waveform grows or shrinks with the level. Option (Alt) click the line once to add a volume keyframe.
- Clip volume starts at **0 dB**. The clip shows its level, and hovering or dragging the volume line or a volume point shows the exact dB value next to the pointer. Positive values boost the level; negative values reduce it.
- Drag a volume point to adjust it, or drag the line between two points to move both levels together. With four points, lower the middle segment to create a quiet section with smooth transitions and unchanged levels outside it. Right click a point to choose Linear, Ease In, Ease Out, Ease In and Out or Hold, or to delete it.
- Drag the fade handles at the top corners of the audio to fade in and out.
- **Expand Audio** ({{key:expandAudio}}) shows the audio below the video. Drag its edges past the video for J and L cuts.
- The **Levels** at the top of the Audio tab show the waveform of the clip with its peak and average level. Red means the audio clips (goes over 0 dBFS). Audio Format shows the codec, sample rate and channels of the file.
- **Stereo or mono**: in the Audio tab, **Channels** sets each audio source in a clip to Stereo or Mono. Mono mixes all channels in the source and plays them equally on both sides, also in the export.
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
    keywords: 'color correction grade exposure contrast highlights shadows saturation temperature tint wheels lift gamma gain looks film stock lut emulation kodak fuji black white orthochromatic filter sepia',
    body: `
Select a clip and show Color ({{key:inspector:color}}).

For screen recordings, select the **PiP** clip on V2 to adjust only the camera. **Camera Color** provides simple exposure, contrast, saturation and temperature controls; the looks, light, color and wheels below also apply only to the selected PiP clip. Select the screen clip on V1 to adjust the screen separately. On older recordings that are still a single timeline clip, Camera Color adjusts just the camera and the other color controls apply to both images. Choose **Show PiP on Separate Track** in Recording to separate an older clip.

![Color wheels for shadows, midtones and highlights.](color.jpg)

- **Looks** apply a ready made style in one click.
- **Film Looks** simulate film stocks (Kodak Portra, Ektar, Kodachrome, Fujifilm Velvia, Tri-X, Double-X and more), black and white with colour filters, toned prints and creative styles. **Strength** blends the look with the corrected picture, and can have keyframes. **Orthochromatic** is red-blind black and white film, as in The Lighthouse: skin and lips turn dark, skies turn light. The **red filter** does the opposite: dark skies and smooth, light skin.
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
    summary: 'Use Easy Export for presets, the Export room for more options, or Export Frame for a still image.',
    keywords: 'export render share format mp4 mov prores gif audio crop size',
    body: `
Choose **File → Easy Export** ({{key:export}}) to open the simple project export dialog. Choose a preset, file name, destination, format, resolution and frame rate, then click **Export**. **More Options** opens the Export room.

Click **Export Project** in the Edit room to open the current project in the Export room. It starts with MP4 (H.264), high quality, and the sequence’s size and frame rate. A marked timeline range is carried over. Review the settings, then click **Export Project** in the Export room to start the job. **View → Export Room** ({{key:roomExport}}) opens the room with your current settings.

You can also drop video or audio files into Export to convert them without putting them on the editing timeline. Choose a preset or your own settings, then convert one file or use **Convert All** to add the imported files to the queue.

![The Export room with format, size, crop and captions.](exportroom.jpg)

- Formats include MP4 (H.264, HEVC), MOV, ProRes, WebM, MKV, animated GIF and audio only.
- Choose a preset, or set the size, frame rate, quality or bit rate yourself.
- Crop to another aspect ratio, for example 9:16 for Shorts, and move the crop in the preview.
- Captions can be burned in, embedded or saved as SRT or WebVTT.

Exports are saved in the Exports folder of the project by default, and run in the background so you can keep working.
`,
    see: ['export-frame', 'captions', 'range'],
  },
  {
    id: 'export-frame',
    section: 'Export',
    title: 'Export a frame',
    summary: 'Save the timeline image at the playhead as PNG, JPEG or WebP, with optional transparency.',
    keywords: 'export frame still image picture screenshot snapshot png jpeg jpg webp alpha transparent transparency mask chroma key resolution',
    body: `
Move the timeline playhead to the image you want, then choose **File → Export Frame…** ({{key:exportFrame}}). Playback pauses and the current sequence and position are captured for this export.

Choose **PNG**, **JPEG** or **WebP**, and enter the width and height in pixels. **Keep sequence aspect ratio** links the dimensions. Turn it off to set each dimension yourself; the picture fits inside that size without stretching. Still images can use exact, odd dimensions, from 1 to 8192 pixels per side.

Choose a folder with **Save to**, then click **Export Frame…** to choose the final file name and location. The full quality image renders in the background from the original media, including visible layers, titles, captions, color, effects, cropping, masks and chroma key.

Enable **Include alpha channel** with PNG or WebP to keep empty and removed areas transparent, including soft mask and key edges. Visible layers underneath are still included: disable or remove a background layer if you want transparency there. With alpha off, empty areas are black. JPEG cannot store transparency; choose PNG or WebP for alpha.

At the end of the timeline, Export Frame saves the last frame. A marked In/Out range does not change which frame is exported. When it is ready, use the notification to open the image or reveal it in its folder.
`,
    see: ['export', 'masks', 'effects'],
  },

  /* Referanse */
  {
    id: 'preferences',
    section: 'Reference',
    title: 'Settings',
    summary: 'Defaults for editing, playback, import, audio and export, and your own keyboard shortcuts.',
    keywords: 'settings preferences options defaults keyboard shortcuts command editor customize screenshot screen capture hidden invisible window behind',
    body: `
Open Settings with {{key:prefs}}. The icons at the top switch between the parts, like in Final Cut Pro. Every change is saved right away.

- **General**: where new projects are created, whether the last project opens at startup, including Reccut in screenshots and screen recordings, looking for missing media, and Reset All Settings.
- **Editing**: default lengths of transitions, crossfades, stills, titles and freeze frames, snapping, and moving the playhead to the end of added clips.
- **Playback**: skimming, viewer quality (better performance draws the viewer at half resolution), loop playback and keeping the pitch at other speeds.
- **Import**: copy files into the project or leave them in place, create optimized media, and analyze video for stabilization.
- **Audio**: how Auto Sync Audio groups audio and switches off the camera audio.
- **Export**: whether exports go to the project's Exports folder or another folder.
- **AI**: provider, API key, model, image support and local-server connections.
- **Plugins**: open tools, configure defaults, share and remove plugins, and set up Higgsfield.

## Include Reccut in screenshots

Open **Settings → General → Screen Capture** and leave **Include Reccut in screenshots and screen recordings** on. This is the default, including after upgrading from the older hidden default. The same switch is available under **Record → Recording**. Changes apply immediately and are saved.

If you turn it off, supported capture tools show the windows behind Reccut instead. Turn it back on if Reccut is missing from your screenshots.

![General settings.](settings.jpg)

## Keyboard shortcuts

Under **Keyboard** you can change the shortcut of any command:

- Search for a command or a key, or pick a menu on the left.
- Click the shortcut and press the new keys. Esc cancels.
- If the keys are already used, Reccut says by which command, and you choose whether to move them.
- The × removes a shortcut, and the arrow brings back the default. Changed only shows what you have changed, and Reset All goes back to the defaults.
- Export saves your shortcuts to a file, and Import loads them, for example on another computer.

Record, Edit, Export and Design each have their own shortcuts, and the menu bar changes with the room. A key only works in the room you are in, so the same key can do different things in Edit and Design. Project, room, Settings and Help commands work everywhere. The recording keys are set under Shortcuts in Record.

The menus, the Keyboard Shortcuts list ({{key:shortcuts}}) and Quick Search always show your own shortcuts.

![The keyboard shortcut editor.](keyboard.jpg)

[[run:prefs|Open Settings]]
`,
    see: ['shortcuts', 'search'],
  },
  { id: 'shortcuts', section: 'Reference', title: 'Keyboard Shortcuts', summary: 'Every shortcut in Reccut, grouped by menu.', keywords: 'keys keyboard hotkeys', body: 'On macOS, Cmd is ⌘, Option is ⌥, Control is ⌃ and Shift is ⇧. Windows uses Ctrl where a command uses Cmd, and Alt where it uses Option, except for commands with their own platform bindings. This list shows the actual binding on this computer, including custom shortcuts. Change them in Settings → Keyboard.', see: ['preferences', 'command-reference'] },
  {
    id: 'video-scopes',
    section: 'Look',
    title: 'Video Scopes',
    summary: 'Measure the displayed image with luma and RGB waveforms, RGB parade, histogram and vectorscope.',
    keywords: 'scopes spectrogram luminance luma rgb parade waveform histogram vectorscope skin tone exposure color',
    body: `
Open **View → Video Scopes** ({{key:toggleVideoScopes}}), or click the scope icon beside the viewer's playback controls. Scopes are optional and off by default. They follow the image displayed in the viewer after grading, LUTs, effects and compositing.

Choose **Four scopes** or one larger view:

- **Luma waveform**: brightness from 0 to 100%, preserving the image's left-to-right position.
- **RGB waveform**: the three color channels overlaid at the same image positions.
- **RGB parade**: separate red, green and blue waveforms for comparing channel levels and color casts.
- **Histogram**: the number of pixels at each RGB and luma code value from 0 to 255. The pale trace is luma.
- **Vectorscope**: hue direction and chroma strength around a neutral center, with 75% color-bar targets and an optional approximate skin-hue guide.

**Gain** changes trace brightness only. **Log** switches the histogram between logarithmic and linear counts. **Hold** freezes the scopes without pausing the video. Resume to follow the viewer again. Drag the panel's lower-right corner to resize it. Close with the cross or the same menu command. Your layout and display settings are remembered.

The scopes read a sampled **8-bit SDR viewer signal**, not raw camera data or HDR luminance in nits. LOG and HDR sources are measured after their conversion to the viewer. Luma uses Rec.709 coefficients. The skin guide is a reference direction, not a target for every skin tone or light source.

**RGB at 255** is the fraction of sampled pixels with at least one channel at the upper code value. It does not by itself prove overexposure in the original source. Sampling and reduced preview resolution can miss small details or short peaks.

Scopes update up to eight times per second, reuse unchanged frames, and stop sampling when held or hidden. Closing the panel removes its sampler. Scopes and guide labels do not appear in exports. They are hidden during full-screen playback.

[[run:toggleVideoScopes|Show or Hide Video Scopes]]
`,
    see: ['color', 'hdr', 'playback'],
  },
  ...WORKFLOWS,
  ...CATALOG_ARTICLES,
];
