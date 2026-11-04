# Heptabase outliner: shipped evidence and Creator Compiler implementation

Inspected 2026-11-03, read-only, from `/tmp/hepta/extract/build`. No Heptabase application files were changed or executed. Issue scope: #11, #12, epic #16.

## Evidence and limits

REA analyzed the extracted Electron directory as inert JavaScript. Its 20-second-per-source run returned a partial observation, retained as `ev_349f4bfdaa3f44507373c2929fa0ea92a121251c8eb818f87e99eee9110210ac`; summary view `ev_8065af9fe5dee81de8bff54582240f5869ed29e9566ff11547902f3d9d28e274`. Directory digest: `c3e543a1167d26befaa2a3b5feb22321f8113295bb5818cc8f6f5d8dd9aa4326`. It examined 328 relevant files, parsed 323 JS files, and reported no parse failures, but hit timeout/result/heap budgets. Its semantic graph is incomplete. The focused findings below are independently located in the literal shipped bundles, using zero-based JavaScript string offsets (UTF-16), not inferred from a complete REA call graph. These are static observations, not claims of live Heptabase execution.

| Asset in `build/assets` | SHA-256 |
| --- | --- |
| `useChangeAppTheme-lf6Qihjj.js` | `c62817130f35e11b2cb50775c47047174bac8960e7da8fc8360a5fc97dba9b3a` |
| `createHighlightElementData-x-KsNHbb.js` | `1654909d96e57855c9ecf63532d604f47c0bcc41563de33c3eea82fd9515fd5f` |
| `useChangeAppTheme-Ch50NDsU.css` | `7e62347a99223eabc7657404dc84689e56e48c1fff6a2a635168faa18aa0d9c2` |
| `MarkdownPreviewer-BGBFnEV6.css` | `a22f99ab0ea492d2bb1814044fce73bad81ed241e66eec6e77a3b53a1ce786ad` |
| `uImageV-CkX-KoFe.js` | `6c6f560346b4b68ca86a310808b7227e118222019da6b82423d3eeeb281ad1a6` |

## Keys and block editing

`useChangeAppTheme-lf6Qihjj.js`, around 213,000, registers the ProseMirror keymap with ordered command chains. `Mod` maps to Command on macOS. Direct observations:

| Key | Shipped implementation | Reconstruction |
| --- | --- | --- |
| Enter | Ordered chain including `rO`; at 162,000 `rO` deletes the selection then calls `split(pos,2)` and resets list attrs | Split at caret/selection into siblings, carry descendants with the right half; empty bullet exits/lifts |
| Tab | `Tab: As(Ure(), o)`; imported `Ure` is `sz` in `createHighlightElementData…`, 871,635 | Nest a bullet and its descendants under its previous sibling |
| Shift+Tab | `"Shift-Tab": As(Zre(), o)`; imported `Zre` is `JR`, 866,367 | Lift one level, or remove the root bullet marker |
| ⌘⇧↑ | `"Shift-Mod-ArrowUp": gO()`; `gO`, 174,831, deletes/inserts the whole node and restores selection | Move the block with all children among siblings |
| ⌘⇧↓ | `"Shift-Mod-ArrowDown": hO()`; `hO`, 174,218, inserts/deletes the whole node and restores selection | Move the block with all children among siblings |
| Backspace | Ordered chain; heading-start conversion `bTe` at 159,809; imported list commands `YR`/`XR` at 867,232/867,495 unwrap a list item at its start, with empty-item checks | Start of nested bullet lifts it; start of root bullet merges up, including an empty bullet |
| ⌘B / ⌘I | Strong/em marks in the shipped ProseMirror base keymap (`Ud` in `createHighlightElementData…`) | Browser inline formatting commands, persisted as Markdown |
| Fold caret / ⌘. | Fold attrs and hidden-child CSS established below; no exact literal `Mod-.` registration found in the inspected keymap | Accessible caret plus the explicitly requested ⌘. shortcut; this key is a product choice, not a verified Heptabase default |

The original move commands can cross list boundaries and enter expanded neighbouring list items. This implementation deliberately moves among siblings; Tab/Shift+Tab control hierarchy explicitly.

## Bullets, typography and folding

- `createHighlightElementData…` `Kd` at 167,150 creates separate uneditable bullet and indentation-hint DOM, plus an editable `contentDOM` for nested blocks. `qd` marks `childCount > 1` as having nested blocks. Its `Gd` at 167,019 reads `attrs.folded` for both `toggle_list_item` and `bullet_list_item`.
- `MarkdownPreviewer-BGBFnEV6.css`, 59,140 onward: folded `.nestedBlocks > :not(:first-child) { display:none }`. The first content line remains visible. A folded toggle rotates −90 degrees; a folded bullet gains a background marker. Nested content is a flex column, with a 1 px guide line below the bullet.
- List items have top/bottom margin 1 px and left padding `.125rem` (2 px at a 16 px root). Bullet gutter width is `1.75rem` (28 px), right margin `.125rem` (2 px): approximately 32 px per nested level including padding. Bullet pseudo-element font is `1.5em`; its line box is `2rem` (32 px). Hover target is 16×16 px, centered on the bullet. The second nested block gets `.125rem` top margin.
- `useChangeAppTheme-Ch50NDsU.css`, 670 onward: ProseMirror body is **17 px / 1.5**, normal weight; whitespace wraps and words can break. Heading sizes are **31.875 px / 1.3**, **25.5 px / 1.3**, **19.89 px / 1.3**. `strong` is weight 600. Heading top margins: h1 1.1em, h2 1em, h3 .9em, with .25em bottom margins. First/last general editor blocks receive 1rem outer spacing.
- `createHighlightElementData…` `nP`, 788,430, serializes indentation as **two spaces per level**.

Creator Compiler uses the observed heading sizes and 32 px visual indentation, a slightly tighter 15 px body for its current 280 px board cards, and CSS color tokens with fallbacks. Both card and full-size note use the same surface. Folding is UI-only and never alters the Markdown or hides text from agents reading the file; it resets when the editor is reopened. Heading content edits preserve its original Markdown prefix; the first ordinary line is styled as the large title even without `#`.

## Images

- `uImageV-CkX-KoFe.js`, around 115,727, defines image attrs `fileId`, `reference`, `src`, `alt`, `title`, `width`, `originalWidth`, `originalHeight`, and alignment. Images are real media nodes, not HTML injected into text.
- `useChangeAppTheme-lf6Qihjj.js` `zO` at 196,707 handles paste/drop: it computes the drop/caret position, replaces the selected slice, dispatches a transaction with paste metadata, then uploads temporary files with `Promise.allSettled`. Empty-paragraph placement differs from insertion after a populated block. `BO` follows and handles media in the pasted slice.
- The static node-view call around 329,155 passes source plus original width/height to its media renderer. Original dimensions are represented, but this bounded investigation does not establish every resize handle, fitting policy or export detail in live Heptabase.

Creator Compiler saves supported raster images as `notes/assets/<random-id>.<ext>` in the board's own files. POST/GET `/board/images` work for video and channel boards. The response provides a **relative Markdown path from the note's directory**, including for top-level imported notes and pinned notes in the configured Notes folder. A note with a changed/unselected Notes folder cannot upload or read through its old identity. Local rendering resolves paths through the endpoint, confined to the note root or this board's asset directory, checks every path component for symlinks, rejects traversal and active protocols, and signature-checks supported image bytes. SVG/HTML are refused. Uploaded files are retained when their Markdown reference is deleted, so deleting one card cannot break another reference.

Paste/drop puts `![](relative-path)` on its own line at the caret, between the two halves of the current text. The image fills available card width and keeps its natural aspect ratio. Clicking selects; Backspace/Delete removes the Markdown image block; Enter starts text after it. Upload failure keeps the note text and shows a warning. Text typed during an upload is retained. Remote HTTP(S) Markdown images remain remote. No resize or crop control is included in #12.

## Dependency decision and ownership

No new dependency. The existing Markdown inline parser, safe HTML renderer and serializer already support headings, bold, italic and links. A small contenteditable per block plus an immutable pure tree supplies the missing outliner operations. Source prefixes, whitespace, unknown syntax, fenced blocks, BOM and line endings are retained until that block is edited. The existing note writer still handles debounce, hashes, external changes, conflict copies and failed-save recovery. `note-save.ts` and the unrelated scene-drafting `useDraft.ts` did not need changes. Undo/redo covers typing and tree/image edits; no full-schema import migration is needed. Adopting ProseMirror here would introduce a dependency and require a second source-preservation mapping on top of the repository's existing Markdown implementation.

Only assigned editor/file/server paths were edited. `server/club/index.ts` also contains concurrent avatar work from another agent; image edits are limited to the import, upload middleware, and two `/board/images` routes. No Board.tsx or theme files were edited by this implementation.

### Board owner integration

The existing empty-canvas image drop already creates a standalone image tile. To make it a Markdown image card backed by the new board files instead, import `createImageCardFromFile` from `./useBoardFiles`, then use this in the canvas image-drop path, supplying the drop point in board coordinates:

```ts
board.adopt([await createImageCardFromFile(boardId,file,point)]);
```

The exported helper uploads, creates a Markdown note and persists its position; errors reject for the Board's normal toast. **This hook remains for the Board owner.** `NotePanel` accepts optional `boardId`; passing `boardId={boardId}` is also recommended at its existing call site. It currently resolves the video/channel identity from the route, so full-size image viewing/editing works without that change.

## Verification

Targeted model, editor, note and HTTP tests cover round-trip preservation; indent/outdent; move with descendants; split/merge; fold; caret retention during typed prefix conversion; upload/insert/delete; failures; external file updates/conflict copies; local path security; channel and pinned-note assets; empty-canvas helper placement. Exact final commands/counts are recorded in the implementation handoff.

Browser script: `/tmp/cc-outliner-browser.cjs`, isolated **headless Google Chrome via cached puppeteer-core**, shared app `http://127.0.0.1:4183`, existing API on :4184. It types character by character, enters nested bullets, tabs, presses ⌘⇧↑, folds/unfolds, dispatches a clipboard image through the real paste handler, checks saved Markdown through the API, opens the shared full-size outliner, edits and closes it, deletes/undoes the image, and reloads the board to verify persistence. Browser result: `/tmp/cc-outliner-shots/browser-result.json`; zero page errors. Verified image dimensions in the full-size panel: 646×323 from 960×480 original.

Screenshots:

- `/tmp/cc-outliner-shots/headless-folded.png`
- `/tmp/cc-outliner-shots/headless-board-image.png`
- `/tmp/cc-outliner-shots/headless-fullsize.png`

The shared preview first verified keyboard movement/folding/image loading. Its legacy TileHead open button was hidden by concurrent Board chrome; its click attempts failed. Headless verification used the Board owner's visible **Open card in sidebar** control successfully. These were browser-driver/selector failures, not skipped full-size acceptance.

Final targeted run (65/65 passing):

```sh
cd recorder/app
npx tsc --noEmit
npx tsx --test src/club/workspace/outline-model.test.ts src/club/workspace/outliner.test.ts src/club/workspace/board-notes.test.ts src/club/workspace/note-panel.test.ts server/club/board-images.test.ts server/club/board-files.test.ts
```

Counts: outline model 27, outliner UI 9, board notes 10, note panel 6, image HTTP 5, board-file HTTP 8. TypeScript and `git diff --check` passed. Full test suite and build were not run, as requested. Additional headless check `/tmp/cc-outliner-format-browser.cjs` verified bold, italic and ⌘K links persisted as `[***text***](https://…)`; log `/tmp/cc-outliner-format-browser.log`. The full-size screenshot was recaptured after the sheet animation completed.

Remaining integration is the Board-owner canvas hook above. Moves are among siblings, folds reset on reopen, and unsupported Markdown is preserved rather than given dedicated editing controls. No dependencies, commits, pushes or dev-server lifecycle changes.
