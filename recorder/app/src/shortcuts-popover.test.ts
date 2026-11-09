import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
const {ShortcutsPopover}=await import('./App');

test('Task 14: the shortcuts popover scrolls and shows a cue while more shortcuts are below',async()=>{
 const ui=await mountUI(createElement(ShortcutsPopover,{onClose:()=>{}}));
 try{
  const box=ui.container.querySelector<HTMLElement>('.club-shortcuts')!;
  Object.defineProperty(box,'scrollHeight',{value:600,configurable:true});Object.defineProperty(box,'clientHeight',{value:300,configurable:true});
  await act(async()=>{box.dispatchEvent(new Event('scroll'));});
  assert.ok(ui.container.querySelector('.club-shortcuts-more'),'a cue says more is below');
  assert.match(box.textContent!,/NAdd a note/);assert.match(box.textContent!,/Shift NSnapping on or off/);
  assert.ok(box.textContent?.includes('⌘G')&&box.textContent.includes('These shortcuts'),'every shortcut is in the list, not cut off after ⌘G');
  box.scrollTop=300;await act(async()=>{box.dispatchEvent(new Event('scroll'));});
  assert.equal(ui.container.querySelector('.club-shortcuts-more'),null,'at the end the cue goes');
 }finally{await ui.close();}
});
