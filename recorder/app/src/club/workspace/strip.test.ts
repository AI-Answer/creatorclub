import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {Strip} from './Frame';

test('a scene in the strip reports its own id, so the tab can focus it in place',async()=>{
 const picked:string[]=[];
 const scenes={status:'ready' as const,scenes:[{id:'s1',title:'Opening',seconds:30,takes:[],status:'Not recorded'},{id:'s2',title:'Level 1',seconds:60,takes:[],status:'Not recorded'}]};
 const ui=await mountUI(createElement(Strip,{scenes,focusId:'s2',onPick:id=>picked.push(id),onRetry:()=>{}}));
 try{
  const buttons=[...ui.container.querySelectorAll<HTMLButtonElement>('button.sc')];
  assert.equal(buttons[1].classList.contains('on'),true,'the focused scene is marked');
  await act(async()=>buttons[0].click());
  assert.deepEqual(picked,['s1']);
  assert.match(buttons[1].textContent??'',/Level 1/,'the scene names show');
 }finally{await ui.close();}
});

test('the chips are tabbable and the arrow keys move focus between them, wrapping round',async()=>{
 const scenes={status:'ready' as const,scenes:[1,2,3].map(n=>({id:`s${n}`,title:`Scene ${n}`,seconds:30,takes:[],status:'Not recorded'}))};
 const ui=await mountUI(createElement(Strip,{scenes,focusId:null,onPick(){},onRetry(){}}));
 try{
  const chips=[...ui.container.querySelectorAll<HTMLButtonElement>('button.sc')];
  assert.ok(chips.every(chip=>chip.tabIndex>=0),'every chip is reachable with Tab');
  const press=(key:string)=>act(async()=>{document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));});
  chips[0].focus();
  await press('ArrowRight');assert.equal(document.activeElement,chips[1]);
  await press('ArrowRight');await press('ArrowRight');assert.equal(document.activeElement,chips[0],'wraps from the last to the first');
  await press('ArrowLeft');assert.equal(document.activeElement,chips[2],'and back');
 }finally{await ui.close();}
});

test('an empty strip says to draft the scenes from the board',async()=>{
 const scenes={status:'ready' as const,scenes:[]};
 const ui=await mountUI(createElement(Strip,{scenes,focusId:null,onPick(){},onRetry(){}}));
 try{
  assert.match(ui.container.textContent!,/No scenes yet\. Plan the scenes first\./);
 }finally{await ui.close();}
});
