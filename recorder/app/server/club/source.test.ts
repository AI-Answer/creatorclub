import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMENT_ARGS,
  NOT_A_VIDEO,
  detectSource,
  infoArgs,
  listingArgs,
  median,
  outlierMultiplier,
  parseInfo,
  parseViewLines,
  subtitleArgs,
  topComments,
  usualViews,
  videoArgs,
  viewsArgs,
} from './source.js';

const ID = 'dQw4w9WgXcQ';
const yt = (id = ID, short?: boolean) => ({ platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, id, ...(short ? { short } : {}) });

test('YouTube links in every common form become one watch link, without playlist or tracking parts', () => {
  for (const input of [
    `https://www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}&list=PL123&index=4&t=33s`,
    `  https://m.youtube.com/watch?feature=share&v=${ID}  `,
    `https://youtu.be/${ID}?si=abc`,
    `http://youtu.be/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
  ]) assert.deepEqual(detectSource(input), yt(), input);
  assert.deepEqual(detectSource(`https://www.youtube.com/shorts/${ID}`), yt(ID, true), 'a Short is marked, so it is compared with other Shorts');
});

test('Instagram reels, posts and tv links become one canonical link', () => {
  const want = { platform: 'instagram', url: 'https://www.instagram.com/reel/C8aBcD_eFgH/', id: 'C8aBcD_eFgH' };
  for (const input of [
    'https://www.instagram.com/reel/C8aBcD_eFgH/',
    'instagram.com/reel/C8aBcD_eFgH',
    'https://www.instagram.com/reels/C8aBcD_eFgH/?igsh=abc',
    'https://www.instagram.com/some.creator/reel/C8aBcD_eFgH/?utm_source=ig_web_copy_link',
  ]) assert.deepEqual(detectSource(input), want, input);
  assert.deepEqual(detectSource('https://www.instagram.com/p/C8aBcD_eFgH/'), { ...want, url: 'https://www.instagram.com/p/C8aBcD_eFgH/' });
  assert.equal(detectSource('https://instagram.com/tv/C8aBcD_eFgH').url, 'https://www.instagram.com/tv/C8aBcD_eFgH/');
});

test('anything that is not one video on YouTube or Instagram is refused with one sentence', () => {
  for (const bad of [
    '',
    '   ',
    'samin',
    'two words',
    'https://www.youtube.com/@SaminYasar_',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=short',
    'https://youtu.be/',
    'https://evil.com/watch?v=' + ID,
    'https://youtube.com.evil.com/watch?v=' + ID,
    'https://notyoutube.com/watch?v=' + ID,
    'ftp://youtube.com/watch?v=' + ID,
    'https://www.instagram.com/some.creator/',
    'https://www.instagram.com/stories/some.creator/123/',
    'https://tiktok.com/@a/video/123',
  ]) assert.throws(() => detectSource(bad), { message: NOT_A_VIDEO }, JSON.stringify(bad));
});

test('the yt-dlp commands: info with the top 40 comments, one caption track, 480p video, and the Instagram variant', () => {
  assert.equal(COMMENT_ARGS, 'youtube:max_comments=40,all,0,0;comment_sort=top');
  assert.deepEqual(infoArgs(yt() as never, '/w/media.%(ext)s'), [
    '--skip-download', '--no-warnings', '--no-playlist', '--write-info-json', '--write-comments', '--extractor-args', COMMENT_ARGS, '-o', '/w/media.%(ext)s', `https://www.youtube.com/watch?v=${ID}`,
  ]);
  const ig = { platform: 'instagram', url: 'https://www.instagram.com/reel/abcde/', id: 'abcde' } as const;
  assert.ok(!infoArgs(ig, '/w/m').includes('--write-comments'), 'comments are a YouTube thing');
  assert.deepEqual(subtitleArgs(yt().url, 'en-orig', '/w/m'), [
    '--skip-download', '--no-warnings', '--no-playlist', '--write-auto-subs', '--write-subs', '--sub-langs', 'en-orig', '--sub-format', 'json3', '-o', '/w/m', yt().url,
  ]);
  const video = videoArgs(yt() as never, '/w/m');
  assert.deepEqual(video.slice(video.indexOf('-f'), video.indexOf('-f') + 4), ['-f', 'bv*+ba/b', '-S', 'res:480'], '480 on the short side, so vertical video works too');
  assert.ok(video.includes('--merge-output-format') && video.includes('mp4') && !video.includes('--write-info-json'));
  assert.ok(videoArgs(ig, '/w/m').includes('--write-info-json'), 'Instagram info comes with the download');
});

test('the channel listing and view commands', () => {
  assert.deepEqual(listingArgs('https://www.youtube.com/channel/UCabc/', false, 30), ['--flat-playlist', '--dump-single-json', '--playlist-end', '30', '--no-warnings', 'https://www.youtube.com/channel/UCabc/videos']);
  assert.equal(listingArgs('https://www.youtube.com/channel/UCabc', true, 30).at(-1), 'https://www.youtube.com/channel/UCabc/shorts');
  assert.deepEqual(viewsArgs(['a', 'b']).slice(-2), ['https://www.youtube.com/watch?v=a', 'https://www.youtube.com/watch?v=b']);
  const parsed = parseViewLines('aaa\t120\nbbb\tNA\n\nccc\t5\nnot a line\n');
  assert.deepEqual([...parsed], [['aaa', 120], ['ccc', 5]]);
});

test('median: odd, even, unsorted, one value, none', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.equal(median([]), undefined);
  assert.equal(median([10, 10, 1_000_000]), 10, 'one huge video does not move the usual views');
});

test('usual views: the median of known uploads, and nothing when fewer than 3 are known', () => {
  assert.equal(usualViews([100, null, 300, undefined, 200]), 200);
  assert.equal(usualViews([100, 300]), undefined);
  assert.equal(usualViews([]), undefined);
  assert.equal(usualViews([0, 0, 0]), 0);
  assert.equal(usualViews(Array.from({ length: 30 }, (_, i) => 1000 + i)), 1014.5);
});

test('outlier multiplier: views over the usual views to two decimals, none without a usual', () => {
  assert.equal(outlierMultiplier(7_600_000, 2_676_056), 2.84);
  assert.equal(outlierMultiplier(5000, 1014.5), 4.93);
  assert.equal(outlierMultiplier(500, 1000), 0.5);
  assert.equal(outlierMultiplier(1000, 1000), 1);
  assert.equal(outlierMultiplier(0, 1000), 0);
  assert.equal(outlierMultiplier(1000, undefined), undefined);
  assert.equal(outlierMultiplier(1000, 0), undefined);
  assert.equal(outlierMultiplier(Number.NaN, 10), undefined);
});

test('comments: top level only, best first, at most 40', () => {
  const raw = [
    { text: 'reply', like_count: 999, parent: 'abc' },
    { text: 'low', like_count: 1, parent: 'root' },
    { text: '  best  ', like_count: 50, parent: 'root' },
    { text: '', like_count: 70, parent: 'root' },
    { text: 'no parent field', like_count: 7 },
    'junk',
    null,
  ];
  assert.deepEqual(topComments(raw), [{ likes: 50, text: 'best' }, { likes: 7, text: 'no parent field' }, { likes: 1, text: 'low' }]);
  assert.equal(topComments(Array.from({ length: 90 }, (_, i) => ({ text: `c${i}`, like_count: i, parent: 'root' }))).length, 40);
  assert.deepEqual(topComments(undefined), []);
});

test('video facts from the info file, with the age counted from the upload date', () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const info = parseInfo({ title: ' Hello ', channel: 'Chan', channel_url: 'https://www.youtube.com/channel/UCx', view_count: 7_600_000, like_count: 140_000, comment_count: 12_000, upload_date: '20261025', duration: 47, comments: [{ text: 'hi', like_count: 3, parent: 'root' }] }, yt() as never, now);
  assert.deepEqual(info, { title: 'Hello', channel: 'Chan', channelUrl: 'https://www.youtube.com/channel/UCx', views: 7_600_000, likes: 140_000, commentCount: 12_000, ageDays: 3, duration: 47, thumbnail: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`, comments: [{ likes: 3, text: 'hi' }] });
  assert.equal(parseInfo({ timestamp: Date.UTC(2026, 9, 27, 0) / 1000 }, yt() as never, now).ageDays, 1);
  assert.equal(parseInfo({ upload_date: '20300101' }, yt() as never, now).ageDays, 0, 'never negative');
  const ig = parseInfo({ description: 'First line of the caption\nsecond', uploader: 'maker', like_count: 5 }, { platform: 'instagram', url: 'u', id: 'abcde' }, now);
  assert.equal(ig.title, 'First line of the caption', 'no title: the caption names it');
  assert.equal(ig.channel, 'maker');
  assert.equal(ig.thumbnail, '');
  assert.equal(ig.views, 0);
  assert.equal(parseInfo(null, yt() as never).title, '');
});
