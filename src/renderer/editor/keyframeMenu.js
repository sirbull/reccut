import { EASE_FN, EASINGS, keyframeIndexAt, removeKeyframe, setKeyframeEase, setPathSmooth } from '../../shared/model.js';
import { commit, project } from './store.js';

/* Illustrerte valg i høyreklikkmenyen, som i Final Cut Pro. Ikonene tegnes én gang som PNG i dobbel oppløsning.
   På Mac blir de malbilder, så systemet farger dem for lys og mørk meny. */
const icons = new Map();
function icon(id, draw) {
  if (icons.has(id)) return icons.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.lineWidth = 2.5;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle = '#8a8a8a';
  draw(g);
  const url = c.toDataURL('image/png');
  icons.set(id, url);
  return url;
}
const dot = (g, x, y, r = 3) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};

// Farten: verdien over tid fra nøkkelbildet til det neste.
export function easeIcon(id) {
  return icon(`ease:${id}`, (g) => {
    g.beginPath();
    if (id === 'hold') {
      g.moveTo(5, 16);
      g.lineTo(27, 16);
      g.stroke();
      dot(g, 5, 16);
      return;
    }
    const fn = EASE_FN[id] || EASE_FN.linear;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      g[i ? 'lineTo' : 'moveTo'](5 + t * 22, 27 - fn(t) * 22);
    }
    g.stroke();
    dot(g, 5, 27);
    dot(g, 27, 5);
  });
}

export function pathIcon(smooth) {
  return icon(`path:${smooth}`, (g) => {
    g.beginPath();
    g.moveTo(4, 26);
    if (smooth) g.bezierCurveTo(8, 8, 24, 8, 28, 26);
    else g.lineTo(16, 8), g.lineTo(28, 26);
    g.stroke();
    if (smooth) {
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(7, 12.5);
      g.lineTo(25, 12.5);
      g.stroke();
      dot(g, 7, 12.5, 2.5);
      dot(g, 25, 12.5, 2.5);
    } else dot(g, 16, 8);
  });
}

const VOLUME_PROPS = ['volume', 'micVolume', 'sysVolume'];

// Høyreklikk på et nøkkelbilde i tidslinjen eller visningen. props begrenser hvilke egenskaper menyen gjelder.
// Har punktet både X og Y, vises også Path: rett linje eller bue med håndtak.
export async function keyframeMenu(clipId, t, props = null) {
  const c = project.value.clips[clipId];
  if (!c) return;
  const keys = Object.keys(c.kf || {}).filter((key) => key !== 'layout' && (!props || props.includes(key)) && keyframeIndexAt(c, key, t, 1e-4) >= 0);
  if (!keys.length) return;
  const current = keys.map((key) => c.kf[key][keyframeIndexAt(c, key, t, 1e-4)][2] || 'linear');
  const xi = keys.includes('x') && keys.includes('y') ? keyframeIndexAt(c, 'x', t, 1e-4) : -1;
  const smooth = xi >= 0 && Boolean(c.kf.x[xi][3]);
  const id = await window.api.popupMenu([
    ...(xi >= 0
      ? [
          { header: 'Path' },
          { id: 'path:linear', label: 'Linear', checked: !smooth, icon: pathIcon(false) },
          { id: 'path:smooth', label: 'Smooth', checked: smooth, icon: pathIcon(true) },
          { separator: true },
          { header: 'Speed' },
        ]
      : []),
    ...EASINGS.map((x) => ({ id: x.id, label: x.label, checked: current.includes(x.id), icon: easeIcon(x.id) })),
    { separator: true },
    { id: 'delete', label: 'Delete Keyframe' },
  ]);
  if (!id) return;
  commit((p) => {
    const cc = p.clips[clipId];
    if (!cc) return;
    if (id.startsWith('path:')) return setPathSmooth(cc, t, id === 'path:smooth');
    for (const key of keys) {
      if (id !== 'delete') setKeyframeEase(cc, key, t, id);
      else {
        // Behold siste nivå når volumautomatiseringen fjernes helt.
        if (cc.kf[key].length === 1 && VOLUME_PROPS.includes(key)) cc.props[key] = cc.kf[key][0][1];
        removeKeyframe(cc, key, t);
      }
    }
  });
}
