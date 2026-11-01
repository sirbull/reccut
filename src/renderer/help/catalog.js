// Reference lists derive from the same definitions used by the actual controls.
import { AUDIO_EFFECTS, AUDIO_PRESETS } from '../../shared/audiofx.js';
import { EFFECTS, TRANSITIONS, TITLE_TEMPLATES, ANIMATION_PRESETS, RAMP_PRESETS } from '../../shared/model.js';
import { VIDEO_EFFECTS } from '../../shared/videoEffects.js';
import { FILM_LOOKS } from '../../shared/filmLooks.js';
import { VIDEO_FORMATS, AUDIO_FORMATS, CONTAINERS, VIDEO_CODECS, AUDIO_CODECS, PRESETS, QUALITIES, FIT_MODES } from '../../shared/formats.js';

const descriptions = {
  solid: 'Fills the source with a solid colour. Strength blends with the source; Preserve source alpha keeps its existing transparent areas.',
  gradient: 'Fills the source with a linear, radial or freeform gradient. Add and drag colour stops or points, and adjust each freeform point’s spread. Preserve source alpha keeps existing transparent areas.',
  noise: 'Adds digital monochrome or coloured static. This is independent pixel noise; use Film grain for organic film texture.',
  filmGrain: 'Adds irregular, correlated film grain with a luminance-dependent response. Includes 35mm, 16mm and aged 8mm-inspired presets; optional dust, scratches, gate weave and exposure flicker are under Advanced.',
  glitch: 'Creates animated horizontal band displacement and RGB separation. Control Amount, Bands, RGB split, Speed and Seed.',
  vhs: 'Softens the full image with separate luma/chroma filtering, color bleed, low-bandwidth tape detail, static, head-switching noise and intermittent tracking faults. SP, LP and EP-inspired presets set the amount of wear.',
  rgbSplit: 'Separates the red and blue channels in opposite directions. Separation and Angle control the coloured edge fringes.',
  chromatic: 'Simulates radial lens fringing with subpixel channel separation that increases toward the edges. Amount, Edge falloff and Lens center control the optics; the center stays aligned.',
  scanlines: 'Darkens alternating horizontal bands for a monitor or CRT look. Amount controls darkness; Spacing controls line distance.',
  glow: 'Screens a blurred copy over the picture for soft bloom. Amount controls strength and Radius controls the spread.',
  blur: 'Softens fine detail. On a clip it affects that source; an effect clip can affect the picture below it.',
  vignette: 'Darkens the picture towards the corners to draw attention to the centre.',
  sepia: 'Blends a warm brown tint into the image for an aged look.',
  grayscale: 'Removes colour. Use Film Looks for specific black-and-white tonal responses.',
  invert: 'Reverses the colour values for a negative-like result.',
  hue: 'Rotates colours around the colour wheel; large changes also alter skin and brand colours.',
  radius: 'Rounds the source corners. A clip underneath becomes visible around the corners.',
  shadow: 'Amount up to 500%, with color, softness, opacity and X/Y position controls. Adds a shadow following the visible source alpha after keying, cropping and masks. Clips underneath remain visible through transparent areas.',
  border: 'Draws an edge around the source. Set its colour in the Effects inspector.',
  chroma: 'Removes pixels similar to Screen color. Similarity widens the keyed range, Softness smooths the threshold, and Despill reduces coloured edges.',
  difference: 'Compares the source with a captured clean background. Use a locked camera and a reference with the subject absent.',
  luma: 'Keys by brightness rather than colour, useful for bright or dark backgrounds. Invert reverses the retained side.',
  saturation: 'Changes colour intensity. A neutral stack Amount of 1 leaves saturation unchanged.',
  contrast: 'Changes separation between dark and light values. A neutral stack Amount of 1 leaves contrast unchanged.',
  opacity: 'Changes source transparency. A stack Amount of 1 is fully opaque.',
};
const transitionDescriptions = {
  dissolve: 'Blends the outgoing picture into the incoming picture.', dip: 'Passes through black.', dipWhite: 'Passes through white.',
  slideLeft: 'Pushes the image to the left.', slideRight: 'Pushes the image to the right.', slideUp: 'Pushes the image upwards.',
  wipe: 'Reveals the incoming picture with a moving boundary.', circle: 'Reveals through an expanding circle.', zoom: 'Changes scale through the transition.', blur: 'Softens the pictures during the change.',
};
const parameter = (p) => `- **${p.label}**: ${p.options?.map((o) => typeof o === 'object' ? o.label : o).join(', ') || `${p.min}–${p.max}${p.unit ? ` ${p.unit}` : ''}`}. Default: ${p.def}${p.unit ? ` ${p.unit}` : ''}.`;
const containers = (ids) => ids.map((id) => CONTAINERS.find((c) => c.id === id)?.label || id).join(', ');

export const CATALOG_ARTICLES = [
  {
    id: 'audio-reference', section: 'Audio', title: 'Every Audio Effect and Its Controls',
    summary: 'The built-in effect catalogue, descriptions, control ranges, defaults and preset chains.',
    keywords: 'audio reference effects controls parameters defaults eq high pass low pass compressor limiter de esser denoise reverb echo flanger chorus tremolo noise gate robot',
    body: `Open Audio Effects in the browser and apply an effect to a selected clip. Its controls appear in the Audio inspector. These names, descriptions, ranges and defaults come from the application's effect definitions. Effects process from top to bottom; reorder or disable one to compare. Defaults are starting points, not a prescription for every recording.

![Audio properties on the selected clip.](audio.jpg)

${Object.values(AUDIO_EFFECTS).map((e) => `## ${e.label}\n\n${e.desc}\n\n${e.params.map(parameter).join('\n')}`).join('\n\n')}

## Preset chains

Presets add a ready-made chain you can adjust afterwards. Repeated applications can add more effects; inspect the chain before applying another preset.

${AUDIO_PRESETS.map((p) => `- **${p.label}** (${p.category}): ${p.desc} Chain: ${p.chain.map((fx) => AUDIO_EFFECTS[fx.type]?.label || fx.type).join(' → ')}.`).join('\n')}
`, see: ['audio-effects', 'audio-recipe', 'paste-attributes'],
  },
  {
    id: 'effect-reference', section: 'Look', title: 'Video Effects, Keys and Film Looks Reference',
    summary: 'What each visual effect does and where it fits in the image-processing stack.',
    keywords: 'video effects reference adjustment layer noise grain glitch VHS RGB split scanlines glow bloom blur vignette sepia grayscale black white invert hue rounded shadow border saturation opacity chroma luma key matte film looks',
    body: `## Clip effects

Apply these from the Effects browser and adjust them in the Effects inspector. Classic clip-effect amounts can have keyframes. Border colour is a separate control.

${EFFECTS.map((e) => `- **${e.label}**: ${descriptions[e.id]} Range: ${e.min * (e.scale || 1)}–${e.max * (e.scale || 1)}${e.unit || ''}.`).join('\n')}

## Ordered stack effects

${VIDEO_EFFECTS.map((e) => `- **${e.label}**: ${descriptions[e.type]}`).join('\n')}

Stack effects process from top to bottom, before the existing colour correction and classic clip effects. Reorder, duplicate, disable or remove instances in the inspector. Stack parameters are static in this version. For recordings, choose Camera or Screen first.

Click **×** beside an effect name to remove it. Adjusted effects show a warning with **Don’t show this again**. Restore warnings in Settings → General → Projects. Removal is undoable, including all settings and keyframes.

## Matte and edge controls

- **Similarity** sets how much background is removed. **Softness** smooths the transition around the threshold.
- **Recover fine detail** restores fractional coverage in hair and fine edges. Raise gradually to avoid restoring dark background patches.
- **Preserve source shadows** keeps darker areas with the screen’s hue as translucent shadows. Select an unshadowed Screen color sample; **Shadow color range** sets hue tolerance.
- **Recover edge color** reduces screen contamination in translucent edge pixels. **Spill** reduces the dominant screen colour channel.
- **Matte gamma** adjusts fractional coverage without changing fully transparent or fully opaque pixels. Values above 1 strengthen fine detail.
- **Black and white points** refine the matte. Black-and-white matte view helps identify holes or leftover background.
- **Edge shrink/expand** adjusts the boundary; positive edge values shrink the foreground. **Feather** softens it.
- **Invert** reverses visible and removed areas. **View** chooses Composite or matte. Keep the black-and-white matte selected to export it for use in another project, as video or with Export Frame. Choose Composite to export the keyed picture instead.

## Film looks

Choose a look in Color and use Strength to blend it with the corrected image. These are artistic simulations of tone and colour, not measured manufacturer profiles. They do not add grain or halation. Camera LUTs are a separate input conversion on the source media.

${[...new Set(FILM_LOOKS.map((f) => f.group))].map((g) => `**${g}**: ${FILM_LOOKS.filter((f) => f.group === g).map((f) => f.label).join('; ')}.`).join('\n\n')}

**Example:** correct an interview's exposure and white balance first, apply a look, then reduce Strength until skin and brand colours remain appropriate. Paste Attributes can copy the correction to matching shots.
`, see: ['effects', 'keying', 'masks', 'color', 'hdr'],
  },
  {
    id: 'creative-reference', section: 'Editing', title: 'Transitions, Titles, Animation and Speed Presets',
    summary: 'Complete built-in creative preset lists and how to use them.',
    keywords: 'reference transitions titles lower thirds animation presets speed ramps dissolve wipe push zoom blur freeze',
    body: `## Transitions

${TRANSITIONS.map((t) => `- **${t.label}**: ${transitionDescriptions[t.id]}`).join('\n')}

Add a transition from the browser to an edit, or use Add Cross Dissolve at a suitable cut. Select the transition to adjust duration and its audio crossfade. At clip boundaries a transition can act as an entrance or exit. Check the available source handles and play both sides.

## Title templates

![The Titles browser.](titles.jpg)

${TITLE_TEMPLATES.map((t) => `- **${t.label}**${t.category ? ` (${t.category})` : ''}.`).join('\n')}

Drag a title above the storyline or add one at the playhead. Change its text, styling and exposed template fields in the inspector. Trim its timeline clip to set duration. Lower-third templates divide animation into entrance, on-screen time and exit.

## Animation presets

${ANIMATION_PRESETS.map((p) => `- **${p.label}**.`).join('\n')}

Choose a preset in the Video inspector, then inspect its keyframes. A preset can replace properties it animates; use Undo if it replaces existing motion you wanted to keep.

## Speed ramp presets

${RAMP_PRESETS.map((p) => `- **${p.label}**.`).join('\n')}

Use the Speed inspector or Clip → Speed Ramp. The graph shows the speed change; check timing and sound afterwards. Freeze Frame holds a still image, while Reverse Clip prepares reversed media for backwards playback.
`, see: ['transitions', 'titles', 'lower-thirds', 'animation-recipe', 'speed'],
  },
  {
    id: 'export-formats', section: 'Export', title: 'Export Format and Preset Reference',
    summary: 'Every simple format, advanced codec/container combination and audio-only format.',
    keywords: 'formats codecs container prores 422 proxy lt hq mp4 mov mkv webm av1 hevc h264 vp9 pcm aac mp3 wav flac opus gif presets quality fit',
    body: `These lists come from the Export room definitions. Hardware encoding depends on the computer; software paths are available where supported. Format choice does not enable HDR output: imported HDR is exported as SDR in this version.

## Simple video formats

${VIDEO_FORMATS.map((f) => `- **${f.label}** (.${f.ext}): ${f.note}. ${f.audio ? `Audio: ${f.audio.toUpperCase()}.` : 'No audio.'}`).join('\n')}

## Advanced video codecs and containers

${VIDEO_CODECS.map((c) => `- **${c.label}**: ${containers(c.in)}.`).join('\n')}

## Advanced audio codecs

${AUDIO_CODECS.map((c) => `- **${c.label}**: ${containers(c.in)}.`).join('\n')}

## Audio-only formats

${AUDIO_FORMATS.map((f) => `- **${f.label}** (.${f.ext}): ${f.note}.`).join('\n')}

## Presets

${PRESETS.map((p) => `- **${p.label}**: ${p.desc}`).join('\n')}

## Quality and fit

Quality choices: **${QUALITIES.map((q) => q.label).join(', ')}**, or Custom video bitrate. Higher settings normally use more space. Audio bitrate is separate.

${FIT_MODES.map((f) => `- **${f.label}**${f.title ? `: ${f.title}` : ''}.`).join('\n')}

**Example:** choose MP4 H.264 for a broadly compatible delivery, or a supported ProRes format for another editor. For the editable timeline and original files, use Package Project.
`, see: ['export-settings', 'export-recipes', 'caption-workflow', 'hdr'],
  },
];
