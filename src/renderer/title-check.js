// Capitalize My Title: right-click a title field › Capitalize My Title…. It analyzes
// the title and shows it in each style (Chicago, APA, MLA, AP, sentence case),
// marking the words that would change, so you can pick one.
import { h, icon, popover, closePopovers, toast } from './ui.js';
import { analyzeTitle, toStyle, TITLE_STYLES } from '../shared/titlecase.js';

/**
 * input: the <input> holding the title.
 * opts: {
 *   getStyle() → the book's preferred style id (or ''),
 *   setStyle(id) → remember it,
 *   onApply(text) → called after the input changes (an 'input' event is also fired),
 *   applyAll?: { label, run(styleId) } — e.g. apply to every chapter title,
 * }
 */
export function titleCheckButton(input, opts = {}) {
  // No button beside the field any more: right-click the title › Capitalize My Title…
  titleContextMenu(input, opts);
  return null;
}

/** Right-click a title field: Cut, Copy, Paste, Select All and Capitalize My Title…. */
export function titleContextMenu(input, opts = {}) {
  if (input.dataset.titleMenu) return;
  input.dataset.titleMenu = '1';
  input.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const hasSel = input.selectionStart !== input.selectionEnd;
    const anchor = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } });
    document.body.append(anchor);
    popover(anchor, [
      { label: 'Capitalize My Title…', icon: 'capTitle', disabled: !input.value.trim(), onClick: () => setTimeout(() => openTitleCheck(input, input, opts)) },
      '-',
      { label: 'Cut', icon: 'clear', hint: '⌘X', disabled: !hasSel, onClick: () => { input.focus(); document.execCommand('cut'); } },
      { label: 'Copy', icon: 'doc', hint: '⌘C', disabled: !hasSel, onClick: () => { input.focus(); document.execCommand('copy'); } },
      { label: 'Paste', icon: 'export', hint: '⌘V', onClick: () => { input.focus(); window.lutefisk?.paste?.(); } },
      { label: 'Select All', icon: 'check', hint: '⌘A', onClick: () => { input.focus(); input.select(); } },
    ], { width: 220 });
    setTimeout(() => anchor.remove(), 0);
  });
}

function diffWords(from, to) {
  const a = from.split(/(\s+)/), b = to.split(/(\s+)/);
  return b.map((w, i) => (/\S/.test(w) && w !== a[i] ? h('mark', { class: 'tc-changed' }, w) : w));
}

export function openTitleCheck(anchor, input, opts = {}) {
  const title = input.value.trim();
  if (!title) { toast('Type a title first', 'info', 1500); input.focus(); return; }
  const preferred = opts.getStyle?.() || '';
  // The book's style (its citation style unless you chose another) comes first.
  const results = analyzeTitle(title).sort((a, b) => (b.id === preferred) - (a.id === preferred));
  const follows = results.filter((r) => r.matches && r.id !== 'sentence').map((r) => r.label);
  const apply = (text) => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    opts.onApply?.(text);
    closePopovers();
    input.focus();
  };
  const summary = follows.length === TITLE_STYLES.length - 1 ? 'This title is correct in every headline style.'
    : follows.length ? `Already correct in ${follows.join(', ')}.` : 'Not yet in any headline style — choose one below.';
  const rows = results.map((r) => h('div', { class: `tc-row${r.matches ? ' ok' : ''}${r.id === preferred ? ' pref' : ''}` },
    h('div', { class: 'tc-style' }, h('b', {}, r.label), r.id === preferred ? h('span', { class: 'tc-pref' }, 'your style') : null,
      r.matches ? h('span', { class: 'tc-ok' }, icon('check', 12), 'matches') : h('span', { class: 'tc-n' }, `${r.changes.length} change${r.changes.length === 1 ? '' : 's'}`)),
    h('div', { class: 'tc-text', title: r.long }, ...diffWords(title, r.text)),
    h('div', { class: 'tc-acts' },
      r.matches ? null : h('button', { type: 'button', class: 'btn small primary', onclick: () => { apply(r.text); opts.setStyle?.(r.id); } }, 'Use'),
      r.id !== preferred && opts.setStyle ? h('button', { type: 'button', class: 'btn small plain', title: `Make ${r.long} the style this book’s titles are checked against`, onclick: (e) => { e.stopPropagation(); opts.setStyle(r.id); closePopovers(); openTitleCheck(anchor, input, opts); } }, 'Make default') : null)));
  const all = opts.applyAll ? h('div', { class: 'tc-all' },
    h('span', {}, opts.applyAll.label),
    h('select', { class: 'tc-all-sel', 'aria-label': 'Style for every title' }, TITLE_STYLES.map((s) => h('option', { value: s.id, selected: s.id === (preferred || 'apa') }, s.label))),
    h('button', { type: 'button', class: 'btn small', onclick: (e) => { const id = e.currentTarget.previousSibling.value; closePopovers(); opts.applyAll.run(id); } }, 'Apply')) : null;
  const panel = h('div', { class: 'tc-panel', onmousedown: (e) => e.stopPropagation() },
    h('div', { class: 'tc-head' }, icon('capTitle', 16), h('b', {}, 'Capitalize My Title'), h('span', { class: 'tc-sum' }, summary)),
    ...rows,
    h('p', { class: 'tc-note' }, 'Sentence case keeps capitals you typed for names — check proper nouns. Words used as adverbs or in phrasal verbs (“Give Up”) may need a capital by hand.'),
    all);
  popover(anchor, [{ node: panel }], { width: 420, maxHeight: 620, align: 'right' });
}

/** Re-case a list of titles in place; returns how many changed. */
export function recaseAll(items, style, get = (x) => x.title, set = (x, v) => { x.title = v; }) {
  let n = 0;
  for (const it of items) {
    const t = get(it);
    if (!t || !t.trim()) continue;
    const next = toStyle(t, style);
    if (next !== t) { set(it, next); n++; }
  }
  return n;
}
