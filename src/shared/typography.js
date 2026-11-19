// Typography tools: straight ↔ curly ("smart") quotes, and one ↔ two spaces after
// punctuation. Works on one paragraph's text at a time; '￼' stands for anything
// that isn't plain text (a footnote, a citation, code), which is never changed.
// Returns edits [{ at, del, ins }] in the string, so the caller can map them onto
// its own positions and keep formatting.


const OPENS_BEFORE = /[\s([{—–/“‘-]/;
/** A sentence's end (. ! ? … and any closing quotes or brackets) and the spaces after it, before more text. */
const SENTENCE_GAP = /([.!?…]+["'”’)\]]*)([ \t ]+)(?=\S)/g;
const NEXT_SENTENCE = /^[\p{Lu}\d“"‘'(\[]/u;
// Words that end in a period without ending the sentence.
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'mx', 'dr', 'st', 'jr', 'sr', 'prof', 'rev', 'gen', 'col', 'capt', 'lt', 'sgt', 'gov', 'sen', 'rep', 'vs', 'etc', 'no', 'vol', 'pp', 'p', 'fig', 'ch', 'ed', 'eds', 'approx', 'dept', 'inc', 'ltd', 'co', 'corp', 'mt', 'ft', 'ave', 'blvd', 'rd', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
function isAbbreviation(s, at, end) {
  if (!end.startsWith('.') || /[!?…]/.test(end)) return false;
  const word = /([\p{L}.]+)$/u.exec(s.slice(Math.max(0, at - 20), at))?.[1] || '';
  if (!word) return false;
  if (/^(?:\p{L}\.)+\p{L}$/u.test(word)) return true; // e.g. i.e. U.S.
  if (/^\p{Lu}$/u.test(word)) return true; // an initial: J. R. R. Tolkien
  return ABBREVIATIONS.has(word.toLowerCase());
}

export function typoEdits(s, kind) {
  const out = [];
  if (kind === 'smart') {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== '"' && c !== "'") continue;
      const prev = i ? s[i - 1] : '', next = s[i + 1] || '';
      const opening = !prev || OPENS_BEFORE.test(prev);
      let ins;
      if (c === '"') ins = opening ? '“' : '”';
      // ’90s, rock ’n’ roll: an apostrophe, even at the start of a word.
      else if (opening && /\d/.test(next)) ins = '’';
      else ins = opening ? '‘' : '’';
      out.push({ at: i, del: 1, ins });
    }
  } else if (kind === 'straight') {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if ('“”„‟'.includes(c)) out.push({ at: i, del: 1, ins: '"' });
      else if ('‘’‚‛'.includes(c)) out.push({ at: i, del: 1, ins: "'" });
    }
  } else if (kind === 'onespace' || kind === 'twospace') {
    // Every sentence end gets exactly one or exactly two spaces, whatever was there
    // (one, three, tabs, non-breaking spaces). Abbreviations like "Mr." are left alone.
    const want = kind === 'twospace' ? '  ' : ' ';
    for (const m of s.matchAll(SENTENCE_GAP)) {
      const [, end, gap] = m;
      if (gap === want) continue;
      if (isAbbreviation(s, m.index, end)) continue;
      // Two spaces only between sentences (the next one starts with a capital, number, quote or bracket).
      if (kind === 'twospace' && !NEXT_SENTENCE.test(s.slice(m.index + m[0].length))) continue;
      if (kind === 'onespace' && gap.length < 2 && gap === ' ') continue;
      out.push({ at: m.index + end.length, del: gap.length, ins: want });
    }
  }
  return out;
}

/** Apply edits to a plain string (for tests and plain text). */
export function applyTypo(s, kind) {
  let out = s;
  for (const e of typoEdits(s, kind).sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.ins + out.slice(e.at + e.del);
  return out;
}
