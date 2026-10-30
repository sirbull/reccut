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
  { n: 1, label: 'Kamera', cls: 'full-cam' },
  { n: 2, label: 'Skjerm', cls: 'screen' },
  { n: 3, label: 'Oppe venstre', cls: 'screen', cam: 'tl' },
  { n: 4, label: 'Oppe høyre', cls: 'screen', cam: 'tr' },
  { n: 5, label: 'Nede venstre', cls: 'screen', cam: 'bl' },
  { n: 6, label: 'Nede høyre', cls: 'screen', cam: 'br' },
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
          Opptak i {engine.canvasSize.value.w} × {engine.canvasSize.value.h} · {s.fps} fps · skjerm og kamera lagres hver for seg, så alt kan justeres i redigeringen
        </div>
      </div>

      <aside class="panel rec-panel">
        <Section title="Kilder">
          <Row label={<><Monitor size={14} /> Skjerm</>} stacked>
            <Select
              value={s.screenId}
              disabled={recording}
              options={[{ value: '', label: 'Ingen skjerm' }, ...engine.screens.value.map((x) => ({ value: x.id, label: `${x.name} (${x.width} × ${x.height})` }))]}
              onChange={(v) => set({ screenId: v }, engine.useScreen)}
            />
          </Row>
          <Row label={<><Camera size={14} /> Kamera</>} stacked>
            <Select
              value={s.cameraId}
              disabled={recording}
              options={[{ value: '', label: 'Intet kamera' }, ...engine.cameras.value.map((c) => ({ value: c.id, label: c.label }))]}
              onChange={(v) => set({ cameraId: v }, engine.useCamera)}
            />
          </Row>
          <Row label={<><Mic size={14} /> Mikrofon</>} stacked>
            <Select
              value={s.micId}
              disabled={recording}
              options={[{ value: '', label: 'Ingen mikrofon' }, ...engine.mics.value.map((m) => ({ value: m.id, label: m.label }))]}
              onChange={(v) => set({ micId: v }, engine.useMic)}
            />
            <div class="meter">
              <div style={{ width: `${engine.level.value * 100}%` }} />
            </div>
          </Row>
          <Row label={<><Volume2 size={14} /> Systemlyd</>}>
            <Toggle checked={s.systemAudio} disabled={recording || !s.screenId} onChange={(v) => set({ systemAudio: v }, engine.useScreen)} />
          </Row>
        </Section>

        <Section title="Kamerabilde">
          <Row label="Form">
            <Segmented
              value={s.pipShape}
              onChange={(v) => set({ pipShape: v })}
              options={[
                { value: 'circle', label: 'Sirkel', icon: Circle, showLabel: true },
                { value: 'square', label: 'Kvadrat', icon: Square, showLabel: true },
                { value: 'rect', label: '16:9', icon: RectangleHorizontal, showLabel: true },
              ]}
            />
          </Row>
          <Row label="Størrelse">
            <Segmented
              value={s.pipSize}
              onChange={(v) => set({ pipSize: v })}
              options={[
                { value: 'small', label: 'Liten' },
                { value: 'medium', label: 'Middels' },
                { value: 'large', label: 'Stor' },
              ]}
            />
          </Row>
          <Row label="Speilvend">
            <Toggle checked={s.mirror} onChange={(v) => set({ mirror: v })} />
          </Row>
        </Section>

        <Section title="Overlegg">
          <Row label={<><Keyboard size={14} /> Vis tastetrykk</>}>
            <Toggle checked={s.showKeys} onChange={(v) => set({ showKeys: v })} />
          </Row>
          <Row label={<><MousePointer2 size={14} /> Forstørr peker</>}>
            <Toggle checked={s.cursorZoom} onChange={(v) => set({ cursorZoom: v })} />
          </Row>
          {s.cursorZoom && inputReady && (
            <Row label="Hold inne" >
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
          <Row label="Fremhev klikk">
            <Toggle checked={s.showClicks} onChange={(v) => set({ showClicks: v })} />
          </Row>
          {input && !inputReady && (
            <div class="callout">
              {input.available ? (
                <>
                  <p>
                    {isMac
                      ? 'For å vise tastetrykk og forstørre pekeren mens du holder en tast, trenger OBSlite tilgang under Tilgjengelighet.'
                      : 'Tastaturlytteren kunne ikke starte.'}
                  </p>
                  <button class="btn secondary small" onClick={requestInput}>
                    Gi tilgang
                  </button>
                </>
              ) : (
                <p>Tastaturlytteren er ikke tilgjengelig. Pekeren kan forstørres med {mod.short}9 (av og på).</p>
              )}
            </div>
          )}
          <p class="hint">
            {inputReady ? <>Hold inne <b>{zoomLabel}</b> for å forstørre pekeren. </> : null}
            Bare snarveier med Cmd, Ctrl eller Alt vises, aldri vanlig skriving. OBSlite sine egne snarveier vises ikke.
          </p>
        </Section>

        <Section title="Opptak">
          <Row label="Bilder per sekund">
            <Segmented value={s.fps} disabled={recording} onChange={(v) => set({ fps: v }, engine.useScreen)} options={[{ value: 30, label: '30' }, { value: 60, label: '60' }]} />
          </Row>
          <Row label="Lag ferdig video automatisk">
            <Toggle checked={s.autoRender} onChange={(v) => set({ autoRender: v })} />
          </Row>
          <Row label={<><AppWindow size={14} /> Skjul OBSlite fra opptaket</>}>
            <Toggle
              checked={s.hideFromCapture}
              onChange={(v) => {
                set({ hideFromCapture: v });
                api.hideFromCapture(v);
              }}
            />
          </Row>
          <Row label="Lagres i" stacked>
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

        <Section title="Snarveier">
          <Row label="Taster" stacked>
            <Select value={s.modifier} options={MODIFIERS} onChange={(v) => set({ modifier: v })} />
          </Row>
          <p class="hint">
            {mod.short}1 kamera, {mod.short}2 skjerm, {mod.short}3 til {mod.short}6 hjørner. {mod.short}0 starter og stopper opptaket.
            {failed.length > 0 && <span class="warn"> Opptatt av et annet program: {failed.join(', ')}.</span>}
            {isMac && s.modifier === 'Command+Shift' && <span class="warn"> Cmd + Shift + 3, 4 og 5 brukes av macOS til skjermbilder.</span>}
            {!isMac && s.modifier === 'Control+Alt' && <span class="warn"> Ctrl + Alt er det samme som AltGr på norsk tastatur.</span>}
          </p>
        </Section>
      </aside>
    </div>
  );
}
