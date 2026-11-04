import type { Package } from './club';

/*
 * The rules a package is held to, in one place: the package run checks Claude's answer with them, the companion refuses a title
 * that breaks them, and the Idea page shows them under each title and thumbnail pair. Models miscount, so they run in code.
 */

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Titles: 7 words or fewer, 60 characters or fewer, never a question. */
export function titleProblems(title: string): string[] {
  const text = title.trim();
  const problems: string[] = [];
  if (!text) return ['is empty'];
  const count = words(text);
  if (count > 7) problems.push(`has ${count} words, and 7 is the most`);
  if ([...text].length > 60) problems.push(`has ${[...text].length} characters, and 60 is the most`);
  if (/[?？]/.test(text)) problems.push('is a question');
  return problems;
}

/** Thumbnail text: 2 to 5 words. */
export function thumbProblems(text: string): string[] {
  const count = words(text);
  return count < 2 || count > 5 ? [`has ${count} ${count === 1 ? 'word' : 'words'}, and it needs 2 to 5`] : [];
}

/** The option that is the video's title, or -1. A video's title is its chosen one. */
export const chosenIndex = (titles: readonly string[], videoTitle: string) => titles.findIndex((title) => !!title.trim() && title.trim() === videoTitle.trim());

/**
 * The thumbnail text of each title, in the titles' order. A package saved before titles had their own keeps its one text on the
 * chosen title's pair (the first when none is chosen).
 */
export function pairThumbs(pkg: Pick<Package, 'titles' | 'thumbnailText' | 'thumbs'>, videoTitle = ''): [string, string, string] {
  if (pkg.thumbs) return pkg.thumbs;
  const at = Math.max(0, chosenIndex(pkg.titles, videoTitle));
  return [0, 1, 2].map((index) => (index === at ? pkg.thumbnailText : '')) as [string, string, string];
}

/** The package with one pair's thumbnail text changed; `thumbnailText` stays the chosen pair's, which Publish and the prompts read. */
export function withThumb(pkg: Package, index: number, text: string, videoTitle: string): Package {
  const thumbs = [...pairThumbs(pkg, videoTitle)] as [string, string, string];
  thumbs[index] = text;
  const at = chosenIndex(pkg.titles, videoTitle);
  return { ...pkg, thumbs, thumbnailText: index === (at < 0 ? 0 : at) ? text : pkg.thumbnailText };
}

/** The package once `title` is the chosen one: `thumbnailText` follows to that pair. */
export function choosePair(pkg: Package, title: string, videoTitle: string): Package {
  const thumbs = pairThumbs(pkg, videoTitle);
  const at = chosenIndex(pkg.titles, title);
  return at < 0 ? pkg : { ...pkg, thumbs, thumbnailText: thumbs[at] };
}
