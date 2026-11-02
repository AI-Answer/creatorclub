import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Edit's chrome rules from the Task 14 walk, checked on the source: the player is never replaced by a preview, toasts never cover the timeline, narrow windows keep labels and chips readable. */
const read=(file:string)=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

test('Task 14: a hover preview never replaces the player: it is a badge over it and a small inset',()=>{
 const app=read('./App.tsx'),css=read('./editing-club.css');
 assert.doesNotMatch(app,/<Keep visible=\{!preview\?\.review\}><Stage/,'the stage is not hidden while previewing');
 assert.match(app,/className="club-preview-inset"/);
 assert.match(css,/\.club-preview-inset\{position:absolute;[^}]*width:min\(300px,38%\)/,'the before/after plays in a corner inset');
 assert.match(css,/\.club-preview-badges\{position:absolute;/,'badges sit over the player');
 const club=read('./club/club.css');
 assert.match(club,/:where\(\.club-root\) \.btn \{[^}]*border: 1px solid/,'the sheet\'s actions use the one shared button, which reaches inside the editor');
 assert.doesNotMatch(css,/\.club-sheet \.btn[:{]/,'no second button style for the sheet');
});

test('Task 14: toasts sit top-right, never over the timeline or Continue; 1280 px keeps labels, transcript room and every scene chip',()=>{
 const css=read('./editing-club.css'),club=read('./club/club.css');
 assert.match(css,/\.club-root:has\(\.club-embed\) \.cc-toasts\{top:72px;right:20px;bottom:auto/);
 assert.match(css,/\.club-embed \.toast\{top:72px;right:20px;bottom:auto/);
 assert.match(css,/\.club-edit-suggestion>span\{flex:1 1 150px;min-width:150px/,'the suggestion keeps its words while exporting');
 assert.match(css,/\.edit-workspace\.club-edit\{[^}]*grid-template-columns:var\(--club-rail\) var\(--club-panel\) minmax\(0,1fr\)/,'rail, panel, then the picture and timeline, as in the mock-up');
 assert.match(css,/@media \(max-width:1439px\)\{\.club-embed \.app-shell\[data-mode=Edit\]\{--club-panel:276px\}\}/,'the panel narrows at 1280 instead of the picture');
 assert.match(club,/\.sc-row:where\(:not\(\.club-embed \*\)\) \{[^}]*overflow-x: auto/,'the scenes are one row that scrolls sideways instead of wrapping onto a second line');
});
