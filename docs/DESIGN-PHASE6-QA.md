# Design phase 6: automatic suggestions

Verified 2026-11-03 on Apple M1 Pro, macOS, Electron 45.1.0. Scope: tasks 6.1, 6.2 and 6.3. Phase 7 and phase 8 remain unimplemented. Version remains 0.9.0; no public release was made.

## Result

Suggestions is available from the Design empty state, Templates and the Design menu/Quick Search. Analysis runs locally through a private instance of the existing Design preview player. It does not move Edit's playhead, change the frame selected in Video, or invoke the export worker during analysis.

Up to 60 distributed times and 120 distributed primary-clip starts are considered. Fade and transition windows are excluded. Scores combine Laplacian sharpness, exposure, luma contrast and opponent-channel colorfulness with exported weights. Visible camera adds 0.15. Up to six candidates are chosen with at least 5% of the sequence duration between them.

The grid combines these frames with four layouts suitable for the selected canvas ratio. Titles come from names, timeline titles, initial captions and frequent phrases with English/Norwegian stop words. Users can edit the title, select another candidate, change canvas size and shuffle layouts/titles. Clicking a card captures the original full-quality composite and adds its asset and editable design in one undo step. The full source crop remains `[0, 0, 1, 1]` and uses contain fitting.

AI is optional. An unconfigured provider has no AI button. A configured provider requires an explicit Send Transcript action after disclosure. Only caption text, capped at 12,000 characters, is included. Provider configuration is checked again before sending; a changed provider requires review. Failed or late requests cannot replace a newer project's results, and provider errors retain the offline suggestions.

## Automated verification

- `npm test`: **451 passed, 0 failed, 0 skipped**.
- `npm run build`: passed.
- `git diff --check`: passed.
- No npm dependencies or package versions changed.

New pure tests cover sharp/blurred checkerboards, black/white/gray/color frames, finite normalized metrics, 3-second/3-hour sampling bounds, 10,000 primary clips, fade/transition exclusion, camera visibility, hidden/audio-only recordings, candidate spacing, title priority/uniqueness/length, Norwegian phrases, template ratio selection and shuffle.

The async analysis has tests for the overall budget, decode failures and cancellation. Renderer service tests cover project/room changes, stale async completions, player disposal, explicit AI calls, provider changes, offline errors, no media paths in AI payloads, one-step creation/undo and failed capture without a partial design. Existing capture, crop, mask, template and player regression tests also pass.

Player snapshot tests specifically distinguish the remembered frame used for smooth scrubbing from a freshly decoded frame suitable for scoring. Existing playback and preview-resolution behavior remains covered. The sampler fixes its own resolution and releases unused decoders promptly without changing normal player defaults or user preferences.

## Native Electron workflows

Development QA used temporary projects/profile under `/tmp/reccut-phase6/` and `/tmp/reccut-phase6-profile`. Its temporary launcher disabled only the recording keyboard hook. No system clipboard access was used. The production packaged check ran without that preload and used `--user-data-dir=/tmp/reccut-phase6-package-profile`.

| Case | Observed result |
|---|---|
| 3-second square video, 30 fps, Norwegian captions | 60/60 frames decoded, six candidates and 24 preview cards, about **2.00 s**. Offline Norwegian titles appeared; no AI button when unconfigured. |
| Selecting a shuffled suggestion | Captured a 600×600 source into a 1280×720 editable design, fit contain with the full crop. Timeline/media/primary order remained byte-equivalent. Undo removed the entire new design; redo restored it. |
| 3-hour video, one primary clip | 61/61 samples, six candidates, about **1.17 s**. |
| 3-hour sequence, 120 primary clips | 180/180 samples, six candidates, about **3.52 s**. |
| All-black video without captions or camera | 60/60 samples, all frame scores zero, six spaced candidates; about **1.10 s**. |
| Screen/camera recording, network offline | Six candidates, all marked camera-visible, no failed decodes; about **2.33 s**. |
| Fresh-frame check | Samples at 0.1 s and 2.5 s produced distinct pixel hashes; copies were 256×256. |
| Missing source file | No hang or stale preview; stopped at **14.005 s**, zero candidates, skipped-decode/time-limit feedback. |
| Rapid reopening, project switch, room switch | Closed/canceled the old session, discarded its late results, no recorded renderer errors. |
| AI disclosure and offline failure | Clicking Suggest Titles showed the named-provider disclosure with **zero calls**. Send Transcript made one deliberately failing QA IPC call; the error toast appeared and offline titles remained. No provider was contacted. |

The long source is a real 10,800-second H.264 test-pattern file, 256×144 at 1 fps, about 54 MiB. It was used both as one clip and as 120 trimmed clips. These figures demonstrate bounded work and seeking over a long source, not performance on arbitrary 4K/RAW or long-GOP material. Slow sources use the 14-second budget and may yield fewer candidates.

Preview cards and controls were visually inspected. Temporary screenshots and JSON measurements remain in `/tmp/reccut-phase6/` and are not application dependencies.

## Packaged application

Built a Mac ARM64 `.app` with Electron Builder using the project resource/signing configuration and `--mac --dir --publish never`. Ad-hoc signing succeeded. The app launched normally with an isolated profile, loaded the temporary source project, and produced all **24 suggestion cards**. `window.qa` was undefined, and the unconfigured AI button was absent.

No DMG, notarization or release publication was performed. The existing ad-hoc-signing/entitlements warning remains part of the release environment. Windows/Linux/Intel Mac runtime checks and real remote-provider integration were not performed in this phase.

## Deliberate limits

- Work is capped at about 14 seconds; the algorithm returns usable partial results when decoding is slow. Fewer than six separated/decodable frames can produce fewer cards.
- Scoring is a visual heuristic, not semantic understanding of faces or the video's subject. A black-only source still produces black-frame layouts that can be edited.
- The private sampler uses the same preview/composite pipeline as Design; final capture uses original-quality export. Proxies and original sources can differ in detail.
- Closing cancels local analysis and pending frame capture. An AI request already sent through the existing completion API cannot be recalled; its late response is ignored after closing or switching projects.
- Native provider-error tests used isolated IPC stubs. No caption text was sent to an external service during development.
