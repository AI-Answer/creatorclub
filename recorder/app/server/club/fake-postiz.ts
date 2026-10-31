import express from 'express';
import multer from 'multer';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for Postiz's public API, for the tests and for walking through Publish without a real account.
 * It checks the same things the adapter relies on (the raw key in `Authorization`, multipart upload, the post body)
 * and can be told to fail in each way Postiz can.
 */
export interface FakePostiz {
  /** `http://127.0.0.1:<port>`: give this as the Postiz address; the API is under `/api/public/v1` (and also `/public/v1`). */
  url: string;
  key: string;
  channels: { id: string; name: string; identifier: string; disabled?: boolean }[];
  uploads: { name: string; size: number; type: string }[];
  posts: { id: string; body: any; state: 'QUEUE' | 'PUBLISHED' | 'ERROR'; releaseURL?: string }[];
  /** Requests that reached the API, as "METHOD /path". */
  log: string[];
  /** What the next call to each endpoint answers instead of working. Cleared after use unless `sticky`. */
  fail: Partial<Record<'integrations' | 'upload' | 'posts' | 'status', { status: number; headers?: Record<string, string>; body?: unknown; sticky?: boolean }>>;
  /** What the upload answers when it works, to simulate a video Postiz could not process. */
  uploadAnswer?: unknown;
  /**
   * The next post is made, and then the answer goes wrong the way a real network or server can: the connection is dropped, Postiz answers 502,
   * or it answers 200 with something that is not JSON. The sender cannot tell whether the post exists. Used once.
   */
  failAfterCreate?: 'drop' | 'bad-gateway' | 'garbage';
  /** What the next post answers when it works, to simulate an answer with no post id (the post is still made). Used once. */
  postAnswer?: unknown;
  /** The YouTube link a post reports once published. Undefined for a post that reports none. */
  releaseURL?: string;
  /** The state a new post takes. Tests move it later with `finish`. */
  newState: 'QUEUE' | 'PUBLISHED' | 'ERROR';
  finish(id: string, state: 'PUBLISHED' | 'ERROR', releaseURL?: string): void;
  close(): Promise<void>;
}

export async function startFakePostiz(options: { key?: string; port?: number; channels?: FakePostiz['channels'] } = {}): Promise<FakePostiz> {
  const fake: FakePostiz = {
    url: '',
    key: options.key ?? 'fake-postiz-key-0123456789',
    channels: options.channels ?? [
      { id: 'int_yt1', name: 'Samin Yasar', identifier: 'youtube' },
      { id: 'int_x1', name: 'Samin on X', identifier: 'x' },
    ],
    uploads: [],
    posts: [],
    log: [],
    fail: {},
    newState: 'QUEUE',
    releaseURL: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    finish(id, state, releaseURL) {
      const post = fake.posts.find((item) => item.id === id);
      if (post) Object.assign(post, { state, releaseURL });
    },
    close: () => Promise.resolve(),
  };
  const api = express.Router();
  const take = (name: keyof FakePostiz['fail'], res: express.Response) => {
    const failure = fake.fail[name];
    if (!failure) return false;
    if (!failure.sticky) delete fake.fail[name];
    res.status(failure.status).set(failure.headers ?? {}).json(failure.body ?? { message: 'failed' });
    return true;
  };
  api.use((req, res, next) => {
    fake.log.push(`${req.method} ${req.path}`);
    if (req.headers.authorization !== fake.key) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    next();
  });
  api.get('/integrations', (_req, res) => {
    if (take('integrations', res)) return;
    res.json(fake.channels.map((channel) => ({ ...channel, picture: '', profile: channel.name, customer: null })));
  });
  api.post('/upload', multer({ storage: multer.memoryStorage() }).single('file'), (req, res) => {
    if (take('upload', res)) return;
    if (!req.file) {
      res.status(400).json({ message: 'no file' });
      return;
    }
    fake.uploads.push({ name: req.file.originalname, size: req.file.size, type: req.file.mimetype });
    res.json(fake.uploadAnswer ?? { id: `media_${fake.uploads.length}`, path: `${fake.url}/uploads/${req.file.originalname}`, name: req.file.originalname });
  });
  api.post('/posts', express.json(), (req, res) => {
    if (take('posts', res)) return;
    const body = req.body;
    const post = body?.posts?.[0];
    const valid =
      ['now', 'schedule', 'draft'].includes(body?.type) &&
      typeof body?.date === 'string' &&
      fake.channels.some((channel) => channel.id === post?.integration?.id) &&
      post?.settings?.__type === 'youtube' &&
      typeof post.settings.title === 'string' &&
      post.settings.title.length > 0 &&
      post.settings.title.length <= 100 &&
      ['public', 'unlisted', 'private'].includes(post.settings.type) &&
      ['yes', 'no'].includes(post.settings.selfDeclaredMadeForKids) &&
      Array.isArray(post.value?.[0]?.image) &&
      typeof post.value[0].image[0]?.id === 'string';
    if (!valid) {
      res.status(400).json({ message: 'invalid post' });
      return;
    }
    const id = `post_${fake.posts.length + 1}`;
    fake.posts.push({ id, body, state: fake.newState, ...(fake.newState === 'PUBLISHED' && fake.releaseURL ? { releaseURL: fake.releaseURL } : {}) });
    const broken = fake.failAfterCreate;
    fake.failAfterCreate = undefined;
    if (broken === 'drop') {
      res.socket?.destroy();
      return;
    }
    if (broken === 'bad-gateway') {
      res.status(502).json({ message: 'Bad gateway' });
      return;
    }
    if (broken === 'garbage') {
      res.status(200).type('text').send('<html>upstream hiccup');
      return;
    }
    const answer = fake.postAnswer;
    fake.postAnswer = undefined;
    res.json(answer ?? [{ postId: id, integration: post.integration.id }]);
  });
  api.get('/posts', (req, res) => {
    if (take('status', res)) return;
    if (!req.query.startDate || !req.query.endDate) {
      res.status(400).json({ message: 'dates needed' });
      return;
    }
    res.json({ posts: fake.posts.map((post) => ({ id: post.id, state: post.state, releaseURL: post.releaseURL, publishDate: post.body.date, integration: { id: post.body.posts[0].integration.id } })) });
  });
  const app = express();
  app.use('/api/public/v1', api);
  app.use('/public/v1', api);
  const server: Server = app.listen(options.port ?? 0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve())));
  return fake;
}
