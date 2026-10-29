import '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownFromPage, parseSource, renderHtml, serializeMarkdown } from './index';

/*
 * An agent's Markdown must come back byte for byte except where you wrote. Each case is opened (as the editor opens it), changed or not,
 * and written back.
 */

/** Opens `markdown` in a page the way the editor does, runs `change` on the page, and writes it back. */
function reopen(markdown: string, change: (page: HTMLElement) => void = () => {}) {
  const source = parseSource(markdown);
  const page = document.createElement('div');
  page.innerHTML = renderHtml(source.doc, 'div', true);
  change(page);
  return markdownFromPage(page, source);
}
const normalized = (text: string) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

const CASES: Record<string, string> = {
  nested4: '- a\n    - b\n        - c\n',
  fenceInList: '1. Step\n\n   ```bash\n   npm i\n   ```\n2. Next\n',
  indentedCode: 'Para\n\n    const x = 1;\n    const y = 2;\n',
  refLink: 'See [the docs][1] and [again][] and [short].\n\n[1]: https://example.com/docs\n[short]: https://example.com/s "Title"\n',
  footnote: 'Claim[^1] and more[^note].\n\n[^1]: Source.\n[^note]: A longer note\n    that continues.\n\n    And a second paragraph.\n',
  inlineHtml: 'Press <kbd>Cmd</kbd>+<kbd>K</kbd> and a<br>b <!-- hidden -->\n',
  htmlBlockWithBlank: '<details>\n<summary>More</summary>\n\nHidden **text**\n\n</details>\n',
  emphPunct: 'This is **bold**, and *it*. Also **"quoted"** and _(paren)_.\n',
  intraStar: 'foo*bar*baz and 2*3*4\n',
  softBreaks: 'Line one of a hard-wrapped\nparagraph by an agent that goes on\nfor three lines.\n',
  crlf: '# T\r\n\r\n- a\r\n- b\r\n',
  bom: '﻿# T\n\ntext\n',
  unicode: '# Ideas 💡\n\n- naïve café — “quotes” 日本語\n',
  dollar: 'Costs $5 and 50% off: a_b_c, x<y>z\n',
  tableNoLead: 'a | b\n--|--\n1 | 2\n',
  table: '| a | b |\n|---|:-:|\n| 1 | 2 |\n',
  looseList: '- a\n\n- b\n\n  para\n',
  headingTrailingHash: '# C#\n',
  checkboxStar: '* [ ] todo\n* [x] done\n',
  autolinkBare: 'Visit https://example.com/a_b_c now and <https://example.com/b>\n',
  escapedUnderscore: 'snake\\_case and \\*not\\*\n',
  frontMatter: '---\ntitle: x\ntags: [a, b]\n---\n\n# After\n\ntext\n',
  frontMatterOnly: '---\ntitle: x\n---\n',
  hrStars: 'above\n\n***\n\nbelow\n',
  numberedPara: '2024. A year\n',
  imageLink: '[![badge](https://x/y.svg)](https://x) and ![plain](a.png)\n',
  setext: 'Title\n=====\n\nSub\n---\n\ntext\n',
  plusBullets: '+ a\n+ b\n',
  trailingSpaces: 'two spaces at the end  \nnext line\n',
  blankLines: '\n\n# Lead blanks\n\n\n\nGap of three\n\n\n',
  noFinalNewline: '# T\n\ntext without a final newline',
  orderedStart: '3) three\n4) four\n',
  quoteLazy: '> a quote\nlazy line\n\n> second\n',
  longLine: `${'x'.repeat(5000)}\n`,
  mixed: '---\nt: 1\n---\n\n# Plan\n\nSome *text* with [a link](https://e.com) and `code`.\n\n- [ ] one\n- [x] two\n    - deep\n\n```js\nlet a = 1;\n```\n\n> quote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[1]: https://e.com\n',
};

test('opening and saving with no change gives back every byte, for all kinds of agent Markdown', () => {
  for (const [name, markdown] of Object.entries(CASES)) assert.equal(reopen(markdown), normalized(markdown), name);
});

test('changing one block changes only that block: the lines of every other block are the same, and so are the blank lines between them', () => {
  const edit = (name: string, find: RegExp, replacement: (element: HTMLElement) => void) => {
    const markdown = CASES[name];
    const out = reopen(markdown, (page) => {
      const target = [...page.children].find((child) => find.test(child.textContent ?? '')) as HTMLElement;
      assert.ok(target, `${name}: a block to change`);
      replacement(target);
    });
    const before = parseSource(markdown);
    const after = parseSource(out);
    return { before, after, out };
  };
  // The paragraph of a mixed document is changed; all the rest is identical to what was there.
  const { before, after } = edit('mixed', /^Some text/, (element) => (element.textContent = 'Some new words here.'));
  assert.equal(after.doc.length, before.doc.length);
  const blockText = (source: ReturnType<typeof parseSource>, k: number) => source.lines.slice(source.pieces[k].start, source.pieces[k].end).join('\n');
  for (let k = 0; k < before.doc.length; k++) {
    if (blockText(before, k).startsWith('Some *text*')) assert.equal(blockText(after, k), 'Some new words here.');
    else assert.equal(blockText(after, k), blockText(before, k), `block ${k} is untouched`);
  }
  // The blank lines around the changed block are kept too.
  const mixed = CASES.mixed;
  const out = reopen(mixed, (page) => {
    [...page.children].find((child) => /^Some text/.test(child.textContent ?? ''))!.textContent = 'Some new words here.';
  });
  assert.equal(out, mixed.replace('Some *text* with [a link](https://e.com) and `code`.', 'Some new words here.'));

  // The cases the probe found: nothing else in the file moves.
  const touch = (markdown: string, find: RegExp, to: string) => reopen(markdown, (page) => ([...page.children].find((child) => find.test(child.textContent ?? '')) as HTMLElement).replaceChildren(to));
  const twoBlocks = (lead: string) => `# Heading\n\n${lead}`;
  for (const name of ['refLink', 'footnote', 'inlineHtml', 'imageLink', 'softBreaks', 'indentedCode', 'looseList', 'hrStars', 'table', 'htmlBlockWithBlank', 'frontMatter', 'crlf', 'bom', 'nested4']) {
    const out = touch(twoBlocks(CASES[name]), /^Heading$/, 'Heading renamed');
    assert.equal(out, normalized(twoBlocks(CASES[name])).replace('# Heading', '# Heading renamed'), `${name}: only the heading changes`);
  }
});

test('a block you add or remove leaves its neighbours alone', () => {
  const md = '# One\n\ntwo\n\n- three\n\nParagraph four\n\n    indented code\n';
  const added = reopen(md, (page) => {
    const extra = document.createElement('div');
    extra.textContent = 'new line';
    page.children[1].after(extra);
  });
  assert.equal(added, '# One\n\ntwo\n\nnew line\n\n- three\n\nParagraph four\n\n    indented code\n', 'the new block goes in, every other block and the blank lines stay');
  const removed = reopen(md, (page) => page.children[1].remove());
  assert.equal(removed, '# One\n\n- three\n\nParagraph four\n\n    indented code\n');
  const split = reopen('first paragraph\n\nsecond\n', (page) => {
    const copy = page.children[0].cloneNode(true) as HTMLElement;
    copy.textContent = 'the same block, split in two';
    page.children[0].after(copy);
  });
  assert.equal(split, 'first paragraph\n\nthe same block, split in two\n\nsecond\n', 'two blocks from one original are both written out (the second one is a change)');
});

test('what the editor cannot show is kept as an inline mark the page never rewrites', () => {
  const page = document.createElement('div');
  const source = parseSource('See [the docs][1], a[^1], <kbd>K</kbd>, [![b](x.svg)](https://y) and ![i](z.png).\n\n[1]: https://example.com\n\n[^1]: note\n');
  page.innerHTML = renderHtml(source.doc, 'div', true);
  assert.deepEqual([...page.querySelectorAll('.md-atom')].map((atom) => atom.getAttribute('data-md')), ['[the docs][1]', '[^1]', '<kbd>', '</kbd>', '[![b](x.svg)](https://y)', '![i](z.png)']);
  // Edited (so the block is written afresh), every one of them is written as it was.
  (page.children[0] as HTMLElement).append(' more');
  assert.equal(markdownFromPage(page, source), 'See [the docs][1], a[^1], <kbd>K</kbd>, [![b](x.svg)](https://y) and ![i](z.png). more\n\n[1]: https://example.com\n\n[^1]: note\n');
  assert.equal(serializeMarkdown(source.doc), 'See [the docs][1], a[^1], <kbd>K</kbd>, [![b](x.svg)](https://y) and ![i](z.png).\n\n[1]: https://example.com\n\n[^1]: note\n');
});

test('indented code stays code; a page with no source still writes in the editor\'s style', () => {
  const source = parseSource('Para\n\n    const x = 1;\n    const y = 2;\n');
  assert.deepEqual(source.doc.map((block) => block.t), ['p', 'code']);
  assert.equal(source.doc[1].t === 'code' && source.doc[1].text, 'const x = 1;\nconst y = 2;');
  const page = document.createElement('div');
  page.innerHTML = '<div>Para</div><div>second</div>';
  assert.equal(markdownFromPage(page), 'Para\n\nsecond\n');
});
