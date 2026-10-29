import test from 'node:test';
import assert from 'node:assert/strict';
import {IN_THE_FUTURE,TAGS_MAX_CHARS,addTags,defaultSchedule,localInputValue,progressOf,progressRows,publishProblem,resultWords,scheduleTime,whenText} from './publish-logic';

test('tags are split on commas and new lines, trimmed, without a leading #, and never repeated whatever their case',()=>{
 assert.deepEqual(addTags([],'claude, #ai agents\n  mods ,,'),['claude','ai agents','mods']);
 assert.deepEqual(addTags(['Claude'],'claude, CLAUDE, new'),['Claude','new']);
 assert.deepEqual(addTags(['a'],'   '),['a']);
});

test('tags stop at the 500 characters YouTube allows in all',()=>{
 const many=Array.from({length:200},(_,i)=>`tag-number-${i}`).join(',');
 const list=addTags([],many);
 assert.ok(list.length<200);
 assert.ok(list.reduce((sum,tag)=>sum+tag.length+1,0)<=TAGS_MAX_CHARS);
});

test('Schedule for later starts tomorrow at 15:00 in the person\'s own time, and reads back as a clear time',()=>{
 const now=new Date(2026,9,29,21,40);
 assert.equal(defaultSchedule(now),'2026-10-30T15:00');
 assert.equal(localInputValue(new Date(2026,0,5,9,5)),'2026-01-05T09:05');
 assert.equal(whenText(new Date(2026,9,31,15,0)),'Sat 31 Oct, 15:00');
});

test('a scheduled time must be at least a minute ahead',()=>{
 const now=new Date(2026,9,29,12,0);
 assert.deepEqual(scheduleTime('',now),{message:IN_THE_FUTURE});
 assert.deepEqual(scheduleTime('nonsense',now),{message:IN_THE_FUTURE});
 assert.deepEqual(scheduleTime('2026-10-29T12:00',now),{message:IN_THE_FUTURE});
 assert.deepEqual(scheduleTime('2026-10-29T12:00:30',now),{message:IN_THE_FUTURE});
 const ok=scheduleTime('2026-10-30T15:00',now);
 assert.ok('iso' in ok&&ok.iso===new Date(2026,9,30,15,0).toISOString());
});

test('what stands in the way of Publish is said once, in the order the person fixes it',()=>{
 const ready={connected:true,channel:true,exported:true,kids:'no' as const,title:'A title'};
 assert.equal(publishProblem(ready),null);
 assert.equal(publishProblem({...ready,connected:false,channel:false,exported:false,kids:null}),'Connect Postiz first.');
 assert.equal(publishProblem({...ready,channel:false,exported:false}),'Choose the YouTube channel first.');
 assert.equal(publishProblem({...ready,exported:false}),'Export the video first.');
 assert.match(publishProblem({...ready,exported:false,stale:true})!,/^Export the video again first\./);
 assert.equal(publishProblem({...ready,title:'  ',kids:null}),'Add a title first.');
 assert.match(publishProblem({...ready,kids:null})!,/made for kids/);
});

test('progress events from the server are read, and anything else is ignored',()=>{
 assert.deepEqual(progressOf({step:'upload',message:'Sending',percent:40}),{step:'upload',message:'Sending',percent:40});
 assert.deepEqual(progressOf({step:'post',message:'Posting'}),{step:'post',message:'Posting'});
 for(const bad of [null,'x',{step:'zip',message:'x'},{step:'upload'}])assert.equal(progressOf(bad),null);
});

test('the progress rows: export done, then sending with its percent, then Postiz; a failure stops the row that was running',()=>{
 assert.deepEqual(progressRows(null,false,false).map(row=>row.state),['done','todo','todo']);
 const sending=progressRows({step:'upload',message:'',percent:63},false,false);
 assert.deepEqual(sending.map(row=>row.state),['done','on','todo']);
 assert.equal(sending[1].label,'Sending the video to Postiz, 63%');
 assert.equal(sending[1].percent,63);
 const posting=progressRows({step:'wait',message:''},false,false);
 assert.deepEqual(posting.map(row=>row.state),['done','done','on']);
 assert.equal(posting[2].label,'Postiz is putting it on YouTube');
 assert.equal(progressRows({step:'post',message:''},false,true)[2].label,'Scheduling it in Postiz');
 assert.deepEqual(progressRows({step:'upload',message:'',percent:63},true,false).map(row=>row.state),['done','fail','todo']);
});

test('the result says where the video is: on YouTube, scheduled, or with Postiz',()=>{
 assert.deepEqual(resultWords({state:'published',visibility:'unlisted'}),{title:"It's on YouTube",line:'It is live as unlisted. YouTube may take a few minutes to show it in HD.',done:true});
 const scheduled=resultWords({state:'queued',visibility:'public',scheduledFor:new Date(2026,9,31,15,0).toISOString()});
 assert.equal(scheduled.title,"It's scheduled");
 assert.match(scheduled.line,/Sat 31 Oct, 15:00/);
 assert.deepEqual(resultWords({state:'queued',visibility:'public'}).done,false);
});
