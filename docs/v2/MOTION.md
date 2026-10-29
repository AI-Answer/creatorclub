# Motion graphics and auto zoom: design (spike, 2026-10-29)

Measured in `/private/tmp/.../scratchpad/motion/` (Playwright 1.59.1 + Chrome 156, ffmpeg 8.1). File:line references are to `recorder/app/`. Anything marked unconfirmed was not run (notably, nothing was launched inside Electron 44).

## Today
- Elements are static: one full-frame PNG per element, drawn by a Swift/AppKit helper (`server/media-text.swift:1-46`, compiled on first use, `server/media.ts:602-650`), looped for the whole timeline and shown with `enable=between()` (`media.ts:1252-1266`).
- Preview (DOM, `src/Stage.tsx:72`) and export (Swift) disagree: rectangles and ellipses are outlined in preview but solid in export; arrows differ.
- The installed ffmpeg has no `drawtext`, `subtitles` or `ass` filter, so text needs a rasterizer.
- Prototype B already previews motion blocks the right way: pause every CSS animation and set `currentTime` from the playhead (`docs/v2/prototypes/b/index.html:1925-1930`).
- The media service runs as an Electron `utilityProcess` (`desktop/main.cjs:144`) or plain node in dev (`:145`), so it cannot open windows.

## Recommendation: render HTML/CSS templates in Chromium, encode with qtrle, overlay with ffmpeg
Same template file for preview and export, so they match by construction. Run it in a hidden Electron `BrowserWindow` with `webContents.debugger`: `Emulation.setDefaultBackgroundColorOverride` (alpha 0) then `Page.captureScreenshot` clipped to the block, PNGs piped to ffmpeg `image2pipe`, encoded to qtrle, cached like the rasterizer (`media.ts:637-649`).

Measured, one 2-second 1080p30 lower third (60 frames):
- Capture per frame: 59 ms full page, 36 ms clipped, 34 ms raw CDP; 4 pages in parallel 15 ms (0.92 s for the whole block). Chrome launch 0.3–0.45 s.
- Seek by playhead works; two runs gave 60 of 60 byte-identical PNGs.
- Encode: qtrle 0.35 s, 1.3 MB, lossless overlay; prores_ks 4444 2.3 s, 5.6 MB, 54–56 dB; prores_videotoolbox 0.46 s, macOS only, 48 dB; VP9 alpha 0.9 s, 0.1 MB but ffmpeg's built-in decoder drops alpha (7 dB), so avoid it.
- Export of a 30 s 1080p video (veryfast): 6.8 s with no overlays; **54.9 s with 10 looped static PNGs (today's path)**; **12.2 s with 10 animated qtrle clips shifted with `setpts`**. The new path is about 4.5× faster than today's static elements.

| Option | Matches preview | Portable | Effort |
|---|---|---|---|
| **HTML/CSS in Chromium, qtrle + overlay (recommended)** | same template | yes | medium |
| Lottie | only if preview uses lottie-web; authoring needs After Effects | yes | high |
| ffmpeg drawtext/overlay | low; no rounded corners, shadows | build-dependent (no drawtext here) | high per style |
| Extend the Swift rasterizer | low (AppKit is not CSS) | macOS only | high |
| HyperFrames | high | yes | high to embed; borrow ideas |

Limits: no `backdrop-filter` or blend modes in templates (nothing to blur in a pre-render); bundle Inter (woff2); alpha through Electron 44's capture path is unconfirmed.

## Data model
`Project.motion?: MotionBlock[]` next to `elements`: `{id, template: 'title-card'|'lower-third'|'callout'|'chapter-label'|'animated-caption', style, start, duration, layerId?, zIndex?, sceneId?, props, timing?:{in,out}, space?:'canvas'|'screen'}`. Templates live in a shared registry (`shared/motion/`: id, version, label, styles, default duration, props schema, HTML+CSS function), sized in `cqw` units so one file renders at 640 px preview and 1080p. Keep `elements` for blur (needs the video underneath); migrate text, arrow and shapes later. Presets and favorites are per app; a brand kit is CSS variables. Hooks to update: ripple (`server/mcp.ts:102`), scope filtering (`server/automation-scope.ts:22`), `projectDuration` (`shared/types.ts:74`), companion context (`server/agent-chat.ts:59`).
Preview: a `MotionLayer` in `Stage` pauses every animation and sets `currentTime = (t - start) * 1000` on each frame and seek. Export: the same module rendered frame by frame at export fps and size, clipped to the block's box, qtrle, `setpts=PTS-STARTPTS+start/TB` overlay.

## Auto zoom
Exists: `Zoom {start,duration,scale,x,y,target,easing}` (`shared/types.ts:35`), scale clamped 1–8 (`media.ts:1086`), ramp `min(0.3, duration/3)` (`shared/zoom-timing.ts:6,10`), each zoom ramps in and out alone (two in a row dip to 1×). Preview and export already disagree (from code, not pixels): preview scales around `transform-origin: x% y%` (`Stage.tsx:34`) and shows 0.40–0.90 at x=0.8, 2×; export centres on (x,y) via zoompan (`media.ts:1101`) and shows 0.50–1.00; and the first zoom wins in preview (`Stage.tsx:29`) but the last wins in export (`media.ts:1081-1099`). Fix the origin rule once in `shared/zoom-timing.ts`.
Missing: native recording draws the cursor into the video (`desktop/native-recording.swift:179`) and records no cursor data. Borumi's `.cursor` sidecar (30-byte records: kind 1 down, 2 up, 3 move; x, y, size, ticks, scale; no scroll kind) is decoded by `server/cursor-sidecar.ts:5-21`.
Add to the Swift helper: sample `NSEvent.mouseLocation` at 60 Hz on the capture clock, catch clicks and scroll with a global event monitor (extra permission unconfirmed), map into capture bounds, write `<take>.cursor` in the same framing (kind 4 = scroll).
Derive zooms (pure function in `shared/`): click = rising edge of pressed; dwell = within 4% radius for at least 0.7 s; group events less than 1.5 s and 25% apart; segment from 0.5 s before to 1.2 s after, at least 1.5 s, merge segments under 1 s apart (pan, don't zoom out); scale from the group's box, clamped 1.4–2.5×; critically damped spring (about 0.25 s) with a dead zone. Model: `keys?:{t,x,y}[]` (at most 10/s), `rampIn?`, `rampOut?`, `source?:'manual'|'auto'`. Show auto zooms as suggestions in Auto-edit with before/after.

## First slice (about 7.25 days, one developer)
Four blocks, two styles each (title card: clean, bold; lower third: block, glass without backdrop blur; callout: arrow, ring; chapter label: tag, number), same templates in preview and export, and a companion tool `add_motion_block` ("add a lower third at 0:12").
Engine 1.5 d · data model and hooks 0.5 · templates 1 · preview layer 0.5 · export integration 0.75 · UI (insert menu, inspector, timeline block) 1.5 · companion tool 0.5 · tests (seek snapshots, preview-vs-export PSNR above 40 dB, cache key, ripple) 1. To fit five days, edit start and duration in the inspector instead of dragging. Order: prove alpha in Electron 44 → templates → preview → export → model and ripple → companion → UI → tests. Auto zoom after: about 1 day cursor capture plus 2 days derivation and model.
Risks: the media service cannot open windows (needs a bridge to the main process, and dev mode runs plain node); alpha in Electron unproven; export about 1 s per second of motion; fonts; timeline effect rows are click-only today.

## Dani decides
1. Keep the cursor drawn into the recording, or capture separately and render it (needed for a smooth or enlarged cursor).
2. Motion blocks replace `elements` now, or sit beside them.
3. Brand kit: fonts and colours, per channel or global.
4. When Windows/Linux matters (rules out Swift and VideoToolbox-only paths).
5. Auto zoom on by default, or a suggestion to review.
6. Is about 1 s of export per second of motion acceptable.
7. Lottie imports: recommended deferred.
