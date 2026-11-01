// Chat-panelet for AI-assistenten. Ligger over inspektøren i redigeringsrommet.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Bot, Send, Square, Trash2, Undo2, X } from 'lucide-preact';
import { ask, chatBusy, chatItems, clearChat, stopChat, undoSince } from './ai.js';
import * as commands from './commands.js';
import { Button, IconButton } from '../ui.jsx';

const api = window.api;

const SUGGESTIONS = ['Remove the long pauses in the storyline', 'Add a title at the start with the project name', 'Remove the green screen on the selected clip', 'Clean up the voice on all clips with speech'];

export function AiChat() {
  const [text, setText] = useState('');
  const [cfg, setCfg] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    api.aiConfig().then(setCfg);
    inputRef.current?.focus();
  }, [commands.prefsOpen.value]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatItems.value]);
  const ready = cfg && (cfg.hasKey || cfg.provider === 'openai');
  const send = () => {
    if (!text.trim() || chatBusy.value) return;
    ask(text);
    setText('');
  };
  return (
    <div class="ai-chat" onKeyDown={(e) => e.stopPropagation()}>
      <header>
        <Bot size={15} />
        <b>AI Assistant</b>
        <span class="hint inline">{cfg?.model}</span>
        <div class="spacer" />
        <IconButton icon={Trash2} size={14} title="New conversation" disabled={chatBusy.value || !chatItems.value.length} onClick={clearChat} />
        <IconButton icon={X} size={14} title="Close" onClick={() => (commands.aiChatOpen.value = false)} />
      </header>
      <div class="ai-list" ref={listRef}>
        {cfg && !ready && (
          <div class="ai-empty">
            <p>Add an API key for the AI model you want to use. The assistant can then look at the project and edit it for you.</p>
            <Button
              class="small"
              onClick={() => {
                localStorage.setItem('settingsPane', 'ai');
                commands.prefsOpen.value = true;
              }}
            >
              Open AI Settings
            </Button>
          </div>
        )}
        {ready && !chatItems.value.length && (
          <div class="ai-empty">
            <p>Ask for an edit, or ask about the project. Everything the assistant changes can be undone.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} class="ai-suggestion" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {chatItems.value.map((it, i) =>
          it.kind === 'changes' ? (
            <div key={i} class="ai-changes">
              <span>{it.undone ? `${it.text} undone` : it.text}</span>
              {!it.undone && (
                <Button class="small" variant="ghost" icon={Undo2} disabled={chatBusy.value} onClick={() => undoSince(it.mark)}>
                  Undo These Changes
                </Button>
              )}
            </div>
          ) : (
            <div key={i} class={`ai-msg ${it.kind}`}>
              {it.text}
            </div>
          )
        )}
        {chatBusy.value && <div class="ai-msg tool working">Working…</div>}
      </div>
      <div class="ai-input">
        <textarea
          ref={inputRef}
          rows={2}
          value={text}
          disabled={!ready}
          placeholder={ready ? 'Ask for an edit…' : ''}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {chatBusy.value ? <IconButton icon={Square} title="Stop" onClick={stopChat} /> : <IconButton icon={Send} title="Send (Return)" disabled={!text.trim() || !ready} onClick={send} />}
      </div>
    </div>
  );
}
