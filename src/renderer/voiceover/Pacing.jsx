// Pausene mellom klippene i Voice Over Studio: standard etter en setning, et avsnitt og før en ny seksjon.
// Brukes i studioet (Pauses), i sidepanelet og i Settings → Editing.
import { NumberField, Row } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { DEFAULT_PACING } from '../../shared/voiceover.js';

export const PAUSES = [
  { key: 'sentence', label: 'After a sentence', hint: 'Between sentences in the same paragraph', max: 5, step: 0.05 },
  { key: 'paragraph', label: 'After a paragraph', hint: 'When a new paragraph starts', max: 5, step: 0.05 },
  { key: 'section', label: 'Before a section', hint: 'Before a new heading or scene', max: 10, step: 0.1 },
];
export const pacing = () => ({ ...DEFAULT_PACING, ...(prefs.value.voPacing || {}) });
export const setPause = (key, value) => setPrefs({ voPacing: { ...pacing(), [key]: Math.round(value * 100) / 100 } });
export const resetPacing = () => setPrefs({ voPacing: { ...DEFAULT_PACING } });
export const isDefaultPacing = () => PAUSES.every((p) => pacing()[p.key] === DEFAULT_PACING[p.key]);

// Tallfeltene, som rader (Settings) eller i et rutenett (studioet).
export function PacingFields({ rows = false }) {
  const v = pacing();
  if (rows)
    return PAUSES.map((p) => (
      <Row key={p.key} label={p.label}>
        <NumberField value={v[p.key]} min={0} max={p.max} step={p.step} precision={2} unit="s" width={84} onChange={(x) => setPause(p.key, x)} />
      </Row>
    ));
  return PAUSES.flatMap((p) => [
    <span key={`l${p.key}`} title={p.hint}>
      {p.label}
    </span>,
    <NumberField key={p.key} value={v[p.key]} min={0} max={p.max} step={p.step} precision={2} unit="s" width={70} onChange={(x) => setPause(p.key, x)} />,
  ]);
}
