import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,type Clip} from '../shared/types';
import {historyTitle,summarizeProject} from '../shared/history-summary';

const clip=(id:string,start:number,length:number):Clip=>({id,mediaId:'m',name:id,track:'screen',start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()});
test('Task 14: each saved version is titled by what changed, so no two neighbours read the same',()=>{
 const a=createProject('Video');a.scenes=[];a.clips=[clip('x',0,10),clip('y',10,5)];
 const b=structuredClone(a);b.clips=[clip('x',0,10)];
 const c=structuredClone(b);c.captions=[{id:'1',start:0,end:1,text:'Hi'},{id:'2',start:1,end:2,text:'there'}];
 const d=structuredClone(c);d.clips[0].start=1;d.clips[0].sourceOut=8;
 const e=structuredClone(c);e.name='Intro';
 const [sa,sb,sc,sd,se]=[a,b,c,d,e].map(summarizeProject);
 assert.equal(historyTitle(undefined,sa),'Earliest saved version');
 assert.equal(historyTitle(sa,sb),'Cut 5 s · Removed 1 clip');
 assert.equal(historyTitle(sb,sc),'Wrote 2 captions');
 assert.equal(historyTitle(sc,sd),'Cut 1 s');
 assert.equal(historyTitle(sc,se),'Renamed to “Intro”');
 assert.equal(historyTitle(sc,sc),'Small changes');
});
