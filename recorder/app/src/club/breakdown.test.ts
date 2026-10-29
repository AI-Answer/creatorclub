import test from 'node:test';
import assert from 'node:assert/strict';
const {formatAge,formatCount,isVideoFile,looksLikeVideoLink}=await import('./breakdown');

test('numbers, ages, links and files',()=>{
 assert.equal(formatCount(7_600_000),'7.6M');assert.equal(formatCount(140_000),'140K');assert.equal(formatCount(12_000),'12K');assert.equal(formatCount(950),'950');
 assert.deepEqual([0,1,3,29,30,59,60,364,365,800].map(formatAge),['today','yesterday','3 days ago','29 days ago','1 month ago','1 month ago','2 months ago','12 months ago','1 year ago','2 years ago']);
 for(const good of ['https://youtu.be/dQw4w9WgXcQ','youtube.com/watch?v=dQw4w9WgXcQ','https://www.instagram.com/reel/C8aBcD_eFgH/'])assert.equal(looksLikeVideoLink(good),true,good);
 for(const bad of ['','samin','two words','https://evil.com/watch?v=x','ftp://youtube.com/x','https://youtube.com.evil.com/x'])assert.equal(looksLikeVideoLink(bad),false,bad);
 assert.equal(isVideoFile({name:'Clip.MOV'}),true);assert.equal(isVideoFile({name:'notes.txt'}),false);
});
