import { useEffect, useRef, useState } from 'preact/hooks';
import { hitTest, layerBounds, layerPoint, selectionBounds, resizeLayer, rotatePoint, snapMove, snapRotation, newLayer } from '../../shared/design.js';
import { drawDesign } from '../../shared/designRender.js';
import { designFont, layoutDesignText } from '../../shared/designText.js';
import { currentDesign, selection, tool, zoom, viewScale, pan, setZoom, addText, beginDesignTransient, updateDesignTransient, endDesignTransient } from './store.js';
import { imageVersion, getImage, loadDesignImages, requestPlace } from './assets.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const POSITIONS = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
function handlesFor(box, scale) {
  const positions = POSITIONS.map(([x, y]) => layerPoint(box, x * box.w, y * box.h));
  return [...positions.map((p, i) => ({ ...p, handle: HANDLES[i] })), { ...layerPoint(box, box.w / 2, -28 / scale), handle: 'rotate' }];
}
export function DesignCanvas({ active }) {
  const d = currentDesign.value, selected = selection.value, z = zoom.value, p = pan.value, version = imageVersion.value;
  const host = useRef(null), canvas = useRef(null), drag = useRef(null), textRef = useRef(null), space = useRef(false), latest = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 }), [guides, setGuides] = useState([]), [marquee, setMarquee] = useState(null), [editing, setEditing] = useState(null);
  const scale = d ? (z === 'fit' ? Math.max(0.001, Math.min((size.w - 100) / d.width, (size.h - 100) / d.height)) : z) : 1;
  const offset = { x: (size.w - (d?.width || 0) * scale) / 2 + p.x, y: (size.h - (d?.height || 0) * scale) / 2 + p.y };
  latest.current = { scale, offset, d, z };
  useEffect(() => { if (active) viewScale.value = scale; }, [active, scale]);
  const picked = d?.layers.filter((l) => selected.includes(l.id) && !l.locked && !l.hidden) || [];
  const box = picked.length === 1 ? picked[0] : picked.length ? { ...selectionBounds(picked), rotation: 0 } : null;
  const point = (e) => {
    const rect = host.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left - offset.x) / scale, y: (e.clientY - rect.top - offset.y) / scale };
  };
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(host.current);
    const wheel = (e) => {
      if (!active || !latest.current.d) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const v = latest.current;
        const next = Math.min(8, Math.max(0.02, v.scale * Math.exp(-e.deltaY * 0.01)));
        const rect = host.current.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const wx = (sx - v.offset.x) / v.scale, wy = (sy - v.offset.y) / v.scale;
        setZoom(next);
        pan.value = { x: sx - wx * next - (rect.width - v.d.width * next) / 2, y: sy - wy * next - (rect.height - v.d.height * next) / 2 };
      } else pan.value = { x: pan.value.x - e.deltaX, y: pan.value.y - e.deltaY };
    };
    host.current.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); host.current?.removeEventListener('wheel', wheel); };
  }, [active]);
  useEffect(() => {
    if (!active) { endDesignTransient(); drag.current = null; setEditing(null); space.current = false; }
    const down = (e) => { if (active && e.code === 'Space' && !e.target.closest('input,textarea,[contenteditable="true"],select') && !document.querySelector('.modal-backdrop')) { space.current = true; e.preventDefault(); } };
    const up = (e) => { if (e.code === 'Space') space.current = false; };
    const blur = () => { space.current = false; if (drag.current) { endDesignTransient(); drag.current = null; setGuides([]); setMarquee(null); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [active]);
  useEffect(() => {
    setEditing(null); drag.current = null; setGuides([]); setMarquee(null);
    return () => endDesignTransient();
  }, [d?.id]);
  useEffect(() => { if (active && d) loadDesignImages(d); }, [active, d]);
  useEffect(() => {
    if (!active || !d || !canvas.current) return;
    const frame = requestAnimationFrame(() => {
      const cv = canvas.current, ratio = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(size.w * ratio)); cv.height = Math.max(1, Math.round(size.h * ratio));
      const ctx = cv.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size.w, size.h);
      ctx.save(); ctx.translate(offset.x, offset.y);
      drawDesign(ctx, d, getImage, { scale, hideLayers: editing ? new Set([editing]) : null });
      ctx.scale(scale, scale);
      ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 1 / scale;
      if (box && !editing) {
        const corners = [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]].map(([x, y]) => layerPoint(box, x, y));
        ctx.beginPath(); corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath(); ctx.stroke();
        const handles = handlesFor(box, scale), top = handles[1], rot = handles[8];
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
        for (const h of handles) { ctx.fillStyle = '#ffffff'; ctx.fillRect(h.x - 4 / scale, h.y - 4 / scale, 8 / scale, 8 / scale); ctx.strokeRect(h.x - 4 / scale, h.y - 4 / scale, 8 / scale, 8 / scale); }
      }
      ctx.strokeStyle = '#ff45d3'; ctx.setLineDash([4 / scale, 4 / scale]);
      for (const g of guides) { ctx.beginPath(); if (g.axis === 'x') { ctx.moveTo(g.value, 0); ctx.lineTo(g.value, d.height); } else { ctx.moveTo(0, g.value); ctx.lineTo(d.width, g.value); } ctx.stroke(); }
      if (marquee) { ctx.fillStyle = '#0a84ff22'; ctx.strokeStyle = '#0a84ff'; ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h); ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h); }
      ctx.restore();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, d, selected, z, p, size, version, guides, marquee, editing]);
  useEffect(() => { if (editing) { textRef.current?.focus(); textRef.current?.select(); } }, [editing]);
  function startText(id) {
    const layer = d.layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    beginDesignTransient(); selection.value = [id]; setEditing(id);
  }
  function finishText() {
    if (!editing) return;
    const layer = currentDesign.value?.layers.find((l) => l.id === editing);
    if (layer && !layer.text.trim()) updateDesignTransient((p) => { p.designs[d.id].layers = p.designs[d.id].layers.filter((l) => l.id !== editing); });
    endDesignTransient(); setEditing(null);
  }
  function down(e) {
    if (!d || (e.button !== 0 && e.button !== 1) || e.target.tagName === 'TEXTAREA') return;
    if (editing) { finishText(); return; }
    e.preventDefault(); host.current.focus(); host.current.setPointerCapture(e.pointerId);
    const pt = point(e);
    if (space.current || tool.value === 'hand' || e.button === 1) {
      drag.current = { type: 'pan', clientX: e.clientX, clientY: e.clientY, pan: pan.value }; return;
    }
    const handle = box && handlesFor(box, scale).find((h) => Math.hypot(pt.x - h.x, pt.y - h.y) <= 8 / scale);
    if (handle) {
      beginDesignTransient(); drag.current = { type: handle.handle, start: pt, box: { ...box }, layers: picked, angle: Math.atan2(pt.y - box.y - box.h / 2, pt.x - box.x - box.w / 2) }; return;
    }
    if (tool.value === 'text') { const l = addText(pt.x, pt.y); if (l) { beginDesignTransient(); setEditing(l.id); } return; }
    if (tool.value === 'shape') {
      const l = newLayer('shape', { x: pt.x, y: pt.y, w: 1, h: 1 });
      beginDesignTransient(); drag.current = { type: 'shape', start: pt, layer: l }; selection.value = [l.id]; return;
    }
    const hit = hitTest(d, pt.x, pt.y);
    if (hit) {
      const ids = e.shiftKey ? selected.includes(hit.id) ? selected.filter((id) => id !== hit.id) : [...selected, hit.id] : selected.includes(hit.id) ? selected : [hit.id];
      selection.value = ids;
      const layers = d.layers.filter((l) => ids.includes(l.id) && !l.locked);
      if (layers.length) { beginDesignTransient(); drag.current = { type: 'move', start: pt, layers, box: selectionBounds(layers) }; }
    } else { if (!e.shiftKey) selection.value = []; drag.current = { type: 'marquee', start: pt, previous: e.shiftKey ? selected : [] }; }
  }
  function move(e) {
    const state = drag.current;
    if (!state || !d) return;
    if (state.type === 'pan') { pan.value = { x: state.pan.x + e.clientX - state.clientX, y: state.pan.y + e.clientY - state.clientY }; return; }
    const pt = point(e); let dx = pt.x - state.start.x, dy = pt.y - state.start.y;
    if (state.type === 'marquee') {
      const b = { x: Math.min(pt.x, state.start.x), y: Math.min(pt.y, state.start.y), w: Math.abs(dx), h: Math.abs(dy) };
      setMarquee(b);
      selection.value = [...new Set([...state.previous, ...d.layers.filter((l) => { const r = layerBounds(l); return !l.locked && !l.hidden && r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y; }).map((l) => l.id)])]; return;
    }
    if (state.type === 'shape') {
      if (e.shiftKey) { const side = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * side; dy = Math.sign(dy || 1) * side; }
      const l = { ...state.layer, x: state.start.x + Math.min(0, dx), y: state.start.y + Math.min(0, dy), w: Math.max(1, Math.abs(dx)), h: Math.max(1, Math.abs(dy)) };
      updateDesignTransient((p) => { p.designs[d.id].layers.push(l); }); return;
    }
    let layers;
    if (state.type === 'move') {
      if (!e.metaKey && !e.ctrlKey) {
        const others = d.layers.filter((l) => !state.layers.some((s) => s.id === l.id) && !l.hidden).map(layerBounds);
        const candidates = { x: [0, d.width / 2, d.width], y: [0, d.height / 2, d.height] };
        for (const b of others) { candidates.x.push(b.x, b.x + b.w / 2, b.x + b.w); candidates.y.push(b.y, b.y + b.h / 2, b.y + b.h); }
        const snapped = snapMove(state.box, dx, dy, candidates, 6 / scale); dx = snapped.dx; dy = snapped.dy; setGuides(snapped.guides);
      } else setGuides([]);
      layers = state.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
    } else if (state.type === 'rotate') {
      const cx = state.box.x + state.box.w / 2, cy = state.box.y + state.box.h / 2;
      const angle = (Math.atan2(pt.y - cy, pt.x - cx) - state.angle) * 180 / Math.PI;
      const delta = snapRotation(state.box.rotation + angle, e.shiftKey) - state.box.rotation;
      layers = state.layers.map((l) => { const c = rotatePoint(l.x + l.w / 2 - cx, l.y + l.h / 2 - cy, delta); return { ...l, rotation: l.rotation + delta, x: cx + c.x - l.w / 2, y: cy + c.y - l.h / 2 }; });
    } else {
      const keepAspect = state.layers.length === 1 && state.layers[0].type === 'image' ? !e.shiftKey : e.shiftKey;
      const b = resizeLayer(state.box, state.type, dx, dy, { keepAspect, fromCenter: e.altKey });
      if (state.layers.length === 1) layers = [b];
      else layers = state.layers.map((l) => ({ ...l, x: b.x + (l.x - state.box.x) * b.w / state.box.w, y: b.y + (l.y - state.box.y) * b.h / state.box.h, w: l.w * b.w / state.box.w, h: l.h * b.h / state.box.h }));
    }
    updateDesignTransient((p) => {
      const replacements = new Map(layers.map((l) => [l.id, l]));
      p.designs[d.id].layers = p.designs[d.id].layers.map((l) => replacements.get(l.id) || l);
    });
  }
  function up(e, keep = true) {
    if (!drag.current) return;
    const state = drag.current;
    drag.current = null; setGuides([]); setMarquee(null);
    if (state.type !== 'pan' && state.type !== 'marquee') endDesignTransient(keep);
    if (state.type === 'shape') tool.value = 'select';
    if (host.current.hasPointerCapture(e.pointerId)) host.current.releasePointerCapture(e.pointerId);
  }
  const text = d?.layers.find((l) => l.id === editing);
  let textLayout;
  if (text) { const ctx = canvas.current?.getContext('2d'); if (ctx) textLayout = layoutDesignText(text, (t, font) => { ctx.font = font; return ctx.measureText(t).width; }); }
  return (
    <div class={`dz-stage dz-tool-${tool.value}`} ref={host} tabIndex={0} aria-label="Design canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(e) => up(e, false)} onLostPointerCapture={up}
      onKeyDown={(e) => { if (e.key === 'Escape' && drag.current) { e.stopPropagation(); up(e, false); } }}
      onDblClick={(e) => { const hit = d && hitTest(d, point(e).x, point(e).y); if (hit?.type === 'text') startText(hit.id); }}
      onDragOver={(e) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); e.stopPropagation(); } }}
      onDrop={(e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); requestPlace(droppedPaths(e.dataTransfer, window.api.pathForFile), point(e)); }}>
      {d && <div class="dz-checker" style={{ left: offset.x, top: offset.y, width: d.width * scale, height: d.height * scale }} />}
      <canvas class="dz-canvas" ref={canvas} style={{ width: size.w, height: size.h }} />
      {text && <textarea ref={textRef} class="dz-text-edit" value={text.text} spellcheck={false}
        style={{ left: offset.x + text.x * scale, top: offset.y + text.y * scale, width: text.w, height: text.h, transformOrigin: '0 0', transform: `scale(${scale}) translate(${text.w / 2}px, ${text.h / 2}px) rotate(${text.rotation}deg) scale(${text.flipX ? -1 : 1}, ${text.flipY ? -1 : 1}) translate(${-text.w / 2}px, ${-text.h / 2}px)`, font: designFont(text, textLayout?.size), lineHeight: text.lineHeight, textAlign: text.align, color: text.fill?.color || '#ffffff', textTransform: text.uppercase ? 'uppercase' : 'none', paddingTop: text.valign === 'top' ? 0 : Math.max(0, (text.h - (textLayout?.height || 0)) / (text.valign === 'middle' ? 2 : 1)) }}
        onPointerDown={(e) => e.stopPropagation()} onInput={(e) => { const value = e.currentTarget.value; updateDesignTransient((p) => { const l = p.designs[d.id]?.layers.find((l) => l.id === editing); if (l) l.text = value; }); }} onBlur={finishText}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finishText(); host.current.focus(); } }} />}
    </div>
  );
}
