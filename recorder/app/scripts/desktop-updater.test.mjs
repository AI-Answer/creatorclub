import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {CHECK_EVERY_MS,startUpdater,updateMenuItem}=require('../desktop/updater.cjs');

function fakeSource(){
 const listeners={},calls={checks:0,installs:[]};
 const source={autoDownload:false,autoInstallOnAppQuit:false,allowPrerelease:true,
  on:(event,fn)=>{(listeners[event]??=[]).push(fn);},
  checkForUpdates:async()=>{calls.checks++;},
  quitAndInstall:(...args)=>calls.installs.push(args)};
 return {source,calls,emit:(event,...args)=>listeners[event]?.forEach(fn=>fn(...args))};
}
function start(source,extra={}){
 const timers=[],states=[];
 const updater=startUpdater({source,log:()=>{},onState:state=>states.push(state),now:()=>1000,every:(ms,fn)=>{timers.push({ms,fn});return()=>{};},...extra});
 return {updater,timers,states};
}

test('an installed app checks at start and every half hour, downloads by itself and installs on quit, releases only', () => {
 const {source,calls}=fakeSource();
 const {timers}=start(source);
 assert.equal(calls.checks,1,'checks once at start');
 assert.deepEqual(timers.map(t=>t.ms),[CHECK_EVERY_MS]);
 assert.equal(CHECK_EVERY_MS,30*60_000);
 assert.equal(source.autoDownload,true);
 assert.equal(source.autoInstallOnAppQuit,true);
 assert.equal(source.allowPrerelease,false);
});

test('a downloaded update waits: it never restarts the app by itself, and Restart to Update installs it and reopens', () => {
 const {source,calls,emit}=fakeSource();
 const {updater,timers,states}=start(source);
 assert.equal(updater.install(),false,'nothing to install yet');
 emit('checking-for-update');emit('update-available',{version:'0.1.400'});
 assert.deepEqual(updater.state(),{state:'downloading',next:'0.1.400'});
 emit('update-downloaded',{version:'0.1.400'});
 assert.deepEqual(updater.state(),{state:'ready',next:'0.1.400'});
 assert.deepEqual(calls.installs,[],'no restart on its own');
 timers[0].fn();
 assert.equal(calls.checks,1,'a downloaded build is not asked for again');
 emit('error',new Error('offline'));
 assert.equal(updater.state().state,'ready','a later failed check keeps the downloaded build');
 assert.equal(updater.install(),true);
 assert.deepEqual(calls.installs,[[false,true]],'installs and opens the app again');
 assert.deepEqual(states.map(s=>s.state),['checking','downloading','ready']);
});

test('up to date and failed checks are reported, and a check already running is not started twice', async () => {
 const {source,calls,emit}=fakeSource();
 const {updater,timers}=start(source);
 emit('checking-for-update');
 timers[0].fn();
 assert.equal(calls.checks,1,'no second check while one runs');
 emit('update-not-available');
 assert.deepEqual(updater.state(),{state:'current',checkedAt:1000});
 emit('error',new Error('rate limited'));
 assert.deepEqual(updater.state(),{state:'failed',reason:'rate limited',checkedAt:1000});
 const rejecting=fakeSource();rejecting.source.checkForUpdates=async()=>{throw new Error('no network');};
 const second=start(rejecting.source);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(second.updater.state(),{state:'failed',reason:'no network',checkedAt:1000});
});

test('the app menu item follows the update state', () => {
 assert.deepEqual(updateMenuItem({state:'idle'}),{label:'Check for Updates…',enabled:true,action:'check'});
 assert.deepEqual(updateMenuItem({state:'current',checkedAt:1}),{label:'Check for Updates…',enabled:true,action:'check'});
 assert.deepEqual(updateMenuItem({state:'failed',reason:'x',checkedAt:1}),{label:'Check for Updates…',enabled:true,action:'check'});
 assert.deepEqual(updateMenuItem({state:'checking'}),{label:'Checking for Updates…',enabled:false,action:null});
 assert.deepEqual(updateMenuItem({state:'downloading',next:'0.1.9'}),{label:'Downloading Update 0.1.9…',enabled:false,action:null});
 assert.deepEqual(updateMenuItem({state:'ready',next:'0.1.9'}),{label:'Restart to Update (0.1.9)',enabled:true,action:'install'});
});

// Electron cannot start in tests, so the shell's use of the updater is checked in its source.
test('only an installed copy updates, it loads the bundled library, and a restart waits for recordings and exports', async () => {
 const main=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8');
 assert.match(main,/if\(!app\.isPackaged\|\|process\.env\.CREATORCLUB_NO_UPDATE==='1'/);
 assert.match(main,/require\(path\.join\(__dirname,'\.\.','server-dist','electron-updater\.cjs'\)\)\.autoUpdater/);
 assert.match(main,/if\(recordingCloseGuard\.active\(\)\)return 'A recording is still running\.'/);
 assert.match(main,/if\(health\.runningJobs>0\)return 'An export is still running\.'/);
 assert.match(main,/submenu:\[\{role:'about'\},\.\.\.updateMenu\(\)/);
 const bundle=await readFile(new URL('./bundle-server.mjs',import.meta.url),'utf8');
 assert.match(bundle,/outfile:'server-dist\/electron-updater\.cjs'/);
});

test('installers are CreatorClub, publish to this repository, and a team-signed Mac build swaps in its certificate', () => {
 const config=require('../electron-builder.cjs');
 assert.equal(config.productName,'CreatorClub');
 assert.equal(config.appId,'com.aianswer.creatorclub');
 assert.deepEqual(config.publish,{provider:'github',owner:'AI-Answer',repo:'creatorclub',releaseType:'release'});
 assert.ok(config.mac.target.includes('zip'),'a Mac updates from the zip');
 assert.equal(config.mac.hardenedRuntime,true);
 assert.equal(config.mac.sign,undefined);
 const path=require.resolve('../electron-builder.cjs');
 delete require.cache[path];
 process.env.CREATORCLUB_SIGN_SHA1='A'.repeat(40);
 try{
  const signed=require('../electron-builder.cjs');
  assert.equal(signed.mac.identity,'-');
  assert.equal(signed.mac.sign,'scripts/sign-creatorclub-dev.cjs');
  assert.equal(signed.mac.hardenedRuntime,false,'macOS refuses a hardened app signed with a self-signed certificate');
 }finally{delete process.env.CREATORCLUB_SIGN_SHA1;delete require.cache[path];}
});
