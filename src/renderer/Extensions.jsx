import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Button, Modal, Row, Section, Select, Toggle, toast } from './ui.jsx';
import { canUndo, project, undo } from './editor/store.js';
import { runAgent } from './agent.js';
import { fileUrl } from './player.js';
export const aiChatOpen = signal(false);
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
    [plugins, setPlugins] = useState([]),
    [models, setModels] = useState([]),
    [candidate, setCandidate] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .aiConfig()
      .then(setConfig)
      .catch((e) => toast(e.message, { kind: 'error' }));
    api.pluginsList().then(setPlugins);
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
  const loadManifest = async () => {
    const file = await api.openFileDialog({
      title: 'Install Local Video Processor',
      filters: [{ name: 'Reccut processor manifest', extensions: ['json'] }],
    });
    if (!file) return;
    try {
      const text = await api.readText(file);
      if (text.length > 50000) throw new Error('Manifest is too large.');
      setCandidate(JSON.parse(text));
    } catch (e) {
      toast(e.message, { kind: 'error' });
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
                Start the server first and load a model that supports tool calling. Nothing leaves your computer. To use
                a server on another machine, choose Other server and enter its local network address.
              </p>
            )}
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
                  disabled={busy}
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
      <Section title="External video processors" collapsible={false}>
        <p class="hint">
          Install a local command-line processor using a Reccut JSON manifest. It runs on your source file and creates a
          new video, which can replace the selected clip’s source. Originals remain in the project. Use trusted tools: a
          processor runs with your account’s permissions.
        </p>
        <p class="hint">
          Native OFX and Adobe plugins cannot be loaded here. CorridorKey needs a compatible command-line adapter or
          processing in its standalone app followed by importing the result. Models and licences are installed
          separately.
        </p>
        {plugins.map((p) => (
          <div class="processor-row" key={p.id}>
            <div>
              <b>{p.name}</b>
              <small>{p.executable}</small>
            </div>
            <Button
              class="small"
              onClick={async () => {
                try {
                  setPlugins(await api.pluginsRemove(p.id));
                  window.dispatchEvent(new Event('reccut:processors-changed'));
                } catch (e) {
                  toast(e.message, { kind: 'error' });
                }
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button onClick={loadManifest}>Install processor manifest…</Button>
        {candidate && (
          <div class="processor-review">
            <b>Install {String(candidate.name || 'processor')}?</b>
            <p class="hint">Executable and arguments:</p>
            <pre>
              {String(candidate.executable)}
              {'\n'}
              {JSON.stringify(candidate.args, null, 2)}
            </pre>
            <div class="extension-actions">
              <Button onClick={() => setCandidate(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    setPlugins(await api.pluginsInstall(candidate));
                    window.dispatchEvent(new Event('reccut:processors-changed'));
                    setCandidate(null);
                  } catch (e) {
                    toast(e.message, { kind: 'error' });
                  }
                }}
              >
                Install this processor
              </Button>
            </div>
          </div>
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
};
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
export function AIChat() {
  const [messages, setMessages] = useState([]),
    [input, setInput] = useState(''),
    [images, setImages] = useState([]),
    [busy, setBusy] = useState(null),
    [run, setRun] = useState(null),
    [error, setError] = useState('');
  const send = async () => {
    if (!input.trim() || busy) return;
    const history = [...messages, { role: 'user', content: input.trim(), ...(images.length ? { images } : {}) }],
      controller = new AbortController(),
      before = project.value;
    setMessages(history);
    setInput('');
    setImages([]);
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
  const attach = async (blobs) => {
    try {
      const urls = await Promise.all(blobs.filter((b) => b.type.startsWith('image/')).map(imageUrl));
      setImages((list) => [...list, ...urls].slice(0, 4));
    } catch {
      toast('Could not read that image.', { kind: 'error' });
    }
  };
  const pick = async () => {
    const file = await api.openFileDialog({ title: 'Attach Image', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
    if (file) attach([await (await fetch(fileUrl(file))).blob()].map((b) => (b.type ? b : new Blob([b], { type: 'image/*' }))));
  };
  // Undo the agent's steps one by one, so redo still works. Only while nothing else has changed.
  const revert = () => {
    for (let i = 0; i < 500 && project.value !== run.before && canUndo(); i++) undo();
    setRun(null);
    toast('Reverted the changes from that request.');
  };
  return (
    <Modal
      title="AI editing agent"
      width={760}
      onClose={() => (busy ? busy.abort() : (aiChatOpen.value = false))}
      footer={
        <>
          {run && project.value === run.after && <Button onClick={revert}>Undo this request</Button>}
          <Button onClick={() => (aiChatOpen.value = false)}>Close</Button>
        </>
      }
    >
      <p class="hint">
        Describe the edit you want. The agent reads the project, edits it with the same tools you use and checks the
        result. Every change is an undo step. Configure the model in Settings → AI & Plugins.
      </p>
      <div class="ai-messages" aria-live="polite">
        {messages.length ? (
          messages.map((m, i) =>
            m.role === 'tool' ? (
              <div class={`ai-step${m.error ? ' failed' : ''}`} key={i}>
                {m.error ? '✕' : '✓'} {TOOL_LABELS[m.name] || m.name.replaceAll('_', ' ')}
                {m.error && <small>{m.content}</small>}
                {m.image && <img src={m.image} alt="Rendered preview the agent looked at" />}
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
            Try “Subtitle this video in Finnish”, “Adjust colour and exposure on every clip so they look good and
            match”, “Make the clips look like this image” with an image attached, or “Make a 45 second cut and add a
            title”.
          </p>
        )}
        {busy && <p class="hint">Working…</p>}
      </div>
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      {images.length > 0 && (
        <div class="ai-attachments">
          {images.map((src, i) => (
            <button key={i} title="Remove image" onClick={() => setImages(images.filter((_, j) => j !== i))}>
              <img src={src} alt={`Attachment ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
      <div
        class="ai-compose"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach([...e.dataTransfer.files]);
        }}
      >
        <Button onClick={pick} disabled={images.length >= 4} title="Attach a reference image (or paste or drop one)">
          Image…
        </Button>
        <textarea
          onPaste={(e) => e.clipboardData.files.length && attach([...e.clipboardData.files])}
          class="text-input"
          rows={3}
          value={input}
          maxLength={20000}
          placeholder="Describe an edit… (Cmd/Ctrl Enter sends)"
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
    </Modal>
  );
}
