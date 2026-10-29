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

test('an empty strip on the Board says to gather references first; on the other tabs it says to draft from the board',async()=>{
 const scenes={status:'ready' as const,scenes:[]};
 const ui=await mountUI(createElement(Strip,{scenes,focusId:null,tab:'board',onPick(){},onRetry(){}}));
 try{
  assert.match(ui.container.textContent!,/Gather references here, then draft scenes from the board\./);
  await ui.render(createElement(Strip,{scenes,focusId:null,tab:'plan',onPick(){},onRetry(){}}));
  assert.match(ui.container.textContent!,/No scenes yet\. Draft them from the board\./);
 }finally{await ui.close();}
});
