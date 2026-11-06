import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_ANIM, SIDE_SHAPES, layoutClipFor, newProject, pipRect, recordingRectsAt, sideBackgroundMedia, sideRects } from '../src/shared/model.js';
import { addMediaClip, recordingChildren } from '../src/shared/ops.js';
import { reduceProject } from '../src/shared/package.js';

const W = 1920;
const H = 1080;
const inside = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 1e-6 && r.y + r.h <= H + 1e-6;

function setup(layouts = [[0, 6]]) {
  const p = newProject('Side');
  const stream = (key) => ({ path: `/tmp/${key}.webm`, hasVideo: true, hasAudio: true, width: 2560, height: 1600, duration: 20, offset: 0 });
  p.media.rec = { id: 'rec', name: 'Recording', kind: 'recording', duration: 20, streams: { screen: stream('screen'), camera: stream('camera') }, rec: { layouts } };
  p.media.bg = { id: 'bg', name: 'Backdrop', kind: 'image', path: '/tmp/bg.png', streams: { main: { path: '/tmp/bg.png', hasVideo: true, width: 1920, height: 1080 } } };
  const id = addMediaClip(p, p.media.rec, 'append', 0, undefined, { in: 0, dur: 20 });
  return { p, screen: p.clips[id], camera: recordingChildren(p, id)[0] };
}

test('side by side keeps the screen format, fits the frame and puts the camera on the chosen side', () => {
  for (const shape of Object.keys(SIDE_SHAPES)) for (const size of ['small', 'medium', 'large']) for (const aspect of [16 / 9, 16 / 10, 4 / 3]) {
    const left = sideRects(7, W, H, aspect, shape, size);
    const right = sideRects(8, W, H, aspect, shape, size);
    for (const r of [left.screen, left.cam, right.screen, right.cam]) assert.ok(inside(r), `${shape} ${size} ${aspect}`);
    assert.ok(Math.abs(left.screen.w / left.screen.h - aspect) < 1e-9);
    assert.ok(Math.abs(left.cam.w / left.cam.h - SIDE_SHAPES[shape]) < 1e-9);
    assert.ok(left.cam.x + left.cam.w < left.screen.x, 'camera left of the screen');
    assert.ok(right.screen.x + right.screen.w < right.cam.x, 'camera right of the screen');
    assert.ok(left.cam.h <= left.screen.h + 1e-9);
    // Gruppen er midtstilt.
    assert.ok(Math.abs(left.cam.x - (W - right.cam.x - right.cam.w)) < 1e-6);
  }
});

test('portrait PiP is a 9:16 frame in every corner', () => {
  for (const layout of [3, 4, 5, 6]) {
    const r = pipRect(layout, 6, W, H, 'medium', 'portrait');
    assert.ok(Math.abs(r.w / r.h - 9 / 16) < 1e-9);
    assert.ok(inside(r));
  }
});

test('switching to side by side animates the screen and camera, and Screen only fades the camera where it was', () => {
  const { camera } = setup([[0, 6], [5, 8], [10, 2], [15, 4]]);
  const aspect = 2560 / 1600;
  const before = recordingRectsAt(camera, 4, W, H, aspect);
  assert.equal(before.side, 0);
  assert.deepEqual(before.cam, pipRect(6, 6, W, H, camera.props.pipSize, camera.props.pipShape));

  const mid = recordingRectsAt(camera, 5 + LAYOUT_ANIM / 2, W, H, aspect);
  assert.ok(mid.side > 0 && mid.side < 1);
  assert.ok(mid.screen.w < before.screen.w);

  const side = recordingRectsAt(camera, 7, W, H, aspect);
  const target = sideRects(8, W, H, aspect, 'portrait', 'medium');
  assert.equal(side.side, 1);
  assert.deepEqual(side.screen, target.screen);
  assert.deepEqual(side.cam, target.cam);

  const off = recordingRectsAt(camera, 12, W, H, aspect);
  assert.equal(off.side, 0);
  assert.equal(off.cam.a, 0);
  assert.equal(off.cam.x, target.cam.x, 'camera fades out in place');

  // Hjørner etter side om side bruker fortsatt hjørnet, ikke side om side som "forrige hjørne".
  const corner = recordingRectsAt(camera, 17, W, H, aspect);
  assert.deepEqual(corner.cam, pipRect(4, 4, W, H, camera.props.pipSize, camera.props.pipShape));
});

test('the screen clip follows the linked PiP clip, and fills the frame when the PiP is hidden', () => {
  const { p, screen, camera } = setup([[0, 7]]);
  assert.equal(layoutClipFor(p, screen, 3), camera);
  assert.equal(layoutClipFor(p, camera, 3), camera);
  camera.enabled = false;
  assert.equal(layoutClipFor(p, screen, 3), null);
  camera.enabled = true;
  p.lanes[camera.lane] = { hidden: true };
  assert.equal(layoutClipFor(p, screen, 3), null);
  p.lanes[camera.lane] = {};
  camera.props.showCamera = false;
  assert.equal(layoutClipFor(p, screen, 3), null);
  camera.props.showCamera = true;
  delete camera.linkedTo;
  assert.equal(layoutClipFor(p, screen, 3), null);
});

test('a background image is loaded only when chosen, and packaging keeps it', () => {
  const { p, camera } = setup([[0, 7]]);
  assert.equal(sideBackgroundMedia(p, camera), null);
  camera.props.sideBgImage = 'bg';
  assert.equal(sideBackgroundMedia(p, camera), null, 'gradient is still selected');
  camera.props.sideBg = 'image';
  assert.equal(sideBackgroundMedia(p, camera), p.media.bg);
  const { project, removed } = reduceProject(p, { removeUnused: true });
  assert.ok(project.media.bg, 'background image is kept');
  assert.deepEqual(removed.media, []);
  delete p.media.bg;
  assert.equal(sideBackgroundMedia(p, camera), null);
});

test('width-based recordings keep the live camera geometry and source aspect in Edit', () => {
  for (const layout of [7, 8]) for (const shape of ['circle', 'square', 'rect', 'portrait']) for (const width of [20, 40]) {
    const { p, camera } = setup([[0, layout]]);
    Object.assign(camera.props, { sideSize: width, sideShape: shape });
    const result = recordingRectsAt(camera, 1, W, H, 16 / 10);
    const live = pipRect(layout, 6, W, H, camera.props.pipSize, camera.props.pipShape, { size: width, shape });
    assert.deepEqual(result.cam, live);
    assert.ok(inside(result.screen));
    assert.ok(Math.abs(result.screen.w / result.screen.h - 16 / 10) < 1e-9);
    assert.ok(layout === 7 ? result.cam.x + result.cam.w < result.screen.x : result.screen.x + result.screen.w < result.cam.x);
    assert.equal(layoutClipFor(p, Object.values(p.clips).find(c=>c.recordingPart==='screen'), 1), camera);
    camera.props.sideSize = 'medium';
    assert.deepEqual(recordingRectsAt(camera, 1, W, H, 16 / 10).cam, sideRects(layout, W, H, 16 / 10, shape, 'medium').cam);
  }
});

test('camera offset moves the picture inside the frame, also when mirrored', async () => {
  const { drawCamera } = await import('../src/shared/render.js');
  const sourceX = (mirror, ox, oy = 0) => {
    let args;
    const noop = () => {};
    const ctx = { canvas: { width: W, height: H }, save: noop, restore: noop, beginPath: noop, roundRect: noop, clip: noop, translate: noop, scale: noop, drawImage: (...a) => { args = a; } };
    drawCamera(ctx, {}, 1600, 900, { x: 0, y: 0, w: 90, h: 160, r: 0 }, mirror, false, ox, oy);
    return args.slice(1, 3);
  };
  const slack = 1600 - (900 * 9) / 16;
  assert.deepEqual(sourceX(false, 0), [slack / 2, 0]);
  assert.deepEqual(sourceX(false, 1), [0, 0], 'the picture moves right, so the left edge shows');
  assert.deepEqual(sourceX(false, -1), [slack, 0]);
  assert.deepEqual(sourceX(true, 1), [slack, 0], 'mirrored, the same offset moves the picture right on screen');
  assert.deepEqual(sourceX(false, 0, 1), [slack / 2, 0], 'nothing is cropped vertically, so Y has no room to move');
});
