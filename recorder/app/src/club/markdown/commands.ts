/*
 * What the note editor does with the keys: the `/` menu, Markdown shortcuts typed at the start of a line (`# `, `- `, `1. `, `[] `, `> `),
 * and Markdown typed around words (`**bold**`, `*italic*`, `` `code` ``, `~~strike~~`). Pure, so the rules are tested without a page.
 */

export type CommandId = 'text' | 'h1' | 'h2' | 'h3' | 'bullets' | 'numbers' | 'tasks' | 'quote' | 'code' | 'divider';

export interface Command {
  id: CommandId;
  label: string;
  /** What to type to get the same thing, shown beside the name. */
  hint: string;
  /** Other words that find it in the `/` menu. */
  words: string[];
  icon: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'list' | 'list-numbered' | 'checklist' | 'quote' | 'code' | 'divider';
}

export const COMMANDS: readonly Command[] = [
  { id: 'text', label: 'Text', hint: '', words: ['paragraph', 'plain', 'normal'], icon: 'paragraph' },
  { id: 'h1', label: 'Heading 1', hint: '#', words: ['title', 'big', 'h1'], icon: 'heading-1' },
  { id: 'h2', label: 'Heading 2', hint: '##', words: ['subtitle', 'h2', 'section'], icon: 'heading-2' },
  { id: 'h3', label: 'Heading 3', hint: '###', words: ['small', 'h3'], icon: 'heading-3' },
  { id: 'bullets', label: 'Bullet list', hint: '-', words: ['bullets', 'points', 'ul', 'list', 'unordered'], icon: 'list' },
  { id: 'numbers', label: 'Numbered list', hint: '1.', words: ['numbers', 'steps', 'ol', 'ordered', 'list'], icon: 'list-numbered' },
  { id: 'tasks', label: 'Checklist', hint: '[]', words: ['todo', 'tasks', 'check', 'checkbox', 'list'], icon: 'checklist' },
  { id: 'quote', label: 'Quote', hint: '>', words: ['blockquote', 'callout'], icon: 'quote' },
  { id: 'code', label: 'Code block', hint: '```', words: ['snippet', 'pre', 'monospace'], icon: 'code' },
  { id: 'divider', label: 'Divider', hint: '---', words: ['line', 'rule', 'hr', 'separator'], icon: 'divider' },
];

/** The commands the `/` menu offers for what was typed after the slash: those whose name starts with it, then those that contain it or have a word that starts with it. */
export function filterCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...COMMANDS];
  const starts = COMMANDS.filter((command) => command.label.toLowerCase().startsWith(q) || command.id === q);
  const rest = COMMANDS.filter((command) => !starts.includes(command) && (command.label.toLowerCase().includes(q) || command.words.some((word) => word.startsWith(q))));
  return [...starts, ...rest];
}

/** The text between a `/` and the caret when the `/` starts a line or follows a space: what to search for and how many characters to remove (the slash included). */
export function slashQuery(before: string): { query: string; length: number } | null {
  const match = /(?:^|\s)\/([A-Za-z0-9 ]{0,16})$/.exec(before);
  if (!match) return null;
  // "/ " (a slash and a space) and a long run of words are ordinary text, not a command.
  if (/^\s/.test(match[1]) || (match[1].match(/ /g)?.length ?? 0) > 1) return null;
  return { query: match[1], length: match[1].length + 1 };
}

/** What typing a space after `before` (the line's text so far) turns the line into, or nothing. `inList` is true inside a list item. */
export function blockShortcut(before: string, inList: boolean): CommandId | null {
  if (/^\[[ xX]?\]$/.test(before)) return 'tasks';
  if (inList) return null;
  if (before === '#') return 'h1';
  if (before === '##') return 'h2';
  if (before === '###') return 'h3';
  if (before === '-' || before === '*' || before === '+') return 'bullets';
  if (/^\d{1,3}[.)]$/.test(before)) return 'numbers';
  if (before === '>') return 'quote';
  return null;
}

/** What pressing Enter after `before` turns the line into: three backticks open a code block, three dashes make a divider. */
export function enterShortcut(before: string): CommandId | null {
  if (/^```[\w+-]*$/.test(before)) return 'code';
  if (before === '---' || before === '***' || before === '___') return 'divider';
  return null;
}

export type InlineMark = 'bold' | 'italic' | 'strike' | 'code';

export interface InlineMatch {
  mark: InlineMark;
  /** The words that get the mark. */
  text: string;
  /** How many characters before the caret to replace (the opening marks, the words, and the closing marks typed so far). */
  remove: number;
}

const WORD = '([^\\s*_~`](?:[^*_~`]*[^\\s*_~`])?)';

/**
 * When the key just typed (`typed`) completes `**words**`, `*words*`, `_words_`, `~~words~~` or `` `words` `` in `before` (the text before the caret, in one piece of text),
 * says what to replace with the marked words. Opening marks that follow a letter or digit do not count (`2*3*4` stays as typed).
 */
export function inlineShortcut(before: string, typed: string): InlineMatch | null {
  const hit = (pattern: RegExp, mark: InlineMark, open: number, close: number): InlineMatch | null => {
    const match = pattern.exec(before);
    return match ? { mark, text: match[2], remove: open + match[2].length + close } : null;
  };
  switch (typed) {
    case '`':
      return hit(/(^|[^`])`([^`]+)$/, 'code', 1, 0);
    case '*':
      return (
        hit(new RegExp(`(^|[^*\\p{L}\\p{N}])\\*\\*${WORD}\\*$`, 'u'), 'bold', 2, 1) ??
        hit(new RegExp(`(^|[^*\\p{L}\\p{N}])\\*${WORD}$`, 'u'), 'italic', 1, 0)
      );
    case '_':
      return hit(new RegExp(`(^|[^_\\p{L}\\p{N}])_${WORD}$`, 'u'), 'italic', 1, 0);
    case '~':
      return hit(new RegExp(`(^|[^~])~~${WORD}~$`, 'u'), 'strike', 2, 1);
  }
  return null;
}

const URL_ONLY = /^(?:https?:\/\/|mailto:)\S+$/i;
/** Whether pasted text is one web address. */
export const isUrl = (value: string) => URL_ONLY.test(value.trim());

/** Whether plain text looks like it was written in Markdown: a heading, list, quote or fence at the start of a line, or **bold**, a `code span` or a [link](url). */
export const looksLikeMarkdown = (value: string) => /^(?:#{1,6} |[-*+] |\d+[.)] |> |```|- \[[ xX]\] )/m.test(value) || /\*\*[^*\s][^*]*\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)/.test(value);

/** An address typed without its scheme gets one; anything else is left as it is. */
export function linkAddress(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/|\.\.?\/)/i.test(text)) return text;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? `mailto:${text}` : `https://${text}`;
}
