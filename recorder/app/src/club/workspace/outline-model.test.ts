import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteBlock,findBlock,imageMarkdown,indentBlock,insertImage,mergeBlock,moveBlock,outlineBlocks,outdentBlock,parseOutline,serializeOutline,setBlockText,splitBlock,toggleFold,visibleBlocks} from './outline-model';
const text=serializeOutline;
const key=(doc:ReturnType<typeof parseOutline>,words:string)=>outlineBlocks(doc).find(block=>block.text===words)!.id;
for(const markdown of ['', '# Plan\n\n- Why people click\n  - Appeal\n    - Proof\n- Risks\n', '\uFEFF# Title\r\n\r\n*  one  \r\n\t+ child\r\nend', '---\nname: Plan\n---\n\n# Plan\n\n```ts\n- not a bullet\n\n```\n| a | b |\n|---|---|\n<p>raw & HTML</p>\n', '1) numbered\n   continuation\n\n   4. child\n2) two', '# No trailing newline', '-\n  -\n', '- a\r- b\r', '![ref](assets/photo.png)\n']){
 test(`round trip preserves source ${JSON.stringify(markdown).slice(0,65)}`,()=>assert.equal(text(parseOutline(markdown)),markdown));
}
test('the tree has nested bullets and preserves unsupported Markdown elsewhere when one line is edited',()=>{
 const doc=parseOutline('# Title\n\n*  one\n    + child\n\n```js\n- untouched\n```\n');
 assert.equal(findBlock(doc,key(doc,'one'))!.children[0].text,'child');
 assert.equal(text(setBlockText(doc,key(doc,'child'),'changed')),'# Title\n\n*  one\n    + changed\n\n```js\n- untouched\n```\n');
 assert.match(text(doc),/\+ child/,'operations are immutable');
});
test('indent adopts the preceding sibling and carries the complete subtree',()=>{
 const doc=parseOutline('- A\n- B\n  - child\n    - grandchild\n- C\n');
 const next=indentBlock(doc,key(doc,'B'));
 assert.equal(text(next),'- A\n  - B\n    - child\n      - grandchild\n- C\n');
 assert.equal(text(outdentBlock(next,key(next,'B'))),text(doc));
 assert.equal(indentBlock(doc,key(doc,'A')),doc);
});
test('indent reuses existing tabs and four-space child indentation',()=>{
 const tab=parseOutline('- A\n\t- old\n- B\n');assert.equal(text(indentBlock(tab,key(tab,'B'))),'- A\n\t- old\n\t- B\n');
 const wide=parseOutline('- A\n    - old\n- B\n');assert.equal(text(indentBlock(wide,key(wide,'B'))),'- A\n    - old\n    - B\n');
});
test('outdent lifts one level with all children and a root bullet becomes a paragraph',()=>{
 const doc=parseOutline('- A\n  - B\n    - C\n');
 assert.equal(text(outdentBlock(doc,key(doc,'B'))),'- A\n- B\n  - C\n');
 assert.equal(text(outdentBlock(doc,key(doc,'A'))),'A\n  - B\n    - C\n');
});
for(const direction of [-1,1] as const){test(`move ${direction} swaps whole sibling subtrees`,()=>{
 const doc=parseOutline('- A\n  - a1\n- B\n  - b1\n    - b2\n- C\n');const next=moveBlock(doc,key(doc,'B'),direction);
 assert.equal(text(next),direction<0?'- B\n  - b1\n    - b2\n- A\n  - a1\n- C\n':'- A\n  - a1\n- C\n- B\n  - b1\n    - b2\n');
 assert.equal(text(moveBlock(next,key(next,'B'),direction===1?-1:1)),text(doc));
});}
test('moves stop at sibling boundaries and insert a separator at an old unterminated final line',()=>{
 const doc=parseOutline('- A\n  - child\n- B');assert.equal(moveBlock(doc,key(doc,'child'),-1),doc);
 assert.equal(moveBlock(doc,key(doc,'A'),-1),doc);assert.equal(moveBlock(doc,key(doc,'B'),1),doc);
 assert.equal(text(moveBlock(doc,key(doc,'B'),-1)),'- B\n- A\n  - child\n');
});
test('Enter splits at the caret, moves descendants with the right half and preserves CRLF',()=>{
 const doc=parseOutline('- Appeal and risk\r\n  - proof\r\n');const edit=splitBlock(doc,key(doc,'Appeal and risk'),7);
 assert.equal(text(edit.doc),'- Appeal \r\n- and risk\r\n  - proof\r\n');assert.equal(findBlock(edit.doc,edit.focus)?.text,'and risk');
});
test('Enter removes a selection, exits an empty root bullet and lifts an empty nested bullet',()=>{
 const doc=parseOutline('- abcdef');assert.equal(text(splitBlock(doc,key(doc,'abcdef'),2,4).doc),'- ab\n- ef');
 const root=parseOutline('- ');assert.equal(text(splitBlock(root,key(root,''),0).doc),'');
 const nested=parseOutline('- A\n  - ');assert.equal(text(splitBlock(nested,key(nested,''),0).doc),'- A\n- ');
});
test('Enter after a heading starts a paragraph',()=>{
 const doc=parseOutline('# Title');assert.equal(text(splitBlock(doc,key(doc,'Title'),5).doc),'# Title\n');
});
test('Backspace merges root bullet text into the preceding block; an empty bullet merges too',()=>{
 const doc=parseOutline('- A\n- B\n  - child\n');const edit=mergeBlock(doc,key(doc,'B'));
 assert.equal(text(edit.doc),'- AB\n  - child\n');assert.equal(edit.offset,1);assert.equal(edit.focus,key(doc,'A'));
 const empty=parseOutline('- A\n- ');assert.equal(text(mergeBlock(empty,key(empty,'')).doc),'- A');
});
test('Backspace lifts a nested block and its children instead of losing them',()=>{
 const doc=parseOutline('- A\n  - B\n    - C\n');assert.equal(text(mergeBlock(doc,key(doc,'B')).doc),'- A\n- B\n  - C\n');
});
test('fold hides every descendant without changing saved Markdown, and toggles back',()=>{
 const doc=parseOutline('- A\n  - B\n    - C\n- D\n');const folded=toggleFold(new Set(),key(doc,'A'));
 assert.deepEqual(visibleBlocks(doc,folded).map(block=>block.text),['A','D']);assert.equal(text(doc),'- A\n  - B\n    - C\n- D\n');
 assert.equal(visibleBlocks(doc,toggleFold(folded,key(doc,'A'))).length,4);
});
test('typing bullet and heading prefixes changes only that block',()=>{
 let doc=parseOutline('Title\n\n');const target=outlineBlocks(doc)[1].id;
 doc=setBlockText(doc,target,'- ');assert.equal(findBlock(doc,target)?.kind,'bullet');assert.equal(text(doc),'Title\n- \n');
 const heading=parseOutline('');assert.equal(findBlock(setBlockText(heading,heading.blocks[0].id,'## Heading'),heading.blocks[0].id)?.level,2);
});
test('image insertion splits the caret line, keeps descendants and stores Markdown paths, never pixels',()=>{
 const doc=parseOutline('# Title\n- beforeafter\n  - child\n');const edit=insertImage(doc,key(doc,'beforeafter'),6,'assets/my image.png');
 assert.equal(text(edit.doc),'# Title\n- before\n![](assets/my%20image.png)\nafter\n  - child\n');
 assert.equal(findBlock(edit.doc,edit.focus)?.text,'after');assert.equal(imageMarkdown('assets/a(b).png'),'![](assets/a%28b%29.png)');
});
test('image insertion on an empty block does not add a redundant blank before it; deleting removes only that image',()=>{
 const doc=parseOutline('');const edit=insertImage(doc,doc.blocks[0].id,0,'assets/a.png');assert.equal(text(edit.doc),'![](assets/a.png)\n');
 const image=outlineBlocks(edit.doc).find(block=>block.kind==='image')!;assert.equal(text(deleteBlock(edit.doc,image.id).doc),'');
 const only=parseOutline('![](x.png)');assert.equal(text(deleteBlock(only,only.blocks[0].id).doc),'');
});

test('a relative image following a nested bullet remains under the same parent after save and reopen',()=>{
 const doc=parseOutline('- Parent\n  - Child\n  ![](assets/a.png)\n  after\n- Sibling');
 assert.deepEqual(doc.blocks[0].children.map(block=>block.kind),['bullet','image','paragraph']);assert.equal(doc.blocks.length,2);
 assert.equal(text(doc),'- Parent\n  - Child\n  ![](assets/a.png)\n  after\n- Sibling');
});

test('typing a bare dash waits for a space before becoming a bullet, so every Enter sibling has valid Markdown',()=>{
 let doc=parseOutline('Title\n\n'),id=doc.blocks[1].id;doc=setBlockText(doc,id,'-');assert.equal(findBlock(doc,id)?.kind,'paragraph');
 doc=setBlockText(doc,id,'- ');assert.equal(findBlock(doc,id)?.kind,'bullet');doc=setBlockText(doc,id,'First');
 const edit=splitBlock(doc,id,5);doc=setBlockText(edit.doc,edit.focus,'Second');assert.equal(text(doc),'Title\n- First\n- Second\n');
 assert.equal(parseOutline(text(doc)).blocks.filter(block=>block.kind==='bullet').length,2);
});


test('nested fenced code folds and moves with its parent without changing its bytes',()=>{
 for(const fence of ['```js','```','~~~']){
  const raw=`  ${fence}\n  const x = 1;\n  ${fence.startsWith('~')?'~~~':'```'}\n`,source=`- Parent\n${raw}- Sibling\n`,doc=parseOutline(source),parent=doc.blocks[0];
  assert.equal(parent.children[0]?.kind,'raw');assert.equal(parent.children[0]?.indent,'  ');assert.equal(text(doc),source);
  assert.deepEqual(visibleBlocks(doc,new Set([parent.id])).map(block=>block.text),['Parent','Sibling']);
  assert.equal(text(moveBlock(doc,parent.id,1)),`- Sibling\n- Parent\n${raw}`);
 }
});
test('tricky Markdown corpus round trips and every block accepts a byte-identical no-op edit',()=>{
 const corpus=['','---\nname: Plan\n---\n# Heading','```\n*literal*\n```\nAFTER','```ts\r\nconst x = 1;\r\n```\r\nAFTER\r\n','- Parent\n  - Child\n    ```js\n    nested()\n    ```\n- Sibling','1) First\n   4. Child\n2) Last','| a | b |\n|---|---|\n| x | y |\n<p>raw & HTML</p>\n','\n \n\n','\\*literal\\* \\[x\\] \\\\ tail','[Embedded table: "x" — itemId y]\nTrailing text','\uFEFF# Title\r\n\r\n*  one  \r\n\t+ child\r\nend'];
 for(const sample of corpus)for(const newline of ['\n','\r\n','\r'])for(const ending of ['',newline]){const source=sample.replace(/\r\n|\r|\n/g,newline)+ending,doc=parseOutline(source);assert.equal(text(doc),source);for(const block of outlineBlocks(doc))assert.equal(text(setBlockText(doc,block.id,block.text)),source,JSON.stringify(source));}
});
