import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Package} from '../../shared/club';
const {PackageForm}=await import('./plan/PackageForm');

const partial:Package={angle:'',twist:'',titles:['A title','',''],thumbnailText:'',hook:{visual:'',spoken:'A hook',text:''}};

test('a package with no ratings shows them as Not rated, with the note locked until a level is picked, and invents none',async()=>{
 const seen:Package[]=[];
 const ui=await mountUI(createElement(PackageForm,{value:partial,onChange:next=>seen.push(next)}));
 try{
  const level=ui.container.querySelector<HTMLSelectElement>('select[aria-label="Demand level"]')!;
  const note=ui.container.querySelector<HTMLInputElement>('input[aria-label="Demand note"]')!;
  assert.equal(level.value,'');assert.equal(level.selectedOptions[0].textContent,'Not rated');assert.equal(note.disabled,true);
  await act(async()=>{level.value='high';level.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.deepEqual(seen.at(-1)?.demand,{level:'high',note:''},'only the level that was picked');
  assert.equal('gap' in seen.at(-1)!,false,'the other ratings stay unjudged');
 }finally{await ui.close();}
});
