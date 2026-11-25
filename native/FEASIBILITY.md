# Can Creator Compiler move to Exact? A straight assessment

**Short answer:** not now. Exact is good at the part of the studio that was already easy: lists, boards,
sidebars and forms, drawn with real AppKit controls. It has nothing for the parts that make Creator Compiler
hard (the timeline editor, the composited preview, screen recording), and it changes too fast to bet the
editor on. Stay on Electron. Keep adding native Swift helpers where Electron falls short, as the recorder
already does. Look at Exact again when it ships versioned releases.

Everything below comes from this spike: one afternoon on 2026-11-24, Exact `1aca3f837`, a Mac Studio
running macOS 27 with Xcode 27.1.

## What was built, and what it proves

`native/` is a real macOS app. The view is 242 lines of Contract (146 before Exact's formatter put one attribute per line), and the data module is 134 lines of TypeScript:

- The Video board (six lanes) and Research, read live from the existing service (`/api/club/videos`,
  `/api/club/channel/research`, `/api/club/workspaces`). **No change to the service or the Electron app was needed.**
- Cards drag between lanes with Exact's native drag (`reorderGroup`). The drop calls the same
  `POST /videos/:id/move` the web board calls. Verified with the agent driver and against the service's own
  answer (`docs/board-after-drag.png`).
- A card opens the **existing web editor inside the window**, in an `iframe` that is a WKWebView on macOS
  (`docs/editor.png`). The timeline, canvas and tool panels render and run there.
- A native sidebar and toolbar, dark mode, the brand accent and the app icon, with no styling code for the
  controls themselves.
- Six tests (`app.test.contract`) pass on **both** a native macOS window and Chrome from the same file,
  including the drag and a refused move.
- A release `.app`: 24 MB, launched and screenshotted (`docs/release-app.png`).

| Measured | Exact shell | Electron app today |
|---|---|---|
| App bundle | 24 MB (release) | 288 MB Electron runtime alone |
| Memory | 122 MB, 1 process (board showing) | 895 MB across 7 processes (dev app with the service and an open editor: not like for like) |
| Incremental native build | 1–2 min | Vite build under 1 s |
| First native build on this Mac | 1 min 48 s, with Exact's caches already warm from other projects (Exact says a cold first build takes 10–15 min) | n/a |
| Disk for one app's build output | 7.7 GB (`native/target`), plus 11 GB for the Exact checkout's own | n/a |

The board was quick to build because Exact already had the pieces: a virtualized list, a cross-list drag group,
a sidebar from a `tablist`, `fetch` with grants. It is not evidence that the editor would be quick.

## Part by part: now, later, or never

| Part of the studio | Verdict | Why (from the spike and Exact's docs) |
|---|---|---|
| Video board, Research, channel settings, other lists and forms | **Now** | Built here: native drag, live data, tests on two hosts. About 280 lines for two screens. |
| Hosting the web editor in a native window | **Now, with a catch** | It renders and runs (`editor.png`). But the editor relies on Electron's preload bridge, `window.sceneForge` (about 35 methods; 21 files in `src/` call it: file pickers, capture source pickers, native recording, permissions, the shortcut menu). A WKWebView doesn't have it, so Import media, Record and the rest fall back to browser behaviour or break. I didn't exercise them inside the web view. Rebuilding that bridge means Swift message handlers for each method, which is replacing Electron's main process, not wrapping it. |
| Timeline editing | **Later at best, probably never** | Contract has gestures, canvas 2D, `wgpu` shaders and fast virtualized lists, so it *could* draw a timeline. But Contract is its own language: React and npm UI code don't carry over. The timeline would be a ground-up rewrite of `Timeline.tsx`, `timeline-edit.ts`, `timeline-drag.ts`, `timeline-gesture.ts` and the edit panels (part of about 2.8 MB of dense React source across 383 files in `recorder/app/src`), with no shared code to lean on. |
| Preview compositing | **Never as a port; keep it where it is** | The preview is DOM/CSS layers over `<video>` elements (`Stage.tsx`, `ClubTakePreview.tsx`), and motion graphics are rendered by Electron offscreen windows or headless Chrome (`desktop/motion-render.cjs`). Exact's `video` element is AVPlayer on Apple, but a compositor that matches the web preview frame for frame would be a new renderer. Whatever renders the preview must also match export. |
| Recording: camera and microphone | **Later** | `@exact/media-capture` (getUserMedia) and `@exact/recording` exist. But the native recorder **refuses a stream with both audio and video** (`NotSupportedError`, per its README), so a talking-head take needs two recorders and a sync step. Not run in this spike. |
| Recording: the screen | **Never with Exact alone** | `@exact/screen-capture` takes **stills only** (`SCScreenshotManager`). There's no screen video stream. It would need a Swift native module, most likely wrapping the existing `desktop/native-recording.swift` (452 lines of ScreenCaptureKit), which Electron already runs. |
| Export (render, captions, privacy blur, cutroom) | **Unaffected** | Export runs in the Node service, ffmpeg and the Rust `cutroom` engine, not in the UI. Any shell can keep calling it. `@exact/child-process` can spawn programs on macOS, so an Exact shell could start the service itself. Not tried. |
| Linux and Windows builds of the studio | **Not a reason to switch** | Exact's Linux and Windows hosts draw their own controls and have **no video decoder** (Exact's docs, the `portal` table), so a video editor gets none of Exact's cross-platform benefit there. |

## The risks of Exact being pre-1.0

These aren't hypothetical; I hit the first two today:

1. **It breaks apps written a few weeks ago.** The official `chat` template is pinned to an Exact commit from
   2026-10-31. Against today's Exact it failed to build (`rename app.tamber to app.forma`). After the rename
   it still failed: the design file's first word had changed from `tamber` to `forma`, and until that was
   fixed by hand, its two custom icons didn't resolve either. Exact's own `update`, `lock` and `contract
   migrate` fixed the rest. It then built and ran (`docs/chat-template-mac*.png`). An editor-sized app would hit this on every upgrade.
2. **It moves fast.** 1,358 commits landed in the seven days before this spike. There are no releases, no
   tags, no changelog for app authors and no compatibility promise (the README says so). You build from a
   checkout and pin a commit yourself. Pinning means missing fixes; following main means migrations.
3. **The toolchain is heavy and exact.** Bun pinned to 1.4.2 exactly, a pinned Rust toolchain, Xcode with
   Swift 6.4 and the macOS 26 SDK, Hermes bundles, Playwright's Chromium for web tests. About 19 GB on disk
   between the checkout's build cache and this one app's. CI would need all of it on a macOS runner.
4. **Shipping needs Exact's own release path.** `exact release` signs with a Developer ID, enables the
   hardened runtime and notarizes. This Mac only has an Apple Development certificate, so the spike's
   `.app` is signed for this Mac only (Gatekeeper: `rejected`). Updates would go through Exact's own
   updater (`mac-binary-updates` recipe, Sparkle) instead of the current `electron-updater` setup.
5. **The surface is enormous and young.** The grammar reference is thousands of lines of special cases
   ("a header holds a heading, one text and buttons… anything else fails the build"). Small things took
   lookups: a tab that pushes a detail turns into a split view with "No Selection" until you add
   `navigationSplit="none"`; `grants` must be a constant with no conditionals; a resource's `when` must come
   before `as`. The compiler's errors were precise, which helped. Few people outside Expo write Contract,
   so hiring and help are thin.
6. **The agent tooling is the best part.** The driver (`tree`, `tap … drag to`, `screenshot … window`, `logs`)
   drove the real AppKit window and showed every request and reply, which made the drag easy to verify.
   That's worth keeping in mind for later, but it doesn't reduce the risks above.

## What a full port would take

These are rough figures, for one engineer who already knows the studio:

- **Board, Research, Discover, settings, onboarding and the other list/form screens:** 3–6 weeks.
  The spike suggests about a day per simple screen once the data module exists. Discover and onboarding have more states.
- **The bridge (pickers, permissions, shortcuts, menus, the recording HUD, the capture picker), as Swift native modules:**
  4–8 weeks. That's Electron's main process (`desktop/`, about 3,200 lines) rewritten against Exact's module API.
- **Screen and camera recording at today's quality:** 4–8 weeks, mostly porting `native-recording.swift` into
  a native module and rebuilding the HUD, then testing it again on real hardware.
- **Timeline editor and preview, rewritten in Contract with GPU or canvas drawing:** 3–6 months. This is the
  biggest and least certain part, with no prior art in Exact's example apps.
- **Keeping up with Exact while doing all of that:** a standing cost, likely a day or more a week at the current pace.

That adds up to **roughly 6–10 engineer-months** before the native app matches the Electron app, with real
risk of the framework changing underneath. During that time the Electron app keeps getting features the port must chase.

## Recommendation

1. **Stay on Electron for the studio.** It already runs the editor, the recorder and export, and the places it
   falls short are being filled with native Swift helpers (`native-recording.swift`, `speech-follower.swift`,
   `settings-window.swift`). Keep doing that. It gets native capture quality without a rewrite.
2. **Don't adopt "native shell + web editor in a WKWebView".** It looks cheap, and `editor.png` shows it
   rendering, but every recorder and file feature goes through Electron's bridge. You'd be rebuilding
   Electron's main process in Swift to end up where you are now.
3. **If you want something native and small now,** this shell is a reasonable starting point for a
   **companion app**: a 24 MB board and Research window (or a menu-bar app) that reads the running studio,
   moves cards and opens a video in the main app. Two small, additive changes would complete it: a
   deep link in the Electron app (for example `creatorcompiler://video/<id>`, opened with Exact's `openURL`
   and an `open_url.schemes` entry), and a way to pick the channel without changing the Electron app's current one.
   This is optional; it doesn't move the studio off Electron.
4. **Look at Exact again** when it has tagged releases and a migration policy, a screen-recording stream, and
   a recorder that takes audio and video together. Until then, a port means tracking Exact's main branch.

## What this spike didn't test

- Camera, microphone and screen capture through Exact (documented, not run).
- Exact's `video` element, beyond its docs.
- The web editor's Import media, Record or Export buttons inside the WKWebView.
- iOS, Linux and Windows builds of the shell. Only macOS and the web test host were run.
- Startup time. Exact's docs claim a 100 ms cold start; I didn't measure it.
- A notarized build (no Developer ID certificate on this Mac).
- The shell against the owner's real channels. Drags were tested only on the sample service (port 4199), to
  leave real data alone. Reads against the real dev service on 4184 would use the same code path.
