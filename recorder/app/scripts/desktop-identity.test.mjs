import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {CREATORCLUB, creatorClubPaths, isCreatorClubService, methodologyDir, runtimeEnvironment} = createRequire(import.meta.url)('../desktop/runtime.cjs');
const main = await readFile(path.join(root, 'desktop/main.cjs'), 'utf8');
const mcp = await readFile(path.join(root, 'desktop/mcp-entry.mjs'), 'utf8');
const pack = await readFile(path.join(root, 'scripts/package.mjs'), 'utf8');
const launcher = await readFile(path.join(root, 'scripts/mcp-launcher.c'), 'utf8');

test('CreatorClub has its own name, port, user-data folder and studio folder, and SCENEFORGE_DATA_DIR still overrides the studio', () => {
 assert.equal(CREATORCLUB.name, 'CreatorClub');
 assert.notEqual(CREATORCLUB.port, 4174, 'never the SceneForge port');
 const appData = '/Users/x/Library/Application Support';
 assert.deepEqual(creatorClubPaths({appData, env: {}}), {userData: `${appData}/CreatorClub`, studio: `${appData}/CreatorClub/studio`});
 assert.equal(creatorClubPaths({appData, env: {SCENEFORGE_DATA_DIR: '/data/studio'}}).studio, '/data/studio');
});

test('only a CreatorClub service is accepted at startup, never a SceneForge one', () => {
 assert.equal(isCreatorClubService({application: 'SceneForge', product: 'CreatorClub', version: '0.1.0'}), true);
 assert.equal(isCreatorClubService({application: 'SceneForge', version: '0.1.0'}), false, 'SceneForge Dev.app\'s service');
 assert.equal(isCreatorClubService({application: 'Other', product: 'CreatorClub', version: '0.1.0'}), false);
 assert.equal(isCreatorClubService(null), false);
});

// Electron cannot start in tests, so the shell's use of these is checked in its source.
test('the desktop shell sets its name and user-data folder before the single-instance lock, and uses its own port and studio', () => {
 assert.match(main, /app\.setName\(CREATORCLUB\.name\)/);
 assert.doesNotMatch(main, /setName\('SceneForge'\)/);
 const setPath = main.indexOf("app.setPath('userData',paths.userData)"), lock = main.indexOf('app.requestSingleInstanceLock()');
 assert.ok(setPath > 0 && setPath < lock, 'userData is set before the lock is taken');
 assert.match(main, /const PORT=CREATORCLUB\.port/);
 assert.match(main, /title:CREATORCLUB\.name/);
 assert.match(main, /label:CREATORCLUB\.name,submenu/);
 assert.match(main, /isCreatorClubService\(await r\.json\(\)\)/);
 assert.match(main, /data:paths\.studio/);
 assert.match(main, /dataDir:paths\.studio/);
 assert.match(main, /SCENEFORGE_MCP_COMMAND\?\?=''/, 'no launcher of its own means no MCP launcher is advertised');
 assert.doesNotMatch(main, /4174/);
});

test('the MCP launcher reaches the CreatorClub service and studio, and the package is CreatorClub.app', () => {
 assert.match(mcp, /runtime\.CREATORCLUB\.port/);
 assert.match(mcp, /runtime\.creatorClubPaths\(/);
 assert.match(mcp, /runtime\.isCreatorClubService\(/);
 assert.doesNotMatch(mcp, /4174|SceneForge service|SceneForge editing/);
 assert.match(launcher, /"%s\/CreatorClub"/);
 assert.match(pack, /APP_NAME='CreatorClub',APP_ID='com\.aianswer\.creatorclub'/);
 assert.match(pack, /'server-dist\/methodology\/package\.md'/, 'packaging refuses a server bundle without methodology/');
 assert.doesNotMatch(pack, /'SceneForge|com\.samin/);
});

test('the service finds methodology/ at the repo root (dev app), next to the bundled server (packaged), or where the env points', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-identity-'));
 try {
  const app = path.join(dir, 'recorder/app'), repo = path.join(dir, 'methodology'), bundled = path.join(app, 'server-dist/methodology');
  await mkdir(app, {recursive: true});
  assert.equal(methodologyDir({root: app, env: {}}), undefined);
  await mkdir(bundled, {recursive: true});await writeFile(path.join(bundled, 'package.md'), 'x');
  assert.equal(methodologyDir({root: app, env: {}}), bundled);
  await mkdir(repo, {recursive: true});await writeFile(path.join(repo, 'package.md'), 'x');
  assert.equal(methodologyDir({root: app, env: {}}), repo, 'the repo copy wins when running from source');
  assert.equal(methodologyDir({root: app, env: {CREATORCLUB_METHODOLOGY_DIR: '/custom'}}), '/custom');
  const env = runtimeEnvironment({root: app, data: '/data', port: CREATORCLUB.port, env: {PATH: '/bin'}});
  assert.equal(env.CREATORCLUB_METHODOLOGY_DIR, repo);
  assert.equal(env.SCENEFORGE_PORT, String(CREATORCLUB.port));
  assert.equal(env.SCENEFORGE_DATA_DIR, '/data');
 } finally {
  await rm(dir, {recursive: true, force: true});
 }
});
