import test from 'node:test';
import assert from 'node:assert/strict';
import {isStaleBuild,reloadForNewBuild} from './stale-build';

test('a screen whose code file is gone after an update reloads once onto the new build, never in a loop', () => {
 assert.ok(isStaleBuild(new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1:4184/assets/Workspace-DciNB2oI.js')));
 assert.ok(!isStaleBuild(new Error('Cannot read properties of undefined')));
 const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v)};
 let reloads=0;
 assert.equal(reloadForNewBuild(1_000_000,storage,()=>reloads++),true);
 assert.equal(reloadForNewBuild(1_030_000,storage,()=>reloads++),false,'not again within a minute');
 assert.equal(reloadForNewBuild(1_070_000,storage,()=>reloads++),true);
 assert.equal(reloads,2);
});
