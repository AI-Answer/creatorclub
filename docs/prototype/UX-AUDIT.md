# Prototype UX audit — beginner walkthrough (2026-10-29)

Persona: wants to start making videos, doesn't know what to make, no channel.

## Findings (P1 = blocks/confuses, P2 = rough, P3 = polish)

- P3 welcome/1: helper text "Opens the own sign-in page in your browser" is broken English when no provider is chosen (reads fine as "Opens Claude's own sign-in page" while waiting). Use "Opens Claude's or ChatGPT's own sign-in page…".
- P3 welcome/1: no Cancel while "Waiting" for sign-in (the real app has one).
- P3 welcome/1: content sits in the top third; lots of dead space below. Consider vertical centering.
- P2 welcome/2: the two choice cards ("Add my channel" / "I'm starting fresh") are unlabeled buttons for screen readers; form inputs are labelled only by placeholder ("Alex").
- (dropped) Blank screens for ~1–2 s in screenshots were an artifact of the hidden browser pane pausing animations. Measured route change = instant.
- P3 welcome/2: topic chips are all AI topics. Fine for the current audience, but the free-text "Something else?" should be more prominent for non-AI creators.
- P3 welcome/3: single-select tone chip shows no check mark, while multi-select chips do. Pick one selected style.
- P1 welcome/4: "what's working in your space" ignores the user's topics (picked AI agents for small business; shown generic Claude/AI news). Rank by the chosen topics or say why these were picked.
- P1 welcome/4 + breakdown: two different multipliers on one video. The thumbnail chip says 6.60× and the stat row says "2.15× your usual". "your usual" is wrong too: it's the creator's usual, not the user's. One number, labelled "vs Duncan's usual".
- P1 breakdown: everything is written for Samin. "Why it worked" says "about 2x Samin's usual 49,500"; concepts say "Samin shows his own Claude…", "He uses his…". A new user (Maya) sees someone else's name and numbers. Write in second person and use the user's profile.
- P2 welcome/4: only 3 videos have real breakdowns; the others say "running in the background". The first-launch picker should only offer ready ones, or mark them.
- P1 board: "Add note" drops the new note on top of existing tiles. New tiles should land in free space, and the view should scroll to them.
- P1 board: Ask Claude replies are dead ends. Each reply needs actions: "Add to board" (as a note) and, where it fits, "Use as hook" / "Use as title".
- P1 plan: Package angle/twist and scene talking points also use Samin in the third person ("Samin shows his own…", "He uses his…"). Same fix as breakdowns: second person, from the user's profile.
- P1 signals: off-topic posts (a Resident Evil fan game, NYC fines) for a user who picked AI agents for small business. Rank and filter by the user's topics, and say why a post is shown.
- P2 video: breadcrumb says "Production ›" and the back button says "Back to production" even when you came from Ideas. Use one stable parent ("Videos"), or reflect where you came from.
- P2 video: steps are shown twice, as the top segmented tabs and the bottom step bar. Keep the top tabs; the bottom bar keeps only Back and Continue.
- P2 working now: card action label truncated ("Make it an ide…"). Fit both actions or use an icon button with a tooltip for the secondary one.
- P2 welcome/4 + working now: half the cards have an outlier chip and half don't, which looks broken. Show "—" or omit the chip consistently, with a one-line legend.
- P3 overview: "1 videos in production". Pluralise.
- P3 plan: the empty thumbnail-text field shows large grey sample text that reads like filled content. Make the placeholder look clearly empty.

## What works well (keep)
- First launch: clear 4 steps, honest copy ("Nothing is billed here"), the starting-fresh path, progress bar and back buttons.
- Ideas after adding: highlighted new idea with "Open it and start planning" is exactly the right next step.
- Board: tiles, toolbar, Ask Claude panel with suggested questions, "Draft scenes from board" lands you in Plan with 6 scenes and length against target.
- Plan: two columns, inline editing works, Write titles/hooks next to fields, high/mid/low toggles.
- Record: scene strip with take slots, teleprompter, readiness line, big "Record scene 1", sidebar collapses.
- Production: empty columns explain how videos get there.
