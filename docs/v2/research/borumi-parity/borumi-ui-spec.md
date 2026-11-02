# Borumi v0.32.1: Static UI/UX Spec (from the shipped web UI bundle)

Source: `/Applications/Borumi.app/Contents/Resources/ui` (read-only). All analysis ran on copies under `/private/tmp/claude-501/-Users-danizal-signalcore-signalcore-backend-signalcore-backend/bf9cd215-b7df-41f3-8c9d-21ca4059b860/scratchpad/borumi-ui/`.

Purpose: a behavior and look spec for an independent clone (SceneForge). Describes tokens, sizes, class lists, strings and behaviors only. No code is reproduced beyond short identifying snippets.

## 0. How to read this spec

- **Citations.** `file:line` means the bundle file, at the line in the prettier-formatted copy at `.../borumi-ui/pp/<file>`. The minified originals are at `.../borumi-ui/ui-copy/assets/<file>`. Line numbers do not match the shipped minified files. Identifiers in backticks are the minified names used in the bundle (for locating code). They are not product names.
- **Tags.** `[V]` = read directly in the bundle. `[I]` = inferred from names or context, not confirmed. `[N]` = not determinable from the bundle (see section 10).
- **Tooling.** Prettier 3.3.3 for formatting. `@babel/parser` AST walks for strings, class lists, command kinds, and shortcut handlers. A custom CSS custom-property parser. Scripts live in the scratchpad folder.

### 0.1 Bundle inventory

| File (in `assets/`) | Size | Role [V unless noted] |
|---|---|---|
| `index.html` (root) | 496 B | Mounts `#root`. `<body class="dark">` is static. Calls `window.borumi.theme.refresh()` inline. |
| `index-BOa99FnS.js` | 719 KB | Shell entry. React, mobx-react-lite, Radix primitives (128 `radix` hits), Sentry (prod only), root switch, error boundary, store-patch engine, shared UI primitives (`Button`, Tooltip, Dialog, Menu, Input, Select). |
| `index-2TDxNpOf.js` | 1.46 MB | Main window app (`root === "main"`). Lazy chunk. Project list, project editor (Script / Record / Edit), settings, wizard, dialogs. Contains tiptap/ProseMirror (64 hits) and framer-motion references (4). |
| `index-DAWue-_s.js` | 33 KB | Recorder window (`root === "recorder"`). |
| `index-Bek2B5yO.js` | 13 KB | Teleprompter window (`root === "teleprompter"`). |
| `tokenize-script-BWliYbB6.js` | 16 KB | Command bridge helpers (`P`, `T`, `ipc.send` wrappers) and script tokenizer. |
| `use-capture-warnings-D4bMQkfA.js` | 17 KB | Capture warnings, live-source view binding (`view.register`), ipc listeners. |
| `use-teleprompter-context-menu-Do8ZfJQ9.js` | 25 KB | Teleprompter context menus and speech-permission prompt. |
| `index-CzNh7JBz.css` | 7.7 KB | Custom animations: wizard welcome, logo, celebration, hint, advice bubble. |
| `index-DXJH5HZm.css` | 112 KB | Main stylesheet: Tailwind v3-style preflight, `:root` / `.dark` tokens, utilities, Radix animations, editor styles. |
| `index-DccVBVlC.css` | 394 B | Recorder waiting-window illustration animation. |

### 0.2 Stack, as observed

- React with Radix-based primitives (shadcn-style `cva` variants) and Tailwind v3-style utilities (`[V]` `index-DXJH5HZm.css` preflight and default scale). Tailwind v3 vs v4 is `[I]` from the `--tw-*` var set and `::backdrop` rule.
- Client state is a native-pushed store (section 1.3). mobx-react-lite is used for reactive reads.
- Error reporting: Sentry, enabled only when `window.borumi.executionScope === "prod"` (`index-BOa99FnS.js:40823`). The DSN is in the bundle and is not reproduced here.
- Rich-text / script editor: tiptap / ProseMirror (`.tiptap pre` styling in `index-DXJH5HZm.css`).

## 1. Architecture

### 1.1 Roots (four windows, one bundle)

`index-BOa99FnS.js:40714-40760` chooses the root from `window.borumi.root`:

| `window.borumi.root` | Chunk loaded | Window size class | Notes |
|---|---|---|---|
| `main` (default) | `index-2TDxNpOf.js` | `large` | Main app. |
| `recorder` | `index-DAWue-_s.js` | `medium` | Floating recorder window. |
| `teleprompter` | `index-Bek2B5yO.js` | `medium` | Teleprompter window. |

- Lazy-loaded through `React.lazy` with a `Suspense` fallback. The fallback is a skeleton: for `main` a centered 700px column of placeholder blocks (`index-BOa99FnS.js:40756-40800`); for `recorder` a full-bleed placeholder.
- A window-level error boundary (`iK`, `index-BOa99FnS.js:40591`) renders `sK` for `large` and `aK` for `medium`. Copy: "Oh snap! Something went wrong :(" then "The team has already been notified of this issue, and we'll fix it as soon as possible." and "In the meantime, you can try restarting Borumi." then "If the problem persists, please let us know at" + `support@borumi.com` `[V]`.
- Native window listeners: `document.addEventListener("contextmenu", preventDefault)` disables the web context menu app-wide (`index-BOa99FnS.js:40830`). Space-bar activation of focused buttons is suppressed unless focus is in an input, textarea, or contenteditable (`index-BOa99FnS.js:40800-40820`, `__borumiSpaceActivationPrevented`).

### 1.2 Routing inside `main`

`window.borumi.root === "main"` renders a single store-driven screen switch. The selected screen is `root.app.active_screen.kind` (`index-2TDxNpOf.js:79348-79365`, `Coe`):

| `active_screen.kind` | Renders | Notes |
|---|---|---|
| `NewProject` | Home (section 6). | Default when no project is selected. |
| `Project` | Project editor (section 3.4). | `id` = project id. |
| `ProjectLoading` | Loading session view (`_oe`, `index-2TDxNpOf.js:79132`). | `session_id`. |
| `Settings` | Settings (section 3.5). | `tab.kind` + optional `focused_setting_id`. |

Navigation is an in-app update of the store, sent as `{kind:"app.active_screen.update", screen:{...}}` (`index-2TDxNpOf.js:2174`, `2227-2254` mapping). The shell tab strip (section 2) changes selection through the same message. Entry points to Settings `[V]`:
- "Change" button when the projects folder is invalid (`index-2TDxNpOf.js:3159`, focuses `override_projects_dir`).
- "Set up key" link in an ElevenLabs notice (`index-2TDxNpOf.js:77432`, opens Integrations, focuses `elevenlabs_api_key`).
- The main menu button sends `request.menu.show` (`index-2TDxNpOf.js:2177`); the native menu contents are not in the bundle `[N]`.

### 1.3 State and the native bridge (protocol)

- **Inbound.** The renderer subscribes once: `window.borumi.ipc.addMessageListener` handles `StoreSnapshot`, `StorePatch`, `HistoryUpdate` (`index-BOa99FnS.js:40276-40286`). Patches carry a contiguous `sequence`. A gap, a failed apply, or an uninitialized store sets `waiting_for_snapshot` and sends `control.send({type:"stale-snapshot"})`, throttled to 1 request per second (`index-BOa99FnS.js:40215-40300`). While waiting, the root shows the skeleton (`index-BOa99FnS.js:40735`).
- **Outbound commands.** One helper builds `{kind, ...payload}` and calls `window.borumi.ipc.send` (`tokenize-script-BWliYbB6.js:26-27`, `le`). A second helper adds a `scope` object. Scope kinds seen: `Project` (`project_id`), `ProjectLoadingSession` (`project_loading_session_id`), `Notification` (`notification_id`) (`tokenize-script-BWliYbB6.js:29-36`; `index-2TDxNpOf.js:2183-2190`, `3066-3072`).
- **Two wire shapes `[V]`.** Call sites use both `P("request.x", payload)` (flat: `{kind:"request.x", ...payload}`) and `P({kind:"request.x", ...})` (nested: `{kind:{kind:"request.x", ...}}`). Context-menu items also use the nested shape: `command: { kind: { kind: "request.project.close_others" }, scope }` (`index-2TDxNpOf.js:2127-2135`). Whether the native side unwraps the nested form is `[N]`. The appendix lists the command catalogue.
- **Analytics.** `sr(name, params)` sends `request.event.track` (`index-2TDxNpOf.js:1658-1664`). Event names observed: `active_screen.change`, `project.create` (with `template`), `recent_project.open`, `project.close`, `project.script.initialize`, `scene.record_new_take` `[V]`.
- **Undo/redo history.** The renderer keeps `history[id] = {undo, redo}` labels from `HistoryUpdate` (`index-BOa99FnS.js:40277`). Header buttons send `request.undo` / `request.redo` (section 4.6).
- **Theme.** The bundle does not compute the theme. `index.html` calls `window.borumi.theme.refresh()` and `<body class="dark">` is static. Dark mode is class-based (`.dark` selector, Tailwind `dark:` as `:where(.dark, .dark *)`). There is no `prefers-color-scheme` in any stylesheet `[V]`.

## 2. App chrome (main window)

`index-2TDxNpOf.js:1457-1640` (`p2`, the shell bar):

- Root container: `flex flex-row items-stretch bg-secondary p-0`. This is a horizontal **tab strip**, not a sidebar.
- Left to right:
  1. macOS traffic-light reserve: `w-[77px] shrink-0 border-r`, only when `platform === "macos"` and not fullscreen (`index-2TDxNpOf.js:1509`). Platform strings `macos` and `windows` are used `[V]`. Fullscreen comes from `window.borumi.fullscreen` (`1466-1500`).
  2. Menu button (`f2`, `shrink-0 border-r`) → `request.menu.show`.
  3. Project tab area (`a2`, `index-2TDxNpOf.js:1182`). One tab per open project (`root.projects`) and per loading session (`root.project_loading_sessions`, status `loading` or `error`; `index-2TDxNpOf.js:1368-1396`). Tabs have rename, duplicate, close, close others, close all, through the project-tab context menu (section 4.2).
  4. Trailing "New Project" control: a tab labelled `New Project` (`index-2TDxNpOf.js:1527`) when the new-project screen is active, otherwise a select control (`n2`, `index-2TDxNpOf.js:966`; label and icon `[I]`).
  5. MCP client indicators (`h2`), one per connected MCP kind (`ChatGpt`, `Claude`, `Other`) (`index-2TDxNpOf.js:1392-1396` and `1446-1455`).
  6. Help button (`Qs` with `icon:"help"`, `shrink-0 border-l`).
- Help popover (opened by the help button): full-window scrim `absolute top-0 left-0 w-full h-full bg-black/70 z-50`; panel `absolute top-12 right-6 w-80 bg-background dark:border dark:border-border rounded-lg shadow-lg overflow-hidden`, containing:
  - "Need help?" (`text-lg font-semibold`)
  - "Contact support" card: "We're here to help if you have any questions, suggestions or concerns." → opens `https://borumi.com/contact` (`index-2TDxNpOf.js:1568-1600`).
  - "Report issue" card: "Are you experiencing a issue? Report it here and we'll help you as soon as possible." → opens the feedback dialog with kind `Bug` (`index-2TDxNpOf.js:1613-1622`, `2217-2222`).
  - Card class: `bg-secondary p-4 rounded-md border border-border cursor-pointer transition-colors hover:border-blue-500` (Contact) and `hover:border-orange-500` (Report) `[V]`.
- Escape closes the help popover; a mousedown outside it also closes it (`index-2TDxNpOf.js:1477-1489`).
- The whole shell is `h-full w-full flex flex-col select-none`; the content area is `calc(100vh - {bottom-bar}px - 39px)` (`index-2TDxNpOf.js:79365-79371`).

## 3. Screens

### 3.1 Home / New Project (`jM`, `index-2TDxNpOf.js:3521`)

Layout: a scrolling column, `overflow-y-auto w-full h-full`, inner `flex flex-col items-stretch p-10 pt-14 max-w-[800px] mx-auto gap-14` `[V]`. Scroll position is tracked to fade and shift the hero.

1. **Hero (sticky)** `xM` (`index-2TDxNpOf.js:3173`): sticky `top-0 z-10 pb-4 bg-background gap-10`.
   - Heading "How would you like to start?" (`text-center text-lg font-bold text-neutral-950`). Collapses when scrolled past 60px (`opacity-0 scale-y-50`).
   - Two template cards in a row (`flex gap-9`), collapse with `-translate-y-6` past 60px:
     - "Structured video" / "Prepare your script, record the scenes and edit them." Icon `structured`, icon well `bg-success-500`, hover border `hover:border-success-500`. Creates `request.project.create` with `intent:{kind:"Structured"}`; analytics `project.create` with `template: "structured"`.
     - "Quick recording" / "Start recording right away, and edit the video if necessary." Icon `quick-record`, icon well `bg-info-500`, hover border `hover:border-info-500`. Creates with `intent:{kind:"QuickRecording"}`; analytics `quick_recording`.
   - Card class (`nx`, `index-2TDxNpOf.js:3107`): `bg-secondary p-9 rounded-md border border-border text-center flex flex-col items-center cursor-pointer`. Icon well `w-10 h-10 rounded-full bg-neutral-200 mb-4` (overridden by the colour above). Title `font-bold mb-2`. Description `text-sm opacity-80`.
2. **Projects-folder warning** `pM` (`index-2TDxNpOf.js:3129`), shown only when `override_projects_dir_validation_error` is set. Yellow card `flex flex-col gap-3 bg-yellow-100 p-5 rounded-md`, title "Oh snap! Something went wrong with your projects folder.", the error text, and a "Change" button (`icon:"settings"`, `w-fit`) that opens General settings with `override_projects_dir` focused.
3. **Recent projects** `SM` (`index-2TDxNpOf.js:3441`):
   - Loading with no cached items: five skeleton rows, each `h-20 w-full` (`oi` skeleton).
   - Error: card `flex flex-col bg-red-100 p-6 rounded-md w-full` with "Oh snap! Something went wrong when loading your recent projects.", links "Show in Finder" (macOS) or "Show in Explorer" (`index-2TDxNpOf.js:3390-3400`), "try again" and "contact us"; error text in `bg-red-50 p-3 rounded-md text-xs font-mono`. Links are `underline cursor-pointer font-semibold text-red-900`.
   - Populated: header row with `h2` "Recent projects" (`text-sm font-bold text-neutral-950`), a spinner while refreshing (`animate-spin w-4 h-4 opacity-30`), and a ghost `sm` button "View all" that opens the projects folder (`request.open_projects_folder`). Rows in a `flex flex-col gap-2` list.
   - Empty: renders nothing (no empty-state copy in the bundle `[V]`).
4. **Recent project row** `vM` (`index-2TDxNpOf.js:3336`): `bg-background border-border border rounded-md p-3 flex gap-3 items-center hover:border-border-hover cursor-pointer`.
   - Thumbnail `w-20 min-w-20 h-12 bg-secondary rounded-sm overflow-hidden`, image from `resource.getUrl("project_preview", [id], {modified_at})`. Shown only when the main window is visible. Image is `object-contain`; a black background appears after load.
   - Name: `text-sm font-bold leading-none truncate`. Path: `text-xs opacity-50 leading-none truncate`.
   - Relative time, right-aligned, `text-sm opacity-80 whitespace-nowrap`. Strings: "just now", "N minutes ago", "N hours ago", "N days ago", "N weeks ago" (`bM`, `index-2TDxNpOf.js:3396-3414`).
   - Click opens (`request.project.open`, `create_if_not_exist:false`, analytics `recent_project.open`). Right-click opens the recent-project context menu (section 4.2).

Board, kanban, folders, tags, and sorting controls: none in this build `[V]` (see section 6).

### 3.2 Project tabs and loading sessions

Tab strip behaviour is in section 2. A loading session shows a spinner or an error state from `status` (`loading`, `error`). Error sessions use `Error` or `UpdateRequired` status kinds (`index-2TDxNpOf.js:1374-1380`).

### 3.3 Project header (shared by the three project tools)

`TM` (`index-2TDxNpOf.js:3596-3616`): `relative flex h-12 min-h-12 items-stretch border-b border-border bg-background px-2`.
- Left slot (`z-10 flex min-w-0 items-center gap-1`).
- Centre: the project name, absolutely centred in a `w-[50vw] max-w-2xl` box. The name is `text-xs font-bold text-primary`, truncated, with `hover:bg-primary/5`; click renames. Tooltip "Click to rename project" (`index-2TDxNpOf.js:3629-3650`).
- Save status next to the name (`CM`, `index-2TDxNpOf.js:3540-3595`). States and copy:
  - `dirty`: "Edited" (with a divider) and tooltip "You have unsaved changes".
  - `saving`: spinner, tooltip "Saving...".
  - `saved`: check icon, tooltip "The project has been successfully saved".
  - `error`: red "Saving error", tooltip "There was an error while saving the project, please contact us if the problem persists."
- Right slot (`z-10 ml-auto flex items-center gap-1`): Undo, Redo, Version History, a separator (`w-[1px] h-4 bg-border mx-1`), then tool-specific buttons (for example Record presets, export).
- Header icon buttons (`Mu`, `index-2TDxNpOf.js:3656-3668`): `p-1 hover:bg-secondary rounded-md`, `bg-secondary` when active, `cursor-not-allowed opacity-50` when disabled, 500 ms tooltip delay. Icons: `undo`, `redo`, `history`.

### 3.4 Project editor (`Zre`, `index-2TDxNpOf.js:76078`)

Stack (top to bottom). In the workflow-review or take-preview state, this whole layout is replaced by the overlay described below.
1. Header (`oR`, section 3.3).
2. Work area: flex row containing the active tool (`xte`, `index-2TDxNpOf.js:69260`), plus a right-side **Version History** panel (`Vre`) when open. A version preview disables pointer events on the tool.
3. Bottom **step bar** (`aR`, `index-2TDxNpOf.js:5078`): `flex flex-row justify-center border-t border-border h-16 min-h-16 relative bg-background`. Three steps joined by arrows: **Script**, **Record**, **Edit**. Each step is a 40px circular icon well `h-10 w-10 rounded-full bg-primary/5` (active: `bg-primary text-primary-foreground`), with a label `text-sm font-bold ml-2`. The active step is `project.active_tool.kind`. Each step sends `select.active_project_tool`. Continue buttons, when a step is complete: "Continue to Recording" (`index-2TDxNpOf.js:5054`) and "Continue to Editing" (`index-2TDxNpOf.js:5073`). The exact condition is `[I]`.
4. Overlays and dialogs (`Sv`, `Gp`, `Lre`): transcription/notice alerts and dialog hosts.

Alternate full-area states that replace the layout above (`Ore`, `index-2TDxNpOf.js:75627`): **Workflow review** (`workflow_review`) and **Take preview** (`take_preview_dialog`). The workflow-review fallback text is "This workflow is waiting for a review kind that does not have a UI yet." `[V]`.

Missing project: "Project not found" (`index-2TDxNpOf.js:76083`).

On mount, the editor requests `request.playback.play` and `request.project.transcribe_pending_medias` (`index-2TDxNpOf.js:69131`). This is worth knowing for clone behaviour: the editor auto-starts transcription of pending media.

#### 3.4.1 Script tool (`yD`, `index-2TDxNpOf.js:25815`)
- Scene-based script editor (tiptap-based, `.tiptap` styling). Actions: "Add scene" (`index-2TDxNpOf.js:25691`); a script start hint "Start writing your amazing video..." and body "You can also paste your script from Notion, Google Docs, or your favorite editor, or" + "right away." (`index-2TDxNpOf.js:25779-25795`); primary CTA "Start Recording" (`index-2TDxNpOf.js:25790`).
- Initialization failure: "Unable to initialize script" (`index-2TDxNpOf.js:25734`).
- Source chooser in the same area: "Screen", "Region", "Window", and "Select region" (`index-2TDxNpOf.js:26003-26068`).
- Keyboard: `SelectAll` scoped to `ScriptTool` (section 4.1).

#### 3.4.2 Record tool (`P8`, `index-2TDxNpOf.js:33119`)
- Drop target: "Drop to import your media" (overlay) and the idle hint "or drop a file here to start." (`index-2TDxNpOf.js:33148-33206`), with a "Record" button.
- Sources: Camera, Microphone, Screen, System Sound (`ProjectSource`, `index-2TDxNpOf.js:26412-26418` names). Source configuration sub-panel labels: Resolution, Rotation, Mirror camera, Synchronization, Audio channels, Audio engine, Warn when microphone is silent, Max Frame Rate, Hide Borumi from recordings (`index-2TDxNpOf.js:26453-26582`).
- Record presets: "Save as preset", "Save as a new preset", "Update preset", "Reset preset", "Duplicate preset", "Delete preset", "Search presets", "MacOS Presets" (`index-2TDxNpOf.js:3939-4195`, `26678`). Shortcut `RecordToolShowPresets` (section 4.1).
- Source-status alerts: "Some permissions are missing", "Your window was closed.", "Unable to start recording", "Your window is not responding.", "Screen recording may be stuck", "System sound cannot be recorded." (`index-2TDxNpOf.js:27095-27330`), each with a description.
- Scene-entry context menu actions: "Record new...", "Record over...", "Import media from file..." (`index-2TDxNpOf.js:31504-31540`).

#### 3.4.3 Edit tool (`pte`, `index-2TDxNpOf.js:69100`)

Layout tree `[V]` unless marked:

```
[ left rail  AQ  w-[72px] shrink-0 border-r ]  [ main column  flex-1, flex-col ]
                                                 ├ vertical split (ha: minSizes [200,200], ratios [1.5,1])
                                                 │   top band (flex row)
                                                 │     ├ properties sidebar (RQ, optional: when active_edit_panel !== null)
                                                 │     ├ preview (PU), flex 2  (ha horizontal, ratios [2,1])
                                                 │     └ transcript (Kee, optional: when is_transcript_panel_active and scenes exist)
                                                 │   bottom band (flex-col)
                                                 │     ├ timeline toolbar (nX)
                                                 │     └ timeline (LH)
```

- Left rail `AQ` (`index-2TDxNpOf.js:66709-66760`): `flex h-full min-h-0 w-[72px] shrink-0 flex-col gap-0 overflow-x-hidden overflow-y-auto border-r border-border`. Items (`BT`, `index-2TDxNpOf.js:66566-66599`): **Canvas**, **Layout**, **Clip**, **Zoom**, **Elements**, **Music**, **Captions**, **Cursor**, **Automate**. Each item: `flex flex-col items-center px-3 py-2 gap-1 rounded-sm hover:bg-secondary cursor-default`, icon well `w-9 h-9 rounded-full bg-primary/5` (active `bg-primary text-primary-foreground`), label `text-xs font-medium` (`text-[11px]` when the label is longer than 7 characters). Some panels keep their expanded height and use `bg-card`.
- Properties panel (`RQ`) and its field groups: strings are in section 4 and the appendix. Empty state "Select a clip to edit its properties." and the screen-zoom and camera-zoom empty states (`index-2TDxNpOf.js:54379`, `54752`, `55229`, `58954`).
- Timeline toolbar `nX` (`index-2TDxNpOf.js:52176-52260`): `border-border border-t border-b flex items-center justify-center gap-2 select-none`. Contents not fully traced `[I]`. The snapping and scrubbing toggles are labelled "Enable snapping" and "Enable scrubbing" in the timeline context menu (`index-2TDxNpOf.js:38941-38960`).
- Timeline `LH` (`index-2TDxNpOf.js:43948`) and track model: track kinds from the layer switch (`index-2TDxNpOf.js:33340-33362`, `34344-34363`): VideoClip, AudioClip, Layout, ScreenZoom, CameraZoom, ScreenBlur, ScreenHighlight, Overlay, Annotation, Captions, Cursor, Music, SoundEffect. Track display labels: "Layout", "Screen Zoom", "Screen Blur", "Highlight", "Camera Zoom", "Text", "Overlay" (`index-2TDxNpOf.js:38423-38465`).
- Alignment guides: horizontal and vertical 2px lines, `bg-blue-500/90`, drawn at the guide ratio (`_U`, `index-2TDxNpOf.js:50897-50916`). Toggled by "Enable alignment guides" (`index-2TDxNpOf.js:44063`).
- Preview quality: "Preview quality" with Best / Balanced / Fast / Faster / Fastest (`index-2TDxNpOf.js:43976-44042`).
- Clip-edit handles: top and bottom edge zones `absolute -top-1 left-0 right-0 h-2 cursor-ns-resize` (`index-2TDxNpOf.js:44259-44264`); corner-radius handles `w-2 h-2 rounded-full cursor-radius` (`index-2TDxNpOf.js:44580`); colour-coded handles (`border-blue-500`, `border-purple-500`, `border-yellow-500`) (`index-2TDxNpOf.js:44301`, `45504`, `44580`) `[I]` that each colour marks a different property class.
- Numeric drag fields: `cursor-ew-resize` input-as-slider (`index-2TDxNpOf.js:48904-48920`) `[I]` drag-to-scrub values.
- Transcript panel `Kee` (`index-2TDxNpOf.js:68398-68473`): `border-l border-border h-full flex flex-col gap-4 overflow-y-auto outline-none focus:ring-1 focus:ring-blue-400/50`. Word-level styling is `[N]` (not located).
- Version preview: the editor is read-only; `pointer-events-none` on the tool and the timeline (`readOnly` prop).
- Playback speeds: `Jo` is `[0.5, 1, 2]` on x64 and `[0.5, 1, 2, 4]` on arm64 (`index-2TDxNpOf.js:68950`). Playback-speed menu options: `KU` is `[0.5, 1, 1.25, 1.5, 2, 3, 4]` on arm64 and `[0.5, 1, 1.25, 1.5, 2]` otherwise (`index-2TDxNpOf.js:51996-51999`), rendered as a menu list (`index-2TDxNpOf.js:52031`) `[V]`.

### 3.5 Settings (`voe`, `index-2TDxNpOf.js:79067`; `Qre`, `76150`)

- Two-column: left nav `w-64 shrink-0 overflow-y-auto border-r border-border p-4` with an `h1` "Settings" (`text-2xl font-bold mt-4 mb-8 ml-4`) and eight tab buttons. Each button: `w-full px-4 py-3 text-left flex items-center gap-2 hover:bg-secondary-hover rounded-md`, active `bg-secondary`.
- Tabs (`Jre`, `index-2TDxNpOf.js:76135-76142`), with icon names: **Account** (profile-circle), **General** (slider), **Recording** (record), **Editing** (cut), **AI** (spark), **Shortcuts** (command), **Integrations** (puzzle), **Advanced** (settings).
- Each tab is a set of `settings.*.update` rows. The appendix has the full command catalogue and the row labels (for example: Resolution, Rotation, Mirror camera, Hide Borumi from recordings, Compensate for Bluetooth latency, Mono / Stereo, AVFoundation / Core Audio, Max Frame Rate). Specific copy is in the appendix.
- Shortcuts tab: "Shortcuts", "Customize the keyboard shortcuts used across Borumi.", "Reset all", "Enable Recorder shortcuts" (`index-2TDxNpOf.js:77545-77582`). Conflict copy: "That shortcut conflicts with another shortcut.", "Conflict", "This shortcut conflicts with:" (`index-2TDxNpOf.js:77504-77794`). Labels and bindings come from native state (section 4.1).
- Integrations: "Change the default folder where new projects will be saved." (`index-2TDxNpOf.js:78167`); "Borumi creates a folder named "Borumi AI Workspace" inside the location you choose." (`78948`). MCP setup copy and config snippet builders (`index-2TDxNpOf.js:81173-81179`), for example `[mcp_servers.borumi] command = ... args = ["mcp"]` `[V]`.

### 3.6 Onboarding wizard (`nM` / `iM`, `index-2TDxNpOf.js:2871-2930`)

- Dialog: `ot` root with `Ye` content `duration-0 max-w-[580px] gap-0 overflow-hidden p-0`, not closeable by the X. Decorative glow `dialog-glow` (tone `brand`, or `success` on the finish step).
- Step list (`Nu`, `index-2TDxNpOf.js:2642-2700`), in order. Permission steps show only when that permission is `Denied` and the user has not already skipped it:
  1. **welcome**: shown until `has_clicked_get_started`.
  2. **screen**: "Allow screen recording". Description: "Borumi needs permission to capture your screen during recordings. If you don't plan to record your screen, you can skip it."
  3. **camera**: "Allow camera access". Description: "Borumi needs permission to capture your camera during recordings. If you don't plan to record your camera, you can skip it."
  4. **microphone**: "Allow microphone access". Description: "Borumi needs permission to capture your microphone during recordings. If you don't plan to record your voice, you can skip it."
  5. **accessibility**: "Allow accessibility access". Description: "Borumi follows your mouse during recordings to create effects like automatic zoom-ins."
  6. **system-sound**: "Allow system sound recording". Description: "Borumi needs permission to capture your system sound during recordings. If you don't plan to record system sound, you can skip it."
- Permission card (`za`, `index-2TDxNpOf.js:2476-2510`): `relative flex flex-col px-10 pb-7`. Title `mb-2.5 text-[27px] font-bold leading-tight tracking-tight`, description `text-[15px] leading-relaxed text-muted-foreground`, a full-width allow button, and a "Skip for now" text button. Each card embeds a tutorial video from `assets.borumi.com`. The file varies by platform and macOS version (`minVersion 27` split) `[V]`.
- Progress bar (`rM`, `index-2TDxNpOf.js:2921-2945`): `relative mb-[26px] flex gap-1.5 px-10`, `role="progressbar"`, label "Step N of M", segments `h-[5px] flex-1 rounded-full transition-colors duration-300`, active `bg-brand`, inactive `bg-foreground/10`. Shown only when there is more than one permission step.
- Welcome (`X2`, `index-2TDxNpOf.js:2388-2470`): headline "Welcome to" (`welcome-rise text-[15px] font-semibold text-muted-foreground`), body "You're almost ready to create amazing videos. We just need to set up a couple of things first.", primary button **Get started** (`variant brand, size xl, rightIcon arrow-right`), legal line "By clicking "Get started", you agree to our Terms & Conditions and Privacy Policy" (links to `borumi.com/terms` and `borumi.com/privacy`).
- Finish (`tM`, `index-2TDxNpOf.js:2834-2870`): centred card `relative flex flex-col items-center px-10 pb-9 pt-11 text-center`, celebration overlay, mascot image (`asset/mascot-celebrating.png`), title "You're all set!", body "Borumi is ready. Time to record your first video.", button **Start creating** (closes the wizard).
- Polling: while the wizard is open, the renderer requests `request.app.permissions.refresh` every 1000 ms (`index-2TDxNpOf.js:2880-2886`). The wizard auto-closes when there are no permission steps left and the active screen is not `Project` (`index-2TDxNpOf.js:2897-2901`).

### 3.7 Dialogs (`index-2TDxNpOf.js`, all `open`-controlled via store `root.*`)

| Dialog | Store key / command | Notes |
|---|---|---|
| About Borumi | `about_borumi_dialog.close` | "Version" + `window.borumi.version`, link to embedded changelog (`index-2TDxNpOf.js:80387-80476`). |
| Changelog | `changelog_dialog.close` | Loads `https://borumi.com/embedded-changelog`, with `since_version` param. |
| Feedback / report | `feedback_reporting.dialog.open|close`, `.draft.*`, `.attachment.add|remove`, `request.feedback_reporting.send`, status `.status.update` | Kinds: Bug and others. Button "Send report" or "Continue" (`index-2TDxNpOf.js:80061`). |
| Logs | `logs_dialog.open|close` | `min-w-[800px] min-h-[600px] max-h-[80vh] flex flex-col p-6`. Lists sessions, picks latest by default (`index-2TDxNpOf.js:79389-79437`). |
| Rename project | `rename_project_dialog.open|close` | Input-based rename. |
| Open-source licences | `open_source_licenses_dialog.open|close` | Resource `open_source_licenses`. |
| MCP installation | `mcp.installation_dialog.open|close|selected_tab.update` | Tabs for ChatGPT, Claude, Other. |
| Upgrade (account) | `account.upgrade_dialog.update`, `request.account.open_upgrade_url`, `request.account.open_login_url`, `request.account.logout` | Account state from `root.account`. |
| Take preview | `project.take_preview_dialog.open|close` | Playback keyboard scope `TakePreview` (section 4.1). |
| Export dialogs | `project.export_video_dialog.open`, `request.project.export_video|audio|transcript|recordings` | See section 4.7 for the export menu. |
| Crop | `project.crop_dialog.open` | Crop of the selected video. |
| Teleprompter camera hub | `teleprompter_camera_hub_dialog.close`, `request.teleprompter_device.close_camera_hub_and_open` | Device setup for teleprompter. |
| Project loading session | `project_loading_session.close` | Modal for open-in-progress sessions. |
| Notifications (toasts) | `notification.create|close|delete` | Section 4.8. |

### 3.8 Recorder window (`index-DAWue-_s.js`)

Floating control surface, sized as `medium`.
- Status copy: "Initializing", "Ready", "Recording", "Paused" (`index-DAWue-_s.js:79-120`).
- Main buttons: **Record** (idle), **Stop** (recording), pause/resume icons, and a countdown with **Start now** and **Cancel** (`index-DAWue-_s.js:94-1069`). Countdown messages: "Getting things ready...", "Trying one last time...", "Taking a bit longer..." (`index-DAWue-_s.js:1158-1164`).
- Source chips: `bg-black/40 p-0.5 px-1.5 rounded-full text-white text-[0.5rem]` (`index-DAWue-_s.js:492`), with a status dot `w-2 h-2 rounded-full`.
- Control bar: `flex w-full max-w-full items-center gap-1 rounded-2xl bg-black/70 pl-2 pr-3 py-1.5 text-white shadow-lg backdrop-blur-sm` (`index-DAWue-_s.js:556`). Record button when recording: `bg-red-500 dark:bg-red-400 text-white hover:bg-red-800 dark:hover:bg-red-200 rounded-lg px-2 shadow-md`, `text-xs h-8` in compact mode (`index-DAWue-_s.js:277`).
- Timer: `truncate text-[11px] tabular-nums text-white/85`, plus `text-[10px] tabular-nums text-white/75` (`index-DAWue-_s.js:634-642`).
- Warnings and errors (copy): "Warning! Window resized." / "Recording quality may be affected. For best results, stop the recording and start a new one."; "Warning!" / "Please review your sources before continuing the recording."; "We recommend stopping the recording to avoid any data loss." / "We don't recommend proceeding with the recording to avoid any data loss."; "The window has been closed"; "Select another window to continue recording." / "Select another window to start recording."; "Window not visible yet." with "Borumi can't start recording until your target window is visible in the current desktop. Bring it into view to get started."; "Something went wrong." with "Borumi couldn't start capture for this recording. Close the recorder and check your sources before trying again."; "Recorder is in an invalid state, please contact us if the problem persists." (`index-DAWue-_s.js:944-1679`).
- Script-following panel (in the recorder): "Auto-scroll" with "Scroll script automatically while recording" / "Disable scrolling for the script while recording" (`index-DAWue-_s.js:844-854`); "Rewind to start" / "Rewind script to the top"; "Scrolling mode" and "Scrolling speed" in its menu.
- Recorder menu items: "Mirror camera", "Show sources", "Open script as separate window", "Scrolling mode", "Scrolling speed", "Close" (`index-DAWue-_s.js:194-262`).
- Background-only recorder illustration: `recorder-waiting-window-illustration w-full max-w-[100px]`, animated by `recorder-waiting-window-motion 4.2s` (`index-DccVBVlC.css`).
- Window size: `window.borumi.window.setMinSize(-1, minHeight)` (`index-DAWue-_s.js:1610`).

### 3.9 Teleprompter window (`index-Bek2B5yO.js`, `use-teleprompter-context-menu-Do8ZfJQ9.js`)

- Empty states: "Almost there!" with "Select a scene or start recording, and your script will appear here." (`index-Bek2B5yO.js:68-70`); "Nothing to see here 👀" with "The current scene doesn't have a script. You can add it in the Script tool, and it will appear here automatically." (`index-Bek2B5yO.js:74-76`).
- Toolbar controls with tooltips: Decrease text size, Increase text size, Rewind to start, More options (`index-Bek2B5yO.js:139-506`).
- Scroll modes, each with a tooltip: **Manual** ("Manual scrolling"), **VoiceOptimistic** ("Voice Following scrolling"), **ConstSpeed** ("Constant speed scrolling") (`index-Bek2B5yO.js:258-264`). Scroll state text: "Loading script following", "Pause scrolling", "Start scrolling", "Script following error" (`index-Bek2B5yO.js:179-182`, `use-teleprompter-context-menu:891-893`).
- Alignment tooltips: "Left align", "Center align", "Right align" (`index-Bek2B5yO.js:417-422`).
- Context menu (`use-teleprompter-context-menu-Do8ZfJQ9.js`):
  - Speech prompt: "Borumi needs Speech Recognition permission to follow your voice." with "Allow" (`:39-48`).
  - Playback: Play / Pause, Rewind to start.
  - Line height, Mirror text (checkbox), Theme (System default / Light / Dark), Transparency (Not transparent, 10% / 25% / 50% / 75% transparent), Text alignment (Auto / Left / Center / Right), Speed.
  - Voice following engine: Auto, Whisper, Apple Speech, Apple Speech v2 (ids `teleprompter.context-menu.voice-following-engine.*`).
  - Mode: manual, voice-enhanced, voice, constant-speed-voice-activated, constant-speed.
  - Guides: "Adjust baseline", "Adjust text width" (`:308`, `:447`).
- Theme classes: `.teleprompter-dark`, `.teleprompter-light`, `.teleprompter-auto` (section 2.1). Toolbar surface and control tokens are `color-mix()` derivatives of the foreground/background pair.

### 3.10 Error screens

- Medium-size window error card (`aK`) and large error card (`sK`, `index-BOa99FnS.js:40607-40680`). Copy is in section 1.1. Both use `bg-red-100` and `text-red-900`.

## 4. Interactions

### 4.1 Keyboard shortcuts

**Model `[V]`.**
- Shortcut actions are declared by the native side in `app.default_shortcuts[]`. Each has `action.kind`, `scope[]`, `bindings[]` (`kind: Keyboard | Pointer`, `key`, `modifiers`, `keyboard_phase: KeyDown | KeyUp`), `dispatch_owner` (`Global` or other), `customizable`, `label`.
- User overrides are `settings.shortcut_overrides[]` (`x2`, `nn`, `Um`, `T2`: `index-2TDxNpOf.js:1656-1690`).
- Matching: `ac(event, action, phase, scope)` compares `event.key` (normalised by `Ar` to `KeyA` / `Digit1` / `Space` / names) and modifiers (`Meta`, `Control`, `Alt`, `Shift`, from `metaKey`, `ctrlKey`, `altKey`, `shiftKey`, `index-2TDxNpOf.js:1903-1912`).
- Dispatch: `ao(scope, handlers)` (`index-2TDxNpOf.js:3741-3762`) registers `window` `keydown` and `keyup` listeners. It skips events already `defaultPrevented`, skips events from editable targets unless `allowEditableTarget`, and calls the first matching handler.
- Conflict detection: "That shortcut conflicts with another shortcut." and the Shortcuts tab's Conflict panel (`index-2TDxNpOf.js:77504-77794`).
- Recorder shortcuts are separately togglable: "Enable Recorder shortcuts", and a global toggle `global_recorder_shortcuts` (`index-2TDxNpOf.js:77580-77582`).
- **Defaults are native.** The key bindings, labels, and scopes are not in the bundle `[N]`. Section 4.1 table below lists the actions the UI handles and what they send.

Actions handled by renderer scopes (generated from the handler tables; full table in Appendix B):

| Scope | Actions | Sends |
|---|---|---|
| `ScriptTool` | `SelectAll` | (no literal command `[N]`) |
| `RecordTool` | `RecordToolShowPresets` (enabled unless disabled) | (no literal command `[N]`) |
| `EditTool` | `EditToolPlaybackToggle`, `EditToolPlaybackFaster`, `EditToolPlaybackPauseReset`, `EditToolPlaybackPreviousEdit`, `EditToolPlaybackNextEdit`, `EditToolPlaybackStepFrameBackward`, `EditToolPlaybackStepFrameForward` | `request.playback.play` / `pause` and playback speed (`index-2TDxNpOf.js:68965-68990`) |
| `EditTool` | `EditToolToolSelect`, `EditToolToolBlade` | `project.timeline.tool.update` |
| `EditTool` | `EditToolSplitAtPlayhead`, `EditToolTrimLeftToPlayhead`, `EditToolTrimRightToPlayhead`, `EditToolDelete`, `EditToolDeleteAndLeaveGap` (enabled only when the handler's guard allows) | (no literal command in handler `[N]`) |
| `EditTool` | `EditToolTimelineZoomIn`, `EditToolTimelineZoomOut` | (no literal command `[N]`) |
| `EditTool` | `EditToolToggleSnapping`, `EditToolToggleScrubbing` | `settings.enable_timeline_snapping.update`, `settings.enable_timeline_scrubbing.update` |
| `EditTool` | `SelectAll`, `DeselectAll` | `project.timeline_selection.select_all_segments`, `project.timeline_selection.update`, `project.timeline_range.update` |
| `TakePreview` | `TakePreviewPlaybackToggle`, `TakePreviewPlaybackSlower`, `TakePreviewPlaybackFaster`, `TakePreviewPlaybackPauseReset`, `TakePreviewSeekBackward`, `TakePreviewSeekForward` | (no literal command `[N]`) |
| `TakePreview` | `TakePreviewClose` | `project.take_preview_dialog.close` |
| `WorkflowReview` | `WorkflowReviewPlaybackToggle` | (no literal command `[N]`) |

**Non-shortcut key handling `[V]`:**
- Escape closes the help popover and the settings shortcut editor (`index-2TDxNpOf.js:1477`, `77493`).
- Space is blocked from activating focused buttons (section 1.1).
- Tab focus is gated in some menus (`h.key === "Tab" && !altKey && !ctrlKey && !metaKey`, `index-BOa99FnS.js:22004`), a Radix/menu pattern.
- Number inputs and the timeline use keyboard and pointer modifiers (`ctrlKey`/`altKey`/`metaKey`) to change behaviour, for example `Ctrl+wheel` zoom (`index-BOa99FnS.js:34988`).

### 4.2 Context menus

- Rendered **natively**, not in the DOM. The renderer sends `request.context_menu.show` with `menu: {items: [...]}` (`index-2TDxNpOf.js:2147` and 13 call sites in the main bundle, plus one each in the recorder and teleprompter bundles).
- Item schema: `{id, kind: "Item"|"Separator"|"Submenu"|"Checkbox"|..., enabled, primary, secondary, label, command:{kind:{...}, scope?}, accelerator}`. Accelerator is derived from the shortcut bindings (`vh(actionKind)`, `index-2TDxNpOf.js:1734-1750`).
- Menu IDs and their source lines: Appendix C.

Key menus, with labels `[V]`:
- **Project tab**: "Rename Project", "Duplicate Project", separator, "Close Project" (accelerator `ProjectClose`), "Close Other Projects", "Close All Projects" (`index-2TDxNpOf.js:2081-2141`).
- **Recent project row**: "Open Project", separator, "Duplicate Project", "Delete Project", "Show in Finder" (ids `recent-project.context-menu.*`, `index-2TDxNpOf.js:3263-3313`).
- **Scene entry**: "Add scene before", "Add scene after", "Delete scene" (`index-2TDxNpOf.js:22243-22280`); on the record side: "Record new...", "Record over...", "Import media from file..." and "Delete scene" (`31499-31560`).
- **Take card**: "Play take", "Archive take", "Delete take" (`index-2TDxNpOf.js:31578-31613`).
- **Timeline segment**: "Link" (group), "Unlink" (ungroup), "Split Audio/Video" (uncollapse), "Delete", "Delete and Leave Gap", "Speed", "More...", "Open properties" (ids `timeline.segment.context-menu.*`; labels at `index-2TDxNpOf.js:42574-42734`).
- **Timeline**: "Enable snapping", "Enable scrubbing" (`index-2TDxNpOf.js:38939-38958`).
- **Preview / source**: "Mirror camera" (resolution), "Warn when microphone is silent", "Hide Borumi from recordings", "Compensate for Bluetooth latency", synchronization amount (Automatic / Custom...), rotation, audio channels (`index-2TDxNpOf.js:26469-26905`).
- **Playback quality**: Best, Balanced, Fast, Faster, Fastest (`index-2TDxNpOf.js:43976-44040`).
- **Teleprompter**: see section 3.9.

Dividers: items separated by `{kind:"Separator"}`. Checkbox items carry `checked`. Submenus carry nested `items`.

### 4.3 Drag behaviour

- **Window drag region.** The shell's top area is registered with `window.borumi.drag.register(el)` (`index-2TDxNpOf.js:1466-1475`) and another region in the shell (`index-BOa99FnS.js:40697`). Unregistered on unmount.
- **File drop.** `window.borumi.fileDragDrop.register(el, handler)` with events `dragenter`, `dragover`, `dragleave`, `drop` (`index-2TDxNpOf.js:32900-32920`). Used for media import in the Record tool and the script editor. Copy: "Drop to import your media", "or drop a file here to start."
- **Timeline and clips.** Edge-resize zones (`cursor-ns-resize`), corner-radius handles (`cursor-radius`), scrub/drag cursors (`cursor-ew-resize`), alignment guides on drag (section 3.4.3). Track-reorder and clip-move interaction details are `[N]` beyond the handle classes.
- **Resizable panels.** Vertical and horizontal split groups `ha` with `minSizes` (200 px) and `ratios` (section 3.4.3). Splits are draggable; sizes are `[N]` persisted or not.

### 4.4 Hover, focus, active, disabled

Observed patterns `[V]`:
- Sidebar and rows: `hover:bg-secondary` (rail, icon buttons), `hover:bg-secondary-hover` (settings nav), `hover:bg-primary/5` (menu items: `data-[highlighted]:bg-primary/5`, rename hover), `hover:bg-primary/10` (inline edit), `hover:border-border-hover` (recent rows).
- Buttons: focus ring `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`; disabled `disabled:pointer-events-none disabled:opacity-50`; `cursor-not-allowed opacity-50` for header icon disabled state.
- Links inside text: `underline underline-offset-2`, hover `hover:underline` or `hover:no-underline`.
- Danger: `hover:bg-danger/10`, `text-danger`, and the red record button hover (section 3.8).
- Active / pressed on the teleprompter close button: `active:bg-[#c42b1c]/90`, hover `hover:bg-[#c42b1c]`.

### 4.5 Selection model

- Timeline selection is store-driven: `project.timeline_selection.update`, `project.timeline_range.update`, `project.timeline_text_selection.update`, `request.project.timeline.sound.update_for_selection`, `project.timeline.overlay.update_for_selection`, and others (`index-2TDxNpOf.js:68503-68545`).
- `SelectAll` selects all segments (`project.timeline_selection.select_all_segments`); `DeselectAll` clears selection and range.
- Property panels follow the selection. When nothing applicable is selected, they show a description empty state (section 3.4.3).
- Multi-select of layouts and captions is by filter tabs (`All / Favorites / Project / Built-in`, hints "Show all layouts", "Only show favorites layouts", "Only show layouts used in the current project", "Only show built-in layouts"; `index-2TDxNpOf.js:37338-37349`). Same pattern for captions and music tracks (`index-2TDxNpOf.js:60619-60625`, `61885-61890`).

### 4.6 Undo, redo, version history

- Header buttons: **Undo** (`request.undo`), **Redo** (`request.redo`), **Version History** (toggles `project.version_history_open.update`) (`index-2TDxNpOf.js:4800-4835`). Undo and Redo use disabled flags `t` and `n` (derivation not traced `[I]`).
- Labels come from native history (`HistoryUpdate`, section 1.3); the bundle does not compute undo labels `[V]`.
- Version history panel: preview a version (`request.project.version.preview`), restore it (`request.project.version.restore`), or return to the current version (`request.project.version.return`). The editor is read-only while previewing (section 3.4.3).

### 4.7 Export

- Export menu items (`index-2TDxNpOf.js:4881-4907`): **Export Video** / "MP4 • High quality"; **Share Video** / "Upload & get a shareable link"; **Export Audio** / "WAV • High quality"; **Export Transcript** / "TXT, MD or SRT". Commands: `request.project.export_video`, `request.project.shared_video_upload`, `request.project.export_audio`, `request.project.export_transcript`, and `request.project.export_recordings` (appendix A).
- Settings for export: resolution multiplier, FPS, quality, video encoder override, render surface mode (`settings.export_*`, Appendix A).

### 4.8 Toasts and notifications

- Container: `Soe` (`index-2TDxNpOf.js:79273`), rendered beside the editor (`Coe`, section 1.2).
- Card: `Notification` with `title`, `description`, optional `copyLink` (renders a link row with a "Copy link" / "Copied" button; "Copied" for 1500 ms) (`index-2TDxNpOf.js:425-455`), optional `progress` (`Rd` progress bar, `h-1`), optional `auto_close` (duration in seconds; `index-2TDxNpOf.js:158-160`).
- Auto-close bar: `absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-primary/30 animate-notification-auto-close`, duration from `--notification-auto-close-duration`; pauses on hover (`notification-auto-close-hover-pause`, `index-2TDxNpOf.js:286`, `412-418`).
- Close action: `notification.close` with scope `Notification`; `close_action` runs a command before closing (`index-2TDxNpOf.js:3058-3075`, `p_`).
- Advice bubble: `advice-bubble-pulse-animation` (1.5 s linear infinite) on a yellow pulse dot `bg-yellow-300 dark:bg-yellow-700` (`index-2TDxNpOf.js:820`), with `advice.close`.
- Notice rows: `bg-yellow-50 border border-yellow-200 rounded-md p-2 shadow-md text-sm gap-2 flex flex-col` (`index-2TDxNpOf.js:831`).

### 4.9 Other interaction details

- Rename: click-to-rename on the project name; contenteditable span with select-all on focus (`Ym`, `index-2TDxNpOf.js:3768`). Inline editable scene names.
- Scroll-driven hero collapse on the home screen (section 3.1).
- Ctrl/Cmd-wheel zoom on the timeline (section 4.1).
- Captions and music "Loop", "Fade In", "Fade Out" toggles and hints (`index-2TDxNpOf.js:62271-62288`).

## 5. `window.borumi` bridge API (surface the UI uses)

All calls are guarded in some places (`window.borumi?.x`) and not in others. Methods listed as used in the bundle; signatures inferred from call sites.

| Member | Usage in UI | Evidence |
|---|---|---|
| `root` | `"main"`, `"recorder"`, `"teleprompter"` selects the window's UI. | `index-BOa99FnS.js:40729` |
| `version` | Shown in About (`Version X`) and Sentry release. | `index-2TDxNpOf.js:80476`, `index-BOa99FnS.js:40826` |
| `platform` | `"macos"` / `"windows"` branching (traffic lights, "Show in Finder"/"Show in Explorer", border side). | `index-2TDxNpOf.js:1504`, `3390`, `1631` |
| `platformVersion` | Read in the script tokenizer chunk. | `tokenize-script-BWliYbB6.js:46` (use not traced `[I]`) |
| `arch` | `"aarch64"` selects different playback option arrays. | `index-2TDxNpOf.js:68950`, `51997` |
| `executionScope` | `"prod"` enables Sentry; `"sidekick"` tints the app icon (`text-success-600`). | `index-BOa99FnS.js:40823`, `index-2TDxNpOf.js:1386-1388` |
| `theme.refresh()` | Called once in `index.html`. | `index.html` |
| `resource.getUrl(kind, args?, query?)` | Resolves app-local resources. Kinds: `asset` (named PNG/JPG, e.g. `mascot-celebrating.png`), `app_icon`, `fonts`, `list_music_tracks`, `music_track`, `open_source_license`, `open_source_licenses`, `overlay_thumbnail`, `project_history`, `project_preview`, `take_thumbnail`, `waveform`. | `index-2TDxNpOf.js` (about 17 call sites) |
| `ipc.send(msg)` | Sends commands (section 1.3). | `tokenize-script-BWliYbB6.js:26-38` |
| `ipc.addMessageListener(fn)` / `removeMessageListener(fn)` | Inbound `StoreSnapshot`, `StorePatch`, `HistoryUpdate`, and camera/source messages. | `index-BOa99FnS.js:40276`, `use-capture-warnings-D4bMQkfA.js:529-531`, `index-DAWue-_s.js:401-403` |
| `control.send({type})` | `"stale-snapshot"`, `"toggle-maximize"`, `"minimize"`. | `index-BOa99FnS.js:40296`, `index-2TDxNpOf.js:1049-1057` |
| `shortcut.register()` | Called once on boot to enable native shortcut forwarding. | `index-BOa99FnS.js:40829` |
| `drag.register(el)` / `drag.unregister(el)` | Window drag regions. | `index-2TDxNpOf.js:1466-1475`, `index-BOa99FnS.js:40697-40705` |
| `fileDragDrop.register(el, handler)` / `unregister(el, handler)` | Drop targets; handler receives `drop`, `dragenter`, `dragover`, `dragleave`. | `index-2TDxNpOf.js:32914-32920` |
| `fullscreen.isFullscreen()` / `addListener(fn)` / `removeListener(fn)` | Fullscreen state for the traffic-light reserve. | `index-2TDxNpOf.js:1462-1500` |
| `view.register(sourceId, el, opts)` / `view.unregister(sourceId)` | Binds a live camera/screen source to a DOM element (`mirrored`, `rotation`). Used by recorder and capture previews. | `use-capture-warnings-D4bMQkfA.js:61-67` |
| `window.setMinSize(w, h)` | Recorder minimum height. | `index-DAWue-_s.js:1610` |

Notes:
- `control` also covers window `minimize` and `toggle-maximize` (custom title-bar controls).
- `window.borumi.platform` is also compared to `"windows"` for the title-bar border side.
- No other `window.borumi.*` members appear in the bundle `[V]`.

## 6. Home, project organisation and "boards"

- **No boards.** No kanban, column, board, tag, or folder UI exists in this build `[V]` (string search across all bundles found none). Projects are not grouped.
- **Home structure.** Template cards (Structured video, Quick recording) and a single "Recent projects" list (section 3.1). Recent projects come from `root.app.recent_projects` (`projects`, `status`: `Loading` / `Error`).
- **Ordering.** Recent-project order is supplied by the native side; the UI renders the array as given `[V]`. Sort rule is `[N]`.
- **Organising:** "View all" opens the projects folder in Finder or Explorer. The projects folder can be overridden in General settings ("Change the default folder where new projects will be saved.").
- **Open projects** are tabs in the shell tab strip (section 2), with rename, duplicate, close, close others, and close all.
- **Per-row actions** on a recent project: open (click), context menu (open, duplicate, delete, show in Finder). Delete goes through a dialog in the native layer `[I]`.
- **Thumbnails** come from `project_preview` with a `modified_at` cache key (section 3.1).
- **Relative dates** use buckets: just now (<60 s), minutes (<1 h), hours (<1 day), days (<1 week), weeks (`bM`, `index-2TDxNpOf.js:3396`).
- **Empty state.** No copy. The home shows only the two template cards.

## 7. Motion and animation summary

### 7.1 Radix / Tailwind animations `[V]`

- Dialog content: `fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200`, with `data-[state=open]:animate-in`, `data-[state=closed]:animate-out` (`index-BOa99FnS.js:25616`).
- Dialog overlay: `fixed inset-0 z-50 bg-black/80 backdrop-blur-md`, `data-[state=closed]:fade-out-0` (`index-BOa99FnS.js:25600`).
- Menus and popovers: `animate-in` / `animate-out` with `fade-in-0`, `zoom-in-95`, `zoom-out-95`, `slide-in-from-top-2` (bottom), `slide-in-from-right-2` (left), etc. (`index-BOa99FnS.js:24130-24144`).
- Default transition: Tailwind default `transition-colors` (150 ms, `cubic-bezier(0.4, 0, 0.2, 1)`) `[V]` in `index-DXJH5HZm.css`. Explicit durations used in classes: `duration-75`, `duration-100`, `duration-150`, `duration-200`, `duration-300` (wizard progress), `duration-700`, `duration-1000`, and `duration-0` (wizard dialog, logs dialog) `[V]`.

### 7.2 Custom keyframes `[V]`

| Name | Duration | Easing | Delay / iteration | Stylesheet | Used by |
|---|---|---|---|---|---|
| `bounce` | 1 s | (default) | infinite | `index-DXJH5HZm.css:2073` | loading affordance |
| `spin` | 1 s | linear | infinite | `:2106` | spinners |
| `pulse` | 2 s | `cubic-bezier(0.4, 0, 0.6, 1)` | infinite | `:2098` | skeletons |
| `progress-indefinite` | 1.2 s | ease-in-out | infinite | `:2087` | indeterminate progress |
| `enter` / `exit` | (see stylesheet) | | | `:4223`, `:4239` | toast/panel enter and exit |
| `notification-auto-close` | `var(--notification-auto-close-duration)` | | | `:4348` | toast auto-close bar |
| `blinkOutline` | 0.5 s | ease-in-out | infinite (and `4` iterations in the CSS file) | `:4528`, `index-CzNh7JBz.css:496` | focus highlight |
| `previewBackgroundProcessingShimmer` | 1.45 s | ease-in-out | infinite | `:4539` | processing preview |
| `waitingForWindowBorderBlink` | 1.2 s | ease-in-out | infinite | `:4547` | window-picker waiting border |
| `advice-bubble-pulse` | 1.5 s | linear | infinite | `index-CzNh7JBz.css:4` | advice dot |
| `animated-logo-rise` | 0.7 s | `cubic-bezier(0.2, 0.8, 0.2, 1)` | once | `:56` | wizard logo |
| `animated-logo-drop` | 0.95 s | `cubic-bezier(0.3, 0, 0.25, 1)` | delay 0.85 s, both | `:66` | wizard logo |
| `animated-logo-squash` | `[N]` | | | `:91` | wizard logo |
| `hand-drawn-arrow-draw` | 587 ms and 463 ms | `cubic-bezier(0.45, 0, 0.7, 0.7)` / `cubic-bezier(0.3, 0.3, 0.35, 1)` | | `:128` | wizard arrow |
| `welcome-rise` | 0.7 s | `cubic-bezier(0.2, 0.8, 0.2, 1)` | per-element `--delay` | `:146` | wizard welcome text |
| `welcome-lift` | 0.85 s | `cubic-bezier(0.65, 0, 0.25, 1)` | delay 1.75 s, both | `:156` | wizard lift |
| `celebration-stage-in` | 0.55 s | `cubic-bezier(0.3, 1.4, 0.5, 1)` | delay 1.45 s | `:316` | finish screen |
| `celebration-shock` | 0.65 s | ease-out | delay 1.45 s, forwards | `:306` | finish screen |
| `celebration-confetti` | 1 s | `cubic-bezier(0.15, 0.75, 0.3, 1)` | | `:355` | confetti |
| `celebration-badge-pop`, `-shake`, `-burst`, `celebration-jump`, `celebration-float` | `[N]` | | | `:253-346` | finish screen |
| `hint-point` | 1.5 s | ease-in-out | infinite | `:461` | hint pointer |
| `recorder-waiting-window-motion` | 4.2 s | `cubic-bezier(0.2, 0.75, 0.2, 1)` | infinite | `index-DccVBVlC.css:7` | recorder idle illustration |

Other timing `[V]`: `cubic-bezier(0, 0, 0.2, 1)` (ease-out variants), `cubic-bezier(0.8, 0, 1, 1)` (ease-in), `cubic-bezier(0.4, 0, 0.6, 1)` (pulse).

Animation-related classes on the wizard `[V]`: `welcome-headline`, `welcome-rise`, `celebration`, `celebration-confetti`, `celebration-stage`, `celebration-content`, `celebration-badge`.

### 7.3 Teleprompter motion

- Scroll speed presets and modes are in section 3.9. Caret blink uses `animate-caret-blink` (class on the timeline caret `index-2TDxNpOf.js:45841`); its keyframe was not located in the stylesheets `[N]`.

## 8. Design tokens

### 8.1 Colour: light (`:root`) and dark (`.dark`)

Source: `index-DXJH5HZm.css`, selector `:root` (light) and `.dark` (dark). The HSL triplets are used as `hsl(var(--token) / <alpha>)` `[I]` from Tailwind's colour map.

**Semantic tokens (`[V]`).** Hex is computed from the HSL triplet (conversion script in scratchpad). Tokens shown with their `var()` target.

| Token | Light | Light hex | Dark | Dark hex | Notes |
|---|---|---|---|---|---|
| `--background` | `neutral-0` | `#ffffff` | `neutral-50` | `#0a0a0a` | Body / surfaces. |
| `--foreground` | `neutral-950` | `#0a0a0a` | `neutral-1000` | `#ffffff` | Default text. |
| `--primary` | `neutral-950` | `#0a0a0a` | `neutral-1000` | `#ffffff` | Primary button fill. |
| `--primary-foreground` | `neutral-0` | `#ffffff` | `neutral-50` | `#0a0a0a` | |
| `--secondary` | `neutral-50` | `#fafafa` | `neutral-100` | `#171717` | Panels, rail, chips. |
| `--secondary-foreground` | `neutral-950` | `#0a0a0a` | `neutral-1000` | `#ffffff` | |
| `--secondary-hover` | `neutral-100` | `#f5f5f5` | `neutral-200` | `#262626` | |
| `--card` | `neutral-50` | `#fafafa` | `neutral-50` | `#0a0a0a` | |
| `--card-foreground` | `neutral-950` | `#0a0a0a` | `neutral-1000` | `#ffffff` | |
| `--popover` | `neutral-50` | `#fafafa` | `neutral-50` | `#0a0a0a` | |
| `--popover-foreground` | `neutral-950` | `#0a0a0a` | `neutral-1000` | `#ffffff` | |
| `--muted` | `neutral-50` | `#fafafa` | `neutral-50` | `#0a0a0a` | |
| `--muted-foreground` | `neutral-500` | `#737373` | `neutral-500` | `#737373` | Unchanged across modes. |
| `--accent` | `neutral-100` | `#f5f5f5` | `neutral-100` | `#171717` | Hover fill (`hover:bg-accent`). |
| `--accent-foreground` | `neutral-950` | `#0a0a0a` | `neutral-1000` | `#ffffff` | |
| `--border` | `neutral-200` | `#e6e6e6` | `neutral-200` | `#262626` | |
| `--border-overlay` | `neutral-50` | `#fafafa` | `neutral-50` | `#0a0a0a` | |
| `--border-hover` | `neutral-300` | `#d4d4d4` | `neutral-300` | `#404040` | |
| `--input` | `neutral-100` | `#f5f5f5` | `neutral-200` | `#262626` | |
| `--ring` | `blue-500` | `#3c83f6` | `blue-500` | `#3c83f6` | Focus ring. |
| `--brand` | `247 100% 64%` | `#5d47ff` | `246 100% 68%` | `#6c5cff` | Brand (CTA, progress). |
| `--brand-foreground` | `0 0% 100%` | `#ffffff` | `0 0% 100%` | `#ffffff` | |
| `--destructive` | `danger` | `#ef4343` | `danger` | `#ef4343` | `--destructive-foreground`: neutral-0 (light) / neutral-0 (dark, `#ffffff`). |
| `--warning` / `--success` / `--info` / `--danger` | `*-500` | yellow `#f59f0a`, green `#21c45d`, blue `#3c83f6`, red `#ef4343` | same `*-500` | same | Also `*-50` background variants. |
| `--radius` | `0.5rem` | | `0.5rem` | | 8 px. |

**Neutral and colour scales (HSL, `[V]`).** The light `:root` values are read in order; the dark `.dark` block **inverts** the neutral scale (`neutral-50` in dark = light's `neutral-950` value, and so on).

| Scale step | Light (`:root`) | Dark (`.dark`) |
|---|---|---|
| `neutral-0` | `0 0% 100%` | (not redefined) |
| `neutral-50` | `0 0% 98%` | `0 0% 4%` |
| `neutral-100` | `0 0% 96%` | `0 0% 9%` |
| `neutral-200` | `0 0% 90%` | `0 0% 15%` |
| `neutral-300` | `0 0% 83%` | `0 0% 25%` |
| `neutral-400` | `0 0% 64%` | `0 0% 32%` |
| `neutral-500` | `0 0% 45%` | `0 0% 45%` |
| `neutral-600` | `0 0% 32%` | `0 0% 64%` |
| `neutral-700` | `0 0% 25%` | `0 0% 83%` |
| `neutral-800` | `0 0% 15%` | `0 0% 90%` |
| `neutral-900` | `0 0% 9%` | `0 0% 96%` |
| `neutral-950` | `0 0% 4%` | `0 0% 98%` |
| `neutral-1000` | (not defined) | `0 0% 100%` |

Coloured scales (`red`, `yellow`, `green`, `blue`, 50 to 950) are present in both blocks. In the dark block, the step values are reversed (for example `blue-50` is `226 57% 21%`, `blue-950` is `214 100% 97%`). Full lists are in `css-vars-main.txt` in the scratchpad folder.

**Teleprompter tokens (`[V]`).** `.teleprompter-dark` = foreground white / background black. `.teleprompter-light` = foreground black / background white. `.teleprompter-auto` = foreground `hsl(var(--foreground))` / background `hsl(var(--background))`. Derived surfaces use `color-mix(in srgb, …)`: toolbar surface 68% background, toolbar border 16% foreground, control surface 6% foreground, hover 10%, active 22%, control border 14%, disabled 40%, focus ring 55%, guide 32%, active guide 58%, close hover 14%. In the dark variants, toolbar surface is `58%` background mixed with `8%` foreground (`css-vars-main.txt`, `.dark .teleprompter-auto`).

### 8.2 Radius

| Utility | Value | Basis |
|---|---|---|
| `rounded-sm` | `calc(var(--radius) - 4px)` = 4 px | `index-DXJH5HZm.css:2438` |
| `rounded-md` | `calc(var(--radius) - 2px)` = 6 px | `:2432` |
| `rounded-lg` | `var(--radius)` = 8 px | `:2429` |
| `rounded-xl` | `0.75rem` = 12 px | `:2441` |
| `rounded-2xl` | Tailwind default (1rem) | used in recorder control bar (`index-DAWue-_s.js:556`) `[I]` |
| `rounded-full` | 9999 px | `:2426` |
| `rounded` | `0.25rem` = 4 px | `:2411` |

### 8.3 Shadows (`[V]` Tailwind v3 defaults in CSS)

- `shadow-sm`: `0 1px 2px 0 rgb(0 0 0 / 0.05)` (`index-DXJH5HZm.css:3929`).
- `shadow`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` (`:3883`).
- `shadow-md`: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` (`:3916`).
- `shadow-lg`: `0 10px 15px -3px rgb(0 0 0 / 0.1), …` (`:3908`).
- `shadow-2xl`: `0 25px 50px -12px rgb(0 0 0 / 0.25)` (`:3890`).
- Custom: `shadow-[0_10px_30px_rgba(0,0,0,0.18)]` (2 uses), `shadow-brand/30` on the brand button (Button `brand` variant, `index-BOa99FnS.js:19278`), `drop-shadow(0 16px 28px rgba(0,0,0,0.12))` on the recorder illustration (`index-DccVBVlC.css`).

### 8.4 Typography

- **Family.** System UI stack: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", Segoe UI Symbol, "Noto Color Emoji"` (`index-DXJH5HZm.css:20-28`). Mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace` (`.font-mono`). Rich-text code block: `JetBrainsMono, monospace` (`index-CzNh7JBz.css:439`; `index-DXJH5HZm.css` `.tiptap pre`). **No `@font-face` is declared in any stylesheet** `[V]`, so JetBrains Mono is only a name reference and is not bundled.
- **Base.** Tailwind preflight: line-height 1.5, tab-size 4, `-webkit-tap-highlight-color: transparent` (`index-DXJH5HZm.css:15-30`).
- **Sizes used.** Tailwind defaults (`text-xs`, `text-sm`, `text-md` (custom class `text-md` appears in use, e.g. `index-2TDxNpOf.js:3134`), `text-lg`, `text-xl`, `text-2xl`) plus arbitrary sizes. Most used arbitrary values: `text-[11px]` (33 uses), `text-[10px]` (33), `text-[15px]` (4), `text-[13px]` (3), `text-[11.5px]` (1), `text-[27px]` (wizard title), `text-[34px]` (1), `text-[8px]` (3), `text-[9px]` (1), `text-[0.6rem]` (1), `text-[0.5rem]` (recorder chips), `text-[11.5px]`.
- **Weights.** `font-medium`, `font-semibold`, `font-bold`; `tabular-nums` for timers.
- **Tracking.** `tracking-tight` (wizard title), `tracking-[-0.03em]` (1 use).
- **Tailwind `text-md` note.** `text-md` is not a Tailwind default; it appears in the bundle, so it is defined in the project config `[I]`.

### 8.5 Spacing and layout constants (`[V]` class usage)

- Home column: `p-10 pt-14 max-w-[800px] gap-14` (`index-2TDxNpOf.js:3530-3534`).
- Template cards: `p-9`, gap `gap-9`, icon well `w-10 h-10`.
- Project header: `h-12 min-h-12 px-2`. Step bar: `h-16 min-h-16`.
- App rail reserve: `w-[77px]`. Edit left rail: `w-[72px]`.
- Settings nav: `w-64` (256 px), `p-4`, items `px-4 py-3`.
- Dialog: `max-w-lg` (512 px) and `p-6`; wizard `max-w-[580px]`; logs `min-w-[800px] min-h-[600px] max-h-[80vh]`.
- Menus: `min-w-[8rem]`, `p-1`.
- Buttons: `default h-9 px-4 py-2` (36 px), `sm h-8 px-3 text-xs` (32 px), `lg h-10 px-8` (40 px), `xl h-14 px-8 text-lg font-semibold` (56 px), `icon h-9 w-9`. Icon size `h-4 w-4` (`h-3 w-3` for `sm`).
- Inputs: `h-9 px-3 py-2 text-sm` (36 px). Search fields: `h-8 pl-7 pr-2 text-xs`.
- Recorder bar: `py-1.5 pl-2 pr-3 rounded-2xl`. Record button `h-8` in compact mode.
- Edit timeline toolbar: `border-t border-b`, items `h-9`/`h-8` `[I]`.

### 8.6 Buttons (`zM`, `index-BOa99FnS.js:19271-19318`)

- Base: `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50`.
- Variants: `default` (`bg-primary text-primary-foreground shadow hover:bg-primary/90`), `brand` (`bg-brand text-brand-foreground shadow-lg shadow-brand/30 hover:bg-brand/90`), `destructive` (`bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90`), `outline` (`border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`), `secondary` (`bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`), `ghost` (`hover:bg-accent hover:text-accent-foreground`), `link` (`text-primary underline-offset-4 hover:underline`).
- Sizes: see 8.5.
- Icon: `icon` prop renders an icon at `h-4 w-4`, `mr-2` when children exist; `rightIcon` renders on the right; with icon + text, left padding `pl-3`.

### 8.7 Inputs, menus, popovers, dialogs, tooltips (`[V]`)

- Input (`index-BOa99FnS.js:29367`): `flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-…`.
- Select content (`:29399`): `relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md`.
- Menu content (`:24130`): `z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg`.
- Popover (`:30344`): `z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none`.
- Dialog overlay and content: see section 7.1.
- Checkbox (`:31681`): `peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow`, checked `bg-primary`.
- Slider thumb (`:26435`): `block h-3 w-3 rounded-full border border-primary/50 bg-background shadow`.
- Tooltip delay: 200, 300, or 500 ms per call site (for example `index-2TDxNpOf.js:3586` 300 ms save-status, `3658` 500 ms header icons, `3632`/`452`/`4440` 200 ms) `[V]`. The tooltip surface class is `[N]` (not located in the stylesheet as a single class).

### 8.8 Other visual conventions `[V]`

- Dialog glow: class `dialog-glow` with `data-tone` (`brand` or `success`) (`index-2TDxNpOf.js:2255`).
- Brand gradient: classes with `from-`/`via-`/`to-` tokens for the wizard and hero (`from-blue-500`, `to-fuchsia-500`, `via-cyan-300`, `from-zinc-950` and others). Their use per screen is `[N]`.
- Purple accent text in some surfaces: `text-[#a83fd6]` / `dark:text-[#d58af5]`; orange: `text-[#ea6a33]` / `dark:text-[#ff9d78]` `[I]` platform-brand accents.
- Destructive reds: `hover:bg-[#c42b1c]`, `active:bg-[#c42b1c]/90`.

## 9. Visual inventory of key components

| Component | Classes (abridged) | Location |
|---|---|---|
| Home template card | `bg-secondary p-9 rounded-md border border-border text-center flex flex-col items-center cursor-pointer` | `index-2TDxNpOf.js:3107` |
| Recent project row | `bg-background border-border border rounded-md p-3 flex gap-3 items-center hover:border-border-hover cursor-pointer` | `:3336` |
| Recent thumbnail | `w-20 min-w-20 h-12 bg-secondary rounded-sm overflow-hidden` | `:3339` |
| Project header | `relative flex h-12 min-h-12 items-stretch border-b border-border bg-background px-2` | `:3596` |
| Header icon button | `p-1 hover:bg-secondary rounded-md` (active `bg-secondary`) | `:3656` (`Mu`) |
| Step bar | `flex flex-row justify-center border-t border-border h-16 min-h-16 relative bg-background` | `:5078` |
| Step well | `h-10 w-10 flex items-center justify-center rounded-full bg-primary/5` (active `bg-primary text-primary-foreground`) | `:5007` |
| Edit left rail | `w-[72px] shrink-0 border-r border-border`, items `rounded-sm hover:bg-secondary` | `index-2TDxNpOf.js:66736` |
| Rail icon well | `w-9 h-9 rounded-full bg-primary/5` (active `bg-primary text-primary-foreground`) | `:66765` |
| Timeline toolbar | `border-border border-t border-b flex items-center justify-center gap-2 select-none` | `:52180` |
| Alignment guide (vertical) | `absolute top-0 bottom-0 w-[2px] bg-blue-500/90` | `:50914` |
| Horizontal guide | `absolute left-0 right-0 h-[2px] bg-blue-500/90` | `:50904` |
| Clip edge resize zone | `absolute -top-1 left-0 right-0 h-2 cursor-ns-resize` | `:44259` |
| Handle (generic) | `bg-white w-2 h-2 border border-blue-500` (colour variants blue / yellow / purple) | `:44301`, `:44580`, `:45504` |
| Caret (text field) `[I]` | `absolute pointer-events-none animate-caret-blink bg-blue-500` | `:45841` |
| Transcript panel | `border-l border-border h-full flex flex-col gap-4 overflow-y-auto outline-none focus:ring-1 focus:ring-blue-400/50` | `:68469` |
| Recorder control bar | `flex w-full max-w-full items-center gap-1 rounded-2xl bg-black/70 pl-2 pr-3 py-1.5 text-white shadow-lg backdrop-blur-sm` | `index-DAWue-_s.js:556` |
| Recorder record button | `bg-red-500 dark:bg-red-400 text-white hover:bg-red-800 dark:hover:bg-red-200 rounded-lg px-2 shadow-md` | `index-DAWue-_s.js:277` |
| Recorder chip | `bg-black/40 p-0.5 px-1.5 rounded-full text-white text-[0.5rem] hover:bg-black/55` | `index-DAWue-_s.js:492` |
| Destructive hover `[I]` location | `hover:bg-[#c42b1c]`, `active:bg-[#c42b1c]/90` | `index-DXJH5HZm.css` |
| Notification card | auto-close bar `h-0.5 bg-primary/30`; copy-link row `rounded-md bg-primary/5 pl-3 py-1 pr-1` | `index-2TDxNpOf.js:412`, `435` |
| Wizard progress segment | `h-[5px] flex-1 rounded-full transition-colors duration-300` (active `bg-brand`, inactive `bg-foreground/10`) | `:2921+` |
| Wizard title | `mb-2.5 text-[27px] font-bold leading-tight tracking-tight` | `:2476+` |
| Wizard body | `text-[15px] leading-relaxed text-muted-foreground` | `:2476+` |

## 10. Could not determine (from the static bundle)

- **Default keyboard bindings and shortcut labels.** Provided by native `app.default_shortcuts`. Not in the bundle.
- **Native menus** (`request.menu.show` contents, the macOS menu bar, Cmd+, for Settings). Native.
- **Timeline geometry.** Track row heights, pixels-per-second, zoom bounds and snapping thresholds. Several unnamed numeric constants exist (for example `Tz = 80`, `hB = 100`, `jB = 24`, `FB = 10`, `JX = 45`, `PH = 100`, `Ny = 3e3`, `Xy = 1.5`, `yk = 224`, `lu = 44`, `ry = 25`, `iy = 3`, `sy = 4`, `cy = 30`; `index-2TDxNpOf.js`) but their roles could not be confirmed.
- **Word-level transcript styling.** Not located. The transcript panel container is known (section 3.4.3).
- **Panel size persistence.** Whether split-pane sizes persist across launches.
- **Sort order** of recent projects.
- **Delete-project confirmation flow** (dialog or native alert).
- **`[N]` bridge request payloads** for many commands (fields such as `project_path` and `dialog` are observed only at call sites).
- **Whether the native side unwraps the nested `{kind:{kind:…}}` command form.**
- **Exact left-rail panel content** for Canvas, Clip, Zoom, Elements, Captions, Cursor, Automate, Music (components exist, panel markup not fully traced).
- **Wizard permission-skip flags persistence** beyond `has_skipped_*` store keys.
- **Tooltip surface class** (no single class located).
- **Animated-logo squash keyframe** duration and celebration badge keyframe details (not traced to use sites).
- **Bundled fonts.** None declared. Whether JetBrains Mono is installed on the user's machine `[N]`.
- **Exact arch-specific playback option arrays** and what `Jo` / `KU` control (names are minified).
- **Version string and build** (runtime-injected through `window.borumi.version`).

## Appendix A. Command catalogue (`kind` values sent to native)

Generated from the bundle (dotted command kinds, with counts and source files). Enum-style values are excluded.

| Command kind (`kind`) | Count | Bundle file(s) |
|---|---|---|
| `about_borumi_dialog.close` | 1 | index-2TDxNpOf.js |
| `account.upgrade_dialog.update` | 2 | index-2TDxNpOf.js |
| `advice.close` | 2 | index-2TDxNpOf.js |
| `app.active_screen.update` | 5 | index-2TDxNpOf.js |
| `app.activity.cursor_hidden_in_preview_tooltip.close` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.accessibility.skip` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.camera.skip` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.close` | 2 | index-2TDxNpOf.js |
| `app.wizard_dialog.get_started.clicked` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.microphone.skip` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.open` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.screen.skip` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.skips.reset` | 1 | index-2TDxNpOf.js |
| `app.wizard_dialog.system_sound.skip` | 1 | index-2TDxNpOf.js |
| `changelog_dialog.close` | 1 | index-2TDxNpOf.js |
| `feedback_reporting.attachment.remove` | 1 | index-2TDxNpOf.js |
| `feedback_reporting.dialog.close` | 3 | index-2TDxNpOf.js |
| `feedback_reporting.dialog.open` | 3 | index-2TDxNpOf.js |
| `feedback_reporting.draft.description.update` | 1 | index-2TDxNpOf.js |
| `feedback_reporting.draft.email.update` | 1 | index-2TDxNpOf.js |
| `feedback_reporting.draft.kind.update` | 1 | index-2TDxNpOf.js |
| `feedback_reporting.status.update` | 3 | index-2TDxNpOf.js |
| `logs_dialog.close` | 1 | index-2TDxNpOf.js |
| `logs_dialog.open` | 2 | index-2TDxNpOf.js |
| `mcp.enabled.update` | 1 | index-2TDxNpOf.js |
| `mcp.installation_dialog.close` | 1 | index-2TDxNpOf.js |
| `mcp.installation_dialog.open` | 1 | index-2TDxNpOf.js |
| `mcp.installation_dialog.selected_tab.update` | 1 | index-2TDxNpOf.js |
| `notification.close` | 1 | index-2TDxNpOf.js |
| `notification.create` | 1 | index-2TDxNpOf.js |
| `notification.delete` | 1 | index-2TDxNpOf.js |
| `open_source_licenses_dialog.close` | 1 | index-2TDxNpOf.js |
| `open_source_licenses_dialog.open` | 1 | index-2TDxNpOf.js |
| `project.active_edit_panel.update` | 22 | index-2TDxNpOf.js |
| `project.active_layout_preset_category.update` | 1 | index-2TDxNpOf.js |
| `project.active_record_preset_apply_result.clear` | 1 | index-2TDxNpOf.js |
| `project.active_scenes.update` | 5 | index-2TDxNpOf.js |
| `project.control.segments_update` | 4 | index-2TDxNpOf.js |
| `project.crop_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.crop_dialog.open` | 3 | index-2TDxNpOf.js |
| `project.custom_format_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.custom_format_dialog.open` | 1 | index-2TDxNpOf.js |
| `project.export_recordings_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.export_recordings_dialog.update` | 1 | index-2TDxNpOf.js |
| `project.export_transcript_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.export_transcript_dialog.open` | 1 | index-2TDxNpOf.js |
| `project.export_video_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.export_video_dialog.open` | 2 | index-2TDxNpOf.js |
| `project.is_transcript_panel_active.update` | 2 | index-2TDxNpOf.js |
| `project.move_to_end_of_previous_scene` | 1 | index-2TDxNpOf.js |
| `project.move_to_start_of_next_scene` | 1 | index-2TDxNpOf.js |
| `project.record_preset.apply` | 6 | index-2TDxNpOf.js |
| `project.recovery_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.render_target.update` | 3 | index-2TDxNpOf.js |
| `project.scene.create` | 14 | index-2TDxNpOf.js |
| `project.scene.name.update` | 3 | index-2TDxNpOf.js |
| `project.scene.script.update` | 2 | index-2TDxNpOf.js |
| `project.scenes.move` | 2 | index-2TDxNpOf.js |
| `project.source.binding.update` | 1 | index-2TDxNpOf.js |
| `project.source.enabled.update` | 2 | index-2TDxNpOf.js |
| `project.source.preferred_source_configuration.update` | 2 | index-2TDxNpOf.js |
| `project.source_sync_adjustment_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.source_sync_adjustment_dialog.open` | 1 | index-2TDxNpOf.js |
| `project.take_preview_dialog.close` | 6 | index-2TDxNpOf.js |
| `project.take_preview_dialog.main_clip_id.update` | 1 | index-2TDxNpOf.js |
| `project.take_preview_dialog.open` | 3 | index-2TDxNpOf.js |
| `project.take_sync_adjustment_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.take_sync_adjustment_dialog.open` | 1 | index-2TDxNpOf.js |
| `project.timeline.annotation.add` | 2 | index-2TDxNpOf.js |
| `project.timeline.annotation.update_for_selection` | 5 | index-2TDxNpOf.js |
| `project.timeline.audio.noise_cancelling.mode.update` | 2 | index-2TDxNpOf.js |
| `project.timeline.audio.noise_cancelling.strength.update` | 2 | index-2TDxNpOf.js |
| `project.timeline.audio.voice_enhancement.update` | 2 | index-2TDxNpOf.js |
| `project.timeline.audio.volume.update` | 2 | index-2TDxNpOf.js |
| `project.timeline.audio_type.update` | 1 | index-2TDxNpOf.js |
| `project.timeline.camera_zoom.update_for_selection` | 7 | index-2TDxNpOf.js |
| `project.timeline.captions.create_for_range` | 1 | index-2TDxNpOf.js |
| `project.timeline.captions.update_for_range` | 4 | index-2TDxNpOf.js |
| `project.timeline.captions.update_for_selection` | 4 | index-2TDxNpOf.js |
| `project.timeline.clip_left_trim` | 1 | index-2TDxNpOf.js |
| `project.timeline.clip_left_untrim` | 1 | index-2TDxNpOf.js |
| `project.timeline.clip_right_trim` | 1 | index-2TDxNpOf.js |
| `project.timeline.clip_right_untrim` | 1 | index-2TDxNpOf.js |
| `project.timeline.clip_speed.update` | 2 | index-2TDxNpOf.js |
| `project.timeline.cursor.create_for_range` | 1 | index-2TDxNpOf.js |
| `project.timeline.cursor.update` | 1 | index-2TDxNpOf.js |
| `project.timeline.cursor.update_for_range` | 1 | index-2TDxNpOf.js |
| `project.timeline.cursor.update_for_selection` | 1 | index-2TDxNpOf.js |
| `project.timeline.cut_range` | 2 | index-2TDxNpOf.js |
| `project.timeline.delete` | 7 | index-2TDxNpOf.js |
| `project.timeline.group` | 1 | index-2TDxNpOf.js |
| `project.timeline.layout.update_for_range` | 6 | index-2TDxNpOf.js |
| `project.timeline.layout.update_for_selection` | 4 | index-2TDxNpOf.js |
| `project.timeline.move` | 1 | index-2TDxNpOf.js |
| `project.timeline.music.update_for_range` | 1 | index-2TDxNpOf.js |
| `project.timeline.music.update_for_selection` | 1 | index-2TDxNpOf.js |
| `project.timeline.order.update` | 1 | index-2TDxNpOf.js |
| `project.timeline.overlay.add` | 2 | index-2TDxNpOf.js |
| `project.timeline.overlay.update_for_selection` | 16 | index-2TDxNpOf.js |
| `project.timeline.ripple_move` | 1 | index-2TDxNpOf.js |
| `project.timeline.screen_blur.create_for_range` | 3 | index-2TDxNpOf.js |
| `project.timeline.screen_blur.update_for_selection` | 2 | index-2TDxNpOf.js |
| `project.timeline.screen_highlight.create_for_range` | 3 | index-2TDxNpOf.js |
| `project.timeline.screen_highlight.update_for_selection` | 2 | index-2TDxNpOf.js |
| `project.timeline.screen_zoom.update_for_selection` | 4 | index-2TDxNpOf.js |
| `project.timeline.split` | 2 | index-2TDxNpOf.js |
| `project.timeline.take.add_to_scene` | 4 | index-2TDxNpOf.js |
| `project.timeline.take.remove_from_scene` | 2 | index-2TDxNpOf.js |
| `project.timeline.tool.update` | 4 | index-2TDxNpOf.js |
| `project.timeline.transcription.change_text` | 1 | index-2TDxNpOf.js |
| `project.timeline.uncollapse` | 1 | index-2TDxNpOf.js |
| `project.timeline.ungroup` | 1 | index-2TDxNpOf.js |
| `project.timeline.video.background.update` | 1 | index-2TDxNpOf.js |
| `project.timeline.video.color_adjustments.update` | 1 | index-2TDxNpOf.js |
| `project.timeline.video.crop.update` | 5 | index-2TDxNpOf.js |
| `project.timeline.video.face_tracking_mode.update` | 2 | index-2TDxNpOf.js |
| `project.timeline.video.mirrored.update` | 2 | index-2TDxNpOf.js |
| `project.timeline_range.update` | 9 | index-2TDxNpOf.js |
| `project.timeline_selection.select_all_segments` | 1 | index-2TDxNpOf.js |
| `project.timeline_selection.update` | 27 | index-2TDxNpOf.js |
| `project.timeline_selection.xor` | 1 | index-2TDxNpOf.js |
| `project.timeline_text_selection.update` | 2 | index-2TDxNpOf.js |
| `project.version_history_open.update` | 2 | index-2TDxNpOf.js |
| `project.workflow_parameters_dialog.close` | 1 | index-2TDxNpOf.js |
| `project.workflow_parameters_dialog.open` | 1 | index-2TDxNpOf.js |
| `project.workflow_review.update` | 1 | index-2TDxNpOf.js |
| `project_loading_session.close` | 2 | index-2TDxNpOf.js |
| `recorder.preview_selection.update` | 1 | index-DAWue-_s.js |
| `rename_project_dialog.close` | 1 | index-2TDxNpOf.js |
| `rename_project_dialog.open` | 3 | index-2TDxNpOf.js |
| `request.account.logout` | 1 | index-2TDxNpOf.js |
| `request.account.open_login_url` | 3 | index-2TDxNpOf.js |
| `request.account.open_upgrade_url` | 3 | index-2TDxNpOf.js |
| `request.account.refresh_data` | 1 | index-2TDxNpOf.js |
| `request.app.audio_output_devices.refresh` | 1 | index-2TDxNpOf.js |
| `request.app.permissions.accessibility.request` | 1 | index-2TDxNpOf.js |
| `request.app.permissions.camera.request` | 1 | index-2TDxNpOf.js |
| `request.app.permissions.microphone.request` | 1 | index-2TDxNpOf.js |
| `request.app.permissions.refresh` | 3 | index-2TDxNpOf.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `request.app.permissions.screen.request` | 1 | index-2TDxNpOf.js |
| `request.app.permissions.speech_recognition.request` | 1 | use-teleprompter-context-menu-Do8ZfJQ9.js |
| `request.app.permissions.system_sound.request` | 1 | index-2TDxNpOf.js |
| `request.built_in_sound.preview` | 1 | index-2TDxNpOf.js |
| `request.cancel_transcriptions` | 1 | index-2TDxNpOf.js |
| `request.capture.camera_owner.close` | 1 | index-2TDxNpOf.js |
| `request.capture.restart` | 1 | index-2TDxNpOf.js |
| `request.context_menu.show` | 15 | index-2TDxNpOf.js, index-DAWue-_s.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `request.cursor_click_sound.preview` | 1 | index-2TDxNpOf.js |
| `request.event.track` | 1 | index-2TDxNpOf.js |
| `request.exit` | 1 | index-2TDxNpOf.js |
| `request.export_diagnostics` | 1 | index-2TDxNpOf.js |
| `request.feedback_reporting.attachment.add` | 1 | index-2TDxNpOf.js |
| `request.feedback_reporting.send` | 1 | index-2TDxNpOf.js |
| `request.focus_project_folder` | 1 | index-2TDxNpOf.js |
| `request.mcp.workspace.heal` | 1 | index-2TDxNpOf.js |
| `request.mcp.workspace_location.choose` | 1 | index-2TDxNpOf.js |
| `request.mcp.workspace_location.reset` | 1 | index-2TDxNpOf.js |
| `request.media.import` | 10 | index-2TDxNpOf.js |
| `request.menu.show` | 1 | index-2TDxNpOf.js |
| `request.open_file_in_folder` | 1 | index-2TDxNpOf.js |
| `request.open_projects_folder` | 2 | index-2TDxNpOf.js |
| `request.open_url` | 8 | index-2TDxNpOf.js |
| `request.playback.pause` | 2 | index-2TDxNpOf.js |
| `request.playback.pause_and_seek` | 1 | index-2TDxNpOf.js |
| `request.playback.play` | 4 | index-2TDxNpOf.js |
| `request.playback.scrub` | 1 | index-2TDxNpOf.js |
| `request.playback.seek` | 12 | index-2TDxNpOf.js, index-DAWue-_s.js |
| `request.playback.set_parameter` | 2 | index-2TDxNpOf.js |
| `request.playback.set_playback_speed` | 5 | index-2TDxNpOf.js |
| `request.player.pause` | 1 | index-2TDxNpOf.js |
| `request.player.play` | 1 | index-2TDxNpOf.js |
| `request.player.register` | 1 | index-2TDxNpOf.js |
| `request.player.seek` | 3 | index-2TDxNpOf.js |
| `request.player.set_playback_speed` | 1 | index-2TDxNpOf.js |
| `request.player.unregister` | 1 | index-2TDxNpOf.js |
| `request.project.active_tool.update` | 2 | index-2TDxNpOf.js |
| `request.project.close` | 2 | index-2TDxNpOf.js |
| `request.project.close_all` | 1 | index-2TDxNpOf.js |
| `request.project.close_others` | 1 | index-2TDxNpOf.js |
| `request.project.copy` | 2 | index-2TDxNpOf.js |
| `request.project.create` | 2 | index-2TDxNpOf.js |
| `request.project.delete` | 1 | index-2TDxNpOf.js |
| `request.project.duplicate` | 2 | index-2TDxNpOf.js |
| `request.project.export_audio` | 1 | index-2TDxNpOf.js |
| `request.project.export_recordings` | 1 | index-2TDxNpOf.js |
| `request.project.export_transcript` | 1 | index-2TDxNpOf.js |
| `request.project.export_video` | 1 | index-2TDxNpOf.js |
| `request.project.open` | 2 | index-2TDxNpOf.js |
| `request.project.paste` | 1 | index-2TDxNpOf.js |
| `request.project.rename` | 1 | index-2TDxNpOf.js |
| `request.project.scene.delete` | 4 | index-2TDxNpOf.js |
| `request.project.scene.merge_with_previous` | 1 | index-2TDxNpOf.js |
| `request.project.scene.split` | 1 | index-2TDxNpOf.js |
| `request.project.shared_video_upload` | 1 | index-2TDxNpOf.js |
| `request.project.source.select_region_with_screen_picker` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.background.main_kind.import_from_media` | 2 | index-2TDxNpOf.js |
| `request.project.timeline.background.main_kind.update` | 7 | index-2TDxNpOf.js |
| `request.project.timeline.camera_zoom.create_for_range` | 3 | index-2TDxNpOf.js |
| `request.project.timeline.favorite_overlay.add` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.music.update_for_range` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.music.update_for_selection` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.screen_zoom.create_for_range` | 3 | index-2TDxNpOf.js |
| `request.project.timeline.screen_zoom.hints` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.sound.update_for_selection` | 5 | index-2TDxNpOf.js |
| `request.project.timeline.video.background.replace` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.video.background.replace.import_from_media` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.video.color_lut.import` | 1 | index-2TDxNpOf.js |
| `request.project.timeline.video_type.update` | 1 | index-2TDxNpOf.js |
| `request.project.transcribe_medias` | 1 | index-2TDxNpOf.js |
| `request.project.transcribe_pending_medias` | 2 | index-2TDxNpOf.js |
| `request.project.version.preview` | 1 | index-2TDxNpOf.js |
| `request.project.version.restore` | 1 | index-2TDxNpOf.js |
| `request.project.version.return` | 2 | index-2TDxNpOf.js |
| `request.project_compatibility_update` | 1 | index-2TDxNpOf.js |
| `request.recent_projects.refresh` | 2 | index-2TDxNpOf.js |
| `request.record_over.seek` | 1 | index-DAWue-_s.js |
| `request.record_preset.create_and_apply` | 2 | index-2TDxNpOf.js |
| `request.record_preset.delete` | 1 | index-2TDxNpOf.js |
| `request.recorder.close` | 4 | index-DAWue-_s.js |
| `request.recorder.countdown.cancel` | 1 | index-DAWue-_s.js |
| `request.recorder.countdown.skip` | 1 | index-DAWue-_s.js |
| `request.recorder.countdown.start` | 1 | index-DAWue-_s.js |
| `request.recorder.open` | 5 | index-2TDxNpOf.js |
| `request.recorder.pause_recording` | 1 | index-DAWue-_s.js |
| `request.recorder.resume_recording` | 1 | index-DAWue-_s.js |
| `request.recorder.start_recording` | 1 | index-DAWue-_s.js |
| `request.recorder.stop_recording` | 2 | index-DAWue-_s.js |
| `request.redo` | 1 | index-2TDxNpOf.js |
| `request.script_follower.seek` | 5 | index-Bek2B5yO.js, index-DAWue-_s.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `request.settings.favorite_music_tracks.add` | 1 | index-2TDxNpOf.js |
| `request.settings.favorite_overlays.add` | 1 | index-2TDxNpOf.js |
| `request.settings.override_projects_dir.choose` | 1 | index-2TDxNpOf.js |
| `request.settings.override_projects_dir.reset` | 1 | index-2TDxNpOf.js |
| `request.settings.override_projects_dir.validate` | 1 | index-2TDxNpOf.js |
| `request.settings.teleprompter_transparency.update` | 1 | use-teleprompter-context-menu-Do8ZfJQ9.js |
| `request.sources.preview.register` | 2 | index-2TDxNpOf.js, index-DAWue-_s.js |
| `request.sources.preview.unregister` | 2 | index-2TDxNpOf.js, index-DAWue-_s.js |
| `request.take.delete` | 1 | index-2TDxNpOf.js |
| `request.teleprompter_device.close_camera_hub_and_open` | 1 | index-2TDxNpOf.js |
| `request.teleprompter_window.close` | 1 | index-Bek2B5yO.js |
| `request.teleprompter_window.open` | 1 | index-DAWue-_s.js |
| `request.undo` | 1 | index-2TDxNpOf.js |
| `request.update` | 1 | index-2TDxNpOf.js |
| `request.workflow.cancel` | 2 | index-2TDxNpOf.js |
| `request.workflow.run` | 3 | index-2TDxNpOf.js |
| `request.workflow.submit_current_review` | 1 | index-2TDxNpOf.js |
| `select.active_project_tool` | 7 | index-2TDxNpOf.js |
| `settings.audio_drift_correction.update` | 1 | index-2TDxNpOf.js |
| `settings.audio_output_device_override.update` | 1 | index-2TDxNpOf.js |
| `settings.countdown_sound.update` | 1 | index-2TDxNpOf.js |
| `settings.disable_windows_native_audio_dsp.update` | 1 | index-2TDxNpOf.js |
| `settings.elevenlabs_api_key.update` | 1 | index-2TDxNpOf.js |
| `settings.enable_bluetooth_microphone_sync_adjustment.update` | 2 | index-2TDxNpOf.js |
| `settings.enable_preview_snapping.update` | 1 | index-2TDxNpOf.js |
| `settings.enable_screen_capture_refresh.update` | 1 | index-2TDxNpOf.js |
| `settings.enable_silent_microphone_warning.update` | 2 | index-2TDxNpOf.js |
| `settings.enable_timeline_scrubbing.update` | 4 | index-2TDxNpOf.js |
| `settings.enable_timeline_snapping.update` | 3 | index-2TDxNpOf.js |
| `settings.export_surface_render_mode.update` | 1 | index-2TDxNpOf.js |
| `settings.export_video_fps.update` | 2 | index-2TDxNpOf.js |
| `settings.export_video_quality.update` | 1 | index-2TDxNpOf.js |
| `settings.export_video_resolution_multiplier.update` | 2 | index-2TDxNpOf.js |
| `settings.favorite_captions_presets.add` | 1 | index-2TDxNpOf.js |
| `settings.favorite_captions_presets.remove` | 1 | index-2TDxNpOf.js |
| `settings.favorite_layout_presets.add` | 1 | index-2TDxNpOf.js |
| `settings.favorite_layout_presets.remove` | 1 | index-2TDxNpOf.js |
| `settings.favorite_music_tracks.remove` | 1 | index-2TDxNpOf.js |
| `settings.favorite_overlays.remove` | 1 | index-2TDxNpOf.js |
| `settings.global_recorder_shortcuts.update` | 1 | index-2TDxNpOf.js |
| `settings.hide_borumi_in_recordings.update` | 1 | index-2TDxNpOf.js |
| `settings.macos_camera_always_discards_late_video_frames.update` | 1 | index-2TDxNpOf.js |
| `settings.macos_camera_buffer_mode.update` | 1 | index-2TDxNpOf.js |
| `settings.macos_microphone_capture_engine.update` | 2 | index-2TDxNpOf.js |
| `settings.mirror_camera_recording.update` | 3 | index-2TDxNpOf.js, index-DAWue-_s.js |
| `settings.override_export_video_encoder.update` | 2 | index-2TDxNpOf.js |
| `settings.override_recording_video_encoder.update` | 2 | index-2TDxNpOf.js |
| `settings.playback_quality.update` | 6 | index-2TDxNpOf.js |
| `settings.preserve_original_cursor.update` | 1 | index-2TDxNpOf.js |
| `settings.record_presets.create` | 2 | index-2TDxNpOf.js |
| `settings.record_presets.rename` | 1 | index-2TDxNpOf.js |
| `settings.record_presets.update` | 2 | index-2TDxNpOf.js |
| `settings.recording_start_time_policy.update` | 1 | index-2TDxNpOf.js |
| `settings.rendering_audio_channel_layout.update` | 1 | index-2TDxNpOf.js |
| `settings.rendering_sample_loading_mode.update` | 1 | index-2TDxNpOf.js |
| `settings.screen_recording_max_fps.update` | 2 | index-2TDxNpOf.js |
| `settings.script_following_mode.update` | 3 | index-Bek2B5yO.js, index-DAWue-_s.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.script_following_speed.update` | 2 | index-Bek2B5yO.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.script_voice_following_engine.update` | 2 | index-2TDxNpOf.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.shortcut_override.remove` | 1 | index-2TDxNpOf.js |
| `settings.shortcut_override.upsert` | 1 | index-2TDxNpOf.js |
| `settings.shortcut_overrides.reset` | 1 | index-2TDxNpOf.js |
| `settings.show_recorder_source_chips.update` | 1 | index-DAWue-_s.js |
| `settings.show_screen_capture_overlay.update` | 1 | index-2TDxNpOf.js |
| `settings.source_audio_channel_modes.add` | 1 | index-2TDxNpOf.js |
| `settings.source_audio_channel_modes.remove` | 1 | index-2TDxNpOf.js |
| `settings.source_rotation.add` | 1 | index-2TDxNpOf.js |
| `settings.source_rotation.remove` | 1 | index-2TDxNpOf.js |
| `settings.source_sync_adjustments.add` | 2 | index-2TDxNpOf.js |
| `settings.source_sync_adjustments.remove` | 2 | index-2TDxNpOf.js |
| `settings.teleprompter_baseline.update` | 1 | index-Bek2B5yO.js |
| `settings.teleprompter_device_connect_behavior.update` | 1 | index-2TDxNpOf.js |
| `settings.teleprompter_font_size.update` | 3 | index-Bek2B5yO.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.teleprompter_line_height.update` | 1 | use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.teleprompter_mirrored.update` | 1 | use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.teleprompter_text_align.update` | 2 | index-Bek2B5yO.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.teleprompter_text_width_ratio.update` | 2 | index-Bek2B5yO.js, use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.teleprompter_theme.update` | 2 | use-teleprompter-context-menu-Do8ZfJQ9.js |
| `settings.theme.update` | 1 | index-2TDxNpOf.js |
| `settings.transcribe_clips_automatically.update` | 1 | index-2TDxNpOf.js |
| `settings.transcript_export_format.update` | 1 | index-2TDxNpOf.js |
| `settings.transcription_custom_vocabulary.update` | 1 | index-2TDxNpOf.js |
| `settings.transcription_languages.update` | 1 | index-2TDxNpOf.js |
| `settings.transcription_model.update` | 1 | index-2TDxNpOf.js |
| `settings.update_channel.update` | 1 | index-2TDxNpOf.js |
| `settings.use_elevated_window_layer.update` | 1 | index-2TDxNpOf.js |
| `settings.use_source_timestamps_synchronization.update` | 1 | index-2TDxNpOf.js |
| `settings.voice_enhancement_mode_by_default.update` | 1 | index-2TDxNpOf.js |
| `settings.windows_microphone_capture_engine.update` | 1 | index-2TDxNpOf.js |
| `take.clip_start_offset_adjustments.update` | 1 | index-2TDxNpOf.js |
| `take.delete` | 1 | index-2TDxNpOf.js |
| `take.move_to_scene` | 3 | index-2TDxNpOf.js |
| `teleprompter_camera_hub_dialog.close` | 1 | index-2TDxNpOf.js |

322 distinct command kinds. Counts are occurrences in the prettier-formatted copies.


## Appendix B. Keyboard action handlers (scope → action → command)

| Scope (where handler lives) | Action (`action`) | Command(s) it sends | Source: file : line (pp/ copy) |
|---|---|---|---|
| `[{ kind: "ScriptTool" }]` | `SelectAll` | (none emitted directly) | index-2TDxNpOf.js : 25578 |
| `[{ kind: "RecordTool" }]` | `RecordToolShowPresets` | (none emitted directly) | index-2TDxNpOf.js : 3847 |
| `[{ kind: "EditTool" }]` | `DeselectAll` | `project.timeline_selection.update | project.timeline_range.update` | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolDelete` | (none emitted directly) | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolDeleteAndLeaveGap` | (none emitted directly) | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolSplitAtPlayhead` | (none emitted directly) | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolToggleScrubbing` | `settings.enable_timeline_scrubbing.update` | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolToggleSnapping` | `settings.enable_timeline_snapping.update` | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolToolBlade` | `project.timeline.tool.update` | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolToolSelect` | `project.timeline.tool.update` | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolTrimLeftToPlayhead` | (none emitted directly) | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolTrimRightToPlayhead` | (none emitted directly) | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `SelectAll` | `project.timeline_selection.select_all_segments` | index-2TDxNpOf.js : 68503 |
| `[{ kind: "EditTool" }]` | `EditToolTimelineZoomIn` | (none emitted directly) | index-2TDxNpOf.js : 68928 |
| `[{ kind: "EditTool" }]` | `EditToolTimelineZoomOut` | (none emitted directly) | index-2TDxNpOf.js : 68928 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackFaster` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackNextEdit` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackPauseReset` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackPreviousEdit` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackStepFrameBackward` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackStepFrameForward` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "EditTool" }]` | `EditToolPlaybackToggle` | (none emitted directly) | index-2TDxNpOf.js : 68965 |
| `[{ kind: "TakePreview" }]` | `TakePreviewClose` | `project.take_preview_dialog.close` | index-2TDxNpOf.js : 73661 |
| `[{ kind: "TakePreview" }]` | `TakePreviewPlaybackFaster` | (none emitted directly) | index-2TDxNpOf.js : 73661 |
| `[{ kind: "TakePreview" }]` | `TakePreviewPlaybackPauseReset` | (none emitted directly) | index-2TDxNpOf.js : 73661 |
| `[{ kind: "TakePreview" }]` | `TakePreviewPlaybackSlower` | (none emitted directly) | index-2TDxNpOf.js : 73661 |
| `[{ kind: "TakePreview" }]` | `TakePreviewPlaybackToggle` | (none emitted directly) | index-2TDxNpOf.js : 73661 |
| `[{ kind: "TakePreview" }]` | `TakePreviewSeekBackward` | (none emitted directly) | index-2TDxNpOf.js : 73661 |
| `[{ kind: "TakePreview" }]` | `TakePreviewSeekForward` | (none emitted directly) | index-2TDxNpOf.js : 73661 |
| `[{ kind: "WorkflowReview" }]` | `WorkflowReviewPlaybackToggle` | (none emitted directly) | index-2TDxNpOf.js : 73945 |

Where a handler sends no literal command kind, the handler calls a helper; the helper is not traced here `[N]`.


## Appendix C. Context-menu item IDs

| Menu item id | Source (pp/ copy) |
|---|---|
| `teleprompter.context-menu.transparency.none` | use-teleprompter-context-menu-Do8ZfJQ9.js : 822 |
| `teleprompter.context-menu.transparency.10` | use-teleprompter-context-menu-Do8ZfJQ9.js : 827 |
| `teleprompter.context-menu.transparency.25` | use-teleprompter-context-menu-Do8ZfJQ9.js : 832 |
| `teleprompter.context-menu.transparency.50` | use-teleprompter-context-menu-Do8ZfJQ9.js : 837 |
| `teleprompter.context-menu.transparency.75` | use-teleprompter-context-menu-Do8ZfJQ9.js : 842 |
| `teleprompter.context-menu.playback.toggle` | use-teleprompter-context-menu-Do8ZfJQ9.js : 888 |
| `teleprompter.context-menu.playback.rewind` | use-teleprompter-context-menu-Do8ZfJQ9.js : 908 |
| `teleprompter.context-menu.mirror-text` | use-teleprompter-context-menu-Do8ZfJQ9.js : 969 |
| `teleprompter.context-menu.theme.auto` | use-teleprompter-context-menu-Do8ZfJQ9.js : 992 |
| `teleprompter.context-menu.theme.light` | use-teleprompter-context-menu-Do8ZfJQ9.js : 999 |
| `teleprompter.context-menu.theme.dark` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1006 |
| `teleprompter.context-menu.voice-following-engine.auto` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1043 |
| `teleprompter.context-menu.voice-following-engine.whisper` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1050 |
| `teleprompter.context-menu.voice-following-engine.apple-speech` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1056 |
| `teleprompter.context-menu.voice-following-engine.apple-speech-v2` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1064 |
| `teleprompter.context-menu.mode.manual` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1083 |
| `teleprompter.context-menu.mode.voice-enhanced` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1090 |
| `teleprompter.context-menu.mode.voice` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1097 |
| `teleprompter.context-menu.mode.constant-speed-voice-activated` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1104 |
| `teleprompter.context-menu.mode.constant-speed` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1111 |
| `teleprompter.context-menu.text-alignment.auto` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1167 |
| `teleprompter.context-menu.text-alignment.left` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1176 |
| `teleprompter.context-menu.text-alignment.center` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1184 |
| `teleprompter.context-menu.text-alignment.right` | use-teleprompter-context-menu-Do8ZfJQ9.js : 1192 |
| `project-tab.context-menu.rename` | index-2TDxNpOf.js : 2081 |
| `project-tab.context-menu.duplicate` | index-2TDxNpOf.js : 2100 |
| `project-tab.context-menu.close` | index-2TDxNpOf.js : 2113 |
| `project-tab.context-menu.close-others` | index-2TDxNpOf.js : 2123 |
| `project-tab.context-menu.close-all` | index-2TDxNpOf.js : 2136 |
| `recent-project.context-menu.open` | index-2TDxNpOf.js : 3263 |
| `recent-project.context-menu.duplicate` | index-2TDxNpOf.js : 3280 |
| `recent-project.context-menu.delete` | index-2TDxNpOf.js : 3296 |
| `recent-project.context-menu.open-in-finder` | index-2TDxNpOf.js : 3313 |
| `scene-entry.context-menu.add-scene-before` | index-2TDxNpOf.js : 22243 |
| `scene-entry.context-menu.add-scene-after` | index-2TDxNpOf.js : 22261 |
| `scene-entry.context-menu.delete` | index-2TDxNpOf.js : 22280 |
| `preview.context-menu.resolution.mirror` | index-2TDxNpOf.js : 26469 |
| `preview.context-menu.microphone.warn-when-silent` | index-2TDxNpOf.js : 26529 |
| `preview.context-menu.screen.hide-borumi-in-recordings` | index-2TDxNpOf.js : 26580 |
| `preview.context-menu.synchronization.bluetooth` | index-2TDxNpOf.js : 26724 |
| `preview.context-menu.rotation.none` | index-2TDxNpOf.js : 26757 |
| `preview.context-menu.synchronization.amount.auto` | index-2TDxNpOf.js : 26804 |
| `preview.context-menu.synchronization.amount.custom` | index-2TDxNpOf.js : 26846 |
| `preview.context-menu.audio-channels.auto` | index-2TDxNpOf.js : 26905 |
| `scene-entry.context-menu.record-new-take` | index-2TDxNpOf.js : 31499 |
| `scene-entry.context-menu.record-over` | index-2TDxNpOf.js : 31517 |
| `scene-entry.context-menu.import-media` | index-2TDxNpOf.js : 31535 |
| `scene-entry.context-menu.delete` | index-2TDxNpOf.js : 31554 |
| `take-card.context-menu.play` | index-2TDxNpOf.js : 31578 |
| `take-card.context-menu.archive` | index-2TDxNpOf.js : 31595 |
| `take-card.context-menu.delete` | index-2TDxNpOf.js : 31613 |
| `timeline.context-menu.enable-snapping` | index-2TDxNpOf.js : 38939 |
| `timeline.context-menu.enable-scrubbing` | index-2TDxNpOf.js : 38958 |
| `timeline-empty-scene.context-menu.delete` | index-2TDxNpOf.js : 39047 |
| `timeline.segment.context-menu.group` | index-2TDxNpOf.js : 42573 |
| `timeline.segment.context-menu.ungroup` | index-2TDxNpOf.js : 42584 |
| `timeline.segment.context-menu.uncollapse` | index-2TDxNpOf.js : 42601 |
| `timeline.segment.context-menu.delete` | index-2TDxNpOf.js : 42670 |
| `timeline.segment.context-menu.delete-without-collapsing` | index-2TDxNpOf.js : 42679 |
| `timeline.segment.context-menu.speed.more` | index-2TDxNpOf.js : 42733 |
| `timeline.segment.context-menu.open-properties` | index-2TDxNpOf.js : 43098 |
| `timeline.segment.context-menu.open-properties` | index-2TDxNpOf.js : 43110 |
| `timeline.segment.context-menu.open-properties` | index-2TDxNpOf.js : 43122 |
| `timeline.segment.context-menu.open-properties` | index-2TDxNpOf.js : 43134 |
| `preview.context-menu.playback-quality.best` | index-2TDxNpOf.js : 43976 |
| `preview.context-menu.playback-quality.balanced` | index-2TDxNpOf.js : 43992 |
| `preview.context-menu.playback-quality.fast` | index-2TDxNpOf.js : 44008 |
| `preview.context-menu.playback-quality.faster` | index-2TDxNpOf.js : 44024 |
| `preview.context-menu.playback-quality.fastest` | index-2TDxNpOf.js : 44040 |
| `preview.context-menu.snapping` | index-2TDxNpOf.js : 44061 |


## Appendix D. UI copy, verbatim (generated)

Extracted mechanically from JSX props and object keys (`label`, `title`, `description`, `hint`, `tooltip`, `placeholder`, `children`, `message`, `name`, `subtitle`, `aria-label`, `text`, `heading`, template strings and array fragments). Filtered to remove React and library messages, DOM-global lists, and wallet/extension names in the shell chunk (lines below 40000 of `index-BOa99FnS.js`). Verify each string in context before use. Line numbers are in the `pp/` copies.

| # | Text (verbatim) | Context | Where (bundle file : line in pp/ copy) | Count |
|---|---|---|---|---|
| 1 | Oh snap! Something went wrong :( | key:children | index-BOa99FnS.js : 40607 | 2 |
| 2 | The team has already been notified of this issue, and we'll fix it as soon as possible. | key:children | index-BOa99FnS.js : 40612 | 2 |
| 3 | In the meantime, you can try restarting Borumi. | key:children | index-BOa99FnS.js : 40619 | 2 |
| 4 | If the problem persists, please let us know at | arr | index-BOa99FnS.js : 40627 | 2 |
| 5 | More actions | key:aria-label | index-2TDxNpOf.js : 177 | 1 |
| 6 | More primary actions | key:aria-label | index-2TDxNpOf.js : 235 | 1 |
| 7 | Tip | arr | index-2TDxNpOf.js : 844 | 1 |
| 8 | Couldn't open project | key:label | index-2TDxNpOf.js : 1346 | 1 |
| 9 | Opening project… | key:label | index-2TDxNpOf.js : 1347 | 1 |
| 10 | New Project | key:label | index-2TDxNpOf.js : 1527 | 1 |
| 11 | Need help? | key:children | index-2TDxNpOf.js : 1570 | 1 |
| 12 | Contact support | key:children | index-2TDxNpOf.js : 1588 | 1 |
| 13 | We're here to help if you have any questions, suggestions or concerns. | key:children | index-2TDxNpOf.js : 1595 | 1 |
| 14 | Report issue | key:children | index-2TDxNpOf.js : 1615 | 1 |
| 15 | Are you experiencing a issue? Report it here and we'll help you as soon as possible. | key:children | index-2TDxNpOf.js : 1622 | 1 |
| 16 | Meta | arr | index-2TDxNpOf.js : 1663 | 2 |
| 17 | Control | arr | index-2TDxNpOf.js : 1663 | 1 |
| 18 | Alt | arr | index-2TDxNpOf.js : 1663 | 2 |
| 19 | Shift | arr | index-2TDxNpOf.js : 1663 | 2 |
| 20 | Wheel | arr | index-2TDxNpOf.js : 1729 | 1 |
| 21 | Rename Project | key:label | index-2TDxNpOf.js : 2086 | 2 |
| 22 | Duplicate Project | key:label | index-2TDxNpOf.js : 2105 | 2 |
| 23 | Close Project | key:label | index-2TDxNpOf.js : 2118 | 1 |
| 24 | Close Other Projects | key:label | index-2TDxNpOf.js : 2128 | 1 |
| 25 | Close All Projects | key:label | index-2TDxNpOf.js : 2141 | 1 |
| 26 | ChatGpt | arr | index-2TDxNpOf.js : 2167 | 1 |
| 27 | Claude | arr | index-2TDxNpOf.js : 2167 | 3 |
| 28 | Other | arr | index-2TDxNpOf.js : 2167 | 1 |
| 29 | Borumi | key:aria-label | index-2TDxNpOf.js : 2268 | 1 |
| 30 | Welcome to | key:children | index-2TDxNpOf.js : 2414 | 1 |
| 31 | You’re almost ready to create amazing videos. We just need to set up a couple of things first. | key:children | index-2TDxNpOf.js : 2424 | 1 |
| 32 | Get started | key:children | index-2TDxNpOf.js : 2443 | 1 |
| 33 | By clicking "Get started", you agree to our | arr | index-2TDxNpOf.js : 2452 | 1 |
| 34 | Terms & Conditions | key:children | index-2TDxNpOf.js : 2457 | 1 |
| 35 | Privacy Policy | key:children | index-2TDxNpOf.js : 2465 | 1 |
| 36 | Skip for now | key:children | index-2TDxNpOf.js : 2513 | 1 |
| 37 | Allow screen recording | key:title | index-2TDxNpOf.js : 2569 | 2 |
| 38 | Borumi needs permission to capture your screen during recordings. If you don’t plan to record your screen, you can skip it. | key:description | index-2TDxNpOf.js : 2571 | 1 |
| 39 | Allow camera access | key:title | index-2TDxNpOf.js : 2584 | 2 |
| 40 | Borumi needs permission to capture your camera during recordings. If you don’t plan to record your camera, you can skip it. | key:description | index-2TDxNpOf.js : 2586 | 1 |
| 41 | Allow microphone access | key:title | index-2TDxNpOf.js : 2599 | 2 |
| 42 | Borumi needs permission to capture your microphone during recordings. If you don’t plan to record your voice, you can skip it. | key:description | index-2TDxNpOf.js : 2601 | 1 |
| 43 | Allow accessibility access | key:title | index-2TDxNpOf.js : 2614 | 2 |
| 44 | Borumi follows your mouse during recordings to create effects like automatic zoom-ins. | key:description | index-2TDxNpOf.js : 2616 | 1 |
| 45 | Allow system sound recording | key:title | index-2TDxNpOf.js : 2629 | 2 |
| 46 | Borumi needs permission to capture your system sound during recordings. If you don’t plan to record system sound, you can skip it. | key:description | index-2TDxNpOf.js : 2631 | 1 |
| 47 | You’re all set! | key:children | index-2TDxNpOf.js : 2855 | 1 |
| 48 | Borumi is ready. Time to record your first video. | key:children | index-2TDxNpOf.js : 2859 | 1 |
| 49 | Start creating | key:children | index-2TDxNpOf.js : 2867 | 1 |
| 50 | Oh snap! Something went wrong with your projects folder. | key:children | index-2TDxNpOf.js : 3144 | 1 |
| 51 | Change | key:children | index-2TDxNpOf.js : 3167 | 3 |
| 52 | How would you like to start? | key:children | index-2TDxNpOf.js : 3184 | 1 |
| 53 | Structured video | key:title | index-2TDxNpOf.js : 3195 | 1 |
| 54 | Prepare your script, record the scenes and edit them. | key:description | index-2TDxNpOf.js : 3197 | 1 |
| 55 | Quick recording | key:title | index-2TDxNpOf.js : 3210 | 1 |
| 56 | Start recording right away, and edit the video if necessary. | key:description | index-2TDxNpOf.js : 3212 | 1 |
| 57 | Open Project | key:label | index-2TDxNpOf.js : 3268 | 1 |
| 58 | Delete Project | key:label | index-2TDxNpOf.js : 3301 | 1 |
| 59 | Oh snap! Something went wrong when loading your recent projects. | key:children | index-2TDxNpOf.js : 3409 | 1 |
| 60 | Don't worry, you can access them directly: | arr | index-2TDxNpOf.js : 3414 | 1 |
| 61 | You can also | arr | index-2TDxNpOf.js : 3422 | 1 |
| 62 | try again | key:children | index-2TDxNpOf.js : 3424 | 1 |
| 63 | , or | arr | index-2TDxNpOf.js : 3425 | 2 |
| 64 | contact us | key:children | index-2TDxNpOf.js : 3427 | 1 |
| 65 | if the problem persists. | arr | index-2TDxNpOf.js : 3429 | 1 |
| 66 | Recent projects | key:children | index-2TDxNpOf.js : 3479 | 1 |
| 67 | View all | key:children | index-2TDxNpOf.js : 3493 | 1 |
| 68 | Edited | arr | index-2TDxNpOf.js : 3549 | 2 |
| 69 | Saving error | arr | index-2TDxNpOf.js : 3565 | 1 |
| 70 | Click to rename project | key:children | index-2TDxNpOf.js : 3648 | 1 |
| 71 | Update preset | key:label | index-2TDxNpOf.js : 3939 | 2 |
| 72 | Reset preset | key:label | index-2TDxNpOf.js : 3951 | 2 |
| 73 | Save as a new preset | key:label | index-2TDxNpOf.js : 3964 | 1 |
| 74 | Duplicate preset | key:label | index-2TDxNpOf.js : 3993 | 1 |
| 75 | Delete preset | key:label | index-2TDxNpOf.js : 4006 | 1 |
| 76 | Search presets | key:placeholder | index-2TDxNpOf.js : 4121 | 2 |
| 77 | Current setup | key:children | index-2TDxNpOf.js : 4158 | 1 |
| 78 | More options | key:label | index-2TDxNpOf.js : 4188 | 7 |
| 79 | Save as preset | key:label | index-2TDxNpOf.js : 4195 | 1 |
| 80 | Tip: | key:children | index-2TDxNpOf.js : 4216 | 4 |
| 81 |  Click | arr | index-2TDxNpOf.js : 4218 | 1 |
| 82 | to save this configuration as a preset, so you can quickly switch to it later. | arr | index-2TDxNpOf.js : 4223 | 1 |
| 83 | No presets found | key:children | index-2TDxNpOf.js : 4254 | 1 |
| 84 | Borumi tried to apply the preset, but some sources were not found. Maybe they are disconnected? | key:children | index-2TDxNpOf.js : 4293 | 1 |
| 85 | Review your sources before recording | arr | index-2TDxNpOf.js : 4306 | 1 |
| 86 | Retry | key:children | index-2TDxNpOf.js : 4320 | 5 |
| 87 | Close | key:aria-label | index-2TDxNpOf.js : 4334 | 5 |
| 88 | Recording presets | key:children | index-2TDxNpOf.js : 4417 | 1 |
| 89 | Save your recording configuration (eg. Camera, Mic, Screen) to easily switch back to it later. | key:children | index-2TDxNpOf.js : 4430 | 1 |
| 90 | Undo | key:name | index-2TDxNpOf.js : 4803 | 1 |
| 91 | Redo | key:name | index-2TDxNpOf.js : 4817 | 1 |
| 92 | Version History | key:name | index-2TDxNpOf.js : 4831 | 2 |
| 93 | Export | key:children | index-2TDxNpOf.js : 4858 | 3 |
| 94 | Open export options | key:aria-label | index-2TDxNpOf.js : 4869 | 1 |
| 95 | Export Video | key:title | index-2TDxNpOf.js : 4881 | 2 |
| 96 | MP4 • High quality | key:subtitle | index-2TDxNpOf.js : 4882 | 1 |
| 97 | Share Video | key:title | index-2TDxNpOf.js : 4889 | 1 |
| 98 | Upload & get a shareable link | key:subtitle | index-2TDxNpOf.js : 4891 | 1 |
| 99 | Export Audio | key:title | index-2TDxNpOf.js : 4898 | 1 |
| 100 | WAV • High quality | key:subtitle | index-2TDxNpOf.js : 4899 | 1 |
| 101 | Export Transcript | key:title | index-2TDxNpOf.js : 4906 | 2 |
| 102 | TXT, MD or SRT | key:subtitle | index-2TDxNpOf.js : 4907 | 1 |
| 103 | Back to Script | key:children | index-2TDxNpOf.js : 5030 | 1 |
| 104 | Back to Recording | key:children | index-2TDxNpOf.js : 5039 | 1 |
| 105 | Continue to Recording | key:children | index-2TDxNpOf.js : 5054 | 1 |
| 106 | Continue to Editing | key:children | index-2TDxNpOf.js : 5073 | 1 |
| 107 | Script | key:label | index-2TDxNpOf.js : 5091 | 2 |
| 108 | Record | key:label | index-2TDxNpOf.js : 5107 | 4 |
| 109 | Edit | key:label | index-2TDxNpOf.js : 5123 | 2 |
| 110 | iPad Simulator | arr | index-2TDxNpOf.js : 17069 | 1 |
| 111 | iPhone Simulator | arr | index-2TDxNpOf.js : 17070 | 1 |
| 112 | iPod Simulator | arr | index-2TDxNpOf.js : 17071 | 1 |
| 113 | Ctrl | arr | index-2TDxNpOf.js : 17363 | 1 |
| 114 | [tiptap error]: Invalid JSON content | arr | index-2TDxNpOf.js : 18803 | 1 |
| 115 | [tiptap error]: Invalid HTML content | arr | index-2TDxNpOf.js : 18804 | 1 |
| 116 | Add scene before | key:label | index-2TDxNpOf.js : 22248 | 1 |
| 117 | Add scene after | key:label | index-2TDxNpOf.js : 22266 | 1 |
| 118 | Delete scene | key:label | index-2TDxNpOf.js : 22285 | 3 |
| 119 | You can use | key:children | index-2TDxNpOf.js : 24947 | 1 |
| 120 | to create a new scene. | key:children | index-2TDxNpOf.js : 24949 | 1 |
| 121 | Add scene | key:children | index-2TDxNpOf.js : 25691 | 2 |
| 122 | Start writing your amazing video... | key:children | index-2TDxNpOf.js : 25779 | 1 |
| 123 | You can also paste your script from Notion, Google Docs, or your favorite editor, or | arr | index-2TDxNpOf.js : 25785 | 1 |
| 124 | Start Recording | key:children | index-2TDxNpOf.js : 25790 | 1 |
| 125 | right away. | arr | index-2TDxNpOf.js : 25793 | 1 |
| 126 | Screen | key:children | index-2TDxNpOf.js : 26003 | 4 |
| 127 | Region | key:children | index-2TDxNpOf.js : 26019 | 1 |
| 128 | Window | key:children | index-2TDxNpOf.js : 26033 | 1 |
| 129 | Select region | key:children | index-2TDxNpOf.js : 26068 | 1 |
| 130 | Requires macOS 14.2 and newer | key:children | index-2TDxNpOf.js : 26364 | 1 |
| 131 | No  | arr | index-2TDxNpOf.js : 26368 | 2 |
| 132 |  available | arr | index-2TDxNpOf.js : 26368 | 1 |
| 133 | Camera | key:name | index-2TDxNpOf.js : 26412 | 3 |
| 134 | Microphone | key:name | index-2TDxNpOf.js : 26414 | 3 |
| 135 | System Sound | key:name | index-2TDxNpOf.js : 26418 | 3 |
| 136 | Resolution | key:label | index-2TDxNpOf.js : 26453 | 2 |
| 137 | Rotation | key:label | index-2TDxNpOf.js : 26462 | 1 |
| 138 | Mirror camera | key:label | index-2TDxNpOf.js : 26471 | 3 |
| 139 | Synchronization | key:label | index-2TDxNpOf.js : 26487 | 2 |
| 140 | Audio channels | key:label | index-2TDxNpOf.js : 26512 | 3 |
| 141 | Audio engine | key:label | index-2TDxNpOf.js : 26521 | 1 |
| 142 | Warn when microphone is silent | key:label | index-2TDxNpOf.js : 26531 | 3 |
| 143 | Max Frame Rate | key:label | index-2TDxNpOf.js : 26568 | 1 |
| 144 | Hide Borumi from recordings | key:label | index-2TDxNpOf.js : 26582 | 1 |
| 145 | MacOS Presets | key:label | index-2TDxNpOf.js : 26678 | 1 |
| 146 | Compensate for Bluetooth latency | key:label | index-2TDxNpOf.js : 26725 | 2 |
| 147 | Amount | key:label | index-2TDxNpOf.js : 26742 | 1 |
| 148 | None | key:label | index-2TDxNpOf.js : 26758 | 5 |
| 149 | Automatic | key:label | index-2TDxNpOf.js : 26805 | 7 |
| 150 | Custom... | key:label | index-2TDxNpOf.js : 26847 | 1 |
| 151 | Mono | key:label | index-2TDxNpOf.js : 26865 | 2 |
| 152 | Mono (L) | key:label | index-2TDxNpOf.js : 26866 | 1 |
| 153 | Mono (R) | key:label | index-2TDxNpOf.js : 26867 | 1 |
| 154 | Stereo | key:label | index-2TDxNpOf.js : 26868 | 2 |
| 155 | AVFoundation | key:label | index-2TDxNpOf.js : 26874 | 2 |
| 156 | Core Audio | key:label | index-2TDxNpOf.js : 26875 | 2 |
| 157 | Resolution3840x2160 | arr | index-2TDxNpOf.js : 26946 | 1 |
| 158 | Resolution1920x1080 | arr | index-2TDxNpOf.js : 26947 | 1 |
| 159 | Resolution1280x720 | arr | index-2TDxNpOf.js : 26948 | 1 |
| 160 | Resolution960x540 | arr | index-2TDxNpOf.js : 26949 | 1 |
| 161 | Resolution640x480 | arr | index-2TDxNpOf.js : 26950 | 1 |
| 162 | Resolution352x288 | arr | index-2TDxNpOf.js : 26951 | 1 |
| 163 | Resolution320x240 | arr | index-2TDxNpOf.js : 26952 | 1 |
| 164 | High | arr | index-2TDxNpOf.js : 26953 | 4 |
| 165 | Medium | arr | index-2TDxNpOf.js : 26954 | 2 |
| 166 | Low | arr | index-2TDxNpOf.js : 26955 | 2 |
| 167 | Oh snap! Something went wrong. | key:children | index-2TDxNpOf.js : 26974 | 2 |
| 168 | If the problem persists, please | arr | index-2TDxNpOf.js : 26984 | 1 |
| 169 | let us know | key:children | index-2TDxNpOf.js : 26995 | 1 |
| 170 | Try again | key:children | index-2TDxNpOf.js : 27004 | 4 |
| 171 | Some permissions are missing | key:title | index-2TDxNpOf.js : 27095 | 1 |
| 172 | Enable the required permissions so Borumi can capture your | arr | index-2TDxNpOf.js : 27098 | 1 |
| 173 | Enable permissions | key:children | index-2TDxNpOf.js : 27108 | 1 |
| 174 | Choose a different source or disable one of the duplicated sources before recording. | key:description | index-2TDxNpOf.js : 27134 | 1 |
| 175 | Your window was closed. | key:title | index-2TDxNpOf.js : 27146 | 1 |
| 176 | It looks like | arr | index-2TDxNpOf.js : 27149 | 1 |
| 177 |  was closed. Choose another window to continue. | arr | index-2TDxNpOf.js : 27152 | 1 |
| 178 | Reconnect | arr | index-2TDxNpOf.js : 27163 | 1 |
| 179 | or choose another  | arr | index-2TDxNpOf.js : 27170 | 1 |
| 180 |  to continue. | arr | index-2TDxNpOf.js : 27172 | 1 |
| 181 |  is using | arr | index-2TDxNpOf.js : 27192 | 2 |
| 182 | Another app is using  | key:children | index-2TDxNpOf.js : 27196 | 2 |
| 183 |  in exclusive mode, so Borumi can't record it. Close that app or turn off exclusive microphone access, then try again. | arr | index-2TDxNpOf.js : 27198 | 1 |
| 184 | , so Borumi can't start the camera.  | arr | index-2TDxNpOf.js : 27233 | 1 |
| 185 | Close the app | key:children | index-2TDxNpOf.js : 27239 | 2 |
| 186 | , then try again. | arr | index-2TDxNpOf.js : 27242 | 1 |
| 187 | Unable to start recording | key:title | index-2TDxNpOf.js : 27250 | 2 |
| 188 | Fix the source issues above before recording. | key:description | index-2TDxNpOf.js : 27251 | 1 |
| 189 | Your window is not responding. | key:title | index-2TDxNpOf.js : 27263 | 1 |
| 190 | Screen recording may be stuck | key:title | index-2TDxNpOf.js : 27273 | 2 |
| 191 | No new screen frames arrived for a while. Check the selected screen or window, then try again. | key:description | index-2TDxNpOf.js : 27275 | 1 |
| 192 | Make sure | arr | index-2TDxNpOf.js : 27283 | 2 |
| 193 | is properly connected and powered on. You can also try unplugging and reconnecting the device. Alternatively, you can try switching to another  | arr | index-2TDxNpOf.js : 27290 | 2 |
| 194 | System sound cannot be recorded. | key:title | index-2TDxNpOf.js : 27300 | 1 |
| 195 | You can try restarting Borumi to fix this issue. If this doesn't help, please try restarting your Mac. | key:description | index-2TDxNpOf.js : 27302 | 1 |
| 196 | Screen recording is not responding. | key:title | index-2TDxNpOf.js : 27330 | 1 |
| 197 | Borumi has detected an issue with the macOS screen recording system. | arr | index-2TDxNpOf.js : 27333 | 1 |
| 198 | We recommend restarting your Mac to fix this issue. | key:children | index-2TDxNpOf.js : 27337 | 1 |
| 199 | Your  | arr | index-2TDxNpOf.js : 27577 | 1 |
| 200 |  is running low on disk space, which can make recordings unstable or cause unexpected crashes. | arr | index-2TDxNpOf.js : 27579 | 1 |
| 201 | We recommend freeing up at least  | arr | index-2TDxNpOf.js : 27585 | 2 |
| 202 |  GB and then restarting your  | arr | index-2TDxNpOf.js : 27587 | 1 |
| 203 |  before recording. | arr | index-2TDxNpOf.js : 27589 | 1 |
| 204 | Your recording folder | arr | index-2TDxNpOf.js : 27604 | 1 |
| 205 | is running low on disk space, which can make recordings unstable or cause unexpected crashes. | arr | index-2TDxNpOf.js : 27611 | 1 |
| 206 |  GB before recording. | arr | index-2TDxNpOf.js : 27619 | 1 |
| 207 | Your disk is almost full | key:children | index-2TDxNpOf.js : 27638 | 1 |
| 208 | Record new... | key:label | index-2TDxNpOf.js : 31504 | 1 |
| 209 | Record over... | key:label | index-2TDxNpOf.js : 31522 | 1 |
| 210 | Import media from file... | key:label | index-2TDxNpOf.js : 31540 | 1 |
| 211 | Play take | key:label | index-2TDxNpOf.js : 31583 | 1 |
| 212 | Archive take | key:label | index-2TDxNpOf.js : 31600 | 2 |
| 213 | Delete take | key:label | index-2TDxNpOf.js : 31618 | 2 |
| 214 | or Import from file. | key:children | index-2TDxNpOf.js : 32128 | 1 |
| 215 | Archived ( | arr | index-2TDxNpOf.js : 32188 | 1 |
| 216 | Add scene here | key:text | index-2TDxNpOf.js : 32784 | 2 |
| 217 | Drop to import your media | key:children | index-2TDxNpOf.js : 32961 | 3 |
| 218 | Hey  | arr | index-2TDxNpOf.js : 33050 | 1 |
| 219 |  Ready to record? | arr | index-2TDxNpOf.js : 33050 | 1 |
| 220 | First, check your camera, microphone, and screen on the left. | key:children | index-2TDxNpOf.js : 33057 | 1 |
| 221 | When you're ready, click "Start recording". | tpl | index-2TDxNpOf.js : 33060 | 1 |
| 222 | Start recording | key:children | index-2TDxNpOf.js : 33078 | 1 |
| 223 | Import from file... | key:children | index-2TDxNpOf.js : 33090 | 1 |
| 224 | or drop a file here to start. | key:children | index-2TDxNpOf.js : 33206 | 1 |
| 225 | End | arr | index-2TDxNpOf.js : 35886 | 5 |
| 226 | Start | arr | index-2TDxNpOf.js : 35886 | 2 |
| 227 | Auto | key:children | index-2TDxNpOf.js : 36719 | 19 |
| 228 | B-roll | key:label | index-2TDxNpOf.js : 36773 | 2 |
| 229 | Transparent | arr | index-2TDxNpOf.js : 37065 | 1 |
| 230 | Blur | arr | index-2TDxNpOf.js : 37072 | 4 |
| 231 | Replace | arr | index-2TDxNpOf.js : 37080 | 2 |
| 232 | All | key:label | index-2TDxNpOf.js : 37338 | 3 |
| 233 | Show all layouts | key:hint | index-2TDxNpOf.js : 37338 | 1 |
| 234 | Favorites | key:label | index-2TDxNpOf.js : 37341 | 3 |
| 235 | Only show favorites layouts | key:hint | index-2TDxNpOf.js : 37342 | 1 |
| 236 | Project | key:label | index-2TDxNpOf.js : 37346 | 2 |
| 237 | Only show layouts used in the current project | key:hint | index-2TDxNpOf.js : 37347 | 1 |
| 238 | Built-in | key:label | index-2TDxNpOf.js : 37349 | 2 |
| 239 | Only show built-in layouts | key:hint | index-2TDxNpOf.js : 37349 | 1 |
| 240 | Tip: Click ★ on a layout to save it to Favorites. | key:children | index-2TDxNpOf.js : 37437 | 1 |
| 241 | Select Layout | key:children | index-2TDxNpOf.js : 37617 | 1 |
| 242 | Add | key:children | index-2TDxNpOf.js : 38416 | 3 |
| 243 | Layout | key:label | index-2TDxNpOf.js : 38423 | 4 |
| 244 | Screen Zoom | key:label | index-2TDxNpOf.js : 38430 | 3 |
| 245 | Screen Blur | key:label | index-2TDxNpOf.js : 38437 | 1 |
| 246 | Highlight | key:label | index-2TDxNpOf.js : 38444 | 3 |
| 247 | Camera Zoom | key:label | index-2TDxNpOf.js : 38451 | 3 |
| 248 | Text | key:label | index-2TDxNpOf.js : 38458 | 4 |
| 249 | Overlay | key:label | index-2TDxNpOf.js : 38465 | 1 |
| 250 | Correct | key:children | index-2TDxNpOf.js : 38482 | 1 |
| 251 | Delete | key:children | index-2TDxNpOf.js : 38493 | 6 |
| 252 | DM Sans | arr | index-2TDxNpOf.js : 38553 | 2 |
| 253 | Inter | arr | index-2TDxNpOf.js : 38553 | 2 |
| 254 | Timeline | key:label | index-2TDxNpOf.js : 38929 | 1 |
| 255 | Enable snapping | key:label | index-2TDxNpOf.js : 38941 | 1 |
| 256 | Enable scrubbing | key:label | index-2TDxNpOf.js : 38960 | 1 |
| 257 | Freeze frame | key:title | index-2TDxNpOf.js : 39556 | 2 |
| 258 | Captions | key:children | index-2TDxNpOf.js : 40036 | 3 |
| 259 | Cursor | key:children | index-2TDxNpOf.js : 40050 | 3 |
| 260 | Whooosh | key:label | index-2TDxNpOf.js : 42073 | 1 |
| 261 | Whoosh | key:label | index-2TDxNpOf.js : 42074 | 1 |
| 262 | Pop | key:label | index-2TDxNpOf.js : 42075 | 1 |
| 263 | Ding | key:label | index-2TDxNpOf.js : 42076 | 1 |
| 264 | Boom | key:label | index-2TDxNpOf.js : 42077 | 1 |
| 265 | Click | key:label | index-2TDxNpOf.js : 42078 | 1 |
| 266 | Drums | key:label | index-2TDxNpOf.js : 42079 | 1 |
| 267 | Rewind | key:label | index-2TDxNpOf.js : 42080 | 1 |
| 268 | Vinyl | key:label | index-2TDxNpOf.js : 42081 | 1 |
| 269 | Link | key:label | index-2TDxNpOf.js : 42574 | 1 |
| 270 | Unlink | key:label | index-2TDxNpOf.js : 42585 | 1 |
| 271 | Split Audio/Video | key:label | index-2TDxNpOf.js : 42602 | 1 |
| 272 | Advanced | key:label | index-2TDxNpOf.js : 42613 | 2 |
| 273 | Video Type | key:label | index-2TDxNpOf.js : 42628 | 1 |
| 274 | Delete and Leave Gap | key:label | index-2TDxNpOf.js : 42680 | 1 |
| 275 | Speed | key:label | index-2TDxNpOf.js : 42708 | 3 |
| 276 | More... | key:label | index-2TDxNpOf.js : 42734 | 1 |
| 277 | Mode | key:label | index-2TDxNpOf.js : 42824 | 1 |
| 278 | Instant | arr | index-2TDxNpOf.js : 42827 | 9 |
| 279 | Fast | arr | index-2TDxNpOf.js : 42827 | 10 |
| 280 | Gradual | arr | index-2TDxNpOf.js : 42827 | 2 |
| 281 | Transition | key:label | index-2TDxNpOf.js : 42857 | 6 |
| 282 | Fade | arr | index-2TDxNpOf.js : 42967 | 4 |
| 283 | Draw | arr | index-2TDxNpOf.js : 42967 | 2 |
| 284 | Sound | key:label | index-2TDxNpOf.js : 43035 | 2 |
| 285 | Properties | key:label | index-2TDxNpOf.js : 43099 | 4 |
| 286 | Up | key:label | index-2TDxNpOf.js : 43343 | 1 |
| 287 | Right | key:label | index-2TDxNpOf.js : 43344 | 3 |
| 288 | Down | key:label | index-2TDxNpOf.js : 43345 | 1 |
| 289 | Left | key:label | index-2TDxNpOf.js : 43346 | 3 |
| 290 | Audio Type | key:label | index-2TDxNpOf.js : 43576 | 1 |
| 291 | Audio | key:label | index-2TDxNpOf.js : 43578 | 2 |
| 292 | Music | key:label | index-2TDxNpOf.js : 43581 | 3 |
| 293 | Sound Effect | key:label | index-2TDxNpOf.js : 43582 | 2 |
| 294 | Best | key:label | index-2TDxNpOf.js : 43978 | 6 |
| 295 | Balanced | key:label | index-2TDxNpOf.js : 43994 | 8 |
| 296 | Faster | key:label | index-2TDxNpOf.js : 44026 | 2 |
| 297 | Fastest | key:label | index-2TDxNpOf.js : 44042 | 3 |
| 298 | Enable alignment guides | key:label | index-2TDxNpOf.js : 44063 | 1 |
| 299 | Preview quality | key:label | index-2TDxNpOf.js : 44079 | 2 |
| 300 | Borumi automatically selects the best preview quality for your system. | arr | index-2TDxNpOf.js : 44142 | 1 |
| 301 | Effects like shadows and blurs are disabled to improve performance. | key:children | index-2TDxNpOf.js : 44148 | 1 |
| 302 | This does not affect the exported video, which is always exported in maximum quality with all effects enabled. | key:children | index-2TDxNpOf.js : 44156 | 1 |
| 303 | You can change it in the Settings → Editing → Playback quality. | key:children | index-2TDxNpOf.js : 44160 | 1 |
| 304 | Bebas Neue | arr | index-2TDxNpOf.js : 47611 | 1 |
| 305 | DM Serif Display | arr | index-2TDxNpOf.js : 47611 | 1 |
| 306 | Poppins | arr | index-2TDxNpOf.js : 47611 | 1 |
| 307 | Search fonts | key:placeholder | index-2TDxNpOf.js : 47715 | 1 |
| 308 | Clear search | key:aria-label | index-2TDxNpOf.js : 47730 | 2 |
| 309 | Loading fonts... | key:children | index-2TDxNpOf.js : 47748 | 1 |
| 310 | Unable to load fonts | key:children | index-2TDxNpOf.js : 47757 | 1 |
| 311 | No fonts found | key:children | index-2TDxNpOf.js : 47786 | 1 |
| 312 | Top Picks | key:label | index-2TDxNpOf.js : 47793 | 1 |
| 313 | All Fonts | key:label | index-2TDxNpOf.js : 47811 | 1 |
| 314 | Arrow | key:label | index-2TDxNpOf.js : 48294 | 3 |
| 315 | Rectangle | key:label | index-2TDxNpOf.js : 48295 | 2 |
| 316 | Ellipse | key:label | index-2TDxNpOf.js : 48296 | 2 |
| 317 | Add annotation | key:aria-label | index-2TDxNpOf.js : 48317 | 2 |
| 318 | Pixelated | arr | index-2TDxNpOf.js : 48374 | 1 |
| 319 | Grainy | arr | index-2TDxNpOf.js : 48374 | 1 |
| 320 | Black | arr | index-2TDxNpOf.js : 48374 | 1 |
| 321 | Center | arr | index-2TDxNpOf.js : 48512 | 2 |
| 322 | Straight | key:label | index-2TDxNpOf.js : 48579 | 3 |
| 323 | Tapered | key:label | index-2TDxNpOf.js : 48580 | 2 |
| 324 | Curved | key:label | index-2TDxNpOf.js : 48581 | 2 |
| 325 | Arrow type | key:aria-label | index-2TDxNpOf.js : 48681 | 2 |
| 326 | Open edit panel | key:aria-label | index-2TDxNpOf.js : 49056 | 1 |
| 327 | Go to time | key:aria-label | index-2TDxNpOf.js : 51712 | 3 |
| 328 | Enter seconds, mm:ss, or hh:mm:ss. | key:title | index-2TDxNpOf.js : 51733 | 1 |
| 329 | Zoom out | key:children | index-2TDxNpOf.js : 51872 | 1 |
| 330 | Zoom | key:children | index-2TDxNpOf.js : 51889 | 2 |
| 331 | Zoom in | key:children | index-2TDxNpOf.js : 51903 | 1 |
| 332 | Selection | key:label | index-2TDxNpOf.js : 51931 | 1 |
| 333 | Blade | key:label | index-2TDxNpOf.js : 51937 | 1 |
| 334 | Loading... | key:children | index-2TDxNpOf.js : 52256 | 1 |
| 335 | Face centering | key:title | index-2TDxNpOf.js : 52952 | 1 |
| 336 | Same as clip | key:children | index-2TDxNpOf.js : 52966 | 1 |
| 337 | Disabled | key:children | index-2TDxNpOf.js : 52967 | 4 |
| 338 | Enabled | key:children | index-2TDxNpOf.js : 52968 | 1 |
| 339 | Overflow | key:title | index-2TDxNpOf.js : 52998 | 1 |
| 340 | Allow the content to overflow the bounds when zoomed in | key:hint | index-2TDxNpOf.js : 52999 | 1 |
| 341 | Remove background | key:title | index-2TDxNpOf.js : 53037 | 1 |
| 342 | Quality | key:title | index-2TDxNpOf.js : 53050 | 4 |
| 343 | Higher quality preserves finer edge details, but takes longer to process. | key:hint | index-2TDxNpOf.js : 53051 | 2 |
| 344 | Very High | key:children | index-2TDxNpOf.js : 53069 | 3 |
| 345 | Shape | key:title | index-2TDxNpOf.js : 53076 | 2 |
| 346 | Adjust softness and edge shift to blend the cutout with the background. | key:hint | index-2TDxNpOf.js : 53077 | 1 |
| 347 | Softness | key:tooltip | index-2TDxNpOf.js : 53083 | 2 |
| 348 | Edge shift | key:tooltip | index-2TDxNpOf.js : 53094 | 2 |
| 349 | Shadow color | key:tooltip | index-2TDxNpOf.js : 53196 | 2 |
| 350 | X offset | key:tooltip | index-2TDxNpOf.js : 53234 | 1 |
| 351 | Y offset | key:tooltip | index-2TDxNpOf.js : 53248 | 1 |
| 352 | Shadow & Glow | key:title | index-2TDxNpOf.js : 53368 | 4 |
| 353 | Size & Position | key:title | index-2TDxNpOf.js : 53583 | 3 |
| 354 | X position | key:tooltip | index-2TDxNpOf.js : 53597 | 3 |
| 355 | Y position | key:tooltip | index-2TDxNpOf.js : 53614 | 3 |
| 356 | Width | key:tooltip | index-2TDxNpOf.js : 53639 | 8 |
| 357 | Height | key:tooltip | index-2TDxNpOf.js : 53656 | 5 |
| 358 | Lock aspect ratio | key:tooltip | index-2TDxNpOf.js : 53673 | 2 |
| 359 | Border radius | key:tooltip | index-2TDxNpOf.js : 53694 | 4 |
| 360 | Make corners smoother | key:tooltip | index-2TDxNpOf.js : 53710 | 1 |
| 361 | Stroke | key:title | index-2TDxNpOf.js : 53746 | 4 |
| 362 | Stroke color | key:tooltip | index-2TDxNpOf.js : 53761 | 4 |
| 363 | Mixed | key:children | index-2TDxNpOf.js : 53969 | 4 |
| 364 | Sound volume | key:tooltip | index-2TDxNpOf.js : 54144 | 1 |
| 365 | Choose a sound to play when this layout transition starts. | key:hint | index-2TDxNpOf.js : 54206 | 1 |
| 366 | Smooth | key:label | index-2TDxNpOf.js : 54215 | 2 |
| 367 | Transition & sound | key:title | index-2TDxNpOf.js : 54249 | 3 |
| 368 | Motion | key:title | index-2TDxNpOf.js : 54253 | 1 |
| 369 | Choose how layers move into this layout. | key:hint | index-2TDxNpOf.js : 54254 | 1 |
| 370 | Select a clip to edit its properties. | key:description | index-2TDxNpOf.js : 54379 | 1 |
| 371 | Control how close the screen appears | key:hint | index-2TDxNpOf.js : 54540 | 1 |
| 372 | Zoom focus | key:title | index-2TDxNpOf.js : 54600 | 2 |
| 373 | Control the area of the screen being focused | key:hint | index-2TDxNpOf.js : 54601 | 1 |
| 374 | Manual | key:label | index-2TDxNpOf.js : 54609 | 3 |
| 375 | Drag circle to select focus point | key:children | index-2TDxNpOf.js : 54708 | 2 |
| 376 | No screen zoom is currently selected. | key:description | index-2TDxNpOf.js : 54752 | 1 |
| 377 | Add screen zoom | key:children | index-2TDxNpOf.js : 54777 | 1 |
| 378 | Generate automatically | key:children | index-2TDxNpOf.js : 54791 | 1 |
| 379 | Create screen zooms automatically based on your cursor movements. | key:description | index-2TDxNpOf.js : 54796 | 1 |
| 380 | Enter sound | key:title | index-2TDxNpOf.js : 54831 | 2 |
| 381 | Choose the sound that plays when this screen zoom begins. | key:hint | index-2TDxNpOf.js : 54832 | 1 |
| 382 | Exit sound | key:title | index-2TDxNpOf.js : 54846 | 2 |
| 383 | Choose the sound that plays when this screen zoom ends. | key:hint | index-2TDxNpOf.js : 54847 | 1 |
| 384 | Control how close the camera appears | key:hint | index-2TDxNpOf.js : 54940 | 1 |
| 385 | Control where the camera frame is focused | key:hint | index-2TDxNpOf.js : 54991 | 1 |
| 386 | Face | key:label | index-2TDxNpOf.js : 54998 | 1 |
| 387 | Enter mode | key:title | index-2TDxNpOf.js : 55161 | 1 |
| 388 | Choose the transition style used as the camera zoom begins. | key:hint | index-2TDxNpOf.js : 55162 | 1 |
| 389 | Exit mode | key:title | index-2TDxNpOf.js : 55206 | 1 |
| 390 | Choose the transition style used as the camera zoom ends. | key:hint | index-2TDxNpOf.js : 55207 | 1 |
| 391 | No camera zoom is currently selected. | key:description | index-2TDxNpOf.js : 55229 | 1 |
| 392 | Add camera zoom | key:children | index-2TDxNpOf.js : 55254 | 1 |
| 393 | Choose the sound that plays when this camera zoom begins. | key:hint | index-2TDxNpOf.js : 55292 | 1 |
| 394 | Choose the sound that plays when this camera zoom ends. | key:hint | index-2TDxNpOf.js : 55308 | 1 |
| 395 | Wallpaper | key:label | index-2TDxNpOf.js : 55456 | 1 |
| 396 | Gradient | key:label | index-2TDxNpOf.js : 55457 | 1 |
| 397 | Color | key:label | index-2TDxNpOf.js : 55458 | 7 |
| 398 | Image | key:label | index-2TDxNpOf.js : 55459 | 2 |
| 399 | Show less | key:children | index-2TDxNpOf.js : 55717 | 2 |
| 400 | Show more | key:children | index-2TDxNpOf.js : 55725 | 2 |
| 401 | Wallpapers by | arr | index-2TDxNpOf.js : 55732 | 1 |
| 402 | Black Pixel Studio | key:children | index-2TDxNpOf.js : 55744 | 1 |
| 403 | Click to change, or drop an image. | key:children | index-2TDxNpOf.js : 55876 | 1 |
| 404 | Click to select, or drop an image. | key:children | index-2TDxNpOf.js : 55900 | 1 |
| 405 | Background | key:title | index-2TDxNpOf.js : 55936 | 3 |
| 406 | Landscape | key:label | index-2TDxNpOf.js : 55947 | 1 |
| 407 | Vertical | key:label | index-2TDxNpOf.js : 55956 | 1 |
| 408 | Square | key:label | index-2TDxNpOf.js : 55969 | 1 |
| 409 | Portrait | key:label | index-2TDxNpOf.js : 55982 | 1 |
| 410 | Photo | key:label | index-2TDxNpOf.js : 55995 | 1 |
| 411 | Fit screen | key:label | index-2TDxNpOf.js : 56008 | 1 |
| 412 | Custom | key:label | index-2TDxNpOf.js : 56014 | 3 |
| 413 | Video Format | key:title | index-2TDxNpOf.js : 56145 | 1 |
| 414 | The project contains multiple screen sizes, which might result in lower quality and increased panning when "Fit Screen" is enabled. | key:message | index-2TDxNpOf.js : 56183 | 1 |
| 415 | Volume | key:title | index-2TDxNpOf.js : 56451 | 4 |
| 416 | Control how loud the selected clip will be | key:hint | index-2TDxNpOf.js : 56454 | 1 |
| 417 | We don't recommend increasing the volume when Enhance Voice is enabled, as it might cause distortion. | key:message | index-2TDxNpOf.js : 56471 | 1 |
| 418 | Control how loud the selected sound effect will be | key:hint | index-2TDxNpOf.js : 56512 | 1 |
| 419 | Remove Noise | key:title | index-2TDxNpOf.js : 56622 | 1 |
| 420 | Reduce the amount of noise in the selected clip | key:hint | index-2TDxNpOf.js : 56624 | 1 |
| 421 | Off | key:children | index-2TDxNpOf.js : 56651 | 1 |
| 422 | Max | key:children | index-2TDxNpOf.js : 56655 | 1 |
| 423 | Enhance Voice | key:title | index-2TDxNpOf.js : 56767 | 1 |
| 424 | Improve the quality of voice recordings automatically. | key:hint | index-2TDxNpOf.js : 56768 | 1 |
| 425 | Keep the original voice audio unchanged. | key:children | index-2TDxNpOf.js : 56803 | 1 |
| 426 | Minimal | key:children | index-2TDxNpOf.js : 56816 | 2 |
| 427 | Apply automatic level balancing and normalization. | key:children | index-2TDxNpOf.js : 56821 | 1 |
| 428 | Extended | key:children | index-2TDxNpOf.js : 56834 | 2 |
| 429 | Add level balancing, normalization, EQ, and noise reduction. | key:children | index-2TDxNpOf.js : 56839 | 1 |
| 430 | Adjust how fast the selected clip plays back | key:hint | index-2TDxNpOf.js : 56903 | 1 |
| 431 | Reset | key:children | index-2TDxNpOf.js : 56915 | 12 |
| 432 | Crop | key:title | index-2TDxNpOf.js : 56983 | 1 |
| 433 | Crop the video to show only a specific portion. | key:hint | index-2TDxNpOf.js : 56984 | 1 |
| 434 | Mirror | key:title | index-2TDxNpOf.js : 57049 | 1 |
| 435 | Flip the camera horizontally. | key:hint | index-2TDxNpOf.js : 57050 | 1 |
| 436 | Face Centering | key:title | index-2TDxNpOf.js : 57099 | 1 |
| 437 | Automatically keeps the face centered in the canvas. | key:hint | index-2TDxNpOf.js : 57100 | 1 |
| 438 | Remove | key:label | index-2TDxNpOf.js : 57143 | 1 |
| 439 | Blur amount | key:title | index-2TDxNpOf.js : 57305 | 1 |
| 440 | Controls how much the camera background is blurred. | key:hint | index-2TDxNpOf.js : 57307 | 1 |
| 441 | Coming soon | key:children | index-2TDxNpOf.js : 57351 | 1 |
| 442 | Processing | key:children | index-2TDxNpOf.js : 57557 | 1 |
| 443 | Background effects | key:title | index-2TDxNpOf.js : 57711 | 1 |
| 444 | Drop to use as background | key:children | index-2TDxNpOf.js : 57852 | 1 |
| 445 | Saturation | key:label | index-2TDxNpOf.js : 57940 | 1 |
| 446 | Temperature | key:label | index-2TDxNpOf.js : 57947 | 1 |
| 447 | Tint | key:label | index-2TDxNpOf.js : 57954 | 1 |
| 448 | Exposure | key:label | index-2TDxNpOf.js : 57961 | 1 |
| 449 | Contrast | key:label | index-2TDxNpOf.js : 57966 | 1 |
| 450 | Highlights | key:label | index-2TDxNpOf.js : 57969 | 1 |
| 451 | Shadows | key:label | index-2TDxNpOf.js : 57976 | 1 |
| 452 | Intensity | key:title | index-2TDxNpOf.js : 58003 | 1 |
| 453 | Drop to import LUT | key:children | index-2TDxNpOf.js : 58169 | 1 |
| 454 | Loading | key:name | index-2TDxNpOf.js : 58201 | 1 |
| 455 | Add LUT | key:children | index-2TDxNpOf.js : 58224 | 1 |
| 456 | Color adjustments | key:title | index-2TDxNpOf.js : 58475 | 1 |
| 457 | Adjust the color of camera clips. | key:hint | index-2TDxNpOf.js : 58476 | 1 |
| 458 | Crossfade | key:label | index-2TDxNpOf.js : 58550 | 1 |
| 459 | Slide Up | key:label | index-2TDxNpOf.js : 58554 | 2 |
| 460 | Slide Right | key:label | index-2TDxNpOf.js : 58559 | 2 |
| 461 | Slide Down | key:label | index-2TDxNpOf.js : 58564 | 2 |
| 462 | Slide Left | key:label | index-2TDxNpOf.js : 58569 | 2 |
| 463 | Choose how this clip appears when it becomes visible. | key:hint | index-2TDxNpOf.js : 58593 | 1 |
| 464 | Apply to all  | arr | index-2TDxNpOf.js : 58824 | 1 |
| 465 | Apply | key:children | index-2TDxNpOf.js : 58833 | 2 |
| 466 | Select a clip in the timeline to edit its properties. | key:description | index-2TDxNpOf.js : 58954 | 1 |
| 467 | Video | key:title | index-2TDxNpOf.js : 59059 | 1 |
| 468 | White | key:label | index-2TDxNpOf.js : 59313 | 1 |
| 469 | Yellow | key:label | index-2TDxNpOf.js : 59323 | 1 |
| 470 | Mac | key:label | index-2TDxNpOf.js : 59336 | 1 |
| 471 | Windows | key:label | index-2TDxNpOf.js : 59342 | 1 |
| 472 | Pointer | key:label | index-2TDxNpOf.js : 59346 | 2 |
| 473 | Mac Legacy | key:label | index-2TDxNpOf.js : 59350 | 1 |
| 474 | Windows Vintage | key:label | index-2TDxNpOf.js : 59356 | 1 |
| 475 | Stick hand | key:label | index-2TDxNpOf.js : 59363 | 1 |
| 476 | Man | key:label | index-2TDxNpOf.js : 59369 | 3 |
| 477 | Woman | key:label | index-2TDxNpOf.js : 59375 | 3 |
| 478 | Cat | key:label | index-2TDxNpOf.js : 59405 | 1 |
| 479 | Dog | key:label | index-2TDxNpOf.js : 59411 | 1 |
| 480 | Cartoon | key:label | index-2TDxNpOf.js : 59417 | 1 |
| 481 | Puppet | key:label | index-2TDxNpOf.js : 59423 | 1 |
| 482 | Robot | key:label | index-2TDxNpOf.js : 59429 | 1 |
| 483 | Presentation pointer | key:label | index-2TDxNpOf.js : 59435 | 1 |
| 484 | Wooden mannequin | key:label | index-2TDxNpOf.js : 59441 | 1 |
| 485 | Bodybuilder | key:label | index-2TDxNpOf.js : 59447 | 3 |
| 486 | Santa | key:label | index-2TDxNpOf.js : 59465 | 1 |
| 487 | Skeleton | key:label | index-2TDxNpOf.js : 59471 | 1 |
| 488 | Black stick hand | key:label | index-2TDxNpOf.js : 59477 | 1 |
| 489 | Paintbrush | key:label | index-2TDxNpOf.js : 59483 | 1 |
| 490 | Pencil | key:label | index-2TDxNpOf.js : 59489 | 1 |
| 491 | Conductor baton | key:label | index-2TDxNpOf.js : 59495 | 1 |
| 492 | Drumstick | key:label | index-2TDxNpOf.js : 59501 | 1 |
| 493 | Pool cue | key:label | index-2TDxNpOf.js : 59507 | 1 |
| 494 | Candy | key:label | index-2TDxNpOf.js : 59519 | 1 |
| 495 | Matchstick | key:label | index-2TDxNpOf.js : 59525 | 1 |
| 496 | Laser | key:label | index-2TDxNpOf.js : 59531 | 1 |
| 497 | Magic wand | key:label | index-2TDxNpOf.js : 59537 | 2 |
| 498 | Crystal staff | key:label | index-2TDxNpOf.js : 59549 | 1 |
| 499 | Cursor style | key:title | index-2TDxNpOf.js : 59608 | 1 |
| 500 | Cursor Size | key:title | index-2TDxNpOf.js : 59744 | 1 |
| 501 | Controls how large the cursor renders in your video. | key:hint | index-2TDxNpOf.js : 59747 | 1 |
| 502 | Hide camera on overlap | key:title | index-2TDxNpOf.js : 59779 | 1 |
| 503 | Hides the camera when the cursor overlaps it. | key:hint | index-2TDxNpOf.js : 59780 | 1 |
| 504 | Hide cursor when still | key:title | index-2TDxNpOf.js : 59791 | 1 |
| 505 | Automatically hides the cursor after a short period of inactivity. | key:hint | index-2TDxNpOf.js : 59792 | 1 |
| 506 | Choose the most appropriate tracking speed depending on the video format. | key:tooltip | index-2TDxNpOf.js : 59802 | 1 |
| 507 | Steady | key:label | index-2TDxNpOf.js : 59806 | 1 |
| 508 | Minimizes screen movements to optimize legibility. | key:tooltip | index-2TDxNpOf.js : 59808 | 1 |
| 509 | Make the screen movements more dynamic, while keeping text legible. | key:tooltip | index-2TDxNpOf.js : 59815 | 1 |
| 510 | Snappy | key:label | index-2TDxNpOf.js : 59819 | 1 |
| 511 | Maximizes screen movement to closely follow the cursor. | key:tooltip | index-2TDxNpOf.js : 59821 | 1 |
| 512 | Cursor tracking | key:title | index-2TDxNpOf.js : 59859 | 1 |
| 513 | Adjusts how much the screen moves to keep the cursor in view. | key:hint | index-2TDxNpOf.js : 59860 | 1 |
| 514 | Click 1 | key:label | index-2TDxNpOf.js : 59971 | 1 |
| 515 | Click 2 | key:label | index-2TDxNpOf.js : 59972 | 1 |
| 516 | Click Sound | key:title | index-2TDxNpOf.js : 60007 | 1 |
| 517 | Click sound volume | key:tooltip | index-2TDxNpOf.js : 60024 | 1 |
| 518 | Circle | key:label | index-2TDxNpOf.js : 60048 | 1 |
| 519 | Ring | key:label | index-2TDxNpOf.js : 60049 | 1 |
| 520 | Click Effect | key:title | index-2TDxNpOf.js : 60080 | 1 |
| 521 | Click effect color | key:tooltip | index-2TDxNpOf.js : 60101 | 1 |
| 522 | Radius | key:title | index-2TDxNpOf.js : 60116 | 1 |
| 523 | Click effect radius | key:tooltip | index-2TDxNpOf.js : 60120 | 1 |
| 524 | Cursor Highlight | key:title | index-2TDxNpOf.js : 60157 | 1 |
| 525 | Highlight color | key:tooltip | index-2TDxNpOf.js : 60166 | 1 |
| 526 | Highlight radius | key:tooltip | index-2TDxNpOf.js : 60182 | 1 |
| 527 | Center color | key:tooltip | index-2TDxNpOf.js : 60205 | 1 |
| 528 | Border color | key:tooltip | index-2TDxNpOf.js : 60216 | 1 |
| 529 | Border width | key:tooltip | index-2TDxNpOf.js : 60227 | 1 |
| 530 | Select a cursor style to show the cursor and change visual options. | key:description | index-2TDxNpOf.js : 60328 | 1 |
| 531 | Helvetica | arr | index-2TDxNpOf.js : 60372 | 1 |
| 532 | Arial | arr | index-2TDxNpOf.js : 60372 | 1 |
| 533 | No Captions | key:children | index-2TDxNpOf.js : 60476 | 1 |
| 534 | Show all captions | key:hint | index-2TDxNpOf.js : 60619 | 1 |
| 535 | Only show favorite captions | key:hint | index-2TDxNpOf.js : 60623 | 1 |
| 536 | Only show built-in captions | key:hint | index-2TDxNpOf.js : 60625 | 1 |
| 537 | Tip: Click ★ on a captions style to save it to Favorites. | key:children | index-2TDxNpOf.js : 60731 | 1 |
| 538 | Accent | key:title | index-2TDxNpOf.js : 61006 | 1 |
| 539 | Future | key:title | index-2TDxNpOf.js : 61016 | 1 |
| 540 | Typography | key:title | index-2TDxNpOf.js : 61044 | 2 |
| 541 | Text color | key:title | index-2TDxNpOf.js : 61069 | 2 |
| 542 | Text size | key:title | index-2TDxNpOf.js : 61083 | 2 |
| 543 | Text casing | key:title | index-2TDxNpOf.js : 61096 | 2 |
| 544 | Paragraph mode | key:title | index-2TDxNpOf.js : 61106 | 1 |
| 545 | Outline | key:title | index-2TDxNpOf.js : 61252 | 1 |
| 546 | Bold | key:label | index-2TDxNpOf.js : 61332 | 2 |
| 547 | Italic | key:label | index-2TDxNpOf.js : 61339 | 2 |
| 548 | Original | key:label | index-2TDxNpOf.js : 61369 | 3 |
| 549 | Uppercase | key:label | index-2TDxNpOf.js : 61370 | 2 |
| 550 | Fill | key:label | index-2TDxNpOf.js : 61388 | 2 |
| 551 | Single word | key:label | index-2TDxNpOf.js : 61389 | 1 |
| 552 | Drop to import your music | key:children | index-2TDxNpOf.js : 61879 | 1 |
| 553 | Show all music tracks | key:hint | index-2TDxNpOf.js : 61885 | 1 |
| 554 | Only show favorite tracks | key:hint | index-2TDxNpOf.js : 61886 | 1 |
| 555 | Only show tracks used in this project | key:hint | index-2TDxNpOf.js : 61890 | 1 |
| 556 | No music | key:label | index-2TDxNpOf.js : 62165 | 1 |
| 557 | Click to select, or drop a song. | key:children | index-2TDxNpOf.js : 62223 | 1 |
| 558 | Tip: Click ★ on a music track to save it to Favorites. | key:children | index-2TDxNpOf.js : 62232 | 1 |
| 559 | Unable to load music tracks. | key:description | index-2TDxNpOf.js : 62237 | 1 |
| 560 | Control how loud the selected music clip will be | key:hint | index-2TDxNpOf.js : 62256 | 1 |
| 561 | Loop | key:title | index-2TDxNpOf.js : 62271 | 1 |
| 562 | When enabled, the music restarts from the beginning each time it reaches the end. | key:hint | index-2TDxNpOf.js : 62272 | 1 |
| 563 | Fade In | key:title | index-2TDxNpOf.js : 62279 | 1 |
| 564 | Start the selected track quietly and ramp it up smoothly at the beginning. | key:hint | index-2TDxNpOf.js : 62280 | 1 |
| 565 | Fade Out | key:title | index-2TDxNpOf.js : 62287 | 1 |
| 566 | Smoothly lower the selected track at the end instead of cutting it abruptly. | key:hint | index-2TDxNpOf.js : 62288 | 1 |
| 567 | Font size | key:tooltip | index-2TDxNpOf.js : 62637 | 1 |
| 568 | Line height | key:tooltip | index-2TDxNpOf.js : 62676 | 2 |
| 569 | Lowercase | key:label | index-2TDxNpOf.js : 62698 | 1 |
| 570 | Align left | key:label | index-2TDxNpOf.js : 62719 | 1 |
| 571 | Align center | key:label | index-2TDxNpOf.js : 62720 | 1 |
| 572 | Align right | key:label | index-2TDxNpOf.js : 62721 | 1 |
| 573 | Wrap text | key:label | index-2TDxNpOf.js : 62751 | 1 |
| 574 | Stroke width | key:tooltip | index-2TDxNpOf.js : 62898 | 2 |
| 575 | Background color | key:title | index-2TDxNpOf.js : 62933 | 2 |
| 576 | Stroke Width | key:title | index-2TDxNpOf.js : 63037 | 1 |
| 577 | Width of the text outline. | key:hint | index-2TDxNpOf.js : 63039 | 1 |
| 578 | Sizing | key:title | index-2TDxNpOf.js : 63172 | 1 |
| 579 | Packed | key:label | index-2TDxNpOf.js : 63185 | 1 |
| 580 | Paragraph | key:label | index-2TDxNpOf.js : 63189 | 1 |
| 581 | Colors | key:title | index-2TDxNpOf.js : 63264 | 1 |
| 582 | Content | key:title | index-2TDxNpOf.js : 63455 | 1 |
| 583 | Select a single text element to edit its content. | key:description | index-2TDxNpOf.js : 63490 | 1 |
| 584 | Auto width | key:label | index-2TDxNpOf.js : 64132 | 1 |
| 585 | Fixed size | key:label | index-2TDxNpOf.js : 64137 | 1 |
| 586 | Make the selected element visible in the preview to edit size and position. | key:description | index-2TDxNpOf.js : 64150 | 1 |
| 587 | Alignment | key:title | index-2TDxNpOf.js : 64282 | 1 |
| 588 | Behind subject | key:title | index-2TDxNpOf.js : 64331 | 2 |
| 589 | Place this element behind the subject in your camera clips. | key:hint | index-2TDxNpOf.js : 64333 | 1 |
| 590 | Enter | key:title | index-2TDxNpOf.js : 64446 | 5 |
| 591 | Choose how this element appears. | key:hint | index-2TDxNpOf.js : 64447 | 1 |
| 592 | Exit | key:title | index-2TDxNpOf.js : 64461 | 2 |
| 593 | Choose how this element disappears. | key:hint | index-2TDxNpOf.js : 64462 | 1 |
| 594 | Curved arrow | key:label | index-2TDxNpOf.js : 64676 | 1 |
| 595 | Annotations | key:title | index-2TDxNpOf.js : 64702 | 1 |
| 596 | Add text to the canvas | key:hint | index-2TDxNpOf.js : 64761 | 1 |
| 597 | Overlays | key:title | index-2TDxNpOf.js : 64766 | 1 |
| 598 | Add image, video or animated GIFs to your canvas | key:hint | index-2TDxNpOf.js : 64768 | 1 |
| 599 | All elements | key:children | index-2TDxNpOf.js : 64856 | 1 |
| 600 | Search elements… | key:placeholder | index-2TDxNpOf.js : 64875 | 1 |
| 601 | Search elements | key:aria-label | index-2TDxNpOf.js : 64876 | 1 |
| 602 | No matching elements. Try another search. | key:children | index-2TDxNpOf.js : 64925 | 1 |
| 603 | Show all | arr | index-2TDxNpOf.js : 65002 | 1 |
| 604 | Add image, video, or animated GIFs to your canvas | key:title | index-2TDxNpOf.js : 65047 | 1 |
| 605 | New overlay | key:children | index-2TDxNpOf.js : 65067 | 1 |
| 606 | Rotation in degrees | key:tooltip | index-2TDxNpOf.js : 65650 | 1 |
| 607 | Fill color | key:tooltip | index-2TDxNpOf.js : 65741 | 1 |
| 608 | Choose how this annotation appears. | key:hint | index-2TDxNpOf.js : 65780 | 1 |
| 609 | Choose how this annotation disappears. | key:hint | index-2TDxNpOf.js : 65802 | 1 |
| 610 | Anchor | key:title | index-2TDxNpOf.js : 65830 | 1 |
| 611 | Choose which content this annotation follows. | key:hint | index-2TDxNpOf.js : 65831 | 1 |
| 612 | Canvas | key:label | index-2TDxNpOf.js : 65836 | 2 |
| 613 | Choose the arrow shape. | key:hint | index-2TDxNpOf.js : 65863 | 1 |
| 614 | Add a scene to start creating elements. | key:description | index-2TDxNpOf.js : 66354 | 1 |
| 615 | Run | key:label | index-2TDxNpOf.js : 66475 | 2 |
| 616 | Run with params... | key:label | index-2TDxNpOf.js : 66495 | 1 |
| 617 | No automations are available. | key:description | index-2TDxNpOf.js : 66531 | 1 |
| 618 | Automations | key:title | index-2TDxNpOf.js : 66535 | 1 |
| 619 | Do you have an idea for an automation? | arr | index-2TDxNpOf.js : 66543 | 1 |
| 620 | Let us know. | key:children | index-2TDxNpOf.js : 66550 | 1 |
| 621 | Clip | key:label | index-2TDxNpOf.js : 66575 | 1 |
| 622 | Elements | key:label | index-2TDxNpOf.js : 66589 | 1 |
| 623 | Automate | key:label | index-2TDxNpOf.js : 66599 | 1 |
| 624 |  Panel not registered  | key:children | index-2TDxNpOf.js : 66606 | 1 |
| 625 | Not transcribed yet. | arr | index-2TDxNpOf.js : 67301 | 1 |
| 626 | Transcribe | key:children | index-2TDxNpOf.js : 67305 | 2 |
| 627 | This scene has no transcript | key:children | index-2TDxNpOf.js : 67309 | 1 |
| 628 | Failed to transcribe. | arr | index-2TDxNpOf.js : 67316 | 1 |
| 629 | Transcription cancelled. | arr | index-2TDxNpOf.js : 67329 | 1 |
| 630 | Transcribing - | arr | index-2TDxNpOf.js : 67345 | 1 |
| 631 | Cancel | key:children | index-2TDxNpOf.js : 67349 | 11 |
| 632 | Want to edit via transcript? | key:children | index-2TDxNpOf.js : 67767 | 1 |
| 633 | First, we need to transcribe the video. On older hardware, transcription may run for a while and use extra CPU. | key:children | index-2TDxNpOf.js : 67772 | 1 |
| 634 | Maybe later | key:children | index-2TDxNpOf.js : 67784 | 1 |
| 635 | Project not found | key:children | index-2TDxNpOf.js : 69262 | 2 |
| 636 |  tracks successfully recovered | arr | index-2TDxNpOf.js : 69320 | 1 |
| 637 |  tracks recovery failed | arr | index-2TDxNpOf.js : 69331 | 1 |
| 638 |  tracks successfully recovered, | arr | index-2TDxNpOf.js : 69345 | 1 |
| 639 |  failures | arr | index-2TDxNpOf.js : 69348 | 1 |
| 640 | Recovering  | arr | index-2TDxNpOf.js : 69360 | 1 |
| 641 |  tracks... ( | arr | index-2TDxNpOf.js : 69362 | 1 |
| 642 | The process continues in the background, so you can also close this dialog | key:children | index-2TDxNpOf.js : 69370 | 1 |
| 643 | Ouch! The recording crashed | key:children | index-2TDxNpOf.js : 69383 | 1 |
| 644 | Borumi experienced an unexpected error and had to stop the recording. | key:children | index-2TDxNpOf.js : 69388 | 1 |
| 645 | An automatic recovery process has been started to recover as much of it as possible, no action required from your side. | key:children | index-2TDxNpOf.js : 69393 | 1 |
| 646 | Please let us know if the problem persists, or if you need any assistance. | key:children | index-2TDxNpOf.js : 69398 | 1 |
| 647 | Export Recordings | key:children | index-2TDxNpOf.js : 69466 | 1 |
| 648 | Merge audio and video | key:children | index-2TDxNpOf.js : 69479 | 1 |
| 649 | If checked, the first audio track will be merged with the first video track rather than being separate files. | key:children | index-2TDxNpOf.js : 69485 | 1 |
| 650 | Export recordings | key:children | index-2TDxNpOf.js : 69510 | 1 |
| 651 | Plain | key:label | index-2TDxNpOf.js : 69516 | 1 |
| 652 | Structured | key:label | index-2TDxNpOf.js : 69517 | 1 |
| 653 | SRT | key:label | index-2TDxNpOf.js : 69518 | 1 |
| 654 | Unable to load transcript preview. | key:children | index-2TDxNpOf.js : 69587 | 1 |
| 655 | No transcript is available for this project yet. | key:children | index-2TDxNpOf.js : 69601 | 1 |
| 656 | Copy to clipboard | key:children | index-2TDxNpOf.js : 69620 | 1 |
| 657 | Full video | key:label | index-2TDxNpOf.js : 69807 | 1 |
| 658 | Scene | key:label | index-2TDxNpOf.js : 69808 | 1 |
| 659 | Range | key:title | index-2TDxNpOf.js : 69824 | 1 |
| 660 | Choose whether to export the full video, one scene, or a custom time range. | key:tooltip | index-2TDxNpOf.js : 69826 | 1 |
| 661 | Select a scene | key:placeholder | index-2TDxNpOf.js : 69847 | 1 |
| 662 | px ×  | arr | index-2TDxNpOf.js : 69988 | 1 |
| 663 | Frame rate | key:title | index-2TDxNpOf.js : 69994 | 1 |
| 664 | Higher frame rates make motion smoother but increase file size and export time. | key:tooltip | index-2TDxNpOf.js : 69996 | 1 |
| 665 | Bitrate | key:title | index-2TDxNpOf.js : 70008 | 1 |
| 666 | Higher bitrates improve video quality but also increase file size. | key:tooltip | index-2TDxNpOf.js : 70010 | 1 |
| 667 | Reduced | key:label | index-2TDxNpOf.js : 70098 | 1 |
| 668 | Custom settings | key:children | index-2TDxNpOf.js : 70415 | 1 |
| 669 | Basic presets | key:children | index-2TDxNpOf.js : 70472 | 1 |
| 670 | Cropping is only available for video clips. | key:children | index-2TDxNpOf.js : 70743 | 1 |
| 671 | Confirm crop | key:children | index-2TDxNpOf.js : 70753 | 1 |
| 672 | Ratio | key:children | index-2TDxNpOf.js : 71003 | 1 |
| 673 | Custom Canvas Size | key:children | index-2TDxNpOf.js : 71686 | 1 |
| 674 | Backspace | arr | index-2TDxNpOf.js : 71834 | 3 |
| 675 | ArrowLeft | arr | index-2TDxNpOf.js : 71836 | 3 |
| 676 | ArrowRight | arr | index-2TDxNpOf.js : 71837 | 3 |
| 677 | Home | arr | index-2TDxNpOf.js : 71838 | 3 |
| 678 | Tab | arr | index-2TDxNpOf.js : 71840 | 3 |
| 679 | Escape | arr | index-2TDxNpOf.js : 71842 | 3 |
| 680 | Adjust Sync | key:children | index-2TDxNpOf.js : 71941 | 1 |
| 681 |  You can also adjust sync in the Camera and Microphone settings before recording. | arr | index-2TDxNpOf.js : 72045 | 1 |
| 682 | Confirm | key:children | index-2TDxNpOf.js : 72059 | 3 |
| 683 | Custom Sync | key:children | index-2TDxNpOf.js : 72244 | 1 |
| 684 | Automation Unavailable | key:children | index-2TDxNpOf.js : 72417 | 1 |
| 685 | This automation could not be found. | key:children | index-2TDxNpOf.js : 72421 | 1 |
| 686 | Run Automation | key:children | index-2TDxNpOf.js : 72471 | 1 |
| 687 | Recovering... | key:children | index-2TDxNpOf.js : 72894 | 1 |
| 688 | Media error | key:children | index-2TDxNpOf.js : 72905 | 1 |
| 689 | Code:  | arr | index-2TDxNpOf.js : 72908 | 1 |
| 690 | Cursor is hidden during preview. You'll see it again in the Edit tool. | key:children | index-2TDxNpOf.js : 72972 | 1 |
| 691 | Dismiss cursor hidden tip | key:aria-label | index-2TDxNpOf.js : 72978 | 1 |
| 692 | Seek backward 5 seconds | key:label | index-2TDxNpOf.js : 73148 | 2 |
| 693 | Seek forward 5 seconds | key:label | index-2TDxNpOf.js : 73169 | 2 |
| 694 | Adjust Sync... | key:label | index-2TDxNpOf.js : 73319 | 1 |
| 695 | Preview | key:children | index-2TDxNpOf.js : 73344 | 2 |
| 696 | Confirmed | key:children | index-2TDxNpOf.js : 73360 | 1 |
| 697 | Open take settings | key:aria-label | index-2TDxNpOf.js : 73369 | 1 |
| 698 | Continue | key:children | index-2TDxNpOf.js : 73426 | 1 |
| 699 | Confirm take | key:children | index-2TDxNpOf.js : 73449 | 1 |
| 700 | Don't confirm the take, but keep it in the archive for later. | key:children | index-2TDxNpOf.js : 73487 | 1 |
| 701 | Confirm and replace | key:children | index-2TDxNpOf.js : 73513 | 1 |
| 702 | Replace matching clips in the timeline with this take. | key:children | index-2TDxNpOf.js : 73519 | 1 |
| 703 | Confirm without replacing | key:children | index-2TDxNpOf.js : 73546 | 1 |
| 704 | Confirm the take without replacing existing ones. Both takes will appear in the timeline. | key:children | index-2TDxNpOf.js : 73552 | 1 |
| 705 | Record another take | key:children | index-2TDxNpOf.js : 73617 | 1 |
| 706 | About trim review | key:aria-label | index-2TDxNpOf.js : 73916 | 1 |
| 707 | Review and refine the suggested trims before applying them to your project. | key:children | index-2TDxNpOf.js : 73927 | 1 |
| 708 | No trim target segments are available for this review. | key:children | index-2TDxNpOf.js : 75427 | 1 |
| 709 | Unsupported review kind | key:children | index-2TDxNpOf.js : 75591 | 1 |
| 710 | This workflow is waiting for a review kind that does not have a UI yet. | key:children | index-2TDxNpOf.js : 75596 | 1 |
| 711 | Close version history | key:aria-label | index-2TDxNpOf.js : 75822 | 1 |
| 712 | Loading version history... | key:children | index-2TDxNpOf.js : 75836 | 1 |
| 713 | No versions are available yet. | key:children | index-2TDxNpOf.js : 75860 | 1 |
| 714 | Account | key:label | index-2TDxNpOf.js : 76136 | 1 |
| 715 | General | key:label | index-2TDxNpOf.js : 76137 | 2 |
| 716 | Recording | key:label | index-2TDxNpOf.js : 76138 | 1 |
| 717 | Editing | key:label | index-2TDxNpOf.js : 76139 | 1 |
| 718 | AI | key:label | index-2TDxNpOf.js : 76140 | 1 |
| 719 | Shortcuts | key:label | index-2TDxNpOf.js : 76141 | 2 |
| 720 | Integrations | key:label | index-2TDxNpOf.js : 76142 | 1 |
| 721 | Settings | key:children | index-2TDxNpOf.js : 76151 | 1 |
| 722 | When enabled, the camera view will be mirrored horizontally during recording. | key:children | index-2TDxNpOf.js : 76199 | 1 |
| 723 | Highlight screen recording area | key:children | index-2TDxNpOf.js : 76222 | 1 |
| 724 | Voice enhancement mode | key:children | index-2TDxNpOf.js : 76250 | 1 |
| 725 | Choose how Borumi processes microphone clips by default. | key:children | index-2TDxNpOf.js : 76255 | 1 |
| 726 | Screen recording max frame rate | key:children | index-2TDxNpOf.js : 76287 | 1 |
| 727 | Higher frame rates make screen recordings smoother, but can increase file size and system load. Changes apply to future recordings. | key:children | index-2TDxNpOf.js : 76292 | 1 |
| 728 |  FPS | arr | index-2TDxNpOf.js : 76310 | 1 |
| 729 | When enabled, Borumi warns when the selected microphone sends completely silent audio for a few seconds. | key:children | index-2TDxNpOf.js : 76331 | 1 |
| 730 | Automatically attempts to compensate for the delay introduced by Bluetooth microphones. | key:children | index-2TDxNpOf.js : 76359 | 1 |
| 731 | Countdown sound | key:children | index-2TDxNpOf.js : 76382 | 1 |
| 732 | The sound that will be played during the countdown. | key:children | index-2TDxNpOf.js : 76387 | 1 |
| 733 | Beep | key:children | index-2TDxNpOf.js : 76413 | 1 |
| 734 | Drum Sticks | key:children | index-2TDxNpOf.js : 76414 | 1 |
| 735 | Preserve original cursor | key:children | index-2TDxNpOf.js : 76428 | 1 |
| 736 | When teleprompter device connects | key:children | index-2TDxNpOf.js : 76455 | 1 |
| 737 | Choose what Borumi does when a supported teleprompter device is connected. | key:children | index-2TDxNpOf.js : 76460 | 1 |
| 738 | Open teleprompter | key:children | index-2TDxNpOf.js : 76479 | 1 |
| 739 | Ask every time | key:children | index-2TDxNpOf.js : 76483 | 1 |
| 740 | Never open teleprompter | key:children | index-2TDxNpOf.js : 76487 | 1 |
| 741 | Synchronization strategy | key:children | index-2TDxNpOf.js : 76502 | 1 |
| 742 | ST | key:children | index-2TDxNpOf.js : 76524 | 1 |
| 743 | CT | key:children | index-2TDxNpOf.js : 76525 | 1 |
| 744 | ST (SCT fallback) | key:children | index-2TDxNpOf.js : 76528 | 1 |
| 745 | ST (CMCT fallback) | key:children | index-2TDxNpOf.js : 76532 | 1 |
| 746 | Enable source synchronization | key:children | index-2TDxNpOf.js : 76547 | 1 |
| 747 | You should almost never disable this option, unless you're experiencing synchronization issues so severe that you'd like to disable synchronization entirely. | key:children | index-2TDxNpOf.js : 76552 | 1 |
| 748 | Voice follow engine | key:children | index-2TDxNpOf.js : 76575 | 2 |
| 749 | Choose how Borumi follows your script in Voice follow mode. Apple Speech may send audio to Apple. | key:children | index-2TDxNpOf.js : 76580 | 1 |
| 750 | Whisper | key:children | index-2TDxNpOf.js : 76600 | 3 |
| 751 | Apple Speech (Cloud) | key:children | index-2TDxNpOf.js : 76603 | 2 |
| 752 | Apple Speech (Local) | key:children | index-2TDxNpOf.js : 76608 | 2 |
| 753 | Audio drift correction | key:children | index-2TDxNpOf.js : 76625 | 1 |
| 754 | Choose how Borumi corrects small timing gaps and overlaps in recorded audio. | key:children | index-2TDxNpOf.js : 76630 | 1 |
| 755 | Pad and trim | key:children | index-2TDxNpOf.js : 76650 | 1 |
| 756 | No languages selected | key:children | index-2TDxNpOf.js : 76884 | 1 |
| 757 | Word or phrase | key:placeholder | index-2TDxNpOf.js : 77067 | 1 |
| 758 | Remove word or phrase | key:aria-label | index-2TDxNpOf.js : 77144 | 1 |
| 759 | Adjust the quality of the video preview in the editor. | key:children | index-2TDxNpOf.js : 77185 | 1 |
| 760 | Select a lower setting to speed up Borumi while editing. This does not affect the final video, which will always be exported in maximum quality. | key:children | index-2TDxNpOf.js : 77190 | 1 |
| 761 | Timeline scrubbing | key:children | index-2TDxNpOf.js : 77224 | 1 |
| 762 | When enabled, move the pointer over the timeline while paused to preview frames without moving the playhead. | key:children | index-2TDxNpOf.js : 77229 | 1 |
| 763 | Controls whether audio plays and exports in mono or stereo. | key:children | index-2TDxNpOf.js : 77256 | 1 |
| 764 | Transcription languages | key:children | index-2TDxNpOf.js : 77287 | 1 |
| 765 | Select one or more languages to transcribe clips. | key:children | index-2TDxNpOf.js : 77291 | 1 |
| 766 | Transcribe clips automatically | key:children | index-2TDxNpOf.js : 77312 | 1 |
| 767 | Automatically transcribe audio clips when opening the editor. | key:children | index-2TDxNpOf.js : 77317 | 1 |
| 768 | Transcription model | key:children | index-2TDxNpOf.js : 77339 | 1 |
| 769 | Choose a model, or use Auto to pick the best option. | key:children | index-2TDxNpOf.js : 77344 | 1 |
| 770 | Apple Speech | key:children | index-2TDxNpOf.js : 77385 | 1 |
| 771 | Parakeet | key:children | index-2TDxNpOf.js : 77388 | 1 |
| 772 | Whisper (Large V3 Turbo) | key:children | index-2TDxNpOf.js : 77391 | 1 |
| 773 | Omnilingual | key:children | index-2TDxNpOf.js : 77395 | 1 |
| 774 | ElevenLabs Scribe v2 | arr | index-2TDxNpOf.js : 77402 | 1 |
| 775 | To use ElevenLabs Scribe v2, set up your ElevenLabs API key. | arr | index-2TDxNpOf.js : 77426 | 1 |
| 776 | Set up key | key:children | index-2TDxNpOf.js : 77439 | 1 |
| 777 | Custom vocabulary | key:children | index-2TDxNpOf.js : 77451 | 1 |
| 778 | Add names, brands, and phrases Borumi should recognize in future transcriptions. | key:children | index-2TDxNpOf.js : 77456 | 1 |
| 779 | Customize the keyboard shortcuts used across Borumi. | key:children | index-2TDxNpOf.js : 77550 | 1 |
| 780 | Reset all | key:children | index-2TDxNpOf.js : 77560 | 1 |
| 781 | Enable Recorder shortcuts | key:aria-label | index-2TDxNpOf.js : 77582 | 1 |
| 782 | Conflict | key:children | index-2TDxNpOf.js : 77774 | 1 |
| 783 | This shortcut conflicts with: | key:children | index-2TDxNpOf.js : 77794 | 1 |
| 784 | Press shortcut. Press Escape to cancel. | key:children | index-2TDxNpOf.js : 77902 | 1 |
| 785 | Take Preview | arr | index-2TDxNpOf.js : 77928 | 1 |
| 786 | Recorder / Teleprompter | arr | index-2TDxNpOf.js : 77930 | 1 |
| 787 | Automation | arr | index-2TDxNpOf.js : 77931 | 1 |
| 788 | Signed in as | key:children | index-2TDxNpOf.js : 78057 | 1 |
| 789 | Free Plan. | arr | index-2TDxNpOf.js : 78066 | 1 |
| 790 | Upgrade | key:children | index-2TDxNpOf.js : 78072 | 2 |
| 791 | to unlock all Borumi features. | arr | index-2TDxNpOf.js : 78075 | 1 |
| 792 | Sign Out | key:children | index-2TDxNpOf.js : 78084 | 1 |
| 793 | Sign in to unlock the full potential of Borumi and access all premium features. | key:children | index-2TDxNpOf.js : 78095 | 1 |
| 794 | Sign In | key:children | index-2TDxNpOf.js : 78100 | 1 |
| 795 | Theme | key:children | index-2TDxNpOf.js : 78117 | 2 |
| 796 | Choose how Borumi appears. System default will match your OS theme, but you can override it if you prefer a different look for Borumi. | key:children | index-2TDxNpOf.js : 78122 | 1 |
| 797 | System default | key:children | index-2TDxNpOf.js : 78135 | 2 |
| 798 | Light | key:children | index-2TDxNpOf.js : 78136 | 2 |
| 799 | Dark | key:children | index-2TDxNpOf.js : 78137 | 2 |
| 800 | Save new projects to | key:children | index-2TDxNpOf.js : 78152 | 1 |
| 801 | New projects will be saved into: | arr | index-2TDxNpOf.js : 78158 | 1 |
| 802 | Change the default folder where new projects will be saved. | key:children | index-2TDxNpOf.js : 78167 | 1 |
| 803 | Update channel | key:children | index-2TDxNpOf.js : 78203 | 1 |
| 804 | Stable | key:children | index-2TDxNpOf.js : 78224 | 1 |
| 805 | Alpha | key:children | index-2TDxNpOf.js : 78225 | 1 |
| 806 | Audio Output Device | key:children | index-2TDxNpOf.js : 78250 | 1 |
| 807 | Select the audio playback device for previews and editing. "Automatic" uses the system default device. | key:children | index-2TDxNpOf.js : 78255 | 1 |
| 808 | Recording video encoder | key:title | index-2TDxNpOf.js : 78295 | 1 |
| 809 | Select the video encoder used by the recorder. Auto chooses the most optimal encoder for the situation. | key:description | index-2TDxNpOf.js : 78297 | 1 |
| 810 | Export video encoder | key:title | index-2TDxNpOf.js : 78311 | 1 |
| 811 | Select the video encoder used when exporting video. Auto chooses the most optimal encoder for the situation. | key:description | index-2TDxNpOf.js : 78313 | 1 |
| 812 | Rendering sample loading mode | key:children | index-2TDxNpOf.js : 78331 | 1 |
| 813 | Choose how Borumi loads video samples during playback and export rendering. | key:children | index-2TDxNpOf.js : 78337 | 1 |
| 814 | Choose Zero copy to prefer GPU-backed loading when available, or switch to CPU copy if you see rendering issues. | key:children | index-2TDxNpOf.js : 78342 | 1 |
| 815 | CPU copy | key:children | index-2TDxNpOf.js : 78359 | 1 |
| 816 | Zero copy | key:children | index-2TDxNpOf.js : 78360 | 1 |
| 817 | Export Surface Rendering Mode | key:children | index-2TDxNpOf.js : 78374 | 1 |
| 818 | Choose how Borumi renders video frames before export encoding. Use Auto unless exports fail or render incorrectly. | key:children | index-2TDxNpOf.js : 78379 | 1 |
| 819 | Immediate full color | key:children | index-2TDxNpOf.js : 78398 | 1 |
| 820 | Deferred full color | key:children | index-2TDxNpOf.js : 78402 | 1 |
| 821 | Deferred NV12 | key:children | index-2TDxNpOf.js : 78406 | 1 |
| 822 | Screen Capture Refresh | key:children | index-2TDxNpOf.js : 78421 | 1 |
| 823 | This option helps prevent screen recordings from dropping frames and freezing. You can try disabling this option if you are experiencing recording crashes. | key:children | index-2TDxNpOf.js : 78426 | 1 |
| 824 | Camera buffer mode | key:children | index-2TDxNpOf.js : 78451 | 1 |
| 825 | Choose how Borumi handles camera frame buffers while recording. Use Auto unless camera recordings flicker or jump. | key:children | index-2TDxNpOf.js : 78457 | 1 |
| 826 | Copy buffers | key:children | index-2TDxNpOf.js : 78479 | 1 |
| 827 | Retain native buffer | key:children | index-2TDxNpOf.js : 78483 | 1 |
| 828 | Discard late camera frames | key:children | index-2TDxNpOf.js : 78498 | 1 |
| 829 | When enabled, Borumi asks macOS to drop delayed camera frames instead of queueing them. This only applies to new recordings. | key:children | index-2TDxNpOf.js : 78504 | 1 |
| 830 | Use elevated window layer | key:children | index-2TDxNpOf.js : 78528 | 1 |
| 831 | When enabled, Borumi renders the recorder and teleprompter above other windows. | key:children | index-2TDxNpOf.js : 78534 | 1 |
| 832 | Most apps do not need this, but some (eg. Keynote presentations) may require it. Close and reopen the recorder or teleprompter window to apply this change. | key:children | index-2TDxNpOf.js : 78540 | 1 |
| 833 | Optimized screen recording | key:children | index-2TDxNpOf.js : 78566 | 1 |
| 834 | When enabled, Borumi uses the GPU for more efficient color conversion while recording your screen, reducing CPU usage. | key:children | index-2TDxNpOf.js : 78572 | 1 |
| 835 | Optimized preview rendering | key:children | index-2TDxNpOf.js : 78596 | 1 |
| 836 | When enabled, Borumi uses a faster GPU path for preview playback when your PC supports it. Disable this if preview playback is black, stuck, or unstable. | key:children | index-2TDxNpOf.js : 78602 | 1 |
| 837 | Hardware Video Decoding | key:children | index-2TDxNpOf.js : 78626 | 1 |
| 838 | Use hardware acceleration for video decoding during playback and editing. Disable this if you experience video playback issues or crashes. | key:children | index-2TDxNpOf.js : 78632 | 1 |
| 839 | Microphone capture engine | key:children | index-2TDxNpOf.js : 78656 | 2 |
| 840 | Choose how Borumi captures microphone audio on macOS. | key:children | index-2TDxNpOf.js : 78662 | 1 |
| 841 | Choose how Borumi captures microphone audio on Windows. This only applies to new recordings. | key:children | index-2TDxNpOf.js : 78712 | 1 |
| 842 | Disable Windows native audio DSP | key:children | index-2TDxNpOf.js : 78750 | 1 |
| 843 | Hardware (low-latency AV) | key:label | index-2TDxNpOf.js : 78815 | 1 |
| 844 | Hardware (low-latency FVT) | key:label | index-2TDxNpOf.js : 78816 | 1 |
| 845 | Software (low-latency FMF) | key:label | index-2TDxNpOf.js : 78819 | 1 |
| 846 | Hardware (low-latency FMF) | key:label | index-2TDxNpOf.js : 78820 | 1 |
| 847 | Software (FMF) | key:label | index-2TDxNpOf.js : 78821 | 1 |
| 848 | Hardware (FMF) | key:label | index-2TDxNpOf.js : 78822 | 1 |
| 849 | ChatGPT | key:label | index-2TDxNpOf.js : 78861 | 2 |
| 850 | Other AI apps | key:label | index-2TDxNpOf.js : 78863 | 2 |
| 851 | Enable MCP | key:children | index-2TDxNpOf.js : 78881 | 1 |
| 852 | When enabled, supported AI apps can use Borumi MCP tools to inspect and edit your Projects. | key:children | index-2TDxNpOf.js : 78886 | 1 |
| 853 | Setup instructions | key:children | index-2TDxNpOf.js : 78904 | 1 |
| 854 | Choose your AI app to see how to connect it to the Borumi MCP. | key:children | index-2TDxNpOf.js : 78909 | 1 |
| 855 | AI workspace location | key:children | index-2TDxNpOf.js : 78942 | 1 |
| 856 | Borumi creates a folder named “Borumi AI Workspace” inside the location you choose. | key:children | index-2TDxNpOf.js : 78948 | 1 |
| 857 | Copy path | key:label | index-2TDxNpOf.js : 78992 | 2 |
| 858 | ElevenLabs API Key | key:children | index-2TDxNpOf.js : 79019 | 1 |
| 859 | Add an API key to use ElevenLabs's cloud transcription models. The audio will be sent to ElevenLabs for processing. | key:children | index-2TDxNpOf.js : 79025 | 1 |
| 860 | Paste your ElevenLabs API key | key:placeholder | index-2TDxNpOf.js : 79046 | 1 |
| 861 | Update Borumi to open this project | key:children | index-2TDxNpOf.js : 79158 | 1 |
| 862 | This project was edited with a newer version of Borumi. Install the latest version, then open the project again. | key:children | index-2TDxNpOf.js : 79163 | 1 |
| 863 | Update Borumi | key:children | index-2TDxNpOf.js : 79172 | 1 |
| 864 | Back to projects | key:children | index-2TDxNpOf.js : 79187 | 1 |
| 865 | Ouch! Something went wrong :( | key:children | index-2TDxNpOf.js : 79202 | 1 |
| 866 | Borumi experienced an unexpected error while loading the project. Please try again, and let us know if the problem persists. | key:children | index-2TDxNpOf.js : 79207 | 1 |
| 867 | Error code: | key:children | index-2TDxNpOf.js : 79215 | 2 |
| 868 | You’re viewing a previous version. Return to the latest or restore this version to make changes. | key:children | index-2TDxNpOf.js : 79236 | 1 |
| 869 | Restore this version | arr | index-2TDxNpOf.js : 79253 | 1 |
| 870 | Return to latest | arr | index-2TDxNpOf.js : 79265 | 1 |
| 871 | 👋 Hey there! You're using the trial version. To export your work, you'll need to | arr | index-2TDxNpOf.js : 79318 | 1 |
| 872 | Already bought the license? Then | arr | index-2TDxNpOf.js : 79331 | 1 |
| 873 | Sign-in | key:children | index-2TDxNpOf.js : 79336 | 1 |
| 874 | to activate Borumi. | arr | index-2TDxNpOf.js : 79339 | 1 |
| 875 | Logs | key:children | index-2TDxNpOf.js : 79425 | 1 |
| 876 | Select session... | key:placeholder | index-2TDxNpOf.js : 79435 | 1 |
| 877 | Copy logs | arr | index-2TDxNpOf.js : 79463 | 1 |
| 878 | Upgrade Now | key:children | index-2TDxNpOf.js : 79565 | 1 |
| 879 | Already bought a license? Then | arr | index-2TDxNpOf.js : 79572 | 1 |
| 880 | Login | key:children | index-2TDxNpOf.js : 79578 | 1 |
| 881 | to activate Borumi | arr | index-2TDxNpOf.js : 79581 | 1 |
| 882 | Paul J Lipsky | key:alt | index-2TDxNpOf.js : 79643 | 2 |
| 883 | “I've been able to double my output with the same amount of work thanks to Borumi.” | key:children | index-2TDxNpOf.js : 79652 | 1 |
| 884 | , Entrepreneur & Course Creator | arr | index-2TDxNpOf.js : 79661 | 1 |
| 885 | Unlock Video Sharing | key:title | index-2TDxNpOf.js : 79670 | 1 |
| 886 | You're almost ready to share your video. Upgrade to the full license to publish it and share it with anyone. | key:description | index-2TDxNpOf.js : 79672 | 1 |
| 887 | Unlock Video Exports | key:title | index-2TDxNpOf.js : 79675 | 1 |
| 888 | You're almost ready to export your video. Upgrade to the full license to export it and use it anywhere. | key:description | index-2TDxNpOf.js : 79677 | 1 |
| 889 | Unlock Audio Exports | key:title | index-2TDxNpOf.js : 79680 | 1 |
| 890 | You're almost ready to export your audio. Upgrade to the full license to export it and use it anywhere. | key:description | index-2TDxNpOf.js : 79682 | 1 |
| 891 | All Borumi features | key:label | index-2TDxNpOf.js : 79688 | 1 |
| 892 | Pay once, use forever | key:label | index-2TDxNpOf.js : 79693 | 1 |
| 893 | All your devices | key:label | index-2TDxNpOf.js : 79698 | 1 |
| 894 | You're all set! | key:children | index-2TDxNpOf.js : 79729 | 1 |
| 895 | You can now share your video with anyone. | key:description | index-2TDxNpOf.js : 79751 | 1 |
| 896 | You can now export your video and use it anywhere. | key:description | index-2TDxNpOf.js : 79755 | 1 |
| 897 | You can now export your audio and use it anywhere. | key:description | index-2TDxNpOf.js : 79759 | 1 |
| 898 | Enjoy all Borumi features, on all your devices. | key:description | index-2TDxNpOf.js : 79764 | 1 |
| 899 | Report issue or feedback | key:children | index-2TDxNpOf.js : 79894 | 1 |
| 900 | Help us improve Borumi by sending feedback. We'll do everything we can to help. | key:children | index-2TDxNpOf.js : 79899 | 1 |
| 901 | What kind of feedback is this? | key:children | index-2TDxNpOf.js : 79906 | 1 |
| 902 | Idea | key:title | index-2TDxNpOf.js : 79913 | 1 |
| 903 | I think this would be cool! | key:description | index-2TDxNpOf.js : 79914 | 1 |
| 904 | Small Bug | key:title | index-2TDxNpOf.js : 79924 | 1 |
| 905 | This is off... | key:description | index-2TDxNpOf.js : 79925 | 1 |
| 906 | Urgent Bug | key:title | index-2TDxNpOf.js : 79935 | 1 |
| 907 | I can't use Borumi! | key:description | index-2TDxNpOf.js : 79936 | 1 |
| 908 | Do you have any screenshot, screen recording or file that could help us better understand the | arr | index-2TDxNpOf.js : 79975 | 1 |
| 909 | Attach file | key:children | index-2TDxNpOf.js : 80028 | 1 |
| 910 | Would you like us to follow up? | key:children | index-2TDxNpOf.js : 80039 | 1 |
| 911 | If so, please leave your email here... | key:placeholder | index-2TDxNpOf.js : 80043 | 1 |
| 912 | Sending your feedback... | key:children | index-2TDxNpOf.js : 80091 | 1 |
| 913 | Please keep Borumi open while the upload is in progress. | key:children | index-2TDxNpOf.js : 80095 | 1 |
| 914 | Thank you for your feedback! | key:children | index-2TDxNpOf.js : 80118 | 1 |
| 915 | Your feedback helps us improve Borumi for everyone. | key:children | index-2TDxNpOf.js : 80122 | 1 |
| 916 | Send new report | key:children | index-2TDxNpOf.js : 80131 | 1 |
| 917 | Oh snap! Something went wrong | key:children | index-2TDxNpOf.js : 80168 | 1 |
| 918 | Unfortunately, there was an error sending your feedback, but don't worry, there are a few alternatives: | key:children | index-2TDxNpOf.js : 80175 | 1 |
| 919 | You can try again later by clicking | arr | index-2TDxNpOf.js : 80182 | 1 |
| 920 | You can export your diagnostics by clicking | arr | index-2TDxNpOf.js : 80195 | 1 |
| 921 | Export diagnostics | key:children | index-2TDxNpOf.js : 80201 | 2 |
| 922 | and send them to us at | arr | index-2TDxNpOf.js : 80204 | 1 |
| 923 | We'll do everything we can to help. | key:children | index-2TDxNpOf.js : 80214 | 1 |
| 924 | Can't rename project while recording | key:tooltip | index-2TDxNpOf.js : 80266 | 1 |
| 925 | Can't rename project while exporting | key:tooltip | index-2TDxNpOf.js : 80280 | 1 |
| 926 | Can't rename project to the same name | key:tooltip | index-2TDxNpOf.js : 80285 | 1 |
| 927 | Untitled | key:placeholder | index-2TDxNpOf.js : 80324 | 1 |
| 928 | The Project will be reloaded automatically after the rename is completed. | key:children | index-2TDxNpOf.js : 80329 | 1 |
| 929 | Rename | key:children | index-2TDxNpOf.js : 80344 | 2 |
| 930 | Changelog | key:children | index-2TDxNpOf.js : 80399 | 2 |
| 931 | Remind me later | key:children | index-2TDxNpOf.js : 80415 | 1 |
| 932 | Update now | key:children | index-2TDxNpOf.js : 80417 | 1 |
| 933 | About Borumi | key:children | index-2TDxNpOf.js : 80463 | 1 |
| 934 | Version  | arr | index-2TDxNpOf.js : 80476 | 1 |
| 935 | Borumi is brought to you with ❤️ by Spandino AB. | key:children | index-2TDxNpOf.js : 80481 | 1 |
| 936 | Privacy policy | key:children | index-2TDxNpOf.js : 80498 | 1 |
| 937 | Terms and conditions | key:children | index-2TDxNpOf.js : 80505 | 1 |
| 938 | Open source licenses | key:children | index-2TDxNpOf.js : 80512 | 1 |
| 939 | Copyright ©  | arr | index-2TDxNpOf.js : 80519 | 1 |
| 940 |  Spandino AB. All rights reserved. | arr | index-2TDxNpOf.js : 80521 | 1 |
| 941 | Open Source Licenses | key:children | index-2TDxNpOf.js : 80590 | 1 |
| 942 | Borumi is also made possible by several open source projects. Below you will find their links and licenses. | key:children | index-2TDxNpOf.js : 80595 | 1 |
| 943 | Loading licenses... | key:children | index-2TDxNpOf.js : 80608 | 1 |
| 944 | The open source licenses could not be loaded. Try closing and reopening this dialog. | key:children | index-2TDxNpOf.js : 80615 | 1 |
| 945 | Show license | key:children | index-2TDxNpOf.js : 80641 | 1 |
| 946 | Home page | key:children | index-2TDxNpOf.js : 80648 | 1 |
| 947 | Loading license... | key:children | index-2TDxNpOf.js : 80672 | 1 |
| 948 | The license could not be loaded. Try selecting it again. | key:children | index-2TDxNpOf.js : 80679 | 1 |
| 949 | Close Elgato Camera Hub | key:children | index-2TDxNpOf.js : 80720 | 1 |
| 950 | The Elgato Camera Hub takes over the Elgato Prompter display, which can interfere with Borumi's Teleprompter. | key:children | index-2TDxNpOf.js : 80734 | 1 |
| 951 | Close the Elgato Camera Hub before opening the Teleprompter. | key:children | index-2TDxNpOf.js : 80738 | 1 |
| 952 | Camera Hub is still running. Close it manually, then try again. | key:children | index-2TDxNpOf.js : 80744 | 1 |
| 953 | Connect the Borumi MCP to your AI | key:children | index-2TDxNpOf.js : 80803 | 1 |
| 954 | Got it! | key:children | index-2TDxNpOf.js : 80833 | 1 |
| 955 | Creating AI workspace... | key:title | index-2TDxNpOf.js : 80843 | 1 |
| 956 | Borumi is generating the configuration for your AI apps. | key:description | index-2TDxNpOf.js : 80845 | 1 |
| 957 | Checking AI workspace... | key:title | index-2TDxNpOf.js : 80849 | 1 |
| 958 | Borumi is updating the workspace for your AI apps. | key:description | index-2TDxNpOf.js : 80850 | 1 |
| 959 | AI workspace couldn't be prepared | key:children | index-2TDxNpOf.js : 80866 | 1 |
| 960 | Preparing AI workspace... | key:title | index-2TDxNpOf.js : 80887 | 1 |
| 961 | Borumi is starting the workspace check. | key:description | index-2TDxNpOf.js : 80888 | 1 |
| 962 | AI app | key:aria-label | index-2TDxNpOf.js : 80918 | 1 |
| 963 | Open ChatGPT Desktop app | key:title | index-2TDxNpOf.js : 80963 | 1 |
| 964 | Select Borumi AI Workspace folder | key:title | index-2TDxNpOf.js : 80966 | 2 |
| 965 | When starting a new chat, select the Borumi AI Workspace folder. You can find it in your Documents folder. | key:children | index-2TDxNpOf.js : 80971 | 1 |
| 966 | ChatGPT workspace selector showing Borumi AI Workspace | key:alt | index-2TDxNpOf.js : 80978 | 1 |
| 967 | Open Claude Desktop app | key:title | index-2TDxNpOf.js : 80986 | 1 |
| 968 | When starting a new Claude Code session, select the Borumi AI Workspace folder. You can find it in your Documents folder. | key:children | index-2TDxNpOf.js : 80994 | 1 |
| 969 | Claude Code workspace selector showing Borumi AI Workspace | key:alt | index-2TDxNpOf.js : 81001 | 1 |
| 970 | Add a local MCP server | key:title | index-2TDxNpOf.js : 81013 | 1 |
| 971 | Your AI app must support local stdio MCP servers. Add a server named Borumi with this command and argument. | key:children | index-2TDxNpOf.js : 81018 | 1 |
| 972 | Command | key:label | index-2TDxNpOf.js : 81020 | 1 |
| 973 | Argument | key:label | index-2TDxNpOf.js : 81021 | 1 |
| 974 | JSON | key:label | index-2TDxNpOf.js : 81022 | 1 |
| 975 | TOML | key:label | index-2TDxNpOf.js : 81023 | 1 |
| 976 | Start editing with AI | key:title | index-2TDxNpOf.js : 81033 | 1 |
| 977 | You can now ask AI to help you script, edit, and export your video while automating the tedious parts of video creation. | key:children | index-2TDxNpOf.js : 81037 | 1 |
| 978 | Copy | key:label | index-2TDxNpOf.js : 81128 | 2 |
| 979 | Almost there! | key:title | index-Bek2B5yO.js : 68 | 1 |
| 980 | Select a scene or start recording, and your script will appear here. | key:description | index-Bek2B5yO.js : 70 | 1 |
| 981 | Nothing to see here 👀 | key:title | index-Bek2B5yO.js : 74 | 1 |
| 982 | The current scene doesn't have a script. You can add it in the Script tool, and it will appear here automatically. | key:description | index-Bek2B5yO.js : 76 | 1 |
| 983 | Decrease text size | key:aria-label | index-Bek2B5yO.js : 139 | 2 |
| 984 | Increase text size | key:aria-label | index-Bek2B5yO.js : 154 | 2 |
| 985 | Manual scrolling | key:tooltip | index-Bek2B5yO.js : 258 | 1 |
| 986 | Voice Following scrolling | key:tooltip | index-Bek2B5yO.js : 262 | 1 |
| 987 | Constant speed scrolling | key:tooltip | index-Bek2B5yO.js : 264 | 1 |
| 988 | Left align | key:tooltip | index-Bek2B5yO.js : 417 | 1 |
| 989 | Center align | key:tooltip | index-Bek2B5yO.js : 418 | 2 |
| 990 | Right align | key:tooltip | index-Bek2B5yO.js : 421 | 1 |
| 991 | Stop | key:children | index-DAWue-_s.js : 112 | 1 |
| 992 | Show sources | key:label | index-DAWue-_s.js : 214 | 1 |
| 993 | Open script as separate window | key:label | index-DAWue-_s.js : 232 | 1 |
| 994 | Scrolling mode | key:label | index-DAWue-_s.js : 244 | 2 |
| 995 | Scrolling speed | key:label | index-DAWue-_s.js : 253 | 2 |
| 996 | Back 5 seconds | key:label | index-DAWue-_s.js : 563 | 2 |
| 997 | Auto-scroll | key:children | index-DAWue-_s.js : 844 | 1 |
| 998 | Rewind to start | key:aria-label | index-DAWue-_s.js : 867 | 4 |
| 999 | Rewind script to the top | key:children | index-DAWue-_s.js : 887 | 1 |
| 1000 | Warning! Window resized. | key:title | index-DAWue-_s.js : 995 | 1 |
| 1001 | Recording quality may be affected. For best results, stop the recording and start a new one. | key:message | index-DAWue-_s.js : 997 | 1 |
| 1002 | Warning! | key:title | index-DAWue-_s.js : 1001 | 2 |
| 1003 | Please review your sources before continuing the recording. | key:message | index-DAWue-_s.js : 1004 | 1 |
| 1004 | Start now | key:children | index-DAWue-_s.js : 1057 | 1 |
| 1005 | Something went wrong. | key:children | index-DAWue-_s.js : 1101 | 2 |
| 1006 | Borumi couldn't start capture for this recording. Close the recorder and check your sources before trying again. | key:children | index-DAWue-_s.js : 1108 | 1 |
| 1007 | Close the recorder and check your sources before trying again. | key:children | index-DAWue-_s.js : 1197 | 1 |
| 1008 | Window not visible yet. | key:children | index-DAWue-_s.js : 1270 | 2 |
| 1009 | Borumi can't start recording until your target window is visible in the current desktop. Bring it into view to get started. | key:children | index-DAWue-_s.js : 1275 | 1 |
| 1010 | Recorder is in an invalid state, please contact us if the problem persists. | arr | index-DAWue-_s.js : 1679 | 1 |
| 1011 | Borumi needs Speech Recognition permission to follow your voice. | key:children | use-teleprompter-context-menu-Do8ZfJQ9.js : 39 | 1 |
| 1012 | Allow | key:children | use-teleprompter-context-menu-Do8ZfJQ9.js : 48 | 1 |
| 1013 | Adjust baseline | key:children | use-teleprompter-context-menu-Do8ZfJQ9.js : 308 | 1 |
| 1014 | Adjust text width | key:children | use-teleprompter-context-menu-Do8ZfJQ9.js : 447 | 1 |
| 1015 | Not transparent | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 823 | 1 |
| 1016 | 10% transparent | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 828 | 1 |
| 1017 | 25% transparent | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 833 | 1 |
| 1018 | 50% transparent | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 838 | 1 |
| 1019 | 75% transparent | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 843 | 1 |
| 1020 | Mirror text | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 971 | 1 |
| 1021 | Transparency | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1019 | 1 |
| 1022 | Voice follow (Enhanced) | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1091 | 1 |
| 1023 | Voice follow | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1098 | 1 |
| 1024 | Constant speed (Voice activated) | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1105 | 1 |
| 1025 | Constant speed | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1112 | 1 |
| 1026 | Text alignment | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1162 | 1 |
| 1027 | Text width | key:label | use-teleprompter-context-menu-Do8ZfJQ9.js : 1206 | 1 |
| 1028 |  selected. | arr | use-capture-warnings-D4bMQkfA.js : 228 | 1 |
| 1029 | Not authorized. | arr | use-capture-warnings-D4bMQkfA.js : 239 | 1 |
| 1030 | Learn more | key:children | use-capture-warnings-D4bMQkfA.js : 245 | 3 |
| 1031 |  not found, please select another one. | arr | use-capture-warnings-D4bMQkfA.js : 261 | 1 |
| 1032 | To record this window, bring it onto the current desktop and make sure it's not minimized. | key:children | use-capture-warnings-D4bMQkfA.js : 412 | 1 |
| 1033 | Sync | key:children | use-capture-warnings-D4bMQkfA.js : 631 | 1 |

