# Design phases 4 and 5 — verification

Date: 2026-11-03. Scope: tasks 4.1–4.4, 5.1–5.4 and model prerequisites 0.1–0.2. Phases 6+ remain unimplemented. This is a development verification, not a published release. App version stays 0.9.0.

## Automated checks

`npm test`: **432 passed, 0 failed, 0 skipped**. `npm run build` and `git diff --check` passed. No new npm dependencies.

New coverage includes alpha dilation/erosion against a reference, outside borders and narrow inputs; inverse brush coordinates for rotation/flips/crop/contain/cover/stretch; clipping order and hidden/orphan bases; mask bounds; camera-only snapshots without timeline mutations; cancellation and early completion races; cleanup with undo/redo/snapshots/neighboring projects; template validation, placeholders, anchors and bounds; style extraction/application; native library persistence and logo copies; macOS model-data signing classification.

Every one of the 22 templates is applied to wide, tall, square and 3000×3000 canvases. Validation rejects newer versions, external/project image paths, excessive layer counts and decorations over 1 MB. Unknown layers are skipped with a warning.

## Native Electron checks

Test machine: Apple M1 Pro, macOS, Electron 45.1.0. Development QA used an isolated temporary userData directory and temporary project. The recording keyboard hook was disabled only in the temporary development QA launcher. Tests did not read or write the system clipboard. The final packaged app ran normally without that development preload.

- Remove Background generated independent full-source-size PNG masks. Person, product, code, landscape and already-transparent inputs completed. A 1×1 PNG and a 12000×100 PNG also completed and retained their original dimensions in the mask assets.
- Cut Out Camera captured the complete 600×400 camera stream from a recording with a circular PiP layout. The independent source and cutout PNGs were 600×400; serialized timeline clips, primary order and media stayed identical.
- Erase reduced a foreground pixel from alpha 254 to 0. Restore returned alpha to 255. Each saved stroke produced a different mask asset. Undo/redo restored the previous/new asset IDs.
- Actual pointer painting on an image rotated 30°, flipped in both directions and cropped to 80% landed at the selected source pixel (alpha 254 to 0).
- Tiny Canvas 2D checks verified clipping groups apply base opacity once (blue alpha 128), outside alpha 0, hidden/orphan groups invisible, mask inversion and white outlines outside the final visible edge.
- PNG export with 10 px white outline, feather, contracted edge and a spread shadow matched an uncached render at the same size: maximum channel difference **0**.
- Fill Text With Image created an adjacent text/image clipping group with matching geometry. Undo restored the original order.
- A saved style persisted; applying a built-in style and undo restored the previous appearance. With 500 saved styles the panel rendered only 24 saved cards plus the 15 built-ins and refused number 501.
- Template creation resolved the current cutout and project title. Saving two templates with the same name preserved both and suffixed the second with `2`.
- Native template import/export worked. Non-JSON and version 2 files were refused with clear messages. Styles and template panels were inspected visually, with no recorded renderer errors during the successful workflow.
- My Colors deduplicated and stopped at 20. My Logo was copied into the project on template application. Replacing the global logo left the earlier project copy readable.

Temporary screenshots, input fixtures and machine-readable measurements were kept under `/tmp/reccut-phase4/`; they are not required by the app or committed as product assets.

## Model selection and reproducibility

Weights must allow commercial redistribution. Candidates were checked against their source model cards/licenses:

| Candidate | License | Outcome |
|---|---|---|
| [onnx-community/BiRefNet_lite-ONNX](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) | MIT | Original WebGPU graph exceeded this GPU's storage-buffer limit (11 required, 10 available); both attempted precisions failed before inference. |
| [jiabins0303/birefnet-lite-1024-webgpu](https://huggingface.co/jiabins0303/birefnet-lite-1024-webgpu) | MIT | Chosen primary, patched WebGPU export, FP16 weights 114,834,127 bytes. |
| [studioludens/birefnet-lite-512](https://huggingface.co/studioludens/birefnet-lite-512) | MIT | Chosen general-purpose CPU fallback, FP32 weights 191,877,254 bytes. |
| [onnx-community/ISNet-ONNX](https://huggingface.co/onnx-community/ISNet-ONNX) | AGPL-3.0 | Excluded under the plan's permitted-license rule; not run or shipped. |
| [Xenova/modnet](https://huggingface.co/Xenova/modnet) | Apache-2.0 | Portrait-only alternative benchmarked on five inputs; not shipped because a general-purpose fallback was available. |

Pinned revisions, URLs and SHA-256 of every shipped model/config/license file are in `src/main/designModels.js`. `scripts/fetch-models.mjs` validates existing files and downloads atomically when absent or invalid. The chosen model files add about **293 MiB** before compression; no unused fallback FP16 weights are packaged. Licenses and model cards accompany the weights. Remote loading and browser/custom model caches are disabled.

### Measurements

Primary 1024 model, WebGPU, max source side 1024. Times are milliseconds; inference includes preprocessing/postprocessing. Loading and inference are separate, so first-click wall time is their sum plus image/mask file I/O.

| Input | Model load | Inference |
|---|---:|---:|
| Person | 4770 | 3449 |
| Product | 3886, after worker reload | 2859 |
| Code | cached, <1 | 2444 |
| Landscape | cached, <1 | 2349 |
| Transparent PNG | cached, 5 | 2310 |

The first cold run was slower: approximately 5.18 seconds load plus 5.37 seconds inference. MODNet CPU inference ranged from 0.97 to 1.55 seconds, but it is portrait-specific. General-purpose 512 CPU fallback measured 2.69 seconds load plus 6.43 seconds inference on the person image. Thus the approximate five-second goal is met by warm primary inference on this machine; it is **not** a guarantee for first use or CPU fallback.

Qualitative primary-model ratings (subjective, 1 poor to 5 good): person **4**, product **4**, code **2**, landscape **2**, transparent fixture **4**. The person and product results were usable, including the presenter's head and camera body. Code extracted individual glyphs while the landscape kept mountains/forest but removed much of the water; neither has an unambiguous intended foreground. Manual Erase/Restore remains necessary for such inputs. The transparent fixture retained its main subject. No ground-truth masks or objective segmentation accuracy scores were available. MODNet was benchmarked for execution/timing rather than given a complete visual-quality score matrix; its speed alone did not justify using a portrait-only model for all images.

## Offline and packaged application

Built an ARM64 `.app` using the same Electron Builder configuration/resources as `dist:mac`, with `--mac --dir --publish never`. Checked both model resource directories and the local ORT modules/WASM files; all 10 packaged model/config/license files matched their pinned SHA-256 values. The macOS signer's binary-file detector crashed while parsing large ONNX protobuf data; the beforePack hook classifies only `Contents/Resources/models/**/*.onnx` as data. Mach-O executables/native modules still go through normal signing. Ad-hoc signing succeeded.

Development: freshly reloaded segment worker with CDP networking offline and HTTP(S) blocked completed the person image, 3880 ms load + 2828 ms inference, **zero remote requests**.

Final packaged app: `app.isPackaged === true`; resource root was `Reccut.app/Contents/Resources`. A freshly reloaded worker with networking offline completed the same image using the bundled primary model: 3608 ms load + 2818 ms inference, 1024×683 mask, **zero remote requests**. With WebGPU unavailable, the same packaged offline app loaded the bundled 512 CPU fallback: 2301 ms load + 6273 ms inference, 1024×683 mask. Production bundle has no `window.qa` helper.

## Remaining limits

- Windows/Linux and Intel Mac runtime/GPU behavior have not been exercised here. Automatic fallback and local model files are implemented, but cross-platform release QA remains necessary.
- No DMG installer, notarization, signed public release or GitHub publication was performed. The existing ad-hoc-signing environment warning remains; this work did not change release identity/entitlements.
- Cancellation races and generated-file cleanup have deterministic automated coverage. Not every cancellation permutation was repeated through native mouse interaction.
- Shape-mask point handling and style rename/update/delete are implemented; their complete native mouse/keyboard interaction matrix has not been exhaustively repeated. Pixel compositing and the principal workflows above were tested natively.
- Cleanup is conservative: masks referenced by persistent autosave snapshots or another project are retained. Unreadable neighboring references defer cleanup rather than risk deleting assets.
- No automatic frame/title suggestions, feed previews or later-phase features are included.
