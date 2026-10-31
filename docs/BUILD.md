# CreatorClub v1 build plan

Spec: `docs/PLAN.md` is binding. It contains every screen, label and flow. References are in `docs/reference/`.
Branch: `build/v1`. App root: `recorder/app` (Electron, React 19, Vite, Express 5, TypeScript).

## Global constraints

**Where the code goes**
- There is one package and one app. CreatorClub code lives inside SceneForge's app:
  - `recorder/app/src/club/` for the UI
  - `recorder/app/server/club/` for the server
  - `recorder/app/shared/club.ts` for shared types
  - `methodology/` at the repo root for prompt files and JSON schemas
- Ruling: this replaces the top-level `app/` folder in PLAN.md, because two packages would mean two Vite builds and two Electron entries.

**Language and dependencies**
- TypeScript only. No Python, no Next.js.
- Server routes are mounted under `/api/club/*`.
- Node APIs only, plus the existing dependencies. New dependencies are allowed only where a task names them.

**Tests**
- Use the existing runner: `npm test` (`tsx --test`), with test files named `*.test.ts` next to the code.
- Every task adds tests for its server logic.
- UI tasks must pass `npm run build` (that's `tsc --noEmit` plus the Vite build).

**AI**
- All AI calls go through `server/club/ai.ts`. It never reads tokens, the Keychain or credential files.
- It removes `ANTHROPIC_API_KEY` from the child process environment.
- There are no API keys anywhere in the UI.

**Data**
- The workspace root is `~/Documents/CreatorClub`. The env var `CREATORCLUB_DIR` overrides it, and tests always set it to a temp directory.
- One folder per channel, holding plain JSON and Markdown files. The layout is in PLAN.md under "Data".
- SceneForge's own storage is left untouched.

**Words in the UI**
- Only these words: Video, Scene, Take, Talking points, Research board.
- Never show: Brief, Lane, Picked, Project (use "video"), Borumi, Style video, Automate, "successfully", "please", or exclamation marks.
- Sentence case everywhere.
- Buttons are verb first, 1–3 words, and name the next place ("Continue to recording").
- Every button label and help line copies PLAN.md exactly where PLAN.md gives one.

**Look**
- Tailwind v4 plus shadcn-style primitives in `src/club/ui/`.
- Light theme by default, dark via `[data-theme=dark]`.
- Inter font. Warm off-white page (`#FAFAF8`), white cards with 12px radius and a 1px hairline border, black primary buttons, one accent (`#2F6FEB`) for selection.
- No text smaller than 12px.
- At most one primary button per screen.
- Errors are one sentence plus one `Try again` button. Raw errors never appear.

**Process**
- Commit with clear messages ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Don't push. Don't touch git config.

## Task 1: Foundation shell and design system

**Goal:** the CreatorClub shell becomes the app's root, and SceneForge's editor can be embedded for one video.

**Tailwind and the design system**
- Add Tailwind v4 through `@tailwindcss/vite` (allowed new dependencies: `tailwindcss` and `@tailwindcss/vite`).
- Put the tokens from Global constraints in `src/club/club.css`. Scope the Tailwind preflight so it doesn't break SceneForge's existing CSS: preflight applies only inside `.club-root`.
- Add the Inter font. Load it locally through the `@fontsource-variable/inter` dependency (allowed); no CDN.

**UI primitives** (`src/club/ui/`)
- `Button` with variants primary, secondary and ghost, and sizes sm and md
- `Input`, `Textarea`
- `Card`
- `Dialog` (built on native `<dialog>`, no Radix)
- `Tabs`
- `Badge`
- `Spinner`
- `EmptyState`
- `OutlierChip`: shows a multiplier and colours it by Eden's bands (grey <1, blue 1–3, green 3–5, amber 5–10, orange 10–50, red 50+). Two decimals under 10×, rounded from 10× up, e.g. "2.84×" and "23×".

**`ClubApp.tsx` as the new root**
- `src/main.tsx` renders `ClubApp` instead of `App`.
- Layout:
  - **Left sidebar** (240px): channel switcher at the top (placeholder until Task 4), then nav `Board` and `Settings`, and a `?` button at the bottom.
  - **Main area:** the current route.
- Routes are kept as simple state (no router library): `board`, `video/:id/:step`, `settings`, `onboarding`. They sync to `location.hash` so a reload keeps your place.

**Embedding SceneForge**
- Refactor `src/App.tsx` minimally so it accepts optional props `embedded?: {projectId: string; mode: 'Record'|'Edit'; onBack(): void}`.
- When embedded, it:
  - opens that project
  - hides SceneForge's Home, titlebar brand, Projects button and its own Script/Record/Edit step bar
  - forces the given mode
- Without the prop it behaves exactly as before. Existing tests must still pass.
- Export a `ClubRecorder` wrapper in `src/club/ClubRecorder.tsx`.

**Placeholder screens**
- `BoardScreen`, `VideoScreen` and `SettingsScreen`, each built from `EmptyState`, so routing can be clicked through.
- `VideoScreen` renders the PLAN.md frame: a breadcrumb `Board › <title>` and the bottom bar (`‹ Back to …` on the left, steps `Plan › Record › Edit › Publish` in the centre, a primary `Continue to … ›` on the right). It uses mock data for now. The bar is a reusable component, `VideoBottomBar`.

**Done when**
- `npm run build` passes.
- `npm test` passes.
- `npm run dev` shows the shell at `http://127.0.0.1:4173`.

## Task 2: Shared types, workspace storage, club router, AI runner

**Types** in `shared/club.ts`:
- `Workspace`: slug, name, handle, channelUrl, topics, about, cta, createdAt
- `VideoStage`: `'ideas'|'planning'|'recording'|'editing'|'publishing'|'published'`
- `Video`:
  - id, title, stage, order, createdAt, updatedAt, stageDates
  - `source?: {kind:'breakdown'|'manual'; breakdownId?: string}`
  - `concept?`: angle, twist, hook, demand, gap, show, each `{level:'high'|'mid'|'low'; note}`
  - `planning: {research:boolean; package:boolean; outline:boolean}`
  - `recorderProjectId?`, `publishDate?`, `youtubeUrl?`, `publishedAt?`
  - `hidden?: 'later'|'skipped'`
- `ResearchTile`: id, kind `link|video|text|image|note`, url?, title?, text?, file?, meta (views, channel, multiplier, thumbnail), createdAt
- `Package`: demand, gap, show, angle, twist, `titles: string[3]`, `thumbnailText`, `hook: {visual; spoken; text}`
- `Outline`: `scenes: {title; talkingPoints: string[]; show: string; seconds: number}[]`, `fullScript?: string`
- `Breakdown`:
  - id, url, platform, `video` meta (title, channel, views, likes, comments, ageDays, thumbnail, multiplier?), createdAt
  - `whyItWorked`: titlePackaging, hookSpeed, structure (beats), retention, payoff, short[]
  - `reusableOutline: string[]`
  - `viewerQuestions: {question; likes}[]`
  - `concepts`: title, angle, twist, hook, demand, gap, show, why

**Storage** in `server/club/store.ts`:
- Resolves the root as in Global constraints.
- Functions:
  - `listWorkspaces`, `readWorkspace`, `writeWorkspace`
  - `listVideos`, `readVideo`, `writeVideo`, `moveVideo(id, stage)`, which records `stageDates[stage]`
  - research tile CRUD, with tile files kept in `videos/<id>/research/`
  - `readJSON` and `writeJSON` with atomic writes (temp file, then rename)
- File layout as in PLAN.md "Data".
- The current workspace is stored in `<root>/settings.json`.

**Router** in `server/club/index.ts`, mounted in `server/index.ts` at `/api/club`:
- `GET/POST /workspaces`
- `GET/PUT /workspaces/:slug`
- `POST /workspaces/:slug/current`
- `GET/POST /videos`
- `GET/PUT/DELETE /videos/:id`
- `POST /videos/:id/move {stage}`
- `GET/POST/DELETE /videos/:id/research[/tileId]`, with multer for file tiles

All routes are scoped to the current workspace.

**AI runner** in `server/club/ai.ts`:
- `aiStatus()` returns, for each of `claude` and `codex`: `{installed, version, signedIn, account?}`.
  - Detection checks `PATH` plus the common locations `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` and `~/.claude/local`, because apps opened from the Dock have a minimal PATH.
  - Claude login comes from `claude auth status`; Codex from `codex login status`.
- `runAI({provider='claude', prompt, system?, jsonSchema?, model='sonnet', budgetUsd, images?, onEvent})`:
  - Claude: spawns `claude -p --output-format stream-json --verbose --model <m> --max-budget-usd <b> --tools ""`, adding `--json-schema` when a schema is given.
  - Codex: spawns `codex exec --json`, adding `--output-schema` when a schema is given.
  - Streams progress events to `onEvent` and resolves with `{text, json?, costUsd?}`.
  - Images are passed as file paths named in the prompt, with read access to that folder only (Claude: `--add-dir <dir> --allowedTools Read`).
- Long jobs: `server/club/jobs.ts` keeps an in-memory job registry. `POST` starts a job and returns its id; `GET /api/club/jobs/:id/events` streams Server-Sent Events, so UI progress survives navigation.

**Tests**
- Storage round-trip and moves.
- Router happy paths, using supertest-free plain `fetch` against an ephemeral `app.listen(0)`.
- `ai.ts` with a fake `claude` script on a temp PATH that emits stream-json lines. This also checks that `ANTHROPIC_API_KEY` is removed.

## Task 3: Connect AI, first launch, Settings

**First launch** (route `onboarding`): shown when there's no workspace or no connected AI. It has three screens with the exact copy from PLAN.md "1. First launch".

**Connect your AI**
- Two buttons, `Connect Claude` (primary) and `Connect ChatGPT`. Each calls `POST /api/club/ai/connect {provider}`.
- **Claude:**
  - If the CLI isn't installed, run the official installer `curl -fsSL https://claude.ai/install.sh | bash` and show a progress bar with streamed lines.
  - Then spawn `claude auth login`, which opens the browser.
  - Poll `aiStatus` every 2 s until signed in, then show "Connected as <account>".
- **Codex:** if missing, `npm install -g @openai/codex` (show the progress), then `codex login`.
- If install fails, show one line plus `Try again`. Never ask for a key.

**Add your channel:** the UI only, calling Task 4's endpoint. Until that exists it calls `POST /api/club/workspaces` with `{channelUrl}` and shows the streamed job progress.

**Your board:** go to `board` and open the first-visit dialog (Task 5 builds the dialog; a placeholder is fine here).

**Settings** (route `settings`), Notion-style sections:
- **Connected AI:** cards for Claude, ChatGPT and Google. Google is marked "Optional: lets CreatorClub watch videos with sound and motion." Each card has a status and `Connect` or `Reconnect`. Google runs the Gemini CLI login (`npx @google/gemini-cli` is not allowed); if `gemini` isn't installed, the button installs it via `npm install -g @google/gemini-cli`.
- **Default AI:** Claude or ChatGPT.
- **Channel:** name, handle, topics, about, and `Rebuild voice guide`.
- **Appearance:** System / Light / Dark.

**Tests** for the connect route state machine, using a fake CLI.

## Task 4: Workspaces, Add channel, voice guide, Samin migration

**`POST /api/club/workspaces {channelUrl}`** starts a job that:
1. Normalises the handle.
2. Uses `yt-dlp` to get the channel name, topics (from video titles and tags), and the last 30 uploads (id, title, views, date), saved to `channel.json`.
3. Fetches subtitles for up to 10 recent videos (`yt-dlp --skip-download --write-auto-subs --sub-format json3`), stored in `own-channel/transcripts/`.
4. Writes `voice.md` with `runAI`, using `methodology/voice.md` (Task 6 writes it; copy the board's `prompts/voice.md` in now if Task 6 hasn't landed).
5. Falls back to the three Voice DNA questions when there are no transcripts. The UI shows them as a small form.

yt-dlp and ffmpeg are found the same way as the CLIs in Task 2. If yt-dlp is missing, the job downloads the official standalone binary from `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos` into `<root>/.bin/`.

**Channel switcher** in the sidebar: lists workspaces and offers `Add channel`.

**Migration:** `server/club/migrate-board.ts` plus an npm script, `npm run club:migrate -- <path-to-board-workspace>`.
- Imports `profile.json`, `voice.md`, `criteria.md`, `structure.md` and `ideas.json` into a workspace.
- Status mapping comes from PLAN.md ("Migration"). Each idea's `videos/<ideaId>/` outline, if present, becomes `outline.md`.
- Clean-up:
  - set `knowledge` to `[]`
  - drop every line in `voice.md` that mentions "Claude Club"
  - remove "Jake" and "Ed" references from migrated outlines
- Source: `~/dani/youtube-knowledge-vault/clients/samin/board/workspaces/samin`. Read-only; never modify the source.

**Tests:** normalising handles, migration mapping and the clean-up, run on a fixture copy.

## Task 5: Board, Table, Calendar, Recent videos

**Board screen**
- **Header:** the channel name as a bold heading, view tabs `Board` · `Table` · `Calendar`, and a primary `+ New video`.
- **Recent videos row:** up to 4 cards (thumbnail, title, a status line like "Recording · 2 of 5 scenes").
- **Board view:**
  - six columns, using PLAN.md's names
  - drag and drop between and within columns, with HTML5 drag; moves call `/move`
  - each card shows title, thumbnail, and a progress line ("Planning · 2 of 3")
- **Above Ideas:** a "Paste a YouTube or Instagram link" field with a `Break down` button (calls Task 7's endpoint; until then it's disabled with a one-line note), plus `Add idea`, which creates a video in Ideas.
- **Hidden filters:** `Later` and `Skipped` as quiet toggles.
- **Table:** title, stage, scenes recorded, publish date, views. Click a row to open the video.
- **Calendar:** a month grid showing videos on their `publishDate` or `publishedAt`. Drag a video onto a day to set `publishDate`.

**First-visit dialog "How CreatorClub works":**
- three numbered steps with small inline SVG pictures: **1 Find the idea**, **2 Plan it**, **3 Record, edit, publish**
- a one-line body under each step
- the button `Start`
- After the first visit it reopens only from the sidebar `?`. Store the "seen" flag in the workspace's `settings.json`.

**Undo toast:** on every move, "Moved to Recording · Undo", lasting 6 s.

**Tests:** build passes, plus unit tests for the grouping, sorting and calendar helpers.

## Task 6: Methodology prompts and schemas

**Prompt files.** Create `methodology/` with:
- `breakdown.md`
- `package.md`
- `outline.md`
- `script.md`, `expand.md`, `revise.md`
- `voice.md`
- `ref/hook-library.md` and the other reference patterns

Each step that returns structured data gets a matching JSON schema: `breakdown.schema.json`, `package.schema.json`, `outline.schema.json`.

**Sources** (see `docs/reference/methodology-sources.md`):
- the board prompts at `~/dani/youtube-knowledge-vault/clients/samin/board/prompts/`, and `scripts/video-ideas.py` for the break down prompt
- the CRS rules (titles: 7 words or fewer, 60 characters or fewer, never a question; hooks as visual, spoken and text; the honest-limitations beat)

**Clean-up:** remove every Jake Trinder and Ed Lawrence reference and the `knowledge/` folder; don't copy them.

**What each step returns**
- **Break down:** Eden's breakdown sections plus the reusable outline, viewer questions and 3 concepts (shape from Task 2 `Breakdown`).
- **Outline:** 4–7 scenes, each with talking points and a time budget at 140 words per minute. If a reusable outline is given, follow its shape, never its words.

**Assembly** in `server/club/prompts.ts`: `buildBreakdownPrompt`, `buildPackagePrompt`, `buildOutlinePrompt`, `buildScriptPrompt`, `buildVoicePrompt`.
- They take workspace data (profile, voice summary, criteria, CTA rule) and return `{prompt, schema}`.
- They load the files from `methodology/` (path resolved from the repo root, overridable via env for packaging).

**Tests:** snapshot-like assertions that the prompts include the required sections and exclude "Jake", "Ed Lawrence" and "Claude Club"; all schemas parse.

## Task 7: Break down this video

**`POST /api/club/breakdowns {url | file}`** starts a job that:
1. Detects the platform (YouTube or Instagram).
2. Uses yt-dlp to fetch metadata, the top 40 comments (`--write-comments`, with `--extractor-args "youtube:max_comments=40,all,0,0"`) and json3 subtitles, then downloads a 480p video (YouTube needs the `mweb` client to avoid 403s).
3. For Instagram, if the download fails, ends with the message "Instagram blocked the download. Drop the video file here instead."
4. Samples 20 frames with ffmpeg into the breakdown folder.
5. Computes the outlier multiplier: views divided by the median of the channel's last 30 uploads (from a yt-dlp flat playlist), using Eden's method without the follower adjustment.
6. Transcribes with whisper-cli if there are no subtitles.
7. Calls `runAI` with the Task 6 prompt and schema, Claude reading the frames.
8. If Google is connected and `gemini` accepts video, uses it to watch the full video and tags the result `watchedWith: 'gemini'`. Otherwise it uses Claude and frames.

Progress messages are the exact PLAN.md ones. Results are saved to `breakdowns/<id>/breakdown.json`.

**UI**
- A dialog or page showing:
  - the stat row: `OutlierChip` with "usual views", plus views, likes, comments and age
  - the sections: Why it worked, Reusable outline, What viewers asked, 3 concepts
- Each concept has `Add to board`, which creates a video in Ideas with `source.breakdownId` and the concept fields. Nothing is added automatically.
- Also: the `Break down` box on the board, and dropping a video file onto it.

**Tests:** URL detection, multiplier and median maths, the yt-dlp argument builder, and job flow with a fake yt-dlp and a fake claude.

## Task 8: Video page, Planning steps, hand-off to the recorder

**`VideoScreen`**
- The real frame: breadcrumb, scene list on the left (when an outline exists), content in the middle, and `VideoBottomBar`.
- Steps `Plan › Record › Edit › Publish`, mapped to stages: planning → Plan, recording → Record, editing → Edit, publishing and published → Publish. Ideas opens Plan.
- **Ruling (approved by Dani):** the `Continue to …` buttons also move the card to the next stage. Dragging still works.

**Plan step:** a checklist with three steps, showing one primary button at a time, using PLAN.md's exact copy.
1. **Research:**
   - the research board: a responsive tile grid, with paste or drop for links, YouTube/Instagram videos, text, images and notes
   - YouTube tiles fetch meta and the outlier chip through Task 7's helpers
   - opening a tile shows its details, and the transcript for videos
   - `Continue to packaging`
2. **Package:**
   - `Package it` runs the package prompt and streams progress into editable fields
   - `Continue to outline`
3. **Create outline:**
   - `Create outline` runs the outline prompt, following the breakdown's reusable outline when the video came from a breakdown
   - the scenes are editable: title, talking points, what to show
   - the option `Write full script instead`
   - `Continue to recording` creates the recorder project: one scene per outline scene, with the talking points joined as the scene `script`, through SceneForge's existing project API in `server/storage.ts`. It saves `recorderProjectId`, moves the video to Recording, and opens Record.

**Record and Edit steps** render `ClubRecorder` (Task 1) inside the frame.

**Help lines:** each step shows its one-line help until that step is first completed (a flag per workspace), then never again.

**Going back:** if an earlier step changes after recording, show "Your outline changed after you recorded scene N."

**Tests:** stage↔step mapping, creating the recorder project from an outline (server-side), and build.

## Task 9: Recorder restyle and simpler take flow

**Restyle SceneForge's Record screen** to the CreatorClub tokens when it's embedded (`.club-root` scope):
- Calmer sources panel: switch, device, gear and preview.
- The scene list shows takes as thumbnails ("Take 1 (00:07)").

**Take preview**
- The header shows the take name and a status badge.
- Exactly three bottom actions: `Delete take` (danger, left), and `Record another take` plus primary `Continue` (right).
- Archive, sync, replace and keep-both move into the gear menu. The code paths are unchanged.

**Warnings:** any source problem or low disk space shows as one coloured card at the top of the sources column. Low disk means under 10 GB free (check with `fs.statfs`).

**First recording:** a pre-flight line, "Fix the camera above before recording", when a source isn't ready.

**After the last scene:** primary `Continue to editing`, wired through the bottom bar.

**Done when:** existing recorder tests pass and the build passes. Don't change any native or Electron recording code.

## Task 10: Editor restyle, Remove pauses suggestion, Publish step

**Edit (embedded)**
- **On first open,** run SceneForge's existing auto-cut plan in the background (`QuickActions` / `server/automation-plans.ts`) and show one suggestion card: "Remove 3m 12s of pauses and repeats?" with `Remove them` (applies all cuts) and `Review first` (opens the existing review dialog). The duration comes from the plan.
- **Calmer layout:** inspector panels are collapsed by default, and the rail shows labelled icons.
- **One AI entry point,** labelled `Ask Claude`. Remove `Edit with your AI` and `Automate` from the visible UI.
- **No "Borumi" anywhere** in the embedded UI. Hide the Borumi export entries.
- `Export video` exports the full timeline as MP4 through the existing export API, then shows `Continue to publishing`.

**Publish step**
- The line "Upload to YouTube, then paste the link here."
- The exported file with `Show in Finder` (Electron `shell.showItemInFolder` through the existing preload, or a server route that runs `open -R`).
- Title options, thumbnail text and hook from `package.json`, each with a copy button.
- A YouTube link field and the primary `Mark as published`. It saves `youtubeUrl` and `publishedAt` and moves the video to Published.

**Tests:** build, and the publish route.
