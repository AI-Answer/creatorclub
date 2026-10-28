import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSceneToRecord,preflightLine,recorderProblems,sourceChecks,sourceState,takeThumbnailLabel,type SourceCheck,type SourceKind,type SourceSnapshot} from './recorder-checks';

const GB=1024**3;
const ready:SourceCheck[]=[{kind:'camera',state:'ready'},{kind:'microphone',state:'ready'}];

/** The four conditions a switched-on source can be in, as the recorder reads them. */
const conditions={
 ok:{receiving:true,permission:'granted'},
 'not ready':{receiving:false,permission:'not-determined'},
 error:{receiving:false,permission:'granted',failed:true},
 permission:{receiving:false,permission:'denied'},
} satisfies Record<string,Partial<SourceSnapshot>>;
const kinds:SourceKind[]=['camera','microphone','screen','systemAudio'];
const names:Record<SourceKind,string>={camera:'camera',microphone:'microphone',screen:'screen',systemAudio:'computer audio'};
const card=(kind:SourceKind,condition:keyof typeof conditions)=>recorderProblems(sourceChecks([{kind,included:true,...conditions[condition]}]),null);

test('every source × ok / not ready / error / permission: one plain sentence naming the source and what to do, and at most one button',()=>{
 for(const kind of kinds){
  const name=names[kind],captured=kind==='screen'||kind==='systemAudio';
  assert.equal(card(kind,'ok'),null,`${kind} ok: no card`);
  assert.equal(card(kind,'not ready'),null,`${kind} not ready: no card (the pre-flight line covers it)`);
  assert.equal(preflightLine(sourceChecks([{kind,included:true,...conditions['not ready']}]),true),`Fix the ${name} above before recording`);

  const error=card(kind,'error')!;
  assert.equal(error.tone,'danger');assert.equal(error.lines.length,1,`${kind} error: exactly one line`);
  assert.ok(error.lines[0].text.includes(name),`${kind} error names the source`);
  assert.equal(error.lines[0].text.split(/[.!?](\s|$)/).filter(Boolean).length,1,'one sentence');
  assert.equal(error.lines[0].action,captured?'choose-source':kind==='camera'?'retry-camera':'retry-microphone');
  assert.equal(error.lines[0].text,captured?`The ${name} can't be captured: choose the screen or window again.`:`The ${name} can't start: check that it's connected and not in use by another app.`);

  const blocked=card(kind,'permission')!;
  assert.deepEqual(blocked,{tone:'danger',lines:[{text:`macOS isn't allowing the ${name}: open Mac setup to allow it.`,action:'setup'}]},`${kind} permission: Open Mac setup`);
 }
});

test('a source that is switched off is never checked, whatever its preview says',()=>{
 for(const kind of kinds){
  assert.equal(sourceState({kind,included:false,receiving:false,failed:true,permission:'denied'}),null);
  assert.deepEqual(sourceChecks([{kind,included:false,receiving:false,failed:true}]),[]);
 }
});

test('permission comes first, then a camera with no picture, then a failure, then a stopped source',()=>{
 assert.equal(sourceState({kind:'camera',included:true,receiving:false,permission:'restricted',failed:true,stalled:true}),'blocked');
 assert.equal(sourceState({kind:'camera',included:true,receiving:false,accessDenied:true}),'blocked','a preview refused for access is a permission problem');
 assert.equal(sourceState({kind:'camera',included:true,receiving:false,stalled:true,failed:true}),'no-picture');
 assert.equal(sourceState({kind:'microphone',included:true,receiving:false,ended:true}),'disconnected');
 assert.equal(sourceState({kind:'screen',included:true,receiving:true,failed:true}),'ready','a source that is sending is fine even after an earlier failure');
 assert.equal(sourceState({kind:'camera',included:true,receiving:false,opening:true}),'starting');
 const stalled=recorderProblems([{kind:'camera',state:'no-picture'}],null)!;
 assert.deepEqual(stalled.lines,[{text:"The camera isn't sending a picture: allow it in Mac setup or choose another camera.",action:'setup'}]);
 const stopped=recorderProblems([{kind:'microphone',state:'disconnected'},{kind:'screen',state:'disconnected'}],null)!;
 assert.deepEqual(stopped.lines,[{text:'The microphone was disconnected: plug it back in, then try again.',action:'retry-microphone'},{text:'The screen stopped sharing: choose the screen or window again.',action:'choose-source'}]);
});

test('each button shows once: a later line needing the same action keeps its sentence only',()=>{
 const problems=recorderProblems([{kind:'camera',state:'blocked'},{kind:'microphone',state:'blocked'},{kind:'screen',state:'error'},{kind:'systemAudio',state:'error'}],null)!;
 assert.deepEqual(problems.lines.map(line=>line.action),['setup',undefined,'choose-source',undefined]);
 assert.equal(problems.lines.length,4,'every failing source still has its sentence');
});

test('no problems when every source is ready and the disk has room',()=>{
 assert.equal(recorderProblems(ready,{freeBytes:200*GB,low:false}),null);
});

test('low disk alone makes an amber card that says how much to free',()=>{
 const problems=recorderProblems(ready,{freeBytes:2*GB,low:true});
 assert.equal(problems?.tone,'warning');
 assert.deepEqual(problems?.lines,[{text:'Your disk is almost full: free up at least 8 GB before recording.'}]);
});

test('a failed source makes the card red, and its line comes before the disk line',()=>{
 const problems=recorderProblems([{kind:'camera',state:'disconnected'},{kind:'microphone',state:'ready'}],{freeBytes:9*GB,low:true});
 assert.equal(problems?.tone,'danger');
 assert.deepEqual(problems?.lines.map(line=>line.text),['The camera was disconnected: plug it back in, then try again.','Your disk is almost full: free up at least 1 GB before recording.']);
});

test('the pre-flight line names every included source that is not ready, before the first take only',()=>{
 assert.equal(preflightLine([{kind:'camera',state:'off'}],true),'Fix the camera above before recording');
 assert.equal(preflightLine([{kind:'camera',state:'off'},{kind:'microphone',state:'error'},{kind:'systemAudio',state:'blocked'}],true),'Fix the camera, microphone and computer audio above before recording');
 assert.equal(preflightLine([{kind:'camera',state:'starting'}],true),null,'a source still opening is not named');
 assert.equal(preflightLine([{kind:'camera',state:'off'}],false),null,'after the first take the line is gone');
 assert.equal(preflightLine(ready,true),null);
});

test('the next scene to record comes after the current one, then wraps to the earlier ones',()=>{
 const ids=['a','b','c'];
 assert.equal(nextSceneToRecord(ids,id=>id==='a','a'),'b');
 assert.equal(nextSceneToRecord(ids,id=>id!=='a','c'),'a');
 assert.equal(nextSceneToRecord(ids,()=>true,'b'),null);
});

test('take thumbnails read "Take 1 (00:07)"',()=>{
 assert.equal(takeThumbnailLabel('Take 1',7.9),'Take 1 (00:07)');
 assert.equal(takeThumbnailLabel('Intro',125),'Intro (02:05)');
});
