import { effect, signal } from '@preact/signals';
import { previewKey, previewRanges } from '../../shared/previews.js';
import { project, projectEpoch, selection } from './store.js';

export const renderedPreviews = signal({ key: null, ranges: [] });
export const renderingPreview = signal(false);
const empty = [];
export function previewsFor(p) {
  const cache = renderedPreviews.value;
  return cache.key === previewKey(p) ? cache.ranges : empty;
}

function release(ranges) {
  if (ranges.length) window.api.releasePreviews(ranges.map(r => r.file)).catch(error => console.warn('Could not clear preview files', error));
}

effect(() => {
  const p = project.value;
  const epoch = projectEpoch.value;
  const cache = renderedPreviews.peek();
  if (cache.key && (cache.epoch !== epoch || cache.key !== previewKey(p))) {
    renderedPreviews.value = { key: null, ranges: [] };
    release(cache.ranges);
  }
});

export async function renderSelectedPreviews() {
  if (renderingPreview.value) return 'Pre-rendering is already in progress. See Background tasks.';
  const p = project.value, epoch = projectEpoch.value, key = previewKey(p);
  const cached = previewsFor(p);
  const ranges = previewRanges(p, selection.value).filter(r => !cached.some(c => c.in <= r.in && c.out >= r.out));
  if (!ranges.length) return selection.value.length ? 'The selected clips are already pre-rendered.' : 'Select timeline clips first. Use Select All to pre-render the entire timeline.';
  renderingPreview.value = true;
  try {
    const rendered = await window.api.renderPreviews({ project: p, ranges });
    if (epoch !== projectEpoch.value || key !== previewKey(project.value)) {
      release(rendered);
      return 'The timeline changed. Pre-render the updated selection again.';
    }
    const replaced = cached.filter(c => rendered.some(r => r.in < c.out && r.out > c.in));
    renderedPreviews.value = { key, epoch, ranges: [...cached.filter(c => !replaced.includes(c)), ...rendered].sort((a, b) => a.in - b.in) };
    release(replaced);
    return 'Pre-render complete. The green timeline bars show the rendered areas.';
  } finally {
    renderingPreview.value = false;
  }
}
