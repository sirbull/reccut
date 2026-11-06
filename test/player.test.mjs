import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { newProject, makeClip } from '../src/shared/model.js';

// Kjør den faktiske spilleren og tegnemotoren med en dekoder vi kan forsinke.
const bundle = (await build({ stdin: { contents: `export * from './src/renderer/player.js'; export { setPrefs } from './src/renderer/prefs.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'browser' })).outputFiles[0].text;

function project(specs = [{ dur: 10, in: 2 }, { dur: 5, in: 4 }]) {
  const p = newProject('Playback');
  let start = 0;
  for (const [i, spec] of specs.entries()) {
    const id = `media${i}`;
    const m = { id, kind: 'video', duration: 120, streams: { main: { path: `/tmp/${id}.mp4`, hasVideo: true, hasAudio: true, duration: 120 } } };
    p.media[id] = m;
    const c = makeClip('video', { media: m, start, ...spec });
    p.clips[c.id] = c;
    p.primary.push(c.id);
    start += c.dur;
  }
  p.duration = start;
  return p;
}

function setup(p = project(), initialTime = 0, { quality = 'quality', dpr = 1 } = {}) {
  let now = 1000;
  let time = initialTime;
  let nextFrame;
  const videos = [];
  const canvases = [];
  class Canvas {
    width = 640;
    height = 360;
    pixel = 'black';
    style = {};
    draws = [];
    getContext(type) {
      if (type !== '2d') return null;
      return this.context ||= {
        canvas: this, globalAlpha: 1,
        save() {}, restore() {}, setTransform() {}, translate() {}, scale() {}, rotate() {},
        fillRect: () => { this.pixel = 'black'; },
        clearRect: () => { this.pixel = 'clear'; },
        drawImage: (img) => {
          // Søkende videoelementer er ikke tegnbare, selv om de har dimensjoner.
          assert.ok(!img.seeking, 'must never draw a seeking media element');
          this.draws.push({ source: img, width: this.width, height: this.height, filter: this.context.filter });
          this.pixel = img.pixel;
        },
      };
    }
  }
  class Media {
    _time = 0;
    readyState = 0;
    duration = NaN;
    videoWidth = 0;
    videoHeight = 0;
    seeking = false;
    paused = true;
    listeners = {};
    seeks = [];
    playbackRate = 1;
    get currentTime() { return this._time; }
    set currentTime(t) {
      assert.ok(!this.seeking, 'only one decoder seek may be in flight');
      this._time = t;
      this.seeks.push(t);
      this.seeking = true;
      this.readyState = 1;
    }
    get pixel() { return `${this.src}@${this._time.toFixed(3)}`; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    finish() {
      const first = !this.videoWidth;
      const wasSeeking = this.seeking;
      this.duration = 120;
      this.videoWidth = 1280;
      this.videoHeight = 720;
      this.readyState = 4;
      this.seeking = false;
      if (first) for (const fn of this.listeners.loadeddata || []) fn();
      if (wasSeeking) for (const fn of this.listeners.seeked || []) fn();
    }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  const node = () => ({ gain: { value: 0, setTargetAtTime() {} }, connect() { return this; }, disconnect() {} });
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, console,
    window: { devicePixelRatio: dpr }, localStorage: { getItem: key => key === 'prefs' ? JSON.stringify({ viewerQuality: quality }) : null, setItem() {} },
    AudioContext: class {
      currentTime = 0;
      audioWorklet = { addModule: async () => {} };
      createGain = node;
      createMediaElementSource = node;
      resume() {}
    },
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { nextFrame = fn; return 1; },
    cancelAnimationFrame() {},
    document: { createElement: (type) => {
      if (type === 'canvas') { const cv = new Canvas(); canvases.push(cv); return cv; }
      const el = new Media();
      videos.push(el);
      return el;
    } },
  });
  const playing = { value: false };
  const player = module.exports.createPlayer({ getProject: () => p, playing, getTime: () => time, setTime: (t) => { time = t; } });
  const canvas = new Canvas();
  player.attachCanvas(canvas);
  player.start();
  return { player, canvas, videos, canvases, playing, setQuality: quality => module.exports.setPrefs({ viewerQuality: quality }), setLoop: loopPlayback => module.exports.setPrefs({ loopPlayback }), getTime: () => time, switchProject(next) { p = next; player.invalidate(); }, tick(ms = 16) {
    now += ms;
    for (const el of videos) if (!el.paused && !el.seeking) el._time += ms / 1000 * el.playbackRate;
    nextFrame();
  } };
}

test('rask scrubbing beholder et bilde, oppdaterer underveis og ender på nyeste pekertid', () => {
  const s = setup();
  s.tick();
  const [video] = s.videos;
  video.finish();
  s.tick();
  const first = s.canvas.pixel;
  assert.match(first, /@2\.000$/);
  s.player.seek(3);
  s.tick();
  assert.equal(s.canvas.pixel, first);
  s.player.seek(4);
  s.tick();
  s.player.seek(5);
  s.tick();
  assert.equal(video.seeks.length, 2);
  video.finish();
  s.tick();
  assert.match(s.canvas.pixel, /@5\.000$/, 'vis ferdig dekodet bilde mens neste søkes opp');
  assert.equal(video.seeks.at(-1), 7);
  video.finish();
  s.tick();
  assert.match(s.canvas.pixel, /@7\.000$/);
});

test('et gammelt ventende søk kan ikke overstyre at pekeren flyttes tilbake', () => {
  const s = setup();
  s.tick();
  const [video] = s.videos;
  video.finish();
  s.tick();
  s.player.seek(3);
  s.tick();
  s.player.seek(4);
  s.tick();
  s.player.seek(3);
  video.finish();
  s.tick();
  assert.equal(video.currentTime, 5);
  assert.equal(video.seeking, false);
  assert.match(s.canvas.pixel, /@5\.000$/);
});

test('korte og raske klipp forhåndslastes ved innpunktet og trenger ikke et nytt søk ved kuttet', () => {
  const s = setup(project([{ dur: 2 }, { dur: 0.2, in: 4, speed: 2 }, { dur: 5, in: 8 }]), 1);
  s.tick();
  assert.equal(s.videos.length, 3, 'også klippet kortere enn forhåndslastingsvinduet lastes');
  s.videos.forEach((v) => v.finish());
  s.tick();
  assert.ok(Math.abs(s.videos[1].currentTime - 4) < 0.001);
  assert.ok(Math.abs(s.videos[2].currentTime - 8) < 0.001);
  s.player.play();
  s.tick(1000);
  assert.match(s.canvas.pixel, /media1/);
  assert.equal(s.videos[1].seeking, false);
  assert.equal(s.videos[1].seeks.length, 1);
});

test('et forsinket klipp gir ikke svart bilde ved klippbytte under avspilling', () => {
  const s = setup(project([{ dur: 2 }, { dur: 5, in: 4 }]), 1);
  s.tick();
  s.videos[0].finish();
  s.tick();
  const before = s.canvas.pixel;
  s.player.play();
  s.tick(1000);
  assert.equal(s.canvas.pixel, before);
  s.videos[1].finish();
  s.tick();
  assert.match(s.canvas.pixel, /media1/);
});

test('en faktisk tom del av tidslinjen vises fortsatt som svart', () => {
  const p = project();
  const gap = makeClip('gap', { start: p.duration, dur: 3 });
  p.clips[gap.id] = gap;
  p.primary.push(gap.id);
  p.duration += gap.dur;
  const s = setup(p);
  s.tick();
  s.videos[0].finish();
  s.tick();
  assert.notEqual(s.canvas.pixel, 'black');
  s.player.seek(gap.start + 1);
  s.tick();
  assert.equal(s.canvas.pixel, 'black');
});

test('avspillingen stopper på siste faktiske bilde og beholder det etterpå', () => {
  const p = project([{ dur: 2, in: 4 }]);
  const s = setup(p, 1);
  s.tick(); s.videos[0].finish(); s.tick();
  s.player.play(); s.tick(1100);
  assert.equal(s.playing.value, false);
  const last = (Math.ceil(p.duration * p.fps - 1e-7) - 1) / p.fps;
  assert.equal(s.getTime(), last);
  assert.equal(s.videos[0].paused, true);
  s.videos[0].finish(); s.tick();
  assert.equal(s.canvas.pixel, `${s.videos[0].src}@${(4 + last).toFixed(3)}`);
  assert.equal(s.player.snapshot({ fresh: true }), s.canvas);
  const final = s.canvas.pixel;
  s.player.invalidate(); s.tick(1000);
  assert.equal(s.canvas.pixel, final);
  s.player.play();
  assert.equal(s.getTime(), 0, 'ny avspilling begynner på starten');
});

test('søk til slutt viser siste bilde også for brøkdels-fps og korte sekvenser', () => {
  for (const [fps, duration] of [[30, 2], [29.97, 7 / 29.97], [30, 1.01], [30, 0.01]]) {
    const p = project([{ dur: duration, in: 4 }]); p.fps = fps;
    const s = setup(p, duration);
    s.tick();
    assert.ok(s.videos.length > 0, 'sluttposisjonen må fortsatt be om videobildet');
    s.videos[0].finish(); s.tick();
    const last = Math.max(0, Math.ceil(duration * fps - 1e-7) - 1) / fps;
    assert.equal(s.canvas.pixel, `${s.videos[0].src}@${(4 + last).toFixed(3)}`);
    assert.equal(s.player.snapshot({ fresh: true }), s.canvas);
    s.player.seek(duration + 1); s.tick();
    assert.equal(s.canvas.pixel, 'black', 'området etter tidslinjen er fortsatt tomt');
  }
});

test('et avspillingsområde slutter på bildet før utpunktet, også ved et kutt', () => {
  const p = project([{ dur: 2, in: 4 }, { dur: 2, in: 10 }]);
  p.range = { in: 1, out: 2 };
  const s = setup(p, 1.5);
  s.tick(); s.videos.forEach(v => v.finish()); s.tick();
  s.player.play(); s.tick(600);
  s.videos.forEach(v => v.finish()); s.tick();
  assert.equal(s.playing.value, false);
  assert.match(s.canvas.pixel, /media0/);
  assert.equal(s.getTime(), 59 / 30);
  assert.ok(s.videos.every(v => v.paused));
});

test('slutt med et bevisst tomt område forblir svart og løkke starter på nytt', () => {
  const p = project([{ dur: 2 }]);
  const gap = makeClip('gap', { start: 2, dur: 1 });
  p.clips[gap.id] = gap; p.primary.push(gap.id); p.duration = 3;
  const s = setup(p, p.duration); s.tick();
  assert.equal(s.canvas.pixel, 'black');
  const loop = setup(project([{ dur: 2 }]), 1.5);
  loop.setQuality('quality');
  // The preference is shared with the actual player through its public setter.
  loop.setLoop(true); loop.player.play(); loop.tick(600);
  assert.equal(loop.playing.value, true);
  assert.equal(loop.getTime(), 0);
});

test('en overgang erstatter ikke bildet før begge videolagene er klare', () => {
  const p = project();
  p.clips[p.primary[1]].transition = { type: 'dissolve', dur: 1 };
  const s = setup(p, 9);
  s.tick();
  s.videos[0].finish();
  s.tick();
  const before = s.canvas.pixel;
  s.player.seek(9.75);
  s.tick();
  assert.equal(s.canvas.pixel, before);
  s.videos[1].finish();
  s.tick();
  assert.match(s.canvas.pixel, /media1/);
});

test('avspilling bakover forhåndslaster siste kildebilde før forrige kutt', () => {
  const s = setup(project([{ dur: 2, in: 1 }, { dur: 5, in: 4 }]), 2.5);
  s.player.play(-1);
  s.tick();
  assert.equal(s.videos.length, 2);
  const previous = s.videos.find((v) => v.src.includes('media0'));
  assert.ok(Math.abs(previous.currentTime - 3) < 0.001);
});

test('bytte til et kildeklipp skjuler tidslinjebildet mens kilden dekodes', () => {
  const timeline = project();
  const s = setup(timeline);
  s.tick();
  s.videos[0].finish();
  s.tick();
  assert.notEqual(s.canvas.pixel, 'black');
  const source = project([{ dur: 20, in: 10 }]);
  source.id = 'source-preview';
  source.clips[source.primary[0]].id = 'source-clip';
  source.clips = { 'source-clip': source.clips[source.primary[0]] };
  source.primary = ['source-clip'];
  s.switchProject(source);
  s.tick();
  assert.equal(s.canvas.pixel, 'black', 'tidslinjen skal ikke bli stående i kildevisningen');
  s.videos.at(-1).finish();
  s.tick();
  assert.match(s.canvas.pixel, /@10\.000$/);
  s.switchProject(timeline);
  s.tick();
  assert.match(s.canvas.pixel, /@2\.000$/);
});

test('Full, Half and Third reduce render pixels while retaining the preview display size', () => {
  for (const dpr of [1, 2]) {
    const s = setup(project(), 0, { dpr });
    const full = [Math.min(1920, 960 * dpr), Math.min(1080, 540 * dpr)];
    for (const [quality, divisor] of [['quality', 1], ['performance', 2], ['third', 3]]) {
      s.setQuality(quality);
      s.player.resizeCanvas(960, 540);
      assert.equal(s.canvas.width, full[0] / divisor);
      assert.equal(s.canvas.height, full[1] / divisor);
      assert.equal(s.canvas.style.width, '960px');
      assert.equal(s.canvas.style.height, '540px');
    }
    s.player.resizeCanvas(3840, 2160);
    assert.equal(s.canvas.width, 640, 'fullscreen also respects Third after the source-size cap');
    assert.equal(s.canvas.height, 360);
  }
});

test('lower preview resolution reduces source-effect work and preserves blur size', () => {
  for (const [quality, width, height, blur] of [['quality', 1280, 720, 4], ['performance', 480, 270, 1.5], ['third', 320, 180, 1]]) {
    const p = project([{ dur: 10, in: 2 }]);
    const effect = { type: 'blur', on: true, p: { amount: 4 } };
    p.clips[p.primary[0]].props.vfx = [effect];
    const s = setup(p, 0, { quality });
    s.player.resizeCanvas(960, 540);
    s.tick();
    s.videos[0].finish();
    s.tick();
    const effectDraws = s.canvases.flatMap(cv => cv.draws).filter(draw => draw.filter?.startsWith('blur('));
    assert.ok(effectDraws.some(draw => draw.width === width && draw.height === height && draw.filter === `blur(${blur}px)`), 'effect surfaces must use the reduced source dimensions');
    assert.equal(effect.p.amount, 4, 'preview must not change saved effect parameters');
    assert.equal(p.width, 1920);
    assert.equal(p.height, 1080);
  }
});

test('changing resolution during playback preserves playback and the playhead', () => {
  const s = setup(project(), 3);
  s.player.resizeCanvas(960, 540);
  s.player.play();
  s.tick(500);
  const time = s.getTime();
  s.setQuality('third');
  s.player.resizeCanvas(960, 540);
  assert.equal(s.getTime(), time);
  assert.equal(s.playing.value, true);
  s.tick(500);
  assert.equal(s.getTime(), time + 0.5);
});

test('et område på ett bilde stopper ikke avspillingen', () => {
  const p = project();
  p.range = { in: 0, out: 1 / 30 };
  const s = setup(p, 5);
  s.player.play();
  assert.equal(s.getTime(), 5, 'hopper ikke til starten av området');
  s.tick(500);
  assert.equal(s.playing.value, true);
  assert.ok(s.getTime() > 5);
});

test('fresh snapshots reject remembered frames until the requested decoder seek finishes', () => {
  const s = setup(); s.tick(); const video = s.videos[0]; video.finish(); s.tick();
  assert.equal(s.player.snapshot({ fresh: true }), s.canvas);
  s.player.seek(3); s.tick();
  assert.equal(s.player.snapshot(), s.canvas, 'scrubbing still shows the last completed frame');
  assert.equal(s.player.snapshot({ fresh: true }), null, 'scoring must not relabel that frame with the new time');
  video.finish(); s.tick(); assert.equal(s.player.snapshot({ fresh: true }), s.canvas);
  assert.match(s.canvas.pixel, /@5\.000$/);
});
