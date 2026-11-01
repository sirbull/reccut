import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Button, NumberField, Row, Select } from '../ui.jsx';
import {
  MAX_GRADIENT_POINTS, clampGradient, gradientParams, gradientColorAt, gradientStopColor, gradientHex,
} from '../../shared/gradient.js';
import { renderGradient } from '../../shared/gradientRender.js';

export function GradientEditor({ params, aspect = 16 / 9, onChange, onStart, onInput, onCommit, onCancel }) {
  const p = gradientParams(params), free = p.mode === 'freeform';
  const [selected, setSelected] = useState(p.stops[0].id);
  const preview = useRef(null), drag = useRef(null);
  const items = free ? p.points : p.stops, field = free ? 'points' : 'stops';
  const active = items.find((s) => s.id === selected) || items[0];
  // The preview and its handles retain the source aspect ratio.
  const width = 360, height = width / aspect;
  useLayoutEffect(() => {
    const cv = preview.current;
    cv.width = width;
    cv.height = Math.max(1, Math.round(height));
    cv.getContext('2d').drawImage(renderGradient(p, cv.width, cv.height), 0, 0);
  }, [params, aspect]);
  useEffect(() => () => {
    if (drag.current) onCommit();
  }, []);
  const replace = (id, values, live = false) => (live ? onInput : onChange)({
    [field]: items.map((s) => s.id === id ? { ...s, ...values } : s),
  });
  const add = (x, y) => {
    if (items.length >= MAX_GRADIENT_POINTS) return;
    const id = crypto.randomUUID();
    if (free) {
      const color = gradientHex(gradientColorAt(p, x, y, aspect));
      onChange({ points: [...p.points, { id, x, y, radius: 0.35, color }] });
    } else {
      const color = gradientHex(gradientStopColor(p.stops, x));
      onChange({ stops: [...p.stops, { id, position: x, color }] });
    }
    setSelected(id);
  };
  const coords = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: clampGradient((e.clientX - box.left) / box.width), y: clampGradient((e.clientY - box.top) / box.height) };
  };
  const pointerDown = (e) => {
    const handle = e.target.closest('[data-gradient-handle]');
    if (!handle || e.button !== 0 || drag.current) return;
    e.preventDefault();
    const kind = handle.dataset.gradientHandle, id = handle.dataset.id;
    if (id) setSelected(id);
    drag.current = { kind, id, p, pointerId: e.pointerId, clientX: e.clientX, box: e.currentTarget.getBoundingClientRect() };
    onStart();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const xy = coords(e);
    if (d.kind === 'point') onInput({ points: d.p.points.map((s) => s.id === d.id ? { ...s, ...xy } : s) });
    else if (d.kind === 'stop') onInput({ stops: d.p.stops.map((s) => s.id === d.id ? { ...s, position: xy.x } : s) });
    else if (d.kind === 'spread') {
      const delta = (e.clientX - d.clientX) / Math.min(d.box.width, d.box.height);
      onInput({ points: d.p.points.map((s) => s.id === d.id ? { ...s, radius: clampGradient(s.radius + delta, 0.01, 2) } : s) });
    } else if (d.kind === 'radius') {
      const delta = (e.clientX - d.clientX) / Math.min(d.box.width, d.box.height);
      onInput({ radius: clampGradient(d.p.radius + delta, 0.01, 2) });
    } else onInput({ [d.kind]: xy });
  };
  const finish = (e, cancel = false) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (cancel) onCancel();
    else onCommit();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const pointerEvents = {
    onPointerDown: pointerDown, onPointerMove: pointerMove,
    onPointerUp: finish, onPointerCancel: (e) => finish(e, true), onLostPointerCapture: finish,
  };
  const handleKey = (e, kind, item) => {
    e.stopPropagation();
    const delta = e.shiftKey ? 0.05 : 0.01;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const axis = ['ArrowLeft', 'ArrowRight'].includes(e.key) ? 'x' : 'y';
    const step = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -delta : delta;
    if (kind === 'point') replace(item.id, { [axis]: clampGradient(item[axis] + step) });
    else if (kind === 'stop') replace(item.id, { position: clampGradient(item.position + step) });
    else if (kind === 'radius') onChange({ radius: clampGradient(p.radius + step, 0.01, 2) });
    else if (kind === 'spread') replace(item.id, { radius: clampGradient(item.radius + step, 0.01, 2) });
    else onChange({ [kind]: { ...p[kind], [axis]: clampGradient(p[kind][axis] + step) } });
  };
  const handle = (kind, x, y, label, item, extra = '') => (
    <button type="button" class={`gradient-handle ${extra}${item?.id === active.id ? ' selected' : ''}`}
      data-gradient-handle={kind} data-id={item?.id}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, '--point-color': item?.color || '#fff' }}
      title={label} aria-label={label} aria-pressed={item ? item.id === active.id : undefined}
      onClick={() => item && setSelected(item.id)} onKeyDown={(e) => handleKey(e, kind, item)} />
  );
  const numeric = (label, value, change, min = 0, max = 100) => (
    <Row label={label}><NumberField value={value * 100} min={min} max={max} step={1} unit="%"
      onStart={onStart} onChange={(v) => change(v / 100)} onCommit={onCommit} /></Row>
  );
  const short = Math.min(width, height);
  return (
    <div class="gradient-editor" data-gradient-mode={p.mode}>
      <Row label="Type"><Select value={p.mode} options={[
        { value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'freeform', label: 'Freeform' },
      ]} onChange={(mode) => onChange({ mode })} /></Row>
      <div class="gradient-preview" style={{ aspectRatio: String(aspect) }} {...pointerEvents}
        onDblClick={(e) => { if (free && !e.target.closest('button')) { const xy = coords(e); add(xy.x, xy.y); } }}>
        <canvas ref={preview} aria-label="Gradient preview" />
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {p.mode === 'linear' && <line x1={p.start.x * width} y1={p.start.y * height} x2={p.end.x * width} y2={p.end.y * height} />}
          {p.mode === 'radial' && <circle cx={p.center.x * width} cy={p.center.y * height} r={p.radius * short} />}
          {free && <circle cx={active.x * width} cy={active.y * height} r={active.radius * short} />}
        </svg>
        {p.mode === 'linear' && <>
          {handle('start', p.start.x, p.start.y, 'Gradient start')}
          {handle('end', p.end.x, p.end.y, 'Gradient end')}
        </>}
        {p.mode === 'radial' && <>
          {handle('center', p.center.x, p.center.y, 'Gradient center')}
          {handle('radius', clampGradient(p.center.x + p.radius * short / width, 0.03, 0.97), p.center.y, 'Gradient radius', null, 'size')}
        </>}
        {free && <>
          {p.points.map((s, i) => handle('point', s.x, s.y, `Color point ${i + 1}`, s))}
          {handle('spread', clampGradient(active.x + active.radius * short / width, 0.03, 0.97), active.y, 'Point spread', active, 'size')}
        </>}
      </div>
      {!free && <div class="gradient-stop-track" {...pointerEvents}
        style={{ background: `linear-gradient(to right, ${p.stops.map((s) => `${s.color} ${s.position * 100}%`).join(', ')})` }}
        onDblClick={(e) => { if (!e.target.closest('button')) add(coords(e).x); }}>
        {p.stops.map((s, i) => handle('stop', s.position, 0.5, `Color stop ${i + 1}`, s))}
      </div>}
      <p class="hint">{free ? 'Double-click to add a point. Drag points to move; drag the square to adjust spread.' : 'Drag the handles to shape the gradient. Double-click the color bar to add a stop.'}</p>
      <Row label={free ? 'Point' : 'Stop'}><Select value={active.id}
        options={items.map((s, i) => ({ value: s.id, label: `${i + 1} · ${s.color.toUpperCase()}` }))} onChange={setSelected} /></Row>
      <Row label="Color"><input type="color" class="color" value={active.color} aria-label="Selected gradient color"
        onInput={(e) => replace(active.id, { color: e.currentTarget.value }, true)}
        onChangeCapture={onCommit} onBlur={onCommit} onKeyDown={(e) => e.stopPropagation()} /><span class="gradient-hex">{active.color.toUpperCase()}</span></Row>
      {free ? <>
        {numeric('Position X', active.x, (x) => replace(active.id, { x }, true))}
        {numeric('Position Y', active.y, (y) => replace(active.id, { y }, true))}
        {numeric('Point spread', active.radius, (radius) => replace(active.id, { radius }, true), 1, 200)}
      </> : numeric('Stop position', active.position, (position) => replace(active.id, { position }, true))}
      {p.mode === 'radial' && <>
        {numeric('Center X', p.center.x, (x) => onInput({ center: { ...p.center, x } }))}
        {numeric('Center Y', p.center.y, (y) => onInput({ center: { ...p.center, y } }))}
        {numeric('Radius', p.radius, (radius) => onInput({ radius }), 1, 200)}
      </>}
      <div class="gradient-actions">
        <Button class="small" disabled={items.length >= MAX_GRADIENT_POINTS} onClick={() => {
          if (free) add(0.5, 0.5);
          else {
            const positions = [0, ...p.stops.map((s) => s.position), 1];
            let at = 0.5, gap = -1;
            for (let i = 1; i < positions.length; i++) if (positions[i] - positions[i - 1] > gap) {
              gap = positions[i] - positions[i - 1]; at = (positions[i] + positions[i - 1]) / 2;
            }
            add(at);
          }
        }}>Add {free ? 'point' : 'stop'}</Button>
        <Button class="small" disabled={items.length <= 2} onClick={() => onChange({ [field]: items.filter((s) => s.id !== active.id) })}>
          Remove {free ? 'point' : 'stop'}
        </Button>
      </div>
    </div>
  );
}
