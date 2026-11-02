import { fitBox } from './design.js';
import { layoutDesignText } from './designText.js';

function color(ctx, fill) {
  ctx.fillStyle = fill?.color || '#ffffff';
  ctx.globalAlpha *= fill?.alpha ?? 1;
}
export function drawDesign(ctx, design, getImage, { scale = 1, transparent = false, hideLayers = null } = {}) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.beginPath(); ctx.rect(0, 0, design.width, design.height); ctx.clip();
  if (!transparent && design.background) {
    ctx.save(); color(ctx, design.background); ctx.fillRect(0, 0, design.width, design.height); ctx.restore();
  }
  for (const l of design.layers) {
    if (l.hidden || hideLayers?.has(l.id)) continue;
    ctx.save();
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
    ctx.rotate(l.rotation * Math.PI / 180);
    ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
    ctx.translate(-l.w / 2, -l.h / 2);
    ctx.globalAlpha *= l.opacity;
    ctx.globalCompositeOperation = l.blend;
    if (l.type === 'image') {
      ctx.beginPath(); ctx.rect(0, 0, l.w, l.h); ctx.clip();
      const image = getImage(l);
      if (image) {
        const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
        const c = l.crop, box = fitBox(sw * c.w, sh * c.h, l.w, l.h, l.fit);
        ctx.drawImage(image, sw * c.x, sh * c.y, sw * c.w, sh * c.h, box.x, box.y, box.w, box.h);
      } else {
        ctx.fillStyle = '#3f3f46'; ctx.fillRect(0, 0, l.w, l.h);
        const cell = Math.max(8, Math.max(l.w, l.h) / 32);
        ctx.fillStyle = '#52525b';
        for (let y = 0, row = 0; y < l.h; y += cell, row++) for (let x = 0, col = 0; x < l.w; x += cell, col++) {
          if ((row + col) % 2 === 0) ctx.fillRect(x, y, Math.min(cell, l.w - x), Math.min(cell, l.h - y));
        }
        ctx.fillStyle = '#d4d4d8'; ctx.font = `${Math.min(24, l.w / 10)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Missing file', l.w / 2, l.h / 2);
      }
    } else if (l.type === 'text') {
      const layout = layoutDesignText(l, (t, font) => { ctx.font = font; return ctx.measureText(t).width; });
      ctx.beginPath(); ctx.rect(0, 0, l.w, l.h); ctx.clip();
      ctx.font = layout.font; ctx.textAlign = l.align; ctx.textBaseline = 'middle';
      ctx.letterSpacing = `${l.tracking || 0}px`;
      color(ctx, l.fill);
      const x = l.align === 'left' ? 0 : l.align === 'right' ? l.w : l.w / 2;
      const top = l.valign === 'top' ? 0 : l.valign === 'bottom' ? l.h - layout.height : (l.h - layout.height) / 2;
      if (l.fill) layout.lines.forEach((line, i) => ctx.fillText(line, x, top + (i + 0.5) * layout.lineHeight));
    } else if (l.fill) {
      color(ctx, l.fill);
      ctx.beginPath(); ctx.roundRect(0, 0, l.w, l.h, l.radius || 0); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
