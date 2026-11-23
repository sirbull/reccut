import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Button, Modal, Row, Section, Select, Toggle, toast } from './ui.jsx';
import { canUndo, commit, project, undo } from './editor/store.js';
import { addStoryDocument } from '../shared/aiEdits.js';
import { helpOpen } from './registry.js';
import { aiChatOpen } from './aiChatOpen.js';
import * as commands from './editor/commands.js';
import { PluginReview } from './Plugins.jsx';
import { runAgent } from './agent.js';
import { CHAT_COMMANDS, EXAMPLES } from '../shared/agentExamples.js';
import { SKILLS } from '../shared/agentSkills.js';
import { fileUrl } from './player.js';
export { aiChatOpen };
export const aiDraft = signal(''); // Text to start the next chat message with, e.g. from the Plugins menu.
const api = window.api;
// Ready-made connections. All but Anthropic use the OpenAI-compatible Chat Completions API with tool calls.
const PRESETS = [
  { id: 'gemini', label: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'anthropic', label: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1', provider: 'anthropic' },
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
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

// Short explanations for the AI Agent fields. The ? button shows the text and links to the full guide.
const FIELD_HELP = {
  provider: ['The company or program that runs the AI model. Choose Other server or gateway for a service that is not listed.', 'ai-setup'],
  format: ['How Reccut talks to the server. Most services use the OpenAI-compatible format. Choose Anthropic Messages only for a Claude-compatible server.', 'ai-setup'],
  url: ['The address of the service’s API, usually ending in /v1, for example https://api.example.com/v1. Not the address of a chat web page.', 'ai-setup'],
  key: ['A secret code from your provider’s website that lets Reccut use your account. Local servers such as Ollama and LM Studio do not need one.', 'ai-setup'],
  model: ['The exact name of the AI model. Click Fetch models to choose from the models your key or server can use. The model must support tool calling.', 'ai-setup'],
  vision: ['Turn on if the model can look at pictures. The agent then checks its own work by looking at frames from your video.', 'ai-setup'],
  local: ['A program that runs the AI model on your own computer, such as Ollama or LM Studio. It is free and private, but needs a fairly powerful computer.', 'ai-local'],
};
export function HelpTip({ field }) {
  const [text, article] = FIELD_HELP[field];
  const [at, setAt] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!at) return;
    const close = (e) => (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.parentElement?.contains(e.target)) && setAt(null);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', close, true);
    };
  }, [at]);
  return (
    <span class="help-tip">
      <button
        ref={ref}
        type="button"
        class="help-tip-button"
        aria-label={`What is this? ${text}`}
        aria-expanded={Boolean(at)}
        title={text}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = ref.current.getBoundingClientRect();
          setAt(at ? null : { x: Math.max(8, Math.min(r.left - 8, innerWidth - 300)), y: r.bottom + 6 });
        }}
      >
        ?
      </button>
      {at && (
        <span class="help-tip-popover" role="note" style={{ left: `${at.x}px`, top: `${at.y}px` }}>
          {text}{' '}
          <button
            type="button"
            class="link"
            onClick={() => {
              setAt(null);
              helpOpen.value = { article };
            }}
          >
            Read the setup guide
          </button>
        </span>
      )}
    </span>
  );
}
const withTip = (label, field) => (
  <>
    {label} <HelpTip field={field} />
  </>
);

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
      <Section title="AI Agent" collapsible={false}>
        <p class="hint">
          Use a cloud provider with your own API key, or a local model server. The agent sends your messages and what it
          reads from the project, such as clip names, timings and caption text, and rendered preview frames when the
          model can see images. Media files and audio are not uploaded. Cloud providers bill you for usage.
        </p>
        <p class="hint agent-setup-intro">
          The easiest way to connect is the setup in the{' '}
          <button class="link" onClick={() => (aiChatOpen.value = true)}>
            AI Agent window
          </button>
          . Use the fields below for other providers, your own server or a specific model. Click <b>?</b> next to a field to see what goes in it, or{' '}
          <button class="link" onClick={() => (helpOpen.value = { article: 'ai-setup' })}>
            read the setup guide
          </button>
          .
        </p>
        {config && (
          <>
            <Row label={withTip('Provider', 'provider')} stacked>
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
                <Row label={withTip('API format', 'format')} stacked>
                  <Select
                    value={config.provider}
                    options={[
                      { value: 'compatible', label: 'OpenAI-compatible (vLLM, Jan, LocalAI, LiteLLM, Azure, gateways)' },
                      { value: 'anthropic', label: 'Anthropic Messages' },
                    ]}
                    onChange={(provider) => setConfig({ ...config, provider, hasKey: false })}
                  />
                </Row>
                <Row label={withTip('API base URL', 'url')} stacked>
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
            <Row label={withTip('API key', 'key')} stacked>
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
            <Row label={withTip('Model ID', 'model')} stacked>
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
            <Row label={withTip('Model can see images', 'vision')} hint="Lets the agent look at rendered frames. Turn off for text-only models.">
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
      toast('The AI Agent is ready.', { kind: 'success' });
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
      <h3>Set up the AI Agent</h3>
      <p class="hint">
        Choose which AI the agent uses. Not sure? Pick Google Gemini: it is free to start and takes about two minutes.{' '}
        <button class="link" onClick={() => (helpOpen.value = { article: 'ai-setup' })}>
          Read the setup guide
        </button>
      </p>
      <div class="setup-choices">
        {[
          ['gemini', 'Google Gemini', 'Free to start with a Google account. Good quality, can see images. On the free tier Google may use your data to improve its products.', true],
          ['anthropic', 'Claude', 'Best for long, complex edits. Pay as you go with an Anthropic account.'],
          ['openai', 'OpenAI', 'Strong all-round models. Pay as you go with an OpenAI account.'],
          ['local', 'On this computer', 'Free and private, but harder to set up. Needs Ollama or LM Studio and a fairly powerful computer. Best for simpler tasks.'],
        ].map(([id, title, text, recommended]) => (
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
            <b>
              {title}
              {recommended && <span class="setup-badge">Recommended</span>}
            </b>
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
              <li>
                No model server was found. Install {link('https://ollama.com/download', 'Ollama')} (or {link('https://lmstudio.ai', 'LM Studio')}) and open it. <HelpTip field="local" />
              </li>
              <li>
                In Terminal (Command Prompt on Windows), download a model that can use tools, for example <code>ollama pull qwen3</code>. Larger models
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
            <li>Copy the key, paste it below and click Connect. It is stored encrypted on this computer and only sent to {CLOUD[choice].label}.</li>
          </ol>
          <div class="extension-actions">
            <HelpTip field="key" />
            <input type="password" class="text-input" style="flex:1" autoComplete="off" aria-label="API key" placeholder="Paste your API key" value={key} onInput={(e) => setKey(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && !busy && connectCloud(choice)} />
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
          open Settings → AI → AI Agent
        </button>
        .
      </p>
    </div>
  );
}

const openAISettings = () => {
  localStorage.setItem('settingsPane', 'extensions');
  commands.prefsOpen.value = true;
};
function AgentHelp({ onExample, servers = [] }) {
  const kinds = new Set(servers.filter((s) => s.enabled).flatMap((s) => s.kinds));
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
        <li>
          Sound effects, music, images and web search come from tool servers you connect in{' '}
          <button class="link" onClick={openAISettings}>
            Settings › AI › Tool servers (MCP)
          </button>
          .
        </li>
        <li>
          Type <b>/</b> for chat commands: {CHAT_COMMANDS.map((c) => c.label).join(', ')}.
        </li>
      </ul>
      {EXAMPLES.map(([title, list]) => (
        <div key={title}>
          <b>{title}</b>
          <div class="agent-examples">
            {list.map((ex) =>
              ex.needs && !kinds.has(ex.needs) ? (
                <button key={ex.text} class="needs-server" title="Connect a tool server for this first" onClick={openAISettings}>
                  {ex.text} <small>· needs a {ex.needs} tool server</small>
                </button>
              ) : (
                <button key={ex.text} onClick={() => onExample(ex.text)}>
                  {ex.text}
                </button>
              ),
            )}
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
    [error, setError] = useState(''),
    [servers, setServers] = useState([]),
    [panel, setPanel] = useState(null);
  useEffect(() => {
    api.mcpList().then((s) => setServers(s.servers), () => {});
  }, []);
  // Slash commands run here and are never sent to the model.
  const slash = (text) => {
    const cmd = CHAT_COMMANDS.find((c) => c.label === text.trim().toLowerCase().split(/\s+/)[0]);
    if (!cmd) return false;
    setInput('');
    setError('');
    if (cmd.id === 'help') (setHelp(true), setPanel(null));
    else if (cmd.id === 'new') {
      if (busy) busy.abort();
      setMessages([]);
      setRun(null);
      setHelp(false);
      setPanel(null);
    } else if (cmd.id === 'undo') run && project.value === run.after ? revert() : toast('There is no request to undo. Use Edit › Undo for single steps.');
    else if (cmd.id === 'tools') api.mcpList().then((s) => (setServers(s.servers), setPanel('tools'), setHelp(false)), (e) => toast(e.message, { kind: 'error' }));
    else if (cmd.id === 'settings') openAISettings();
    return true;
  };
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
    if (!input.trim()) return;
    if (input.trim().startsWith('/') && slash(input)) return;
    if (busy) return;
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
          AI Agent
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
          {help && <AgentHelp servers={servers} onExample={(t) => (setInput(t), setHelp(false))} />}
          {panel === 'tools' && <ToolsPanel servers={servers} onClose={() => setPanel(null)} />}
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
                Write what you want in your own words, for example “Make a 2 minute tutorial from my recordings and remove
                the mistakes”, “Add cross dissolves between the clips” or “Give it a warm cinematic look”. Attach a script
                or reference image if you have one. Type <b>/help</b> for examples.
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
              placeholder="What do you want to do? Type /help for examples. (Enter sends, Shift+Enter new line)"
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {/^\/\S*$/.test(input) && (
              <div class="ai-slash" role="listbox">
                {CHAT_COMMANDS.filter((c) => c.label.startsWith(input.trim().toLowerCase())).map((c) => (
                  <button key={c.id} role="option" onClick={() => slash(c.label)}>
                    <b>{c.label}</b> {c.desc}
                  </button>
                ))}
              </div>
            )}
            {busy && !input.trim().startsWith('/') ? (
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

// /tools in the chat: what the agent can use right now.
function ToolsPanel({ servers, onClose }) {
  const on = servers.filter((s) => s.enabled);
  return (
    <div class="agent-help">
      <p>
        <b>Tool servers (MCP).</b>{' '}
        {on.length ? 'The agent can use these connected servers:' : 'None connected. Connect ready-made servers for sound effects, music, images, video and web search in Settings › AI.'}
      </p>
      {on.length > 0 && (
        <ul>
          {on.map((s) => (
            <li key={s.id}>
              <b>{s.name}</b>: {s.purpose}
              {s.status === 'error' && <small class="warn"> · {s.error}</small>}
            </li>
          ))}
        </ul>
      )}
      <p>
        <b>Skills.</b> The agent reads these craft guides by itself when a request needs them:
      </p>
      <ul>
        {SKILLS.map((s) => (
          <li key={s.id}>
            <b>{s.title}</b>: {s.when}
          </li>
        ))}
      </ul>
      <div class="extension-actions">
        <Button onClick={openAISettings}>Tool server settings</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

const copy = (text) =>
  navigator.clipboard.writeText(text).then(
    () => toast('Copied.', { kind: 'success', timeout: 1500 }),
    () => toast('Could not copy.', { kind: 'error' }),
  );

// Settings › AI › Tool servers (MCP): ready-made servers from src/main/mcpCatalog.json, and the user's own.
export function ToolServersPane() {
  const [state, setState] = useState(null),
    [keys, setKeys] = useState({}),
    [busy, setBusy] = useState(''),
    [custom, setCustom] = useState(null);
  useEffect(() => {
    api.mcpList().then(setState, (e) => toast(e.message, { kind: 'error' }));
  }, []);
  const act = async (id, fn, done) => {
    setBusy(id);
    try {
      const r = await fn();
      if (r?.servers) setState(r);
      if (done) toast(typeof done === 'function' ? done(r) : done, { kind: 'success' });
      return r;
    } catch (e) {
      toast(e.message, { kind: 'error', timeout: 8000 });
      api.mcpList().then(setState, () => {});
      return null;
    } finally {
      setBusy('');
    }
  };
  if (!state) return null;
  const field = (key, props) => <input class="text-input" value={custom[key]} onInput={(e) => setCustom({ ...custom, [key]: e.currentTarget.value })} {...props} />;
  return (
    <Section title="Tool servers (MCP)" collapsible={false}>
      <p class="hint">
        Give the AI Agent more abilities, such as sound effects, music, images, video and web search. These are MCP servers:
        separate programs or online services from their publishers. Turn on only the ones you need. Your key goes only to
        that server, and the agent sends a server only what a tool needs, for example the description of a sound effect.
        Your media files are not uploaded. Generated files are saved in Videos › Reccut › Generated.{' '}
        <button class="link" onClick={() => (helpOpen.value = { article: 'ai-mcp' })}>
          Read the guide
        </button>
      </p>
      <div class="mcp-servers">
        {state.servers.map((s) => (
          <div class={`mcp-server${s.enabled ? ' on' : ''}`} key={s.id}>
            <div class="mcp-server-head">
              <div>
                <b>{s.name}</b> <small class="hint">{s.publisher}</small>
                <p>{s.purpose}</p>
                <small class="hint">
                  {s.costs && <>{s.costs} </>}
                  {s.requires === 'uv' && 'Needs uv installed. '}
                  {s.requires === 'node' && 'Needs Node.js installed. '}
                  {s.homepage && (
                    <button class="link" onClick={() => api.openExternal(s.homepage)}>
                      About this server
                    </button>
                  )}
                  {s.custom && <code>{s.address}</code>}
                </small>
              </div>
              <Toggle checked={s.enabled} disabled={busy === s.id} onChange={(enabled) => act(s.id, () => api.mcpSave({ id: s.id, enabled, secret: keys[s.id] }))} />
            </div>
            {s.secretLabel && (
              <div class="extension-actions">
                <input
                  type="password"
                  class="text-input"
                  style="flex:1"
                  autoComplete="off"
                  value={keys[s.id] || ''}
                  placeholder={s.hasSecret ? 'Key saved · leave blank to keep it' : s.secretLabel}
                  onInput={(e) => setKeys({ ...keys, [s.id]: e.currentTarget.value })}
                />
                {s.secretHelpUrl && <Button onClick={() => api.openExternal(s.secretHelpUrl)}>Get a key</Button>}
                <Button
                  disabled={busy === s.id || !keys[s.id]?.trim()}
                  onClick={() => act(s.id, () => api.mcpSave({ id: s.id, secret: keys[s.id] }), 'Key saved.').then((r) => r && setKeys({ ...keys, [s.id]: '' }))}
                >
                  Save key
                </Button>
              </div>
            )}
            {s.enabled && (
              <div class="extension-actions">
                <Button
                  disabled={busy === s.id}
                  onClick={() => act(s.id, async () => ({ ...(await api.mcpTest(s.id).then((test) => ({ test }))), ...(await api.mcpList()) }), (r) => `${s.name} is connected with ${r.test.tools.length} tools.`)}
                >
                  {busy === s.id ? 'Connecting…' : 'Test connection'}
                </Button>
                {s.status === 'ready' && <small class="hint">Connected · {s.tools.length} tools</small>}
                {s.status === 'error' && <small class="warn">{s.error}</small>}
              </div>
            )}
            {s.custom && (
              <div class="extension-actions">
                <Button disabled={busy === s.id} onClick={() => act(s.id, () => api.mcpRemoveCustom(s.id), 'Removed.')}>
                  Remove
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {custom ? (
        <div class="mcp-server">
          <b>Add your own MCP server</b>
          <p class="hint">Use a server you trust. Copy the command or address from the server’s own instructions.</p>
          <Row label="Name" stacked>
            {field('name', { placeholder: 'For example Freesound' })}
          </Row>
          <Row label="What it is for" stacked>
            {field('purpose', { placeholder: 'Tells the agent when to use it' })}
          </Row>
          <Row label="Type" stacked>
            <Select
              value={custom.transport}
              options={[
                { value: 'stdio', label: 'Program on this computer (command)' },
                { value: 'http', label: 'Online server (https address)' },
              ]}
              onChange={(transport) => setCustom({ ...custom, transport })}
            />
          </Row>
          {custom.transport === 'http' ? (
            <Row label="Address" stacked>
              {field('url', { placeholder: 'https://example.com/mcp' })}
            </Row>
          ) : (
            <>
              <Row label="Command" stacked>
                {field('command', { placeholder: 'npx, uvx or a full path' })}
              </Row>
              <Row label="Arguments" stacked>
                {field('args', { placeholder: '-y some-mcp-server' })}
              </Row>
              <Row label="Key variable (optional)" stacked>
                {field('secretEnv', { placeholder: 'MY_API_KEY' })}
              </Row>
            </>
          )}
          <Row label={custom.transport === 'http' ? 'Bearer token (optional)' : 'Key (optional)'} stacked>
            {field('secret', { type: 'password', autoComplete: 'off' })}
          </Row>
          <div class="extension-actions">
            <Button variant="primary" disabled={busy === 'custom'} onClick={() => act('custom', () => api.mcpAddCustom(custom), 'Added and turned on. Click Test connection to check it.').then((r) => r && setCustom(null))}>
              Add server
            </Button>
            <Button onClick={() => setCustom(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div class="extension-actions">
          <Button onClick={() => setCustom({ name: '', purpose: '', transport: 'stdio', command: '', args: '', url: '', secretEnv: '', secret: '' })}>Add your own server…</Button>
        </div>
      )}
      {!state.encryptedStorage && <p class="hint">Secure storage is unavailable. Keys are kept in memory for this session only.</p>}
    </Section>
  );
}

// Settings › AI › Use Reccut from other AI apps: Reccut's own MCP server (src/main/mcpServer.js).
const MCP_APPS = {
  claudeDesktop: ['Claude Desktop', 'In Claude, open Settings › Developer › Edit Config. Paste this into claude_desktop_config.json (merge it with servers you already have) and restart Claude.'],
  claudeCode: ['Claude Code', 'Run this command once in a terminal.'],
  vscode: ['VS Code', 'Paste this into .vscode/mcp.json in your project, or run MCP: Add Server.'],
  json: ['Cursor and others', 'Paste this into the app’s MCP settings, for example ~/.cursor/mcp.json.'],
};
export function ReccutMcpPane() {
  const [s, setS] = useState(null),
    [target, setTarget] = useState('claudeDesktop');
  useEffect(() => {
    api.mcpServerStatus().then(setS, () => {});
  }, []);
  const configure = (raw) => api.mcpServerConfigure(raw).then(setS, (e) => toast(e.message, { kind: 'error' }));
  if (!s) return null;
  return (
    <Section title="Use Reccut from other AI apps" collapsible={false}>
      <p class="hint">
        Lets AI apps such as Claude Desktop, Claude Code, Cursor and VS Code edit in Reccut with the same tools, skills and
        instructions as the AI Agent, with the AI subscription you already have. Reccut must be open. It listens only on
        this computer and needs a secret token. Every change is an undo step.{' '}
        <button class="link" onClick={() => (helpOpen.value = { article: 'ai-mcp' })}>
          Read the guide
        </button>
      </p>
      <Row label="Allow AI apps to use Reccut" hint={s.running ? `Running at ${s.url}` : s.error || 'Off'}>
        <Toggle checked={s.enabled} onChange={(enabled) => configure({ enabled })} />
      </Row>
      {s.enabled && s.setup && (
        <>
          <Row label="App" stacked>
            <Select value={target} options={Object.entries(MCP_APPS).map(([value, [label]]) => ({ value, label }))} onChange={setTarget} />
          </Row>
          <p class="hint">{MCP_APPS[target][1]}</p>
          <pre class="mcp-snippet">{s.setup[target]}</pre>
          <div class="extension-actions">
            <Button variant="primary" onClick={() => copy(s.setup[target])}>
              Copy
            </Button>
            <Button onClick={() => configure({ newToken: true }).then(() => toast('New token made. Copy the setup again into apps that use the address.'))}>New token</Button>
          </div>
          <p class="hint">Keep the token private: anyone with it can edit your open project. Claude Desktop reads it from Reccut, so it is not in that setup.</p>
        </>
      )}
    </Section>
  );
}
