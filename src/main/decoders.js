// Kamera-RAW og andre formater FFmpeg ikke kan dekode: produsentens eget verktøy gjør filen om til
// ProRes, som så importeres som vanlig video. Verktøyet finnes på kjente steder, i PATH, eller der
// brukeren har pekt på det (Locate i varselet). Uten verktøyet får brukeren lenke til produsenten.
const { app, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const win = process.platform === 'win32';
const mac = process.platform === 'darwin';

const TOOLS = {
  // REDCINE-X PRO. Leser også Nikon N-RAW. --format 201 er ProRes, --PRcodec 4 er ProRes 4444.
  redline: {
    exe: win ? 'REDline.exe' : 'REDline',
    known: mac ? ['/Applications/REDCINE-X Professional/REDCINE-X PRO.app/Contents/MacOS/REDline'] : win ? ['C:\\Program Files\\REDCINE-X PRO 64-bit\\REDline.exe'] : [],
    ext: /\.(r3d|nev)$/i,
    args: (file, dir, stem) => ['--i', file, '--outDir', dir, '--o', stem, '--format', '201', '--PRcodec', '4'],
  },
  // ARRI Reference Tool (kommandolinje). Enkeltbilder (.ari, .arx) leses som hele mappen.
  artcmd: {
    exe: win ? 'art-cmd.exe' : 'art-cmd',
    known: [],
    ext: /\.(ari|arx)$/i,
    container: /\.mxf$/i,
    args: (file, dir, stem) => ['process', '--input', /\.(ari|arx)$/i.test(file) ? path.dirname(file) : file, '--video-codec', 'prores4444xq', '--target-colorspace', 'Rec.709/D65/BT.1886', '--output', path.join(dir, `${stem}.mxf`)],
  },
  // Apples egne dekodere (ProRes RAW med Pro Video Formats, og annet AVFoundation leser).
  avconvert: {
    exe: 'avconvert',
    known: mac ? ['/usr/bin/avconvert'] : [],
    ext: null,
    container: mac ? /\.(mov|mp4|m4v)$/i : null,
    args: (file, dir, stem) => ['--source', file, '--preset', 'PresetAppleProRes4444LPCM', '--output', path.join(dir, `${stem}.mov`), '--replace', '--progress'],
  },
  // Egen hjelper bygd mot Blackmagic RAW SDK (native/braw). Biblioteket kommer fra brukerens installasjon
  // av Blackmagic RAW (eller et program som har det med), og det er det brukeren peker på med Locate.
  braw: {
    exe: mac ? 'BlackmagicRawAPI.framework' : win ? 'BlackmagicRawAPI.dll' : 'libBlackmagicRawAPI.so',
    // Først biblioteket som følger med appen (scripts/build-braw.mjs), så brukerens egne installasjoner.
    known: [path.join(process.resourcesPath || '', 'decoders'), path.join(__dirname, '..', '..', 'vendor', 'decoders')]
      .map((d) => path.join(d, mac ? 'BlackmagicRawAPI.framework' : win ? 'BlackmagicRawAPI.dll' : 'libBlackmagicRawAPI.so'))
      .concat(mac
      ? ['/Applications/Blackmagic RAW/Blackmagic RAW SDK/Mac/Libraries', '/Applications/Blackmagic RAW/Blackmagic RAW Player.app/Contents/Frameworks', '/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries', '/Applications/Gyroflow.app/Contents/Frameworks'].map((d) => path.join(d, 'BlackmagicRawAPI.framework'))
      : win
        ? ['C:\\Program Files\\Blackmagic Design\\Blackmagic RAW\\BlackmagicRAW\\BlackmagicRawAPI.dll']
        : ['/usr/lib64/blackmagic/BlackmagicRAWSDK/Linux/Libraries/libBlackmagicRawAPI.so']),
    ext: /\.braw$/i,
    // Hjelperen skriver 16-bit RGB til stdout; FFmpeg koder det til ProRes 4444.
    helper: [path.join(process.resourcesPath || '', 'decoders'), path.join(__dirname, '..', '..', 'vendor', 'decoders')].map((d) => path.join(d, win ? 'braw-decode.exe' : 'braw-decode')),
  },
};

// BRAW virker bare når hjelperen er bygd (scripts/build-braw.mjs, krever SDK-en).
const brawHelper = () => TOOLS.braw.helper.find((p) => fs.existsSync(p)) || null;

const settingsFile = () => path.join(app.getPath('userData'), 'decoders.json');
function chosen() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function onPath(exe) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, exe);
    if (dir && fs.existsSync(p)) return p;
  }
  return null;
}

function findTool(id) {
  const t = TOOLS[id];
  const mine = chosen()[id];
  if (mine && fs.existsSync(mine)) return mine;
  return t.known.find((p) => p && fs.existsSync(p)) || (t.helper ? null : onPath(t.exe));
}

// Verktøyet for filen: RAW-endelser alltid, beholdere (.mov, .mxf) bare når FFmpeg ikke kunne dekode bildet.
function toolFor(file, ffmpegFailed) {
  // Filer vi selv har laget dekodes aldri på nytt.
  if (/ \(ProRes\)[^\\/]*$/.test(file)) return null;
  for (const [id, t] of Object.entries(TOOLS)) {
    if (t.ext?.test(file) && (!t.helper || brawHelper())) return id;
  }
  if (!ffmpegFailed) return null;
  for (const [id, t] of Object.entries(TOOLS)) {
    if (t.container?.test(file) && findTool(id)) return id;
  }
  return null;
}

// Fremdrift oppdateres bare når den har flyttet seg minst én prosent, så oppgavelisten ikke oversvømmes.
function throttled(ctx) {
  let last = -1;
  return (p) => {
    if (p - last < 0.01 && p < 1) return;
    last = p;
    ctx.progress(p);
  };
}

// input: skriver selv til verktøyets stdin og melder fremdrift (da leses ikke prosent fra utskriften).
function runTool(bin, args, ctx, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    ctx.setCancel(() => proc.kill());
    const progress = throttled(ctx);
    let log = '';
    const onData = (d) => {
      const s = d.toString();
      log = (log + s).slice(-4000);
      // Verktøyene skriver fremdrift som prosent.
      const m = !input && /(\d{1,3}(?:\.\d+)?)\s*%/.exec(s);
      if (m) progress(Math.min(1, Number(m[1]) / 100));
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(proc) : reject(new Error(`${path.basename(bin)} failed (${code}): ${log.trim().split('\n').pop()}`))));
    if (input) input(proc);
  });
}

// Gjør filen om til ProRes i den første skrivbare mappen i dirs. Gir stien til den nye filen.
async function decode(id, file, dirs, ctx, ffmpegBin) {
  const bin = findTool(id);
  // Endelsen er med i navnet: RED lagrer ofte en .mov med samme navn ved siden av .R3D-filen.
  const stem = `${path.basename(file)} (ProRes)`;
  const newest = async (dir, since) =>
    (await fs.promises.readdir(dir).catch(() => []))
      .filter((n) => n.startsWith(stem) && /\.(mov|mxf)$/i.test(n))
      .map((n) => ({ p: path.join(dir, n), t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .filter((x) => x.t >= since)
      .sort((a, b) => b.t - a.t)[0]?.p;
  // Allerede dekodet (nyere enn originalen): bruk den.
  const srcTime = fs.statSync(file).mtimeMs;
  for (const dir of dirs) {
    const hit = await newest(dir, srcTime);
    if (hit) return hit;
  }
  for (const [i, dir] of dirs.entries()) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const start = Date.now() - 1000;
      if (TOOLS[id].helper) await decodePiped(brawHelper(), bin, file, path.join(dir, `${stem}.mov`), ctx, ffmpegBin);
      else await runTool(bin, TOOLS[id].args(file, dir, stem), ctx);
      // Verktøyene velger selv endelse og noen ganger et tillegg i navnet: ta den nyeste filen med navnet.
      const hit = await newest(dir, start);
      if (!hit) throw new Error(`${path.basename(bin)} did not write a file.`);
      return hit;
    } catch (err) {
      if (ctx.isCanceled() || i === dirs.length - 1) throw err;
    }
  }
}

// braw-decode <bibliotek> <fil> skriver først en linje med "bredde høyde fps antall", deretter bildene som 16-bit RGB.
async function decodePiped(helper, lib, file, out, ctx, ffmpegBin) {
  const dec = spawn(helper, [lib, file], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let decLog = '';
  dec.stderr.on('data', (d) => (decLog = (decLog + d).slice(-2000)));
  const decDone = new Promise((r) => dec.on('close', r));
  const header = await new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const nl = buf.indexOf(10);
      if (nl < 0) return;
      dec.stdout.off('data', onData);
      dec.stdout.pause();
      resolve({ line: buf.subarray(0, nl).toString(), rest: buf.subarray(nl + 1) });
    };
    dec.stdout.on('data', onData);
    dec.on('error', reject);
    dec.on('close', (code) => reject(new Error(`Blackmagic RAW decoding failed: ${decLog.trim().split('\n').pop() || code}`)));
  });
  const [w, h, fps, frames] = header.line.trim().split(/\s+/).map(Number);
  let done = 0;
  const frameBytes = w * h * 6;
  await runTool(ffmpegBin, ['-hide_banner', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuv444p10le', out], ctx, (proc) => {
    ctx.setCancel(() => (dec.kill(), proc.kill()));
    const progress = throttled(ctx);
    const count = (n) => frames && progress(Math.min(1, (done += n) / frameBytes / frames));
    proc.stdin.write(header.rest);
    count(header.rest.length);
    dec.stdout.on('data', (d) => count(d.length));
    dec.stdout.pipe(proc.stdin);
    dec.stdout.resume();
  });
  // Stopper hjelperen underveis, er filen ufullstendig.
  const code = await decDone;
  if (code !== 0) {
    await fs.promises.unlink(out).catch(() => {});
    throw new Error(`Blackmagic RAW decoding failed: ${decLog.trim().split('\n').pop() || code}`);
  }
}

// Brukeren peker på verktøyet selv. Gir stien, eller null om dialogen ble avbrutt.
async function locate(id, parent) {
  const r = await dialog.showOpenDialog(parent, { title: `Locate ${TOOLS[id].exe}`, properties: ['openFile', ...(mac ? ['treatPackageAsDirectory'] : [])] });
  if (r.canceled || !r.filePaths[0]) return null;
  let file = r.filePaths[0];
  // Et .app-valg på Mac: verktøyet ligger inne i pakken.
  if (mac && file.endsWith('.app')) file = path.join(file, 'Contents', 'MacOS', TOOLS[id].exe);
  // Peker brukeren på en fil inne i rammeverket, brukes rammeverket.
  const fw = file.indexOf('BlackmagicRawAPI.framework');
  if (id === 'braw' && fw >= 0) file = file.slice(0, fw + 'BlackmagicRawAPI.framework'.length);
  const all = chosen();
  all[id] = file;
  await fs.promises.writeFile(settingsFile(), JSON.stringify(all, null, 2));
  return file;
}

module.exports = { TOOLS, toolFor, findTool, decode, locate };
