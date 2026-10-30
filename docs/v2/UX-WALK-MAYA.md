# UX walk, brand-new beginner "Maya" (no channel), empty data (2026-10-30). Evidence: /private/tmp/claude-501/-Users-danizal-dani-youtube-knowledge-vault/41220335-3871-449c-8a59-b79f9f40977f/scratchpad/ux-a/shots/
NOTE: the walker used the bundle built BEFORE Task 7b merged, so wording items already fixed there (Settings "Working now"/"Signals" text) may be stale: re-check before fixing.

## Five worst
1. [P1] Welcome step 4 and the first Home are a blank spinner for ~2 minutes (entering step 4 silently starts a YouTube trend scan; no message or estimate). Step 1 also takes 16 s with a bare spinner and a disabled Continue.
2. [P1] Plan: title, thumbnail text and hook save only when the field loses focus; typing, waiting 4 s and reloading lost the text; nothing shows "Saved" (the note editor autosaves, so the two disagree).
3. [P1] The trend list on Home and Discover has an unexplained "—" pill on every picture; the intro sentence refers to a number that never shows.
4. [P1] Settings and Welcome tell the user to look in screens that don't exist ("Working now and Signals look here…") (may already be fixed by 7b: re-check).
5. [P1] The paid Postiz requirement for publishing is never shown before Settings.

## Welcome
- [P2] "Add your channel" on Home opens "Step 2 of 4" with no step 1; sidebar "Videos" opens step 1: one entry point.
- [P2] Back from step 4 replaces the three answer fields with "Your voice guide is saved" (can't edit).
- [P2] Step 1 footer says "Opens … sign-in page" while both accounts are Connected; "Connected as ChatGPT" is meaningless. (Welcome showed the real machine login: not-connected state untested.)
- [P2] Layout jumps between steps (step 4 wider, left-shifted; on step 2 Continue and Back fall below the fold at 1440x900).
- [P3] The step is not in the URL; Skip setup, Skip questions and Continue are three near-identical exits; Home's first screen has two "Add a channel" controls.
## Home (first run)
- [P2] The checklist is not clickable; the only action is on the right behind the spinner; "New video" is secondary.
- [P2] Cards use "/day" and "Break this down" with no explanation; "Follow this channel" appears before the user knows what following does.
- [P2] Four step models: Help 3 steps, Home checklist 4 ("five steps" but names four verbs), video tabs 5, "How the board works" Gather/Ask/Draft.
- [P2] Once there is one video the first-run Home and trend picks disappear; the card repeats "Planning" and the title; its thumbnail shows the title, not the thumbnail text.
## Discover
- [P2] "Followed" empty state is wrong: says "Nothing from the channels you follow / Refresh…" when the user follows nobody; after following InsideAI still 0. Expected: "You follow no channels yet. Follow one from For you."
- [P2] "Follow this channel" shows only on row hover; after following, a stray check mark sits above "Following InsideAI".
- [P2] The X tab suggests "r/AI_Agents" (a subreddit) and mixes subreddits with X.
- [P2] The tab strip mixes views (For you, Followed) and sources (YouTube, X, Reddit); "Top" sort is vague; "Matched to" lists the audience "Complete beginners" as a topic.
- [P2] "Your ideas" counter stayed 0 after "Turn into idea" (row button and counter update only after leaving and returning).
- [P3] Duplicate refresh icons next to "Updated Oct 30"; the row button's aria-label doesn't contain its visible text.
## Videos
- [P2] The "New video" dialog's default is "Break down a video" (an AI action) while a beginner with a title is on the second card; "Start from a title" ends with "Add idea" and then a banner offers "Start planning".
- [P2] "Evergreen" is an unexplained sub-heading; the idea card repeats its title three times.
- [P2] "Start planning" appears three times at once (each card and the banner); the banner and "New" tag are blue (breaks the rule).
- [P2] Calendar puts the unpublished video on today; Table shows publish date "—".
- [P3] "Drag a card to move it" shows on Table and Calendar; "Videos 1" counter excludes ideas while the board shows 2; the calendar's today circle is blue; "Board" names both the kanban and the notes step.
## Video page: Board (Task 10 owns these files; paused)
- [P2] "How the board works" opens automatically over the work area; Tab goes to controls behind it.
- [P1] The empty board's primary is "Draft scenes from board" while the sensible first action ("Add to board") is a small secondary; empty text in the top-left of a huge canvas.
- [P2] The sidebar collapses to an icon rail on video pages with no Home/Discover/Videos icons, leaving an avatar.
- [P2] Arrow keys do nothing in the "Add to board" menu; "Image or Markdown file" and "Notes folder" are code-speak.
- [P2] The note editor opens a full-height blank drawer, no placeholder, says "Saved" while empty, shows `notes/note.md`; the title changes to the first line while the file name stays `note.md`.
- [P2] The link box is too narrow (placeholder cut); typing "not a url at all" + Enter silently makes a note.
- [P2] New cards line up in one row, the first clipped at the left even after Fit; dropped text re-centres the view; cards slide under "Draft scenes from board" and "?".
## Plan, Record, Edit, Publish
- [P2] The user's own title is not offered as a title option; "0w · 0/60" is cryptic; an amber "8w" with no explanation; the thumbnail preview is a grey blob that shows no text.
- [P2] Record strip says "Draft them from the board" while the main text says "Plan the scenes first / Open plan"; Publish's empty state is a different layout and button.
- [P2] The stage chip ("Change stage") lets the user "Move to" Published with no scenes.
- [P2] The "…" menu has one item ("Copy link to this video"), overlaps "Hide Ask Claude"; the link points to a local app.
- [P3] Record on a video with no scenes logs a 409 on `companion/silences`; a failed thumbnail request on Edit.
## Companion
- [P2] Suggestions ignore the empty state (Board offers "Write three hooks from this board" on an empty board, Record "Shorten this scene", Edit "Cut the pauses", Publish "Is the title ready to publish?").
- [P3] The companion always says "Claude" even if only ChatGPT is connected; hiding it leaves a vertical "Ask Claude" tab.
## Settings, Help, search
- [P2] "Use for writing and thinking" and "Gemini … breaks them down" use internal wording; "Who can watch new videos" defaults to Public.
- [P2] Help is a 3-step intro dialog with a "Start" that starts nothing; no glossary.
- [P2] ⌘K finds only titles and 6 pages ("help", "record", "publish", "scene", "channel" return nothing); it lists "First launch setup" and "Videos calendar".
- [P2] The ⌘K palette and the New video dialog do not trap focus.
