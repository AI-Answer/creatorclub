# CreatorClub v2 build plan (2026-10-29)

Dani rejected the current UI as overloaded and asked for a simpler, coherent one: one docked companion across the whole pipeline, seamless Record and Edit, a much better timeline, quick previews, motion graphics, Postiz publishing, simpler Settings. Three prototypes exist in `docs/v2/prototypes/{a,b,c}/index.html` (comparison page: `docs/v2/prototypes/index.html`). Read `docs/v2/BRIEF.md`, `docs/v2/UX-PROBLEMS.md` and `docs/v2/research/*.md` first.

## Rulings (Dani has not picked a layout; these stand until he redirects)
- **Layout:** the mix of A and C, with B's bottom dock for the timeline. One step bar at the top (Discover · Plan · Record · Edit · Publish) is the only navigation; the app sidebar stays but collapses to a rail inside a video. One docked companion (about 380px, collapsible) on every video step. The scene chips appear only on Record and Edit. One primary action per screen.
- **Publishing:** Postiz Cloud first (the user's own API key, entered once), with a `Publisher` interface so direct YouTube upload can follow. Direct YouTube is out of scope for this plan.
- **Where all three prototypes agree, they are the spec.** Where they differ, the A/C mix above decides.
- **Motion graphics and auto zoom are new engines**, not UI: they come last, as a design spike (Task 6), after the simplified UI ships.
- Scope limit: change `club` mode only. SceneForge standalone behaviour stays as it is.

## Global constraints
Same as `docs/REBUILD.md` "Global constraints" (look, words, AI through `server/club/ai.ts`, `git rm` only, no downloads, tests), plus:
- **Each task passes `cd recorder/app && npx tsc --noEmit` and runs only the tests that cover code it touched (and their neighbours), and commits WIP every 15–20 minutes** with a `WIP:` prefix, then one final commit per task. Builders do NOT run the full `npm test`: the controller runs it once at integration, when the machine is quiet. The old SceneForge timing tests (agent-chat, automation, media, script-scope-api, ai, editor-previews, edit-ui connect, breakdown) flake under load and are unrelated to v2 work: do not run or chase them.
- Use Node 24 (`export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`).
- Never launch, quit or rebuild any desktop app, and never open camera, microphone or screen. Verify UI in a browser against a **separate server on a copy of the data**: `SCENEFORGE_PORT=<port> SCENEFORGE_DATA_DIR=<copy of studio> CREATORCLUB_DIR=<copy of ~/Documents/CreatorClub> CREATORCLUB_SECRETS_DIR=<temp>` from the worktree, with Playwright and installed Chrome (`chromium.launch({headless:true,channel:'chrome'})`). The real data in `~/Documents/CreatorClub` and `~/Library/Application Support/CreatorClub` must never be written to by a test or a walkthrough.
- Count visible controls at first paint on every screen you change (buttons, links, inputs, tabs) and report before and after. The budget is about 25 per screen (Edit about 30).
- The script of a scene appears once per screen.

## Task 1: Video frame and Record
Goal: one navigation, a calm Record screen. Spec: prototypes A (`#/record`, `#/plan`) and B for the frame; `docs/v2/UX-PROBLEMS.md` items 1–3.
- **Frame** (`src/club/workspace/*`): keep the top step bar; remove the second step bar at the bottom (the foot keeps only "Back to <step>" and one "Continue to <step>"); show the scene chips only on Record and Edit (not Board, Plan, Publish). The CreatorClub sidebar collapses to its rail whenever a video is open.
- **Record in club mode** (`src/Recording.tsx`, `src/RecordingSceneCards.tsx`, `src/club/recorder/*`, behind the existing `club` flag): one line "Camera · Microphone · Screen: ready" (or the one thing that is wrong) with a "Change" control that opens the source rows (devices, toggles, presets, computer audio) in a popover or sheet; they are not shown by default. The current scene gets one big Record button (red, always enabled when a scene is selected; picking the scene is automatic: the first scene without a kept take, or the strip's choice). Scene cards become compact: number, title, status, take thumbnails; no script text on the cards (the script is only in the teleprompter panel on the right) and no per-scene Remove pauses / Style video buttons. Presets and the 3-second countdown option sit under "Change". The take preview keeps Delete take · Record another take · Continue; Continue already puts the take on the timeline and selects the next scene. After the last scene, the foot's Continue to edit becomes the primary button.
- Remove dead UI with `git rm` when a component is fully replaced. Update the tests that encode the old layout.
- Done when: Record at 1440x900 shows at most ~25 controls, the Record button is visible without scrolling in a 1100x700 window, the script appears once, and a headless run against the copy server can open Record, pick a scene, and see the Record button enabled.

## Task 2: Edit and the timeline
Goal: Edit as calm as prototype A/B, and a timeline that is good to use. Spec: prototypes A and B `#/edit`; `docs/v2/research/editor.md` (every defect listed there is in scope unless it says otherwise).
- **Chrome** (`src/App.tsx` embedded branch, `src/Inspector.tsx`, `src/editing-club.css`): the Edit header becomes: step bar and scene chips from the frame, then one toolbar with Undo/Redo/History, "Auto-edit and style", and Export. The 9-icon panel rail collapses into one "Style & more" menu that opens the panels (Canvas, Layout, Clip, Zoom, Elements, Music, Captions, Cursor, Automate) on demand, as a sheet over the right side (not a permanent rail). The transcript is open by default beside the preview. Remove the Import button from the toolbar (Import lives in the "Style & more" menu).
- **"Auto-edit and style" sheet**: Remove pauses (with aggressiveness and padding), Review filler words, Close gaps, Normalize, Style video; hovering or arrow-keying a choice previews it on the stage (reuse `CutPlayback` and `applyOperations`), Before/After, and a "Previewing at lower quality" notice.
- **Timeline** (`src/Timeline*.tsx`, `src/timeline-*.ts`, `editing.ts`): fix defects 1–14 in `docs/v2/research/editor.md`, at least: tracks that exist only when used and a default height that shows all used rows; linked clips per take (move, trim and delete together; an unlink option); effect rows (elements, captions, zooms) draggable, resizable and snapping; ripple on delete across all tracks including scenes; clips cannot overlap on a row (insert line when dragging); zoom that anchors at the playhead and a Fit that uses the timeline's width; ruler with ticks and frame precision at high zoom; user markers (M); blade clicks and library drops snap; playhead follow switch; drag cancel only by the user (a background save must not cancel a drag); hidden Duplicate/Delete buttons fixed (Cmd+D); scene markers; filmstrip thumbnails (several per clip) and a finer waveform.
- Tests for every pure function you change (`timeline-drag`, `editing`, snapping, linking). A UI test that a drag is not cancelled by a background save.
- Done when: the 51 fixed controls at first paint are down to about 30, and a headless run against the copy server shows a take on the timeline with linked tracks, snaps while dragging, and splits at the playhead.

## Task 3: One docked companion
Goal: one conversation per video across Board, Plan, Record, Edit and Publish with the screen as context. Spec: prototypes A, B and C companion; `docs/v2/research/editor.md` "Companion chats today".
- **Server** (`server/club/`): a new `companion` module and routes `POST/GET /videos/:id/companion` and an SSE or poll job for replies. One runner through `server/club/ai.ts` (claude or codex). One conversation file per video (`companion.json`, migrating `board-chat.json`). The request carries the tab, the focused scene, the selection or playhead (Edit), and a short screen summary; the server builds the prompt from the channel voice, idea, package, outline, tiles (Board), the project summary (Edit). The reply is `{reply, actions: [...]}` where each action is one of the typed actions the UI can apply: `use_hook`, `use_title`, `add_note`, `set_scene` (title and talking points), `draft_scenes`, `set_description`, and for Edit the existing project tools via the editor-chat transaction path (`update_clip`, `split_clip`, `delete_clips`, `set_captions`, `set_elements`, `set_zooms`, `trim_timeline`, remove pauses). Every applied action creates a version and can be undone.
- **UI** (`src/club/workspace/*`, remove `ChatPanel.tsx` when replaced): one docked panel in `Workspace` (about 380px, collapsible, remembers its state), a "Looking at: <step · scene>" line, suggestions that change per step, result cards with Apply / Preview / Undo, and the conversation visible across steps with a divider per step. The Edit editor chat (`AgentChat.tsx`) is replaced by this panel when embedded; lift the editor's selection and playhead out of `App` via a callback like `onProgress`.
- Tests for prompt building, action validation (reject unknown actions and unknown scene ids), and versioning.
- Done when: asking "write three hooks" in Plan, "draft the scenes" in Board or Plan, and "cut the pauses" in Edit each produces a card that applies and can be undone, in a headless run with a fake AI runner (tests) and, once, with the real runner on the copy server.

## Task 4: Postiz publishing and Settings
Goal: Publish actually publishes; Settings is three groups. Spec: prototype A/B/C `#/publish`, `#/settings`; `docs/v2/research/postiz.md`.
- **Server**: a `Publisher` interface (`connect`, `listChannels`, `publish`, `status`) and a Postiz Cloud adapter (`https://api.postiz.com/public/v1` or a custom base URL for self-hosted; raw API key in the `Authorization` header; `GET /integrations`; multipart `POST /upload`; `POST /posts` with the YouTube settings: title, visibility, made for kids, thumbnail, tags; `type` now or schedule). The API key is stored like the Gemini key (outside the workspace, never in the UI after saving). Export first (the club export), then upload, then post; progress as a job with SSE, one plain error sentence on failure, Retry. Respect the 90 posts/hour and 1 GB limits with clear messages.
- **UI**: Publish shows the package summary, the export line, connect Postiz once (paste key, pick the YouTube channel), visibility, made-for-kids (required), tags, publish now or schedule, then progress and the result with a link. Settings has three groups only: Connected AI, Channel, Publishing and look.
- Tests with a fake Postiz server (HTTP) for upload, post, schedule and every error path.
- Done when: against a local fake Postiz server, a headless run publishes a video end to end and shows the result.

## Task 5: Discover
Goal: Ideas and Working now stop shouting. Spec: prototype A `#/discover`, `docs/v2/UX-PROBLEMS.md` item 8.
- Ideas become a compact list (title, why in one line, source as small text, rating chips only in the drawer, thumbnail small and only when the source video differs from the previous card); the three actions collapse into Start planning plus a "…" menu. Working now keeps its ranked cards but drops duplicate thumbnails. Overview shows the next action and the videos in production, nothing else. Control counts at most ~25.
- Done when: counts are reported before and after and the screens are checked in a headless run.

## Task 6: Motion graphics and auto zoom (design spike, after Tasks 1–5)
A written design only: how title cards, lower thirds, callouts and animated captions render in preview and export with the existing ffmpeg pipeline (including the macOS-only Swift rasterizer problem and the preview/export mismatch in `docs/v2/research/editor.md`), whether HTML templates rendered by Chromium (as the `hyperframes` skill does) are the right engine, and how cursor-based auto zoom can be captured natively. Output: `docs/v2/MOTION.md` with a recommendation, an effort estimate and a first slice. No app code.

---

# Update (Dani picked A and added requirements)

Dani, verbatim summary: likes A; tokens, colours and icons must be centralized; unclear text and icons improved; fewer repeated tabs; the timeline must be excellent to control, edit and move in; the Board must let him write properly (bullets, rich text) and take in `.md` files from a folder, other agents, or a Claude Code session; the AI helper on the right needs better styling, streaming, a loading and reasoning state, and an original icon ("not a vibecoded piece of shit"); in Edit, prompts and motion graphics must really apply; do not mix colours; the UI must be consistent and predictable, with intuitive places for things.

## Revised rulings
- **Layout: A is the base.** Step rail as the only navigation, one task per screen, companion docked at the right. Take from C: the single companion with conversation across steps and result cards. Take from B: nothing structural beyond the timeline's behaviour.
- **Colour rule (applies to everything):** one accent (blue) for focus, selection and the primary action; red only for recording and destructive actions; green only for done or ok; amber only for warnings. Timeline and take colours are fixed by kind (screen, camera, audio, graphics, captions, zoom, markers) and used identically in the timeline, the scene chips and the take chips. No other hues. Neutral surfaces otherwise.
- **Motion decisions** (from `docs/v2/MOTION.md`, "Dani decides"): the cursor stays drawn into the recording for now; motion blocks sit beside `elements` first; the brand kit is per channel (Inter plus an accent from the channel); macOS first but new paths avoid Swift-only or VideoToolbox-only code; auto zoom arrives as a suggestion to review, not a default; the export cost (about 1 s per second of motion) is accepted.
- Postiz first, direct YouTube later (unchanged).

## Order of work
Tasks 1, 2, 4 and 5 (running) → merge → Task 7 (design system) → Task 3 (companion, with the new design) → Task 8 (Board writing) → Task 9 (motion blocks, first slice). Task 6 is replaced by Task 9.

## Task 7: Design system and consistency
Run after Tasks 1, 2, 4 and 5 are merged.
- **One source of truth.** `src/club/ui/tokens.css`: colours (surface, text, line, accent, record, ok, warn, one fixed colour per timeline kind), spacing, radius, type scale, shadows, motion durations; light and dark. `src/club/ui/icons.tsx`: one registry of icons with semantic names (`record`, `split`, `ripple`, `snap`, `marker`, `companion`, …) wrapping lucide plus custom marks; no component imports lucide directly. `src/club/ui/`: Button variants (primary, secondary, quiet, danger), IconButton (a label and tooltip are required by the type), Menu, Sheet, Tabs, Chip, Toast, Tooltip with shortcut hints.
- **The embedded editor and recorder consume the same tokens**: replace raw colours in club-mode CSS (`editing-club.css`, `recording-club.css`, `original-theme.css` club rules) with tokens. A test fails when a raw colour literal (hex, rgb, hsl) appears in club CSS or TSX outside `tokens.css`.
- **Text and icons pass:** every icon-only button has a tooltip and an accessible name; every ambiguous label is rewritten with a verb and an object; consistent keyboard hints; one place per function (document a "where things live" map in `docs/v2/UI-MAP.md`: sidebar, step rail, header, sheet, companion, avatar menu); no repeated navigation (a step or panel is reachable from one place).
- Done when: the lint test passes; a script that collects distinct computed colours reports at most 24 per screen and only token colours; screenshots of every screen are checked in a headless run against the copy server.

## Task 3 additions: the companion's design and streaming
- **Identity:** an original mark, not a sparkle or a star. Design three SVG directions in a scratch file, choose the one that sits with the CreatorClub mark, and use it as the `companion` icon everywhere (header, message avatar, loading state).
- **Messages:** your message is a quiet right-aligned block; the companion's reply is flowing text with markdown (bold, lists, code) and inline result cards (Apply, Preview, Undo); no chat-bubble clutter.
- **Streaming and reasoning:** real token streaming (claude `--output-format stream-json --include-partial-messages` through `server/club/ai.ts`; a chunked fallback for codex). While working it shows a step list ("Reading the board", "Drafting scenes") with elapsed time that collapses to a one-line summary when done; Stop (Esc) cancels; a skeleton before the first token; clear error and retry states; scroll anchoring that never fights the reader.
- Done when a headless run shows the streaming and step states with a fake runner and once with the real runner on the copy server.

## Task 8: Board that is good to write in
- **Rich text:** the Board's notes become documents that you can write in without friction: headings, bullets, numbered lists, checklists, bold, italic, links, quotes, `/` commands, paste from anywhere, autosave, undo. Stored as Markdown in the video's folder (`board.md` per note or one file), so any agent can read and write it. Choose the editor library in the task (TipTap, MIT, is the default; justify any other) and add it as the only new dependency.
- **Files in:** drop `.md` and `.txt` files onto the Board, pick a folder to watch ("Notes folder": each `.md` in it appears as a card you can pin), and the video's own folder is watched so anything another agent writes there (a Claude Code or Codex session running in that folder, or the user's terminal) shows up on the Board within a second or two. Say in the UI where the folder is and give a button that copies the path.
- **Out:** "Use as package", "Use as hook" and "Draft scenes from the board" read the Markdown.
- Tests for Markdown round-trip, the file watcher (temp dirs), and importing.

## Task 9: Motion blocks, first slice
The slice in `docs/v2/MOTION.md`: title card, lower third, callout arrow, chapter label, two styles each; preview and export render the same templates; the companion tool `add_motion_block` ("add a lower third at 0:12"); blocks on the timeline using Task 2's draggable effect rows; the colour rule above. First prove alpha in Electron 44 with a spike and report before building the rest.
