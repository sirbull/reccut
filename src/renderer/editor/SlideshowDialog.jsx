import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button, Modal, Row, Select } from '../ui.jsx';
import { project } from './store.js';
import { slideshowDialog, confirmSlideshow } from './commands.js';
import { prefs } from '../prefs.js';
import { fileUrl } from '../player.js';
import { TRANSITIONS, computeFrame, formatDuration } from '../../shared/model.js';
import { IMAGE_FITS } from '../../shared/imageMotion.js';
import { drawFrame } from '../../shared/render.js';
import { SLIDESHOW_DEFAULTS, slideshowOptions, slideshowPreviewProject } from '../../shared/slideshow.js';

export function SlideshowDialog() {
  const request = slideshowDialog.value, source = project.value;
  const [options, setOptions] = useState(() => slideshowOptions({ ...SLIDESHOW_DEFAULTS, ...prefs.value.slideshow }, source.fps));
  const [remember, setRemember] = useState(true), [error, setError] = useState('');
  const patch = (key, value) => setOptions((p) => ({ ...p, [key]: value }));
  const ids = request.ids, settings = useMemo(() => slideshowOptions(options, source.fps), [options, source.fps]);
  const invalid = !(options.duration >= 2 / source.fps && options.duration <= 3600)
    ? 'Enter a valid photo duration.'
    : options.transitionMode !== 'none' && !(options.transitionDuration >= 1 / source.fps && options.transitionDuration <= Math.min(4, options.duration * 0.45))
      ? 'Transition duration must be shorter than half a photo, and no more than 4 seconds.'
      : options.transitionMode === 'random' && !options.transitions.length ? 'Choose at least one transition.'
        : source.lanes?.[0]?.locked ? 'Unlock the storyline before adding the slideshow.' : '';
  const close = () => { slideshowDialog.value = null; };
  const create = () => {
    try { confirmSlideshow(settings, remember); }
    catch (err) { setError(err.message); }
  };
  const numeric = (key, label, min, max, step = 0.1, unit = 's') => <Row label={label}>
    <input type="number" class="text-input slideshow-number" aria-label={label} value={options[key]} min={min} max={max} step={step}
      onInput={(e) => patch(key, Number(e.currentTarget.value))} /><span class="unit">{unit}</span>
  </Row>;
  return <Modal title="Add as Slideshow" width={940} class="slideshow-modal" onClose={close} footer={<>
    <label class="slideshow-remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} /> Remember these settings</label>
    <Button onClick={close}>Cancel</Button><Button variant="primary" disabled={Boolean(invalid)} onClick={create}>Add {ids.length} Photos</Button>
  </>}>
    <div class="slideshow-layout">
      <div class="slideshow-preview-column">
        <SlideshowPreview source={source} ids={ids} options={settings} />
        <div class="slideshow-summary"><b>{ids.length} photos · {formatDuration(ids.length * settings.duration)}</b>
          <p>Appends after the existing timeline. Transitions are centered on the cuts.</p>
          <p>{settings.background ? 'Each photo gets a separate, editable background copy on the track below. Image pairs move and transition together.' : 'Creates ordinary image clips in the storyline.'}</p>
          <p>Adjust each image later in Video → Image framing & motion. Original files stay in the media browser.</p>
        </div>
      </div>
      <div class="slideshow-settings">
        <fieldset><legend>Timing & order</legend>
          {numeric('duration', 'Photo duration', 2 / source.fps, 3600)}
          <Row label="Photo order"><Select value={options.order} options={[
            { value: 'browser', label: 'Media browser order' }, { value: 'name', label: 'File name' }, { value: 'shuffle', label: 'Random order' },
          ]} onChange={(v) => patch('order', v)} /></Row>
        </fieldset>
        <fieldset><legend>Transitions</legend>
          <Row label="Between photos"><Select value={options.transitionMode} options={[
            { value: 'none', label: 'None · straight cuts' }, { value: 'dissolve', label: 'Cross Dissolve only' }, { value: 'random', label: 'Random from selected types' },
          ]} onChange={(v) => patch('transitionMode', v)} /></Row>
          {options.transitionMode !== 'none' && numeric('transitionDuration', 'Transition duration', 1 / source.fps, Math.min(4, options.duration * 0.45))}
          {options.transitionMode === 'random' && <div class="slideshow-transition-list">
            {TRANSITIONS.map((t) => <label key={t.id}><input type="checkbox" checked={options.transitions.includes(t.id)}
              onChange={(e) => { const checked = e.currentTarget.checked; setOptions((p) => ({ ...p, transitions: checked ? [...new Set([...p.transitions, t.id])] : p.transitions.filter((id) => id !== t.id) })); }} />{t.label}</label>)}
          </div>}
        </fieldset>
        <fieldset><legend>Framing & motion</legend>
          <Row label="Image fit"><Select value={options.fit} options={IMAGE_FITS} onChange={(v) => patch('fit', v)} /></Row>
          <Row label="Movement"><Select value={options.motion} options={[
            { value: 'none', label: 'None · still images' }, { value: 'kenBurns', label: 'Ken Burns · pan & zoom' }, { value: 'pan', label: 'Slow pan' },
          ]} onChange={(v) => patch('motion', v)} /></Row>
          {options.motion !== 'none' && <Row label="Motion amount"><input type="range" min="1" max="40" step="1" aria-label="Motion amount"
            value={Math.round(options.amount * 100)} onInput={(e) => patch('amount', Number(e.currentTarget.value) / 100)} /><span>{Math.round(options.amount * 100)}%</span></Row>}
          <p class="hint">Fill height/width may crop the opposite edge. Stretch changes image proportions.</p>
        </fieldset>
        <fieldset><legend>Background</legend>
          <label class="slideshow-check"><input type="checkbox" checked={options.background} onChange={(e) => patch('background', e.currentTarget.checked)} /> Dark, blurred copy of each photo</label>
          {options.background && <>
            {numeric('backgroundBlur', 'Background blur', 0, 80, 1, 'px')}
            <Row label="Darkening"><input type="range" min="0" max="100" step="1" aria-label="Background darkening" value={Math.round(options.backgroundDarken * 100)}
              onInput={(e) => patch('backgroundDarken', Number(e.currentTarget.value) / 100)} /><span>{Math.round(options.backgroundDarken * 100)}%</span></Row>
          </>}
        </fieldset>
        {(invalid || error) && <p class="slideshow-error" role="alert">{invalid || error}</p>}
      </div>
    </div>
  </Modal>;
}

function SlideshowPreview({ source, ids, options }) {
  const cv = useRef(null), images = useRef(new Map()), time = useRef(0);
  const [version, setVersion] = useState(0), [playing, setPlaying] = useState(true), [clock, setClock] = useState(0);
  const preview = useMemo(() => slideshowPreviewProject(source, ids, options.transitionMode === 'random' && !options.transitions.length ? { ...options, transitionMode: 'none' } : options), [source, ids, options]);
  useEffect(() => {
    let live = true;
    for (const id of [...new Set(Object.values(preview.clips).map((c) => c.mediaId).filter(Boolean))]) {
      const m = source.media[id], path = m?.streams?.main?.proxy || m?.path || m?.streams?.main?.path;
      if (!path || images.current.has(id)) continue;
      const image = new Image(); images.current.set(id, image);
      image.onload = image.onerror = () => { if (live) setVersion((v) => v + 1); };
      image.src = /^(data:|blob:)/.test(path) ? path : fileUrl(path);
    }
    return () => { live = false; };
  }, [ids, options.order]);
  useEffect(() => {
    time.current = Math.min(time.current, Math.max(0, preview.duration - 0.01));
    let raf, last = performance.now(), painted = 0, label = 0;
    const draw = (now) => {
      if (playing) time.current = (time.current + Math.min(0.1, (now - last) / 1000)) % preview.duration;
      last = now;
      if (now - painted > 50) {
        painted = now; const canvas = cv.current;
        drawFrame(canvas.getContext('2d'), preview, computeFrame(preview, time.current), (clip) => {
          const img = images.current.get(clip.mediaId);
          return img?.naturalWidth ? { img, w: img.naturalWidth, h: img.naturalHeight } : null;
        }, { scale: canvas.width / preview.width });
      }
      if (now - label > 150) { label = now; setClock(time.current); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [preview, playing, version]);
  return <div class="slideshow-preview">
    <div class="slideshow-preview-frame" style={{ aspectRatio: String(source.width / source.height) }}>
      <canvas ref={cv} width="560" height={Math.round(560 * source.height / source.width)} aria-label="Slideshow preview" />
    </div>
    <div class="slideshow-preview-controls"><Button class="small" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</Button>
      <input type="range" aria-label="Preview position" min="0" max={Math.max(0.01, preview.duration - 0.01)} step="0.05" value={clock}
        onInput={(e) => { time.current = Number(e.currentTarget.value); setClock(time.current); }} /><span>{clock.toFixed(1)}s</span>
    </div>
    <p class="hint">Preview of the first {Math.min(3, ids.length)} photos. Random choices vary when the slideshow is created.</p>
  </div>;
}
