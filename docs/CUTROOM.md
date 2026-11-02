# Cutroom in Creator Compiler

Cutroom is built from the source in `engine/cutroom`. It is bundled with both desktop installers and exposed through the same MCP server as the editor.

## In the desktop app

1. Open a video with camera or screen footage. Generate word-timed captions before automatic cutting.
2. Click **Cutroom → Prepare this video**. This freezes the committed project revision and its media references in a separate workspace.
3. Click **Detect cuts**. The native engine proposes retake and silence cuts. Review exact source ranges and the ambiguous-review notes. **Apply reviewed cuts** ripples every editor track and saves a history checkpoint. A changed project blocks application; prepare a fresh snapshot.
4. Choose a motion-graphics template, enter the on-screen text, set the anchor and duration, and click **Add graphic**. Anchors can be word IDs (`w123`), a spoken phrase, source time (`s:12.5`), or output time (`o:2`).
5. **Render frame** produces an actual native-engine preview. **Render with Cutroom** exports a video. **Open as new video** imports the completed output without replacing the original.

The most recent workspace is remembered for that project. Jobs and their logs are saved beneath the studio data directory. Interrupted jobs are marked as needing a rerun after a service restart. Cancel terminates the engine and its renderer subprocesses.

## MCP tools

| Tool | Action |
| --- | --- |
| `cutroom_status` | Read installed engine/version status |
| `cutroom_prepare` | Snapshot a committed editor project |
| `cutroom_get_workspace` | Read status, review notes, graphics, and the detected plan |
| `cutroom_update_graphics` | Validate and save beats and chapters |
| `cutroom_run` | Start `detect`, `check`, `privacy`, `preview`, or `render` |
| `cutroom_apply_cuts` | Apply a reviewed plan with its exact original revision |
| `cutroom_import_render` | Import the current completed render as a new project |
| `cutroom_cancel` | Cancel active engine work |

Poll `cutroom_get_workspace` after an asynchronous action. Do not refresh or replace a stale revision automatically. Read the cut proposal and decide before calling `cutroom_apply_cuts`.

```json
{
  "beats": [{"at":"o:0","hold":"3s","lead":0,"kind":"title","text":"Your *next* great video"}],
  "chapters": []
}
```

Supported beat kinds include title, bullets, number, code, quote, image, video, ring, highlight, arrow, callout, lower, blur, zoom, and layout. Failed validation restores the preceding graphics specification. Applying the same cut plan twice is rejected.

## Media mapping

The bridge converts the committed timeline from seconds to Cutroom's milliseconds. Screen and camera clips retain their timeline positions and source in-points. Word-timed captions become stable word IDs. Explicit audible audio tracks are preferred for narration, otherwise camera audio, otherwise embedded screen audio. Original media files are referenced and remain unchanged.

Cutroom renders a separate camera/screen composition. It does not reproduce editor transforms, effects, overlays, gain, music, or cursor styling. Source playback speed must be 1×. Its output can be imported into the existing editor as a new project. The standard editor export retains the editor's composition.

The local engine path can be overridden with `CREATOR_COMPILER_CUTROOM`. Packaged apps resolve the bundled executable, including `.exe` on Windows. Privacy scanning additionally requires Tesseract; the integration never runs the Claude editorial agent automatically.
