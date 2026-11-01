# Reccut handbook implementation plan

The handbook is English, bundled with the application and readable without an internet connection. Help → Reccut Help and F1 open a separate, reusable window so the reader can follow instructions while editing.

## Delivery and acceptance criteria

1. **Inventory and audit.** Map the command registry, recording controls, editor inspectors, media import, AI and plugins, settings and export controls to articles. Check claims against source; distinguish implemented features from limitations.
2. **Handbook window.** Add a dedicated Electron window with a restricted preload. Repeated requests reuse it. Preserve editor state. Forward only explicit command-button actions to the main application. Keep keyboard editing in Help from changing the timeline.
3. **Navigation and search.** Full-text offline search over titles, summaries, keywords, headings and body text; ranked results and matching excerpts; chapter navigation, back/forward, article contents, related articles, image enlargement and keyboard access. Derive command and shortcut references from the live registry, including custom shortcuts.
4. **Content.** Retain and audit the illustrated reference. Add an end-to-end first edit, cloud and local AI setup, agent recipes and troubleshooting, plugin workflows, recording permissions and recovery, sequence formats, animation examples, captions, advanced export, tasks and terminology. Include prerequisites, numbered actions, expected results and recovery advice.
5. **Visuals.** Use existing real application screenshots and add reproducible captures of the actual AI settings, chat, plugins and handbook. Captures must use a disposable profile and fictional data; never real keys or projects. Clearly caption explanatory diagrams as diagrams.
6. **Verification.** Validate unique IDs, related links, command references and every image; test search for real user questions, local-server terms and multiword queries. Exercise window reuse, IPC boundaries, search/navigation, custom shortcuts, command handoff and images in Electron. Run the production build and existing tests.

## Coverage map

| Area | Guides / reference |
| --- | --- |
| Start, projects, saving | welcome, first-edit, projects, sequence-settings, history, package, updates |
| Recording | recording, recording-setup, recording-recovery, recording-edit |
| Import and media | import, browser, optimize, hdr, layers, offline, sync |
| Timeline and tools | editing, timeline, selection-clipboard, tools, adding, cutting, trimming, enable, colors, grouping, range, markers, playback, skimming |
| Inspector, animation, speed | inspector, keyframes, animation-recipe, speed, stabilize, paste-attributes |
| Text and compositing | titles, lower-thirds, templates, captions, caption-workflow, masks, redact, effects, keying, creative-reference |
| Audio | audio, audio-effects, audio-reference, audio-recipe, sync |
| Colour | color, hdr, video-scopes, effect-reference |
| AI | ai-plugins, ai-setup, ai-local, ai-recipes, ai-troubleshooting |
| Plugins and processors | plugins-guide, processor-guide, ai-plugins |
| Export | export, export-settings, export-formats, export-recipes, background-tasks |
| Reference | preferences, shortcuts, command-reference, effect-reference, glossary, troubleshooting, search |

## Maintenance

Article data lives in `src/renderer/help/`. The editor, AI help tool and handbook read the same article collection. Built-in effect/format catalogues and the command list are generated from application definitions. `npm run test:help` checks handbook content and exercises the window in a disposable Electron session; `npm run help:screenshots` refreshes the new illustrative UI captures. Add a guide or update the coverage map whenever a user-facing feature changes. Source-based inventory and automatic link checks catch drift, but do not replace editorial review of each new feature.

## Progress

- [x] Initial inventory: existing English article collection and 27 application screenshots; Help was an editor modal at the start of this work.
- [x] Separate Help window and navigation; restricted preload, window reuse and explicit command handoff.
- [x] Expanded workflows and searchable reference catalogues: 74 guides, 149 live commands, all built-in audio effects/controls, visual effects, creative presets and export formats.
- [x] Five new screenshots from real application components/Help in a disposable profile, with fictional configuration; visual review completed. Existing 27 screenshots retained.
- [x] Content/link/image checks, search cases, IPC boundaries and Electron navigation, command, custom-shortcut and image interaction checks. Initial full suite: 243 passed.

This is a living plan. Completion of an implementation pass does not imply every future feature is documented; the coverage map and checks are the review checklist for subsequent releases.

## Validation limits and next editorial pass

The Electron interaction checks run on macOS in this workspace. Windows-native window/menu behaviour still needs a Windows run before a release. AI screenshots and connection walkthroughs use fictional settings; the documentation checks do not call a paid provider or launch an actual local language model. Older screenshots are useful illustrations but should be refreshed when their panels change. Treat individual feature changes as documentation work: verify the instructions with a real practice project, capture new UI where needed, and keep examples aligned with the shipped release.
