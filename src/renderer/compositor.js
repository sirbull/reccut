// Setter sammen skjerm og kamera på ett lerret i skjermens native oppløsning.
// Layout 1: kamera i fullskjerm. Layout 2: skjerm i fullskjerm.
// Layout 3 til 6: bilde i bilde øverst til venstre, øverst til høyre,
// nederst til venstre og nederst til høyre.

const ANIM_MS = 320;
const MARGIN = 0.025;
export const PIP_SIZES = { small: 0.17, medium: 0.23, large: 0.31 };

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

function lerpRect(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    r: lerp(a.r, b.r, t),
    a: lerp(a.a, b.a, t),
  };
}

function sameRect(a, b) {
  return ['x', 'y', 'w', 'h', 'r', 'a'].every((k) => Math.abs(a[k] - b[k]) < 0.5 || (k === 'a' && Math.abs(a[k] - b[k]) < 0.01));
}

function isReady(video) {
  return Boolean(video && video.readyState >= 2 && video.videoWidth > 0);
}

export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.screenVideo = null;
    this.cameraVideo = null;
    this.layout = 6;
    this.lastCorner = 6;
    this.pipSize = 'medium';
    this.shape = 'rounded';
    this.mirror = false;
    this.cam = null;
    this.from = null;
    this.to = null;
    this.animStart = 0;
  }

  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.cam = null;
  }

  setLayout(n) {
    if (n >= 3 && n <= 6) this.lastCorner = n;
    this.layout = n;
  }

  effectiveLayout() {
    const hasScreen = isReady(this.screenVideo);
    const hasCamera = isReady(this.cameraVideo);
    if (!hasCamera) return 2;
    if (!hasScreen) return 1;
    return this.layout;
  }

  targetFor(layout) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (layout === 1) return { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };

    const w = W * PIP_SIZES[this.pipSize];
    const h = this.shape === 'circle' ? w : (w * 9) / 16;
    const r = this.shape === 'circle' ? w / 2 : w * 0.06;
    const m = Math.min(W, H) * MARGIN;
    const corner = layout === 2 ? this.lastCorner : layout;
    const x = corner === 3 || corner === 5 ? m : W - m - w;
    const y = corner === 3 || corner === 4 ? m : H - m - h;
    return { x, y, w, h, r, a: layout === 2 ? 0 : 1 };
  }

  draw(now = performance.now()) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const target = this.targetFor(this.effectiveLayout());

    if (!this.cam) {
      this.cam = this.from = this.to = target;
    } else if (!sameRect(target, this.to)) {
      this.from = { ...this.cam };
      this.to = target;
      this.animStart = now;
    }
    const t = Math.min(1, (now - this.animStart) / ANIM_MS);
    this.cam = t >= 1 ? this.to : lerpRect(this.from, this.to, easeOutCubic(t));
    const cam = this.cam;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const hasScreen = isReady(this.screenVideo);
    const hasCamera = isReady(this.cameraVideo);
    const cameraCoversAll = hasCamera && cam.a >= 0.99 && cam.w >= W - 1 && cam.h >= H - 1;

    if (hasScreen && !cameraCoversAll) this.drawContain(this.screenVideo);
    if (hasCamera && cam.a > 0.01) this.drawCamera(cam);
    if (!hasScreen && !hasCamera) this.drawPlaceholder();
  }

  drawContain(video) {
    const { ctx, canvas } = this;
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  drawCamera(cam) {
    const { ctx, canvas } = this;
    const video = this.cameraVideo;
    const isPip = cam.w < canvas.width * 0.9;

    ctx.save();
    ctx.globalAlpha = cam.a;

    if (isPip) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = canvas.width * 0.012;
      ctx.shadowOffsetY = canvas.width * 0.003;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(cam.x, cam.y, cam.w, cam.h, cam.r);
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.roundRect(cam.x, cam.y, cam.w, cam.h, cam.r);
    ctx.clip();

    // Beskjær kamerabildet slik at det fyller rammen (cover).
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(cam.w / vw, cam.h / vh);
    const sw = cam.w / scale;
    const sh = cam.h / scale;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    if (this.mirror) {
      ctx.translate(cam.x + cam.w, cam.y);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cam.w, cam.h);
    } else {
      ctx.drawImage(video, sx, sy, sw, sh, cam.x, cam.y, cam.w, cam.h);
    }
    ctx.restore();
  }

  drawPlaceholder() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#16191f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b7280';
    ctx.font = `${Math.round(canvas.width / 40)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Velg skjerm eller kamera', canvas.width / 2, canvas.height / 2);
  }
}
