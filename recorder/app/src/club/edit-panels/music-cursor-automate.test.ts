import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createPlayhead} from '../../playhead';
import {createProject,defaultEffects,defaultTransform,type Media,type Project} from '../../../shared/types';
import type {InspectorProps} from '../../Inspector';
import {ClubMusicPanel} from './MusicPanel';
import {ClubCursorPanel} from './CursorPanel';
import {EditAutoSheet} from '../recorder/EditAutoSheet';

const song=(id:string,name:string):Media=>({id,name,path:`/${id}.mp3`,kind:'audio',duration:12,width:0,height:0});
/** A project with two audio files and one of them on the music track. Changes apply straight to the project object. */
function music(selected:string|null){
 const p=createProject();
 p.media.push(song('m1','Intro.mp3'),song('m2','Outro.mp3'));
 p.clips.push({id:'c1',mediaId:'m1',name:'Intro.mp3',track:'music',start:2,sourceIn:0,sourceOut:12,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()});
 return {p,props:(over:Partial<InspectorProps>={}):InspectorProps=>({project:p,panel:'Music',selected,playhead:createPlayhead(3),change:fn=>fn(p),select(){},onImport(){},onAI(){},club:true,...over})};
}
const click=async(el:Element|null|undefined)=>{if(!el)throw Error('missing element');await act(async()=>(el as HTMLElement).click());};

test('Music lists the project audio, adds a picked track at the playhead and offers the import row',async()=>{
 const {p,props}=music(null);
 let imported:string|undefined;
 const ui=await mountUI(createElement(ClubMusicPanel,props({onImport:track=>{imported=track;}})));
 try{
  const rows=[...ui.container.querySelectorAll<HTMLButtonElement>('.club-music-list > button')];
  assert.deepEqual(rows.map(b=>b.textContent?.trim()),['No music','Intro.mp3','Outro.mp3','Click to select a song.']);
  assert.equal(rows[0].getAttribute('aria-pressed'),'true','no music clip is selected, so No music is the active row');
  await click(rows[3]);
  assert.equal(imported,'music');
  await click(rows[2]);
  const added=p.clips.filter(c=>c.track==='music');
  assert.equal(added.length,2);
  assert.equal(added[1].mediaId,'m2');
  assert.equal(added[1].start,3,'added at the playhead');
  assert.equal(ui.container.querySelector('.club-music-footer'),null,'no footer without a selected music clip');
 }finally{await ui.close();}
});

test('Music: Project shows only the tracks used in this project',async()=>{
 const {props}=music(null);
 const ui=await mountUI(createElement(ClubMusicPanel,props()));
 try{
  await click([...ui.container.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='Project'));
  assert.deepEqual([...ui.container.querySelectorAll<HTMLButtonElement>('.club-music-list > button')].map(b=>b.textContent?.trim()),['No music','Intro.mp3','Click to select a song.']);
 }finally{await ui.close();}
});

test('Music: a selected clip shows Borumi volume in dB, fades, start, and removes with No music or delete',async()=>{
 const {p,props}=music('c1');
 const ui=await mountUI(createElement(ClubMusicPanel,props()));
 try{
  const footer=ui.container.querySelector('.club-music-footer')!;
  assert.ok(footer.textContent?.includes('(0 dB)'),'unity gain is 0 dB');
  assert.equal(ui.container.querySelector('.club-music-list > button')?.getAttribute('aria-pressed'),'false');
  // Volume: the slider writes linear gain from dB, 10^(dB/20).
  const slider=ui.container.querySelector<HTMLInputElement>('input[type=range][aria-label="Music volume"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(slider,'-6');slider.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.ok(Math.abs(p.clips[0].gain-10**(-6/20))<1e-9,`gain ${p.clips[0].gain}`);
  await click([...ui.container.querySelectorAll<HTMLButtonElement>('[role=switch]')].find(b=>b.getAttribute('aria-label')==='Fade In'));
  assert.equal(p.clips[0].effects.fadeIn,1);
  await click([...ui.container.querySelectorAll<HTMLButtonElement>('[role=switch]')].find(b=>b.getAttribute('aria-label')==='Fade Out'));
  assert.equal(p.clips[0].effects.fadeOut,1);
  await click(ui.container.querySelector('button[aria-label="Delete Intro.mp3"]'));
  assert.equal(p.clips.filter(c=>c.track==='music').length,0);
 }finally{await ui.close();}
});

test('Cursor: None hides the options, Pointer shows Borumi size, centre colour, highlight and the path',async()=>{
 const p=createProject();const playhead=createPlayhead(3);
 const props=():InspectorProps=>({project:p,panel:'Cursor',selected:null,playhead,change:fn=>fn(p),select(){},onImport(){},onAI(){},club:true});
 const ui=await mountUI(createElement(ClubCursorPanel,props()));
 try{
  assert.ok(ui.container.textContent?.includes('Select a cursor style to show the cursor and change visual options.'));
  assert.equal(ui.container.querySelector('[aria-label="Cursor style"] button')?.getAttribute('aria-pressed'),'true');
  await click([...ui.container.querySelectorAll<HTMLButtonElement>('.club-cursor-tile')].find(b=>b.textContent?.includes('Pointer')));
  assert.equal(p.cursor.enabled,true);
  await ui.render(createElement(ClubCursorPanel,props()));
  assert.ok(ui.container.textContent?.includes('(x1.00)'),'24 px is Borumi x1.00');
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent==='Reset'),false);
  assert.ok(ui.container.textContent?.includes('Cursor Highlight'));
  assert.ok(!ui.container.textContent?.includes('Hide cursor when still'),'no control the model cannot honour');
  p.cursor.size=12;await ui.render(createElement(ClubCursorPanel,props()));
  assert.ok(ui.container.textContent?.includes('(x0.50)'));
  await click(button(ui.container,'Reset'));assert.equal(p.cursor.size,24);
  await click(ui.container.querySelector('.club-cursor-add'));
  assert.deepEqual(p.cursor.points.map(pt=>pt.time),[3],'a point at the playhead');
  await click(ui.container.querySelector('[role=switch][aria-label="Cursor Highlight"]'));
  assert.equal(p.cursor.highlight,true);
 }finally{await ui.close();}
});

test('Automations: a card per automation, its actions under More options, and a pinned preview',async()=>{
 const p=createProject();
 const ui=await mountUI(createElement(EditAutoSheet,{project:p,jobs:[],merge(){},reload:async()=>{},flush:async()=>p,change(){},refresh:async()=>{},onPreview(){},onClose(){},notify(){},onMakeCaptions:async()=>{}}));
 try{
  assert.equal(ui.container.querySelector('.club-auto-sheet .br-section-title')?.textContent,'Automations');
  assert.deepEqual([...ui.container.querySelectorAll('[role=listitem]')].map(e=>e.getAttribute('data-option')),['fillers','pauses','gaps','normalize','style']);
  const menuOf=async(option:string)=>{await click(ui.container.querySelector(`[data-option=${option}] [aria-label="More options"]`));return [...ui.container.querySelectorAll<HTMLButtonElement>('.club-auto-menu-item')].map(b=>({text:b.textContent,disabled:b.disabled}));};
  // An empty project has nothing to check, so Find pauses is listed and cannot run.
  assert.deepEqual(await menuOf('pauses'),[{text:'Find pauses',disabled:true}]);
  assert.deepEqual(await menuOf('fillers'),[{text:'Make captions',disabled:false}],'no captions yet: fillers offers Make captions');
  assert.equal(ui.container.querySelectorAll('.club-auto-menu').length,1,'only one menu is open');
  await click(ui.container.querySelector('[data-option=normalize] .club-auto-main'));
  assert.equal(ui.container.querySelector('[data-option=normalize] .club-auto-main')?.getAttribute('aria-pressed'),'true');
  assert.ok(ui.container.querySelector('.club-auto-footer')?.textContent?.includes('Even out the volume'));
 }finally{await ui.close();}
});
