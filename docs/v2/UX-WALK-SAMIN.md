# UX walk, Samin, real data copy (2026-10-30). Evidence screenshots: /private/tmp/claude-501/-Users-danizal-dani-youtube-knowledge-vault/41220335-3871-449c-8a59-b79f9f40977f/scratchpad/ux-b/shots/

## The five worst
1. [P1] Publish: tags are lost (chip appears, vanishes after switching step or reload; description persists). 66-publish-edited.png
2. [P1] Edit: trimming a linked clip trims only the camera; audio stays full length although both show as linked and selected. 37b-trimmed.png
3. [P1] Edit: one accidental drag (120px on the clip body) slid the only clip 4.4 s right, leaving a gap, video grew 0:32 -> 0:36; cursor over the body is `grab`, competing with scrubbing. 35c-dropped.png
4. [P1] Discover: a failed Refresh replaced good data and the error is stuck: all 9 Reddit subs failed, Reddit fell from 49 to 24 posts, "Couldn't read r/…" banner persists after reload, Followed (115) > For you (114); refresh took far longer than 3 minutes. 07-turn-into-idea-1600.png
5. [P1] Home and Board disagree on progress: Home says "4 scenes recorded" for Hidden Features (board: 1 of 4) and "3 scenes recorded" for Still Using Claude (board: 0 of 3). 64d-collapsed.png, 10-videos-board.png

## Home
- [P3] "Planning" appears twice on the Next up card.
## Discover
- [P2] Sort resets per tab and changes meaning (Top, Views per day, Most liked); the ranking basis is never stated.
- [P2] The multiplier badge covers the thumbnail text, is blue (breaks the colour rule), shows "1.00×" and "0.90×" as if wins; the explanation sits far away: put a legend next to the badge.
- [P2] Rows re-sort and shift while Refresh runs (a click landed on another post).
- [P2] "Turn into idea" toast has no Undo; the button and the "Your ideas" counter only update after the refresh finishes: flip to "In ideas" immediately.
- [P3] Stray refresh glyph above "Updated Oct 26"; no relative age; the open-original arrow shows only on hover.
## Videos
- [P1] Any idea can be moved to Published or Recording by menu or drag ("Run Claude Doctor" marked Published with no video; Home then counted "1 published"). Block it or warn. 16-moved-to-published.png, 20b-dropped.png
- [P2] "Keep editing" on Still Using Claude lands on "Nothing recorded yet" with editing chips next to it: say "Record". 58-still-using-edit.png
- [P2] Board at 1280x800: the Published lane is cut off with no scroll hint.
- [P2] Same action, two styles: on the Board "Keep editing", "Publish it", "Draft scenes from board" are blue links; on Home black or outline buttons.
- [P2] Later and Skipped groups sit at the bottom of a 2,000 px lane so a card sent there vanishes; Undo toast lasts 6 s.
- [P2] Calendar plots videos on creation days, not publish dates; "Drag a card to move it" shows on Table and Calendar; Table's Publish date and Views are all "—".
- [P2] "Board" names two things (the Videos view and the per-video canvas): "Draft scenes from board" is unclear.
- [P3] The "…" button covers the card title on hover; the idea drawer shows the source video's thumbnail as hero and has Later and Delete but no Skip (the card menu has it).
## Board step
- [P2] "Draft scenes from board" and "Continue to plan" offered on an Editing video with no warning about overwriting scenes that have takes.
## Plan
- [P2] "To decide" items are lowercase fragments; "Mark decided" has nowhere to record the decision.
- [P2] Title: "Pick one" has no selection, and the header title is not one of the three options.
- [P3] Talking points start lowercase; no save indicator.
## Record
- [P2] The "Change" sheet hides Screen and Computer audio below the fold; the footer overlaps them; the "Recording presets" panel collides with the Microphone row when scrolled.
- [P2] Duplicate camera controls: "Allow camera", "Enable camera preview", "Change".
- [P2] Take review has two "Continue" buttons (one in the take, one "Continue to edit"); says "Confirmed" next to "Kept take 1".
- [P2] The Record landing differs by video ("Ready to record / Start recording" interstitial vs the recorder directly).
- [P3] The Takes card has a blue focus border from the start; the "A↓ A↑" teleprompter buttons are unlabelled.
## Edit
- [P1] Export starts immediately with no options and sat at 0% for ~24 s; the page froze for over 5 s at 60%; the UI finally said "Couldn't export the video. Try again" although the mp4 exists (6.4 MB, 32 s); cancel at 90% asks nothing and gives no feedback. (Headless slowness not ruled out.)
- [P1] "Captions are not set up yet" shows next to a full transcript, captions on the timeline and burned into the preview; Settings "Set up", the Captions panel's "Create transcript" appear to do the same job.
- [P2] The same pause check gives three numbers: toolbar 2 s, sheet 1.3 s, companion 0.3 s; the card stays live on Record and Publish.
- [P2] The transcript is full of errors ("A2", "THNK", "whiteverse") with no way to flag or fix it.
- [P2] Delete leaves the playhead past the end (0:09.9 of 0:09, black preview).
- [P2] Deleting one transcript word gives no toast and no visible cut marker.
- [P2] Cmd+scroll zooms around the playhead, not the cursor; the slider is logarithmic to 3,887 px/s.
- [P2] Three time formats: ruler m:ss, "0:10:15" frames when zoomed, readout in tenths.
- [P2] The shortcuts popover is clipped after "⌘G" with no scroll cue.
- [P2] The timeline "…" menu has 19 items that duplicate the toolbar and opens over the step tabs.
- [P2] Hover previews swap the whole player for a Before/After stage; "Plan a style" looks like plain text.
- [P2] Style panels use code-speak ("Focus coordinates", "tracking metadata", "Cursor keyframes", "#10131ccc").
- [P2] The companion says "2 selected" for one clip.
- [P2] Version history lists identical titles.
- [P2] Edit loses zoom, playhead and selection on leaving and returning.
- [P2] Colours: audio and selection both blue, captions olive (close to "done" green), markers black.
- [P3] Toasts cover the timeline and the Continue button; the toolbar strip shrinks to "R…" while exporting; at 1280x800 the transcript is cramped and scene chips 3–4 are clipped.
## Publish
- [P1] "Publish now" looks enabled while "Connect Postiz first." shows (the amber note is the only cue).
- [P2] No warning that 3 of 4 scenes are unrecorded; chapters use planned durations (2:47, 5:47) against a 0:32 video.
- [P2] The black "Export video" at the top never learns an export exists.
- [P2] The Postiz key block is duplicated on Publish and Settings.
- [P3] "I uploaded it myself" unstyled and unexplained; "Made for kids?" has no default selected (intended).
## Settings, search, shell
- [P2] "First launch setup" is listed as a page in ⌘K.
- [P2] The collapsed sidebar has no Home, Discover or Videos icons; the "Expand sidebar" tooltip is clipped.
- [P2] The ChatGPT row says "Connected as ChatGPT" with no account named.
- [P3] The content left edge differs across screens (272 px Home, 260 px Videos, 494 px Settings).
