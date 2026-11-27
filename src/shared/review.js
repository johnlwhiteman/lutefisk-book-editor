// Review mode: proofreader's marks on the manuscript, for the author or anyone
// reviewing it. Marks show only in the editor; every export and preview leaves
// them out, and the text stays exactly as written until a mark is accepted.
//
// In the chapter Markdown a mark is one of:
//   {%%marked text%%}{%r-id:type%}   a mark on a stretch of text (delete, cap, ital, …)
//   {%r-id:type%}                    a mark at a point (insert, ¶, comma, …)
// Who made it, the text to insert and any note live in lutefisk.yaml under
// review.marks[id]; book.review.guide is the style guide chosen for the book.

/** The inks a mark can be written in (light and dark-mode shades). Red is the default. */
export const INKS = {
  red: { label: 'Red', light: '#c0262d', dark: '#ff7d72' },
  blue: { label: 'Blue', light: '#1d4fb8', dark: '#93b3ff' },
  green: { label: 'Green', light: '#1e7a3c', dark: '#6fd08c' },
  purple: { label: 'Purple', light: '#6b2fa3', dark: '#c49bff' },
};
export const DEFAULT_INK = 'red';

/** The style guides a review can follow. The marks are the standard ones; each guide adds its own rules. */
export const GUIDES = {
  cmos: { id: 'cmos', name: 'The Chicago Manual of Style', short: 'Chicago' },
  ap: { id: 'ap', name: 'AP Stylebook', short: 'AP' },
  apa: { id: 'apa', name: 'APA Style', short: 'APA' },
};
export const DEFAULT_GUIDE = 'cmos';
export const guideOf = (book) => (GUIDES[book?.review?.guide] ? book.review.guide : DEFAULT_GUIDE);

/*
 * A mark:
 *   id     short name, saved in the Markdown
 *   label  what the menu says
 *   abbr   what a proofreader writes in the margin; shown beside the text in the editor
 *   at     'range' — on the selected text (or the word at the cursor); 'point' — at the cursor
 *   apply  what Accept does: delete · replace · insert · wrap · upper · lower · italic · bold ·
 *          roman · closeup · transpose · split · join — or nothing (fix it by hand, then Resolve)
 *   text   the text it inserts or uses (a function of the guide when it differs)
 *   ask    asks for text when the mark is made: 'text' (to insert or use) or 'note' (a question)
 *   group  menu section
 */
const EM = (g) => (g === 'ap' ? ' — ' : '—');
export const MARKS = [
  // Change the words
  { id: 'del', label: 'Delete', abbr: 'del', at: 'range', apply: 'delete', group: 'edit' },
  { id: 'ins', label: 'Insert Text…', abbr: '‸', at: 'point', apply: 'insert', ask: 'text', group: 'edit' },
  { id: 'rep', label: 'Replace With…', abbr: '→', at: 'range', apply: 'replace', ask: 'text', group: 'edit' },
  { id: 'tr', label: 'Transpose', abbr: 'tr', at: 'range', apply: 'transpose', group: 'edit' },
  { id: 'stet', label: 'Let It Stand (stet)', abbr: 'stet', at: 'range', apply: null, group: 'edit' },
  { id: 'sp', label: 'Spell Out', abbr: 'sp', at: 'range', apply: null, group: 'edit' },
  // Punctuation
  { id: 'comma', label: 'Insert Comma', abbr: '‸,', at: 'point', apply: 'insert', text: ',', group: 'punct' },
  { id: 'period', label: 'Insert Period', abbr: '⊙', at: 'point', apply: 'insert', text: '.', group: 'punct' },
  { id: 'apos', label: 'Insert Apostrophe', abbr: '’', at: 'point', apply: 'insert', text: '’', group: 'punct' },
  { id: 'quotes', label: 'Add Quotation Marks', abbr: '“ ”', at: 'range', apply: 'wrap', text: ['“', '”'], group: 'punct' },
  { id: 'semi', label: 'Insert Semicolon', abbr: '‸;', at: 'point', apply: 'insert', text: ';', group: 'punct' },
  { id: 'colon', label: 'Insert Colon', abbr: '‸:', at: 'point', apply: 'insert', text: ':', group: 'punct' },
  { id: 'hyph', label: 'Insert Hyphen', abbr: '=', at: 'point', apply: 'insert', text: '-', group: 'punct' },
  { id: 'en', label: 'Insert En Dash', abbr: '1/N', at: 'point', apply: 'insert', text: '–', group: 'punct' },
  { id: 'em', label: 'Insert Em Dash', abbr: '1/M', at: 'point', apply: 'insert', text: EM, group: 'punct' },
  { id: 'paren', label: 'Add Parentheses', abbr: '( )', at: 'range', apply: 'wrap', text: ['(', ')'], group: 'punct' },
  // Space and paragraphs
  { id: 'space', label: 'Insert Space', abbr: '#', at: 'point', apply: 'insert', text: ' ', group: 'space' },
  { id: 'close', label: 'Close Up', abbr: '⁀', at: 'range', apply: 'closeup', group: 'space' },
  { id: 'para', label: 'New Paragraph', abbr: '¶', at: 'point', apply: 'split', group: 'space' },
  { id: 'runin', label: 'Run In (no ¶)', abbr: 'no ¶', at: 'point', apply: 'join', group: 'space' },
  { id: 'left', label: 'Move Left', abbr: '[', at: 'range', apply: null, group: 'space' },
  { id: 'right', label: 'Move Right', abbr: ']', at: 'range', apply: null, group: 'space' },
  { id: 'center', label: 'Center', abbr: '][', at: 'range', apply: null, group: 'space' },
  // Type
  { id: 'cap', label: 'Capitalize', abbr: 'cap', at: 'range', apply: 'upper', group: 'type' },
  { id: 'lc', label: 'Lowercase', abbr: 'lc', at: 'range', apply: 'lower', group: 'type' },
  { id: 'sc', label: 'Small Capitals', abbr: 'sc', at: 'range', apply: null, group: 'type' },
  { id: 'ital', label: 'Italic', abbr: 'ital', at: 'range', apply: 'italic', group: 'type' },
  { id: 'bf', label: 'Boldface', abbr: 'bf', at: 'range', apply: 'bold', group: 'type' },
  { id: 'rom', label: 'Roman (not italic or bold)', abbr: 'rom', at: 'range', apply: 'roman', group: 'type' },
  { id: 'wf', label: 'Wrong Font', abbr: 'wf', at: 'range', apply: null, group: 'type' },
  // Ask
  { id: 'query', label: 'Query to Author…', abbr: '?', at: 'range', apply: null, ask: 'note', group: 'query' },
];
export const MARK_GROUPS = [['edit', 'Change the words'], ['punct', 'Punctuation'], ['space', 'Space and paragraphs'], ['type', 'Type'], ['query', 'Ask']];

/** Each guide's own rules: marks that carry the guide's reason, so the author knows why. */
export const GUIDE_RULES = {
  cmos: [
    { id: 'cmos-serial', label: 'Add Serial Comma', abbr: '‸,', at: 'point', apply: 'insert', text: ',', note: 'Chicago uses the serial (Oxford) comma before the conjunction in a series of three or more.' },
    { id: 'cmos-num', label: 'Spell Out Number', abbr: 'sp', at: 'range', apply: null, note: 'Chicago spells out whole numbers from zero through one hundred, and round multiples of them, in ordinary prose.' },
    { id: 'cmos-pct', label: 'Use “percent”', abbr: '→ percent', at: 'range', apply: 'replace', text: ' percent', note: 'In general prose Chicago pairs a numeral with the word percent (45 percent); the % sign is for scientific and statistical copy.' },
    { id: 'cmos-em', label: 'Close Up Em Dash', abbr: '—', at: 'range', apply: 'replace', text: '—', note: 'Chicago sets the em dash with no space on either side.' },
    { id: 'cmos-title', label: 'Italicize Title', abbr: 'ital', at: 'range', apply: 'italic', note: 'Chicago italicizes the titles of books, periodicals, films and other long works; shorter works go in quotation marks.' },
    { id: 'cmos-ell', label: 'Spaced Ellipsis', abbr: '. . .', at: 'range', apply: 'replace', text: '. . .', note: 'Chicago’s ellipsis is three spaced periods, kept together on one line.' },
  ],
  ap: [
    { id: 'ap-serial', label: 'Remove Serial Comma', abbr: 'del ,', at: 'range', apply: 'delete', note: 'AP leaves out the comma before the conjunction in a simple series, unless it’s needed to avoid confusion.' },
    { id: 'ap-num', label: 'Spell Out Number (one to nine)', abbr: 'sp', at: 'range', apply: null, note: 'AP spells out one through nine and uses figures for 10 and above, with exceptions such as ages and percentages.' },
    { id: 'ap-fig', label: 'Use Figures (10 and up)', abbr: 'fig', at: 'range', apply: null, note: 'AP uses figures for 10 and above.' },
    { id: 'ap-pct', label: 'Use % Sign', abbr: '→ %', at: 'range', apply: 'replace', text: '%', note: 'AP uses the % sign with figures (5%).' },
    { id: 'ap-em', label: 'Space the Em Dash', abbr: '# — #', at: 'range', apply: 'replace', text: ' — ', note: 'AP puts a space on both sides of an em dash.' },
    { id: 'ap-title', label: 'Title in Quotation Marks', abbr: '“ ”', at: 'range', apply: 'wrap', text: ['“', '”'], note: 'AP puts the titles of books, films, songs and other works in quotation marks rather than italics.' },
    { id: 'ap-state', label: 'Spell Out State Name', abbr: 'sp', at: 'range', apply: null, note: 'In body text AP spells out the names of U.S. states.' },
    { id: 'ap-month', label: 'Abbreviate Month', abbr: 'abbr', at: 'range', apply: null, note: 'With a specific date AP abbreviates Jan., Feb., Aug., Sept., Oct., Nov. and Dec.; March through July are spelled out.' },
  ],
  apa: [
    { id: 'apa-serial', label: 'Add Serial Comma', abbr: '‸,', at: 'point', apply: 'insert', text: ',', note: 'APA uses a serial comma before the final item in a series of three or more.' },
    { id: 'apa-num', label: 'Spell Out Number (zero to nine)', abbr: 'sp', at: 'range', apply: null, note: 'APA uses words for numbers below 10 and numerals for 10 and above, with exceptions such as measurements and percentages.' },
    { id: 'apa-fig', label: 'Use Numerals (10 and up)', abbr: 'fig', at: 'range', apply: null, note: 'APA uses numerals for 10 and above.' },
    { id: 'apa-pct', label: 'Use % Sign', abbr: '→ %', at: 'range', apply: 'replace', text: '%', note: 'APA uses the % symbol after a numeral (25%), and the word percent after a number written as a word.' },
    { id: 'apa-em', label: 'Close Up Em Dash', abbr: '—', at: 'range', apply: 'replace', text: '—', note: 'APA uses em dashes with no space before or after.' },
    { id: 'apa-title', label: 'Italicize Title', abbr: 'ital', at: 'range', apply: 'italic', note: 'APA italicizes the titles of books, reports, journals and other stand-alone works.' },
    { id: 'apa-abbr', label: 'Define Abbreviation', abbr: 'def', at: 'range', apply: null, note: 'APA spells out an abbreviation the first time it’s used, with the abbreviation after it in parentheses.' },
    { id: 'apa-bias', label: 'Bias-Free Language', abbr: '?', at: 'range', apply: null, note: 'APA asks for specific, respectful wording when writing about people and groups.' },
  ],
};

const BY_ID = new Map([...MARKS, ...Object.values(GUIDE_RULES).flat()].map((m) => [m.id, m]));
/** A mark by its type name (an unknown type still shows, as a query). */
export const markType = (type) => BY_ID.get(type) || { id: type, label: 'Proofreader’s mark', abbr: '?', at: 'range', apply: null };
/** The text a mark inserts or uses, for the guide (what the reviewer typed comes first). */
export function markText(def, guide, rec) {
  if (rec?.text != null && rec.text !== '') return rec.text;
  return typeof def.text === 'function' ? def.text(guide) : def.text;
}
/** Can Accept make the change itself? (Otherwise you fix it by hand and press Resolve.) */
export const canApply = (def, rec, guide) => !!def.apply && (!['insert', 'replace'].includes(def.apply) || markText(def, guide, rec) != null);

export const ID_RE = 'r-[A-Za-z0-9_-]{1,40}';
const TYPE_RE = '[a-z0-9-]{1,32}';
/** A mark on a range: group 1 the marked text, 2 the id, 3 the type. */
export const REVIEW_RANGE_RE = new RegExp(`\\{%%([\\s\\S]*?)%%\\}\\{%(${ID_RE}):(${TYPE_RE})%\\}`, 'g');
/** A mark's closing tag (on a range) — for finding where its text ends. */
export const REVIEW_CLOSE_RE = new RegExp(`%%\\}\\{%(${ID_RE}):(${TYPE_RE})%\\}`);
/** A mark at a point — or the closing half of a range mark (match ranges first). */
export const REVIEW_POINT_RE = new RegExp(`\\{%(${ID_RE}):(${TYPE_RE})%\\}`, 'g');
export const REVIEW_POINT_AT = new RegExp(`^\\{%(${ID_RE}):(${TYPE_RE})%\\}`);

/** The text without any proofreader's marks: marked text kept as written, point marks gone. */
export function stripReview(src) {
  let s = String(src || '');
  // Ranges can hold point marks (and in rare cases each other), so repeat until none are left.
  for (let i = 0; i < 8 && s.includes('{%%'); i++) {
    const next = s.replace(REVIEW_RANGE_RE, '$1');
    if (next === s) break;
    s = next;
  }
  return s.replace(REVIEW_POINT_RE, '');
}

/** The marks in a chapter's Markdown, once each, in order: [{ id, type }]. */
export function reviewMarksIn(src) {
  const seen = new Map();
  for (const m of String(src || '').matchAll(REVIEW_POINT_RE)) if (!seen.has(m[1])) seen.set(m[1], { id: m[1], type: m[2] });
  return [...seen.values()];
}

export const newReviewId = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Resolved marks kept with the book (newest first), so there's a record of the review. */
export const KEEP_RESOLVED = 500;
export function pruneResolved(marks) {
  const done = Object.entries(marks || {}).filter(([, r]) => r?.resolved).sort((a, b) => String(b[1].resolved.at || '').localeCompare(String(a[1].resolved.at || '')));
  for (const [id] of done.slice(KEEP_RESOLVED)) delete marks[id];
}
