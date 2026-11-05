import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,type Project} from '../../../shared/types';
import {applyProjectChange} from '../../project-draft';
import {createPlayhead} from '../../playhead';
const {Inspector}=await import('../../Inspector');

/** The club's Inspector on one panel, with the same change, select and playhead plumbing the app gives it. */
async function open(p:Project,panel:'Elements'|'Captions',selectId:string|null=null){
 const state={project:p,selected:selectId as string|null},calls={imported:0,ai:[] as string[]},playhead=createPlayhead(7);
 const element=()=>createElement(Inspector,{project:state.project,panel,selected:state.selected,playhead,club:true,
  change:(fn:(draft:Project)=>void)=>{state.project=applyProjectChange(state.project,fn);},
  select:(id:string)=>{state.selected=id;},onImport:()=>{calls.imported++;},onAI:(kind?:string)=>{calls.ai.push(kind??'');}});
 const ui=await mountUI(element());
 const sync=async()=>{await ui.render(element());};
 const q=(selector:string)=>ui.container.querySelector<HTMLElement>(selector);
 const byText=(text:string)=>{const found=[...ui.container.querySelectorAll<HTMLElement>('button')].find(b=>b.textContent?.trim()===text);if(!found)throw Error(`No button ${text}`);return found;};
 const click=async(el:HTMLElement)=>{await act(async()=>{el.click();});await sync();};
 const type=async(el:HTMLElement,value:string)=>{
  const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
  await sync();
 };
 return {state,calls,ui,q,byText,click,type,sync,close:ui.close};
}

const caption=(id:string,start:number,text:string)=>({id,start,end:start+3,text});

test('Elements: Borumi picker order, its search wording, and a tile adds a selected element at the playhead',async()=>{
 const h=await open(createProject(),'Elements');
 try{
  const text=h.ui.container.textContent??'';
  assert.ok(text.indexOf('Text')<text.indexOf('Overlays')&&text.indexOf('Overlays')<text.indexOf('Annotations'),'Text, Overlays, Annotations in order');
  assert.equal(h.q('input[aria-label="Search elements"]')?.getAttribute('placeholder'),'Search elements…');
  assert.ok(h.byText('New overlay'));
  await h.click(h.q('button[aria-label="Add text"]')!);
  const [added]=h.state.project.elements;
  assert.equal(h.state.project.elements.length,1);assert.equal(added.type,'text');assert.equal(added.start,7,'starts at the playhead');
  assert.equal(h.state.selected,added.id,'the new element is selected');
  assert.equal(h.q('button[aria-expanded]')?.textContent?.trim(),'Properties','the drawer opens collapsed, as Borumi');
  await h.click(h.q('button[aria-expanded]')!);
  assert.equal(h.q('button[aria-expanded]')?.textContent?.trim(),'Element properties');
 }finally{await h.close();}
});

test('Elements: search filters the tiles and says so when nothing matches',async()=>{
 const h=await open(createProject(),'Elements');
 try{
  await h.type(h.q('input[aria-label="Search elements"]')!,'zzz');
  assert.equal(h.ui.container.querySelector('[role=status]')?.textContent,'No matching elements. Try another search.');
  assert.equal(h.q('button[aria-label="Add text"]'),null);
  await h.type(h.q('input[aria-label="Search elements"]')!,'arrow');
  assert.ok(h.q('button[aria-label="Add arrow"]'));assert.equal(h.q('button[aria-label="Add rectangle"]'),null);
  await h.click(h.q('button[aria-label="Clear search"]')!);
  assert.ok(h.q('button[aria-label="Add rectangle"]'),'clearing the search brings the tiles back');
 }finally{await h.close();}
});

test('Elements: the drawer edits text size and background, and shows only the controls each type can draw',async()=>{
 const p=createProject();p.elements=[{id:'t',type:'text',start:0,duration:5,text:'Hello',x:.1,y:.1,width:.5,height:.2,color:'#ffffff',background:'#171b27bb',fontSize:64,opacity:1,rotation:0}];
 const h=await open(p,'Elements','t');
 try{
  await h.click(h.q('button[aria-expanded]')!);
  await h.type(h.q('textarea[aria-label="Element text"]')!,'Changed');
  assert.equal(h.state.project.elements[0].text,'Changed');
  const size=h.q('input[aria-label="Text size"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(size,'72');size.dispatchEvent(new Event('input',{bubbles:true}));});
  await h.sync();
  assert.equal(h.state.project.elements[0].fontSize,72);
  const background=h.q('[role=switch][aria-label="Background"]')!;
  assert.equal(background.getAttribute('aria-checked'),'true');
  await h.click(background);
  assert.equal(h.state.project.elements[0].background,'transparent','the switch turns the box off');
  await h.click(h.q('[role=switch][aria-label="Background"]')!);
  assert.notEqual(h.state.project.elements[0].background,'transparent','and back on with a colour');
  await h.click(h.byText('Delete element'));
  assert.equal(h.state.project.elements.length,0);
 }finally{await h.close();}
});

test('Elements: arrows have no background or typography, and blur regions have no rotation or opacity',async()=>{
 const p=createProject();
 p.elements=[{id:'a',type:'arrow',start:0,duration:5,text:'',x:.1,y:.1,width:.3,height:.3,color:'#ffffff',background:'transparent',fontSize:64,opacity:1,rotation:0},
  {id:'b',type:'blur',start:0,duration:5,text:'',x:.1,y:.1,width:.3,height:.3,color:'#ffffff',background:'transparent',fontSize:64,opacity:1,rotation:0}];
 const arrow=await open(p,'Elements','a');
 try{
  await arrow.click(arrow.q('button[aria-expanded]')!);
  const text=arrow.ui.container.textContent??'';
  assert.match(text,/Rotation/);assert.match(text,/Colors/);
  assert.doesNotMatch(text,/Typography|Text size/);assert.equal(arrow.q('[role=switch][aria-label="Background"]'),null);
 }finally{await arrow.close();}
 const blur=await open(p,'Elements','b');
 try{
  await blur.click(blur.q('button[aria-expanded]')!);
  const text=blur.ui.container.textContent??'';
  assert.doesNotMatch(text,/Rotation|Opacity|Colors/);assert.match(text,/X position/);assert.match(text,/Timing/);
 }finally{await blur.close();}
});

test('Captions: the look cards set the whole-video style; No captions turns it off',async()=>{
 const h=await open(createProject(),'Captions');
 try{
  assert.ok((h.ui.container.textContent??'').includes('Generate captions'));
  await h.click(h.q('button[aria-label="Bold"]')!);
  assert.equal(h.state.project.captionStyle.fontSize,64);assert.equal(h.state.project.captionStyle.enabled,true);
  assert.equal(h.q('button[aria-label="Bold"]')?.getAttribute('aria-checked'),'true','the chosen card is marked');
  await h.click(h.q('button[role=radio][aria-checked=false][aria-label="Yellow"]')!);
  assert.equal(h.state.project.captionStyle.color,'#facc15');
  await h.click(h.byText('No captions')!);
  assert.equal(h.state.project.captionStyle.enabled,false);
  assert.equal(h.q('[role=switch][aria-label="Show captions in video"]')?.getAttribute('aria-checked'),'false');
 }finally{await h.close();}
});

test('Captions: text size, position and background edit the style, and the switch removes the box',async()=>{
 const h=await open(createProject(),'Captions');
 try{
  const size=h.q('input[aria-label="Text size"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(size,'120');size.dispatchEvent(new Event('input',{bubbles:true}));});
  await h.sync();
  assert.equal(h.state.project.captionStyle.fontSize,120);
  await h.click(h.byText('Top'));
  assert.equal(h.state.project.captionStyle.position,'top');
  await h.click(h.q('[role=switch][aria-label="Background"]')!);
  assert.equal(h.state.project.captionStyle.background,'transparent');
  assert.equal(h.q('input[aria-label="Background color"]'),null,'no colour field while the box is off');
  await h.click(h.q('[role=switch][aria-label="Background"]')!);
  assert.ok(h.q('input[aria-label="Background color"]'),'the colour field returns when the box is on');
 }finally{await h.close();}
});

test('Captions: manual lines start where the playhead is, and the list selects a caption for its own drawer',async()=>{
 const h=await open(createProject(),'Captions');
 try{
  await h.type(h.q('textarea[aria-label="Caption lines"]')!,'One\nTwo');
  await h.click(h.byText('Add at playhead'));
  assert.deepEqual(h.state.project.captions.map(c=>[c.start,c.text]),[[7,'One'],[10,'Two']]);
  assert.ok((h.ui.container.textContent??'').includes('2 captions'));
 }finally{await h.close();}
 const p=createProject();p.captions=[caption('c1',2,'First')];
 const selected=await open(p,'Captions','c1');
 try{
  assert.equal(selected.q('button[aria-expanded]')?.textContent?.trim(),'Properties');
  await selected.click(selected.q('button[aria-expanded]')!);
  assert.equal(selected.q('button[aria-expanded]')?.textContent?.trim(),'Caption properties');
  await selected.type(selected.q('textarea[aria-label="Caption text"]')!,'Edited');
  assert.equal(selected.state.project.captions[0].text,'Edited');
  await selected.click(selected.byText('Delete caption'));
  assert.equal(selected.state.project.captions.length,0);
 }finally{await selected.close();}
});

test('Captions: the Generate button runs the transcription command and says it will generate again once captions exist',async()=>{
 const h=await open(createProject(),'Captions');
 try{await h.click(h.byText('Generate captions'));assert.deepEqual(h.calls.ai,['transcribe']);}finally{await h.close();}
 const p=createProject();p.captions=[caption('c1',0,'Hi')];
 const again=await open(p,'Captions');
 try{assert.ok(again.byText('Generate captions again'));}finally{await again.close();}
});
