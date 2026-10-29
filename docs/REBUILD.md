# CreatorClub UI rebuild plan (2026-10-29)

Dani approved the clickable prototype in `docs/prototype/`. This plan rebuilds the real CreatorClub UI (`recorder/app/src/club/**`) to match it, wired to the real backend. Spec: `docs/redesign-brief.md` (binding) and the prototype itself (look, words, behaviour). `docs/prototype/NOTES.md` lists the design decisions; `docs/prototype/UX-AUDIT.md` lists the beginner findings that were fixed and must stay fixed.

## Global constraints

**The prototype is the spec for look, words and behaviour**
- Port its markup, class names and CSS (`docs/prototype/styles.css`) rather than reinventing them. When a task says "port X", read X in the prototype and reproduce it in TSX, keeping its copy word for word.
- What the prototype simulates (canned AI replies, timers, `content.js` text, the CSS camera, fake transcripts) is replaced by real data and real jobs. Never ship `content.js` text or Samin-specific strings as UI data. Where real data doesn't exist yet, show the prototype's empty state for that place, never fake content.
- The prototype is plain JS with htm and global `window` objects. The real app is TSX modules with typed props. No htm, no CDN scripts, no globals.

**Where the code goes**
- UI: `recorder/app/src/club/`. Server: `recorder/app/server/club/`, mounted under `/api/club/*`. Shared types: `recorder/app/shared/club.ts`. Prompts and schemas: `methodology/` at the repo root.
- Keep and reuse the existing backend modules (store, jobs, ai, breakdown, planning, research, recorder, publish, onboard, channel, connect, voice, migrate-board). Extend them; don't fork them.
- Old club screens that the new ones replace are deleted in the task that replaces them (`git rm`), so no dead UI stays behind. `src/club/mock-videos.ts` is dead code: remove it in Task 1.

**Language and dependencies**
- TypeScript, React 19, the existing dependencies. Icons: `lucide-react` (already a dependency); use the same icon names as the prototype.
- No new dependencies unless a task names one.

**Tests**
- `npm test` (`tsx --test`, happy-dom for UI tests). Test files `*.test.ts` next to the code, and add every new test glob to the `test` script in `package.json` if it isn't covered.
- Every task adds tests for its server logic and for its pure UI logic (formatting, ranking, status words, route parsing). UI tasks must pass `npm run build` (`tsc --noEmit` plus the Vite build).
- Never run `npm run desktop:app`, never build or touch `~/Applications/SceneForge Dev.app`, never quit or launch apps.

**AI and data**
- Every AI call goes through `server/club/ai.ts` (the user's own `claude` or `codex` login, isolated). No API keys in the UI except the optional Gemini key field that already exists in Settings.
- Never download a video or its audio. yt-dlp is used for metadata, subtitles, comments and thumbnails only.
- Workspace root `~/Documents/CreatorClub` (`CREATORCLUB_DIR` overrides; tests always set it to a temp dir). One folder per channel, plain JSON and Markdown.

**Words in the UI**
- Video, Scene, Take, Talking points, Board. Never: Project, Brief, Lane, Picked, Research board, Borumi, Codex (say ChatGPT), "successfully", "please", exclamation marks.
- Sentence case. Buttons are verb first, 1–3 words. One primary button per view. Errors are one plain sentence plus `Try again`; raw errors never appear.
- A new channel never sees Samin's name or numbers. Text is second person and filled from the active channel's profile.

**Look**
- Port `docs/prototype/styles.css` into the club stylesheet, scoped under `.club-root` so SceneForge's own CSS is untouched. Light by default; dark via `[data-theme=dark]` on `.club-root`. Inter (already loaded locally).
- Outlier chips: Eden bands (grey <1, blue 1–3, green 3–5, amber 5–10, orange 10–50, red 50+), two decimals under 10×, label "vs <creator>'s usual", grey "—" when the usual isn't known. Reuse `src/club/outlier.ts`.

**Process**
- Commit per task with clear messages ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push. Don't touch git config.
- Never run `rm` on anything outside git's control and never delete user data. Removing tracked source files is done with `git rm`. Temporary files go in the OS temp dir via the test helpers.
- Never trigger permission prompts: no camera, microphone or screen capture from tests or scripts.

## Task 1: Design system and app shell

Port the prototype's foundation and frame.

- **Styles:** port `docs/prototype/styles.css` (tokens, layout, cards, chips, buttons, inputs, menus, dialogs, drawers, toasts, sidebar, kanban, board canvas, workspace frame, scene strip, bottom bar, record and edit layouts) into `src/club/club.css`, scoped under `.club-root`. Keep the existing Tailwind setup working; the ported CSS can be plain CSS classes. Keep `src/recording-club.css` and `src/editing-club.css` working for the embedded recorder and editor.
- **Primitives** in `src/club/ui/` (replace or extend the existing ones, keep exports in `ui/index.ts`), ported from `docs/prototype/core.js`: `Icon` (lucide-react by name), `Avatar`, `MultChip`, `Level`, `StagePill`, `DraftThumb`, `Thumb`, `SceneDots`, `SceneStatus`, `Empty`, `Menu` (with click-away), `Dialog`, `Drawer`, `Ed` (inline editable text, single and multi-line, Enter commits), `SourceIcon`, toasts with optional Undo. Formatting helpers in `src/club/format.ts`: `fmtNum`, `fmtMult`, `band`, `fmtDays`, `fmtHours`, `fmtClock`, `fmtMS`, `parseClock`, `fmtDate`, `initials`, `ytThumb`, `cleanTitle`, `sentence`. Unit-test the helpers.
- **Routes** (`src/club/routes.ts`, rewrite): `#/welcome`, `#/overview` (default), `#/ideas` (query `filter=later|skipped`, `open=<id>`, `new=<id>`, `bd=<videoId>`), `#/trending`, `#/signals`, `#/production`, `#/production/table`, `#/production/calendar`, `#/video/<id>/<tab>` with tab `board|plan|record|edit|publish` (default tab by stage as in prototype `defaultTab`), `#/settings`. Old `#/board` and `#/video/<id>/<step>` links redirect to the new ones. Unit-test parse and format.
- **Shell** (`ClubApp.tsx`, `Sidebar.tsx`): port prototype `main.js` `App`, `Sidebar`, `Palette` (⌘K), `NewVideo`, `Help`, `Toasts`. Sidebar: channel switcher (real workspaces from `/api/club/workspaces`, switching calls `/workspaces/:slug/current`, plus "Add a channel" that opens `#/welcome` at the channel step), then `Overview`, `Ideas`, `Working now`, `Signals`, `Production`, then `Settings`. It collapses to an icon rail, and collapses by itself on the Record and Edit tabs. New video creates a real video (`POST /api/club/videos`) and opens its Board.
- Screens not built yet render the prototype's `Empty` with their title, so every route works after this task. Keep the existing Settings and video page reachable until their tasks replace them.
- `git rm src/club/mock-videos.ts`.

## Task 2: Server: Working now, Signals and starting fresh

- **Storage:** per channel, `trending.json` and `signals.json` in the channel folder, same item shapes as the vault board (`trending`: videoId, title, channel, kind, views, likes, comments, published, ageDays, vpd, mult, history, firstSeen, fit; `signals`: source, author, handle, text, url, likes, replies, views, ageHours, media, flair). Also `followed.json` (channels to watch: name, url or handle) and `signals-config.json` (X handles, X topics, subreddits) in the same shapes as the vault's files. Add the types to `shared/club.ts`.
- **Import:** extend `migrate-board.ts` so importing Samin's old board also copies `trending.json`, `signals.json`, `followed.json`, `signals-config.json` (and `config.json` if needed) from the vault workspace folder (`~/dani/youtube-knowledge-vault/clients/samin/board/workspaces/samin`) into the CreatorClub channel folder. Never modify the vault. Run it once for the real `samin` workspace as part of this task (copy only, idempotent, no overwrite of newer files) and say so in the report.
- **Read API:** `GET /api/club/trending` and `GET /api/club/signals` for the current channel, each item ranked and tagged for the channel: port `topicMatch` / relevance from prototype `core.js` (topics plus audience keywords from the profile), returning `{items, reason}` per item ("Because you picked …") and `fit`. Items without a known usual keep `mult: null`.
- **Refresh (job, SSE like other jobs):** `POST /api/club/trending/refresh`: for each followed channel, read its last 30 uploads with yt-dlp metadata only (flat playlist; no downloads), compute each recent video's multiplier with the Eden method already in `outlier.ts` (views ÷ median of the last 30, needs ≥3), views per day, append to `history`, keep videos up to 30 days old. `POST /api/club/signals/refresh`: Reddit through the public JSON listing (`/r/<sub>/top.json?t=week`, with a real User-Agent) and X through the `treg` CLI when it's installed (same endpoints as the vault's `signals.py`); when `treg` is missing, keep the stored X posts and say "X posts refresh when treg is connected." Both write atomically. Tests use fake runners and fixtures, never the network.
- **Turn into idea:** `POST /api/club/signals/idea` and `POST /api/club/trending/idea` create an idea video (stage ideas) whose `idea` notes carry the source (label and url) and the post text or video title, so the Ideas card shows where it came from.
- **Start fresh (no channel):** `POST /api/club/workspaces/fresh {name, topics, audience, voice?}` creates a workspace with no channel URL, saves `profile.json` (name, topics, audience) and writes `voice.md` from the optional voice answers. Add `audience: string[]` to the workspace/profile types where missing. Everything that reads a channel must handle a channel with no URL (no "Read channel" errors).
- **Published views:** own-channel videos already published keep `views`; nothing new here unless missing.

## Task 3: Overview, Ideas, Working now, Signals screens

Port from `docs/prototype/screens.js`: `Overview`, `FirstSteps`, `Ideas`, `AddIdeaDialog`, `IdeaActions`, `IdeaCard`, `IdeaDrawer`, `Trending`, `Signals`, `TrendCard`, `SignalCard`, `Breakdown`, `ConceptCard`, `BreakdownDrawer`, `BreakdownWide`.

- **Data:** videos from `/api/club/videos`, recent from `/api/club/recent`, trending and signals from Task 2, profile from the current workspace. Hooks in `src/club/` (e.g. `useVideos`, `useTrending`, `useSignals`), refreshed after mutations.
- **Overview:** greeting, Pick up where you left off (recent videos with scene progress), In production, Next-up ideas, Working now (top items for you), Latest signals. A channel with 0 videos gets `FirstSteps` (the first-video checklist).
- **Ideas:** rich cards (thumbnail or draft thumb, title, angle/twist/hook, demand/gap/show `Level` chips, why, source, outlier chip), filters New/Later/Skipped (the `hidden` field), paste a YouTube or Instagram link to break it down inline (real `POST /api/club/breakdowns` job with streamed progress, then the result with 3 concepts and "Add to my ideas" → real `/breakdowns/:id/concepts/:index/add`, landing on Ideas with the new idea highlighted and the "Open it and start planning" banner). Idea drawer to edit notes in place and act (Start planning → moves to planning and opens Board; Later; Skip; Delete with Undo).
- **Working now:** grid of trending items, "For you / Followed / All" filter, sort by per day / total / growth, chip legend, "Show everything" for off-topic items, Break down (opens the breakdown drawer) and Turn into idea. Refresh button runs the Task 2 job with progress.
- **Signals:** cards with author, avatar, text, likes, replies, age, media; ranked for you with "Show everything"; Turn into idea; Refresh.
- Breakdown copy is second person for a channel that isn't the creator's own (the backend prompt already writes for the current channel; check it and fix the prompt if it names Samin for other channels).
- Delete the old screens this replaces (`BoardScreen` parts that are no longer used, `IdeaBox`, `BreakdownDialog` if replaced) with `git rm`, keeping anything Task 4 still needs.

## Task 4: Production board, table and calendar

Port prototype `Production`, `Kanban`, `KCard`, `TableView`, `CalendarView`.

- Kanban across Ideas → Planning → Recording → Editing → Publishing → Published with native drag and drop (real `POST /videos/:id/move`, Undo toast), cards with thumbnail or draft thumb, title, `SceneDots`, next action line (`nextAction`), opening the video on its default tab.
- Table and calendar views as in the prototype, using `publishDate`/`stageDates`.
- Scene progress comes from `GET /api/club/videos/:id/scenes` (Task 5). Until Task 5 lands, compute dots from the outline only; Task 5 then switches the source. Put the scene-status logic in one module (`src/club/scenes.ts`) used by every place that shows scenes.
- Replace `BoardView`, `TableView`, `CalendarView`, `VideoCard` with the new ones (`git rm` the old files when unused).

## Task 5: Server: board canvas, board chat and scene status

- **Tile positions:** add `pos?: {x: number; y: number; w?: number}` to `ResearchTile`; `PATCH /api/club/videos/:id/research/:tileId` updates `pos`, `text` (notes), `title`. New tiles without a position get the next free spot (port prototype `initBoard` placement and "new notes land in free space").
- **New tile kinds:** `signal` (a post: source, author, text, url, likes) and `breakdown` (links a breakdown id; the board shows its why-it-worked, reusable outline and concepts). Add to `TILE_KINDS`. When a video is created from a breakdown concept, a trending item or a signal, its board starts with that source tile.
- **Board chat:** `POST /api/club/videos/:id/board/chat {message, history}` runs one AI call (via `ai.ts`, structured output) with the board's tiles (titles, notes, transcripts trimmed, breakdown), the package and outline if present, and the channel profile and voice guide. Returns `{reply, items: [{kind: 'hook'|'title'|'note'|'scene', text}]}` so the UI can show `Use as hook`, `Use as title` and `Add to board`. Prompt file in `methodology/`. Chat history is saved per video (`board-chat.json`) so reopening keeps it.
- **Use as hook / title:** writes into the package (`PUT /videos/:id/package`), creating an empty package if none exists.
- **Scene status:** `GET /api/club/videos/scenes` (batch: every video not published, one request, keyed by video id) and `GET /api/club/videos/:id/scenes` returns the outline scenes merged with the recorder project: per scene `{id, title, seconds, takes: [{id, seconds, kept}], status, cutSeconds?}` where `status` uses the prototype's words via `sceneStatus` ("Not recorded", "2 takes", "Kept take 2", "Cut 14s"). Read takes from the SceneForge project linked by `recorderProjectId` and `recorderScenes` (read-only). Videos with no recording project return outline-only scenes. Unit-test the merge with fixtures.
- **Client:** switch `src/club/scenes.ts` to the batch endpoint: one request for every board/overview, keyed on the set of video ids (not on stage), refetched on `VIDEOS_CHANGED`, with unknown status kept distinct from zero scenes. Fixes Task 4 review I1.
- **Per-scene script:** extend the script job so it can write one scene's script (`{sceneId}`) as well as the full script, keeping the existing Undo/held behaviour.

## Task 6: Video workspace frame and Board

Port prototype `workspace.js`: `Workspace`, `Header`, `Strip`, `Foot`, `Board`, `TileHead`, `TileBody`, `ChatPanel`, and the helpers `advance`, `tabDone`, `hookItems`, `titleItems`.

- **Frame:** breadcrumb `Videos ›` (back goes where you came from), editable title, stage menu, tabs `Board · Plan · Record · Edit · Publish`, the scene strip (from `/scenes`, the same component on every tab, click a scene to focus it in the current tab), and the bottom bar: `Back to <step>`, step dots, `Continue to <step>` (primary only once the tab's job is done, per `tabDone`; continuing moves the card forward via `/move` as `advance` does). Sidebar collapses on Record and Edit.
- **Board:** free canvas of tiles with pointer drag (positions saved via Task 5), keyboard-accessible; add note, link (YouTube/Instagram/web: real `POST /research` which reads metadata), image (upload), and paste. Tile bodies per kind as in the prototype (video tile with thumbnail, stat row, outlier chip, transcript in chapters when opened; breakdown tile; signal tile; note editable in place). Remove with Undo.
- **Ask Claude about this board:** chat panel wired to Task 5, with `Use as hook`, `Use as title`, `Add to board` on returned items, and a working state while it runs.
- **Draft scenes from board:** runs the real outline job, streams progress, then opens Plan with the scenes. Redrafting over existing scenes asks first.
- The first visit shows the board how-it-works tip (Eden-style, three steps, one button), not again unless opened from `?`.
- Replace the old `VideoScreen`, `VideoBottomBar`, `plan/ResearchBoard`, `plan/TileDialog`, `plan/PlanChecklist` with the new ones (`git rm` when unused). Keep the "Plan this video first" guard behaviour: Record without a recording project shows the way back to Plan, never a Continue that does nothing.

## Task 7: Plan

Port prototype `Plan` (and `draftScenes`/`writeScript` behaviour, replaced by real jobs).

- Two columns. Left, Package: 3 title options (pick one, edit in place), thumbnail text with the draft thumb preview, hook (visual, spoken, on screen), demand/gap/show, angle, twist; `Write titles` and `Write hooks` run the real package job (whole package; the result fills only empty fields or asks before replacing). Right, Scenes: cards with title, talking points, what to show, duration; drag to reorder (and keyboard arrows), edit inline, add, remove with Undo; total length against the target; `Write full script` (real script job) and per-scene `Write script` (Task 5). Saves through `PUT /package`, `PUT /outline`, `PUT /script` with the existing conflict and held-result handling.
- `Continue to recording` creates or syncs the recording project (`POST /videos/:id/recorder`, append-only sync by stable scene ids) and moves the card.
- Replace `plan/OutlineEditor`, `plan/PackageForm` with the new Plan (`git rm` when unused).

## Task 8: Record, Edit and Publish inside the frame

- **Record:** the real embedded recorder (`ClubRecorder`, Task 9 of v1) full width inside the workspace frame, with the shared scene strip on top instead of any second scene sidebar; selecting a scene in the strip selects it in the recorder. Port the prototype `Record` layout around it: the current scene's talking points as the teleprompter panel, the big Record button (the recorder's own), take thumbnails per scene. Keep the v1 take preview (Delete take · Record another take · Continue) and the warnings card. No CreatorClub sidebar (collapsed rail).
- **Edit:** the real embedded editor full width with the "Remove pauses" card (v1), transcript right, timeline below, scene markers; no extra scene sidebar.
- **Publish:** port prototype `Publish`: export (real export, v1 `ClubExport`), chosen title, thumbnail text and description to copy (description from the package and outline; add a `description` field to `Package` if needed), paste the YouTube link, Mark as published (real `/publish`), views once known. Second person; no Samin numbers for other channels.
- The strip's statuses update after takes are kept and after pauses are removed (refetch `/scenes`).
- Remove the replaced old step components (`git rm` when unused).

## Task 9: First launch and Settings

- **Welcome** (`#/welcome`): port `docs/prototype/welcome.js` (step x of 4, why line per step, Back, Skip): 1 Connect AI (real Claude / ChatGPT connect via the existing Connect flow), 2 your channel (paste a channel → real Add channel job) or start fresh (name, topics, who it's for → Task 2 `workspaces/fresh`), 3 voice (three optional questions → real voice endpoint), 4 what's working (real trending ranked for the chosen topics; break one down → concepts → Add to my ideas → Ideas with the highlight banner). Finishing or skipping calls `/settings/welcomed`; first launch lands here when not welcomed. Replace `OnboardingScreen` and `VoiceQuestions` if superseded (`git rm` when unused).
- **Settings:** port prototype `Settings`: Connected AI (Claude, ChatGPT, optional Gemini key — existing endpoints), Channel (name, topics, audience, about, CTA, followed channels and signal sources editable), Appearance (light/dark, saved in settings).
- Overview for a brand-new channel shows `FirstSteps`.

## Task 10: Beginner walkthrough fixes

The controller walks the real app as a beginner (new channel, no YouTube channel) and as Samin, in the browser, and lists findings in `.superpowers/sdd/REBUILD/walkthrough.md`. This task fixes every P1 and P2 finding there and as many P3 as are cheap. Same constraints as above.
