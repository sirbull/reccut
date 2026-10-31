// Testbilde for media som mangler (Media Offline), i stil med det gamle testkortet NRK brukte
// for å kalibrere skjermer. Alt tegnes ut fra høyden og bredden, så sirkelen i midten alltid er
// rund, uansett format: 16:9, 4:3, kvadrat eller stående video.

const GREY = '#7d7d7d';
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
// 75 % fargestolper som på testkort.
const BARS = ['#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf'];

function fitFont(ctx, text, maxW, size, minSize, weight = 700) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > minSize && ctx.measureText(text).width > maxW) {
    s = Math.max(minSize, s * 0.92);
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

// Korter inn midt i teksten, så både starten og filendelsen synes.
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let keep = text.length;
  let out = text;
  while (keep > 4 && ctx.measureText(out).width > maxW) {
    keep--;
    const a = Math.ceil(keep / 2);
    out = `${text.slice(0, a)}…${text.slice(text.length - (keep - a))}`;
  }
  return out;
}

// Bredden av sirkelen i høyden y (målt fra sentrum).
function chord(R, y) {
  return 2 * Math.sqrt(Math.max(0, R * R - y * y));
}

/**
 * Tekstboks med hvit tekst på svart. Boksen er like bred som sirkelen der den står, men kan
 * vokse utover sirkelen (opptil nesten hele bildet) når teksten er lang, så lange filnavn får plass.
 */
function textBox(ctx, text, cx, cy, y, h, R, W, minFont) {
  // y er absolutt; bredden på sirkelen regnes fra sentrum.
  const inside = Math.min(chord(R, Math.abs(y - cy)), chord(R, Math.abs(y + h - cy))) * 0.92;
  const pad = h * 0.5;
  // Teksten beholder størrelsen så lenge den får plass i bildet; boksen vokser heller utover sirkelen.
  const size = fitFont(ctx, text, W * 0.92 - pad * 2, h * 0.62, minFont);
  let w = Math.max(inside, Math.min(W * 0.94, ctx.measureText(text).width + pad * 2));
  const shown = ellipsize(ctx, text, w - pad * 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - w / 2, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillText(shown, cx, y + h / 2 + size * 0.04);
  return w;
}

// Hjulene i hjørnene: svarte og hvite sektorer og ringer, for skarphet og geometri.
function wheel(ctx, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.clip();
  const n = 24;
  ctx.fillStyle = '#000';
  for (let i = 0; i < n; i += 2) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  for (const [k, c] of [[0.62, '#fff'], [0.5, '#000'], [0.4, '#fff'], [0.3, '#000'], [0.2, '#fff'], [0.1, '#000']]) {
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  }
  // Kryss gjennom midten.
  ctx.fillStyle = '#000';
  ctx.fillRect(x - r, y - r * 0.015, r * 2, r * 0.03);
  ctx.fillRect(x - r * 0.015, y - r, r * 0.03, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = r * 0.06;
  ctx.stroke();
}

// Stolper med vannrette striper som blir tettere, mellom hjulene på sidene.
function sideGrating(ctx, x, y, w, h) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#000';
  const zones = 4;
  for (let z = 0; z < zones; z++) {
    const zy = y + (h / zones) * z;
    const lines = 3 + z * 3;
    const step = h / zones / lines;
    for (let i = 0; i < lines; i++) ctx.fillRect(x, zy + i * step, w, step / 2);
  }
}

export function drawTestCard(ctx, W, H, { top = 'MEDIA OFFLINE', bottom = '', info = '' } = {}) {
  ctx.save();
  const S = Math.min(W, H);
  const cx = W / 2;
  const cy = H / 2;
  const R = S * 0.44;
  // Rutenett med kvadratiske ruter, sentrert om midten.
  const cell = S / 12.5;
  const line = Math.max(1, cell * 0.075);
  ctx.fillStyle = GREY;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  const x0 = cx - Math.ceil(cx / cell) * cell;
  const y0 = cy - Math.ceil(cy / cell) * cell;
  for (let x = x0; x <= W; x += cell) ctx.fillRect(x - line / 2, 0, line, H);
  for (let y = y0; y <= H; y += cell) ctx.fillRect(0, y - line / 2, W, line);

  // Fargefelt på sidene av sirkelen, i rutenettet.
  const side = (dir) => {
    const xa = cx + dir * (R + cell * 0.6);
    const cw = cell;
    const x = dir < 0 ? xa - cw : xa;
    if (x < 0 || x + cw > W) return;
    const cols = dir < 0 ? ['#2e9c8b', '#c8708e', '#b0903e'] : ['#7f9a3a', '#8873b5', '#6a7fc4'];
    const rows = [[-4, -1], [-1, 2], [2, 4]];
    rows.forEach(([a, b], i) => {
      ctx.fillStyle = cols[i];
      ctx.fillRect(x, cy + a * cell, cw, (b - a) * cell);
    });
    // Smal blå stolpe øverst ved siden av, som på testkortet.
    ctx.fillStyle = '#6577c1';
    const x2 = dir < 0 ? x + cw : x - cw * 0.6;
    if (x2 >= 0 && x2 + cw * 0.6 <= W) ctx.fillRect(x2, cy - 4 * cell, cw * 0.6, cell * 1.4);
  };
  side(-1);
  side(1);

  // Hjul i hjørnene og striper mellom dem, når det er plass ved siden av sirkelen.
  const wr = S * 0.134;
  const wx = Math.min(S * 0.75, W / 2 - wr * 1.15);
  const wy = S * 0.29;
  if (Math.hypot(wx, wy) > R + wr * 1.7 && wx + wr <= W / 2 && wy + wr <= H / 2) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) wheel(ctx, cx + sx * wx, cy + sy * wy, wr);
      sideGrating(ctx, cx + sx * wx - wr * 0.25, cy - wy + wr * 1.15, wr * 0.5, (wy - wr * 1.15) * 2);
    }
  }

  // Sirkelen.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  const Y = (k) => cy + k * R;
  const band = (a, b, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(cx - R, Y(a), R * 2, (b - a) * R);
  };
  band(-1, -0.42, '#fff');
  // Rad med svarte og hvite ruter.
  const n = 14;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? '#000' : '#fff';
    ctx.fillRect(cx - R + (i * 2 * R) / n, Y(-0.5), (2 * R) / n + 0.5, 0.1 * R);
  }
  // Fargestolper.
  BARS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(cx - R + (i * 2 * R) / BARS.length, Y(-0.4), (2 * R) / BARS.length + 0.5, 0.36 * R);
  });
  // Hvitt felt med trådkors.
  band(-0.04, 0.2, '#fff');
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - R, Y(0.08) - R * 0.008, R * 2, R * 0.016);
  ctx.fillRect(cx - R * 0.008, Y(-0.12), R * 0.016, R * 0.34);
  // Rister med økende frekvens.
  band(0.2, 0.44, '#fff');
  const zones = 5;
  const zw = (R * 1.6) / zones;
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - R, Y(0.2), R * 0.2, 0.24 * R);
  for (let z = 0; z < zones; z++) {
    const lines = 4 + z * 4;
    const step = zw / lines;
    for (let i = 0; i < lines; i++) ctx.fillRect(cx - R * 0.8 + z * zw + i * step, Y(0.2), step / 2, 0.24 * R);
  }
  // Gråtrapp fra svart til hvitt.
  for (let i = 0; i < 6; i++) {
    const v = Math.round((i / 5) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(cx - R + (i * 2 * R) / 6, Y(0.44), (2 * R) / 6 + 0.5, 0.2 * R);
  }
  band(0.64, 0.86, '#fff');
  // Gult, rødt og gult nederst.
  band(0.86, 1, '#bfbf00');
  ctx.fillStyle = '#bf0000';
  ctx.fillRect(cx - R * 0.12, Y(0.86), R * 0.24, R * 0.14);
  ctx.restore();

  // Grønne markører øverst og liten teksten med format, som «1080/50i 16:9».
  ctx.fillStyle = '#1fbf3f';
  for (const sx of [-1, 1]) ctx.fillRect(cx + sx * R * 0.55 - R * 0.035, Y(-0.62), R * 0.07, R * 0.07);
  if (info) {
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, info, R * 0.9, R * 0.075, 6, 700);
    ctx.fillText(info, cx, Y(-0.585));
  }
  // Tekstboksene: øverst (som «CHANNEL 6») og nederst (som stedsnavnet).
  const minFont = Math.max(8, S * 0.022);
  if (top) textBox(ctx, top, cx, cy, Y(-0.86), R * 0.17, R, W, minFont);
  if (bottom) textBox(ctx, bottom, cx, cy, Y(0.665), R * 0.17, R, W, minFont);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, S * 0.004);
  ctx.stroke();
  ctx.restore();
}
