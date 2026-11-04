import test from 'node:test';
import assert from 'node:assert/strict';
import type {Video} from '../../shared/club';
import {applyMove,beforeIdAt,boardColumns,calendarDay,calendarPlan,clickSort,dropIndex,isDescending,isSamePlace,monthGrid,monthTitle,nextInStage,openRoute,planMove,scenesLine,shiftMonth,tableDateText,tableRows,type TableSort} from './production';

let n=0;
const video=(over:Partial<Video>={}):Video=>({id:`v${++n}`,title:`Video ${n}`,stage:'ideas',order:0,createdAt:`2026-10-${String(10+n).padStart(2,'0')}T00:00:00.000Z`,updatedAt:'2026-10-20T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...over});
const ids=(videos:readonly Video[])=>videos.map(v=>v.id);
const col=(videos:Video[],stage:Video['stage'])=>boardColumns(videos).find(column=>column.stage===stage)!;

test('a video opens in the Ideas drawer when it is an idea, else on the tab for its stage or the one asked for',()=>{
 assert.deepEqual(openRoute(video({id:'a'})),{name:'videos',view:'board',open:'a'});
 assert.deepEqual(openRoute(video({id:'b',stage:'recording'})),{name:'video',id:'b',tab:'record'});
 assert.deepEqual(openRoute(video({id:'c',stage:'published'})),{name:'video',id:'c',tab:'publish'});
 assert.deepEqual(openRoute(video({id:'d',stage:'planning'}),'publish'),{name:'video',id:'d',tab:'publish'});
 assert.equal(scenesLine(2,5),'2 of 5 scenes');assert.equal(scenesLine(0,1),'0 of 1 scene');
});

test('the board has six columns in board order; including Later and Skipped, Published has the latest first',()=>{
 const a=video({id:'a',order:2}),b=video({id:'b',order:0}),c=video({id:'c',order:2,createdAt:'2026-01-01T00:00:00.000Z'}),later=video({id:'l',hidden:'later'}),skipped=video({id:'k',hidden:'skipped'});
 const old=video({id:'old',stage:'published',publishedAt:'2026-09-01',order:0}),fresh=video({id:'new',stage:'published',publishedAt:'2026-10-14',order:5});
 const columns=boardColumns([a,b,c,later,skipped,old,fresh]);
 assert.deepEqual(columns.map(column=>column.stage),['ideas','planning','recording','editing','publishing','published']);
 assert.deepEqual(ids(columns[0].all),['b','l','k','c','a']);
 assert.deepEqual(ids(columns[5].all),['new','old']);
 const many=Array.from({length:8},(_,i)=>video({id:`i${i}`,order:i}));
 const ideas=col(many,'ideas');
 assert.equal(ideas.all.length,8);assert.equal(ideas.shown.length,8,'every idea is drawn without extra groups');
 assert.equal(col(many,'planning').shown.length,0);
});

test('dropIndex finds the first card below the pointer',()=>{
 assert.equal(dropIndex([50,150,250],10),0);assert.equal(dropIndex([50,150,250],100),1);assert.equal(dropIndex([50,150,250],260),3);assert.equal(dropIndex([],5),0);
});

test('a card dropped among the drawn ones goes before the one at that place; Ideas and Published take it last',()=>{
 const planning=[video({id:'a',stage:'planning',order:0}),video({id:'b',stage:'planning',order:1}),video({id:'c',stage:'planning',order:2})];
 const column=col(planning,'planning');
 assert.equal(beforeIdAt(column,'x',0),'a');assert.equal(beforeIdAt(column,'x',2),'c');assert.equal(beforeIdAt(column,'x',3),null);
 assert.equal(beforeIdAt(column,'b',1),'c','the dragged card is not counted');assert.equal(beforeIdAt(column,'c',2),null);
 const ideas=col(Array.from({length:4},(_,i)=>video({id:`i${i}`,order:i})),'ideas');
 assert.equal(beforeIdAt(ideas,'x',0),null,'Ideas are grouped and ranked, not in an order of yours');
 assert.equal(beforeIdAt({stage:'planning',all:[...planning,video({id:'d',stage:'planning',order:3})],shown:planning},'x',3),'d','at the end of a part-shown column it goes before the first one not drawn');
 assert.equal(beforeIdAt(col([video({id:'p',stage:'published',order:0})],'published'),'x',0),null,'Published has no order');
});

test('applyMove numbers the target stage, records the date and mirrors the server',()=>{
 const a=video({id:'a',order:0}),b=video({id:'b',order:1}),c=video({id:'c',order:2}),r=video({id:'r',stage:'recording',order:0}),r2=video({id:'r2',stage:'recording',order:1});
 const all=[a,b,c,r,r2];
 const into=applyMove(all,'b','recording','r2','2026-11-01T00:00:00.000Z');
 const moved=into.find(v=>v.id==='b')!;
 assert.equal(moved.stage,'recording');assert.equal(moved.stageDates.recording,'2026-11-01T00:00:00.000Z');
 assert.deepEqual(ids(col(into,'recording').all),['r','b','r2']);assert.deepEqual(ids(col(into,'ideas').all),['a','c']);
 assert.equal(into.find(v=>v.id==='r2')!.order,2);
 assert.deepEqual(ids(col(applyMove(all,'a','ideas',null,'x'),'ideas').all),['b','c','a'],'no neighbour means last');
 assert.deepEqual(ids(col(applyMove(all,'c','ideas','a','x'),'ideas').all),['c','a','b']);
 assert.equal(applyMove(all,'c','ideas','a','x').find(v=>v.id==='c')!.stageDates.ideas,undefined,'a move inside a stage keeps its dates');
 const undone=applyMove(into,'b','ideas','c','x',{ideas:'old'});
 assert.deepEqual(undone.find(v=>v.id==='b')!.stageDates,{ideas:'old'});
 assert.equal(all[1].stage,'ideas','the input is not changed');
});

test('isSamePlace spots moves that change nothing; nextInStage names the card to put a video back before',()=>{
 const a=video({id:'a',order:0}),b=video({id:'b',order:1}),c=video({id:'c',order:2}),all=[a,b,c];
 assert.equal(isSamePlace(all,'b','ideas','c'),true);assert.equal(isSamePlace(all,'c','ideas',null),true);
 assert.equal(isSamePlace(all,'a','ideas','c'),false);assert.equal(isSamePlace(all,'a','planning',null),false);
 assert.equal(nextInStage(all,'a'),'b');assert.equal(nextInStage(all,'c'),null);assert.equal(nextInStage(all,'nope'),null);
});

test('a move says where it went and keeps what Undo needs; moves that change nothing are not moves',()=>{
 const a=video({id:'a',order:0,stageDates:{ideas:'2026-10-01T00:00:00.000Z'}}),b=video({id:'b',order:1}),p=video({id:'p',stage:'published',order:0});
 const all=[a,b,p];
 assert.deepEqual(planMove(all,'a','recording',null),{message:'Moved to Recording',previous:{stage:'ideas',beforeId:'b',stageDates:{ideas:'2026-10-01T00:00:00.000Z'}}});
 assert.equal(planMove(all,'b','ideas','a'),null,'Ideas have no order to change');
 assert.equal(planMove(all,'b','ideas',null),null);
 assert.equal(planMove(all,'p','published',null),null,'Published has no order to change');
 assert.equal(planMove(all,'a','published',null)!.message,'Moved to Published');
 assert.equal(planMove(all,'a','publishing',null)!.message,'Moved to Publishing','whether it may go there is the move rule, asked before');
 assert.equal(planMove([video({id:'r',recorderProjectId:'p1'})],'r','publishing',null)!.message,'Moved to Publishing');
 assert.equal(planMove(all,'gone','planning',null),null);
 const withHidden=[...all,video({id:'h',order:2,hidden:'later'})];
 assert.equal(planMove(withHidden,'a','ideas',null),null);
 const plans=[video({id:'p1',stage:'planning',order:0}),video({id:'p2',stage:'planning',order:1}),video({id:'p3',stage:'planning',order:2,hidden:'later'})];
 assert.equal(planMove(plans,'p1','planning',null)!.message,'Moved in Planning');
 assert.equal(planMove(plans,'p2','planning',null),null,'what is out of sight after it does not count');
});

test('the table starts with the furthest-along videos and sorts by each column, turning around on a second press',()=>{
 const idea=video({id:'idea',title:'Beta',order:0}),rec=video({id:'rec',title:'Alpha',stage:'recording',order:0,publishDate:'2026-11-03'});
 const live=video({id:'live',title:'Gamma',stage:'published',publishedAt:'2026-10-14',views:12400}),hidden=video({id:'h',hidden:'later'});
 const all=[idea,rec,live,hidden];
 const recorded=(v:Video)=>v.id==='rec'?3:v.id==='idea'?1:0;
 const rows=(sort:TableSort)=>ids(tableRows(all,sort,recorded));
 const stage:TableSort={key:'stage',dir:1};
 assert.deepEqual(rows(stage),['live','rec','idea'],'Later and Skipped are not listed');
 assert.deepEqual(rows(clickSort(stage,'stage')),['idea','rec','live']);
 assert.deepEqual(rows({key:'title',dir:1}),['rec','idea','live']);assert.deepEqual(rows({key:'title',dir:-1}),['live','idea','rec']);
 assert.deepEqual(rows({key:'views',dir:1}),['live','idea','rec']);
 assert.deepEqual(rows({key:'scenes',dir:1}),['rec','idea','live']);
 assert.deepEqual(rows({key:'date',dir:1}),['rec','live','idea'],'the latest day first');
 assert.deepEqual(clickSort(stage,'views'),{key:'views',dir:1});assert.deepEqual(clickSort({key:'views',dir:1},'views'),{key:'views',dir:-1});assert.deepEqual(clickSort({key:'views',dir:-1},'views'),{key:'views',dir:1});
 assert.equal(isDescending({key:'views',dir:1}),true);assert.equal(isDescending({key:'title',dir:1}),false);assert.equal(isDescending({key:'title',dir:-1}),true);
 assert.deepEqual(tableDateText(live),{text:'Oct 14',planned:false});
 assert.deepEqual(tableDateText(rec),{text:'Nov 3 · planned',planned:true});
 assert.equal(tableDateText(idea),null);
});

test('a video sits on the day it was published, the day set for it, or the day it entered its stage; an idea only on a day set for it',()=>{
 const entered=new Date(2026,9,14,22,30).toISOString();
 assert.equal(calendarDay(video({stage:'planning',publishDate:'2026-11-03',stageDates:{planning:entered}})),'2026-11-03');
 assert.equal(calendarDay(video({stage:'planning',stageDates:{planning:entered}})),'2026-10-14','local time');
 assert.equal(calendarDay(video({stage:'published',publishedAt:'2026-10-05',publishDate:'2026-11-03',stageDates:{published:entered}})),'2026-10-05');
 assert.equal(calendarDay(video({stage:'published',stageDates:{published:entered}})),'2026-10-14');
 assert.equal(calendarDay(video({stage:'planning',stageDates:{ideas:entered}})),undefined,'it entered another stage');
 assert.equal(calendarDay(video({stageDates:{ideas:entered}})),undefined,'an idea is not on the calendar without a day');
 assert.equal(calendarDay(video({publishDate:'2026-11-03'})),'2026-11-03');
 assert.equal(calendarDay(video({stage:'planning',hidden:'later',publishDate:'2026-11-03'})),undefined);
});

test('the calendar groups videos by day and lists the ones in production that have none, furthest along first',()=>{
 const a=video({id:'a',stage:'planning',publishDate:'2026-11-03',order:1}),b=video({id:'b',stage:'published',publishedAt:new Date(2026,10,3,23,30).toISOString(),order:0});
 const loose=video({id:'g',stage:'planning'}),editing=video({id:'e',stage:'editing'}),idea=video({id:'i'}),done=video({id:'p',stage:'published'});
 const plan=calendarPlan([a,b,loose,editing,idea,done]);
 assert.deepEqual([...plan.days.keys()],['2026-11-03']);assert.deepEqual(ids(plan.days.get('2026-11-03')!),['b','a']);
 assert.deepEqual(ids(plan.unscheduled),['e','g'],'ideas and published videos are never listed as not scheduled');
});

test('the month grid is whole weeks starting on Monday',()=>{
 const oct=monthGrid({year:2026,month:9});
 assert.equal(oct.length,5);assert.ok(oct.every(week=>week.length===7));
 assert.equal(oct[0][0].key,'2026-09-28','October 2026 starts on a Thursday');assert.equal(oct[0][0].inMonth,false);
 assert.equal(oct[0][3].key,'2026-10-01');assert.equal(oct[0][3].inMonth,true);
 assert.equal(oct[4][6].key,'2026-11-01');
 const feb=monthGrid({year:2027,month:1});
 assert.equal(feb.length,4,'a 28-day month starting on Monday fits four weeks');assert.equal(feb[0][0].key,'2027-02-01');
 assert.equal(monthGrid({year:2026,month:7}).length,6,'August 2026 needs six weeks');
 assert.equal(monthTitle({year:2026,month:9}),'October 2026');
 assert.deepEqual(shiftMonth({year:2026,month:11},1),{year:2027,month:0});assert.deepEqual(shiftMonth({year:2026,month:0},-1),{year:2025,month:11});
});
