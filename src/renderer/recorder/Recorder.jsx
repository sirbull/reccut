import { useEffect, useRef, useState } from 'preact/hooks';
import {
  AppWindow,
  Camera,
  Circle,
  FolderOpen,
  Keyboard,
  Mic,
  Monitor,
  MousePointer2,
  RectangleHorizontal,
  Square,
  Volume2,
} from 'lucide-preact';
import { Row, Section, Segmented, Select, Toggle } from '../ui.jsx';
import { MODIFIERS, modifierInfo, saveSettings, settings } from './settings.js';
import * as engine from './engine.js';

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
  const [baseDir, setBaseDir] = useState('');
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
    api.baseDir().then(setBaseDir);
    api.inputStatus().then(setInput);
    api.hideFromCapture(s.hideFromCapture);
    api.setZoomKey(s.zoomKey);
  }, []);

  useEffect(() => {
    api.setShortcuts(s.modifier).then(setFailed);
  }, [s.modifier, input?.started]);

  const set = (patch, after) => {
    saveSettings(patch);
    after?.();
  };

  const requestInput = async () => {
    const r = await api.requestInput();
    setInput(await api.inputStatus());
    if (r.permission !== 'granted' && isMac) api.openPermissionSettings('accessibility');
  };

  const recording = engine.recording.value;
  const zoomKeys = input?.zoomKeys || [];
  const zoomLabel = zoomKeys.find((k) => k.value === s.zoomKey)?.label || 'tasten';
  const inputReady = input?.started;

  return (
    <div class="recorder">
      <div class="rec-stage">
        <div class={`rec-preview${recording ? ' live' : ''}`}>
          <canvas ref={canvasRef} />
          {recording && <div class="rec-badge">REC</div>}
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
              options={[{ value: '', label: 'No screen' }, ...engine.screens.value.map((x) => ({ value: x.id, label: `${x.name} (${x.width} × ${x.height})` }))]}
              onChange={(v) => set({ screenId: v }, engine.useScreen)}
            />
          </Row>
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
              disabled={recording}
              options={[{ value: '', label: 'No microphone' }, ...engine.mics.value.map((m) => ({ value: m.id, label: m.label }))]}
              onChange={(v) => set({ micId: v }, engine.useMic)}
            />
            <div class="meter">
              <div style={{ width: `${engine.level.value * 100}%` }} />
            </div>
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
                      ? 'To show keystrokes and zoom the cursor while you hold a key, OBSlite needs Accessibility access.'
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
            Only shortcuts with Cmd, Ctrl or Alt are shown, never regular typing. OBSlite's own shortcuts are never shown.
          </p>
        </Section>

        <Section title="Recording">
          <Row label="Frame rate">
            <Segmented value={s.fps} disabled={recording} onChange={(v) => set({ fps: v }, engine.useScreen)} options={[{ value: 30, label: '30' }, { value: 60, label: '60' }]} />
          </Row>
          <Row label="Render video automatically">
            <Toggle checked={s.autoRender} onChange={(v) => set({ autoRender: v })} />
          </Row>
          <Row label={<><AppWindow size={14} /> Hide OBSlite from recording</>}>
            <Toggle
              checked={s.hideFromCapture}
              onChange={(v) => {
                set({ hideFromCapture: v });
                api.hideFromCapture(v);
              }}
            />
          </Row>
          <Row label="Save to" stacked>
            <button
              class="path-btn"
              title={s.outputDir || baseDir}
              onClick={async () => {
                const dir = await api.chooseDir(s.outputDir || baseDir);
                if (dir) set({ outputDir: dir });
              }}
            >
              <FolderOpen size={14} />
              <span>{s.outputDir || baseDir}</span>
            </button>
          </Row>
        </Section>

        <Section title="Shortcuts">
          <Row label="Keys" stacked>
            <Select value={s.modifier} options={MODIFIERS} onChange={(v) => set({ modifier: v })} />
          </Row>
          <p class="hint">
            {mod.short}1 camera, {mod.short}2 screen, {mod.short}3 to {mod.short}6 corners. {mod.short}0 starts and stops recording.
            {failed.length > 0 && <span class="warn"> Used by another app: {failed.join(', ')}.</span>}
            {isMac && s.modifier === 'Command+Shift' && <span class="warn"> Cmd + Shift + 3, 4 and 5 are used by macOS for screenshots.</span>}
            {!isMac && s.modifier === 'Control+Alt' && <span class="warn"> Ctrl + Alt is the same as AltGr on many European keyboards.</span>}
          </p>
        </Section>
      </aside>
    </div>
  );
}
