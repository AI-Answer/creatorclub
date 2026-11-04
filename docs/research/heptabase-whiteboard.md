# Heptabase whiteboard research

Read-only inspection, 2026-11-03, of the supplied extracted Electron renderer at `/tmp/hepta/extract/build`. No Heptabase files or live boards were changed. These are shipped-code observations, not a claim of runtime parity. The REA directory analyzer timed out (20 second budget; evidence `ev_9b6ce5a1f94084075656d5e54f1c0f26c2726728d2492e523862a2dfa839fd81`); focused text inspection of the actual JavaScript/CSS supplied the findings below.

## Motion and selection

`assets/useChangeAppTheme-lf6Qihjj.js`, functions `jPt`, `MPt`, `NPt`, `PPt`:

- Trackpad mode: unmodified wheel translates offset by `(-deltaX, -deltaY)`. Shift-wheel translates horizontally. Ctrl-wheel (browser pinch) and Meta-wheel zoom around the cursor. Mouse navigation is a separate preference and can make unmodified wheel zoom.
- Zoom transforms keep the board point under the cursor fixed: offset is adjusted by `(cursor - offset - canvasOrigin) * (1 - nextZoom/currentZoom)`.
- `jPt` caps the wheel delta, adjusts current zoom by `-delta/100`, adds a logarithmic correction above 100%, then clamps. The reconstruction uses an exponential wheel curve for smoother high-resolution input, with the same cursor anchor and navigation model.
- `onPinch` uses the zoom captured at the start multiplied by gesture scale; changes zoom and offset directly in whiteboard state stores.
- Space temporarily switches to grab; release restores the previous tool. Drag binding supports multiple pointer buttons, disables pointer-key dragging and filters taps.
- Object selection has `selectWhiteboardObjects`, `toggleSelectWhiteboardObject` and a selection-box gesture. Title clicks select a section; the modifier path toggles its selection. The reconstruction supports Shift/Command-click on cards, empty-canvas marquee, Space/middle-button pan.
- `assets/MarkdownPreviewer-CFLG2Lck.js`, `m_`: general clamp defaults to max `2` (200%). Imported `Mn as da` resolves through `assets/uImageV-CkX-KoFe.js` to `y_ = Qt || platform.type === 'mobile' ? .1 : .02`: desktop minimum 2%, mobile/tablet minimum 10%. Focus/fit code may impose a different maximum (e.g. `.8` imported as `Na`).

## Colors and geometry

`assets/main-DCrId0Zf.css` contains theme definitions:

| Token | Light | Dark |
| --- | --- | --- |
| `--whiteboard-background` | `#eeeded` | `#191919` |
| `--whiteboard-grid-dot` | `rgba(0,0,0,.2)` | `rgba(255,255,255,.18)` |
| `--background-primary` | `#f7f7f7` | `#212121` |
| `--background-secondary` | `#fff` | `#242629` |
| `--middle-grey` | `rgba(0,0,0,.32)` | `rgba(255,255,255,.36)` |
| `--active-item` | `#207dff` | shared blue token |
| `--middle-transparent-blue` | `rgba(75,155,230,.2)` | shared translucent blue token |

`useChangeAppTheme-lf6Qihjj.js` card preview code uses `rounded-xl border-3`, `border-active` for selected/connected objects and subdued `border-middle-grey` for inactive synced cards. Its whiteboard preview container is separately layered from its chrome. The app uses small 14–18 px icon classes (`size-3.5`, `size-4.5`), 75 ms hover-border transitions, and 48 px application headers. Exact card-header dimensions vary by object kind; the reconstruction uses a 28 px hover/selection header, 23 px buttons, an 8 px card radius and a 2 px blue selection outline with a 6 px handle, based on those classes and the supplied visual description.

## Sections

`useChangeAppTheme-lf6Qihjj.js`, `KFt` and `qFt`:

- A section is its own sized rectangle, drawn behind cards with a border and subtly tinted fill. Selection enables resize handles.
- A title is a separate absolutely positioned chip, `rounded-md`, bold label text, 3 px margins, thin inset border, padded horizontally by 6 px. `wjt` adjusts chip transform/max width for current zoom and whether it sits inside another section.
- Section title click selects; double-click enters title editing. Enter or Escape blurs the title input. Moving/resizing snapshots its initial position/dimensions and begins an object resize operation.
- Sections carry `id`, `title`, `color`, `x`, `y`, `width`, `height`; object containment is tracked separately in Heptabase. Creator Compiler already persists `BoardFrame` with `id,title,x,y,w,h` in `board-canvas.json`, and has matching create/patch/delete API routes. Keeping that wire format supplies backward-compatible sections. Membership retains the existing client/server rule: a card's full top edge must be inside the rectangle. Moving a section moves its member cards; removing the section keeps its cards.

## Tools, minimap, shortcuts

`assets/checkIsEmptyCardContent-DBjm8c7M.js` tool enumeration includes `connect`, `select`, `search`, `createCard`, `createText`, `createSection`, `createSubWhiteboard`, `uploadFile`, plus mind map/journal/calendar tools. `useChangeAppTheme-lf6Qihjj.js` exposes a Minimap preference described as “Show a minimap of the whiteboard” (`toggleMinimap`), alongside grid snapping and focus mode. Its minimap preview is distinct from the navigation map; exact navigation-map width was not established statically. The reconstruction uses a 180×112 px navigation map, scaled card rectangles and a blue viewport box. Click/drag recentres; arrows navigate it.

Confirmed shipped shortcut labels: Zoom to fit **Shift+1**, zoom in **Cmd/Ctrl+↑**, zoom out **Cmd/Ctrl+↓**. Space grab and Enter/Escape section title handling are explicit in the event code. Delete/Backspace filtering excludes modified or Alt/Shift combinations (`eA`, `tA`). Other mappings below are reconstruction choices, preserving the existing app's connection shortcut:

| Action | Creator Compiler |
| --- | --- |
| Select tool / new card / section / text | V / N / S / T |
| Pan | two-finger scroll; Space-drag; middle-button drag |
| Zoom | pinch; Cmd/Ctrl-wheel; Cmd/Ctrl +/- or ↑/↓ |
| Reset zoom / fit board | Cmd/Ctrl+0 / Shift+1 |
| Select all / clear | Cmd/Ctrl+A / Escape |
| Extend selection | Shift/Command-click; Shift-marquee |
| Move selection | arrows (10 board px); Shift-arrows (40 px) |
| Connect cards | C on source, Enter on destination; connector tool; edge handle |
| Remove selection | Delete / Backspace, with existing Undo |
| Find on board | Cmd/Ctrl+F |

## Implementation boundaries

The reconstruction intentionally retains Creator Compiler's card bodies, markdown/files, research-to-video flow and Ask Claude companion. Board chrome wraps `TileBody`; it does not replace the outliner. Pan/zoom uses a single transformed canvas layer painted by requestAnimationFrame; card/section drags preview DOM transforms and save on release. React updates its view after 120 ms idle. The minimap viewport follows the same live view without rendering every card each frame. No dependencies were added.

No claim is made of complete Heptabase feature parity (nested section containment, touch-device manipulation, snap-to-grid, mind maps, or every configurable shortcut). The static source confirms the observations above; the screenshot description provided by Samin supplies the left-toolbar layout and selection-handle placement.

## Validation of the reconstruction

- Targeted suite: **69 passed, 0 failed** across `routes.test.ts`, `board-view.test.ts`, `board-geometry.test.ts`, `research.test.ts`, `board-tip.test.ts`, `board-notes.test.ts`, `workspace.test.ts`, and `server/club/research-board.test.ts`. This includes backward-compatible canvas/frame storage, Research-to-video, selection/connection regressions, sections drawn into a panned margin, and zoom/minimap math.
- `npx tsc --noEmit`: passed. No build, dependency install, full test suite, commit, or push was run.
- Headless installed Google Chrome against the existing `:4183` sandbox: Planning `cat` without a tab opened its own board; `jk` also opened its own distinct board. Verified scroll pan, Ctrl/pinch and Command-wheel zoom, Shift-click, Command-A, plain marquee, Space-drag, section grouping/drawing/rename/drag/resize, member-card movement, minimap click/drag, fit, fold/unfold, note sidebar, persisted arrow-key nudge, and reload. No page errors. Temporary test cards/sections were removed.
- Screenshots: `/tmp/cc-board-shots/planning-board-light.png`, `/tmp/cc-board-shots/planning-board-dark.png`, `/tmp/cc-board-shots/200-cards-dark.png`.
- 200-card load used intercepted GET responses, without writing 200 files. Over 119 sampled motion intervals: median **16.7 ms**, p95 **16.8 ms**, one interval over 25 ms; **0 tile DOM mutations**, one application React commit during the sample. Measurements: `/tmp/cc-board-shots/performance.json`. This is a headless browser sample, not a physical trackpad or universal frame-rate guarantee.
- Browser scripts: `/tmp/cc-board-browser.cjs`, `/tmp/cc-board-performance.cjs` (cached `puppeteer-core`, installed Chrome). Unit output: `/tmp/cc-board-tests.log`.

### Outliner integration

`Board.tsx` supplies the hover header around `TileBody`; its `.th` is hidden on the board to avoid duplicate chrome. Keep the body in `TileBody` and preserve its existing `onSaveNote`, `onSaveText`, `onOpen`, `autoFocus` and `onBlurEmpty` callbacks. Contenteditable descendants retain typing/selection shortcuts; drag the card header or margins to move the card. A ResizeObserver remeasures changing card bodies for marquee, connections and sections. `NotePanel` receives the explicit `boardId`. Sections remain the existing `BoardFrame`/`frames` API and `board-canvas.json` format; no migration is necessary. `Workspace` forwards board selection to the existing companion; the card chat button selects the card and focuses the companion without submitting a message.
