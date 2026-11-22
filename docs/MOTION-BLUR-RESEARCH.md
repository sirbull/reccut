# Motion blur: research, implementation and validation

Research date: 22 November 2026. This is an engineering assessment, not a claim that one algorithm wins on every video. The implementation uses original shaders; the papers below informed the design, and their implementations or model weights have not been copied into Reccut.

## What the two effects do

**Motion Blur** is an artistic spatial effect with Directional, Zoom and Spin variants. Amount sets the extent; angle or center and shutter bias determine the path. Numeric parameters support keyframes and expressions. It works on footage, still images and adjustment layers.

**Natural Motion Blur** estimates movement using the actual source frames around the current time and reconstructs intermediate samples during a centered exposure. Its controls are Amount and an optional Rolling shutter toggle, off by default. At 50%, the requested exposure is half a timeline frame, corresponding to 180°; at 100%, it is one frame, corresponding to 360°. Both halves are shortened at unavailable boundaries or rejected scene cuts. Source spacing expands for fast playback and exposure contracts for slow playback. This is additional simulated blur, not an estimate or replacement of the camera's existing shutter.

At 24 fps, 180° means approximately 1/48 second. At 30 fps it means 1/60 second. Amount controls time, rather than blending a sharp picture with a fixed blurred picture. This distinction makes the slider useful for sharp animation and fast-shutter footage.

## Methods assessed

| Method | Quality and performance considerations | Decision |
| --- | --- | --- |
| Directional/radial sampling of one frame | Fast and controllable; does not identify independently moving objects. | Use for the artistic effect. |
| Frame averaging, `tmix` or `tblend` | Cheap temporal accumulation, but separated input positions remain visible as doubled contours. Mixing display-encoded pixels also darkens bright trails. | Not used for Natural Motion Blur. |
| Velocity-buffer post processing | Efficient where reliable motion and often depth are available. A normal video does not contain those buffers. | Borrow the reconstruction idea, but estimate motion from video. |
| FFmpeg motion-compensated interpolation | Already available in the app; adaptive overlapped blocks, bidirectional estimation, variable block sizes and scene-cut detection are documented. Repeated full-resolution intermediate frames cost additional processing, and the block model can struggle around thin or crossing objects. | Useful baseline; not used as the interactive rendering pipeline. |
| Classical dense optical flow | No weights or model download. Pyramid search captures different motion scales; reliability and occlusion checks remain necessary. | Current local WebGL2 implementation. |
| RIFE intermediate-frame synthesis | Learned intermediate flow, arbitrary interpolation times and a practical native Vulkan implementation. Deployment entails verified weights, runtime binaries for each platform and extra inference per exposure sample. | Promising optional quality backend; not bundled or benchmarked here. |
| FILM | Designed for large motion using a learned multiscale network. Official implementation uses TensorFlow; the repository is archived. | Research reference, not an added app dependency. |
| Dedicated learned blur synthesis | Predicts blur directly from image pairs rather than repeatedly generating intermediate frames. Interesting quality/cost tradeoff, but deployment requires a separately verified model and evaluation. | Consider for a future trained backend, not represented as implemented. |

FFmpeg's options and their intended purposes are described in its [official filter documentation](https://ffmpeg.org/ffmpeg-filters.html#minterpolate). This assessment of integration cost is specific to Reccut's shared Canvas/WebGL preview and export renderer.

[McGuire et al., A Reconstruction Filter for Plausible Motion Blur](https://www.casual-effects.com/research/McGuire2012Blur/index.html) describes reconstruction from velocity-augmented rendered buffers. Its published GPU timing must not be treated as a timing for video motion estimation. [Guertin et al., A Fast and Stable Feature-Aware Motion Blur Filter](https://research.nvidia.com/publication/2013-11_fast-and-stable-feature-aware-motion-blur-filter) addresses artifacts involving fine features and overlapping motion. Neither supplies missing depth or hidden background detail for arbitrary footage.

[Kroeger et al., Fast Optical Flow using Dense Inverse Search](https://arxiv.org/abs/1603.03590) demonstrates the value of multiscale patch correspondence for efficient dense motion. Reccut's shader is a bounded patch-search implementation, not an implementation of DIS or a reproduction of its reported benchmark. [OpenCV's optical-flow documentation](https://docs.opencv.org/4.x/d2/d84/group__optflow.html) also exposes forward/backward checks and edge-preserving interpolation as robustness tools.

[Huang et al., Real-Time Intermediate Flow Estimation](https://arxiv.org/abs/2011.06294) estimates intermediate flow directly. The [Practical-RIFE repository](https://github.com/hzwer/Practical-RIFE) documents model variants, including work on animation and lower-cost models, and states the licensing of its linked contents. [rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan) provides native Windows/Linux/macOS executables with CPU/GPU selection. Those facts establish feasibility, not a measured quality advantage for this implementation or verified suitability of every third-party model conversion.

[Google's FILM implementation](https://github.com/google-research/frame-interpolation) and its [project page](https://film-net.github.io/) target interpolation with large motion. [Brooks and Barron, Learning to Synthesize Motion Blur](https://arxiv.org/abs/1811.11745) investigates direct blur synthesis and evaluates against footage-derived blur. That work supports testing against actual exposure integration, rather than judging only whether an output appears softer.

The [OCAI paper](https://arxiv.org/abs/2403.18092) uses occlusion awareness and forward/backward consistency for interpolation. Reccut uses consistency as a conservative rejection signal; it does not implement OCAI's network, training method or forward-warp hole filling.

## Current implementation

1. Decode a small window of owned source-frame snapshots. Cache at most six snapshots per active reader, with in-flight/result references bounded separately. Read timestamps and durations from decoded samples; never use the previously displayed frame as the authoritative neighbor. This makes paused seeking and still export reproducible.
2. Build source texture pyramids and search coarse to fine. The finest motion field is at most 640 pixels on its longest side; output color remains at the requested source resolution. Estimate current→previous, previous→current, current→next and next→current independently.
3. Test thumbnail histogram change together with spatial difference for obvious cuts. Apply per-pixel photometric checks, forward/backward consistency and image-bound checks to reduce unreliable trails. Where reconstruction is uncertain, prefer the current picture.
4. Reconstruct 32 shutter samples using both directions and integrate their colors in linear light. Interpolate premultiplied coverage so transparent objects retain their color at soft edges. Process neighbors through preceding non-temporal stack effects, so the reconstruction does not mix graded and ungraded pictures.
5. Keep preview and export on the same effect code. Reduced preview dimensions reduce effect work; spatial lengths scale with source pixel scale. Export owns full-resolution snapshots and also supports formats decoded through the existing FFmpeg reader.

The current natural effect requires WebGL2 and floating-point render targets. The inspector reports missing support; export fails explicitly rather than silently substituting frame blending. Spatial Motion Blur has a CPU fallback. No inference weights, extra dependencies, downloads or external video services were introduced.

### Optional rolling shutter

Rolling-shutter sensors acquire horizontal scanlines at different times, rather than sharing one global exposure center; see [Meilland et al., A Unified Rolling Shutter and Motion Blur Model for 3D Visual Registration](https://www.cv-foundation.org/openaccess/content_iccv_2013/papers/Meilland_A_Unified_Rolling_2013_ICCV_paper.pdf). Reccut simulates this acquisition pattern; it does not infer a real sensor's readout time or repair existing distortion.

With the toggle enabled, the center of each row's shutter interval is shifted by `(row - 0.5) × exposure / 2`, where row runs from 0 at the top to 1 at the bottom. Thus the readout span is half the selected exposure duration and the middle row retains its timing. The amount slider scales both exposure and readout, and zero still bypasses the effect. Playback direction is respected, including export through a reversed source copy. These timing choices are fixed design assumptions for a simple toggle, not measured camera calibration.

The original global-shutter sample schedule is unchanged when disabled, including for older projects without the new property. Both modes reuse the same motion field, masks, confidence and scene-cut checks; changing the toggle does not require additional frame decoding or flow estimation.

## Masks

Each mask can target clip visibility or one particular blur effect instance. Existing masks continue to control visibility. An effect mask blends the processed and original pictures without removing the rest of the source. Mask shape, feather, expansion, opacity, inversion and animation use the existing mask system.

For a protected foreground subject, target the blur effect and invert the mask. Spatial sampling excludes protected pixels and renormalizes the remaining samples, avoiding foreground color streaks in the background. Temporal reconstruction also considers the protected region at the current endpoint. This is not background inpainting: masking cannot recover background hidden by the subject in every available frame.

## Measurements and checks

Environment: Apple M1 Pro, Electron 45, Chromium WebGL2. Timings vary with GPU load and shader warm-up; they are indicative measurements, not portable frame-rate promises.

- Synthetic 320×180 motion: static-region mean absolute error 0; stationary-frame maximum difference 0; obvious-cut maximum difference 0 (8-bit channels).
- Against a 64-subframe reference of a translated rectangle and its internal stripe at 180°: natural mean absolute RGB error approximately **0.481**, versus **1.090** for the sharp input. This tests a known simple motion, not general cinema or anime quality.
- Representative full 1920×1080 render, including a new flow field and readback: approximately **58–82 ms** in local runs. Full-resolution processing is therefore not guaranteed real time. Reducing preview resolution or pre-rendering a timeline area is useful.
- H.264 source integration: paused preview and worker-exported PNG matched exactly (**mean 0, maximum 0**), including seeking away and back. Playback advanced normally. A generated 60-frame 320×180 sequence exported in approximately **0.8 seconds** in one local run, including decoding and encoding. The existing website reel was also tested after conversion to the same 320×180 test format: exact preview/PNG agreement and approximately **1.05 seconds** for the 60-frame export. These low-resolution checks are not a full-resolution footage quality benchmark.
- Separate checks cover Directional/Zoom/Spin, amount bypass, transparent streak color, masks, source offsets, trim boundaries, reverse and freeze plans, animated amount, cache reuse and bounds, scene cuts, and scaled export agreement.

Run the reproducible checks with:

```sh
node --test test/motion-blur.test.mjs
node scripts/test-motion-blur.cjs
npm run build
node scripts/test-motion-blur-source.cjs
node scripts/test-motion-blur-source.cjs docs/media/reel.mp4
```

## Quality limits and further evaluation

Sparse video samples do not uniquely specify what happened between frames. Fast rotations, motion reversals within a frame, crossings, disocclusion, hair, repeated textures, flashes, transparency and large deformation remain difficult. Analysis at reduced resolution can miss thin motion. Confidence rejection trades some blur strength for fewer artifacts. Held animation poses remain ambiguous: duplicated frames do not reveal when an unseen in-between pose should occur.

The current tests establish correctness on controlled motion and consistency of the app's preview/export paths. They do **not** establish superiority to RIFE, FILM, proprietary optical-flow effects or a physically rendered ground truth across all footage. Further backend selection should use the same sharp/high-frame-rate sources, matching shutter intervals, frame-by-frame boundary inspection, flicker checks, masked-subject tests and timings on Windows, macOS and Linux GPUs. For especially demanding animation, a verified neural interpolation backend is a reasonable next comparison; its quality and total shutter-sampling cost should be measured before adoption.
