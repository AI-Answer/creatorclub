/*
 * Which videos and posts are about what a channel picked. Ported from the prototype's topicMatch (docs/prototype/core.js):
 * a topic matches when its keywords appear in the text, and the first matching topic is the reason.
 * Audiences work the same way, after topics. The keyword lists are data for the topics and audiences Welcome offers;
 * any other topic or audience matches on its own longer words.
 */

import { AUDIENCE_LABELS, TOPIC_LABELS } from '../../shared/club.js';

export { AUDIENCE_LABELS, TOPIC_LABELS };

const TOPIC_KEYS: Record<string, string[]> = {
  claude: ['claude', 'anthropic', 'cowork', 'duet'],
  'ai agents': ['agent', 'hermes', 'autopilot'],
  'vibe coding': ['vibe cod', 'coding', 'claude code', 'cursor', 'developer', 'website'],
  'ai for small business': ['business', 'client', 'customer', 'sales', ' ads ', 'marketing', ' shop', 'shopify', ' store', 'restaurant', 'pizzeria', 'e-commerce', 'ecommerce'],
  automation: ['automat', 'workflow', 'autopilot', 'n8n', 'zapier'],
  chatgpt: ['chatgpt', 'gpt', 'openai', 'codex'],
  'ai video': ['video', 'higgsfield', 'seedance', 'veo', 'animation', 'film', 'stickman'],
  'making money with ai': ['money', 'earn', 'side hustle', 'millionaire', 'income'],
  productivity: ['productiv', 'task', 'email', 'inbox', 'notes', 'deck', 'tutor'],
};

const AUDIENCE_KEYS: Record<string, string[]> = {
  'complete beginners': ['beginner', 'newbie', 'from scratch', 'for dummies', 'non-technical', 'no experience', 'first time'],
  'small-business owners': ['small business', 'business owner', 'entrepreneur', 'founder', 'solopreneur', 'agency', 'freelanc'],
  creators: ['creator', 'youtuber', 'influencer', 'content creation'],
  developers: ['developer', 'programmer', 'software engineer', 'github', 'open source', 'open-source', ' api '],
  students: ['student', 'college', 'university', 'homework', 'exam'],
};

const sentence = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const label = (value: string, known: readonly string[]) => known.find((item) => item.toLowerCase() === value.toLowerCase()) ?? sentence(value);
/** A keyword counts only at the start of a word, so "code" is not found in "decode" and "gpt" is not found inside another word. */
const found = (haystack: string, key: string) => new RegExp(`(?<![\\p{L}\\p{N}])${key.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(haystack);
const words = (value: string) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3);

/** The first topic, then the first audience, whose keywords appear in the text. Null when none does. */
export function matchLabel(text: string, topics: string[] = [], audience: string[] = []): string | null {
  const haystack = ` ${String(text || '').toLowerCase()} `;
  const tries: [string, Record<string, string[]>, readonly string[]][] = [
    ...topics.map((topic): [string, Record<string, string[]>, readonly string[]] => [topic, TOPIC_KEYS, TOPIC_LABELS]),
    ...audience.map((item): [string, Record<string, string[]>, readonly string[]] => [item, AUDIENCE_KEYS, AUDIENCE_LABELS]),
  ];
  for (const [value, keys, labels] of tries) {
    const name = String(value).trim();
    if (!name) continue;
    if ((keys[name.toLowerCase()] ?? words(name)).some((key) => found(haystack, key))) return label(name, labels);
  }
  return null;
}

/** "Because you picked Claude", or null. */
export const reasonFor = (text: string, topics?: string[], audience?: string[]): string | null => {
  const matched = matchLabel(text, topics, audience);
  return matched ? `Because you picked ${matched}` : null;
};

export const trendText = (item: { title: string; channel: string }) => `${item.title} ${item.channel}`;
export const signalText = (item: { text: string; author: string; flair?: string | null }) => `${item.text} ${item.author} ${item.flair ?? ''}`;
