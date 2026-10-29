import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-migrate-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
after(() => rm(temp, { recursive: true, force: true }));

// A trimmed copy of the real Samin board workspace. Statuses the real board has not used yet (parked, edited,
// published) are copies of real ideas with only the status changed.
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'board-samin');
const source = path.join(temp, 'board-samin');
await cp(fixture, source, { recursive: true });
const snapshot = async () => JSON.stringify(await Promise.all((await readdir(source, { recursive: true })).sort().map(async (f) => [f, (await stat(path.join(source, f))).isFile() ? await readFile(path.join(source, f), 'utf8').catch(() => '') : ''])));
const before = await snapshot();

const { migrateBoard, copyBoardData, BOARD_DATA_FILES, cleanOutline, cleanVoice, placeIdea } = await import('./migrate-board.js');
const store = await import('./store.js');

test('statuses map to stages as PLAN.md says; parked and dropped stay in Ideas but hidden', () => {
  const expected: Record<string, unknown> = {
    new: { stage: 'ideas' },
    picked: { stage: 'planning' },
    outline: { stage: 'planning' },
    recorded: { stage: 'editing' },
    edited: { stage: 'publishing' },
    published: { stage: 'published' },
    parked: { stage: 'ideas', hidden: 'later' },
    dropped: { stage: 'ideas', hidden: 'skipped' },
  };
  for (const [status, placement] of Object.entries(expected)) assert.deepEqual(placeIdea(status, 'x'), placement, status);
  assert.throws(() => placeIdea('mystery', 'x'), /status this import does not know: mystery/);
});

test('voice clean-up drops every line that mentions Claude Club, whatever the case', () => {
  const { text, dropped } = cleanVoice('Keep this\nJoin the Claude Club today\nand claude club again\n- ending: a pointer to a video\nlast');
  assert.equal(text, 'Keep this\n- ending: a pointer to a video\nlast');
  assert.equal(dropped, 2);
});

test('outline clean-up removes Jake and Ed references, attribution bullets and the sections they leave empty', () => {
  const input = [
    '## Shape',
    'Risk (Jake: care, choose, continue, convert): the "choose" step is weakest.',
    'Then the roadmap (Jake: Promise, Proof, Plan). It proves the claim.',
    '**Biggest risk (Jake\'s four decisions):** "choose."',
    'Persona line (Jake): "If you\'re not technical, this is for you."',
    'Test it against one viewer (Ed).',
    '(Jake: the decision most at risk is "choose". The title must say team.)',
    '',
    '## Playbook checks',
    '- **Jake: four decisions (care, choose).** The most at risk is "choose."',
    '- **Ed: name the false belief.** This outline breaks one.',
    '',
    '## Open facts',
    '- [CONFIRM: the one task]',
  ].join('\n');
  const output = cleanOutline(input);
  assert.equal(
    output,
    ['## Shape', 'Risk: the "choose" step is weakest.', 'Then the roadmap. It proves the claim.', '**Biggest risk:** "choose."', 'Persona line: "If you\'re not technical, this is for you."', 'Test it against one viewer.', '', '## Open facts', '- [CONFIRM: the one task]', ''].join('\n'),
  );
  assert.doesNotMatch(cleanOutline('A line that still says Ed Lawrence said so.\nFine line'), /Ed/);
  assert.equal(cleanOutline('Words like Edit, Edge and Jakeson stay.\n'), 'Words like Edit, Edge and Jakeson stay.\n');
});

test('migrating a board workspace: profile, files, status mapping, outlines and clean-up', async () => {
  const report = await migrateBoard(source);
  assert.equal(report.slug, 'samin');
  assert.equal(report.videos, 10);
  assert.deepEqual(report.byStage, { ideas: 3, planning: 2, recording: 0, editing: 1, publishing: 1, published: 1 }, 'hidden videos are not counted in their stage');
  assert.deepEqual(report.hidden, { later: 1, skipped: 1 });
  assert.equal(report.outlines, 2);
  assert.equal(report.unmatchedOutlines, 0);
  assert.deepEqual(report.files, { voice: true, criteria: true, structure: true });
  assert.ok(report.voiceLinesDropped >= 3);

  const workspace = await store.readWorkspace('samin');
  assert.equal(workspace.name, 'Samin Yasar');
  assert.deepEqual(workspace.topics, ['claude', 'vibe coding', 'ai agents']);
  assert.deepEqual(workspace.knowledge, [], 'Jake and Ed are no longer applied');
  assert.match(workspace.cta, /Do not mention any club/);
  assert.equal(workspace.channelUrl, 'https://www.youtube.com/@SaminYasar_');
  assert.equal(await store.currentWorkspace(), 'samin', 'the first workspace becomes current');

  const dir = store.workspaceDir('samin');
  const voice = await readFile(path.join(dir, 'voice.md'), 'utf8');
  assert.doesNotMatch(voice, /claude club/i);
  assert.match(voice, /Voice Guide/);
  assert.equal(await readFile(path.join(dir, 'criteria.md'), 'utf8'), await readFile(path.join(source, 'criteria.md'), 'utf8'));
  assert.equal(await readFile(path.join(dir, 'structure.md'), 'utf8'), await readFile(path.join(source, 'structure.md'), 'utf8'));

  const videos = await store.listVideos('samin');
  const byId = Object.fromEntries(videos.map((v) => [v.id, v]));
  assert.ok(videos.every((v) => !('views' in v) && !('viewsCheckedAt' in v)), 'the old board kept no view counts of its own videos, so none are invented');
  assert.equal(byId['agent-safety'].stage, 'ideas');
  assert.equal(byId['hidden-features'].stage, 'planning');
  assert.equal(byId['idea-1a179c8273f-2'].stage, 'planning');
  assert.equal(byId['idea-1a179c8273f-1'].stage, 'editing');
  assert.equal(byId['beginner-agent'].stage, 'publishing');
  assert.equal(byId['learn-tool-20'].stage, 'published');
  assert.equal(byId['agent-cost'].hidden, 'later');
  assert.equal(byId['idea-1a179ca7065-1'].hidden, 'skipped');
  assert.equal(byId['idea-1a179ca7065-1'].idea?.dropReason, 'Too generic');
  assert.ok(!('hidden' in byId['agent-safety']));

  const recorded = byId['idea-1a179c8273f-1'];
  assert.deepEqual(recorded.planning, { research: false, package: false, outline: true });
  assert.equal(recorded.createdAt, '2026-10-26T19:55:22.815Z');
  assert.equal(recorded.stageDates.editing, '2026-10-27T17:58:13.623Z');
  assert.equal(recorded.stageDates.planning, '2026-10-27T17:40:59.996Z');
  assert.equal(recorded.idea?.demand?.level, 'high');
  assert.equal(byId['idea-1a179c8273f-2'].planning.outline, false, 'no outline file, no outline');
  assert.equal(byId['idea-mvqz34xrzqp'].idea?.hook?.startsWith("If you've been adding skills"), true);

  // Outlines become outline.md with the Jake and Ed references gone.
  for (const id of ['idea-1a179c8273f-1', 'hidden-features']) {
    const outline = await readFile(path.join(store.videoDir('samin', id), 'outline.md'), 'utf8');
    assert.ok(outline.length > 1000, `${id} keeps its content`);
    assert.doesNotMatch(outline, /\b(Jake|Ed)\b|Trinder|Lawrence|Playbook checks/, id);
  }
  const original = await readFile(path.join(source, 'videos', 'hidden-features', 'outline.md'), 'utf8');
  assert.match(original, /Jake/, 'the source still has them');
  assert.ok((await readFile(path.join(store.videoDir('samin', 'hidden-features'), 'outline.md'), 'utf8')).includes('## Sections'));

  assert.deepEqual(report.boardData, [...BOARD_DATA_FILES], 'Working now and Signals files come across with the board');
  for (const name of BOARD_DATA_FILES) assert.equal(await readFile(path.join(dir, name), 'utf8'), await readFile(path.join(source, name), 'utf8'), name);
  assert.ok(!(await readdir(dir)).includes('config.json'), 'the board\'s search queries are not needed: Working now reads followed channels');

  assert.equal(await snapshot(), before, 'the source workspace was not touched');
});

test('copying the board data again is a no-op, and a file that is newer in the channel is never overwritten', async () => {
  const dir = store.workspaceDir('samin');
  assert.deepEqual(await copyBoardData(source, 'samin'), [], 'nothing changed, nothing copied');

  // Followed channels edited in CreatorClub: newer than the board's file.
  await writeFile(path.join(dir, 'followed.json'), '[{"name":"Edited","handle":"@edited"}]\n');
  // The board refreshed its signals later than the copy: older in the channel, so it is replaced.
  const future = new Date(Date.now() + 60_000);
  const newerSignals = JSON.stringify({ updatedAt: future.toISOString(), items: [], errors: [] });
  await writeFile(path.join(source, 'signals.json'), newerSignals);
  await utimes(path.join(source, 'signals.json'), future, future);

  assert.deepEqual(await copyBoardData(source, 'samin'), ['signals.json']);
  assert.equal(await readFile(path.join(dir, 'followed.json'), 'utf8'), '[{"name":"Edited","handle":"@edited"}]\n');
  assert.equal(await readFile(path.join(dir, 'signals.json'), 'utf8'), newerSignals);
  assert.deepEqual(await copyBoardData(source, 'samin'), [], 'and again');

  // A channel that was imported before these files existed (the real one) gets them on a later run.
  await store.createWorkspace({ slug: 'earlier', name: 'Earlier import', handle: '', channelUrl: '', topics: [], about: '', cta: '' });
  assert.deepEqual(await copyBoardData(source, 'earlier'), [...BOARD_DATA_FILES]);
  assert.deepEqual(await copyBoardData(source, 'earlier'), []);

  // A board with none of these files copies nothing.
  assert.deepEqual(await copyBoardData(path.join(source, 'videos'), 'samin'), []);
});

test('migrating again into an existing channel is refused and changes nothing', async () => {
  await assert.rejects(migrateBoard(source), { message: 'A channel with that name already exists.' });
  assert.equal((await store.listVideos('samin')).length, 10);
});

test('a folder that is not a board workspace is refused before anything is written', async () => {
  await assert.rejects(migrateBoard(temp), { message: 'That folder has no profile.json, so it is not a board workspace.' });
  assert.deepEqual((await store.listWorkspaces()).map((w) => w.slug).sort(), ['earlier', 'samin']);
});
