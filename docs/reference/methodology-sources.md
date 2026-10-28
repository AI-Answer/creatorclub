# CreatorClub methodology sources

Sources: the ContentRepurposeSystem (CRS) skills, the Samin board prompts, scripts and workspace. `prompts/knowledge/` (Jake Trinder, Ed Lawrence) is excluded. Costs are from the board's logs (`status.json`, `find-log.json`, job files), not estimates.

## 1. Onboarding and voice

- **Use:** board `scripts/build-voice.py` with `prompts/voice.md`. Pulls up to 10 recent transcripts, writes a 7-section voice guide with verbatim quotes. `scripts/voice_metrics.py` measures rhythm without an LLM.
- **Merge:** CRS `onboard` Step 2 (three-question Voice DNA) as a fallback when there are no transcripts. Lift the handle normalization and channel-ID step.
- **Inputs:** channel URL, topics, `about` (profile.json), transcripts.
- **Output:** `voice.md`, `voice-metrics.json`.
- **Model:** sonnet (`voiceModel`), $1.50 cap. Cost not logged.

## 2. Break down (Ideas)

- **Use:** board `scripts/video-ideas.py`. It already matches the spec: why it worked, viewer questions, up to 3 concepts with a twist.
- **Inputs:** video detail, transcript (first 12,000 words), top 40 comments (treg), first 36 lines of voice, criteria, existing titles, `usualViews`.
- **Output (`--json-schema`):** `whyItWorked` (2 to 4), `viewerQuestions` (up to 6), `concepts` (title, angle, twist, hook under 25 words, lane, why, demand/gap/show as level plus note).
- **Model:** sonnet (`videoIdeaModel`), $1 cap. Observed $0.10 to $0.11 Claude cost per job, plus treg calls capped at $0.01 to $0.02 each.

## 3. Package (Planning: Research, Package)

- **Research:** no prompt exists. `idea_text()` already prints `Source:` lines, so a research board of links and notes can feed brief and outline with no new LLM step. CRS `ideation` Step 1 takes the same stance: use existing research, do not redo it.
- **Brief:** board `prompts/brief.md` gives title (7 words or fewer), thumbnail, promise, viewer, format, minutes, proof. Observed $0.04. It is parsed from free text by regex; switch to `--json-schema`.
- **Titles:** keep the brief's rule (bold claim or fix, not a question). Add CRS `yt-titles` Tier 1 to 3 framing and 2 to 5 word thumbnail text. Add its 60-character check, which the board lacks.
- **Hook:** board `ref/hook-library.md` picks the pattern. Output each hook as CRS `hooks` "Three Hook Alignment" (visual, spoken, text), checked against its Four Commandments.

## 4. Create outline

- **Use:** board `prompts/outline.md`. Its Say, Show and Look-for notes per section make the outline filmable. Output is `###` headings with times, which `outline_budgets()` turns into word budgets.
- **Merge:** CRS `outlines` for the honest-limitations beat and per-section time budget.
- **Keep:** the board's three shapes (levels, opinion, tour), taken from Samin's nine videos. CRS has eight formats; add them later only if a second creator needs them.
- **Model:** sonnet. Observed $0.10.

## 5. Script and review (optional full script)

- Board `script.md` (full or talking points), `expand.md` (lengthens sections under 80% of budget), `revise.md` (rhythm only), `review.md` (six checks ending in a Fix list). Observed script $0.14 including expand and revise; review $0.12. No CRS equivalent.

## 6. Repurpose (later)

- **Clips:** CRS `short-form`: 3 to 5 clips of 30 to 90 seconds, timestamps, hook, caption, hashtags. Pure prompt; transcript from yt-dlp json3, which is free.
- **Reels:** CRS `reels` and `references/hook-angles.md`. Needs ffmpeg, Pillow, NumPy, and optionally a local whisper-cli model.
- **Blog, Twitter, LinkedIn:** CRS `content-cascade` prompts. All five are templates with `[YOUR BRAND]` placeholders, so voice must come from `voice.md`. Keep the structure rules: 5 to 8 tweets under 280 characters; LinkedIn 800 to 1,500 characters with the hook in the first ~150.
- **Packaging:** CRS `publish-pack`. Python file assembly with macOS `cp -c`; no LLM.
- **Carousels:** defer. The Pixel-Pal style needs Higgsfield GPT Image 2, which is paid.

## 7. Scripts and paid APIs in CRS

- **Python, no LLM:** `reels/scripts/make_reel.py` (ffmpeg), `film_list.py`, `carousels/scripts/render_carousel.py` (Pillow), `publish-pack/scripts/build_publish_pack.py`, `yt-titles/scripts/channel_performance.py` (yt-dlp).
- **Node:** `fetch-transcript-apify.js` (Apify token, paid beyond free tier); `fetch-transcript.js` (youtube-transcript, free but unofficial); `post-thread.js` (X API keys, paid; skip); `generate-flyer*.js` (Playwright; skip).
- **Missing from the plugin:** the `yt-search` helper (referenced by ideation, yt-titles, outlines) and the NotebookLM CLI (ideation Step 5b). Do not depend on them.
- **Pure text to lift:** `hooks`, `outlines` (formats, honest limitations), `yt-titles` principles, `short-form` clip criteria, `publish-pack` folder layout, `content-cascade` structure rules.

## 8. Conflicts to resolve

1. **Club mentions.** `profile.json` says no club, community or product in the CTA. But `voice.md` sections 2 and 9 describe Claude Club closers. Section 2 reaches the brief and outline prompts through `voice_summary`, and the full guide reaches script and review. Strip those lines from the voice summary or enforce the CTA in code.
2. **Knowledge still active.** `profile.json` lists `jaketrinder` and `ed-lawrence`. `outline.md` has the example "(Jake: Promise, Proof, Plan)", and the finished video's outline cites "Jake's four decisions" and "Ed". Set `knowledge` to `[]` and remove the example.
3. **Structured output.** `write-video.py` regex-parses brief JSON from text. `video-ideas.py` and `find-ideas.py` use `--json-schema`. Use the schema everywhere.
4. **Model config.** `find-ideas.py` defaults to opus, but config sets sonnet. Observed: sonnet $0.04 to $0.07 per run, opus $0.29 to $0.34.
5. **Title and format rules.** Board: 7 words or fewer, 3 shapes. CRS: 60 characters, 8 formats. Apply both title checks; keep board shapes.
6. **Ratings.** Board uses high, mid, low. CRS uses a 1 to 100 shock score and a Four Horsemen map. Keep the board's; add shock later.
7. **Voice source.** CRS `onboard` writes voice into shared prompt files. Keep the board's per-workspace `voice.md`.
8. **Length.** Board: 140 words per minute and 3 to 60 minutes. CRS: 12 to 18 minute default and about 150 words per minute for clips. Use the board's rate.
9. **Count.** CRS asks for 3 to 6 reels and 3 to 5 shorts. Pick one count per video.

## 9. Models and cost

- **Observed (sonnet):** brief $0.04, outline $0.10, script $0.14, review $0.12, break-down $0.10 plus treg.
- **Suggested:** sonnet for every v1 stage. Use opus only for find-ideas if sonnet picks are weak; the logged opus runs cost roughly 4 to 8 times the sonnet runs.
- **Untested:** clip, title and hook generation. Start on sonnet, measure, then decide.
