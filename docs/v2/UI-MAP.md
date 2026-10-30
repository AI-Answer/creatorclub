# Where things live (CreatorClub, club mode)

One function, one place. If you are adding a control, find its place here first; if it has none, add a row here in the same change.
The design system it uses is in `recorder/app/src/club/ui/` (tokens, icons, primitives); the rules are at the end.

## The frame

| Place | What lives there | What never lives there |
|---|---|---|
| **Sidebar** (left; a rail inside a video) | The channel and its menu (switch, add a channel), Search (⌘K), the three places (Home, Discover, Videos with the number of videos in progress), then three icons with tooltips: Settings, Help (How CreatorClub works), Collapse | Anything about one video; a list of videos (Home and Videos have them); a place twice |
| **Video header** (top of a video) | Back to where the video was opened from (named: "Videos ›"), the title (click to rename), the stage (menu, Move to), the five steps, the publish date, More for this video (Copy link) | A second set of steps, a Back button |
| **Step rail** (Board · Plan · Record · Edit · Publish, in the header) | The only way between steps, ticked once a step's job is done | — |
| **Bottom bar** (a video step) | Continue to the next step, on the right; primary once the step's job is done. No bar on Publish | Back (the step rail is the way back), the steps again |
| **Scene chips** (under the header, Record and Edit only) | The scenes with their status word (Not recorded, Kept take 1…), the one scene picker | The script |
| **Companion** (docked right on every step but Edit, until Task 3b) | Ask Claude anything about the video, changes as cards you apply and undo | Buttons the page already has |
| **Sheet** (`Sheet`, slides in from the right) | Looking at one thing without leaving the page: a breakdown, an idea, the recorder's sources | Navigation |
| **Dialog** | A question before something that replaces or deletes ("Write the titles again?") | Forms that belong on the page |
| **Menu** (`Menu`) | Actions on one thing: a scene's options, a card's Move to, Write with Claude | The page's one primary action |
| **Toast** (bottom) | What just happened, with Undo when it can be undone | Errors (they stay on the page as one sentence with Try again) |

## The places

| Place | First sight | One click away |
|---|---|---|
| **Home** (`#/home`) | The next thing to do on the video you worked on last, the other videos in production with one button each, New video. A channel with nothing in production: the first-video checklist | The video |
| **Discover** (`#/discover`) | One ranked feed of what works outside: YouTube videos beating their usual and posts from X and Reddit, chips For you, Followed, YouTube, X, Reddit (with counts), one sort (the orders that fit the chip), Refresh (reads all of them, with its progress), Your ideas (a count that opens Videos). Every card has one button, Turn into idea (In ideas once it is one) | A video's breakdown (press the row), Show everything (what is off topic), Show more, Open post (under the pointer), Follow this channel (under the pointer) |
| **Videos** (`#/videos`, `/table`, `/calendar`) | Board, Table, Calendar; New video. The board's first lane is Ideas, grouped Timely, Evergreen (best rated first), Later and Skipped (folded, with counts); then Planning, Recording, Editing, Publishing, Published. An idea card has Start planning | An idea's drawer (press it), its menu (Later, Skip with a reason, Move to, Delete), Show all in a group, a breakdown from New video (a sheet) |

Old links still work: `#/overview` is Home, `#/trending` is Discover on YouTube, `#/signals` is Discover, `#/ideas?filter=later&open=…` is `#/videos?group=later&open=…`, `#/production/<view>` and `#/board` are Videos.

## The steps of a video

| Step | First sight | One click away |
|---|---|---|
| **Board** | The canvas, Add to board (note, link, file, notes folder), zoom, Draft scenes from board (primary until there are scenes), How the board works | The note writer (click a note) |
| **Plan** | Package: three title options, thumbnail text, the hook's first line. Scenes: one row each (number, title, status, length), Write with Claude, Add scene | More (what the hook shows, why it gets watched, angle, twist); a scene opened (talking points, what to show, its script, To decide, its menu: write its script, record it, move, add, delete) |
| **Record** | The scene chips, the camera preview, the one Record button for the chosen scene, the teleprompter (talking points only), the takes of that scene | The source sheet (Change), Record over or import (takes menu) |
| **Edit** | The suggestion, undo and redo, Auto-edit and style, Style & more, Export video; the preview with the transcript beside it; the timeline bar and the timeline. The scene chip that is lit is the scene under the playhead (a click on a chip moves the playhead to that scene) | Auto-edit and style, the Inspector panels and Media open in the side column |
| **Publish** | Export, Postiz (connect once), the form YouTube asks for, Publish now (primary once exported), How it will look | "I uploaded it myself" only without Postiz, or on a stuck post |

## Where a few things moved in Task 7a

- **Write titles / Write hooks / Write full script** were three buttons in Plan; they are one **Write with Claude** menu at the top of the scenes. A scene's own script is in the scene's menu.
- **Back to …** buttons in the bottom bar are gone: the step rail goes back, the header's first link goes back to where the video was opened from.
- **`[YOUR CALL: …]`** notes in older plans are no longer in the talking points, the scripts, the teleprompter or the recording's text. They are each scene's **To decide** list in Plan (folded), and they are written back as `To decide:` lines only when that outline is next saved.
- **Paste the YouTube link** in Publish is no longer a main option. It is a quiet "I uploaded it myself" when Postiz is not set up, and an open, plainly labelled form when Postiz says published but no link came back.
- **Not recorded** shows once per scene: on its chip on Record, on its row in Plan, not again in the takes card.

## Design-system rules

- **Colours** come only from `src/club/ui/tokens.css` (a test fails on a raw hex, rgb or hsl anywhere else in `src/club`, and in `src/editing-club.css` and `src/recording-club.css`, which restyle SceneForge's Edit and Record; `original-theme.css` is SceneForge's standalone theme and has no club rule). One accent (blue) for focus, selection and the primary action; red only for recording and destructive actions; green only for done; amber only for warnings and problems to fix (errors are amber, one sentence with Try again); one fixed colour per timeline kind, painted by the timeline, and marked on take chips on Record, from the same tokens (`--kind-screen`, `--kind-camera`, `--kind-audio`, `--kind-graphics`, `--kind-captions`, `--kind-zoom`, `--kind-marker`, named for TSX in `ui/kinds.ts`); neutral surfaces and text for everything else. Stage pills are neutral, Published is green.
- **Icons** come only from `src/club/ui/icons.tsx`, asked for by meaning (`add`, `close`, `record`, `split`, `marker`, `companion`…). Nothing else imports lucide-react. The prototype's picture names (`Plus`, `X`) are kept only for the files Task 5b and the companion are rewriting; the test lists them.
- **Buttons**: `Button` is `primary` (one per view), `secondary`, `quiet` or `danger`; verb first, 1–3 words. An icon-only button is an `IconButton`: its `label` is required by the type and shows as a tooltip with the shortcut.
- **Small labels** are `Chip` (`neutral`, `accent` for selected, `ok`, `warn`, `rec`, or a `kind` dot).
