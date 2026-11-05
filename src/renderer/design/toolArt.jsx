// Toolbar icons and canvas cursors shared with modCut's Draw.
// Cursors: the Cur_*.svg drawings redrawn for modCut (modCut/ICONS/illustrator/redraw).
// Tools with their own drawing use it as the icon too; shapes and type use Tabler Icons outline
// (MIT, see tool-icons/LICENSE.tabler.txt), since there are no drawings for them.
import type from './tool-icons/type.svg';
import rect from './tool-icons/rect.svg';
import ellipse from './tool-icons/ellipse.svg';
import polygon from './tool-icons/polygon.svg';
import star from './tool-icons/star.svg';
import line from './tool-icons/line.svg';
import curSelect from './cursors/Cur_Select_1_1@2x.svg';
import curDirect from './cursors/Cur_DirectSelect_1_1@2x.svg';
import curPen from './cursors/Cur_Pen_1_1@2x.svg';
import curPenNew from './cursors/Cur_PenNew_1_1@2x.svg';
import curPenClose from './cursors/Cur_PenClose_1_1@2x.svg';
import curPenCorner from './cursors/Cur_PenCorner_1_1@2x.svg';
import curPenSubtract from './cursors/Cur_PenSubstract_1_1@2x.svg';
import curEditAnchor from './cursors/Cur_EditAnchor_1_1@2x.svg';
import curHand from './cursors/Cur_Hand_11_11@2x.svg';
import curFist from './cursors/Cur_Fist_11_11@2x.svg';
import curZoomIn from './cursors/Cur_ZoomIn_8_8@2x.svg';
import curZoomOut from './cursors/Cur_ZoomOut_8_8@2x.svg';
import curText from './cursors/Cur_HorizontalText_1_1@2x.svg';
import curPrecise from './cursors/Cur_Precise_9_9@2x.svg';

const svgBody = (svg) => svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)[1].replace(/<!--[\s\S]*?-->/g, '');
const icon = (svg) => ({ size = 16 }) => <span class="dz-svg-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;

// A cursor drawing as an icon: black parts take currentColor, the white halo is dropped,
// and the view is cropped to a square around the drawing.
function drawnIcon(svg) {
  const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '', blank = new Set();
  for (const [, sel, decl] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (/fill:\s*(#fff|none)/.test(decl)) for (const c of sel.match(/st\d+/g) || []) blank.add(c);
  const isBlank = (c) => c.split(/\s+/).some((x) => blank.has(x));
  const body = svgBody(svg).replace(/<defs>[\s\S]*?<\/defs>/, '')
    .replace(/<(path|polygon|rect|circle|ellipse)\b[^>]*class="([^"]*)"[^>]*\/>/g, (m, _, c) => (isBlank(c) ? '' : m))
    .replace(/ class="([^"]*)"/g, (_, c) => (isBlank(c) ? ' fill="none"' : ''));
  let html = null;
  return ({ size = 16 }) => {
    if (!html) {
      // ponytail: measured once in a hidden SVG; hardcode the view boxes if icons ever render without a DOM.
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      probe.style.cssText = 'position:absolute;visibility:hidden';
      probe.innerHTML = body;
      document.body.append(probe);
      const b = probe.getBBox(), side = Math.max(b.width, b.height) * 1.08;
      probe.remove();
      html = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}" fill="currentColor">${body}</svg>`;
    }
    return <span class="dz-svg-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
  };
}
export const TOOL_ICONS = {
  select: drawnIcon(curSelect), direct: drawnIcon(curDirect), text: icon(type), rect: icon(rect), ellipse: icon(ellipse), polygon: icon(polygon),
  star: icon(star), line: icon(line), pen: drawnIcon(curPen), anchor: drawnIcon(curEditAnchor), deleteAnchor: drawnIcon(curPenSubtract),
  hand: drawnIcon(curHand), zoom: drawnIcon(curZoomIn),
};

// The drawings use a 64 × 64 viewBox shown at 32 × 32, so hotspots are in displayed pixels.
// A badge is drawn in the same 32 px space, as in modCut.
const cursor = (svg, x, y, fallback, badge = '') => {
  const body = svgBody(svg);
  const image = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64">${body}${badge && `<g transform="scale(2)">${badge}</g>`}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(image)}") ${x} ${y}, ${fallback}`;
};
const anchorBadge = "<rect x='18' y='18' width='6' height='6' fill='#111' stroke='#fff' stroke-width='1.4'/>";
export const CURSORS = {
  select: cursor(curSelect, 1, 1, 'default'),
  direct: cursor(curDirect, 1, 1, 'default'),
  'direct-anchor': cursor(curDirect, 1, 1, 'default', anchorBadge),
  'pen-new': cursor(curPenNew, 3, 1, 'crosshair'),
  'pen-active': cursor(curPen, 3, 1, 'crosshair'),
  'pen-close': cursor(curPenClose, 3, 1, 'crosshair'),
  'pen-convert': cursor(curPenCorner, 3, 1, 'crosshair'),
  'anchor-remove': cursor(curPenSubtract, 3, 1, 'crosshair'),
  'anchor-convert': cursor(curEditAnchor, 1, 1, 'crosshair'),
  hand: cursor(curHand, 11, 11, 'grab'),
  'hand-active': cursor(curFist, 11, 11, 'grabbing'),
  'zoom-in': cursor(curZoomIn, 8, 8, 'zoom-in'),
  'zoom-out': cursor(curZoomOut, 8, 8, 'zoom-out'),
  type: cursor(curText, 1, 1, 'text'),
  shape: cursor(curPrecise, 10, 10, 'crosshair'),
};
export const TOOL_CURSORS = { select: 'select', direct: 'direct', text: 'type', shape: 'shape', pen: 'pen-new', anchor: 'anchor-convert', deleteAnchor: 'anchor-remove', hand: 'hand', zoom: 'zoom-in' };
