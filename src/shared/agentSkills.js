// Skills for the AI agent: short craft guides it loads with load_skill before a task in that area. They keep the
// system prompt short and make the agent's results better. External AI apps get them the same way through MCP.
// `tools` lists the tools a skill relies on; test/agent-skills.test.mjs checks that each one exists.
export const SKILLS = [
  {
    id: 'tutorial-edit',
    title: 'Tutorial and screen recording edit',
    when: 'editing tutorials, demos, presentations and screen recordings',
    tools: ['list_media', 'transcribe_speech', 'inspect_media', 'build_sequence', 'set_clip_properties', 'run_command', 'add_captions', 'preview_frames'],
    text: `Goal: the viewer always knows what to look at and never waits.
1. transcribe_speech every clip with speech. Cut false starts, repeats and silences over about 0.7 s; keep the last fluent take of each sentence.
2. inspect_media the screen recordings to find where things happen. Speed up idle or slow parts (speed 1.5 to 4 on the overlay) instead of cutting them when the viewer needs to see the steps.
3. Keep the speaker visible at the start and at key moments; cover the cuts in the talk with screen footage.
4. Point at things: Highlight Area (run_command highlight:add, then set_clip_properties x, y, w, h, zoom 1.2 to 1.6, dim 0.3 to 0.5) where a small button or field matters. Hold it at least 1.5 s.
5. Chapter cards or lower thirds (add_title) at each new section; captions (add_captions) when the video will be watched without sound.
6. Clean the voice: cleanVoice 0.6 to 1 on noisy microphones; music under speech at -20 to -15 dB, ducked (run_command duckMusic).
7. Check every join with preview_frames and get_timeline before the summary.`,
  },
  {
    id: 'color-grading',
    title: 'Colour correction and grading',
    when: 'colour correction, exposure, matching clips, looks and grades',
    tools: ['analyze_look', 'set_clip_properties', 'preview_frames', 'add_video_effect', 'set_video_effect'],
    text: `Order: correct first, then match, then style. Always analyze_look first and after each pass.
HDR and SDR clips can share a project. Use find_commands/run_command with export:sdr or export:hdr to prepare the output; review settings before starting export. With Originals and supported edits, projects containing PQ/HLG share linear-light composition for either output: SDR white is 203 nits in HDR; SDR output applies one final highlight shoulder and Rec.709 gamut fit after effects and transitions. Unsupported edits or optimized SDR copies use the preview conversion for SDR; the Export notice explains the fallback. HDR PQ export supports the editor's source effects, transitions, grading, film looks, masks and adjustment layers through the normal tools. Analysis and preview_frames measure the approximate tone-mapped SDR viewer; their clippedHighlights metric does not measure HDR nits or prove clipping in the delivered PQ file. Keep HDR highlights deliberate, use modest steps and check delivery on an HDR display. Camera LOG/LUT conversion, tracking, stabilization and non-Normal clip blend modes are not supported by HDR export yet.
Correct: exposure so skin and mid-tones sit naturally (brightness 0.35 to 0.5 for normal scenes); highlights negative when clippedHighlights is above 0.02, shadows positive when crushedBlacks is above 0.02; temperature against warmth and tint against greenCast to neutralise casts (a white wall or shirt should be neutral). Steps of 0.05 to 0.15; exposure and contrast seldom beyond ±0.4, saturation ±0.3.
Match: pick the best-looking clip as the hero and move the others towards its numbers. Same scene, same look.
Looks (apply after correction, gently):
- Teal and orange: lift towards teal (liftX -0.09, liftY -0.05), gain towards orange (gainX 0.05, gainY 0.09), contrast +0.1, saturation +0.05.
- Warm and soft: temperature +0.15, contrast -0.05, highlights -0.2, a film look such as a warm stock with filmMix 0.4 to 0.6.
- Cool and moody: temperature -0.15, exposure -0.1, saturation -0.15, contrast +0.15, shadows -0.1.
- Black and white: saturation -1, or a bw film look; add contrast +0.15.
- Bleach bypass: saturation -0.4, contrast +0.25, highlights -0.1.
- Vintage: film look plus add_video_effect filmGrain {amount 0.2} and a light vignette feel with shadows -0.1.
Targeted colour: add_video_effect hueSaturation and change one range (for example greenSaturation -0.3 to calm grass, orangeSaturation +0.1 for skin warmth).
Never push skin far; leave screen recordings and screenshots alone unless asked. Apply all clips in one set_clip_properties call and check with preview_frames.`,
  },
  {
    id: 'sound-design',
    title: 'Sound design, music and mix',
    when: 'music, sound effects, levels, ducking, voice clean-up and the mix',
    tools: ['get_timeline', 'set_clip_properties', 'run_command', 'add_media_to_timeline', 'import_media', 'generate_voiceover', 'set_music_lane', 'get_beats'],
    text: `Levels (volume in dB): speech is king. Leave speech near 0; music under speech -20 to -14 dB, alone (intro, outro, montage) -6 to 0 dB; ambience -25 to -18 dB; sound effects -12 to -3 dB, short ones louder.
Ducking: select the music and run_command duckMusic so it dips under speech automatically. For an existing pair of volume keyframes, put the playhead between them and run_command volumeSegmentDown or volumeSegmentUp (1 dB per call). With Auto-add Volume Keyframes enabled (run_command autoVolumeKeyframes toggles it), a two-point envelope becomes four points and keeps the outside level unchanged. Subsequent adjustments move the inner pair. Fades: aFadeIn 0.5 to 2 s at the start of music, aFadeOut 2 to 4 s at the end; 0.05 to 0.2 s on every hard audio cut to avoid clicks.
Voice: cleanVoice 0.5 to 1 for noise and room echo (AI noise removal); run_command audio:cleanup for a filter chain, audio:eq for an equaliser.
Music: put it on its own audio lane (-1 and down), mark the lane with set_music_lane and cut on bars from get_beats. End the music on a bar or with a fade, never mid-phrase.
Sound effects: a whoosh 0.1 to 0.3 s before a push or zoom transition, a soft click or pop when text or a callout appears, a riser before a reveal, an impact on a big title. Use them sparingly: one per moment, not on every cut. Generate them with a connected sound server (for example ElevenLabs text_to_sound_effects with a precise prompt and duration), import the file with import_media and place it on a free audio lane with add_media_to_timeline.
Voice-over: generate_voiceover with a downloaded local voice; split at sentences; leave 0.2 to 0.4 s between lines.
Check the result with get_timeline: no overlapping loud elements, music ends with the video.`,
  },
  {
    id: 'transitions',
    title: 'Transitions',
    when: 'adding or choosing transitions between clips',
    tools: ['get_timeline', 'add_transition', 'preview_frames'],
    text: `A cut is the default transition; add others only when they mean something.
- dissolve 0.5 to 1 s: time passes, a soft change of place or mood.
- dip (fade to black) 0.5 to 1.5 s: a chapter ends, the start and end of the video.
- dipWhite 0.3 to 0.8 s: a flash, a memory, an energetic reveal.
- slideLeft, slideRight, slideUp, wipe 0.3 to 0.5 s: energetic social video, a list of steps, a before/after.
- zoom 0.3 to 0.5 s: punchy edits, into a detail.
- circle 0.4 to 0.8 s: playful reveal.
- blur 0.4 to 0.8 s: dreamy or a focus change.
Use one style per video, at most two. Keep motion transitions short; add a whoosh (sound-design skill) for push and zoom. On music, place the cut point on a beat or bar (get_beats). Transitions need source footage beyond the cut; if one fails, trim the clip slightly. Check with preview_frames in the middle of the transition.`,
  },
  {
    id: 'effects',
    title: 'Video effects and stylised looks',
    when: 'applying video effects, keying, blur for privacy and stylised looks',
    tools: ['add_video_effect', 'set_video_effect', 'remove_video_effect', 'get_clip', 'preview_frames', 'run_command', 'set_clip_properties', 'trim_clip'],
    text: `Effects run top to bottom before colour correction. Read get_clip to see the stack and settings, change them with set_video_effect, check with preview_frames.
Recipes (start subtle, then adjust):
- Green or blue screen: chroma with color set to the screen colour, similarity 0.1 to 0.2, despill 0.6 to 0.9; place the background on a lower lane.
- Privacy (a password, email, face or number plate): select, move the playhead to where it appears, run_command redact:blur or redact:pixelate, then set_clip_properties on the new clip with x and y (its centre as an offset from the frame centre in pixels), w and h, and trim_clip it to the time it is visible. Check with preview_frames.
- Film: filmGrain {amount 0.15 to 0.3} plus a film look in set_clip_properties.
- Retro tape: vhs {amount 0.4 to 0.6}; for a short burst, glitch {amount 0.3 to 0.5} on a 0.2 to 0.5 s split of the clip, ideally on a beat.
- Dreamy: glow {amount 0.2 to 0.4, radius 10 to 20} and a light leak (lightLeak) at a transition.
- Cinematic sun: lensFlare with x, y at the light source.
- Fast motion feels natural with motionBlur or naturalMotionBlur.
- Music video energy: rgbSplit or chromatic {amount 0.1 to 0.3}, scanlines for screens.
Use effects to support the story, not on every clip. Stylise one scene or moment, not the whole video, unless asked.`,
  },
  {
    id: 'social-video',
    title: 'Social media video',
    when: 'Reels, TikTok, Shorts, vertical or square video and ads',
    tools: ['set_project_settings', 'build_sequence', 'add_captions', 'add_title', 'set_clip_properties', 'get_beats', 'add_transition'],
    text: `Format: vertical 1080×1920 for Reels, TikTok and Shorts; 1080×1080 or 1080×1350 for feeds; set it with set_project_settings and reframe clips with scale, x and y.
Hook in the first 1 to 2 s: the strongest moment or a bold statement title. No slow intro, no logo first.
Pace: shots of 1 to 3 s, cut on beats (get_beats); remove every pause. Aim for 15 to 60 s unless asked.
Captions are essential (most watch muted): add_captions with short phrases of 2 to 5 words, large and centred above the lower third; keep text out of the top 250 px and bottom 400 px (app buttons).
End with a clear call to action title for 2 to 3 s, or loop back to the start.
Transitions: cuts, quick pushes or zooms; one style throughout.`,
  },
  {
    id: 'generated-media',
    title: 'Generating sound, music, images and video',
    when: 'creating new sound effects, music, voices, images or footage with AI',
    tools: ['import_media', 'import_url', 'add_media_to_timeline', 'generate_video', 'generate_voiceover', 'create_motion_graphic'],
    text: `Prefer what runs locally and is free: generate_voiceover for speech, create_motion_graphic for graphics and animated text. Use paid generators only when the user asks for generated media or agrees.
Connected tool servers (listed in the system prompt) can make sound effects, music, images and video. Write precise prompts: subject, style, mood, tempo or BPM, instruments, length in seconds, and "no vocals" for background music. Ask for the exact duration you need.
Bring results in: a file path from the tool goes to import_media; an https link goes to import_url. Then place it with add_media_to_timeline: music and effects on audio lanes (-1 and down), images and video on lane 1 or up, or the storyline.
Tell the user what was generated, with which service, and that it may cost credits on their account.`,
  },
];

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));
export const skillIndex = () => SKILLS.map((s) => `${s.id} (${s.when})`).join('; ');
