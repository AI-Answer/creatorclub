# Tella vs CreatorClub Edit — findings (2026-10-30)

Structure and wording only. No Tella code or assets were copied.

## What was and was not observed

| Target | Status |
|---|---|
| Tella web: home prompt box, Skills panel, "/" list | **Observed** (signed-in Chrome, nothing sent or saved). |
| Tella web editor and its chat | **Observed.** Opened one existing video's editor and only looked; no edits. |
| Tella macOS app, pre-record window | **Observed** (screenshot; nothing clicked, no recording). |
| Tella macOS island while recording | **Not observed.** It appears only once recording starts. |
| Tella binary (Ghidra) | Not done: Ghidra is not installed. |

## 1. Chat with skills (observed)

- **Tella does:** the chat opens with a short welcome ("tell me what to change, or start with one of these skills"), four skill chips (Plan a Video, Auto Cut, Auto Layouts, Remove Mistakes), and a "Skills" button at the top right of the chat. The button opens a side panel with a Personal area (drag a skill there to keep it yours) and a Workspace list: skill name, then a one-line cut-off description, and a "+" to add one. Typing "/" in the box lists the same skills as `/name` in bold with a one-line description under it, cut with "…". A note says everyone editing the video shares the chat. The box shows the model ("Sonnet 5.5 Medium") and a cost icon.
- **We did:** only chips; four writing skills; no list.
- **Changed (built):** typing "/" lists your installed skills the same way (name, one-line description); a "Skills" button in the chat header opens that list too; sending `/name …` runs the skill. Left alone: Tella's skills are shared by a workspace; ours are the person's own, local.
- **Not adopted:** the skills side panel, drag to Personal, and the cost icon. Inference: they matter for teams and paid usage; CreatorClub is one person on their own Claude or Codex.

## 2. Editor layout (observed)

- **Tella does:** top bar with title, undo/redo, View, Download and one purple primary "Share". Left rail of eight tools (Setup, Library, Layout, Cut, Effect, Overlay, Style, Subs), each opening a panel beside it. Stage in the middle with a small row of pills under it (size, crop, background, resolution). Chat docked on the right. Clips strip along the bottom with "Add clip", playback speed and a scrubber.
- **We do:** left rail (Transcript, Cut, Captions, Layout, Clip, Zoom, Graphics, Text, Music), one outline Export, one black Continue, chat on the right, timeline with tracks.
- **Takeaways (inference):** the structure is the same, which is a good sign for ours. Tella puts the stage settings (size, crop, background) as a pill row right under the video; ours keep them in the rail. That is the one layout idea worth testing. **Built:** four pills under our video — Format (shows the current shape, e.g. 16:9), Background, Layout, Cursor — each opens the existing panel on the right. Size and crop were not added; we have no crop control to point at.

## 3. Recorder window (observed)

- **Tella does:** one small window, the camera preview fills it. Top bar: two quality pills (both "1080p"), a cursor-effects toggle, a music toggle, a third toggle and a "…" menu. Bottom: one large red record button, with three pickers under it (microphone, camera, display), each labelled with the device name.
- **We do:** Record is a page: camera preview top-left, a status line, a "Record scene 1 again" button, a Takes list, and the scene's talking points on the right.
- **Change (inference):** our page is richer because of scenes and talking points. The part worth borrowing is the three named device pickers as one row under the record button. Not built.

## Open items
- Start a recording in Tella yourself and leave the island up, and I can screenshot it.

## Layout change (2026-10-30, second pass)
Order is now rail, then the tool's panel, then the video with one joined bar under it (Format, Background, Layout, Cursor), then the chat. Before, the panel opened on the right of the video. Checked by screenshot of the real app.

Still different from Tella (observed, not changed): Tella's timeline is one waveform with the spoken words on it and a row of clips below; ours has Camera, Audio and Captions rows. Tella has one slim top bar; ours has the step tabs, the scene strip and a toolbar. Tella's rail icons are coloured; ours are plain outlines.

## Tella editor, tool by tool (observed 2026-10-30, only opened panels, changed nothing)

| Tool | What its panel shows |
|---|---|
| Setup | Title, description, Viewer settings, Chapters, Size (Auto 2:1), transcript language. |
| Library | "My videos" with clip thumbnails. |
| Layout | Auto / Adjust, a "Base layout" with side-by-side previews, Perspective toggle, Position, Style (Standard / Overlap), Auto Layouts with one Generate button. Timeline shows the waveform and sentences. |
| Cut | Mistakes (Review, Cut & review), Buffers (Remove buffers), Silences (found, remove to save time), "Show transcript". |
| Effect | Zooms (Generate), Cursor (on/off, four styles, size, smooth movement). |
| Overlay | Text styles (Title, Label, Serif…), Shapes, Media. |
| Style | Background (Images / Animated / Colors), Border style. |
| Subs | Subtitle styles (Backdrop, Spotlight, Midnight…); the chat side becomes the list of subtitles with timestamps. |
| Audio | Background music list, Studio Voice, and the chat side shows the Script. |
| Redo | Not pressed: it re-records, so it is an action, not a view. |

Seen across all of them: each tool is a coloured tile with its name under it; the panel sits beside the rail; there is no scene strip, only a "Clip 1 / Add clip" row at the bottom; the timeline appears only for Layout, Cut and Effect, as one waveform with the spoken sentences on it.

## Third pass: what changed in CreatorClub
- Rail icons are now tinted tiles, one colour per tool, with the selected one ringed.
- On Edit the scenes are a slim row at the bottom (Tella's "Clip 1" row), not a bar at the top. Record keeps them on top.
- Timeline: no row labels or striping, a soft waveform band, caption chips that carry the words, a red playhead.
- Cut panel now has Tella's shape: a "Show transcript" button in the header, then Mistakes, Silences, Gaps between clips, Volume and Layout and titles, each with its own Review (preview on the video) and Cut all (one undoable edit). Checked by screenshot; Cut all was not pressed, to leave your video alone.
- Not built: Tella's "Buffers" (silence at the start and end). We have no measure of that, so I did not add a section for it. Tella also shows the timeline only for some tools; ours always shows it.

## Repos read for the agentic side (2026-10-30; READMEs and file lists only, nothing cloned, licences not yet checked)
- **Samin12/proof-first-video-pipeline:** a staged editing skill (snapshot, cut candidates, cut review, one writer applies cuts, proof and visual plan, template visuals, assemble, review, optional reels). Ships an interactive map where selecting a stage shows its model, tools, input, output and quality gate. Idea for us: the Edit chat can show the stage it is on instead of a wall of text.
- **nateherkai/herk-edit-kit:** 15 skills for Codex and Claude Code on HyperFrames, 406 draft motion-graphics cards as HTML in two styles, each with a manifest, CSS tokens and editable slots, plus transcript-driven cuts and mistake detection. The HTML card with editable slots is the shape our "hover to see it" needs.
- **zhuyansen/awesome-claude-video-skills:** a list of 385 video skill repos; each entry has a short preview GIF. The pattern worth borrowing: every skill shows a looping preview before you run it.
- **github topic reels-editor:** mostly unrelated apps. One fits: moshspro-dev/video-effect-reel, a library of 123 effect recipes you can look up by name.

## Fourth pass (2026-10-30)
- Timeline no longer runs 20 seconds past the end of the video; it now ends 3 seconds after it. (One-line change; not checked by scrolling, because keyboard and scroll input to the app were blocked.)
- Graphics panel: pointing at Title Card, Lower Third, Callout or Chapter Label shows it on the video at the playhead without adding it; moving away puts the playhead back. Built on the preview that the chat's cards already use. Type-checked; not seen working, for the same reason.

## Fifth pass (2026-10-30): skill previews and a quieter Edit
- "Other project in the plan" = `docs/reference/motion-style.md`, which points at **Vibha-Ramprakash/claude-video-effects** (45 face-centred reel effects run as `/effects <name>`; one-line catalog; licence is not stated, so nothing is copied; effects 30 to 45 of its table were never reviewed by the earlier study, and its table lists them: profile-wall, tier-list, broll-split, phone-fan, dot-reveal, headline-wall, checklist, liquid-glass-graph, carousel-spin, match-cut, apple-toggles, led-sign, slow-push, over-the-shoulder-zoom, messages, place-in-grid).
- The "/" list now shows a preview for any of your skills that ships files showing what it makes (a page, GIF, image or short video, found in folders named samples, examples, previews, templates or in files called preview, sample, demo, showcase, hero). Today that is 6 of 139 skills: reel-editor (4 motion samples, the slot-machine sketch and a reference video), hyperframes-animation, hyperframes-creative, motion-graphics, motion-showreel and script-to-whiteboard-storyboard. Skills without such files show no preview: nothing is made up.
- Pages play in a sandbox (no access to the app or its data). Their animation timelines are started on a loop by the server, which does not change the skill's file. Vertical pages are shown at their real shape.
- The rail keeps five tools (Transcript, Cut, Captions, Layout, Graphics); Clip, Zoom, Text, Music, Media, background and cursor sit under More. The ruler no longer repeats the scene names.
- Checked in a browser against the running app's server (screenshot of the preview playing). In the desktop app itself I could not type, because macOS secure input was blocking keystrokes.

## Sixth pass (2026-10-30): timeline tested on a scratch copy
A copy of the club folder and the recorder's data (copy-on-write, in the session's scratch folder) was run on a second server (port 4391) so drags could be tried without touching your real video. The copied export lock was moved aside in the copy only. The real data was not written. The second server has been stopped.

Seen on the copy:
- The ruler ran on to about 0:55 for a 0:32 video: the zoom was not fitted. **Fixed:** the timeline now opens fitted to the whole video, once per video.
- A drag of the camera clip did nothing and said nothing. This is by design (clips stay joined end to end; the video starts at 0:00; with one recorded clip there is nothing to reorder), but it felt broken. **Fixed:** dropping where it cannot go now says "Clips stay joined end to end. Drag a clip onto another one to change the order."
- Caption chips sit edge to edge, so they cannot slide either (same rule).
- A graphic added from the Graphics panel dragged fine (moved 100 px).
- There was no plain way to add things from the timeline. **Added:** an "Add" button on the timeline bar: Clip from a file, Text and shapes, Animated graphic, Music (each opens the existing panel or the import).
Tests: timeline-edit, edit-chrome and edit-menus (24 pass).

## Seventh pass (2026-10-30): styling
- The empty strip across the top of Edit (it only held Undo, Redo, History and Export) is gone. Undo, Redo and History sit on the timeline bar after Delete; **Export video** is the one outlined button at the end of that bar. The video and the timeline get that height back.
- The scene row under the timeline no longer shows a scrollbar.
- The video sits on a soft shadow.
- The timeline bar has thin separators between its groups (Add, Split, Delete | Undo, Redo, History | zoom, Fit, View | Export) and its zoom slider shrinks before anything wraps.
- Tests updated to match the new places (edit-ui: the rail is five tools plus More, the toolbar items are on the timeline bar): 40 pass across the Edit, workspace, record-screen and skills tests.
- Checked by screenshot of the desktop app.
