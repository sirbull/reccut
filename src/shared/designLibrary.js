import { hitTest } from './design.js';

export const DESIGN_PANELS = ['templates', 'video', 'text', 'content', 'brand'];
export function designPanel(value) {
  if (value === null) return null;
  return DESIGN_PANELS.includes(value) ? value : ({ styles: 'text', project: 'content' }[value] || 'templates');
}
export function filterLibraryItems(items, query) {
  const words = String(query || '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const text = [item.name, ...(item.tags || [])].join(' ').normalize('NFKC').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}

// A locked layer still receives the drop, so it cannot expose an unrelated
// editable layer underneath. Return its original lock state to the action.
export function libraryDropTarget(design, point) {
  const hit=hitTest({...design,layers:design.layers.map(layer=>layer.locked?{...layer,locked:false}:layer)},point.x,point.y);
  return hit?design.layers.find(layer=>layer.id===hit.id):null;
}
