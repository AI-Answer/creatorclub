# UX review of the merged app (2026-10-30, controller walkthrough of the live app, Planning-stage video "Can Claude Make a Video With No Editing?")

Dani's question: "do you really think this is intuitive and good?" No. What a user meets, in the order they meet it:

## Plan (the screen Dani sent)
1. **The same three actions live in four places**: the "Write with Claude" menu (titles, hook) in the Scenes header, the big "Draft scenes from board" button, three suggestion chips in the companion ("Draft the scenes", "Write three hooks", "Suggest three titles") and the companion's message box.
2. **The menu is in the wrong column**: "Write with Claude" sits on the Scenes header but writes the Package (titles, hook), and it has no "scenes" item although it sits on Scenes.
3. **An empty form shown as a form**: three empty "Add another title" rows with radio buttons and "0w · 0/60" counters (code-speak), a fake blue thumbnail box, an empty hook, and more empty fields below the fold. Nothing says what to do first.
4. **Placeholders look like content**: large grey text the size of real text ("Type 2 to 5 words, readable at phone size"); instructions are squeezed into tiny grey hints ("Pick one · 7 words or fewer", "2 to 5 words, about one real thing").
5. **"Less"** opens a hidden section ("What the hook shows") but is labelled with the closed state's opposite; the section has two more empty fields.
6. **Two scroll areas and a clipped bottom**: the Package column and the Scenes column scroll separately and the footer cuts the last field.
7. **"Continue to recording" is greyed with no reason** when there are no scenes.

## Across the video steps
8. **Dead-end steps**: for a Planning video, Record, Edit and Publish are three near-identical pages ("Plan the scenes first", "Nothing to publish yet") with the same "Open plan" button, reachable by clicking the step. A step that cannot work yet should look locked and say what unlocks it, not open a dead page.
9. **The step bar says nothing about progress or the next step**: only the active tab is highlighted; the primary button differs per step ("Draft scenes from board", "Continue to plan", "Continue to recording") with no consistent rule.
10. **The companion's empty state is a 70%-blank column** with the same welcome text on every step ("I'm with you on this video from the board to publishing…"), and its suggestions sit at the bottom, far from the content.

## Board
11. **A vast empty canvas with one huge text card**; "Draft scenes from board" (black, primary) is offered before anything was gathered; the folder chip shows an internal path with an id ("…/videos/idea-1a179c8273f-2") with no explanation.
12. **The idea card is a wall of text**: Demand, Gap and Easy to show each carry a long sentence, and the chips look like buttons but do nothing.

## Videos, Settings, looks
13. **Table columns that are empty for every row** (Publish date, Views) and a mix of real thumbnails and grey blurred blobs.
14. **Settings shows a bare spinner for about 1.5 s** (0.3 s elsewhere); no skeleton.
15. **Mixed signals in the buttons**: black primary buttons, blue outline buttons ("Write with Claude"), blue links, a blue placeholder block, a blue companion mark; labels follow no pattern ("Draft scenes from board", "Write with Claude", "Continue to recording").

## Principles the fixes follow
- **One place per action**: an AI action appears where its content is; companion suggestions never repeat a visible button.
- **An empty state is one sentence and one action**, never a form of empty fields; "fill it in by hand" is the quiet second choice.
- **Locked, not dead**: steps that cannot work yet look locked with one line saying what unlocks them; "Continue" always names the real next step and says why when it cannot go.
- **Placeholders look like placeholders**; hints are plain sentences.
- **The companion earns its column**: a compact step-specific greeting with the three best prompts at the top; it can collapse.
- **One scroll area per column.**
