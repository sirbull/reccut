// Knappen for AI-keying i Keying & effect stack: CorridorKey gjør grønn og blå skjerm renere enn
// fargekeyeren (hår, bevegelsesuskarphet og gjennomsiktige kanter). Den er et eget tillegg.
import { useEffect } from 'preact/hooks';
import { Sparkles } from 'lucide-preact';
import { Button } from '../ui.jsx';
import { corridorKeyConsent, corridorKeyStatus, refreshCorridorKey } from '../CorridorKeyAddon.jsx';
import { openPlugin, plugins } from '../Plugins.jsx';
import { selection } from './store.js';

export function AiKeying({ clip }) {
  useEffect(() => {
    refreshCorridorKey();
  }, []);
  if (!['video', 'recording'].includes(clip.type)) return null;
  const s = corridorKeyStatus.value;
  const installed = s?.installed || plugins.value.some((p) => p.id === 'corridorkey');
  const run = () => {
    selection.value = [clip.id];
    openPlugin('corridorkey');
  };
  return (
    <div class="ai-keying">
      <div class="ai-keying-head">
        <Sparkles size={14} />
        <b>AI keying with CorridorKey</b>
      </div>
      {installed ? (
        <>
          <p class="hint">Keys this clip with the CorridorKey model on your computer: cleaner hair, motion blur and see-through edges than the color key. It makes a new file with transparency, and takes seconds per frame.</p>
          <Button class="small" icon={Sparkles} onClick={run}>
            Key This Clip with CorridorKey…
          </Button>
        </>
      ) : (
        <>
          <p class="hint">
            The color key works on most even green and blue screens. For hair, motion blur and see-through edges, CorridorKey from Corridor Digital does a cleaner job. It is a separate download of about {s?.needed ? `${Math.round(s.needed / 1024 ** 3)} GB` : '2 to 8 GB'}, needs Apple Silicon or an NVIDIA graphics card, and is slow. Read its licence before you install it.
          </p>
          <Button class="small" icon={Sparkles} disabled={s && !s.supported} onClick={() => (corridorKeyConsent.value = true)}>
            {s && !s.supported ? 'Not available on this computer' : 'Get CorridorKey…'}
          </Button>
        </>
      )}
    </div>
  );
}
