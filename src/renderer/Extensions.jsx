import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Button, Modal, Row, Section, Select, toast } from './ui.jsx';
import { project, selection, timeSig, commit } from './editor/store.js';
import { aiContext, applyAIActions, parseAIReply, validateAIActions } from '../shared/aiEdits.js';
export const aiChatOpen = signal(false);
const api = window.api;

export function ExtensionsPane() {
  const [config, setConfig] = useState(null),
    [apiKey, setKey] = useState(''),
    [plugins, setPlugins] = useState([]),
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
          Use your own API key. Requests are billed by your provider. The chat sends your messages and text metadata
          about the timeline, including clip names and caption text. Video, audio and local file paths are not uploaded.
        </p>
        {config && (
          <>
            <Row label="API format" stacked>
              <Select
                value={config.provider}
                options={[
                  { value: 'compatible', label: 'OpenAI-compatible (OpenAI, local models, gateways)' },
                  { value: 'anthropic', label: 'Anthropic Messages' },
                ]}
                onChange={(provider) => {
                  setConfig({
                    ...config,
                    provider,
                    hasKey: false,
                    endpoint: provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1',
                    model: '',
                  });
                  setKey('');
                }}
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
            <Row label="Model ID" stacked>
              <input
                class="text-input"
                value={config.model}
                placeholder="Exact model ID from your provider"
                onInput={(e) => setConfig({ ...config, model: e.currentTarget.value })}
              />
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
                    : 'Paste your API key (optional for local models)'
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
export function AIChat() {
  const [messages, setMessages] = useState([]),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [proposal, setProposal] = useState(null),
    [error, setError] = useState('');
  const send = async () => {
    if (!input.trim() || busy) return;
    const user = { role: 'user', content: input.trim() },
      history = [...messages, user].slice(-20),
      snapshot = project.value;
    setMessages(history);
    setInput('');
    setBusy(true);
    setError('');
    setProposal(null);
    try {
      const raw = await api.aiChat({
        messages: history.map(({ role, content }) => ({ role, content })),
        context: aiContext(snapshot, selection.value, timeSig.value),
      });
      const parsed = parseAIReply(raw);
      setMessages([...history, { role: 'assistant', content: parsed.reply }]);
      if (parsed.actions.length) {
        const actions = validateAIActions(snapshot, parsed.actions);
        setProposal({ actions, snapshot });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="AI editing assistant"
      width={720}
      onClose={() => (aiChatOpen.value = false)}
      footer={<Button onClick={() => (aiChatOpen.value = false)}>Close</Button>}
    >
      <p class="hint">
        Your messages and timeline text are sent to your configured provider. The assistant cannot see or hear your
        footage. Changes are proposed below and applied as one undo step.
      </p>
      <div class="ai-messages" aria-live="polite">
        {messages.length ? (
          messages.map((m, i) => (
            <div class={`ai-message ${m.role}`} key={i}>
              <b>{m.role === 'user' ? 'You' : 'Assistant'}</b>
              <p>{m.content}</p>
            </div>
          ))
        ) : (
          <p class="hint">
            Try “Add a green screen key to the selected clip” or “Fade the audio out over two seconds”. Configure your
            provider in Settings → AI & Plugins.
          </p>
        )}
        {busy && <p class="hint">Waiting for your model…</p>}
      </div>
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      {proposal && (
        <div class="ai-proposal">
          <b>Proposed changes</b>
          <ul>
            {proposal.actions.map((a, i) => (
              <li key={i}>
                {project.value.clips[a.clipId]?.name || a.clipId}:{' '}
                {a.type === 'rename'
                  ? `Rename to “${a.name}”`
                  : a.type === 'addEffect'
                    ? `Add ${a.effect}`
                    : `${a.property} → ${a.value}`}
              </li>
            ))}
          </ul>
          {project.value !== proposal.snapshot ? (
            <p class="warn">The project changed. Send a new request for an updated proposal.</p>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                try {
                  if (project.value !== proposal.snapshot)
                    throw new Error('The project changed. Request an updated proposal.');
                  commit((p) => applyAIActions(p, proposal.actions));
                  setProposal(null);
                  toast('Applied AI edits. Undo restores the previous state.', { kind: 'success' });
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Apply {proposal.actions.length} change{proposal.actions.length === 1 ? '' : 's'}
            </Button>
          )}
          <Button onClick={() => setProposal(null)}>Dismiss</Button>
        </div>
      )}
      <div class="ai-compose">
        <textarea
          class="text-input"
          rows={3}
          value={input}
          maxLength={20000}
          placeholder="Ask for an edit or advice…"
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button disabled={busy || !input.trim()} variant="primary" onClick={send}>
          Send
        </Button>
      </div>
    </Modal>
  );
}
