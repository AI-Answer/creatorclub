import { titleProblems } from '../../shared/package-rules.js';
import { emptyOnePager } from '../../src/club/idea/onepager.js';
import { ClubError } from './errors.js';
import { asker, readOnePager, type PlanOptions } from './planning.js';
import * as store from './store.js';

/*
 * Other titles, picked where the title is: the connected AI writes five, each true to the sketch and within the title rules, and the
 * sketch lists them under the title to choose from. Nothing goes through the chat.
 */

const SCHEMA = { type: 'object', additionalProperties: false, required: ['titles'], properties: { titles: { type: 'array', minItems: 8, maxItems: 8, items: { type: 'string' } } } };

export function titlesPrompt(o: { title: string; logline: string; points: string[] }) {
  return {
    system: 'You write YouTube titles that get clicked. Answer only with the JSON asked for.',
    prompt: [
      'Write eight other titles for this video, each a different angle on the same promise.',
      o.title.trim() ? `The title now: "${o.title.trim()}". Do not repeat it.` : '',
      o.logline.trim() ? `The video: ${o.logline.trim()}` : '',
      o.points.length ? `What happens in it: ${o.points.join(' ')}` : '',
      'Hard limits for every title: at most 7 words and at most 60 characters (count them), a claim and not a question, in plain words.',
      'Only numbers, results and claims the video above states. Never invent a number or a result.',
    ].filter(Boolean).join('\n'),
    schema: SCHEMA,
  };
}

export async function titleIdeas(slug: string, id: string, signal: AbortSignal, options: PlanOptions = {}): Promise<string[]> {
  const video = await store.readVideo(slug, id);
  const sketch = (await readOnePager(slug, id)) ?? emptyOnePager();
  const ai = await asker({ signal }, options);
  const now = video.title.trim().toLowerCase();
  const built = titlesPrompt({ title: video.title, logline: sketch.logline, points: sketch.skeleton.map((b) => b.line).filter((l) => l.trim()) });
  const titles: string[] = [];
  // Titles that break the rules are left out; with fewer than three left, it asks once more.
  for (let round = 0; round < 2 && titles.length < 3; round++) {
    const answer = (await ai.ask(built, 1)).json as { titles?: unknown } | undefined;
    for (const t of Array.isArray(answer?.titles) ? answer.titles : []) {
      const title = typeof t === 'string' ? t.trim() : '';
      if (title && title.toLowerCase() !== now && !titleProblems(title).length && !titles.some((x) => x.toLowerCase() === title.toLowerCase())) titles.push(title);
    }
  }
  if (!titles.length) throw new ClubError(`${ai.who} didn't send titles that fit. Try again.`);
  return titles.slice(0, 5);
}
