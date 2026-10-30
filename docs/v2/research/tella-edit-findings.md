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
