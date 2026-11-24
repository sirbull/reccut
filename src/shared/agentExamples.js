// Examples for the AI Agent chat (/help and "What can I ask"). Each example lists the tools it needs, and
// test/agent-skills.test.mjs checks they exist, so every example the user is shown can actually be done.
// `needs` names a kind of connected tool server (Settings › AI › Tool servers) the example requires.
export const EXAMPLES = [
  ['Edit', [
    { text: 'Make a 2 minute tutorial from my talking head and the screen recordings. Remove mistakes and pauses.', tools: ['transcribe_speech', 'inspect_media', 'build_sequence'] },
    { text: 'Cut this interview into a 60 second story for Instagram, vertical.', tools: ['transcribe_speech', 'set_project_settings', 'build_sequence'] },
    { text: 'Edit the takes following the attached script. Use the best take of each line.', tools: ['transcribe_speech', 'match_script', 'build_sequence'] },
    { text: 'Remove every pause longer than half a second.', tools: ['transcribe_speech', 'split_clips', 'delete_clips'] },
  ]],
  ['Transitions and effects', [
    { text: 'Add short cross dissolves between all the clips in the storyline.', tools: ['get_timeline', 'add_transition'] },
    { text: 'Fade the video in from black at the start and out to black at the end.', tools: ['get_timeline', 'add_transition'] },
    { text: 'Give the intro a retro VHS look with a short glitch on the first cut.', tools: ['add_video_effect', 'set_video_effect', 'split_clips'] },
    { text: 'Remove the green screen behind me.', tools: ['add_video_effect', 'set_video_effect', 'preview_frames'] },
    { text: 'Blur the email address in the screen recording.', tools: ['load_skill', 'run_command', 'set_clip_properties', 'trim_clip'] },
  ]],
  ['Colour', [
    { text: 'Adjust colour and exposure on every clip so they look good and match.', tools: ['analyze_look', 'set_clip_properties'] },
    { text: 'Give the whole video a warm, cinematic teal and orange look.', tools: ['load_skill', 'analyze_look', 'set_clip_properties'] },
    { text: 'Make the clips look like this image.', tools: ['analyze_look', 'set_clip_properties'] },
    { text: 'Make the flashback scene black and white with film grain.', tools: ['set_clip_properties', 'add_video_effect'] },
  ]],
  ['Sound', [
    { text: 'Put the music on its own lane at −15 dB, duck it under my voice and fade it out at the end.', tools: ['move_clip', 'set_clip_properties', 'run_command'] },
    { text: 'Remove the background noise from my microphone.', tools: ['set_clip_properties'] },
    { text: 'Read this script as a voice-over: “Welcome to the course. In this lesson…”', tools: ['list_voices', 'generate_voiceover'] },
    { text: 'Cut the montage to the beat of the music.', tools: ['set_music_lane', 'get_beats', 'split_clips', 'trim_clip'] },
    { text: 'Add a whoosh sound on every push transition.', tools: ['import_media', 'add_media_to_timeline'], needs: 'sound' },
    { text: 'Make 30 seconds of calm background music without vocals for the intro.', tools: ['import_media', 'add_media_to_timeline'], needs: 'music' },
  ]],
  ['Text and graphics', [
    { text: 'Subtitle this video in Finnish.', tools: ['transcribe_speech', 'add_captions'] },
    { text: 'Add a lower third with my name, Ada Hansen, product designer, when I first appear.', tools: ['add_title', 'preview_frames'] },
    { text: 'Make a 5 second intro with the title "Getting started" in a modern style.', tools: ['create_motion_graphic'] },
    { text: 'Make an animated bar chart: Q1 120, Q2 180, Q3 240, and place it at 0:45.', tools: ['create_motion_graphic'] },
  ]],
  ['Help', [
    { text: 'Which local AI models do you recommend for this computer?', tools: ['get_model_recommendations'] },
    { text: 'Where do I change the frame rate?', tools: ['find_commands', 'search_help'] },
    { text: 'How do I stabilize a shaky clip?', tools: ['find_commands', 'search_help'] },
    { text: 'What can you do?', tools: [] },
  ]],
];

// Chat commands typed with a slash. They run in Reccut and are never sent to the model.
export const CHAT_COMMANDS = [
  { id: 'help', label: '/help', desc: 'Show examples of what you can ask' },
  { id: 'new', label: '/new', desc: 'Start a new chat' },
  { id: 'undo', label: '/undo', desc: 'Undo all changes from the last request' },
  { id: 'tools', label: '/tools', desc: 'Show connected tool servers and skills' },
  { id: 'settings', label: '/settings', desc: 'Open the AI settings' },
];
