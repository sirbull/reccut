# Design redesign: Phase A QA

Validated on macOS on 2026-11-03. This report covers Phase A of [DESIGN-REDESIGN.md](DESIGN-REDESIGN.md), building on the completed original Design-room implementation. The app version remains 0.9.0; this work is not a published release.

## Automated validation

- `npm test`: 480 tests pass, zero failures or skips.
- `npm run build`: passes, including the normal renderer and help bundles.
- `git diff --check`: passes.
- `electron-builder --mac --dir --publish never`: passes. The packaged arm64 app opens the temporary project, switches to Design and renders the five panels, page strip, export control and image canvas. No QA global is present. The final layout was also visually inspected.
- Fourteen additional regression tests cover panel preference migration, search, transient previews, history separation, targeted styles, stale image previews and drags, locked foreground drop targets, color undo, source aspect ratio and drop position, first-design frame capture, friendly image names and cutout completion after navigation.

## Native app checks

The development app was started with `npm start`, using an isolated temporary profile and project. Native menus and file dialogs used queued local test choices. Pointer, keyboard and HTML drag-and-drop events ran in Electron. Temporary QA globals were used for setup and inspection and are absent from the production build.

| Area | Result |
|---|---|
| Empty room | Template hover shows a temporary canvas, creates no design and changes no history. Leaving restores the empty room. Double-click creates exactly one design. A video frame can create the first design in one undo step. |
| Panels | Default Templates, one open panel, expand to 560 px, close and rail toggle work. Brand and expanded width survive a reload. |
| Sections | See All replaces the sections with one grid, Back restores them, and search filters cards. A library with 500 saved styles renders a bounded row and pages of 24 cards. |
| Styles | Single click selects; Enter applies once and Undo restores the previous appearance. Saved styles can be saved, renamed, updated from the selection and deleted. |
| Preview isolation | Hover changes neither the project nor undo history. Preview paths never enter project data. Hover during inline text editing keeps the text editor active and does not commit its content. |
| Native image drag | A Recent card places one image at the canvas drop point, retaining the entire source and full crop rectangle. The preview clears after the drop. |
| Native style drag | A style dropped on one text layer changes that layer; another selected text layer retains its appearance. |
| Brand | Color apply and Undo restore the background. Choosing and applying a logo makes an independent project asset. Replacing the global logo cannot change that file. |
| Video | A square 600 by 600 frame remains square with contain placement in the thumbnail. Undo removes the newly created design without changing the timeline. Camera capture and background removal finish in the original design after navigating to another design. |
| Designs strip | Rename commits; Escape cancels a second rename. Duplicate creates an independent page. Delete confirms and can be undone. New Design and Export As open their dialogs. Quick Export as PNG writes a file successfully. Variants appear as pages. |
| Layout | Layers appears above Properties. At window widths 1100 and 1728 px, the expanded panel leaves a usable canvas with no room, toolbar or strip overflow. |

The existing source file import/conversion and layered import paths are reused. Images use contain placement; importing or capturing an image does not add an automatic crop. Design retains its own undo history and asset collection independently of Edit.

## Remaining phases

Phase B contains the new offline thumbnail content and global Search. Resize and Readability have already moved into the toolbar, but the warning dot remains part of Phase B. Phase C contains online providers, credits, image-source plugins, OAuth/MCP sign-in and the template catalog. No online source, account login or real provider request was exercised in Phase A.
