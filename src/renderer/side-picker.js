// A side picker: a list that opens at the left of the preview, beside the book, so
// the book stays in view while you choose.
//  - ↑ ↓ (Home, End) move through the choices and the book changes at every step.
//  - Moving the mouse over a choice shows it too, without choosing it.
//  - Click or Return chooses. Esc puts back what you had. Clicking elsewhere keeps
//    the choice the keys moved to (never one the mouse only passed over).
import { h, icon } from './ui.js';

let openPicker = null; // only one at a time

/**
 * @param {object} o
 * @param {HTMLElement} o.wrap      where the panel goes (the stage's wrapper)
 * @param {string} o.label          the button's accessible name, and the panel title
 * @param {string} [o.icon]         an icon for the button
 * @param {Array<{label?:string, items:Array<{value:string,label:string,hint?:string,swatch?:()=>Node}>}>} o.groups
 * @param {() => string} o.get      the current value
 * @param {(v:string) => void} o.preview  show a value (not saved)
 * @param {(v:string) => void} o.commit   choose a value (saved)
 * @param {string} [o.title]        tooltip for the button
 * @param {() => HTMLElement} [o.beside]  the preview pane: when there's room, the list opens
 *   over the editor, just left of it (like the template gallery), so the book keeps its size
 */
export function sidePicker({ wrap, label, icon: ic, groups, get, preview, commit, title, beside }) {
  const all = groups.flatMap((g) => g.items);
  const nameOf = (v) => all.find((it) => it.value === v)?.label || v;
  const btnText = h('span', { class: 'sp-btn-text' });
  const btn = h('button', { type: 'button', class: 'sp-btn pv-ctl', title: title || label, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label },
    ic ? icon(ic, 15) : null, btnText, icon('chevronUpDown', 12));
  const sync = () => { btnText.textContent = nameOf(get()); btn.setAttribute('aria-label', `${label}: ${nameOf(get())}`); };
  sync();

  let panel = null, start = '', active = '', shown = '';
  const show = (v) => { if (v !== shown) { shown = v; preview(v); } };
  function rows() { return panel ? [...panel.querySelectorAll('.sp-item')] : []; }
  function mark() {
    for (const r of rows()) {
      const on = r.dataset.value === active;
      r.classList.toggle('active', on);
      r.setAttribute('aria-selected', String(on));
      if (on) r.scrollIntoView({ block: 'nearest' });
    }
    panel?.querySelector('.sp-list')?.setAttribute('aria-activedescendant', `sp-${active}`);
  }
  function close(how) {
    if (!panel) return;
    const v = how === 'revert' ? start : active;
    panel.remove(); panel = null;
    wrap.classList.remove('picker-open');
    window.removeEventListener('resize', place);
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('on');
    document.removeEventListener('mousedown', outside, true);
    openPicker = null;
    if (v !== start) { commit(v); } else if (shown !== start) { preview(start); }
    shown = '';
    sync();
    if (how !== 'outside') btn.focus();
  }
  function outside(e) { if (panel && !panel.contains(e.target) && !btn.contains(e.target)) close('outside'); }
  function open() {
    if (openPicker && openPicker !== api) openPicker.close('outside');
    start = get(); active = start; shown = start;
    const list = h('div', { class: 'sp-list', role: 'listbox', tabindex: 0, 'aria-label': label });
    for (const g of groups) {
      if (g.label) list.append(h('div', { class: 'sp-group', role: 'presentation' }, g.label));
      for (const it of g.items) {
        const row = h('div', { class: 'sp-item', role: 'option', id: `sp-${it.value}`, 'data-value': it.value, 'aria-selected': 'false' },
          it.swatch ? h('span', { class: 'sp-sw', 'aria-hidden': 'true' }, it.swatch()) : null,
          h('span', { class: 'sp-label' }, it.label, it.hint ? h('small', {}, it.hint) : null),
          it.value === start ? h('span', { class: 'sp-check', 'aria-hidden': 'true' }, icon('check', 13)) : null);
        // Only when the mouse really moves (not when the list opens under a resting pointer).
        row.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) show(it.value); });
        row.addEventListener('mouseenter', (e) => { if (e.isTrusted === false) show(it.value); });
        row.addEventListener('mousedown', (e) => e.preventDefault());
        row.addEventListener('click', () => { active = it.value; close('choose'); });
        list.append(row);
      }
    }
    list.addEventListener('mouseleave', () => show(active));
    list.addEventListener('keydown', (e) => {
      const vals = all.map((it) => it.value);
      const i = vals.indexOf(active);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: vals.length - 1, PageDown: i + 8, PageUp: i - 8 }[e.key];
      if (to != null) {
        e.preventDefault();
        active = vals[Math.max(0, Math.min(vals.length - 1, to))];
        mark(); show(active);
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close('choose'); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('revert'); }
      else if (e.key === 'Tab') close('outside');
    });
    panel = h('div', { class: 'sp-panel', role: 'dialog', 'aria-label': label },
      h('div', { class: 'sp-head' }, h('b', {}, label), h('button', { type: 'button', class: 'sp-x', title: 'Close (Esc puts back what you had)', 'aria-label': 'Close', onclick: () => close('outside') }, icon('close', 11))),
      list,
      h('div', { class: 'sp-foot hint' }, '↑ ↓ to try · Return to choose · Esc to undo'));
    if (!place()) { wrap.classList.add('picker-open'); wrap.append(panel); }
    window.addEventListener('resize', place);
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('on');
    mark();
    list.focus();
    document.addEventListener('mousedown', outside, true);
    openPicker = api;
  }
  // Over the editor, just left of the preview, when there's room for it.
  function place() {
    if (!panel) return false;
    const pane = beside?.();
    const r = pane && !pane.classList.contains('collapsed') ? pane.getBoundingClientRect() : null;
    const w = 250;
    const ok = !!(r && r.left > w + 24);
    panel.classList.toggle('sp-docked', ok);
    if (!ok) return false;
    Object.assign(panel.style, { left: `${Math.round(r.left - w - 10)}px`, top: `${Math.round(r.top + 8)}px`, bottom: `${Math.round(window.innerHeight - r.bottom + 8)}px`, width: `${w}px` });
    if (panel.parentElement !== document.body) document.body.append(panel);
    return true;
  }
  btn.addEventListener('click', () => (panel ? close('outside') : open()));
  btn.addEventListener('keydown', (e) => { if (!panel && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(); } });
  const api = { button: btn, sync, close, isOpen: () => !!panel };
  return api;
}
