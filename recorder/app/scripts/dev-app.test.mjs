import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveDevAppTarget,assertReplaceable,DEV_BUNDLE_ID} from './dev-app.mjs';

test('the dev app is CreatorClub Dev.app in ~/Applications, and can never be SceneForge Dev.app', () => {
 assert.equal(resolveDevAppTarget({env:{},home:'/Users/x'}), '/Users/x/Applications/CreatorClub Dev.app');
 assert.equal(resolveDevAppTarget({env:{CREATORCLUB_DEV_APP_DIR:'/tmp/apps'},home:'/Users/x'}), '/tmp/apps/CreatorClub Dev.app');
 // Even when the folder points at SceneForge's folder, the name is fixed.
 assert.equal(resolveDevAppTarget({env:{SCENEFORGE_DEV_APP_DIR:'/Users/x/Applications'},home:'/Users/x'}), '/Users/x/Applications/CreatorClub Dev.app');
 assert.throws(() => resolveDevAppTarget({env:{CREATORCLUB_DEV_APP_DIR:'/Users/x/SceneForge Dev.app/Contents'},home:'/'}), /Refusing/);
});

test('an existing bundle is replaced only when it is a CreatorClub dev build', async () => {
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
  await assert.rejects(assertReplaceable(other), /not a CreatorClub dev app/);
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});
