// Book Audit: a read-through of the whole book for things that could be wrong
// before it goes out — missing titles, authors and covers, an empty or missing
// copyright page, starter text left in place, empty chapters, images without
// descriptions, notes-to-self like TK and TODO, and possible spelling and grammar
// problems in every chapter (checked on this computer by Harper).
//
// Nothing here changes the book. Each finding says what's wrong, why it
// matters, and has a button that goes to the place to fix it.
import { h, icon, confirmDialog } from './ui.js';
import { SECTION_TYPES, DEFAULT_CONTENT, numberSections, chapterHeadingMode } from '../shared/sections.js';
import { joinScenes, proseText } from '../shared/scenes.js';
import { templateById } from '../shared/templates.js';
import { mentionRegex } from '../shared/characters.js';
import { suggestNames } from './characters.js';

const SEVERITY = {
  error: { label: 'Problem — will show wrong in the book', icon: 'warn' },
  warn: { label: 'Worth checking before you publish', icon: 'warn' },
  info: { label: 'Suggestion — optional, nice to have', icon: 'lightbulb' },
};
// The note on each finding: a real issue, or only a suggestion.
const TAG = { error: 'Problem', warn: 'Check', info: 'Suggestion' };
/** Findings you chose to ignore, kept with the book (book.auditIgnores: finding ids). */
export const auditIgnored = (book) => new Set(Array.isArray(book?.auditIgnores) ? book.auditIgnores : []);
const GROUP_ORDER = [
  ['details', 'Book details', 'book'],
  ['covers', 'Covers', 'cover'],
  ['front', 'Front and back matter', 'doc'],
  ['chapters', 'Chapters', 'toc'],
  ['characters', 'Characters', 'people'],
  ['text', 'In the text', 'pen'],
  ['comments', 'Open comments', 'comment'],
  ['proof', 'Spelling and grammar', 'spellAbc'],
];

const countWords = (t) => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const clip = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ISBN-10 or ISBN-13 with a correct check digit (hyphens and spaces ignored). */
export function isbnValid(raw) {
  const s = String(raw || '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((n, d, i) => n + Number(d) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((n, d, i) => n + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

/**
 * The quick checks — everything but spelling and grammar. Pure: only the book and its texts.
 * ctx: { book, contents }. Returns { findings: [...], passed: [...] }.
 * A finding: { id, group, sev, title, detail, where?: { kind, id?, tab?, focus?, type? } }.
 */
export function auditBook({ book, contents }) {
  const findings = [];
  const passed = [];
  const add = (f) => findings.push(f);
  const ok = (group, title) => passed.push({ group, title });
  const tpl = templateById(book.template);
  const numbered = numberSections(book.sections || [], tpl, book);
  const textOf = (s) => (Array.isArray(s.scenes) && s.scenes.length ? joinScenes(s.scenes, contents, { all: true }) : contents[s.id]) || '';
  const sectionName = (s) => (s.type === 'chapter' ? (s.displayTitle ? `${s.label ? `${s.label}: ` : ''}${s.displayTitle}` : s.label || 'Untitled chapter') : s.tocTitle || s.displayTitle || SECTION_TYPES[s.type]?.label || 'Section');
  const settings = (tab = 'general', focus) => ({ kind: 'settings', tab, focus });

  /* ---- book details */
  const title = String(book.title || '').trim();
  if (!title || /^untitled( book)?$/i.test(title)) add({ id: 'title', group: 'details', sev: 'error', title: 'The book has no title', detail: 'It’s on the cover, the title page, every e-book store listing and the running heads.', where: settings() });
  else ok('details', 'Title');
  const authors = (Array.isArray(book.authors) ? book.authors : [book.author]).map((a) => String(a || '').trim()).filter(Boolean);
  if (!authors.length) add({ id: 'author', group: 'details', sev: 'error', title: 'No author', detail: 'The title page, copyright line, cover and e-book metadata need at least one author.', where: settings() });
  else ok('details', authors.length === 1 ? 'Author' : 'Authors');
  if (!String(book.description || '').trim()) add({ id: 'description', group: 'details', sev: 'warn', title: 'No description', detail: 'Stores show it on the book’s page, and it’s used on the generated back cover.', where: settings() });
  else ok('details', 'Description');
  if (book.isbn && !isbnValid(book.isbn)) add({ id: 'isbn', group: 'details', sev: 'error', title: 'The ISBN doesn’t look right', detail: `“${book.isbn}” isn’t a valid ISBN-10 or ISBN-13 — check for a mistyped digit.`, where: settings() });
  else if (!book.isbn) add({ id: 'isbn', group: 'details', sev: 'info', title: 'No ISBN', detail: 'Optional — many stores assign their own. Add one if you have it; it goes on the copyright page and in the e-book.', where: settings() });
  else ok('details', 'ISBN');
  if (!String(book.publisher || '').trim()) add({ id: 'publisher', group: 'details', sev: 'info', title: 'No publisher or imprint', detail: 'Optional. Self-publishing? Your own name or an imprint name works.', where: settings() });
  if (!book.year) add({ id: 'year', group: 'details', sev: 'warn', title: 'No publication year', detail: 'Used in the copyright line.', where: settings() });
  if (!book.genre) add({ id: 'genre', group: 'details', sev: 'info', title: 'No genre', detail: 'Written into the e-book as its subject, so stores and libraries can shelve it.', where: settings() });
  if (!(book.keywords || []).length) add({ id: 'keywords', group: 'details', sev: 'info', title: 'No keywords', detail: 'Help readers find the book in store searches.', where: settings() });

  /* ---- covers */
  if (!book.cover) add({ id: 'cover', group: 'covers', sev: 'warn', title: 'No front cover image', detail: 'The preview shows a plain cover made from the title and author. E-book stores and printers need a real cover image (1600 × 2560 px or larger).', where: settings('cover', 'cover') });
  else ok('covers', 'Front cover');
  if (!book.backCover && !String(book.description || '').trim()) add({ id: 'backCover', group: 'covers', sev: 'warn', title: 'Back cover not set', detail: 'Add a back-cover image, or a description to print on it.', where: settings('cover', 'backCover') });
  else if (!book.backCover) add({ id: 'backCover', group: 'covers', sev: 'info', title: 'No back cover image', detail: 'The back cover is made from the description. Add an image for a designed back cover.', where: settings('cover', 'backCover') });
  else ok('covers', 'Back cover');
  for (const key of ['cover', 'backCover']) {
    if (book[key] && !String(book.coverLayout?.[key]?.alt || '').trim()) add({ id: `${key}-alt`, group: 'covers', sev: 'info', title: `${key === 'cover' ? 'Front' : 'Back'} cover has no alt text`, detail: 'Screen readers fall back to the title and author. A short description of the picture is better.', where: settings('cover', key) });
  }

  /* ---- front and back matter */
  const sec = (type) => (book.sections || []).find((s) => s.type === type);
  const on = (type) => { const s = sec(type); return s && s.enabled !== false ? s : null; };
  if (!on('title-page')) add({ id: 'title-page', group: 'front', sev: 'warn', title: 'No title page', detail: 'Most books open with one; it’s made for you from the title, subtitle, author and publisher.', where: { kind: 'enable', type: 'title-page' } });
  else ok('front', 'Title page');
  const cp = on('copyright');
  if (!cp) add({ id: 'copyright', group: 'front', sev: 'error', title: 'No copyright page', detail: 'It states who owns the book and when it was published. Add one from Front Matter.', where: { kind: 'enable', type: 'copyright' } });
  else {
    const t = String(contents[cp.id] || '').trim();
    if (!t) add({ id: 'copyright-empty', group: 'front', sev: 'error', title: 'The copyright page is empty', detail: 'Add a copyright line, for example “Copyright © 2026 by Your Name. All rights reserved.”', where: { kind: 'section', id: cp.id } });
    else if (!/copyright|©|\(c\)/i.test(t)) add({ id: 'copyright-line', group: 'front', sev: 'warn', title: 'No copyright line', detail: 'The copyright page doesn’t say “Copyright” or ©.', where: { kind: 'section', id: cp.id } });
    else if (/\{\{author\}\}/.test(t) && !authors.length) add({ id: 'copyright-author', group: 'front', sev: 'error', title: 'The copyright line has no author', detail: 'It will read “by The Author” until the book has an author.', where: settings() });
    else ok('front', 'Copyright page');
  }
  // Starter text left in place.
  for (const s of book.sections || []) {
    if (s.enabled === false || !DEFAULT_CONTENT[s.type] || s.type === 'copyright') continue;
    const t = String(contents[s.id] || '').trim();
    if (t && t === DEFAULT_CONTENT[s.type].trim()) add({ id: `starter-${s.id}`, group: 'front', sev: 'warn', title: `${SECTION_TYPES[s.type].label} still has the starter text`, detail: `“${clip(proseText(t).replace(/\{\{(\w+)\}\}/g, (_, k) => (k === 'author' ? authors.join(' and ') || 'The Author' : String(book[k] || ''))), 70)}” — replace it with your own, or remove the section.`, where: { kind: 'section', id: s.id } });
  }
  if (!on('toc') && numbered.filter((s) => s.type === 'chapter').length > 2) add({ id: 'toc', group: 'front', sev: 'info', title: 'No table of contents', detail: 'E-readers build their own, but a Contents page helps print readers.', where: { kind: 'enable', type: 'toc' } });
  if (!on('about-author')) add({ id: 'about-author', group: 'front', sev: 'info', title: 'No About the Author', detail: 'A short page about you, at the back of the book.', where: { kind: 'enable', type: 'about-author' } });

  /* ---- chapters and other sections */
  const chapters = numbered.filter((s) => s.type === 'chapter' && !s.exclude);
  if (!chapters.length) add({ id: 'no-chapters', group: 'chapters', sev: 'error', title: 'The book has no chapters', where: { kind: 'add-chapter' } });
  const mode = chapterHeadingMode(book, tpl);
  const untitled = chapters.filter((s) => !String(s.title || '').trim());
  if (untitled.length && mode !== 'number') {
    if (mode === 'title') for (const s of untitled) add({ id: `untitled-${s.id}`, group: 'chapters', sev: 'error', title: `${s.label || 'A chapter'} has no title`, detail: 'This book shows chapter titles without numbers, so this chapter’s heading is blank.', where: { kind: 'section', id: s.id, focusTitle: true } });
    else if (untitled.length < chapters.length) for (const s of untitled) add({ id: `untitled-${s.id}`, group: 'chapters', sev: 'warn', title: `${s.label || 'A chapter'} has no title`, detail: 'Other chapters have titles, so this one shows only its number.', where: { kind: 'section', id: s.id, focusTitle: true } });
    else if (chapters.length > 1) add({ id: 'untitled-all', group: 'chapters', sev: 'info', title: 'No chapter has a title', detail: 'Fine if you want numbers only — headings show “Chapter One” and so on.', where: { kind: 'section', id: untitled[0].id, focusTitle: true } });
  } else if (chapters.length) ok('chapters', 'Chapter titles');
  // Two chapters with the same title.
  const seen = new Map();
  for (const s of chapters) {
    const k = String(s.title || '').trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) add({ id: `dup-${s.id}`, group: 'chapters', sev: 'warn', title: `Two chapters are called “${s.title.trim()}”`, detail: `${seen.get(k).label} and ${s.label}.`, where: { kind: 'section', id: s.id, focusTitle: true } });
    else seen.set(k, s);
  }
  let emptyCount = 0;
  for (const s of numbered) {
    if (SECTION_TYPES[s.type]?.generated || s.exclude) continue;
    const words = countWords(proseText(textOf(s)));
    if (!words && !/!\[/.test(textOf(s))) { emptyCount++; add({ id: `empty-${s.id}`, group: 'chapters', sev: s.type === 'chapter' ? 'error' : 'warn', title: `${clip(sectionName(s), 48)} is empty`, detail: 'It will appear in the book as a blank page. Write it, or remove it.', where: { kind: 'section', id: s.id } }); }
    // Empty scenes in a chapter that has text.
    else if (Array.isArray(s.scenes) && s.scenes.length > 1) {
      s.scenes.forEach((sc, i) => { if (!sc.exclude && !countWords(proseText(contents[sc.id]))) add({ id: `empty-${sc.id}`, group: 'chapters', sev: 'warn', title: `${clip(sectionName(s), 40)} — ${sc.title || `scene ${i + 1}`} is empty`, detail: 'An empty scene leaves an extra scene break in the book.', where: { kind: 'section', id: sc.id } }); });
    }
  }
  if (!emptyCount && numbered.length) ok('chapters', 'No empty sections');
  const excluded = (book.sections || []).filter((s) => s.type === 'chapter' && s.exclude);
  if (excluded.length) add({ id: 'excluded', group: 'chapters', sev: 'info', title: `${plural(excluded.length, 'chapter')} left out of the book`, detail: `Marked “Exclude from Book”: ${clip(excluded.map((s) => s.title || 'Untitled').join(', '), 90)}. They’re kept in the manuscript but not exported.`, where: { kind: 'section', id: excluded[0].id } });

  /* ---- in the text: notes to self, images without descriptions, open comments */
  const MARKER = /(?<![\p{L}\p{N}])(TK|TODO|FIXME|XXX|\[\?\]|\?\?\?)(?![\p{L}\p{N}])/gu;
  let markers = 0, noAlt = 0;
  const units = [];
  for (const s of numbered) {
    if (SECTION_TYPES[s.type]?.generated || s.exclude) continue;
    if (Array.isArray(s.scenes) && s.scenes.length) s.scenes.forEach((sc, i) => { if (!sc.exclude) units.push({ id: sc.id, name: `${clip(sectionName(s), 40)} — ${sc.title || `scene ${i + 1}`}`, md: contents[sc.id] || '' }); });
    else units.push({ id: s.id, name: sectionName(s), md: contents[s.id] || '' });
  }
  for (const u of units) {
    const prose = proseText(u.md);
    const m = prose.match(MARKER);
    if (m) { markers += m.length; add({ id: `tk-${u.id}`, group: 'text', sev: 'warn', title: `${clip(u.name, 48)}: ${plural(m.length, 'note')} to self`, detail: `Found ${[...new Set(m)].map((x) => `“${x}”`).join(', ')} — placeholders that shouldn’t reach readers.`, where: { kind: 'find', id: u.id, text: m[0] } }); }
    const imgs = [...u.md.matchAll(/!\[([^\]]*)\]\(/g)].filter((x) => !x[1].trim());
    if (imgs.length) { noAlt += imgs.length; add({ id: `alt-${u.id}`, group: 'text', sev: 'warn', title: `${clip(u.name, 48)}: ${plural(imgs.length, 'image')} without a description`, detail: 'Screen readers and e-book accessibility checks need alt text. Right-click the image › Description.', where: { kind: 'section', id: u.id } }); }
  }
  if (!markers) ok('text', 'No TK, TODO or ??? left in the text');
  if (!noAlt) ok('text', 'Every image has a description');
  // Open comments, each one: what it says, what it's on and where — to go to it, or close it.
  let openN = 0;
  for (const [cid, c] of Object.entries(book.comments || {})) {
    if (!c || c.resolved) continue;
    const u = units.find((x) => x.md.includes(`{>>#${cid}<<}`));
    if (!u) continue; // its text is gone
    openN++;
    const said = String(c.text || '').trim() || '(no note)';
    add({ id: `comment-${cid}`, group: 'comments', sev: 'info', title: clip(said.replace(/\s+/g, ' '), 90),
      detail: [c.quote ? `On “${clip(String(c.quote).replace(/\s+/g, ' '), 60)}”` : '', clip(u.name, 48), c.author ? `by ${c.author}` : '', (c.replies || []).length ? plural(c.replies.length, 'reply', 'replies') : ''].filter(Boolean).join(' · '),
      where: { kind: 'section', id: u.id }, closeComment: cid });
  }
  if (!openN) ok('comments', 'No open comments');

  /* ---- characters: everyone in your cast is found in the text, and the names that keep
     coming up in the text are in your cast */
  const cast = (Array.isArray(book.characters) ? book.characters : []).filter((c) => String(c?.name || '').trim());
  const bodyText = units.filter((u) => SECTION_TYPES[(book.sections || []).find((x) => x.id === u.id)?.type]?.group !== 'front').map((u) => proseText(u.md)).join('\n');
  const finders = cast.map((c) => ({ c, re: mentionRegex(c) })).filter((x) => x.re);
  let missing = 0;
  for (const { c, re } of finders) {
    re.lastIndex = 0;
    if (!re.test(bodyText)) { missing++; add({ id: `char-missing-${c.id}`, group: 'characters', sev: 'warn', title: `${clip(c.name.trim(), 40)} isn’t in the text`, detail: 'Their name (and nicknames) never comes up. Check the spelling, add a nickname they go by, or remove them.', where: { kind: 'character', id: c.id } }); }
  }
  if (cast.length && !missing) ok('characters', 'Every character appears in the text');
  // Names the text uses again and again that aren't one of your characters.
  const known = (name) => finders.some(({ re }) => { re.lastIndex = 0; return re.test(name); });
  const unmapped = suggestNames(bodyText, 30).filter((n) => !known(n)).filter((n) => {
    const m = bodyText.match(new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu'));
    return (m?.length || 0) >= 3;
  }).slice(0, 8);
  if (unmapped.length) add({ id: `char-unmapped-${unmapped.join('|').toLowerCase()}`, group: 'characters', sev: 'info', title: `${plural(unmapped.length, 'name')} in the text ${unmapped.length === 1 ? 'isn’t' : 'aren’t'} in Characters`, chips: unmapped,
    detail: 'They come up often. If they’re people in your story, add them so they’re marked in the text and tracked. (Places and other names are fine to ignore.)', where: { kind: 'characters' } });
  else if (bodyText.trim()) ok('characters', 'Every name that keeps coming up is one of your characters');

  return { findings, passed, units };
}

/** Problems and things to check (not suggestions or ignored ones): the number on the binder’s Audit row. */
export function auditCount(ctx) {
  try {
    const ign = auditIgnored(ctx.book);
    return auditBook(ctx).findings.filter((f) => f.sev !== 'info' && !ign.has(f.id)).length;
  } catch { return 0; }
}

/* Spelling and grammar results per chapter or scene text, so the binder's tally and the Audit
   window agree without checking unchanged text again. Cleared when the Audit checks afresh. */
const proofCache = new Map();
async function proofOf(ctx, text, fresh = false) {
  const key = `${ctx.dialect || ''}\u0000${text}`;
  if (!fresh && proofCache.has(key)) return proofCache.get(key);
  const probs = await ctx.proofList(text, ctx.dialect);
  if (proofCache.size > 800) proofCache.clear();
  proofCache.set(key, probs);
  return probs;
}
/** A chapter's or scene's spelling-and-grammar finding (one per unit with any), or null. */
function proofFinding(u, probs) {
  const spell = probs.filter((p) => p.cls === 'spell');
  const grammar = probs.filter((p) => p.cls === 'grammar');
  if (!spell.length && !grammar.length) return null;
  const words = [...new Set(spell.map((p) => p.problem))];
  const parts = [spell.length ? plural(spell.length, 'possible misspelling') : '', grammar.length ? plural(grammar.length, 'possible grammar problem') : ''].filter(Boolean);
  return { id: `proof-${u.id}`, group: 'proof', sev: 'warn', title: clip(u.name, 56), sub: parts.join(' · '),
    chips: words.slice(0, 8), more: Math.max(0, words.length - 8), spell: spell.length, grammar: grammar.length,
    detail: grammar.length ? `${clip(grammar[0].message, 90)}${grammar.length > 1 ? ` — and ${grammar.length - 1} more` : ''}` : '',
    where: { kind: 'proof', id: u.id } };
}
/** Count findings the same way as the Audit window's tabs (ignored ones left out). */
export function tallyFindings(findings, book) {
  const ign = auditIgnored(book);
  const live = findings.filter((f) => !ign.has(f.id));
  const errors = live.filter((f) => f.sev === 'error').length;
  const warns = live.filter((f) => f.sev === 'warn').length;
  // To Fix lists everything not ignored — real issues and suggestions alike, each tagged.
  return { errors, warns, infos: live.length - errors - warns, issues: errors + warns, toFix: live.length };
}
/**
 * The whole audit in the background, for the binder's Audit tooltip and color: exactly what
 * To Fix will show. ctx: { book, contents, proofList, dialect, alive?() } — alive() false stops it.
 * Yields between chapters so typing stays smooth.
 */
export async function auditTally(ctx) {
  const quick = auditBook(ctx);
  const findings = [...quick.findings];
  for (const u of quick.units) {
    if (ctx.alive && !ctx.alive()) return null;
    if (!u.md.trim()) continue;
    await new Promise((r) => ('requestIdleCallback' in globalThis ? requestIdleCallback(r, { timeout: 1000 }) : setTimeout(r, 0)));
    let probs = [];
    try { probs = await proofOf(ctx, proseText(u.md)); } catch { probs = []; }
    const f = proofFinding(u, probs);
    if (f) findings.push(f);
  }
  return tallyFindings(findings, ctx.book);
}

/**
 * The Audit window. ctx: { book, contents, sheet, go(where), proofList(text), dialect, markDirty, onChange }.
 * Opens with the quick checks; spelling and grammar follow, chapter by chapter.
 */
export function openAudit(ctx) {
  const book = ctx.book;
  let run = 0;
  let quick = { findings: [], passed: [], units: [] };
  let proof = { findings: [], passed: [], done: false, at: 0, of: 0 };
  let tab = 'open';
  const collapsed = new Set();

  const ignored = () => auditIgnored(book);
  function setIgnored(id, on) {
    const set = ignored();
    if (on) set.add(id); else set.delete(id);
    if (set.size) book.auditIgnores = [...set]; else delete book.auditIgnores;
    ctx.markDirty?.();
    draw();
    report();
  }
  // Tell the binder the same numbers To Fix shows (once spelling and grammar are in).
  function report() { if (proof.done) ctx.onTally?.(tallyFindings([...quick.findings, ...proof.findings], book)); }

  const summary = h('div', { class: 'au-summary', role: 'status', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'au-tabs', role: 'tablist', 'aria-label': 'Show' });
  const rerun = h('button', { type: 'button', class: 'au-rerun', title: 'Check the whole book again', onclick: () => start() }, icon('rotate', 14), h('span', {}, 'Check Again'));
  const list = h('div', { class: 'au-list', role: 'tabpanel' });
  const body = h('div', { class: 'audit' },
    h('div', { class: 'au-top' }, summary, rerun),
    tabs, list,
    h('p', { class: 'au-foot' }, icon('lock', 12), 'Checked on this computer. The audit never changes your book — each button takes you to the place to fix it.'));

  function start() {
    run++;
    quick = auditBook(ctx);
    proof = { findings: [], passed: [], done: false, at: 0, of: 0 };
    draw();
    proofread(run);
  }

  async function proofread(me) {
    const units = quick.units.filter((u) => u.md.trim());
    proof.of = units.length;
    let spellTotal = 0, grammarTotal = 0;
    for (const u of units) {
      if (me !== run || (!body.isConnected && proof.at)) return;
      let probs = null;
      // Check Again (and opening the window) looks afresh: words added to your dictionary since count.
      try { probs = await proofOf(ctx, proseText(u.md), true); } catch { probs = null; }
      if (me !== run) return;
      proof.at++;
      if (probs) {
        const f = proofFinding(u, probs);
        if (f) { proof.findings.push(f); spellTotal += f.spell; grammarTotal += f.grammar; }
      }
      if (proof.at % 3 === 0 || proof.at === units.length) draw();
    }
    if (me !== run) return;
    proof.done = true;
    if (!spellTotal) proof.passed.push({ group: 'proof', title: 'No possible misspellings' });
    if (!grammarTotal) proof.passed.push({ group: 'proof', title: 'No possible grammar problems' });
    draw();
    report();
  }

  function draw() {
    const ign = ignored();
    const all = [...quick.findings, ...proof.findings];
    const live = all.filter((f) => !ign.has(f.id));
    const gone = all.filter((f) => ign.has(f.id));
    const passed = [...quick.passed, ...proof.passed];
    const { errors, warns, infos, issues, toFix } = tallyFindings(all, book);

    // Summary: how the book stands, in a sentence. Suggestions alone don't stand in the way.
    const state = errors ? 'error' : warns ? 'warn' : 'ok';
    // The headline's number is the To Fix tab's; the line under it says how many are only suggestions.
    const headline = toFix ? `${toFix.toLocaleString()} to fix` : proof.done ? 'Ready to publish' : 'Looking good so far';
    const sub = toFix ? [errors ? plural(errors, 'problem') : '', warns ? `${warns.toLocaleString()} to check` : '', infos ? plural(infos, 'suggestion') : ''].filter(Boolean).join(' · ') + (!issues ? ' — nothing stands in the way of publishing' : '')
      : 'Every check passed.';
    summary.replaceChildren(
      h('span', { class: `au-state ${state}` }, icon(issues ? 'warn' : 'check', 20)),
      h('div', { class: 'au-sum-text' }, h('b', {}, headline), h('span', {}, sub),
        proof.done ? null : h('div', { class: 'au-prog' }, h('span', { class: 'au-prog-bar' }, h('i', { style: { width: `${proof.of ? Math.round((proof.at / proof.of) * 100) : 0}%` } })),
          h('small', {}, proof.of ? `Spelling and grammar: ${proof.at} of ${proof.of}` : 'Spelling and grammar…'))));

    // Tabs, each with its count.
    const T = [['open', 'To Fix', toFix], ['ignored', 'Ignored', gone.length], ['passed', 'Passed', passed.length]];
    tabs.replaceChildren(...T.map(([id, label, n]) => h('button', { type: 'button', role: 'tab', class: `au-tab${tab === id ? ' on' : ''}`, 'aria-selected': String(tab === id), onclick: () => { tab = id; draw(); } },
      h('span', {}, label), h('span', { class: `au-tab-n${id === 'open' && errors ? ' error' : ''}` }, String(n)))));

    const shown = tab === 'open' ? live : tab === 'ignored' ? gone : [];
    const rank = { error: 0, warn: 1, info: 2 };
    if (tab === 'passed') {
      list.replaceChildren(...GROUP_ORDER.map(([g, label, ic]) => {
        const items = passed.filter((p) => p.group === g);
        return items.length ? group(g, label, ic, items.map((p) => h('li', { class: 'au-item passed' }, h('span', { class: 'au-ic ok' }, icon('check', 13)), h('div', { class: 'au-txt' }, h('b', {}, p.title))))) : null;
      }).filter(Boolean));
      if (!passed.length) list.append(empty('check', 'Nothing has passed yet', 'Fix a finding and press Check Again.'));
      return;
    }
    const groups = GROUP_ORDER.map(([g, label, ic]) => {
      const items = shown.filter((f) => f.group === g).sort((a, b) => rank[a.sev] - rank[b.sev]);
      const busy = g === 'proof' && !proof.done && tab === 'open';
      if (!items.length && !busy) return null;
      // Open comments: Close All, after asking.
      const closable = g === 'comments' && tab === 'open' && ctx.closeComments ? items.filter((f) => f.closeComment).map((f) => f.closeComment) : [];
      const extra = busy ? h('span', { class: 'au-busy' }, 'Checking…')
        : closable.length > 1 ? h('span', { class: 'au-close-all', role: 'button', tabindex: '0', title: 'Close every open comment (asks first)', onclick: (e) => { e.stopPropagation(); askClose(closable); }, onkeydown: (e) => { if (e.key === 'Enter') { e.stopPropagation(); askClose(closable); } } }, 'Close All…') : null;
      return group(g, label, ic, items.map(row), extra);
    }).filter(Boolean);
    if (groups.length) list.replaceChildren(...groups);
    else if (tab === 'open') list.replaceChildren(empty('check', proof.done ? 'Nothing to fix' : 'Nothing to fix so far', proof.done ? 'Every check passed.' : 'Still checking spelling and grammar…'));
    else list.replaceChildren(empty('eyeOff', 'Nothing ignored', 'Ignore a finding you’ve decided is fine and it stays out of the count. It comes back here.'));
  }

  /** Close comments — after asking. */
  async function askClose(ids) {
    const one = ids.length === 1;
    const ok = await confirmDialog(one ? 'Close this comment?' : `Close all ${ids.length} open comments?`,
      one ? 'It’s marked resolved. You can reopen it from the comment margin (show resolved comments).' : 'They’re marked resolved. You can reopen any of them from the comment margin (show resolved comments).', one ? 'Close Comment' : 'Close All');
    if (!ok) return;
    ctx.closeComments(ids);
    start();
  }

  function group(g, label, ic, items, extra) {
    const shut = collapsed.has(g);
    return h('section', { class: `au-group${shut ? ' shut' : ''}` },
      h('button', { type: 'button', class: 'au-group-head', 'aria-expanded': String(!shut), onclick: () => { if (shut) collapsed.delete(g); else collapsed.add(g); draw(); } },
        h('span', { class: 'au-disc' }, icon('next', 11)), icon(ic, 15), h('span', { class: 'au-group-name' }, label),
        extra || null, items.length ? h('span', { class: 'au-n' }, String(items.length)) : null),
      shut || !items.length ? null : h('ul', {}, ...items));
  }

  function empty(ic, title, text) {
    return h('div', { class: 'au-empty' }, h('span', { class: 'au-empty-ic' }, icon(ic, 26)), h('b', {}, title), h('span', {}, text));
  }

  function row(f) {
    const isIgnored = ignored().has(f.id);
    const label = f.where ? ({ settings: f.where.tab === 'cover' ? 'Open Covers' : 'Open Details', enable: 'Add', section: 'Go to It', find: 'Show Me', proof: 'Review', comments: 'Show', 'add-chapter': 'Add Chapter', character: 'Open', characters: 'Open Characters' }[f.where.kind] || 'Go') : null;
    return h('li', { class: `au-item ${f.sev}${isIgnored ? ' ignored' : ''}` },
      h('span', { class: `au-ic ${f.sev}`, title: SEVERITY[f.sev].label }, icon(SEVERITY[f.sev].icon, 13)),
      h('div', { class: 'au-txt' },
        h('div', { class: 'au-title' }, h('b', {}, f.title), h('span', { class: `au-tag ${f.sev}`, title: SEVERITY[f.sev].label }, TAG[f.sev])),
        f.sub ? h('span', { class: 'au-sub' }, f.sub) : null,
        f.chips?.length ? h('div', { class: 'au-chips' }, ...f.chips.map((w) => h('span', { class: `au-chip${f.group === 'characters' ? ' name' : ''}` }, w)), f.more ? h('span', { class: 'au-chip more' }, `+${f.more}`) : null) : null,
        f.detail ? h('small', {}, f.detail) : null),
      h('div', { class: 'au-acts' },
        isIgnored
          ? h('button', { type: 'button', class: 'au-act', title: 'Count this again', onclick: () => setIgnored(f.id, false) }, icon('eye', 13), 'Restore')
          : h('button', { type: 'button', class: 'au-act au-ignore', title: 'Ignore — it’s fine as it is. It moves to Ignored and stays out of the count.', onclick: () => setIgnored(f.id, true) }, icon('eyeOff', 13), 'Ignore'),
        f.closeComment && !isIgnored && ctx.closeComments ? h('button', { type: 'button', class: 'au-act au-close', title: 'Close this comment (you can reopen it in the comment margin)', onclick: () => askClose([f.closeComment]) }, icon('check', 13), 'Close') : null,
        label && !isIgnored ? h('button', { type: 'button', class: 'btn small au-go', onclick: () => { close(); ctx.go(f.where); } }, label) : null));
  }

  const close = ctx.sheet('Book Audit', body, { wide: true, actions: null });
  rerun.focus();
  start();
  return close;
}
