# Borumi reference

Source: the UI bundle of Borumi 0.32.1 installed at `/Applications/Borumi.app` (`Contents/Resources/ui/assets/*.js`), labels read on 2026-10-28. Screen control of Borumi was declined, so this covers wording and flow, not visual layout. Borumi is a native app (Sparkle updater, bundled ffmpeg, its own speech and segmentation models) with a web UI inside.

## The flow, in Borumi's words

- Home: "Recent projects", "New Project", "Quick recording" ("Start recording right away, and edit the video if necessary.").
- First run: "Borumi is ready. Time to record your first video." Then "First, check your camera, microphone, and screen on the left."
- A project has three stages, named in one sentence: "Prepare your script, record the scenes and edit them." The stages are **Script**, **Recording**, **Editing**.
- Moving between stages is a single named button: "Continue to Recording", "Continue to Editing", "Back to Script", "Back to Recording", "Back to projects".
- Script: made of **Scenes** ("Add scene", "Add scene before", "Add scene after", "Delete scene", "Select a scene"). Teleprompter: "Open teleprompter", "Open script as separate window", "Rewind script to the top".
- Recording: "Start recording". After a take: "Confirm take", "Record another take", "Delete take", "Archive take" ("Don't confirm the take, but keep it in the archive for later."), "Play take", "Record new...", "Record over...". "Replace matching clips in the timeline with this take."
- Editing: "Want to edit via transcript?", "Start editing with AI", "Layout", "Captions", "Camera Zoom", "Screen Zoom", "Select a clip in the timeline to edit its properties."
- Export: "Export Video", "Export Audio", "Export Transcript", "Export recordings". Done message: "You can now export your video and use it anywhere."

## Error and empty-state wording worth copying

- "Fix the source issues above before recording."
- "No transcript is available for this project yet."
- "This scene has no transcript"
- "Add a scene to start creating elements."
- "Warn when microphone is silent" (setting)

## What CreatorClub takes from this

1. The words: **Scene**, **Take**, **Confirm take**, **Record another take**, **Delete take**, **Recent projects** (ours: "Recent videos").
2. The "Continue to X / Back to X" button pattern: every stage ends with one button that names the next stage.
3. One sentence that explains the whole project ("Prepare your script, record the scenes and edit them."). Ours: "Plan it, record the scenes, edit, publish."
4. Pre-flight check before the first recording (camera, microphone, screen), with a single sentence telling you what to fix.
5. A "Quick recording" escape hatch: record now, plan later.

## Layout, from the running app (2026-10-28)

Dark UI, near-black background, white primary buttons, one blue for selection. Very few controls per screen.

- **Home ("How would you like to start?")**
  - Two big cards. **Structured video**: "Prepare your script, record the scenes and edit them." **Quick recording**: "Start recording right away, and edit the video if necessary."
  - Below them, **Recent projects**: a list of rows with thumbnail, name, folder path and "20 hours ago", plus **View all**.
  - On launch it shows two pop-up cards, top right: **Connect to ChatGPT?** and **Connect to Claude?** ("Would you like to connect Claude to Borumi to edit your projects with AI?"), each with `Don't ask again` and `Connect`.
- **Every project screen** shares one frame:
  - **Top:** project tabs (like a browser), the project name centred with an "Edited" state, and undo, redo and history on the right.
  - **Bottom bar:**
    - left: `‹ Back to <previous step>`
    - centre: the step bar `Script › Record › Edit`, where the current step's icon sits in a white circle
    - right: one white primary button `Continue to <next step> ›`
- **Script:** an empty canvas with "Scene 1" and a text cursor, then `+ Add scene`. Nothing else.
- **Record:**
  - **Left column:** `Recording presets` menu, then Camera, Microphone and Screen. Each has an on/off switch, a device picker, a gear and a live preview.
  - **Warnings:** shown as one coloured card at the top of that column, e.g. "Your disk is almost full… We recommend freeing up at least 9 GB."
  - **Main area:** one card per scene. Each card has `+ Record` followed by its take thumbnails ("Take 1 (00:07)"). `+ Add scene` sits under the cards.
- **Take preview** (click a take):
  - **Header:** `Take 1`, a green `CONFIRMED` badge and a gear.
  - **Preview:** the main source large, with the other sources (camera, microphone waveform) stacked on the right. Below it, scrubber, play, ±5 s and speed.
  - **Bottom:** `Delete take` (red) on the left; `↺ Record another take` and `Continue` (white primary) on the right.
- **Edit:**
  - **Left rail:** labelled icons Canvas, Layout, Clip, Zoom, Elements, Music, Captions, Cursor and an AI wand.
  - **Centre:** preview. **Right:** the transcript, per scene, with the spoken word highlighted as it plays.
  - **Below:** transport, plus a small tool group: select, blade, snap, ripple, align and zoom.
  - **Timeline:** one row per source (SCREEN, CAMERA). Words sit on top of the camera waveform. Scene markers run across the top.
  - **Export:** a white button top right with a format dropdown.

What we copy:
1. The bottom bar: back on the left, steps in the centre, one "Continue to" button on the right.
2. The take preview with only three choices.
3. Scene cards with takes as thumbnails.
4. Warnings as one coloured card, not as scattered errors.
5. Words shown on the waveform.

Our own steps add **Plan** before Script (which becomes the outline) and **Publish** after Edit.
