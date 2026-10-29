import { parseJSONLoose } from './ai.js';

/*
 * A companion reply is markdown, then optionally the actions it offers as JSON between `<actions>` and `</actions>`.
 * While it streams, the person sees only the markdown: `ReplySplitter` holds back anything that could be the start of the tag.
 */

export const ACTIONS_OPEN = '<actions>';
export const ACTIONS_CLOSE = '</actions>';

/** The longest end of `text` that is the start of `tag`, so it is not shown before we know whether it is the tag. */
function heldTail(text: string, tag: string): number {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) if (tag.startsWith(text.slice(-length))) return length;
  return 0;
}

export class ReplySplitter {
  private held = '';
  private actions = '';
  private inActions = false;
  private seen: string[] = [];

  /** Takes the next piece of the reply and returns the text that can be shown now. */
  push(chunk: string): string {
    if (this.inActions) {
      this.actions += chunk;
      return '';
    }
    const text = this.held + chunk;
    const at = text.indexOf(ACTIONS_OPEN);
    if (at >= 0) {
      this.inActions = true;
      this.held = '';
      this.actions = text.slice(at + ACTIONS_OPEN.length);
      return text.slice(0, at);
    }
    const hold = heldTail(text, ACTIONS_OPEN);
    this.held = hold ? text.slice(-hold) : '';
    return hold ? text.slice(0, -hold) : text;
  }

  /** The reply ended: text held back was not the tag after all. */
  end(): string {
    const rest = this.inActions ? '' : this.held;
    this.held = '';
    return rest;
  }

  get writingActions() {
    return this.inActions;
  }

  /** Action types that have appeared in the actions so far and were not reported before, in order. */
  newActionTypes(): string[] {
    const found = [...this.actions.matchAll(/"type"\s*:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    const fresh = found.filter((type, index) => found.indexOf(type) === index && !this.seen.includes(type));
    this.seen.push(...fresh);
    return fresh;
  }
}

/** The finished reply: the markdown, and the actions as the model wrote them (not yet checked). */
export function parseReply(text: string): { reply: string; actions: unknown[] } {
  const at = text.indexOf(ACTIONS_OPEN);
  if (at < 0) return { reply: text.trim(), actions: [] };
  // A model that wraps the tag in a code fence leaves the opening fence behind the reply.
  const reply = text.slice(0, at).replace(/```[a-z]*\s*$/i, '').trim();
  const rest = text.slice(at + ACTIONS_OPEN.length);
  const close = rest.indexOf(ACTIONS_CLOSE);
  const body = close >= 0 ? rest.slice(0, close) : rest;
  const json = parseJSONLoose(body.replace(/^\s*```[a-z]*/i, '').replace(/```\s*$/, '')) ?? parseJSONLoose(`[${body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)}]`);
  const list = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray((json as { actions?: unknown }).actions) ? (json as { actions: unknown[] }).actions : [];
  return { reply, actions: list };
}

/** Splits text into small pieces for a runner that sends whole messages, so the reply still appears as it is written. */
export function chunkText(text: string, size = 24): string[] {
  const pieces: string[] = [];
  let at = 0;
  while (at < text.length) {
    let end = Math.min(text.length, at + size);
    const space = text.indexOf(' ', end);
    if (end < text.length && space >= 0 && space - end < 12) end = space + 1;
    pieces.push(text.slice(at, end));
    at = end;
  }
  return pieces;
}
