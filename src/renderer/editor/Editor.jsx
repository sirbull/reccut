// Redigeringsrommet: bibliotek, visning og inspektør øverst, tidslinje nederst.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CAPTION_LANE, formatTimecode } from '../../shared/model.js';
import { Browser } from './Browser.jsx';
import { Viewer } from './Viewer.jsx';
import { Inspector } from './Inspector.jsx';
import { Timeline } from './Timeline.jsx';
import { ExportDialog } from './ExportDialog.jsx';
import { audioSkimming, commit, makeCaptionClip, project, skimming, snapping } from './store.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { Button, Modal, NumberField, Row, Section, Segmented, Toggle, toast } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';

const api = window.api;

// Ferdige undertekster fra Whisper legges inn i undertekstsporet.
api.onTranscribeDone(({ segments, payload }) => {
  if (payload.projectId !== project.value.id) return;
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
api.onTranscribeError(({ error }) => {
  if (error !== 'Canceled') toast(`Auto captions failed: ${error}`, { kind: 'error', timeout: 10000 });
});

export function Editor({ active }) {
  const [split, setSplit] = useState(() => Number(localStorage.getItem('editorSplit')) || 0.56);
  const ref = useRef(null);

  useEffect(() => {
    if (!active) playback.pause();
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

  return (
    <div class="editor" ref={ref} style={{ gridTemplateRows: `${split * 100}% 6px 1fr` }}>
      <div class="editor-top">
        <Browser />
        <Viewer />
        <Inspector />
      </div>
      <div class="divider" onPointerDown={onDividerDown} />
      <Timeline />
      {commands.exportOpen.value && <ExportDialog />}
      {commands.prefsOpen.value && <PreferencesDialog />}
      {commands.syncDialog.value && <SyncDialog />}
      {commands.importOptions.value && <ImportOptionsDialog />}
    </div>
  );
}

// Importvalg: kopier til prosjektmappen eller la filene ligge, optimaliser og synk lyd.
function ImportOptionsDialog() {
  const { paths } = commands.importOptions.value;
  const p = prefs.value;
  const [sync, setSync] = useState(false);
  const close = () => (commands.importOptions.value = null);
  const go = () => commands.confirmImport({ copy: p.importCopy, optimize: p.importOptimize, sync });
  const names = paths.map((x) => x.split(/[\\/]/).pop());
  return (
    <Modal
      title={`Import ${paths.length === 1 ? names[0] : `${paths.length} Files`}`}
      width={500}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={go}>
            Import
          </Button>
        </>
      }
    >
      <Section title="Files" collapsible={false}>
        <Segmented
          value={p.importCopy ? 'copy' : 'keep'}
          onChange={(v) => setPrefs({ importCopy: v === 'copy' })}
          options={[
            { value: 'copy', label: 'Copy to project folder' },
            { value: 'keep', label: 'Leave files in place' },
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
      {paths.length > 1 && (
        <Section title="Audio" collapsible={false}>
          <Row label="Synchronize audio files with video">
            <Toggle checked={sync} onChange={setSync} />
          </Row>
          <p class="hint">Finds audio files that match the sound of the video clips, and adds them to the clips as an extra audio track. The camera audio is switched off but kept.</p>
        </Section>
      )}
    </Modal>
  );
}

// Lydklippet passer under flere videoklipp: synk med det første, eller del opp og legg en bit under hvert.
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

// Innstillinger: standardlengder, skumming, synk og import.
function PreferencesDialog() {
  const p = prefs.value;
  const close = () => (commands.prefsOpen.value = false);
  const num = (key, label, min, max, step = 0.1) => (
    <Row label={label}>
      <NumberField value={p[key]} min={min} max={max} step={step} precision={step < 1 ? 1 : 0} unit="s" width={84} onChange={(v) => setPrefs({ [key]: Math.round(v * 100) / 100 })} />
    </Row>
  );
  return (
    <Modal title="Preferences" width={520} onClose={close} footer={<Button variant="primary" onClick={close}>Done</Button>}>
      <Section title="Editing" collapsible={false}>
        {num('transitionDur', 'Default transition duration', 0.1, 10)}
        {num('audioCrossfadeDur', 'Default audio crossfade', 0.05, 10)}
        {num('stillDur', 'Still image duration', 0.5, 60)}
        {num('titleDur', 'Title duration', 0.5, 60)}
        {num('freezeDur', 'Freeze frame duration', 0.2, 60)}
      </Section>
      <Section title="Playback" collapsible={false}>
        <Row label="Skimming (S)">
          <Toggle
            checked={skimming.value}
            onChange={(v) => {
              skimming.value = v;
              setPrefs({ skimming: v });
            }}
          />
        </Row>
        <Row label="Audio skimming (Shift S)">
          <Toggle
            checked={audioSkimming.value}
            onChange={(v) => {
              audioSkimming.value = v;
              setPrefs({ audioSkimming: v });
            }}
          />
        </Row>
        <Row label="Snapping (N)">
          <Toggle
            checked={snapping.value}
            onChange={(v) => {
              snapping.value = v;
              setPrefs({ snapping: v });
            }}
          />
        </Row>
        <Row label="Preserve pitch when changing speed">
          <Toggle checked={p.preservePitch} onChange={(v) => setPrefs({ preservePitch: v })} />
        </Row>
      </Section>
      <Section title="Auto Sync Audio" collapsible={false}>
        <Row label="Group synced audio with the video">
          <Toggle checked={p.syncGroup} onChange={(v) => setPrefs({ syncGroup: v })} />
        </Row>
        <Row label="Switch off the camera audio after syncing">
          <Toggle checked={p.syncMuteCamera} onChange={(v) => setPrefs({ syncMuteCamera: v })} />
        </Row>
      </Section>
    </Modal>
  );
}
