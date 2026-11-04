import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultTransform,defaultEffects,type Clip} from '../shared/types';
import {TAKE_ROW,takeClipViews} from './timeline-take-view';
import {splitLinked,unlinkClips} from './timeline-edit';

export function takeFixture(){
 const p=createProject('Take');p.scenes=[];
 p.media=(['screen','camera','audio'] as const).map(id=>({id,name:id,path:`/tmp/${id}`,kind:id==='audio'?'audio' as const:'video' as const,duration:12,width:1920,height:1080,hasAudio:id!=='screen',waveform:id==='audio'?[0,.02,.4,.001,.15,0,.3,.05]:undefined}));
 p.clips=p.media.map(m=>({id:m.id,mediaId:m.id,name:m.id,track:m.id as Clip['track'],start:0,sourceIn:0,sourceOut:12,speed:1,gain:1,muted:false,linkId:'take',recordingTakeId:'take',transform:defaultTransform(),effects:defaultEffects()}));
 p.captions=[{id:'speech',start:0,end:12,text:'First words then more',words:[{text:'First',start:.2,end:1},{text:'words',start:1,end:2},{text:'then',start:7,end:8},{text:'more',start:8,end:9}]}];
 return p;
}
test('one visual per linked take slice, microphone envelope with screen and camera thumbnails, no project mutation',()=>{
 const p=takeFixture(),before=structuredClone(p);splitLinked(p,6,new Set(['camera']));
 const snapshot=structuredClone(p),views=takeClipViews(p);assert.equal(views.length,2);
 for(const v of views){assert.equal(v.row,TAKE_ROW);assert.equal(v.members.length,3);assert.equal(v.sound!.track,'audio');assert.equal(v.clip.id,v.sound!.id);assert.deepEqual(v.pictures.map(c=>c.track),['screen','camera']);}
 assert.notEqual(views[0].clip.linkId,views[1].clip.linkId);assert.deepEqual(p,snapshot);assert.equal(before.clips.length,3);
});
test('offset source edges, explicit layers and unlinked sources stay individually visible',()=>{
 for(const modify of [(p:ReturnType<typeof takeFixture>)=>{p.clips[1].start=.2;},(p:ReturnType<typeof takeFixture>)=>{p.timelineLayers=[{id:'custom',name:'Camera',kind:'video',order:3}];p.clips[1].layerId='custom';},(p:ReturnType<typeof takeFixture>)=>{unlinkClips(p,['audio']);}]){
  const p=takeFixture();modify(p);assert.equal(takeClipViews(p).length,3);assert.ok(takeClipViews(p).every(v=>!v.grouped));
 }
});
test('legacy take grouping still picks microphone instead of camera scratch or system audio',()=>{
 const p=takeFixture();for(const c of p.clips)delete c.linkId;p.clips[0].audioRole='system';p.clips[2].audioRole='microphone';p.media[0].hasAudio=true;
 assert.equal(takeClipViews(p)[0].sound!.id,'audio');
});

test('standalone music and muted audio still expose their waveform source',()=>{
 const p=takeFixture();p.clips=[{...p.clips[2],track:'music',linkId:undefined,muted:true}];assert.equal(takeClipViews(p)[0].sound?.id,'audio');
 p.clips[0].track='audio';assert.equal(takeClipViews(p)[0].sound?.id,'audio');
});

test('an explicit split flag on any source exposes all lanes without changing source links or provenance',()=>{
 const p=takeFixture();p.clips[1].split=true;const before=structuredClone(p),views=takeClipViews(p);
 assert.equal(views.length,3);assert.ok(views.every(v=>!v.grouped));assert.deepEqual(p,before);assert.ok(p.clips.every(c=>c.linkId==='take'&&c.recordingTakeId==='take'));
});
