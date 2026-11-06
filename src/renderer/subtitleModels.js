import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { toast } from './ui.jsx';

export const subtitleModels = signal(null);
window.api.onSubtitleModelsChanged?.(state => { subtitleModels.value = state; });
export async function modelAction(method, id) {
  try { subtitleModels.value = await window.api[method](id); }
  catch (e) { toast(e.message, { kind: 'error', timeout: 10000 }); }
}
export function useSubtitleModels() {
  useEffect(() => { modelAction('subtitleModels'); }, []);
  return subtitleModels.value;
}
export const modelBytes = value => value == null ? 'Size unavailable' : value >= 1e9 ? `${(value / 1e9).toFixed(2)} GB` : `${(value / 1e6).toFixed(1)} MB`;
