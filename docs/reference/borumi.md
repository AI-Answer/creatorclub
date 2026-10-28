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

Open: visual layout (spacing, panel positions, recorder overlay) still needs a look at the running app.
