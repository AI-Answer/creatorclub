/*
 * The document a note is edited as: blocks of inline text, small enough to turn into Markdown and back without losing anything.
 * What the editor has no control for (tables, HTML, front matter, images) is kept as it was written: a `raw` block, or an inline `atom`.
 */

export interface Marks {
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  href?: string;
}

export type Inline =
  | { t: 'text'; text: string; marks: Marks }
  | { t: 'br' }
  /** Inline Markdown the editor shows as a label and writes back untouched (an image, for example). */
  | { t: 'atom'; md: string; label: string };

export interface Item {
  inline: Inline[];
  /** Set on a checklist item. */
  checked?: boolean;
  /** Lists nested under the item, and any further paragraphs. */
  children: Block[];
}

export type Block =
  | { t: 'p'; inline: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { t: 'ul'; items: Item[] }
  | { t: 'ol'; items: Item[]; start: number }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'hr' }
  | { t: 'raw'; text: string };

export type Doc = Block[];

export const text = (value: string, marks: Marks = {}): Inline => ({ t: 'text', text: value, marks });

const sameMarks = (a: Marks, b: Marks) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike && !!a.code === !!b.code && a.href === b.href;

/** Joins neighbouring text with the same marks and drops empty text. */
export function mergeInline(runs: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const run of runs) {
    if (run.t === 'text') {
      if (!run.text) continue;
      const last = out[out.length - 1];
      if (last?.t === 'text' && sameMarks(last.marks, run.marks)) {
        out[out.length - 1] = { t: 'text', text: last.text + run.text, marks: last.marks };
        continue;
      }
    }
    out.push(run);
  }
  return out;
}

/** The plain text of some inline runs (no Markdown), for titles and checks. */
export const plainText = (runs: readonly Inline[]) => runs.map((run) => (run.t === 'text' ? run.text : run.t === 'br' ? '\n' : run.label)).join('');
