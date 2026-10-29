import type { Block, Doc } from './doc';
import type { ParsedSource } from './parse';
import { blockHtml, readDoc } from './dom';
import { isEmpty, serializeBlock } from './serialize';

/*
 * Writing a document back without disturbing what was not touched. A note an agent wrote is opened as blocks; when it is saved, every block that
 * is the same as it was opened is written as its own original lines (blank lines between them as they were too), and only the blocks you
 * changed or added are written in the editor's style. Opening a note and saving it with no change gives the text back exactly.
 */

const shown = new WeakMap<ParsedSource, Map<number, string>>();

/**
 * What block `k` says after it has been shown on a page and read back, the way it will be when you have not touched it. Compared with the
 * page's block, so the page's own ways of holding things (a second paragraph in a list item, say) never count as a change.
 */
function afterPage(source: ParsedSource, k: number): string {
  let cache = shown.get(source);
  if (!cache) shown.set(source, (cache = new Map()));
  let text = cache.get(k);
  if (text === undefined) {
    const page = document.createElement('div');
    page.innerHTML = blockHtml(source.doc[k], 'div');
    text = readDoc(page).map(serializeBlock).join('\n\n');
    cache.set(k, text);
  }
  return text;
}

/** The Markdown for `current` (what is on the page now), given the text the page was made from. */
export function mergeSource(source: ParsedSource, current: Doc): string {
  const { lines, pieces, doc } = source;
  const seen = new Map<number, number>();
  for (const block of current) if (block.origin !== undefined) seen.set(block.origin, (seen.get(block.origin) ?? 0) + 1);
  // A block is untouched when it still stands for one block of the original and says the same. Two blocks from one original (a split) are both changes.
  const untouched = (block: Block): number | undefined => {
    const k = block.origin;
    return k !== undefined && seen.get(k) === 1 && pieces[k] && doc[k] && serializeBlock(block) === afterPage(source, k) ? k : undefined;
  };
  const kept = current.map((block) => ({ block, k: untouched(block) })).filter(({ block, k }) => k !== undefined || !isEmpty(block));
  if (!kept.length) return '';
  const out: string[] = [];
  let previous: number | undefined;
  kept.forEach(({ block, k }, index) => {
    const gap = index ? [''] : [];
    if (k === undefined) {
      out.push(...gap, ...serializeBlock(block).split('\n'));
    } else {
      // The blank lines the block had before it stay, when the block before it is still the one that was.
      const before = index === 0 ? k === 0 : previous === k - 1;
      const original = before ? lines.slice(k === 0 ? 0 : pieces[k - 1].end, pieces[k].start) : gap;
      out.push(...original, ...lines.slice(pieces[k].start, pieces[k].end));
    }
    previous = k;
  });
  const last = kept[kept.length - 1].k;
  out.push(...(last !== undefined && last === pieces.length - 1 ? lines.slice(pieces[last].end) : ['']));
  return out.join('\n');
}
