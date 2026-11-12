// Redigeringsrommet: bibliotek, visning og inspektør øverst, tidslinje nederst.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CAPTION_LANE, formatTimecode } from '../../shared/model.js';
import { ATTRIBUTE_GROUPS } from '../../shared/attributes.js';
import { Browser } from './Browser.jsx';
import { Viewer } from './Viewer.jsx';
import { Inspector } from './Inspector.jsx';
import { Timeline } from './Timeline.jsx';
import { ImportBrowser } from './ImportBrowser.jsx';
import { SlideshowDialog } from './SlideshowDialog.jsx';
import { MulticamEditor } from './Multicam.jsx';
import { audioSkimming, commit, makeCaptionClip, needsProject, project, skimming, snapping } from './store.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { cancelLayerImport, finish as finishLayers, layerImport } from './layers.js';
import { Button, Modal, NumberField, Row, Section, Segmented, Select, Toggle, toast } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { toggleViewerFullscreen } from './fullscreen.js';

const api = window.api;

// Ferdige undertekster fra Whisper legges inn i undertekstsporet.
api.onTranscribeDone(({ segments, payload }) => {
  // The AI agent reads its own transcriptions; they do not replace the captions.
  if (payload.projectId !== project.value.id || payload.agent) return;
  if (!segments.length) {
    toast('No speech was found to caption.');
    return;
  }
  commit((p) => {
    for (const c of Object.values(p.clips)) if (c.lane === CAPTION_LANE) delete p.clips[c.id];
    for (const s of segments) {
      const c = makeCaptionClip(s.start, s.text, Math.max(0.5, s.end - s.start));
      p.clips[c.id] = c;
    }
  });
  toast(`Added ${segments.length} captions. Read through them and fix any mistakes in the Captions tab.`, { kind: 'success', timeout: 9000 });
});
api.onTranscribeError(({ error, payload }) => {
  if (error !== 'Canceled' && !payload?.agent) toast(`Auto captions failed: ${error}`, { kind: 'error', timeout: 10000 });
});

export function Editor({ active }) {
  const [split, setSplit] = useState(() => Number(localStorage.getItem('editorSplit')) || 0.56);
  const [sides, setSides] = useState(() => ({ browser: Number(localStorage.getItem('editorBrowserW')) || 300, inspector: Number(localStorage.getItem('editorInspectorW')) || 320 }));
  const ref = useRef(null);
  const browserVisible = prefs.value.editorBrowserVisible;
  const inspectorVisible = prefs.value.editorInspectorVisible;

  useEffect(() => {
    if (!active) {
      playback.pause();
      if (document.fullscreenElement === ref.current?.querySelector('.viewer')) toggleViewerFullscreen();
    }
  }, [active]);

  const onDividerDown = (e) => {
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const move = (ev) => {
      const k = Math.min(0.78, Math.max(0.3, (ev.clientY - rect.top) / rect.height));
      setSplit(k);
      localStorage.setItem('editorSplit', String(k));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Biblioteket og inspektøren kan dras bredere. Visningen i midten blir smalere, men aldri under 320 px.
  const onSideDown = (side) => (e) => {
    e.preventDefault();
    const top = e.currentTarget.closest('.editor-top').getBoundingClientRect();
    const other = side === 'browser' ? (inspectorVisible ? sides.inspector : 0) : browserVisible ? sides.browser : 0;
    const move = (ev) => {
      const w = Math.round(Math.min(top.width - other - 320, Math.max(220, side === 'browser' ? ev.clientX - top.left : top.right - ev.clientX)));
      setSides((s) => ({ ...s, [side]: w }));
      localStorage.setItem(side === 'browser' ? 'editorBrowserW' : 'editorInspectorW', String(w));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div class="editor" ref={ref} style={{ gridTemplateRows: `${split * 100}% 6px 1fr` }}>
      <div class="editor-top" style={{ gridTemplateColumns: [browserVisible && `${sides.browser}px`, 'minmax(320px, 1fr)', inspectorVisible && `${sides.inspector}px`].filter(Boolean).join(' ') }}>
        <div class="editor-side" hidden={!browserVisible}>
          <Browser />
          <div class="side-resize right" onPointerDown={onSideDown('browser')} />
        </div>
        <Viewer />
        <div class="editor-side" hidden={!inspectorVisible}>
          <Inspector />
          <div class="side-resize left" onPointerDown={onSideDown('inspector')} />
        </div>
      </div>
      <div class="divider" onPointerDown={onDividerDown} />
      <Timeline />
      {commands.syncDialog.value && <SyncDialog />}
      {commands.attributesDialog.value && <AttributesDialog />}
      {commands.importOptions.value && !needsProject.value && <ImportOptionsDialog />}
      {commands.slideshowDialog.value && <SlideshowDialog />}
      {layerImport.value && <LayerImportDialog key={layerImport.value.file} />}
      {active && <MulticamEditor />}
    </div>
  );
}

// Lag fra Photoshop eller Illustrator (SVG): velg lag, og om de skal komme hver for seg eller sammenslått.
function LayerImportDialog() {
  const req = layerImport.value;
  const [picked, setPicked] = useState(() => new Set(req.layers.filter((l) => l.visible).map((l) => l.index)));
  const [mode, setMode] = useState('layers');
  const [toTimeline, setToTimeline] = useState(true);
  const name = req.file.split(/[\\/]/).pop();
  const toggle = (i) => {
    const next = new Set(picked);
    next.has(i) ? next.delete(i) : next.add(i);
    setPicked(next);
  };
  // Øverste lag først, som i Photoshop.
  const list = [...req.layers].reverse();
  return (
    <Modal
      title={`Import Layers from ${name}`}
      width={560}
      onClose={cancelLayerImport}
      footer={
        <>
          <Button onClick={cancelLayerImport}>Cancel</Button>
          <Button variant="primary" disabled={!picked.size} onClick={() => finishLayers(req, [...picked].sort((a, b) => a - b), mode, toTimeline)}>
            {mode === 'layers' ? `Import ${picked.size} Layer${picked.size === 1 ? '' : 's'}` : 'Import Merged Image'}
          </Button>
        </>
      }
    >
      <div class="layer-head">
        <img src={req.thumb} alt="" />
        <div>
          <b>{name}</b>
          <span>
            {req.width} × {req.height}, {req.layers.length} layers
          </span>
          <span class="layer-quick">
            <button class="link" onClick={() => setPicked(new Set(req.layers.map((l) => l.index)))}>
              All
            </button>
            <button class="link" onClick={() => setPicked(new Set(req.layers.filter((l) => l.visible).map((l) => l.index)))}>
              Visible
            </button>
            <button class="link" onClick={() => setPicked(new Set())}>
              None
            </button>
          </span>
        </div>
      </div>
      <div class="layer-list">
        {list.map((l) => (
          <label key={l.index} class={`layer-row${picked.has(l.index) ? ' on' : ''}`}>
            <input type="checkbox" checked={picked.has(l.index)} onChange={() => toggle(l.index)} />
            <img src={l.thumb} alt="" />
            <span class="layer-name">
              {l.name}
              {l.group && <small>{l.group}</small>}
            </span>
            {!l.visible && <small class="dim">Hidden</small>}
          </label>
        ))}
      </div>
      <Section title="Import As" collapsible={false}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'layers', label: 'Separate layers' },
            { value: 'merged', label: 'One merged image' },
          ]}
        />
        <Row label="Add to the timeline at the playhead">
          <Toggle checked={toTimeline} onChange={setToTimeline} />
        </Row>
        <p class="hint">
          {mode === 'layers'
            ? 'Each layer becomes an image with transparency, in the size of the document, so the layers line up. On the timeline they are stacked above the storyline and grouped, so they move together. Animate each one in the Video tab.'
            : 'The chosen layers are combined into one image.'}
        </p>
      </Section>
    </Modal>
  );
}

// Importvinduet: en filbrowser der filene krysses av (eller slippes inn fra Finder), og valgene for importen ved siden av.
function ImportOptionsDialog() {
  const { paths } = commands.importOptions.value;
  const p = prefs.value;
  const [sync, setSync] = useState(false);
  const [sequence, setSequence] = useState(false);
  const [fps, setFps] = useState(project.value.fps || 30);
  const close = () => (commands.importOptions.value = null);
  const go = () => commands.confirmImport({ copy: p.importCopy, optimize: p.importOptimize, sync, sequenceFps: sequence ? fps : null })
    .catch((err) => toast(`Could not import the files: ${err.message}`, { kind: 'error' }));
  const setPaths = (next) => (commands.importOptions.value = { ...commands.importOptions.value, paths: next });
  const onDrop = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    commands.addImportPaths(droppedPaths(e.dataTransfer, api.pathForFile));
  };
  return (
    <Modal
      title="Import Media"
      width={1180}
      class="import-modal"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!paths.length} onClick={go}>
            {paths.length > 1 ? `Import ${paths.length} Files` : 'Import'}
          </Button>
        </>
      }
    >
      <div onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={onDrop}>
        <ImportBrowser paths={paths} onChange={setPaths}>
          <Section title="Location" collapsible={false}>
            <Segmented
              value={p.importCopy ? 'copy' : 'keep'}
              onChange={(v) => setPrefs({ importCopy: v === 'copy' })}
              options={[
                { value: 'copy', label: 'Copy to project' },
                { value: 'keep', label: 'Leave in place' },
              ]}
            />
            <p class="hint">
              {p.importCopy
                ? 'The files are copied into the Media folder of the project, so the project keeps working if the originals are moved or the drive is disconnected.'
                : 'The project refers to the files where they are now. This saves disk space, but the project needs the files to stay in the same place.'}
            </p>
          </Section>
          <Section title="Transcoding" collapsible={false}>
            <Row label="Create optimized media">
              <Toggle checked={p.importOptimize} onChange={(v) => setPrefs({ importOptimize: v })} />
            </Row>
            <p class="hint">Converts the clips to a high quality format that is smooth to edit. 10-bit and HDR clips keep their 10 bits. Runs in the background.</p>
          </Section>
          {paths.some(commands.isNumberedImage) && (
            <Section title="Image Sequence" collapsible={false}>
              <Row label="Import numbered images as one video">
                <Toggle checked={sequence} onChange={setSequence} />
              </Row>
              {sequence && (
                <Row label="Frame rate">
                  <Select
                    value={commands.FPS_PRESETS.includes(fps) ? String(fps) : 'custom'}
                    options={[...commands.FPS_PRESETS.map((v) => ({ value: String(v), label: `${v} fps` })), { value: 'custom', label: 'Custom' }]}
                    onChange={(v) => v !== 'custom' && setFps(Number(v))}
                  />
                  <NumberField value={fps} onChange={setFps} min={1} max={240} step={1} precision={fps % 1 ? 3 : 0} unit="fps" />
                </Row>
              )}
              <p class="hint">
                {sequence
                  ? 'All the frames in each numbered sequence become one video clip, also the ones you did not tick. One frame is enough. Frames with transparency keep it.'
                  : 'Each image is imported as a still image.'}
              </p>
            </Section>
          )}
          {paths.length > 1 && (
            <Section title="Audio" collapsible={false}>
              <Row label="Synchronize audio files with video">
                <Toggle checked={sync} onChange={setSync} />
              </Row>
              <p class="hint">Finds audio files that match the sound of the video clips, and adds them to the clips as an extra audio track. The camera audio is switched off but kept.</p>
            </Section>
          )}
        </ImportBrowser>
      </div>
    </Modal>
  );
}

// Lydklippet passer under flere videoklipp: synk med det første, eller del opp og legg en bit under hvert.
// Paste Attributes og Remove Attributes, som i Final Cut Pro: kryss av for det som skal med.
// Valgene huskes til neste gang.
function AttributesDialog() {
  const d = commands.attributesDialog.value;
  const paste = d.mode === 'paste';
  const close = () => (commands.attributesDialog.value = null);
  const remembered = (() => {
    try {
      return JSON.parse(localStorage.getItem(`attrs:${d.mode}`) || 'null');
    } catch {
      return null;
    }
  })();
  const [checked, setChecked] = useState(() => new Set(d.available.filter((id) => !remembered || remembered.includes(id))));
  const [stretch, setStretch] = useState(() => localStorage.getItem('attrs:stretch') === '1');
  const toggle = (id, v) => {
    const n = new Set(checked);
    v ? n.add(id) : n.delete(id);
    setChecked(n);
  };
  const ok = () => {
    try {
      localStorage.setItem(`attrs:${d.mode}`, JSON.stringify([...checked]));
      localStorage.setItem('attrs:stretch', stretch ? '1' : '0');
    } catch {}
    commands.confirmAttributes([...checked], stretch);
  };
  const groups = (kind) => ATTRIBUTE_GROUPS.filter((g) => g.kind === kind);
  const setAll = (kind, on) => {
    const n = new Set(checked);
    for (const g of groups(kind)) if (d.available.includes(g.id)) on ? n.add(g.id) : n.delete(g.id);
    setChecked(n);
  };
  const column = (kind, title) => (
    <div class="attr-col">
      <h4>
        <label>
          <input type="checkbox" checked={groups(kind).filter((g) => d.available.includes(g.id)).every((g) => checked.has(g.id))} onChange={(e) => setAll(kind, e.currentTarget.checked)} />
          {title}
        </label>
      </h4>
      {groups(kind).map((g) => (
        <label key={g.id} class={`attr-row${d.available.includes(g.id) ? '' : ' disabled'}`} title={g.desc}>
          <input type="checkbox" disabled={!d.available.includes(g.id)} checked={checked.has(g.id)} onChange={(e) => toggle(g.id, e.currentTarget.checked)} />
          {g.label}
        </label>
      ))}
    </div>
  );
  return (
    <Modal
      title={paste ? 'Paste Attributes' : 'Remove Attributes'}
      width={460}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!checked.size} onClick={ok}>
            {paste ? 'Paste' : 'Remove'}
          </Button>
        </>
      }
    >
      <p class="sync-lead">{paste ? `Choose what to paste from ${d.source} into the selected clips. Attributes that were not changed on the copied clip are greyed out.` : 'Choose what to remove from the selected clips. They go back to their standard settings.'}</p>
      <div class="attr-cols">
        {column('video', 'Video Attributes')}
        {column('audio', 'Audio Attributes')}
      </div>
      {paste && (
        <Row label="Keyframes">
          <Segmented
            value={stretch ? 'stretch' : 'maintain'}
            onChange={(v) => setStretch(v === 'stretch')}
            options={[
              { value: 'maintain', label: 'Maintain Timing' },
              { value: 'stretch', label: 'Stretch to Fit' },
            ]}
          />
        </Row>
      )}
    </Modal>
  );
}

function SyncDialog() {
  const { jobs } = commands.syncDialog.value;
  const p = project.value;
  const close = () => (commands.syncDialog.value = null);
  const rows = jobs.flatMap((j) => j.matches.map((m) => ({ ...m, audio: p.clips[j.audioId]?.name || 'Audio' })));
  const count = rows.length;
  return (
    <Modal
      title="Auto Sync Audio"
      width={500}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button onClick={() => commands.finishSync(jobs, 'first')}>Sync to First Clip</Button>
          <Button variant="primary" onClick={() => commands.finishSync(jobs, 'split')}>
            Split and Place
          </Button>
        </>
      }
    >
      <p class="sync-lead">
        The audio matches {count} video clips on the timeline. Each clip was compared with the whole recording, so every piece is placed where its sound matches, even if the clips are in a different order. Sync it to the first clip, or split it and place a matching piece under each clip.
      </p>
      <ul class="sync-list">
        {rows.map((r, i) => (
          <li key={i}>
            <span>
              {p.clips[r.videoId]?.name || 'Clip'} <span class="muted">from {r.audio} at {formatTimecode(Math.max(0, r.at), p.fps)}</span>
            </span>
            <span class="muted">{Math.round(r.score * 100)}% match</span>
          </li>
        ))}
      </ul>
      <Row label="Group audio with the video">
        <Toggle checked={prefs.value.syncGroup} onChange={(v) => setPrefs({ syncGroup: v })} />
      </Row>
      <Row label="Switch off the camera audio (kept in the clip)">
        <Toggle checked={prefs.value.syncMuteCamera} onChange={(v) => setPrefs({ syncMuteCamera: v })} />
      </Row>
    </Modal>
  );
}

