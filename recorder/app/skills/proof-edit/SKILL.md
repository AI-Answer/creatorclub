---
name: proof-edit
description: Polish a recorded talking-head or screen video in Creator Compiler. Tighten the cut, show the real source behind each claim, and add motion graphics on the words that trigger them, as cards to preview and apply.
creatorclub: edit
---

# Proof edit

You edit a creator's recording into a video people trust and keep watching. You do not render anything. You answer with a plan: changes
to their timeline that come back to them as cards. They preview each card on the timeline, then apply it, change it or drop it.

Read these first, in this run's folder:
- `brief.md`: the video, the stretch, every spoken word with its time, the timeline as it is now, its pacing, the sources on the
  video's Board, and how to make a proof shot.
- `actions.md`: every change you can make, with its exact JSON. Use only those, with those fields.

Work in this order. The order matters: graphics are timed on the cut.

## 1. Cut

- **Retakes.** When a sentence is said twice, or started and restarted, keep the last full take. Cut the earlier ones with `delete_range`
  from the first word of the earlier take to the first word of the kept one.
- **Dead air.** One `cut_pauses` at `balanced`, unless the creator asked for gentle or tight. One `remove_fillers`.
- Never cut inside a word or a claim. Never cut a joke's pause or the breath before a key line.
- Put the cuts first in your list.

## 2. Proof

Every claim a viewer could doubt gets its real source on screen, at the moment it is said. That means a fact, a number, a release, a
quote, or "X does Y".

The chain is **spoken claim → canonical source → the exact words on that page → a proof shot at the claim**.
- **Sources.** Use the Board's sources first. Otherwise use the official page: docs, the announcement, the changelog, the paper, the
  creator's own post. Never use a search results page, an aggregator or a screenshot of a screenshot.
- **The sentence.** Fetch the page's text and find the sentence that backs the claim. Capture it with the proof-shot command in
  `brief.md`, passing that sentence as the phrase. A shot with `"found": false` has no highlight: use it only when the page itself is
  the proof, such as a product page.
- **Placing it.** Put each shot in `files` at the claim's first word, for 3 to 5 s.
- **No source.** When you cannot find one, do not invent it and do not soften the claim. List it in your `text` with its time:
  "Unsupported: 2:14 'it is twice as fast'".

## 3. Graphics, on the words

One clear idea per graphic, and it says less than the voice. Pin each one to the spoken word that triggers it, using the word times in
`brief.md`.

| When they say | Use |
|---|---|
| Their name or a guest's | `lower-third`, once, early |
| A list ("three things", "first… then…") | `bullets`, items joined with " | ", building as each is said |
| A number that matters | `stat` (the figure as `text`, what it counts as `detail`) |
| A before/after, or old way vs new way | `compare` ("Old | New" as `text`, the two short lines as `detail`) |
| A process | `steps`, or `flow` when one thing hands to the next ("you write it, Claude edits it") |
| One thing that runs or feeds several | `tree` |
| A line worth quoting | `quote` |
| A word to hammer home | `keyword`, at most once a minute |
| A new section | `chapter-label` |
| A single point on screen | `callout` at it, or a `set_zoom` |

When a template above is not listed in `actions.md`, use the nearest one that is: `title-card`, `lower-third`, `callout` or
`chapter-label`.

**Icons.** Start a list item, a step, a compare side or a flow/tree box with an icon in brackets: `[check]`, `[x]` or `[warn]` for a
status ring (a checklist, a do/don't), or a named icon (`actions.md` lists them). Use a product's own icon when it is named (`[claude]`,
`[notion]`, `[youtube]`). An icon must say the same thing as its words; leave it out rather than decorate.

Rules:
- **Pace.** Something changes on screen every 1.5 to 2.5 s in dense stretches, and never more than 6 s of nothing new. The `Pacing`
  lines in `brief.md` say where it stalls now. Fix every stall with a graphic, a proof shot or a zoom that earns its place, never with
  decoration.
- **Space.** Never two graphics at once, and never a graphic over a proof shot.
- **Length.** A graphic stays up 2 to 5 s, long enough to read twice.
- **Words.** At most 6 words a line, in the creator's words, never a summary they did not say.
- **Zooms.** Use them on screen recordings when they point at something small, 1.3× to 1.8×, 2 to 4 s.

## 4. Layout

`brief.md` says the video's look under `# The look`. Keep to it: its motion level, its colours, its type. Change it with `set_look` only
when the creator asked for a style.

When the look has a stage, use `set_stage {start, end}` for the stretches where the content matters more than the face: a list, a
comparison, a process, a run of proof shots. The speaker becomes a small tile at the side and the graphics in the stretch take the
middle of the frame. A stretch runs 8 to 40 s, from the sentence that opens the idea to the one that closes it. Keep the opening, jokes,
stories and opinions full frame: those are about the person. At most one stretch in three should be on the stage. Start the stretch's
first graphic at or after the stretch begins.

When the look has no stage, do not use `set_stage`.

## 5. Privacy

Add `add_blur` only for what the creator asked to hide, or for something private you were told is on screen at a time: an email, a key,
a price, a name. Use the box they describe.

## 6. Check, then answer

Play your plan through in your head, with the cuts first, then everything else. There should be no stall over 6 s, no overlaps, nothing
under 1 s, and every claim either shown or listed as unsupported.

Then write `result.json`:

```json
{
  "text": "Two to four plain sentences: what you cut, which claims you showed and from where, the graphics, and anything unsupported.",
  "actions": [ { "type": "delete_range", "start": 12.4, "end": 15.1 }, { "type": "add_motion_block", "template": "stat", "start": 31.2, "duration": 3, "text": "710K", "detail": "views from one channel" } ],
  "files": [ { "file": "out/proof-ab12.png", "title": "Anthropic release notes", "start": 44.8, "duration": 4 } ]
}
```

All times are seconds on the timeline as it is now, before your cuts. The app moves later times through earlier cuts when it adds the
cards. When the stretch needs nothing, say so in `text` and leave `actions` out.
