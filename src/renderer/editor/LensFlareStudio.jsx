// Flare Studio: bygg og rediger en lens flare element for element, med live forhåndsvisning,
// elementliste, inspektør, elementbibliotek og presets. Alt redigeres direkte i effekten på klippet
// (vanlige angresteg); Revert setter effekten tilbake slik den var da studioet ble åpnet.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Focus, ImagePlus, Trash2 } from 'lucide-preact';
import { CUSTOM_PREFIX, FLARE_ASSETS, FLARE_BLENDS, FLARE_DEFAULTS, FLARE_GRADIENTS, FLARE_GROUPS, FLARE_FILE_FORMAT, FLARE_PRESETS, MAX_CUSTOM_TEXTURE, PROC_DEFAULTS, PROC_KEYS, assetOf, elementCenter, flareAsset, importFlarePreset, keepsOwnColors, makeElement, newElementId, procParams } from '../../shared/lensFlare.js';
import { drawLensFlare, onFlareSprites } from '../../shared/lensFlareRender.js';
import { animatedEffect } from '../../shared/videoEffectsRender.js';
import { effectParams } from '../../shared/videoEffects.js';
import { formatTimecode, kfTime, pruneEffectKeyframes, setPropBase, uid, vfxElementProp, vfxProp } from '../../shared/model.js';
import { Button, IconButton, Modal, Row, Segmented, Select, Slider, Toggle, toast } from '../ui.jsx';
import { beginTransient, commit, endTransient, project, redo, setTime, timeSig, undo, updateTransient } from './store.js';
import { fileUrl } from '../player.js';
import { setKeyframe } from './keyframes.js';
import { readClipFrame } from './sourceFrame.js';
import { prefs, setPrefs } from '../prefs.js';
import { Param, PatternChoice } from './Inspector.jsx';
import { FlareGlobals, applyFlarePreset, flareLookModified, flarePresets, flareStudio } from './LensFlareControls.jsx';

// Miniatyrene av presets og prosedyriske elementer tegnes med samme renderer som bildet, så de stemmer med eksporten.
function flareThumb(p, w, h) {
  const t = document.createElement('canvas'), b = document.createElement('canvas');
  t.width = b.width = w;
  t.height = b.height = h;
  b.getContext('2d').fillRect(0, 0, w, h);
  drawLensFlare(t.getContext('2d'), b, w, h, p);
  return t.toDataURL('image/jpeg', 0.85);
}
const procThumbs = new Map();
function elementThumb(id, p) {
  const a = assetOf(p, id);
  if (a?.url) return a.url;
  if (!a?.proc) return `lensflare/thumbs/elements/${id}.png`;
  if (!procThumbs.has(id)) {
    const el = { ...makeElement(id), distance: 1, size: a.proc === 'halo' ? 0.62 : 0.78, intensity: 1 };
    procThumbs.set(id, flareThumb({ ...FLARE_DEFAULTS, x: 0.5, y: 0.5, cx: 0.5, cy: 0.5, intensity: 1, scale: 1, spread: 1, opacity: 1, colorize: 0, elements: [el] }, 112, 112));
  }
  return procThumbs.get(id);
}
const kitThumbs = () => Object.fromEntries(FLARE_PRESETS.map((x) => [x.id, flareThumb(x.p, 320, 180)]));
const groupLabel = (id) => FLARE_GROUPS.find((g) => g.id === id)?.label || id;
const r4 = (v) => Math.round(v * 10000) / 10000;
// Avstanden på aksen tilbake til elementets egen verdi (motsatt av spreadDistance).
const unspread = (d, s) => (d < 0 ? d / s : d > 1 ? 1 + (d - 1) / s : d);
const where = (el) => el.blend === 'dirt' ? 'On the lens'
  : Math.abs(el.distance - 1) < 1e-3 ? 'At the light source'
  : Math.abs(el.distance) < 1e-3 ? 'At the optical center' : `Distance ${el.distance.toFixed(2)}`;

export function LensFlareStudio() {
  const { clipId, effectId } = flareStudio.value;
  const clip = project.value.clips[clipId];
  const effect = clip?.props.vfx?.find((e) => e.id === effectId);
  // Lukk om klippet eller effekten forsvinner (angret, slettet).
  useEffect(() => { if (!effect) flareStudio.value = null; }, [effect]);
  return effect ? <Studio clip={clip} effect={effect} /> : null;
}

function Studio({ clip, effect }) {
  const clipId = clip.id, effectId = effect.id, prefix = vfxProp(effectId, '');
  const [opening] = useState(() => ({
    p: structuredClone(effect.p),
    kf: structuredClone(Object.fromEntries(Object.entries(clip.kf || {}).filter(([k]) => k.startsWith(prefix)))),
  }));
  const [selected, setSelected] = useState(() => effect.p.elements?.find((e) => e.on !== false)?.id || null);
  // Solo: ett element (id) eller en gruppe ('group:<navn>').
  const [solo, setSolo] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [group, setGroup] = useState('ghosts');
  const media = project.value.media[clip.mediaId];
  const canVideo = ['video', 'image', 'recording'].includes(clip.type) && Boolean(media);
  const [bg, setBg] = useState(canVideo ? 'video' : 'black');
  const [guides, setGuides] = useState(true);
  const [name, setName] = useState('');
  const [frame, setFrame] = useState(null);
  const [frameError, setFrameError] = useState('');
  const [tick, setTick] = useState(0);
  const canvasRef = useRef(null), baseRef = useRef(null), svgRef = useRef(null), stageRef = useRef(null);
  const [fit, setFit] = useState(null);
  const [thumbs, setThumbs] = useState(kitThumbs);
  const presetThumb = (x) => x.thumb || thumbs[x.id];
  const assetIn = (id) => assetOf(base, id);

  const T = timeSig.value, fps = project.value.fps;
  const Tc = Math.min(Math.max(T, clip.start), clip.start + clip.dur - 1e-3);
  const base = effectParams(effect);
  const p = effectParams(animatedEffect(clip, effect, Tc));
  const els = base.elements || [];
  const sel = els.find((e) => e.id === selected) || null;
  const soloIds = solo?.startsWith('group:') ? els.filter((e) => e.group === solo.slice(6)).map((e) => e.id) : solo;
  const groups = [...new Set(els.map((e) => e.group).filter(Boolean))];
  const close = () => (flareStudio.value = null);

  // Forhåndsvisningen har bildets sideforhold, innenfor 960 × 540.
  const st = media?.streams?.[effect.target && effect.target !== 'main' ? effect.target : 'main'] || media?.streams?.main;
  const aw = st?.width || media?.width || project.value.width, ah = st?.height || media?.height || project.value.height;
  const k = Math.min(960 / aw, 540 / ah), W = Math.max(2, Math.round(aw * k)), H = Math.max(2, Math.round(ah * k));

  useEffect(() => onFlareSprites(() => setTick((t) => t + 1)), []);
  // Teksturene kommer én og én; tegn preset-miniatyrene på nytt når de har kommet.
  useEffect(() => {
    if (!tick) return;
    const timer = setTimeout(() => setThumbs(kitThumbs()), 200);
    return () => clearTimeout(timer);
  }, [tick]);
  useEffect(() => { document.querySelector('.fs-row.sel')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  useEffect(() => {
    const stage = stageRef.current;
    const measure = () => {
      // Plass rundt bildet, så en lyskilde litt utenfor rammen fortsatt kan gripes.
      const s = Math.min((stage.clientWidth - 160) / W, (stage.clientHeight - 120) / H);
      setFit({ width: Math.max(1, W * s), height: Math.max(1, H * s) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [W, H]);
  // Bildet fra klippet ved spillhodet (uten effektene), lest litt etter at spillhodet har stoppet.
  const frameKey = bg === 'video' ? `${clipId}:${Math.round(Tc * fps)}` : '';
  useEffect(() => {
    if (!frameKey) return;
    let live = true;
    const timer = setTimeout(() => readClipFrame(clip, effect.target || 'main').then((f) => {
      if (!live) return;
      const cv = document.createElement('canvas');
      cv.width = f.width;
      cv.height = f.height;
      cv.getContext('2d').putImageData(f, 0, 0);
      setFrame(cv);
      setFrameError('');
    }, (err) => live && setFrameError(err.message)), 120);
    return () => { live = false; clearTimeout(timer); };
  }, [frameKey]);

  const pKey = JSON.stringify(p);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const b = (baseRef.current ||= document.createElement('canvas'));
    b.width = W;
    b.height = H;
    const g = b.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (bg === 'checker') {
      g.fillStyle = '#2a2a2d';
      for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < W; x += 32) g.fillRect(x, y, 16, 16);
    } else if (bg === 'video' && frame) g.drawImage(frame, 0, 0, W, H);
    drawLensFlare(cv.getContext('2d'), b, W, H, p, soloIds);
  }, [pKey, bg, frame, String(soloIds), tick, W, H]);

  /* Redigering */
  const effectOf = (q) => q.clips[clipId]?.props.vfx?.find((x) => x.id === effectId);
  const elementOf = (q, id) => effectOf(q)?.p.elements?.find((x) => x.id === id);
  const setEl = (id, values) => commit((q) => Object.assign(elementOf(q, id) || {}, values));
  // Endrer elementlisten; nøkkelbilder for elementer som er borte, ryddes bort.
  const editList = (fn) => commit((q) => {
    const c = q.clips[clipId], e = effectOf(q);
    if (!e) return;
    fn((e.p.elements ||= []), c, e);
    pruneEffectKeyframes(c);
  });
  const add = (assetId) => {
    const el = makeElement(assetId, base);
    editList((list) => list.push(el));
    setSelected(el.id);
  };
  const duplicate = (id) => {
    const copy = { ...structuredClone(els.find((e) => e.id === id)), id: newElementId() };
    editList((list, c) => {
      list.splice(list.findIndex((e) => e.id === id) + 1, 0, copy);
      // Kopien får også elementets nøkkelbilder og uttrykk.
      const from = vfxElementProp(effectId, id, ''), to = vfxElementProp(effectId, copy.id, '');
      for (const map of [c.kf, c.expressions]) if (map) for (const key of Object.keys(map)) if (key.startsWith(from)) map[to + key.slice(from.length)] = structuredClone(map[key]);
    });
    setSelected(copy.id);
  };
  const remove = (id) => {
    const i = els.findIndex((e) => e.id === id);
    editList((list) => list.splice(list.findIndex((e) => e.id === id), 1));
    if (solo === id) setSolo(null);
    setSelected(els[i + 1]?.id || els[i - 1]?.id || null);
  };
  // En gruppe holdes samlet i listen: elementet flyttes bak gruppens siste element.
  const groupElement = (id, name) => editList((list) => {
    const i = list.findIndex((e) => e.id === id), group = name.trim().slice(0, 40);
    if (i < 0) return;
    const [el] = list.splice(i, 1);
    if (group) el.group = group;
    else delete el.group;
    const last = group ? list.findLastIndex((e) => e.group === group) : -1;
    list.splice(last >= 0 ? last + 1 : i, 0, el);
  });
  const groupOn = (name, on) => editList((list) => { for (const e of list) if (e.group === name) e.on = on; });
  const ungroup = (name) => editList((list) => { for (const e of list) if (e.group === name) delete e.group; });
  // Egen tekstur: bildet skaleres ned til høyst MAX_CUSTOM_TEXTURE og lagres i effekten, så prosjektet tar det med seg.
  const importTexture = async () => {
    const file = await window.api.openFileDialog({ title: 'Import Flare Texture', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (!file) return;
    try {
      const r = await fetch(fileUrl(file));
      if (!r.ok) throw new Error(`Could not read ${file.split(/[\\/]/).pop()}.`);
      const img = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const k = Math.min(1, MAX_CUSTOM_TEXTURE / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      img.close();
      const jpeg = /\.jpe?g$/i.test(file), id = uid();
      const t = { name: file.split(/[\\/]/).pop().replace(/\.\w+$/, '').slice(0, 80), url: cv.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92), w: cv.width, h: cv.height };
      const textures = { ...base.textures, [id]: t }, el = makeElement(CUSTOM_PREFIX + id, { textures });
      editList((list, c, e) => { e.p.textures = { ...e.p.textures, [id]: t }; list.push(el); });
      setSelected(el.id);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };
  const removeTexture = (id) => {
    const used = els.filter((e) => e.asset === CUSTOM_PREFIX + id).length;
    if (used && !confirm(`Remove this texture and the ${used === 1 ? 'element' : `${used} elements`} that use it?`)) return;
    editList((list, c, e) => {
      const { [id]: _, ...rest } = e.p.textures || {};
      e.p.textures = rest;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].asset === CUSTOM_PREFIX + id) list.splice(i, 1);
    });
  };
  const move = (id, d) => editList((list) => {
    const i = list.findIndex((e) => e.id === id), j = i + d;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  });
  const revert = () => commit((q) => {
    const c = q.clips[clipId], e = effectOf(q);
    if (!e) return;
    e.p = structuredClone(opening.p);
    for (const key of Object.keys(c.kf || {})) if (key.startsWith(prefix)) delete c.kf[key];
    Object.assign((c.kf ||= {}), structuredClone(opening.kf));
  });
  const changed = JSON.stringify(effect.p) !== JSON.stringify(opening.p)
    || JSON.stringify(Object.fromEntries(Object.entries(clip.kf || {}).filter(([key]) => key.startsWith(prefix)))) !== JSON.stringify(opening.kf);

  /* Presets */
  const presets = flarePresets(), saved = prefs.value.lensFlarePresets || [];
  const current = presets.find((x) => x.id === base.preset), modified = flareLookModified(base);
  const userCurrent = saved.find((x) => x.id === base.preset);
  const snapshot = () => flareThumb(base, 320, 180);
  const look = () => structuredClone(base);
  const savePreset = () => {
    const id = `user-${uid()}`, label = name.trim() || `My flare ${saved.length + 1}`;
    setPrefs({ lensFlarePresets: [...saved, { id, label, p: { ...look(), preset: id }, thumb: snapshot() }] });
    commit((q) => { const e = effectOf(q); if (e) e.p.preset = id; });
    setName('');
  };
  const updatePreset = () => setPrefs({ lensFlarePresets: saved.map((x) => x.id === userCurrent.id ? { ...x, p: { ...look(), preset: x.id }, thumb: snapshot() } : x) });
  const exportPreset = async () => {
    const label = name.trim() || current?.label || 'Lens flare';
    const file = await window.api.saveFileDialog({ title: 'Export Lens Flare Preset', defaultPath: `${label.replace(/[\\/:*?"<>|]/g, '_')}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (file) await window.api.writeText(file, JSON.stringify({ format: FLARE_FILE_FORMAT, label, p: look() }, null, 2));
  };
  const importPreset = async () => {
    const file = await window.api.openFileDialog({ title: 'Import Lens Flare Preset', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!file) return;
    try {
      const { label, p: q } = importFlarePreset(JSON.parse(await window.api.readText(file)));
      const x = { id: `user-${uid()}`, label, p: { ...q, preset: '' }, thumb: '' };
      x.p.preset = x.id;
      x.thumb = flareThumb(x.p, 320, 180);
      setPrefs({ lensFlarePresets: [...(prefs.value.lensFlarePresets || []), x] });
      commit((d) => applyFlarePreset(d.clips[clipId], effectId, x));
      toast(`Imported the preset “${label}”.`, { kind: 'success' });
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };
  const deletePreset = (x) => {
    if (confirm(`Delete the preset “${x.label}”? Clips that use it keep their flare.`)) setPrefs({ lensFlarePresets: saved.filter((y) => y.id !== x.id) });
  };

  /* Håndtak i forhåndsvisningen */
  const uvAt = (ev) => {
    const r = svgRef.current.getBoundingClientRect();
    return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height];
  };
  // Har verdien nøkkelbilder, settes et nøkkelbilde ved spillhodet; ellers endres grunnverdien.
  const put = (c, prop, v) => {
    if (c.kf?.[prop]?.length) setKeyframe(c, prop, kfTime(c, Tc), v);
    else setPropBase(c, prop, v);
  };
  const putGlobal = (c, key, v) => put(c, vfxProp(effectId, key), v);
  const drag = (ev, apply) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = ev.currentTarget, start = uvAt(ev);
    el.setPointerCapture(ev.pointerId);
    beginTransient();
    const moveTo = (mv) => {
      const q = uvAt(mv);
      updateTransient((d) => d.clips[clipId] && apply(d.clips[clipId], q, start));
    };
    const up = () => {
      el.removeEventListener('pointermove', moveTo);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      endTransient(true);
    };
    el.addEventListener('pointermove', moveTo);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const movePoint = (kx, ky) => (ev) => drag(ev, (c, q, s) => {
    putGlobal(c, kx, r4(p[kx] + q[0] - s[0]));
    putGlobal(c, ky, r4(p[ky] + q[1] - s[1]));
  });
  // Et element dras langs refleksjonsaksen: avstanden er projeksjonen av pekeren på aksen.
  const slideElement = (el) => (ev) => {
    setSelected(el.id);
    drag(ev, (c, q) => {
      const sx = (p.x - p.cx) * W, sy = (p.y - p.cy) * H, len = sx * sx + sy * sy;
      if (len < 1 || !(p.spread > 0.001)) return;
      const d = (((q[0] - el.ox - p.cx) * W) * sx + ((q[1] - el.oy - p.cy) * H) * sy) / len;
      put(c, vfxElementProp(effectId, el.id, 'distance'), Math.round(unspread(d, p.spread) * 100) / 100);
    });
  };
  const at = (d) => [(p.cx + (p.x - p.cx) * d) * W, (p.cy + (p.y - p.cy) * d) * H];
  const [a0, a1] = [at(1.4), at(-2.2)];

  const onKey = (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (sel && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      remove(sel.id);
    } else if (sel && mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate(sel.id);
    }
  };

  return (
    <Modal title={`Flare Studio · ${clip.name || 'Clip'}`} width={1280} class="flare-studio" onClose={close} footer={<>
      <input class="text-input fs-preset-name" placeholder="New preset name" aria-label="Preset name" value={name}
        onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') savePreset(); }} />
      <Button onClick={savePreset}>Save as Preset</Button>
      {userCurrent && modified && <Button onClick={updatePreset} title="Replace the saved preset with these settings">Update “{userCurrent.label}”</Button>}
      <Button variant="ghost" onClick={importPreset} title="Add a preset from a file, also the RecCut Lens Flare Kit JSON format">Import…</Button>
      <Button variant="ghost" onClick={exportPreset} title="Save these settings as a preset file">Export…</Button>
      <span class="fs-spacer" />
      <Button onClick={revert} disabled={!changed} title="Undo every change made since Flare Studio was opened">Revert</Button>
      <Button variant="primary" onClick={close}>Done</Button>
    </>}>
      <div class="fs-root" onKeyDown={onKey}>
        <div class="fs-presets" role="list" aria-label="Presets">
          {presets.map((x) => {
            const user = x.id.startsWith('user-'), on = x.id === base.preset;
            return (
              <div key={x.id} role="listitem" tabIndex={0} class={`fs-preset${on ? ' sel' : ''}`} title={`${x.label}${x.category ? ` · ${x.category}` : ''}. Keeps the light position.`}
                onClick={() => commit((q) => applyFlarePreset(q.clips[clipId], effectId, x))}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}>
                <img src={presetThumb(x)} alt="" draggable={false} />
                <span>{user ? '★ ' : ''}{x.label}{on && modified ? ' · modified' : ''}</span>
                {user && <button class="fs-preset-delete" title={`Delete the preset ${x.label}`} aria-label={`Delete ${x.label}`}
                  onClick={(e) => { e.stopPropagation(); deletePreset(x); }}>×</button>}
              </div>
            );
          })}
        </div>
        <div class="fs-main">
          <div class="fs-left">
            <div class="fs-toolbar">
              <Segmented size="small" value={bg} onChange={setBg} options={[
                ...(canVideo ? [{ value: 'video', label: 'Video' }] : []),
                { value: 'black', label: 'Black' }, { value: 'checker', label: 'Checkerboard' },
              ]} />
              <label class="fs-check"><Toggle checked={guides} onChange={setGuides} /> Guides</label>
              {solo && <button class="link small-link" onClick={() => setSolo(null)}>Showing one element · show all</button>}
              <span class="fs-spacer" />
              <Slider value={Tc} min={clip.start} max={clip.start + clip.dur - 1e-3} step={1 / fps} onInput={(t) => setTime(t)} />
              <span class="fs-time">{formatTimecode(Tc, fps)}</span>
            </div>
            <div class="fs-stage" ref={stageRef}>
              {fit && <div class="fs-frame" style={fit}>
                <canvas ref={canvasRef} width={W} height={H} />
                <svg ref={svgRef} class="fs-overlay" viewBox={`0 0 ${W} ${H}`}>
                  {guides && <>
                    <line class="fs-axis" x1={a0[0]} y1={a0[1]} x2={a1[0]} y2={a1[1]} vector-effect="non-scaling-stroke" />
                    {(p.elements || []).filter((el) => el.blend !== 'dirt').map((el) => {
                      const [u, v] = elementCenter(p, el);
                      return <circle key={el.id} cx={u * W} cy={v * H} r={el.id === selected ? 7 : 5}
                        class={`fs-el${el.id === selected ? ' sel' : ''}${el.on === false ? ' off' : ''}`} onPointerDown={slideElement(el)}>
                        <title>{assetIn(el.asset)?.label} · {where(el)}. Drag along the axis to change its distance.</title>
                      </circle>;
                    })}
                    <g class="fs-center" transform={`translate(${p.cx * W} ${p.cy * H})`} onPointerDown={movePoint('cx', 'cy')}>
                      <circle r="10" /><line x1="-15" x2="15" /><line y1="-15" y2="15" />
                      <title>Optical center. Reflections mirror the light around this point.</title>
                    </g>
                    <g class="fs-source" transform={`translate(${p.x * W} ${p.y * H})`} onPointerDown={movePoint('x', 'y')}>
                      {Array.from({ length: 8 }, (_, i) => <line key={i} x1="13" x2="19" transform={`rotate(${i * 45})`} />)}
                      <circle r="9" />
                      <title>Light source. Drag it, also outside the picture.</title>
                    </g>
                  </>}
                </svg>
              </div>}
            </div>
            {bg === 'video' && frameError && <p class="hint fs-note">{frameError} Showing black instead.</p>}
            <div class="fs-lower">
              <div class="fs-panel">
                <div class="fs-panel-head"><b>Elements</b><span>{els.length} · drawn top to bottom</span></div>
                <div class="fs-stack" role="listbox" aria-label="Flare elements" tabIndex={0}>
                  {els.map((el, i) => {
                    const asset = assetIn(el.asset), g = el.group, first = g && els[i - 1]?.group !== g;
                    const members = g ? els.filter((e) => e.group === g) : [], allOff = members.every((e) => e.on === false);
                    const header = first && (
                      <div key={`group:${g}:${i}`} class={`fs-group-row${allOff ? ' off' : ''}`}>
                        <IconButton icon={collapsed.has(g) ? ChevronRight : ChevronDown} size={13} title={collapsed.has(g) ? 'Expand group' : 'Collapse group'}
                          onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(g) ? n.delete(g) : n.add(g); return n; })} />
                        <IconButton icon={allOff ? EyeOff : Eye} size={13} title={allOff ? 'Show the group' : 'Hide the group'} onClick={() => groupOn(g, allOff)} />
                        <IconButton icon={Focus} size={13} active={solo === `group:${g}`} title={solo === `group:${g}` ? 'Show all elements' : 'Solo: show only this group'}
                          onClick={() => setSolo(solo === `group:${g}` ? null : `group:${g}`)} />
                        <span class="fs-row-name">{g}<small>{members.length} {members.length === 1 ? 'element' : 'elements'}</small></span>
                        <button class="link small-link" title="Keep the elements, remove the group" onClick={() => ungroup(g)}>Ungroup</button>
                      </div>
                    );
                    if (g && collapsed.has(g)) return header;
                    return [header,
                      <div key={el.id} role="option" aria-selected={el.id === selected}
                        class={`fs-row${g ? ' grouped' : ''}${el.id === selected ? ' sel' : ''}${el.on === false ? ' off' : ''}${solo === el.id ? ' solo' : ''}`}
                        onClick={() => setSelected(el.id)}>
                        <IconButton icon={el.on === false ? EyeOff : Eye} size={13} title={el.on === false ? 'Show element' : 'Hide element'}
                          onClick={(e) => { e.stopPropagation(); setEl(el.id, { on: el.on === false }); }} />
                        <IconButton icon={Focus} size={13} active={solo === el.id} title={solo === el.id ? 'Show all elements' : 'Solo: show only this element'}
                          onClick={(e) => { e.stopPropagation(); setSolo(solo === el.id ? null : el.id); }} />
                        <img src={elementThumb(el.asset, base)} alt="" draggable={false} />
                        <span class="fs-row-name">{asset?.label || el.asset}<small>{where(el)}</small></span>
                        <IconButton icon={ArrowUp} size={12} title="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(el.id, -1); }} />
                        <IconButton icon={ArrowDown} size={12} title="Move down" disabled={i === els.length - 1} onClick={(e) => { e.stopPropagation(); move(el.id, 1); }} />
                        <IconButton icon={Copy} size={12} title="Duplicate (⌘D)" onClick={(e) => { e.stopPropagation(); duplicate(el.id); }} />
                        <IconButton icon={Trash2} size={12} title="Delete (Delete key)" onClick={(e) => { e.stopPropagation(); remove(el.id); }} />
                      </div>];
                  })}
                  {!els.length && <p class="hint">No elements. Add one from the library.</p>}
                </div>
              </div>
              <div class="fs-panel">
                <div class="fs-panel-head"><b>Add element</b><span>Click to add</span></div>
                <div class="fs-groups">
                  {FLARE_GROUPS.map((g) => <button key={g.id} class={`chip${group === g.id ? ' active' : ''}`} onClick={() => setGroup(g.id)}>{g.label}</button>)}
                </div>
                <div class="fs-assets">
                  {group === 'custom' ? <>
                    {Object.entries(base.textures || {}).map(([id, t]) => (
                      <button key={id} class="fs-asset" title={`Add ${t.name}`} onClick={() => add(CUSTOM_PREFIX + id)}>
                        <img src={t.url} alt="" draggable={false} /><span>{t.name}</span>
                        <span class="fs-preset-delete" role="button" tabIndex={0} title={`Remove the texture ${t.name}`} aria-label={`Remove ${t.name}`}
                          onClick={(e) => { e.stopPropagation(); removeTexture(id); }}>×</span>
                      </button>
                    ))}
                    <button class="fs-asset fs-import" title="Use your own image (PNG with transparency, or a flare on black)" onClick={importTexture}>
                      <ImagePlus size={28} /><span>Import texture…</span>
                    </button>
                  </> : FLARE_ASSETS.filter((a) => a.group === group).map((a) => (
                    <button key={a.id} class="fs-asset" title={`Add ${a.label}`} onClick={() => add(a.id)}>
                      <img src={elementThumb(a.id)} alt="" draggable={false} /><span>{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div class="fs-inspector">
            <h4>Flare</h4>
            <FlareGlobals clip={clip} effect={effect} />
            <h4>{sel ? assetIn(sel.asset)?.label || 'Element' : 'Element'}</h4>
            {sel ? <ElementInspector key={sel.id} clip={clip} effectId={effectId} el={sel} p={base} groups={groups} set={(v) => setEl(sel.id, v)} group={(name) => groupElement(sel.id, name)} />
              : <p class="hint">Select an element in the list or in the preview.</p>}
            <p class="hint">Distance places an element on the line from the light source (1) through the optical center (0) to the other side (−1). Spread stretches the reflections without moving the light. Hidden elements are not rendered. Diamonds keyframe a setting at the playhead, for the flare and for each element.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Bytter du til et prosedyrisk element, får det variantens form (for eksempel antall lameller);
// resten av innstillingene beholdes.
function textureChange(el, id) {
  const a = flareAsset(id);
  if (!a?.proc) return { asset: id };
  return { asset: id, ...Object.fromEntries(PROC_KEYS.filter((k) => el[k] === undefined).map((k) => [k, PROC_DEFAULTS[k]])), ...a.defaults };
}

// Tallene har nøkkelbilder som de globale innstillingene: 'vfx.<effekt>.el:<element>:<nøkkel>'.
function ElementInspector({ clip, effectId, el, p, groups, set, group }) {
  const dirt = el.blend === 'dirt', asset = assetOf(p, el.asset), q = asset?.proc ? procParams(el, asset) : null;
  const prop = (key) => vfxElementProp(effectId, el.id, key);
  const n = (key, label, min, max, o = {}) => (
    <Param clip={clip} prop={prop(key)} label={label} min={min} max={max} def={q && PROC_KEYS.includes(key) ? q[key] : makeElement(el.asset, p)[key]}
      step={o.step ?? 0.01} scale={o.scale ?? 1} unit={o.unit ?? ''} precision={o.precision ?? 2} center={o.center} />
  );
  const pct = (key, label, max, o = {}) => n(key, label, o.min ?? 0, max, { step: 1, scale: 100, unit: '%', precision: 0, ...o });
  const textures = [...FLARE_ASSETS, ...Object.keys(p.textures || {}).map((id) => assetOf(p, CUSTOM_PREFIX + id))];
  const [name, setName] = useState(el.group || '');
  useEffect(() => setName(el.group || ''), [el.group]);
  return <>
    <Row label="Texture">
      <Select value={el.asset} onChange={(v) => set(textureChange(el, v))}
        options={textures.filter((a) => a.dirt === dirt).map((a) => ({ value: a.id, label: `${groupLabel(a.group)} · ${a.label}` }))} />
    </Row>
    <Row label="Group">
      <input class="text-input" list="fs-group-names" placeholder="None" aria-label="Group" value={name}
        onInput={(e) => setName(e.currentTarget.value)} onBlur={() => name.trim() !== (el.group || '') && group(name)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <datalist id="fs-group-names">{groups.map((g) => <option key={g} value={g} />)}</datalist>
    </Row>
    {n('distance', 'Distance', -3, 3, { center: 0 })}
    {n('ox', 'Offset X', -100, 100, { step: 0.1, scale: 100, unit: '%', precision: 1, center: 0 })}
    {n('oy', 'Offset Y', -100, 100, { step: 0.1, scale: 100, unit: '%', precision: 1, center: 0 })}
    {n('size', 'Size', 1, 500, { step: 1, scale: 100, unit: '%', precision: 0 })}
    {!dirt && n('rotation', 'Rotation', -180, 180, { step: 1, unit: '°', precision: 0, center: 0 })}
    {n('intensity', 'Intensity', 0, 400, { step: 1, scale: 100, unit: '%', precision: 0 })}
    {n('opacity', 'Opacity', 0, 100, { step: 1, scale: 100, unit: '%', precision: 0 })}
    <PatternChoice clip={clip} prop={prop('tint')} label="Tint" color />
    {!dirt && <Row label="Blend"><Select value={el.blend} options={FLARE_BLENDS} onChange={(v) => set({ blend: v })} /></Row>}
    {q && <>
      {n('blades', 'Blades', 0, 16, { step: 1, precision: 0 })}
      {q.kind === 'iris' && pct('edge', 'Edge', 400)}
      {pct('softness', 'Softness', 100)}
      {q.kind !== 'iris' && n('thickness', 'Thickness', 0.2, 100, { step: 0.1, scale: 100, unit: '%', precision: 1 })}
      {n('chroma', 'Aberration', 0, 30, { step: 0.1, scale: 100, unit: '%', precision: 1 })}
      {pct('spectrum', 'Spectrum', 100)}
      {q.spectrum > 0 && <>
        <Row label="Direction"><Select value={q.gradient} options={FLARE_GRADIENTS} onChange={(v) => set({ gradient: v })} /></Row>
        {pct('phase', 'Hue shift', 100)}
      </>}
    </>}
    {asset && keepsOwnColors(asset) && <p class="hint">Keeps its own rainbow colors. Flare color does not change it; Tint still does.</p>}
    {q?.spectrum > 0 && <p class="hint">Flare color changes the white part of the element; the spectrum keeps its colors. Tint still colors it all.</p>}
    <p class="hint">{dirt
      ? 'Lens dirt stays fixed on the lens and only shows where the light falls on it. Distance and Size move and widen the light that reveals it.'
      : q ? 'Procedural: the shape is calculated for every pixel, so it stays sharp at any resolution. Size is the diameter of the outline as a share of the picture height. Blades is the number of aperture blades; 0 gives a circle. Edge brightens the rim, and Aberration splits the outline into red and blue.'
      : asset?.kit ? 'Calculated for every pixel from the same formula as the texture, so it stays sharp at 4K and above. Size is the element’s width as a share of the picture height.'
      : asset?.url ? 'Your own texture, stored in the project. It is added as light, so a flare photographed on black works too. Size is its width as a share of the picture height.'
      : 'Size is the element’s width as a share of the picture height, so it keeps its shape in any aspect ratio.'}</p>
    <p class="hint">A group keeps elements together in the list, so they can be hidden, soloed or collapsed at once.</p>
  </>;
}
