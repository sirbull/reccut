import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TEMPLATES, drawTemplate, templateDefaults, templatePhase, validateTemplate } from '../src/shared/titletemplates.js';

// Et falskt lerret som husker hva som tegnes. Tekstbredde: 0,5 × størrelse per tegn.
function mockCtx() {
  const calls = [];
  let size = 10;
  const ctx = {
    calls,
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    beginPath() {},
    rect() {},
    clip() {},
    fill() {},
    set font(f) {
      size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(f)[1]);
    },
    get font() {
      return `${size}px`;
    },
    measureText: (t) => ({ width: t.length * size * 0.5 }),
    roundRect(x, y, w, h) {
      calls.push(['rect', Math.round(x), Math.round(y), Math.round(w), Math.round(h), ctx.globalAlpha]);
    },
    fillText(t, x) {
      calls.push(['text', t, Math.round(x), ctx.globalAlpha]);
    },
  };
  return ctx;
}

test('inn, midtdel og ut følger klippets lengde', () => {
  assert.deepEqual(templatePhase(0.4, 10, 0.8, 0.6), { phase: 'in', p: 0.5 });
  assert.deepEqual(templatePhase(5, 10, 0.8, 0.6), { phase: 'hold', p: 0 });
  assert.equal(templatePhase(9.7, 10, 0.8, 0.6).phase, 'out');
  // Kort klipp: animasjonene deler tiden.
  assert.equal(templatePhase(0.4, 1, 0.8, 0.6).phase, 'in');
  assert.equal(templatePhase(0.6, 1, 0.8, 0.6).phase, 'out');
});

test('boksen følger lengden på navnet', () => {
  const bar = BUILTIN_TEMPLATES.find((t) => t.id === 'lt-bar');
  const draw = (name) => {
    const ctx = mockCtx();
    drawTemplate(ctx, bar, 2, 4, 1920, 1080, { fields: { name, title: 'x' } });
    return ctx.calls;
  };
  const short = draw('Ola').find((c) => c[0] === 'rect' && c[3] > 20);
  const long = draw('Ola Nordmann Hansen').find((c) => c[0] === 'rect' && c[3] > 20);
  // 54 px tekst: 16 tegn mer gir 16 × 27 px bredere boks.
  assert.equal(long[3] - short[3], 16 * 27);
  // Teksten tegnes over boksen (bakgrunnen har lavere z).
  const calls = draw('Ola');
  assert.ok(calls.findIndex((c) => c[0] === 'rect') < calls.findIndex((c) => c[0] === 'text'));
  assert.ok(calls.some((c) => c[0] === 'text' && c[1] === 'Ola'));
});

test('midt i klippet står alt i ro, og før start er det usynlig', () => {
  const box = BUILTIN_TEMPLATES.find((t) => t.id === 'lt-box');
  const at = (t) => {
    const ctx = mockCtx();
    drawTemplate(ctx, box, t, 4, 1920, 1080, templateDefaults(box));
    return ctx.calls;
  };
  assert.ok(at(2).filter((c) => c[0] === 'rect').every((c) => c[5] === 1));
  assert.equal(at(2).filter((c) => c[0] === 'text').length, 2);
  // Ved start er ingenting synlig ennå, i noen av malene.
  for (const t of BUILTIN_TEMPLATES) {
    const ctx = mockCtx();
    drawTemplate(ctx, t, 0, 4, 1920, 1080, templateDefaults(t));
    assert.ok(ctx.calls.every((c) => c[c.length - 1] < 0.05), `${t.id} is visible at the start`);
  }
});

test('alle innebygde maler tegnes uten feil i flere formater', () => {
  for (const t of BUILTIN_TEMPLATES) {
    for (const [W, H] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      for (const time of [0.1, 2, 3.9]) drawTemplate(mockCtx(), t, time, 4, W, H, templateDefaults(t));
    }
    assert.equal(validateTemplate(JSON.parse(JSON.stringify(t))).id, t.id);
  }
});

test('ugyldige malfiler gir en forståelig feil', () => {
  assert.throws(() => validateTemplate({ format: 'other' }), /not a Reccut title template/);
  assert.throws(() => validateTemplate({ format: 'reccut-title', layers: [] }), /no layers/);
  const ok = validateTemplate({ format: 'reccut-title', layers: [{ type: 'text', text: '{{name}}' }, { type: 'image' }] });
  assert.equal(ok.layers.length, 1);
});
