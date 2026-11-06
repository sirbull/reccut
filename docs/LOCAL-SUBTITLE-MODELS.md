# Local subtitle models

Settings → AI begins with **LOCAL SUBTITLE MODELS**. Install optional models with
**Manage Models**, then select an installed model. The same selection is used by
the Captions tab and the agent's local transcription tool. Cloud assistant
providers, API keys and image settings are separate and unchanged.

## Existing implementation and integration

Reccut uses Electron, Preact and Transformers.js 4 with ONNX Runtime Web in a
hidden transcription BrowserWindow. This was **not** whisper.cpp/GGML or
Faster-Whisper. Previously `base` and `small` mapped to ONNX Community's
`whisper-base_timestamped` and `whisper-small_timestamped` repositories, with
first-use downloads into SHA-1 URL-keyed files under `userData/models`.
Despite the original feature brief, the repository did not bundle Whisper.
Build preparation now bundles only the existing default **Whisper Base**. No
model download is triggered by startup, selection, or transcription.

The existing job queue, FFmpeg mono 16 kHz decode, word alignment, measured
pauses and phrase grouping are reused. Only installed files can reach the
transcription worker. Remote loading is disabled in Transformers.js and the
worker's CSP does not permit HTTPS. Output remains `{segments, words, pauses}`;
caption clips, undo, style, project format and SRT/VTT/export are unchanged.
Sources are mixed into timeline seconds before inference, including clip trims,
stream offsets, constant speed, reverse and speed ramps. Resampling for speed
changes follows source timing; it does not preserve pitch. This can affect
recognition of heavily time-stretched audio.

## Catalog and sizes

`src/main/subtitleCatalog.js` pins repository commit revisions, file sizes and
SHA-256 hashes. These are **Q8 ONNX** packages, not the standard GGML files in the
feature brief. Exact package sizes include tokenizer/configuration files:

| Model | Bytes | Approximate download | Minimum system RAM |
| --- | ---: | ---: | ---: |
| Whisper Tiny | 45,217,324 | 45 MB | 2 GB |
| Whisper Base (default, protected) | 81,261,885 | 81 MB | 3 GB |
| Whisper Small (general-purpose recommendation) | 253,426,306 | 253 MB | 4 GB |
| Whisper Medium | 991,556,562 | 992 MB | 8 GB |
| Whisper Large V3 Turbo | 1,089,270,226 | 1.09 GB | 12 GB |

All support Norwegian and automatic language detection. The language-code lists
come from each pinned `generation_config.json` (`lang_to_id`). Requests always
use `task: 'transcribe'`, never silent translation. Speed/quality labels and RAM
thresholds are conservative estimates, not comparable benchmarks or guarantees.

New installations use the tested portable CPU/WebAssembly Q8 backend on
macOS/Windows/Linux x64 or arm64. There is no new native CUDA/Metal dependency.
Verified older fp32 encoder/Q4 decoder cache installations retain their existing
WebGPU backend when a working adapter is available, with CPU fallback when its
Q8 files are installed. No acceleration weights are downloaded implicitly. A
packaged CPU Base is always the safe default. The manager does not copy/delete
unrelated model caches.

### Investigated and excluded

* **Whisper Large V3:** a matching public
  `onnx-community/whisper-large-v3_timestamped` export was not available during
  implementation. Other exports cannot simply replace cross-attention-enabled
  decoder files. Full Large V3 stays out until a pinned, word-timestamp-capable
  export has been validated with this runtime and its memory limits.
* **NB-Whisper Small/Medium/Large:** the official NbAiLab repositories provide
  PyTorch/Flax/CTranslate2/GGML files, but no complete timestamp-enabled ONNX Q8
  package matching this worker. Loading those weights in ONNX Runtime would fail.
  A future implementation needs a verified ONNX export including alignment
  heads/cross-attention, or a separately packaged and tested whisper.cpp or
  CTranslate2 backend. The official models are Apache-2.0. Norwegian specialization
  alone is not enough to expose an unsupported download.
* **NVIDIA Parakeet TDT V3:** a FastConformer/TDT model, not a Whisper checkpoint.
  It needs a compatible TDT decoder, audio preprocessing and timestamp adapter
  plus cross-platform runtime tests. No such backend is shipped here. NVIDIA's
  CC-BY-4.0 model supports Bulgarian, Croatian, Czech, Danish, Dutch, English,
  Estonian, Finnish, French, German, Greek, Hungarian, Italian, Latvian,
  Lithuanian, Maltese, Polish, Portuguese, Romanian, Russian, Slovak, Slovenian,
  Spanish, Swedish and Ukrainian. **Norwegian is not supported.**

## Storage and lifecycle

Downloaded models live at `app.getPath('userData')/subtitle-models/<model-id>`;
platform conventions are supplied by Electron. The JSON manifest contains ID,
display name, family, exact revision, backend/profile, path, expected/installed
bytes, status, source and integrity records. Only catalog-derived paths are used;
manifest paths never authorize filesystem access. Startup rehashes installations,
recovers complete directories and removes abandoned `.staging-*` downloads.
Missing/corrupt active models fall back to the verified default without a download.
Existing valid CPU or GPU Whisper Base/Small caches are discovered by their exact
historical URL keys and hashes, without duplicating weights.

Downloads stream to a staging directory. Sizes and SHA-256 are checked before an
atomic directory rename. Two transfers may run at once; each model has one
transfer, three bounded attempts per file, a 30-second inactivity timeout, disk
space reservations and 64 MB headroom. Progress includes actual bytes, percentage
and average transfer speed. Cancellation and graceful shutdown abort network work
and remove partial files. Abrupt termination is recovered on next launch.

Deleting an optional model requires a native confirmation with actual installed
bytes. The active model must be switched first, and queued/running transcription
leases prevent deletion. Cached inference memory is released on idle selection or
deletion; changing models also disposes the previous pipeline. Cancellation
destroys the transcription worker to interrupt inference immediately.

## Attribution and sources

Whisper code and weights are MIT licensed, Copyright OpenAI. The complete notice
is included in `assets/licenses/whisper-MIT.txt` and copied into the app's build.
ONNX exports are maintained by ONNX Community/Hugging Face; no repository scripts
are downloaded or executed. Transformers.js is Apache-2.0; ONNX Runtime is MIT.

* [Whisper license](https://github.com/openai/whisper/blob/main/LICENSE)
* [Tiny timestamped](https://huggingface.co/onnx-community/whisper-tiny_timestamped)
* [Base timestamped](https://huggingface.co/onnx-community/whisper-base_timestamped)
* [Small timestamped](https://huggingface.co/onnx-community/whisper-small_timestamped)
* [Medium timestamped](https://huggingface.co/onnx-community/whisper-medium_timestamped)
* [Turbo timestamped](https://huggingface.co/onnx-community/whisper-large-v3-turbo_timestamped)
* [NB-Whisper Small](https://huggingface.co/NbAiLab/nb-whisper-small)
* [Parakeet TDT V3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)

## Build and validation

`npm install` / the existing distribution model-fetch step now also runs
`scripts/fetch-subtitle-model.mjs`, which fetches **only Base**, checks every hash
and reuses an existing verified installation. `npm start` never downloads models;
source checkouts without prepared Base show an explicit install prompt.

```
npm run build
node --test test/subtitle-models.test.mjs test/subtitle-timing.test.mjs
npm test
node scripts/test-subtitle-models.cjs --model=whisper-base
```

An explicit optional-model integration run can use
`--download-optional --model=whisper-tiny --model=whisper-small` (and other catalog
IDs). It runs the actual Electron app and worker in an isolated temporary profile,
checks Settings order, model installation/selection, actual local speech output,
word/segment timestamps, a nonzero timeline offset, no inference network access,
and unchanged assistant configuration. It prints the profile/screenshot path.
The sample WAV is synthetic English speech: “Hello everyone. Welcome to this
short local subtitle test.” It contains no private recording.

Unit tests cover pinning, bundled/cache discovery, progress, duplicate prevention,
cancellation, interrupted startup, shutdown, failed downloads/retries, integrity,
atomic installation, multiple models, selection/persistence, missing/corrupt
recovery, offline file access, leases, safe deletion, disk space, hardware gates,
timeline trims/offsets/speed/ramps/reverse and old-project/SRT/VTT compatibility.
Cross-platform device validation still requires Windows/Linux release hardware.

### Results from this implementation

* `npm run build`: passed.
* All **21 new unit tests** passed, including cancellation during an actual
  streaming transfer, network timeouts, forged/corrupt manifests, concurrent
  deletion/selection/acquisition, legacy GPU discovery and packaged CPU fallback.
* Actual Electron/ONNX Runtime Web transcription passed for **all five catalog
  models** on macOS arm64. The synthetic sample produced recognizable speech,
  word and phrase timestamps and the expected nonzero timeline offset. Inference
  made zero HTTP(S) requests.
* A final Electron run passed the real renderer Delete action, cancelled and
  accepted native confirmation paths, storage reclamation, default protection,
  interruption of a running transcription worker and unchanged assistant config.
* Full suite: **632 tests, 629 passed, 3 failed**. The same three failures were
  reproduced against an isolated, untouched `HEAD` checkout: the offline design
  library element-count assertion, Design/Edit undo isolation and hover-preview
  reference identity. They are outside the subtitle implementation.

### Changed files

* Main process: `src/main/subtitleCatalog.js`, `src/main/subtitleModels.js`,
  `src/main/main.js`, `src/main/jobs.js`, `src/main/preload.js`.
* Settings/caption UI: `src/renderer/SubtitleModels.jsx`,
  `src/renderer/subtitleModels.js`, `src/renderer/styles/subtitle-models.css`,
  `src/renderer/Settings.jsx`, `src/renderer/editor/Browser.jsx`,
  `src/renderer/agent.js`.
* Existing transcription/timing: `src/worker/transcribe.js`,
  `src/worker/transcribe.html`, `src/shared/srt.js`,
  `src/shared/subtitleAudio.mjs`.
* Packaging: `package.json`, `scripts/build.mjs`, `scripts/fetch-models.mjs`,
  `scripts/fetch-subtitle-model.mjs`, `scripts/before-pack.cjs`,
  `assets/licenses/whisper-MIT.txt`.
* Tests: `test/subtitle-models.test.mjs`, `test/subtitle-timing.test.mjs`,
  `test/fixtures/subtitle-speech.wav`, `scripts/test-subtitle-models.cjs`.
* Documentation: this file, `src/renderer/help/articles.js`,
  `src/renderer/help/workflows.js`.

The application version is unchanged; this work does not create a release.
