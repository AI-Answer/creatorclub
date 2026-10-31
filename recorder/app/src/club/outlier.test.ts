import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMultiplier,outlierBand} from './outlier';

test('outlier bands follow Eden: grey <1, blue 1–3, green 3–5, amber 5–10, orange 10–50, red 50+',()=>{
 const cases:Array<[number,string]>=[[0,'grey'],[0.99,'grey'],[1,'blue'],[2.84,'blue'],[3,'green'],[4.99,'green'],[5,'amber'],[9.99,'amber'],[10,'orange'],[49.9,'orange'],[50,'red'],[312,'red'],[Number.NaN,'grey']];
 for(const [value,band] of cases)assert.equal(outlierBand(value),band,String(value));
});

test('multipliers show two decimals under 10× and round from 10× up',()=>{
 assert.equal(formatMultiplier(2.84),'2.84×');assert.equal(formatMultiplier(0.5),'0.50×');assert.equal(formatMultiplier(9.5),'9.50×');
 assert.equal(formatMultiplier(10),'10×');assert.equal(formatMultiplier(23.4),'23×');assert.equal(formatMultiplier(23.5),'24×');
});
