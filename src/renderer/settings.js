// App settings: where projects live, how saving works, and whether file choosers
// remember the last folder. Stored by the main process in the app's own data
// folder (never in a project or in the app's source).
import { applyLanguage } from './i18n-dom.js';
import { installSkinArt } from './skin-art.js';
import { openDictionary, openRules } from './proof-settings.js';
import { LANGUAGES, t, getLanguage } from '../shared/i18n.js';
import { h, icon, toast, segmented, dialog } from './ui.js';
import { FONTS, fontStack } from '../shared/fonts.js';

const B = window.lutefisk;
export const settings = { autosave: true, autosaveSeconds: 5, rememberLastDir: true, libraryDir: '', backupDir: '', defaultLibraryDir: '', theme: 'system', skin: 'classic' };
const listeners = new Set();

/** Skins: the look of the app (never the book). Each has a day and a night version. */
export const SKINS = [
  { id: 'classic', name: 'Classic', about: 'Clean and simple', day: ['#f5f5f7', '#007aff'], night: ['#1c1c1e', '#0a84ff'] },
  { id: 'batik', name: 'Batik', about: 'Java — indigo and soga brown, the kawung pattern', tex: 'batik', day: ['#efe6d6', '#7a4316'], night: ['#1a1510', '#e2a65c'] },
  { id: 'seigaiha', name: 'Seigaiha', about: 'Japan — indigo ocean waves', tex: 'seigaiha', day: ['#e9eef5', '#1f4e8c'], night: ['#111b2c', '#7fb2ff'] },
  { id: 'washi', name: 'Washi', about: 'Japan — fibered paper, sumi ink and a vermilion seal', tex: 'washi', day: ['#f1ece2', '#c0392b'], night: ['#1a1917', '#ff6b55'] },
  { id: 'talavera', name: 'Talavera', about: 'Mexico — cobalt tile with a touch of saffron', tex: 'talavera', day: ['#eef2f8', '#1f4e9c'], night: ['#0f1830', '#8fb0ff'] },
  { id: 'mudcloth', name: 'Bògòlan', about: 'Mali — mud cloth in earth brown and cream', tex: 'mudcloth', day: ['#e8dcc6', '#8a4b1c'], night: ['#241a12', '#e0a25f'] },
  { id: 'kuba', name: 'Kuba', about: 'Congo — raffia cloth and dark brown', tex: 'kuba', day: ['#eadfc6', '#8d5a17'], night: ['#1f190f', '#d9b25c'] },
  { id: 'koru', name: 'Kōwhaiwhai', about: 'Aotearoa — red ochre, black and white koru', tex: 'koru', day: ['#f1ece6', '#a4281b'], night: ['#161211', '#e86a55'] },
  { id: 'meander', name: 'Greek Key', about: 'Greece — terracotta and black, like Attic pottery', tex: 'meander', day: ['#efe3d4', '#9c4320'], night: ['#17110d', '#e8955f'] },
  { id: 'selbu', name: 'Selbu', about: 'Norway — red and white knitting stars', tex: 'selbu', day: ['#f1eeea', '#b3202a'], night: ['#181416', '#ff7b7b'] },
  { id: 'andean', name: 'Andean', about: 'Peru and Bolivia — woven steps in red, ochre and indigo', tex: 'andean', day: ['#efe5d8', '#a33a1f'], night: ['#1b130e', '#f08a4b'] },
  { id: 'contrast', name: 'High Contrast', about: 'Strong contrast for the easiest reading', day: ['#ffffff', '#0040c1'], night: ['#000000', '#6cb4ff'] },
];
export const applySkin = (id) => { installSkinArt(); document.documentElement.dataset.skin = SKINS.some((s) => s.id === id) ? id : 'classic'; };
export const setSkin = (skin) => { applySkin(skin); return update({ skin }); };

/** Vision and comfort settings, applied to the whole window. */
export function applyA11y(st = settings) {
  const d = document.documentElement.dataset;
  d.a11yFont = st.a11yFont ? 'on' : '';
  // Contrast: -1 softer, 0 standard, 1 stronger, 2 strongest (older settings: the a11yContrast box).
  const c = Number.isInteger(st.contrast) ? st.contrast : st.a11yContrast ? 1 : 0;
  d.contrast = { '-1': 'soft', 1: 'strong', 2: 'max' }[c] || '';
  d.a11yMotion = st.a11yMotion ? 'reduce' : '';
  d.a11yFocus = st.a11yFocus ? 'on' : '';
  d.a11ySpacing = st.a11ySpacing && st.a11ySpacing !== 'normal' ? st.a11ySpacing : '';
  d.toolbar = st.toolbarPos === 'bottom' ? 'bottom' : '';
  // The editor's own font; the book's fonts are set in the previews (or synced from here).
  d.editorFont = st.editorFont || '';
  if (st.editorFont) document.documentElement.style.setProperty('--editor-font', fontStack(st.editorFont));
  else document.documentElement.style.removeProperty('--editor-font');
}
/** Fonts for the editor: the bundled reading faces, plus the accessibility and typewriter faces. */
export const EDITOR_FONTS = FONTS.filter((f) => f.pkg && (f.kind === 'serif' || f.kind === 'sans' || f.id === 'courier-prime'));
/** The three panes in the six possible orders, for Settings and menus. */
export const PANE_ORDERS = [
  ['binder', 'editor', 'preview'], ['binder', 'preview', 'editor'], ['editor', 'preview', 'binder'],
  ['preview', 'editor', 'binder'], ['editor', 'binder', 'preview'], ['preview', 'binder', 'editor'],
];
const PANE_NAMES = { binder: 'Binder', editor: 'Editor', preview: 'Preview' };
export const paneOrderLabel = (o) => o.map((x) => PANE_NAMES[x]).join(' · ');
export const paneOrder = () => (Array.isArray(settings.paneOrder) && settings.paneOrder.length === 3 ? settings.paneOrder : PANE_ORDERS[0]);
export const setPaneOrder = (order) => update({ paneOrder: order });
/** Put the formatting toolbar above the text or below it. */
export const setToolbarPos = (pos) => update({ toolbarPos: pos === 'bottom' ? 'bottom' : 'top' });

export async function loadSettings() {
  try { Object.assign(settings, await B.getSettings()); } catch { /* defaults */ }
  applySkin(settings.skin);
  applyA11y();
  applyLanguage(settings.uiLanguage || 'en-US');
  for (const fn of listeners) fn(settings);
  return settings;
}
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
async function update(patch) {
  try { Object.assign(settings, await B.setSettings(patch)); } catch (err) { toast(String(err?.message || err), 'error'); }
  applyA11y();
  if ('uiLanguage' in patch) applyLanguage(settings.uiLanguage || 'en-US');
  for (const fn of listeners) fn(settings);
}

/**
 * Autosave scheduler. Saves `seconds` after the last change; while you keep
 * typing it still saves at least every 30 seconds. In manual mode it does nothing.
 */
export function autosaver(fn) {
  let t = null;
  let first = 0;
  const run = () => { clearTimeout(t); t = null; first = 0; fn(); };
  const d = () => {
    if (!settings.autosave) return;
    const now = Date.now();
    if (!first) first = now;
    clearTimeout(t);
    const wait = Math.max(1, settings.autosaveSeconds || 5) * 1000;
    const maxWait = Math.max(30000, wait * 3);
    t = setTimeout(run, Math.max(0, Math.min(wait, first + maxWait - now)));
  };
  d.cancel = () => { clearTimeout(t); t = null; first = 0; };
  d.flush = () => { if (t) run(); };
  return d;
}

function skinPicker(redraw) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return h('div', { class: 'skin-grid', role: 'radiogroup', 'aria-label': 'Skin' }, SKINS.map((s) => {
    const [bg, accent] = dark ? s.night : s.day;
    const on = (settings.skin || 'classic') === s.id;
    return h('button', { type: 'button', class: `skin-card${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), title: `${s.name} — ${s.about}`, onclick: () => setSkin(s.id).then(() => redraw?.()) },
      h('span', { class: `skin-sw${s.tex ? ` tex-${s.tex}` : ''}`, style: { backgroundColor: bg } }, h('i', { style: { background: accent } }), h('i', { style: { background: accent, opacity: '.35' } })),
      h('span', {}, s.name));
  }));
}

/** Day or night, chosen here or with the sun/moon button; “System” follows the computer. */
export const setTheme = (theme) => update({ theme });
const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
export function themeButton() {
  const b = h('button', { class: 'tb-icon tb-theme', 'aria-label': 'Day or night mode' });
  const draw = () => { b.replaceChildren(icon(isDark() ? 'moon' : 'sun', 18)); b.title = isDark() ? 'Night mode — click for day' : 'Day mode — click for night'; };
  b.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  draw();
  return b;
}

/** Add a word to your dictionary (from the editor's right-click menu). */
export const updateSettings = (patch) => update(patch);
export const addDictionaryWord = (w) => update({ dictionary: [...(settings.dictionary || []), String(w).trim()] });

/** Settings › Spelling & Grammar: Harper, checked on this computer. */
function spellSection(draw) {
  const check = (key, label, hint) => {
    const box = h('input', { type: 'checkbox', checked: settings[key] !== false });
    box.addEventListener('change', () => update({ [key]: box.checked }).then(draw));
    return h('label', { class: 'st-check a11y-check' }, box, h('span', {}, h('b', {}, label), hint ? h('small', { class: 'hint' }, hint) : null));
  };
  const dialect = h('select', { 'aria-label': 'English dialect' }, [['american', 'American'], ['british', 'British'], ['canadian', 'Canadian'], ['australian', 'Australian']].map(([v, l]) => h('option', { value: v }, l)));
  dialect.value = settings.spellDialect || 'american';
  dialect.addEventListener('change', () => update({ spellDialect: dialect.value }).then(draw));
  const dict = settings.dictionary || [];
  const changed = Object.keys(settings.lintRules || {}).length;
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('check', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Spelling & Grammar'),
      h('p', { class: 'hint' }, 'Powered by Harper, which is built into Lutefisk Book Editor and runs entirely on this computer — your text is never sent anywhere. Right-click an underlined word for suggestions. The same switches sit under the text, with buttons to check on demand.'),
      h('div', { class: 'st-sub-opts' },
        check('spellLive', 'Check spelling as I type', 'Misspellings are underlined in red.'),
        check('grammarLive', 'Check grammar as I type', 'Agreement, word choice, punctuation and more — underlined in blue.'),
        h('label', { class: 'st-row' }, h('span', {}, 'English'), dialect),
        check('spellStyle', 'Include style suggestions with grammar', 'Wordiness, repetition and readability — dotted in purple.'),
        h('div', { class: 'st-row st-proof' }, h('span', {}, 'Your dictionary'),
          h('span', { class: 'st-proof-sum' }, dict.length ? `${dict.length} word${dict.length === 1 ? '' : 's'}` : 'No words yet'),
          h('button', { type: 'button', class: 'btn small', onclick: () => openDictionary(sheetFn, { get: () => settings.dictionary || [], save: (list) => update({ dictionary: list }).then(draw) }) }, icon('pen', 13), 'Edit Dictionary…')),
        h('div', { class: 'st-row st-proof' }, h('span', {}, 'Rules'),
          h('span', { class: 'st-proof-sum' }, changed ? `${changed} changed by you` : 'Harper’s defaults'),
          h('button', { type: 'button', class: 'btn small', onclick: () => openRules(sheetFn, { get: () => settings.lintRules || {}, save: (r) => update({ lintRules: r }), dialect: settings.spellDialect || 'american' }) }, icon('check', 13), 'Choose Rules…')))));
}

/** Settings › Goals: show or hide writing goals everywhere. */
function goalsSection(draw) {
  const box = h('input', { type: 'checkbox', checked: settings.goalsOn !== false });
  box.addEventListener('change', () => update({ goalsOn: box.checked }).then(draw));
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('target', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Writing Goals'),
      h('label', { class: 'st-check a11y-check' }, box, h('span', {}, h('b', {}, 'Show writing goals'),
        h('small', { class: 'hint' }, 'Book length, deadline countdown and daily goals. Turn off if you’d rather not see them — your goals and history are kept.')))));
}

/** Settings › Language: the language of menus and buttons (never of your book). */
function languageSection(draw) {
  const sel = h('select', { class: 'no-i18n', 'aria-label': 'Interface language' },
    LANGUAGES.map(([code, name, en]) => h('option', { value: code }, name === en ? name : `${name} — ${en}`)));
  sel.value = settings.uiLanguage || 'en-US';
  sel.addEventListener('change', () => update({ uiLanguage: sel.value }).then(draw));
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('globe', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Language'),
      h('label', { class: 'st-row' }, h('span', {}, 'Interface language'), sel),
      h('p', { class: 'hint' }, 'Menus, buttons and labels. Your book’s own language is set in Book › General.'),
      sel.value === 'lkt' ? h('p', { class: 'hint' }, 'Lakȟótiyapi is just beginning: a few words are in place and the rest shows in English until fluent speakers contribute translations.') : null));
}

/** Settings › Vision & Comfort: text size, contrast, an easier-to-read font, calmer motion. */
function a11ySection(draw) {
  const check = (key, label, hint) => {
    const box = h('input', { type: 'checkbox', checked: !!settings[key] });
    box.addEventListener('change', () => update({ [key]: box.checked }).then(draw));
    return h('label', { class: 'st-check a11y-check' }, box, h('span', {}, h('b', {}, label), h('small', { class: 'hint' }, hint)));
  };
  // Text size: the whole window, in a few clear steps (⇧⌘+ / ⇧⌘− go between them, and 90% and 110%).
  const sizes = [[1, 'Default', '100%'], [1.25, 'Large', '125%'], [1.5, 'Larger', '150%'], [1.75, 'Largest', '175%'], [2, 'Extra Large', '200%']];
  const zoom = Number(settings.uiZoom) || 1;
  const contrast = Number.isInteger(settings.contrast) ? settings.contrast : settings.a11yContrast ? 1 : 0;
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('eye', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Vision & Comfort'),
      h('div', { class: 'st-row st-row-wide' }, h('span', {}, 'Text size'),
        h('div', { class: 'size-steps', role: 'radiogroup', 'aria-label': 'Text size' }, sizes.map(([v, label, pct], i) => {
          const on = Math.abs(zoom - v) < 0.001;
          return h('button', { type: 'button', class: `size-step${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), title: `${label} — ${pct}`, onclick: () => update({ uiZoom: v }).then(draw) },
            h('span', { class: 'size-a', style: { fontSize: `${12 + i * 3}px` } }, 'A'), h('span', { class: 'size-name' }, label), h('small', {}, pct));
        })),
        h('small', { class: 'hint' }, `Makes all the words and controls in the window larger. Also in View › Text Size, or ${B.platform === 'darwin' ? '⇧⌘+ and ⇧⌘−' : 'Ctrl+Shift+Plus and Ctrl+Shift+Minus'}. The editor and the previews have their own text size as well.${[1, 1.25, 1.5, 1.75, 2].some((v) => Math.abs(zoom - v) < 0.001) ? '' : ` Now: ${Math.round(zoom * 100)}%.`}`)),
      h('div', { class: 'st-row st-row-wide' }, h('span', {}, 'Contrast'),
        segmented([{ value: '-1', label: 'Softer' }, { value: '0', label: 'Standard' }, { value: '1', label: 'Stronger' }, { value: '2', label: 'Strongest' }], String(contrast), (v) => update({ contrast: Number(v) }).then(draw), { label: 'Contrast' }),
        h('small', { class: 'hint' }, 'Works with every skin. Softer: gentler gray text, for glare. Stronger: darker secondary text, clearer lines and a fainter pattern. Strongest: all text at full strength, bold lines, no pattern and underlined links. The High Contrast skin goes further still.')),
      h('label', { class: 'st-row' }, h('span', {}, 'Formatting toolbar'),
        segmented([{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }], settings.toolbarPos === 'bottom' ? 'bottom' : 'top', (v) => setToolbarPos(v).then(draw), { label: 'Formatting toolbar' })),
      h('label', { class: 'st-row' }, h('span', {}, 'Panel order'),
        (() => {
          const sel = h('select', { 'aria-label': 'Panel order' }, PANE_ORDERS.map((o) => h('option', { value: o.join(',') }, paneOrderLabel(o))));
          sel.value = paneOrder().join(',');
          sel.addEventListener('change', () => setPaneOrder(sel.value.split(',')).then(draw));
          return sel;
        })(),
        h('small', { class: 'hint' }, 'Left to right. You can also right-click the top of any panel to move it left or right.')),
      h('label', { class: 'st-row' }, h('span', {}, 'Editor font'),
        (() => {
          const sel = h('select', { 'aria-label': 'Editor font' }, h('option', { value: '' }, 'Default (Literata)'),
            EDITOR_FONTS.map((f) => h('option', { value: f.id, style: { fontFamily: fontStack(f.id) } }, f.family + (f.note ? ` — ${f.note}` : ''))));
          sel.value = settings.editorFont || '';
          sel.addEventListener('change', () => update({ editorFont: sel.value }).then(draw));
          return sel;
        })(),
        h('small', { class: 'hint' }, 'Only the editor changes, unless you match the book below.')),
      (() => {
        const box = h('input', { type: 'checkbox', checked: !!settings.editorFontSync });
        box.addEventListener('change', () => update({ editorFontSync: box.checked }).then(draw));
        return h('label', { class: 'st-check a11y-check' }, box, h('span', {}, h('b', {}, 'Use the editor font in the book too'),
          h('small', { class: 'hint' }, 'The open book’s e-book preview, print preview and PDF use the editor font. Turn it off and the book keeps that font until you choose another under the preview.')));
      })(),
      h('label', { class: 'st-row' }, h('span', {}, 'Editor line spacing'),
        segmented([{ value: 'normal', label: 'Normal' }, { value: 'relaxed', label: 'Relaxed' }, { value: 'loose', label: 'Loose' }], settings.a11ySpacing || 'normal', (v) => update({ a11ySpacing: v }).then(draw), { label: 'Editor line spacing' })),
      check('a11yFont', 'Easier-to-read font', 'Uses Atkinson Hyperlegible — designed for low vision — for menus, the binder and the editor. Your book keeps its own fonts.'),
      check('a11yFocus', 'Always show a bold focus ring', 'A thick outline around whatever has keyboard focus, so you never lose your place.'),
      check('a11yMotion', 'Reduce motion', 'Turns off animations and sliding panels.'),
      h('p', { class: 'hint' }, 'Also: the editor text size goes from 25% to 300%; every control has a keyboard shortcut or tooltip; and screen readers can read equations from their LaTeX alt text.')));
}

const pretty = (p, home) => (p ? (home && p.startsWith(home) ? `~${p.slice(home.length)}` : p) : '');

let sheetFn = null; // the window maker, for the Dictionary and Rules windows opened from Settings
export function openSettings(sheet) {
  sheetFn = sheet;
  const body = h('div', { class: 'settings' });
  const draw = () => {
    const lib = settings.libraryDir || settings.defaultLibraryDir;
    const secs = h('input', { type: 'number', min: 1, max: 600, step: 1, value: String(settings.autosaveSeconds), class: 'st-secs', 'aria-label': 'Seconds after a change' });
    secs.addEventListener('change', () => update({ autosaveSeconds: Number(secs.value) || 5 }).then(draw));
    const remember = h('input', { type: 'checkbox', checked: settings.rememberLastDir });
    remember.addEventListener('change', () => update({ rememberLastDir: remember.checked }));
    body.replaceChildren(
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon(isDark() ? 'moon' : 'sun', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Appearance'),
          segmented([{ value: 'system', label: 'System' }, { value: 'light', label: 'Day', icon: 'sun' }, { value: 'dark', label: 'Night', icon: 'moon' }], settings.theme || 'system', (v) => setTheme(v).then(() => setTimeout(draw, 50)), { label: 'Appearance' }),
          h('p', { class: 'hint' }, 'System follows your computer’s light or dark setting. The sun/moon button in the title bar switches quickly. Book previews keep their own page colors.'),
          h('h3', { class: 'st-sub' }, 'Skin'),
          skinPicker(draw),
          h('p', { class: 'hint' }, 'Colors and textures for Lutefisk Book Editor itself, in day and night. Your book’s design is set by its template.'))),
      languageSection(draw),
      goalsSection(draw),
      spellSection(draw),
      a11ySection(draw),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('folder', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Projects folder'),
          h('p', { class: 'hint' }, 'New books are created here, and the Library lists every book in it.'),
          h('div', { class: 'st-path' }, h('code', {}, lib || '—'),
            h('button', { class: 'btn small', onclick: async () => { const p = await B.chooseSettingsDir('libraryDir'); if (p) { settings.libraryDir = p; draw(); toast('New projects will be saved there', 'ok', 1600); } } }, 'Change…'),
            h('button', { class: 'btn small plain', onclick: () => B.revealSettingsDir('libraryDir') }, 'Show'),
            settings.libraryDir ? h('button', { class: 'btn small plain', onclick: () => update({ resetLibraryDir: true }).then(draw) }, 'Use Default') : null))),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('save', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Saving'),
          segmented([{ value: 'auto', label: 'Automatically' }, { value: 'manual', label: 'Manually' }], settings.autosave ? 'auto' : 'manual', (v) => update({ autosave: v === 'auto' }).then(draw), { label: 'Saving' }),
          settings.autosave
            ? h('label', { class: 'st-row' }, h('span', {}, 'Save'), secs, h('span', {}, `second${settings.autosaveSeconds === 1 ? '' : 's'} after a change`))
            : h('p', { class: 'hint' }, `Save with ${B.platform === 'darwin' ? '⌘S' : 'Ctrl+S'}. If you leave a project or quit with unsaved changes, Lutefisk Book Editor asks first.`),
          settings.autosave ? h('p', { class: 'hint' }, 'While you keep typing, it still saves at least every 30 seconds.') : null)),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('history', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Folders'),
          h('label', { class: 'st-check' }, remember, h('span', {}, 'Open and save dialogs start in the last folder you used')))),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('download', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Backups'),
          h('p', { class: 'hint' }, 'Back Up makes a .zip of a whole project. Use it from a project’s ⋯ menu in the Library, or File › Back Up This Project.'),
          h('div', { class: 'st-path' }, h('code', {}, settings.backupDir || 'Ask each time'),
            h('button', { class: 'btn small', onclick: async () => { const p = await B.chooseSettingsDir('backupDir'); if (p) { settings.backupDir = p; draw(); } } }, 'Change…'),
            settings.backupDir ? h('button', { class: 'btn small plain', onclick: () => B.revealSettingsDir('backupDir') }, 'Show') : null))),
      h('p', { class: 'hint st-foot' }, icon('eye', 13), 'Settings are stored only on this computer, in Lutefisk Book Editor’s own data folder.'));
    // Sections in alphabetical order of their titles, in the interface language; the note stays last.
    const title = (sec) => t(sec.querySelector('h3')?.textContent || '');
    const sections = [...body.querySelectorAll(':scope > .st-sec')].sort((a, b) => title(a).localeCompare(title(b), getLanguage()));
    body.prepend(...sections);
  };
  draw();
  sheet('Settings', body, { side: true });
}

/**
 * Back Up Book: like Save As for a copy — beside the book, in your backup folder,
 * or anywhere you choose; as one .zip file or as a plain folder copy.
 */
export async function backupDialog(app, saveFirst) {
  if (!app.book) return null;
  let where = 'beside';
  let asFolder = false;
  const radio = (name, value, label, sub, checked, on) => {
    const r = h('input', { type: 'radio', name, value, checked });
    r.addEventListener('change', () => on(value));
    return h('label', { class: 'bu-opt' }, r, h('span', {}, h('b', {}, label), sub ? h('small', { class: 'hint' }, sub) : null));
  };
  const body = h('div', { class: 'bu-body' },
    h('div', { class: 'bu-group' }, h('div', { class: 'bu-head' }, 'Save the backup'),
      radio('bu-where', 'beside', 'In the same folder as the book', 'Next to the book’s own folder.', true, (v) => { where = v; }),
      settings.backupDir ? radio('bu-where', 'backup', 'In your backup folder', pretty(settings.backupDir), false, (v) => { where = v; }) : null,
      radio('bu-where', 'choose', 'In another folder…', 'You choose the folder next.', false, (v) => { where = v; })),
    h('div', { class: 'bu-group' }, h('div', { class: 'bu-head' }, 'As'),
      radio('bu-as', 'zip', 'One .zip file', 'Easy to keep, e-mail or restore.', true, () => { asFolder = false; }),
      radio('bu-as', 'folder', 'A copy of the book folder', 'Opens in Lutefisk Book Editor like any book.', false, () => { asFolder = true; })),
    h('p', { class: 'hint' }, 'The backup is named with the book’s title and today’s date and time. Your book is saved first.'));
  const ok = await dialog({ title: `Back Up “${app.book.title || 'Untitled'}”`, body, ok: 'Back Up' });
  if (!ok) return null;
  await saveFirst?.();
  return backupProject(null, { where: where === 'beside' ? 'beside' : undefined, choose: where === 'choose', asFolder });
}

/** Back up a project (the open one when dir is omitted) and report where it went. */
export async function backupProject(dir, { choose = false, where, asFolder = false } = {}) {
  try {
    const res = await B.backupProject({ dir, choose, where, asFolder });
    if (!res) return null;
    const mb = res.bytes / (1024 * 1024);
    toast(`Backed up${res.folder ? ' as a folder' : ''} (${mb < 1 ? `${Math.max(1, Math.round(res.bytes / 1024))} KB` : `${mb.toFixed(1)} MB`}) to ${pretty(res.dir)}`, 'ok', 4000);
    try { B.revealBackup(res.file); } catch { /* ignore */ }
    return res;
  } catch (err) { toast(`Backup failed: ${String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error', 6000); return null; }
}
