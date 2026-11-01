import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Button, Modal, Row, Section, Select, Toggle, toast } from './ui.jsx';
import { canUndo, commit, project, undo } from './editor/store.js';
import { addStoryDocument } from '../shared/aiEdits.js';
import { helpOpen } from './registry.js';
import * as commands from './editor/commands.js';
import { PluginReview } from './Plugins.jsx';
import { runAgent } from './agent.js';
import { fileUrl } from './player.js';
export const aiChatOpen = signal(false);
export const aiDraft = signal(''); // Text to start the next chat message with, e.g. from the Plugins menu.
const api = window.api;
// Ready-made connections. All but Anthropic use the OpenAI-compatible Chat Completions API with tool calls.
const PRESETS = [
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1', provider: 'anthropic' },
  { id: 'gemini', label: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'mistral', label: 'Mistral', endpoint: 'https://api.mistral.ai/v1' },
  { id: 'openrouter', label: 'OpenRouter (many providers)', endpoint: 'https://openrouter.ai/api/v1' },
  { id: 'groq', label: 'Groq', endpoint: 'https://api.groq.com/openai/v1' },
  { id: 'xai', label: 'xAI Grok', endpoint: 'https://api.x.ai/v1' },
  { id: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { id: 'ollama', label: 'Ollama (local)', endpoint: 'http://localhost:11434/v1', local: true },
  { id: 'lmstudio', label: 'LM Studio (local)', endpoint: 'http://localhost:1234/v1', local: true },
  { id: 'llamacpp', label: 'llama.cpp server (local)', endpoint: 'http://localhost:8080/v1', local: true },
  { id: 'custom', label: 'Other server or gateway' },
];
const presetOf = (c) =>
  PRESETS.find((p) => p.endpoint === c.endpoint && (p.provider || 'compatible') === c.provider) || PRESETS.at(-1);

export function ExtensionsPane() {
  const [config, setConfig] = useState(null),
    [apiKey, setKey] = useState(''),
    [models, setModels] = useState([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .aiConfig()
      .then(setConfig)
      .catch((e) => toast(e.message, { kind: 'error' }));
  }, []);
  const save = async (clearKey = false) => {
    setBusy(true);
    try {
      setConfig(await api.aiSave({ ...config, apiKey, clearKey }));
      setKey('');
      toast(clearKey ? 'API key removed.' : 'AI settings saved.', { kind: 'success' });
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Section title="AI assistant" collapsible={false}>
        <p class="hint">
          Use a cloud provider with your own API key, or a local model server. The agent sends your messages and what it
          reads from the project, such as clip names, timings and caption text, and rendered preview frames when the
          model can see images. Media files and audio are not uploaded. Cloud providers bill you for usage.
        </p>
        {config && (
          <>
            <Row label="Provider" stacked>
              <Select
                value={presetOf(config).id}
                options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
                onChange={(id) => {
                  const p = PRESETS.find((x) => x.id === id);
                  setConfig({
                    ...config,
                    provider: p.provider || 'compatible',
                    endpoint: p.endpoint || (presetOf(config).id === 'custom' ? config.endpoint : 'http://localhost:8000/v1'),
                    hasKey: false,
                    model: '',
                  });
                  setModels([]);
                  setKey('');
                }}
              />
            </Row>
            {presetOf(config).id === 'custom' && (
              <>
                <Row label="API format" stacked>
                  <Select
                    value={config.provider}
                    options={[
                      { value: 'compatible', label: 'OpenAI-compatible (vLLM, Jan, LocalAI, LiteLLM, Azure, gateways)' },
                      { value: 'anthropic', label: 'Anthropic Messages' },
                    ]}
                    onChange={(provider) => setConfig({ ...config, provider, hasKey: false })}
                  />
                </Row>
                <Row label="API base URL" stacked>
                  <input
                    class="text-input"
                    value={config.endpoint}
                    placeholder="https://api.example.com/v1"
                    onInput={(e) => setConfig({ ...config, endpoint: e.currentTarget.value })}
                  />
                </Row>
              </>
            )}
            {presetOf(config).local && (
              <p class="hint">
                Start the server first and load a model that supports tool calling. Reccut sends requests to this server;
                choose a downloaded local model for offline use. To use another computer, choose Other server and enter its local network address.
              </p>
            )}
            <Row label="API key" stacked>
              <input
                type="password"
                class="text-input"
                autoComplete="off"
                value={apiKey}
                placeholder={
                  config.hasKey
                    ? 'Key saved · leave blank to keep it'
                    : 'Paste your API key (not needed for local servers)'
                }
                onInput={(e) => setKey(e.currentTarget.value)}
              />
            </Row>
            <Row label="Model ID" stacked>
              <div class="extension-actions">
                <input
                  class="text-input"
                  style="flex:1"
                  list="ai-models"
                  value={config.model}
                  placeholder="Exact model ID from your provider"
                  onInput={(e) => setConfig({ ...config, model: e.currentTarget.value })}
                />
                <datalist id="ai-models">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <Button
                  disabled={busy || (!presetOf(config).local && !apiKey.trim() && !config.hasKey && !/^http:/.test(config.endpoint))}
                  title="Lists the models your key or local server gives access to"
                  onClick={async () => {
                    try {
                      const list = await api.aiModels({ provider: config.provider, endpoint: config.endpoint, apiKey });
                      setModels(list);
                      toast(list.length ? `Found ${list.length} models. Pick one in the Model ID field.` : 'The server listed no models.');
                    } catch (e) {
                      toast(e.message, { kind: 'error' });
                    }
                  }}
                >
                  Fetch models
                </Button>
              </div>
            </Row>
            <Row label="Model can see images" hint="Lets the agent look at rendered frames. Turn off for text-only models.">
              <Toggle checked={config.vision} onChange={(vision) => setConfig({ ...config, vision })} />
            </Row>
            <p class="hint">
              {config.encryptedStorage
                ? 'Keys are encrypted using the operating system’s credential storage.'
                : 'Secure storage is unavailable. Keys are kept in memory for this session only.'}{' '}
              Changing provider or URL removes the previous key.
            </p>
            <div class="extension-actions">
              <Button variant="primary" disabled={busy} onClick={() => save()}>
                Save AI settings
              </Button>
              <Button disabled={busy || !config.hasKey} onClick={() => save(true)}>
                Remove key
              </Button>
              <Button onClick={() => (aiChatOpen.value = true)}>Open chat</Button>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
const TOOL_LABELS = {
  get_timeline: 'Read the timeline',
  list_media: 'Read the media library',
  preview_frames: 'Looked at the result',
  search_help: 'Read the manual',
  get_story: 'Read the story',
  inspect_media: 'Looked through the footage',
  transcribe_speech: 'Transcribed the speech',
};
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const DOC_EXT = ['pdf', 'typeloom', 'docx', 'fdx', 'fountain', 'txt', 'md', 'rtf', 'srt', 'vtt', 'csv'];
// Attached images are scaled down and sent as JPEG, within what every provider accepts.
async function imageUrl(blob) {
  const bmp = await createImageBitmap(blob),
    k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}

// The best model a provider offers for the agent, so the setup needs no model names.
export function pickModel(ids, kind) {
  const by = (re, not = /mini|nano|lite|audio|realtime|image|tts|vision|embed|search|transcribe|instruct|guard|preview-tts/i) =>
    ids.filter((id) => re.test(id) && !not.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (kind === 'anthropic') return by(/sonnet/i) || by(/opus/i) || ids[0];
  if (kind === 'openai') return by(/^gpt-\d+(\.\d+)?$/i) || by(/^gpt-/i) || ids[0];
  if (kind === 'gemini') return by(/flash/i) || by(/gemini/i) || ids[0];
  return by(/qwen|llama|mistral|gemma|gpt-oss|deepseek/i, /embed|vision|coder-?\d*b?-base/i) || ids[0];
}
const LOCAL = [
  { name: 'Ollama', endpoint: 'http://localhost:11434/v1' },
  { name: 'LM Studio', endpoint: 'http://localhost:1234/v1' },
  { name: 'llama.cpp', endpoint: 'http://localhost:8080/v1' },
];
const CLOUD = {
  gemini: { label: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', provider: 'compatible', keys: 'https://aistudio.google.com/apikey' },
  anthropic: { label: 'Claude', endpoint: 'https://api.anthropic.com/v1', provider: 'anthropic', keys: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', provider: 'compatible', keys: 'https://platform.openai.com/api-keys' },
};

// First-run setup: three plain choices instead of endpoints and model IDs.
function AgentSetup({ onDone }) {
  const [choice, setChoice] = useState(null),
    [key, setKey] = useState(''),
    [local, setLocal] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const finish = async (config, apiKey = '') => {
    setBusy(true);
    setError('');
    try {
      const saved = await api.aiSave({ ...config, apiKey });
      await api.aiComplete({ system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'Test' }], tools: [] });
      toast('The AI agent is ready.', { kind: 'success' });
      onDone(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const findLocal = async () => {
    setBusy(true);
    setError('');
    const found = [];
    for (const s of LOCAL) {
      const models = await api.aiModels({ provider: 'compatible', endpoint: s.endpoint }).catch(() => null);
      if (models?.length) found.push({ ...s, models, model: pickModel(models, 'local') });
    }
    setLocal(found);
    setBusy(false);
  };
  const connectCloud = async (kind) => {
    const c = CLOUD[kind];
    setBusy(true);
    setError('');
    try {
      const models = await api.aiModels({ provider: c.provider, endpoint: c.endpoint, apiKey: key.trim() });
      const model = pickModel(models, kind);
      if (!model) throw new Error('No models were found for this key.');
      await finish({ provider: c.provider, endpoint: c.endpoint, model, vision: true }, key.trim());
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const link = (url, text) => (
    <button class="link" onClick={() => api.openExternal(url)}>
      {text}
    </button>
  );
  return (
    <div class="agent-setup">
      <h3>Set up the AI agent</h3>
      <p class="hint">Choose how the agent thinks. You can change this later in Settings → AI.</p>
      <div class="setup-choices">
        {[
          ['local', 'On this computer', 'Free and private. Needs Ollama or LM Studio and a fairly powerful computer. Best for simpler tasks.'],
          ['gemini', 'Google Gemini', 'Free to start with a Google account. Good quality, can see images. On the free tier Google may use your data to improve its products.'],
          ['anthropic', 'Claude', 'Best for long, complex edits. Pay as you go with an Anthropic account.'],
          ['openai', 'OpenAI', 'Strong all-round models. Pay as you go with an OpenAI account.'],
        ].map(([id, title, text]) => (
          <button
            key={id}
            class={`setup-choice${choice === id ? ' on' : ''}`}
            onClick={() => {
              setChoice(id);
              setError('');
              setKey('');
              if (id === 'local') findLocal();
            }}
          >
            <b>{title}</b>
            <small>{text}</small>
          </button>
        ))}
      </div>
      {choice === 'local' && (
        <div class="setup-step">
          {busy && <p class="hint">Looking for a model server on this computer…</p>}
          {local?.length > 0 &&
            local.map((s) => (
              <div class="extension-actions" key={s.endpoint}>
                <span>
                  Found {s.name} with {s.models.length} model{s.models.length === 1 ? '' : 's'}.
                </span>
                <Select value={s.model} options={s.models.map((m) => ({ value: m, label: m }))} onChange={(model) => setLocal(local.map((x) => (x === s ? { ...x, model } : x)))} />
                <Button variant="primary" disabled={busy} onClick={() => finish({ provider: 'compatible', endpoint: s.endpoint, model: s.model, vision: /vl|vision|llava|gemma3|qwen2\.5-vl|mistral-small/i.test(s.model) })}>
                  Use {s.name}
                </Button>
              </div>
            ))}
          {local && !local.length && !busy && (
            <ol class="hint">
              <li>Install {link('https://ollama.com/download', 'Ollama')} (or {link('https://lmstudio.ai', 'LM Studio')}) and open it.</li>
              <li>
                In Terminal, download a model that can use tools, for example <code>ollama pull qwen3</code>. Larger models
                edit better; 14B or more is recommended.
              </li>
              <li>
                <button class="link" onClick={findLocal}>
                  Look again
                </button>
              </li>
            </ol>
          )}
        </div>
      )}
      {CLOUD[choice] && (
        <div class="setup-step">
          <ol class="hint">
            <li>
              {link(CLOUD[choice].keys, `Open ${CLOUD[choice].label} and create an API key`)}
              {choice !== 'gemini' && '. Add a payment method or credits in the account.'}
            </li>
            <li>Paste the key here. It is stored encrypted on this computer and only sent to {CLOUD[choice].label}.</li>
          </ol>
          <div class="extension-actions">
            <input type="password" class="text-input" style="flex:1" autoComplete="off" placeholder="Paste your API key" value={key} onInput={(e) => setKey(e.currentTarget.value)} />
            <Button variant="primary" disabled={busy || !key.trim()} onClick={() => connectCloud(choice)}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      <p class="hint">
        Other providers, a server on your network or a specific model:{' '}
        <button
          class="link"
          onClick={() => {
            localStorage.setItem('settingsPane', 'extensions');
            commands.prefsOpen.value = true;
          }}
        >
          open Settings → AI
        </button>
        .
      </p>
    </div>
  );
}

const EXAMPLES = [
  ['Edit', ['Make a 2 minute tutorial from my talking head and the screen recordings. Remove mistakes and pauses.', 'Cut this interview into a 60 second story for Instagram, vertical.', 'Edit the takes following the attached script. Use the best take of each line.']],
  ['Text', ['Subtitle this video in Finnish.', 'Add a lower third with my name, Ada Hansen, product designer, when I first appear.', 'Make a lower third in our brand colours, dark blue and orange, with a clean animation.']],
  ['Look and sound', ['Adjust colour and exposure on every clip so they look good and match.', 'Make the clips look like this image.', 'Put the music on its own lane at −15 dB and fade it out at the end.']],
  ['Graphics', ['Make a 5 second intro with the title "Getting started" in a modern style.', 'Make an animated bar chart: Q1 120, Q2 180, Q3 240, and place it at 0:45.', 'Generate a 5 second drone shot over a Norwegian fjord at sunrise and use it as the opening.']],
  ['Plugins', ['Make a plugin that reduces video noise, with a strength slider.', 'Make a plugin that sharpens soft footage.']],
  ['Help', ['Where do I change the frame rate?', 'How do I stabilize a shaky clip?', 'What can you do?']],
];
function AgentHelp({ onExample }) {
  return (
    <div class="agent-help">
      <p>
        <b>Describe the result, not the steps.</b> Say what the video is for, how long it should be, who watches it and the
        tone. The agent reads the project, uses the same tools you use, looks at the result and tells you what it did.
        Every change can be undone, and <b>Undo this request</b> reverts the whole request.
      </p>
      <ul>
        <li>Select clips or move the playhead first to point at something: “the selected clip”, “the clip under the playhead”.</li>
        <li>For a story, attach the script (PDF, Typeloom, Word, Final Draft, Fountain or text), a storyboard or a short brief. Without one, the agent asks before it cuts.</li>
        <li>Attach a reference image to match a look, or a logo to use in graphics.</li>
        <li>Long footage: the agent reads transcripts and scene changes first and only looks at frames where needed. The first transcription takes a while.</li>
        <li>AI video from Higgsfield costs money and asks before each generation. Set it up in Settings → Plugins.</li>
      </ul>
      {EXAMPLES.map(([title, list]) => (
        <div key={title}>
          <b>{title}</b>
          <div class="agent-examples">
            {list.map((t) => (
              <button key={t} onClick={() => onExample(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p class="hint">
        What is sent: your messages and attachments, and what the agent reads from the project (names, timings, transcripts,
        measurements and, if the model can see images, frames). Media files are not uploaded.{' '}
        <button class="link" onClick={() => (helpOpen.value = { article: 'ai-plugins' })}>
          Read the guide
        </button>
      </p>
    </div>
  );
}

// A plugin the agent wrote. Nothing runs until the user has read it, accepted responsibility and installed it.
function ProcessorProposal({ draft }) {
  const [state, setState] = useState('');
  return state ? <p class="hint">{state}</p> : <PluginReview review={draft} compact onDone={(done) => setState(done ? 'Installed. It is open as a tool window and listed under Plugins.' : 'Not installed.')} />;
}

export function AIChat() {
  const [config, setConfig] = useState(undefined),
    [help, setHelp] = useState(false),
    [messages, setMessages] = useState([]),
    [input, setInput] = useState(() => {
      const draft = aiDraft.value;
      aiDraft.value = '';
      return draft;
    }),
    [images, setImages] = useState([]),
    [docs, setDocs] = useState([]),
    [busy, setBusy] = useState(null),
    [run, setRun] = useState(null),
    [error, setError] = useState('');
  // Read the setup again when Settings closes, so a model chosen there opens the chat right away.
  const settingsOpen = commands.prefsOpen.value;
  useEffect(() => {
    if (!settingsOpen) api.aiConfig().then(setConfig, () => setConfig(null));
  }, [settingsOpen]);
  // Follow the agent's progress as steps arrive.
  const list = useRef(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);
  const send = async () => {
    if (!input.trim() || busy) return;
    if (docs.length) commit((p) => docs.forEach((d) => addStoryDocument(p, d.name, d.text)));
    const note = docs.map((d) => `[Attached ${d.name}: saved to the project story as a document (${d.text.length} characters). Read it with get_story.]`).join('\n');
    const history = [...messages, { role: 'user', content: `${note ? `${note}\n` : ''}${input.trim()}`, ...(images.length ? { images } : {}) }],
      controller = new AbortController(),
      before = project.value;
    setMessages(history);
    setInput('');
    setImages([]);
    setDocs([]);
    setBusy(controller);
    setError('');
    setRun(null);
    try {
      setMessages(await runAgent(history, { signal: controller.signal, onUpdate: setMessages }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      if (project.value !== before) setRun({ before, after: project.value });
    }
  };
  const attachFiles = async (files) => {
    for (const { file, path } of files) {
      const ext = String(path || file?.name || '').split('.').pop().toLowerCase();
      try {
        if (IMAGE_EXT.includes(ext) || file?.type?.startsWith('image/')) {
          const blob = file || (await (await fetch(fileUrl(path))).blob());
          const url = await imageUrl(blob.type ? blob : new Blob([blob], { type: 'image/*' }));
          setImages((list) => [...list, url].slice(0, 4));
        } else if (path) {
          const doc = await api.aiReadDocument(path);
          if (!doc.text) throw new Error(`${doc.name} has no text.`);
          setDocs((list) => [...list.filter((d) => d.name !== doc.name), doc]);
        } else throw new Error('Drop the file from Finder or Explorer, or use Attach.');
      } catch (e) {
        toast(e.message || 'Could not read that file.', { kind: 'error' });
      }
    }
  };
  const pick = async () => {
    const file = await api.openFileDialog({
      title: 'Attach to Message',
      filters: [{ name: 'Images, scripts and documents', extensions: [...IMAGE_EXT, ...DOC_EXT] }],
    });
    if (file) attachFiles([{ path: file }]);
  };
  // Undo the agent's steps one by one, so redo still works. Only while nothing else has changed.
  const revert = () => {
    for (let i = 0; i < 500 && project.value !== run.before && canUndo(); i++) undo();
    setRun(null);
    toast('Reverted the changes from that request.');
  };
  const ready = config?.model;
  return (
    <Modal
      title={
        <span class="ai-title">
          AI editing agent
          {ready && (
            <button
              class="model-chip"
              title={`${presetOf(config).label}: ${config.model}. Click to change the model in Settings → AI.`}
              onClick={() => {
                localStorage.setItem('settingsPane', 'extensions');
                commands.prefsOpen.value = true;
              }}
            >
              <span class={`model-dot${presetOf(config).local || /^http:/.test(config.endpoint) ? ' local' : ''}`} />
              {presetOf(config).id === 'custom' ? new URL(config.endpoint).hostname : presetOf(config).label.replace(' (local)', '')}
              <span class="model-id">{config.model}</span>
            </button>
          )}
        </span>
      }
      width={780}
      onClose={() => (busy ? busy.abort() : (aiChatOpen.value = false))}
      footer={
        <>
          {ready && (
            <Button class="agent-help-button" onClick={() => setHelp(!help)} aria-expanded={help} title="What can I ask?">
              ? What can I ask
            </Button>
          )}
          {run && project.value === run.after && <Button onClick={revert}>Undo this request</Button>}
          <Button onClick={() => (aiChatOpen.value = false)}>Close</Button>
        </>
      }
    >
      {config === undefined ? null : !ready ? (
        <AgentSetup onDone={setConfig} />
      ) : (
        <>
          {help && <AgentHelp onExample={(t) => (setInput(t), setHelp(false))} />}
          <div class="ai-messages" aria-live="polite" ref={list}>
            {messages.length ? (
              messages.map((m, i) =>
                m.role === 'tool' ? (
                  <div class={`ai-step${m.error ? ' failed' : ''}`} key={i}>
                    {m.error ? '✕' : '✓'} {TOOL_LABELS[m.name] || m.name.replaceAll('_', ' ')}
                    {m.error && <small>{m.content}</small>}
                    {m.image && <img src={m.image} alt="Picture the agent looked at" />}
                    {m.proposal && <ProcessorProposal draft={m.proposal} />}
                  </div>
                ) : m.content.trim() ? (
                  <div class={`ai-message ${m.role}`} key={i}>
                    <b>{m.role === 'user' ? 'You' : 'Agent'}</b>
                    <p>{m.content}</p>
                    {m.images?.map((src, j) => (
                      <img class="ai-attachment" key={j} src={src} alt="Attached image" />
                    ))}
                  </div>
                ) : null,
              )
            ) : (
              <p class="hint">
                Describe what you want, for example “Make a 2 minute tutorial from my recordings and remove the mistakes”,
                “Subtitle this video in Finnish” or “Make an intro with our logo”. Attach a script or reference image if
                you have one. Choose <b>? What can I ask</b> for more.
              </p>
            )}
            {busy && <p class="hint">Working… Long footage can take a few minutes. Progress is in Background tasks.</p>}
          </div>
          {error && (
            <p class="warn" role="alert">
              {error}
            </p>
          )}
          {(images.length > 0 || docs.length > 0) && (
            <div class="ai-attachments">
              {images.map((src, i) => (
                <button key={i} title="Remove image" onClick={() => setImages(images.filter((_, j) => j !== i))}>
                  <img src={src} alt={`Attachment ${i + 1}`} />
                </button>
              ))}
              {docs.map((d) => (
                <button key={d.name} class="ai-doc" title="Remove document" onClick={() => setDocs(docs.filter((x) => x !== d))}>
                  📄 {d.name}
                </button>
              ))}
            </div>
          )}
          <div
            class="ai-compose"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              attachFiles([...e.dataTransfer.files].map((file) => ({ file: file.type.startsWith('image/') ? file : null, path: api.pathForFile(file) })));
            }}
          >
            <Button onClick={pick} title="Attach a script, storyboard, document or reference image. You can also paste or drop files here.">
              Attach…
            </Button>
            <textarea
              onPaste={(e) => e.clipboardData.files.length && attachFiles([...e.clipboardData.files].map((file) => ({ file })))}
              class="text-input"
              rows={3}
              value={input}
              maxLength={20000}
              placeholder="Describe what you want… (Cmd/Ctrl Enter sends)"
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <Button onClick={() => busy.abort()}>Stop</Button>
            ) : (
              <Button disabled={!input.trim()} variant="primary" onClick={send}>
                Send
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
