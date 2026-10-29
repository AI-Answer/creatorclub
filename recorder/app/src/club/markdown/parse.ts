import { mergeInline, text, type Block, type Doc, type Inline, type Item, type Marks } from './doc';

/*
 * Markdown to document. It reads what people and agents write: headings, paragraphs, bullet, numbered and check lists (nested), quotes,
 * fenced code, rules, and in text: bold, italic, strike, code, links, images. Anything else (tables, HTML, front matter) is kept as a raw block.
 */

const ESCAPABLE = '\\`*_{}[]()#+-.!~|<>"\'&$%=:;,/?@^';

// ---------------------------------------------------------------- inline

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** The index of the `)` that closes the `(` at `open`, allowing one level of parentheses inside, or -1. */
function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
    else if (s[i] === '\n' && s[i + 1] === '\n') return -1;
  }
  return -1;
}

/** The index of the `]` that closes the `[` at `open`, or -1. */
function closingBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > 0) i = end;
    } else if (s[i] === '[') depth++;
    else if (s[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

const SAFE_HREF = /^(?:https?:|mailto:|#|\/|\.\.?\/|[\w-]+(?:\/|\.[\w]{1,5}(?:$|[?#])))/i;
export const safeHref = (href: string) => SAFE_HREF.test(href.trim()) && !/^\s*(?:javascript|data|vbscript):/i.test(href);

/** `(url "title")` after a link's label: the url (angle brackets allowed) and where the group ends. */
function linkTarget(s: string, open: number): { href: string; end: number } | undefined {
  const close = closingParen(s, open);
  if (close < 0) return undefined;
  const inner = s.slice(open + 1, close).trim();
  const match = /^(?:<([^<>\n]*)>|(\S*))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?$/.exec(inner);
  if (!match) return undefined;
  const href = (match[1] ?? match[2]).replace(/\\([()])/g, '$1');
  return { href, end: close + 1 };
}

const isPunct = (char: string | undefined) => char !== undefined && /[\p{P}\p{S}]/u.test(char);

/** A run of `*`, `_` or `~` in the text: how long it is, and whether it can start or end formatting (CommonMark's flanking rules). */
interface Delimiter {
  d: true;
  char: string;
  n: number;
  /** Its length when found, for the "multiple of 3" rule. */
  was: number;
  open: boolean;
  close: boolean;
  /** Set once the run lies inside formatting that already closed: it stays as text. */
  dead?: boolean;
  extra: Marks;
}
interface Piece {
  d?: false;
  run: Inline;
  extra: Marks;
}

function delimiter(s: string, at: number, run: number): Delimiter {
  const char = s[at];
  const before = s[at - 1];
  const after = s[at + run];
  const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
  const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
  const underscore = char === '_';
  return {
    d: true,
    char,
    n: run,
    was: run,
    open: underscore ? left && (!right || isPunct(before)) : left,
    close: underscore ? right && (!left || isPunct(after)) : right,
    extra: {},
  };
}

/** Pairs up the delimiter runs: each match marks everything between its two runs. Follows CommonMark's order, so `***a**b*` and `**a***b*` read the way they are written. */
function pairDelimiters(tokens: (Delimiter | Piece)[]) {
  for (let closerAt = 0; closerAt < tokens.length; closerAt++) {
    const closer = tokens[closerAt];
    if (!closer.d || !closer.close || closer.dead) continue;
    while (closer.n > 0) {
      let openerAt = -1;
      for (let j = closerAt - 1; j >= 0; j--) {
        const opener = tokens[j];
        if (!opener.d || opener.dead || !opener.open || opener.char !== closer.char || opener.n === 0) continue;
        if (closer.char === '~' && (opener.n < 2 || closer.n < 2)) continue;
        const odd = (opener.close || closer.open) && (opener.was + closer.was) % 3 === 0 && !(opener.was % 3 === 0 && closer.was % 3 === 0);
        if (closer.char !== '~' && odd) continue;
        openerAt = j;
        break;
      }
      if (openerAt < 0) break;
      const opener = tokens[openerAt] as Delimiter;
      const use = closer.char === '~' ? 2 : opener.n >= 2 && closer.n >= 2 ? 2 : 1;
      const mark: Marks = closer.char === '~' ? { strike: true } : use === 2 ? { bold: true } : { italic: true };
      for (let k = openerAt + 1; k < closerAt; k++) {
        const between = tokens[k];
        Object.assign(between.extra, mark);
        if (between.d) between.dead = true;
      }
      opener.n -= use;
      closer.n -= use;
    }
  }
}

export function parseInline(s: string, marks: Marks = {}): Inline[] {
  const tokens: (Delimiter | Piece)[] = [];
  let buffer = '';
  const push = (run: Inline) => tokens.push({ run, extra: {} });
  const flush = () => {
    if (buffer) push(text(buffer, { ...marks }));
    buffer = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      if (s[i + 1] === '\n') {
        flush();
        push({ t: 'br' });
        i += 2;
        while (s[i] === ' ') i++;
        continue;
      }
      if (ESCAPABLE.includes(s[i + 1])) {
        buffer += s[i + 1];
        i += 2;
        continue;
      }
    }
    if (c === '\n') {
      if (/ {2,}$/.test(buffer)) {
        buffer = buffer.replace(/ +$/, '');
        flush();
        push({ t: 'br' });
      } else buffer = `${buffer.replace(/ +$/, '')} `;
      i++;
      while (s[i] === ' ') i++;
      continue;
    }
    if (c === '`') {
      let run = 1;
      while (s[i + run] === '`') run++;
      const end = s.indexOf('`'.repeat(run), i + run);
      if (end > 0) {
        let code = s.slice(i + run, end).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        flush();
        push(text(code, { ...marks, code: true }));
        i = end + run;
        continue;
      }
      buffer += '`'.repeat(run);
      i += run;
      continue;
    }
    if (c === '!' && s[i + 1] === '[') {
      const close = closingBracket(s, i + 1);
      if (close > 0 && s[close + 1] === '(') {
        const target = linkTarget(s, close + 1);
        if (target) {
          flush();
          push({ t: 'atom', md: s.slice(i, target.end), label: s.slice(i + 2, close) || 'image' });
          i = target.end;
          continue;
        }
      }
    }
    if (c === '[') {
      const close = closingBracket(s, i);
      if (close > 0 && s[close + 1] === '(') {
        const target = linkTarget(s, close + 1);
        if (target && safeHref(target.href)) {
          flush();
          for (const run of parseInline(s.slice(i + 1, close), { ...marks, href: target.href })) push(run);
          i = target.end;
          continue;
        }
      }
    }
    if (c === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(s.slice(i));
      if (auto) {
        flush();
        push(text(auto[1], { ...marks, href: auto[1] }));
        i += auto[0].length;
        continue;
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      let run = 1;
      while (s[i + run] === c) run++;
      flush();
      // A tilde run is strike-through only as a pair; any other length is text.
      if (c === '~' && run !== 2) tokens.push({ run: text(c.repeat(run), { ...marks }), extra: {} });
      else tokens.push(delimiter(s, i, run));
      i += run;
      continue;
    }
    buffer += c;
    i++;
  }
  flush();
  pairDelimiters(tokens);
  const out: Inline[] = [];
  for (const token of tokens) {
    if (token.d) {
      if (token.n > 0) out.push(text(token.char.repeat(token.n), { ...marks, ...token.extra }));
    } else out.push(token.run.t === 'text' ? { ...token.run, marks: { ...token.run.marks, ...token.extra } } : token.run);
  }
  return mergeInline(out.map((run) => (run.t === 'text' ? { ...run, marks: Object.fromEntries(Object.entries(run.marks).filter(([, value]) => value !== undefined)) as Marks } : run)));
}

// ---------------------------------------------------------------- blocks

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BULLET = /^( *)([-*+])([ \t]+)(.*)$/;
const ORDERED = /^( *)(\d{1,9})([.)])([ \t]+)(.*)$/;
const EMPTY_BULLET = /^( *)([-*+])$/;
const EMPTY_ORDERED = /^( *)(\d{1,9})([.)])$/;
const QUOTE = /^ {0,3}>/;
const HTML_START = /^ {0,3}<(?:\/?[a-zA-Z][\w-]*(?:\s|\/?>|$)|!--)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const TASK = /^\[([ xX])\][ \t]+/;

const isBlank = (line: string | undefined) => line === undefined || !line.trim();

/** Whether a line starts something other than a paragraph, so a paragraph above it ends. */
function startsBlock(line: string, next: string | undefined): boolean {
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)) return true;
  if (BULLET.test(line) || EMPTY_BULLET.test(line)) return true;
  const ordered = ORDERED.exec(line);
  if (ordered && ordered[2] === '1') return true;
  if (HTML_START.test(line)) return true;
  return line.includes('|') && next !== undefined && TABLE_SEPARATOR.test(next) && next.includes('|');
}

const indentOf = (line: string) => /^ */.exec(line)![0].length;
const unindent = (line: string, by: number) => {
  let i = 0;
  while (i < by && line[i] === ' ') i++;
  return line.slice(i);
};

export function parseMarkdown(source: string): Doc {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  return blocks(lines, true);
}

function blocks(lines: string[], top = false): Block[] {
  const out: Block[] = [];
  let i = 0;
  // Front matter: a block of `---` lines at the very top is kept as it is.
  if (top && lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
    if (end > 0) {
      out.push({ t: 'raw', text: lines.slice(0, end + 1).join('\n') });
      i = end + 1;
    }
  }
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const [, indent, marks, lang] = fence;
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marks[0] === '`' ? '`' : '~'}{${marks.length},}\\s*$`).test(lines[i])) body.push(unindent(lines[i++], indent.length));
      i++;
      out.push({ t: 'code', lang, text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ t: 'h', level: heading[1].length as 1, inline: parseInline((heading[2] ?? '').trim()) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && !isBlank(lines[i]) && (QUOTE.test(lines[i]) || (inner.length && !startsBlock(lines[i], lines[i + 1])))) {
        inner.push(QUOTE.test(lines[i]) ? lines[i].replace(/^ {0,3}> ?/, '') : lines[i]);
        i++;
      }
      out.push({ t: 'quote', blocks: blocks(inner) });
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line) || EMPTY_BULLET.test(line) || EMPTY_ORDERED.test(line)) {
      const list = readList(lines, i);
      out.push(list.block);
      i = list.next;
      continue;
    }
    if (line.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '') && (lines[i + 1] ?? '').includes('|')) {
      const start = i;
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) i++;
      out.push({ t: 'raw', text: lines.slice(start, i).join('\n') });
      continue;
    }
    if (HTML_START.test(line)) {
      const start = i;
      while (i < lines.length && !isBlank(lines[i])) i++;
      out.push({ t: 'raw', text: lines.slice(start, i).join('\n') });
      continue;
    }
    // A paragraph: lines up to a blank line or the start of another block; a `===` or `---` line under it makes it a heading.
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i])) {
      if (para.length && /^ {0,3}(?:=+|-{2,})[ \t]*$/.test(lines[i])) {
        out.push({ t: 'h', level: lines[i].includes('=') ? 1 : 2, inline: parseInline(para.join('\n').trim()) });
        para.length = 0;
        i++;
        break;
      }
      if (para.length && startsBlock(lines[i], lines[i + 1])) break;
      para.push(lines[i].trimStart());
      i++;
    }
    if (para.length) out.push({ t: 'p', inline: parseInline(para.join('\n').replace(/\s+$/, '')) });
  }
  return out;
}

/** One list starting at `from`: its items (each with nested blocks), and the line after it. */
function readList(lines: string[], from: number): { block: Block; next: number } {
  const first = lines[from];
  const ordered = ORDERED.exec(first) ?? EMPTY_ORDERED.exec(first);
  const isOrdered = !!(ordered && (ORDERED.test(first) || EMPTY_ORDERED.test(first)));
  const start = isOrdered ? Number(ordered![2]) : 1;
  const items: Item[] = [];
  let i = from;
  const listIndent = indentOf(first);
  while (i < lines.length) {
    const line = lines[i];
    const bullet = BULLET.exec(line) ?? (EMPTY_BULLET.exec(line) ? ([line, EMPTY_BULLET.exec(line)![1], EMPTY_BULLET.exec(line)![2], ' ', ''] as unknown as RegExpExecArray) : null);
    const number = ORDERED.exec(line) ?? (EMPTY_ORDERED.exec(line) ? ([line, EMPTY_ORDERED.exec(line)![1], EMPTY_ORDERED.exec(line)![2], EMPTY_ORDERED.exec(line)![3], ' ', ''] as unknown as RegExpExecArray) : null);
    const marker = isOrdered ? number : bullet;
    if (!marker || indentOf(line) > listIndent + 3 || indentOf(line) < listIndent - 3 || (isOrdered ? !!bullet && !number : !!number && !bullet)) break;
    const markerWidth = isOrdered ? marker[1].length + marker[2].length + marker[3].length + Math.min(4, marker[4].length) : marker[1].length + 1 + Math.min(4, marker[3].length);
    const body: string[] = [isOrdered ? marker[5] : marker[4]];
    i++;
    // The item's lines: indented under its marker, or lazy text right after its paragraph; blank lines belong to it only when more indented text follows.
    while (i < lines.length) {
      const next = lines[i];
      if (isBlank(next)) {
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) >= markerWidth) {
          for (; i < j; i++) body.push('');
          continue;
        }
        break;
      }
      if (indentOf(next) >= markerWidth) {
        body.push(unindent(next, markerWidth));
        i++;
      } else if (!isBlank(body[body.length - 1]) && !startsBlock(next, lines[i + 1]) && !BULLET.test(next) && !ORDERED.test(next) && !EMPTY_ORDERED.test(next)) {
        body.push(next.trimStart());
        i++;
      } else break;
    }
    const task = TASK.exec(body[0]);
    if (task) body[0] = body[0].slice(task[0].length);
    const parsed = blocks(body);
    const head = parsed[0];
    const item: Item = head?.t === 'p' ? { inline: head.inline, children: parsed.slice(1) } : { inline: [], children: parsed };
    if (task) item.checked = task[1] !== ' ';
    items.push(item);
    while (i < lines.length && isBlank(lines[i]) && i + 1 < lines.length && (BULLET.test(lines[i + 1]) || ORDERED.test(lines[i + 1])) && indentOf(lines[i + 1]) === listIndent) i++;
  }
  return { block: isOrdered ? { t: 'ol', items, start } : { t: 'ul', items }, next: i };
}
