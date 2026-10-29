import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarColor,band,cleanTitle,fmtClock,fmtDate,fmtDays,fmtHours,fmtMS,fmtMult,fmtNum,hashOf,initials,parseClock,sentence,thumbGradient,ytThumb} from './format';

test('fmtNum shortens thousands, millions and billions, and shows a dash for nothing',()=>{
 const cases:Array<[number|null|undefined,string]>=[[0,'0'],[999,'999'],[1000,'1K'],[1234,'1.2K'],[9999,'10K'],[12345,'12K'],[999999,'1000K'],[1500000,'1.5M'],[12000000,'12M'],[2400000000,'2.4B'],[null,'—'],[undefined,'—'],[Number.NaN,'—']];
 for(const [value,expected] of cases)assert.equal(fmtNum(value),expected,String(value));
});

test('fmtMult and band follow Eden: two decimals under 10×, a band class from grey to red',()=>{
 assert.equal(fmtMult(2.84),'2.84×');assert.equal(fmtMult(23.4),'23×');
 const cases:Array<[number,string]>=[[0.4,'b-grey'],[1,'b-blue'],[3,'b-green'],[5,'b-amber'],[10,'b-orange'],[50,'b-red'],[Number.NaN,'b-grey']];
 for(const [value,expected] of cases)assert.equal(band(value),expected,String(value));
});

test('fmtDays and fmtHours say how long ago in the shortest words',()=>{
 assert.equal(fmtDays(0.01),'1h ago');assert.equal(fmtDays(0.5),'12h ago');assert.equal(fmtDays(1),'1 day ago');assert.equal(fmtDays(1.4),'1 day ago');assert.equal(fmtDays(2),'2 days ago');assert.equal(fmtDays(9.6),'10 days ago');
 assert.equal(fmtHours(0.25),'15m');assert.equal(fmtHours(5),'5h');assert.equal(fmtHours(47),'47h');assert.equal(fmtHours(48),'2d');assert.equal(fmtHours(100),'4d');
});

test('clocks: fmtClock, fmtMS and parseClock agree with each other',()=>{
 assert.equal(fmtClock(0),'0:00');assert.equal(fmtClock(75),'1:15');assert.equal(fmtClock(600),'10:00');assert.equal(fmtClock(-3),'0:00');assert.equal(fmtClock(59.6),'1:00');
 assert.equal(fmtMS(45),'45s');assert.equal(fmtMS(120),'2m');assert.equal(fmtMS(75),'1m 15s');
 assert.equal(parseClock('1:30'),90);assert.equal(parseClock(' 12:05 '),725);assert.equal(parseClock('2'),120);assert.equal(parseClock('1.5'),90);assert.equal(parseClock('abc'),null);assert.equal(parseClock(''),null);
 for(const seconds of [0,59,60,61,725])assert.equal(parseClock(fmtClock(seconds)),seconds);
});

test('fmtDate reads a day or an ISO time and shows a dash for nothing',()=>{
 assert.equal(fmtDate('2026-10-29'),'Oct 29');assert.equal(fmtDate('2026-01-05'),'Jan 5');assert.equal(fmtDate('2026-12-31T12:00:00'),'Dec 31');
 assert.equal(fmtDate(undefined),'—');assert.equal(fmtDate(null),'—');assert.equal(fmtDate(''),'—');assert.equal(fmtDate('not a date'),'—');
});

test('initials take two letters from a name, a subreddit or a single word',()=>{
 assert.equal(initials('Samin Yasar'),'SY');assert.equal(initials('r/ClaudeAI'),'CL');assert.equal(initials('Dani'),'DA');assert.equal(initials('x'),'X');
 assert.equal(initials('Ünal Çelik'),'ÜÇ');assert.equal(initials(''),'?');assert.equal(initials(undefined),'?');assert.equal(initials('  Jo   Bo  '),'JB');
});

test('text helpers: sentence, cleanTitle, ytThumb',()=>{
 assert.equal(sentence('hello there'),'Hello there');assert.equal(sentence(''),'');assert.equal(sentence('Already'),'Already');
 assert.equal(cleanTitle('Claude Code tips (Updated)'),'Claude Code tips');assert.equal(cleanTitle('Plain title'),'Plain title');assert.equal(cleanTitle(undefined),'');assert.equal(cleanTitle('Why (not) this'),'Why (not) this');
 assert.equal(ytThumb('abc123DEF45'),'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg');
});

test('the same name always gets the same avatar colour and the same draft thumbnail',()=>{
 assert.equal(hashOf('Samin'),hashOf('Samin'));assert.notEqual(hashOf('Samin'),hashOf('Dani'));
 assert.equal(avatarColor('Samin'),avatarColor('Samin'));assert.match(avatarColor('Samin'),/^#[0-9a-f]{6}$/);
 assert.deepEqual(thumbGradient('v-1'),thumbGradient('v-1'));assert.equal(thumbGradient('v-1').length,2);
});
