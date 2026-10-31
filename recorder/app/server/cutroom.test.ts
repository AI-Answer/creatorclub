import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform} from '../shared/types.js';
import {sourceFromProject} from './cutroom.js';
import {createToolHandler,toolDefinitions} from './mcp.js';

test('Cutroom snapshots preserve timeline/source timing, audio provenance, and word anchors',()=>{
 const p=createProject('A source');p.media=[{id:'m',name:'screen',path:'/tmp/screen.mp4',kind:'video',duration:20,width:1920,height:1080,fps:30}];
 p.clips=[{id:'c',mediaId:'m',name:'screen',track:'screen',start:2,sourceIn:3,sourceOut:8,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];
 p.captions=[{id:'caption',start:2,end:4,text:'Hello world',words:[{text:'Hello',start:2.1,end:2.4},{text:'world',start:2.5,end:2.9}]}];
 const s=sourceFromProject(p);assert.equal(s.clips[0].start_ms,2000);assert.equal(s.clips[0].media_in_ms,3000);assert.equal(s.clips[0].dur_ms,5000);assert.equal(s.words[0].start_ms,2100);assert.equal(s.media[0].path,'/tmp/screen.mp4');assert.equal(p.clips[0].sourceIn,3);
 p.clips[0].speed=2;assert.throws(()=>sourceFromProject(p),/1× footage/);
});
test('Cutroom MCP exposes the engine and preserves exact reviewed revisions before applying',async()=>{
 const calls:Array<{url:string;init?:RequestInit}>=[];
 const handle=createToolHandler('http://127.0.0.1:4184/api',async(url,init)=>{calls.push({url:String(url),init});return Response.json({ok:true});});
 const revision='a'.repeat(64);
 await handle('cutroom_run',{workspace_id:'work-1',action:'preview',at:'w12'});
 assert.deepEqual(JSON.parse(String(calls[0].init?.body)),{action:'preview',at:'w12'});
 await handle('cutroom_apply_cuts',{workspace_id:'work-1',expected_revision:revision});
 assert.equal(new Headers(calls[1].init?.headers).get('If-Match'),revision);
 await assert.rejects(()=>handle('cutroom_apply_cuts',{workspace_id:'work-1'}),/reviewed revision/);
 await assert.rejects(()=>handle('cutroom_run',{workspace_id:'../escape',action:'render'}),/valid workspace_id/);
 assert.equal(calls.length,2);assert.equal(toolDefinitions.filter(t=>t.name.startsWith('cutroom_')).length,8);
});
