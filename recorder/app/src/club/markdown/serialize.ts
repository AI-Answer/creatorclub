import { mergeInline, type Block, type Doc, type Inline, type Item, type Marks } from './doc';

/** Document to Markdown: `-` bullets, `1.` numbers, `- [ ]` checks, `**bold**`, `*italic*`, `~~strike~~`, fenced code. Ends with one newline (nothing for an empty document). */

const EMPHASIS = ['bold', 'italic', 'strike'] as const;
const DELIMITER = { bold: '**', italic: '*', strike: '~~' } as const;

/** Escapes what would otherwise be read as formatting. `_` inside a word is left alone, as it means nothing there. */
export function escapeText(value: string): string {
  return value
    .replace(/[\\`*[\]]/g, '\\$&')
    .replace(/~~/g, '\\~~')
    .replace(/<(?=[a-zA-Z/!])/g, '\\<')
    .replace(/_/g, (match, offset: number, whole: string) => (/[\p{L}\p{N}]/u.test(whole[offset - 1] ?? '') && /[\p{L}\p{N}]/u.test(whole[offset + 1] ?? '') ? match : '\\_'));
}

const BLOCK_START = /^(?:#{1,6}(?:\s|$)|[-+*](?:\s|$)|\d{1,9}[.)](?:\s|$)|>|`{3}|~{3}|(?:[-*_][ \t]*){3,}$|=+$)/;

/** A line of text that would start a block when it begins a paragraph gets its first character escaped. */
function guardLineStart(line: string): string {
  if (!BLOCK_START.test(line)) return line;
  const number = /^(\d{1,9})([.)])/.exec(line);
  return number ? `${number[1]}\\${line.slice(number[1].length)}` : `\\${line}`;
}

const EMPHASIS_MARKS = ['bold', 'italic', 'strike'] as const;
const emphasisOf = (run: Inline | undefined): Marks => (run?.t === 'text' && !run.marks.code ? run.marks : {});
const lacksAny = (marks: Marks, other: Marks) => EMPHASIS_MARKS.some((mark) => marks[mark] && !other[mark]);

/**
 * Whitespace at the edge of a marked stretch goes outside the marks (`**a **` is not bold in Markdown). Whitespace between two runs that share
 * the mark stays inside it, so `**a *b* c**` keeps its one pair of bold marks.
 */
function settle(runs: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  runs.forEach((run, index) => {
    if (run.t !== 'text' || run.marks.code || !EMPHASIS_MARKS.some((mark) => run.marks[mark])) {
      out.push(run);
      return;
    }
    const before = emphasisOf(runs[index - 1]);
    const after = emphasisOf(runs[index + 1]);
    const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
    const shared = (other: Marks): Marks => ({ ...(run.marks.href ? { href: run.marks.href } : {}), ...Object.fromEntries(EMPHASIS_MARKS.filter((mark) => run.marks[mark] && other[mark]).map((mark) => [mark, true])) });
    const trimLead = lead && lacksAny(run.marks, before);
    const trimTail = tail && lacksAny(run.marks, after);
    if (trimLead) out.push({ t: 'text', text: lead, marks: shared(before) });
    if (core) out.push({ t: 'text', text: (trimLead ? '' : lead) + core + (trimTail ? '' : tail), marks: run.marks });
    else if (!trimLead && lead) out.push({ t: 'text', text: lead, marks: run.marks });
    if (trimTail && core) out.push({ t: 'text', text: tail, marks: shared(after) });
  });
  return out;
}

function codeSpan(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return /^[` ]|[` ]$/.test(value) ? `${fence} ${value} ${fence}` : `${fence}${value}${fence}`;
}

type Open = 'bold' | 'italic' | 'strike' | { href: string };

const wantedMarks = (marks: Marks): Open[] => [...(marks.href ? [{ href: marks.href }] : []), ...EMPHASIS.filter((mark) => marks[mark])];
const sameMark = (a: Open | undefined, b: Open | undefined) => (typeof a === 'object' && typeof b === 'object' ? a.href === b.href : a === b);
const encodeHref = (href: string) => {
  const spaced = href.replace(/[\s<>]/g, (char) => encodeURIComponent(char));
  // Parentheses that pair up are fine in an address; a lone one would end the link early.
  let depth = 0;
  const balanced = [...spaced].every((char) => (char === '(' ? ++depth > 0 : char === ')' ? --depth >= 0 : true)) && depth === 0;
  return balanced ? spaced : spaced.replace(/[()]/g, (char) => encodeURIComponent(char));
};

export function serializeInline(input: readonly Inline[]): string {
  let out = '';
  let stack: Open[] = [];
  // Marks that stay open across neighbouring runs are kept open; the rest close innermost first, and the new ones open outermost first.
  const move = (wanted: Open[]) => {
    let keep = 0;
    while (keep < stack.length && keep < wanted.length && sameMark(stack[keep], wanted[keep])) keep++;
    for (const mark of stack.slice(keep).reverse()) out += typeof mark === 'object' ? `](${encodeHref(mark.href)})` : DELIMITER[mark];
    for (const mark of wanted.slice(keep)) out += typeof mark === 'object' ? '[' : DELIMITER[mark];
    stack = wanted;
  };
  const runs = mergeInline(input);
  while (runs[runs.length - 1]?.t === 'br') runs.pop();
  while (runs[0]?.t === 'br') runs.shift();
  // Space at the very start or end is not kept by Markdown.
  const first = runs[0];
  if (first?.t === 'text') runs[0] = { ...first, text: first.text.replace(/^\s+/, '') };
  const last = runs[runs.length - 1];
  if (last?.t === 'text') runs[runs.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') };
  // A line after a hard break starts at its first word.
  const lines = runs.map((run, index) => (run.t === 'text' && runs[index - 1]?.t === 'br' ? { ...run, text: run.text.replace(/^\s+/, '') } : run));
  const settled = settle(lines);
  const marksAt = (index: number): Open[] => {
    const run = settled[index];
    return run?.t === 'text' ? wantedMarks(run.marks.code ? { href: run.marks.href, ...(run.marks.bold ? { bold: true } : {}), ...(run.marks.italic ? { italic: true } : {}) } : run.marks) : [];
  };
  const has = (list: Open[], mark: Open) => list.some((other) => sameMark(other, mark));
  /** How many runs, from this one on, keep the mark. A mark that lasts longer goes on the outside, so the ones inside it end first. */
  const extent = (from: number, mark: Open) => {
    let n = 0;
    while (from + n < settled.length && has(marksAt(from + n), mark)) n++;
    return n;
  };
  for (const [index, run] of settled.entries()) {
    if (run.t === 'br') {
      move([]);
      out += '\\\n';
    } else if (run.t === 'atom') {
      move([]);
      out += run.md;
    } else {
      const set = marksAt(index);
      let keep = 0;
      while (keep < stack.length && has(set, stack[keep])) keep++;
      const reopened = stack.slice(keep).filter((mark) => has(set, mark));
      const fresh = set.filter((mark) => !has(stack, mark)).sort((a, b) => extent(index, b) - extent(index, a));
      move([...stack.slice(0, keep), ...reopened, ...fresh]);
      out += run.marks.code ? codeSpan(run.text) : escapeText(run.text);
    }
  }
  move([]);
  return out;
}

const indentLines = (value: string, by: string, skipFirst = false) =>
  value
    .split('\n')
    .map((line, index) => (line && !(skipFirst && index === 0) ? by + line : line))
    .join('\n');

/** Every line of some text, so none of them starts a block when the text is read again. */
const guardLines = (value: string) => value.split('\n').map(guardLineStart).join('\n');
const paragraph = (inline: readonly Inline[]) => guardLines(serializeInline(inline));

function listItem(item: Item, marker: string): string {
  const task = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
  const head = guardLines(serializeInline(item.inline));
  const pad = ' '.repeat(marker.length);
  let out = `${marker}${task}${indentLines(head, pad, true)}`.trimEnd();
  // A list under an item follows its line directly; any other block is set apart by a blank line.
  for (const [index, child] of item.children.entries()) {
    const startsTight = (block: Block) => block.t === 'ul' || (block.t === 'ol' && block.start === 1);
    const tight = startsTight(child) && (index === 0 || item.children[index - 1].t === 'ul' || item.children[index - 1].t === 'ol');
    out += `${tight ? '\n' : '\n\n'}${indentLines(serializeBlock(child), pad)}`;
  }
  return out;
}

export function serializeBlock(block: Block): string {
  switch (block.t) {
    case 'p':
      return paragraph(block.inline);
    case 'h':
      // A `#` at the end would be read as the closing sequence of the heading.
      return `${'#'.repeat(block.level)} ${serializeInline(block.inline).replace(/\n/g, ' ').replace(/(^|\s)(#+)$/, '$1\\$2')}`.trimEnd();
    case 'ul':
      return block.items.map((item) => listItem(item, '- ')).join('\n');
    case 'ol':
      return block.items.map((item, index) => listItem(item, `${block.start + index}. `)).join('\n');
    case 'quote':
      return serializeBlocks(block.blocks)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'code': {
      const longest = Math.max(2, ...(block.text.match(/^`{3,}/gm) ?? []).map((run) => run.length));
      const fence = '`'.repeat(longest + 1);
      return `${fence}${block.lang}\n${block.text}\n${fence}`;
    }
    case 'hr':
      return '---';
    case 'raw':
      return block.text;
  }
}

const isEmpty = (block: Block) => (block.t === 'p' && !serializeInline(block.inline).trim()) || (block.t === 'quote' && block.blocks.every(isEmpty));

function serializeBlocks(doc: Doc): string {
  const parts: string[] = [];
  for (const block of doc) if (!isEmpty(block)) parts.push(serializeBlock(block));
  return parts.join('\n\n');
}

export function serializeMarkdown(doc: Doc): string {
  const body = serializeBlocks(doc);
  return body ? `${body}\n` : '';
}
