import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prerequisites,localAppTarget,assertLocalBuild,LOCAL_BUNDLE_ID} from './setup-local.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const everything=()=>'1.0';

test('a Mac with every tool passes; each missing tool is named with how to install it, and FFmpeg is optional', () => {
 const ok=prerequisites({platform:'darwin',nodeVersion:'24.1.0',probe:everything,npm:true});
 assert.ok(ok.filter(check=>!check.optional).every(check=>check.ok));
 assert.deepEqual(ok.map(check=>check.name),['Node.js 24','npm','git','Rust (cargo)','CMake','Xcode Command Line Tools','FFmpeg']);
 const bare=prerequisites({platform:'darwin',nodeVersion:'22.3.0',probe:()=>null,npm:true});
 const missing=bare.filter(check=>!check.ok&&!check.optional).map(check=>check.name);
 assert.deepEqual(missing,['Node.js 24','git','Rust (cargo)','CMake','Xcode Command Line Tools']);
 assert.match(bare.find(check=>check.name==='Rust (cargo)').fix,/rustup\.rs/);
 assert.match(bare.find(check=>check.name==='Xcode Command Line Tools').fix,/xcode-select --install/);
 assert.equal(bare.find(check=>check.name==='FFmpeg').optional,true,'the app bundles FFmpeg');
});

test('Windows asks for the Visual Studio C++ build tools instead of Xcode', () => {
 const names=prerequisites({platform:'win32',nodeVersion:'24.0.0',probe:()=>null,npm:true}).map(check=>check.name);
 assert.ok(names.includes('Visual Studio Build Tools (C++)'));
 assert.ok(!names.includes('Xcode Command Line Tools'));
});

test('the local app installs next to the downloaded one, never over it', async () => {
 assert.equal(localAppTarget({platform:'darwin',home:'/Users/x',env:{}}),'/Users/x/Applications/Creator Compiler (Local).app');
 assert.equal(localAppTarget({platform:'win32',home:'C:/Users/x',env:{LOCALAPPDATA:'C:/Users/x/AppData/Local'}}),path.join('C:/Users/x/AppData/Local','Programs','Creator Compiler (Local)'));
 const dir=await mkdtemp(path.join(os.tmpdir(),'cc-local-'));
 try{
  await assertLocalBuild(path.join(dir,'missing.app'),'darwin');
  const mine=path.join(dir,'mine.app'),other=path.join(dir,'other.app');
  await mkdir(path.join(mine,'Contents'),{recursive:true});await writeFile(path.join(mine,'Contents/Info.plist'),`<string>${LOCAL_BUNDLE_ID}</string>`);
  await assertLocalBuild(mine,'darwin');
  await mkdir(path.join(other,'Contents'),{recursive:true});await writeFile(path.join(other,'Contents/Info.plist'),'<string>com.aianswer.creatorclub</string>');
  await assert.rejects(assertLocalBuild(other,'darwin'),/not a Creator Compiler \(Local\) build/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('every release also carries version-less installers, and the README links to them', async () => {
 const workflow=await readFile(path.join(root,'.github/workflows/desktop-build.yml'),'utf8');
 assert.match(workflow,/for name in mac-arm64\.dmg win-x64\.exe; do\n\s+cp "release\/Creator-Compiler-\$version-\$name" "release\/Creator-Compiler-\$name"/);
 assert.ok(workflow.indexOf('cp "release/Creator-Compiler-$version-$name"')<workflow.indexOf('gh release create'),'copied before the release is created');
 const readme=await readFile(path.join(root,'README.md'),'utf8');
 for(const file of ['Creator-Compiler-mac-arm64.dmg','Creator-Compiler-win-x64.exe'])assert.ok(readme.includes(`https://github.com/AI-Answer/creatorclub/releases/latest/download/${file}`),file);
 assert.match(readme,/npm run setup:local/);
});
