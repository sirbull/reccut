# HDR feasibility study

Run from the repository root with the normal Electron dependency and Reccut's FFmpeg installed:

```sh
node scripts/hdr-spike.cjs --ffprobe /path/to/ffprobe --frames 12
```

On Windows x64, the matching ffprobe can be extracted from the exact checksum-pinned FFmpeg archive used by Reccut:

```sh
node scripts/hdr-spike.cjs --fetch-probe --frames 12
```

This optional flag downloads about 195 MB of tools into the disposable experiment directory, checks the archive SHA-256 and extracts only ffprobe. It does not install anything or download models. On other platforms, supply ffprobe yourself. Without ffprobe, encoded-file metadata is explicitly unverified.

The report defaults to `docs/hdr-spike-results.json`; `--out path.json` chooses another report. Each completed run is appended, preserving other platforms and earlier attempts. The console prints the temporary directory containing generated videos, raw float frames, a graphics PNG and a checkpoint report. Nothing in `src/`, the installed app, application preferences or user projects is changed. Temporary media is retained for inspection and is not checked in. Public reports redact temporary/workspace paths.

`latestValidatedRun` identifies the latest complete run with a secure renderer context. It means the experiment completed, not that HDR export, every individual test or release acceptance passed. Reference-math checks run with `node --test test/hdr-spike.test.mjs`.

The hidden test window loads a local HTML file, giving WebCodecs the same secure-context availability as Reccut's workers. HTTP requests from the window are blocked. The grade test uses a temporary esbuild transform to supply a Float32 source and RGBA16F framebuffer to the **existing, unchanged GLSL**; no source file is rewritten. A separate linear shader is its positive control.

T1 covers storage, transforms, alpha, clipping, blending, filters, text/shadows and ImageBitmap, as well as a physically linear blend control. T2 uses Mediabunny/VideoFrame and tests requested standard/extended tone mapping while reporting the mode actually granted. T3 independently generated PQ/HLG patches check FFmpeg conversion and float textures. HLG assumes a 1000-nit display, gamma 1.2, black 0: this assumption is required to express HLG in nits. The per-channel zscale HLG result and its explicit luminance-dependent correction are both reported. T5 also checks the encoded transfer-domain signal against the independent reference, so matching encode/decode errors cannot cancel undetected.

T5 checks HEVC, AV1, VP9 profile 2 and ProRes HQ/4444, color tags, bit depth and HEVC HDR10 static metadata. HEVC/AV1/VP9 use lossless coding; ProRes uses quality 1. These are codec feasibility checks, not quality measurements of production presets. Player compatibility, actual HDR display output and private YouTube upload remain manual checks.

T6 measures 1080p/2160p decode, five layers, readback, packing and encoding, including process startup. SDR and the numeric float16 experiment use Reccut's actual `drawFrame`; the WebGL candidate is a small linear RGBA16F alpha compositor. The five layers use the same synthetic image, without effects or motion. SDR uses x264 CRF18 ultrafast; HDR uses x265 lossless ultrafast. This is a short prototype comparison, not a prediction of finished-app performance. Each case gets a fresh window. Electron working-set samples exclude external FFmpeg memory and driver VRAM, so they cannot certify the full memory budget.

T7 inventories API/display capabilities; a hidden window cannot certify emitted nits. Results apply to the recorded OS, Chromium/Electron, graphics driver and FFmpeg build. Repeat the study on Mac/Linux and after renderer upgrades before claiming support there.
