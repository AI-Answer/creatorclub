# Borumi timeline interaction study and Creator Compiler repair

Read-only study, 2026-11-03. Source: `/Applications/Borumi.app/Contents/Resources/ui/assets/index-2TDxNpOf.js`, formatted only into `/tmp/cc-timeline/borumi/index.js` with Prettier 3.3.3. Also read `borumi-ui-spec.md` and `../editor.md`. No Borumi project, application bundle, or source media was modified.

REA artifact SHA-256: `63bf03e7876c4df0b1bb7e89dabceb7220e794d45eb42f4a64551223bd0cb484`. Retained evidence `ev_44f827cdac811e2d872eeb7a8aa2fb112d3c1e6ad7de58c6a62489bd7516960f`; summary `ev_ad9cc741566dadd1827aa193f83725d518fc386b9f6cdcf964487935e328246f`. Seven JavaScript files parsed as inert text. REA semantic coverage is partial (worker heap limits on the two largest bundles); focused ordinary source reads below establish UI dispatch behavior, not native-engine execution.

## Observed rules

| Interaction | Shipped UI evidence (formatted main chunk) | Meaning and limits |
|---|---|---|
| Split | `OF`, around 36540; keyboard around 68661 | Establish selection (blade may supply override), then dispatch split at an absolute playhead position as one interaction. Native decides the resulting pieces. |
| Linked selection | `expandedSelection`, grouped blocks and `project.timeline.group` / `ungroup`, around 42275–42734 | Commands use expanded grouped selections. Unlink is explicit; splitting audio/video is distinct from ungrouping. |
| Normal clip move | `Q7`, `F0`, `eF`, `oF`, around 35580–35915 | Preview while dragging; pointer over an eligible clip selects its start/end by midpoint; release dispatches one `ripple_move` before/after that segment. Source/destination selection uses clip families. |
| Free move/layering | Same handlers; `N7` overlap indicators around 35280 | Separate ordinary absolute move and vertical order update. Free visual overlaps can generate separate rendered layers; the UI does not prove destructive overwrite. Source gap can be `CloseWhenAdjacent`. Shift bypasses insertion in Borumi. |
| Ripple vs leave gap | `hy` around 42313 and context menu around 42680; `pF` around 36000 | Delete vs Delete and Leave Gap send different ripple preference. Trim/untrim sends `prefer_ripple`. Exact native push/trim heuristics are not shipped in this UI. |
| Snapping | `Fr`, `kj`, `Cj`, `F0` around 34798–34970, 35720 | Magnet gate; start and end anchors; category-filtered clip edges; original boundaries regain priority after moving away. Threshold is 1.5% of visible duration; a 2px start-anchor bias avoids jitter. Explicit playhead/scene snapping is a Creator Compiler requirement; not fully established by this UI trace. |
| Trim edges | `pF` / `mf` around 35980–36270 | Trim vs untrim inferred from source edges; snap preview; one command at release; seek-to-boundary requested on inward trims. |
| Scene bounds/reordering | `Q7` cancels multi-scene selection; absolute placement and insertion segment carries scene ID; `h7`/`p7` around 35080 | A gesture starts from one scene; insertion can target a segment in another scene. Ordering uses family and segment order, not arbitrary reassignment of recording provenance. Native scene transfer behavior remains opaque. |
| Gaps | Move `source_gap`, explicit leave-gap delete, insertion preview | Gaps are intentional modes. Plain linked dialogue reorder should close the source hole and make destination room. |
| Captions | `xz`, `yz`, `wz`, `Oz` around 39320–39750 | Caption words are sampled from transcription in the clip's media start/end/speed and rendered inside the clip; they are not unbounded timeline labels. |
| Undo | Interaction IDs at move/trim/split dispatch; spec header/history sections | Pointer updates are previews; release is one edit command. Undo/redo labels come from native history. |
| Waveforms | `cz` / `dz` around 39133–39244 | Paired min/max samples form a filled mirrored path, primary color with 1px stroke. Native amplitude normalization is not visible. |

## Implemented model

Creator Compiler uses explicit link groups for each take slice, source-time caption projection, a single edit on gesture release, insertion/reorder by default, and Alt for a deliberate gap/free placement (trim uses Alt to disable ripple). It permits visual layering through explicit layer moves while preventing same-row overlap. All editor surfaces share these primitives. Snap targets include the playhead, clip edges and scene bounds and honor the magnet. Escape cancels previews. Existing scene ranges remain nonoverlapping; take provenance is retained when pieces reorder, and whole-scene reorder remains the existing separate scene gesture.

Captions are split against narration source ranges before source reordering, then projected back into each destination piece. The timeline renders words inside their owning clip, including the drag preview; a clip with no words gets no empty caption band. Copy/paste includes linked pieces and their source captions, with independent links for the copy.

The false conflict came from `automatic-captions` storage events being treated like external edits despite already having that source marker. The editor now validates a captions-only delta and rebases current, undo and redo snapshots in source time under the save queue. An HTTP 409 that races ahead of SSE follows the same validated merge/retry path. Genuine other-content changes preserve the draft and show a calm nonmodal notice.

The black preview had two contributing paths: ordinary free moves could leave holes, and an exact end-boundary playhead selects no half-open clip range. Default insertion prevents newly orphaned gaps; source bounds clamp linked trims; the stage shows the final frame when transport rests exactly on the end boundary. Deliberately empty timeline time stays empty.

Waveform extraction retains absolute peaks; a fixed -72 to 0 dBFS display range makes quiet speech readable without per-source normalization. Video with unknown legacy audio metadata is probed rather than discarded. Audio-bearing camera/video clips subscribe to the same waveform cache.

## Validation

`npm run build` passed. Serial `npm test` passed: 1,709 tests, 1,708 passed, zero failed, one existing skip (local consented portrait fixture absent). The subsequently added scene-boundary/clip-edge/playhead magnet regression passed with the complete `timeline-drag.test.ts` file (10/10).

An isolated web server ran on port 4287 with `SCENEFORGE_DATA_DIR`, `CREATORCLUB_DIR` and `CREATORCLUB_SECRETS_DIR` all under `/tmp/cc-timeline/`. Synthetic screen/camera/audio media formed a 12-second linked take. The live editor split it into independent three-track groups, reordered the right microphone piece backward and forward with its camera/screen and words, restored the split state with one Undo, and canceled a later drag with Escape. Saved project JSON confirmed aligned source ranges, no overlaps and no gaps. The exact-end preview retained decoded camera and screen frames. No conflict notice appeared. Automation merge races and history preservation were verified by hook tests; no live transcription model was invoked. Browser drag automation failed (timeout/invalid selector), so the drag checks dispatched DOM pointer events through the actual React handlers.

Screenshots and verification fixtures/logs are in `/tmp/cc-timeline/`: `before.png`, `after-split.png`, `drag-preview.png`, `after-drag.png`, `after-forward.png`, `at-end.png`, `after-split.json`, `after-drag.json`, `final-build.log`, `final-tests.log`, and `snapping.log`. These are editing acceptance checks, not final exported-video/audio-quality review.
