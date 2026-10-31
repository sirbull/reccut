// Kameraforhåndsvisning over opptaksskjermen. Tar ikke fokus eller museklikk.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}
img{position:absolute;left:0;top:0;display:block;object-fit:fill;will-change:transform;transform-origin:top left}
</style></head><body><img id="camera" alt=""><script>
const camera=document.getElementById('camera');
let motion=null,raf=0;
function paint(now){
  raf=0;
  if(!motion)return;
  const t=Math.max(0,Math.min(1,(performance.timeOrigin+now-motion.start)/motion.duration));
  const e=1-Math.pow(1-t,3),from=motion.from,to=motion.to;
  const v=(k)=>from[k]+(to[k]-from[k])*e;
  camera.style.transform='translate3d('+v('x')+'px,'+v('y')+'px,0)';
  camera.style.width=v('width')+'px';camera.style.height=v('height')+'px';
  if(t<1)raf=requestAnimationFrame(paint);
}
pip.onFrame((frame)=>{
  if(frame.image)camera.src=frame.image;
  motion=frame.motion||{from:frame.rect,to:frame.rect,start:0,duration:1};
  if(raf)cancelAnimationFrame(raf);
  paint(performance.now());
});
</script></body></html>`;

// Opptaksbildets koordinater er normalisert, skjermens mål er i logiske piksler.
function pipBounds(display, frame) {
  const area = frame.area || { x: 0, y: 0, w: 1, h: 1 };
  const r = frame.rect;
  const valid = (v) => v && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(v[k])) &&
    v.x >= 0 && v.y >= 0 && v.w > 0 && v.h > 0 && v.x + v.w <= 1.001 && v.y + v.h <= 1.001;
  if (!valid(area) || !valid(r)) return null;
  return {
    x: Math.round(display.x + (area.x + r.x * area.w) * display.width),
    y: Math.round(display.y + (area.y + r.y * area.h) * display.height),
    width: Math.max(1, Math.round(r.w * area.w * display.width)),
    height: Math.max(1, Math.round(r.h * area.h * display.height)),
  };
}

function createPipPreview({ getMainWindow }) {
  let window = null;
  let ready = null;
  let latest = null;
  let image = null;
  let sentImage = null;
  let failed = false;

  function hide() {
    latest = null;
    if (window && !window.isDestroyed()) window.hide();
  }

  function update(frame) {
    const main = getMainWindow();
    if (!frame || !main || main.isDestroyed() || main.isFocused() || failed) return hide();
    const display = screen.getAllDisplays().find((d) => String(d.id) === String(frame.displayId));
    const bounds = display && pipBounds(display.bounds, frame);
    if (!bounds) return hide();
    if (frame.image != null) {
      if (typeof frame.image !== 'string' || frame.image.length > 2e6 || !frame.image.startsWith('data:image/webp;base64,')) return hide();
      image = frame.image;
    }
    if (!image) return hide();
    const local = (r) => ({ ...r, x: r.x - display.bounds.x, y: r.y - display.bounds.y });
    let motion = null;
    if (frame.motion) {
      const from = pipBounds(display.bounds, { ...frame, rect: frame.motion.from });
      const to = pipBounds(display.bounds, { ...frame, rect: frame.motion.to });
      if (!from || !to || !Number.isFinite(frame.motion.start) || !(frame.motion.duration > 0) || !Number.isFinite(frame.motion.duration)) return hide();
      motion = { from: local(from), to: local(to), start: frame.motion.start, duration: frame.motion.duration };
    }
    latest = frame;
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        ...display.bounds,
        enableLargerThanScreen: true,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        focusable: false,
        show: false,
        backgroundColor: '#00000000',
        webPreferences: { preload: path.join(__dirname, 'preload-pip.js'), sandbox: true, contextIsolation: true, backgroundThrottling: false },
      });
      window.setAlwaysOnTop(true, 'screen-saver');
      window.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
      window.setIgnoreMouseEvents(true);
      // Windows kan utelate vinduet fra opptak. ScreenCaptureKit på macOS ignorerer dette.
      window.setContentProtection(true);
      window.setBounds(display.bounds);
      sentImage = null;
      const created = window;
      created.webContents.on('render-process-gone', () => {
        failed = true;
        hide();
      });
      ready = created.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`).catch((err) => {
        failed = true;
        hide();
        console.error('Could not open the on-screen PiP preview', err);
      });
    }
    const current = window;
    ready.then(() => {
      if (failed || latest !== frame || current.isDestroyed() || main.isDestroyed() || main.isFocused()) return;
      // Ett fast, gjennomsiktig vindu. GPU-en flytter kamerabildet mellom hvert skjermbilde.
      const viewport = display.bounds;
      const old = current.getBounds();
      if (Object.keys(viewport).some((k) => old[k] !== viewport[k])) current.setBounds(viewport);
      current.webContents.send('pip:frame', { image: image !== sentImage ? image : null, rect: local(bounds), motion });
      sentImage = image;
      if (!current.isVisible()) current.showInactive();
    });
  }

  return {
    update,
    hide,
    destroy() {
      hide();
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    },
  };
}

module.exports = { createPipPreview, pipBounds };
