/*
 * Reads JSON that is still being written: what has arrived so far becomes a value, with open strings, arrays and objects closed and a
 * key or item that has no value yet left out. Used to show a structured answer (the sketch) while the model writes it.
 */

/** `text` with its open string, arrays and objects closed. */
function closed(text: string): string {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') open.push('}');
    else if (char === '[') open.push(']');
    else if (char === '}' || char === ']') open.pop();
  }
  let body = text;
  if (inString) body = (escaped ? body.slice(0, -1) : body) + '"';
  return body.replace(/[\s,:]+$/, '') + open.reverse().join('');
}

/** The value written so far, or undefined while there is nothing readable yet. */
export function parsePartialJSON(text: string): unknown {
  let rest = text.trim();
  // Each try that fails cuts back to the last place a value could end, until what is left reads.
  for (let tries = 0; rest && tries < 200; tries++) {
    try {
      return JSON.parse(closed(rest));
    } catch {
      const cut = Math.max(rest.lastIndexOf(','), rest.lastIndexOf('{'), rest.lastIndexOf('['));
      if (cut < 0) return undefined;
      rest = rest[cut] === ',' ? rest.slice(0, cut) : rest.slice(0, cut + 1);
    }
  }
  return undefined;
}
