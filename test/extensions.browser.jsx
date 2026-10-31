import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ProcessorEffects } from '../src/renderer/editor/ProcessorEffects.jsx';
import { VideoEffects } from '../src/renderer/editor/VideoEffects.jsx';
import { ExtensionsPane, AIChat } from '../src/renderer/Extensions.jsx';
import { runAgent } from '../src/renderer/agent.js';
import { project, commit, undo, redo, selection } from '../src/renderer/editor/store.js';
import { readClipFrame, readClipFrames } from '../src/renderer/editor/sourceFrame.js';
import { newProject, makeClip } from '../src/shared/model.js';
import { makeVideoEffect } from '../src/shared/videoEffects.js';
const tick = () => new Promise((r) => setTimeout(r, 50));
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
function EffectsHarness() {
  const [p, setP] = useState(project.value);
  useEffect(() => {
    const timer = setInterval(() => setP(project.value), 20);
    return () => clearInterval(timer);
  }, []);
  return (
    <div class="inspector panel" style="width:320px;height:820px;overflow:auto">
      <VideoEffects clip={p.clips.subject} />
    </div>
  );
}
export async function verifyUI() {
  const p = newProject('Keying demo');
  const m = {
    id: 'm',
    kind: 'video',
    duration: 10,
    name: 'Subject.mp4',
    streams: { main: { hasVideo: true, hasAudio: true } },
  };
  p.media.m = m;
  const c = makeClip('video', { media: m, lane: 1 });
  c.id = 'subject';
  c.name = 'Subject';
  c.props.vfx = [makeVideoEffect('chroma'), makeVideoEffect('chroma')];
  c.props.vfx[1].p.color = '#0000ff';
  p.clips.subject = c;
  project.value = p;
  selection.value = ['subject'];
  render(<EffectsHarness />, document.getElementById('root'));
  await tick();
  assert(document.querySelectorAll('[data-vfx="chroma"]').length === 2, 'two independent keyer controls should render');
  const titles = (name) => [...document.querySelectorAll(`[title="${name}"]`)];
  titles('Move effect up')[1].click();
  await tick();
  assert(project.value.clips.subject.props.vfx[0].p.color === '#0000ff', 'move up should reorder the actual stack');
  titles('Duplicate effect')[0].click();
  await tick();
  assert(project.value.clips.subject.props.vfx.length === 3, 'duplicate should add a separate instance');
  titles('Remove effect')[0].click();
  await tick();
  assert(project.value.clips.subject.props.vfx.length === 2, 'remove should delete only one instance');
  undo();
  await tick();
  assert(project.value.clips.subject.props.vfx.length === 3, 'effect removal should be undoable');
  redo();
  await tick();
  const details = document.querySelector('details');
  details.open = true;
  await tick();
  assert(document.documentElement.scrollWidth <= window.innerWidth, 'keying inspector should fit the window');
  return { status: 'passed', checks: 6 };
}
export async function showSettings() {
  render(
    <div style="width:660px;margin:20px auto">
      <ExtensionsPane />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  assert(document.querySelector('input[type=password]'), 'key field must be masked');
  return { status: 'passed', checks: 1 };
}
export async function verifyChat() {
  render(<AIChat />, document.getElementById('root'));
  await tick();
  const input = document.querySelector('.ai-compose textarea');
  input.value = 'Fade the selected clip';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click();
  await tick();
  await tick();
  await tick();
  assert(project.value.clips.subject.props.opacity === 0.5, 'the agent must edit the actual project through its tools');
  assert(document.querySelector('.ai-step'), 'tool steps must be listed in the chat');
  const revert = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Undo this request');
  assert(revert, 'a finished request with edits must offer to undo it');
  revert.click();
  assert(project.value.clips.subject.props.opacity === 1, 'undoing the request must restore the prior state');
  return { status: 'passed', checks: 4 };
}

export async function verifySource() {
  const p = structuredClone(project.value);
  p.media.m.path = window.sourceFile;
  p.media.m.streams.main.path = window.sourceFile;
  p.media.m.streams.main.duration = 2;
  p.clips.subject.dur = 2;
  project.value = p;
  const frame = await readClipFrame(p.clips.subject);
  assert(
    frame.width === 64 && frame.height === 48,
    'source reader must decode the source at its native small resolution',
  );
  const frames = await readClipFrames(p.clips.subject, 'main', [0.1, 0.6, 1.1]);
  assert(frames.length === 3, 'background analysis must read all requested frames');
  assert(
    frames[0].data.some((v, i) => v !== frames[2].data[i]),
    'seeking must decode different source times',
  );
  return { status: 'passed', checks: 3 };
}

export async function verifyProcessor() {
  const original = project.value.media.m;
  let calls = 0;
  window.api.pluginsList = async () => [];
  window.api.pluginsProcess = async () => ({
    plugin: 'Mock keyer',
    media: {
      ...structuredClone(original),
      id: 'processed-' + ++calls,
      streams: { main: { ...structuredClone(original.streams.main), hasAudio: true } },
    },
  });
  render(<ProcessorEffects clip={project.value.clips.subject} />, document.getElementById('root'));
  await tick();
  document.querySelector('section > header').click();
  await tick();
  window.api.pluginsList = async () => [{ id: 'test', name: 'Mock keyer' }];
  window.dispatchEvent(new Event('reccut:processors-changed'));
  await tick();
  const select = document.querySelector('select');
  assert(select.options.length === 2, 'newly installed processors must appear without reselecting the clip');
  select.value = 'test';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  const run = () =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Process and apply to this clip').click();
  run();
  await tick();
  await tick();
  let m = project.value.media[project.value.clips.subject.mediaId];
  assert(
    m.id === 'processed-1' && m.streams.main.hasAudio === false && m.streams.sourceAudio.hasAudio,
    'first processing must keep original audio on its own source',
  );
  render(<ProcessorEffects clip={project.value.clips.subject} />, document.getElementById('root'));
  await tick();
  run();
  await tick();
  await tick();
  m = project.value.media[project.value.clips.subject.mediaId];
  assert(
    m.id === 'processed-2' && m.streams.main.hasAudio === false && m.streams.sourceAudio.hasAudio,
    'reprocessing must not enable duplicate generated audio',
  );
  assert(project.value.media.m === original, 'original media must remain unchanged');
  undo();
  assert(project.value.clips.subject.mediaId === 'processed-1', 'undo must restore the prior processed source');
  return { status: 'passed', checks: 4 };
}

// The agent measures real decoded source frames and an attached reference image.
export async function verifyLook() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const g = cv.getContext('2d');
  g.fillStyle = '#c87a3c';
  g.fillRect(0, 0, 8, 8);
  let result;
  window.api.aiComplete = async (r) => {
    const tool = r.messages.find((m) => m.role === 'tool');
    if (tool) {
      result = JSON.parse(tool.content);
      return { text: 'Measured.', toolCalls: [] };
    }
    return { text: '', toolCalls: [{ id: 'l1', name: 'analyze_look', args: { clipIds: ['subject'], reference: true } }] };
  };
  await runAgent([{ role: 'user', content: 'Match this', images: [cv.toDataURL('image/png')] }], { signal: new AbortController().signal, onUpdate() {} });
  const clip = result.clips[0];
  assert(!clip.error && clip.source.brightness > 0 && clip.source.brightness < 1, `source frames must be measured: ${JSON.stringify(clip)}`);
  assert(result.reference[0].warmth > 0.3, 'the attached warm reference must measure as warm');
  return { status: 'passed', checks: 2 };
}

// The agent finds a command like a person would, selects a clip and runs the command from the menu.
export async function verifyCommands() {
  const script = [
    { id: 'f1', name: 'find_commands', args: { query: 'enable' } },
    { id: 's1', name: 'select', args: { clipIds: ['subject'], playhead: 0.5 } },
    { id: 'r1', name: 'run_command', args: { id: 'toggleEnabled' } },
    { id: 'g1', name: 'change_settings', args: { app: { titleDur: 6 } } },
  ];
  const results = [];
  window.api.aiComplete = async (r) => {
    const last = r.messages.at(-1);
    if (last.role === 'tool') results.push(last);
    const next = script[results.length];
    return next ? { text: '', toolCalls: [next] } : { text: 'Done.', toolCalls: [] };
  };
  await runAgent([{ role: 'user', content: 'Turn off the clip' }], { signal: new AbortController().signal, onUpdate() {} });
  assert(JSON.parse(results[0].content).some((c) => c.id === 'toggleEnabled' && c.menu === 'Clip'), 'commands must be found with their menu');
  assert(!results.some((r) => r.error), JSON.stringify(results));
  assert(project.value.clips.subject.enabled === false, 'the menu command must act on the selected clip');
  assert(JSON.parse(localStorage.getItem('prefs')).titleDur === 6, 'settings must be saved');
  undo();
  return { status: 'passed', checks: 4 };
}

// Raw footage: the agent inspects a real video, transcribes it and builds a sequence with cuts moved into pauses.
export async function verifyFootage() {
  const done = [];
  window.api.mediaScenes = async () => [[0.9, 0.6], [1.6, 0.2]];
  window.api.startTranscribe = async () => 'job1';
  window.api.onTranscribeDone = (cb) => {
    setTimeout(() => cb({ id: 'job1', segments: [{ start: 0.1, end: 0.3, text: 'Hi' }], words: [{ start: 0.1, end: 0.3, text: 'Hi' }], pauses: [[0.3, 0.9], [1.4, 1.9]] }), 10);
    return () => {};
  };
  const script = [
    { id: 'i1', name: 'inspect_media', args: { mediaId: 'm', from: 0, to: 1.8, frames: 4 } },
    { id: 't1', name: 'transcribe_speech', args: { mediaId: 'm', language: 'english', words: true } },
    { id: 'b1', name: 'build_sequence', args: { replace: true, storyline: [{ mediaId: 'm', sourceIn: 0.5, sourceOut: 1.5 }] } },
  ];
  window.api.aiComplete = async (r) => {
    const last = r.messages.at(-1);
    if (last.role === 'tool') done.push(last);
    const next = script[done.length];
    return next ? { text: '', toolCalls: [next] } : { text: 'Built.', toolCalls: [] };
  };
  await runAgent([{ role: 'user', content: 'Edit my footage' }], { signal: new AbortController().signal, onUpdate() {} });
  assert(!done.some((d) => d.error), JSON.stringify(done.map((d) => d.content)));
  const info = JSON.parse(done[0].content);
  assert(info.frameTimes.length === 4 && info.look.brightness > 0, 'the contact sheet must decode real frames');
  assert(info.sceneChanges[0][0] === 0.9, 'scene changes must be listed with their time');
  assert(done[0].image?.startsWith('data:image/jpeg'), 'the contact sheet must be sent as one image');
  assert(/0\.10 Hi/.test(done[1].content) && /pause 0\.30-0\.90/.test(done[1].content), 'words and pauses must be listed');
  const clip = Object.values(project.value.clips)[0];
  assert(clip.in === 0.75 && clip.dur === 0.8, `cuts in pauses must keep a short breath: ${clip.in} ${clip.dur}`);
  undo();
  return { status: 'passed', checks: 6 };
}
