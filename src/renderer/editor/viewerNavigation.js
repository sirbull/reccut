const FIT = { zoom: 1, x: 0, y: 0 };
const MAX_ZOOM = 16;
const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));

export function constrainView(view, bounds) {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom));
  if (zoom === 1) return { ...FIT };
  return {
    zoom,
    x: clamp(view.x, Math.max(0, (bounds.contentWidth * zoom - bounds.width) / 2)),
    y: clamp(view.y, Math.max(0, (bounds.contentHeight * zoom - bounds.height) / 2)),
  };
}

// Anchor is in screen pixels relative to the centre of the viewport.
export function zoomView(view, factor, anchor, bounds) {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return constrainView({ zoom, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio }, bounds);
}

// Chromium delivers trackpad pinches as Ctrl+wheel. A non-passive listener keeps
// the gesture in this viewport instead of zooming or scrolling the whole app.
export function attachViewerNavigation(viewport, stage, onZoom) {
  let view = { ...FIT };
  const bounds = () => {
    const canvases = [...stage.children].filter((el) => el.tagName === 'CANVAS');
    return {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      contentWidth: canvases.length ? Math.max(...canvases.map((el) => el.offsetLeft + el.offsetWidth)) - Math.min(...canvases.map((el) => el.offsetLeft)) : 0,
      contentHeight: Math.max(0, ...canvases.map((el) => el.offsetHeight)),
    };
  };
  const apply = (next) => {
    const changed = next.zoom !== view.zoom;
    view = next;
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    if (changed) onZoom(view.zoom);
  };
  const wheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const b = bounds();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? b.height : 1;
    if (e.ctrlKey || e.metaKey) {
      const r = viewport.getBoundingClientRect();
      const anchor = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
      apply(zoomView(view, Math.exp(-clamp(e.deltaY * unit, 40) * 0.0125), anchor, b));
    } else {
      apply(constrainView({ ...view, x: view.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, y: view.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit }, b));
    }
  };
  const resize = () => apply(constrainView(view, bounds()));
  const ro = new ResizeObserver(resize);
  ro.observe(viewport);
  // Canvas sizes can change without a panel resize (source view, aspect ratio,
  // and two-up trimming). Its sibling shares its size in two-up mode.
  for (const el of stage.children) if (el.tagName === 'CANVAS') ro.observe(el);
  viewport.addEventListener('wheel', wheel, { passive: false });
  return {
    reset: () => apply({ ...FIT }),
    dispose: () => {
      ro.disconnect();
      viewport.removeEventListener('wheel', wheel);
    },
  };
}
