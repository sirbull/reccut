// Multicam-vinduet, som Angle Viewer og Angle Editor i Final Cut Pro, men samlet i ett vindu:
// filer til venstre, alle vinklene i små ruter, det som havner på tidslinjen (programmet) til
// høyre, og en tidslinje nederst. Talltastene 1 til 9 kutter til en vinkel mens videoen spiller.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AudioLines,
  Check,
  Film,
  Headphones,
  LayoutGrid,
  List,
  Magnet,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  Rows3,
  Scissors,
  PanelLeft,
  PanelRight,
  Search,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
  StretchHorizontal,
  Undo2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
  Hand,
  GripVertical,
} from 'lucide-preact';
import { dbToGain, formatTimecode, workPath } from '../../shared/model.js';
import { clampDb, formatVolumeDb, volumeDelta, volumeY } from './volume.js';
import { EQ_PRESETS } from '../../shared/audiofx.js';
import reccutMarkSvg from '../../../assets/RecCut-logo-R-grey.svg';
import { elementAudio } from '../player.js';
import {
  CHANNEL_MODES,
  MAX_HOTKEY_ANGLES,
  SOUND_DEFAULTS,
  addAngles,
  angleLabel,
  angleSound,
  audioOnlyAngles,
  angleAt,
  angleColor,
  angleExtent,
  angleHasAudio,
  angleIndex,
  applyMulticamSync,
  bladeAt,
  canBeAngle,
  cutAndSwitch,
  cutIndexAt,
  extendProgram,
  isVideoAngle,
  moveAngle,
  moveCut,
  multicamExtent,
  multicamRange,
  normalize,
  pictureAngleAt,
  planMulticamSync,
  programPieces,
  removeAngle,
  removeCut,
  setAngleOffset,
  soundEffects,
  soundKeys,
  soundLevelAt,
  switchSegment,
  tidy,
  videoAngles as listVideoAngles,
} from '../../shared/multicam.js';
import { getWave, project, tasks, waveVersion } from './store.js';
import { fileUrl } from './playback.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { closeMulticam, multicamMenu, multicamSession, sendMulticamToTimeline } from './multicam.js';
import { Button, IconButton, Slider, Toggle, toast } from '../ui.jsx';
import { isTyping } from '../keyboard.js';

const api = window.api;
const isMac = api.platform === 'darwin';
const mod = isMac ? '⌘' : 'Ctrl+';
const HEAD_W = 200;
const RULER_H = 22;
// Standardhøyder. Sporene kan gjøres høyere ved å dra i nederkanten av sporhodet.
const DEF_PROGRAM_H = 64;
// Hovedlyden ligger øverst, rett under linjalen, så nivået er lett å se og justere.
const DEF_SOUND_H = 58;
const SOUND_Y = RULER_H;
const KF_HIT = 7;
const DEF_ANGLE_H = 40;
const H_LIMITS = { sound: [40, 220], program: [40, 220], angle: [28, 180] };
const AUDIO_HEAD_H = 22;
const NEW_ROW_H = 30;
const DRAG_TYPE = 'application/x-reccut-multicam';

function stored(key, fallback, lo, hi) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? Math.max(lo, Math.min(hi, v)) : fallback;
  } catch {
    return fallback;
  }
}
function storedFlag(key) {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}
function store(key, v) {
  try {
    localStorage.setItem(key, String(v));
  } catch {}
}

function mediaThumb(m) {
  const s = m?.streams?.main;
  const files = s?.thumbs?.files;
  return files?.length ? files[Math.min(files.length - 1, 2)] : null;
}

function fmtDur(t) {
  const m = Math.floor((t || 0) / 60);
  const s = Math.floor((t || 0) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Lyden fra hver vinkel går gjennom samme effektkjede som tidslinjen. Klarer ikke nettleseren
// det, spilles lyden rett fra elementet uten effekter.
function sinkFor(el) {
  if (!el) return null;
  if (el._mcSink !== undefined) return el._mcSink;
  try {
    el._mcSink = elementAudio(el, { clean: el.dataset?.clean === '1' });
  } catch (err) {
    console.warn('Multicam audio preview without effects', err);
    el._mcSink = null;
  }
  return el._mcSink;
}

export function MulticamEditor() {
  const s = multicamSession.value;
  if (!s) return null;
  return <MulticamWindow key={s.key} session={s} />;
}

function MulticamWindow({ session }) {
  const p = project.value;
  const fps = p.fps || 30;
  const frame = 1 / fps;
  const aspect = (p.width || 16) / (p.height || 9);

  /* Definisjonen og angre */
  const [mc, setMc] = useState(() => tidy(p, structuredClone(session.mc)));
  const mcRef = useRef(mc);
  mcRef.current = mc;
  const hist = useRef({ undo: [], redo: [] });
  const lastChoice = useRef(null);
  const playbackEdit = useRef(false);
  const [dirty, setDirty] = useState(false);
  const edit = (fn, { record = true } = {}) => {
    const next = structuredClone(mcRef.current);
    if (fn(next) === false) return false;
    tidy(project.value, next);
    if (record) {
      hist.current.undo.push(mcRef.current);
      if (hist.current.undo.length > 200) hist.current.undo.shift();
      hist.current.redo = [];
    }
    mcRef.current = next;
    setMc(next);
    setDirty(true);
    return true;
  };
  const undo = () => {
    const prev = hist.current.undo.pop();
    if (!prev) return;
    stopPlay();
    lastChoice.current = null;
    hist.current.redo.push(mcRef.current);
    mcRef.current = prev;
    setMc(prev);
  };
  const redo = () => {
    const next = hist.current.redo.pop();
    if (!next) return;
    stopPlay();
    lastChoice.current = null;
    hist.current.undo.push(mcRef.current);
    mcRef.current = next;
    setMc(next);
  };

  /* Oppsett: bredden på filene, delingen mellom vinklene og programmet, og høyden på tidslinjen */
  const [browserW, setBrowserW] = useState(() => stored('mcBrowserW', 260, 180, 520));
  const [split, setSplit] = useState(() => stored('mcSplit', 0.48, 0.2, 0.8));
  const [timelineH, setTimelineH] = useState(() => stored('mcTimelineH', 260, 140, 700));
  const mainRef = useRef(null);
  const winRef = useRef(null);

  /* Avspilling */
  const timeRef = useRef(multicamRange(p, mc).in);
  const skimRef = useRef(null);
  const play = useRef({ on: false, rate: 1, t0: 0, now0: 0 });
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(() => pictureAngleAt(p, mc, timeRef.current));
  const activeRef = useRef(active);
  const els = useRef({});
  const programRef = useRef(null);
  const tcRef = useRef(null);
  const headRef = useRef(null);
  const skimLineRef = useRef(null);
  const scrollRef = useRef(null);

  /* Tidslinjen */
  const [pps, setPps] = useState(0);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const [tool, setTool] = useState('select');
  const [snap, setSnap] = useState(true);
  const [skimming, setSkimming] = useState(true);
  const skimmingRef = useRef(skimming);
  skimmingRef.current = skimming;
  const [selectedCut, setSelectedCut] = useState(null);
  const [notice, setNotice] = useState(() =>
    session.lossy
      ? { kind: 'warn', title: 'Some changes on the timeline cannot be kept here', items: session.initialErrors }
      : session.initialErrors?.length
        ? { kind: 'warn', title: 'Some clips were left out', items: session.initialErrors }
        : null
  );
  const [syncing, setSyncing] = useState(false);

  const ext = multicamExtent(p, mc);
  const range = multicamRange(p, mc);
  const videoAngles = listVideoAngles(p, mc);
  const audioOnly = audioOnlyAngles(p, mc);
  const audioSource = mc.audio === 'follow' ? active : mc.audio;
  // Filene til venstre og Properties til høyre kan skjules, som i redigeringen.
  const [browserOn, setBrowserOn] = useState(() => storedFlag('mcBrowserVisible'));
  const [propsOn, setPropsOn] = useState(() => storedFlag('mcPropsVisible'));
  const [propsW, setPropsW] = useState(() => stored('mcPropsW', 280, 220, 480));
  const toggleBrowser = () => setBrowserOn((v) => (store('mcBrowserVisible', v ? 'off' : 'on'), !v));
  const toggleProps = () => setPropsOn((v) => (store('mcPropsVisible', v ? 'off' : 'on'), !v));
  const [soundTarget, setSoundTarget] = useState(null);
  const openSound = (angleId) => {
    setSoundTarget(angleId);
    if (!propsOn) toggleProps();
  };

  const clampT = (t) => Math.max(ext.start, Math.min(ext.end, t));
  const shownTime = () => (!play.current.on && skimRef.current != null ? skimRef.current : timeRef.current);

  const seek = (t) => {
    t = clampT(t);
    timeRef.current = t;
    if (play.current.on) {
      play.current.t0 = t;
      play.current.now0 = performance.now();
    }
  };
  const startPlay = (rate = 1) => {
    if (!mc.angles.length) return;
    let t = timeRef.current;
    if (rate > 0 && t >= ext.end - frame) t = range.in;
    play.current = { on: true, rate, t0: t, now0: performance.now() };
    playbackEdit.current = false;
    for (const el of Object.values(els.current)) sinkFor(el)?.resume();
    skimRef.current = null;
    timeRef.current = t;
    setPlaying(true);
  };
  const stopPlay = () => {
    play.current.on = false;
    for (const el of Object.values(els.current)) el?.pause();
    setPlaying(false);
  };
  const togglePlay = () => (play.current.on ? stopPlay() : startPlay(1));

  // AI Clean Voice: lag den rensede kopien i bakgrunnen for kilder der det er slått på, som i redigeringen.
  const cleanAsked = useRef(new Set());
  useEffect(() => {
    for (const a of mc.angles) {
      if (!(angleSound(a).clean > 0)) continue;
      const media = project.value.media[a.mediaId];
      for (const key of soundKeys(media)) {
        const st = media.streams[key];
        if (st.cleaned || media.offline || cleanAsked.current.has(st.path)) continue;
        cleanAsked.current.add(st.path);
        api.cleanAudio({ file: st.path, mediaId: media.id, stream: key }).catch((err) => setNotice({ kind: 'error', title: 'AI Clean Voice could not clean the sound.', items: [`${media.name}: ${err.message || err}`] }));
      }
    }
  }, [mc]);

  // Hovedtidslinjen står stille mens vinduet er åpent.
  useEffect(() => {
    playback.pause();
  }, []);

  // Første gang: zoom slik at hele klippet får plass.
  const fitZoom = () => {
    const w = (scrollRef.current?.clientWidth || 800) - HEAD_W - 40;
    const end = multicamExtent(project.value, mcRef.current).end;
    setPps(end > 0 ? Math.max(0.5, Math.min(2000, w / end)) : 40);
  };
  // Zoom slik at alt får plass når vinduet åpnes, og når de første vinklene kommer til.
  const hasAngles = mc.angles.length > 0;
  useLayoutEffect(() => {
    fitZoom();
  }, [hasAngles]);

  /* Klokken: videoene følger spillhodet, og programmet tegnes fra vinkelen som vises */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = play.current;
      let m = mcRef.current;
      const pr = project.value;
      const e = multicamExtent(pr, m);
      const rg = multicamRange(pr, m);
      if (st.on) {
        const previousTime = timeRef.current;
        let t = st.t0 + ((performance.now() - st.now0) / 1000) * st.rate;
        const stopAt = st.rate > 0 ? (timeRef.current < rg.out - 1e-3 ? rg.out : e.end) : e.start;
        if ((st.rate > 0 && t >= stopAt) || (st.rate < 0 && t <= stopAt)) {
          t = stopAt;
          stopPlay();
        }
        if (m.programMode === 'selected') {
          const end = st.rate > 0
            ? Math.min(e.end, (Math.floor(t / frame + 1e-6) + 1) * frame)
            : Math.max(e.start, Math.floor(t / frame + 1e-6) * frame);
          if (edit((next) => extendProgram(pr, next, previousTime, end), { record: !playbackEdit.current })) playbackEdit.current = true;
          m = mcRef.current;
        }
        timeRef.current = t;
      }
      const t = !play.current.on && skimRef.current != null ? skimRef.current : timeRef.current;
      const cur = pictureAngleAt(pr, m, t);
      const audioId = m.audio === 'follow' ? cur : m.audio;
      const forward = play.current.on && st.rate > 0;
      for (const a of m.angles) {
        const el = els.current[a.id];
        if (!el) continue;
        const local = t - a.offset;
        const dur = pr.media[a.mediaId]?.duration || 0;
        const inside = local >= 0 && local < dur;
        el.parentElement?.classList.toggle('outside', !inside);
        // Bare kilden som har lyden høres, med nivået og effektene fra Properties.
        // Med AI Clean Voice spilles lyden fra den rensede filen, blandet med styrken som på tidslinjen.
        const audible = a.id === audioId && play.current.on;
        const sound = angleSound(a);
        const level = dbToGain(soundLevelAt(sound, t));
        const cleanEl = sound.clean > 0 ? els.current[`${a.id}:clean`] : null;
        const sink = sinkFor(el);
        if (sink) {
          el.muted = false;
          sink.setEffects(soundEffects(sound));
          sink.setGain(audible && !cleanEl ? level : 0);
        } else el.muted = !audible || Boolean(cleanEl);
        const follow = (node) => {
          if (!inside) {
            if (!node.paused) node.pause();
            return;
          }
          if (forward) {
            if (node.playbackRate !== st.rate) node.playbackRate = st.rate;
            if (node.paused) {
              node.currentTime = local;
              node.play().catch(() => {});
            } else if (Math.abs(node.currentTime - local) > 0.25) node.currentTime = local;
          } else {
            if (!node.paused) node.pause();
            if (Math.abs(node.currentTime - local) > frame / 2) node.currentTime = local;
          }
        };
        if (cleanEl) {
          const cs = sinkFor(cleanEl);
          cs?.setEffects(soundEffects(sound), sound.clean);
          cs?.setGain(audible ? level : 0);
          if (audible) follow(cleanEl);
          else if (!cleanEl.paused) cleanEl.pause();
        }
        follow(el);
      }
      // Rensede filer for kilder der Clean Voice er slått av igjen, skal ikke spille videre.
      for (const [id, node] of Object.entries(els.current)) {
        if (id.endsWith(':clean') && !(angleSound(m.angles.find((x) => `${x.id}:clean` === id)).clean > 0) && !node.paused) node.pause();
      }
      // Programmet: tegn bildet fra vinkelen som vises.
      const cv = programRef.current;
      if (cv) {
        const g = cv.getContext('2d');
        g.fillStyle = '#000';
        g.fillRect(0, 0, cv.width, cv.height);
        const el = els.current[cur];
        if (el && el.readyState >= 2 && el.videoWidth && !el.parentElement?.classList.contains('outside')) {
          const k = Math.min(cv.width / el.videoWidth, cv.height / el.videoHeight);
          const w = el.videoWidth * k;
          const h = el.videoHeight * k;
          g.drawImage(el, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        }
      }
      if (tcRef.current) tcRef.current.textContent = formatTimecode(Math.max(0, t - rg.in), pr.fps);
      const z = ppsRef.current;
      if (headRef.current) headRef.current.style.transform = `translateX(${timeRef.current * z}px)`;
      if (skimLineRef.current) {
        const show = skimmingRef.current && skimRef.current != null && !play.current.on;
        skimLineRef.current.style.display = show ? 'block' : 'none';
        if (show) skimLineRef.current.style.transform = `translateX(${skimRef.current * z}px)`;
      }
      // Følg spillhodet når det går ut av bildet.
      const sc = scrollRef.current;
      if (play.current.on && sc) {
        const x = timeRef.current * z + HEAD_W;
        if (x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - HEAD_W - 40;
      }
      if (cur !== activeRef.current) {
        activeRef.current = cur;
        setActive(cur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const el of Object.values(els.current)) el?.pause();
    };
  }, []);

  // Programmet tegnes i prosjektets format, så det som vises er det som havner i videoen.
  useEffect(() => {
    const cv = programRef.current;
    if (!cv) return;
    const box = cv.parentElement;
    const resize = () => {
      const st = getComputedStyle(box);
      const bw = box.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
      const bh = box.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
      const w = Math.max(1, Math.min(bw, bh * aspect));
      const h = w / aspect;
      const dpr = window.devicePixelRatio || 1;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    return () => ro.disconnect();
  }, [aspect]);

  /* Handlinger */

  const cutTo = (angleId, { noCut = false } = {}) => {
    const a = mcRef.current.angles.find((x) => x.id === angleId);
    if (!a) return;
    const t = timeRef.current;
    if (!isVideoAngle(project.value, a)) return;
    skimRef.current = null;
    const preserveCuts = !play.current.on;
    const changed = edit((m) => {
      const extended = preserveCuts && lastChoice.current != null && t > lastChoice.current && extendProgram(project.value, m, lastChoice.current, t);
      const selected = noCut
        ? switchSegment(project.value, m, t, angleId, { frame, preserveCuts })
        : cutAndSwitch(project.value, m, t, angleId, { frame, preserveCuts });
      return Boolean(extended || selected);
    });
    lastChoice.current = t;
    if (changed) {
      if (play.current.on) playbackEdit.current = true;
      activeRef.current = pictureAngleAt(project.value, mcRef.current, t);
      setActive(activeRef.current);
    }
  };

  const setAudio = (value) => edit((m) => void (m.audio = value));
  const setFallback = (value) => edit((m) => void (m.fallback = value));
  // Glidebrytere: første endring blir ett angresteg, resten av draget oppdaterer det samme steget.
  const gesture = useRef(false);
  const setSound = (angleId, patch) => {
    const record = gesture.current !== 'moving';
    if (gesture.current === 'start') gesture.current = 'moving';
    edit((m) => {
      const a = m.angles.find((x) => x.id === angleId);
      if (!a) return false;
      a.sound = { ...angleSound(a), ...patch };
    }, { record });
  };
  const soundGesture = {
    start: () => (gesture.current = 'start'),
    end: () => (gesture.current = false),
  };

  // at: tiden der filen ble sluppet på tidslinjen. Uten at legges den der de andre starter.
  const addMedia = (ids, { at = null } = {}) => {
    let result;
    const ok = edit((m) => {
      result = addAngles(project.value, m, ids, { at: at == null ? null : Math.round(at / frame) * frame });
      if (!result.added.length) return false;
      normalize(project.value, m);
    });
    if (result?.errors.length) setNotice({ kind: 'warn', title: ok ? 'Some files were not added' : 'Nothing was added', items: result.errors });
    else if (ok && mcRef.current.angles.length > 1) {
      const names = result.added.map((id) => angleLabel(project.value, mcRef.current, id)).join(', ');
      setNotice({ kind: 'info', title: `Added ${names}. Press Auto Sync, or right click the clip in the timeline and choose Synchronize to Audio, to line it up with the others.`, items: [] });
    } else if (ok) setNotice(null);
  };

  // Høyreklikk › Synchronize to Audio: bare den ene filen flyttes, de andre blir stående.
  const syncOne = async (angleId) => {
    const m = mcRef.current;
    setSyncing(true);
    try {
      const paths = [...new Set(m.angles.flatMap((a) => Object.values(project.value.media[a.mediaId]?.streams || {}).map((st) => st.wave)).filter(Boolean))];
      const cache = new Map();
      await Promise.all(paths.map(async (path) => cache.set(path, await api.readWave(path).catch(() => null))));
      const plan = planMulticamSync(project.value, m, (path) => cache.get(path) || null, { only: angleId });
      const name = angleLabel(project.value, m, angleId);
      if (plan.offsets[angleId] != null) {
        edit((x) => void applyMulticamSync(project.value, x, plan.offsets));
        setNotice({ kind: 'success', title: `${isVideoAngle(project.value, m.angles.find((a) => a.id === angleId)) ? `Camera ${name}` : name} is synchronized with the others.`, items: [] });
        setTimeout(() => setNotice((n) => (n?.kind === 'success' ? null : n)), 4000);
      } else setNotice({ kind: 'error', title: 'The file could not be synchronized.', items: plan.failures.map((f) => f.reason) });
    } finally {
      setSyncing(false);
    }
  };

  const dropAngle = (angleId) => edit((m) => removeAngle(project.value, m, angleId));

  const autoSync = async () => {
    const m = mcRef.current;
    if (m.angles.length < 2) return setNotice({ kind: 'warn', title: 'Nothing to synchronize', items: ['Add at least two files first.'] });
    setSyncing(true);
    try {
      const paths = [...new Set(m.angles.flatMap((a) => Object.values(project.value.media[a.mediaId]?.streams || {}).map((st) => st.wave)).filter(Boolean))];
      const cache = new Map();
      await Promise.all(paths.map(async (path) => cache.set(path, await api.readWave(path).catch(() => null))));
      const plan = planMulticamSync(project.value, m, (path) => cache.get(path) || null);
      const moved = Object.keys(plan.offsets).length;
      if (moved > 1) edit((x) => void applyMulticamSync(project.value, x, plan.offsets));
      const total = m.angles.length;
      if (plan.failures.length) {
        setNotice({
          kind: moved > 1 ? 'warn' : 'error',
          title: moved > 1 ? `Synchronized ${moved} of ${total} files. ${plan.failures.length === 1 ? 'One file' : `${plan.failures.length} files`} could not be synchronized.` : 'The files could not be synchronized.',
          items: plan.failures.map((f) => f.reason),
        });
      } else {
        setNotice({ kind: 'success', title: `All ${total} files are synchronized by their audio.`, items: [] });
        setTimeout(() => setNotice((n) => (n?.kind === 'success' ? null : n)), 4000);
      }
    } finally {
      setSyncing(false);
    }
  };

  const markRange = (which) => {
    const t = timeRef.current;
    edit((m) => {
      const r = multicamRange(project.value, m);
      if (which === 'in') m.range = { in: t, out: r.out > t + frame ? r.out : multicamExtent(project.value, m).end };
      else m.range = { in: r.in < t - frame ? r.in : multicamExtent(project.value, m).start, out: t };
    });
  };

  const jumpCut = (dir) => {
    const t = timeRef.current;
    const points = [...new Set([range.in, range.out, ...mc.cuts.map((c) => c.t)])].sort((a, b) => a - b);
    const next = dir > 0 ? points.find((x) => x > t + 1e-4) : [...points].reverse().find((x) => x < t - 1e-4);
    if (next != null) seek(next);
  };

  const zoomBy = (k, anchorX = null) => {
    const sc = scrollRef.current;
    const old = ppsRef.current;
    const next = Math.max(0.5, Math.min(2000, old * k));
    if (!sc) return setPps(next);
    const ax = anchorX ?? Math.max(0, timeRef.current * old - sc.scrollLeft + HEAD_W);
    const tAt = (sc.scrollLeft + ax - HEAD_W) / old;
    setPps(next);
    requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, tAt * next - ax + HEAD_W)));
  };

  const close = () => {
    if (dirty && !confirm('Close the multicam window without adding your changes to the timeline?')) return;
    stopPlay();
    closeMulticam();
  };

  const send = () => {
    stopPlay();
    if (!dirty && session.editing) return closeMulticam();
    if (session.lossy && !confirm('Parts of this multicam clip were removed or changed speed on the timeline. Updating puts the removed parts back and loses the speed changes. Update anyway?')) return;
    sendMulticamToTimeline(mcRef.current);
  };

  /* Tastatur: vinduet eier tastene mens det er åpent */
  useEffect(() => {
    const onKey = (e) => {
      // Importvinduet og andre dialoger over vinduet eier tastene sine.
      if (document.querySelector('.modal-backdrop')) return;
      if (isTyping(e)) {
        if (e.key === 'Escape') document.activeElement?.blur();
        return;
      }
      const m = mcRef.current;
      const cmd = e.metaKey || e.ctrlKey;
      const code = e.code || '';
      const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
      let handled = true;
      if (digit && !cmd) {
        const a = listVideoAngles(project.value, m)[Number(digit[2]) - 1];
        if (a) cutTo(a.id, { noCut: e.shiftKey });
      } else if (e.key === ' ') togglePlay();
      else if (cmd && e.key.toLowerCase() === 'z') e.shiftKey ? redo() : undo();
      else if (cmd && e.key.toLowerCase() === 'y') redo();
      else if (cmd && (e.key === '=' || e.key === '+')) zoomBy(1.4);
      else if (cmd && e.key === '-') zoomBy(1 / 1.4);
      else if (cmd && e.key === 'Enter') send();
      else if (cmd) handled = false;
      else if (e.key === 'Escape') close();
      else if (e.key === 'l' || e.key === 'L') startPlay(play.current.on && play.current.rate > 0 ? Math.min(8, play.current.rate * 2) : 1);
      else if (e.key === 'k' || e.key === 'K') stopPlay();
      else if (e.key === 'j' || e.key === 'J') startPlay(play.current.on && play.current.rate < 0 ? Math.max(-8, play.current.rate * 2) : -1);
      else if (e.key === 'ArrowLeft') seek(timeRef.current - (e.shiftKey ? 1 : frame));
      else if (e.key === 'ArrowRight') seek(timeRef.current + (e.shiftKey ? 1 : frame));
      else if (e.key === 'ArrowUp') jumpCut(-1);
      else if (e.key === 'ArrowDown') jumpCut(1);
      else if (e.key === 'Home') seek(multicamRange(project.value, m).in);
      else if (e.key === 'End') seek(multicamRange(project.value, m).out);
      else if ((e.key === 'i' || e.key === 'I') && !e.altKey) markRange('in');
      else if ((e.key === 'o' || e.key === 'O') && !e.altKey) markRange('out');
      else if (e.altKey && code === 'KeyX') edit((x) => void (x.range = null));
      else if (e.key === 'a' || e.key === 'A') setTool('select');
      else if (e.key === 't' || e.key === 'T') setTool('trim');
      else if (e.key === 'b' || e.key === 'B') setTool('blade');
      else if (e.key === 'h' || e.key === 'H') setTool('hand');
      else if (e.key === 'n' || e.key === 'N') setSnap((v) => !v);
      else if (e.key === 's' || e.key === 'S') {
        setSkimming((v) => !v);
        skimRef.current = null;
      } else if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) fitZoom();
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        const idx = selectedCut ?? cutIndexAt(m, timeRef.current);
        if ((idx > 0 || m.programMode === 'selected') && (selectedCut != null || angleAt(m, timeRef.current)) && edit((x) => removeCut(project.value, x, idx))) setSelectedCut(null);
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    multicamMenu.handle = (id) => {
      if (id === 'undo') undo();
      else if (id === 'redo') redo();
      else if (id === 'import') commands.importDialog();
      else return id !== 'save' && id !== 'prefs';
      return true;
    };
    return () => {
      window.removeEventListener('keydown', onKey, true);
      multicamMenu.handle = null;
    };
  });

  /* Dra skillelinjene */
  const dragSplit = (kind) => (e) => {
    e.preventDefault();
    const main = mainRef.current.getBoundingClientRect();
    const win = winRef.current.getBoundingClientRect();
    const move = (ev) => {
      if (kind === 'browser') {
        const w = Math.round(Math.max(180, Math.min(520, ev.clientX - main.left)));
        setBrowserW(w);
        store('mcBrowserW', w);
      } else if (kind === 'props') {
        const w = Math.round(Math.max(220, Math.min(480, main.right - ev.clientX)));
        setPropsW(w);
        store('mcPropsW', w);
      } else if (kind === 'views') {
        const left = main.left + (browserOn ? browserW + 6 : 0);
        const right = main.right - (propsOn ? propsW + 6 : 0);
        const k = Math.max(0.2, Math.min(0.8, (ev.clientX - left) / Math.max(1, right - left)));
        setSplit(k);
        store('mcSplit', k);
      } else {
        const h = Math.round(Math.max(140, Math.min(win.height - 220, win.bottom - ev.clientY)));
        setTimelineH(h);
        store('mcTimelineH', h);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const [over, setOver] = useState(false);
  const dropProps = {
    onDragOver: (e) => {
      if (e.dataTransfer.types.includes(DRAG_TYPE)) {
        e.preventDefault();
        setOver(true);
      }
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false),
    onDrop: (e) => {
      setOver(false);
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      addMedia(JSON.parse(raw));
    },
  };

  const gridRef = useRef(null);
  const tile = useTileSize(gridRef, videoAngles.length);
  const audioLabel = mc.audio === 'follow' ? 'follow' : mc.audio || '';

  return (
    <div class="mc-window" ref={winRef} role="dialog" aria-modal="true" aria-label="Multicam clip" style={{ gridTemplateRows: `auto auto minmax(0, 1fr) 6px ${timelineH}px` }}>
      <header class="mc-head">
        <input
          class="text-input mc-name"
          value={mc.name}
          aria-label="Name"
          onChange={(e) => {
            const name = e.currentTarget.value.trim();
            if (name && name !== mcRef.current.name) edit((m) => void (m.name = name));
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span class="spacer" />
        <Button variant="secondary" icon={Wand2} disabled={syncing || mc.angles.length < 2} onClick={autoSync} title="Line up all angles by comparing their audio">
          {syncing ? 'Synchronizing…' : 'Auto Sync'}
        </Button>
        <label class="mc-audio" title="Where the sound comes from">
          <Headphones size={14} />
          <select
            class="select"
            value={audioLabel}
            onChange={(e) => {
              setAudio(e.currentTarget.value);
              e.currentTarget.blur();
            }}
          >
            <SoundSourceOptions mc={mc} />
          </select>
        </label>
        <span class="spacer" />
        <IconButton icon={PanelLeft} title={`${browserOn ? 'Hide' : 'Show'} Files`} active={browserOn} aria-pressed={browserOn} onClick={toggleBrowser} />
        <IconButton icon={PanelRight} title={`${propsOn ? 'Hide' : 'Show'} Properties`} active={propsOn} aria-pressed={propsOn} onClick={toggleProps} />
        <span class="mc-sep" />
        <IconButton icon={Undo2} title={`Undo (${mod}Z)`} disabled={!hist.current.undo.length} onClick={undo} />
        <IconButton icon={Redo2} title={`Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})`} disabled={!hist.current.redo.length} onClick={redo} />
        <Button variant="primary" icon={Plus} onClick={send} title={`Add the multicam clip to the timeline (${mod}Return)`}>
          {session.editing ? 'Update Timeline' : 'Add to Timeline'}
        </Button>
        <IconButton icon={X} title="Close (Esc)" onClick={close} />
      </header>
      {notice ? (
        <div class={`mc-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <div>
            <b>{notice.title}</b>
            {notice.items.length > 0 && (
              <ul>
                {notice.items.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>
          <IconButton icon={X} title="Dismiss" onClick={() => setNotice(null)} />
        </div>
      ) : (
        <div />
      )}
      <div class="mc-main" ref={mainRef} style={{ gridTemplateColumns: [browserOn && `${browserW}px 6px`, `minmax(0, ${split}fr) 6px minmax(0, ${1 - split}fr)`, propsOn && `6px ${propsW}px`].filter(Boolean).join(' ') }}>
        {browserOn && <MulticamBrowser mc={mc} onAdd={addMedia} head={<b>Files</b>} />}
        {browserOn && <div class="mc-vsplit" onPointerDown={dragSplit('browser')} />}
        <section class={`mc-angles${over ? ' drop' : ''}`} {...dropProps}>
          <div class="mc-pane-head">
            <b>Angles</b>
            <span>Click an angle or press its number to cut to it. Shift switches without cutting.</span>
          </div>
          {videoAngles.length === 0 ? (
            <div class="mc-empty">
              <Film size={30} />
              <p>Add the clips from each camera.</p>
              <p class="dim">Double click files on the left or drag them here. Audio recorded separately goes under the cameras. Then press Auto Sync.</p>
            </div>
          ) : (
            <div class="mc-grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${tile.cols}, ${tile.w}px)` }}>
              {videoAngles.map((a, i) => (
                <AngleTile
                  key={a.id}
                  angle={a}
                  index={i}
                  color={angleColor(angleIndex(mc, a.id))}
                  media={p.media[a.mediaId]}
                  active={a.id === active}
                  audio={a.id === audioSource}
                  elRef={(el) => (el ? (els.current[a.id] = el) : delete els.current[a.id])}
                  onPick={(e) => cutTo(a.id, { noCut: e.shiftKey })}
                />
              ))}
              {Array.from({ length: Math.max(0, tile.cols * tile.rows - videoAngles.length) }, (_, i) => (
                <div key={`empty-${i}`} class="mc-tile empty" aria-hidden="true">
                  <div class="mc-frame">
                    <ReccutMark />
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Lyd tatt opp for seg har ikke bilde, men trenger et element som spilles av. */}
          <div class="mc-hidden-audio" aria-hidden="true">
            {audioOnly.map((a) => {
              const m = p.media[a.mediaId];
              return m && <audio key={a.id} crossOrigin="anonymous" src={fileUrl(workPath(m.streams.main) || m.path)} preload="auto" ref={(el) => (el ? (els.current[a.id] = el) : delete els.current[a.id])} />;
            })}
            {/* AI Clean Voice: den rensede filen (fire kanaler) når den er klar. */}
            {mc.angles.map((a) => {
              const cleaned = angleSound(a).clean != null && p.media[a.mediaId]?.streams?.[soundKeys(p.media[a.mediaId])[0]]?.cleaned;
              const id = `${a.id}:clean`;
              return cleaned && <audio key={`${id}:${cleaned}`} data-clean="1" crossOrigin="anonymous" src={fileUrl(cleaned)} preload="auto" ref={(el) => (el ? (els.current[id] = el) : delete els.current[id])} />;
            })}
          </div>
        </section>
        <div class="mc-vsplit" onPointerDown={dragSplit('views')} />
        <section class="mc-program">
          <div class="mc-pane-head">
            <b>Program</b>
            <span>{active ? `Camera ${angleLabel(p, mc, active)}` : 'No picture'} · this is what goes on the timeline</span>
          </div>
          <div class="mc-program-box">
            <canvas ref={programRef} />
            {!active && !angleAt(mc, shownTime()) && <span class="mc-program-empty">Choose a camera in Angles at the playhead.</span>}
          </div>
          <div class="mc-transport">
            <div class="tc big" ref={tcRef}>00:00:00:00</div>
            <div class="controls">
              <IconButton icon={SkipBack} title="Previous cut (Up Arrow)" onClick={() => jumpCut(-1)} />
              <button class="play-btn" title="Play or pause (Space)" onClick={togglePlay}>
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <IconButton icon={SkipForward} title="Next cut (Down Arrow)" onClick={() => jumpCut(1)} />
            </div>
            <div class="right dim">{formatTimecode(range.out - range.in, fps)}</div>
          </div>
        </section>
        {propsOn && <div class="mc-vsplit" onPointerDown={dragSplit('props')} />}
        {propsOn && (
          <MulticamProperties
            mc={mc}
            head={<b>Properties</b>}
            target={soundTarget}
            setTarget={setSoundTarget}
            setAudio={setAudio}
            setFallback={setFallback}
            setSound={setSound}
            gesture={soundGesture}
            audioSource={audioSource}
          />
        )}
      </div>
      <div class="mc-hsplit" onPointerDown={dragSplit('timeline')} title="Drag to change the height of the timeline" />
      <MulticamTimeline
        mc={mc}
        edit={edit}
        frame={frame}
        pps={pps || 40}
        tool={tool}
        setTool={setTool}
        snap={snap}
        setSnap={setSnap}
        skimming={skimming}
        setSkimming={setSkimming}
        selectedCut={selectedCut}
        setSelectedCut={setSelectedCut}
        timeRef={timeRef}
        skimRef={skimRef}
        seek={seek}
        scrollRef={scrollRef}
        headRef={headRef}
        skimLineRef={skimLineRef}
        zoomBy={zoomBy}
        fitZoom={fitZoom}
        setPps={setPps}
        audioSource={audioSource}
        setAudio={setAudio}
        dropAngle={dropAngle}
        openSound={openSound}
        addMedia={addMedia}
        syncOne={syncOne}
        setFallback={setFallback}
      />
    </div>
  );
}

// R-en fra Reccut-logoen, brukt uendret som bilde i tomme ruter.
const MARK_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(reccutMarkSvg)}`;
function ReccutMark() {
  return <img class="mc-mark" src={MARK_URL} alt="" draggable={false} />;
}

// Alle vinklene skal synes samtidig: finn antall kolonner som gir størst ruter (16:9) i plassen som finnes.
function useTileSize(ref, n) {
  const [size, setSize] = useState({ cols: 1, rows: 1, w: 160 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const gap = 6;
      const W = el.clientWidth - 16;
      const H = el.clientHeight - 16;
      // Alltid et jevnt rutenett: 2 × 2 for tre og fire kameraer, 3 × 2 for fem og seks, osv.
      // Ledige plasser fylles med en tom rute, så ingen video strekkes eller blir stående alene.
      const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n))));
      const rows = Math.ceil(Math.max(1, n) / cols);
      const best = { cols, rows, w: Math.max(60, Math.floor(Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows) * (16 / 9)))) };
      setSize((cur) => (cur.cols === best.cols && cur.rows === best.rows && cur.w === best.w ? cur : best));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, ref.current]);
  return size;
}

/* Én rute i vinkelvisningen. Videoelementet her er også kilden til programbildet. */
function AngleTile({ angle, index, color, media, active, audio, elRef, onPick }) {
  const src = media ? fileUrl(workPath(media.streams.main) || media.path) : null;
  const hot = index < MAX_HOTKEY_ANGLES;
  return (
    <button
      class={`mc-tile${active ? ' active' : ''}`}
      aria-pressed={active}
      style={{ '--angle': color }}
      onClick={onPick}
      title={`Cut to camera ${index + 1}${hot ? ` (${index + 1})` : ''}. Shift-click switches without cutting.`}
    >
      <div class="mc-frame">
        {/* crossOrigin før src, så lyden kan gå gjennom effektkjeden. */}
        <video ref={elRef} crossOrigin="anonymous" src={src} preload="auto" playsInline />
        <span class="mc-outside">No picture here</span>
      </div>
      <span class="mc-badge">{index + 1}</span>
      <span class="mc-tile-name">{media?.name || 'Missing file'}</span>
      {audio && <Headphones class="mc-tile-audio" size={14} aria-label="Audio comes from this angle" />}
    </button>
  );
}

/* Filene: liste, ikoner eller filmstriper. Dobbeltklikk eller dra for å legge til en vinkel. */
// Valgene for hvor lyden kommer fra: hver kilde med lyd, eller lyd som følger bildet.
function SoundSourceOptions({ mc }) {
  const p = project.value;
  return (
    <>
      {mc.angles.filter((a) => angleHasAudio(p, a)).map((a) => (
        <option key={a.id} value={a.id}>
          {isVideoAngle(p, a) ? `Sound from camera ${angleLabel(p, mc, a.id)}` : `Sound from ${angleLabel(p, mc, a.id)}`} ({p.media[a.mediaId]?.name})
        </option>
      ))}
      <option value="follow">Sound follows the picture</option>
    </>
  );
}

/* Properties: reservesporet for bildet og enkle lydjusteringer per kilde. Alt gjøres for hånd. */
function MulticamProperties({ mc, head, target, setTarget, setAudio, setFallback, setSound, gesture, audioSource }) {
  const p = project.value;
  const sources = mc.angles.filter((a) => angleHasAudio(p, a));
  const cams = listVideoAngles(p, mc);
  const current = sources.find((a) => a.id === target) || sources.find((a) => a.id === audioSource) || sources[0];
  const sound = current ? angleSound(current) : SOUND_DEFAULTS;
  const set = (patch) => current && setSound(current.id, patch);
  const name = (a) => `${isVideoAngle(p, a) ? `Camera ${angleLabel(p, mc, a.id)}` : angleLabel(p, mc, a.id)} (${p.media[a.mediaId]?.name})`;
  const db = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} dB`;
  const slider = (key, label, min, max, unit = db) => (
    <div class="mc-prop">
      <div class="mc-prop-label">
        <span>{label}</span>
        <span class="dim">{unit(sound[key])}</span>
      </div>
      <Slider
        value={sound[key]}
        min={min}
        max={max}
        step={0.5}
        center={0}
        onStart={gesture.start}
        onCommit={gesture.end}
        // Med nøkkelbilder flytter Level hele kurven like mye.
        onInput={(v) => set(key === 'volume' && sound.volumeKf.length ? { volume: v, volumeKf: sound.volumeKf.map(([t, x]) => [t, clampDb(x + v - sound.volume)]) } : { [key]: v })}
      />
      {key === 'volume' && sound.volumeKf.length > 0 && <span class="hint small">The level has {sound.volumeKf.length} keyframes in the Sound track. Level moves them all together.</span>}
    </div>
  );
  return (
    <section class="mc-browser mc-properties">
      <div class="mc-pane-head">{head}</div>
      <div class="mc-props-body">
        <h4>Picture</h4>
        <label class="mc-prop">
          <span>When a camera has no picture</span>
          <select class="select" value={mc.fallback || 'auto'} onChange={(e) => setFallback(e.currentTarget.value)}>
            <option value="auto">Use the first camera with a picture</option>
            {cams.map((a) => (
              <option key={a.id} value={a.id}>Use {name(a)}</option>
            ))}
            <option value="none">Leave a gap</option>
          </select>
          <span class="hint small">If the camera you cut to has not started yet or has ended, this camera is shown instead. If it has no picture either, the first camera with a picture is used.</span>
        </label>

        <h4>Sound</h4>
        {sources.length === 0 ? (
          <p class="hint small">None of the files have sound. Add a camera with sound or an audio file recorded separately.</p>
        ) : (
          <>
            <label class="mc-prop">
              <span>Sound comes from</span>
              <select class="select" value={mc.audio || ''} onChange={(e) => setAudio(e.currentTarget.value)}>
                <SoundSourceOptions mc={mc} />
              </select>
            </label>
            <label class="mc-prop">
              <span>Adjust</span>
              <select class="select" value={current?.id} onChange={(e) => setTarget(e.currentTarget.value)}>
                {sources.map((a) => (
                  <option key={a.id} value={a.id}>{name(a)}{a.id === audioSource ? ' · in use' : ''}</option>
                ))}
              </select>
            </label>
            {slider('volume', 'Level', -30, 12)}
            <label class="mc-prop">
              <span>Channels</span>
              <select class="select" value={sound.channels} onChange={(e) => set({ channels: e.currentTarget.value })}>
                {CHANNEL_MODES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <span class="hint small">Use one side if a microphone was only recorded on the left or right channel.</span>
            </label>
            {slider('gain', 'Gain', -20, 20)}
            <label class="mc-prop">
              <span>EQ</span>
              <select class="select" value={sound.eqPreset} onChange={(e) => set({ eqPreset: e.currentTarget.value })}>
                {EQ_PRESETS.map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))}
              </select>
            </label>
            {slider('bass', 'Bass', -12, 12)}
            {slider('mid', 'Mid', -12, 12)}
            {slider('treble', 'Treble', -12, 12)}
            <div class="mc-prop row">
              <span>Remove rumble</span>
              <Toggle checked={sound.rumble} onChange={(v) => set({ rumble: v })} />
            </div>
            <div class="mc-prop row">
              <span>Reduce noise</span>
              <Toggle checked={sound.noise} onChange={(v) => set({ noise: v })} />
            </div>
            <CleanVoiceControl media={current && p.media[current.mediaId]} sound={sound} set={set} gesture={gesture} />
            <Button variant="secondary" onClick={() => set({ ...SOUND_DEFAULTS })}>Reset Sound</Button>
            <p class="hint small">These settings go with the sound to the timeline, as the clip level and effects. Fine tune them later in the Audio tab in Edit.</p>
          </>
        )}
      </div>
    </section>
  );
}

// AI Clean Voice i Properties: samme støyfjerning (DeepFilterNet 3) og samme innstilling som i Audio-fanen.
function CleanVoiceControl({ media, sound, set, gesture }) {
  const on = sound.clean != null;
  const key = soundKeys(media)[0];
  const st = media?.streams?.[key];
  const job = on && st && !st.cleaned && tasks.value.find((t) => t.title === `Removing background noise from ${st.path.split(/[\\/]/).pop()}` && (t.state === 'running' || t.state === 'queued'));
  return (
    <div class="mc-clean">
      <div class="mc-prop row">
        <span>AI Clean Voice</span>
        <Toggle checked={on} onChange={(v) => set({ clean: v ? 0.8 : null })} />
      </div>
      {on && (
        <div class="mc-prop">
          <div class="mc-prop-label">
            <span>Strength</span>
            <span class="dim">{Math.round(sound.clean * 100)} %</span>
          </div>
          <Slider value={sound.clean} min={0} max={1} step={0.01} onStart={gesture.start} onCommit={gesture.end} onInput={(v) => set({ clean: v })} />
        </div>
      )}
      {on && st && !st.cleaned && <span class="hint small">{job ? `Cleaning the sound: ${Math.round((job.progress || 0) * 100)} %. You hear the original until it is done.` : 'Preparing the cleaned sound.'}</span>}
      <span class="hint small">AI removes background noise such as fans, traffic, hum and room sound from speech. It runs on this computer, and nothing is sent anywhere.</span>
    </div>
  );
}

function MulticamBrowser({ mc, onAdd, head }) {
  const p = project.value;
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('mcBrowserView') || 'list';
    } catch {
      return 'list';
    }
  });
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const used = new Set(mc.angles.map((a) => a.mediaId));
  const items = Object.values(p.media).filter((m) => canBeAngle(m) && (!query || m.name.toLowerCase().includes(query.toLowerCase())));
  const order = items.map((m) => m.id);
  const choose = (v) => {
    setView(v);
    store('mcBrowserView', v);
  };
  const pick = (e, id) => {
    if (e.metaKey || e.ctrlKey) setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    else if (e.shiftKey && picked.length) {
      const [a, b] = [order.indexOf(picked[picked.length - 1]), order.indexOf(id)].sort((x, y) => x - y);
      setPicked(order.slice(a, b + 1));
    } else setPicked([id]);
  };
  const dragStart = (e, id) => {
    const ids = picked.includes(id) ? picked : [id];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'copy';
  };
  const analyzing = (m) => tasks.value.some((t) => t.mediaId === m.id && (t.state === 'running' || t.state === 'queued'));
  const itemProps = (m) => ({
    key: m.id,
    'data-media': m.id,
    class: `${picked.includes(m.id) ? 'selected' : ''}${used.has(m.id) ? ' used' : ''}`,
    draggable: true,
    onDragStart: (e) => dragStart(e, m.id),
    onClick: (e) => pick(e, m.id),
    onDblClick: () => onAdd([m.id]),
    title: used.has(m.id) ? `${m.name} is already added` : m.kind === 'audio' ? `${m.name}. Double click or drag to add it as separate sound.` : `${m.name}. Double click or drag to add it as a camera.`,
  });
  const Icon = (m) => (m.kind === 'audio' ? AudioLines : Film);
  return (
    <section class="mc-browser">
      <div class="mc-pane-head">
        {head}
        <span class="spacer" />
        <IconButton icon={List} title="List view" active={view === 'list'} onClick={() => choose('list')} />
        <IconButton icon={LayoutGrid} title="Icon view" active={view === 'grid'} onClick={() => choose('grid')} />
        <IconButton icon={Rows3} title="Filmstrip view" active={view === 'filmstrip'} onClick={() => choose('filmstrip')} />
      </div>
      <div class="mc-browser-tools">
        <div class="search">
          <Search size={13} />
          <input placeholder="Search" value={query} onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <IconButton icon={Plus} title="Import files into the project" onClick={() => commands.importDialog()} />
      </div>
      <div class={`mc-files v-${view}`}>
        {items.length === 0 && <p class="dim mc-files-empty">{Object.keys(p.media).length ? 'No video or audio files match.' : 'Import video from each camera with the + button.'}</p>}
        {view === 'list' &&
          items.map((m) => {
            const I = Icon(m);
            return (
              <div {...itemProps(m)} class={`mc-file-row ${itemProps(m).class}`}>
                <I size={14} />
                <span class="name">{m.name}</span>
                <span class="dim">{fmtDur(m.duration)}</span>
                {used.has(m.id) ? <Check size={13} class="ok" /> : analyzing(m) ? <span class="busy-dot" title="Analyzing" /> : null}
              </div>
            );
          })}
        {view === 'grid' &&
          items.map((m) => {
            const I = Icon(m);
            const thumb = mediaThumb(m);
            return (
              <div {...itemProps(m)} class={`mc-file-card ${itemProps(m).class}`}>
                <div class="thumb">
                  {thumb ? <img src={fileUrl(thumb)} draggable={false} /> : <I size={22} />}
                  <span class="dur">{fmtDur(m.duration)}</span>
                  {used.has(m.id) && <Check size={14} class="ok" />}
                </div>
                <span class="name">{m.name}</span>
              </div>
            );
          })}
        {view === 'filmstrip' &&
          items.map((m) => (
            <div {...itemProps(m)} class={`mc-file-strip ${itemProps(m).class}`}>
              <div class="name">
                <span>{m.name}</span>
                <span class="dim">{fmtDur(m.duration)}</span>
                {used.has(m.id) && <Check size={13} class="ok" />}
              </div>
              <StripThumbs media={m} height={38} />
            </div>
          ))}
      </div>
      <div class="mc-browser-foot">
        <Button variant="secondary" icon={Plus} disabled={!picked.length} onClick={() => onAdd(picked)}>
          {picked.length > 1 ? `Add ${picked.length} Files` : picked.length && p.media[picked[0]]?.kind === 'audio' ? 'Add as Sound' : 'Add as Camera'}
        </Button>
      </div>
    </section>
  );
}

// Bilder fra hele klippet, side om side.
function StripThumbs({ media, height, from = 0, to = null, width = null }) {
  const ref = useRef(null);
  const [w, setW] = useState(width || 200);
  useEffect(() => {
    if (width) return setW(width);
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const stream = media?.streams?.main;
  const files = stream?.thumbs?.files || [];
  const interval = stream?.thumbs?.interval || 1;
  const end = to ?? media?.duration ?? 0;
  const tileW = Math.round((height * 16) / 9);
  const n = files.length ? Math.max(1, Math.min(400, Math.ceil(w / tileW))) : 0;
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const t = from + ((i + 0.5) / n) * (end - from);
    const idx = Math.max(0, Math.min(files.length - 1, Math.floor(t / interval)));
    tiles.push(<img key={i} src={fileUrl(files[idx])} style={{ width: tileW, height }} draggable={false} loading="lazy" />);
  }
  return (
    <div class="mc-strip" ref={ref} style={{ height, width: width || undefined }}>
      {tiles}
    </div>
  );
}

/* Tidslinjen: programmet (kuttene) øverst og vinklene under, med samme verktøy som i redigeringen. */
function MulticamTimeline(props) {
  const { mc, edit, frame, pps, tool, setTool, snap, setSnap, skimming, setSkimming, selectedCut, setSelectedCut, timeRef, skimRef, seek, scrollRef, headRef, skimLineRef, zoomBy, fitZoom, setPps, audioSource, setAudio, dropAngle, openSound, addMedia, syncOne, setFallback } = props;
  const p = project.value;
  // Sporhøyder: Sound og Program for seg, og hvert kamera- og lydspor for seg.
  const [heights, setHeights] = useState(() => ({
    sound: stored('mcSoundH', DEF_SOUND_H, ...H_LIMITS.sound),
    program: stored('mcProgramH', DEF_PROGRAM_H, ...H_LIMITS.program),
    angle: stored('mcAngleH', DEF_ANGLE_H, ...H_LIMITS.angle),
    per: {},
  }));
  const SOUND_H = heights.sound;
  const PROGRAM_H = heights.program;
  const PROGRAM_Y = RULER_H + SOUND_H;
  const angleH = (id) => heights.per[id] ?? heights.angle;
  // Dra i nederkanten av et sporhode. Shift på et kamera- eller lydspor endrer alle; dobbeltklikk tilbakestiller.
  const startResize = (key) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = key === 'sound' || key === 'program' ? key : 'angle';
    const [lo, hi] = H_LIMITS[kind];
    const y0 = e.clientY;
    const h0 = kind === 'angle' ? angleH(key) : heights[kind];
    const all = e.shiftKey;
    let last = h0;
    const move = (ev) => {
      last = Math.round(Math.max(lo, Math.min(hi, h0 + ev.clientY - y0)));
      setHeights((cur) => {
        if (kind !== 'angle') return { ...cur, [kind]: last };
        if (all) return { ...cur, angle: last, per: {} };
        return { ...cur, per: { ...cur.per, [key]: last } };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (kind === 'sound') store('mcSoundH', last);
      else if (kind === 'program') store('mcProgramH', last);
      else if (all) store('mcAngleH', last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resetHeight = (key) => (e) => {
    e.stopPropagation();
    setHeights((cur) => {
      if (key === 'sound') return (store('mcSoundH', DEF_SOUND_H), { ...cur, sound: DEF_SOUND_H });
      if (key === 'program') return (store('mcProgramH', DEF_PROGRAM_H), { ...cur, program: DEF_PROGRAM_H });
      const per = { ...cur.per };
      delete per[key];
      return { ...cur, per };
    });
  };
  const resizer = (key) => <div class="mc-row-resize" title="Drag to change the height. Shift changes all camera tracks. Double click resets." onPointerDown={startResize(key)} onDblClick={resetHeight(key)} />;
  // Kameraene først, så en egen del for lyd tatt opp for seg (A1, A2 ...).
  const rowList = [];
  {
    let y = PROGRAM_Y + PROGRAM_H;
    const push = (row) => {
      rowList.push({ ...row, y });
      y += row.h;
    };
    for (const a of listVideoAngles(p, mc)) push({ kind: 'angle', angle: a, h: angleH(a.id) });
    // Et tomt spor der en ny fil kan slippes, også etter at klippet er lagt på tidslinjen.
    push({ kind: 'newCamera', h: NEW_ROW_H });
    push({ kind: 'audioHead', h: AUDIO_HEAD_H });
    for (const a of audioOnlyAngles(p, mc)) push({ kind: 'angle', angle: a, h: angleH(a.id) });
  }
  const [dropOver, setDropOver] = useState(false);
  // Lydkilden i bruk. Følger lyden bildet, varierer den, og nivået justeres i Properties per kilde.
  const soundAngle = mc.audio && mc.audio !== 'follow' ? mc.angles.find((a) => a.id === mc.audio) : null;
  const [kfSel, setKfSel] = useState(null);
  // Dra et sporhode opp eller ned for å endre rekkefølgen. Kameraene og lydsporene flyttes hver for seg.
  const headsRef = useRef(null);
  const [reorder, setReorder] = useState(null);
  const startReorder = (e, a) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const video = isVideoAngle(p, a);
    const rows = rowList.filter((r) => r.kind === 'angle' && isVideoAngle(p, r.angle) === video);
    const others = rows.filter((r) => r.angle.id !== a.id);
    const target = (y) => {
      const index = others.filter((r) => r.y + r.h / 2 < y).length;
      const lineY = index < others.length ? others[index].y : others.length ? others[others.length - 1].y + others[others.length - 1].h : rows[0].y;
      return { index, lineY };
    };
    const y0 = e.clientY;
    let state = null;
    const move = (ev) => {
      if (!state && Math.abs(ev.clientY - y0) < 4) return;
      const y = ev.clientY - headsRef.current.getBoundingClientRect().top;
      state = { id: a.id, ...target(y) };
      setReorder(state);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setReorder(null);
      if (state) edit((m) => moveAngle(p, m, a.id, state.index));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const [pinY, setPinY] = useState(0);
  const ext = multicamExtent(p, mc);
  const range = multicamRange(p, mc);
  const pieces = programPieces(p, mc);
  const width = Math.max(600, (ext.end + 30) * pps);
  const contentRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null); // visning mens noe dras: { kind, ... }
  waveVersion.value;

  const timeAt = (clientX) => {
    const r = contentRef.current.getBoundingClientRect();
    return Math.max(0, (clientX - r.left) / pps);
  };
  const snapT = (t, skip = null) => {
    if (!snap) return t;
    const pts = [timeRef.current, range.in, range.out, ...mc.cuts.map((c) => c.t)];
    for (const a of mc.angles) {
      if (a.id === skip) continue;
      const e = angleExtent(p, a);
      pts.push(e.start, e.end);
    }
    let best = t;
    let dist = 8 / pps;
    for (const x of pts) {
      if (Math.abs(x - t) < dist) {
        dist = Math.abs(x - t);
        best = x;
      }
    }
    return best;
  };

  const rowAt = (clientY) => {
    const r = contentRef.current.getBoundingClientRect();
    const y = clientY - r.top;
    // Linjalen, lydsporet og programmet står fast øverst når kamerasporene rulles.
    const yv = y - (scrollRef.current?.scrollTop || 0);
    if (yv < RULER_H) return { kind: 'ruler' };
    if (yv < PROGRAM_Y) return { kind: 'sound' };
    if (yv < PROGRAM_Y + PROGRAM_H) return { kind: 'program' };
    const row = rowList.find((r) => y >= r.y && y < r.y + r.h);
    return row?.kind === 'angle' ? row : { kind: 'empty' };
  };

  // Kuttet under pekeren, innenfor noen få piksler.
  const cutNear = (t) => {
    let best = -1;
    let dist = 6 / pps;
    mc.cuts.forEach((c, i) => {
      if (i === 0) return;
      if (Math.abs(c.t - t) < dist) {
        dist = Math.abs(c.t - t);
        best = i;
      }
    });
    return best;
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const el = contentRef.current;
    el.setPointerCapture(e.pointerId);
    const t = timeAt(e.clientX);
    const row = rowAt(e.clientY);
    const sc = scrollRef.current;
    if (tool === 'hand') {
      dragRef.current = { kind: 'hand', x: e.clientX, left: sc.scrollLeft };
      return;
    }
    if (row.kind === 'sound' && soundAngle) {
      const y = e.clientY - el.getBoundingClientRect().top - SOUND_Y - (scrollRef.current?.scrollTop || 0);
      const kfs = angleSound(soundAngle).volumeKf;
      const hit = kfs.findIndex(([kt, v]) => Math.abs(kt * pps - (e.clientX - el.getBoundingClientRect().left)) < KF_HIT && Math.abs(volumeY(v, SOUND_H) - y) < KF_HIT + 3);
      if (e.altKey) {
        // Alt/Option-klikk legger inn et nøkkelbilde på linjen, som i redigeringen.
        if (hit < 0) {
          const at = snapT(t);
          const v = clampDb(soundLevelAt(angleSound(soundAngle), at));
          edit((m) => {
            const a = m.angles.find((x) => x.id === soundAngle.id);
            const cur = angleSound(a);
            a.sound = { ...cur, volumeKf: [...cur.volumeKf, [at, v]].sort((x, y2) => x[0] - y2[0]) };
          });
        }
        return;
      }
      setKfSel(hit >= 0 ? hit : null);
      const segment = hit >= 0 ? [hit] : kfs.length ? (() => {
        const next = kfs.findIndex(([kt]) => kt > t);
        return next === 0 ? [0] : next < 0 ? [kfs.length - 1] : [next - 1, next];
      })() : [];
      dragRef.current = { kind: 'level', angle: soundAngle.id, x: e.clientX, y: e.clientY, base: structuredClone(angleSound(soundAngle)), kf: hit >= 0 ? hit : null, indices: segment, axis: null, started: false };
      return;
    }
    if (row.kind === 'ruler' || row.kind === 'empty' || row.kind === 'sound') {
      seek(snapT(t));
      dragRef.current = { kind: 'scrub' };
      return;
    }
    if (row.kind === 'program') {
      const near = cutNear(t);
      if (tool === 'blade') {
        edit((m) => void bladeAt(m, snapT(t), { frame }));
        return;
      }
      if (near > 0 && (tool === 'trim' || tool === 'select')) {
        setSelectedCut(near);
        dragRef.current = { kind: 'cut', index: near, base: structuredClone(mc), started: false };
        return;
      }
      const idx = cutIndexAt(mc, t);
      setSelectedCut(idx);
      seek(t);
      dragRef.current = { kind: 'scrub' };
      return;
    }
    if (row.kind === 'angle') {
      if (tool === 'blade') return;
      const e0 = angleExtent(p, row.angle);
      if (t < e0.start || t > e0.end) {
        seek(snapT(t));
        dragRef.current = { kind: 'scrub' };
        return;
      }
      dragRef.current = { kind: 'angle', angle: row.angle.id, t0: t, offset: row.angle.offset, base: structuredClone(mc), started: false };
    }
  };

  const onPointerMove = (e) => {
    const t = timeAt(e.clientX);
    const d = dragRef.current;
    if (!d) {
      skimRef.current = skimming && contentRef.current.matches(':hover') ? t : null;
      const row = rowAt(e.clientY);
      const near = row.kind === 'program' && tool !== 'blade' && tool !== 'hand' && cutNear(t) > 0;
      contentRef.current.style.cursor = tool === 'hand' ? 'grab' : row.kind === 'sound' && soundAngle ? (e.altKey ? 'copy' : 'ns-resize') : tool === 'blade' && row.kind === 'program' ? 'crosshair' : near ? 'ew-resize' : row.kind === 'angle' && tool !== 'blade' ? 'grab' : '';
      return;
    }
    if (d.kind === 'hand') {
      scrollRef.current.scrollLeft = d.left - (e.clientX - d.x);
      return;
    }
    if (d.kind === 'scrub') {
      skimRef.current = null;
      seek(snapT(t));
      return;
    }
    if (d.kind === 'level') {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.axis) {
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        // Et nøkkelbilde dras enten opp/ned eller sidelengs; den første bevegelsen bestemmer.
        d.axis = d.kf != null && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      const base = d.base;
      let next;
      if (d.axis === 'x') {
        const list = base.volumeKf.map((k) => [...k]);
        const lo = d.kf > 0 ? list[d.kf - 1][0] + frame : -Infinity;
        const hi = d.kf < list.length - 1 ? list[d.kf + 1][0] - frame : Infinity;
        list[d.kf][0] = Math.max(lo, Math.min(hi, snapT(base.volumeKf[d.kf][0] + dx / pps)));
        next = { ...base, volumeKf: list };
      } else {
        const delta = -volumeDelta(dy, SOUND_H);
        if (!base.volumeKf.length) next = { ...base, volume: clampDb(base.volume + delta) };
        else {
          const list = base.volumeKf.map((k) => [...k]);
          const vals = d.indices.map((i) => list[i][1]);
          const shift = Math.max(-60 - Math.min(...vals), Math.min(12 - Math.max(...vals), delta));
          for (const i of d.indices) list[i][1] = clampDb(list[i][1] + shift);
          next = { ...base, volumeKf: list };
        }
      }
      edit((m) => void (m.angles.find((x) => x.id === d.angle).sound = next), { record: !d.started });
      d.started = true;
      setDrag({ kind: 'level', t: d.kf != null ? next.volumeKf[d.kf][0] : t, db: d.kf != null ? next.volumeKf[d.kf][1] : soundLevelAt(next, t) });
      return;
    }
    if (d.kind === 'cut') {
      const next = snapT(t);
      // Første bevegelse lagres som ett angresteg, resten oppdaterer det samme steget.
      edit((m) => void moveCut(m, d.index, next, { frame }), { record: !d.started });
      d.started = true;
      seek(mc.cuts[d.index] ? next : timeRef.current);
      setDrag({ kind: 'cut', t: next });
      return;
    }
    if (d.kind === 'angle') {
      const a = d.base.angles.find((x) => x.id === d.angle);
      const len = p.media[a.mediaId]?.duration || 0;
      let off = d.offset + (t - d.t0);
      // Snapping på start og slutt av vinkelen.
      const s = snapT(off, d.angle);
      if (s !== off) off = s;
      else {
        const eSnap = snapT(off + len, d.angle);
        if (eSnap !== off + len) off = eSnap - len;
      }
      off = Math.round(off / frame) * frame;
      edit((m) => void setAngleOffset(p, m, d.angle, off), { record: !d.started });
      d.started = true;
      setDrag({ kind: 'angle', delta: off - d.offset });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d?.kind === 'angle' && d.started) edit((m) => void normalize(p, m), { record: false });
  };

  const [dropAt, setDropAt] = useState(null);

  // Høyreklikk på et klipp: synk det mot de andre, bruk lyden, juster lyden eller fjern det.
  // Active Video Angle og Active Audio Angle, som i Final Cut Pro: bytt kamera for biten der du
  // høyreklikket (uten nytt kutt), eller hvor lyden kommer fra. Står først i alle menyene i tidslinjen.
  const angleMenu = (t) => {
    const cur = angleAt(mc, t);
    const name = (a) => `${isVideoAngle(p, a) ? `Camera ${angleLabel(p, mc, a.id)}` : angleLabel(p, mc, a.id)}: ${p.media[a.mediaId]?.name || 'missing file'}`;
    return [
      { label: 'Active Video Angle', enabled: listVideoAngles(p, mc).length > 0, submenu: listVideoAngles(p, mc).map((a) => ({ id: `mcv:${a.id}`, label: name(a), checked: cur === a.id })) },
      {
        label: 'Active Audio Angle',
        submenu: [
          ...mc.angles.filter((a) => angleHasAudio(p, a)).map((a) => ({ id: `mca:${a.id}`, label: name(a), checked: mc.audio === a.id })),
          { separator: true },
          { id: 'mca:follow', label: 'Follow the Picture', checked: mc.audio === 'follow' },
        ],
      },
      { separator: true },
    ];
  };
  const runAngleMenu = (id, t) => {
    if (id?.startsWith('mcv:')) {
      edit((m) => switchSegment(p, m, t, id.slice(4), { frame, preserveCuts: true }));
      return true;
    }
    if (id?.startsWith('mca:')) {
      setAudio(id.slice(4));
      return true;
    }
    return false;
  };

  const onContextMenu = async (e) => {
    e.preventDefault();
    const row = rowAt(e.clientY);
    const tMenu = timeAt(e.clientX);
    if (row.kind === 'sound' && soundAngle) {
      const el = contentRef.current.getBoundingClientRect();
      const x = e.clientX - el.left;
      const y = e.clientY - el.top - SOUND_Y - (scrollRef.current?.scrollTop || 0);
      const t = timeAt(e.clientX);
      const sound = angleSound(soundAngle);
      const hit = sound.volumeKf.findIndex(([kt, v]) => Math.abs(kt * pps - x) < KF_HIT && Math.abs(volumeY(v, SOUND_H) - y) < KF_HIT + 3);
      const id = await api.popupMenu([
        ...angleMenu(t),
        ...(hit >= 0 ? [{ id: 'del', label: 'Delete Keyframe' }] : [{ id: 'add', label: 'Add Keyframe', accelerator: isMac ? 'Alt+Click' : 'Alt+Click' }]),
        { id: 'clear', label: 'Remove All Keyframes', enabled: sound.volumeKf.length > 0 },
        { separator: true },
        { id: 'adjust', label: 'Adjust Sound…' },
      ]);
      if (runAngleMenu(id, t)) return;
      const put = (fn) => edit((m) => {
        const a = m.angles.find((x2) => x2.id === soundAngle.id);
        const cur = angleSound(a);
        a.sound = { ...cur, volumeKf: fn(cur) };
      });
      if (id === 'del') put((cur) => cur.volumeKf.filter((_, i) => i !== hit));
      else if (id === 'add') put((cur) => [...cur.volumeKf, [snapT(t), clampDb(soundLevelAt(cur, snapT(t)))]].sort((x1, x2) => x1[0] - x2[0]));
      // Uten nøkkelbilder beholdes nivået der pekeren var.
      else if (id === 'clear') edit((m) => {
        const a = m.angles.find((x2) => x2.id === soundAngle.id);
        const cur = angleSound(a);
        a.sound = { ...cur, volume: clampDb(soundLevelAt(cur, t)), volumeKf: [] };
      });
      else if (id === 'adjust') openSound(soundAngle.id);
      return;
    }
    if (row.kind !== 'angle') {
      // Program, linjalen og tomme spor: bytt vinkel, eller legg til og fjern kutt der du klikket.
      const near = cutNear(tMenu);
      const id = await api.popupMenu([
        ...angleMenu(tMenu),
        { id: 'blade', label: 'Add Cut Here', accelerator: 'B' },
        { id: 'removeCut', label: 'Remove Cut', enabled: near > 0 },
      ]);
      if (runAngleMenu(id, tMenu)) return;
      if (id === 'blade') edit((m) => void bladeAt(m, snapT(tMenu), { frame }));
      else if (id === 'removeCut') edit((m) => removeCut(p, m, near));
      return;
    }
    const a = row.angle;
    const cam = isVideoAngle(p, a);
    const hasAudio = angleHasAudio(p, a);
    const others = mc.angles.some((x) => x.id !== a.id && angleHasAudio(p, x));
    const id = await api.popupMenu([
      ...angleMenu(tMenu),
      { id: 'sync', label: 'Synchronize to Audio', enabled: hasAudio && others },
      { separator: true },
      { id: 'sound', label: 'Use Sound from This File', enabled: hasAudio, checked: audioSource === a.id && mc.audio !== 'follow' },
      { id: 'adjust', label: 'Adjust Sound…', enabled: hasAudio },
      ...(cam ? [{ id: 'fallback', label: 'Use as Fallback Camera', checked: mc.fallback === a.id }] : []),
      { separator: true },
      { id: 'remove', label: 'Remove from Multicam Clip' },
    ]);
    if (runAngleMenu(id, tMenu)) return;
    if (id === 'sync') syncOne(a.id);
    else if (id === 'sound') setAudio(a.id);
    else if (id === 'adjust') openSound(a.id);
    else if (id === 'fallback') setFallback(mc.fallback === a.id ? 'auto' : a.id);
    else if (id === 'remove') dropAngle(a.id);
  };

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = scrollRef.current.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left);
    }
  };

  const ticks = useMemo(() => {
    const steps = [1 / 30, 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];
    const step = steps.find((s) => s * pps >= 70) || 3600;
    const out = [];
    for (let t = 0; t <= ext.end + 30; t += step) out.push(t);
    return { step, out };
  }, [pps, ext.end]);

  const last = rowList[rowList.length - 1];
  const rowsH = last.y + last.h + 30;

  return (
    <section class="mc-timeline">
      <div class="mc-tl-bar">
        <div class="seg">
          <IconButton icon={MousePointer2} title="Select (A). Drag a cut to move it." active={tool === 'select'} onClick={() => setTool('select')} />
          <IconButton icon={StretchHorizontal} title="Trim (T). Drag a cut to fine tune it." active={tool === 'trim'} onClick={() => setTool('trim')} />
          <IconButton icon={Scissors} title="Blade (B). Click the program track to add a cut." active={tool === 'blade'} onClick={() => setTool('blade')} />
          <IconButton icon={Hand} title="Hand (H). Drag to scroll." active={tool === 'hand'} onClick={() => setTool('hand')} />
        </div>
        <div class="seg">
          <IconButton icon={Magnet} title="Snapping (N)" active={snap} onClick={() => setSnap(!snap)} />
          <IconButton icon={Film} title="Skimming (S)" active={skimming} onClick={() => setSkimming(!skimming)} />
        </div>
        <span class="mc-keys dim">
          <kbd>1</kbd>–<kbd>9</kbd> cut to angle · <kbd>⇧</kbd>+<kbd>1</kbd>–<kbd>9</kbd> switch without cutting · <kbd>I</kbd> <kbd>O</kbd> range · <kbd>Space</kbd> play · <kbd>⌫</kbd> remove cut
        </span>
        <span class="spacer" />
        {drag?.kind === 'level' && <span class="mc-drag-tip">Level {formatVolumeDb(drag.db)}</span>}
        {drag?.kind === 'angle' && <span class="mc-drag-tip">Moved {drag.delta >= 0 ? '+' : '−'}{formatTimecode(Math.abs(drag.delta), p.fps)}</span>}
        <div class="seg zoom">
          <IconButton icon={ZoomOut} title={`Zoom out (${mod}-)`} onClick={() => zoomBy(1 / 1.4)} />
          <input type="range" min="0" max="1" step="0.001" value={Math.log(pps / 0.5) / Math.log(4000)} onInput={(e) => setPps(0.5 * Math.pow(4000, Number(e.currentTarget.value)))} aria-label="Zoom" />
          <IconButton icon={ZoomIn} title={`Zoom in (${mod}=)`} onClick={() => zoomBy(1.4)} />
          <button class="link-btn" title="Zoom to fit (Shift Z)" onClick={fitZoom}>Fit</button>
        </div>
      </div>
      <div class="mc-tl-scroll" ref={scrollRef} onWheel={onWheel} onScroll={(e) => setPinY(e.currentTarget.scrollTop)}>
        <div class="mc-tl-inner" style={{ width: width + HEAD_W, height: rowsH }}>
          <div class={`mc-tl-heads${reorder ? ' reordering' : ''}`} ref={headsRef} style={{ height: rowsH }}>
            {reorder && <div class="mc-reorder-line" style={{ top: reorder.lineY }} />}
            <div class="mc-tl-head ruler pin" style={{ height: RULER_H, transform: `translateY(${pinY}px)` }} />
            <div class="mc-tl-head sound pin" style={{ height: SOUND_H, transform: `translateY(${pinY}px)` }}>
              <div class="mc-sound-title">
                <b>Sound</b>
                {soundAngle && <span class="mc-num audio" style={{ background: angleColor(angleIndex(mc, soundAngle.id)) }}>{angleLabel(p, mc, soundAngle.id)}</span>}
                <IconButton icon={SlidersHorizontal} size={13} disabled={!soundAngle} title="Adjust the sound in Properties" onClick={() => soundAngle && openSound(soundAngle.id)} />
              </div>
              <span class="dim">
                {mc.audio === 'follow'
                  ? 'Follows the picture'
                  : soundAngle
                    ? `${formatVolumeDb(soundLevelAt(angleSound(soundAngle), drag?.kind === 'level' ? drag.t : timeRef.current))}${angleSound(soundAngle).volumeKf.length ? ' · keyframes' : ''}`
                    : 'No sound'}
              </span>
              {resizer('sound')}
            </div>
            <div class="mc-tl-head program pin" style={{ height: PROGRAM_H, transform: `translateY(${pinY}px)` }}>
              <b>Program</b>
              <span class="dim">What goes on the timeline</span>
              {resizer('program')}
            </div>
            {rowList.map((r) => {
              if (r.kind === 'newCamera') {
                return (
                  <div key="new-camera" class="mc-tl-head new-camera" style={{ height: r.h }} title="Drag a video from Files to this track to add a camera">
                    <Plus size={12} />
                    <span>New camera</span>
                  </div>
                );
              }
              if (r.kind === 'audioHead') {
                return (
                  <div
                    key="audio-head"
                    class={`mc-tl-head audio-head${dropOver ? ' drop' : ''}`}
                    style={{ height: r.h }}
                    title="Drag an audio file here to add sound recorded separately"
                    onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && (e.preventDefault(), setDropOver(true))}
                    onDragLeave={() => setDropOver(false)}
                    onDrop={(e) => {
                      setDropOver(false);
                      const raw = e.dataTransfer.getData(DRAG_TYPE);
                      if (raw) addMedia(JSON.parse(raw));
                    }}
                  >
                    <AudioLines size={12} />
                    <b>Separate sound</b>
                  </div>
                );
              }
              const a = r.angle;
              const i = angleIndex(mc, a.id);
              const m = p.media[a.mediaId];
              const hasAudio = angleHasAudio(p, a);
              const label = angleLabel(p, mc, a.id);
              const cam = isVideoAngle(p, a);
              const hot = cam && Number(label) <= MAX_HOTKEY_ANGLES;
              return (
                <div
                  key={a.id}
                  class={`mc-tl-head track${reorder?.id === a.id ? ' dragging' : ''}`}
                  style={{ height: r.h }}
                  title="Drag up or down to change the order"
                  onPointerDown={(e) => startReorder(e, a)}
                >
                  <GripVertical size={12} class="mc-grip" />
                  <span class={`mc-num${cam ? '' : ' audio'}`} style={{ background: angleColor(i) }} title={hot ? `Shortcut: ${label}` : cam ? 'No shortcut' : 'Sound recorded separately'}>
                    {label}
                  </span>
                  <span class="name" title={m?.name}>{m?.name || 'Missing file'}</span>
                  {hot && <kbd title="Keyboard shortcut">{label}</kbd>}
                  <IconButton
                    icon={Headphones}
                    size={13}
                    class={audioSource === a.id ? 'on' : ''}
                    active={audioSource === a.id && mc.audio !== 'follow'}
                    disabled={!hasAudio}
                    title={hasAudio ? 'Use the sound from this file' : 'This file has no sound'}
                    onClick={() => setAudio(a.id)}
                  />
                  <IconButton icon={SlidersHorizontal} size={13} disabled={!hasAudio} title="Adjust the sound in Properties" onClick={() => openSound(a.id)} />
                  <IconButton icon={X} size={13} title="Remove" onClick={() => dropAngle(a.id)} />
                  {resizer(a.id)}
                </div>
              );
            })}
          </div>
          <div
            class={`mc-tl-content tool-${tool}`}
            ref={contentRef}
            style={{ width, height: rowsH, left: HEAD_W }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => !dragRef.current && (skimRef.current = null)}
            onContextMenu={onContextMenu}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              const r0 = contentRef.current.getBoundingClientRect();
              const y = e.clientY - r0.top;
              const row = rowList.find((r) => y >= r.y && y < r.y + r.h);
              setDropAt({ t: snapT(timeAt(e.clientX)), row: row?.kind || 'empty' });
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDropAt(null)}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(DRAG_TYPE);
              const at = dropAt?.t ?? snapT(timeAt(e.clientX));
              setDropAt(null);
              if (!raw) return;
              e.preventDefault();
              addMedia(JSON.parse(raw), { at });
            }}
          >
            <div class="mc-ruler pin" style={{ height: RULER_H, transform: `translateY(${pinY}px)` }}>
              {ticks.out.map((t) => (
                <span key={t} style={{ left: t * pps }}>{formatTimecode(t, p.fps).replace(/^00:/, '')}</span>
              ))}
            </div>
            {/* Området som havner på tidslinjen (I og O). Utenfor er mørkere. */}
            <div class="mc-outrange" style={{ left: 0, width: Math.max(0, range.in * pps) }} />
            <div class="mc-outrange" style={{ left: range.out * pps, width: Math.max(0, width - range.out * pps) }} />
            <div class="mc-range-mark in" style={{ left: range.in * pps }} title="Range start (I)" />
            <div class="mc-range-mark out" style={{ left: range.out * pps }} title="Range end (O)" />
            <SoundRow mc={mc} source={soundAngle} pps={pps} width={width} kfSel={kfSel} pinY={pinY} h={SOUND_H} />
            <div class="mc-program-row pin" style={{ top: PROGRAM_Y, height: PROGRAM_H, transform: `translateY(${pinY}px)` }}>
              {pieces.map((s) => {
                const i = angleIndex(mc, s.angle);
                const a = mc.angles[i];
                const m = p.media[a?.mediaId];
                const x = s.start * pps;
                const w = Math.max(1, (s.end - s.start) * pps);
                const chosen = angleLabel(p, mc, s.chosen);
                const label = a ? angleLabel(p, mc, a.id) : '';
                const title = !a ? `No camera has a picture here. This part becomes a gap.` : s.fallback ? `Camera ${chosen} has no picture here, so camera ${label} is shown.` : `Camera ${label}`;
                return (
                  <div key={`${s.index}-${s.start}`} class={`mc-seg${selectedCut === s.index ? ' selected' : ''}${s.fallback ? ' fallback' : ''}${a ? '' : ' empty'}`} style={{ left: x, width: w, '--angle': a ? angleColor(i) : '#333' }} title={title}>
                    {w > 40 && m && <StripThumbs media={m} height={PROGRAM_H - 18} from={s.start - a.offset} to={s.end - a.offset} width={w} />}
                    <span class="label">
                      {a ? <b>{label}</b> : <span>Gap</span>}
                      {w > 70 && m && <span>{s.fallback ? `${m.name} (camera ${chosen} has no picture)` : m.name}</span>}
                    </span>
                  </div>
                );
              })}
              {mc.cuts.slice(1).map((c, k) => (
                <div key={k} class={`mc-cut${selectedCut === k + 1 ? ' selected' : ''}`} style={{ left: c.t * pps }} />
              ))}
            </div>
            {rowList.map((r) => {
              if (r.kind === 'audioHead') return <div key="audio-head" class="mc-audio-head-row" style={{ top: r.y, height: r.h }} />;
              if (r.kind === 'newCamera') {
                return (
                  <div key="new-camera" class={`mc-new-row${dropAt?.row === 'newCamera' ? ' over' : ''}`} style={{ top: r.y, height: r.h }}>
                    <span>Drag a video here from Files to add another camera</span>
                  </div>
                );
              }
              const a = r.angle;
              const i = angleIndex(mc, a.id);
              const m = p.media[a.mediaId];
              const e0 = angleExtent(p, a);
              const x = e0.start * pps;
              const w = Math.max(2, (e0.end - e0.start) * pps);
              const isVideo = m?.kind === 'video';
              const wavePath = m?.kind === 'audio' ? m.streams.main?.wave : Object.values(m?.streams || {}).find((s) => s.hasAudio)?.wave;
              return (
                <div key={a.id} class="mc-angle-row" style={{ top: r.y, height: r.h }}>
                  <div class={`mc-angle-bar${isVideo ? '' : ' audio'}${a.id === audioSource ? ' has-audio' : ''}`} style={{ left: x, width: w, '--angle': angleColor(i) }}>
                    {isVideo && w > 30 && <StripThumbs media={m} height={r.h - 16} width={w} />}
                    <WaveLine path={wavePath} width={w} height={14} duration={e0.end - e0.start} />
                  </div>
                </div>
              );
            })}
            {dropAt && <div class="mc-drop-line" style={{ left: dropAt.t * pps, height: rowsH }} />}
            <div class="mc-head-line" ref={headRef} style={{ height: rowsH }} />
            <div class="mc-skim-line" ref={skimLineRef} style={{ height: rowsH }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* Lydsporet øverst: lydbølgen fra kilden i bruk, med den gule nivålinjen og nøkkelbildene. */
function SoundRow({ mc, source, pps, width, kfSel, pinY, h: SOUND_H }) {
  const pin = { transform: `translateY(${pinY}px)` };
  const p = project.value;
  if (!source) {
    return (
      <div class="mc-sound-row empty pin" style={{ top: SOUND_Y, height: SOUND_H, ...pin }}>
        <span>{mc.audio === 'follow' ? 'The sound follows the picture. Choose one sound source to see and adjust its level here.' : 'No sound. Add a camera with sound or an audio file recorded separately.'}</span>
      </div>
    );
  }
  const m = p.media[source.mediaId];
  const e0 = angleExtent(p, source);
  const sound = angleSound(source);
  const wavePath = m?.kind === 'audio' ? m.streams.main?.wave : Object.values(m?.streams || {}).find((s) => s.hasAudio)?.wave;
  const x0 = e0.start * pps;
  const w = Math.max(2, (e0.end - e0.start) * pps);
  const list = sound.volumeKf;
  let d;
  if (!list.length) d = `M${x0} ${volumeY(sound.volume, SOUND_H)} H${x0 + w}`;
  else {
    d = `M${Math.min(x0, list[0][0] * pps)} ${volumeY(list[0][1], SOUND_H)}`;
    for (const [t, v] of list) d += ` L${t * pps} ${volumeY(v, SOUND_H)}`;
    d += ` H${Math.max(x0 + w, list[list.length - 1][0] * pps)}`;
  }
  return (
    <div class="mc-sound-row pin" style={{ top: SOUND_Y, height: SOUND_H, ...pin }} title="Drag the yellow line to change the level. Alt (Option) click adds a keyframe. Right click a keyframe to delete it.">
      <div class="mc-sound-clip" style={{ left: x0, width: w }}>
        <WaveLine path={wavePath} width={w} height={SOUND_H - 8} duration={e0.end - e0.start} />
      </div>
      <svg class="mc-level" width={width} height={SOUND_H}>
        <path d={d} />
        {list.map(([t, v], i) => (
          <circle key={i} class={kfSel === i ? 'selected' : ''} cx={t * pps} cy={volumeY(v, SOUND_H)} r={4.5} />
        ))}
      </svg>
    </div>
  );
}

// Lydbølgen til en vinkel, så det er lett å se om lyden står likt.
function WaveLine({ path, width, height, duration }) {
  const ref = useRef(null);
  waveVersion.value;
  const wave = getWave(path);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.min(16000, Math.round(width * dpr)));
    cv.width = W;
    cv.height = Math.round(height * dpr);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!wave?.peaks?.length) return;
    const rate = wave.rate || 100;
    g.fillStyle = 'rgba(200, 240, 210, 0.85)';
    const mid = cv.height / 2;
    for (let px = 0; px < W; px++) {
      let i0 = Math.floor((px / W) * duration * rate);
      const i1 = Math.max(i0 + 1, Math.ceil(((px + 1) / W) * duration * rate));
      let mx = 0;
      for (; i0 < i1 && i0 < wave.peaks.length; i0++) if (wave.peaks[i0] > mx) mx = wave.peaks[i0];
      const h = Math.max(0.5, (mx / 255) * mid);
      g.fillRect(px, mid - h, 1, h * 2);
    }
  }, [wave, width, height, duration]);
  return <canvas ref={ref} class="mc-wave" style={{ width, height }} />;
}
