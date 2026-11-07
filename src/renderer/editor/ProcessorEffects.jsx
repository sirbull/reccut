import { useEffect, useState } from 'preact/hooks';
import { Button, Section, Select, toast } from '../ui.jsx';
import { commit, project } from './store.js';
import { RotoBrushSection } from './RotoBrush.jsx';
const api = window.api;

// Runs an installed processor on a clip's full source and swaps the clip to the result, as one undo step.
// Used by the Effects tab and by the AI agent.
export async function applyProcessor(clipId, processorId, params) {
  const snapshot = project.value,
    clip = snapshot.clips[clipId],
    original = snapshot.media[clip?.mediaId],
    main = original?.streams?.main;
  if (clip?.type !== 'video' || !main) throw new Error('Choose a video clip.');
  const result = await api.pluginsProcess({ id: processorId, input: main.tsFallback ? main.proxy : main.path, params });
  swapSource(clipId, snapshot, result);
  return result.plugin;
}
// Swaps the clip to a processed copy of its source (result.media), as one undo step.
// snapshot is the project from before processing started. Also used by Roto Brush.
export function swapSource(clipId, snapshot, result) {
  const clip = snapshot.clips[clipId],
    original = snapshot.media[clip?.mediaId],
    main = original?.streams?.main;
  const next = result.media;
  // Processors must preserve the full source timing; trims and speed changes keep their meaning.
  if (Math.abs(next.duration - original.duration) > Math.max(0.1, 2 / (main.fps || snapshot.fps)))
    throw new Error('Processor changed the source duration. Import its output manually to adjust timing.');
  if (project.value.id !== snapshot.id || project.value.clips[clipId]?.mediaId !== original.id)
    throw new Error('The selected clip source changed while processing. Import the output manually from the Processed folder.');
  commit((p) => {
    const c = p.clips[clipId],
      m = structuredClone(next);
    m.name = `${original.name} · ${result.plugin}`;
    // Keying changes picture only. Keep the original source audio and any synced components.
    m.streams.main.hasAudio = false;
    if (main.hasAudio) {
      let audioKey = 'sourceAudio';
      while (original.streams[audioKey]) audioKey += '_';
      m.streams[audioKey] = { ...original.streams.main, hasVideo: false, label: 'Original audio' };
      if (c.props.audioOff?.main) c.props.audioOff = { ...c.props.audioOff, [audioKey]: true };
    }
    for (const [key, st] of Object.entries(original.streams))
      if (key !== 'main' && !st.hasVideo) m.streams[key] = structuredClone(st);
    p.media[m.id] = m;
    c.mediaId = m.id;
  });
}
export function ProcessorEffects({ clip }) {
  const [plugins, setPlugins] = useState([]),
    [chosen, setChosen] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const reload = () =>
      api
        .pluginsList()
        .then((list) => {
          if (!alive) return;
          setPlugins(list);
          setChosen((id) => (list.some((p) => p.id === id) ? id : ''));
        })
        .catch((e) => toast(e.message, { kind: 'error' }));
    reload();
    window.addEventListener('reccut:processors-changed', reload);
    return () => {
      alive = false;
      window.removeEventListener('reccut:processors-changed', reload);
    };
  }, []);
  if (clip.type !== 'video') return null;
  const run = async () => {
    setBusy(true);
    try {
      await applyProcessor(clip.id, chosen);
      toast('Processed source applied. The original remains in the library; Undo restores it.', { kind: 'success' });
    } catch (e) {
      toast(e.message, { kind: 'error', timeout: 10000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
    <RotoBrushSection clip={clip} />
    <Section title="External processing" open={false}>
      <p class="hint">
        Process the complete source with a local AI tool, then use the result on this clip. Install a processor under
        Settings → Plugins. For CorridorKey’s standalone app, process there and import the resulting alpha video.
      </p>
      <Select
        value={chosen}
        options={[
          { value: '', label: plugins.length ? 'Choose installed processor…' : 'No processors installed' },
          ...plugins.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={setChosen}
      />
      <Button disabled={busy || !chosen} onClick={run}>
        {busy ? 'Processing…' : 'Process and apply to this clip'}
      </Button>
      <p class="hint">
        Progress and cancellation are available in Background tasks. A processor must preserve source duration and frame
        timing. Original audio is retained.
      </p>
    </Section>
    </>
  );
}
