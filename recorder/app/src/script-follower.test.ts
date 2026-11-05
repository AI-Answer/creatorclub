import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
import '../desktop/script-follower.js';
const F=(globalThis as any).ScriptFollower;
const {createSpeechFollower}=createRequire(import.meta.url)('../desktop/speech-follower.cjs');

test('tokens are Borumi\'s: whitespace words, a newline on the word before it, a [note] kept whole and secondary',()=>{
 const tokens=F.tokenize('Hi there,\n\n[pause for a beat] friends.  Go');
 assert.deepEqual(tokens,[{text:'Hi'},{text:'there,',newline:true},{text:'[pause for a beat]',secondary:true},{text:'friends.'},{text:'Go'}]);
 assert.deepEqual(F.tokenize('[unclosed note here'),[{text:'[unclosed note here',secondary:true}]);
 assert.deepEqual(F.tokenize(''),[]);
});

test('offsets count characters, so a speed is characters a second; notes take no time',()=>{
 const {starts,total}=F.offsets(F.tokenize('ab [x] cde fg'));
 assert.deepEqual(starts,[0,3,3,7]);assert.equal(total,9);
 assert.equal(F.indexAt(starts,0),0);assert.equal(F.indexAt(starts,2.9),0);assert.equal(F.indexAt(starts,3),2,'the last token starting there');assert.equal(F.indexAt(starts,100),3);
});

test('words compare without case, accents, punctuation or contractions; number words are digits',()=>{
 assert.deepEqual(F.words("We're can't won't I'll you've I'm"),['we','are','can','not','will','not','i','will','you','have','i','am']);
 assert.deepEqual(F.words('Café — well-known, “Twenty” 3.'),['cafe','well','known','20','3']);
 assert.equal(F.similarity('follow','follow'),1);assert.equal(F.similarity('',''),1);
 assert.ok(Math.abs(F.similarity('following','follwing')-8/9)<1e-9,'one edit over nine characters');assert.equal(F.similarity('abc','xyz'),0);
});

const SCRIPT='So today I want to show you how the script follows your voice. It listens while you read and keeps your place. If you skip a word, it still knows where you are. And if you start a sentence again, it goes back with you.';
test('the matcher follows reading, word by word and through a recognizer restart',()=>{
 const tokens=F.tokenize(SCRIPT),m=F.createMatcher(tokens),text=(i:number)=>tokens[i].text;
 assert.equal(m.hear('so today'),1);assert.equal(m.hear('so today i want to show you'),6);
 assert.equal(text(m.hear('so today i want to show you how the script follows')),'follows');
 m.restart();assert.equal(text(m.hear('your voice it listens')),'listens');
 assert.equal(m.hear('your voice it listens'),null,'the same words again: no move');
});

test('the matcher tolerates a misheard or skipped word and does not jump on one common word',()=>{
 const tokens=F.tokenize(SCRIPT),m=F.createMatcher(tokens),text=(i:number)=>tokens[i]?.text;
 m.hear('so today i want to show you how the script follows your voice it listens while you');
 assert.equal(text(m.hear('so today i want to show you how the script follows your voice it listens while you reed and keeps')),'keeps','"reed" for "read"');
 assert.equal(text(m.hear('it listens while you read and keeps your place if you a word')),'word,','"skip" not heard');
 const before=m.index();assert.equal(m.hear('it listens while you read and keeps your place if you a word you'),null,'"you" alone is not enough to jump ahead');assert.equal(m.index(),before);
 assert.equal(text(m.hear('it still knows where you are and if you start a sentence again')),'again,','a long stretch read quickly');
});

test('the matcher goes back with you when you start a sentence again, and a seek forgets what was heard before it',()=>{
 const tokens=F.tokenize(SCRIPT),m=F.createMatcher(tokens),text=(i:number)=>tokens[i]?.text;
 m.hear('so today i want to show you how the script follows your voice it listens while you read and keeps your place');
 assert.equal(text(m.index()),'place.');
 assert.equal(text(m.hear('so today i want to show you how the script follows your voice it listens while you read and keeps your place it listens while you')),'you','back to the sentence you started again');
 m.seek(0);assert.equal(m.index(),0);assert.equal(m.hear('so today i want to show you how the script follows your voice it listens while you read and keeps your place it listens while you'),null,'words heard before the rewind do not count');
 assert.equal(m.hear('so today i want to show you how the script follows your voice it listens while you read and keeps your place it listens while you so today'),1);
 m.seek(5);assert.equal(text(m.index()),'show');
});

test('Enhanced reads ahead at your pace (15 a second until measured, at least 8) for 0.75 s, at most one word past what it heard',()=>{
 const {starts}=F.offsets(F.tokenize('aaaa bbbb cccc dddd eeee'));
 assert.equal(F.optimisticIndex({confirmed:1,since:200,rate:15,starts}),1,'3 characters: still the heard word');
 assert.equal(F.optimisticIndex({confirmed:1,since:400,rate:15,starts}),2);
 assert.equal(F.optimisticIndex({confirmed:1,since:700,rate:30,starts}),2,'never two ahead');
 assert.equal(F.optimisticIndex({confirmed:1,since:800,rate:15,starts}),1,'after 0.75 s it waits for words');
 assert.equal(F.optimisticIndex({confirmed:4,since:400,rate:15,starts}),4,'not past the end');
 const pace=F.createPace();assert.equal(pace.rate(),15);
 pace.add(0,0);pace.add(2000,40);assert.equal(pace.rate(),15,'under 3 s measured');pace.add(4000,80);assert.equal(pace.rate(),20);
 pace.add(5000,81);pace.add(16000,90);assert.equal(pace.rate(),15,'a 10 s window');
 const slow=F.createPace();slow.add(0,0);slow.add(5000,10);assert.equal(slow.rate(),8,'at least 8');
});

test('voice activity enters at the speaking level and leaves after 400 ms of quiet; the scroll is Borumi\'s ease and timing',()=>{
 const vad=F.createVoiceActivity();
 assert.equal(vad.update(.2,0),false);assert.equal(vad.update(.5,10),true);assert.equal(vad.update(.35,20),true,'between the levels it stays');
 assert.equal(vad.update(.1,100),true);assert.equal(vad.update(.1,450),true);assert.equal(vad.update(.1,500),false);assert.equal(vad.update(null,600),false);
 assert.equal(F.ease(0),0);assert.equal(F.ease(.5),.5);assert.equal(F.ease(1),1);
 assert.equal(F.scrollDuration(3,4),500);assert.equal(F.scrollDuration(3,9),180,'6 or more ahead');assert.equal(F.scrollDuration(5,4),180,'back');
});

function fakeHelper(){
 const spawned:any[]=[];
 const spawnProcess=(file:string)=>{const child:any=Object.assign(new EventEmitter(),{file,stdin:new PassThrough(),stdout:new PassThrough(),written:[] as any[],kill:()=>{}});child.stdin.on('data',(d:Buffer)=>{for(const line of d.toString().split('\n').filter(Boolean))child.written.push(JSON.parse(line));});spawned.push(child);return child;};
 return {spawned,spawnProcess};
}
test('the follower helper runs once, takes commands as JSON lines and passes on only its known events',async()=>{
 const {spawned,spawnProcess}=fakeHelper(),events:any[]=[];
 const f=createSpeechFollower({helperPath:'/app/helper',platform:'darwin',exists:()=>true,spawnProcess,onEvent:(e:any)=>events.push(e)});
 assert.equal(f.available(),true);f.status();f.start({microphone:'MacBook Air Microphone',text:'Read this'});await new Promise(r=>setImmediate(r));
 assert.equal(spawned.length,1);assert.deepEqual(spawned[0].written,[{command:'status'},{command:'start',microphone:'MacBook Air Microphone',text:'Read this'}]);
 spawned[0].stdout.write('{"type":"status","authorization":"authorized","available":true}\n{"type":"words","text":"read"}\nnot json\n{"type":"secret","x":1}\n{"type":"err');
 spawned[0].stdout.write('or","message":"Mic gone"}\n');await new Promise(r=>setImmediate(r));
 assert.deepEqual(events,[{type:'status',authorization:'authorized',available:true},{type:'words',text:'read'},{type:'error',message:'Mic gone'}]);
 spawned[0].emit('close',0);assert.deepEqual(events.at(-1),{type:'stopped'});
 f.status();spawned[1].emit('close',null,'SIGABRT');assert.deepEqual(events.at(-1),{type:'error',message:'Voice follow could not ask for Speech Recognition permission in this build of the app.'},'a helper macOS ended says so');f.authorize();assert.equal(spawned.length,3,'a helper that exited is started again');
 f.dispose();
 const off=createSpeechFollower({platform:'win32',spawnProcess,onEvent:(e:any)=>events.push(e)});assert.equal(off.available(),false);off.status();assert.deepEqual(events.at(-1),{type:'status',authorization:'notDetermined',available:false});assert.equal(off.start({}),false);assert.equal(spawned.length,3);
});
