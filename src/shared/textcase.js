// Change the case of selected text. Every function keeps the text's length, one
// character for one, so formatting (bold, links, comments…) stays exactly in place.

const isWordChar = (c) => /[\p{L}\p{N}'’]/u.test(c);
const up = (c) => { const u = c.toUpperCase(); return u.length === 1 ? u : c; };
const low = (c) => { const l = c.toLowerCase(); return l.length === 1 ? l : c; };

export const CASES = [
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'lower', label: 'lowercase' },
  { id: 'capitalize', label: 'Capitalize Each Word' },
  { id: 'sentence', label: 'Sentence case' },
];

/** Change the case of a string: 'upper', 'lower', 'capitalize' or 'sentence'. */
export function changeCase(text, mode) {
  const chars = [...String(text)];
  if (mode === 'upper') return chars.map(up).join('');
  if (mode === 'lower') return chars.map(low).join('');
  if (mode === 'capitalize') {
    let prevWord = false;
    return chars.map((c) => {
      const w = isWordChar(c);
      // An apostrophe inside a word (don’t) doesn't start a new one.
      const out = w && !prevWord && !/['’]/.test(c) ? up(c) : w ? low(c) : c;
      prevWord = w;
      return out;
    }).join('');
  }
  if (mode === 'sentence') {
    let start = true;
    return chars.map((c) => {
      if (/[.!?]/.test(c)) { start = true; return c; }
      if (/\p{L}/u.test(c)) { const out = start ? up(c) : low(c); start = false; return out; }
      if (/\p{N}/u.test(c)) start = false;
      return c;
    }).join('');
  }
  return text;
}
