import type { Block, Doc, Inline } from './doc';
import { readDoc, renderHtml, type Line } from './dom';
import { parseMarkdown } from './parse';
import { serializeMarkdown } from './serialize';

export type { Block, Doc, Inline, Item, Marks } from './doc';
export { docFromHtml, inlineHtml, readDoc, renderHtml } from './dom';
export { parseInline, parseMarkdown, safeHref } from './parse';
export { serializeInline, serializeMarkdown } from './serialize';

/** The page (HTML) that shows some Markdown. */
export const markdownToHtml = (markdown: string, line: Line = 'p') => renderHtml(parseMarkdown(markdown), line);

/** The Markdown for what is on a page. */
export const markdownFromPage = (root: Node) => serializeMarkdown(readDoc(root));

/** Plain text as a document: a blank line starts a paragraph, a single line break stays a line break. Nothing in it is read as Markdown. */
export function plainToDoc(value: string): Doc {
  return value
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((part): Block => ({ t: 'p', inline: part.split('\n').flatMap((line, index): Inline[] => [...(index ? [{ t: 'br' as const }] : []), ...(line ? [{ t: 'text' as const, text: line, marks: {} }] : [])]) }));
}
