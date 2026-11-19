// Lutefisk renderer: library, application shell, section management, live
// preview wiring, autosave and exports.
import { h, icon, dialog, toast, confirmDialog, debounce, assetUrl, popover, closePopovers, segmented, generatedCover, timeAgo, brandMark, installTooltips, rangeBubble, arrowKeysStepSelects, newCoverTone } from './ui.js';
import { createEditor, createMiniEditor, setQuoteMode } from './editor.js';
import { createDevicePreview } from './preview-device.js';
import { createPrintPreview } from './preview-print.js';
import { openBookSettings, openTemplates, generatedPanel, sheet, allTemplates, applyTemplate, genreSelect, loglineField, loglineSentences } from './panels.js';
import { openTemplateEditor } from './template-editor.js';
import { titleCheckButton, recaseAll } from './title-check.js';
import { bookTitleStyle } from '../shared/titlecase.js';
import { openHelp, startTour, resumeTour } from './help.js';
import { toBin, binCount, openRecycleBin } from './bin.js';
import { blockStyles } from '../shared/blockstyle.js';
import { createGoals, goalMeter, openGoals, stopwatchControl, sessionPopover, ensureGoalDefaults, progressMeters } from './goals.js';
import { openInsights } from './history.js';
import { openCharacters, suggestNames } from './characters.js';
import { openPlot } from './plot.js';
import { createSearch } from './search.js';
import { replaceInMarkdown, typoMarkdown } from './editor.js';
import { loadSettings, settings, setSkin, setTheme, autosaver, openSettings, backupProject, backupDialog, themeButton, onSettings, addDictionaryWord, updateSettings, setToolbarPos, paneOrder, setPaneOrder, PANE_ORDERS, paneOrderLabel, EDITOR_FONTS } from './settings.js';
import { setDictionary, setRules, warmUp, setIgnored, ignoredList, unignore, proofCounts, setSentenceSpacing } from './spellcheck.js';
import { countMentions, newCharacter } from '../shared/characters.js';
import { createCommentRail } from './comments.js';
import { GROUPS, SECTION_TYPES, DEFAULT_CONTENT, defaultBook, ensureSections, newId, numberSections, aboutAuthorsLabel, syncAuthors } from '../shared/sections.js';
import { renderSection, prepare, citer } from '../shared/bookhtml.js';
import { TRIMS } from '../shared/print.js';
import { joinScenes, splitAtBreaks, countBlocks, sceneSnippet, proseText } from '../shared/scenes.js';
import { formatEntry, sortKey, entryFromUrl , localToday } from '../shared/citations.js';
import { createMarkdown } from '../shared/markdown.js';
import { editSource } from './source-editor.js';
import { openMathDialog } from './math-dialog.js';
import { openSymbolPicker } from './symbol-picker.js';
import { looksLikeUrl } from '../shared/linkinfo.js';
import { researchPanel, researchReference, newResearchItem, isTextItem, RESEARCH_LABEL } from './research.js';
import { templateById, TEMPLATES, setCustomTemplates } from '../shared/templates.js';
import { fontStack } from '../shared/fonts.js';

const B = window.lutefisk;
document.documentElement.classList.add(`os-${B.platform}`);

const app = {
  book: null,
  contents: {},
  currentId: null,
  previewId: null, // section shown in the preview (follows the editor while typing)
  dirtyFiles: new Set(),
  removed: [],
  dirtyNotes: new Set(),
  removedNotes: [],
  expanded: new Set(),
  pinnedId: null,
  metaDirty: false,
  view: 'device',
  htmlCache: new Map(),
};

const root = document.getElementById('app');
const els = {};
let mode = 'library'; // 'library' | 'book'
const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const countWords = (t) => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;

/* ================================================================ zoom */

const ZOOMS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const ZMIN = 25, ZMAX = 300;
let editorZoom = (() => { try { return Math.min(ZMAX, Math.max(ZMIN, Number(localStorage.getItem('lutefisk.editorZoom')) || 110)); } catch { return 110; } })();
function applyZoom() {
  document.documentElement.style.setProperty('--editor-zoom', String(editorZoom / 100));
  if (els.zoomRange && Number(els.zoomRange.value) !== editorZoom) { els.zoomRange.value = String(editorZoom); els.zoomBubble?.(); }
  try { localStorage.setItem('lutefisk.editorZoom', String(editorZoom)); } catch { /* storage unavailable */ }
}
function zoom(dir) {
  if (dir === 0) editorZoom = 100;
  else if (!ZOOMS.includes(editorZoom)) editorZoom = Math.max(ZMIN, Math.min(ZMAX, editorZoom + dir * 10));
  else {
    const i = ZOOMS.findIndex((z) => z >= editorZoom);
    editorZoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (ZOOMS[i] === editorZoom ? i : dir > 0 ? i - 1 : i) + dir))];
  }
  applyZoom();
}
applyZoom();

/* ============================================================== library */

/** In manual-save mode, ask before leaving a project with unsaved changes. Returns false to keep it open. */
async function confirmLeave() {
  if (settings.autosave) return true;
  const dirty = app.book && (app.metaDirty || app.dirtyFiles.size || app.removed.length || app.dirtyNotes.size || app.removedNotes.length || pendingSerialize);
  if (!dirty) return true;
  B.closeHold();
  const keep = await dialog({ title: 'Save your changes?', message: 'This project has changes that haven’t been saved.', ok: 'Save', cancel: 'Don’t Save' });
  if (!keep) discardChanges = true;
  return true;
}
let discardChanges = false;

async function showLibrary() {
  closePopovers();
  await confirmLeave();
  if (app.book) { if (!discardChanges) await save(); app.goals.stopwatchStop(); app.goals.measured(true); app.goals.archiveSession(); await app.goals.flush(); }
  discardChanges = false;
  if (app.book) await B.closeBook().catch(() => {});
  mode = 'library';
  document.title = 'Lutefisk Book Editor';
  let data = { books: [], libraryDir: '', home: '' };
  try { data = await B.library(); } catch (err) { toast(clean(err), 'error'); }
  const pretty = (p) => (data.home && p.startsWith(data.home) ? p.slice(data.home.length + 1) : p).split(/[\\/]/).filter(Boolean).join(' › ');

  const grid = h('div', { class: 'lib-grid' });
  grid.append(h('button', { class: 'lib-new', onclick: () => newBookSheet(data) },
    h('div', { class: 'lib-new-cover' }, icon('plus', 34)), h('div', { class: 'lib-meta' }, h('b', {}, 'New Book'), h('span', {}, 'Start writing'))));
  for (const b of data.books) {
    const cover = b.cover ? h('img', { src: b.cover, alt: '' }) : generatedCover(b.title, b.author, fontStack(templateById(b.template).head), b.subtitle, b.coverTone);
    const more = h('button', { class: 'lib-more', title: 'More', 'aria-label': `More options for ${b.title}`, onclick: (e) => {
      e.stopPropagation();
      popover(more, [
        { label: 'Open', icon: 'book', onClick: () => openRecent(b.dir) },
        { label: B.platform === 'darwin' ? 'Show in Finder' : 'Show in Folder', icon: 'folder', onClick: () => B.revealPath(b.dir) },
        { label: 'Back Up…', icon: 'download', onClick: () => backupProject(b.dir, { choose: !settings.backupDir }) },
        '-',
        { label: 'Remove from Recents', icon: 'minus', onClick: async () => { await B.forgetBook(b.dir); showLibrary(); } },
        { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteProject(b) },
      ], { align: 'right' });
    } }, icon('more', 18));
    grid.append(h('div', { class: 'lib-book', tabindex: 0, role: 'button', 'aria-label': `Open ${b.title}`,
      onclick: () => openRecent(b.dir), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecent(b.dir); } } },
    h('div', { class: 'lib-cover' }, cover, h('div', { class: 'lib-spine' })), more,
    h('div', { class: 'lib-meta' }, h('b', { title: b.title }, b.title), h('span', {}, b.author || 'No author'),
      h('small', {}, `${b.genre ? `${b.genre} · ` : ''}${b.words.toLocaleString()} words · ${timeAgo(b.modified)}`),
      libGoal(b))));
  }

  // Under each book: how far it is toward its goal, and the days left before the deadline.
  function libGoal(b) {
    if (settings.goalsOn === false || !b.goal) return null;
    const parts = [];
    let pct = null;
    if (b.goal.targetWords) { pct = Math.min(1, b.words / b.goal.targetWords); parts.push(`${Math.floor(pct * 100)}% of goal`); }
    let late = false;
    if (b.goal.deadline) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.round((new Date(`${b.goal.deadline}T00:00`) - today) / 86400000);
      late = days < 0 && (pct ?? 0) < 1;
      parts.push(pct === 1 ? 'Done' : days > 1 ? `${days.toLocaleString()} days left` : days === 1 ? '1 day left' : days === 0 ? 'Due today' : `${(-days).toLocaleString()} day${days === -1 ? '' : 's'} overdue`);
    }
    if (!parts.length) return null;
    return h('div', { class: `lib-goal${late ? ' late' : ''}`, title: `Goal: ${b.goal.targetWords ? `${b.goal.targetWords.toLocaleString()} words` : ''}${b.goal.deadline ? ` by ${new Date(`${b.goal.deadline}T12:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}` },
      pct != null ? h('span', { class: 'lib-goal-bar' }, h('i', { style: { width: `${Math.round(pct * 100)}%` } })) : null,
      h('span', { class: 'lib-goal-txt' }, parts.join(' · ')));
  }
  const view = h('div', { class: 'library' },
    h('div', { class: 'lib-titlebar drag' }),
    h('div', { class: 'lib-brand' }, brandMark(52, 'lib-brand-mark'), h('div', {}, h('div', { class: 'brand-word' }, 'Lutefisk Book Editor'), h('div', { class: 'brand-tag' }, 'Write, design and publish books, privately.')),
),
    h('header', { class: 'lib-head' },
      h('div', {}, h('h1', {}, 'Library'), h('p', {}, data.books.length ? `${data.books.length} ${data.books.length === 1 ? 'book' : 'books'}` : 'Your books will appear here.')),
      h('div', { class: 'lib-actions' },
        h('button', { class: 'btn', title: 'Open a book folder', onclick: openBook }, icon('folder', 16), 'Open…'),
        h('button', { class: 'btn primary', onclick: () => newBookSheet(data) }, icon('plus', 16), 'New Book'),
        h('div', { class: 'lib-tools' },
          h('button', { class: 'lib-gear', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings(sheet) }, icon('gear', 20)),
          themeButton(),
          h('button', { class: 'lib-gear', title: 'Help — how to make your first book, and a guided tour (F1)', 'aria-label': 'Help', onclick: () => openHelp(app) }, icon('help', 20))))),
    h('main', { class: 'lib-scroll' }, grid,
      !data.books.length ? h('div', { class: 'lib-empty' }, brandMark(96, 'lib-empty-mark'), h('p', {}, 'Create your first book, or drag a book folder onto this window.'),
        h('div', { class: 'lib-empty-acts' },
          h('button', { class: 'btn primary', onclick: () => newBookSheet(data) }, icon('plus', 15), 'New Book'),
          h('button', { class: 'btn', onclick: () => startTour(app) }, icon('play', 14), 'Show Me How'),
          h('button', { class: 'btn plain', onclick: () => openHelp(app) }, icon('help', 15), 'Help'))) : null),
    h('footer', { class: 'lib-foot' }, icon('eye', 14), h('span', {}, `New books are saved to ${pretty(data.libraryDir)}. Everything stays on this computer — no accounts, no cloud, no tracking.`)),
    h('div', { class: 'drop-hint' }, h('div', {}, icon('folder', 40), h('b', {}, 'Drop to open book'))));
  root.replaceChildren(view);
  app.book = null;
}

async function deleteProject(b) {
  const kind = 'book';
  const ok = await dialog({
    title: `Delete “${b.title || 'Untitled'}”?`,
    message: `The whole ${kind} folder — every chapter, image and note in it — moves to the ${B.platform === 'darwin' ? 'Trash' : B.platform === 'win32' ? 'Recycle Bin' : 'Trash'}. You can restore it from there until you empty it.`,
    ok: `Delete ${kind[0].toUpperCase()}${kind.slice(1)}`,
  });
  if (!ok) return;
  try { await B.deleteProject(b.dir); toast(`Moved “${b.title || 'Untitled'}” to the ${B.platform === 'win32' ? 'Recycle Bin' : 'Trash'}`, 'ok', 3000); } catch (err) { toast(clean(err), 'error', 6000); }
  showLibrary();
}

/** Back Up Book: a copy of the whole book folder, beside it or anywhere you choose. */
app.backupBook = () => backupDialog(app, () => save());

/** Delete the open book (Book settings › General): asks first, then moves its folder to the Trash. */
app.deleteOpenBook = async () => {
  const title = app.book?.title || 'Untitled';
  const bin = B.platform === 'win32' ? 'Recycle Bin' : 'Trash';
  const ok = await dialog({
    title: `Delete “${title}”?`,
    message: `The whole book folder — every chapter, image, note and backup inside it — moves to the ${bin}. You can restore it from there until you empty it.`,
    fields: [{ name: 'confirm', label: `Type the book’s title to confirm: ${title}`, placeholder: title }],
    ok: 'Delete Book',
  });
  if (!ok) return false;
  if (ok.confirm.trim().toLowerCase() !== title.trim().toLowerCase()) { toast('The title didn’t match — the book was not deleted', 'error', 3500); return false; }
  for (const o of document.querySelectorAll('.overlay')) o.remove();
  try {
    await save();
    app.goals.archiveSession(); await app.goals.flush();
    await B.deleteOpenBook();
  } catch (err) { toast(clean(err), 'error', 6000); return false; }
  app.book = null;
  app.dirtyFiles?.clear(); app.metaDirty = false;
  toast(`Moved “${title}” to the ${bin}`, 'ok', 3000);
  discardChanges = true;
  showLibrary();
  return true;
};

async function newBookSheet(lib) {
  let parent = lib.newBookDir || lib.libraryDir;
  // Location: the book's own folder, in full — where it goes plus the folder named after the title (as the main process names it).
  const folderName = () => String(title.value.trim() || 'Untitled Book').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().slice(0, 80).trim().replace(/\s+/g, '-') || 'Untitled-Book';
  const fullPath = (p) => `${p.replace(/[\\/]+$/, '')}${p.includes('\\') ? '\\' : '/'}${folderName()}`;
  const title = h('input', { type: 'text', placeholder: 'Untitled Book', 'aria-label': 'Title' });
  const subtitle = h('input', { type: 'text', placeholder: 'Optional', 'aria-label': 'Subtitle' });
  const author = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Author' });
  let genre = '';
  const genreSel = genreSelect(() => genre, (g) => { genre = g; });
  // Its own cover color, unlike the books already in the library.
  const tone = newCoverTone(lib.books || []);
  // The logline: required — the story in one or two sentences.
  const ll = { logline: '' };
  const loglineBox = loglineField(ll, () => {}, { required: true, rows: 3 });
  // Design: a list where ↑ ↓ and pointing show each design on the book; only a click or Return chooses it.
  let design = 'classic', shown = '';
  const GROUPS_ = ['General', 'Fiction', 'Literary', 'Nonfiction'].map((c) => ({ c, items: TEMPLATES.filter((t) => t.category === c).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length);
  const order = GROUPS_.flatMap((g) => g.items.map((t) => t.id));
  const tplText = h('span', { class: 'nb-dbtn-text' });
  const tplBtn = h('button', { type: 'button', class: 'nb-dbtn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: 'Design — ↑ ↓ or point to see each one on the book; click or Return chooses' }, tplText, icon('chevronUpDown', 12));
  const tplWrap = h('div', { class: 'nb-design' }, tplBtn);
  let dlist = null, active = design;
  const syncBtn = () => { tplText.textContent = templateById(design).name; tplBtn.setAttribute('aria-label', `Design: ${templateById(design).name}`); };
  const rowsOf = () => (dlist ? [...dlist.querySelectorAll('.nb-ditem')] : []);
  const markActive = () => { for (const r of rowsOf()) { const on = r.dataset.value === active; r.classList.toggle('active', on); r.setAttribute('aria-selected', String(on)); if (on) r.scrollIntoView({ block: 'nearest' }); } };
  const closeList = (keep) => {
    if (!dlist) return;
    if (keep) design = keep;
    dlist.remove(); dlist = null;
    tplBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    syncBtn(); shown = ''; showDesign(design);
    tplBtn.focus();
  };
  function outside(e) { if (dlist && !dlist.contains(e.target) && !tplBtn.contains(e.target)) closeList(); }
  const step = (n) => { const i = order.indexOf(active); active = order[Math.max(0, Math.min(order.length - 1, (i < 0 ? 0 : i) + n))]; markActive(); showDesign(active); };
  const openList = () => {
    if (dlist) { closeList(); return; }
    active = design;
    let moved = false; // only real mouse movement shows a design, not a list opening under a resting pointer
    dlist = h('div', { class: 'nb-dlist', role: 'listbox', tabindex: '-1', 'aria-label': 'Design',
      onkeydown: (e) => {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowRight') step(1);
        else if (k === 'ArrowUp' || k === 'ArrowLeft') step(-1);
        else if (k === 'PageDown') step(8);
        else if (k === 'PageUp') step(-8);
        else if (k === 'Home') step(-order.length);
        else if (k === 'End') step(order.length);
        else if (k === 'Enter' || k === ' ') closeList(active);
        else if (k === 'Escape' || k === 'Tab') closeList();
        else return;
        e.preventDefault(); e.stopPropagation();
      },
      onmouseleave: () => showDesign(active) },
    GROUPS_.map((g) => h('div', { class: 'nb-dgroup', role: 'group', 'aria-label': g.c }, h('div', { class: 'nb-dhead' }, g.c),
      g.items.map((t) => h('div', { class: 'nb-ditem', role: 'option', 'data-value': t.id,
        onmousemove: () => { if (!moved) { moved = true; return; } showDesign(t.id); },
        onclick: () => closeList(t.id) }, t.name)))));
    tplWrap.append(dlist);
    {
      // Below the button when there's room, else above; always inside the window.
      const r = tplBtn.getBoundingClientRect();
      const below = innerHeight - r.bottom - 12, above = r.top - 12;
      const down = below >= 240 || below >= above;
      Object.assign(dlist.style, { position: 'fixed', left: `${r.left}px`, width: `${r.width}px`, right: 'auto', bottom: 'auto',
        maxHeight: `${Math.min(340, down ? below : above)}px`, top: down ? `${r.bottom + 4}px` : 'auto' });
      if (!down) { dlist.style.top = 'auto'; dlist.style.bottom = `${innerHeight - r.top + 4}px`; }
    }
    tplBtn.setAttribute('aria-expanded', 'true');
    markActive();
    dlist.focus();
    document.addEventListener('mousedown', outside, true);
  };
  tplBtn.addEventListener('click', openList);
  tplBtn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList(); } });
  syncBtn();
  let titleStyle = 'apa'; // same default as citations
  const tcOpts = { getStyle: () => titleStyle, setStyle: (id) => { titleStyle = id; } };
  try { author.value = localStorage.getItem('lutefisk.author') || ''; } catch { /* ignore */ }
  const locLbl = h('span', { class: 'loc-path' });
  const drawLoc = () => { locLbl.textContent = fullPath(parent); locLbl.title = fullPath(parent); };
  const preview = h('div', { class: 'nb-preview' });
  // The cover shows the design being looked at (its type); the design name under it.
  const pageName = h('div', { class: 'nb-page-name' });
  const draw = () => {
    const t = templateById(shown || design);
    preview.replaceChildren(generatedCover(title.value || 'Untitled Book', author.value, fontStack(t.head), subtitle.value.trim(), tone), h('div', { class: 'lib-spine' }));
  };
  function showDesign(id) {
    if (id === shown) return;
    shown = id;
    const t = templateById(id);
    pageName.textContent = t.name + (id === design ? '' : ' — preview');
    draw();
  }

  const authorLbl = h('span', {}, 'Author');
  for (const el of [title, subtitle, author]) el.addEventListener('input', draw);
  title.addEventListener('input', drawLoc);
  drawLoc();
  showDesign(design);
  const create = h('button', { type: 'submit', class: 'btn primary' }, 'Create Book');
  const form = h('form', { class: 'nb-form' },
    h('label', { class: 'fld' }, h('span', {}, 'Title'), h('div', { class: 'title-row' }, title, titleCheckButton(title, tcOpts))),
    h('label', { class: 'fld book-only' }, h('span', {}, 'Subtitle'), h('div', { class: 'title-row' }, subtitle, titleCheckButton(subtitle, tcOpts))),
    h('label', { class: 'fld author-fld' }, authorLbl, author),
    h('label', { class: 'fld book-only' }, h('span', {}, 'Genre'), genreSel),
    loglineBox,
    h('div', { class: 'fld book-only' }, h('span', {}, 'Design'), tplWrap),
    h('div', { class: 'fld' }, h('span', {}, 'Location'), h('div', { class: 'loc-row' }, icon('folder', 16), locLbl,
      h('button', { type: 'button', class: 'btn small', onclick: async () => { const p = await B.chooseLocation(); if (p) { parent = p; drawLoc(); } } }, 'Change…'))),
    h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'), create));
  const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') close(); } },
    h('div', { class: 'dlg nb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'New Book' },
      h('div', { class: 'nb-side' }, preview, pageName), h('div', { class: 'nb-main' }, h('h2', {}, 'New Book'), form)));
  const close = () => overlay.remove();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const logline = ll.logline.trim();
    if (!logline || loglineSentences(logline) > 2) {
      const ta = loglineBox.textarea;
      ta.setCustomValidity(!logline ? 'What’s the book about? Tell it in one or two sentences.' : 'Keep the logline to one or two sentences.');
      ta.reportValidity(); ta.focus();
      return;
    }
    create.disabled = true;
    const book = ensureSections(defaultBook({ title: title.value.trim() || 'Untitled Book', subtitle: subtitle.value.trim(), author: author.value.trim() }));
    book.template = design;
    if (genre) book.genre = genre;
    book.logline = logline;
    book.coverTone = tone;
    ensureGoalDefaults(book, Date.now());
    if (titleStyle !== 'apa') book.titleStyle = titleStyle;
    book.uuid = crypto.randomUUID();
    try { localStorage.setItem('lutefisk.author', author.value.trim()); } catch { /* ignore */ }
    const contents = {};
    for (const s of book.sections) contents[s.id] = DEFAULT_CONTENT[s.type] || '';
    // The first chapter starts with one scene, “Scene One”.
    {
      const ch = book.sections.find((s) => s.type === 'chapter');
      const sc = { id: newId('sce'), title: 'Scene One', stats: { created: new Date().toISOString(), days: {} } };
      ch.scenes = [sc];
      contents[ch.id] = '';
      contents[sc.id] = '';
    }
    try {
      const data = await B.newBook({ book, contents, parent });
      close();
      if (data) loadBookData(data);
    } catch (err) { create.disabled = false; toast(clean(err), 'error', 6000); }
  });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  title.focus();
}

async function openBook() {
  try {
    const data = await B.openBook();
    if (!data) return;
    await confirmLeave();
    if (app.book && !discardChanges) await save();
    discardChanges = false;
    loadBookData(data);
  } catch (err) { toast(clean(err), 'error', 6000); }
}
async function openRecent(dir) {
  try { loadBookData(await B.openRecent(dir)); } catch (err) { toast(clean(err), 'error', 6000); }
}

// Drag a book folder (or its lutefisk.yaml) onto the window to open it.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dropping'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragDepth = 0; document.body.classList.remove('dropping');
  const f = e.dataTransfer.files[0];
  if (!f || (app.book && e.target.closest?.('.ProseMirror'))) return;
  try { const data = await B.openDropped(f); if (app.book) await save(); loadBookData(data); } catch (err) { toast(clean(err), 'error', 6000); }
});

/* =============================================================== shell */

function buildShell() {
  els.docTitle = h('div', { class: 'doc-title' });
  els.save = h('div', { class: 'doc-sub', 'aria-live': 'polite' });
  const tbBtn = (ic, label, onClick, extra = {}) => h('button', { class: 'tb-item', title: label, onclick: onClick, ...extra }, icon(ic, 18), h('span', {}, label));
  const exportBtn = h('button', { class: 'btn primary export-btn', onclick: () => popover(exportBtn, [
    { header: 'Export as' },
    { label: 'EPUB', hint: 'E-readers & stores', icon: 'book', onClick: () => doExport('epub') },
    { label: 'Markdown', hint: '.md + images', icon: 'textSize', onClick: () => doExport('md') },
    { label: 'MOBI', hint: 'older Kindles', icon: 'device', onClick: () => doExport('mobi') },
    { label: 'PDF', hint: 'Print-ready', icon: 'print', onClick: () => doExport('pdf') },
    { label: 'Rich Text', hint: '.rtf', icon: 'doc', onClick: () => doExport('rtf') },
    { label: 'Text', hint: '.txt — plain text', icon: 'textSize', onClick: () => doExport('txt') },
    { label: 'Word', hint: '.docx', icon: 'doc', onClick: () => doExport('docx') },
  ], { align: 'right', width: 230 }) }, icon('share', 15), 'Export');

  const titlebar = h('header', { class: 'titlebar drag' },
    h('div', { class: 'tb-left' },
      h('button', { class: 'tb-icon tb-brand', title: 'Lutefisk Book Editor Library (⇧⌘L)', 'aria-label': 'Library', onclick: showLibrary }, brandMark(22))),
    h('div', { class: 'tb-doc' }, els.docTitle, h('div', { class: 'tb-doc-sub' }, els.tbCount = h('span', { class: 'tb-count', 'aria-live': 'off' }), els.save,
      h('button', { class: 'tb-backup', title: 'Back Up Book — save a copy of the whole book folder, beside it or in another folder', onclick: () => app.backupBook() }, icon('download', 12), 'Back Up'))),
    h('div', { class: 'tb-right' }, exportBtn,
      h('div', { class: 'tb-tools' },
        els.layoutBtn = h('button', { class: 'tb-icon', title: 'Panel order — put the binder, editor and preview in any order', 'aria-label': 'Panel order', onclick: () => popover(els.layoutBtn, [
          { header: 'Panel order, left to right' },
          ...PANE_ORDERS.map((o) => ({ label: paneOrderLabel(o), icon: o.join() === paneOrder().join() ? 'check' : null, onClick: () => setPaneOrder(o) })),
        ], { align: 'right', width: 250 }) }, icon('columns', 18)),
        h('button', { class: 'tb-icon', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings(sheet) }, icon('gear', 18)),
        themeButton(),
        h('button', { class: 'tb-icon tb-help', title: 'Help — a short guide and a guided tour (F1)', 'aria-label': 'Help', onclick: () => openHelp(app) }, icon('help', 18)))));

  els.sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Sections' });
  els.secKind = h('div', { class: 'sec-kind' });
  // Opened from the Research window: a way back to it (Esc does the same).
  els.backToResearch = h('button', { type: 'button', class: 'back-research', hidden: true, title: 'Back to the Research window (Esc)', onclick: () => returnToResearch() }, icon('prev', 12), 'Research');
  els.secTitle = h('input', { class: 'sec-title', 'aria-label': 'Section title', placeholder: 'Title', spellcheck: 'true' });
  els.secSub = h('input', { class: 'sec-subtitle', 'aria-label': 'Chapter subtitle', placeholder: 'Subtitle (optional)', spellcheck: 'true', hidden: true });
  els.secSub.addEventListener('input', () => { const s = currentSection(); if (!s || currentScene()) return; if (els.secSub.value.trim()) s.subtitle = els.secSub.value; else delete s.subtitle; app.markDirty(); app.htmlCache?.clear?.(); schedulePreview(); });
  els.secSub.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.editor.focus(); } });
  els.commentsBtn = h('button', { class: 'ed-tool comments-btn', onclick: () => setCommentsHidden(!commentsHidden_()) });
  els.spellBtn = h('button', { class: 'ed-tool comments-btn proof-btn spell-btn', 'aria-label': 'Check spelling as you type', onclick: () => toggleLiveCheck('spell') });
  els.grammarBtn = h('button', { class: 'ed-tool comments-btn proof-btn grammar-btn', 'aria-label': 'Check grammar as you type', onclick: () => toggleLiveCheck('grammar') });
  // Story tools, top left of the editor: icons only; the hover tip names each one and says what it does.
  const toolBtn = (cls, ic, text, title, onclick) => h('button', { class: `ed-tool ${cls}`, title, 'aria-label': text, onclick }, icon(ic, 16));
  // Characters first (top left), with how many there are.
  els.castBtn = toolBtn('tool-chars', 'people', 'Characters', 'Characters — your cast and where each one appears', () => openCast());
  els.storyTools = h('div', { class: 'ed-tools', role: 'group', 'aria-label': 'Story tools' },
    els.castBtn, els.commentsBtn, els.spellBtn, els.grammarBtn,
    els.toolsBtn = toolBtn('tool-tools', 'wand', 'Tools', 'Tools — curly or straight quotes, and one or two spaces after punctuation', () => toolsMenu(els.toolsBtn)));
  els.headRow = h('span', { hidden: true }); // chapter heading style now lives in Book › Chapters and the templates
  els.chaptersBtn = h('button', { class: 'scene-btn chapters-menu', title: 'Chapters — go to any chapter or other part of the book', onclick: () => chapterJumpMenu(els.chaptersBtn) }, icon('toc', 15), h('span', {}, 'Chapters'), icon('chevron', 12));
  els.sceneBtn = h('button', { class: 'scene-btn scenes-menu', title: 'Scenes — split this chapter into scenes, add a scene, or go to one', onclick: () => sceneActions(els.sceneBtn) }, icon('scene', 15), els.sceneBtnLabel = h('span', {}, 'Scenes'), icon('chevron', 12));

  els.secExtra = h('div', { class: 'sec-extra' });
  els.editorMount = h('div', { class: 'editor-mount' });
  els.genMount = h('div', { class: 'gen-mount', hidden: true });
  els.status = h('span', { class: 'st-words' });
  app.goals = createGoals(app);
  els.goalMeter = goalMeter(app, app.goals, () => openGoals(app, app.goals, sheet));
  els.clock = stopwatchControl(app, app.goals);
  els.meters = progressMeters(app, app.goals, () => openGoals(app, app.goals, sheet));
  const stat = (label) => { const num = h('span', { class: 'bb-num' }); const unit = h('span', { class: 'bb-unit' }, label); return { num, unit, el: h('div', { class: 'bb-stat' }, num, unit) }; };
  els.bbWords = stat('words');
  els.bbPages = stat('pages');
  els.bbToday = stat('today');
  els.bbGoal = h('div', { class: 'bb-goal', hidden: true }, h('i'));
  els.bbWords.el.append(els.bbGoal);
  els.bbDeltaW = h('span', { class: 'bb-dw' });
  els.bbDeltaP = h('span', { class: 'bb-dp' });
  els.bbArrow = h('span', { class: 'bb-arrow' });
  els.bbSession = h('button', { class: 'bb-session', onclick: () => (settings.goalsOn !== false ? openGoals(app, app.goals, sheet) : app.openInsights()), oncontextmenu: (e) => { e.preventDefault(); sessionPopover(els.bbSession, app.goals, { onNew: () => { app.sessionStart = null; drawBookBar(); } }); } },
    els.bbArrow, h('span', { class: 'bb-delta-txt' }, els.bbDeltaW, els.bbDeltaP), h('span', { class: 'bb-tag' }, 'this session'));
  const insights = () => app.openInsights();
  // Bottom of the editor: the numbers. Click any of them for Insights; the stopwatch sits at the right.
  // Under the editor, kept short: this part's words, today's words, goal progress, and the stopwatch.
  // (The whole book's words and pages are in the title bar; right-click the stopwatch for this session.)
  els.clock.el.addEventListener('contextmenu', (e) => { e.preventDefault(); sessionPopover(els.clock.el, app.goals, { onNew: () => { app.sessionStart = null; drawBookBar(); } }); });
  els.bookBar = h('div', { class: 'book-bar', role: 'status', 'aria-live': 'off' },
    h('button', { class: 'bb-here', title: 'Words here — click for Insights', onclick: insights }, els.status),
    h('button', { class: 'bb-today-g', title: 'Words written today — click for Insights', onclick: insights }, els.bbToday.el),
    els.meters.el,
    h('span', { class: 'spacer' }),
    h('button', { class: 'chip-toggle focus-btn focus-exit on', title: 'Exit Focus — back to the binder and preview (Esc)', onclick: () => toggleWritingFocus(false) }, icon('collapse', 15), h('span', {}, 'Exit Focus')),
    els.clock.el);
  app.goals.onUpdate = () => { safely(() => els.goalMeter.draw(), 'goals'); safely(() => els.clock.draw(), 'clock'); safely(drawBookBar, 'book bar'); safely(() => els.meters.draw(), 'goal meters'); };
  // Text size for the editor — the same A–A slider as the device preview.
  els.zoomRange = h('input', { type: 'range', min: ZMIN, max: ZMAX, step: 5, class: 'pv-size', 'aria-label': 'Editor text size' });
  els.zoomRange.addEventListener('input', () => { editorZoom = Number(els.zoomRange.value); applyZoom(); });
  els.zoomRange.addEventListener('dblclick', () => zoom(0));
  const zoomCtl = h('div', { class: 'pv-ctl size-ctl editor-size', title: 'Editor text size (⌘+ / ⌘−; double-click for actual size) — doesn’t change the book' },
    h('button', { class: 'small-a', 'aria-label': 'Smaller text', onclick: () => zoom(-1) }, 'A'), els.zoomRange,
    h('button', { class: 'big-a', 'aria-label': 'Larger text', onclick: () => zoom(1) }, 'A'));
  els.zoomBubble = rangeBubble(els.zoomRange);
  applyZoom();
  // Editor focus — the same chip as the preview's.
  els.edFocusBtn = h('button', { class: 'chip-toggle focus-btn ed-focus-btn', title: 'Focus on writing — hide everything else (⇧⌘F)', 'aria-label': 'Focus on writing', onclick: () => toggleWritingFocus() }, icon('expand', 15));
  els.edTop = h('div', { class: 'ed-top' },
    h('div', { class: 'sec-opts' }, els.storyTools, els.headTools = h('span', { class: 'sec-tools' })),
    h('span', { class: 'spacer' }),
    zoomCtl, els.edFocusBtn,
    h('button', { class: 'sb-tool', title: 'Hide the editor', 'aria-label': 'Hide the editor', onclick: () => setPane('editor', false) }, icon('panelHide', 16)));
  const editorPane = h('section', { class: 'editor-pane' },
    paneRail('editor', 'Editor', 'pen'),
    els.edTop,
    h('div', { class: 'sec-head' }, h('div', { class: 'sec-kind-row' }, els.backToResearch, els.secKind),
      h('div', { class: 'title-row' }, els.secTitle, els.secTitleCheck = titleCheckButton(els.secTitle, titleCheckOpts(true))),
      h('div', { class: 'title-row sub' }, els.secSub, els.secSubCheck = titleCheckButton(els.secSub, titleCheckOpts(false)))), els.secExtra, els.editorMount, els.genMount,
    h('footer', { class: 'book-bar-wrap' }, els.bookBar));
  els.zoomCtl = zoomCtl;

  els.viewSeg = segmented([{ value: 'device', label: 'E-book', icon: 'device', title: 'E-book — the book as it reads on a phone, tablet or e-reader' }, { value: 'print', label: 'Print', icon: 'print', title: 'Print — the printed book as an open spread, exactly as the PDF will be' }], 'device', (v) => setView(v), { label: 'Preview' });
  els.pvRow1 = h('div', { class: 'pv-row1-slot' });
  els.pvZoom = h('div', { class: 'pv-row1-slot pv-zoom-slot' });
  els.researchHost = h('div', { class: 'pv-host research-host', hidden: true });
  els.deviceHost = h('div', { class: 'pv-host' });
  els.printHost = h('div', { class: 'pv-host', hidden: true });
  els.focusBtn = h('button', { class: 'chip-toggle focus-btn', title: 'Focus — show only the preview, full screen (⌥⌘P). Esc to exit.', 'aria-label': 'Focus on the preview', onclick: () => toggleFocus() }, icon('expand', 15));
  const previewPane = h('section', { class: 'preview-pane' },
    paneRail('preview', 'Preview', 'device'),
    h('div', { class: 'pv-switch' }, els.viewSeg, els.pvZoom, h('span', { class: 'spacer' }), els.pvRow1, els.focusBtn,
      h('button', { class: 'sb-tool', title: 'Hide the preview', 'aria-label': 'Hide the preview', onclick: () => setPane('preview', false) }, icon('panelHide', 16))),
    els.deviceHost, els.printHost, els.researchHost);
  const splitter = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize' });
  els.editorPane = editorPane;
  els.previewPane = previewPane;
  els.splitter = splitter;
  els.sidebarRail = paneRail('binder', 'Binder', 'binderHide');
  els.workspace = h('main', { class: 'workspace' }, els.sidebar, editorPane, splitter, previewPane);
  // Right-click the top of any pane (or its rail when hidden) to move it left or right.
  els.workspace.addEventListener('contextmenu', (e) => {
    const head = e.target.closest('.sb-top, .ed-top, .pv-switch, .pane-rail');
    if (!head || e.target.closest('input, select, textarea, .ed-tools, .pv-ctl')) return;
    const which = head.closest('.sidebar') ? 'binder' : head.closest('.editor-pane') ? 'editor' : head.closest('.preview-pane') ? 'preview' : null;
    if (!which) return;
    e.preventDefault();
    paneMenu(e, which);
  });
  els.shell = h('div', { class: 'shell' }, titlebar, els.workspace);

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const start = e.clientX;
    const startW = previewPane.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    // The preview grows toward the splitter's side: drag away from the preview to widen it.
    const seq = paneSequence();
    const sign = seq.indexOf('split') > seq.indexOf('preview') ? 1 : -1;
    const move = (ev) => { const w = Math.max(380, Math.min(window.innerWidth - 700, startW + sign * (ev.clientX - start))); els.workspace.style.setProperty('--preview-w', `${w}px`); };
    const up = () => { document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  els.secTitle.addEventListener('input', () => {
    const node = currentScene() || currentResearch() || currentSection();
    if (!node) return;
    node.title = els.secTitle.value;
    app.markDirty(); refreshSidebar(); if (!currentResearch() && !currentScene()) schedulePreview();
  });
  els.secTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.editor.focus(); } });

  let railFrame = 0;
  const railSoon = () => { cancelAnimationFrame(railFrame); railFrame = requestAnimationFrame(() => { app.comments?.selectionChanged(); app.comments?.update(); }); };
  // Spelling and grammar: Harper, on this computer. Spelling and grammar can each
  // run as you type (Settings › Spelling & Grammar); either can also be
  // checked on demand, which keeps its underlines until you move to other text.
  const spellChanged = () => {
    const sig = JSON.stringify([settings.spellLive, settings.grammarLive, settings.spellDialect, settings.spellStyle, settings.dictionary, settings.lintRules]);
    if (sig === spellSig) return;
    spellSig = sig;
    setRules(settings.lintRules || {}).then(() => setDictionary(settings.dictionary || [])).finally(() => app.editor?.recheckSpelling?.());
  };
  let spellSig = '';
  onSettings(spellChanged);
  onSettings(drawProofBtns);
  onSettings(() => els.meters?.draw());

  // Pane order and the editor font, from Settings or the pane menu.
  let lastOrder = paneOrder().join(), lastFont = [settings.editorFont || '', !!settings.editorFontSync].join('|');
  onSettings(() => {
    if (paneOrder().join() !== lastOrder) { lastOrder = paneOrder().join(); applyPanes(); }
    const f = [settings.editorFont || '', !!settings.editorFontSync].join('|');
    if (f !== lastFont) { lastFont = f; if (settings.editorFontSync) syncBookFont(); app.editor?.centerCaret?.(); }
  });
  spellChanged();
  if (settings.spellLive !== false || settings.grammarLive !== false) setTimeout(() => warmUp(settings.spellDialect || 'american'), 1500);
  app.editor = createEditor(els.editorMount, {
    spell: {
      enabled: () => spellKinds().size > 0, dialect: () => settings.spellDialect || 'american', kinds: spellKinds,
      auto: () => liveKinds().size > 0,
      onLoad: () => { spellDemand.clear(); },
      onResult: () => {
        // Just switched on: say what the check found, without moving the cursor.
        if (spellReport) {
          const want = spellReport; spellReport = null;
          requestAnimationFrame(() => {
            const n = app.editor.spellCount?.(want) || 0;
            const what = want.has('spell') ? 'spelling' : 'grammar';
            toast(n ? `${n} possible ${what} problem${n === 1 ? '' : 's'} here, highlighted — ⌥F7 goes through them` : `No ${what} problems here`, n ? 'info' : 'ok', 2600);
          });
        }
        if (!spellJump) return;
        const want = spellJump; spellJump = null;
        requestAnimationFrame(() => {
          if (!app.editor.nextSpellProblem(1, { kinds: want })) toast(`No ${want.has('spell') && want.has('grammar') ? 'spelling or grammar' : want.has('spell') ? 'spelling' : 'grammar'} problems found`, 'ok', 1600);
        });
      },
    },
    spellOff: () => checkSpellingNow('both'),
    spellNow: () => { checkSpellingNow('both'); },
    spellNone: () => toast('No spelling or grammar problems here — press F7 to check', 'info', 1600),
    addWord: (w) => addDictionaryWord(w).then(() => toast(`Added “${w}” to your dictionary`, 'ok', 1600)),
    onChange(tr) {
      if (tr.docChanged) pendingSerialize = true;
      // The live preview comes first: nothing else here may stop it from following your typing.
      if (!currentResearch()) {
        app.previewId = currentSection()?.id || app.currentId; // editing snaps the preview back to the cursor
        schedulePreview(true);
      }
      safely(() => {
        if (tr.docChanged || tr.selectionSet) railSoon();
        if (tr.docChanged) { app.goals.activity(); trackActivity(app.currentId); }
        if (writingFocus) requestAnimationFrame(() => app.editor.centerCaret());
        if (currentResearch()) { if (tr.docChanged) flushSerializeSoon(); updateStatusSoon(); }
      }, 'typing');
    },
    pickCitation: (attrs) => pickCitation(attrs),
    findSource: (url) => findSourceByUrl(url),
    makeCard: (md, text) => newCard({ text: md, title: text, from: noteWhere() }),
    citeLink: (link) => citeLink(link),
    formatCitation: (ref, loc) => citer(app.book || {}, app.contents)(ref, loc),
    addAsCharacter: (text) => addAsCharacter(text),
    structureItems: () => structureItems(),
    toolbarPos: () => (settings.toolbarPos === 'bottom' ? 'bottom' : 'top'),
    setToolbarPos: (pos) => setToolbarPos(pos),
    editorFonts: () => [{ id: '', label: 'Default (Literata)' }, ...EDITOR_FONTS.map((f) => ({ id: f.id, label: f.family }))],
    editorFont: () => settings.editorFont || '',
    editorFontName: () => EDITOR_FONTS.find((f) => f.id === settings.editorFont)?.family || 'Default',
    setEditorFont: (id) => updateSettings({ editorFont: id }),
    importImage: () => app.importImage(),
    onAssetChanged: () => { app.htmlCache.clear(); app.refreshPreview(true); },
    createComment: (id, quote) => app.comments?.create(id, quote),
    commentsChanged: () => railSoon(),
    deleteComment: (id) => { app.comments?.remove(id); railSoon(); },
    addIndexTerm: (term) => {
      app.book.index ||= { terms: [] };
      if (!app.book.index.terms.includes(term)) app.book.index.terms.push(term);
      enableSection('index');
      app.markDirty();
      toast(`“${term}” added to the index`);
    },
  });
  app.search = createSearch({
    units: (scope = 'book') => {
      const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
      const out = [];
      const cur = findScene(app.currentId);
      const curChapter = cur ? cur.chapter.id : app.currentId;
      for (const s of numbered) {
        if (scope === 'chapter' && s.id !== curChapter) continue;
        if (scope === 'scene' && (cur ? s.id !== cur.chapter.id : s.id !== app.currentId)) continue;
        if (SECTION_TYPES[s.type]?.generated) continue;
        const title = s.type === 'chapter' ? (s.displayTitle ? `${s.label}: ${s.displayTitle}` : s.label) : s.displayTitle;
        if (hasScenes(s)) s.scenes.forEach((sc, i) => { if (scope !== 'scene' || sc.id === app.currentId) out.push({ id: sc.id, title, sub: sceneLabel(sc, i), md: app.contents[sc.id] }); });
        else out.push({ id: s.id, title, md: app.contents[s.id] });
      }
      if (scope === 'book' || ((scope === 'scene' || scope === 'chapter') && currentResearch())) for (const r of app.book.research || []) if (isTextItem(r) && (scope === 'book' || r.id === app.currentId)) out.push({ id: r.id, title: r.title || 'Note', sub: 'Research', md: app.contents[r.id] });
      return out;
    },
    hasSelection: () => app.editor.hasSelection(),
    selectionText: () => app.editor.selectionText(),
    inSelection: (m) => { const sel = app.editor.view.state.selection; return !sel.empty && m.from >= sel.from && m.to <= sel.to; },
    replaceAt: (id, re, i, to) => {
      flushSerialize();
      if (app.currentId !== id) selectSection(id);
      app.editor.replace(re, to, { index: i });
      flushSerialize();
    },
    replaceAll: (scope, re, to) => {
      flushSerialize();
      let count = 0;
      if (scope === 'selection') { count = app.editor.replace(re, to, { inSelection: true }); flushSerialize(); return count; }
      for (const u of app.search.unitsFor(scope)) {
        if (u.id === app.currentId) { count += app.editor.replace(re, to); flushSerialize(); continue; }
        const res = replaceInMarkdown(app.contents[u.id] || '', re, to);
        if (!res.count) continue;
        count += res.count;
        app.contents[u.id] = res.md;
        app.editor.forget(u.id);
        if (findResearch(u.id)) app.dirtyNotes.add(u.id); else app.dirtyFiles.add(u.id);
        const sc = findScene(u.id);
        if (sc) rejoin(sc.chapter);
      }
      app.markDirty(); refreshSidebar(); schedulePreview(false, true);
      return count;
    },
    flush: () => flushSerialize(),
    open: (id, re, i) => {
      if (app.currentId !== id) selectSection(id);
      requestAnimationFrame(() => { if (app.currentId === id) app.editor.search(re, i); });
    },
    highlight: (re) => app.editor.search(re, -1),
    clear: () => app.editor.clearSearch(),
    onActive: (on) => els.sidebar?.classList.toggle('searching', on),
  });
  app.comments = createCommentRail(app, app.editor);
  app.comments.onCount = (open, all) => { commentCount = { open, all }; drawCommentsBtn(); };
  { const load = app.editor.load.bind(app.editor); app.editor.load = (...a) => { const r = load(...a); railSoon(); return r; }; }
  window.addEventListener('resize', railSoon);

  app.device = createDevicePreview(els.deviceHost, app);
  app.print = createPrintPreview(els.printHost, app);
  app.openTemplates = () => openTemplates(app);
  app.templateList = () => allTemplates(app);
  app.useTemplate = (id) => { const t = allTemplates(app).all.find((x) => x.id === id); if (t) applyTemplate(app, t, { quiet: true }); };
  app.editTemplate = () => openTemplateEditor(app, templateById(app.book.template), { current: true });
  app.openInsights = () => openInsights(app, app.goals, sheet, { proof: proofSection, trimLabel: () => TRIMS[app.book.print?.trim || '6x9']?.label.split(' (')[0] || '' });
  applyPanes();
}

function selectSectionHeader(s) {
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === s.id);
  els.secKind.textContent = s.type === 'chapter' ? (n?.label || 'Chapter (no number)') : s.type === 'about-author' ? aboutAuthorsLabel(app.book) : SECTION_TYPES[s.type].label;
}

function syncHeadSel() { /* the chapter heading style moved to Book › Chapters */ }

// Books always show the preview; Focus (editor or preview) covers hiding things.
let previewHidden = false;
function applyPreviewHidden() {
  els.workspace.classList.toggle('no-preview', previewHidden);
}
function togglePreview(force) {
  previewHidden = force != null ? !force : !previewHidden;
  try { localStorage.setItem('lutefisk.previewHidden.book', previewHidden ? '1' : '0'); } catch { /* ignore */ }
  applyPreviewHidden();
  if (!previewHidden) { fullPrint = true; app.device.build(); schedulePreview(false, true); }
}

/** Preview Focus: the e-book or print preview fills the window, nothing else. Esc exits. */
let previewFocus = false;
function toggleFocus(force) {
  previewFocus = force ?? !previewFocus;
  if (previewFocus && writingFocus) toggleWritingFocus(false);
  els.shell.classList.toggle('preview-focus', previewFocus);
  els.focusBtn.replaceChildren(icon(previewFocus ? 'collapse' : 'expand', 15));
  els.focusBtn.setAttribute('aria-label', previewFocus ? 'Exit Focus' : 'Focus on the preview');
  els.focusBtn.title = previewFocus ? 'Exit Focus — back to the editor and binder (Esc)' : 'Focus — show only the preview, full screen (⌥⌘P). Esc to exit.';
  els.focusBtn.classList.toggle('on', previewFocus);
  requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); schedulePreview(false, true); });
  if (previewFocus) toast('Preview focus — press Esc to exit', 'info', 1800);
}

/* ---- book bar: live totals for the whole book, change this session, running clock */
app.sessionStart = null;
/** Editor text with block breaks kept, so words in adjacent paragraphs don't run together. */
const liveText = () => { const d = app.editor.view.state.doc; return d.textBetween(0, d.content.size, '\n', ' '); };
let liveBase = null;
/** Words of prose only — no markup, image paths, code, math or tables. Cached per text. */
const proseCache = new Map();
function proseWords(id) {
  const md = app.contents[id] || '';
  const hit = proseCache.get(id);
  if (hit?.md === md) return hit.n;
  const n = countWords(proseText(md));
  proseCache.set(id, { md, n });
  return n;
}
function liveBookWords() {
  if (!app.book) return 0;
  // Saved markdown and the live editor count a few things differently (citations, figures),
  // so track the editor's change since the last save and add it to the saved count.
  const nowLive = countWords(liveText());
  if (!pendingSerialize || liveBase?.id !== app.currentId) liveBase = { id: app.currentId, live: nowLive };
  const live = pendingSerialize ? proseWords(app.currentId) + nowLive - liveBase.live : null;
  const sc = findScene(app.currentId);
  let n = 0;
  for (const x of enabledSections()) {
    if (SECTION_TYPES[x.type].generated) continue;
    let w = proseWords(x.id);
    if (live != null && x.id === app.currentId) w = live;
    else if (live != null && sc?.chapter === x) w += live - proseWords(sc.scene.id);
    n += w;
  }
  return n;
}
function wordsPerPage(words) {
  const printed = app.printPageCount?.() || 0;
  return printed && app.print?.wordsAtCount ? Math.max(120, app.print.wordsAtCount / printed) : 275;
}
/* ---- content search */
function focusSearch() {
  if (writingFocus) toggleWritingFocus(false);
  if (previewFocus) toggleFocus(false);
  if (!panes.binder) setPane('binder', true);
  app.search.focus();
}

/* ---- show / hide the binder, editor and preview. A hidden pane leaves a slim rail to bring it back. */
const panes = (() => { try { return { binder: true, editor: true, preview: true, ...JSON.parse(localStorage.getItem('lutefisk.panes') || '{}') }; } catch { return { binder: true, editor: true, preview: true }; } })();
if (!panes.editor && !panes.preview) panes.editor = true;
function paneRail(which, label, ic) {
  return h('button', { class: 'pane-rail', title: `Show the ${label.toLowerCase()}`, 'aria-label': `Show the ${label.toLowerCase()}`, onclick: () => setPane(which, true) }, icon(ic, 16), h('span', {}, label));
}
/**
 * The panes left to right, in the writer's order (Settings › Vision & Comfort, or right-click
 * the top of a pane), with the splitter beside the preview on the side facing the rest.
 */
function paneSequence() {
  const order = paneOrder();
  const seq = [...order];
  const i = seq.indexOf('preview');
  // The splitter sits next to the preview: toward the editor when they touch, else toward the middle.
  const after = i === 0 || (i === 1 && seq[2] === 'editor');
  seq.splice(after ? i + 1 : i, 0, 'split');
  return seq;
}
const paneEl = (name) => ({ binder: els.sidebar, editor: els.editorPane, preview: els.previewPane, split: els.splitter })[name];
function applyPanes() {
  if (!els.workspace) return;
  const RAIL = '34px';
  const both = panes.editor && panes.preview;
  const widths = {
    binder: panes.binder ? 'var(--sidebar-w)' : RAIL,
    editor: both ? 'minmax(420px, 1fr)' : panes.editor ? '1fr' : RAIL,
    preview: both ? 'var(--preview-w)' : panes.preview ? '1fr' : RAIL,
    split: both ? '1px' : '0',
  };
  const seq = paneSequence();
  const cols = (w) => seq.map((n) => w[n]).join(' ');
  seq.forEach((n, i) => { const el = paneEl(n); if (el) el.style.order = String(i); });
  const order = seq.filter((n) => n !== 'split');
  for (const n of order) paneEl(n)?.setAttribute('data-pos', order.indexOf(n) === 0 ? 'first' : order.indexOf(n) === 2 ? 'last' : 'mid');
  els.workspace.dataset.order = order.join('-');
  els.workspace.style.gridTemplateColumns = cols(widths);
  // Focus and no-preview layouts, in the same order.
  els.workspace.style.setProperty('--cols-pf', cols({ binder: '0', editor: '0', split: '0', preview: '1fr' }));
  els.workspace.style.setProperty('--cols-wf', cols({ binder: '0', editor: '1fr', split: '0', preview: '0' }));
  els.workspace.style.setProperty('--cols-nopv', cols({ binder: 'var(--sidebar-w)', editor: 'minmax(420px, 1fr)', split: '0', preview: '0' }));
  els.sidebar.classList.toggle('collapsed', !panes.binder);
  els.editorPane.classList.toggle('collapsed', !panes.editor);
  els.previewPane.classList.toggle('collapsed', !panes.preview);
  requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); schedulePreview(false, true); });
}
function setPane(which, on) {
  panes[which] = on;
  // Never hide both the editor and the preview.
  if (!on && which === 'editor' && !panes.preview) panes.preview = true;
  if (!on && which === 'preview' && !panes.editor) panes.editor = true;
  try { localStorage.setItem('lutefisk.panes', JSON.stringify(panes)); } catch { /* ignore */ }
  applyPanes();
}
function toggleSidebar() { setPane('binder', !panes.binder); }
/**
 * "Use the editor font in the book too": the open book's e-book and print previews (and
 * the PDF) take the editor font; the default editor font gives the book its template font.
 */
function syncBookFont({ quiet = false } = {}) {
  if (!app.book) return;
  const id = settings.editorFont || '';
  const book = app.book;
  book.preview ||= {}; book.print ||= {};
  if ((book.preview.font || '') === id && (book.print.font || '') === id) return;
  if (id) { book.preview.font = id; book.print.font = id; } else { delete book.preview.font; delete book.print.font; }
  app.markDirty(); app.htmlCache?.clear?.();
  app.device?.build?.(); app.print?.init?.();
  fullPrint = true; schedulePreview(false, true);
  if (!quiet) toast(id ? 'The book now uses the editor font in the e-book and print previews' : 'The book uses its template font again', 'info', 2200);
}
/** Move a pane one place left (-1) or right (1). */
function movePane(which, dir) {
  const order = [...paneOrder()];
  const i = order.indexOf(which), j = i + dir;
  if (j < 0 || j > 2) return;
  [order[i], order[j]] = [order[j], order[i]];
  setPaneOrder(order);
}
function paneMenu(e, which) {
  const anchor = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } });
  document.body.append(anchor);
  const order = paneOrder();
  const i = order.indexOf(which);
  const name = { binder: 'Binder', editor: 'Editor', preview: 'Preview' }[which];
  popover(anchor, [
    { label: `Move ${name} Left`, icon: 'prev', disabled: i === 0, onClick: () => movePane(which, -1) },
    { label: `Move ${name} Right`, icon: 'next', disabled: i === 2, onClick: () => movePane(which, 1) },
    '-', { header: 'Panel order' },
    ...PANE_ORDERS.map((o) => ({ label: paneOrderLabel(o), icon: o.join() === order.join() ? 'check' : null, onClick: () => setPaneOrder(o) })),
  ], { width: 250 });
  setTimeout(() => anchor.remove(), 0);
}

/* ---- Chapters menu: jump to any part of the book */
function chapterJumpMenu(anchor) {
  if (!app.book) return;
  flushSerialize();
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  const groups = { front: 'Front Matter', body: 'Body', back: 'Back Matter' };
  const curChapter = findScene(app.currentId)?.chapter.id || app.currentId;
  const items = [];
  let g = null;
  for (const sec of numbered) {
    const grp = SECTION_TYPES[sec.type]?.group || 'body';
    if (grp !== g) { g = grp; if (items.length) items.push('-'); items.push({ header: groups[grp] || 'Body' }); }
    const label = sec.type === 'chapter' ? (sec.displayTitle ? `${sec.label ? `${sec.label}: ` : ''}${sec.displayTitle}` : sec.label || 'Untitled Chapter') : (sec.tocTitle || sec.displayTitle || SECTION_TYPES[sec.type]?.label);
    const words = SECTION_TYPES[sec.type]?.generated ? '' : countWords(hasScenes(sec) ? joinScenes(sec.scenes, app.contents, { all: true }) : app.contents[sec.id]).toLocaleString();
    items.push({ label: `${sec.id === curChapter ? '✓ ' : ''}${label}${sec.exclude ? ' (excluded)' : ''}`, hint: words, icon: sec.type === 'chapter' ? 'doc' : SECTION_TYPES[sec.type]?.generated ? 'toc' : 'doc', onClick: () => selectSection(sec.id) });
  }
  popover(anchor, items, { width: 300, maxHeight: 520 });
}

/* ---- Capitalize My Title */
function titleCheckOpts(withAll) {
  return {
    getStyle: () => bookTitleStyle(app.book),
    setStyle: (id) => { if (app.book && app.book.titleStyle !== id) { app.book.titleStyle = id; app.markDirty(); } },
    applyAll: withAll ? {
      label: 'Every chapter and scene title in',
      run: async (style) => {
        const items = [];
        for (const sec of app.book.sections) { if (!SECTION_TYPES[sec.type]?.generated && sec.title) items.push(sec); for (const sc of sec.scenes || []) if (sc.title) items.push(sc); }
        const subs = app.book.sections.filter((x) => x.subtitle);
        const n = recaseAll(items, style) + recaseAll(subs, style, (x) => x.subtitle, (x, v) => { x.subtitle = v; });
        app.book.titleStyle = style;
        app.markDirty(); refreshSidebar(); schedulePreview(false, true);
        const cur = currentScene() || currentSection();
        if (cur) { els.secTitle.value = cur.title || ''; if (!els.secSub.hidden) els.secSub.value = cur.subtitle || ''; }
        toast(n ? `${n} title${n === 1 ? '' : 's'} recapitalized` : 'Every title already follows that style', 'ok', 2500);
      },
    } : null,
  };
}

/* ---- story tools: characters and the plot board */
function storyUnits() {
  flushSerialize();
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  return numbered.filter((s) => SECTION_TYPES[s.type]?.group === 'body' && !SECTION_TYPES[s.type].generated).map((s) => {
    const md = hasScenes(s) ? joinScenes(s.scenes, app.contents, { all: true }) : app.contents[s.id];
    return {
      id: s.id,
      title: s.type === 'chapter' ? s.tocTitle : s.displayTitle,
      short: s.type === 'chapter' ? String(s.number) : (SECTION_TYPES[s.type].label[0] || ''),
      text: proseText(md),
      parts: hasScenes(s) ? s.scenes.map((sc, i) => { const t = proseText(app.contents[sc.id]); return { title: sceneLabel(sc, i), count: (c) => countMentions(t, c) }; }) : [],
    };
  });
}
function storyCtx(extra = {}) {
  const ctx = {
    book: app.book, kind: 'book', unitWord: 'chapter',
    markDirty: () => app.markDirty(),
    jump: (id) => { ctx.close?.(); selectSection(id); },
    help: (topic) => openHelp(app, { topic }),
    ...extra,
  };
  return ctx;
}
/**
 * Right-click › Add as Character: a selected name becomes a character (or opens
 * the one already called that); a longer passage starts a new character with it in
 * the notes. Either way the character editor opens on that character.
 */
function addAsCharacter(text) {
  const book = app.book;
  if (!book) return;
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!t) return;
  const isName = t.length <= 48 && t.split(' ').length <= 5 && !/[.!?;:]$/.test(t);
  const list = book.characters || (book.characters = []);
  const known = isName && list.find((c) => [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])].some((n) => String(n || '').toLowerCase() === t.toLowerCase()));
  if (known) { openCast(known.id); return; }
  const c = newCharacter(newId('ch'), isName ? t : 'New character', list.length);
  if (!isName) c.notes = `“${t}”`;
  list.push(c);
  app.markDirty();
  refreshSidebar();
  openCast(c.id);
}
function openCast(select) {
  if (!app.book) return;
  openCharacters(storyCtx({ units: storyUnits, suggest: () => suggestNames(storyUnits().map((u) => u.text).join('\n')), importFromBook: importCast }), sheet, { select });
}
/**
 * Characters › Import from Another Book…: pick one of your books, tick the characters to bring
 * over (their pictures come too). Ones with a name already in this book are left out.
 * done(n) is called after n were added.
 */
async function importCast(anchor, done) {
  let lib;
  try { lib = await B.library(); } catch (err) { toast(clean(err), 'error'); return; }
  const books = (lib?.books || []).filter((b) => b.dir !== app.bookPath);
  if (!books.length) { toast('There are no other books in your library', 'info', 2200); return; }
  popover(anchor, [{ header: 'Import characters from' }, ...books.slice(0, 40).map((b) => ({ label: b.title || 'Untitled', hint: b.author || '', icon: 'book', onClick: () => pickFrom(b) }))], { width: 300 });
  async function pickFrom(b) {
    let got;
    try { got = await B.charactersFromBook({ dir: b.dir }); } catch (err) { toast(clean(err), 'error'); return; }
    const list = app.book.characters || (app.book.characters = []);
    const have = new Set(list.map((c) => String(c.name || '').trim().toLowerCase()).filter(Boolean));
    const theirs = got.characters.filter((c) => String(c.name || '').trim());
    if (!theirs.length) { toast(`“${got.title}” has no characters`, 'info', 2200); return; }
    const boxes = theirs.map((c) => {
      const dup = have.has(String(c.name).trim().toLowerCase());
      const box = h('input', { type: 'checkbox', checked: !dup, disabled: dup });
      return { c, box, row: h('label', { class: `ci-row${dup ? ' dup' : ''}` }, box, h('span', { class: 'ci-name' }, c.name), h('small', {}, dup ? 'already in this book' : c.role || '')) };
    });
    const ok = await dialog({ title: `Import Characters from “${got.title}”`, body: h('div', { class: 'ci-list' }, boxes.map((x) => x.row)), ok: 'Import' });
    if (!ok) return;
    let n = 0;
    for (const { c, box } of boxes) {
      if (!box.checked || box.disabled) continue;
      const copy = { ...JSON.parse(JSON.stringify(c)), id: newId('ch') };
      if (typeof copy.avatar === 'string' && copy.avatar.startsWith('assets/')) {
        try { copy.avatar = await B.copyCharacterPicture({ dir: b.dir, rel: copy.avatar, name: copy.name }); } catch { delete copy.avatar; }
      }
      list.push(copy); n++;
    }
    if (!n) return;
    app.markDirty(); refreshSidebar();
    toast(`Imported ${n} character${n === 1 ? '' : 's'} from “${got.title}”`, 'ok', 2200);
    done?.(n);
  }
}
function openPlotBoard(view) {
  if (!app.book) return;
  if (view) { try { localStorage.setItem('lutefisk.plotView', view); } catch { /* ignore */ } }
  openPlot(storyCtx({
    sources: () => {
      flushSerialize();
      return numberSections(app.book.sections, templateById(app.book.template), app.book)
        .filter((s) => SECTION_TYPES[s.type]?.group === 'body' && !SECTION_TYPES[s.type].generated)
        .flatMap((s) => [
          { id: s.id, col: s.id, depth: 0, title: s.type === 'chapter' ? s.tocTitle : s.displayTitle, words: countWords(hasScenes(s) ? joinScenes(s.scenes, app.contents, { all: true }) : app.contents[s.id]), text: hasScenes(s) ? '' : sceneSnippet(app.contents[s.id] || '', 24) },
          ...(hasScenes(s) ? s.scenes.map((sc, i) => ({ id: sc.id, col: s.id, depth: 1, title: sceneLabel(sc, i), words: countWords(app.contents[sc.id]), text: sceneSnippet(app.contents[sc.id] || '', 24) })) : []),
        ]);
    },
    timeline: () => numberSections(app.book.sections, templateById(app.book.template), app.book)
      .filter((s) => SECTION_TYPES[s.type]?.group === 'body')
      .map((s) => ({ id: s.id, title: s.type === 'chapter' ? (s.displayTitle || s.label) : s.displayTitle, short: s.type === 'chapter' ? `Ch ${s.number}` : SECTION_TYPES[s.type].label })),
  }), sheet);
}

/* ---- Characters at the top of the editor: a small count when there are any */
function drawCastBtn() {
  const b = els.castBtn;
  if (!b || !app.book) return;
  const n = (app.book.characters || []).length;
  b.querySelector('.ed-badge')?.remove();
  if (n) b.append(h('span', { class: 'ed-badge cast-n', 'aria-hidden': 'true' }, String(n)));
  b.title = `Characters — your cast and where each one appears${n ? ` (${n})` : ''}`;
  b.setAttribute('aria-label', n ? `Characters, ${n}` : 'Characters');
}

/* ---- comments: show or hide the highlights and the margin of balloons */
let commentCount = { open: 0, all: 0 };
const commentsHidden_ = () => !!app.comments?.hidden;
function setCommentsHidden(v) {
  app.comments?.setHidden(v);
  drawCommentsBtn();
}
/** The book's code and equation look, in the editor (CSS variables on the text). */
function applyBlockLook(book) {
  const { code, math } = blockStyles(book);
  const st = els.editorMount?.style;
  if (!st) return;
  st.setProperty('--code-bg', code.bg || 'transparent');
  st.setProperty('--code-pad', `${code.pad}em`); st.setProperty('--code-pad-x', `${(code.pad * 1.3).toFixed(2)}em`);
  st.setProperty('--math-bg', math.bg || 'transparent');
  st.setProperty('--math-border', `${math.border}px`);
  st.setProperty('--math-pad', `${math.pad}em`); st.setProperty('--math-pad-x', `${(math.pad * 1.3).toFixed(2)}em`);
}

/* ---- spelling and grammar: live switches and on-demand checks (the bar under the text, and F7) */
let spellJump = null; // the kinds to jump to after a check
let spellReport = null; // the kinds to count after a check (when live checking was just switched on)
const spellDemand = new Set(); // kinds checked on demand in the text that's open

/**
 * Insights › Your Book: possible spelling and grammar problems in the whole
 * book (checked on this computer), and the words in your dictionary and the
 * suggestions you ignored — each list opens to bring a word back.
 */
function proofSection(units) {
  const n = (v) => Number(v).toLocaleString();
  const cell = (v) => h('td', { class: 'num' }, v);
  const spell = cell('…'), grammar = cell('…'), style = cell('…');
  const listPop = (anchor, title, rows, empty, action, onAct) => popover(anchor, [
    { header: title },
    rows.length ? { node: h('div', { class: 'proof-list' }, rows.map((r) => h('div', { class: 'proof-row' },
      h('span', { class: 'proof-word', title: r.message || '' }, r.problem || r),
      r.message ? h('small', { class: 'hint' }, r.message.length > 60 ? `${r.message.slice(0, 58)}…` : r.message) : null,
      h('button', { type: 'button', class: 'btn small plain', onclick: (e) => { onAct(r); e.currentTarget.closest('.proof-row').remove(); drawCounts(); } }, action)))) }
      : { node: h('p', { class: 'hint proof-empty' }, empty) },
  ], { width: 340 });
  const dictBtn = h('button', { type: 'button', class: 'link-btn' });
  const ignBtn = h('button', { type: 'button', class: 'link-btn' });
  dictBtn.onclick = () => listPop(dictBtn, 'Your dictionary', [...(settings.dictionary || [])], 'No words added yet. Right-click a misspelled word › Add to Dictionary.', 'Remove',
    (w) => updateSettings({ dictionary: (settings.dictionary || []).filter((x) => x !== w) }).then(() => app.editor?.recheckSpelling?.()));
  ignBtn.onclick = () => listPop(ignBtn, 'Ignored suggestions', ignoredList(), 'Nothing ignored. Right-click a highlighted word › Ignore.', 'Unignore',
    (r) => { unignore(r.key); app.editor?.recheckSpelling?.(); });
  function drawCounts() {
    const d = (settings.dictionary || []).length, ig = ignoredList().length;
    dictBtn.textContent = `${n(d)} ${d === 1 ? 'word' : 'words'}`;
    ignBtn.textContent = `${n(ig)} ${ig === 1 ? 'suggestion' : 'suggestions'}`;
  }
  drawCounts();
  proofCounts(units.map((u) => u.text), settings.spellDialect || 'american').then((c) => {
    spell.textContent = n(c.spell); grammar.textContent = n(c.grammar); style.textContent = n(c.style);
  }).catch(() => { for (const c of [spell, grammar, style]) c.textContent = '—'; });
  return h('section', { class: 'proof-sec' }, h('h3', {}, 'Spelling and grammar'),
    h('table', { class: 'kv' },
      h('tr', {}, h('td', {}, 'Possible spelling mistakes'), spell),
      h('tr', {}, h('td', {}, 'Possible grammar problems'), grammar),
      h('tr', {}, h('td', {}, 'Style suggestions'), style),
      h('tr', {}, h('td', {}, 'Added to your dictionary'), h('td', { class: 'num' }, dictBtn)),
      h('tr', {}, h('td', {}, 'Ignored'), h('td', { class: 'num' }, ignBtn))),
    h('small', { class: 'hint' }, 'Checked on this computer. Click a count of words or suggestions to see the list and bring any back.'));
}

/** The Spelling and Grammar buttons at the top of the editor: checking as you type, on or off. */
function toggleLiveCheck(kind) {
  const key = kind === 'spell' ? 'spellLive' : 'grammarLive';
  const on = settings[key] === false;
  if (!on) for (const k of kind === 'spell' ? ['spell'] : ['grammar', 'style']) spellDemand.delete(k);
  updateSettings({ [key]: on }).then(() => {
    drawProofBtns();
    // Switched from off to on: check the open text now.
    if (on && app.editor && !els.editorMount.hidden) { spellReport = new Set(kind === 'spell' ? ['spell'] : GRAMMAR()); app.editor.checkSpellingNow(); }
  });
  if (on) warmUp(settings.spellDialect || 'american');
  app.editor?.recheckSpelling?.();
  drawProofBtns();
}
function drawProofBtns() {
  for (const [btn, kind, label] of [[els.spellBtn, 'spell', 'Spelling'], [els.grammarBtn, 'grammar', 'Grammar']]) {
    if (!btn) continue;
    const on = settings[kind === 'spell' ? 'spellLive' : 'grammarLive'] !== false;
    btn.hidden = !app.book;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on
      ? `${label} — checked as you type (${kind === 'spell' ? 'red' : 'blue'} highlights). Click to turn off.`
      : `${label} — not checked as you type. Click to turn on.`;
    const ic = kind === 'spell' ? (on ? 'spellAbc' : 'spellAbcOff') : (on ? 'grammar' : 'grammarOff');
    btn.replaceChildren(icon(ic, 16));
  }
}
const GRAMMAR = () => ['grammar', ...(settings.spellStyle !== false ? ['style'] : [])];
function liveKinds() { return new Set([...(settings.spellLive !== false ? ['spell'] : []), ...(settings.grammarLive !== false ? GRAMMAR() : [])]); }
function spellKinds() { return new Set([...liveKinds(), ...spellDemand]); }
/** Check now: 'spell', 'grammar' or 'both'. Then go to the first problem of that kind. */
function checkSpellingNow(what = 'both') {
  if (!app.editor) return;
  if (els.editorMount.hidden) { toast('Open a chapter, scene or note to check its spelling and grammar', 'info', 2200); return; }
  const kinds = what === 'spell' ? ['spell'] : what === 'grammar' ? GRAMMAR() : ['spell', ...GRAMMAR()];
  for (const k of kinds) spellDemand.add(k);
  spellJump = new Set(kinds);
  app.editor.checkSpellingNow();
}

function drawCommentsBtn() {
  if (!els.commentsBtn) return;
  const hiddenNow = commentsHidden_();
  const n = commentCount.open;
  els.commentsBtn.hidden = !app.book || !!currentResearch?.();
  els.commentsBtn.classList.toggle('on', !hiddenNow);
  els.commentsBtn.setAttribute('aria-pressed', String(!hiddenNow));
  els.commentsBtn.title = hiddenNow
    ? `Comments — show the comment margin (⌥⌘C). ${n ? `${n} open.` : 'Add one with ⌃⌥M.'}`
    : `Comments — hide the comment margin (⌥⌘C). ${n ? `${n} open.` : 'Add one with ⌃⌥M.'}`;
  els.commentsBtn.setAttribute('aria-label', hiddenNow ? 'Show comments' : 'Hide comments');
  els.commentsBtn.replaceChildren(icon(hiddenNow ? 'commenterOff' : 'commenter', 16));
  drawProofBtns();
}


function drawBookBar() {
  if (!app.book || !els.bookBar) return;
  const words = liveBookWords();
  if (!app.sessionStart) app.sessionStart = { words, at: Date.now() };
  const wpp = wordsPerPage(words);
  const pages = Math.max(words ? 1 : 0, Math.round(words / wpp));
  els.bbWords.num.textContent = words.toLocaleString();
  els.bbPages.num.textContent = `${pages.toLocaleString()}`;
  els.bbPages.unit.textContent = pages === 1 ? 'page' : 'pages';
  const exact = !!app.printPageCount?.();
  els.tbCount.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${exact ? '' : '~'}${pages.toLocaleString()} page${pages === 1 ? '' : 's'}`;
  els.tbCount.title = exact ? 'The whole book: words, and pages in the print layout' : `The whole book: words, and approximate pages (about ${Math.round(wpp)} words a page)`;
  els.bbPages.el.title = app.printPageCount?.() ? 'Pages in the print layout' : `Approximate — about ${Math.round(wpp)} words a page. Open the Print preview for an exact count.`;
  const target = Number(app.book.goals?.targetWords) || 0;
  els.bbGoal.hidden = !target;
  if (target) { els.bbGoal.firstChild.style.width = `${Math.min(100, (words / target) * 100)}%`; els.bbWords.el.title = `${words.toLocaleString()} of ${target.toLocaleString()} words (${Math.floor((words / target) * 100)}%)`; } else els.bbWords.el.title = '';
  const dw = words - app.sessionStart.words;
  const dp = dw / wpp;
  const dir = dw > 0 ? 'up' : dw < 0 ? 'down' : 'flat';
  els.bbSession.className = `bb-session ${dir}`;
  els.bbArrow.replaceChildren(icon(dir === 'down' ? 'down' : dir === 'up' ? 'up' : 'minus', 12));
  els.bbDeltaW.textContent = `${dw > 0 ? '+' : dw < 0 ? '−' : ''}${Math.abs(dw).toLocaleString()} words`;
  els.bbDeltaP.textContent = `${dp > 0 ? '+' : dp < 0 ? '−' : ''}${Math.abs(dp).toFixed(1)} pages`;
  const last = app.goals.sessionLog?.()[0];
  els.bbSession.title = `This session — words added or removed since you opened the book (${app.sessionStart.words.toLocaleString()} words then). Click for Insights; right-click for session details.${last ? `\nLast session: ${new Date(last.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${last.words >= 0 ? '+' : '−'}${Math.abs(last.words).toLocaleString()} words` : ''}`;
  const today = app.goals.today('book');
  const goal = settings.goalsOn !== false ? app.goals.dailyTarget('book') : 0;
  els.bbToday.num.textContent = `${today > 0 ? '+' : ''}${today.toLocaleString()}`;
  els.bbToday.unit.textContent = 'today';
  els.bbToday.el.parentElement && (els.bbToday.el.parentElement.title = goal ? `${today.toLocaleString()} of ${goal.toLocaleString()} words today — click for Insights` : 'Words written today — click for Insights');
  const pr = app.goals.progress('book');
  els.bbToday.el.classList.toggle('met', settings.goalsOn !== false && (pr.has ? pr.met : goal > 0 && today >= goal));
  // Book % and today's personal goals %, about once a second while typing.
  if (Date.now() - (drawBookBar.metersAt || 0) > 1000) { drawBookBar.metersAt = Date.now(); els.meters?.draw(); }
}


/* ============================================================= sections */

/** Locate a scene by id → { chapter, scene, index } */
function findScene(id) {
  for (const c of app.book?.sections || []) {
    const i = (c.scenes || []).findIndex((x) => x.id === id);
    if (i >= 0) return { chapter: c, scene: c.scenes[i], index: i };
  }
  return null;
}
const findResearch = (id) => (app.book?.research || []).find((r) => r.id === id);
const currentScene = () => findScene(app.currentId)?.scene || null;
const currentResearch = () => findResearch(app.currentId) || null;
/** The book section being edited (a scene's chapter counts as its section). */
const currentSection = () => app.book?.sections.find((s) => s.id === app.currentId) || findScene(app.currentId)?.chapter || null;
const hasScenes = (s) => Array.isArray(s?.scenes) && s.scenes.length > 0;
function rejoin(chapter) {
  if (!hasScenes(chapter)) return;
  const md = joinScenes(chapter.scenes, app.contents);
  if (md !== app.contents[chapter.id]) { app.contents[chapter.id] = md; app.dirtyFiles.add(chapter.id); }
}
app.sections = () => prepare(app.book);
app.selectSection = (id) => selectSection(id);
const enabledSections = () => app.book.sections.filter((s) => s.enabled !== false);

function enableSection(type) {
  const s = app.book.sections.find((x) => x.type === type);
  if (s && s.enabled === false) { s.enabled = true; app.markDirty(); refreshSidebar(); }
}
app.enableSection = enableSection;

const TYPE_ICON = { 'title-page': 'doc', toc: 'ul', bibliography: 'cite', index: 'index', endnotes: 'footnote', 'about-author': 'doc', chapter: 'doc', glossary: 'book', contributors: 'people' };

function refreshSidebar() {
  const sb = els.sidebar;
  const book = app.book;
  if (!book) return;
  applyBlockLook(book);
  drawCastBtn();
  const numbered = numberSections(book.sections, templateById(book.template), book);
  const label = (s) => {
    const n = numbered.find((x) => x.id === s.id);
    if (s.type === 'chapter') return s.title || (s.exclude ? 'Untitled Chapter' : n?.label) || 'Untitled Chapter';
    return n?.displayTitle || s.title || SECTION_TYPES[s.type]?.label;
  };
  sb.replaceChildren(els.sidebarRail);
  const filterOn = filterActive();
  const filterBtn = h('button', { class: `sb-tool sb-filter${filterOn ? ' on' : ''}`, title: 'Filter by label or status', 'aria-label': 'Filter by label or status', onclick: () => filterMenu(filterBtn) }, icon('filter', 15));
  sb.append(h('div', { class: 'pane-head sb-top' }, h('span', { class: 'pane-title' }, 'Binder'),
    h('button', { class: 'sb-tool', title: 'Hide the binder', 'aria-label': 'Hide the binder', onclick: () => setPane('binder', false) }, icon('binderHide', 16))));
  if (filterOn) sb.append(h('div', { class: 'sb-filterbar' }, icon('filter', 12),
    h('span', {}, [...binderFilter.labels].map((id) => labelById(id)?.name).concat([...binderFilter.statuses], binderFilter.excluded ? ['Excluded from Book'] : []).filter(Boolean).join(', ')),
    h('button', { title: 'Clear filter', 'aria-label': 'Clear filter', onclick: clearFilter }, icon('close', 11))));
  // Goals in the binder: the book's % then today's, as at the bottom of the editor.
  const goalCounts = () => {
    const bp = app.goals?.bookPct?.();
    const pp = app.goals?.personal?.();
    const parts = [bp != null ? `Book ${Math.floor(bp * 100)}%` : null, pp?.total ? `Daily ${Math.floor(pp.pct * 100)}%` : null].filter(Boolean);
    return parts.join(' · ');
  };
  // The book: its cover (click for Book settings), and beside it Goals and Insights.
  const coverBtn = h('button', { class: 'sb-cover-btn', onclick: () => openBookSettings(app, 'general'), title: `${book.title || 'Untitled'}${book.author ? ` — ${book.author}` : ''}\nBook settings — details, cover, chapters, print`, 'aria-label': 'Book settings' },
    h('div', { class: 'sb-cover' }, book.cover ? h('img', { src: assetUrl(book.cover), alt: '' }) : generatedCover(book.title, book.author, fontStack(templateById(book.template).head), book.subtitle, book.coverTone), h('div', { class: 'lib-spine' })));
  // Beside the cover: Goals and, under it, Insights. The book search sits just below.
  const sideBtn = (cls, ic, text, sub, onclick, title) => h('button', { class: `sb-side-btn ${cls}`, onclick, title, 'aria-label': title.split(' — ')[0] }, icon(ic, 15), h('span', { class: 'sb-label' }, text), sub ? h('span', { class: 'sb-count' }, sub) : null);
  sb.append(h('div', { class: 'sb-book' }, coverBtn,
    h('div', { class: 'sb-book-side' },
      h('button', { class: 'sb-book-title', title: `${book.title || 'Untitled'} — Book settings`, onclick: () => openBookSettings(app, 'general') }, book.title || 'Untitled'),
      settings.goalsOn !== false ? sideBtn('sb-goals', 'target', 'Goals', goalCounts(), () => openGoals(app, app.goals, sheet), 'Goals — book length, deadline countdown and daily goal') : null,
      sideBtn('sb-insights', 'chart', 'Insights', '', () => app.openInsights(), 'Insights — your book: words, readability, style, spelling and grammar'),
      // Research, under Insights: the book's research notes (README.md), index cards, files and story tools.
      sideBtn('sb-research', 'research', 'Research', '', () => openResearchHub(), 'Research — your notes about the book (README.md), index cards, files, characters, plot and timeline. Never in the book.'))),
    h('div', { class: 'sb-searchrow' }, app.search.bar, filterBtn));

  const scroller = h('div', { class: 'sb-scroll' });
  const navRow = (ic, text, sub, onclick, extra) => h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name', onclick }, icon(ic, 15), h('span', { class: 'sb-label' }, text), sub ? h('span', { class: 'sb-count' }, sub) : null), extra || null);
  for (const g of GROUPS) {
    const included = book.sections.filter((s) => SECTION_TYPES[s.type]?.group === g.id && (s.enabled !== false || SECTION_TYPES[s.type].multi));
    const available = book.sections.filter((s) => SECTION_TYPES[s.type]?.group === g.id && s.enabled === false && !SECTION_TYPES[s.type].multi);
    const addBtn = h('button', { class: 'sb-add', title: `Add to ${g.label}`, 'aria-label': `Add to ${g.label}` }, icon('plus', 15));
    addBtn.addEventListener('click', () => {
      const items = [];
      if (g.id === 'body') items.push({ label: 'Chapter', icon: 'doc', hint: '⇧⌘N', onClick: () => addSection('chapter') });
      if (g.id === 'back') {
        // One alphabetical list: Appendix (any number) among the sections not yet in the book.
        const list = [{ label: 'Appendix', icon: 'doc', onClick: () => addSection('appendix') }, ...available.map((s) => ({ label: s.type === 'about-author' ? aboutAuthorsLabel(app.book) : SECTION_TYPES[s.type].label, icon: TYPE_ICON[s.type] || 'doc', hint: SECTION_TYPES[s.type].generated ? 'Automatic' : '', onClick: () => { s.enabled = true; app.markDirty(); selectSection(s.id); } }))];
        list.sort((a, b) => a.label.localeCompare(b.label));
        popover(addBtn, list, { width: 230 });
        return;
      }
      if (items.length && available.length) items.push('-');
      for (const s of available) items.push({ label: s.type === 'about-author' ? aboutAuthorsLabel(app.book) : SECTION_TYPES[s.type].label, icon: TYPE_ICON[s.type] || 'doc', hint: SECTION_TYPES[s.type].generated ? 'Automatic' : '', onClick: () => { s.enabled = true; app.markDirty(); selectSection(s.id); } });
      if (!items.length) items.push({ label: 'All sections added', disabled: true });
      popover(addBtn, items, { width: 220 });
    });
    const ul = h('ul', { class: 'sb-list', role: 'listbox', 'aria-label': g.label });
    // Chapters are numbered in the binder (as the book counts them: excluded ones aren't).
    let chapterNo = 0;
    for (const s of included) {
      const def = SECTION_TYPES[s.type];
      const sceneHit = filterActive() && hasScenes(s) && s.scenes.some(matchesFilter);
      const hit = filterActive() && (matchesFilter(s) || sceneHit);
      const li = h('li', { class: `sb-row${s.id === app.currentId ? ' active' : ''}${s.exclude ? ' excluded' : ''}${filterActive() ? (hit ? ' hit' : ' dim') : ''}`, title: s.exclude ? 'Excluded from the book' : null, role: 'option', 'aria-selected': String(s.id === app.currentId), draggable: def.multi ? 'true' : null, tabindex: -1 });
      const scenes = hasScenes(s);
      const open = scenes && (app.expanded.has(s.id) || findScene(app.currentId)?.chapter === s || (filterActive() && s.scenes.some(matchesFilter)));
      const disc = scenes ? h('span', { class: `sb-disc${open ? ' open' : ''}`, role: 'button', 'aria-label': open ? 'Collapse scenes' : 'Expand scenes', onclick: (e) => { e.stopPropagation(); if (open) app.expanded.delete(s.id); else app.expanded.add(s.id); refreshSidebar(); } }, icon('next', 12)) : null;
      if (scenes) li.classList.add('has-scenes');
      const num = s.type === 'chapter' && !s.exclude ? ++chapterNo : 0;
      // Body rows: a column for the scenes arrow, then the chapter's number (or the section's icon).
      const lead = g.id === 'body'
        ? [disc || h('span', { class: 'sb-disc sb-disc-none', 'aria-hidden': 'true' }), num ? h('span', { class: 'sb-num', 'aria-hidden': 'true' }, String(num)) : icon(TYPE_ICON[s.type] || 'doc', 15)]
        : [disc || icon(TYPE_ICON[s.type] || 'doc', 15)];
      const name = h('button', { class: 'sb-name', onclick: () => selectSection(s.id), oncontextmenu: (e) => { e.preventDefault(); rowMenu(name, s); } },
        ...lead,
        ...rowDecor(s).slice(0, 1),
        h('span', { class: 'sb-label' }, label(s)),
        ...rowDecor(s).slice(1),
        s.exclude ? h('span', { class: 'sb-excl', title: 'Excluded from the book' }, icon('ignore', 13)) : null,
        def.generated ? h('span', { class: 'sb-badge' }, 'Auto') : null);
      const more = h('button', { class: 'sb-more', title: 'More', 'aria-label': 'More', onclick: (e) => { e.stopPropagation(); rowMenu(more, s); } }, icon('more', 16));
      li.append(name, more);
      if (def.multi) {
        li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-section', s.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-section')) { e.preventDefault(); li.classList.add('drop'); } });
        li.addEventListener('dragleave', () => li.classList.remove('drop'));
        li.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); li.classList.remove('drop'); reorder(e.dataTransfer.getData('text/x-section'), s.id); });
      }
      ul.append(li);
      if (open) for (const [i, sc] of s.scenes.entries()) ul.append(sceneRow(s, sc, i));
    }
    const shut = collapsedGroups.has(g.id) && !filterActive();
    const head = h('button', { class: 'sb-head-btn', 'aria-expanded': String(!shut), title: shut ? `Show ${g.label}` : `Hide ${g.label}`, onclick: () => { if (collapsedGroups.has(g.id)) collapsedGroups.delete(g.id); else collapsedGroups.add(g.id); saveCollapsed(); refreshSidebar(); } },
      h('span', { class: `sb-disc${shut ? '' : ' open'}` }, icon('next', 11)), h('span', { class: 'sb-head-label' }, g.label), included.length ? h('span', { class: 'sb-head-count' }, String(included.length)) : null);
    scroller.append(h('section', { class: `sb-group sb-part sb-${g.id}${shut ? ' shut' : ''}` }, h('div', { class: 'sb-head' }, head, addBtn), shut ? null : ul));
  }
  scroller.append(binRow());
  sb.append(scroller, app.search.panel);
  sb.classList.toggle('searching', app.search.active);
  const total = enabledSections().reduce((n, s) => n + (SECTION_TYPES[s.type].generated ? 0 : countWords(app.contents[s.id])), 0);
  sb.append(h('div', { class: 'sb-foot' }, `${total.toLocaleString()} words`));
  els.docTitle.textContent = book.title || 'Untitled';
  document.title = `${book.title || 'Untitled'} — Lutefisk Book Editor`;
  updateStatus();
}
app.refreshSidebar = refreshSidebar;

/* ---- labels, statuses and export inclusion, shared by chapter and scene menus.
   Labels and statuses are per book (book.labels, book.statuses); the defaults
   are used until you add your own. */
const DEFAULT_LABELS = [['red', 'Red', '#e5484d'], ['orange', 'Orange', '#f76b15'], ['yellow', 'Yellow', '#e2b203'], ['green', 'Green', '#30a46c'], ['blue', 'Blue', '#0090ff']].map(([id, name, color]) => ({ id, name, color }));
const LABEL_PALETTE = ['#e5484d', '#f76b15', '#e2b203', '#30a46c', '#0090ff', '#8e4ec6', '#d6409f', '#12a594', '#8d8d86', '#a18072'];
const DEFAULT_STATUSES = ['To Do', 'In Progress', 'First Draft', 'Needs Review', 'Reviewed', 'Revised', 'Finished'];
/** The “Exclude from Book” status: a chapter or scene with it stays in the manuscript but is left out of the
 *  book — the device and print previews and every export (it sets x.exclude, which they honor). */
const IGNORE = 'Exclude from Book';
const OLD_IGNORE = 'Ignore'; // its earlier name
const STATUS_ICON = { 'To Do': 'status', 'In Progress': 'clock', 'First Draft': 'pen', 'Needs Review': 'comment', Reviewed: 'eye', Revised: 'rotate', Finished: 'check', [IGNORE]: 'ignore' };
/** A chapter or scene can have several statuses (older books stored one, as status). */
const statusesOf = (x) => (Array.isArray(x?.statuses) ? x.statuses : x?.status ? [x.status] : []);
function setStatuses(x, list) {
  delete x.status;
  if (list.length) x.statuses = [...new Set(list)]; else delete x.statuses;
  if (statusesOf(x).includes(IGNORE)) x.exclude = true; else delete x.exclude;
}
const bookLabels = () => (Array.isArray(app.book?.labels) && app.book.labels.length ? app.book.labels : DEFAULT_LABELS);
const bookStatuses = () => {
  let list = (Array.isArray(app.book?.statuses) && app.book.statuses.length ? app.book.statuses : DEFAULT_STATUSES).filter((x) => x !== IGNORE);
  if (!list.includes('Reviewed')) {
    // Books with their own list get Reviewed too, after Needs Review.
    const i = list.indexOf('Needs Review');
    list = i >= 0 ? [...list.slice(0, i + 1), 'Reviewed', ...list.slice(i + 1)] : [...list, 'Reviewed'];
  }
  return [...list, IGNORE]; // always last
};
const labelById = (id) => bookLabels().find((l) => l.id === id);
const binderFilter = { labels: new Set(), statuses: new Set(), excluded: false };
const filterActive = () => binderFilter.labels.size + binderFilter.statuses.size > 0 || binderFilter.excluded;
const clearFilter = () => { binderFilter.labels.clear(); binderFilter.statuses.clear(); binderFilter.excluded = false; refreshSidebar(); };
const matchesFilter = (x) => (!binderFilter.labels.size || binderFilter.labels.has(x.label))
  && (!binderFilter.statuses.size || statusesOf(x).some((st) => binderFilter.statuses.has(st)))
  && (!binderFilter.excluded || !!x.exclude);

function rowDecor(x) {
  const lb = x.label && labelById(x.label);
  return [
    lb ? h('span', { class: 'sb-dot', style: { background: lb.color }, title: lb.name }) : null,
    ...statusesOf(x).slice(0, 3).map((st) => h('span', { class: `sb-status${st === 'Finished' ? ' done' : ''}`, title: st }, icon(STATUS_ICON[st] || 'tag', 12))),
  ];
}

async function newLabel(target) {
  let color = LABEL_PALETTE.find((c) => !bookLabels().some((l) => l.color === c)) || LABEL_PALETTE[0];
  const sw = h('div', { class: 'lbl-row' }, LABEL_PALETTE.map((c) => {
    const b = h('button', { type: 'button', class: `lbl-sw${c === color ? ' on' : ''}`, style: { background: c }, 'aria-label': c, onclick: () => { color = c; sw.querySelectorAll('.lbl-sw').forEach((x) => x.classList.toggle('on', x === b)); } });
    return b;
  }));
  const res = await dialog({ title: 'New Label', fields: [{ name: 'name', label: 'Name', placeholder: 'e.g. Flashback, Needs research, Mara POV' }], body: h('div', { class: 'fld' }, h('span', {}, 'Color'), sw), ok: 'Add Label' });
  const name = res?.name?.trim();
  if (!name) return;
  if (!Array.isArray(app.book.labels) || !app.book.labels.length) app.book.labels = DEFAULT_LABELS.map((l) => ({ ...l }));
  const existing = app.book.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
  const lb = existing || { id: newId('lbl'), name, color };
  if (!existing) app.book.labels.push(lb);
  if (target) target.label = lb.id;
  app.markDirty(); refreshSidebar();
}
function labelMenu(anchor, target, after) {
  popover(anchor, [
    { header: 'Label' },
    ...bookLabels().map((l) => ({ label: l.name, node: null, icon: target.label === l.id ? 'check' : null, swatch: l.color, onClick: () => { target.label = l.id; app.markDirty(); refreshSidebar(); after?.(); } })),
    '-',
    { label: 'New Label…', icon: 'plus', onClick: () => newLabel(target).then(() => after?.()) },
    target.label ? { label: 'Remove Label', icon: 'close', onClick: () => { delete target.label; app.markDirty(); refreshSidebar(); after?.(); } } : null,
  ].filter(Boolean), { width: 220 });
}
async function newStatus(target) {
  const res = await dialog({ title: 'New Status', fields: [{ name: 'name', label: 'Status', placeholder: 'e.g. With editor, Line edit' }], ok: 'Add Status' });
  const name = res?.name?.trim().slice(0, 40);
  if (!name) return;
  if (!Array.isArray(app.book.statuses) || !app.book.statuses.length) app.book.statuses = [...DEFAULT_STATUSES];
  if (!app.book.statuses.some((x) => x.toLowerCase() === name.toLowerCase())) app.book.statuses.push(name);
  if (!app.book.statuses.includes('Reviewed')) app.book.statuses = bookStatuses();
  if (target) setStatuses(target, [...statusesOf(target), app.book.statuses.find((x) => x.toLowerCase() === name.toLowerCase())]);
  app.markDirty(); refreshSidebar();
}
/** An invisible stand-in at a rectangle, for reopening a menu whose button was redrawn. */
function ghostAnchor(r) {
  const g = h('span', { 'aria-hidden': 'true', style: { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: 'none' } });
  document.body.append(g);
  return g;
}
/** Statuses: pick as many as apply; the menu stays open so you can tick several. */
function statusMenu(anchor, target, after) {
  const cur = statusesOf(target);
  const toggle = (st) => {
    // Remember where the menu was: the binder redraws, so reopen it at the same spot.
    const r = anchor.getBoundingClientRect();
    setStatuses(target, cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st]);
    app.markDirty(); refreshSidebar(); after?.();
    if (st === IGNORE) { app.htmlCache?.clear?.(); schedulePreview(false, true); toast(target.exclude ? 'Excluded from the book — left out of the previews and exports; it stays in your manuscript' : 'Back in the book', 'info', 2000); }
    const at = anchor.isConnected ? anchor : ghostAnchor(r);
    setTimeout(() => { statusMenu(at, target, after); if (at !== anchor) at.remove(); });
  };
  popover(anchor, [
    { header: 'Status — choose any that apply' },
    ...bookStatuses().flatMap((st) => [...(st === IGNORE ? ['-'] : []), { label: st, icon: cur.includes(st) ? 'check' : STATUS_ICON[st] || 'tag', hint: '', onClick: () => toggle(st) }]),
    '-',
    { label: 'New Status…', icon: 'plus', onClick: () => newStatus(target).then(() => after?.()) },
    cur.length ? { label: 'Clear Statuses', icon: 'close', onClick: () => { const was = !!target.exclude; setStatuses(target, []); app.markDirty(); refreshSidebar(); after?.(); if (was) { app.htmlCache?.clear?.(); schedulePreview(false, true); } } } : null,
  ].filter(Boolean), { width: 240 });
}
function filterMenu(anchor) {
  const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); refreshSidebar(); };
  popover(anchor, [
    { header: 'Show only — label' },
    ...bookLabels().map((l) => ({ label: l.name, swatch: l.color, icon: binderFilter.labels.has(l.id) ? 'check' : null, onClick: () => toggle(binderFilter.labels, l.id) })),
    '-', { header: 'Show only — status' },
    ...bookStatuses().map((st) => ({ label: st, icon: binderFilter.statuses.has(st) ? 'check' : STATUS_ICON[st] || 'tag', onClick: () => toggle(binderFilter.statuses, st) })),
    ...(filterActive() ? ['-', { label: 'Clear Filter', icon: 'close', onClick: clearFilter }] : []),
  ], { width: 230 });
}
/** The shared part of the chapter/scene context menu. */
function organizeItems(anchor, target, onExport, insights) {
  const lb = target.label && labelById(target.label);
  return [
    ...(insights ? [{ label: 'Insights', icon: 'chart', onClick: insights }] : []),
    { label: 'Label', icon: 'tag', hint: lb ? lb.name : '', onClick: () => setTimeout(() => labelMenu(anchor, target)) },
    { label: 'Status', icon: 'status', hint: statusesOf(target).join(', '), onClick: () => setTimeout(() => statusMenu(anchor, target)) },
  ];
}
const afterExportChange = () => { app.markDirty(); refreshSidebar(); schedulePreview(false, true); };

function rowMenu(anchor, s) {
  const def = SECTION_TYPES[s.type];
  const items = [...binderCardItems(s)];
  if (s.type === 'chapter') items.push(newChapterItem(s));
  // A chapter's own row: a new scene at its start or its end (a chapter without scenes: before or after its text).
  if (SCENE_TYPES.includes(s.type)) items.push(hasScenes(s)
    ? beforeAfterItem('New Scene', 'At the Beginning', () => addScene(s, 0), 'At the End', () => addScene(s))
    : beforeAfterItem('New Scene', 'Before the Text', () => addScene(s, 0), 'After the Text', () => addScene(s)));
  if (s.type === 'chapter' || SCENE_TYPES.includes(s.type)) items.push('-');
  if (!def.generated) items.push(...organizeItems(anchor, s, afterExportChange, SCENE_TYPES.includes(s.type) || FOLDER_TYPES.includes(s.type) ? () => openChapterInsights(s) : null));
  if (['chapter', 'prologue', 'epilogue'].includes(s.type)) {
    // Drop caps are set for the book in Book settings; a chapter can skip its own.
    items.push({ label: 'Drop Cap', icon: s.dropCap !== false ? 'check' : 'dropcap', hint: s.dropCap !== false ? 'on' : 'off', onClick: () => {
      if (s.dropCap === false) delete s.dropCap; else s.dropCap = false;
      app.markDirty(); app.htmlCache.clear(); app.refreshPreview(true);
    } });
  }
  if (!def.generated) items.push('-');
  if (def.multi) {
    items.push({ label: 'Move Up', icon: 'up', onClick: () => moveSection(s.id, -1) }, { label: 'Move Down', icon: 'down', onClick: () => moveSection(s.id, 1) });
    if (SCENE_TYPES.includes(s.type)) {
      items.push('-');
      if (hasScenes(s)) items.push({ label: 'Combine Scenes into Chapter', icon: 'doc', onClick: () => combineScenes(s) });
      else items.push({ label: 'Split into Scenes', icon: 'scene', hint: 'at scene breaks', onClick: () => splitChapter(s) });
    }
    items.push('-', { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteSection(s.id) });
  } else {
    items.push({ label: 'Remove from Book', icon: 'minus', onClick: () => { s.enabled = false; app.markDirty(); if (app.currentId === s.id) selectSection(enabledSections().find((x) => x.type === 'chapter')?.id); else refreshSidebar(); schedulePreview(); } });
  }
  popover(anchor, items, { width: 210 });
}

function addSection(type, { before, after } = {}) {
  const s = { id: newId(type.slice(0, 3)), type, enabled: true, title: type === 'chapter' ? '' : 'Appendix', stats: { created: new Date().toISOString(), days: {} } };
  const list = app.book.sections;
  const cur = currentSection();
  let idx;
  const lastOfType = list.map((x) => x.type).lastIndexOf(type);
  if (before) idx = list.indexOf(before);
  else if (after) idx = list.indexOf(after) + 1;
  else if (cur && cur.type === type) idx = list.indexOf(cur) + 1;
  else if (lastOfType >= 0) idx = lastOfType + 1;
  else idx = type === 'chapter' ? list.findIndex((x) => x.type === 'epilogue' || SECTION_TYPES[x.type].group === 'back') : list.findIndex((x) => SECTION_TYPES[x.type].group === 'back' && x.type.localeCompare(type) > 0);
  if (idx < 0) idx = list.length;
  list.splice(idx, 0, s);
  app.contents[s.id] = '';
  app.dirtyFiles.add(s.id);
  if (type === 'chapter') withFirstScene(s);
  app.markDirty();
  selectSection(s.id);
  els.secTitle.focus();
}
/** A new chapter starts with one scene, “Scene One” (as in a new book), shown open in the binder. */
function withFirstScene(ch) {
  const sc = { id: newId('sce'), title: 'Scene One', stats: { created: new Date().toISOString(), days: {} } };
  ch.scenes = [sc];
  app.contents[sc.id] = '';
  app.dirtyFiles.add(sc.id);
  app.expanded.add(ch.id);
  return ch;
}

async function deleteSection(id) {
  const s = app.book.sections.find((x) => x.id === id);
  // The last chapter can go too: a new, empty chapter takes its place.
  const lastChapter = s.type === 'chapter' && app.book.sections.filter((x) => x.type === 'chapter').length <= 1;
  const words = countWords(app.contents[id]);
  if (!(await confirmDialog(`Delete “${s.title || SECTION_TYPES[s.type].label}”?`, `${words.toLocaleString()} words. It moves to the Recycle Bin, where you can restore it.${lastChapter ? ' It’s the only chapter, so a new, untitled chapter takes its place.' : ''}`))) return;
  flushSerialize();
  const i = app.book.sections.indexOf(s);
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === id);
  const texts = { [id]: app.contents[id] || '' };
  for (const sc of s.scenes || []) texts[sc.id] = app.contents[sc.id] || '';
  toBin(app.book, { kind: 'section', title: s.type === 'chapter' ? ([n?.label, s.title].filter(Boolean).join(': ') || 'Chapter') : (s.title || SECTION_TYPES[s.type].label), item: s, texts, where: { index: i, after: app.book.sections[i - 1]?.id || null } });
  app.book.sections.splice(i, 1);
  app.removed.push(id);
  for (const sc of s.scenes || []) { app.removed.push(sc.id); delete app.contents[sc.id]; app.dirtyFiles.delete(sc.id); app.editor.forget(sc.id); }
  delete app.contents[id];
  app.dirtyFiles.delete(id);
  app.editor.forget(id);
  if (lastChapter) {
    const fresh = { id: newId('cha'), type: 'chapter', enabled: true, title: '', stats: { created: new Date().toISOString(), days: {} } };
    app.book.sections.splice(i, 0, fresh);
    app.contents[fresh.id] = '';
    app.dirtyFiles.add(fresh.id);
    withFirstScene(fresh);
    app.markDirty();
    selectSection(fresh.id);
    return;
  }
  app.markDirty();
  if (app.currentId === id || findScene(app.currentId) === null && !currentResearch() && !app.book.sections.some((x) => x.id === app.currentId)) selectSection((app.book.sections[i] || app.book.sections[i - 1]).id);
  else refreshSidebar();
}

function moveSection(id, dir) {
  const list = app.book.sections;
  const i = list.findIndex((s) => s.id === id);
  const type = list[i].type;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].type !== type) j += dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  app.markDirty(); refreshSidebar(); schedulePreview();
}
function reorder(fromId, toId) {
  const list = app.book.sections;
  const from = list.findIndex((s) => s.id === fromId);
  const to = list.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0 || from === to || list[from].type !== list[to].type) return;
  const [s] = list.splice(from, 1);
  list.splice(to, 0, s);
  app.markDirty(); refreshSidebar(); schedulePreview();
}

function selectSection(id, goTo) {
  flushSerialize();
  // Choosing a chapter, scene or note ends template browsing: the device shows the book.
  if (app.tplBrowsing || app.tplExample) { document.querySelector('.ts-list')?.remove(); app.tplBrowsing = false; app.tplExample = false; }
  if (findScene(id)) return selectScene(id);
  if (findResearch(id)) {
    // Index cards open in their own window over the editor, which keeps your place.
    if (findResearch(id).kind === 'card') { openCardEditor(findResearch(id)); return undefined; }
    return selectResearch(id);
  }
  const s = app.book.sections.find((x) => x.id === id);
  if (!s) return;
  if (hasScenes(s)) return selectChapterOverview(s, goTo);
  app.currentId = id;
  app.previewId = id;
  app.previewSpecial = null;
  const def = SECTION_TYPES[s.type];
  selectSectionHeader(s);
  els.secTitle.hidden = !!def.generated || ['dedication', 'epigraph', 'copyright'].includes(s.type);
  const aboutLbl = s.type === 'about-author' ? aboutAuthorsLabel(app.book) : '';
  els.secTitle.value = aboutLbl && /^about the authors?$/i.test((s.title || '').trim()) ? aboutLbl : s.title || '';
  els.secTitle.placeholder = s.type === 'chapter' ? 'Chapter title' : aboutLbl || def.label;
  els.headRow.hidden = s.type !== 'chapter';
  els.sceneBtn.hidden = !SCENE_TYPES.includes(s.type);
  els.sceneBtnLabel.textContent = 'Scenes';
  els.secSub.hidden = !SCENE_TYPES.includes(s.type); els.secSub.value = s.subtitle || '';
  showNotesButton(s);
  syncHeadSel();
  els.secExtra.replaceChildren();
  if (def.generated) {
    els.editorMount.hidden = true;
    els.genMount.hidden = false;
    els.genMount.replaceChildren(generatedPanel(app, s));
  } else {
    els.genMount.hidden = true;
    els.editorMount.hidden = false;
    app.editor.load(id, app.contents[id] ?? '');
  }
  refreshSidebar();
  pendingGoTo = goTo || 'caret';
  schedulePreview(false, true);
}

/* ================================================================ scenes */

function sceneLabel(sc, i) {
  return sc.title || sceneSnippet(app.contents[sc.id]) || `Scene ${i + 1}`;
}

function sceneRow(chapter, sc, i) {
  const active = sc.id === app.currentId;
  const li = h('li', { class: `sb-row scene${active ? ' active' : ''}${sc.exclude ? ' excluded' : ''}${filterActive() ? (matchesFilter(sc) ? ' hit' : ' dim') : ''}`, title: sc.exclude ? 'Excluded from the book' : null, role: 'option', 'aria-selected': String(active), draggable: 'true', tabindex: -1 });
  const name = h('button', { class: 'sb-name', onclick: () => selectSection(sc.id), oncontextmenu: (e) => { e.preventDefault(); sceneMenu(name, chapter, sc); } },
    icon('scene', 14), ...rowDecor(sc).slice(0, 1), h('span', { class: 'sb-label' }, sceneLabel(sc, i)), ...rowDecor(sc).slice(1), sc.exclude ? h('span', { class: 'sb-excl', title: 'Excluded from the book' }, icon('eyeOff', 13)) : null);
  const more = h('button', { class: 'sb-more', title: 'More', 'aria-label': 'More', onclick: (e) => { e.stopPropagation(); sceneMenu(more, chapter, sc); } }, icon('more', 16));
  li.append(name, more);
  li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-scene', sc.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));
  li.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-scene')) { e.preventDefault(); li.classList.add('drop'); } });
  li.addEventListener('dragleave', () => li.classList.remove('drop'));
  li.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); li.classList.remove('drop'); moveSceneTo(e.dataTransfer.getData('text/x-scene'), chapter, chapter.scenes.indexOf(sc)); });
  return li;
}

/** Statistics sheet for a chapter, section or scene. */

/** Drag a scene card onto another to put it in that position. */
function dragCard(chapter, sc, i, el) {
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-scene', sc.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/x-scene')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    el.classList.toggle('drop-before', !after);
    el.classList.toggle('drop-after', after);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const after = el.classList.contains('drop-after');
    el.classList.remove('drop-before', 'drop-after');
    const id = e.dataTransfer.getData('text/x-scene');
    if (!id || id === sc.id) return;
    moveSceneTo(id, chapter, i + (after ? 1 : 0));
    selectSection(chapter.id);
  });
  return el;
}

/** One menu item, “New Chapter” or “New Scene”, that asks where: before or after. */
function beforeAfterItem(label, beforeLabel, before, afterLabel, after) {
  return { label, icon: 'plus', subWidth: 210, submenu: [
    { label: beforeLabel, icon: 'up', onClick: before },
    { label: afterLabel, icon: 'down', onClick: after },
  ] };
}
const newChapterItem = (chapter) => beforeAfterItem('New Chapter', 'Before This Chapter', () => addSection('chapter', { before: chapter }), 'After This Chapter', () => addSection('chapter', { after: chapter }));

function sceneMenu(anchor, chapter, sc) {
  const i = chapter.scenes.indexOf(sc);
  const others = app.book.sections.filter((x) => (x.type === 'chapter' || x.type === 'appendix') && x !== chapter);
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  popover(anchor, [
    ...binderCardItems(chapter, i),
    newChapterItem(chapter),
    beforeAfterItem('New Scene', 'Before This Scene', () => addScene(chapter, i), 'After This Scene', () => addScene(chapter, i + 1)),
    '-',
    ...organizeItems(anchor, sc, () => { rejoin(chapter); afterExportChange(); }, () => openSceneInsights(chapter, sc)),
    '-',
    { label: 'Move Up', icon: 'up', disabled: i === 0, onClick: () => moveSceneTo(sc.id, chapter, i - 1) },
    { label: 'Move Down', icon: 'down', disabled: i === chapter.scenes.length - 1, onClick: () => moveSceneTo(sc.id, chapter, i + 2) },
    ...(others.length ? ['-', { header: 'Move to' }, ...others.slice(0, 12).map((c) => ({ label: numbered.find((n) => n.id === c.id)?.tocTitle || c.title || 'Chapter', icon: 'doc', onClick: () => moveSceneTo(sc.id, c, (c.scenes || []).length) }))] : []),
    '-',
    { label: 'Delete Scene…', icon: 'trash', danger: true, onClick: () => deleteScene(chapter, sc) },
  ], { width: 240 });
}

/** Turn the chapter's existing text into the first scene(s), then add a new one. */
function ensureScenes(chapter, split) {
  if (hasScenes(chapter)) return;
  flushSerialize();
  const parts = split ? splitAtBreaks(app.contents[chapter.id] || '') : [app.contents[chapter.id] || ''];
  chapter.scenes = parts.map((text) => {
    const sc = { id: newId('sce'), title: '' };
    app.contents[sc.id] = text;
    app.dirtyFiles.add(sc.id);
    return sc;
  });
  app.editor.forget(chapter.id);
}

/* ---- per-chapter / per-scene activity: created, updated, time spent, words per day.
   Stored in lutefisk.yaml next to each section so it travels with the book. */
const ACTIVE_GAP = 90000;
const lastEdit = new Map();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function nodeById(id) {
  const sc = findScene(id);
  return sc ? sc.scene : app.book?.sections.find((s) => s.id === id);
}
function statsOf(node, id) {
  node.stats ||= {};
  const st = node.stats;
  if (!st.created) st.created = app.fileTimes?.[id]?.created || new Date().toISOString();
  st.days ||= {};
  return st;
}
function trackActivity(id) {
  const node = id && nodeById(id);
  if (!node) return;
  const st = statsOf(node, id);
  const now = Date.now();
  const prev = lastEdit.get(id) || 0;
  const day = (st.days[today()] ||= { w: 0, s: 0 });
  if (prev && now - prev <= ACTIVE_GAP) { const secs = Math.round((now - prev) / 1000); st.seconds = (st.seconds || 0) + secs; day.s += secs; }
  lastEdit.set(id, now);
  st.updated = new Date(now).toISOString();
  st.edits = (st.edits || 0) + 1;
}
/** Called when an editor's text is written back: records net words for today. */
function trackWords(id) {
  const node = id && nodeById(id);
  if (!node || !node.stats) return;
  const words = countWords(app.contents[id]);
  const st = node.stats;
  if (st.lastWords == null) { st.lastWords = words; return; }
  const delta = words - st.lastWords;
  if (delta) { (st.days[today()] ||= { w: 0, s: 0 }).w += delta; st.lastWords = words; }
}

const SCENE_TYPES = ['chapter', 'prologue', 'epilogue', 'appendix'];

/* A chapter or scene was opened: refresh the Comments button. */
function showNotesButton(node) {
  if (node.synopsis && !node.notes) { node.notes = node.synopsis; app.markDirty(); } // older books: keep the text, no longer shown
  delete node.synopsis;
  drawCommentsBtn();

}

/** The scenes popover in the editor header. */
function sceneActions(anchor) {
  const found = findScene(app.currentId);
  const chapter = found?.chapter || currentSection();
  if (!chapter) return;
  const mod = window.lutefisk.platform === 'darwin' ? '⌥⌘' : 'Ctrl+Alt+';
  const items = [];
  if (found) {
    items.push(
      { label: 'New Scene After This', icon: 'plus', hint: `${mod}N`, onClick: () => addScene(chapter, found.index + 1) },
      { label: 'Split Scene at Cursor', icon: 'scene', hint: `${mod}K`, onClick: () => splitAtCursor() },
      '-',
      { label: 'Scene Overview', icon: 'cards', onClick: () => selectSection(chapter.id) },
      { label: 'Move Up', icon: 'up', disabled: found.index === 0, onClick: () => moveSceneTo(found.scene.id, chapter, found.index - 1) },
      { label: 'Move Down', icon: 'down', disabled: found.index === chapter.scenes.length - 1, onClick: () => moveSceneTo(found.scene.id, chapter, found.index + 2) },
      '-',
      { label: 'Delete Scene…', icon: 'trash', danger: true, onClick: () => deleteScene(chapter, found.scene) },
    );
  } else if (hasScenes(chapter)) {
    items.push(
      { label: 'Add Scene', icon: 'plus', hint: `${mod}N`, onClick: () => addScene(chapter) },
      { label: 'Combine into One Chapter', icon: 'doc', onClick: () => combineScenes(chapter) },
    );
  } else {
    items.push(
      { header: 'Work on this chapter in scenes' },
      { label: 'Split at Scene Breaks', icon: 'scene', onClick: () => splitChapter(chapter) },
      { label: 'Split at Cursor', icon: 'scene', hint: `${mod}K`, onClick: () => splitAtCursor() },
      { label: 'Add a New Scene', icon: 'plus', hint: `${mod}N`, onClick: () => addScene(chapter) },
    );
  }
  popover(anchor, items);
}

/**
 * Right-click: Add New Scene… and Add New Chapter… (each then Before or After),
 * and Insert Scene from Research… when Research has scenes.
 * Items with `choices` open a second small menu.
 */
function structureItems() {
  if (!app.book || currentResearch()) return [];
  const found = findScene(app.currentId);
  const chapter = found?.chapter || currentSection();
  if (!chapter) return [];
  const items = [];
  const scenesOk = SCENE_TYPES.includes(chapter.type);
  const what = found ? 'This Scene' : 'This Chapter’s Text';
  if (scenesOk) {
    items.push({ label: 'Add New Scene…', icon: 'plus', choices: [
      { label: `Before ${what}`, icon: 'up', onClick: () => addScene(chapter, found ? found.index : 0) },
      { label: `After ${what}`, icon: 'down', onClick: () => addScene(chapter, found ? found.index + 1 : undefined) }] });
  }
  if (SECTION_TYPES[chapter.type].group === 'body') {
    items.push({ label: 'Add New Chapter…', icon: 'doc', choices: [
      { label: 'Before This Chapter', icon: 'up', onClick: () => addSection('chapter', { before: chapter }) },
      { label: 'After This Chapter', icon: 'down', onClick: () => addSection('chapter', { after: chapter }) }] });
  }
  return items;
}

/** A new index card (from the selection, or empty), in its own window. */
function newCard({ text = '', title = '', folder = null, from = null, onClose } = {}) {
  if (!app.book) return;
  const words = String(title || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const { item } = newResearchItem('card', { title: words.length ? words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '') : 'New Index Card', ...(folder ? { folder } : {}) });
  // Where it came from (chapter · scene), kept with the card and shown on it.
  if (from?.label) item.from = { label: from.label, ...(from.section ? { section: from.section } : {}), ...(from.scene ? { scene: from.scene } : {}) };
  app.book.research.push(item);
  // On the card: where it came from (chapter · scene), the highlighted text as a quote, then room for your note.
  const where = from?.label ? `*${from.label.replace(/[*_]/g, '\\$&')}*\n\n` : '';
  const quoted = String(text || '').trim() ? `${String(text).trim().split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')}\n\n` : '';
  app.contents[item.id] = where + quoted;
  app.dirtyNotes.add(item.id);
  app.markDirty();
  if (text) toast('Copied to a new index card in Research', 'ok', 1600);
  openCardEditor(item, { onClose, fresh: true });
}
/**
 * An index card in its own window, over the editor (which keeps your place): its title,
 * label and text; Insert into the Book…, Delete, and Done (or Esc) to go back.
 */
function openCardEditor(r, { onClose, fresh = false } = {}) {
  flushSerialize();
  let gone = false;
  const title = h('input', { type: 'text', class: 'card-title', placeholder: 'Title', 'aria-label': 'Card title' });
  title.value = r.title || '';
  title.addEventListener('input', () => { r.title = title.value; app.markDirty(); });
  // Tab (or Return) in the title goes straight to the writing.
  title.addEventListener('keydown', (e) => { if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') { e.preventDefault(); ed.focusNewLine(); } });
  const ed = createMiniEditor(app.contents[r.id] || '', { label: 'Index card', onChange: () => { app.contents[r.id] = ed.markdown(); app.dirtyNotes.add(r.id); app.markDirty(); } });
  const delBtn = h('button', { type: 'button', class: 'btn small plain danger-plain', onclick: async () => {
    await deleteResearch(r);
    if (!findResearch(r.id)) { gone = true; close(); }
  } }, icon('trash', 13), 'Delete');
  // Just the title and the card's text (where it came from is written at the top of the text).
  const body = h('div', { class: 'card-ed' }, h('div', { class: 'card-top' }, title), ed.el);
  const close = sheet('Index Card', body, {
    actions: h('div', { class: 'card-actions' }, delBtn),
    onClose: () => {
      if (!gone && findResearch(r.id)) { app.contents[r.id] = ed.markdown(); app.dirtyNotes.add(r.id); if (!r.title?.trim()) r.title = 'Untitled card'; }
      ed.destroy();
      refreshSidebar();
      onClose?.();
      // Back where you were (the window underneath, if there is one).
      requestAnimationFrame(() => {
        const under = [...document.querySelectorAll('.overlay')].pop();
        if (under) under.querySelector('textarea, .ProseMirror, input')?.focus();
        else if (!els.editorMount.hidden) app.editor.focus();
      });
    },
  });
  requestAnimationFrame(() => (fresh ? title.select() : ed.focusEnd()));
}
/** An index card's text without the location line at its top (that's shown on its own). */
function cardBody(r) {
  const md = app.contents[r.id] || '';
  const lines = md.split('\n');
  if (r.from?.label && /^\*.*\*\s*$/.test(lines[0] || '')) lines.shift();
  return lines.join('\n');
}
/**
 * Index Cards: every card laid out like the scenes of a chapter, each drawn as a ruled
 * index card. Click one to read or edit it; drag to reorder; a blank card makes a new one.
 */
function openIndexCards({ onChange } = {}) {
  const cards = () => (app.book.research || []).filter((r) => r.kind === 'card');
  const grid = h('div', { class: 'ixc-grid' });
  let dragId = null;
  const changed = () => { draw(); onChange?.(); };
  // Move a card before another (cards keep their place among the other research items).
  const move = (id, beforeId) => {
    const list = app.book.research, from = list.findIndex((x) => x.id === id);
    if (from < 0 || id === beforeId) return;
    const [it] = list.splice(from, 1);
    const to = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
    if (to < 0) { const last = list.map((x) => x.kind).lastIndexOf('card'); list.splice(last + 1, 0, it); } else list.splice(to, 0, it);
    app.markDirty(); changed();
  };
  function draw() {
    const list = cards();
    count.textContent = `${list.length} card${list.length === 1 ? '' : 's'}`;
    grid.replaceChildren(...list.map((r) => {
      const lb = r.label && labelById(r.label);
      const card = h('div', { class: 'ixc-card', role: 'button', tabindex: '0', draggable: 'true', title: 'Click to open · drag to reorder', 'data-id': r.id,
        onclick: (e) => { if (!e.target.closest('.ixc-del')) openCardEditor(r, { onClose: changed }); },
        onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openCardEditor(r, { onClose: changed }); } },
        ondragstart: (e) => { dragId = r.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); card.classList.add('dragging'); },
        ondragend: () => { dragId = null; card.classList.remove('dragging'); grid.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); },
        ondragover: (e) => { if (!dragId || dragId === r.id) return; e.preventDefault(); card.classList.add('drop-before'); },
        ondragleave: () => card.classList.remove('drop-before'),
        ondrop: (e) => { e.preventDefault(); card.classList.remove('drop-before'); if (dragId) move(dragId, r.id); } },
      h('div', { class: 'ixc-head' }, lb ? h('span', { class: 'sb-dot', style: { background: lb.color }, title: lb.name }) : null, h('b', {}, r.title || 'Untitled card')),
      h('div', { class: 'ixc-body' },
        r.from?.label ? h('small', { class: 'ixc-from' }, r.from.label) : null,
        h('p', {}, sceneSnippet(cardBody(r), 40) || '')),
      h('button', { type: 'button', class: 'ixc-del', title: 'Delete this card — it goes to the Recycle Bin', 'aria-label': 'Delete this card', draggable: 'false',
        onmousedown: (e) => e.stopPropagation(),
        onclick: async (e) => { e.stopPropagation(); await deleteResearch(r); changed(); } }, icon('trash', 13)));
      return card;
    }), h('button', { type: 'button', class: 'ixc-card add', onclick: () => newCard({ onClose: changed }),
      ondragover: (e) => { if (dragId) e.preventDefault(); }, ondrop: (e) => { e.preventDefault(); if (dragId) move(dragId, null); } },
    icon('plus', 22), h('span', {}, 'New Index Card')));
  }
  const count = h('span', { class: 'ixc-count' });
  const body = h('div', { class: 'ixc' },
    h('p', { class: 'ixc-hint' }, 'Click a card to read or edit it. Drag cards to put them in order. Right-click in your text › New Index Card to make one from what you’ve selected.'),
    grid);
  draw();
  sheet('Index Cards', body, { wide: true, actions: count });
}
/**
 * Binder right-click: index cards for this chapter or scene — Insert Index Card ▸ (a card ▸
 * where it goes) when Research has cards, and New Index Card.
 */
function binderCardItems(chapter, sceneIndex = null) {
  // For now index cards only go into Research (putting them back in the book comes later).
  if (!SCENE_TYPES.includes(chapter.type) && chapter.type !== 'chapter') return [];
  const id = sceneIndex != null ? chapter.scenes?.[sceneIndex]?.id || chapter.id : chapter.id;
  return [{ label: 'New Index Card', icon: 'card', onClick: () => newCard({ from: noteWhere(id) }) }, '-'];
}

/** ⌥⌘N: a new scene after the current one (or at the end of the chapter). */
function newSceneHere() {
  const found = findScene(app.currentId);
  if (found) return addScene(found.chapter, found.index + 1);
  const s = currentSection();
  if (s && SCENE_TYPES.includes(s.type)) return addScene(s);
  toast('Select a chapter to add a scene to it');
}

/** ⌥⌘K: split the current scene (or chapter) in two at the caret. */
function splitAtCursor() {
  const found = findScene(app.currentId);
  const chapter = found?.chapter || currentSection();
  if (!chapter || !SCENE_TYPES.includes(chapter.type) || (!found && hasScenes(chapter))) { toast('Put the cursor where the new scene should start'); return; }
  flushSerialize();
  const { before, after } = app.editor.splitAtCaret();
  const fresh = { id: newId('sce'), title: '' };
  if (found) {
    app.contents[found.scene.id] = before;
    app.dirtyFiles.add(found.scene.id);
    app.editor.forget(found.scene.id);
    chapter.scenes.splice(found.index + 1, 0, fresh);
  } else {
    const first = { id: newId('sce'), title: '' };
    app.contents[first.id] = before;
    app.dirtyFiles.add(first.id);
    chapter.scenes = [first, fresh];
    app.editor.forget(chapter.id);
  }
  app.contents[fresh.id] = after;
  app.dirtyFiles.add(fresh.id);
  rejoin(chapter);
  app.expanded.add(chapter.id);
  app.markDirty();
  toast(`Split into scene ${chapter.scenes.indexOf(fresh)} and ${chapter.scenes.indexOf(fresh) + 1}`, 'ok');
  selectSection(fresh.id);
}

function splitChapter(chapter) {
  ensureScenes(chapter, true);
  rejoin(chapter);
  app.expanded.add(chapter.id);
  app.markDirty();
  toast(chapter.scenes.length > 1 ? `Split into ${chapter.scenes.length} scenes at the scene breaks` : 'Chapter is now one scene — add more from the sidebar');
  selectSection(chapter.scenes[0].id);
}

function addScene(chapter, at, { title = '', text = '' } = {}) {
  const wasEmpty = !hasScenes(chapter);
  ensureScenes(chapter, false);
  const sc = { id: newId('sce'), title, stats: { created: new Date().toISOString(), days: {} } };
  chapter.scenes.splice(at ?? chapter.scenes.length, 0, sc);
  app.contents[sc.id] = text;
  app.dirtyFiles.add(sc.id);
  rejoin(chapter);
  app.expanded.add(chapter.id);
  app.markDirty();
  if (wasEmpty) toast('Your chapter text is now the first scene');
  selectSection(sc.id);
  els.secTitle.focus();
}

async function deleteScene(chapter, sc, { stay = false } = {}) {
  const words = countWords(app.contents[sc.id]);
  if (words && !(await confirmDialog(`Delete “${sceneLabel(sc, chapter.scenes.indexOf(sc))}”?`, `${words.toLocaleString()} words. It moves to the Recycle Bin, where you can restore it.`))) return;
  flushSerialize();
  const i = chapter.scenes.indexOf(sc);
  const cn = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === chapter.id);
  toBin(app.book, { kind: 'scene', title: sceneLabel(sc, i), item: sc, texts: { [sc.id]: app.contents[sc.id] || '' }, where: { chapter: chapter.id, index: i, from: [cn?.label, chapter.title].filter(Boolean).join(': ') } });
  chapter.scenes.splice(i, 1);
  app.removed.push(sc.id);
  delete app.contents[sc.id];
  app.dirtyFiles.delete(sc.id);
  app.editor.forget(sc.id);
  if (!chapter.scenes.length) delete chapter.scenes;
  else rejoin(chapter);
  if (!hasScenes(chapter)) { app.dirtyFiles.add(chapter.id); }
  app.markDirty();
  // From a scene card, stay on the chapter's overview; otherwise open the neighboring scene.
  selectSection(stay || !hasScenes(chapter) ? chapter.id : chapter.scenes[Math.min(i, chapter.scenes.length - 1)].id);
  toast('Scene moved to the Recycle Bin', 'info', 1800);
}

function moveSceneTo(sceneId, target, index) {
  const from = findScene(sceneId);
  if (!from) return;
  flushSerialize();
  from.chapter.scenes.splice(from.index, 1);
  if (from.chapter === target && index > from.index) index -= 1;
  if (!hasScenes(target)) ensureScenes(target, false);
  target.scenes.splice(Math.max(0, Math.min(index, target.scenes.length)), 0, from.scene);
  if (!from.chapter.scenes.length) { delete from.chapter.scenes; app.contents[from.chapter.id] = ''; app.dirtyFiles.add(from.chapter.id); }
  rejoin(from.chapter); rejoin(target);
  app.expanded.add(target.id);
  app.markDirty(); app.htmlCache.clear();
  refreshSidebar(); schedulePreview(false, true);
}

function combineScenes(chapter) {
  flushSerialize();
  app.contents[chapter.id] = joinScenes(chapter.scenes, app.contents, { all: true });
  for (const sc of chapter.scenes) { app.removed.push(sc.id); app.dirtyFiles.delete(sc.id); app.editor.forget(sc.id); delete app.contents[sc.id]; }
  delete chapter.scenes;
  app.dirtyFiles.add(chapter.id);
  app.editor.forget(chapter.id);
  app.markDirty();
  toast('Scenes combined into one chapter');
  selectSection(chapter.id);
}

function resetHeaderControls() {
  els.backToResearch.hidden = true; els.headRow.hidden = true; els.secTitle.hidden = false; els.sceneBtn.hidden = true;
  els.secSub.hidden = true; els.commentsBtn.hidden = true;
  els.secExtra.replaceChildren();
}

function selectScene(id) {
  const { chapter, scene, index } = findScene(id);
  app.currentId = id;
  app.previewId = chapter.id;
  app.previewSpecial = null;
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === chapter.id);
  resetHeaderControls();
  els.secKind.textContent = `${n?.tocTitle || chapter.title || 'Chapter'} · Scene ${index + 1} of ${chapter.scenes.length}`;
  els.secTitle.value = scene.title || '';
  els.secTitle.placeholder = 'Scene title';
  els.sceneBtn.hidden = false;
  els.sceneBtnLabel.textContent = `Scene ${index + 1} of ${chapter.scenes.length}`;
  showNotesButton(scene);
  els.secExtra.replaceChildren(); // no Insights/Label/Status row in the editor (they're in the binder's right-click menu)
  els.genMount.hidden = true;
  els.editorMount.hidden = false;
  app.editor.load(id, app.contents[id] ?? '');
  app.expanded.add(chapter.id);
  refreshSidebar();
  pendingGoTo = 'caret';
  schedulePreview(false, true);
}

function selectChapterOverview(chapter, goTo) {
  app.currentId = chapter.id;
  app.previewId = chapter.id;
  app.previewSpecial = null;
  resetHeaderControls();
  selectSectionHeader(chapter);
  els.secTitle.value = chapter.title || '';
  els.secTitle.placeholder = 'Chapter title';
  els.headRow.hidden = chapter.type !== 'chapter';
  els.sceneBtn.hidden = false;
  els.sceneBtnLabel.textContent = `${chapter.scenes.length} Scene${chapter.scenes.length === 1 ? '' : 's'}`;
  els.secSub.hidden = false; els.secSub.value = chapter.subtitle || '';
  showNotesButton(chapter);
  syncHeadSel();
  els.editorMount.hidden = true;
  els.genMount.hidden = false;
  const redraw = () => selectChapterOverview(chapter);
  const cards = h('div', { class: 'scene-cards' }, chapter.scenes.map((sc, i) => {
    const card = h('div', { class: `scene-card${sc.exclude ? ' excluded' : ''}`, draggable: 'true', title: 'Click to open · drag to reorder', role: 'button', tabindex: '0',
      onclick: (e) => { if (!e.target.closest('.sc-tools')) selectSection(sc.id); },
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); selectSection(sc.id); } },
      oncontextmenu: (e) => { e.preventDefault(); sceneMenu(e.currentTarget, chapter, sc); } },
    h('div', { class: 'sc-num' }, `Scene ${i + 1}`, sc.exclude ? h('span', { class: 'sc-excl', title: 'Excluded from the book' }, icon('ignore', 12), 'Excluded') : null),
    h('b', {}, sc.title || 'Untitled scene'),
    h('p', {}, sceneSnippet(app.contents[sc.id], 28) || 'Empty'),
    h('small', {}, `${countWords(app.contents[sc.id]).toLocaleString()} words`),
    // Only a trash button on the card (Insights, Label and Status are in the binder's right-click menu).
    h('div', { class: 'ch-tools sc-tools', onmousedown: (e) => e.stopPropagation(), draggable: 'false', ondragstart: (e) => { e.preventDefault(); e.stopPropagation(); } },
      h('button', { type: 'button', class: 'chip-toggle ch-chip ch-delete', title: 'Delete this scene — it goes to the Recycle Bin', 'aria-label': 'Delete this scene', onclick: (e) => { e.stopPropagation(); deleteScene(chapter, sc, { stay: true }); } }, icon('trash', 13))));
    return dragCard(chapter, sc, i, card);
  }),
  h('button', { class: 'scene-card add', onclick: () => addScene(chapter) }, icon('plus', 22), h('span', {}, 'Add Scene')));
  // The chapter as a whole: Insights, label, status and export.
  els.genMount.replaceChildren(h('div', { class: 'gen-panel wide' },
    cards,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => combineScenes(chapter) }, 'Combine into One Chapter'))));
  app.expanded.add(chapter.id);
  refreshSidebar();
  pendingGoTo = goTo || 'start';
  schedulePreview(false, true);
}


function openSceneInsights(chapter, sc) {
  flushSerialize();
  const i = chapter.scenes.indexOf(sc);
  const name = sceneLabel(sc, i);
  openInsights(app, app.goals, sheet, { tab: 'text', textOnly: true, title: `Insights — ${name}`, unitLabel: 'Scene', textUnits: () => [{ id: sc.id, title: name, type: 'chapter', text: proseText(app.contents[sc.id]) }], pages: () => 0 });
}

function openChapterInsights(chapter) {
  flushSerialize();
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === chapter.id);
  const name = chapter.type === 'chapter' ? [n?.label, n?.displayTitle].filter(Boolean).join(': ') || 'Chapter' : n?.displayTitle || chapter.title || 'Section';
  const units = hasScenes(chapter)
    ? chapter.scenes.map((sc, i) => ({ id: sc.id, title: sceneLabel(sc, i), type: 'chapter', text: proseText(app.contents[sc.id]) }))
    : [{ id: chapter.id, title: name, type: chapter.type, text: proseText(app.contents[chapter.id]) }];
  openInsights(app, app.goals, sheet, { tab: 'text', textOnly: true, title: `Insights — ${name}`, unitLabel: hasScenes(chapter) ? 'Scene' : 'Chapter', textUnits: () => units, pages: () => 0 });
}

/* ============================================================== research */

/**
 * The Research button at the top of the binder: a menu to browse research,
 * add notes, folders, links and files, and reach Snippets and To-Do.
 */
/**
 * Research: the book's research/README.md — Markdown on the left (with buttons for common
 * formatting), a preview on the right — saved as you type and on Done/Esc. Its bar: Upload
 * Files…, Open Containing Folder, Index Cards (all of them: open one to read, edit or delete
 * it; or make a new one), Bibliography; and Characters, Plot and Timeline. Uploaded files are listed
 * under the notes; pictures go into the notes as you upload them.
 */
async function openResearchHub() {
  if (!app.book || !B.research) return;
  flushSerialize();
  let doc;
  try { doc = await B.research.readme({ title: app.book.title }); } catch (err) { toast(clean(err), 'error'); return; }
  let last = doc.text;
  // In README.md, pictures are linked by file name (next to it); the preview needs research/<name>.
  const toBook = (md) => md.replace(/(!\[[^\]]*\]\()(?!https?:|research\/|assets\/|#|\/)([^)\s]+)/g, (m, a, f) => `${a}research/${decodeURIComponent(f)}`);
  const area = h('textarea', { class: 'cr-raw', spellcheck: 'true', 'aria-label': 'Research notes', placeholder: 'Notes, sources, ideas…' });
  area.value = doc.text;
  const view = h('div', { class: 'cr-view', 'aria-label': 'Preview' });
  const md = createMarkdown({ typographer: true });
  const render = () => {
    const dom = new DOMParser().parseFromString(md.render(toBook(area.value)), 'text/html');
    for (const img of dom.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (/^research\/[A-Za-z0-9._ -]+$/.test(src)) img.setAttribute('src', assetUrl(src)); else img.remove();
    }
    view.replaceChildren(...dom.body.childNodes);
    if (!area.value.trim()) view.replaceChildren(h('p', { class: 'cr-empty' }, 'Your notes show here as you type.'));
  };
  const renderSoon = debounce(render, 60);
  view.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:)/i.test(href)) B.openExternal(href).catch(() => toast('Invalid web address', 'warn'));
  });
  const save = async () => {
    if (area.value === last) return;
    const text = area.value;
    try { await B.research.saveReadme({ text }); last = text; } catch (err) { toast(`Couldn’t save your research notes: ${clean(err)}`, 'error'); }
  };
  const saveSoon = debounce(save, 700);
  const changed = () => { renderSoon(); saveSoon(); };
  area.addEventListener('input', changed);

  /* The toolbar: the main editor's tools, writing the book's own Markdown (the preview shows them).
     Changes go through the text box's own editing, so ⌘Z / the Undo button take them back. */
  const edit = (a, b, text, selA, selB) => {
    area.focus();
    area.setSelectionRange(a, b);
    if (!document.execCommand('insertText', false, text)) area.setRangeText(text, a, b, 'end');
    if (selA != null) area.setSelectionRange(selA, selB ?? selA);
    changed();
  };
  const wrap = (pre, post, placeholder) => () => {
    const { selectionStart: a, selectionEnd: b, value } = area;
    // Already wrapped: take it off.
    if (a !== b && value.slice(a - pre.length, a) === pre && value.slice(b, b + post.length) === post) {
      edit(a - pre.length, b + post.length, value.slice(a, b), a - pre.length, b - pre.length); return;
    }
    const sel = value.slice(a, b) || placeholder;
    edit(a, b, pre + sel + post, a + pre.length, a + pre.length + sel.length);
  };
  // The lines the selection touches.
  const lineRange = () => {
    const { selectionStart: a, selectionEnd: b, value } = area;
    const start = value.lastIndexOf('\n', a - 1) + 1;
    const nl = value.indexOf('\n', b);
    return { start, end: nl < 0 ? value.length : nl, value };
  };
  const BLOCK_RE = /^(#{1,6} |> |- |\* |\d+\. )/;
  const setBlock = (prefix, numbered = false) => {
    const { start, end, value } = lineRange();
    const block = value.slice(start, end).split('\n');
    const has = block.every((l) => (numbered ? /^\d+\. /.test(l) : prefix && l.startsWith(prefix)));
    const out = block.map((l, i) => { const bare = l.replace(BLOCK_RE, ''); return has || (!prefix && !numbered) ? bare : `${numbered ? `${i + 1}. ` : prefix}${bare}`; }).join('\n');
    edit(start, end, out, start + out.length);
  };
  const insertLink = async () => {
    const { selectionStart: a, selectionEnd: b, value } = area;
    const res = await dialog({ title: 'Link', fields: [{ name: 'text', label: 'Name', value: value.slice(a, b) }, { name: 'url', label: 'Web address', placeholder: 'https://…' }], ok: 'Insert' });
    if (!res?.url?.trim()) { area.focus(); return; }
    const url = /^[a-z]+:/i.test(res.url.trim()) ? res.url.trim() : `https://${res.url.trim()}`;
    const t = `[${res.text.trim() || url}](${url})`;
    edit(a, b, t, a + t.length);
  };
  const insertTable = (rows, cols) => {
    const row = (cells) => `| ${cells.join(' | ')} |`;
    const head = Array.from({ length: cols }, (_, i) => `Heading ${i + 1}`);
    insert([row(head), row(head.map(() => '---')), ...Array.from({ length: rows }, () => row(head.map(() => '   ')))].join('\n'));
  };
  const insertMath = async () => {
    const res = await openMathDialog({});
    if (res?.tex) insert(res.display ? `$$${res.tex}$$` : `$${res.tex}$`); else area.focus();
  };
  const insertCode = async () => {
    const res = await dialog({ title: 'Insert Code', fields: [{ name: 'lang', label: 'Language (optional)', placeholder: 'e.g. python, js, json' }, { name: 'code', label: 'Code', type: 'textarea', rows: 8 }], ok: 'Insert' });
    if (!res) { area.focus(); return; }
    insert(`\`\`\`${res.lang.trim().replace(/[^\w+#.-]/g, '')}\n${res.code.replace(/\n+$/, '')}\n\`\`\``);
  };
  const COLORS = [['#1f1f1f', 'Ink'], ['#6b6b6b', 'Gray'], ['#b03a2e', 'Red'], ['#c0571b', 'Orange'], ['#8a6d1d', 'Ochre'], ['#2e7d32', 'Green'], ['#00796b', 'Teal'], ['#1f5fa8', 'Blue'], ['#283593', 'Navy'], ['#6a3d9a', 'Purple'], ['#ad1457', 'Magenta'], ['#6d4c41', 'Brown']];
  const HIGHLIGHTS = [['yellow', 'Yellow', '#fff3a3'], ['green', 'Green', '#c8f2c2'], ['blue', 'Blue', '#cfe5ff'], ['pink', 'Pink', '#ffd3e6'], ['orange', 'Orange', '#ffdcb5'], ['purple', 'Purple', '#e6d6ff']];
  const swatches = (anchor, list, onPick) => popover(anchor, [{ node: h('div', { class: 'cr-swatches', onmousedown: (e) => e.preventDefault() },
    list.map(([v, name, bg]) => h('button', { type: 'button', class: 'cr-sw', title: name, 'aria-label': name, style: { background: bg || v }, onclick: () => { closePopovers(); onPick(v); } }))) }], { width: 200 });
  const fbtn = (ic, title, onclick) => h('button', { type: 'button', class: 'cr-fbtn', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick }, icon(ic, 15));
  const menuBtn = (ic, title, items) => {
    const b = h('button', { type: 'button', class: 'cr-fbtn cr-fmenu', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: () => popover(b, items(), { width: 230 }) }, icon(ic, 15), h('span', { class: 'cr-caret' }, icon('chevron', 9)));
    return b;
  };
  const styleBtn = menuBtn('heading', 'Paragraph style', () => [
    { label: 'Paragraph', onClick: () => setBlock('') },
    ...[1, 2, 3, 4].map((n) => ({ label: `Heading ${n}`, hint: '#'.repeat(n), onClick: () => setBlock(`${'#'.repeat(n)} `) })),
    { label: 'Blockquote', icon: 'quote', hint: '>', onClick: () => setBlock('> ') },
  ]);
  const colorBtn = fbtn('textColor', 'Text color', () => swatches(colorBtn, COLORS, (c) => wrap('[', `]{color=${c}}`, 'text')()));
  const hlBtn = fbtn('highlighter', 'Highlight', () => swatches(hlBtn, HIGHLIGHTS, (c) => wrap(c === 'yellow' ? '==' : `=={${c},full}`, '==', 'text')()));
  const fbar = h('div', { class: 'cr-fbar', role: 'toolbar', 'aria-label': 'Formatting' },
    fbtn('undo', 'Undo (⌘Z)', () => { area.focus(); document.execCommand('undo'); changed(); }),
    fbtn('redo', 'Redo (⇧⌘Z)', () => { area.focus(); document.execCommand('redo'); changed(); }),
    h('span', { class: 'cr-fsep' }),
    styleBtn,
    h('span', { class: 'cr-fsep' }),
    fbtn('bold', 'Bold (⌘B)', wrap('**', '**', 'bold text')),
    fbtn('italic', 'Italic (⌘I)', wrap('*', '*', 'italic text')),
    fbtn('underline', 'Underline (⌘U)', wrap('++', '++', 'text')),
    menuBtn('textStyle', 'Subscript, superscript and strikethrough', () => [
      { label: 'Subscript', icon: 'subscript', onClick: wrap('~', '~', 'x') },
      { label: 'Superscript', icon: 'superscript', onClick: wrap('^', '^', 'x') },
      { label: 'Strikethrough', icon: 'strike', onClick: wrap('~~', '~~', 'text') },
    ]),
    h('span', { class: 'cr-fsep' }),
    colorBtn, hlBtn,
    h('span', { class: 'cr-fsep' }),
    menuBtn('plus', 'Insert — link, image, list, table, code, formula, symbol or line', () => [
      { label: 'Link', icon: 'link', hint: '⌘K', onClick: insertLink },
      { label: 'Image', icon: 'image', onClick: () => upload({ imagesOnly: true, insertPictures: true }) },
      { label: 'List', icon: 'listMenu', subWidth: 200, submenu: [
        { label: 'Bulleted List', icon: 'ul', onClick: () => setBlock('- ') },
        { label: 'Numbered List', icon: 'ol', onClick: () => setBlock('', true) },
      ] },
      { label: 'Table', icon: 'table', subWidth: 200, submenu: [[2, 2], [3, 2], [3, 3], [4, 4]].map(([c, r]) => ({ label: `${c} columns × ${r} rows`, icon: 'table', onClick: () => insertTable(r, c) })) },
      { label: 'Insert Code', icon: 'code', onClick: insertCode },
      { label: 'Insert Formula', icon: 'mathFx', onClick: insertMath },
      { label: 'Insert Symbol', icon: 'omega', onClick: () => openSymbolPicker({ onInsert: (ch) => { const a = area.selectionStart; edit(a, area.selectionEnd, ch, a + ch.length); }, onClose: () => area.focus() }) },
      { label: 'Horizontal Line', icon: 'hline', onClick: () => insert('---') },
    ]));
  area.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && ['b', 'i', 'u', 'k'].includes(k)) {
      e.preventDefault();
      ({ b: wrap('**', '**', 'bold text'), i: wrap('*', '*', 'italic text'), u: wrap('++', '++', 'text'), k: insertLink })[k]();
      return;
    }
    if (e.key !== 'Tab' || mod || e.altKey) return;
    e.preventDefault();
    edit(area.selectionStart, area.selectionEnd, '  ');
  });
  // Put Markdown at the cursor, as its own paragraph.
  function insert(text) {
    const { selectionStart: a, selectionEnd: b, value } = area;
    const pre = value.slice(0, a), gap = pre && !pre.endsWith('\n\n') ? (pre.endsWith('\n') ? '\n' : '\n\n') : '';
    const after = value.slice(b), lead = after.match(/^\n*/)[0].length;
    const t = `${gap}${text}\n\n`;
    edit(a, b + lead, t, a + gap.length + text.length);
  }
  render();

  /* Files: everything uploaded to Research, shown under the notes. Uploading only copies a
     file in; a picture goes into the notes only from the toolbar's Image item, or with
     "Insert into Notes" on its tile. */
  const filesGrid = h('div', { class: 'cr-files' });
  const filesCount = h('span', { class: 'cr-count' });
  const filesEl = h('section', { class: 'cr-files-box', 'aria-label': 'Files' },
    h('div', { class: 'cr-files-head' }, h('span', { class: 'cr-pane-head' }, 'Files'), filesCount),
    filesGrid);
  const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);
  const ext = (name) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] || 'file').toUpperCase();
  const inNotes = (name) => area.value.includes(`(${name})`) || area.value.includes(`(${encodeURI(name)})`);
  const picMd = (name) => `![${name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')}](${/\s/.test(name) ? encodeURI(name) : name})`;
  const drawFiles = async () => {
    let list = [];
    try { list = await B.research.files(); } catch { /* none */ }
    filesCount.textContent = list.length ? String(list.length) : '';
    filesCount.hidden = !list.length;
    const open = (f) => B.research.openNamed({ name: f.name }).catch((err) => toast(clean(err), 'error'));
    filesGrid.replaceChildren(...(list.length ? list.map((f) => {
      const thumbOk = f.image && /^[A-Za-z0-9._ -]+$/.test(f.name);
      const used = f.image && inNotes(f.name);
      return h('div', { class: 'cr-file' },
        h('button', { type: 'button', class: 'cr-file-thumb', title: `Open “${f.name}”`, onclick: () => open(f) },
          thumbOk ? h('img', { src: assetUrl(`research/${f.name}`), alt: '', loading: 'lazy', draggable: 'false' })
            : h('span', { class: 'cr-file-ext' }, icon(f.image ? 'image' : 'doc', 22), h('b', {}, ext(f.name)))),
        h('div', { class: 'cr-file-info' },
          h('span', { class: 'cr-file-name', title: f.name }, f.name),
          h('small', {}, [sizeText(f.size || 0), used ? 'in your notes' : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'cr-file-acts' },
          f.image ? h('button', { type: 'button', class: 'tb-btn', title: 'Insert into Notes — add this picture at the cursor', 'aria-label': 'Insert into Notes', onclick: () => { insert(picMd(f.name)); drawFiles(); } }, icon('plus', 14)) : null,
          h('button', { type: 'button', class: 'tb-btn', title: `Open “${f.name}”`, 'aria-label': 'Open', onclick: () => open(f) }, icon('share', 14))));
    }) : [h('div', { class: 'cr-nofiles' }, icon('download', 16), h('span', {}, 'No files yet. Use Upload Files… to keep pictures, PDFs and documents with this book’s research.'))]));
  };
  drawFiles();
  /** Upload: copies files into Research. insertPictures (the toolbar's Image item) also puts pictures in the notes. */
  async function upload({ imagesOnly = false, insertPictures = false } = {}) {
    try {
      const got = await B.research.upload({ imagesOnly });
      if (!got?.length) return;
      const pics = insertPictures ? got.filter((f) => f.image) : [];
      if (pics.length) insert(pics.map((f) => picMd(f.name)).join('\n\n'));
      toast(pics.length ? `Added ${pics.length === 1 ? 'the picture' : `${pics.length} pictures`} to your notes` : `Uploaded ${got.length} file${got.length === 1 ? '' : 's'} — see Files, under your notes`, 'ok', 2000);
      drawFiles();
    } catch (err) { toast(clean(err), 'error'); }
  }

  /* Index cards: all of them; open one to read, edit or delete it; or make a new one. */
  const cards = () => (app.book.research || []).filter((r) => r.kind === 'card');
  // In the story tools row, beside Timeline, with the same look.
  const cardsBtn = h('button', { type: 'button', class: 'cr-story', title: 'Index Cards — all your cards laid out; open one to read or edit it, or make a new one' });
  const drawCardsBtn = () => { const n = cards().length; cardsBtn.replaceChildren(...[icon('card', 16), h('span', {}, 'Index Cards'), n ? h('span', { class: 'cr-count' }, String(n)) : null].filter(Boolean)); };
  drawCardsBtn();
  const afterCard = () => { drawCardsBtn(); refreshSidebar(); };
  cardsBtn.addEventListener('click', () => openIndexCards({ onChange: afterCard }));

  /* Bibliography: the book's sources (closes Research and opens the Bibliography section). */
  const bibBtn = h('button', { type: 'button', class: 'cr-story', title: 'Bibliography — the sources for this book: add, edit and format them', onclick: () => { closeHub(); openBibliography(); } }, icon('cite', 16), h('span', {}, 'Bibliography'));

  const chip = (ic, text, title, onclick) => h('button', { type: 'button', class: 'chip-toggle ch-chip', title, onclick }, icon(ic, 14), h('span', {}, text));
  const story = (ic, text, title, onclick) => h('button', { type: 'button', class: 'cr-story', title, onclick }, icon(ic, 16), h('span', {}, text));
  // Characters, with the number of characters (like the button at the top of the editor).
  const castStory = story('people', 'Characters', 'Characters — your cast and where each one appears', () => openCast());
  { const n = (app.book.characters || []).length; if (n) castStory.append(h('span', { class: 'cr-count' }, String(n))); }
  const body = h('div', { class: 'cr-ed' },
    h('div', { class: 'cr-storybar', role: 'group', 'aria-label': 'Story tools' },
      castStory,
      story('plot', 'Plot', 'Plot — plotlines and chapters on a board of cards', () => openPlotBoard('board')),
      story('timeline', 'Timeline', 'Timeline — events in the order they happen in the story', () => openPlotBoard('timeline')),
      cardsBtn, bibBtn),
    h('div', { class: 'cr-bar' },
      chip('download', 'Upload Files…', 'Upload Files — copy pictures, PDFs, documents or anything else into Research; they’re listed under Files, below your notes', () => upload()),
      chip('folderOpen', 'Open Containing Folder', `Open Containing Folder — ${doc.dir}`, () => B.research.reveal().catch((err) => toast(clean(err), 'error'))),
    ),
    h('div', { class: 'cf-path cr-path', title: doc.path }, doc.path),
    fbar,
    h('div', { class: 'cr-split' }, h('div', { class: 'cr-pane' }, h('div', { class: 'cr-pane-head' }, 'Notes'), area), h('div', { class: 'cr-pane' }, h('div', { class: 'cr-pane-head' }, 'Preview'), view)),
    filesEl);
  const closeHub = sheet('Research', body, {
    wide: true,
    onClose: () => { save(); refreshSidebar(); requestAnimationFrame(() => { if (!els.editorMount.hidden) app.editor.focus(); }); },
  });
  requestAnimationFrame(() => { area.focus(); area.setSelectionRange(area.value.length, area.value.length); area.scrollTop = area.scrollHeight; });
}

/* ---- binder groups you've folded away, remembered on this computer */
const collapsedGroups = new Set((() => { try { return JSON.parse(localStorage.getItem('lutefisk.binderCollapsed') || '[]'); } catch { return []; } })());
function saveCollapsed() { try { localStorage.setItem('lutefisk.binderCollapsed', JSON.stringify([...collapsedGroups])); } catch { /* storage unavailable */ } }

/* ---- Recycle Bin */
function binRow() {
  const n = binCount(app.book);
  return h('section', { class: 'sb-group nav-group bin-group' }, h('ul', { class: 'sb-list' },
    h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name sb-bin', title: 'Recycle Bin — deleted chapters, scenes, index cards, characters and plot cards. Restore them from here.', onclick: () => openBin() },
      icon('trash', 15), h('span', { class: 'sb-label' }, 'Recycle Bin'), n ? h('span', { class: 'sb-count' }, String(n)) : null))));
}
function openBin() { openRecycleBin(app, sheet, { restore: restoreFromBin, onChange: () => { refreshSidebar(); app.refreshPreview(true); } }); }
/** Put a Recycle Bin entry back where it was. Returns true when restored. */
function restoreFromBin(e) {
  const b = app.book;
  const unique = (id) => !(b.sections.some((x) => x.id === id || x.scenes?.some((sc) => sc.id === id)) || (b.research || []).some((x) => x.id === id));
  const putText = (id, text, note = false) => {
    app.contents[id] = text ?? '';
    if (note) { app.removedNotes = app.removedNotes.filter((x) => x !== id); app.dirtyNotes.add(id); }
    else { app.removed = app.removed.filter((x) => x !== id); app.dirtyFiles.add(id); }
    app.htmlCache.delete?.(id);
  };
  const it = e.item;
  if (!it) return false;
  switch (e.kind) {
    case 'section': {
      if (!unique(it.id)) { toast('It’s already in the book', 'info'); return true; }
      const after = e.where?.after ? b.sections.findIndex((x) => x.id === e.where.after) : -1;
      const at = after >= 0 ? after + 1 : Math.min(e.where?.index ?? b.sections.length, b.sections.length);
      // Only one of each single section (title page, dedication…): if it was re-added, switch the existing one on instead.
      if (!SECTION_TYPES[it.type]?.multi && b.sections.some((x) => x.type === it.type && it.type !== 'chapter')) {
        const ex = b.sections.find((x) => x.type === it.type);
        ex.enabled = true;
        putText(ex.id, e.texts?.[it.id] ?? '');
      } else {
        b.sections.splice(at, 0, it);
        for (const [id, text] of Object.entries(e.texts || {})) putText(id, text);
      }
      app.markDirty(); app.htmlCache.clear();
      selectSection(it.id);
      return true;
    }
    case 'scene': {
      const ch = b.sections.find((x) => x.id === e.where?.chapter);
      const text = e.texts?.[it.id] ?? '';
      if (ch && hasScenes(ch)) {
        if (!unique(it.id)) return true;
        ch.scenes.splice(Math.min(e.where.index ?? ch.scenes.length, ch.scenes.length), 0, it);
        putText(it.id, text);
        rejoin(ch);
        app.markDirty(); app.htmlCache.clear();
        selectSection(it.id);
      } else if (ch) {
        // The chapter no longer has scenes: add the text at its end, after a scene break.
        flushSerialize();
        const prev = (app.contents[ch.id] || '').replace(/\s+$/, '');
        putText(ch.id, `${prev}${prev ? '\n\n* * *\n\n' : ''}${text.trim()}\n`);
        app.editor.forget?.(ch.id);
        app.markDirty(); app.htmlCache.clear();
        selectSection(ch.id);
        toast('Added at the end of its chapter', 'info', 2200);
      } else {
        // Its chapter was deleted too: it comes back as a chapter of its own, at the end of the body.
        const fresh = { id: it.id, type: 'chapter', title: it.title || '', enabled: true };
        const end = b.sections.findIndex((x) => x.type === 'epilogue' || SECTION_TYPES[x.type].group === 'back');
        b.sections.splice(end < 0 ? b.sections.length : end, 0, fresh);
        putText(it.id, text);
        app.markDirty(); app.htmlCache.clear();
        selectSection(it.id);
        toast('Its chapter is gone, so it came back as a chapter', 'info', 2600);
      }
      return true;
    }
    case 'research': {
      b.research = Array.isArray(b.research) ? b.research : [];
      if (!unique(it.id)) return true;
      if (it.kind === 'scene' || it.kind === 'note') it.kind = 'card'; // research notes and scenes are index cards now
      b.research.splice(Math.min(e.where?.index ?? b.research.length, b.research.length), 0, it);
      if (isTextItem(it)) putText(it.id, e.texts?.[it.id] ?? '', true);
      app.markDirty();
      return true;
    }
    case 'snippet': {
      // Snippets are index cards now.
      const { item } = newResearchItem('card', { title: it.title || 'Snippet' });
      b.research = Array.isArray(b.research) ? b.research : [];
      b.research.push(item); putText(item.id, it.text || '', true);
      app.markDirty(); toast('Restored as an index card in Research', 'info', 2200);
      return true;
    }
    case 'todo': b.todos = Array.isArray(b.todos) ? b.todos : []; b.todos.push(it); app.markDirty(); return true;
    case 'character': {
      b.characters = Array.isArray(b.characters) ? b.characters : [];
      b.characters.splice(Math.min(e.where?.index ?? b.characters.length, b.characters.length), 0, it);
      for (const card of b.plot?.cards || []) if ((e.where?.cards || []).includes(card.id)) card.chars = [...new Set([...(card.chars || []), it.id])];
      app.markDirty();
      return true;
    }
    case 'card': {
      if (!b.plot) { toast('The plot board isn’t set up', 'warn'); return false; }
      const line = b.plot.lines?.some((l) => l.id === it.line) ? it.line : b.plot.lines?.[0]?.id;
      const col = b.plot.columns?.some((c) => c.id === it.col) ? it.col : b.plot.columns?.[0]?.id;
      b.plot.cards.push({ ...it, line, col });
      app.markDirty();
      return true;
    }
    default: return false;
  }
}


/** Back to the Research window after working on something opened from it. */
function returnToResearch() {
  app.returnToResearch = null;
  els.backToResearch.hidden = true;
  openResearchHub();
}

async function deleteResearch(r) {
  if (!(await confirmDialog(`Delete “${r.title}”?`, isTextItem(r) ? 'It moves to the Recycle Bin, where you can restore it.' : 'It moves to the Recycle Bin, where you can restore it. The file itself stays in the book’s research folder.'))) return;
  flushSerialize();
  toBin(app.book, { kind: 'research', title: r.title, item: r, texts: isTextItem(r) ? { [r.id]: app.contents[r.id] || '' } : {}, where: { index: app.book.research.indexOf(r) } });
  app.book.research = app.book.research.filter((x) => x !== r);
  if (isTextItem(r)) { app.removedNotes.push(r.id); app.dirtyNotes.delete(r.id); delete app.contents[r.id]; app.editor.forget(r.id); }
  if (app.pinnedId === r.id) app.pinnedId = null;
  app.markDirty();
  if (app.currentId === r.id) selectSection(app.book.sections.find((x) => x.type === 'chapter').id);
  else { refreshSidebar(); if (app.view === 'research') drawResearchView(); }
}


function selectResearch(id) {
  const r = findResearch(id);
  app.currentId = id;
  resetHeaderControls();
  els.secKind.textContent = `Research · ${RESEARCH_LABEL[r.kind] || 'Item'}`;
  els.backToResearch.hidden = app.returnToResearch !== id;
  els.secTitle.value = r.title || '';
  els.secTitle.placeholder = 'Title';
  if (r.kind === 'card') {
    // An index card's label (putting cards back into the book comes later).
    const drawCardTools = () => {
      const lb = r.label && labelById(r.label);
      const lbBtn = h('button', { type: 'button', class: `chip-toggle ch-chip${lb ? ' on' : ''}`, title: lb ? `Label: ${lb.name}` : 'Label this index card', onclick: (e) => labelMenu(e.currentTarget, r, drawCardTools) },
        lb ? h('span', { class: 'sb-dot', style: { background: lb.color } }) : icon('tag', 15), h('span', {}, lb ? lb.name : 'Label'));
      els.secExtra.replaceChildren(h('div', { class: 'ch-tools' }, lbBtn));
    };
    drawCardTools();
  }
  if (isTextItem(r)) {
    els.genMount.hidden = true;
    els.editorMount.hidden = false;
    app.editor.load(id, app.contents[id] ?? '');
  } else {
    els.editorMount.hidden = true;
    els.genMount.hidden = false;
    els.genMount.replaceChildren(researchPanel(app, r));
  }
  refreshSidebar();
  updateStatus();
}

function drawResearchView() {
  const items = (app.book.research || []).filter((r) => r.kind !== 'folder');
  const pinned = findResearch(app.pinnedId) || null;
  const sel = h('select', { 'aria-label': 'Research item' }, h('option', { value: '' }, items.length ? 'Choose research…' : 'No research yet'),
    items.map((r) => h('option', { value: r.id }, `${RESEARCH_LABEL[r.kind]}: ${r.title}`)));
  sel.value = pinned?.id || '';
  sel.addEventListener('change', () => { app.pinnedId = sel.value || null; refreshSidebar(); drawResearchView(); });
  els.researchHost.replaceChildren(h('div', { class: 'pv-bar' }, h('label', { class: 'pv-ctl' }, icon('pin', 15), sel),
    h('span', { class: 'spacer' }), pinned && isTextItem(pinned) ? h('button', { class: 'btn small', onclick: () => selectSection(pinned.id) }, 'Edit') : null),
  h('div', { class: 'ref-scroll' }, researchReference(app, pinned)));
}

/* ============================================================== citations */

/** A bibliography source with this address, if there is one. */
const sameUrl = (u) => String(u || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
function findSourceByUrl(url) {
  const key = sameUrl(url);
  return key ? (app.book?.bibliography || []).find((e) => sameUrl(e.url) === key) || null : null;
}
/**
 * From the link dialog: the link's source, with the citation calculator. A link already
 * in the bibliography opens its details; a new one is added once saved. Returns its id.
 */
async function citeLink({ url, text }) {
  if (!app.book) return null;
  const known = findSourceByUrl(url);
  if (known) {
    if (await editSource(app, known, { title: 'Source details' })) { app.markDirty(); app.htmlCache.clear(); app.refreshPreview(true); }
    return known.id;
  }
  let entry;
  try { entry = entryFromUrl(url, { title: text && !looksLikeUrl(text) ? text : '' }); } catch (err) { toast(clean(err), 'error'); return null; }
  if (entry.kind === 'social') entry.title = ''; // a post is cited by its own words, not the link's name
  entry.id = `ref-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (!(await editSource(app, entry, { title: 'Add to Bibliography', ok: 'Add' }))) return null;
  app.book.bibliography ||= [];
  app.book.bibliography.push(entry);
  enableSection('bibliography');
  app.markDirty(); app.htmlCache.clear(); app.refreshPreview(true);
  toast('Added to the bibliography', 'ok', 1800);
  return entry.id;
}

/** Add New Source: the source details window; resolves to the new source, or null. */
async function addNewSource() {
  const e = { id: `ref-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: 'webpage', authors: [], title: '', accessed: localToday() };
  if (!(await editSource(app, e, { title: 'New Source', ok: 'Add to Bibliography' }))) return null;
  app.book.bibliography ||= [];
  app.book.bibliography.push(e);
  enableSection('bibliography');
  app.markDirty(); app.htmlCache.clear(); app.refreshPreview(true);
  return e;
}

/**
 * Insert Citation. A citation points to a source in the bibliography, so with none yet this
 * explains that and offers to add one (then carries on to the citation) or open the Bibliography.
 */
async function pickCitation(attrs) {
  if (!attrs && !(app.book.bibliography || []).length) {
    let toBib = false;
    const body = h('div', { class: 'cite-first' },
      h('p', {}, 'A citation points to a source in your bibliography — a book, article, web page or post — so the source comes first.'),
      h('p', {}, 'Add one now and you’ll go straight back to citing it. Or open the Bibliography to add several and read how each citation style works.'),
      h('button', { type: 'button', class: 'btn plain cite-bib-link', onclick: (ev) => { toBib = true; ev.currentTarget.closest('form')?.querySelector('.dlg-actions .btn:not(.primary)')?.click(); } }, icon('cite', 14), ' Open Bibliography'));
    const go = await dialog({ title: 'Add a Source First', body, ok: 'Add New Source…' });
    if (toBib) { openBibliography(); return undefined; }
    if (!go) return undefined;
    const e = await addNewSource();
    if (!e) return undefined;
  }
  return pickCitationFrom(attrs);
}
function pickCitationFrom(attrs) {
  return new Promise((resolve) => {
    const style = app.book.citationStyle || 'apa';
    const entries = [...(app.book.bibliography || [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    let chosen = attrs?.ref || entries[0]?.id || null;
    const search = h('input', { type: 'text', placeholder: 'Search sources…', 'aria-label': 'Search sources' });
    const locator = h('input', { type: 'text', placeholder: 'e.g. 12 or 12–14 (optional)', 'aria-label': 'Page' });
    locator.value = attrs?.locator || '';
    const list = h('div', { class: 'cite-list', role: 'listbox' });
    const sample = h('div', { class: 'cite-sample' });
    const cite = citer(app.book, app.contents);
    const draw = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren(...entries.filter((e) => !q || JSON.stringify([e.title, e.authors, e.container, e.date]).toLowerCase().includes(q)).map((e) => {
        const row = h('button', { type: 'button', class: `cite-row${e.id === chosen ? ' on' : ''}`, role: 'option', 'aria-selected': String(e.id === chosen), onclick: () => { chosen = e.id; draw(); }, ondblclick: () => finish() });
        row.innerHTML = '';
        const div = h('div', { class: 'cite-full' });
        div.innerHTML = formatEntry(e, style); // escaped by formatEntry
        row.append(div);
        return row;
      }));
      if (!entries.length) list.append(h('p', { class: 'hint' }, 'Your bibliography is empty. Add a source first.'));
      sample.textContent = chosen ? `Will appear as: ${cite(chosen, locator.value.trim())}` : '';
    };
    search.addEventListener('input', draw);
    locator.addEventListener('input', draw);
    const finish = () => { if (!chosen) return; done({ ref: chosen, locator: locator.value.trim() }); };
    const done = (v) => { overlay.remove(); resolve(v); };
    const form = h('form', { class: 'dlg-form', onsubmit: (e) => { e.preventDefault(); finish(); } },
      search, list,
      h('label', { class: 'fld' }, h('span', {}, style === 'mla' ? 'Page' : 'Page or location'), locator),
      sample,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn plain', style: { marginRight: 'auto' }, onclick: async () => {
          // A new source, then back here with it chosen.
          overlay.hidden = true;
          const e = await addNewSource();
          overlay.hidden = false;
          if (e) { entries.push(e); entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b))); chosen = e.id; form.querySelector('button[type=submit]').disabled = false; draw(); }
        } }, 'Add New Source…'),
        attrs ? h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, 'Remove') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => done(undefined) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary', disabled: !entries.length }, attrs ? 'Update' : 'Insert Citation')));
    const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(undefined); } } },
      h('div', { class: 'dlg wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Insert citation' }, h('h2', {}, attrs ? 'Edit Citation' : 'Insert Citation'), form));
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    draw();
    search.focus();
  });
}

/* ============================================================ focus mode */

let writingFocus = false;
function toggleWritingFocus(force) {
  writingFocus = force ?? !writingFocus;
  if (writingFocus && previewFocus) toggleFocus(false);
  els.shell.classList.toggle('writing-focus', writingFocus);
  els.edFocusBtn.replaceChildren(icon(writingFocus ? 'collapse' : 'expand', 15));
  els.edFocusBtn.setAttribute('aria-label', writingFocus ? 'Exit Focus' : 'Focus on writing');
  els.edFocusBtn.classList.toggle('on', writingFocus);
  if (writingFocus) {
    if (els.editorMount.hidden) { const ch = currentSection(); if (ch && hasScenes(ch)) selectSection(ch.scenes[0].id); }
    app.editor.focus();
    requestAnimationFrame(() => app.editor.centerCaret());
    toast('Focus mode — press Esc to exit', 'info', 1800);
  } else { schedulePreview(false, true); }
}

/* ===================================================== preview position */

// The preview can browse the whole book: front cover → every section → end.
app.previewSpecial = null; // 'cover' | 'end' | null
app.previewStep = (dir) => {
  const list = app.sections();
  if (app.previewSpecial === 'cover') { if (dir > 0) { app.previewSpecial = null; app.previewId = list[0]?.id; pendingGoTo = 'start'; schedulePreview(); } return; }
  if (app.previewSpecial === 'end') { if (dir < 0) { app.previewSpecial = null; app.previewId = list[list.length - 1]?.id; pendingGoTo = 'end'; schedulePreview(); } return; }
  const i = list.findIndex((s) => s.id === app.previewId);
  const t = list[i + dir];
  if (t) { app.previewId = t.id; pendingGoTo = dir > 0 ? 'start' : 'end'; }
  else app.previewSpecial = dir < 0 ? 'cover' : 'end';
  schedulePreview();
};
app.previewJump = (where) => {
  const list = app.sections();
  app.previewSpecial = where === 'cover' || where === 'end' ? where : null;
  if (where === 'toc') {
    const t = list.find((x) => x.type === 'toc') || list.find((x) => SECTION_TYPES[x.type]?.group === 'body');
    if (t) { app.previewId = t.id; pendingGoTo = 'start'; }
  }
  if (where === 'first') { app.previewId = list[0]?.id; pendingGoTo = 'start'; }
  if (list.some((x) => x.id === where)) { app.previewId = where; pendingGoTo = 'start'; }
  schedulePreview();
};
/** The preview's Contents button: every part of the book, front cover to back. */
app.previewContents = (anchor) => {
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book).filter((s) => !s.exclude);
  const groups = { front: 'Front Matter', body: 'Body', back: 'Back Matter' };
  const items = [{ label: 'Front Cover', icon: 'cover', onClick: () => app.previewJump('cover') }];
  let g = null;
  for (const s of numbered) {
    const grp = SECTION_TYPES[s.type]?.group || 'body';
    if (grp !== g) { g = grp; items.push('-', { header: groups[grp] || 'Body' }); }
    const label = s.type === 'chapter' ? (s.displayTitle ? `${s.label ? `${s.label}: ` : ''}${s.displayTitle}` : s.label || s.tocTitle) : (s.tocTitle || s.displayTitle || SECTION_TYPES[s.type]?.label);
    items.push({ label: `${app.previewId === s.id && !app.previewSpecial ? '✓ ' : ''}${label}`, icon: s.type === 'toc' ? 'toc' : 'doc', onClick: () => app.previewJump(s.id) });
  }
  items.push('-', { label: app.book.backCover ? 'Back Cover' : 'End of Book', icon: 'book', onClick: () => app.previewJump('end') });
  popover(anchor, items, { width: 280, maxHeight: 460 });
};

/* ============================================================== preview */

let pendingSerialize = false;
let pendingGoTo = null;
let frame = 0;
let fullPrint = false;
let followCaret = false;

/* ---- Author's Notes: where a note came from, and getting back there */
/** The open text as a note's `where`: a chapter (or other part), a scene, or a research card. */
function noteWhere(id = app.currentId) {
  const r = findResearch(id);
  if (r) return { research: r.id, label: `Research · ${r.title || 'Untitled'}` };
  const found = findScene(id);
  const sec = found?.chapter || app.book.sections.find((x) => x.id === id);
  if (!sec) return null;
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === sec.id);
  const secName = sec.type === 'chapter' ? [n?.label, n?.displayTitle].filter(Boolean).join(': ') || 'Chapter' : n?.displayTitle || sec.title || SECTION_TYPES[sec.type]?.label || 'Section';
  return found ? { section: sec.id, scene: found.scene.id, label: `${secName} · Scene ${found.index + 1}${found.scene.title ? `: ${found.scene.title}` : ''}` } : { section: sec.id, label: secName };
}


/** Chapters, the prologue and the epilogue (the parts with their own Insights in the binder). */
const FOLDER_TYPES = ['chapter', 'prologue', 'epilogue'];

/* ---- Tools: quotes and spaces, in the selection, the open text or the whole book */
/** Every chapter, scene and other written part of the book (not generated parts, not Research). */
function bookTextIds() {
  const ids = [];
  for (const s of app.book.sections) {
    if (SECTION_TYPES[s.type]?.generated) continue;
    if (hasScenes(s)) ids.push(...s.scenes.map((sc) => sc.id)); else ids.push(s.id);
  }
  return ids;
}
/**
 * Tools: two choices for the whole book. Quotes: Smart (curly) or Straight. Spaces after
 * punctuation: One or Two. Choosing one (even the current one) converts the whole book now
 * — with Undo — and from then on typing and the grammar checker follow it.
 */
const bookQuotes = () => (app.book?.quoteStyle === 'straight' ? 'straight' : 'smart');
const bookSpacing = () => (app.book?.sentenceSpacing === 'two' ? 'two' : 'one');
function applyBookTypography() {
  setQuoteMode(bookQuotes());
  setSentenceSpacing(bookSpacing());
  app.editor?.recheckSpelling?.();
}
function toolsMenu(anchor) {
  if (!app.book) return;
  // A plain menu. Each choice fixes the whole book right away (with Undo), even if it's already the one in use.
  const q = bookQuotes(), sp = bookSpacing();
  const pick = (on, label, hint, run) => ({ label, hint, icon: on ? 'check' : null, onClick: run });
  popover(anchor, [
    { header: 'Quotes' },
    pick(q === 'smart', 'Curly Quotes', '“ ”', () => { app.book.quoteStyle = 'smart'; app.markDirty(); applyBookTypography(); runTypography('smart'); }),
    pick(q === 'straight', 'Straight Quotes', '" "', () => { app.book.quoteStyle = 'straight'; app.markDirty(); applyBookTypography(); runTypography('straight'); }),
    '-',
    { header: 'Clean up spaces after punctuation' },
    pick(sp === 'one', 'One Space', '. A', () => { app.book.sentenceSpacing = 'one'; app.markDirty(); applyBookTypography(); runTypography('onespace'); }),
    pick(sp === 'two', 'Two Spaces', '.  A', () => { app.book.sentenceSpacing = 'two'; app.markDirty(); applyBookTypography(); runTypography('twospace'); }),
  ], { width: 250 });
}
function runTypography(kind) {
  flushSerialize();
  // The whole book: every text with something to change; Undo puts them all back.
  const before = {};
  let n = 0;
  // The text open in the editor is changed in the editor itself (else its next save would put the old text back).
  const openNow = () => (!els.editorMount.hidden ? app.currentId : null); // checked each time (Undo may come later)
  const put = (id, md) => {
    app.contents[id] = md; app.dirtyFiles.add(id);
    if (id === openNow()) app.editor.setMarkdown(md); else app.editor.forget(id);
  };
  for (const id of bookTextIds()) {
    const r = typoMarkdown(app.contents[id] || '', kind);
    if (!r.count) continue;
    before[id] = app.contents[id];
    put(id, r.md); n += r.count;
  }
  if (!n) { toast('The book already matches', 'ok', 1800); return; }
  const done = () => {
    flushSerialize();
    for (const s of app.book.sections) if (hasScenes(s)) rejoin(s);
    app.markDirty(); app.htmlCache.clear(); refreshSidebar();
    app.refreshPreview(true);
  };
  done();
  const undo = h('button', { class: 'toast-btn', onclick: () => {
    for (const [id, md] of Object.entries(before)) put(id, md);
    done(); toast('Changes undone', 'info', 1600); undo.disabled = true;
  } }, 'Undo');
  toast(h('span', {}, `${n.toLocaleString()} change${n === 1 ? '' : 's'} in the book `, undo), 'ok', 8000);
}

function flushSerialize() {
  if (!pendingSerialize || !app.currentId) return;
  pendingSerialize = false;
  const md = app.editor.markdown();
  if (md === app.contents[app.currentId]) return;
  app.contents[app.currentId] = md;
  if (currentResearch()) app.dirtyNotes.add(app.currentId);
  else {
    app.dirtyFiles.add(app.currentId);
    trackWords(app.currentId);
    const sc = findScene(app.currentId);
    if (sc) rejoin(sc.chapter);
  }
  app.markDirty();
}
const flushSerializeSoon = debounce(() => { flushSerialize(); }, 400);

const TEMPLATE_EXAMPLE = [
  'Morning came slowly to the valley, spilling over the ridge like honey from a tipped jar. Mara had been awake for an hour already, listening to the house settle and the kettle tick as it cooled.',
  'She packed the lantern anyway. Her grandmother had said it would be needed, and her grandmother had never once been wrong about weather, or roads, or people.',
  '“You’ll want the long coat,” the old woman said from her chair by the stove. “The pass keeps its own seasons.”',
  'Mara took the coat. She did not argue; there was no point arguing with someone who had already decided how a story ended.',
  '* * *',
  'By noon the road had narrowed to a path, and the path to a suggestion. The heather closed in on either side, and the wind came down off the high ground carrying the smell of rain that had not yet decided to fall.',
  'She walked until the light went copper, then gold, then grey, and when at last she stopped to rest she found that the valley had vanished behind her, as if it had never been there at all.',
].join('\n\n');

/** Render section HTML (cached per section + context). */
app.renderSectionHtml = (sec, extra = {}) => {
  const key = JSON.stringify([app.book.notesPlacement, extra.tocPages || null, extra.indexPages || null, sec.label, sec.displayTitle, sec.tocTitle]);
  const src = app.contents[sec.id] ?? '';
  const generated = SECTION_TYPES[sec.type]?.generated || sec.type === 'about-author' || sec.type === 'copyright';
  const c = app.htmlCache.get(sec.id);
  if (!generated && c && c.src === src && c.key === key) return c.html;
  const r = renderSection(sec, {
    book: app.book, contents: app.contents, assetUrl, sections: app.sections(),
    tocPages: extra.tocPages || null, indexPages: extra.indexPages || null,
    allNotes: sec.type === 'endnotes' ? collectNotes() : [],
  });
  if (!generated) app.htmlCache.set(sec.id, { src, key, html: r.html });
  return r.html;
};
function collectNotes() {
  if (app.book.notesPlacement !== 'book') return [];
  return app.sections().filter((s) => !SECTION_TYPES[s.type]?.generated).map((s) => ({ id: s.id, title: s.tocTitle, notes: renderSection(s, { book: app.book, contents: app.contents, assetUrl }).notes }));
}

function schedulePreview(fromEditor = false, jump = false) {
  if (jump) pendingGoTo ||= 'caret';
  if (fromEditor) { followCaret = true; app.previewSpecial = null; }
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; safePreview(); });
  safely(updateStatusSoon, 'word counts');
}
/** Run something that mustn't break typing or the preview; a problem is logged and shown once. */
function safely(fn, what) {
  try { return fn(); } catch (err) {
    console.error(`[lutefisk] ${what}:`, err);
    const key = `${what}|${err?.message}`;
    const shownErrors = (safely.seen ||= new Set());
    if (!shownErrors.has(key)) { shownErrors.add(key); toast(`Something went wrong (${what}): ${err?.message || err}`, 'error', 6000); }
    return undefined;
  }
}
/** The preview, kept alive: if the e-book scroll view fails, it falls back to page turns. */
function safePreview() {
  try { renderPreview(); } catch (err) {
    console.error('[lutefisk] preview:', err);
    if (app.view === 'device' && app.device?.scrolling) {
      app.device.setScrolling(false, { quiet: true });
      try { renderPreview(); toast(`The scroll view hit a problem, so the preview is back to page turns (${err?.message || err})`, 'error', 7000); return; } catch (err2) { err = err2; }
    }
    const key = `preview|${err?.message}`;
    const shownErrors = (safely.seen ||= new Set());
    if (!shownErrors.has(key)) { shownErrors.add(key); toast(`The preview hit a problem: ${err?.message || err}`, 'error', 7000); }
  }
}
app.refreshPreview = (full = false) => { if (full) fullPrint = true; app.htmlCache.clear(); app.editor?.refreshCitations(); if (app.view === 'research') drawResearchView(); schedulePreview(false, true); };
app.refreshPreviewSoon = debounce(() => app.refreshPreview(), 250);
app.refreshAll = () => {
  app.htmlCache.clear(); refreshSidebar(); app.device.build(); fullPrint = true; schedulePreview(false, true);
  for (const el of document.querySelectorAll('.ts-strip')) el.draw?.();
};

function renderPreview() {
  if (!app.book) return;
  flushSerialize();
  if (previewHidden) return;
  const sections = app.sections();
  const tpl = templateById(app.book.template);
  let sec = sections.find((s) => s.id === app.previewId);
  const cur = currentSection();
  let excluded = false;
  if (!sec && app.previewId === app.currentId && cur) {
    // An ignored chapter isn't in the book, so the previews don't show it: they show the part
    // of the book that comes next (or, at the end, the one before).
    excluded = true;
    const all = app.book.sections, at = all.findIndex((x) => x.id === cur.id);
    const inBook = new Set(sections.map((x) => x.id));
    const next = all.slice(at + 1).find((x) => inBook.has(x.id)) || all.slice(0, Math.max(0, at)).reverse().find((x) => inBook.has(x.id));
    sec = next ? sections.find((x) => x.id === next.id) : null;
  }
  if (!sec) { sec = sections[0]; app.previewId = sec?.id; }
  if (!sec) return;
  const scHere = findScene(app.currentId);
  const editingHere = (sec.id === app.currentId || scHere?.chapter.id === sec.id) && !SECTION_TYPES[sec.type]?.generated && !excluded && !currentResearch();
  let caret = editingHere && (followCaret || pendingGoTo === 'caret') ? app.editor.caret() : null;
  if (caret && scHere) {
    // Blocks before this scene: earlier scenes plus one scene break each.
    let offset = 0;
    for (const prev of scHere.chapter.scenes.slice(0, scHere.index)) if ((app.contents[prev.id] || '').trim()) offset += countBlocks(app.contents[prev.id]) + 1;
    caret = { ...caret, index: caret.index + offset };
  }
  const goTo = pendingGoTo;
  pendingGoTo = null;
  followCaret = false;
  els.deviceHost.classList.toggle('excluded', excluded);
  els.printHost.classList.toggle('excluded', excluded);

  if (app.view === 'research') { drawResearchView(); return; }
  // Example text only while a template list or the gallery is really open. If one went away
  // without saying so, never leave the device stuck on the example: show the book again.
  if (app.tplBrowsing && !document.querySelector('.ts-list, .tpl-grid')) { app.tplBrowsing = false; app.tplExample = false; }
  if (app.view === 'device' && app.tplExample) {
    // Browsing templates: the device shows example text in each design (unless Live is on).
    const ex = numberSections([{ id: '__example', type: 'chapter', title: 'The Lantern Road' }], tpl, app.book)[0];
    const html = renderSection(ex, { book: app.book, contents: { __example: TEMPLATE_EXAMPLE }, assetUrl, sections: [ex] }).html;
    app.device.render({ html, sectionTitle: ex.tocTitle, bookTitle: app.book.title || 'The Lantern Road', before: 0, chars: 1, total: 1, special: null, sectionIndex: 0, sectionCount: 1, goTo: 'start' }, null);
    return;
  }
  if (app.view === 'device') {
    let before = 0, total = 0, chars = 0;
    for (const s of sections) {
      const n = (app.contents[s.id] || '').length + 400;
      if (s.id === sec.id) { before = total; chars = n; }
      total += n;
    }
    const idx = sections.findIndex((s) => s.id === sec.id);
    app.device.render({
      html: app.renderSectionHtml(sec), sectionTitle: sec.tocTitle, bookTitle: app.book.title || '', before, chars, total,
      special: app.previewSpecial, sectionIndex: idx, sectionCount: sections.length,
      goTo: goTo === 'end' ? 'end' : goTo === 'start' ? 'start' : null,
    }, caret);
  } else {
    app.print.update(sec.id, caret, { full: fullPrint, jump: !!goTo && goTo !== 'start' && goTo !== 'end' ? true : !!goTo, edge: goTo });
    fullPrint = false;
  }
}

/** Template browsing: example text by default; Live (a saved choice) shows your own book. */
app.templateLive = () => { try { return localStorage.getItem('lutefisk.tplLive') === '1'; } catch { return false; } };
app.setTemplateLive = (on) => {
  try { localStorage.setItem('lutefisk.tplLive', on ? '1' : '0'); } catch { /* ignore */ }
  if (app.tplBrowsing) app.setTemplateBrowsing(true);
};
app.setTemplateBrowsing = (on) => {
  app.tplBrowsing = on;
  const ex = on && !app.templateLive();
  if (ex === !!app.tplExample) return;
  app.tplExample = ex;
  schedulePreview(false, !ex);
};

function setView(v) {
  app.view = v;
  els.viewSeg.setValue(v);
  const row1 = v === 'print' ? app.print?.row1 : v === 'device' ? app.device?.row1 : null;
  els.pvRow1.replaceChildren(...(row1 ? [row1] : []));
  const zoom = v === 'print' ? app.print?.zoom : v === 'device' ? app.device?.zoom : null;
  els.pvZoom.replaceChildren(...(zoom ? [zoom] : []));
  els.deviceHost.hidden = v !== 'device';
  els.printHost.hidden = v !== 'print';
  els.researchHost.hidden = v !== 'research';
  if (v === 'print') fullPrint = true;
  schedulePreview(false, true);
}
app.printPageCount = () => app.print.pageCount;

/* ============================================================ status bar */

function updateStatus() {
  if (!app.book || !els.status) return;
  drawBookBar();
  const r = currentResearch();
  if (r) {
    els.status.textContent = isTextItem(r) ? `${countWords(liveText()).toLocaleString()} words` : RESEARCH_LABEL[r.kind];
    return;
  }
  const sc = findScene(app.currentId);
  if (sc) {
    const here = countWords(liveText());
    els.status.textContent = `${here.toLocaleString()} words`;
    els.status.parentElement.title = `${here.toLocaleString()} words in this scene · ${countWords(app.contents[sc.chapter.id]).toLocaleString()} in the chapter — click for Insights`;
    return;
  }
  const s = currentSection();
  const book = liveBookWords();
  if (!s || SECTION_TYPES[s.type].generated || hasScenes(s)) { els.status.textContent = `${book.toLocaleString()} words`; els.status.parentElement.title = 'Words in the whole book — click for Insights'; return; }
  const here = countWords(liveText());
  els.status.textContent = `${here.toLocaleString()} words`;
  els.status.parentElement.title = `${here.toLocaleString()} words here · ${book.toLocaleString()} in the book — click for Insights`;
}
// While you type, the counts update a few times a second (not only when you pause).
let statusTimer = 0, statusLast = 0;
const updateStatusSoon = () => {
  const wait = Math.max(0, 200 - (performance.now() - statusLast));
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusLast = performance.now(); safely(updateStatus, 'word counts'); }, wait);
};

/* ========================================================== persistence */

const autosave = autosaver(() => save());
function setSaveState(text, cls) { els.save.textContent = text; els.save.className = `doc-sub ${cls}`; }
app.markDirty = () => {
  app.metaDirty = true;
  setSaveState(settings.autosave ? 'Edited' : 'Unsaved changes', 'pending');
  autosave();
};

let saving = null;
async function save() {
  if (!app.book) return;
  flushSerialize();
  if (saving) await saving;
  if (!app.metaDirty && !app.dirtyFiles.size && !app.removed.length && !app.dirtyNotes.size && !app.removedNotes.length) return;
  const files = {};
  for (const id of app.dirtyFiles) files[id] = app.contents[id] ?? '';
  const notes = {};
  for (const id of app.dirtyNotes) notes[id] = app.contents[id] ?? '';
  const removed = [...app.removed];
  const removedNotes = [...app.removedNotes];
  app.dirtyFiles.clear(); app.removed = []; app.metaDirty = false; app.dirtyNotes.clear(); app.removedNotes = [];
  saving = B.saveBook({ book: plainBook(), files, removed, notes, removedNotes })
    .then(() => { setSaveState('Saved', 'ok'); app.goals.measured(); })
    .catch((err) => {
      for (const id of Object.keys(files)) app.dirtyFiles.add(id);
      for (const id of Object.keys(notes)) app.dirtyNotes.add(id);
      app.removed.push(...removed); app.removedNotes.push(...removedNotes); app.metaDirty = true;
      setSaveState('Not saved', 'err');
      toast(`Couldn’t save: ${clean(err)}`, 'error', 6000);
    })
    .finally(() => { saving = null; });
  return saving;
}
const plainBook = () => JSON.parse(JSON.stringify(app.book));

app.importImage = async () => {
  try { return await B.importImage(); } catch (err) { toast(clean(err), 'error'); return null; }
};

function loadBookData(data) {
  if (!data) return;
  // Leaving a book: its stopwatch time for today is saved before the next book opens.
  if (app.book) safely(() => app.goals.stopwatchStop(), 'stopwatch');
  if (data.book?.kind && data.book.kind !== 'book') {
    toast('That project isn’t a book. This version of Lutefisk Book Editor opens books only.', 'error', 6000);
    return;
  }
  mode = 'book';
  const book = data.book;
  // One chapter-heading setting replaces “show titles” and the “no number” style.
  if (book.chapterHeading === undefined) {
    if (book.chapterTitles === false) book.chapterHeading = 'number';
    else if (book.chapterNumbering === 'none') { book.chapterHeading = 'title'; book.chapterNumbering = ''; }
    delete book.chapterTitles;
  }
  // "References" is now "Bibliography".
  for (const s of book.sections || []) if (s.type === 'bibliography' && (!s.title || s.title === 'References')) s.title = 'Bibliography';
  const d = defaultBook();
  for (const k of Object.keys(d)) if (book[k] === undefined) book[k] = d[k];
  book.print = { ...d.print, ...(book.print || {}) };
  book.preview = { ...d.preview, ...(book.preview || {}) };
  // The device text size is in points now, 11 pt by default (= the old 150%). Books still at an old
  // default (100% or 150%) start at 11 pt; one set to another size keeps it, in points.
  if (book.preview.fontPt === undefined || book.preview.fontSize !== undefined) {
    const pct = book.preview.fontSize;
    book.preview.fontPt = !pct || pct === 100 || pct === 150 || book.preview.fontPt ? (book.preview.fontPt || 11) : Math.min(22, Math.max(2, Math.round(pct * 11 / 150 * 2) / 2));
    delete book.preview.fontSize; delete book.preview.scale150;
  }
  book.uuid ||= crypto.randomUUID();
  ensureSections(book);
  // Chapter folders are gone (Research is one folder for the book now).
  delete book.chapterFolders;
  for (const s of book.sections) { delete s.folder; delete s.folderArchive; }
  // “Exclude from Book” is a status: an older excluded chapter or scene gets it (and the earlier
  // name, “Ignore”, becomes it); the status sets the flag.
  for (const x of book.sections.flatMap((s) => [s, ...(s.scenes || [])])) {
    const st = statusesOf(x).map((v) => (v === OLD_IGNORE ? IGNORE : v));
    setStatuses(x, x.exclude && !st.includes(IGNORE) ? [...st, IGNORE] : st);
  }
  if (Array.isArray(book.statuses)) book.statuses = book.statuses.filter((v) => v !== OLD_IGNORE);
  book.research = Array.isArray(book.research) ? book.research : [];
  setCustomTemplates(book.customTemplates);
  syncAuthors(book);
  app.book = book;
  app.bookPath = data.dir || ''; // which book folder this is (to leave it out of “another book” lists)
  // Suggestions you chose to ignore stay ignored with the book.
  setIgnored(book.proofIgnores, (list) => { if (app.book !== book) return; if (list.length) book.proofIgnores = list; else delete book.proofIgnores; app.markDirty(); });
  app.sessionStart = null;
  app.contents = data.contents || {};
  app.fileTimes = data.fileTimes || {};
  {
    // Default goals the first time a book is opened, counted from when it was started.
    const times = Object.values(app.fileTimes).map((t) => Date.parse(t?.created)).filter((t) => t > 0);
    ensureGoalDefaults(book, times.length ? Math.min(...times) : Date.now());
  }
  app.dirtyNotes = new Set();
  app.removedNotes = [];
  app.expanded = new Set();
  app.pinnedId = null;
  for (const s of book.sections) if (hasScenes(s)) for (const sc of s.scenes) app.contents[sc.id] ??= '';
  for (const r of book.research) if (isTextItem(r)) app.contents[r.id] ??= '';
  // Index cards replace research notes, research scenes and snippets: each becomes a card, nothing is lost.
  let migratedCards = 0;
  for (const r of book.research) if (r.kind === 'scene' || r.kind === 'note') { r.kind = 'card'; migratedCards++; }
  if (Array.isArray(book.snippets) && book.snippets.length) {
    const fld = { id: newId('fld'), kind: 'folder', title: 'From Snippets' };
    book.research.push(fld);
    for (const sn of book.snippets) {
      const { item } = newResearchItem('card', { title: sn.title || 'Snippet', folder: fld.id });
      book.research.push(item); app.contents[item.id] = sn.text || ''; app.dirtyNotes.add(item.id); migratedCards++;
    }
  }
  if (Array.isArray(book.snippets)) delete book.snippets;
  for (const s of book.sections) if (!(s.id in app.contents)) app.contents[s.id] = DEFAULT_CONTENT[s.type] || '';
  app.dirtyFiles = new Set(book.sections.filter((s) => !(s.id in (data.contents || {}))).map((s) => s.id));
  for (const s of book.sections) rejoin(s);
  app.removed = [];
  app.htmlCache.clear();
  app.previewSpecial = null;
  app.editor.reset();
  root.replaceChildren(els.shell);
  applyPreviewHidden();
  app.device.build();
  app.print.init();
  if (settings.editorFontSync) syncBookFont({ quiet: true });
  if (!book.sentenceSpacing && settings.sentenceSpacing === 'two') book.sentenceSpacing = 'two';
  applyBookTypography();
  if (migratedCards) { app.markDirty(); setTimeout(() => toast(`Your research notes, scenes and snippets are index cards now (${migratedCards}) — open Research to see them`, 'info', 5000), 800); }
  const first = book.sections.find((s) => s.type === 'chapter') || book.sections[0];
  selectSection(first.id);
  setView('device');
  setSaveState('Saved', 'ok');
  if (app.dirtyFiles.size) app.markDirty();
  requestAnimationFrame(() => app.editor.focus());
  app.goals.load();
  for (const el of document.querySelectorAll('.ts-strip')) el.draw?.();
  resumeTour(app);
}

/* =============================================================== export */

async function doExport(kind) {
  if (!app.book) return;
  await save();
  try {
    let out;
    if (kind === 'pdf') {
      const prev = app.view;
      if (prev !== 'print') setView('print');
      out = await app.print.exportPdf();
      if (prev !== 'print') setView(prev);
    } else {
      toast(`Preparing ${({ epub: 'EPUB', docx: 'Word document', md: 'Markdown', rtf: 'RTF', mobi: 'MOBI', txt: 'plain text' })[kind]}…`);
      out = await ({ epub: B.exportEpub, docx: B.exportDocx, md: B.exportMarkdown, rtf: B.exportRtf, mobi: B.exportMobi, txt: B.exportText })[kind]({ book: plainBook(), contents: { ...app.contents } });
    }
    if (out) toast(`Exported ${out.split(/[\\/]/).pop()}`, 'ok', 4000);
  } catch (err) { toast(`Export failed: ${clean(err)}`, 'error', 7000); }
}

function openBibliography() {
  const s = app.book.sections.find((x) => x.type === 'bibliography');
  if (s) { s.enabled = true; app.markDirty(); selectSection(s.id); }
}

/* ================================================================= menu */

B.onMenu(async (cmd) => {
  // View › Text Size, Appearance, Skin and Contrast.
  if (cmd.startsWith('skin:')) return setSkin(cmd.slice(5));
  if (cmd.startsWith('theme:')) return setTheme(cmd.slice(6));
  if (cmd.startsWith('size:')) return updateSettings({ uiZoom: Number(cmd.slice(5)) });
  if (cmd.startsWith('contrast:')) return updateSettings({ contrast: Number(cmd.slice(9)) });
  if (cmd === 'ui-zoom-changed') return loadSettings();
  switch (cmd) {
    case 'new-book': await showLibrary(); return newBookSheet(await B.library());
    case 'open-book': return openBook();
    case 'library': return showLibrary();
    case 'help': return openHelp(app);
    case 'tour': return startTour(app);
    case 'save': if (app.book) { await save(); toast('Saved', 'ok', 1200); } return undefined;
    case 'new-chapter': return app.book && addSection('chapter');
    case 'new-scene': return app.book && newSceneHere();
    case 'split-scene': return app.book && splitAtCursor();
    case 'export-epub': return doExport('epub');
    case 'export-pdf': return doExport('pdf');
    case 'export-docx': return doExport('docx');
    case 'export-md': return doExport('md');
    case 'export-rtf': return doExport('rtf');
    case 'export-txt': return doExport('txt');
    case 'export-mobi': return doExport('mobi');
    case 'reveal': return app.book && B.revealBook();
    case 'view-device': if (app.book) { togglePreview(true); setView('device'); } return undefined;
    case 'view-print': if (app.book) { togglePreview(true); setView('print'); } return undefined;
    case 'view-stats': return app.book && app.openInsights();
    case 'zoom-in': return zoom(1);
    case 'zoom-out': return zoom(-1);
    case 'zoom-reset': return zoom(0);
    case 'toggle-sidebar': return app.book && toggleSidebar();
    case 'toggle-preview': return app.book && toggleFocus();
    case 'open-characters': return app.book && openCast();
    case 'open-plot': return app.book && openPlotBoard();
    case 'spell-check': checkSpellingNow('both'); return;
    case 'open-plot-board': return app.book && openPlotBoard('board');
    case 'open-timeline': return app.book && openPlotBoard('timeline');
    case 'open-history': return app.book && openGoals(app, app.goals, sheet);
    case 'content-search': return app.book && focusSearch();
    case 'find-replace': if (app.book) { focusSearch(); app.search.replace(); } return undefined;
    case 'toggle-comments': return app.book && setCommentsHidden(!commentsHidden_());
    case 'focus-mode': return app.book && toggleWritingFocus();
    case 'open-settings': return openSettings(sheet);
    case 'backup-book': return app.backupBook();
    case 'flush-and-close': await confirmLeave(); try { if (!discardChanges) await save(); if (app.book) { app.goals.stopwatchStop(); app.goals.measured(true); app.goals.archiveSession(); await app.goals.flush(); } } finally { B.closeReady(); } return undefined;
    default: return undefined;
  }
});

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 's') { e.preventDefault(); save(); }
  if (e.key === 'Escape' && writingFocus && !document.querySelector('.overlay, .popover')) { e.preventDefault(); toggleWritingFocus(false); }
  if (e.key === 'Escape' && previewFocus && !document.querySelector('.overlay, .popover')) { e.preventDefault(); toggleFocus(false); }
  // An item opened from the Research window: Esc goes back to the window.
  if (e.key === 'Escape' && !e.defaultPrevented && app.book && app.returnToResearch && app.returnToResearch === app.currentId && !document.querySelector('.overlay, .popover, dialog[open]')) { e.preventDefault(); returnToResearch(); }
  if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F') && app.book) { e.preventDefault(); toggleWritingFocus(); }
  if (mod && !e.shiftKey && !e.altKey && e.key === 'f' && app.book) { e.preventDefault(); focusSearch(); }
  if (mod && e.shiftKey && (e.key === 'h' || e.key === 'H') && app.book) { e.preventDefault(); focusSearch(); app.search.replace(); }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1); }
  if (mod && e.key === '-') { e.preventDefault(); zoom(-1); }
  if (mod && e.key === '0') { e.preventDefault(); zoom(0); }
  if (mod && e.altKey && (e.key === 'f' || e.key === 'ƒ' || e.code === 'KeyF') && app.book) { e.preventDefault(); toggleFocus(); }
});

// Log progress when the window loses focus, so history survives crashes.
window.addEventListener('blur', () => { if (app.book) { app.goals.measured(); app.goals.flush(); } });

/* ================================================================= boot */

buildShell();
installTooltips();
document.addEventListener('keydown', (e) => { if (e.key === 'F1') { e.preventDefault(); openHelp(app); } });
arrowKeysStepSelects();
loadSettings().finally(() => showLibrary());
