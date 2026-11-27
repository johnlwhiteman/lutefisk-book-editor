// Settings › Spelling & Grammar: your dictionary (add, find, correct, remove words) and the
// rules the checker uses (Harper's own groups; turn whole groups or single rules on or off).
// Everything stays on this computer, in Settings.
import { h, icon, toast, dialog } from './ui.js';
import { ruleCatalog } from './spellcheck.js';

/** "AvoidContractions" → "Avoid contractions"; keeps short all-caps parts ("USUniversities" → "US universities"). */
export function ruleLabel(name) {
  const words = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ');
  return words.map((w, i) => (i && !/^[A-Z]{2,}$/.test(w) ? w.toLowerCase() : w)).join(' ');
}
/** A rule's description, with `code` shown as code. */
function describe(text) {
  const out = h('small', { class: 'rl-desc' });
  String(text || '').split(/(`[^`]+`)/).forEach((part) => out.append(/^`.+`$/.test(part) ? h('code', {}, part.slice(1, -1)) : part));
  return out;
}

/* ------------------------------------------------------------------ dictionary */
/**
 * Your dictionary: every word you've added, to find, correct or remove. get() returns the list;
 * save(list) stores it (and returns a promise).
 */
export function openDictionary(sheet, { get, save }) {
  const list = h('div', { class: 'dc-list', role: 'list' });
  const find = h('input', { type: 'search', placeholder: 'Find a word…', 'aria-label': 'Find a word in your dictionary', class: 'dc-find' });
  const add = h('input', { type: 'text', placeholder: 'Add a word…', 'aria-label': 'Add a word', maxlength: 64, class: 'dc-add' });
  const count = h('span', { class: 'dc-count' });
  const words = () => [...(get() || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const valid = (w) => w && w.length <= 64 && !/[\s<>]/.test(w);
  const put = async (next) => { await save([...new Set(next)]); draw(); };
  const addWord = async () => {
    const w = add.value.trim();
    if (!w) return;
    if (!valid(w)) { toast('A dictionary entry is one word, without spaces', 'error', 2200); return; }
    if ((get() || []).includes(w)) { toast(`“${w}” is already in your dictionary`, 'ok', 1600); add.select(); return; }
    add.value = '';
    await put([...(get() || []), w]);
    toast(`Added “${w}”`, 'ok', 1200);
  };
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } });
  find.addEventListener('input', () => draw());

  function row(w) {
    const input = h('input', { type: 'text', value: w, 'aria-label': `Correct “${w}”`, maxlength: 64, class: 'dc-word' });
    const commit = async () => {
      const v = input.value.trim();
      if (v === w) return;
      if (!valid(v)) { input.value = w; toast('A dictionary entry is one word, without spaces', 'error', 2200); return; }
      await put((get() || []).map((x) => (x === w ? v : x)));
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { e.stopPropagation(); input.value = w; input.blur(); } });
    input.addEventListener('blur', commit);
    return h('div', { class: 'dc-row', role: 'listitem' }, input,
      h('button', { type: 'button', class: 'icon-btn', title: `Remove “${w}” — it will be checked again`, 'aria-label': `Remove ${w}`, onclick: () => put((get() || []).filter((x) => x !== w)) }, icon('trash', 14)));
  }
  function draw() {
    const all = words();
    const q = find.value.trim().toLowerCase();
    const shown = q ? all.filter((w) => w.toLowerCase().includes(q)) : all;
    count.textContent = all.length ? `${all.length} word${all.length === 1 ? '' : 's'}` : '';
    list.replaceChildren(...(shown.length ? shown.map(row)
      : [h('p', { class: 'hint dc-empty' }, all.length ? 'No words match.' : 'No words yet. Add names, places and invented words here, or right-click an underlined word in your text › Add to Dictionary.')]));
  }
  draw();
  const body = h('div', { class: 'dict-dlg' },
    h('p', { class: 'hint' }, 'Words here are never marked as misspelled, in any book. Click a word to correct it.'),
    h('div', { class: 'dc-bar' }, h('div', { class: 'dc-add-wrap' }, add, h('button', { type: 'button', class: 'btn small primary', onclick: addWord }, icon('plus', 13), 'Add')), find),
    list);
  sheet('Your Dictionary', body, { actions: count });
  setTimeout(() => add.focus(), 50);
}

/* ------------------------------------------------------------------ rules */
/**
 * The rules: Harper's groups, each with an on/off switch for the whole group and its rules
 * inside, plus the few "pick one" choices (Oxford comma or not…). get() returns your choices
 * ({ Rule: true|false }); save(choices) stores them.
 */
export async function openRules(sheet, { get, save, dialect }) {
  const body = h('div', { class: 'rl' }, h('p', { class: 'hint' }, 'Loading the rules…'));
  const close = sheet('Spelling & Grammar Rules', body, { wide: true });
  let cat;
  try { cat = await ruleCatalog(dialect); } catch (err) { body.replaceChildren(h('p', { class: 'hint' }, `The rules couldn’t be loaded: ${err?.message || err}`)); return close; }
  const { structured, defaults, descriptions } = cat;
  let mine = { ...(get() || {}) };
  const on = (name) => (name in mine ? mine[name] : defaults[name] !== false);
  const set = (changes) => {
    for (const [k, v] of Object.entries(changes)) { if ((defaults[k] !== false) === v) delete mine[k]; else mine[k] = v; }
    save({ ...mine });
    draw();
  };

  // Harper's tree → [{ label, description, items: [{ kind: 'rule', name } | { kind: 'choice', names, labels }] }]
  const groups = [];
  const collect = (s, into) => { for (const it of s.settings) {
    if (it.Bool) into.push({ kind: 'rule', name: it.Bool.name });
    else if (it.OneOfMany) into.push({ kind: 'choice', names: it.OneOfMany.names, labels: it.OneOfMany.labels });
    else if (it.Group) collect(it.Group.child, into);
  } };
  for (const it of structured.settings) {
    if (it.Group) { const items = []; collect(it.Group.child, items); groups.push({ label: it.Group.label, description: it.Group.description, items }); }
  }
  const ruleNames = (g) => g.items.flatMap((x) => (x.kind === 'rule' ? [x.name] : []));
  const open = new Set();
  const find = h('input', { type: 'search', placeholder: 'Find a rule…', 'aria-label': 'Find a rule', class: 'rl-find' });
  let show = 'all';
  const showSeg = h('div', { class: 'segmented rl-show', role: 'radiogroup', 'aria-label': 'Show' });
  const drawShow = () => showSeg.replaceChildren(...[['all', 'All'], ['on', 'On'], ['off', 'Off'], ['changed', 'Changed by you']].map(([v, l]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(show === v), class: show === v ? 'on' : '', onclick: () => { show = v; drawShow(); draw(); } }, l)));
  drawShow();
  find.addEventListener('input', () => draw());
  const summary = h('span', { class: 'rl-summary' });
  const list = h('div', { class: 'rl-groups' });

  const matches = (name, text) => {
    const q = find.value.trim().toLowerCase();
    if (q && !`${ruleLabel(name)} ${name} ${text || ''}`.toLowerCase().includes(q)) return false;
    if (show === 'on') return on(name);
    if (show === 'off') return !on(name);
    if (show === 'changed') return name in mine;
    return true;
  };
  function ruleRow(name) {
    const box = h('input', { type: 'checkbox', checked: on(name), 'aria-label': ruleLabel(name) });
    box.addEventListener('change', () => set({ [name]: box.checked }));
    return h('label', { class: `rl-rule${name in mine ? ' changed' : ''}` }, box,
      h('span', {}, h('b', {}, ruleLabel(name)), describe(descriptions[name])));
  }
  function choiceRow(c) {
    const cur = c.names.find((n) => on(n)) || '';
    const sel = h('select', { 'aria-label': c.labels.join(' or ') },
      h('option', { value: '' }, 'No preference'), c.names.map((n, i) => h('option', { value: n }, c.labels[i])));
    sel.value = cur;
    sel.addEventListener('change', () => set(Object.fromEntries(c.names.map((n) => [n, n === sel.value]))));
    return h('div', { class: `rl-rule rl-choice${c.names.some((n) => n in mine) ? ' changed' : ''}` }, h('span', {}, h('b', {}, c.labels.join(' or ')), describe(descriptions[cur || c.names[0]])), sel);
  }
  function draw() {
    const all = groups.flatMap(ruleNames);
    const offCount = all.filter((n) => !on(n)).length;
    const changed = Object.keys(mine).length;
    summary.textContent = `${(all.length - offCount).toLocaleString()} of ${all.length.toLocaleString()} rules on${changed ? ` · ${changed} changed by you` : ''}`;
    const searching = !!find.value.trim() || show !== 'all';
    list.replaceChildren(...groups.map((g) => {
      const names = ruleNames(g);
      const n = names.filter(on).length;
      const items = g.items.filter((x) => (x.kind === 'rule' ? matches(x.name, descriptions[x.name]) : x.names.some((nm) => matches(nm, descriptions[nm]))));
      if (searching && !items.length) return null;
      const expanded = open.has(g.label) || (searching && items.length <= 40);
      const all = h('input', { type: 'checkbox', checked: n === names.length, 'aria-label': `All of ${g.label}` });
      all.indeterminate = n > 0 && n < names.length;
      all.addEventListener('change', () => set(Object.fromEntries(names.map((nm) => [nm, all.checked]))));
      const head = h('div', { class: 'rl-ghead' },
        h('label', { class: 'rl-gall', title: `Turn every rule in ${g.label} on or off` }, all),
        h('button', { type: 'button', class: 'rl-gname', 'aria-expanded': String(expanded), onclick: () => { if (open.has(g.label)) open.delete(g.label); else open.add(g.label); draw(); } },
          h('span', { class: `sb-disc${expanded ? ' open' : ''}` }, icon('next', 11)),
          h('span', {}, h('b', {}, g.label), h('small', {}, g.description))),
        h('span', { class: 'rl-gcount' }, `${n} of ${names.length}`));
      return h('section', { class: `rl-group${n === 0 ? ' off' : ''}` }, head,
        expanded ? h('div', { class: 'rl-rules' }, items.map((x) => (x.kind === 'rule' ? ruleRow(x.name) : choiceRow(x)))) : null);
    }).filter(Boolean));
    if (!list.children.length) list.append(h('p', { class: 'hint' }, 'No rules match.'));
  }
  const restore = h('button', { type: 'button', class: 'btn small plain', onclick: async () => {
    if (!Object.keys(mine).length) return;
    if (await dialog({ title: 'Restore the default rules?', message: 'Every rule goes back to how Harper sets it. Your dictionary isn’t affected.', ok: 'Restore Defaults' })) { mine = {}; save({}); draw(); }
  } }, 'Restore Defaults');
  draw();
  body.replaceChildren(
    h('p', { class: 'hint' }, 'The checker’s rules, grouped as Harper groups them. Turn a whole group on or off with its box, or open it to choose single rules. Spelling uses the Spelling and Orthography group; style suggestions also follow “Include style suggestions with grammar”.'),
    h('div', { class: 'rl-bar' }, find, showSeg, h('span', { class: 'spacer' }), summary, restore),
    list);
  return close;
}
