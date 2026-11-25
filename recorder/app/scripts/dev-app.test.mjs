import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveDevAppTarget,assertReplaceable,DEV_BUNDLE_ID} from './dev-app.mjs';

test('the dev app is Creator Compiler Dev.app in ~/Applications, and can never be SceneForge Dev.app', () => {
 assert.equal(resolveDevAppTarget({env:{},home:'/Users/x'}), '/Users/x/Applications/Creator Compiler Dev.app');
 assert.equal(resolveDevAppTarget({env:{CREATORCLUB_DEV_APP_DIR:'/tmp/apps'},home:'/Users/x'}), '/tmp/apps/Creator Compiler Dev.app');
 // Even when the folder points at SceneForge's folder, the name is fixed.
 assert.equal(resolveDevAppTarget({env:{SCENEFORGE_DEV_APP_DIR:'/Users/x/Applications'},home:'/Users/x'}), '/Users/x/Applications/Creator Compiler Dev.app');
 assert.throws(() => resolveDevAppTarget({env:{CREATORCLUB_DEV_APP_DIR:'/Users/x/SceneForge Dev.app/Contents'},home:'/'}), /Refusing/);
});

test('an existing bundle is replaced only when it is a Creator Compiler dev build', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-devapp-'));
 try {
  await assertReplaceable(path.join(dir, 'missing.app'));
  const mine = path.join(dir, 'mine.app');
  await mkdir(path.join(mine, 'Contents'), { recursive: true });
  await writeFile(path.join(mine, 'Contents/Info.plist'), `<plist><dict><string>${DEV_BUNDLE_ID}</string></dict></plist>`);
  await assertReplaceable(mine);
  const other = path.join(dir, 'other.app');
  await mkdir(path.join(other, 'Contents'), { recursive: true });
  await writeFile(path.join(other, 'Contents/Info.plist'), '<plist><dict><string>com.samin.sceneforge.dev</string></dict></plist>');
  await assert.rejects(assertReplaceable(other), /not a Creator Compiler dev app/);
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});

test('dev bundles sign with the named identity, else the pinned one still in the keychain, else the only one, else ad-hoc', async () => {
 const {devSigningIdentity}=await import('./dev-app.mjs');
 const a='A'.repeat(40),b='B'.repeat(40);
 const list=(...shas)=>shas.map((sha,i)=>`  ${i+1}) ${sha} "Apple Development: Someone (TEAM${i})"`).join('\n')+`\n     ${shas.length} valid identities found\n`;
 const dir = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-devsign-'));
 try {
  assert.equal(await devSigningIdentity({root:dir,env:{CREATORCLUB_DEV_SIGN_IDENTITY:'Mine'},list:list(a)}), 'Mine');
  assert.equal(await devSigningIdentity({root:dir,env:{},list:list(a)}), a);
  assert.equal(await devSigningIdentity({root:dir,env:{},list:list(a,b)}), '-', 'several and no pin: ad-hoc, never a guess');
  assert.equal(await devSigningIdentity({root:dir,env:{},list:list()}), '-');
  await mkdir(path.join(dir,'.local'));await writeFile(path.join(dir,'.local/signing-identity.json'),JSON.stringify({version:1,sha1:b}));
  assert.equal(await devSigningIdentity({root:dir,env:{},list:list(a,b)}), b);
  assert.equal(await devSigningIdentity({root:dir,env:{},list:list(a)}), a, 'a pin no longer in the keychain is skipped');
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});
