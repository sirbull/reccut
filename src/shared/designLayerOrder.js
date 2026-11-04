// The Layers panel is topmost-first; the renderer stores bottommost-first.
// Groups are atomic insertion targets, including when their members are collapsed.
export function designLayerBlocks(layers) {
  const blocks = [], groups = new Map();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.group) { blocks.push({ id: `layer:${layer.id}`, layers: [layer] }); continue; }
    let block = groups.get(layer.group);
    if (!block) { block = { id: `group:${layer.group}`, layers: [] }; groups.set(layer.group, block); blocks.push(block); }
    block.layers.push(layer);
  }
  return blocks;
}

export function layerInsertionIndex(blocks, sourceId, heights, offset) {
  let y = 0, index = 0;
  for (const block of blocks) {
    if (block.id === sourceId) continue;
    const height = heights.get(block.id) || 32;
    if (offset <= y + height / 2) return index;
    y += height; index++;
  }
  return index;
}

export function reorderDesignBlock(layers, sourceId, index) {
  const blocks = designLayerBlocks(layers), source = blocks.find(b => b.id === sourceId);
  if (!source || source.layers.some(l => l.locked) || !Number.isFinite(index)) return layers;
  const remaining = blocks.filter(b => b !== source);
  remaining.splice(Math.max(0, Math.min(remaining.length, Math.trunc(index))), 0, source);
  const next = remaining.flatMap(b => b.layers).reverse();
  return next.every((layer, i) => layer === layers[i]) ? layers : next;
}
