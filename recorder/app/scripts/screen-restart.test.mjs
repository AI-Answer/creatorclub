import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const main=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8');
test('opening Screen Recording settings requires restart only after a granted status is observed',async()=>{
 const context=vm.createContext({process:{platform:'darwin'},privacyPanes:{screen:'Privacy_ScreenCapture'},status:'denied',desktopCapturer:{getSources:async()=>[]},shell:{openExternal:async()=>{}},permissionHelper:{open:async()=>{}}});
 vm.runInContext(`let screenSettingsOpened=false,screenRestartRequired=false;const getNativeMediaStatus=()=>status;${main.slice(main.indexOf('function getMediaPermissions(){'),main.indexOf('function verifyDesktopSender('))}`,context);
 const permissions=()=>vm.runInContext('getMediaPermissions()',context);
 assert.equal(permissions().screenRestartRequired,false);
 await vm.runInContext("openPrivacySettings('screen')",context);
 assert.equal(permissions().screenRestartRequired,false);
 context.status='granted';assert.equal(permissions().screenRestartRequired,true);
});
