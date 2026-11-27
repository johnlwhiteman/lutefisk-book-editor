// Proofreading: mark up the manuscript with proofreader's marks, written over the
// text as if by hand in red, blue, green or purple ink. While it's on, a second row
// in the editor's toolbar holds the inks, Add Mark, the way from mark to mark (this
// chapter or scene first, then on through the book) and Done. Each mark keeps the
// ink it was written in; Recolor makes every mark one ink. The style guide is chosen
// in Book settings › Style. Proofreading starts off each time the app opens.
//
// The marks sit in the chapter Markdown (see shared/review.js); who made each one,
// its text and note live in lutefisk.yaml under review.marks. They show only in the
// editor, only while Review is on, and never reach the previews or any export.
// Open marks count in the Book Audit until they're removed.
import { h, icon, dialog, toast, confirmDialog, popover } from './ui.js';
import { GUIDES, guideOf, markType, markText, pruneResolved, reviewMarksIn, INKS, DEFAULT_INK } from '../shared/review.js';
import { commentAuthor } from './comments.js';


/* Hand-drawn strokes, as SVG stretched over the marked text. Drawn in the ink's color. */
const STROKES = {
  strike: "<path d='M1 13.6C14 11.8 30 15.2 47 12.9S80 11.4 99 13.1'/>",
  under: "<path d='M1 22.2C22 20.6 47 23.3 71 21.6S93 21.1 99 22.1'/>",
  triple: "<path d='M1 19.4C30 18.4 66 20.4 99 19.1'/><path d='M1 21.6C34 20.7 64 22.6 99 21.3'/><path d='M1 23.6C30 22.8 70 24.4 99 23.2'/>",
  wavy: `<path d='M1 21.5${Array.from({ length: 16 }, (_, i) => ` Q${(i * 6.1 + 4).toFixed(1)} ${i % 2 ? 24 : 18.6} ${(i * 6.1 + 7.1).toFixed(1)} 21.5`).join('')}'/>`,
  dotted: "<path stroke-dasharray='0.1 4.5' d='M2 22.4C30 21.4 66 23.2 98 22'/>",
  circle: "<path d='M11 2.6C40-.2 84 .8 96.5 8.6C101.5 15.6 81 23 48 23.1C15 23.1-1 17.4 3.2 9.8C5.6 5 15 2.6 26 2.2'/>",
  slash: "<path d='M14 23L86 1.4'/>",
  swoop: "<path d='M2 3.4C21-.6 41 2.4 50 12S79 25.4 98 20.2'/>",
  close: "<path d='M3 5.4Q50-3.6 97 5.4'/><path d='M3 18.8Q50 27.6 97 18.8'/>",
};
const svgUrl = (paths, color) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 24' preserveAspectRatio='none'><g fill='none' stroke='${color}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>${paths.replace(/<path /g, "<path vector-effect='non-scaling-stroke' ")}</g></svg>`)}")`;

export function createReview(app, { onChange, available = () => true, step, clearBook, units = () => Object.keys(app.contents || {}), isOpen = (id) => id === app.currentId } = {}) {
  let on = false; // off each time the app opens: turn it on with the pencil when you want to proofread
  let ink = DEFAULT_INK; // the pen for new marks: red each time the app opens
  const store = () => {
    const r = (app.book.review ||= {});
    r.marks ||= {};
    return r;
  };
  const ed = () => app.editor;
  const row = h('div', { class: 'rv-row', role: 'group', 'aria-label': 'Proofreading', hidden: true });

  /* ---- marks: made, finished, removed */
  function create(id, { type, text = null, note = '', quote = '' }) {
    const rec = { type, guide: guideOf(app.book), ink, author: commentAuthor(app.book), at: new Date().toISOString() };
    if (text != null && text !== '') rec.text = text;
    if (note) rec.note = note;
    if (quote) rec.quote = quote;
    store().marks[id] = rec;
    app.markDirty();
  }
  const info = (id) => (app.book?.review?.marks || {})[id] || null;
  /** accept: make the change (where Lutefisk can); otherwise just take the mark away. */
  function finish(id, accept, how) {
    const res = ed().finishReview(id, accept);
    if (!res) return false;
    const rec = store().marks[id] || (store().marks[id] = { type: 'query' });
    rec.resolved = { how: accept && res === 'accepted' ? 'accepted' : how || 'removed', by: commentAuthor(app.book), at: new Date().toISOString() };
    pruneResolved(store().marks);
    app.markDirty();
    update();
    return true;
  }
  async function editNote(id) {
    const rec = store().marks[id];
    if (!rec) return;
    const def = markType(rec.type);
    const fields = [];
    if (['insert', 'replace'].includes(def.apply)) fields.push({ name: 'text', label: def.apply === 'replace' ? 'Replace with' : 'Text to insert', value: rec.text ?? markText(def, guideOf(app.book), null) ?? '' });
    fields.push({ name: 'note', label: 'Note for the author', type: 'textarea', rows: 3, value: rec.note || '' });
    const res = await dialog({ title: def.label.replace('…', ''), fields, ok: 'Save' });
    if (!res) { ed().focus(); return; }
    if ('text' in res) { if (res.text !== '') rec.text = res.text; else delete rec.text; }
    if (res.note.trim()) rec.note = res.note.trim(); else delete rec.note;
    app.markDirty();
    ed().refreshReview();
    ed().focus();
  }

  /* ---- on and off, the style guide, the ink */
  function setOn(v) {
    on = !!v;
    applyInk();
    ed()?.refreshReview();
    update();
  }
  function setGuide(g) {
    if (!GUIDES[g]) return;
    store().guide = g;
    app.markDirty();
    ed()?.refreshReview();
    update();
  }
  /** The inks: for each one, its color (by day or night) and the hand-drawn strokes in it. */
  const inkStyle = h('style');
  document.head.append(inkStyle);
  function applyInk() {
    const c = ed()?.container;
    if (!c) return;
    c.classList.toggle('rv-on', on && available());
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    inkStyle.textContent = Object.entries(INKS).map(([k, x]) => {
      const color = dark ? x.dark : x.light;
      return `.rv-ink-${k}{--rv-ink:${color};${Object.entries(STROKES).map(([n, paths]) => `--rv-${n}:${svgUrl(paths, color)}`).join(';')}}`;
    }).join('\n');
  }
  function setInk(v) {
    if (!INKS[v]) return;
    ink = v;
    update();
  }
  /** Give marks one ink: these ids, or every mark in the book. */
  function recolor(ids, to) {
    if (!INKS[to]) return 0;
    const marks = store().marks;
    const list = ids || Object.keys(marks).filter((id) => !marks[id]?.resolved);
    for (const id of list) if (marks[id]) marks[id].ink = to;
    app.markDirty();
    ed()?.refreshReview();
    return list.length;
  }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyInk()); } catch { /* ignore */ }

  /* ---- counts: this text (from the editor) and the whole book (from the saved Markdown) */
  const cache = new Map(); // id → { md, n }
  function bookCount() {
    if (!app.book) return 0;
    let n = 0;
    // Each chapter and scene once (a chapter with scenes is counted by its scenes); the open text from the editor.
    for (const id of units()) {
      if (isOpen(id)) continue;
      const md = app.contents?.[id] || '';
      let c = cache.get(id);
      if (!c || c.md !== md) { c = { md, n: md && md.includes('{%') ? reviewMarksIn(md).length : 0 }; cache.set(id, c); }
      n += c.n;
    }
    return n + (ed()?.reviewRanges().length || 0);
  }

  /* ---- clear */
  async function clear(scope) {
    if (scope === 'here') {
      const n = ed().reviewRanges().length;
      if (!n || !(await confirmDialog(`Clear the ${n === 1 ? 'mark' : `${n} marks`} here?`, 'The text stays as it is. Undo puts them back.', 'Clear'))) return;
      for (const id of ed().clearReview()) { const r = store().marks[id]; if (r) r.resolved = { how: 'cleared', by: commentAuthor(app.book), at: new Date().toISOString() }; }
      pruneResolved(store().marks);
      app.markDirty();
      toast(`${n} mark${n === 1 ? '' : 's'} cleared`, 'ok', 1600);
    } else {
      const n = bookCount();
      if (!n || !(await confirmDialog(`Clear all ${n} proofreading mark${n === 1 ? '' : 's'} in the book?`, 'Every chapter and scene: the text stays as it is and the marks are gone. This can’t be undone.', 'Clear All'))) return;
      clearBook?.();
      ed().clearReview();
      store().marks = {};
      app.markDirty();
      toast(`${n} mark${n === 1 ? '' : 's'} cleared from the book`, 'ok', 1800);
    }
    update();
  }

  /* ---- the toolbar row */
  const tbtn = (ic, label, title, onclick, cls = '') => h('button', { type: 'button', class: `rv-tb${label ? ' wide' : ''} ${cls}`, title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick }, icon(ic, 15), label ? h('span', {}, label) : null);
  const inkBtns = Object.entries(INKS).map(([k, x]) => h('button', { type: 'button', class: `rv-ink rv-ink-${k}`, 'data-ink': k, title: `${x.label} — new marks in ${x.label.toLowerCase()}; with marks selected, they turn ${x.label.toLowerCase()} too`, 'aria-label': `${x.label} ink`, onmousedown: (e) => e.preventDefault(), onclick: () => pickInk(k) }));
  /** An ink: the pen for new marks — and the color of any marks in the highlighted text (click a
      mark's label to highlight it). Just a cursor beside a mark doesn't recolor it. */
  function pickInk(k) {
    const ids = ed()?.hasSelection?.() ? ed().reviewIdsInSelection() : [];
    if (ids.length) { recolor(ids, k); toast(`${ids.length === 1 ? 'Mark' : `${ids.length} marks`} now ${INKS[k].label.toLowerCase()}`, 'ok', 1400); }
    setInk(k);
  }
  const recolorBtn = tbtn('palette', '', 'Make every mark one color…', (e) => {
    const n = bookCount();
    popover(e.currentTarget, [{ header: n ? `Make all ${n} mark${n === 1 ? '' : 's'}…` : 'No marks yet' },
      ...Object.entries(INKS).map(([k, x]) => ({ label: x.label, swatch: x.light, disabled: !n, onClick: () => { const k2 = recolor(null, k); setInk(k); toast(`${k2} mark${k2 === 1 ? '' : 's'} now ${x.label.toLowerCase()}`, 'ok', 1600); } }))], { width: 200 });
  });
  const count = h('span', { class: 'rv-count', 'aria-live': 'polite' });
  const prevBtn = tbtn('prev', '', 'Previous mark — in this chapter, then back through the book', () => step?.(-1));
  const nextBtn = tbtn('next', '', 'Next mark — in this chapter, then on through the book', () => step?.(1));
  const addBtn = tbtn('plus', 'Add Mark', 'Add a proofreader’s mark at the cursor or on the selected text — type to search', (e) => ed().reviewPicker(e.currentTarget));
  const doneBtn = tbtn('check', 'Done', 'Done proofreading — the marks stay, hidden, until they’re cleared', () => setOn(false));
  row.append(
    h('span', { class: 'ql-formats rv-inks' }, ...inkBtns, recolorBtn),
    h('span', { class: 'ql-formats' }, addBtn),
    h('span', { class: 'ql-formats' }, prevBtn, count, nextBtn),
    h('span', { class: 'ql-formats' }, doneBtn));

  function update() {
    if (!app.book || !ed()) { row.hidden = true; return; }
    if (!row.isConnected) ed().toolbar.append(row);
    applyInk();
    const ranges = ed().reviewRanges();
    // Marks back in the text (Undo) are open again; marks without a record get one.
    for (const r of ranges) {
      const rec = store().marks[r.id];
      if (!rec) store().marks[r.id] = { type: r.type, guide: guideOf(app.book), author: '', at: new Date().toISOString() };
      else if (rec.resolved) delete rec.resolved;
    }
    onChange?.();
    row.hidden = !on || !available();
    if (row.hidden) return;
    for (const b of inkBtns) { const k = b.dataset.ink; b.classList.toggle('on', k === ink); b.setAttribute('aria-pressed', String(k === ink)); }
    const here = ranges.length, total = bookCount();
    // “7 Marks” (“1 Mark”) in the whole book; nothing at all when there are none.
    count.textContent = total ? `${total} ${total === 1 ? 'Mark' : 'Marks'}` : '';
    count.title = total ? `${here} in this text, ${total} in the whole book` : '';
    count.parentElement.hidden = !total;
  }

  return {
    row, create, info, finish, editNote, setOn, setGuide, setInk, update, bookCount, applyInk,
    clearHere: () => clear('here'),
    recolor,
    ink: () => ink,
    clearBook: () => clear('book'),
    on: () => on && !!app.book && available(),
    guide: () => guideOf(app.book),
    toggle: () => setOn(!on),
    select: (id) => { ed().selectReview(id); },
  };
}
