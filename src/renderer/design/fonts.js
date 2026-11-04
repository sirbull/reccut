import { signal } from '@preact/signals';
import { clearDesignRenderCache } from '../../shared/designRender.js';

export const fontVersion = signal(0);
const known = new Map();
let measureContext;
export function fontAvailable(family) {
  if (typeof document === 'undefined') return true;
  if (!family || ['sans', 'rounded', 'serif', 'mono', 'sans-serif', 'monospace', 'system-ui'].includes(family)) return true;
  if (known.has(family)) return known.get(family);
  const quoted = JSON.stringify(family);
  let available = document.fonts.check(`72px ${quoted}`);
  // Chromium's check() also succeeds for an unknown, undeclared family. Compare
  // two fallback stacks so an absent local font is still reported accurately.
  if (available) {
    measureContext ||= document.createElement('canvas').getContext('2d');
    const sample = 'WimQ0123456789Æøå漢字';
    const width = (font) => { measureContext.font = `72px ${font}`; return measureContext.measureText(sample).width; };
    available = ['monospace', 'serif'].some((fallback) => Math.abs(width(`${quoted}, ${fallback}`) - width(fallback)) > 0.01);
  }
  known.set(family, available); return available;
}
export const refreshDesignFonts = () => { known.clear(); clearDesignRenderCache(); fontVersion.value++; };
const refresh=refreshDesignFonts;
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.ready.then(refresh);
  document.fonts.addEventListener('loadingdone', refresh);
}
