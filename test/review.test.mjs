// Review mode: proofreader's marks stay in the editor — never in a preview or an export —
// and every open mark counts in the Book Audit until it's resolved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { stripReview, reviewMarksIn, markType, markText, canApply, GUIDES, GUIDE_RULES, MARKS, pruneResolved, KEEP_RESOLVED, guideOf } from '../src/shared/review.js';
import { renderMarkdown, markdownToPlain, parseMarkdown } from '../src/shared/markdown.js';
import { proseText } from '../src/shared/scenes.js';
import { defaultBook, ensureSections } from '../src/shared/sections.js';
import { renderBook } from '../src/shared/bookhtml.js';
import { buildText } from '../src/main/export-txt.js';
import { buildMarkdown } from '../src/main/export-markdown.js';
import { buildDocx } from '../src/main/export-docx.js';
import { buildRtf } from '../src/main/export-rtf.js';
import { auditBook, auditCount } from '../src/renderer/audit.js';

// A paragraph with every kind of mark: on a range, at a point, a point inside a range, and a
// mark inside a comment.
const MARKED = 'The {%%quick quick%%}{%r-a1:del%} fox{%r-b2:comma%} jumped {=={%%over%%}{%r-c3:cap%}==}{>>#c-z<<} the {%%lazy {%r-d4:space%}dog%%}{%r-e5:close%}.';
const PLAIN = 'The quick quick fox jumped over the lazy dog.';

test('marks are stripped to the text as written', () => {
  assert.equal(stripReview(MARKED).replace(/\{==|==\}\{>>#c-z<<\}/g, ''), PLAIN);
  assert.equal(stripReview('no marks'), 'no marks');
  assert.deepEqual(reviewMarksIn(MARKED).map((m) => `${m.id}:${m.type}`), ['r-a1:del', 'r-b2:comma', 'r-c3:cap', 'r-d4:space', 'r-e5:close']);
  // A mark split across two paragraphs keeps one id: counted once.
  assert.equal(reviewMarksIn('{%%one%%}{%r-x:del%}\n\n{%%two%%}{%r-x:del%}').length, 1);
});

test('markdown renders the marked text and nothing else', () => {
  assert.equal(renderMarkdown(MARKED).html, `<p>${PLAIN.replace(/'/g, '’')}</p>\n`);
  assert.equal(markdownToPlain(MARKED), PLAIN);
  assert.equal(proseText(MARKED), PLAIN);
  const kids = parseMarkdown(MARKED).tokens[1].children.map((t) => t.type);
  assert.equal(kids.filter((k) => k === 'review_open').length, 3);
  assert.equal(kids.filter((k) => k === 'review_point').length, 2);
  // Formatting inside a mark still renders.
  assert.equal(renderMarkdown('A {%%*very*%%}{%r-i:rom%} good day').html, '<p>A <em>very</em> good day</p>\n');
  // Something that only looks like a mark is left alone.
  assert.equal(renderMarkdown('50{%} off').html, '<p>50{%} off</p>\n');
});

function book() {
  const b = ensureSections(defaultBook({ title: 'Marked Up', author: 'R. Viewer' }));
  const ch = b.sections.find((s) => s.type === 'chapter');
  return { book: b, ch, contents: { [ch.id]: `${MARKED}\n\nA second {%%paragraph%%}{%r-f6:ital%} here.\n` } };
}

test('no export or preview shows a mark', async () => {
  const { book: b, ch, contents } = book();
  const leaks = /\{%|%\}|r-[a-f]\d|‸|\bdel\b/;
  const html = renderBook({ book: b, contents, hrefFor: (id) => `${id}.xhtml` }).find((r) => r.sec.id === ch.id).html;
  assert.doesNotMatch(html, leaks);
  assert.match(html, /quick quick fox jumped over the lazy dog/);
  const txt = buildText({ book: b, contents });
  assert.doesNotMatch(txt, leaks);
  assert.match(txt, /quick quick fox jumped/);
  const md = await buildMarkdown({ book: b, contents, assetsFolder: 'assets' });
  const mdText = typeof md === 'string' ? md : md.text || md.markdown || JSON.stringify(md);
  assert.doesNotMatch(mdText, /\{%|%\}/);
  assert.match(mdText, /The quick quick fox jumped/);
  const docx = await buildDocx({ dir: '/nonexistent', book: b, contents, rasterize: async () => null });
  const xml = strFromU8(unzipSync(new Uint8Array(docx))['word/document.xml']);
  assert.doesNotMatch(xml, /\{%|%\}|r-a1/);
  assert.match(xml.replace(/<[^>]+>/g, ''), /quick quick fox jumped over the lazy dog\./);
  const rtf = await buildRtf({ dir: '/nonexistent', book: b, contents, rasterize: async () => null, toPng: async () => null });
  assert.doesNotMatch(String(rtf), /\{%|r-a1/);
});

test('open marks are audit findings that count and can’t be ignored', () => {
  const { book: b, ch, contents } = book();
  b.review = { guide: 'ap', marks: { 'r-a1': { type: 'del', author: 'Pat' }, 'r-c3': { type: 'cap', author: 'Sam', note: 'Proper noun?' } } };
  const before = auditCount({ book: b, contents: { [ch.id]: PLAIN } });
  const { findings, passed } = auditBook({ book: b, contents });
  const f = findings.find((x) => x.group === 'review');
  assert.ok(f, 'a review finding');
  assert.equal(f.sev, 'warn');
  assert.equal(f.noIgnore, true);
  assert.match(f.title, /6 open proofreader’s marks/);
  assert.match(f.detail, /from Pat, Sam/);
  assert.deepEqual(f.where, { kind: 'review', id: ch.id, mark: 'r-a1' });
  assert.ok(f.chips.includes('del') && f.chips.includes('cap'));
  assert.ok(!passed.some((p) => p.group === 'review'));
  // It counts toward the binder's Audit number, even if someone tried to ignore it.
  b.auditIgnores = [];
  assert.equal(auditCount({ book: b, contents }), before + 1);
  // All resolved: the check passes.
  const clean = auditBook({ book: b, contents: { [ch.id]: PLAIN } });
  assert.ok(!clean.findings.some((x) => x.group === 'review'));
  assert.ok(clean.passed.some((p) => p.group === 'review'));
});

test('the guides and their marks', () => {
  assert.deepEqual(Object.keys(GUIDES), ['cmos', 'ap', 'apa']);
  assert.equal(guideOf({}), 'cmos');
  assert.equal(guideOf({ review: { guide: 'apa' } }), 'apa');
  assert.equal(guideOf({ review: { guide: 'mla' } }), 'cmos');
  const ids = [...MARKS, ...Object.values(GUIDE_RULES).flat()].map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'mark ids are unique');
  for (const m of [...MARKS, ...Object.values(GUIDE_RULES).flat()]) {
    assert.match(m.id, /^[a-z0-9-]{1,32}$/, m.id);
    assert.ok(['range', 'point'].includes(m.at), m.id);
    assert.ok(m.abbr && m.label, m.id);
  }
  for (const g of Object.keys(GUIDES)) assert.ok(GUIDE_RULES[g].length >= 5 && GUIDE_RULES[g].every((r) => r.note), g);
  // AP spaces its em dash; Chicago and APA close it up.
  assert.equal(markText(markType('em'), 'ap'), ' — ');
  assert.equal(markText(markType('em'), 'cmos'), '—');
  // What the reviewer typed wins; an insert with nothing to insert can't be accepted automatically.
  assert.equal(markText(markType('ins'), 'cmos', { text: 'very' }), 'very');
  assert.equal(canApply(markType('ins'), {}, 'cmos'), false);
  assert.equal(canApply(markType('ins'), { text: 'x' }, 'cmos'), true);
  assert.equal(canApply(markType('sc'), {}, 'cmos'), false);
  assert.equal(markType('nonsense').abbr, '?');
});

test('the record of resolved marks is kept, up to a limit', () => {
  const marks = { open: { type: 'del' } };
  for (let i = 0; i < KEEP_RESOLVED + 20; i++) marks[`r-${i}`] = { type: 'del', resolved: { at: new Date(2026, 0, 1, 0, 0, i).toISOString() } };
  pruneResolved(marks);
  assert.equal(Object.keys(marks).length, KEEP_RESOLVED + 1);
  assert.ok(marks.open && marks[`r-${KEEP_RESOLVED + 19}`] && !marks['r-0']);
});

test('checkboxes are ☐ and ☑ in the text, so every export shows them', async () => {
  const b = ensureSections(defaultBook({ title: 'Boxes', author: 'A' }));
  const ch = b.sections.find((s) => s.type === 'chapter');
  const contents = { [ch.id]: '☐ Pack the lantern\n\n☑ Fill the oil\n' };
  assert.match(renderMarkdown(contents[ch.id]).html, /☐ Pack the lantern[\s\S]*☑ Fill the oil/);
  assert.match(buildText({ book: b, contents }), /☐ Pack the lantern\s+☑ Fill the oil/);
  const docx = await buildDocx({ dir: '/nonexistent', book: b, contents, rasterize: async () => null });
  const xml = strFromU8(unzipSync(new Uint8Array(docx))['word/document.xml']).replace(/<[^>]+>/g, '');
  assert.match(xml, /☐ Pack the lantern/);
  assert.match(xml, /☑ Fill the oil/);
});

test('each ink has a light and a dark shade; red is the default', async () => {
  const { INKS, DEFAULT_INK } = await import('../src/shared/review.js');
  assert.deepEqual(Object.keys(INKS), ['red', 'blue', 'green', 'purple']);
  assert.equal(DEFAULT_INK, 'red');
  for (const x of Object.values(INKS)) { assert.match(x.light, /^#[0-9a-f]{6}$/); assert.match(x.dark, /^#[0-9a-f]{6}$/); }
});
