import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ProcessorEffects } from '../src/renderer/editor/ProcessorEffects.jsx';
import { VideoEffects } from '../src/renderer/editor/VideoEffects.jsx';
import { ExtensionsPane, AIChat } from '../src/renderer/Extensions.jsx';
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
  assert(document.querySelector('.ai-proposal'), 'structured AI response must render a reviewable proposal');
  const apply = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Apply 1 change'));
  assert(apply, 'proposal must have an Apply button');
  apply.click();
  await tick();
  assert(project.value.clips.subject.props.opacity === 0.5, 'apply must change the actual project');
  undo();
  assert(project.value.clips.subject.props.opacity === 1, 'one undo must restore prior state');
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
