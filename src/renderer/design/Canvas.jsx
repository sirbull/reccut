import {brandLayer} from '../../shared/designBrand.js';
import {prefs} from '../prefs.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { hitTest, layerBounds, layerPoint, selectionBounds, resizeLayer, rotatePoint, snapMove, snapRotation, newLayer, groupSelectionIds, rotateDesignLayers, scaleDesignLayers, designSafeZones } from '../../shared/design.js';
import { libraryDropTarget } from '../../shared/designLibrary.js';
import { canvasCrop,showSafeZones } from './tools.js';
import { drawDesign, imageFilter } from '../../shared/designRender.js';
import { replaceStyledText } from '../../shared/designRichText.js';
import { rememberTextSelection } from './textSelection.js';
import { designFont, layoutDesignText } from '../../shared/designText.js';
import { currentDesign, selection, selectLayer, tool, shapeType, zoom, viewScale, pan, setZoom, addText, beginDesignTransient, updateDesignTransient, endDesignTransient } from './store.js';
import { imageVersion, loadDesignImages, requestPlace } from './assets.js';
import { fontAvailable, fontVersion } from './fonts.js';
import { refineSession, brushSettings, paintRefine, saveRefineStroke, stopRefine, startRefine, navigateRefineHistory } from './refine.js';
import { shapePath } from '../../shared/shapes.js';
import { maskEditing } from './masks.js';
import { cropSession, startCrop, finishCrop } from './crop.js';
import { cropViewport, moveCropImage, resizeCrop } from '../../shared/designCrop.js';
import { toast } from '../ui.jsx';
import { droppedPaths, hasFiles } from '../fileDrop.js';
import { libraryPreview, libraryImage, clearLibraryPreview, isLibraryDrag, dropLibraryItem } from './library.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const POSITIONS = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
function handlesFor(box, scale) {
  const positions = POSITIONS.map(([x, y]) => layerPoint(box, x * box.w, y * box.h));
  return [...positions.map((p, i) => ({ ...p, handle: HANDLES[i] })), { ...layerPoint(box, box.w / 2, -28 / scale), handle: 'rotate' }];
}
export function DesignCanvas({ active }) {
  const crop = cropSession.value, refine = refineSession.value, maskId = maskEditing.value, canvasDraft=canvasCrop.value, safe=showSafeZones.value;
  const [brushHover,setBrushHover] = useState(null);
  const host = useRef(null), canvas = useRef(null), drag = useRef(null), textRef = useRef(null), space = useRef(false), latest = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 }), [guides, setGuides] = useState([]), [marquee, setMarquee] = useState(null), [editing, setEditing] = useState(null);
  const base=currentDesign.value, preview=!editing&&!crop&&!refine&&!canvasDraft?libraryPreview.value:null;
  const d=preview||base,selected=selection.value,z=zoom.value,p=pan.value,version=`${imageVersion.value}:${fontVersion.value}`;
  const scale = d ? (preview || z === 'fit' ? Math.max(0.001, Math.min((size.w - 100) / d.width, (size.h - 100) / d.height)) : z) : 1;
  const offset = { x: (size.w - (d?.width || 0) * scale) / 2 + p.x, y: (size.h - (d?.height || 0) * scale) / 2 + p.y };
  latest.current = { scale, offset, d, z };
  useEffect(() => { if (active) viewScale.value = scale; }, [active, scale]);
  useEffect(()=>{if(libraryPreview.value&&(editing||crop||refine||canvasDraft))clearLibraryPreview();},[libraryPreview.value,editing,crop,refine,canvasDraft]);
  const picked = !preview&&d?.layers.filter((l) => selected.includes(l.id) && !l.locked && !l.hidden) || [];
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
    const blur = () => { space.current = false; if (drag.current) { if(drag.current.type==='refine')saveRefineStroke();else endDesignTransient(); drag.current = null; setGuides([]); setMarquee(null); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [active]);
  useEffect(() => {
    setEditing(null); drag.current = null; setGuides([]); setMarquee(null);
    return () => endDesignTransient();
  }, [base?.id]);
  useEffect(() => { if (active && d) loadDesignImages(d); }, [active, d]);
  useLayoutEffect(() => {
    if (!active || !d || !canvas.current) return;
    const frame = requestAnimationFrame(() => {
      const cv = canvas.current, ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(size.w * ratio)), height = Math.max(1, Math.round(size.h * ratio));
      if (cv.width !== width) cv.width = width; if (cv.height !== height) cv.height = height;
      const ctx = cv.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size.w, size.h);
      ctx.save(); ctx.translate(offset.x, offset.y);
      drawDesign(ctx, d, (l)=>refine&&l.asset===refine.asset?refine.canvas:libraryImage(l), { scale, fontAvailable, hideLayers: new Set([editing, crop?.layer.id].filter(Boolean)) });
      ctx.scale(scale, scale);
      ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 1 / scale;
      if(safe){ctx.save();ctx.fillStyle='#ffbf4730';ctx.strokeStyle='#ffbf47';ctx.lineWidth=1/scale;ctx.setLineDash([5/scale,4/scale]);for(const z of designSafeZones(d)){ctx.fillRect(z.x,z.y,z.w,z.h);ctx.strokeRect(z.x,z.y,z.w,z.h);ctx.font=`${12/scale}px sans-serif`;ctx.fillStyle='#ffbf47';ctx.fillText(z.label,z.x+4/scale,z.y+16/scale);ctx.fillStyle='#ffbf4730';}ctx.restore();}
      if(canvasDraft){const b=cropViewport({x:0,y:0,w:d.width,h:d.height},canvasDraft.crop);ctx.save();ctx.fillStyle='#00000090';ctx.beginPath();ctx.rect(0,0,d.width,d.height);ctx.rect(b.x,b.y,b.w,b.h);ctx.fill('evenodd');ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5/scale;ctx.strokeRect(b.x,b.y,b.w,b.h);for(const [x,y]of POSITIONS){ctx.fillStyle='#ffffff';ctx.fillRect(b.x+x*b.w-4/scale,b.y+y*b.h-4/scale,8/scale,8/scale)}ctx.restore();}
      if (box && !editing && !crop && !refine && !maskId && !canvasDraft) {
        const corners = [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]].map(([x, y]) => layerPoint(box, x, y));
        ctx.beginPath(); corners.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath(); ctx.stroke();
        const handles = handlesFor(box, scale), top = handles[1], rot = handles[8];
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
        for (const h of handles) { ctx.fillStyle = '#ffffff'; ctx.fillRect(h.x - 4 / scale, h.y - 4 / scale, 8 / scale, 8 / scale); ctx.strokeRect(h.x - 4 / scale, h.y - 4 / scale, 8 / scale, 8 / scale); }
      }
      if (crop) {
        const l = crop.layer, b = cropViewport(crop.full, crop.crop);
        ctx.save(); ctx.translate(l.x + l.w/2, l.y + l.h/2); ctx.rotate(l.rotation * Math.PI/180); ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1); ctx.translate(-l.w/2, -l.h/2);
        ctx.filter = imageFilter(l.adjust, scale * ratio); ctx.globalAlpha = 0.25;
        ctx.drawImage(crop.image, crop.full.x, crop.full.y, crop.full.w, crop.full.h);
        ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();ctx.globalAlpha=1;ctx.drawImage(crop.image,crop.full.x,crop.full.y,crop.full.w,crop.full.h);ctx.restore();
        ctx.filter='none';ctx.globalAlpha=1;ctx.strokeStyle='#ffffff';ctx.lineWidth=1/scale;ctx.strokeRect(b.x,b.y,b.w,b.h);
        ctx.beginPath();for(const f of [1/3,2/3]){ctx.moveTo(b.x+b.w*f,b.y);ctx.lineTo(b.x+b.w*f,b.y+b.h);ctx.moveTo(b.x,b.y+b.h*f);ctx.lineTo(b.x+b.w,b.y+b.h*f);}ctx.stroke();
        for(const [x,y] of POSITIONS){ctx.fillStyle='#ffffff';ctx.fillRect(b.x+x*b.w-4/scale,b.y+y*b.h-4/scale,8/scale,8/scale);}ctx.restore();
      }
      if (maskId) {
        const l=d.layers.find(l=>l.id===maskId);
        if(l?.mask){const points=l.mask.points.map(([x,y])=>layerPoint(l,(l.flipX?1-x:x)*l.w,(l.flipY?1-y:y)*l.h));ctx.strokeStyle='#ffbf47';ctx.lineWidth=1.5/scale;ctx.save();ctx.translate(l.x+l.w/2,l.y+l.h/2);ctx.rotate(l.rotation*Math.PI/180);ctx.scale(l.flipX?-1:1,l.flipY?-1:1);ctx.translate(-l.w/2,-l.h/2);const local=l.mask.points.map(([x,y])=>[x*l.w,y*l.h]),xs=local.map(p=>p[0]),ys=local.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;ctx.stroke(shapePath(l.mask.shape==='polygon'?{shape:'path',pts:local}:{shape:l.mask.shape,cx:x+w/2,cy:y+h/2,w,h,rot:0},l.mask.smooth));ctx.restore();for(const p of points){ctx.fillStyle='#ffbf47';ctx.fillRect(p.x-5/scale,p.y-5/scale,10/scale,10/scale);}}
      }
      if(refine&&brushHover){ctx.strokeStyle='#ffffff';ctx.lineWidth=1/scale;ctx.beginPath();ctx.arc(brushHover.x,brushHover.y,brushSettings.value.size/2,0,Math.PI*2);ctx.stroke();}
      ctx.strokeStyle = '#ff45d3'; ctx.setLineDash([4 / scale, 4 / scale]);
      for (const g of guides) { ctx.beginPath(); if (g.axis === 'x') { ctx.moveTo(g.value, 0); ctx.lineTo(g.value, d.height); } else { ctx.moveTo(0, g.value); ctx.lineTo(d.width, g.value); } ctx.stroke(); }
      if (marquee) { ctx.fillStyle = '#0a84ff22'; ctx.strokeStyle = '#0a84ff'; ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h); ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h); }
      ctx.restore();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, d, selected, z, p, size, version, guides, marquee, editing, crop, refine, maskId, brushHover, brushSettings.value,canvasDraft,safe]);
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
  function cropPoint(pt, l) {
    const p=rotatePoint(pt.x-l.x-l.w/2,pt.y-l.y-l.h/2,-l.rotation);
    return {x:l.w/2+p.x*(l.flipX?-1:1),y:l.h/2+p.y*(l.flipY?-1:1)};
  }
  function down(e) {
    if(libraryPreview.value){clearLibraryPreview();return;}
    if (!d || (e.button !== 0 && e.button !== 1) || e.target.tagName === 'TEXTAREA') return;
    if (editing) { finishText(); return; }
    e.preventDefault(); host.current.focus(); host.current.setPointerCapture(e.pointerId);
    const pt = point(e);
    if (space.current || tool.value === 'hand' || e.button === 1) {
      drag.current = { type: 'pan', clientX: e.clientX, clientY: e.clientY, pan: pan.value }; return;
    }
    if(canvasDraft){const full={x:0,y:0,w:d.width,h:d.height},b=cropViewport(full,canvasDraft.crop),index=POSITIONS.findIndex(([x,y])=>Math.hypot(pt.x-b.x-x*b.w,pt.y-b.y-y*b.h)<=10/scale);drag.current={type:'canvasCrop',start:pt,session:canvasDraft,handle:index>=0?HANDLES[index]:null};return;}
    if (crop) {
      const local=cropPoint(pt,crop.layer), b=cropViewport(crop.full,crop.crop);
      const index=POSITIONS.findIndex(([x,y])=>Math.hypot(local.x-b.x-x*b.w,local.y-b.y-y*b.h)<=10/scale);
      drag.current={type:'crop',handle:index>=0?HANDLES[index]:null,start:local,session:crop};return;
    }
    if(refine){if(!refine.busy){paintRefine(pt);drag.current={type:'refine',previous:pt};}return;}
    if(maskId){
      const l=d.layers.find(l=>l.id===maskId),index=l?.mask?.points.findIndex(([x,y])=>{const p=layerPoint(l,(l.flipX?1-x:x)*l.w,(l.flipY?1-y:y)*l.h);return Math.hypot(p.x-pt.x,p.y-pt.y)<=10/scale;});
      if(index>=0){beginDesignTransient();drag.current={type:'mask',layer:l,index};}return;
    }
    const handle = box && handlesFor(box, scale).find((h) => Math.hypot(pt.x - h.x, pt.y - h.y) <= 8 / scale);
    if (handle) {
      beginDesignTransient(); drag.current = { type: handle.handle, start: pt, box: { ...box }, layers: picked, angle: Math.atan2(pt.y - box.y - box.h / 2, pt.x - box.x - box.w / 2) }; return;
    }
    if (tool.value === 'text') { const l = addText(pt.x, pt.y); if (l) { beginDesignTransient(); setEditing(l.id); } return; }
    if (tool.value === 'shape') {
      const l = brandLayer(newLayer('shape', { shape: shapeType.value, name: shapeType.value[0].toUpperCase() + shapeType.value.slice(1), x: pt.x, y: pt.y, w: 1, h: 1 }),prefs.value.designBrand,prefs.value.designBrandFonts);
      beginDesignTransient(); drag.current = { type: 'shape', start: pt, layer: l }; selection.value = [l.id]; return;
    }
    const hit = hitTest(d, pt.x, pt.y);
    if (hit) {
      if (e.shiftKey || !selected.includes(hit.id)) selectLayer(hit.id, { toggle: e.shiftKey });
      const ids = selection.value;
      if (d.layers.some((l) => ids.includes(l.id) && l.locked)) { toast('Unlock the group before moving it.'); return; }
      const layers = d.layers.filter((l) => ids.includes(l.id) && !l.locked);
      if (layers.length) { beginDesignTransient(); drag.current = { type: 'move', start: pt, layers, box: selectionBounds(layers) }; }
    } else { if (!e.shiftKey) selection.value = []; drag.current = { type: 'marquee', start: pt, previous: e.shiftKey ? selected : [] }; }
  }
  function move(e) {
    const state = drag.current;
    if(refine)setBrushHover(point(e));
    if (!state || !d) return;
    if(state.type==='refine'){const p=point(e);paintRefine(p,state.previous);state.previous=p;return;}
    if(state.type==='mask'){const p=cropPoint(point(e),state.layer),x=Math.max(0,Math.min(1,p.x/state.layer.w)),y=Math.max(0,Math.min(1,p.y/state.layer.h));const points=state.layer.mask.points.map(p=>[...p]);if(state.layer.mask.shape==='polygon'||points.length!==4)points[state.index]=[x,y];else{const i=state.index;for(const n of i===0||i===3?[0,3]:[1,2])points[n][0]=x;for(const n of i<2?[0,1]:[2,3])points[n][1]=y;}updateDesignTransient(p=>{const l=p.designs[d.id].layers.find(l=>l.id===state.layer.id);if(l?.mask)l.mask.points=points;});return;}
    if (state.type === 'pan') { pan.value = { x: state.pan.x + e.clientX - state.clientX, y: state.pan.y + e.clientY - state.clientY }; return; }
    const pt = point(e); let dx = pt.x - state.start.x, dy = pt.y - state.start.y;
    if(state.type==='canvasCrop'){const s=state.session,full={x:0,y:0,w:d.width,h:d.height},c=s.crop,ratio=s.ratio==='free'?null:Number(s.ratio);canvasCrop.value={...s,crop:state.handle?resizeCrop(full,c,state.handle,dx,dy,ratio):{...c,x:Math.max(0,Math.min(1-c.w,c.x+dx/d.width)),y:Math.max(0,Math.min(1-c.h,c.y+dy/d.height))}};return;}
    if (state.type === 'crop') {
      const s=state.session,local=cropPoint(pt,s.layer),cx=local.x-state.start.x,cy=local.y-state.start.y;
      const ratio=s.ratio==='design'?d.width/d.height:s.ratio==='free'?null:Number(s.ratio);
      cropSession.value=state.handle?{...s,crop:resizeCrop(s.full,s.crop,state.handle,cx,cy,ratio)}:{...s,...moveCropImage(s.full,s.crop,cx,cy)};
      return;
    }
    if (state.type === 'marquee') {
      const b = { x: Math.min(pt.x, state.start.x), y: Math.min(pt.y, state.start.y), w: Math.abs(dx), h: Math.abs(dy) };
      setMarquee(b);
      selection.value = groupSelectionIds(d.layers, [...new Set([...state.previous, ...d.layers.filter((l) => { const r = layerBounds(l); return !l.locked && !l.hidden && r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y; }).map((l) => l.id)])]); return;
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
      layers = rotateDesignLayers(state.layers, state.box, delta);
    } else {
      const keepAspect = state.layers.length === 1 && state.layers[0].type === 'image' ? !e.shiftKey : e.shiftKey;
      const b = resizeLayer(state.box, state.type, dx, dy, { keepAspect, fromCenter: e.altKey });
      if (state.layers.length === 1) layers = [b];
      else layers = scaleDesignLayers(state.layers, state.box, b);
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
    if(state.type==='refine'){if(keep)saveRefineStroke();else{stopRefine();startRefine();}}
    if(state.type==='canvasCrop'&&!keep)canvasCrop.value=state.session;
    if (state.type === 'crop' && !keep) cropSession.value = state.session;
    if (state.type !== 'pan' && state.type !== 'marquee' && state.type !== 'crop' && state.type !== 'refine' && state.type !== 'canvasCrop') endDesignTransient(keep);
    if (state.type === 'shape') tool.value = 'select';
    if (host.current.hasPointerCapture(e.pointerId)) host.current.releasePointerCapture(e.pointerId);
  }
  const text = base?.layers.find((l) => l.id === editing);
  let textLayout;
  if (text) { const ctx = canvas.current?.getContext('2d'); if (ctx) textLayout = layoutDesignText(text, (t, font) => { ctx.font = font; return ctx.measureText(t).width; }); }
  return (
    <div class={`dz-stage dz-tool-${tool.value}${crop ? ' dz-crop-mode' : ''}${refine ? ' dz-refine-mode' : ''}${canvasDraft?' dz-canvas-crop-mode':''}`} ref={host} tabIndex={0} aria-label="Design canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(e) => up(e, false)} onLostPointerCapture={up}
      onKeyDown={(e) => { if(refineSession.value||maskEditing.value){e.stopPropagation();if(refineSession.value&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();navigateRefineHistory(e.shiftKey);return;}if(e.key==='Escape'){e.preventDefault();if(drag.current?.type==='mask')endDesignTransient(false);drag.current=null;stopRefine();maskEditing.value=null;}return;} if (cropSession.value) { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); drag.current = null; finishCrop(e.key === 'Enter'); } return; } if (e.key === 'Escape' && drag.current) { e.stopPropagation(); up(e, false); } }}
      onDblClick={(e) => { if(canvasCrop.value||libraryPreview.value)return; const hit = d && hitTest(d, point(e).x, point(e).y); if (hit) selectLayer(hit.id, { single: true }); if (hit?.type === 'text') startText(hit.id); else if (hit?.type === 'image') startCrop(); }}
      onDragOver={(e) => { if (hasFiles(e.dataTransfer) || isLibraryDrag(e)) { e.preventDefault(); e.stopPropagation(); } }}
      onDrop={(e) => { if (isLibraryDrag(e)) { e.preventDefault(); e.stopPropagation(); const cur=currentDesign.value,rect=host.current.getBoundingClientRect(),k=cur?(z==='fit'?Math.max(.001,Math.min((size.w-100)/cur.width,(size.h-100)/cur.height)):z):1;const pos=cur?{x:(e.clientX-rect.left-(size.w-cur.width*k)/2-p.x)/k,y:(e.clientY-rect.top-(size.h-cur.height*k)/2-p.y)/k}:null;dropLibraryItem(cur&&pos?libraryDropTarget(cur,pos):null,pos);return; } if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); requestPlace(droppedPaths(e.dataTransfer, window.api.pathForFile), point(e), e.altKey).catch((err) => toast(err.message, { kind: 'error' })); }}>
      {d && <div class="dz-checker" style={{ left: offset.x, top: offset.y, width: d.width * scale, height: d.height * scale }} />}
      <canvas class="dz-canvas" ref={canvas} style={{ width: size.w, height: size.h }} />
      {text && <textarea ref={textRef} class="dz-text-edit" value={text.text} spellcheck={false}
        style={{ left: offset.x + text.x * scale, top: offset.y + text.y * scale, width: text.w, height: text.h, transformOrigin: '0 0', transform: `scale(${scale}) translate(${text.w / 2}px, ${text.h / 2}px) rotate(${text.rotation}deg) scale(${text.flipX ? -1 : 1}, ${text.flipY ? -1 : 1}) translate(${-text.w / 2}px, ${-text.h / 2}px)`, font: designFont(text, textLayout?.size), lineHeight: text.lineHeight, textAlign: text.align, color: text.fill?.color || '#ffffff', textTransform: text.uppercase ? 'uppercase' : 'none', paddingTop: text.valign === 'top' ? 0 : Math.max(0, (text.h - (textLayout?.height || 0)) / (text.valign === 'middle' ? 2 : 1)) }}
        onPointerDown={(e) => e.stopPropagation()} onInput={(e) => { const value = e.currentTarget.value; updateDesignTransient((p) => { const l = p.designs[d.id]?.layers.find((l) => l.id === editing); if (l) Object.assign(l,replaceStyledText(l,value)); }); }} onBlur={finishText} onSelect={e=>rememberTextSelection(text,e.currentTarget)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finishText(); host.current.focus(); } }} />}
    </div>
  );
}
