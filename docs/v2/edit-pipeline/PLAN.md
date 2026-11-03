# Proof-first editing in Edit

Goal: from Edit, a creator asks once ("polish this video") and gets a reviewed, A-grade edit: tight cuts, every claim shown with its real
source, graphics on the words that trigger them, and a pacing check, all as cards they preview on the timeline and apply or undo. The same
work runs from Claude Code over MCP. Nothing is rendered until they export.

Sources of the method (read, not copied):
- **Process** from Samin12/proof-first-video-pipeline (MIT): cut before visuals; spoken claim → canonical source → captured evidence →
  timed visual → rendered check; one writer, preview before commit, refused when the project moved.
- **Look and taste** from Samin12/screenplay (MIT): graphics anchored to spoken words; something changes on screen every 1.5–2.5 s,
  nothing static over 6 s, no overlapping beats; its stage elements (bullets, stat, compare, steps, quote) rebuilt as our own templates.
- **Proof shots** from Samin12/editroom: the real page with the spoken phrase highlighted (rebuilt on our own Chrome driver).
  Not used: editroom's studio films and opencutagent's kit (Commons Clause), Remotion (licence; our renderer already exists).

## Steps

1. **Cards the plan needs** (companion actions, previewed and undone like every card)
   - `add_blur`: blur a box of the frame for a stretch (privacy), an Element of type blur.
   - Many files per skill run: `result.json` `files: [{file, title, start, duration}]`, each its own Overlays card at its word.
2. **Templates** in `shared/motion/templates.ts`, two styles each, same markup in preview and export:
   `bullets` (builds line by line), `stat` (big number and label), `compare` (two sides), `steps` (a row that lights up in turn),
   `quote` (quote and who said it), `keyword` (one word, big). Lists use ` | ` between items in the card's `text`.
3. **Proof capture**: `POST /api/club/videos/:id/proof` {url, phrase} → a 1920×1080 PNG of the page, scrolled to the phrase with it
   highlighted, saved in the video's folder and registered as media. Also an MCP tool `capture_proof`. Needs Chrome on the Mac.
4. **The skill** `proof-edit`, bundled with the app (found like the creator's own skills; `/proof-edit` in Edit). Its steps:
   cut → claims and sources (the Board's links first) → proof shots → graphics plan → pacing check, written as one plan of cards.
5. **Pacing check**: from the timeline as it will be after the cards, the stretches over 6 s with nothing changing on screen, overlapping
   graphics, and a graphic shorter than 1 s; shown in the reply and given to the skill so it fixes them before answering.
6. **Verify**: unit tests per piece, an end-to-end test with a stand-in run, then one real run on a copy of a recorded video.

Each step lands as cards: the timeline previews them, Add all applies them in order (later times move through earlier cuts), Undo puts
each back.
