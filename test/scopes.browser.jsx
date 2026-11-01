import { render } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import { VideoScopes } from '../src/renderer/editor/VideoScopes.jsx';
import { prefs, setPrefs } from '../src/renderer/prefs.js';
import { SCOPE_TYPES } from '../src/shared/scopes.js';
const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const root = document.getElementById('root');
let reads = 0,
  source;
const original = CanvasRenderingContext2D.prototype.getImageData;
CanvasRenderingContext2D.prototype.getImageData = function (...args) {
  reads++;
  return original.apply(this, args);
};
function bars() {
  const c = source.getContext('2d');
  const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
  colors.forEach((color, i) => {
    c.fillStyle = color;
    c.fillRect(i * 80, 0, 80, 280);
  });
  const gradient = c.createLinearGradient(0, 0, 640, 0);
  gradient.addColorStop(0, '#000');
  gradient.addColorStop(1, '#fff');
  c.fillStyle = gradient;
  c.fillRect(0, 280, 640, 80);
}
function Harness() {
  const ref = useRef(null);
  useEffect(() => {
    source = ref.current;
    bars();
  }, []);
  return (
    <div class="viewer" style="width:100%;height:800px">
      <div class="viewer-head">Rendered color bars · video scopes</div>
      <div class="viewer-box">
        <canvas ref={ref} width={640} height={360} style="max-width:100%;max-height:100%;object-fit:contain" />
      </div>
      {prefs.value.videoScopesVisible && (
        <VideoScopes sourceRef={ref} onClose={() => setPrefs({ videoScopesVisible: false })} />
      )}
      <div class="transport" style="padding:12px">
        <button class="btn secondary" onClick={() => setPrefs({ videoScopesVisible: !prefs.value.videoScopesVisible })}>
          Toggle scopes
        </button>
      </div>
    </div>
  );
}
export async function verify() {
  setPrefs({ videoScopesVisible: false, videoScopesMode: 'all' });
  root.style = 'width:1050px;margin:20px auto';
  render(<Harness />, root);
  await pause();
  assert(reads === 0, 'hidden scopes must not sample frames');
  document.querySelector('.transport button').click();
  await pause(500);
  assert(document.querySelectorAll('.scope-plot canvas').length === 4, 'four scopes must render');
  assert(reads > 0, 'visible scopes must read the viewer canvas');
  assert(
    document.querySelector('.scopes-footer').textContent.includes('100.0%'),
    'source white must reach the measured top',
  );
  for (const cv of document.querySelectorAll('.scope-plot canvas')) {
    const data = original.call(cv.getContext('2d'), 0, 0, cv.width, cv.height).data;
    assert(
      data.some((v, i) => i % 4 !== 3 && v > 150),
      'each scope must draw visible traces, labels and guides',
    );
  }
  const footer = document.querySelector('.scopes-footer').textContent;
  document.querySelector('[title="Hold video scopes"]').click();
  await pause(50);
  const heldReads = reads;
  source.getContext('2d').fillStyle = '#000';
  source.getContext('2d').fillRect(0, 0, 640, 360);
  await pause();
  assert(reads === heldReads, 'hold must stop reading new frames');
  assert(
    document.querySelector('.scopes-footer').textContent.includes('100.0%'),
    'held scopes must preserve the prior frame',
  );
  document.querySelector('[title="Resume video scopes"]').click();
  await pause();
  assert(document.querySelector('.scopes-footer').textContent.includes('0.0–0.0%'), 'scopes must update after resume');
  const layout = document.querySelector('[aria-label="Scope layout"]');
  for (const option of SCOPE_TYPES.filter((s) => s.value !== 'all')) {
    layout.value = option.value;
    layout.dispatchEvent(new Event('change', { bubbles: true }));
    await pause(160);
    assert(document.querySelectorAll('.scope-plot canvas').length === 1, `${option.label} must work as a single view`);
  }
  setPrefs({ videoScopesMode: 'all' });
  root.style.width = '320px';
  await pause();
  const panel = document.querySelector('.video-scopes');
  assert(panel.scrollWidth <= panel.clientWidth + 1, 'scopes toolbar and plots must fit a narrow viewer');
  document.querySelector('[title="Close video scopes"]').click();
  await pause(50);
  const closedReads = reads;
  await pause();
  assert(!document.querySelector('.video-scopes') && reads === closedReads, 'closing must unmount the sampler');
  assert(JSON.parse(localStorage.getItem('prefs')).videoScopesVisible === false, 'scope visibility must persist');
  await showScreenshot();
  return { status: 'passed', checks: 15, reads };
}
export async function showScreenshot() {
  root.style.width = '1050px';
  bars();
  setPrefs({ videoScopesVisible: true, videoScopesMode: 'all' });
  await pause(300);
}
