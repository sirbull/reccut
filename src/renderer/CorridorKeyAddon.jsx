// CorridorKey: an AI keyer from Corridor Digital that the user downloads after reading what it is and needs.
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Button, Modal, toast } from './ui.jsx';

const api = window.api;
export const corridorKeyConsent = signal(false);
const gb = (n) => `${Math.round((n / 1024 ** 3) * 10) / 10} GB`;

// What the user is told before anything is downloaded.
export const CORRIDORKEY_FACTS = (s) => [
  'CorridorKey is an AI model from Corridor Digital that removes green and blue screens, including hair, motion blur and see-through edges. It is made by Corridor Digital, not by the makers of Reccut.',
  'It runs entirely on this computer. Your footage is never uploaded.',
  `Reccut downloads Python, PyTorch, the CorridorKey program and two model files (green and blue screen, 400 MB each) from their official sources. Every file is checked before it is used. It takes about ${gb(s.needed)} of disk space while installing${s.free != null ? `; you have ${gb(s.free)} free` : ''}.`,
  'It needs a Mac with Apple Silicon, or a PC with an NVIDIA graphics card. While it runs it uses most of the graphics card and a lot of memory, so the computer can feel slow.',
  'It is slow: expect several seconds per frame, so a minute of video can take hours. Try a short clip first.',
  'The result is a new ProRes 4444 file with transparency. The clip switches to it, and Undo restores the original.',
  'Remove CorridorKey from the plugin list to delete all its files.',
];

function hardwareLine(hw) {
  if (hw.kind === 'apple') return { ok: true, text: `${hw.name} with ${gb(hw.memory)} memory${hw.memory < 32 * 1024 ** 3 ? '. Fast quality is chosen; Full needs 32 GB.' : '.'}` };
  if (hw.kind === 'nvidia') return { ok: true, text: `${hw.name} with ${gb(hw.memory)} video memory${hw.memory < 12 * 1024 ** 3 ? '. Fast quality is chosen; Full needs about 12 GB.' : '.'}` };
  if (hw.kind === 'none') return { ok: false, text: 'Intel Macs are not supported.' };
  return { ok: false, text: 'No NVIDIA graphics card found. CorridorKey would run on the processor, which can take a minute per frame.' };
}

export function CorridorKeyConsent() {
  if (!corridorKeyConsent.value) return <></>;
  return <ConsentDialog onClose={() => (corridorKeyConsent.value = false)} />;
}

function ConsentDialog({ onClose }) {
  const [s, setS] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.corridorKeyStatus().then(setS, (e) => setError(String(e?.message || e)));
  }, []);
  const hw = s && hardwareLine(s.hardware);
  const lowDisk = s && s.free != null && s.free < s.needed;
  const install = () => {
    onClose();
    toast('Installing CorridorKey. Follow it in Tasks; you can keep working.');
    api.installCorridorKey({ consent: true }).then(
      () => {
        window.dispatchEvent(new Event('reccut:processors-changed'));
        toast('CorridorKey is installed. Select a green screen clip and open CorridorKey from Plugins.', { kind: 'success' });
      },
      (e) => !/Canceled/.test(String(e?.message)) && toast(`CorridorKey was not installed: ${e?.message || e}`, { kind: 'error', timeout: 0 }),
    );
  };
  return (
    <Modal title="CorridorKey" width={560} onClose={onClose} class="keys-consent" footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!s?.supported || !agreed || lowDisk} onClick={install}>Download and Install</Button>
    </>}>
      <p>CorridorKey is not part of Reccut. Read what it is and what it needs before you install it.</p>
      {s && <ul class="keys-facts">{CORRIDORKEY_FACTS(s).map((f) => <li key={f}>{f}</li>)}</ul>}
      {hw && <p class={hw.ok ? 'hint' : 'warn'}>This computer: {hw.text}</p>}
      {lowDisk && <p class="warn">There is not enough free disk space.</p>}
      {s?.supported && (
        <label class="keys-agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.currentTarget.checked)} />
          <span>
            I accept the <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal(s.licenseUrl))}>CorridorKey Licence</a> from Corridor Digital, and I understand that it downloads several GB and runs an AI model on this computer.
          </span>
        </label>
      )}
      {error && <p class="warn">{error}</p>}
    </Modal>
  );
}
