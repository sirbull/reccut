// Selective HSL adjustments. Range weights always use the source hue, so a
// recolored red cannot be picked up again by the blue controls in this instance.
export const HUE_BANDS = [
  { id: 'red', label: 'Reds', hue: 0, color: '#ed5353' },
  { id: 'orange', label: 'Oranges', hue: 30, color: '#ef993e' },
  { id: 'yellow', label: 'Yellows', hue: 60, color: '#e3d34d' },
  { id: 'green', label: 'Greens', hue: 120, color: '#55bf68' },
  { id: 'aqua', label: 'Aquas', hue: 180, color: '#45c4ca' },
  { id: 'blue', label: 'Blues', hue: 240, color: '#527bea' },
  { id: 'purple', label: 'Purples', hue: 270, color: '#a568df' },
  { id: 'magenta', label: 'Magentas', hue: 300, color: '#df63b6' },
];
export const HUE_SATURATION_DEFAULTS = Object.fromEntries([
  ['amount', 1],
  ...HUE_BANDS.flatMap(({ id, hue }) => [[`${id}Hue`, 0], [`${id}Saturation`, 0], [`${id}Center`, hue], [`${id}Width`, 1]]),
]);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const number = (v, fallback, a, b) => clamp(Number.isFinite(v) ? v : fallback, a, b);
const wrap = (v) => v - Math.floor(v);
const CHANNEL_HUES = [0, 2 / 3, 1 / 3];

export function hueSaturationSettings(p = {}) {
  const bands = HUE_BANDS.map(({ id, hue }, i) => {
    const width = number(p[`${id}Width`], 1, 0.1, 2);
    return {
      center: wrap(number(p[`${id}Center`], hue, 0, 360) / 360),
      left: wrap((hue - HUE_BANDS[(i + 7) % 8].hue) / 360) * width,
      right: wrap((HUE_BANDS[(i + 1) % 8].hue - hue) / 360) * width,
      hue: number(p[`${id}Hue`], 0, -180, 180) / 360,
      saturation: number(p[`${id}Saturation`], 0, -1, 1),
    };
  });
  return { amount: number(p.amount, 1, 0, 1), bands, active: bands.some((b) => b.hue !== 0 || b.saturation !== 0) };
}
export function hueBandWeight(hue, band) {
  const distance = wrap(hue - band.center + 0.5) - 0.5;
  const t = clamp(Math.abs(distance) / (distance < 0 ? band.left : band.right));
  return 1 - t * t * (3 - 2 * t);
}

// CPU fallback and numerical reference for the GPU path. Lightness and alpha
// stay intact; exact grays have no hue and remain neutral.
export function hueSaturationPixels(data, settings) {
  const out = new Uint8ClampedArray(data);
  if (!settings.active || settings.amount === 0) return out;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b), chroma = hi - lo;
    if (chroma < 0.000001) continue;
    const lightness = (hi + lo) / 2;
    const saturation = chroma / Math.max(0.000001, 1 - Math.abs(2 * lightness - 1));
    const hue = wrap((hi === r ? (g - b) / chroma : hi === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) / 6);
    let shift = 0, sat = 0;
    for (const band of settings.bands) {
      if (band.hue === 0 && band.saturation === 0) continue;
      const weight = hueBandWeight(hue, band);
      shift += band.hue * weight;
      sat += band.saturation * weight;
    }
    if (shift === 0 && sat === 0) continue;
    // Overlapping ranges add their adjustments. Normalizing only the active
    // ranges would cause a visible jump when another control crosses zero.
    const h = wrap(hue + shift);
    const s = clamp(saturation * (1 + sat));
    const c = (1 - Math.abs(2 * lightness - 1)) * s;
    for (let channel = 0; channel < 3; channel++) {
      const component = clamp(Math.abs(wrap(h + CHANNEL_HUES[channel]) * 6 - 3) - 1);
      const value = lightness + c * (component - 0.5);
      out[i + channel] = data[i + channel] + (value * 255 - data[i + channel]) * settings.amount;
    }
  }
  return out;
}

export const HUE_SATURATION_GLSL = `
precision highp float;
in vec2 uv; out vec4 outColor;
uniform sampler2D image;
uniform vec3 ranges[8];
uniform vec2 adjustments[8];
uniform float amount;
void main(){
  vec4 c=texture(image,uv);
  float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),chroma=hi-lo;
  if(chroma<0.000001||c.a==0.0){outColor=c;return;}
  float l=(hi+lo)*0.5,s=chroma/max(0.000001,1.0-abs(2.0*l-1.0));
  float h=fract((hi==c.r?(c.g-c.b)/chroma:hi==c.g?(c.b-c.r)/chroma+2.0:(c.r-c.g)/chroma+4.0)/6.0);
  vec2 change=vec2(0);
  for(int i=0;i<8;i++){
    if(adjustments[i]==vec2(0))continue;
    float d=fract(h-ranges[i].x+0.5)-0.5;
    float t=clamp(abs(d)/(d<0.0?ranges[i].y:ranges[i].z),0.0,1.0);
    float w=1.0-t*t*(3.0-2.0*t);
    change+=adjustments[i]*w;
  }
  if(change==vec2(0)){outColor=c;return;}
  h=fract(h+change.x);s=clamp(s*(1.0+change.y),0.0,1.0);
  vec3 components=clamp(abs(fract(h+vec3(0,2.0/3.0,1.0/3.0))*6.0-3.0)-1.0,0.0,1.0);
  vec3 result=vec3(l)+(1.0-abs(2.0*l-1.0))*s*(components-0.5);
  outColor=vec4(mix(c.rgb,result,amount),c.a);
}`;
