# Motion graphics style spec (reference study)

## 1. Source

- **Title:** "What I'd Learn Instead of Prompt Engineering in 2027?"
- **Channel:** Nick Saraev. **Length:** 11:05 (665 s). **Uploaded:** 2026-10-23.
- **URL:** https://www.youtube.com/watch?v=cSdTCIKrUiE
- **Segments studied:** 0:00-1:30, 4:00-5:30, 8:30-10:00 (the t=520 section). Method: 3-second contact sheets, full-resolution frames, and the auto-generated transcript. The video-native pass (watch-video) failed with OpenRouter 402 Payment Required, so motion timing, easing and sound are inferred from frames and are not verified.

**Visual approach:** A monochrome, editorial look. Near-black background, off-white serif headlines, grey 3D and line charts, and mock UI panels. The speaker sits in a small rounded face-cam at the right edge while graphics fill the left ~75% of the frame. Full-screen talking-head cuts break up the graphics at chapter moments. Each graphic illustrates something the speaker has just named (a number, a product, a quote, a person, a process). Graphics hold for roughly 3-8 s and are separated by fast horizontal motion-blur wipes.

## 2. Graphic types

| Type | Look | Triggered by | Hold | Entry / exit | Position |
|---|---|---|---|---|---|
| Serif title card | Large serif headline, tiny grey caption line beneath | A named concept being introduced | ~3-5 s | Soft fade / blur-in; blur wipe out | Top-left headline |
| Big-number card | Serif numerals with small labels; sliders | Dollar or time figures, extrapolation ("per day" to "per year") | ~6 s | Numbers count into place | Left area |
| Chart | Grey gradient 3D surface, wireframe, or line curve; small sans axis labels | "How X depends on Y", cost curves, decay over a session | ~5-6 s | Appears whole (draw-on not confirmed) | Centred, left area |
| Conceptual diagram | Seesaw/balance, 2x2 matrix with dots, bracket diagram | "Worth it?", "which job fits which model" | ~5 s | Dots and parts appear in sequence | Centred |
| Pricing card set | Three cards with tier name and big price; one highlighted; Input/Output pill toggle | Model names spoken | ~5 s | Cards slide in; toggle flips | Centred, full width |
| Gauge | Speedometer with needle and one-word label ("Useful") | Qualitative rating | ~3 s | Needle sweeps | Centred |
| Comparison table | Two-state table (Normal / Cached) with pill toggle | Cache or before/after discussion | ~4 s | Values swap on toggle | Centred |
| Quote card | Large serif pull-quote, opening quote mark, attribution | Direct quote read aloud | Whole quote + 1 s | Fade | Full frame, dark |
| Person card | Square photo, serif name, small sans role | Person first named | ~3-4 s | Slide/fade | Left-middle |
| UI mock | Phone feed, browser "New tab" search, email reply, chat window, news cards | Product or app named; an action described | ~4-6 s | Panels slide or fade | Left area, slight stagger |
| Hub-and-spoke | Central "Claude" cube with Calendar, Gmail, Slack, CRM nodes | List of connectors | ~4 s | Nodes pop in | Centred |
| Timeline / arc | Stepped rows (Day 0 to Day 1), spiral path with day labels, stacked session blocks | Time-based narration (sessions, days) | ~5 s | Path draws; labels appear | Centred |
| Clock arc | "3:00 am" to "6:10 am" with sun/moon arc | Overnight or batch processing | ~4 s | Marker travels along arc | Top-right clock |
| Fill vessel | Glass jar filling with spheres to a percentage | Percentage statistic (21% to 80%) | ~4 s | Fill rises | Centred |
| Full-frame face cut | Speaker full-screen on grey gradient | Chapter start or after a big graphic | ~3-8 s | Hard cut | Full frame |

**Constant element:** the face-cam PiP stays on through every graphic. In the full-frame cuts it is absent.

## 3. Typography, colour, layout, pacing, sound

- **Type:** display serif (high-contrast, editorial; typeface not identified) for headlines, quotes and numbers. Small grey sans for captions and axis labels. Monospace for terminal and chat frames.
- **Colour:** background ~#1b1b1b to #222 with a subtle vignette. Text off-white (~#eee), secondary grey (~#888), panels slightly lighter. Light grey "paper" cards (~#e6e6e6) for documents. No accent colour appears in the three segments. Values are eyeballed from JPEG frames.
- **Layout:** graphic area is the left ~75-80%. Face-cam PiP sits at the right edge, ~10% of frame width, rounded corners, soft drop shadow, vertically centred. Headline inset ~10% from left, ~15% from top.
- **Pacing:** about 12-14 distinct graphic states per minute in the dense 8:30 segment and roughly 11 per minute in the intro. A full-frame talking-head beat appears about every 20-30 s.
- **Sound:** not assessed. No audio was analysed.

## 4. Rules for the Visualize agent

1. A number with a currency sign, %, or 3+ digits gets a big-number card within 1 s of being spoken, held 4-6 s.
2. A timescale extrapolation ("per day ... over a year") becomes a stacked number card, one line per scale.
3. A named model or product gets a pricing card or UI mock. Highlight the one discussed and dim the others.
4. Two options compared get a two-column card or 2x2 matrix, max four items.
5. A person's first mention gets a person card (photo, name, role), 3-4 s, once per person.
6. A quote read aloud gets a full-frame quote card for the whole quote. Paraphrase quotes longer than ~15 words.
7. Time sequences get a timeline or arc with day or clock labels.
8. A percentage gets a fill vessel or count-up.
9. Keep the face-cam PiP on during every graphic. Use a full-frame talking-head cut at least every 30 s.
10. Cap at ~12 graphics per minute. Each graphic must match a noun or claim in the same sentence.
11. Use a 0.4-0.6 s horizontal motion-blur wipe between graphics. Stay monochrome unless the brand palette is defined.

## 5. Mapping to tools

- **Face-cam PiP and full-frame cuts:** HyperFrames composition. The PiP is an HTML layer with border-radius and shadow over the video track. Cuts are timeline switches.
- **Title, quote, number and person cards:** HyperFrames HTML with GSAP (fade or blur-in, small y-offset). Straightforward.
- **Pricing cards, comparison tables, UI mocks:** HTML components. Build generic mock UI, not copies of real product UI.
- **Diagrams, timelines, arcs, hub-and-spoke, fill vessel:** SVG with GSAP. Use stroke-dashoffset for path draws and motionPath for the clock marker.
- **Gauge, 2x2, seesaw:** SVG, simple.
- **3D surface chart:** hardest. Pre-render it or simplify to 2D.
- **Wipe transitions:** HyperFrames transition layer or a GSAP blur-plus-translate tween.
- **claude-video-effects** (github.com/Vibha-Ramprakash/claude-video-effects, 45 effects via `/effects`): the effects I reviewed (1-29 of the README table) are face-centred overlays (orbit, lean-in, backdrop-word, split-headline, the-bill, reject-stamp, countdown-flip, todo). They cover or push the face, which this reference never does. They do not reproduce this style. Use HyperFrames HTML for this look. Effects 30-45 were not reviewed.

**Open items:** rerun the watch-video pass after topping up OpenRouter credits to verify motion timing and sound. Transcript timings are auto-generated, so graphic alignment is approximate (about +/-3 s).
