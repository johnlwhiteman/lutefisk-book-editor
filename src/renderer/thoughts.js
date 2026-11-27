// Thoughts: anything that pops into your head while you write — an idea,
// a line, a what-if. Each one is just text. They're kept with the book
// (book.thoughts in lutefisk.yaml) and never go into the book itself.
//
// Two ways in: right-click in your text › Add Thought (a small box at
// the mouse; Return saves), and the thought-bubble button beside Tools, which
// lists them all to add, edit or delete.
import { h, icon, toast, timeAgo } from './ui.js';
import { newId } from '../shared/sections.js';
import { toBin } from './bin.js';

/** The book's thoughts, newest first in the list (stored oldest first). */
export const thoughtsOf = (book) => (Array.isArray(book?.thoughts) ? book.thoughts : []);

/**
 * Add a thought; returns it, or null when there's nothing to keep.
 * extra: { where: { label, section?, scene?, research? }, quote } — where you were, and the text you'd highlighted.
 */
export function addThought(book, text, { where, quote } = {}) {
  const t = String(text || '').trim();
  const q = String(quote || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!t && !q) return null;
  book.thoughts = thoughtsOf(book);
  const th = { id: newId('th'), text: t, at: new Date().toISOString() };
  if (q) th.quote = q;
  if (where?.label) th.where = { ...where };
  book.thoughts.push(th);
  return th;
}

/** A switch with a label, for the options under the text field. */
function option(label, checked, hint) {
  const box = h('input', { type: 'checkbox', checked });
  return { box, el: h('label', { class: 'th-opt', title: hint || null }, box, h('span', {}, label)) };
}

/** A textarea that grows with what's in it. */
function growing(attrs) {
  const ta = h('textarea', { rows: 1, ...attrs });
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  ta.addEventListener('input', fit);
  ta.fit = fit;
  return ta;
}

/**
 * The quick box from the right-click menu: one text field at the mouse.
 * Return saves, Shift+Return starts a new line, Esc or a click elsewhere cancels.
 * ctx: { book, markDirty, onChange, x, y, text, done() }
 */
export function quickThought(ctx) {
  document.querySelector('.th-quick')?.remove();
  const ta = growing({ class: 'th-input', placeholder: 'A thought…', 'aria-label': 'Thought' });
  // Two choices: keep where you are, and keep the text you'd highlighted (shown, so you know what's kept).
  const quote = String(ctx.text || '').replace(/\s+/g, ' ').trim();
  const loc = ctx.where?.label ? option(`Save where I am — ${ctx.where.label}`, true, 'Click the place on the thought later to come back here') : null;
  const hl = quote ? option('Include the highlighted text', true) : null;
  const quoteEl = quote ? h('blockquote', { class: 'th-quote' }, quote.length > 220 ? `${quote.slice(0, 219)}…` : quote) : null;
  hl?.box.addEventListener('change', () => { quoteEl.hidden = !hl.box.checked; });
  const box = h('div', { class: 'th-quick', role: 'dialog', 'aria-label': 'Add thought' },
    h('div', { class: 'th-quick-head' }, icon('thought', 14), 'Add Thought'),
    quoteEl, ta,
    loc || hl ? h('div', { class: 'th-opts' }, hl?.el, loc?.el) : null,
    h('small', { class: 'th-quick-hint' }, 'Return to save · Esc to cancel'));
  const finish = (save) => {
    if (!box.isConnected) return;
    document.removeEventListener('mousedown', outside, true);
    const extra = { where: loc?.box.checked ? ctx.where : null, quote: hl?.box.checked ? quote : '' };
    if (save && addThought(ctx.book, ta.value, extra)) { ctx.markDirty?.(); ctx.onChange?.(); toast('Saved to Thoughts', 'ok', 1400); }
    box.remove();
    ctx.done?.();
  };
  const outside = (e) => { if (!box.contains(e.target)) finish(false); };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  document.body.append(box);
  const r = box.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, (ctx.x ?? window.innerWidth / 2) - 20))}px`;
  box.style.top = `${Math.max(8, Math.min(window.innerHeight - r.height - 8, (ctx.y ?? window.innerHeight / 3) + 8))}px`;
  ta.fit();
  ta.focus();
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}

/**
 * All the thoughts: a field at the top to add one, then each thought — click to edit
 * it in place, or delete it (it goes to the Recycle Bin).
 * ctx: { book, sheet, markDirty, onChange }
 */
export function openThoughts(ctx) {
  const { book } = ctx;
  const changed = () => { ctx.markDirty?.(); ctx.onChange?.(); count(); };
  const add = growing({ class: 'th-input th-add', placeholder: 'A thought…', 'aria-label': 'Add thought' });
  const addBtn = h('button', { type: 'button', class: 'btn primary small th-add-btn', disabled: true, onclick: () => doAdd() }, 'Add');
  const loc = ctx.where?.label ? option(`Save where I am — ${ctx.where.label}`, false, 'Click the place on the thought later to come back here') : null;
  add.addEventListener('input', () => { addBtn.disabled = !add.value.trim(); });
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doAdd(); } });
  function doAdd() {
    if (!addThought(book, add.value, { where: loc?.box.checked ? ctx.where : null })) return;
    add.value = ''; add.fit(); addBtn.disabled = true;
    changed(); draw();
    add.focus();
  }
  const list = h('ul', { class: 'th-list' });
  const countEl = h('span', { class: 'th-count' });
  const count = () => { const n = thoughtsOf(book).length; countEl.textContent = n ? `${n} thought${n === 1 ? '' : 's'}` : ''; };

  function remove(th) {
    toBin(book, { kind: 'thought', title: (th.text || th.quote || 'Thought').split('\n')[0].slice(0, 80), item: th, where: { index: thoughtsOf(book).indexOf(th) } });
    book.thoughts = thoughtsOf(book).filter((x) => x !== th);
    changed(); draw();
    toast('Deleted — it’s in the Recycle Bin if you want it back', 'info', 2200);
  }
  function draw() {
    // Newest first.
    const all = [...thoughtsOf(book)].reverse().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    if (!all.length) {
      list.replaceChildren(h('li', { class: 'th-empty' }, icon('thought', 22), h('span', {}, 'No thoughts yet. Jot down anything — an idea, a line, a what-if.')));
      return;
    }
    list.replaceChildren(...all.map((th) => {
      const ta = growing({ class: 'th-text', 'aria-label': 'Thought', spellcheck: 'true' });
      ta.value = th.text;
      ta.addEventListener('input', () => { th.text = ta.value; th.edited = new Date().toISOString(); ctx.markDirty?.(); });
      // Emptied and left: it's gone (to the Recycle Bin).
      ta.addEventListener('blur', () => { if (!ta.value.trim() && !th.quote && thoughtsOf(book).includes(th)) remove(th); else { th.text = ta.value.trim(); ctx.onChange?.(); } });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); ta.blur(); } });
      // Where it was written (click to go there) and the text that was highlighted.
      const go = th.where?.label && ctx.goTo ? h('button', { type: 'button', class: 'th-where', title: 'Go there', onclick: () => { closeSheet?.(); ctx.goTo(th); } }, icon('pin', 11), th.where.label) : null;
      const quoteEl = th.quote ? h('blockquote', { class: 'th-quote' }, th.quote.length > 300 ? `${th.quote.slice(0, 299)}…` : th.quote) : null;
      if (!th.text) ta.placeholder = 'Add a thought about this…';
      const li = h('li', { class: 'th-item' },
        h('span', { class: 'th-dot', 'aria-hidden': 'true' }),
        h('div', { class: 'th-main' }, quoteEl, ta, h('div', { class: 'th-meta' }, h('small', { class: 'th-when', title: new Date(th.at).toLocaleString() }, timeAgo(th.at)), go)),
        h('button', { type: 'button', class: 'th-del', title: 'Delete this thought (it goes to the Recycle Bin)', 'aria-label': 'Delete this thought', onclick: () => remove(th) }, icon('trash', 14)));
      requestAnimationFrame(() => ta.fit());
      return li;
    }));
  }
  const body = h('div', { class: 'th' },
    h('div', { class: 'th-new-wrap' }, h('div', { class: 'th-new' }, add, addBtn), loc ? h('div', { class: 'th-opts' }, loc.el) : null),
    list);
  draw(); count();
  const closeSheet = ctx.sheet('Thoughts', body, { actions: countEl, onClose: () => ctx.onClose?.() });
  requestAnimationFrame(() => add.focus());
}
