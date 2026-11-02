import { useEffect, useRef, useState } from 'preact/hooks';
import {
  AppWindow,
  Camera,
  Crop,
  Maximize,
  Timer,
  Circle,
  FolderOpen,
  Keyboard,
  Mic,
  Monitor,
  MousePointer2,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  SlidersHorizontal,
  Volume2,
} from 'lucide-preact';
import { Button, Row, Section, Segmented, Select, Toggle } from '../ui.jsx';
import { MODIFIERS, modifierInfo, saveSettings, settings } from './settings.js';
import * as engine from './engine.js';
import { project, projectFolders } from '../editor/store.js';
import * as editorCommands from '../editor/commands.js';
import { GainControl, MicrophoneMixer } from './MicrophoneMixer.jsx';
import { meterDb } from './mixer.js';
import { RECORDING_VIDEO_FORMATS, recordingAudioChoice, recordingAudioOptions } from '../../shared/recordingFormats.cjs';

const api = window.api;
const isMac = api.platform === 'darwin';

const LAYOUTS = [
  { n: 1, label: 'Camera', cls: 'full-cam' },
  { n: 2, label: 'Screen', cls: 'screen' },
  { n: 3, label: 'Top left', cls: 'screen', cam: 'tl' },
  { n: 4, label: 'Top right', cls: 'screen', cam: 'tr' },
  { n: 5, label: 'Bottom left', cls: 'screen', cam: 'bl' },
  { n: 6, label: 'Bottom right', cls: 'screen', cam: 'br' },
];

export const inputStatus = { value: null };

export function Recorder({ active }) {
  const canvasRef = useRef(null);
  const [input, setInput] = useState(null);
  const [failed, setFailed] = useState([]);
  const [mixerOpen, setMixerOpen] = useState(false);
  const s = settings.value;
  const mod = modifierInfo();

  useEffect(() => {
    engine.attachCanvas(canvasRef.current);
    return () => engine.attachCanvas(null);
  }, []);

  useEffect(() => {
    engine.setActive(active);
    api.setShortcutsActive(active || engine.recording.value);
  }, [active, engine.recording.value]);

  useEffect(() => {
    api.recShowControls(s.showControls);
    api.inputStatus().then(setInput);
    api.setZoomKey(s.zoomKey);
  }, []);

  useEffect(() => {
    api.setShortcuts(s.modifier).then(setFailed);
  }, [s.modifier, s.backgroundShortcuts, input?.started]);

  const set = (patch, after) => {
    saveSettings(patch);
    after?.();
  };

  const requestInput = async () => {
    const r = await api.requestInput();
    setInput(await api.inputStatus());
    if (r.permission !== 'granted' && isMac) api.openPermissionSettings('accessibility');
  };

  const recording = engine.recording.value || engine.countdown.value > 0;
  const zoomKeys = input?.zoomKeys || [];
  const zoomLabel = zoomKeys.find((k) => k.value === s.zoomKey)?.label || 'tasten';
  const inputReady = input?.started;
  const hasVideo = Boolean(s.screenId || s.cameraId);
  const embedsAudio = Boolean((s.screenId && s.systemAudio) || (s.cameraId && s.micId));
  const formatsDisabled = recording || engine.finishing.value;

  return (
    <div class="recorder">
      <div class="rec-stage">
        <div class={`rec-preview${recording ? ' live' : ''}`}>
          <canvas ref={canvasRef} />
          {engine.editingArea.value && engine.activeArea() && <AreaEditor canvasRef={canvasRef} />}
          {recording && <div class="rec-badge">REC</div>}
          {engine.countdown.value > 0 && <div class="rec-countdown">{engine.countdown.value}</div>}
        </div>
        <div class="layout-row">
          {LAYOUTS.map((l) => (
            <button key={l.n} class={`layout-btn${s.layout === l.n ? ' active' : ''}`} title={`${mod.short}${l.n}`} onClick={() => engine.setLayout(l.n)}>
              <div class={`mini ${l.cls}`}>{l.cam && <div class={`cam ${l.cam} ${s.pipShape}`} />}</div>
              <span>
                <b>{l.n}</b> {l.label}
              </span>
            </button>
          ))}
        </div>
        <div class="rec-meta">
          Recording at {engine.canvasSize.value.w} × {engine.canvasSize.value.h}, {s.fps} fps. Screen and camera are saved separately, so everything can be adjusted in the editor.
        </div>
      </div>

      <aside class="panel rec-panel">
        <Section title="Sources">
          <Row label={<><Monitor size={14} /> Screen</>} stacked>
            <Select
              value={s.screenId}
              disabled={recording}
              options={[
                { value: '', label: 'No screen' },
                ...engine.screens.value.filter((x) => x.kind !== 'window').map((x) => ({ value: x.id, label: `${x.name} (${x.width} × ${x.height})` })),
                ...engine.screens.value.filter((x) => x.kind === 'window').map((x) => ({ value: x.id, label: `Window: ${x.name}` })),
              ]}
              onChange={(v) => set({ screenId: v }, engine.useScreen)}
            />
            <button class="link-btn" disabled={recording} onClick={() => engine.refreshScreens()} title="Look for new windows">
              Refresh list of windows
            </button>
            {engine.isWindowSource() && <p class="hint">Only this window is recorded, even if other windows cover it or it is moved. Cursor zoom and click highlights follow the whole screen, so they are off for window recordings.</p>}
          </Row>
          {s.screenId && !engine.isWindowSource() && (
            <Row label={<><Crop size={14} /> Record</>} stacked>
              <Segmented
                value={s.areaMode === 'area' && s.area ? 'area' : 'full'}
                disabled={recording}
                onChange={(v) => (v === 'area' && !s.area ? engine.pickAreaOnScreen() : engine.setAreaMode(v))}
                options={[
                  { value: 'full', label: 'Full Screen', icon: Maximize, showLabel: true },
                  { value: 'area', label: 'Area', icon: Crop, showLabel: true },
                ]}
              />
              {s.areaMode === 'area' && s.area && (
                <div class="area-tools">
                  <Button variant="secondary" class="small" disabled={recording} onClick={engine.pickAreaOnScreen}>
                    Select on Screen
                  </Button>
                  <Button variant={engine.editingArea.value ? 'primary' : 'ghost'} class="small" disabled={recording} onClick={() => engine.setEditingArea(!engine.editingArea.value)}>
                    {engine.editingArea.value ? 'Done' : 'Adjust in Preview'}
                  </Button>
                </div>
              )}
              {s.areaMode === 'area' && s.area && <p class="hint">Only the area is recorded{(() => { engine.canvasSize.value; const o = engine.areaOutputSize(); return o ? `, ${o.w} × ${o.h} pixels` : ''; })()}. A dashed frame on the screen shows it, and it turns red while you record.</p>}
            </Row>
          )}
          <Row label={<><Camera size={14} /> Camera</>} stacked>
            <Select
              value={s.cameraId}
              disabled={recording}
              options={[{ value: '', label: 'No camera' }, ...engine.cameras.value.map((c) => ({ value: c.id, label: c.label }))]}
              onChange={(v) => set({ cameraId: v }, engine.useCamera)}
            />
          </Row>
          <Row label={<><Mic size={14} /> Microphone</>} stacked>
            <Select
              value={s.micId}
              disabled={recording || engine.finishing.value || Boolean(engine.micTest.value)}
              options={[{ value: '', label: 'No microphone' }, ...engine.mics.value.map((m) => ({ value: m.id, label: m.label }))]}
              onChange={(v) => set({ micId: v }, engine.useMic)}
            />
            <div class="meter">
              <div style={{ width: `${engine.level.value * 100}%` }} />
            </div>
            <div class="mic-inline-level"><span>Output</span><output>{meterDb(engine.micLevels.value.output)}</output></div>
            <GainControl value={s.micMixer.gain} disabled={!s.micId} onChange={(gain) => engine.setMicMix({ gain })} />
            <Button class="small mic-open-mixer" icon={SlidersHorizontal} onClick={() => setMixerOpen(true)}>Microphone mixer</Button>
            {s.micId && (
              <div class={`mic-status ${engine.micStatus.value}`}>
                <span>
                  {
                    {
                      none: 'Waiting for the microphone',
                      silent: 'No sound. Check that the microphone is on and not muted.',
                      quiet: 'Very quiet. Move closer or increase input gain.',
                      good: 'Good level',
                      loud: 'Too loud. Lower gain, or the device input level if the input is clipping.',
                    }[engine.micStatus.value]
                  }
                </span>
                <button class="link-btn" disabled={recording || engine.finishing.value || Boolean(engine.micTest.value)} onClick={engine.testMic}>
                  {engine.micTest.value === 'recording' ? 'Speak now…' : engine.micTest.value === 'playing' ? 'Playing back…' : 'Test'}
                </button>
              </div>
            )}
          </Row>
          <Row label={<><Volume2 size={14} /> System audio</>}>
            <Toggle checked={s.systemAudio} disabled={recording || !s.screenId} onChange={(v) => set({ systemAudio: v }, engine.useScreen)} />
          </Row>
        </Section>

        <Section title="Camera">
          <Row label="Shape">
            <Segmented
              value={s.pipShape}
              onChange={(v) => set({ pipShape: v })}
              options={[
                { value: 'circle', label: 'Circle', icon: Circle, showLabel: true },
                { value: 'square', label: 'Square', icon: Square, showLabel: true },
                { value: 'rect', label: '16:9', icon: RectangleHorizontal, showLabel: true },
                { value: 'portrait', label: '9:16', icon: RectangleVertical, showLabel: true },
              ]}
            />
          </Row>
          <Row label="Size">
            <Segmented
              value={s.pipSize}
              onChange={(v) => set({ pipSize: v })}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </Row>
          <Row label="Mirror">
            <Toggle checked={s.mirror} onChange={(v) => set({ mirror: v })} />
          </Row>
          <Row label="Show PiP on screen">
            <Toggle checked={s.showPipOnScreen} disabled={engine.isWindowSource()} onChange={(v) => set({ showPipOnScreen: v })} />
          </Row>
          <p class="hint">
            {engine.isWindowSource()
              ? 'Choose a full display or a screen area to show PiP over the app you are recording.'
              : <>Shows the camera over your other apps at its recorded size and position. Clicks pass through. Use {mod.short}3–6 to change corners. {api.platform !== 'win32' && 'The on-screen camera can also be captured in the screen file. Turn this off to keep the screen file free of the camera for later editing.'}</>}
          </p>
        </Section>

        <Section title="Overlays">
          <Row label={<><Keyboard size={14} /> Show keystrokes</>}>
            <Toggle checked={s.showKeys} onChange={(v) => set({ showKeys: v })} />
          </Row>
          <Row label={<><MousePointer2 size={14} /> Cursor zoom</>}>
            <Toggle checked={s.cursorZoom} onChange={(v) => set({ cursorZoom: v })} />
          </Row>
          {s.cursorZoom && inputReady && (
            <Row label="Hold key">
              <Select
                value={s.zoomKey}
                options={zoomKeys}
                onChange={(v) => {
                  set({ zoomKey: v });
                  api.setZoomKey(v);
                }}
              />
            </Row>
          )}
          <Row label="Highlight clicks">
            <Toggle checked={s.showClicks} onChange={(v) => set({ showClicks: v })} />
          </Row>
          {input && !inputReady && (
            <div class="callout">
              {input.available ? (
                <>
                  <p>
                    {isMac
                      ? 'To show keystrokes and zoom the cursor while you hold a key, Reccut needs Accessibility access.'
                      : 'The keyboard listener could not start.'}
                  </p>
                  <button class="btn secondary small" onClick={requestInput}>
                    Grant Access
                  </button>
                </>
              ) : (
                <p>The keyboard listener is not available. You can toggle cursor zoom with {mod.short}9.</p>
              )}
            </div>
          )}
          <p class="hint">
            {inputReady ? <>Hold <b>{zoomLabel}</b> to zoom the cursor. </> : null}
            Only shortcuts with Cmd, Ctrl or Alt are shown, never regular typing. Reccut's own shortcuts are never shown.
          </p>
        </Section>

        <Section title="Recording">
          <Row label="Video format" stacked>
            <Select value={s.videoFormat} disabled={formatsDisabled || !hasVideo} options={RECORDING_VIDEO_FORMATS} onChange={(v) => set({ videoFormat: v, audioFormat: recordingAudioChoice(v, s.audioFormat, embedsAudio) })} />
          </Row>
          <Row label="Audio format" stacked>
            <Select value={recordingAudioChoice(s.videoFormat, s.audioFormat, embedsAudio)} disabled={formatsDisabled} options={recordingAudioOptions(s.videoFormat, embedsAudio)} onChange={(v) => set({ audioFormat: v })} />
          </Row>
          <p class="hint">{embedsAudio ? 'Audio choices match the video container. Microphone audio without a camera is saved separately.' : 'Microphone audio is saved as a separate file in the selected audio format.'} Files are finalized when you stop; this can take a moment.</p>
          <Row label="Hide Reccut while recording">
            <Toggle checked={s.minimizeOnRecord} onChange={(v) => set({ minimizeOnRecord: v })} />
          </Row>
          <Row label="Show recording controls">
            <Toggle
              checked={s.showControls}
              onChange={(v) => {
                set({ showControls: v });
                api.recShowControls(v);
              }}
            />
          </Row>
          <p class="hint">
            While you record, a small bar with time, pause and stop floats over your other apps{isMac ? ', and the time is shown in the menu bar' : ', and the Reccut icon in the taskbar tray turns red'}. The bar is hidden from the recording{api.platform === 'linux' ? ' on macOS and Windows' : ''}.
          </p>
          <Row label={<><Timer size={14} /> Countdown</>}>
            <Segmented
              value={s.countdown}
              onChange={(v) => set({ countdown: v })}
              options={[
                { value: 0, label: 'Off' },
                { value: 3, label: '3 s' },
                { value: 5, label: '5 s' },
                { value: 10, label: '10 s' },
              ]}
            />
          </Row>
          <Row label="Frame rate">
            <Segmented value={s.fps} disabled={recording} onChange={(v) => set({ fps: v }, engine.useScreen)} options={[{ value: 30, label: '30' }, { value: 60, label: '60' }]} />
          </Row>
          <Row label="Render video automatically">
            <Toggle checked={s.autoRender} onChange={(v) => set({ autoRender: v })} />
          </Row>
          <Row label={<><AppWindow size={14} /> Include Reccut in screen capture</>}>
            <Toggle
              checked={!s.hideFromCapture}
              onChange={(v) => set({ hideFromCapture: !v })}
            />
          </Row>
          <Row label="Saved in project" stacked>
            <button class="path-btn" title={projectFolders.value?.recordings || ''} disabled={recording} onClick={() => (editorCommands.projectsOpen.value = true)}>
              <FolderOpen size={14} />
              <span>{project.value.name}</span>
            </button>
          </Row>
          <p class="hint">Recordings go into the Recordings folder of the open project and appear in its media browser.</p>
        </Section>

        <Section title="Shortcuts">
          <Row label="Allow shortcuts in other apps">
            <Toggle checked={s.backgroundShortcuts} onChange={(v) => set({ backgroundShortcuts: v })} />
          </Row>
          <Row label="Keys" stacked>
            <Select value={s.modifier} options={MODIFIERS} onChange={(v) => set({ modifier: v })} />
          </Row>
          <p class="hint">
            <b>{mod.short}0</b> starts and stops recording. <b>{mod.short}8</b> pauses and resumes. {mod.short}1 camera, {mod.short}2 screen and {mod.short}3 to {mod.short}6 corners.
            {' '}By default, these keys work only in Reccut, outside input fields and dialogs. Enable “Allow shortcuts in other apps” to use them in the background; those combinations can then override shortcuts in other apps. You can always use the floating controls or tray menu to pause and stop.
            {failed.length > 0 && <span class="warn"> Used by another app: {failed.join(', ')}.</span>}
            {isMac && s.modifier === 'Command+Shift' && <span class="warn"> Cmd + Shift + 3, 4 and 5 are used by macOS for screenshots.</span>}
            {!isMac && s.modifier === 'Control+Alt' && <span class="warn"> Ctrl + Alt is the same as AltGr on many European keyboards.</span>}
          </p>
        </Section>
      </aside>
      {mixerOpen && <MicrophoneMixer onClose={() => setMixerOpen(false)} />}
    </div>
  );
}

// Juster området i forhåndsvisningen: hele skjermen vises, og området kan flyttes og endres.
const AREA_HANDLES = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function AreaEditor({ canvasRef }) {
  const [box, setBox] = useState(null);
  const a = engine.activeArea();
  useEffect(() => {
    const cv = canvasRef.current;
    const measure = () => setBox({ left: cv.offsetLeft, top: cv.offsetTop, width: cv.offsetWidth, height: cv.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  if (!box || !a) return null;
  const start = (e, hx, hy) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const a0 = { ...a };
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev) => {
      const dx = (ev.clientX - x0) / box.width;
      const dy = (ev.clientY - y0) / box.height;
      let { x, y, w, h } = a0;
      if (!hx && !hy) {
        x = Math.min(Math.max(0, x + dx), 1 - w);
        y = Math.min(Math.max(0, y + dy), 1 - h);
      } else {
        let x1 = x;
        let y1 = y;
        let x2 = x + w;
        let y2 = y + h;
        if (hx < 0) x1 = Math.min(Math.max(0, x1 + dx), x2 - 0.03);
        if (hx > 0) x2 = Math.max(Math.min(1, x2 + dx), x1 + 0.03);
        if (hy < 0) y1 = Math.min(Math.max(0, y1 + dy), y2 - 0.03);
        if (hy > 0) y2 = Math.max(Math.min(1, y2 + dy), y1 + 0.03);
        [x, y, w, h] = [x1, y1, x2 - x1, y2 - y1];
      }
      engine.setArea({ x, y, w, h });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <div
      class="area-box"
      title="Drag to move the area, drag the corners and edges to resize it"
      style={{ left: box.left + a.x * box.width, top: box.top + a.y * box.height, width: a.w * box.width, height: a.h * box.height }}
      onPointerDown={(e) => start(e, 0, 0)}
    >
      <span class="area-size">
        {(() => {
          const o = engine.areaOutputSize();
          return o ? `${o.w} × ${o.h}` : '';
        })()}
      </span>
      {AREA_HANDLES.map(([hx, hy]) => (
        <span key={`${hx}${hy}`} class="area-handle" style={{ left: `${(hx + 1) * 50}%`, top: `${(hy + 1) * 50}%`, cursor: hx && hy ? (hx === hy ? 'nwse-resize' : 'nesw-resize') : hx ? 'ew-resize' : 'ns-resize' }} onPointerDown={(e) => start(e, hx, hy)} />
      ))}
    </div>
  );
}
