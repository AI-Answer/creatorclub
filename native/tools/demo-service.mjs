#!/usr/bin/env node
// Starts a second copy of the Creator Compiler service with sample data, so the native shell can be tried
// (and its cards dragged) without touching your real channels. It listens on 127.0.0.1:4199 and keeps its data
// in a folder of its own (default: /tmp/cc-native-demo). The first start seeds a channel, nine videos and five
// Research cards through the service's own API.
//
//   node native/tools/demo-service.mjs            # start (and seed on first run); Ctrl-C stops it
//   DEMO_DIR=~/cc-demo node native/tools/demo-service.mjs
//
// The installed app uses 4194 and `npm run dev` uses 4184, so 4199 never takes either one's place.
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'recorder/app');
const port = Number(process.env.DEMO_PORT || 4199);
const dir = process.env.DEMO_DIR || '/tmp/cc-native-demo';
const base = `http://127.0.0.1:${port}/api/club`;

const tsx = path.join(app, 'node_modules/.bin/tsx');
if (!existsSync(tsx)) {
  console.error(`No ${tsx}: run npm install in recorder/app first.`);
  process.exit(1);
}
for (const sub of ['studio', 'channels']) mkdirSync(path.join(dir, sub), {recursive: true});

const child = spawn(tsx, ['server/index.ts'], {
  cwd: app,
  stdio: 'inherit',
  env: {...process.env, SCENEFORGE_PORT: String(port), SCENEFORGE_DATA_DIR: path.join(dir, 'studio'), CREATORCLUB_DIR: path.join(dir, 'channels')},
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code || 0));

async function call(method, route, body) {
  const res = await fetch(base + route, {method, headers: {'content-type': 'application/json'}, body: body && JSON.stringify(body)});
  if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/ready`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The demo service did not start.');
}

async function seed() {
  const {workspaces} = await call('GET', '/workspaces');
  if (workspaces.length) return console.log(`Demo service ready at http://127.0.0.1:${port} (${workspaces.length} channel already there).`);
  await call('POST', '/workspaces', {name: 'Northlight Studio', handle: '@northlight', topics: ['AI tools', 'Video editing'], about: 'Sample channel for the native shell'});
  const videos = [
    ['I tried every AI video editor for 30 days', 'ideas'],
    ['The 5-minute B-roll workflow', 'ideas'],
    ['Why your thumbnails get ignored', 'ideas'],
    ['Claude Code built my whole studio', 'planning'],
    ['Recording setup under $500', 'planning'],
    ['How I script a video in one hour', 'recording'],
    ["Screen recording that doesn't look cheap", 'editing'],
    ['My editing timeline, explained', 'editing'],
    ['Shorts from one long video', 'publishing'],
  ];
  for (const [title, stage] of videos) await call('POST', '/videos', {title, stage});
  const tiles = [
    {kind: 'link', url: 'https://www.youtube.com/@northlight/videos', title: 'Competitor teardown: what the top AI editor reviews have in common'},
    {kind: 'link', url: 'https://github.com/expo/exact', title: 'Exact: native apps from one source'},
    {kind: 'text', text: 'Hook idea: open on the timeline at 4x speed, then freeze on the one cut that matters.'},
    {kind: 'idea', text: 'Series: one tool a week, rebuilt from scratch on camera'},
    {kind: 'note', text: '# Audience notes\n\nViewers ask most about lighting and mic placement.'},
  ];
  for (const tile of tiles) await call('POST', '/channel/research', tile);
  console.log(`Demo service ready at http://127.0.0.1:${port}, seeded with ${videos.length} videos and ${tiles.length} Research cards.`);
}

ready().then(seed).catch((error) => {
  console.error(error.message);
  child.kill('SIGTERM');
});
