import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { newProject, makeClip } from '../src/shared/model.js';

// Kjør den faktiske spilleren og tegnemotoren med en dekoder vi kan forsinke.
const bundle = (await build({ entryPoints: ['src/renderer/player.js'], bundle: true, write: false, format: 'cjs', platform: 'browser' })).outputFiles[0].text;

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

function setup(p = project(), initialTime = 0) {
  let now = 1000;
  let time = initialTime;
  let nextFrame;
  const videos = [];
  class Canvas {
    width = 640;
    height = 360;
    pixel = 'black';
    style = {};
    getContext(type) {
      if (type !== '2d') return null;
      return this.context ||= {
        canvas: this, globalAlpha: 1,
        save() {}, restore() {}, setTransform() {}, translate() {}, scale() {}, rotate() {},
        fillRect: () => { this.pixel = 'black'; },
        drawImage: (img) => {
          // Søkende videoelementer er ikke tegnbare, selv om de har dimensjoner.
          assert.ok(!img.seeking, 'must never draw a seeking media element');
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
    window: { devicePixelRatio: 1 }, localStorage: { getItem: () => null },
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
      if (type === 'canvas') return new Canvas();
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
  return { player, canvas, videos, playing, tick(ms = 16) {
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
