import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button, Modal, Row, Select } from '../ui.jsx';
import { DESIGN_SIZES } from '../../shared/design.js';
import { BUILTIN_DESIGN_TEMPLATES, applyTemplate } from '../../shared/designTemplates.js';
import { suggestionTemplates } from '../../shared/thumbScore.js';
import { aiTitleProvider, transcriptForTitles } from '../../shared/designSuggest.js';
import { formatTimecode } from '../../shared/model.js';
import { drawDesign } from '../../shared/designRender.js';
import { templateContext } from './library.js';
import { imageVersion, loadDesignImages, getImage, getImageAtPath } from './assets.js';
import { brandLogo } from './brand.js';
import { fontAvailable, fontVersion } from './fonts.js';
import { suggestions, closeSuggestions, analyzeSuggestions, loadSuggestionAIConfig, suggestAITitles, createSuggestedDesign } from './suggest.js';

function SuggestionCard({ frame, template, title, size, disabled, onChoose }) {
  const ref = useRef(null), context = templateContext(), version = `${imageVersion.value}:${fontVersion.value}`;
  const d = applyTemplate(template, { ...context, title, width: size.width, height: size.height, frame: { asset: 'suggestion-frame' } });
  const signature = JSON.stringify({ ...d, id: null, created: 0, layers: d.layers.map(l => ({ ...l, id: null })) });
  useEffect(() => { loadDesignImages({ ...d, layers: d.layers.filter(l => l.asset !== 'suggestion-frame') }); }, [signature]);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'), scale = Math.min(240 / d.width, 150 / d.height);
    ctx.clearRect(0, 0, 240, 150); ctx.save(); ctx.translate((240 - d.width * scale) / 2, (150 - d.height * scale) / 2);
    drawDesign(ctx, d, l => l.asset === 'suggestion-frame' ? frame.canvas : l.asset === 'preview-logo' ? getImageAtPath(brandLogo.value?.path) : getImage(l), { scale, fontAvailable, cacheLayers: false }); ctx.restore();
  }, [signature, frame, version, brandLogo.value]);
  return <button class="dz-suggestion-card" disabled={disabled} onClick={onChoose} title={`Create an editable ${template.name} design`}><canvas ref={ref} width={240} height={150}/><b>{template.name}</b></button>;
}
export function SuggestionsDialog() {
  const session = suggestions.value;
  return session ? <SuggestionSession key={session.id} session={session}/> : null;
}
function SuggestionSession({ session }) {
  const [size, setSize] = useState(session.size), [shuffle, setShuffle] = useState(0), [titleIndex, setTitleIndex] = useState(0), [customTitle, setCustomTitle] = useState(null), [confirmAI, setConfirmAI] = useState(false), [consentedProvider, setConsentedProvider] = useState(null);
  useEffect(() => { analyzeSuggestions(); loadSuggestionAIConfig(); }, []);
  const templates = suggestionTemplates(BUILTIN_DESIGN_TEMPLATES, size.width, size.height, shuffle), title = customTitle ?? session.titles[titleIndex % Math.max(1, session.titles.length)] ?? session.source.name;
  const provider = aiTitleProvider(session.config), transcript = useMemo(() => transcriptForTitles(session.source), [session.source]), busy = session.creating;
  const ai = () => { if (consentedProvider === session.config.endpoint) { suggestAITitles(); setCustomTitle(null); setTitleIndex(0); } else setConfirmAI(true); };
  const chooseSize = id => { const target = id === 'current' ? session.size : DESIGN_SIZES.find(s => s.id === id); if (target) setSize({ ...target, id }); };
  return <Modal title="Design Suggestions" width={1120} cls="dz-suggestions" onClose={closeSuggestions} footer={<><span class="hint">{busy ? 'Capturing the full-quality frame…' : 'Choose a card to create an editable design.'}</span><span class="spacer"/><Button onClick={closeSuggestions}>{busy || session.phase === 'analyzing' ? 'Cancel' : 'Close'}</Button></>}>
    <p class="hint">Frames and title ideas are analyzed locally. Your timeline stays unchanged.</p>
    <div class="dz-suggestion-controls"><Row label="Canvas"><Select disabled={busy} value={size.id} options={[{ value: 'current', label: `Current size (${session.size.width} × ${session.size.height})` }, ...DESIGN_SIZES.map(s => ({ value: s.id, label: s.label }))]} onChange={chooseSize}/></Row><Button disabled={busy || session.aiBusy} onClick={() => { setShuffle(shuffle + 1); setTitleIndex(titleIndex + 1); setCustomTitle(null); }}>Shuffle</Button></div>
    <Row label="Title" stacked><input class="text-input" aria-label="Suggestion title" value={title} maxLength={60} disabled={busy} onInput={e => setCustomTitle(e.currentTarget.value)}/></Row>
    <div class="dz-title-candidates">{session.titles.map((candidate, i) => <button key={candidate} class={title === candidate ? 'active' : ''} disabled={busy} onClick={() => { setTitleIndex(i); setCustomTitle(null); }}>{candidate}</button>)}</div>
    {provider && <div class="dz-suggestion-ai"><Button disabled={!transcript.trim() || session.aiBusy || busy} onClick={ai}>{session.aiBusy ? 'Suggesting Titles…' : 'Suggest Titles with AI'}</Button>{!transcript.trim() && <small class="hint">Add captions to suggest AI titles.</small>}{confirmAI && <div class="dz-suggestion-consent" role="alert"><p>The transcript is sent to {provider} to suggest titles. Up to 12,000 characters are included.</p><Button disabled={session.aiBusy} variant="primary" onClick={() => { setConsentedProvider(session.config.endpoint); setConfirmAI(false); setTitleIndex(0); setCustomTitle(null); suggestAITitles(); }}>Send Transcript</Button><Button onClick={() => setConfirmAI(false)}>Cancel</Button></div>}</div>}
    {session.phase === 'analyzing' && <div role="status"><p>Finding clear frames… {session.progress ? `${session.progress.attempted} / ${session.progress.total}` : ''}</p><progress max={session.progress?.total || 1} value={session.progress?.attempted || 0}/></div>}
    {session.result?.limited && <p class="hint">The time limit was reached. Showing the frames analyzed so far.</p>}
    {session.result?.failed > 0 && <p class="hint">{session.result.failed} frames could not be decoded in time and were skipped.</p>}
    {session.phase !== 'analyzing' && session.phase !== 'idle' && !session.frames.length && <p role="status">No usable video frames were found. Add video or images to the current sequence and try again.</p>}
    {session.frames.map(frame => <section key={frame.time} class="dz-suggestion-row"><h3>{formatTimecode(frame.time, session.source.fps)}{frame.camera ? ' · Camera visible' : ''}</h3><div class="dz-suggestion-grid">{templates.map(template => <SuggestionCard key={template.id} frame={frame} template={template} title={title} size={size} disabled={busy} onChoose={() => createSuggestedDesign(frame, template, title, size)}/>)}</div></section>)}
  </Modal>;
}
