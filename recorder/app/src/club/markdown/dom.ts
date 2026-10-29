import { mergeInline, text, type Block, type Doc, type Inline, type Item, type Marks } from './doc';
import { safeHref } from './parse';

/*
 * The document in the editor's page. `renderHtml` writes a document as HTML (every piece of text is escaped, links are checked), and `readDoc`
 * reads a page back into a document: the editor's own markup, and also what a browser makes while you type and what other apps put on the clipboard
 * (`<div>` lines, `<b>`, `<i>`, spans with a bold or italic style, GitHub-style checkboxes).
 */

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

// ---------------------------------------------------------------- document to HTML

export function inlineHtml(runs: readonly Inline[]): string {
  return runs
    .map((run) => {
      if (run.t === 'br') return '<br>';
      if (run.t === 'atom') return `<span class="md-atom" data-md="${escapeHtml(run.md)}" contenteditable="false">${escapeHtml(run.label)}</span>`;
      let html = escapeHtml(run.text);
      const { marks } = run;
      if (marks.code) html = `<code>${html}</code>`;
      if (marks.strike) html = `<s>${html}</s>`;
      if (marks.italic) html = `<em>${html}</em>`;
      if (marks.bold) html = `<strong>${html}</strong>`;
      if (marks.href && safeHref(marks.href)) html = `<a href="${escapeHtml(marks.href)}">${html}</a>`;
      return html;
    })
    .join('');
}

const lineHtml = (runs: readonly Inline[]) => inlineHtml(runs) || '<br>';

function itemHtml(item: Item, line: Line): string {
  const attrs = item.checked === undefined ? '' : ` data-task="" data-checked="${item.checked}"`;
  return `<li${attrs}>${inlineHtml(item.inline) || (item.children.length ? '' : '<br>')}${item.children.map((child) => blockHtml(child, line)).join('')}</li>`;
}

/** The tag a paragraph is written as. The editor uses `div`, which is what the browser makes itself when you press Enter, so lists and headings made later nest cleanly. */
export type Line = 'p' | 'div';

export function blockHtml(block: Block, line: Line = 'p'): string {
  switch (block.t) {
    case 'p':
      return `<${line}>${lineHtml(block.inline)}</${line}>`;
    case 'h':
      return `<h${block.level}>${lineHtml(block.inline)}</h${block.level}>`;
    case 'ul':
      return `<ul>${block.items.map((item) => itemHtml(item, line)).join('')}</ul>`;
    case 'ol':
      return `<ol${block.start !== 1 ? ` start="${block.start}"` : ''}>${block.items.map((item) => itemHtml(item, line)).join('')}</ol>`;
    case 'quote':
      return `<blockquote>${block.blocks.map((child) => blockHtml(child, line)).join('') || `<${line}><br></${line}>`}</blockquote>`;
    case 'code':
      return `<pre data-lang="${escapeHtml(block.lang)}"><code>${escapeHtml(block.text) || '<br>'}</code></pre>`;
    case 'hr':
      return '<hr>';
    case 'raw':
      return `<pre data-raw="">${escapeHtml(block.text)}</pre>`;
  }
}

/** The page for a document. An empty document is one empty paragraph, so there is somewhere to write. */
export const renderHtml = (doc: Doc, line: Line = 'p') => (doc.length ? doc.map((block) => blockHtml(block, line)).join('') : `<${line}><br></${line}>`);

// ---------------------------------------------------------------- page to document

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'FIGURE', 'DL', 'DD', 'DT', 'FORM', 'NAV']);
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'BUTTON', 'SELECT', 'TEXTAREA']);

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isBlock = (node: Node) => isElement(node) && BLOCK_TAGS.has(node.tagName);
const hasBlock = (node: Node): boolean => [...node.childNodes].some((child) => isBlock(child) || (isElement(child) && !SKIPPED_TAGS.has(child.tagName) && hasBlock(child)));

const style = (element: HTMLElement, property: string) => element.style?.getPropertyValue(property) ?? '';

/** The marks an element adds to the text inside it. */
function marksOf(element: HTMLElement, marks: Marks): Marks {
  const next: Marks = { ...marks };
  const weight = style(element, 'font-weight');
  switch (element.tagName) {
    case 'STRONG':
    case 'B':
      // Google Docs wraps a whole paste in <b style="font-weight:normal">.
      if (!/^(?:normal|[1-4]00)$/.test(weight)) next.bold = true;
      break;
    case 'EM':
    case 'I':
    case 'CITE':
      next.italic = true;
      break;
    case 'S':
    case 'DEL':
    case 'STRIKE':
      next.strike = true;
      break;
    case 'CODE':
    case 'TT':
    case 'KBD':
    case 'SAMP':
      next.code = true;
      break;
    case 'A': {
      const href = element.getAttribute('href') ?? '';
      if (href && safeHref(href)) next.href = href;
      break;
    }
  }
  if (/^(?:bold|[6-9]00)$/.test(weight)) next.bold = true;
  if (style(element, 'font-style') === 'italic') next.italic = true;
  if (/line-through/.test(style(element, 'text-decoration')) || /line-through/.test(style(element, 'text-decoration-line'))) next.strike = true;
  if (/monospace/.test(style(element, 'font-family')) && element.tagName === 'SPAN') next.code = true;
  return next;
}

const cleanText = (value: string, keepSpace: boolean) => {
  const plain = value.replace(/[​﻿]/g, '');
  return keepSpace ? plain.replace(/ /g, ' ') : plain.replace(/[ \t\r\n\f]+/g, ' ').replace(/ /g, ' ');
};

function inlines(node: Node, marks: Marks, pre = false): Inline[] {
  if (node.nodeType === 3) {
    const value = cleanText(node.nodeValue ?? '', pre);
    return value ? [text(value, { ...marks })] : [];
  }
  if (!isElement(node) || SKIPPED_TAGS.has(node.tagName)) return [];
  if (node.tagName === 'BR') return [{ t: 'br' }];
  if (node.tagName === 'INPUT') return [];
  const md = node.getAttribute('data-md');
  if (md) return [{ t: 'atom', md, label: node.textContent ?? '' }];
  if (node.tagName === 'IMG') {
    const alt = node.getAttribute('alt') ?? '';
    const src = node.getAttribute('src') ?? '';
    return /^https?:/i.test(src) ? [{ t: 'atom', md: `![${alt.replace(/[[\]]/g, '')}](${src.replace(/[()\s]/g, encodeURIComponent)})`, label: alt || 'image' }] : alt ? [text(alt, { ...marks })] : [];
  }
  const next = marksOf(node, marks);
  return [...node.childNodes].flatMap((child) => inlines(child, next, pre));
}

/** The inline content of a block. A `<br>` that only holds an empty line open (the last thing in a block) is dropped. */
function blockInline(element: Node, pre = false): Inline[] {
  const runs = [...element.childNodes].flatMap((child) => inlines(child, {}, pre));
  while (runs[runs.length - 1]?.t === 'br') runs.pop();
  while (runs[0]?.t === 'text' && /^\s+$/.test(runs[0].text) && !pre) runs.shift();
  if (runs[0]?.t === 'text' && !pre) runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s+/, '') };
  const last = runs[runs.length - 1];
  if (last?.t === 'text' && !pre) runs[runs.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') };
  return mergeInline(runs);
}

function readItem(li: HTMLElement): Item {
  const checkbox = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]') as HTMLInputElement | null;
  const checked = li.hasAttribute('data-task') ? li.getAttribute('data-checked') === 'true' : checkbox ? checkbox.checked || checkbox.hasAttribute('checked') : undefined;
  const lead = li.ownerDocument.createDocumentFragment();
  const children: Block[] = [];
  let seenList = false;
  for (const child of [...li.childNodes]) {
    if (isElement(child) && (child.tagName === 'UL' || child.tagName === 'OL')) {
      seenList = true;
      children.push(readList(child));
    } else if (isElement(child) && (child.tagName === 'P' || child.tagName === 'DIV') && !seenList) {
      // Further paragraphs under an item become part of its text, one line each.
      if (lead.childNodes.length) lead.appendChild(li.ownerDocument.createElement('br'));
      for (const grand of [...child.childNodes]) lead.appendChild(grand.cloneNode(true));
    } else if (isElement(child) && isBlock(child)) children.push(...readBlocks(child.parentNode!, [child]));
    else lead.appendChild(child.cloneNode(true));
  }
  const inline = blockInline(lead);
  return { inline, children, ...(checked === undefined ? {} : { checked }) };
}

function readList(list: HTMLElement): Block {
  const items: Item[] = [];
  for (const child of [...list.childNodes]) {
    if (!isElement(child)) continue;
    if (child.tagName === 'LI') items.push(readItem(child));
    // A list placed directly in a list (what the browser makes when you indent) belongs to the item above it.
    else if (child.tagName === 'UL' || child.tagName === 'OL') {
      const parent = items[items.length - 1] ?? { inline: [], children: [] };
      if (!items.length) items.push(parent);
      parent.children.push(readList(child));
    }
  }
  return list.tagName === 'OL' ? { t: 'ol', items, start: Math.max(1, Number.parseInt(list.getAttribute('start') ?? '1', 10) || 1) } : { t: 'ul', items };
}

function readBlock(element: HTMLElement): Block[] {
  const tag = element.tagName;
  if (/^H[1-6]$/.test(tag)) return [{ t: 'h', level: Number(tag[1]) as 1, inline: blockInline(element) }];
  if (tag === 'UL' || tag === 'OL') return [readList(element)];
  if (tag === 'HR') return [{ t: 'hr' }];
  if (tag === 'BLOCKQUOTE') {
    const inner = readBlocks(element, [...element.childNodes]);
    return [{ t: 'quote', blocks: inner.length ? inner : [{ t: 'p', inline: [] }] }];
  }
  if (tag === 'PRE') {
    const value = (element.textContent ?? '').replace(/[​﻿]/g, '').replace(/ /g, ' ').replace(/\n$/, '');
    if (element.hasAttribute('data-raw')) return [{ t: 'raw', text: value }];
    const code = element.querySelector('code');
    const lang = element.getAttribute('data-lang') ?? /language-([\w+-]+)/.exec(`${element.className} ${code?.className ?? ''}`)?.[1] ?? '';
    return [{ t: 'code', lang, text: value }];
  }
  if (((tag === 'P' || tag === 'DIV') && !hasBlock(element)) || tag === 'LI' || tag === 'DT' || tag === 'DD' || tag === 'TD' || tag === 'TH') {
    // A paragraph with a `<br><br>` inside is two paragraphs, as a pasted page often means it.
    return [{ t: 'p', inline: blockInline(element) }];
  }
  return readBlocks(element, [...element.childNodes]);
}

function readBlocks(_parent: Node, nodes: Node[]): Block[] {
  const blocks: Block[] = [];
  let loose: Inline[] = [];
  const flush = () => {
    const runs = mergeInline(loose);
    while (runs[runs.length - 1]?.t === 'br') runs.pop();
    if (runs.some((run) => run.t !== 'text' || run.text.trim())) blocks.push({ t: 'p', inline: runs });
    loose = [];
  };
  for (const node of nodes) {
    if (isElement(node) && isBlock(node)) {
      flush();
      blocks.push(...readBlock(node));
    } else if (isElement(node) && !SKIPPED_TAGS.has(node.tagName) && hasBlock(node)) {
      flush();
      blocks.push(...readBlocks(node, [...node.childNodes]));
    } else loose.push(...inlines(node, {}));
  }
  flush();
  return blocks;
}

/** The document in an element (the editor's page, or a pasted fragment). */
export function readDoc(root: Node): Doc {
  return readBlocks(root, [...root.childNodes]);
}

/** A document from HTML text, for what comes from the clipboard. Scripts and the like are dropped, and nothing is run. */
export function docFromHtml(html: string): Doc {
  const parsed = new window.DOMParser().parseFromString(html, 'text/html');
  return readDoc(parsed.body);
}
