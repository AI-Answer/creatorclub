import { readDoc, renderHtml } from './dom';
import { parseMarkdown } from './parse';
import { serializeMarkdown } from './serialize';

export type { Block, Doc, Inline, Item, Marks } from './doc';
export { docFromHtml, readDoc, renderHtml } from './dom';
export { parseInline, parseMarkdown, safeHref } from './parse';
export { serializeInline, serializeMarkdown } from './serialize';

/** The page (HTML) that shows some Markdown. */
export const markdownToHtml = (markdown: string) => renderHtml(parseMarkdown(markdown));

/** The Markdown for what is on a page. */
export const markdownFromPage = (root: Node) => serializeMarkdown(readDoc(root));
