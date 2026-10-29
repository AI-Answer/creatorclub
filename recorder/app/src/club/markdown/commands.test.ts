import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMANDS,blockShortcut,enterShortcut,filterCommands,inlineShortcut,isUrl,linkAddress,looksLikeMarkdown,slashQuery} from './commands';

test('the / menu lists every command, finds by name start first, then by other words', () => {
 assert.deepEqual(filterCommands('').map(command=>command.id),COMMANDS.map(command=>command.id));
 assert.deepEqual(filterCommands('head').map(command=>command.id),['h1','h2','h3']);
 assert.equal(filterCommands('h2')[0].id,'h2');
 assert.deepEqual(filterCommands('todo').map(command=>command.id),['tasks']);
 assert.deepEqual(filterCommands('list').map(command=>command.id),['bullets','numbers','tasks']);
 assert.equal(filterCommands('check')[0].id,'tasks');
 assert.equal(filterCommands('BULLET')[0].id,'bullets');
 assert.deepEqual(filterCommands('zzz'),[]);
 assert.ok(COMMANDS.every(command=>command.label&&command.icon),'every command has a name and an icon');
});

test('a slash opens the menu at the start of a line or after a space, with up to a few words after it', () => {
 assert.deepEqual(slashQuery('/'),{query:'',length:1});
 assert.deepEqual(slashQuery('/head'),{query:'head',length:5});
 assert.deepEqual(slashQuery('some text /bul'),{query:'bul',length:4});
 assert.deepEqual(slashQuery('/bullet list'),{query:'bullet list',length:12});
 for(const text of ['and/or','http://x.y','a/b','/ x','1/2','/a b c','path/to/file','']) assert.equal(slashQuery(text),null,text);
});

test('Markdown typed at the start of a line, then a space, makes the block', () => {
 const cases:[string,boolean,string|null][]=[['#',false,'h1'],['##',false,'h2'],['###',false,'h3'],['####',false,null],['-',false,'bullets'],['*',false,'bullets'],['+',false,'bullets'],['1.',false,'numbers'],['12)',false,'numbers'],['>',false,'quote'],['[]',false,'tasks'],['[ ]',false,'tasks'],['[x]',false,'tasks'],['[]',true,'tasks'],['-',true,null],['#',true,null],['1.',true,null],['a.',false,null],['',false,null],['- a',false,null]];
 for(const [before,inList,expected] of cases) assert.equal(blockShortcut(before,inList),expected,`${JSON.stringify(before)} ${inList?'in a list':''}`);
 assert.equal(enterShortcut('```'),'code');assert.equal(enterShortcut('```ts'),'code');assert.equal(enterShortcut('---'),'divider');
 assert.equal(enterShortcut('--'),null);assert.equal(enterShortcut('text'),null);
});

test('Markdown typed around words becomes the mark when the closing key is typed', () => {
 const hit=(before:string,typed:string)=>{const found=inlineShortcut(before,typed);return found&&[found.mark,found.text,found.remove];};
 assert.deepEqual(hit('use `code','`'),['code','code',5]);
 assert.deepEqual(hit('a **bold*','*'),['bold','bold',7]);
 assert.deepEqual(hit('**two words*','*'),['bold','two words',12]);
 assert.deepEqual(hit('an *italic','*'),['italic','italic',7]);
 assert.deepEqual(hit('an _italic','_'),['italic','italic',7]);
 assert.deepEqual(hit('~~gone~','~'),['strike','gone',7]);
 // Not yet complete, spaces inside the marks, and marks inside words stay as typed.
 assert.equal(hit('**bold','*'),null,'the first closing star only ends the first star');
 assert.equal(hit('an * not','*'),null);
 assert.equal(hit('2*3','*'),null);
 assert.equal(hit('snake_case','_'),null);
 assert.equal(hit('an *italic ','*'),null);
 assert.equal(hit('plain','*'),null);
 assert.equal(hit('x','a'),null);
 assert.equal(hit('``','`'),null,'nothing between the ticks');
 assert.equal(hit('a ~~b~~','~'),null);
});

test('paste: a lone address is a link, Markdown is recognised, and an address typed bare gets https', () => {
 assert.ok(isUrl('https://example.com/a?b=1')&&isUrl(' http://x.y ')&&isUrl('mailto:a@b.co'));
 assert.ok(!isUrl('see https://example.com')&&!isUrl('example.com')&&!isUrl(''));
 for(const md of ['# Title','- a\n- b','1. a','> q','```\ncode\n```','some **bold** text','a `tick` here','[a](https://b.c)','- [ ] todo']) assert.ok(looksLikeMarkdown(md),md);
 for(const text of ['plain words','2 * 3 * 4','a - b','snake_case here','50% off.','']) assert.ok(!looksLikeMarkdown(text),text);
 assert.equal(linkAddress('example.com/x'),'https://example.com/x');
 assert.equal(linkAddress(' https://a.b '),'https://a.b');
 assert.equal(linkAddress('me@x.co'),'mailto:me@x.co');
 assert.equal(linkAddress('#top'),'#top');assert.equal(linkAddress('/path'),'/path');assert.equal(linkAddress(''),'');
});
