import { hitTest } from './design.js';

export const DESIGN_PANELS = ['search', 'templates', 'video', 'text', 'content', 'elements', 'styles', 'brand'];
export function designPanel(value) {
  if (value === null) return null;
  return DESIGN_PANELS.includes(value) ? value : ({ project: 'content' }[value] || 'templates');
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

export function rankLibraryItems(items, query) {
  const term=String(query||'').normalize('NFKC').toLocaleLowerCase().trim();
  const score=item=>{const name=String(item.name||'').normalize('NFKC').toLocaleLowerCase();return name===term?2:name.startsWith(term)?1:0;};
  return filterLibraryItems(items,query).sort((a,b)=>score(b)-score(a));
}
