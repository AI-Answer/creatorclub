# CreatorClub → Borumi parity

Sources, all captured 2026-11-02 from Borumi 0.32.1 on this Mac:
- `screens/borumi/` — 42 full-resolution window captures (home, help, all 8 settings tabs, script, record, take preview, edit, all 9 edit panels, clip selection, countdown, recording island with and without script).
- `screens/creatorclub/` — the same window size (1200×810) of every CreatorClub route, from the running dev app.
- `borumi-ui-spec.md` — static read of Borumi's shipped UI bundle: tokens, Tailwind classes, sizes, copy, commands. `[V]` = read in the bundle, `[I]` = inferred.
- Colours below marked "px" were sampled from the screenshots.

Not captured yet (needs full-screen control, because they are native or pop-up menus): logo menu, Recording presets, device pickers, Export menu, Confirm-take menu, island ⋮ menu, Auto-scroll menu, right-click menus (tab, recent project, clip, timeline). Their items are listed in spec §4.2 and Appendix C.

## 1. The two apps today

| | Borumi | CreatorClub |
|---|---|---|
| Theme | Dark by default (System/Light/Dark setting). Neutral greys: bg `#0a0a0a`, secondary `#171717`, border `#262626` (px). System font. | Light warm neutrals, Inter, black primary, blue accent, red record (`creator-theme.css`). |
| Window chrome | 39px **tab strip**: traffic-light reserve 77px · logo menu · one tab per open project (closable) · `+` · help · settings. | Left **sidebar** (Home, Discover, Videos, Research, search ⌘K, account, settings/help at the bottom). |
| Inside a project | 48px header: centred name + "Edited" state, undo/redo/history right, tool button (Recording presets / Export). 64px **bottom step bar**: `Back to X` · Script › Record › Edit (40px round wells, active = white) · `Continue to Y`. | Top bar: breadcrumb, status pill, centred step tabs (Board · Plan · Record · Edit · Publish), Ask Claude panel docked right, `Continue to …` bottom right. |
| Stack | Tailwind v3 + Radix + cva (shadcn pattern), tiptap, framer-motion. | Tailwind 4 + hand-written CSS; no Radix; icons iconoir + lucide. |

## 2. Screen by screen

Each row: what Borumi does (screenshot) → what to change in CreatorClub.

**Home** (`01-home`)
- Centred 800px column, sticky "How would you like to start?", two 50/50 template cards (`bg-secondary p-9 rounded-md border`, 40px coloured round icon well: green = Structured, blue = Quick), then "Recent projects" + "View all", rows with 80×48 thumbnail, bold name, path, relative time right.
- CreatorClub Home is a dashboard (Next up, Working in your topics). Keep its content, restyle to Borumi: same column width, card and row classes, type scale.

**Script** (`20`, `21`, `22`)
- Full-width canvas, no side panels. Each scene is a row: grey "Scene N" label right-aligned in a gutter, 2px coloured left rule, text in a ~15px editor; drag-handle chip appears on hover; "+ Add scene" centred (full-width hover fill). Primary "Continue to Recording" bottom right.
- CreatorClub Plan stacks package + scene list + chat. Map: Plan → Borumi Script layout for scenes; package (title/thumbnail/hook) goes above the scenes in the same column style.

**Record** (`31`, `32`, `33`, `34`, `35`)
- Left 400px source column: disk/permission warning card (orange `#6f3915` px), then one block per source: green toggle, name, device picker, gear; live preview with resolution chip (camera, screen) or level meter (mic); System Sound toggle with "All Apps".
- Right: scene cards, one per scene: coloured dot + "Scene N" + gear, script text, dashed "+ Record" tile, take thumbnails with "Take 1 (00:21)"; the active scene has a blue 1px ring; "Archived (N)" collapsible; "+ Add scene".
- Empty quick-recording state: "Hey 👋 Ready to record?", two checked hints, white "Start recording" + "Import from file…", hand-drawn arrow toward the sources.
- CreatorClub Record is a single centred preview + one big black "Record scene 2" + takes list + teleprompter panel. Change to the Borumi two-column layout above.

**Countdown + recording island** (`60`–`66`)
- The main window hides. Countdown: dark rounded 250×250 window, glowing purple/blue orb with the number, white "Start now" pill, "Cancel".
- Island: 250px wide floating window, rounded ~16px. Camera fills the top; chips "📷 MacBook Air Camera" (top), "🎙 MacBook Air Microphone" + live level (bottom-left); ✕ top-left. Bar: timer, red "■ Stop" button, pause/resume, retry (↩), ⋮. With a script the window grows to 350px tall and shows the scene text in large white type with an "Auto-scroll" pill at the bottom (built-in teleprompter).
- Paused: the pause icon becomes ▶ and the timer freezes.

**Take preview** (`30`, `64`)
- Full window: "PREVIEW / Take N ⚙" top-left, ✕ top-right; big screen source left with a label chip; camera and microphone (waveform) tiles stacked right; a selected source gets a blue ring; tip pill "Cursor is hidden during preview…". Scrubber, time left/right, −5s / play / +5s / 1X. Bottom: red "Delete take" left; "↩ Record another take" + white split "✓ Confirm take ▾" right.
- Confirm returns to Record with the take as a thumbnail on the scene card.

**Edit** (`40`–`50`)
- 72px icon rail: Canvas, Layout, Clip, Zoom, Elements, Music, Captions, Cursor, Automate (36px round wells, active white).
- Panel opens between rail and preview (~250px). Preview centre; transcript right (~375px): "SCENE N" small caps, text ~17px with tall line height, the spoken word highlighted with a blue rounded fill; "This scene has no transcript" dashed box for empty scenes.
- Vertical split preview : timeline = 1.5 : 1 (min 200 each). Playbar centred under preview: `00:00.0 / 00:00.0` tabular, prev / play / next, `1X`; right: select, blade, snap, ripple, align, captions toggle, zoom − slider +.
- Timeline: ruler with `00:02` labels, "• SCENE 1" markers, video clip solid blue `#255fe6` (px) with a thumbnail at the start, audio clip darker blue `#16398a` (px) with words on top and a waveform, area after the last clip hatched grey. Selected clip gets a light outline; the panel switches to Clip properties (Microphone: Enhance Voice, Volume, Remove Noise; Camera: Crop, Mirror, Face Centering).
- Header shows a white split "⤒ Export ▾".
- CreatorClub Edit has a rail too (Transcript, Cut, Captions, Layout, Clip, Zoom, Graphics, Music, More) but transcript is a panel, the timeline is short, Ask Claude takes the right side. Change to the Borumi arrangement; Ask Claude becomes a toggled right panel that replaces the transcript column (Borumi has no chat; this is the one deliberate addition).

**Settings** (`10`–`17`)
- Full screen, not a dialog. Left 256px: "Settings" 24px bold + 8 tabs with icons. Right: rows of title (bold 14px) + grey description + control on the right (toggle, select, "Change" button). Shortcuts tab: grouped tables (General, Script, Take preview, Edit, Edit · Timeline, Recorder / Teleprompter, Automation, Record) with key caps and a pencil per row.
- CreatorClub Settings: keep its groups, use this layout.

**Help** (`02`): 320px popover under the ? button, "Need help?", two cards (Contact support, Report issue).

## 3. CreatorClub-only screens (no Borumi equivalent)

Discover, Videos (Board / Table / Calendar), Research, Plan's package, Publish, Ask Claude. These keep their function and take Borumi's look: same tokens, cards (`bg-secondary border rounded-md`), row style from Recent projects, Radix menus and dialogs, the same type scale.

## 4. Build order (one PR each, each checked against the screenshots at 1200×810)

0. **Foundation**: Borumi tokens (light + dark, `borumi-ui-spec.md` §8) in the Tailwind theme; add Radix + cva; one set of primitives (Button 7 variants × 5 sizes, Input, Select, DropdownMenu, ContextMenu, Dialog, Popover, Tooltip with 200/300/500 ms delays, Switch, Slider, Checkbox, Skeleton, Toast). Built from shadcn/ui (MIT); no Borumi code.
1. **Chrome**: tab strip + project header + bottom step bar.
2. **Record**: source column, scene cards, empty state, take preview.
3. **Countdown + island** (separate Electron windows, 250×250 / 250×350).
4. **Edit**: rail, panels, transcript column, playbar, timeline look.
5. **Script/Plan**, **Settings**, **Home**.
6. **Discover, Videos board, Research, Publish** restyled on the same primitives.

Per PR: capture the CreatorClub screen at 1200×810 next to the Borumi file in `screens/borumi/` and list remaining differences in the PR.

## Status on branch `borumi-parity` (2026-11-02)

Done (checked side by side at 1200×810 against `screens/borumi/`): tokens and theme (System default), tab strip with video tabs, Help popover,
Home tab nav, Home column, Settings two-column tabs, video header and step bar, Plan as Borumi's script rows, Record two columns with
source blocks and scene cards, full-window take preview (red Delete take, Record another take, Confirm take), recording island and
countdown, Edit rail (Borumi's nine tools), panels beside the picture, transcript column, Borumi transport bar, white switches, menus.

Not 1:1, and why:
- Ask Claude stays as CreatorClub's own column (Borumi has no chat); Publish replaces Borumi's Export button.
- Edit panel contents are CreatorClub's own features (Borumi's wallpapers, overlays, cursor styles and caption presets do not exist here).
- The island has no ↩ retry or ⋮ menu: its window has no command for them.
- Discover, Videos and Research have no Borumi screen; they use the same tokens, cards and menus.
- Borumi's dropdown and right-click menus are still not screenshotted (they need full-screen control); our menus follow the bundle's classes.
