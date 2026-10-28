# SceneForge UX reference

Source: `/Users/danizal/dani/creatorclub/recorder/app/src`. Read from code; the app was not run.

## Shell and Home (`App.tsx`, `Home.tsx`, `Onboarding.tsx`)

- Titlebar: brand **SceneForge**, project name field, save state, icon **Close project**, icon **Settings**.
- Project header: icons **Undo**, **Redo**, **Version history**; primary **Export**.
- Step bar (`role=tab`): **Script**, **Record**, **Edit**. Beside it: **Projects** (back), **Ask Claude** (Edit only), **Teleprompter** (Script/Record), **Import**.
- Home: heading **Make your first video** or **Your projects**. Cards: **Record a video**, **Import footage**, **Write a script**, each with a one-line description. Recent list with search, menu **Project library options** (**Import project file…**, **View trash**); per project **Duplicate**, **Move to trash**; featured card **Continue editing** / **Continue writing**.
- Recovery: **Recover unfinished recordings**, **Recover recording**.
- Dialogs: **A new story** (**Create project**), **Add to your story** (**Choose files**), **Bring your project over** (Borumi).

## Recorder (`Recording.tsx`, `RecordingSceneCards.tsx`, `TakeReview.tsx`)

- Sources panel: **Camera**, **Microphone**, **Screen**, **Computer audio**. Each has a switch, a device picker and a gear ("... settings"). Screen: **Choose a screen**; area **Entire display** / **Application window** / **Selected region**; **Refresh sources**.
- Presets menu **Recording presets**: **Default settings**, **Save as new**, **Rename**, **Update saved settings**. Options: **Mirror preview only**, **Echo cancellation**, **Noise suppression**.
- Source status: **Not included**, **Preview not started**, **Opening preview…**, **Waiting for signal…**, **Ready**, **Disconnected**, **Needs attention**.
- Scene cards: **Add scene**, **Record**, **or Import from file.**, **Remove pauses**, **Style video**. Toggle **3-second countdown with chimes**.
- Next-step banner: **Recording saved**, "Trim it, add captions and export your video.", **Edit & export**.
- While recording: **Recording starts in…**, **Recording in progress**, **Recording paused**, **Saving your take**. Buttons **Pause** / **Resume**, **Stop & save** (**Saving take…**), **Cancel recording start**.
- Take review ("Review recorded take"): **Continue**, **Retake**, **Keep both takes**, **Replace earlier take**, **Record another take**, **Archive take**, **Show in main preview**, **Reset sync**, **Adjust sync**.

Path: Script → Record (scene card) → countdown → **Stop & save** → take review → **Continue** → Edit.

## Editor (`App.tsx`, `Inspector.tsx`, `Timeline.tsx`, `QuickActions.tsx`, `AgentChat.tsx`)

- Panel rail (9): **Canvas**, **Layout**, **Clip**, **Zoom**, **Elements**, **Music**, **Captions**, **Cursor**, **Automate**.
- Automate panel: **Remove pauses**, **Review filler words**, **Create transcript**, **Edit with your AI** ("Connect an assistant through MCP"; opens Settings, not an editor).
- Quick actions (header): **Remove pauses** (auto-cut), **Style video** (visualize). Dialog buttons: **Select all**, **Clear**, **Apply selected**, **Undo this action**.
- Ask Claude panel ("Claude editor"): "Describe the next edit.", **Selected clips**, **Clear selection**, **Refresh**. Sign-in note: "Sign in from Terminal with claude auth login".
- Preview: "PREVIEW", **Media**, **Transcript**. Transport: **Go to start**, **Play**/**Pause**, **Go to end**, speed "1×".
- Timeline toolbar: **Select tool**, **Blade tool**, **Duplicate selected clip**, **Delete selected**, **Toggle snapping**, **Scrub**, **Ripple**, zoom out/in, **Timeline zoom**, **Fit timeline**. Menus: **Add layer** (**Video layer**, **Audio layer**); scene menu **Auto-cut scene**, **Visualize scene**.
- Transcript panel: **Transcript**, **Create transcript**, **Edit spoken words**.
- Export ("Export your story"): tabs **Export current version** / **Export history**; presets **Full timeline**, **One scene**, **Custom range**; **Format**, **Quality**, **Frames per second**, **Burn captions into video**, **Prefer hardware encoding**; **Borumi project…**, **Keep editing in Borumi**.

## Settings (`Dialogs.tsx`, `SettingsDialog`)

- Tabs: **General**, **AI & transcription**, **AI**, **Performance**, **Shortcuts**, **About**.
- General: **Recording access** (**Open setup**), **Appearance** (**System** / **Light** / **Dark**), **Teleprompter**, **Your workspace**, **Preview & render**.
- AI & transcription: **Bring your own AI** (**Provider**, **API key**, **Base URL**, **Model**, **Language**, **Local command**).
- AI tab: MCP toggle **Enable MCP**. The code's `initialTab` name "AI control · MCP" maps to this tab.

## Confusing

1. **Three AI entry points, four names.** **Ask Claude** (toolbar; aria says "Edit with Claude"), **Automate**, **Edit with your AI** (opens Settings), and Settings "AI" vs "AI & transcription".
2. **"Borumi" is visible** in Home, Export and the Borumi export dialog. A legacy name in a merged product.
3. **Same action, two names.** **Remove pauses** (quick action) = **Auto-cut scene** (timeline menu). Visualize is **Style video**, **Visualize scene**, or "visual treatments".
4. **Import in four wordings**: **Import**, **Import media**, **Import footage**, **Import project file…**.
5. **Take confirmation has many doors**: **Continue**, **Keep both takes**, **Replace earlier take**, **Record another take**, **Archive take**, **Retake**, plus the **Edit & export** banner.
6. **Jargon**: take, scene, clip, element, ripple, scrub, blade, proxy ("Adaptive — use proxy when available"), hardware encoder, "Sync delay in ms", "Mac setup".
7. **Cryptic toggles**: **Scrub** and **Ripple** are text labels whose meaning sits in tooltips.

## Keep

- Script → Record → Edit matches the real workflow; step tabs have icons.
- Autosave ("Saved locally"), version history, trash and recording recovery as safety nets.
- Home: three start cards with one-line descriptions; **Continue** on the last project.
- Recorder: live per-source readiness text; specific errors ("System Settings → Privacy & Security"); countdown; **Stop & save**; sync tools in take review.
- Empty states with one action ("Your story starts here").
- Local-first copy: "No account is needed to get started."
- Configurable shortcuts; conflicts reported in a toast.

## Gaps vs a calm cal.com / Notion style

- **Density and type.** `styles.css` has 224 `font-size` declarations, 158 under 12px (`.history-item small` 9px, `.shortcut-row kbd` 9px, `.export-presets small` 8px). Base size conflicts: 13px in `styles.css`, 14px in `original-theme.css`.
- **Controls per screen.** Edit screen: about 40 interactive controls before any clip (titlebar 3, header 6, workspace bar 3, panel rail 9, preview 2, transport 4, timeline toolbar about 11). Recorder sources panel: 4 switches, 4 gear buttons, 3 device pickers, preset trigger, area picker. Most toolbar controls are icons with `title` tooltips only.
- **Theme layering.** `main.tsx` imports `styles.css` → `original-theme.css` → `timeline-interactions.css` → `interaction-theme.css`; later wins. Three token sets: purple accent `#8260d9` (`styles.css`); neutral `--primary` / `--input` / `--line` (`original-theme.css`); semantic `--danger` / `--focus-ring` / `--surface-shadow` with `:root[data-theme=dark]` (`interaction-theme.css`). Theme switch: `src/appearance.ts`. About 680 hex literals across the CSS.
- **Restyle to shadcn/Tailwind.** No Tailwind, shadcn or Radix in `package.json`; `vite.config.ts` has only the React plugin. 754 `className` uses across 27 TSX files, 26 inline styles. `original-theme.css` borrows shadcn names but not meanings (`--input` is the input background, `--line` the border, `--accent` near-black). Path: one token file, drop the purple palette and sub-12px sizes, add Tailwind via its Vite plugin, rebuild primitives first (button, field, modal, tabs), then migrate screens. Effort: medium for tokens and primitives; large for `Recording.tsx` (349 lines) and `App.tsx` (156 dense lines), which need splitting first.
