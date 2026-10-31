# Creator Compiler plan

Status: product roadmap, based on the 2026-10-28 draft. The recorder/editor desktop app, rebrand, Cutroom integration, and macOS/Windows build targets now live in this repository. The broader channel/research/publishing shell below remains planned.

## What it is

One desktop app on your Mac that takes a YouTube video from idea to published: **plan it, record the scenes, edit, publish.** It runs on your own Claude or ChatGPT sign-in. No API keys.

**v1 is done when** Dani, starting from a fresh install, can do this without opening Terminal or reading docs:

1. Connect Claude.
2. Add the channel.
3. Paste a YouTube or Instagram link and pick a concept.
4. Package it and create the outline.
5. Record the scenes with talking points.
6. Remove pauses, then export.
7. Paste the YouTube link. The video is now Published.

Every pause or wrong click during that run gets fixed before anything new is added.

## Words

Users see only these words. Every label in this plan uses them.

| Word | Means | Never call it |
|---|---|---|
| Video | One card on the board, from idea to published | project, idea, card, job |
| Scene | One section of the outline, recorded on its own (Borumi's word) | part, section, segment |
| Take | One recording attempt of a scene (Borumi's word) | clip, attempt |
| Talking points | The bullets you speak from | script (unless you choose a full script) |
| Research board | The tiles you collect for one video | sources, signals, brief |

These words go away: Brief, Lane, Picked, This week, Outline ready, Make this, Copy request, Borumi (anywhere in the UI), Style video, Automate, Edit with your AI.

## Copy rules

- Buttons do the talking: verb first, 1–3 words, naming where you go next (Borumi's "Continue to Recording" pattern).
- Each step shows one short help line until you've completed that step once. Then it's gone.
- Status lines are short and past tense: "Removed 3m 12s of pauses · Undo".
- No "successfully", no "please", no exclamation marks, no raw errors. Errors say what happened and offer one button: "Couldn't reach Claude. Try again".
- Sentence case everywhere.

## Screens

### 1. First launch (three screens, no Terminal)

**Connect your AI**
- Line: "Creator Compiler uses your own Claude or ChatGPT account."
- Buttons: `Connect Claude` (primary) · `Connect ChatGPT`.
- If Claude Code isn't installed, the app installs it with a progress bar. It then runs `claude auth login`, which opens Claude's own sign-in page in your browser. The app polls `claude auth status` and shows "Connected as name@email".
- ChatGPT works the same way with `codex login`.
- Google is optional and lives in Settings: "Lets Creator Compiler watch videos with sound and motion."

**Add your channel**
- Line: "Paste your YouTube channel. We'll learn your topics and how you talk."
- Field placeholder: `youtube.com/@yourchannel`. Button: `Add channel`.
- Fills in name, handle and topics. Builds the voice guide from up to 10 of your transcripts; if there are none, it asks the three Voice DNA questions instead.
- Streams progress: "Reading your last 10 videos… Writing your voice guide…"

**Your board**
- One example video and the box "Paste a YouTube or Instagram link".
- Camera, microphone and screen permissions are asked only the first time you press Record.

### 2. Home

- **Left sidebar:** channel switcher, `Board`, `Settings`.
- **Top: Recent videos.** Up to 4 recently opened videos as thumbnails, like Borumi's "Recent projects". Each shows where it is: "Recording · 2 of 5 scenes".
- **Main area:** the board, with view tabs `Board` · `Table` · `Calendar`.
- **Board columns:** `Ideas` → `Planning` → `Recording` → `Editing` → `Publishing` → `Published`. Cards can be dragged by hand. Each card shows its title, thumbnail and a progress line ("Planning · 2 of 3").
- **First visit:** a dialog titled "How Creator Compiler works" (Eden's pattern), with three numbered steps and a small picture each: **1 Find the idea**, **2 Plan it**, **3 Record, edit, publish**. One button: `Start`. It comes back only from `?` in the sidebar.
- **Table:** one row per video, with columns title, stage, scenes recorded, publish date and views.
- **Calendar:** videos placed on their planned or actual publish date, set from the card.
- **Above the Ideas column:** the box "Paste a YouTube or Instagram link" and `Add idea`.

### 3. A video's page (same frame for every step, Borumi's layout)

```
Board › Hidden features in Claude Code                   ↶ ↷
┌ scenes ┐ ┌──────────── step content ───────────────────┐
│ 1 Hook │ │                                             │
│ 2 …    │ │                                             │
└────────┘ └─────────────────────────────────────────────┘
‹ Back to plan      Plan › Record › Edit › Publish      [Continue to editing ›]
```

- Breadcrumb on top: always one click from the board.
- Bottom bar, as in Borumi:
  - left: `‹ Back to <previous step>`
  - centre: the steps, with the current one highlighted and done ones ticked; each can be clicked
  - right: one primary button, `Continue to <next step> ›`
- Everything else on the page is quieter.
- Going back never deletes later work; it flags it ("Your outline changed after you recorded scene 3.").

## The pipeline

Each stage below lists: what you see, the one button, what happens, what's saved, and when it's done. Models are Sonnet unless noted. Costs come from the current board's logs.

### Ideas

**Break down this video**
- Input: a YouTube or Instagram link, or a dropped video file.
- Button: `Break down`.
- What happens:
  - yt-dlp downloads the video, metadata, comments and subtitles. For Instagram, if the download fails: "Instagram blocked the download. Drop the video file here instead."
  - The app samples about 20 frames.
  - Claude gets the transcript, frames, top 40 comments and stats. If Google is connected, Gemini watches the whole video instead and the result says "Watched with Gemini".
  - Progress streams: "Reading the transcript… Reading 214 comments… Finding what made it work…"
- Prompt: the board's `video-ideas` prompt, with JSON schema.
- Cost: about $0.10, 30–60 s.
- Result:
  - A stat row: the **outlier chip** ("2.84× usual views"), using Eden's method and colours (see `docs/reference/eden.md`), plus views, likes, comments and age. The channel's last 30 uploads come free from yt-dlp.
  - **Why it worked:** title and packaging, how fast the opening hooks, the structure beat by beat, what keeps people watching, and the payoff
  - **Reusable outline:** the video's shape, beat by beat
  - **Why it worked** in short (2–4 points)
  - **What viewers asked** (up to 6)
  - **3 concepts with your twist**, each with title, angle, twist, hook, demand, gap and easy-to-show
  - Each concept has `Add to board`. Nothing is added automatically.
- Saved: `breakdowns/<id>.json`.

**Add idea:** a title field and `Add`. The video lands in Ideas.

### Planning (`Plan` step: three steps shown as a checklist, one button at a time)

**1. Research**
- Line: "Collect anything that helps: links, videos, notes, screenshots."
- Research board: drop or paste links, YouTube or Instagram videos, text, images and notes. Each becomes a tile with a preview. There's no drawing.
- Video tiles look like Eden's: thumbnail, title, channel, views and the outlier chip. Opening one shows the stat row and the transcript split into chapters.
- Button: `Continue to packaging`.
- Saved: `videos/<id>/research/` (files) plus `research.json` (tiles).

**2. Package**
- Line: "Decide why this video gets clicked."
- Button: `Package it`. Claude reads the idea and research board and fills in:
  - demand, gap, easy to show (high/mid/low with a note)
  - angle, twist
  - 3 title options (7 words or fewer, 60 characters or fewer, a claim or fix, never a question)
  - 2–5 word thumbnail text
  - a hook as visual, spoken line and on-screen text
- Every field stays editable.
- Prompts: the board's `brief.md` plus the CRS `yt-titles` and `hooks` rules.
- Cost: about $0.05, 20 s.
- Saved: `videos/<id>/package.json`.
- Then: `Continue to outline`.

**3. Create outline**
- Line: "Turn this into scenes. You'll talk through each one when you record."
- Button: `Create outline`. Claude writes 4–7 scenes. Each has a title, talking points, what to show and a time budget, and the outline includes an honest-limitations beat.
- Option: `Write full script instead` (the board's script, expand and revise steps; about $0.14).
- If the video came from a break down, it follows that video's reusable outline: the structure, never the words (Eden's "Write my version").
- Prompts: the board's `outline.md` plus the CRS `outlines` honest-limitations beat.
- Cost: about $0.10, 40 s.
- Saved: `videos/<id>/outline.md`.
- Button: `Continue to recording`. This creates the recorder project (one scene per outline scene, talking points as the scene script) and opens Record.

### Recording (`Record` step, SceneForge's recorder, restyled)

- First time only: a check of camera, microphone and screen, with one line on what to fix ("Fix the camera above before recording").
- Left: scenes. Middle: talking points as a teleprompter. One big `Record scene 2`.
- Countdown → `Stop`.
- Scene cards show takes as thumbnails, as in Borumi. Clicking a take opens its preview with three choices: `Delete take` · `Record another take` · `Continue` (primary). Archive, sync and replace options move behind the gear.
- Problems (disk almost full, camera missing) show as one coloured card above the sources, as in Borumi.
- After the last scene: `Continue to editing`.

### Editing (`Edit` step)

- Opens with one suggestion: "Remove 3m 12s of pauses and repeats?" with buttons `Remove them` and `Review first`. This is SceneForge's Auto-cut, plus its optional Claude pass.
- The transcript sits on the right: select words and press Delete to cut them.
- `Ask Claude` stays, under one name only.
- The full timeline is there, with panels collapsed by default.
- Button: `Export video` (the full timeline as MP4), then `Continue to publishing`.

### Publishing (`Publish` step)

- Line: "Upload to YouTube, then paste the link here."
- Shows: the exported file (`Show in Finder`) plus the title options, thumbnail text and description from Package.
- Field: YouTube link. Button: `Mark as published`. The video moves to Published and the date is saved.

## How it's built

### Repo

```
creatorclub/
  recorder/        SceneForge (git subtree; pull fixes from samin/feat branches)
  app/             Creator Compiler shell: board, video page, onboarding, settings
  methodology/     prompt files and JSON schemas for every AI step
  docs/            PLAN.md, reference/
```

- One Electron app and one install. We reuse SceneForge's Electron main process, native Swift recording, signing and packaging.
- The React shell is new, built with Tailwind and shadcn/ui. It's light by default with a dark mode, Inter, and neutral greys with one accent.
- SceneForge's screens (Record, Edit) render inside the shell's video page and are restyled with the same tokens. Its three CSS layers collapse into one token file. Sizes under 12px are removed. `Recording.tsx` and `App.tsx` are split up first.
- The Express server keeps SceneForge's routes and gains:
  - `/api/workspaces`
  - `/api/videos`
  - `/api/breakdown`
  - `/api/plan/{package,outline,script}`
  - `/api/ai/{status,connect}`
- The board's Python scripts are rewritten in TypeScript. There's no Python and no Next.js.

### AI calls

- One module, `ai.ts`, modeled on hooklab's `claude-code.ts`:
  - spawns `claude -p --output-format stream-json --json-schema … --tools ""` with a budget cap
  - strips `ANTHROPIC_API_KEY` from the environment
  - never reads tokens or the Keychain
- The same interface runs on `codex exec --json` for ChatGPT.
- Detection, PATH fixing for apps opened from the Dock, and login checks are borrowed from Agent-Club's connectors. We don't take its ACP layer.
- Streaming events drive the progress lines. Calls survive leaving the screen: the card shows a spinner and a notice appears when done.
- Before any public release: register for OpenAI's Sign in with ChatGPT, and get a one-line OK from Anthropic.

### Data

- Workspace folder: `~/Documents/Creator Compiler/<channel>/`, holding plain files:

```
profile.json  voice.md  criteria.md  structure.md
videos/<id>/  video.json (stage, dates, links)  research/  package.json  outline.md
breakdowns/
```

- Recordings and edits stay in SceneForge's storage. `video.json` holds the recorder project ID.
- Migration: the board's `workspaces/samin/` is imported. `ideas.json` becomes `videos/*/video.json`. Status mapping: new → Ideas; picked → Planning; outline → Planning; recorded → Editing; edited → Publishing; published → Published; parked and dropped are kept as hidden "Later" and "Skipped" filters.
- Clean-up during migration:
  - set `knowledge` to `[]`
  - remove the "Jake: Promise, Proof, Plan" example from the outline prompt
  - remove the Claude Club closer lines from the voice guide, since the profile says no club CTA

## Not in v1

**v1.1 (right after the first video):**
- Signals panel with outlier charts (views compared with the channel median, growth) and X/Reddit signals using optional data keys
- hooklab titles in Package

**After that:**
- Visualize motion graphics: style from `docs/reference/motion-style.md`, rendered with hypit, HyperFrames or claude-video-effects. Check hypit's licence before shipping.
- Clips and repurposing (CRS `short-form`, `reels`, `content-cascade`, `publish-pack`)
- Blotato publishing
- A full whiteboard

## Open before building

1. **Eden study.** Done (see `docs/reference/eden.md`). It's folded into Ideas, the board and Planning below.
2. **Borumi layout.** Done (see `docs/reference/borumi.md`). The video page now uses its bottom bar.
3. **Card moves.** Eden's planner moves the item for you when the work is done ("the item moves itself"). So the proposal is that the `Continue to …` buttons also move the card. Dragging still works. Needs your yes.
4. **Gemini video.** Check during the build that the Gemini CLI accepts a video file. If it doesn't, Google becomes "paste an OpenRouter key" in Settings.
5. **First test video:** to be picked later.

## Build order (one full build, no phases for review)

1. Shell: Tailwind and shadcn, sidebar, Settings, Connect AI, the `ai.ts` module.
2. Workspace files, Add channel, voice guide, and Samin migration.
3. Board, Table, Calendar and Recent videos.
4. Video page frame with the step bar.
5. Break down this video.
6. Research board, Package, Create outline, and the hand-off into the recorder.
7. Recorder and editor restyle, simpler take flow, the Remove pauses suggestion.
8. Publish step.
9. Run the acceptance test end to end, fix whatever confuses, then Dani's own run.

## References

- `docs/reference/borumi.md`: Borumi's flow and wording
- `docs/reference/current-board.md`: every label in the current board, what's confusing, what to keep
- `docs/reference/sceneforge-ux.md`: the same for SceneForge, plus the restyle path
- `docs/reference/methodology-sources.md`: which prompt powers which step, costs, conflicts
- `docs/reference/motion-style.md`: the motion-graphics style spec (for Visualize, later)
