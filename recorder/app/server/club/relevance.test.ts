import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLabel, reasonFor, signalText, trendText } from './relevance.js';

test('a topic matches by its keywords and the reason is the topic as Welcome spells it', () => {
  assert.equal(matchLabel('Anthropic ships a new model', ['claude']), 'Claude');
  assert.equal(matchLabel('Build an agent that books meetings', ['AI agents']), 'AI agents');
  assert.equal(matchLabel('n8n workflow for invoices', ['automation']), 'Automation');
  assert.equal(matchLabel('How I make money with side hustles', ['making money with ai']), 'Making money with AI');
  assert.equal(reasonFor('Anthropic ships a new model', ['claude']), 'Because you picked Claude');
});

test('the first topic that matches is the reason, in the order the channel picked them', () => {
  const text = 'Claude agents that automate your inbox';
  assert.equal(matchLabel(text, ['automation', 'claude']), 'Automation');
  assert.equal(matchLabel(text, ['claude', 'automation']), 'Claude');
});

test('keywords with a space around them only match whole words', () => {
  assert.equal(matchLabel('Stop wasting ads budget', ['ai for small business']), 'AI for small business');
  assert.equal(matchLabel('Loads of dads', ['ai for small business']), null, '" ads " is a word, not the end of "dads"');
  assert.equal(matchLabel('Workshop tips', ['ai for small business']), null, '" shop" starts a word');
});

test('a topic without a keyword list matches on its own longer words, in any alphabet', () => {
  assert.equal(matchLabel('Learning Rust in a weekend', ['rust programming']), 'Rust programming');
  assert.equal(matchLabel('Cocina rápida para la semana', ['cocina rápida']), 'Cocina rápida');
  assert.equal(matchLabel('Anything about AI', ['ai']), null, 'words of three letters or fewer are too common to match on');
});

test('audiences match after topics, and the reason names the audience', () => {
  const text = 'A beginner guide to automatic backups';
  assert.equal(matchLabel(text, [], ['Complete beginners']), 'Complete beginners');
  assert.equal(matchLabel(text, ['claude'], ['Complete beginners']), 'Complete beginners', 'no topic matched, so the audience does');
  assert.equal(matchLabel('Claude for beginners', ['claude'], ['Complete beginners']), 'Claude', 'a topic wins over an audience');
  assert.equal(matchLabel('Open source tools for developers', [], ['Developers']), 'Developers');
  assert.equal(matchLabel('Study tips for students', [], ['Students']), 'Students');
});

test('nothing matches without topics or audience, or when the text is about something else', () => {
  assert.equal(matchLabel('Anything', [], []), null);
  assert.equal(matchLabel('', ['claude']), null);
  assert.equal(matchLabel('Cute cats compilation', ['claude'], ['Developers']), null);
  assert.equal(reasonFor('Cute cats compilation', ['claude']), null);
  assert.equal(matchLabel('Claude', ['', '  ']), null, 'blank topics are ignored');
});

test('what is searched: a video\'s title and channel, a post\'s text, author and flair', () => {
  assert.equal(trendText({ title: 'New tool', channel: 'Claude Daily' }), 'New tool Claude Daily');
  assert.equal(signalText({ text: 'Big news', author: 'r/ClaudeAI', flair: 'News' }), 'Big news r/ClaudeAI News');
  assert.equal(signalText({ text: 'Big news', author: 'x', flair: null }), 'Big news x ');
});
