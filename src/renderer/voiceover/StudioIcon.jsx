// Ikonet til Voice Over Studio: et headsett og en mikrofon side om side.
import { Headset, Mic } from 'lucide-preact';

export function StudioIcon({ size = 16 }) {
  return (
    <span class="vo-studio-icon" aria-hidden="true">
      <Headset size={size} />
      <Mic size={Math.round(size * 0.8)} />
    </span>
  );
}
