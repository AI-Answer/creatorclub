# CreatorClub redesign prototype

A clickable, high-fidelity prototype of the redesigned UI, built from `docs/redesign-brief.md` plus Dani's addition (first launch for a beginner with no channel). It uses Samin's real data, read-only.

## How to open

- Double-click `index.html` (file://), or serve the folder: `cd docs/prototype && python3 -m http.server 8000`, then open http://localhost:8000.
- Needs internet for the CDN scripts (React 18.3.1, htm 3.1.1, lucide 0.460.0), Inter, and YouTube thumbnails.
- The first open lands on `#/welcome`. "Skip setup", or finishing it, remembers that in localStorage. After that the empty hash goes to `#/overview`.
- Everything is in memory: reload resets the data. Theme is the only setting kept.

## Screens (every one has its own link)

| Screen | Route |
|---|---|
| First launch, 4 steps (AI → channel or start fresh → voice → what's working → first idea) | `#/welcome` |
| Overview (for Samin, and a guided version for a brand-new channel) | `#/overview` |
| Ideas: New / Later / Skipped, paste a link to break it down inline, idea drawer | `#/ideas`, `?filter=later`, `?bd=<videoId>`, `?open=<id>`, `?new=<id>` |
| Working now: For Samin / Followed / All, sort by per day / total / growth | `#/trending` |
| Signals: X and Reddit, Turn into idea | `#/signals` |
| Production: Board / Table / Calendar | `#/production`, `/table`, `/calendar` |
| Video workspace: Board · Plan · Record · Edit · Publish | `#/video/<id>/<tab>` |
| Settings: Connected AI, Channel, Appearance | `#/settings` |

Good videos to open: `hidden-features` (Recording, full board, 6 scenes, takes), `idea-1a179c8273f-1` "Still using Claude like it's 2024?" (Editing, full transcript), `idea-1a179c8273f-2` (Planning, no scenes yet: try "Draft scenes from board"), any `yt-<id>` (Samin's real published videos).

## Design decisions

1. **Scenes are the spine.** One scene strip under the video header, with the same status words everywhere ("Not recorded", "2 takes", "Kept take 2", "Cut 14s"). Reordering in Plan, keeping a take in Record and removing pauses in Edit all update the same strip, the progress dots on Production cards and the Overview resume cards.
2. **One frame per video, Borumi-style.** Breadcrumb, editable title, stage menu and `Board · Plan · Record · Edit · Publish` on top. The bottom bar always has `Back to <step>`, the step dots, and `Continue to <step>`. That button is the primary only once the step's own job is done, so each view has one primary. The sidebar collapses to an icon rail in Record and Edit.
3. **Nothing is a gate.** Package and scenes are edited in place, like Notion. AI actions sit beside what they change ("Write titles", "Write hooks", "Write full script", "Draft scenes from board"). Nothing is overwritten silently: redrafting asks first, deletes and moves offer Undo, and every empty state names the next step with the one button that does it.
4. **Real content first.** Real thumbnails, Eden outlier chips (grey <1, blue 1–3, green 3–5, amber 5–10, orange 10–50, red 50+; two decimals under 10×), views per day, avatars. Videos in production show a draft thumbnail built from their thumbnail text, so they look different from source videos.
5. **The beginner path never dead-ends.** It shows step x of 4, a "why" line on every step, Back, and Skip. Starting fresh asks for your name, topics, who it's for and three optional voice questions. It then shows real outliers. Breaking one down gives 3 concepts. "Add to my ideas" lands on Ideas with the new idea highlighted and a banner: "Open it and start planning". Overview for a channel with 0 videos becomes a first-video checklist.

## Data

- **Real, as a snapshot in `data.js`:**
  - the 29 videos, the profile and the voice-guide summary from `~/Documents/CreatorClub/samin`
  - the 52 trending videos, the 115 signals and the 3 finished breakdown jobs from the vault workspace
  - Samin's 9 real published videos with their view counts (own-channel transcripts)
- **Written for the prototype (`content.js`), in line with Samin's outlines and voice guide:**
  - title options and thumbnail text for each video
  - packages for the three videos in production
  - scenes and takes for "Hidden features" and "Still using Claude"
  - the edit transcript with pauses and repeats
  - the "Hidden features" board layout
  - Claude's chat replies
  - the first-launch questions
- **Outlier chips:** shown only where the source has a multiplier. Breakdowns add "× your usual" against Samin's stated 49.5K usual views.

## What's simulated

- Connecting Claude or ChatGPT, reading a channel, breaking a video down (the progress steps then the real job result), and every AI action (canned output after a short delay).
- **Videos with no breakdown job:** "Break down" says the breakdown is running in the background.
- **Recording:** a 3-2-1 countdown, a live timer, a mic meter and a take whose length is the real elapsed time. The camera and screen are drawn in CSS.
- **Edit and Publish:** playback, export progress and views after publishing are timers. "Show in Finder" and the clipboard copy are real where the browser allows them.
- **Drag and drop:** board tiles and scene reordering use pointer events, and keyboard arrows also reorder scenes. Production cards use native drag and drop.

## Verified

- Served locally and opened every route (31, including bad ids), with no console errors under the React development build.
- **Flows walked:**
  - welcome, both paths
  - breakdown → add idea
  - idea → board → draft scenes → plan
  - board drag, note, image and chat
  - plan reorder and full script
  - record → take preview → keep
  - edit review → remove → undo
  - publish export → copy → link → mark published → views
  - palette (⌘K), New video, How it works, dark theme
- **Not checked:** file:// in a real browser. The page uses only classic script tags and no fetch, so it should work. Phone width is also not checked; the layout is desktop first, for 1280–1600 px.

## Fixes after audit (UX-AUDIT.md, beginner walkthrough)

All P1 and P2 findings are fixed, plus every P3.

- **Personalisation.** Breakdowns, concepts and the idea fields built from them are rewritten in second person for any channel that isn't Samin's (`JOB_YOU` in `content.js`, applied by `jobFor()` in `core.js`). That covers why it worked, angle, twist, why, and the demand/gap/show notes. Text is filled from the active profile: `{aud}` becomes "small-business owners". Package angle/twist and the drafted scene talking points inherit it. A new user never sees Samin's name or his 49.5K usual: the breakdown header says "Concepts for you", and on Publish there is no "your usual pace" chip and no "Watch next" to his video. Samin's own channel still shows his original text and numbers.
- **One multiplier per video.** The thumbnail chip and the stat row show the same number, always labelled "vs <creator>'s usual". Samin's own published videos say "vs your usual". The removed number was the separate "× your usual" figure based on Samin's views.
- **Chips are consistent.** Working now, first-launch step 4 and the Overview "Start here" cards show a grey "—" chip when a channel's usual isn't tracked. Working now has a one-line legend for the colours.
- **Relevance.** Working now ("For <name>"), the Overview strips, first-launch step 4 and Signals are matched to the user's topics. Matching uses a keyword map per topic, and the user's own words for custom topics. Each matched card says "Because you picked AI agents". Anything off-topic sits behind "Show everything (N more, not about your topics)".
- **Ready videos only in first launch.** Step 4 offers only videos that can be broken down now. Other on-topic outliers are marked "Not broken down yet" and can't be clicked.
- **Board placement.** New tiles (note, link, image, a reply from Claude) land in the nearest free space to the middle of the view, never on top of another tile, then scroll into view.
- **Ask Claude replies have actions.** Each reply has "Add to board" (as a note). Hooks get "Use as hook", which sets the spoken hook in Plan, with Undo. A new suggestion, "Suggest three titles", gives titles with "Use as title", which fills an empty title slot (or the chosen one) and selects it, with Undo.
- **Video navigation.**
  - The top left has a back arrow to wherever you came from (Ideas, Overview, Production…), then a stable "Videos ›" breadcrumb.
  - The bottom bar has only Back and Continue. On Board, Back says "Back to ideas" (or wherever you came from).
  - The steps live only in the top tabs.
- **Working now card.** The secondary action is an icon button ("Make it an idea" as its tooltip and aria-label), so "Break down" is never truncated.
- **First launch.**
  - Sign-in copy now reads "Opens Claude's or ChatGPT's own sign-in page", with a Cancel button while waiting.
  - Steps 1–3 are centred vertically.
  - The choice cards and fields have accessible labels.
  - A labelled "Not about AI? Type your own topic" field adds custom topics as chips.
  - The single-select tone chip shows a check.
  - The fresh channel stores who it's for, so `{aud}` resolves.
- **Small copy.** "1 video in production" is pluralised. The empty thumbnail-text field shows a small italic placeholder ("Empty. Type 2 to 5 words…"), so it doesn't read as filled.

Re-walked as "Maya":
1. Starting fresh, AI agents + AI for small business + a custom topic, small-business owners.
2. Step 4: the InsideAI video ranked first, with "Because you picked AI agents".
3. Break this down, then Add to my ideas. Ideas showed the highlighted idea.
4. Open it and start planning.
5. On the board:
   - Two notes and an image, all in free space and in view.
   - Ask Claude, then Use as hook (Plan shows it) and Add to board.
6. Draft scenes from board, then Plan, then Record.

No page or attribute contained "Samin" for Maya, and there were no console errors under the React development build. Switching to Samin's channel still shows his real breakdown text, "Concepts for Samin", his own videos and his views.
