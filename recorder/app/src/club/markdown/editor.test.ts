import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
const {MarkdownEditor,runCommand}=await import('./MarkdownEditor');

const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const pageOf=(container:Element)=>container.querySelector<HTMLElement>('.md-editor')!;
const type=(page:HTMLElement,mutate:()=>void)=>act(async()=>{mutate();page.dispatchEvent(new Event('input',{bubbles:true}));});
const key=(page:HTMLElement,name:string,init:KeyboardEventInit={})=>act(async()=>{page.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...init}));});

/** Records what the editor asks the browser to do, the way `document.execCommand` is asked. */
function recordCommands(){
 const calls:string[]=[];
 const original=document.execCommand;
 document.execCommand=((command:string,_ui?:boolean,value?:string)=>{calls.push(value===undefined?command:`${command}:${value}`);return true;}) as typeof document.execCommand;
 return {calls,restore:()=>{document.execCommand=original;}};
}
/** Puts the caret at the end of an element's text. */
function caretAtEnd(element:Element){
 const range=document.createRange();range.selectNodeContents(element);range.collapse(false);
 const selection=document.getSelection()!;selection.removeAllRanges();selection.addRange(range);
}

test('the editor shows Markdown as blocks and gives Markdown back after writing, once per change',async()=>{
 const changes:string[]=[];
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'# Title\n\n- one\n- [x] two\n\nSome **bold** text.',onChange:(markdown:string)=>changes.push(markdown),label:'Note'}));
 try{
  const page=pageOf(ui.container);
  assert.equal(page.getAttribute('role'),'textbox');assert.equal(page.getAttribute('aria-label'),'Note');assert.equal(page.getAttribute('contenteditable'),'true');
  assert.equal(page.querySelector('h1')?.textContent,'Title');
  assert.deepEqual([...page.querySelectorAll('li')].map(item=>[item.textContent,item.getAttribute('data-checked')]),[['one',null],['two','true']]);
  assert.equal(page.querySelector('strong')?.textContent,'bold');
  assert.equal(page.dataset.empty,'false');
  assert.deepEqual(changes,[],'showing a note changes nothing');
  await type(page,()=>{page.querySelector('h1')!.textContent='A new title';});
  assert.deepEqual(changes,['# A new title\n\n- one\n- [x] two\n\nSome **bold** text.'],'the changed heading is written; the rest, with no final newline, stays as it was');
  await type(page,()=>{});
  assert.equal(changes.length,1,'an input that changes nothing says nothing');
 }finally{await ui.close();}
});

test('Markdown that arrives from outside replaces the page; the editor\'s own text coming back does not',async()=>{
 const changes:string[]=[];
 const make=(value:string)=>createElement(MarkdownEditor,{delay:0,value,onChange:(markdown:string)=>changes.push(markdown),label:'Note'});
 const ui=await mountUI(make('first'));
 try{
  const page=pageOf(ui.container);
  await type(page,()=>{page.firstElementChild!.textContent='typed by hand';});
  const mine=document.createElement('b');page.append(mine);
  await ui.render(make(changes[0]));
  assert.ok(page.contains(mine),'the page the writer is in is not rebuilt for its own text');
  await ui.render(make('# From an agent\n\n- point'));
  assert.equal(page.querySelector('h1')?.textContent,'From an agent');
  assert.equal(page.contains(mine),false);
  assert.equal(changes.length,1,'taking in a file does not report a change');
  await ui.render(make(''));
  assert.equal(page.dataset.empty,'true');
  assert.equal(page.textContent,'');
 }finally{await ui.close();}
});

test('an empty note shows its placeholder, and the label and placeholder can be set',async()=>{
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'',onChange:()=>{},label:'Idea',placeholder:'Start here'}));
 try{
  const page=pageOf(ui.container);
  assert.equal(page.dataset.empty,'true');assert.equal(page.dataset.placeholder,'Start here');assert.equal(page.getAttribute('aria-label'),'Idea');
 }finally{await ui.close();}
});

test('the keys: bold, italic, strike, code and checklist toggle do what they say, and Tab moves a list item',async()=>{
 const spy=recordCommands();
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'- item\n- [ ] task',onChange:()=>{},label:'Note'}));
 try{
  const page=pageOf(ui.container);
  caretAtEnd(page.querySelector('li')!);spy.calls.length=0;
  await key(page,'b',{ctrlKey:true});await key(page,'i',{metaKey:true});await key(page,'x',{ctrlKey:true,shiftKey:true});
  assert.deepEqual(spy.calls,['bold','italic','strikeThrough']);
  spy.calls.length=0;
  await key(page,'Tab');await key(page,'Tab',{shiftKey:true});
  assert.deepEqual(spy.calls,['indent','outdent']);
  const task=page.querySelectorAll('li')[1];caretAtEnd(task);
  await key(page,'Enter',{ctrlKey:true});
  assert.equal(task.getAttribute('data-checked'),'true');
  await key(page,'Enter',{ctrlKey:true});
  assert.equal(task.getAttribute('data-checked'),'false');
 }finally{spy.restore();await ui.close();}
});

test('a checkbox is ticked by clicking it, and by nothing else on the line',async()=>{
 const changes:string[]=[];
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'- [ ] task',onChange:(markdown:string)=>changes.push(markdown),label:'Note'}));
 try{
  const page=pageOf(ui.container),item=page.querySelector('li')!;
  const press=(offsetX:number)=>act(async()=>{const event=new MouseEvent('mousedown',{bubbles:true,cancelable:true});Object.defineProperty(event,'offsetX',{value:offsetX});item.dispatchEvent(event);});
  await press(60);
  assert.equal(item.getAttribute('data-checked'),'false','a click on the words only places the caret');
  await press(8);
  assert.equal(item.getAttribute('data-checked'),'true');
  assert.deepEqual(changes,['- [x] task\n']);
 }finally{await ui.close();}
});

test('the commands: a heading made twice is text again, lists toggle, a quote is left, a checklist item toggles',async()=>{
 const spy=recordCommands();
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'plain\n\n# Heading\n\n- item\n\n> quoted',onChange:()=>{},label:'Note'}));
 try{
  const page=pageOf(ui.container);
  const run=(id:Parameters<typeof runCommand>[1])=>{spy.calls.length=0;runCommand(page,id);return [...spy.calls];};
  caretAtEnd(page.children[0]);
  assert.deepEqual(run('h2'),['formatBlock:h2']);
  assert.deepEqual(run('numbers'),['insertOrderedList']);
  assert.deepEqual(run('quote'),['formatBlock:blockquote']);
  assert.deepEqual(run('code'),['formatBlock:pre']);
  assert.deepEqual(run('divider'),['insertHTML:<hr><div><br></div>']);
  caretAtEnd(page.querySelector('h1')!);
  assert.deepEqual(run('h1'),['formatBlock:div'],'the same heading again makes it text');
  assert.deepEqual(run('h3'),['formatBlock:h3']);
  assert.deepEqual(run('text'),['formatBlock:div']);
  caretAtEnd(page.querySelector('blockquote')!);
  assert.deepEqual(run('quote'),['outdent','formatBlock:div'],'a quote again leaves the quote');
  assert.deepEqual(run('h1'),['outdent','formatBlock:div','formatBlock:h1'],'a heading in a quote leaves the quote first');
  caretAtEnd(page.querySelector('li')!);
  assert.deepEqual(run('bullets'),['insertUnorderedList'],'a bullet item again takes the item out of the list');
  run('tasks');
  assert.equal(page.querySelector('li')!.hasAttribute('data-task'),true,'a checklist command makes the item a task');
  run('tasks');
  assert.equal(page.querySelector('li')!.hasAttribute('data-task'),false,'and again makes it a bullet');
  run('tasks');run('bullets');
  assert.equal(page.querySelector('li')!.hasAttribute('data-task'),false,'a bullet command on a task item makes it a plain bullet');
 }finally{spy.restore();await ui.close();}
});

test('typing / opens the command menu, narrows as you type, runs the choice, and Escape closes it',async()=>{
 const spy=recordCommands();
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'hello',onChange:()=>{},label:'Note'}));
 try{
  const page=pageOf(ui.container);
  const line=page.firstElementChild!;
  caretAtEnd(line);
  await type(page,()=>{line.textContent='hello /';caretAtEnd(line);});
  const menu=()=>ui.container.querySelector('[role=listbox]');
  assert.ok(menu(),'the menu opens');
  assert.equal(menu()!.querySelectorAll('[role=option]').length,10);
  await type(page,()=>{line.textContent='hello /head';caretAtEnd(line);});
  assert.deepEqual([...menu()!.querySelectorAll('[role=option]')].map(option=>option.textContent?.replace(/[#]+$/,'')),['Heading 1','Heading 2','Heading 3']);
  await key(page,'ArrowDown');
  assert.equal(menu()!.querySelector('[aria-selected=true]')?.textContent?.startsWith('Heading 2'),true);
  await key(page,'ArrowUp');await key(page,'ArrowUp');
  assert.equal(menu()!.querySelector('[aria-selected=true]')?.textContent?.startsWith('Heading 3'),true,'the choice wraps round');
  await key(page,'Escape');
  assert.equal(menu(),null);
  await type(page,()=>{line.textContent='hello /todo';caretAtEnd(line);});
  assert.equal(menu()!.querySelectorAll('[role=option]').length,1);
  spy.calls.length=0;
  await key(page,'Enter');
  assert.equal(menu(),null,'choosing closes it');
  assert.ok(spy.calls.includes('delete'),'the /todo is taken out');
  assert.ok(spy.calls.includes('insertUnorderedList'),'and the checklist is made');
  await type(page,()=>{line.textContent='http://example.com';caretAtEnd(line);});
  assert.equal(menu(),null,'a slash inside an address is just a slash');
 }finally{spy.restore();await ui.close();}
});

test('Markdown shortcuts: "# " makes a heading, "- " a list, "[] " a checklist, "```" then Enter a code block; not inside a code block',async()=>{
 const spy=recordCommands();
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'x',onChange:()=>{},label:'Note'}));
 try{
  const page=pageOf(ui.container),line=page.firstElementChild!;
  const typed=async(text:string,pressed:string)=>{line.textContent=text;caretAtEnd(line);spy.calls.length=0;await key(page,pressed);return [...spy.calls];};
  assert.deepEqual(await typed('#',' '),['delete','formatBlock:h1']);
  assert.deepEqual(await typed('##',' '),['delete','formatBlock:h2']);
  assert.deepEqual(await typed('-',' '),['delete','insertUnorderedList']);
  assert.deepEqual(await typed('1.',' '),['delete','insertOrderedList']);
  assert.deepEqual(await typed('>',' '),['delete','formatBlock:blockquote']);
  assert.deepEqual(await typed('```','Enter'),['delete','formatBlock:pre']);
  assert.deepEqual(await typed('---','Enter'),['delete','insertHTML:<hr><div><br></div>']);
  assert.deepEqual(await typed('text -',' '),[],'a dash after words is just a dash');
  assert.deepEqual(await typed('#','a'),[]);
  assert.deepEqual(await typed('1.','Enter'),[]);
 }finally{spy.restore();await ui.close();}
});

test('paste: a lone address becomes a link, Markdown becomes blocks, plain text stays text, scripts are dropped',async()=>{
 const spy=recordCommands();
 const changes:string[]=[];
 const ui=await mountUI(createElement(MarkdownEditor,{delay:0,value:'x',onChange:(markdown:string)=>changes.push(markdown),label:'Note'}));
 try{
  const page=pageOf(ui.container),line=page.firstElementChild!;
  caretAtEnd(line);
  const paste=(data:Record<string,string>)=>act(async()=>{
   const event=new Event('paste',{bubbles:true,cancelable:true}) as Event&{clipboardData:unknown};
   event.clipboardData={getData:(type:string)=>data[type]??'',files:[]};
   page.dispatchEvent(event);
   assert.ok(event.defaultPrevented,'the browser\'s own paste is not used');
  });
  const inserted=()=>spy.calls.filter(call=>call.startsWith('insertHTML')).map(call=>call.slice('insertHTML:'.length));
  await paste({'text/plain':'https://example.com/a'});
  assert.match(inserted().at(-1)!,/^<a href="https:\/\/example\.com\/a">https:\/\/example\.com\/a<\/a>/);
  await paste({'text/plain':'# From an agent\n\n- [ ] do it'});
  assert.match(inserted().at(-1)!,/<div>.*<\/div>|<h1>From an agent<\/h1>/);
  assert.match(inserted().at(-1)!,/<h1>From an agent<\/h1>/);assert.match(inserted().at(-1)!,/data-task/);
  await paste({'text/plain':'just words\nover two lines'});
  assert.equal(inserted().at(-1),'just words<br>over two lines');
  await paste({'text/html':'<p>Hello <b>there</b></p><script>alert(1)</script><p onclick="x()">two</p>','text/plain':'Hello there\n\ntwo'});
  const last=inserted().at(-1)!;
  assert.match(last,/<strong>there<\/strong>/);assert.doesNotMatch(last,/script|alert|onclick/);
  await paste({'text/plain':'<script>alert(1)</script>'});
  assert.equal(inserted().at(-1),'&lt;script&gt;alert(1)&lt;/script&gt;','pasted text is shown, never run');
 }finally{spy.restore();await ui.close();}
});

test('typing says so at once but the page is read into Markdown only when typing pauses; a save that cannot wait reads it itself, even while the editor closes',async()=>{
 const edits:number[]=[],changes:string[]=[];
 const readNow={current:undefined as (()=>string)|undefined};
 const make=()=>createElement(MarkdownEditor,{value:'hello',delay:60,onEdit:()=>edits.push(1),onChange:(markdown:string)=>changes.push(markdown),readNow,label:'Note'});
 const ui=await mountUI(make());
 try{
  const page=pageOf(ui.container);
  await type(page,()=>{page.firstElementChild!.textContent='hello w';});
  await type(page,()=>{page.firstElementChild!.textContent='hello wo';});
  await type(page,()=>{page.firstElementChild!.textContent='hello wor';});
  assert.equal(edits.length,3,'every keystroke is announced');
  assert.deepEqual(changes,[],'but the page is not read yet');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,120));});
  assert.deepEqual(changes,['hello wor\n'],'one read once typing paused');
  await type(page,()=>{page.firstElementChild!.textContent='hello world';});
  assert.equal(readNow.current!(),'hello world\n','asked for now, it reads now');
  assert.deepEqual(changes,['hello wor\n','hello world\n']);
  await type(page,()=>{page.firstElementChild!.textContent='hello world!';});
  const read=readNow.current!;
  await ui.close();
  assert.equal(read(),'hello world!\n','still readable after the editor is gone');
  assert.equal(changes.at(-1),'hello world!\n','closing the editor reads what was waiting');
 }finally{/* closed above */}
});

test('the command menu is a listbox the editor points at: the highlighted command is the active descendant',async()=>{
 const ui=await mountUI(createElement(MarkdownEditor,{value:'x',delay:0,onChange:()=>{},label:'Note'}));
 try{
  const page=pageOf(ui.container),line=page.firstElementChild!;
  assert.equal(page.getAttribute('aria-activedescendant'),null);
  caretAtEnd(line);
  await type(page,()=>{line.textContent='x /';caretAtEnd(line);});
  const list=ui.container.querySelector('[role=listbox]')!;
  assert.equal(page.getAttribute('aria-controls'),list.id);assert.equal(page.getAttribute('aria-expanded'),'true');
  assert.equal(page.getAttribute('aria-activedescendant'),'md-slash-text');
  assert.equal(document.getElementById('md-slash-text')?.getAttribute('aria-selected'),'true');
  await key(page,'ArrowDown');
  assert.equal(page.getAttribute('aria-activedescendant'),'md-slash-h1');
  await key(page,'Escape');
  assert.equal(page.getAttribute('aria-activedescendant'),null);
 }finally{await ui.close();}
});

test('a link in a note never takes the app away: a plain click only places the caret',async()=>{
 const opened:string[]=[];
 const original=window.open;
 window.open=((url:string)=>{opened.push(url);return null;}) as typeof window.open;
 const ui=await mountUI(createElement(MarkdownEditor,{value:'a [site](https://example.com/x) and [bad](javascript:alert(1))',delay:0,onChange:()=>{},label:'Note'}));
 try{
  const page=pageOf(ui.container),anchor=page.querySelector('a')!;
  const click=(init:MouseEventInit)=>act(async()=>{const event=new MouseEvent('click',{bubbles:true,cancelable:true,...init});anchor.dispatchEvent(event);assert.ok(event.defaultPrevented,'the browser does not follow it');});
  await click({});assert.deepEqual(opened,[]);
  await click({metaKey:true});assert.deepEqual(opened,['https://example.com/x']);
  assert.equal(page.querySelectorAll('a').length,1,'an unsafe address is not made a link');
 }finally{window.open=original;await ui.close();}
});
