import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {installFetch} from '../test-fakes';
import {boardImageSource} from './board-files';
import {createImageCardFromFile} from './useBoardFiles';
const {Outliner}=await import('./Outliner');
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
function caret(el:HTMLElement,start:number,end=start){el.focus();const selection=document.getSelection()!,range=document.createRange();if(!el.firstChild)el.append(document.createTextNode(''));range.setStart(el.firstChild!,start);range.setEnd(el.firstChild!,end);selection.removeAllRanges();selection.addRange(range);}
const press=(el:HTMLElement,key:string,init:KeyboardEventInit={})=>act(async()=>{el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...init}));});
const editor=(root:HTMLElement,text:string)=>[...root.querySelectorAll<HTMLElement>('[contenteditable=true]')].find(el=>el.textContent===text)!;

test('card title, headings and safe rich inline markup render without introducing HTML',async()=>{
 const ui=await mountUI(createElement(Outliner,{value:'# Title\n## Details\n- **Bold** *italic* [docs](https://example.com)\n- <img src=x onerror=alert(1)>',onChange:()=>{},label:'Note'}));
 try{assert.equal(ui.container.querySelector('.outliner-title')?.textContent,'Title');assert.equal(ui.container.querySelector('h2')?.textContent,'Details');assert.equal(ui.container.querySelector('strong')?.textContent,'Bold');assert.equal(ui.container.querySelector('em')?.textContent,'italic');assert.equal(ui.container.querySelector('a')?.getAttribute('href'),'https://example.com');assert.equal(ui.container.querySelector('img'),null);}finally{await ui.close();}
});
test('Enter, Tab, move with children, fold, unfold and undo work without leaking keys to the board',async()=>{
 const values:string[]=[];const ui=await mountUI(createElement(Outliner,{value:'# Title\n- A\n- B\n  - child\n- C',onChange:(v:string)=>values.push(v),label:'Note'}));
 try{
  const b=editor(ui.container,'B');caret(b,1);await press(b,'ArrowUp',{metaKey:true,shiftKey:true});assert.equal(values.at(-1),'# Title\n- B\n  - child\n- A\n- C');
  const a=editor(ui.container,'A');caret(a,1);await press(a,'Tab');assert.equal(values.at(-1),'# Title\n- B\n  - child\n  - A\n- C');
  await press(editor(ui.container,'B'),'.',{metaKey:true});assert.equal(editor(ui.container,'child'),undefined);assert.equal(editor(ui.container,'A'),undefined);
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Unfold block"]')!.click());assert.ok(editor(ui.container,'child'));
  const child=editor(ui.container,'child');caret(child,2);await press(child,'Enter');assert.equal(values.at(-1),'# Title\n- B\n  - ch\n  - ild\n  - A\n- C');
  await press(editor(ui.container,'ild'),'z',{metaKey:true});assert.ok(editor(ui.container,'child'));assert.equal(editor(ui.container,'ild'),undefined);
 }finally{await ui.close();}
});
test('typing Markdown prefixes keeps focus and subsequent typing in that block',async()=>{
 const values:string[]=[];const ui=await mountUI(createElement(Outliner,{value:'Title\n\n',onChange:(v:string)=>values.push(v),label:'Note'}));
 try{
  const blank=editor(ui.container,'');await act(async()=>{blank.textContent='- New bullet';caret(blank,12);blank.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(document.activeElement,blank);assert.equal(blank.textContent,'New bullet');assert.equal(document.getSelection()?.anchorOffset,10);
  await press(blank,'Enter');assert.equal(values.at(-1),'Title\n- New bullet\n- \n');
 }finally{await ui.close();}
});
test('paste image uploads only once, stops canvas propagation, and inserts relative Markdown at the caret; Backspace deletes it',async()=>{
 const values:string[]=[];const server=installFetch(call=>call.path==='/videos/v1/board/images'?{status:201,body:{path:'notes/assets/test.png',markdown:'assets/test.png'}}:undefined);
 let bubbled=0;const ui=await mountUI(createElement('div',{onPaste:()=>bubbled++},createElement(Outliner,{value:'Title\n- beforeafter',onChange:(v:string)=>values.push(v),label:'Note',boardId:'v1',tileId:'t1'})));
 try{
  const target=editor(ui.container,'beforeafter');caret(target,6);
  await act(async()=>{const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[new File(['pixels'],'paste.png',{type:'image/png'})],getData:()=>''}});target.dispatchEvent(event);});await tick();
  assert.equal(bubbled,0);assert.equal(server.calls.filter(call=>call.method==='POST').length,1);assert.equal(values.at(-1),'Title\n- before\n![](assets/test.png)\nafter');
  const image=ui.container.querySelector<HTMLImageElement>('img')!;assert.match(image.getAttribute('src')!,/board\/images\?src=assets%2Ftest.png&tile=t1/);
  await act(async()=>image.parentElement!.click());await press(image.parentElement!,'Backspace');assert.equal(ui.container.querySelector('img'),null);assert.equal(values.at(-1),'Title\n- before\nafter');
 }finally{await ui.close();server.restore();}
});
test('an image upload failure keeps the entire note and exposes a useful error',async()=>{
 const values:string[]=[];const server=installFetch(()=>({status:400,body:{error:'Choose a PNG image.'}}));
 const ui=await mountUI(createElement(Outliner,{value:'Title\nText',onChange:(v:string)=>values.push(v),label:'Note',boardId:'v1',tileId:'t1'}));
 try{const target=editor(ui.container,'Text');caret(target,2);await act(async()=>{const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{files:[new File(['bad'],'bad.png',{type:'image/png'})]}});target.dispatchEvent(event);});await tick();assert.equal(values.length,0);assert.equal(ui.container.querySelector('[role=alert]')?.textContent,'Choose a PNG image.');assert.ok(editor(ui.container,'Text'));}finally{await ui.close();server.restore();}
});
test('local image URLs cannot inject protocols; empty-canvas helper uploads, creates a Markdown image card, and places it',async()=>{
 assert.equal(boardImageSource('v1','t1','javascript:alert(1)'),undefined);assert.equal(boardImageSource('v1','t1','//example.com/a.png'),undefined);assert.equal(boardImageSource('v1','t1','https://example.com/a.png'),'https://example.com/a.png');
 const server=installFetch(call=>call.path.endsWith('/board/images')?{status:201,body:{path:'notes/assets/a.png',markdown:'assets/a.png'}}:call.method==='POST'?{status:201,body:{id:'t1',kind:'note'}}:{body:{id:'t1',kind:'note',pos:{x:15,y:30}}});
 try{const tile=await createImageCardFromFile('v1',new File(['x'],'a.png',{type:'image/png'}),{x:15,y:30});assert.deepEqual(tile.pos,{x:15,y:30});assert.deepEqual(server.calls[1].body,{kind:'note',text:'![](assets/a.png)'});assert.deepEqual(server.calls[2].body,{pos:{x:15,y:30}});}finally{server.restore();}
});

test('Command-K opens the inline link control and refuses an active URL without changing the note',async()=>{
 const changes:string[]=[];const ui=await mountUI(createElement(Outliner,{value:'Title\nDocs',label:'Note',onChange:(s:string)=>changes.push(s)}));
 try{const docs=editor(ui.container,'Docs');caret(docs,0,4);await press(docs,'k',{metaKey:true});const input=ui.container.querySelector<HTMLInputElement>('[aria-label="Link address"]')!;assert.ok(input);await act(async()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;set.call(input,'javascript:alert(1)');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>ui.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.match(ui.container.querySelector('[role=alert]')!.textContent!,/web or email/);assert.deepEqual(changes,[]);}finally{await ui.close();}
});

test('pasting multiple images preserves the text after the caret and their order',async()=>{
 const values:string[]=[];let number=0;const server=installFetch(()=>({status:201,body:{path:`notes/assets/${++number}.png`,markdown:`assets/${number}.png`}}));
 const ui=await mountUI(createElement(Outliner,{value:'Title\nBeforeAfter',label:'Note',boardId:'v1',tileId:'t1',onChange:(s:string)=>values.push(s)}));
 try{const target=editor(ui.container,'BeforeAfter');caret(target,6);await act(async()=>{const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[new File(['1'],'a.png',{type:'image/png'}),new File(['2'],'b.png',{type:'image/png'})]}});target.dispatchEvent(event);});await tick();assert.equal(values.at(-1),'Title\nBefore\n![](assets/1.png)\n![](assets/2.png)\nAfter');assert.equal(ui.container.querySelectorAll('img').length,2);}finally{await ui.close();server.restore();}
});
test('indenting under a folded sibling opens it and keeps the moved block focused',async()=>{
 const ui=await mountUI(createElement(Outliner,{value:'Title\n- Parent\n  - Old child\n- New child',label:'Note',onChange:()=>{}}));
 try{await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Fold block"]')!.click());const child=editor(ui.container,'New child');caret(child,4);await press(child,'Tab');assert.ok(editor(ui.container,'Old child'));assert.ok(editor(ui.container,'New child'));assert.equal(document.activeElement?.textContent,'New child');}finally{await ui.close();}
});

const input=async(el:HTMLElement,value?:string)=>act(async()=>{if(value!==undefined)el.textContent=value;el.dispatchEvent(new Event('input',{bubbles:true}));});
const pasteText=async(el:HTMLElement,text:string)=>act(async()=>{const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[],getData:()=>text}});el.dispatchEvent(event);});
test('editing raw fences and frontmatter preserves the separator before the next block',async()=>{
 for(const [source,before,after] of [['```js\nconst x = 1;\n```\nAFTER','const x = 1;','const x = 2;'],['```\r\n*literal*\r\n```\r\nAFTER','*literal*','*edited*'],['---\nname: Old\n---\n# Heading','name: Old','name: New']]){
  const changes:string[]=[],ui=await mountUI(createElement(Outliner,{value:source,label:'Note',onChange:(value:string)=>changes.push(value)}));
  try{const raw=ui.container.querySelector<HTMLElement>('.outliner-raw')!;await input(raw,raw.textContent!.replace(before,after));assert.equal(changes.at(-1),source.replace(before,after));}finally{await ui.close();}
 }
});
test('multiline paste keeps the target marker and nesting, moves its tail and children to the last sibling',async()=>{
 const changes:string[]=[],ui=await mountUI(createElement(Outliner,{value:'- Parent\n  - Child\n    - Grandchild\n- Next',label:'Note',onChange:(value:string)=>changes.push(value)}));
 try{const child=editor(ui.container,'Child');caret(child,3);await pasteText(child,'X\nY');assert.equal(changes.at(-1),'- Parent\n  - ChiX\n  - Yld\n    - Grandchild\n- Next');assert.equal(document.activeElement?.textContent,'Yld');assert.equal(document.getSelection()?.anchorOffset,1);}finally{await ui.close();}
});
test('typing after escaped stars, brackets and backslashes keeps them literal on reopen',async()=>{
 for(const [source,plain] of [['\\*literal\\*','*literal*'],['\\[literal\\]','[literal]'],['path\\\\tail','path\\tail']]){
  const changes:string[]=[],ui=await mountUI(createElement(Outliner,{value:source,label:'Note',onChange:(value:string)=>changes.push(value)}));
  try{const el=editor(ui.container,plain);assert.ok(el);await input(el,plain+'!');assert.equal(changes.at(-1),source+'!');await ui.render(createElement(Outliner,{value:'Other',label:'Note',onChange:()=>{}}));await ui.render(createElement(Outliner,{value:changes.at(-1)!,label:'Note',onChange:()=>{}}));assert.equal(ui.container.querySelector('em'),null);assert.equal(editor(ui.container,plain+'!')?.textContent,plain+'!');}finally{await ui.close();}
 }
});
test('a no-op DOM edit of every tricky Markdown block preserves the original bytes',async()=>{
 const corpus=['---\nname: Plan\n---\n# Heading','```\n*literal*\n```\nAFTER','```ts\r\nconst x = 1;\r\n```\r\nAFTER\r\n','- Parent\n  - Child\n    ```js\n    nested()\n    ```\n- Sibling','1) First\n   4. Child\n2) Last','| a | b |\n|---|---|\n| x | y |\n<p>raw & HTML</p>\n','\n \n\n','\\*literal\\* \\[x\\] \\\\ tail','[Embedded table: "x" — itemId y]\nTrailing text','\uFEFF# Title\r\n\r\n*  one  \r\n\t+ child\r\nend','__bold__ and _italic_  '];
 for(const source of corpus){const readNow:{current:(()=>string)|undefined}={current:undefined},ui=await mountUI(createElement(Outliner,{value:source,label:'Note',onChange:()=>{},readNow}));
  try{for(const el of ui.container.querySelectorAll<HTMLElement>('[contenteditable=true]')){await input(el);assert.equal(readNow.current!(),source,JSON.stringify(source));}}finally{await ui.close();}
 }
});

test('multiline paste replaces a selection and preserves numbered markers, CRLF and final-newline state',async()=>{
 const changes:string[]=[],ui=await mountUI(createElement(Outliner,{value:'1) Parent\r\n   4. Child',label:'Note',onChange:(value:string)=>changes.push(value)}));
 try{const child=editor(ui.container,'Child');caret(child,2,4);await pasteText(child,'X\r\nY\r\nZ');assert.equal(changes.at(-1),'1) Parent\r\n   4. ChX\r\n   4. Y\r\n   4. Zd');}finally{await ui.close();}
});
test('multiline paste inside a raw fence keeps code literal and the following separator',async()=>{
 const changes:string[]=[],ui=await mountUI(createElement(Outliner,{value:'```\nold\n```\nAFTER',label:'Note',onChange:(value:string)=>changes.push(value)}));
 try{const raw=ui.container.querySelector<HTMLElement>('.outliner-raw')!;caret(raw,4,7);await pasteText(raw,'*X*\n[Y]');assert.equal(changes.at(-1),'```\n*X*\n[Y]\n```\nAFTER');}finally{await ui.close();}
});
