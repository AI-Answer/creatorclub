# CreatorClub redesign brief (2026-10-29)

Dani's verdict on v1: the light style is right, but the UX doesn't work. Too much is missing, screens feel empty, there's no coherence, nowhere to gather things, and it's rigid. This brief is the binding input for the clickable prototype.

## What it must feel like

- **Styling:** cal.com / Notion light. Warm off-white page, white cards, crisp hairlines, Inter, black primary buttons, one blue accent, generous but dense-enough layout. Rich content everywhere: real thumbnails, numbers, chips, avatars. Nothing grey and empty.
- **One mental model, coherent everywhere:** a **channel** has **videos**. A video is built from **scenes**. Scenes are the spine that runs through planning, recording, editing and publishing. A scene's status ("not recorded", "2 takes", "kept take 2", "cut 14s") is visible wherever the video appears.
- **A board to gather things.** Each video has a free board (Eden board / Poppy canvas) where everything about it gathers: the source breakdown, YouTube and Instagram references, links, notes, screenshots, signals, comments. You drop, paste and arrange freely, and Claude can be asked about the whole board.
- **Not rigid.** No wizard accordions. Things are editable in place. Package and Outline are documents you edit like Notion. Scenes are cards you can reorder and edit inline. AI actions are buttons beside the thing they change ("Write hooks", "Draft scenes from board"), not gates.
- **Never empty.** Every screen shows real content. If something hasn't happened yet, it says what to do next, with the one button that does it.

## Screens the prototype must cover (clickable, real Samin data)

1. **Home: Overview**
   - "Pick up where you left off" (recent videos, with scene progress)
   - What's in production
   - Next-up ideas
   - "Working now": trending outlier videos, with outlier chip, views per day and thumbnail
   - Latest signals
2. **Ideas**
   - Rich idea cards: thumbnail or source thumbnail, title, the angle/twist/hook, demand/gap/easy-to-show chips, why, source, outlier chip.
   - Paste a link to break a video down; the breakdown result shows inline.
   - Filters for New, Later and Skipped.
3. **Working now (Trending)**
   - A grid of outlier videos from followed channels: thumbnail, channel, title, multiplier chip, views/day, age.
   - "For Samin / Followed / All" filter, sort by views per day, total views or growth.
   - Each video can be broken down, or turned into an idea.
4. **Signals**
   - X and Reddit posts as cards: author, text, likes, replies, age.
   - "Turn into idea" on each.
5. **Production board**
   - Kanban across Ideas → Planning → Recording → Editing → Publishing → Published, plus Table and Calendar views.
   - Cards show the thumbnail, scene progress dots and the next action.
6. **Video workspace** (the heart of the app). Top: breadcrumb, title (editable), stage, and tabs or a segmented control `Board · Plan · Record · Edit · Publish`. The scene strip stays consistent across all of them.
   - **Board:**
     - a free canvas of tiles: source breakdown card, reference videos, notes, links, images, signal posts
     - "Ask Claude about this board" chat panel
     - "Draft scenes from board" button
   - **Plan:** a two-column document.
     - Left, Package: 3 title options you can pick or edit, thumbnail text, hook (visual, spoken, on-screen), demand/gap/show, angle and twist.
     - Right, Scenes: cards with title, talking points, what to show and duration. Each can be dragged, edited inline, added or removed. The total length is shown against the target.
     - "Write full script" for the whole video, or per scene.
   - **Record:** full width, Borumi-like.
     - The scene strip with take thumbnails, the current scene's talking points as a teleprompter, and a big Record button.
     - Take preview: Delete take · Record another take · Continue.
     - No CreatorClub sidebar.
   - **Edit:** full-width editor.
     - The "Remove 3m 12s of pauses and repeats?" card, the transcript on the right, the timeline below, scene markers.
     - No extra scene sidebar.
   - **Publish:** a clean checklist.
     - Export, then the chosen title, thumbnail text and description to copy, then paste the YouTube link, then Mark as published. Show views once published.
7. **Settings:** Connected AI (Claude, ChatGPT, optional Gemini key), Channel, Appearance.

## Navigation

- **Left sidebar:** channel switcher, `Overview`, `Ideas`, `Working now`, `Signals`, `Production`, then `Settings`.
- Inside a video the sidebar can collapse, so Record and Edit get full width.

## Words

Video, Scene, Take, Talking points, Board. No "Project", "Brief" or "Lane".

## Data (real, read-only)

- Videos: `~/Documents/CreatorClub/samin/videos/*/video.json` (+ `outline.md`, `package.json` where present), `profile.json`, `voice.md`.
- Trending: `~/dani/youtube-knowledge-vault/clients/samin/board/workspaces/samin/trending.json`. 52 items with videoId, title, channel, views, likes, comments, ageDays, vpd, mult, history and fit. Thumbnails come from `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg`.
- Signals: same folder, `signals.json`. 115 items with source, author, handle, text, url, likes, replies, views and ageHours.
- Breakdown jobs: same folder, `jobs/*.json`. Each has `result.whyItWorked`, `viewerQuestions` and `concepts`.

References: `docs/reference/eden.md`, `docs/reference/borumi.md`, `docs/reference/current-board.md` (the old board's features and what to keep), cal.com's booking/dashboard look.
