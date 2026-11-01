import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ProcessorEffects } from '../src/renderer/editor/ProcessorEffects.jsx';
import { VideoEffects } from '../src/renderer/editor/VideoEffects.jsx';
import { ExtensionsPane, AIChat } from '../src/renderer/Extensions.jsx';
import { runAgent } from '../src/renderer/agent.js';
import { PluginWindows, PluginsButton, PluginsPane, exportingPlugin, openPlugin, openPluginFile, openPlugins, plugins, settingsFocus } from '../src/renderer/Plugins.jsx';
import { prefs, setPrefs } from '../src/renderer/prefs.js';
import * as editorCommands from '../src/renderer/editor/commands.js';
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
  await tick();
  const input = document.querySelector('.ai-compose textarea');
  input.value = 'Fade the selected clip';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click();
  for (let i = 0; i < 8; i++) await tick();
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

// First run: plain choices, the best model is picked from the provider's list, and the connection is tested.
export async function verifySetup() {
  let saved;
  window.api.aiConfig = async () => (saved ? { ...saved, hasKey: true } : { provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: '', hasKey: false, encryptedStorage: true });
  window.api.aiModels = async () => ['claude-3-haiku-20240307', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-opus-4-1'];
  window.api.aiSave = async (c) => ((saved = c), { ...c, hasKey: true });
  window.api.aiComplete = async () => ({ text: 'OK', toolCalls: [] });
  render(<AIChat key="setup" />, document.getElementById('root'));
  await tick();
  assert(document.querySelector('.agent-setup'), 'without a model the setup assistant is shown');
  [...document.querySelectorAll('.setup-choice')].find((b) => b.textContent.startsWith('Claude')).click();
  await tick();
  const key = document.querySelector('.agent-setup input[type=password]');
  key.value = 'sk-test';
  key.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Connect').click();
  for (let i = 0; i < 5; i++) await tick();
  assert(saved?.model === 'claude-sonnet-4-5' && saved.provider === 'anthropic' && saved.apiKey === 'sk-test', JSON.stringify(saved));
  assert(document.querySelector('.ai-compose'), 'after setup the chat opens');
  const chip = document.querySelector('.model-chip');
  assert(chip?.textContent.includes('Anthropic Claude') && chip.textContent.includes('claude-sonnet-4-5'), `the chat shows the provider and model: ${chip?.textContent}`);
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('What can I ask')).click();
  await tick();
  document.querySelector('.agent-examples button').click();
  await tick();
  assert(document.querySelector('.ai-compose textarea').value.length > 10, 'an example fills in the message');
  chip.click();
  await tick();
  assert(editorCommands.prefsOpen.value && localStorage.getItem('settingsPane') === 'extensions', 'clicking the model opens Settings → AI');
  editorCommands.prefsOpen.value = false;
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('What can I ask')).click();
  await tick();
  return { status: 'passed', checks: 6 };
}

// Motion graphics are imported and placed; a drafted processor is shown for review and only installed on request.
export async function verifyCreative() {
  const steps = [],
    installed = [];
  const png = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    return c.toDataURL('image/png');
  })();
  window.api.gfxRender = async (r) => ((steps.render = r), { file: '/gen/Intro.mp4', previews: [0, 1, 2, 3].map((t) => ({ t, url: png })) });
  window.api.importMedia = async () => ({ items: [{ id: 'g1', name: 'Intro.mp4', kind: 'video', duration: 3, path: '/gen/Intro.mp4', streams: { main: { hasVideo: true, hasAudio: false } } }], failed: [] });
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16" stroke="#fff" stroke-width="2"/></svg>';
  window.api.pluginsDraft = async (a) => ({ manifest: { format: 'reccut-processor-v1', id: 'ai-denoise-1', name: a.name, executable: '/ffmpeg', args: a.args, outputExtension: '.mp4', icon: a.icon, params: a.params }, script: '', description: 'Removes noise.' });
  window.api.pluginsInstall = async (m, opts) => (opts?.accepted === true && installed.push({ ...m, kind: 'ffmpeg', version: 1 }), installed);
  window.api.pluginsList = async () => installed;
  const script = [
    { id: 'g', name: 'create_motion_graphic', args: { name: 'Intro', code: 'function draw(ctx,t){}', duration: 3, at: 0 } },
    { id: 'p', name: 'propose_processor', args: { name: 'Denoise', description: 'Removes noise.', icon, kind: 'ffmpeg', args: ['-i', '{input}', '-vf', 'hqdn3d={param:strength}', '{output}'], params: [{ id: 'strength', label: 'Strength', type: 'number', min: 0, max: 10, default: 4 }], outputExtension: '.mp4' } },
  ];
  let n = 0;
  window.api.aiConfig = async () => ({ provider: 'compatible', endpoint: 'https://api.openai.com/v1', model: 'user-model', hasKey: true, vision: true });
  window.api.aiComplete = async () => (script[n] ? { text: '', toolCalls: [script[n++]] } : { text: 'Done.', toolCalls: [] });
  render(<AIChat key="creative" />, document.getElementById('root'));
  for (let i = 0; i < 3; i++) await tick();
  const input = document.querySelector('.ai-compose textarea');
  input.value = 'Make an intro and remove noise';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send').click();
  for (let i = 0; i < 12; i++) await tick();
  assert(steps.render?.width === project.value.width && steps.render.duration === 3, 'the graphic is rendered at the project size');
  assert(Object.values(project.value.clips).some((c) => c.mediaId === 'g1' && c.start === 0), 'the graphic is imported and placed');
  assert(document.querySelector('.processor-review') && !installed.length, 'a drafted processor is shown, not installed');
  const installButton = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Install plugin');
  assert(installButton.disabled, 'installing is blocked until the user accepts responsibility');
  const accept = document.querySelector('.processor-review .terms-accept input');
  accept.click();
  await tick();
  installButton.click();
  await tick();
  await tick();
  assert(installed[0]?.id === 'ai-denoise-1', 'Install installs exactly the reviewed manifest');
  // The installed plugin opens as a tool window, is listed under Plugins and runs on the selected clip with its settings.
  let processed;
  window.api.pluginsProcess = async (r) => ((processed = r), new Promise(() => {}));
  window.dispatchEvent(new Event('reccut:processors-changed'));
  await tick();
  const p = structuredClone(project.value);
  p.clips.subject.type = 'video';
  project.value = p;
  selection.value = ['subject'];
  render(
    <div style="padding:20px;position:relative">
      <PluginsButton />
      <PluginWindows />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  assert(openPlugins.value.includes('ai-denoise-1') && document.querySelector('.plugin-window img.plugin-icon'), 'installing opens the tool window with its icon');
  [...document.querySelectorAll('.plugin-window button')].find((b) => b.textContent === 'Apply to selected clip').click();
  await tick();
  assert(processed?.id === 'ai-denoise-1' && processed.params.strength === 4, `the window applies the plugin with its settings: ${JSON.stringify(processed)}`);
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Plugins').click();
  await tick();
  assert([...document.querySelectorAll('.plugin-item')].some((b) => b.textContent.includes('Denoise')), 'the Plugins button lists the plugin');
  // A plugin file opened from Finder is reviewed and installed only after accepting the terms.
  let fromFile;
  window.api.pluginsReadFile = async () => ({ pkg: { id: 'grain' }, manifest: { id: 'grain', name: 'Film grain', version: 3, author: 'Ada', kind: 'python', args: ['{script}', '{input}', '{output}'], outputExtension: '.mov' }, script: 'print(1)', updates: 2 });
  window.api.pluginsInstallPackage = async (pkg, opts) => ((fromFile = { pkg, opts }), installed);
  await openPluginFile('/Downloads/Film grain.reccut-plugin');
  await tick();
  const dialog = [...document.querySelectorAll('.modal')].find((m) => m.textContent.includes('Film grain'));
  assert(dialog?.textContent.includes('by Ada') && dialog.textContent.includes('own risk'), 'the file is shown with its author and the responsibility terms');
  dialog.querySelector('.terms-accept input').click();
  await tick();
  [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Update plugin').click();
  await tick();
  assert(fromFile?.opts.accepted === true && fromFile.pkg.id === 'grain', 'the reviewed file is installed as an update');
  // Sharing asks for the creator terms first.
  let shared;
  window.api.pluginsExport = async (id, opts) => ((shared = { id, opts }), null);
  exportingPlugin.value = 'ai-denoise-1';
  await tick();
  const share = [...document.querySelectorAll('.modal')].find((m) => m.textContent.includes('Share Denoise'));
  const exportButton = [...share.querySelectorAll('button')].find((b) => b.textContent === 'Export…');
  assert(exportButton.disabled, 'sharing is blocked until the terms are accepted');
  share.querySelector('.terms-accept input').click();
  await tick();
  exportButton.click();
  await tick();
  assert(shared?.opts.accepted === true, 'export passes the accepted terms');
  exportingPlugin.value = null;
  return { status: 'passed', checks: 12 };
}

// Higgsfield comes with Reccut as a plugin: listed first in Settings → Plugins, set up once, then used from its window.
export async function verifyBuiltinPlugins() {
  let saved, generated;
  let cfg = { textModel: 'kling-video/v3.0/std/text-to-video', imageModel: 'kling-video/v3.0/std/image-to-video', confirm: false, hasKey: false };
  window.api.genConfig = async () => cfg;
  window.api.genSave = async (c) => ((saved = c), (cfg = { ...cfg, hasKey: true }));
  window.api.genVideo = async (r) => ((generated = r), { file: '/gen/shot.mp4', model: cfg.textModel });
  window.api.importMedia = async () => ({ items: [{ id: 'hf1', name: 'shot.mp4', kind: 'video', duration: 5, path: '/gen/shot.mp4', streams: { main: { hasVideo: true, hasAudio: false } } }], failed: [] });
  window.api.pluginsList = async () => [];
  render(
    <div style="width:700px">
      <PluginsPane />
      <PluginWindows />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  const first = document.querySelector('.processor-row');
  assert(first?.textContent.includes('Higgsfield AI Video') && first.textContent.includes('Built in'), 'Higgsfield is listed as a built-in plugin');
  assert(![...first.querySelectorAll('button')].some((b) => b.textContent === 'Remove'), 'a built-in plugin cannot be removed');
  openPlugin('higgsfield');
  await tick();
  await tick();
  const win = document.querySelector('.plugin-window');
  assert(win?.textContent.includes('Higgsfield Console'), 'without a key the window shows the setup');
  const [keyId, secret] = win.querySelectorAll('input');
  keyId.value = 'kid_1';
  keyId.dispatchEvent(new Event('input', { bubbles: true }));
  secret.value = 'sec_1';
  secret.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...win.querySelectorAll('button')].find((b) => b.textContent === 'Save').click();
  await tick();
  await tick();
  assert(saved?.keyId === 'kid_1' && saved.keySecret === 'sec_1', 'the key is saved from the window');
  const prompt = document.querySelector('.plugin-window textarea');
  assert(prompt, 'after setup the window lets you describe a shot');
  prompt.value = 'A drone shot over a fjord at sunrise';
  prompt.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  [...document.querySelectorAll('.plugin-window button')].find((b) => b.textContent === 'Generate video').click();
  for (let i = 0; i < 4; i++) await tick();
  assert(generated?.prompt === 'A drone shot over a fjord at sunrise' && generated.duration === 5, 'the window generates with the description');
  assert(Object.values(project.value.clips).some((c) => c.mediaId === 'hf1' && c.lane >= 1), 'the generated clip is imported and placed at the playhead');
  // The gear in the window opens Settings → Plugins at this plugin.
  document.querySelector('.plugin-window header button[title="Higgsfield AI Video settings"]').click();
  await tick();
  assert(editorCommands.prefsOpen.value && localStorage.getItem('settingsPane') === 'plugins' && settingsFocus.value === 'higgsfield', 'the gear opens the plugin settings');
  editorCommands.prefsOpen.value = false;
  // A plugin's saved settings are its defaults in the window; Reset goes back to the plugin's own defaults.
  let processed;
  window.api.pluginsProcess = async (r) => ((processed = r), new Promise(() => {}));
  const denoise = { id: 'd1', name: 'Denoise', kind: 'ffmpeg', version: 2, params: [{ id: 'strength', label: 'Strength', type: 'number', min: 0, max: 10, step: 1, default: 4 }] };
  plugins.value = [denoise];
  setPrefs({ pluginSettings: { d1: { strength: 7 } } });
  const p = structuredClone(project.value);
  p.clips.subject.type = 'video';
  project.value = p;
  selection.value = ['subject'];
  settingsFocus.value = 'd1';
  openPlugins.value = ['d1'];
  render(
    <div style="width:700px">
      <PluginsPane />
      <PluginWindows />
    </div>,
    document.getElementById('root'),
  );
  await tick();
  assert(document.querySelector('#plugin-d1 .plugin-settings'), 'the focused plugin shows its settings');
  [...document.querySelectorAll('.plugin-window button')].find((b) => b.textContent === 'Apply to selected clip').click();
  await tick();
  assert(processed?.params.strength === 7, `the window starts from the saved settings: ${JSON.stringify(processed?.params)}`);
  [...document.querySelectorAll('.plugin-settings .link')].find((b) => b.textContent.includes('Reset')).click();
  await tick();
  assert(prefs.value.pluginSettings.d1.strength === 4, 'Reset restores the plugin defaults');
  openPlugins.value = [];
  return { status: 'passed', checks: 11 };
}
