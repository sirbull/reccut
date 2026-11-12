// Lydeffekter som en kjede: legg til effekter og maler, slå av og på, flytt, juster og fjern.
// Brukes på klipp i Properties og på en person i Voice Over Studio.
// list: effektene. onSet(nyListe): lagre endringen. onLive(id, patch): mens det dras.
// onStart/onCommit: rundt dra, så Properties kan lage ett angresteg.
// base: typene i standardkjeden. Effekter utover dem får en annen bakgrunn, så de synes som lagt til.
import { useEffect, useRef, useState } from 'preact/hooks';
import { AudioFxIcon } from './audioIcons.jsx';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-preact';
import { AUDIO_EFFECTS, AUDIO_PRESETS, EQ_BANDS, EQ_PRESETS, biquadResponse, eqCoefs, makeEffect, presetEffects } from '../../shared/audiofx.js';
import { IconButton, NumberField, Row, Segmented, Select, Slider, Toggle } from '../ui.jsx';
import { RemoveEffectButton } from './RemoveEffectButton.jsx';

const noop = () => {};

export function AudioFxChain({ list = [], onSet, onLive, onStart = noop, onCommit = noop, hint, showAdd = true, base }) {
  // Lukket som standard, så panelet ikke blir så langt. Ikke lagret: åpnes på nytt ved behov.
  const [open, setOpen] = useState(() => new Set());
  const toggleOpen = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // ponytail: de første effektene av hver type i base regnes som standard, resten som lagt til. Virker også på lagrede prosjekter uten merke.
  const left = [...(base || [])];
  const added = new Set(base ? list.filter((e) => { const i = left.indexOf(e.type); if (i < 0) return true; left.splice(i, 1); return false; }).map((e) => e.id) : []);
  const patch = (id, fn) => onSet(list.map((e) => (e.id === id ? fn({ ...e, p: { ...e.p } }) : e)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = [...list];
    [a[i], a[j]] = [a[j], a[i]];
    onSet(a);
  };
  const addOptions = [{ value: '', label: 'Add Effect…' }, ...Object.entries(AUDIO_EFFECTS).map(([id, e]) => ({ value: id, label: `${e.category}: ${e.label}` }))];
  const presetOptions = [{ value: '', label: 'Add Template…' }, ...AUDIO_PRESETS.map((p) => ({ value: p.id, label: `${p.category === 'Repair' ? 'Fix' : p.category}: ${p.label}` }))];
  return (
    <>
      {showAdd && <div class="afx-add">
        <Select value="" options={addOptions} onChange={(v) => { if (!v) return; const e = makeEffect(v); setOpen((s) => new Set(s).add(e.id)); onSet([...list, e]); }} />
        <Select value="" options={presetOptions} onChange={(v) => v && onSet([...list, ...presetEffects(v)])} />
      </div>}
      {!list.length && hint && <p class="hint">{hint}</p>}
      {list.map((e, i) => {
        const def = AUDIO_EFFECTS[e.type];
        if (!def) return null;
        const isOpen = open.has(e.id);
        return (
          <div key={e.id} class={`afx-item${e.on === false ? ' off' : ''}${added.has(e.id) ? ' added' : ''}${isOpen ? '' : ' collapsed'}`} data-afx-item={e.type}>
            <div class="afx-head">
              <IconButton icon={isOpen ? ChevronDown : ChevronRight} size={12} title={isOpen ? 'Collapse' : 'Expand'} onClick={() => toggleOpen(e.id)} />
              <Toggle checked={e.on !== false} onChange={(v) => patch(e.id, (x) => ({ ...x, on: v }))} />
              <b class="afx-name" title={def.desc} onClick={() => toggleOpen(e.id)}>
                <AudioFxIcon kind="afx" id={e.type} size={13} /> {def.label}
              </b>
              <IconButton icon={ArrowUp} size={12} title="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} size={12} title="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
              <RemoveEffectButton label={def.label} adjusted={def.params.some((p) => (e.p[p.id] ?? p.def) !== p.def)} onRemove={() => onSet(list.filter((x) => x.id !== e.id))} />
            </div>
            {isOpen && <>
            {e.type === 'eq' ? (
              <EqEditor effect={e} onStart={onStart} onCommit={onCommit} onLive={(q) => onLive(e.id, q)} onSet={(q) => patch(e.id, (x) => ({ ...x, p: { ...x.p, ...q } }))} />
            ) : (
              def.params.map((prm) => (
                <FxParam key={prm.id} prm={prm} value={e.p[prm.id] ?? prm.def} onStart={onStart} onCommit={onCommit} onLive={(v) => onLive(e.id, { [prm.id]: v })} onSet={(v) => patch(e.id, (x) => ({ ...x, p: { ...x.p, [prm.id]: v } }))} />
              ))
            )}
            </>}
          </div>
        );
      })}
    </>
  );
}

// Én parameter i en lydeffekt: glidebryter (logaritmisk for frekvenser), valg eller av og på.
export function FxParam({ prm, value, onLive, onSet, onStart = noop, onCommit = noop }) {
  if (prm.toggle)
    return (
      <Row label={prm.label}>
        <Toggle checked={Boolean(value)} onChange={(v) => onSet(v ? 1 : 0)} />
      </Row>
    );
  if (prm.choices)
    return (
      <Row label={prm.label}>
        <Segmented value={value} onChange={onSet} options={prm.choices.map((c, i) => ({ value: c, label: prm.labels?.[i] ?? `${c} ${prm.unit}`.trim() }))} />
      </Row>
    );
  const scale = prm.scale || 1;
  const toSlider = (v) => (prm.log ? Math.log(v / prm.min) / Math.log(prm.max / prm.min) : v);
  const fromSlider = (t) => (prm.log ? Math.round(prm.min * Math.pow(prm.max / prm.min, t)) : t);
  return (
    <div class="param">
      <span class="param-label" title={prm.label}>
        {prm.label}
      </span>
      <Slider value={toSlider(value)} min={prm.log ? 0 : prm.min} max={prm.log ? 1 : prm.max} step={prm.log ? 0.001 : prm.step} center={prm.center} onStart={onStart} onInput={(t) => onLive(fromSlider(t))} onCommit={() => onCommit(true)} />
      <NumberField value={value * scale} min={prm.min * scale} max={prm.max * scale} step={prm.step * scale} precision={scale !== 1 || prm.step >= 1 ? 0 : prm.step >= 0.1 ? 1 : 2} unit={prm.unit} onStart={onStart} onChange={(v) => onLive(v / scale)} onCommit={() => onCommit(true)} />
      <span />
      <span />
    </div>
  );
}

// Grafisk equalizer: ti bånd med kurve over, og ferdige innstillinger.
export function EqEditor({ effect, onLive, onSet, onStart = noop, onCommit = noop }) {
  const ref = useRef(null);
  const g = EQ_BANDS.map((_, i) => effect.p[`b${i}`] || 0);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    const c = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = H / 2 - (db / 18) * (H / 2);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    const coefs = eqCoefs(effect.p, 48000);
    c.strokeStyle = '#f7c948';
    c.lineWidth = 2 * dpr;
    c.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const f = 20 * Math.pow(1000, x / W);
      const db = coefs.reduce((s, k) => s + biquadResponse(k, f, 48000), 0);
      const y = H / 2 - (Math.max(-18, Math.min(18, db)) / 18) * (H / 2);
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }, [JSON.stringify(effect.p)]);
  return (
    <div class="eq">
      <Row label="Preset">
        <Select value={EQ_PRESETS.find((pr) => pr.g.every((v, i) => v === g[i]))?.id || ''} options={[{ value: '', label: 'Custom' }, ...EQ_PRESETS.map((pr) => ({ value: pr.id, label: pr.label }))]} onChange={(v) => v && onSet(Object.fromEntries(EQ_PRESETS.find((pr) => pr.id === v).g.map((x, i) => [`b${i}`, x])))} />
      </Row>
      <canvas ref={ref} class="eq-curve" />
      <div class="eq-bands">
        {EQ_BANDS.map((f, i) => (
          <label key={f} title={`${f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}: ${g[i] > 0 ? '+' : ''}${g[i]} dB. Double click to reset.`}>
            <input
              type="range"
              min={-18}
              max={18}
              step={0.5}
              value={g[i]}
              onPointerDown={onStart}
              onInput={(ev) => onLive({ [`b${i}`]: Number(ev.currentTarget.value) })}
              onChange={() => onCommit(true)}
              onDblClick={() => onSet({ [`b${i}`]: 0 })}
            />
            <span>{f >= 1000 ? `${f / 1000}k` : f}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
