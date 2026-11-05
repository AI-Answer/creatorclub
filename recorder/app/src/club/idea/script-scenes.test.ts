import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import {mountUI} from '../../test-dom';
import type {Outline,VideoScene} from '../../../shared/club';
import {rememberAiStatus} from '../ai-status';
import {ToastProvider} from '../ui';
import {hasSceneBoundary,splitScript} from './script-paste';
const {ScriptScenes}=await import('./ScriptScenes');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
rememberAiStatus({claude:{installed:true,version:'test',signedIn:true},codex:{installed:false,version:null,signedIn:false}});

test('a pasted script splits into scenes at headings and --- lines, as in Borumi',()=>{
 assert.deepEqual(splitScript('# Intro\nHi there.\n\n## The trick\nDo this.\n---\nThen this.'),[
  {title:'Intro',script:'Hi there.'},{title:'The trick',script:'Do this.'},{script:'Then this.'}]);
 assert.deepEqual(splitScript('Just one paragraph.'),[{script:'Just one paragraph.'}]);
 assert.equal(hasSceneBoundary('Just one paragraph.'),false);
 assert.equal(hasSceneBoundary('a\n***\nb'),true);
 assert.deepEqual(splitScript('---\n\n---\n# Only a name'),[{title:'Only a name',script:''}],'empty scenes are dropped');
});

const outline:Outline={scenes:[
 {id:'s_aaaaaaaa',title:'Opening',talkingPoints:[],show:'',seconds:30,script:'Hello.'},
 {id:'s_bbbbbbbb',title:'',talkingPoints:[],show:'',seconds:30,script:'Second.'},
 {id:'s_cccccccc',title:'',talkingPoints:[],show:'',seconds:30,script:''},
]};
const known:VideoScene[]=[{id:'s_aaaaaaaa',title:'Opening',seconds:30,takes:[{id:'t1',seconds:12,kept:true}],status:'recorded'} as unknown as VideoScene];

function Probe({saved,scripts}:{saved:Outline[];scripts:Array<[string,string]>}){
 const [value,setValue]=useState<Outline>(outline),[focusId,setFocusId]=useState<string|null>(null);
 return createElement(ToastProvider,null,createElement(ScriptScenes,{aiName:'Claude',aiBrand:'claude',hasRecording:true,outline:value,known,focusId,drafting:false,scripting:false,
  onEdit:(next:Outline)=>{saved.push(next);setValue(next);},onFocus:setFocusId,onDraft(){},onWriteScene(){},
  onSceneScript:(id:string,text:string)=>{scripts.push([id,text]);setValue(now=>({...now,scenes:now.scenes.map(scene=>scene.id===id?{...scene,script:text}:scene)}));},
  onRecord(){},onSaveNow:async()=>{},onStartRecording(){}}));
}

test('Borumi\'s rows: the name in the gutter ("Scene N" until named), a green bar once recorded, and its menu in order',async()=>{
 const saved:Outline[]=[],scripts:Array<[string,string]>=[];
 const ui=await mountUI(createElement(Probe,{saved,scripts}));
 try{
  await flush();const c=ui.container;
  assert.deepEqual([...c.querySelectorAll('.bs-name')].map(n=>n.textContent),['Opening','Scene 2','Scene 3']);
  assert.deepEqual([...c.querySelectorAll('.bs-row')].map(row=>row.classList.contains('is-recorded')),[true,false,false]);
  await act(async()=>c.querySelector('[aria-label="Scene 2"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:5,clientY:5})));
  assert.deepEqual([...c.querySelectorAll('.bs-menu [role=menuitem]')].map(item=>item.textContent),['Rewrite the script with Claude','Record this scene','Add scene before','Add scene after','Delete scene']);
  assert.equal(c.querySelectorAll('.bs-menu [role=separator]').length,2);
 }finally{await ui.close();}
});

test('Backspace at the start of a scene merges it into the one above; an empty scene is deleted',async()=>{
 const saved:Outline[]=[],scripts:Array<[string,string]>=[];
 const ui=await mountUI(createElement(Probe,{saved,scripts}));
 try{
  await flush();const c=ui.container;
  const key=async(id:string)=>{const area=c.querySelector<HTMLTextAreaElement>(`#script-text-${id}`)!;area.focus();area.setSelectionRange(0,0);await act(async()=>area.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true})));await flush();};
  await key('s_cccccccc');
  assert.deepEqual(saved.at(-1)?.scenes.map(scene=>scene.id),['s_aaaaaaaa','s_bbbbbbbb'],'the empty third scene is deleted');
  await key('s_bbbbbbbb');
  assert.deepEqual(saved.at(-1)?.scenes.map(scene=>scene.id),['s_aaaaaaaa'],'the second scene joins the first');
  assert.deepEqual(scripts.at(-1),['s_aaaaaaaa','Hello.\nSecond.']);
 }finally{await ui.close();}
});
