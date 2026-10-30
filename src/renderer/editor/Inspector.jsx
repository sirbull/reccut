// Inspektøren viser egenskapene til valgt klipp, med nøkkelbilder som i Final Cut Pro.
import { ChevronLeft, ChevronRight, Diamond, RotateCcw } from 'lucide-preact';
import {
  CAPTION_LANE,
  COLOR_LOOKS,
  TITLE_STYLES,
  TRANSITIONS,
  clipHasAudio,
  defaultProps,
  isElastic,
  isVisual,
  keyframeIndexAt,
  removeKeyframe,
  setKeyframe,
  sourceTime,
  valueAt,
} from '../../shared/model.js';
import { setClipDuration, setTransition } from '../../shared/ops.js';
import {
  beginTransient,
  commit,
  endTransient,
  project,
  selectedClips,
  selectedTransition,
  timeSig,
  updateTransient,
} from './store.js';
import { seek } from './playback.js';
import { inspectorTab } from './commands.js';
import { IconButton, NumberField, Row, Section, Segmented, Select, Slider, Toggle } from '../ui.jsx';

export function Inspector() {
  const clips = selectedClips.value;
  const transId = selectedTransition.value;
  const p = project.value;

  if (transId && p.clips[transId]?.transition) return <TransitionInspector clip={p.clips[transId]} />;
  if (clips.length === 1) return <ClipInspector clip={clips[0]} />;
  if (clips.length > 1)
    return (
      <div class="inspector panel">
        <div class="insp-head">
          <b>{clips.length} klipp valgt</b>
        </div>
        <div class="insp-body">
          <Section title="Felles">
            <Row label="På">
              <Toggle
                checked={clips.every((c) => c.enabled)}
                onChange={(v) => commit((q) => clips.forEach((c) => q.clips[c.id] && (q.clips[c.id].enabled = v)))}
              />
            </Row>
          </Section>
        </div>
      </div>
    );
  return <ProjectInspector />;
}

function tabsFor(clip, media) {
  const tabs = [];
  if (clip.type === 'title') tabs.push({ id: 'text', label: 'Tekst' });
  if (clip.type === 'caption') tabs.push({ id: 'caption', label: 'Undertekst' });
  if (clip.type === 'recording') tabs.push({ id: 'recording', label: 'Opptak' });
  if (isVisual(clip) && clip.type !== 'gap') tabs.push({ id: 'video', label: 'Video' });
  if (clipHasAudio(clip, media) && clip.type !== 'recording') tabs.push({ id: 'audio', label: 'Lyd' });
  if (clip.type === 'video' || clip.type === 'image' || clip.type === 'recording') tabs.push({ id: 'color', label: 'Farge' });
  tabs.push({ id: 'info', label: 'Info' });
  return tabs;
}

function ClipInspector({ clip }) {
  const p = project.value;
  const media = p.media[clip.mediaId];
  const tabs = tabsFor(clip, media);
  const tab = tabs.find((t) => t.id === inspectorTab.value) ? inspectorTab.value : tabs[0].id;

  return (
    <div class="inspector panel">
      <div class="panel-tabs">
        {tabs.map((t) => (
          <button key={t.id} class={tab === t.id ? 'active' : ''} onClick={() => (inspectorTab.value = t.id)}>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div class="insp-head">
        <span class={`type-dot t-${clip.type}`} />
        <b title={clip.name || ''}>{clip.type === 'title' ? clip.props.text : clip.type === 'caption' ? 'Undertekst' : clip.name || media?.name || 'Klipp'}</b>
        <Toggle checked={clip.enabled} onChange={(v) => commit((q) => (q.clips[clip.id].enabled = v))} />
      </div>
      <div class="insp-body">
        {tab === 'text' && <TextTab clip={clip} />}
        {tab === 'caption' && <CaptionTab clip={clip} />}
        {tab === 'recording' && <RecordingTab clip={clip} media={media} />}
        {tab === 'video' && <VideoTab clip={clip} />}
        {tab === 'audio' && <AudioTab clip={clip} />}
        {tab === 'color' && <ColorTab clip={clip} />}
        {tab === 'info' && <InfoTab clip={clip} media={media} />}
      </div>
    </div>
  );
}

/* Egenskaper med nøkkelbilder */

function setValue(c, prop, v, T) {
  if (c.kf?.[prop]?.length) setKeyframe(c, prop, sourceTime(c, T), v);
  else c.props[prop] = v;
}

function Param({ clip, prop, label, min, max, step = 1, unit = '', precision = 0, scale = 1, slider = true, center, keyframes = true }) {
  const T = timeSig.value;
  const inside = T >= clip.start && T <= clip.start + clip.dur;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur);
  const raw = valueAt(clip, prop, Tc) ?? 0;
  const value = raw * scale;
  const s = sourceTime(clip, Tc);
  const list = clip.kf?.[prop] || [];
  const atKf = keyframeIndexAt(clip, prop, s) >= 0;
  const id = clip.id;
  const apply = (v) => updateTransient((q) => setValue(q.clips[id], prop, v / scale, Tc));
  const prev = list.filter(([t]) => t < s - 1e-3).at(-1);
  const next = list.find(([t]) => t > s + 1e-3);
  const goto = (t) => seek(clip.start + (t - clip.in));
  const isDefault = !list.length && raw === (defaultProps(clip.type)[prop] ?? 0);

  return (
    <div class="param">
      <span class="param-label">{label}</span>
      {slider && (
        <Slider value={value} min={min} max={max} step={step} center={center} onStart={beginTransient} onInput={apply} onCommit={() => endTransient(true)} />
      )}
      <NumberField value={value} min={min} max={max} step={step} precision={precision} unit={unit} onStart={beginTransient} onChange={apply} onCommit={() => endTransient(true)} />
      {keyframes ? (
        <div class="kf-ctl">
          <IconButton icon={ChevronLeft} size={12} title="Forrige nøkkelbilde" disabled={!prev} onClick={() => prev && goto(prev[0])} />
          <button
            class={`kf-btn${atKf ? ' on' : list.length ? ' has' : ''}`}
            disabled={!inside}
            title={atKf ? 'Fjern nøkkelbilde' : 'Legg til nøkkelbilde (Option K)'}
            onClick={() =>
              commit((q) => {
                const c = q.clips[id];
                if (atKf) removeKeyframe(c, prop, s);
                else setKeyframe(c, prop, s, raw);
              })
            }
          >
            <Diamond size={11} />
          </button>
          <IconButton icon={ChevronRight} size={12} title="Neste nøkkelbilde" disabled={!next} onClick={() => next && goto(next[0])} />
        </div>
      ) : (
        <span class="kf-ctl" />
      )}
      <IconButton
        icon={RotateCcw}
        size={12}
        title="Tilbakestill"
        class={isDefault ? 'invisible' : ''}
        onClick={() =>
          commit((q) => {
            const c = q.clips[id];
            delete c.kf[prop];
            c.props[prop] = defaultProps(c.type)[prop] ?? 0;
          })
        }
      />
    </div>
  );
}

function PlainNumber({ clip, prop, label, min, max, step, unit, precision = 1 }) {
  return (
    <Row label={label}>
      <NumberField
        value={clip.props[prop] || 0}
        min={min}
        max={max}
        step={step}
        unit={unit}
        precision={precision}
        onStart={beginTransient}
        onChange={(v) => updateTransient((q) => (q.clips[clip.id].props[prop] = v))}
        onCommit={() => endTransient(true)}
      />
    </Row>
  );
}

function setProp(clip, patch) {
  commit((q) => Object.assign(q.clips[clip.id].props, patch));
}

function VideoTab({ clip }) {
  const p = project.value;
  return (
    <>
      <Section title="Sammensetting">
        <Param clip={clip} prop="opacity" label="Opasitet" min={0} max={100} scale={100} unit="%" />
      </Section>
      <Section title="Transformer">
        <Param clip={clip} prop="x" label="Posisjon X" min={-p.width} max={p.width} unit="px" slider={false} />
        <Param clip={clip} prop="y" label="Posisjon Y" min={-p.height} max={p.height} unit="px" slider={false} />
        <Param clip={clip} prop="scale" label="Skala" min={10} max={400} scale={100} unit="%" />
        <Param clip={clip} prop="rotation" label="Rotasjon" min={-180} max={180} unit="°" center={0} />
      </Section>
      <Section title="Toning">
        <PlainNumber clip={clip} prop="vFadeIn" label="Tone inn" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="vFadeOut" label="Tone ut" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
    </>
  );
}

function AudioTab({ clip }) {
  return (
    <>
      <Section title="Lydstyrke">
        <Param clip={clip} prop="volume" label="Volum" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />
        <p class="hint">Option-klikk på volumlinjen i tidslinjen for å legge til nøkkelbilder. Ctrl + og Ctrl - justerer med 1 dB.</p>
      </Section>
      <Section title="Toning">
        <PlainNumber clip={clip} prop="aFadeIn" label="Tone inn" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="aFadeOut" label="Tone ut" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
    </>
  );
}

function ColorTab({ clip }) {
  const look = COLOR_LOOKS.find((l) => Object.entries(l.v).every(([k, v]) => Math.abs((clip.props[k] || 0) - v) < 1e-3 && !clip.kf?.[k]));
  return (
    <>
      <Section title="Utseende">
        <div class="looks">
          {COLOR_LOOKS.map((l) => (
            <button
              key={l.id}
              class={`look look-${l.id}${look?.id === l.id ? ' active' : ''}`}
              onClick={() =>
                commit((q) => {
                  const c = q.clips[clip.id];
                  for (const [k, v] of Object.entries(l.v)) {
                    c.props[k] = v;
                    delete c.kf[k];
                  }
                })
              }
            >
              <span class="swatch" />
              {l.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Justering">
        <Param clip={clip} prop="exposure" label="Lysstyrke" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="contrast" label="Kontrast" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="saturation" label="Metning" min={-100} max={100} scale={100} center={0} />
        <Param clip={clip} prop="temperature" label="Temperatur" min={-100} max={100} scale={100} center={0} />
      </Section>
    </>
  );
}

const LAYOUT_OPTIONS = [
  { value: 1, label: '1', title: 'Kamera i fullskjerm' },
  { value: 2, label: '2', title: 'Bare skjerm' },
  { value: 3, label: '3', title: 'Oppe til venstre' },
  { value: 4, label: '4', title: 'Oppe til høyre' },
  { value: 5, label: '5', title: 'Nede til venstre' },
  { value: 6, label: '6', title: 'Nede til høyre' },
];

function RecordingTab({ clip, media }) {
  const T = timeSig.value;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur);
  const s = sourceTime(clip, Tc);
  const layout = valueAt(clip, 'layout', Tc) ?? 6;
  const atSwitch = keyframeIndexAt(clip, 'layout', s, 0.05) >= 0;
  const hasCam = media?.streams?.camera?.hasVideo;
  const rec = media?.rec || {};
  const switches = (clip.kf.layout || []).filter(([t]) => t >= clip.in && t <= clip.in + clip.dur);
  return (
    <>
      {hasCam && (
        <Section title="Kamera">
          <Row label="Vis kamera">
            <Toggle checked={clip.props.showCamera !== false} onChange={(v) => setProp(clip, { showCamera: v })} />
          </Row>
          <Row label="Oppsett ved spillhodet" stacked>
            <Segmented
              value={layout}
              options={LAYOUT_OPTIONS}
              onChange={(v) =>
                commit((q) => {
                  const c = q.clips[clip.id];
                  if (!c.kf.layout) c.kf.layout = [[clip.in, layout]];
                  setKeyframe(c, 'layout', s, v);
                })
              }
            />
          </Row>
          <div class="switch-list">
            {switches.map(([t, v]) => (
              <button key={t} class={Math.abs(t - s) < 0.05 ? 'on' : ''} onClick={() => seek(clip.start + (t - clip.in))}>
                {formatShort(t - clip.in)} <b>{v}</b>
              </button>
            ))}
            {atSwitch && (
              <button class="danger" onClick={() => commit((q) => removeKeyframe(q.clips[clip.id], 'layout', s))}>
                Fjern bytte
              </button>
            )}
          </div>
          <Row label="Form">
            <Segmented
              value={clip.props.pipShape}
              onChange={(v) => setProp(clip, { pipShape: v })}
              options={[
                { value: 'circle', label: 'Sirkel' },
                { value: 'square', label: 'Kvadrat' },
                { value: 'rect', label: '16:9' },
              ]}
            />
          </Row>
          <Row label="Størrelse">
            <Segmented
              value={clip.props.pipSize}
              onChange={(v) => setProp(clip, { pipSize: v })}
              options={[
                { value: 'small', label: 'Liten' },
                { value: 'medium', label: 'Middels' },
                { value: 'large', label: 'Stor' },
              ]}
            />
          </Row>
          <Row label="Speilvend">
            <Toggle checked={clip.props.mirror} onChange={(v) => setProp(clip, { mirror: v })} />
          </Row>
        </Section>
      )}
      <Section title="Overlegg">
        <Row label={`Tastetrykk (${rec.keys?.length || 0})`}>
          <Toggle checked={clip.props.showKeys} onChange={(v) => setProp(clip, { showKeys: v })} />
        </Row>
        <Row label={`Forstørret peker (${rec.zooms?.length || 0})`}>
          <Toggle checked={clip.props.cursorZoom} onChange={(v) => setProp(clip, { cursorZoom: v })} />
        </Row>
        <Row label={`Fremhev klikk (${rec.clicks?.length || 0})`}>
          <Toggle checked={clip.props.showClicks} onChange={(v) => setProp(clip, { showClicks: v })} />
        </Row>
        <p class="hint">Kutt klippet (Cmd B) for å slå overlegg av og på i deler av opptaket.</p>
      </Section>
      <Section title="Lyd">
        {media?.streams?.camera?.hasAudio && <Param clip={clip} prop="micVolume" label="Mikrofon" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />}
        {media?.streams?.screen?.hasAudio && <Param clip={clip} prop="sysVolume" label="Systemlyd" min={-60} max={12} step={0.5} precision={1} unit="dB" center={0} />}
        {!media?.streams?.camera?.hasAudio && !media?.streams?.screen?.hasAudio && <p class="hint">Opptaket har ingen lyd.</p>}
        <PlainNumber clip={clip} prop="aFadeIn" label="Tone inn" min={0} max={clip.dur / 2} step={0.1} unit="s" />
        <PlainNumber clip={clip} prop="aFadeOut" label="Tone ut" min={0} max={clip.dur / 2} step={0.1} unit="s" />
      </Section>
    </>
  );
}

function formatShort(t) {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function TextTab({ clip }) {
  const pr = clip.props;
  const id = clip.id;
  return (
    <>
      <Section title="Tekst">
        <textarea
          class="text-input"
          rows={2}
          value={pr.text}
          onKeyDown={(e) => e.stopPropagation()}
          onInput={(e) => updateTransient((q) => (q.clips[id].props.text = e.currentTarget.value))}
          onFocus={beginTransient}
          onBlur={() => endTransient(true)}
        />
        <input
          class="text-input"
          placeholder="Undertittel (valgfri)"
          value={pr.subtext}
          onKeyDown={(e) => e.stopPropagation()}
          onInput={(e) => updateTransient((q) => (q.clips[id].props.subtext = e.currentTarget.value))}
          onFocus={beginTransient}
          onBlur={() => endTransient(true)}
        />
      </Section>
      <Section title="Stil">
        <Row label="Oppsett">
          <Select value={pr.style} options={TITLE_STYLES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setProp(clip, { style: v })} />
        </Row>
        <Row label="Skrift">
          <Select
            value={pr.font}
            options={[
              { value: 'sans', label: 'System' },
              { value: 'rounded', label: 'Avrundet' },
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Monospace' },
            ]}
            onChange={(v) => setProp(clip, { font: v })}
          />
        </Row>
        <Row label="Størrelse">
          <NumberField value={pr.size} min={12} max={300} unit="pt" onStart={beginTransient} onChange={(v) => updateTransient((q) => (q.clips[id].props.size = v))} onCommit={() => endTransient(true)} />
        </Row>
        <Row label="Vekt">
          <Segmented
            value={pr.weight}
            onChange={(v) => setProp(clip, { weight: v })}
            options={[
              { value: 400, label: 'Normal' },
              { value: 600, label: 'Halvfet' },
              { value: 800, label: 'Fet' },
            ]}
          />
        </Row>
        <Row label="Farge">
          <input type="color" class="color" value={pr.color} onChange={(e) => setProp(clip, { color: e.currentTarget.value })} />
        </Row>
        {pr.style === 'lower' && (
          <Row label="Aksent">
            <input type="color" class="color" value={pr.accent} onChange={(e) => setProp(clip, { accent: e.currentTarget.value })} />
          </Row>
        )}
        <Row label={pr.style === 'card' ? 'Bakgrunnsfarge' : 'Bakgrunn'}>
          {pr.style !== 'card' && <Toggle checked={pr.bg} onChange={(v) => setProp(clip, { bg: v })} />}
          {(pr.bg || pr.style === 'card') && <input type="color" class="color" value={pr.bgColor} onChange={(e) => setProp(clip, { bgColor: e.currentTarget.value })} />}
        </Row>
        <Row label="Animasjon">
          <Select
            value={pr.anim}
            options={[
              { value: 'none', label: 'Ingen' },
              { value: 'fade', label: 'Ton inn' },
              { value: 'slide', label: 'Skyv opp' },
              { value: 'pop', label: 'Sprett' },
              { value: 'type', label: 'Skrivemaskin' },
            ]}
            onChange={(v) => setProp(clip, { anim: v })}
          />
        </Row>
      </Section>
    </>
  );
}

function CaptionTab({ clip }) {
  return (
    <Section title="Undertekst">
      <textarea
        class="text-input"
        rows={3}
        value={clip.props.text}
        placeholder="Skriv tekst"
        onKeyDown={(e) => e.stopPropagation()}
        onInput={(e) => updateTransient((q) => (q.clips[clip.id].props.text = e.currentTarget.value))}
        onFocus={beginTransient}
        onBlur={() => endTransient(true)}
      />
      <p class="hint">Stil for alle undertekster velges i Undertekster-fanen til venstre.</p>
    </Section>
  );
}

function InfoTab({ clip, media }) {
  const p = project.value;
  return (
    <Section title="Info">
      <Row label="Start">
        <span class="value">{clip.start.toFixed(2)} s</span>
      </Row>
      <Row label="Varighet">
        {isElastic(clip) ? (
          <NumberField value={clip.dur} min={0.1} max={3600} step={0.1} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setClipDuration(q, clip.id, v))} onCommit={() => endTransient(true)} />
        ) : (
          <span class="value">{clip.dur.toFixed(2)} s</span>
        )}
      </Row>
      {media && (
        <>
          <Row label="Fil">
            <span class="value path" title={media.path}>
              {media.name}
            </span>
          </Row>
          {media.width > 0 && (
            <Row label="Oppløsning">
              <span class="value">
                {media.width} × {media.height}
              </span>
            </Row>
          )}
        </>
      )}
      {clip.lane === CAPTION_LANE && <p class="hint">Undertekster ligger i eget spor øverst.</p>}
      <Row label="Spor">
        <span class="value">{clip.lane === 0 ? 'Hovedspor' : clip.lane === CAPTION_LANE ? 'Undertekster' : clip.lane > 0 ? `Spor ${clip.lane}` : `Lyd ${-clip.lane}`}</span>
      </Row>
    </Section>
  );
}

function TransitionInspector({ clip }) {
  const t = clip.transition;
  return (
    <div class="inspector panel">
      <div class="insp-head">
        <span class="type-dot t-transition" />
        <b>Overgang</b>
      </div>
      <div class="insp-body">
        <Section title="Overgang">
          <Row label="Type">
            <Select value={t.type} options={TRANSITIONS.map((x) => ({ value: x.id, label: x.label }))} onChange={(v) => commit((q) => setTransition(q, clip.id, v, t.dur))} />
          </Row>
          <Row label="Varighet">
            <NumberField value={t.dur} min={0.1} max={4} step={0.05} precision={2} unit="s" onStart={beginTransient} onChange={(v) => updateTransient((q) => setTransition(q, clip.id, t.type, v))} onCommit={() => endTransient(true)} />
          </Row>
          <p class="hint">Slett med Delete. Overgangen bruker bilder før og etter kuttet når de finnes.</p>
        </Section>
      </div>
    </div>
  );
}

const FORMATS = [
  { value: 'auto', label: 'Som første video' },
  { value: '3840x2160', label: '4K (3840 × 2160)' },
  { value: '2560x1440', label: '1440p (2560 × 1440)' },
  { value: '1920x1080', label: '1080p (1920 × 1080)' },
  { value: '1280x720', label: '720p (1280 × 720)' },
  { value: '1080x1920', label: 'Vertikal (1080 × 1920)' },
  { value: '1080x1080', label: 'Kvadrat (1080 × 1080)' },
];

function ProjectInspector() {
  const p = project.value;
  const current = `${p.width}x${p.height}`;
  const fmt = FORMATS.some((f) => f.value === current) ? current : 'custom';
  return (
    <div class="inspector panel">
      <div class="insp-head">
        <b>Prosjekt</b>
      </div>
      <div class="insp-body">
        <Section title="Prosjekt" collapsible={false}>
          <Row label="Navn" stacked>
            <input
              class="text-input"
              value={p.name}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onChange={(e) => {
                const name = e.currentTarget.value.trim();
                if (name) commit((q) => (q.name = name));
              }}
            />
          </Row>
          <Row label="Format" stacked>
            <Select
              value={fmt}
              options={[...FORMATS.slice(1), ...(fmt === 'custom' ? [{ value: 'custom', label: `${p.width} × ${p.height}` }] : [])]}
              onChange={(v) => {
                const [w, h] = v.split('x').map(Number);
                commit((q) => {
                  q.width = w;
                  q.height = h;
                  q.autoFormat = false;
                });
              }}
            />
          </Row>
          <Row label="Bilder per sekund">
            <Select
              value={String(p.fps)}
              options={[24, 25, 30, 50, 60].map((f) => ({ value: String(f), label: String(f) }))}
              onChange={(v) => commit((q) => (q.fps = Number(v)))}
            />
          </Row>
          <Row label="Varighet">
            <span class="value">{p.duration.toFixed(1)} s</span>
          </Row>
          <Row label="Klipp">
            <span class="value">{Object.keys(p.clips).length}</span>
          </Row>
        </Section>
        <p class="hint pad">Velg et klipp på tidslinjen for å se egenskapene. Formatet settes automatisk fra første video du legger til.</p>
      </div>
    </div>
  );
}
