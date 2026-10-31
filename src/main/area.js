// Valg av opptaksområde rett på skjermen, og en ramme som viser området mens du tar opp.
// Begge er gjennomsiktige vinduer over hele skjermen. Rammen tegnes utenfor området,
// så den aldri havner i opptaket, og den er skjult for skjermopptak der systemet støtter det.
const { BrowserWindow, screen } = require('electron');

const PICKER_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reccut</title><style>
html,body{margin:0;height:100%;overflow:hidden;cursor:crosshair;user-select:none;font:13px -apple-system,system-ui,"Segoe UI",sans-serif}
#tint{position:fixed;inset:0;background:rgba(0,0,0,.42)}
#sel{position:fixed;box-sizing:border-box;border:2px solid #f7c948;box-shadow:0 0 0 9999px rgba(0,0,0,.42);cursor:move;display:none}
body.has #tint{display:none}
.h{position:absolute;width:12px;height:12px;margin:-7px 0 0 -7px;background:#fff;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.6)}
#size{position:absolute;left:0;top:-30px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.75);color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
#bar{position:fixed;left:50%;bottom:48px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:8px;border-radius:12px;background:rgba(28,28,30,.94);box-shadow:0 8px 30px rgba(0,0,0,.5);color:#ddd;cursor:default}
#bar button{border:0;border-radius:7px;padding:7px 11px;background:rgba(255,255,255,.08);color:#eee;font:inherit;cursor:pointer}
#bar button.on{background:rgba(247,201,72,.25);color:#f7c948}
#bar button.go{background:#f7c948;color:#111;font-weight:600}
#bar .sep{width:1px;height:20px;background:rgba(255,255,255,.15);margin:0 4px}
#hint{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);color:#fff;font-size:20px;text-shadow:0 2px 8px rgba(0,0,0,.8);pointer-events:none}
body.has #hint{display:none}
</style></head><body>
<div id="tint"></div><div id="hint">Drag to select the area you want to record</div>
<div id="sel"><div id="size"></div></div>
<div id="bar">
<button data-a="free" class="on">Free</button><button data-a="1.7778">16:9</button><button data-a="0.5625">9:16</button><button data-a="1">1:1</button><button data-a="1.3333">4:3</button>
<span class="sep"></span><button id="full">Full Screen</button><button id="cancel">Cancel</button><button id="ok" class="go">Use Area</button>
</div>
<script>
const P=__PARAMS__;const SF=P.sf||1;
const W=()=>innerWidth,H=()=>innerHeight;
let r=null,aspect=null,drag=null;
const sel=document.getElementById('sel'),size=document.getElementById('size');
const c=P.cur;if(c){r={x:c.x*W(),y:c.y*H(),w:c.w*W(),h:c.h*H()};}
const H8=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
for(const [hx,hy] of H8){const d=document.createElement('div');d.className='h';d.dataset.hx=hx;d.dataset.hy=hy;d.style.left=(hx+1)*50+'%';d.style.top=(hy+1)*50+'%';d.style.cursor=hx&&hy?(hx===hy?'nwse-resize':'nesw-resize'):hx?'ew-resize':'ns-resize';sel.appendChild(d);}
function clampR(){if(!r)return;r.w=Math.max(16,Math.min(r.w,W()));r.h=Math.max(16,Math.min(r.h,H()));r.x=Math.max(0,Math.min(r.x,W()-r.w));r.y=Math.max(0,Math.min(r.y,H()-r.h));}
function draw(){document.body.classList.toggle('has',!!r);if(!r){sel.style.display='none';return;}clampR();Object.assign(sel.style,{display:'block',left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
const pw=Math.round(r.w*SF/2)*2,ph=Math.round(r.h*SF/2)*2;size.textContent=pw+' \\u00d7 '+ph;size.style.top=r.y<36?'6px':'-30px';size.style.left=r.y<36?'6px':'0';}
function fit(){if(!r||!aspect)return;const cx=r.x+r.w/2,cy=r.y+r.h/2;let w=r.w,h=w/aspect;if(h>H()){h=H();w=h*aspect;}r={x:cx-w/2,y:cy-h/2,w,h};}
addEventListener('pointerdown',e=>{if(e.target.closest('#bar'))return;e.preventDefault();const t=e.target;
if(t.classList.contains('h'))drag={kind:'resize',hx:+t.dataset.hx,hy:+t.dataset.hy,x:e.clientX,y:e.clientY,r0:{...r}};
else if(r&&(t===sel||t===size))drag={kind:'move',x:e.clientX,y:e.clientY,r0:{...r}};
else drag={kind:'new',x:e.clientX,y:e.clientY};
document.body.setPointerCapture(e.pointerId);});
addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
if(drag.kind==='new'){if(Math.abs(dx)<4&&Math.abs(dy)<4)return;let w=Math.abs(dx),h=Math.abs(dy);if(aspect){if(w/h>aspect)h=w/aspect;else w=h*aspect;}r={x:dx<0?drag.x-w:drag.x,y:dy<0?drag.y-h:drag.y,w,h};}
else if(drag.kind==='move'){r={...drag.r0,x:drag.r0.x+dx,y:drag.r0.y+dy};}
else{const o=drag.r0;let x1=o.x,y1=o.y,x2=o.x+o.w,y2=o.y+o.h;if(drag.hx<0)x1+=dx;if(drag.hx>0)x2+=dx;if(drag.hy<0)y1+=dy;if(drag.hy>0)y2+=dy;
let w=Math.max(16,x2-x1),h=Math.max(16,y2-y1);if(aspect){if(drag.hx&&!drag.hy)h=w/aspect;else if(drag.hy&&!drag.hx)w=h*aspect;else if(w/h>aspect)h=w/aspect;else w=h*aspect;}
r={x:drag.hx<0?o.x+o.w-w:drag.hx>0?o.x:o.x+(o.w-w)/2,y:drag.hy<0?o.y+o.h-h:drag.hy>0?o.y:o.y+(o.h-h)/2,w,h};}
draw();});
addEventListener('pointerup',()=>{drag=null;});
const done=(v)=>{document.title='RESULT:'+JSON.stringify(v);};
document.getElementById('ok').onclick=()=>r?done({x:r.x/W(),y:r.y/H(),w:r.w/W(),h:r.h/H()}):null;
document.getElementById('full').onclick=()=>done('full');
document.getElementById('cancel').onclick=()=>done(null);
for(const b of document.querySelectorAll('[data-a]'))b.onclick=()=>{for(const o of document.querySelectorAll('[data-a]'))o.classList.toggle('on',o===b);aspect=b.dataset.a==='free'?null:Number(b.dataset.a);fit();draw();};
addEventListener('keydown',e=>{if(e.key==='Escape')done(null);if(e.key==='Enter'&&r)document.getElementById('ok').click();});
addEventListener('dblclick',e=>{if(r&&!e.target.closest('#bar'))document.getElementById('ok').click();});
draw();
</script></body></html>`;

const COUNT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#1c1c1e;color:#fff;font:600 64px -apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
</style></head><body><div id="n"></div><script>window.setN=(v)=>{document.getElementById('n').textContent=v;};</script></body></html>`;

function displayFor(displayId) {
  const all = screen.getAllDisplays();
  return all.find((d) => String(d.id) === String(displayId)) || screen.getPrimaryDisplay();
}

function overlayWindow(display, opts = {}) {
  const b = display.bounds;
  const w = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    show: false,
    focusable: opts.focusable !== false,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  w.setBounds(b);
  return w;
}

let picking = null;

// Viser velgeren og gir { x, y, w, h } i andeler av skjermen, 'full' eller null (avbrutt).
function selectArea({ displayId, current, mainWindow }) {
  if (picking) return picking;
  const display = displayFor(displayId);
  const w = overlayWindow(display);
  const params = JSON.stringify({ sf: display.scaleFactor || 1, cur: current || null });
  const wasVisible = mainWindow?.isVisible();
  mainWindow?.hide();
  picking = new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      if (!w.isDestroyed()) w.destroy();
      if (wasVisible && mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
      picking = null;
      resolve(v);
    };
    w.webContents.on('page-title-updated', (_e, title) => {
      if (!title.startsWith('RESULT:')) return;
      try {
        finish(JSON.parse(title.slice(7)));
      } catch {
        finish(null);
      }
    });
    w.on('closed', () => finish(null));
    w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PICKER_HTML.replace('__PARAMS__', params))}`).catch(() => finish(null));
    w.once('ready-to-show', () => {
      w.show();
      w.focus();
    });
  });
  return picking;
}

/* Rammen rundt området: fire smale vinduer langs kantene, rett utenfor området, så rammen
   aldri kommer med i opptaket. De trenger ikke gjennomsiktighet og tar ikke imot klikk. */

let edges = [];
let countWin = null;
let countReady = null;

function stripWindow(color) {
  const w = new BrowserWindow({
    width: 10,
    height: 10,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    enableLargerThanScreen: true,
    backgroundColor: color,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(true);
  // Skjult for skjermopptak på macOS og Windows.
  w.setContentProtection(true);
  return w;
}

function setFrame(state) {
  if (!state?.visible || !state.area) {
    for (const w of edges) if (!w.isDestroyed()) w.hide();
    if (countWin && !countWin.isDestroyed()) countWin.hide();
    return;
  }
  const d = displayFor(state.displayId).bounds;
  const a = state.area;
  const x = Math.round(d.x + a.x * d.width);
  const y = Math.round(d.y + a.y * d.height);
  const w = Math.round(a.w * d.width);
  const h = Math.round(a.h * d.height);
  const t = 3;
  const m = 2;
  const color = state.recording ? '#ff453a' : '#f7c948';
  if (edges.length !== 4 || edges.some((e) => e.isDestroyed())) {
    for (const e of edges) if (!e.isDestroyed()) e.destroy();
    edges = [0, 1, 2, 3].map(() => stripWindow(color));
  }
  const rects = [
    { x: x - m - t, y: y - m - t, width: w + 2 * (m + t), height: t },
    { x: x - m - t, y: y + h + m, width: w + 2 * (m + t), height: t },
    { x: x - m - t, y: y - m, width: t, height: h + 2 * m },
    { x: x + w + m, y: y - m, width: t, height: h + 2 * m },
  ];
  edges.forEach((e, i) => {
    e.setBackgroundColor(color);
    e.setBounds(rects[i]);
    if (!e.isVisible()) e.showInactive();
  });
  // Nedtelling midt i området før opptaket starter.
  if (state.countdown) {
    if (!countWin || countWin.isDestroyed()) {
      countWin = stripWindow('#1c1c1e');
      countReady = countWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(COUNT_HTML)}`);
    }
    const size = 120;
    countWin.setBounds({ x: Math.round(x + w / 2 - size / 2), y: Math.round(y + h / 2 - size / 2), width: size, height: size });
    const cw = countWin;
    countReady.then(() => {
      if (cw.isDestroyed()) return;
      cw.webContents.executeJavaScript(`setN(${Number(state.countdown)})`).catch(() => {});
      if (!cw.isVisible()) cw.showInactive();
    });
  } else if (countWin && !countWin.isDestroyed()) countWin.hide();
}

function closeFrame() {
  for (const e of edges) if (!e.isDestroyed()) e.destroy();
  edges = [];
  if (countWin && !countWin.isDestroyed()) countWin.destroy();
  countWin = null;
}

module.exports = { selectArea, setFrame, closeFrame };
