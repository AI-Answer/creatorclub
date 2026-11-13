import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {CREATORCLUB, creatorClubPaths, isCreatorClubService, methodologyDir, privacyAppName, runtimeEnvironment, whisperModel} = createRequire(import.meta.url)('../desktop/runtime.cjs');
const main = await readFile(path.join(root, 'desktop/main.cjs'), 'utf8');
const mcp = await readFile(path.join(root, 'desktop/mcp-entry.mjs'), 'utf8');
const pack = await readFile(path.join(root, 'scripts/package.mjs'), 'utf8');
const launcher = await readFile(path.join(root, 'scripts/mcp-launcher.c'), 'utf8');

test('CreatorClub has its own name, port, user-data folder and studio folder, and SCENEFORGE_DATA_DIR still overrides the studio', () => {
 assert.equal(CREATORCLUB.name, 'CreatorClub');
 assert.equal(CREATORCLUB.dataFolder, 'Creator Compiler', 'installed copies keep their data folder');
 assert.equal(CREATORCLUB.service, 'Creator Compiler', 'the local service handshake is unchanged');
 assert.notEqual(CREATORCLUB.port, 4174, 'never the SceneForge port');
 const appData = '/Users/x/Library/Application Support';
 assert.deepEqual(creatorClubPaths({appData, env: {}}), {userData: `${appData}/Creator Compiler`, studio: `${appData}/Creator Compiler/studio`, models: `${appData}/Creator Compiler/models`});
 assert.equal(creatorClubPaths({appData, env: {SCENEFORGE_DATA_DIR: '/data/studio'}}).studio, '/data/studio');
});

test('source development uses its own profile and studio while the installed app keeps its data folder', () => {
 const installed=creatorClubPaths({appData:'/app-data',env:{}});
 const development=creatorClubPaths({appData:'/app-data',env:{},developmentRoot:'/repo/recorder/app'});
 assert.notEqual(development.userData,installed.userData,'separate single-instance lock and browser profile');
 assert.notEqual(development.studio,installed.studio,'development edits never enter the installed studio');
 assert.equal(development.studio,'/repo/recorder/app/.local/studio');
 assert.equal(creatorClubPaths({appData:'/app-data',env:{SCENEFORGE_DATA_DIR:'/scratch'},developmentRoot:'/repo/recorder/app'}).studio,'/scratch');
 assert.match(main,/!app\.isPackaged\?\{developmentRoot:projectRoot\}/);
});

test('only a Creator Compiler service is accepted at startup, never a SceneForge one', () => {
 assert.equal(isCreatorClubService({application: 'Creator Compiler', product: 'Creator Compiler', version: '0.1.0'}), true);
 assert.equal(isCreatorClubService({application: 'SceneForge', version: '0.1.0'}), false, 'SceneForge Dev.app\'s service');
 assert.equal(isCreatorClubService({application: 'Other', product: 'Creator Compiler', version: '0.1.0'}), false);
 assert.equal(isCreatorClubService(null), false);
});

// Electron cannot start in tests, so the shell's use of these is checked in its source.
test('the desktop shell sets its name and user-data folder before the single-instance lock, and uses its own port and studio', () => {
 assert.match(main, /app\.setName\(CREATORCLUB\.name\)/);
 assert.doesNotMatch(main, /setName\('SceneForge'\)/);
 const setPath = main.indexOf("app.setPath('userData',paths.userData)"), lock = main.indexOf('app.requestSingleInstanceLock()');
 assert.ok(setPath > 0 && setPath < lock, 'userData is set before the lock is taken');
 assert.match(main, /const PORT=Number\(process\.env\.SCENEFORGE_PORT\|\|\(app\.isPackaged\?CREATORCLUB\.port:4184\)\)/);
 assert.match(main, /title:CREATORCLUB\.name/);
 assert.match(main, /label:CREATORCLUB\.name,submenu/);
 assert.match(main, /const health=await r\.json\(\);\n return isCreatorClubService\(health\)\?health:null;/);
 assert.match(main, /const orphaned=health=>Boolean\(health\.parentPid&&!processAlive\(health\.parentPid\)\);/, 'a service whose app has quit is never reused');
 assert.match(main, /data:paths\.studio/);
 assert.match(main, /dataDir:paths\.studio/);
 assert.match(main, /SCENEFORGE_MCP_COMMAND\?\?=''/, 'no launcher of its own means no MCP launcher is advertised');
 assert.doesNotMatch(main, /4174/);
});

test('the MCP launcher reaches the Creator Compiler service and studio, and the package is CreatorClub.app', () => {
 assert.match(mcp, /runtime\.CREATORCLUB\.port/);
 assert.match(mcp, /runtime\.creatorClubPaths\(/);
 assert.match(mcp, /runtime\.isCreatorClubService\(/);
 assert.doesNotMatch(mcp, /4174|SceneForge service|SceneForge editing/);
 assert.match(launcher, /"%s\/CreatorClub"/, 'runs the app executable, named after the product');
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

test('the privacy name is the running app bundle, so setup names what macOS lists', () => {
 assert.equal(privacyAppName('/Users/me/Applications/Creator Compiler Dev.app/Contents/MacOS/Electron'), 'Creator Compiler Dev');
 assert.equal(privacyAppName('/Applications/Creator Compiler.app/Contents/MacOS/Creator Compiler'), 'Creator Compiler');
 assert.equal(privacyAppName('/usr/local/bin/electron'), CREATORCLUB.name);
});

test('the speech model is the bundled one, else a speech model in the models folder, never a voice-activity model', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'cc-models-'));
 try {
  const bundled = path.join(dir, 'bundled.bin'), models = path.join(dir, 'models');
  assert.equal(whisperModel({bundled, modelsDir: models}), undefined, 'no model, no models folder');
  await mkdir(models);
  await writeFile(path.join(models, 'ggml-silero-v5.1.2.bin'), 'v'); await writeFile(path.join(models, 'notes.txt'), 'n');
  assert.equal(whisperModel({bundled, modelsDir: models}), undefined, 'a voice-activity model is not a speech model');
  await writeFile(path.join(models, 'ggml-base.bin'), 'b');
  assert.equal(whisperModel({bundled, modelsDir: models}), path.join(models, 'ggml-base.bin'));
  await writeFile(bundled, 'x');
  assert.equal(whisperModel({bundled, modelsDir: models}), bundled, 'the bundled model wins');
  const env = runtimeEnvironment({root: dir, data: '/data', port: 1, modelsDir: models, env: {PATH: '/bin'}});
  assert.equal(env.SCENEFORGE_WHISPER_MODEL, path.join(models, 'ggml-base.bin'));
 } finally { await rm(dir, {recursive: true, force: true}); }
});
