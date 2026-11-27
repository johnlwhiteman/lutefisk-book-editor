// Side panels and dialogs: book settings, templates gallery, bibliography
// manager, statistics dashboard and generated-section settings.
import { titleCheckButton, recaseAll } from './title-check.js';
import { TITLE_STYLES, bookTitleStyle } from '../shared/titlecase.js';
import { h, icon, dialog, toast, setHtml, assetUrl, confirmDialog, segmented, generatedCover, debounce } from './ui.js';
import { templateById as tplById } from '../shared/templates.js';
import { fontStack } from '../shared/fonts.js';
import { TEMPLATES, templateCss, baseCss, withCasePrefs, sanitizeTemplate, setCustomTemplates } from '../shared/templates.js';
import { openTemplateEditor, myTemplates, bookSample } from './template-editor.js';
import { STYLES, formatEntry, entryFromUrl, sortKey, citationOrder, localToday } from '../shared/citations.js';
import { GUIDES, guideHtml } from './style-guide.js';
import { editSource } from './source-editor.js';
import { bookReport } from '../shared/stats.js';
import { markdownToPlain } from '../shared/markdown.js';
import { SECTION_TYPES, CHAPTER_HEADINGS, HEADING_MODES, chapterHeadingMode, syncAuthors, authorLine } from '../shared/sections.js';
import { TRIMS } from '../shared/print.js';
import { openCoverEditor } from './cover-editor.js';
import { coverOpts, coverAlt, coverImgCss, COVER_EXTENTS, COVER_VALIGNS } from '../shared/cover.js';
import { GENRES, ALL_GENRES, cleanGenre } from '../shared/genres.js';
import { BLOCK_BG, MATH_BORDERS, blockStyles } from '../shared/blockstyle.js';
import { settings, updateSettings } from './settings.js';
import { GUIDES as PROOF_GUIDES, DEFAULT_GUIDE } from '../shared/review.js';

/* ------------------------------------------------------------ helpers */
/**
 * How code blocks and display equations look in this book: background color
 * (none by default), padding, and a border for display equations.
 */
function blockLookFields(b, onChange) {
  const swatches = (obj, key) => {
    const row = h('div', { class: 'bl-swatches', role: 'radiogroup' });
    const custom = h('input', { type: 'color', 'aria-label': 'Custom background color' });
    const draw = () => {
      const cur = obj[key] || '';
      custom.value = cur || '#f6f8fa';
      row.replaceChildren(...BLOCK_BG.map(([v, name]) => h('button', {
        type: 'button', class: `bl-sw${v ? '' : ' none'}${cur === v ? ' on' : ''}`, style: v ? { background: v } : {}, title: name, role: 'radio', 'aria-checked': String(cur === v), 'aria-label': `${name} background`,
        onclick: () => { if (v) obj[key] = v; else delete obj[key]; onChange(); draw(); },
      })), h('label', { class: `bl-sw custom${cur && !BLOCK_BG.some(([v]) => v === cur) ? ' on' : ''}`, title: 'Custom color' }, custom, icon('plus', 11)));
    };
    custom.addEventListener('input', () => { obj[key] = custom.value.toLowerCase(); onChange(); draw(); });
    draw();
    return row;
  };
  const pad = (obj, key) => {
    const r = h('input', { type: 'range', min: 0, max: 2, step: 0.25, class: 'bl-pad', 'aria-label': 'Padding' });
    r.value = String(obj[key] || 0);
    const out = h('span', { class: 'bl-pad-v' });
    const show = () => { out.textContent = Number(r.value) ? `${r.value} em` : 'None'; };
    r.addEventListener('input', () => { const v = Number(r.value); if (v) obj[key] = v; else delete obj[key]; show(); onChange(); });
    show();
    return h('div', { class: 'bl-pad-row' }, r, out);
  };
  b.codeStyle ||= {}; b.mathStyle ||= {};
  const border = h('select', { 'aria-label': 'Equation border' }, MATH_BORDERS.map(([v, l]) => h('option', { value: String(v) }, l)));
  border.value = String(blockStyles(b).math.border);
  border.addEventListener('change', () => { const v = Number(border.value); if (v) b.mathStyle.border = v; else delete b.mathStyle.border; onChange(); });
  return h('div', { class: 'fld bl-look' }, h('span', {}, 'Code and equations'),
    h('div', { class: 'bl-grid' },
      h('b', {}, 'Code blocks'), h('span', {}, 'Background'), swatches(b.codeStyle, 'bg'),
      h('span', {}), h('span', {}, 'Padding'), pad(b.codeStyle, 'pad'),
      h('b', {}, 'Equations on their own line'), h('span', {}, 'Background'), swatches(b.mathStyle, 'bg'),
      h('span', {}), h('span', {}, 'Border'), border,
      h('span', {}), h('span', {}, 'Padding'), pad(b.mathStyle, 'pad')),
    h('small', { class: 'hint' }, 'Transparent with no padding by default. A code block’s own border is set in its bar in the editor. On e-ink screens, colors show as gray.'));
}

function field(label, input, hint) {
  return h('label', { class: 'fld' }, h('span', {}, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
}
function textInput(obj, key, onChange, attrs = {}) {
  const el = h('input', { type: 'text', ...attrs });
  el.value = obj[key] ?? '';
  el.addEventListener('input', () => { obj[key] = attrs.type === 'number' ? Number(el.value) || '' : el.value; onChange(); });
  return el;
}
/** The book's authors: none, one or many. Keeps book.author (the joined line) in step. */
function authorsField(b, onChange) {
  syncAuthors(b);
  const list = h('div', { class: 'authors-list' });
  const draw = (focusLast = false) => {
    list.replaceChildren(...b.authors.map((name, i) => {
      const inp = h('input', { type: 'text', value: name, placeholder: 'Author name', 'aria-label': `Author ${i + 1}` });
      inp.addEventListener('input', () => { b.authors[i] = inp.value; b.author = authorLine(b.authors); onChange(); });
      inp.addEventListener('change', () => { syncAuthors(b); draw(); onChange(); });
      return h('div', { class: 'author-row' }, inp,
        h('button', { type: 'button', class: 'sb-tool', title: 'Remove this author', 'aria-label': `Remove ${name || 'author'}`, onclick: () => { b.authors.splice(i, 1); syncAuthors(b); draw(); onChange(); } }, icon('close', 14)));
    }), h('button', { type: 'button', class: 'btn small plain', onclick: () => { b.authors.push(''); draw(true); } }, icon('plus', 14), b.authors.length ? 'Add Another Author' : 'Add Author'));
    if (focusLast) list.querySelectorAll('input')[b.authors.length - 1]?.focus();
  };
  draw();
  return h('div', { class: 'fld' }, h('span', {}, 'Authors'), list, h('small', { class: 'hint' }, 'None, one or several. They’re shown together on the title page and cover, and as separate creators in the e-book.'));
}

/** A title field; right-click it for Capitalize My Title. */
function titleInput(app, obj, key, onChange) {
  const el = textInput(obj, key, onChange);
  return h('div', { class: 'title-row' }, el, titleCheckButton(el, {
    getStyle: () => bookTitleStyle(app.book),
    setStyle: (id) => { if (app.book.titleStyle !== id) { app.book.titleStyle = id; app.markDirty(); } },
  }));
}
/**
 * A genre picker: the common genres, the writer's own, and "Add Genre…".
 * get/set read and write the chosen genre; returns the <select>.
 */
export function genreSelect(get, set) {
  const sel = h('select', { 'aria-label': 'Genre' });
  const draw = () => {
    const mine = (settings.customGenres || []).filter((g) => !ALL_GENRES.includes(g));
    const cur = get() || '';
    const extra = cur && !ALL_GENRES.includes(cur) && !mine.includes(cur) ? [cur] : [];
    sel.replaceChildren(h('option', { value: '' }, 'Choose a genre…'),
      ...Object.entries(GENRES).map(([grp, list]) => h('optgroup', { label: grp }, list.map((g) => h('option', { value: g }, g)))),
      mine.length || extra.length ? h('optgroup', { label: 'Your genres' }, [...mine, ...extra].map((g) => h('option', { value: g }, g))) : null,
      h('option', { value: '__add' }, 'Add Genre…'));
    sel.value = cur;
  };
  sel.addEventListener('change', async () => {
    if (sel.value !== '__add') { set(sel.value); return; }
    const res = await dialog({ title: 'Add Genre', fields: [{ name: 'g', label: 'Genre', placeholder: 'e.g. Cozy Mystery, Solarpunk, Cli-Fi' }], ok: 'Add' });
    const g = cleanGenre(res?.g);
    if (g) {
      if (!ALL_GENRES.includes(g)) await updateSettings({ customGenres: [...(settings.customGenres || []), g] });
      set(g);
    }
    draw();
  });
  draw();
  return sel;
}
function select(obj, key, options, onChange) {
  const el = h('select', {}, options.map(([v, l]) => h('option', { value: v }, l)));
  el.value = obj[key] ?? options[0][0];
  el.addEventListener('change', () => { obj[key] = el.value; onChange(); });
  return el;
}
/** Every open window (sheet). */
const openSheets = new Set();
export function sheet(title, body, { wide = false, full = false, side = false, actions = null, onClose } = {}) {
  // Esc closes the window wherever the focus is (the top window only, and not
  // while a menu or a dialog on top of it wants the Esc).
  const onEsc = (e) => {
    // A text editor in the window may have used the key (ProseMirror selects the parent node on Esc); the window still closes.
    if (e.key !== 'Escape' || (e.defaultPrevented && !e.target?.closest?.('.ProseMirror')) || !overlay.isConnected) return;
    if ([...document.querySelectorAll('.overlay')].pop() !== overlay) return;
    if (document.querySelector('.popover, dialog[open]')) return;
    e.preventDefault();
    close();
  };
  const close = () => { if (!openSheets.delete(close)) return; document.removeEventListener('keydown', onEsc); overlay.remove(); onClose?.(); };
  openSheets.add(close);
  document.addEventListener('keydown', onEsc);
  // side: docked at the right with the app undimmed beside it (Settings — so a new skin, text size or contrast shows as you choose).
  const overlay = h('div', { class: `overlay${full ? ' full' : ''}${side ? ' side' : ''}` },
    h('div', { class: `sheet${wide ? ' wide' : ''}${full ? ' full' : ''}${side ? ' side' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'sheet-head' }, h('h2', {}, title), h('div', { class: 'sheet-actions' }, actions, h('button', { class: 'btn primary small', onclick: close }, 'Done'))),
      h('div', { class: 'sheet-body' }, body)));
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  overlay.querySelector('.sheet-body input, .sheet-body select, .sheet-body button')?.focus();
  return close;
}

/* ------------------------------------------------------- book settings */
/**
 * "Use this cover?" — the picture shown as the book's cover (or back cover), with its size and
 * a word on print quality. Resolves 'use', 'again' (choose another) or null (keep what you had).
 */
function confirmCover(rel, label, b, key) {
  return new Promise((resolve) => {
    let choice = null;
    const img = h('img', { src: assetUrl(rel), alt: '' });
    const size = h('small', { class: 'cc-size' }, ' ');
    img.addEventListener('load', () => {
      const w = img.naturalWidth, ht = img.naturalHeight;
      const ratio = ht / w;
      const notes = [`${w.toLocaleString()} × ${ht.toLocaleString()} pixels`];
      if (ht < 1600) notes.push('small — it may look soft in print and on large screens (2,560 pixels tall or more is best)');
      else if (ratio < 1.25 || ratio > 1.8) notes.push('an unusual shape for a cover — it may be cropped (most covers are about 1.6 times as tall as they are wide)');
      size.textContent = notes.join(' · ');
      size.classList.toggle('warn', notes.length > 1);
    });
    img.addEventListener('error', () => { size.textContent = 'This picture can’t be shown.'; size.classList.add('warn'); });
    const had = b[key];
    const body = h('div', { class: 'cc' },
      h('div', { class: 'cc-row' },
        h('div', { class: 'cc-book' }, h('div', { class: 'cover-frame cc-frame' }, img, h('div', { class: 'lib-spine' })), h('span', {}, 'New')),
        had ? h('div', { class: 'cc-book cc-old' }, h('div', { class: 'cover-frame cc-frame' }, h('img', { src: assetUrl(had), alt: '' }), h('div', { class: 'lib-spine' })), h('span', {}, 'Current')) : null),
      size,
      h('button', { type: 'button', class: 'btn plain cc-again', onclick: (ev) => { choice = 'again'; ev.currentTarget.closest('form')?.querySelector('.dlg-actions .btn:not(.primary)')?.click(); } }, icon('image', 14), ' Choose Another…'));
    dialog({ title: `Use this ${label.toLowerCase()}?`, body, ok: `Use This ${label}` })
      .then((ok) => resolve(ok ? 'use' : choice));
  });
}

export function openBookSettings(app, initialTab = 'general', { focus } = {}) {
  const b = app.book;
  const ch = () => { app.markDirty(); app.refreshAll(); };
  b.print ||= {};
  b.wordComments ??= true;
  b.codeHighlight ??= true;
  const pane = h('div', { class: 'tab-pane' });

  function coverPicker(key, label, hint) {
    const box = h('div', { class: 'cover-slot', 'data-key': key });
    const opts = () => { b.coverLayout ||= {}; return (b.coverLayout[key] ||= {}); };
    const frame = h('div', { class: 'cover-frame' });
    const drawFrame = () => {
      let inner;
      if (b[key]) {
        const o = coverOpts(b, key);
        const img = h('img', { src: assetUrl(b[key]), alt: coverAlt(b, key) });
        img.style.cssText = coverImgCss(o, { x: 9, top: 8, bottom: 8 });
        frame.classList.toggle('ext-margins', o.extent === 'margins');
        inner = img;
      } else inner = key === 'cover' ? generatedCover(b.title, b.author, fontStack(tplById(b.template).head), b.subtitle, b.coverTone) : h('div', { class: 'cover-empty' }, icon('image', 22), 'None');
      frame.replaceChildren(inner, h('div', { class: 'lib-spine' }));
    };
    const draw = () => {
      drawFrame();
      const o = coverOpts(b, key);
      const alt = h('textarea', { rows: 2, placeholder: coverAlt({ ...b, coverLayout: {} }, key), 'aria-label': `${label} alt text` });
      alt.value = o.alt;
      alt.addEventListener('input', () => { opts().alt = alt.value; app.markDirty(); });
      alt.addEventListener('change', ch);
      const layout = b[key] ? h('div', { class: 'cover-opts' },
        h('label', { class: 'fld' }, h('span', {}, 'Alt text'), alt, h('small', { class: 'hint' }, 'Describes the cover for screen readers and e-reader accessibility. Leave blank to use the title and author.')),
        h('div', { class: 'fld' }, h('span', {}, 'Print extent'),
          segmented(COVER_EXTENTS.map(([value, l]) => ({ value, label: l })), o.extent, (v) => { opts().extent = v; ch(); drawFrame(); }, { label: 'Print extent' }),
          h('small', { class: 'hint' }, 'Full bleed runs the image to the trimmed edge (it may be cropped). Within margins shows the whole image inside the page margins on a white page.')),
        h('div', { class: 'fld' }, h('span', {}, 'Vertical alignment'),
          segmented(COVER_VALIGNS.map(([value, l]) => ({ value, label: l })), o.valign, (v) => { opts().valign = v; ch(); drawFrame(); }, { label: 'Vertical alignment' }),
          h('small', { class: 'hint' }, 'Where the image sits when it doesn’t fill the page, or which part is kept when full bleed crops it.'))) : null;
      box.replaceChildren(frame,
        h('div', { class: 'cover-info' }, h('b', {}, label), h('small', { class: 'hint' }, hint),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn small', onclick: async () => {
              // Pick a picture, look at it as the cover, then use it, choose another, or keep what you had.
              for (;;) {
                const rel = await app.importImage();
                if (!rel) return;
                const answer = await confirmCover(rel, label, b, key);
                if (answer === 'again') continue;
                if (answer !== 'use') return; // an unused picture is tidied away when the book closes
                b[key] = rel;
                if (b.coverLayout?.[key]) { delete b.coverLayout[key].source; delete b.coverLayout[key].crop; }
                ch(); draw();
                toast(`${label} updated`, 'ok', 1600);
                return;
              }
            } }, b[key] ? 'Replace…' : 'Upload Image…'),
            b[key] ? h('button', { class: 'btn small', onclick: () => openCoverEditor(app, key, draw) }, 'Adjust…') : null,
            b[key] ? h('button', { class: 'btn small plain', onclick: () => { b[key] = ''; if (b.coverLayout?.[key]) { delete b.coverLayout[key].source; delete b.coverLayout[key].crop; } ch(); draw(); } }, 'Remove') : null),
          layout));
    };
    draw();
    return box;
  }
  const desc = h('textarea', { rows: 4 });
  desc.value = b.description || '';
  desc.addEventListener('input', () => { b.description = desc.value; app.markDirty(); });
  const kw = h('input', { type: 'text', placeholder: 'fantasy, adventure, coming of age' });
  kw.value = (b.keywords || []).join(', ');
  kw.addEventListener('input', () => { b.keywords = kw.value.split(',').map((x) => x.trim()).filter(Boolean); app.markDirty(); });

  const tabs = {
    general: () => h('div', { class: 'form-grid' },
      field('Title', titleInput(app, b, 'title', ch)),
      field('Subtitle', titleInput(app, b, 'subtitle', ch)),
      authorsField(b, ch),
      field('Genre', genreSelect(() => b.genre, (g) => { if (g) b.genre = g; else delete b.genre; ch(); }), 'Also written into the e-book as its subject, so stores and libraries can shelve it.'),
      field('Publisher', textInput(b, 'publisher', ch, { placeholder: 'Imprint name (optional)' })),
      h('div', { class: 'row2' }, field('Year', textInput(b, 'year', ch, { type: 'number' })),
        field('Language', select(b, 'language', [['en', 'English'], ['en-GB', 'English (UK)'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['sv', 'Swedish'], ['pl', 'Polish']], ch))),
      field('ISBN', textInput(b, 'isbn', ch, { placeholder: '978-…' }), 'Optional. Used as the EPUB identifier and on the copyright page.'),
      field('Description', desc, 'Appears in e-book metadata and on the generated back cover.'),
      field('Keywords', kw),
      toggle(b, 'codeHighlight', 'Syntax highlighting in code blocks', 'Colors plus bold and italic, so code still reads on black-and-white e-ink screens. Long lines wrap to fit small screens.', ch),
      toggle(b, 'wordComments', 'Include comments in Word export', 'Your comments and replies appear as real Word comments. They never appear in the e-book, PDF or print.', ch),
      blockLookFields(b, ch),
      field('Equations in e-books', select(b, 'mathOutput', [['image', 'Images — every reader, including Kindle and Nook'], ['mathml', 'MathML — searchable and scalable (Apple Books, Kobo, Google Play, newer Kindles)']], ch), 'How LaTeX equations are written into the EPUB. The preview, print and PDF always typeset them directly. Word always uses images.')),
    cover: () => h('div', { class: 'covers' },
      h('p', { class: 'hint covers-note' }, 'The cover is the image on the outside of the book. The title page is a separate page inside the book, generated from the title, subtitle, author and publisher on the General tab.'),
      coverPicker('cover', 'Front Cover', 'Recommended 1600 × 2560 px, JPEG or PNG. Shown on e-readers, in your library and as the first preview page.'),
      coverPicker('backCover', 'Back Cover', 'Optional. Shown as the last preview page. Without one, the description is used.')),
    chapters: () => h('div', { class: 'form-grid' },
      h('div', { class: 'row2' },
        field('Chapter word', textInput(b, 'chapterWord', ch)),
        field('Number style', select(b, 'chapterNumbering', [['', 'Template default'], ...CHAPTER_HEADINGS.filter(([k]) => k !== 'none')], ch))),
      field('Chapter heading', select(b, 'chapterHeading', [['', `Template default (${HEADING_MODES.find(([k]) => k === chapterHeadingMode({}, tplById(b.template)))[1].split(' —')[0].toLowerCase()})`], ...HEADING_MODES], ch), 'Applies to every chapter in this book, whichever template you use. New templates set their own default in the template designer.'),
      toggle(b, 'dropCaps', 'Drop caps in e-books', 'Large initial letter at chapter openings in EPUB and the device preview.', ch),
      field('Drop cap size', select(b, 'dropCapLines', [['3', 'Three lines tall'], ['2', 'Two lines tall']], ch), 'How many lines the large first letter spans, in every format.'),
      toggle(b.print, 'dropCaps', 'Drop caps in print', 'Same, for the PDF, Word export and print preview. Individual chapters can be switched off in the editor.', ch),
      field('Opening line of each chapter', select(b, 'firstLine', [['normal', 'Normal — exactly as typed'], ['smallcaps', 'Small capitals'], ['uppercase', 'All capitals'], ['template', 'As the template designs it']], ch)),
      (() => {
        const citeName = { apa: 'APA', mla: 'MLA', chicago: 'Chicago', ieee: 'IEEE' }[b.citationStyle || 'apa'] || 'APA';
        const sel = select(b, 'titleStyle', [['', `Same as citations (${citeName})`], ...TITLE_STYLES.map((t) => [t.id, t.long])], ch);
        const go = h('button', { type: 'button', class: 'btn small', onclick: () => {
          const style = bookTitleStyle(b);
          const items = [];
          for (const sec of b.sections) { if (!SECTION_TYPES[sec.type]?.generated && sec.title) items.push(sec); for (const sc of sec.scenes || []) if (sc.title) items.push(sc); }
          const n = recaseAll(items, style) + recaseAll(b.sections.filter((x) => x.subtitle), style, (x) => x.subtitle, (x, v) => { x.subtitle = v; });
          app.markDirty(); app.refreshAll?.();
          toast(n ? `${n} title${n === 1 ? '' : 's'} recapitalized` : 'Every title already follows that style', 'ok', 2400);
        } }, 'Apply to All Titles');
        return field('Title capitalization', h('div', { class: 'row-inline' }, sel, go), 'Capitalize My Title checks titles against this style. Apply it to every chapter, scene and subtitle at once.');
      })(),
      field('Headings', select(b, 'headingCase', [['template', 'As the template designs them'], ['normal', 'Normal case — no capitals styling']], ch), 'Some templates set chapter numbers and titles in capitals or small capitals.'),
      field('Footnotes', select(b, 'notesPlacement', [['chapter', 'End of each chapter (pop-ups in e-books)'], ['book', 'Collected in an Endnotes section']], () => { if (b.notesPlacement === 'book') app.enableSection('endnotes'); ch(); }))),
    // Style: how citations and the bibliography are written, and the style guide for proofreading.
    style: () => {
      const cite = h('select', { 'aria-label': 'Citation and bibliography style' }, STYLES.map((st) => h('option', { value: st.id }, st.label)));
      cite.value = b.citationStyle || 'apa';
      cite.addEventListener('change', async () => {
        const st = STYLES.find((x) => x.id === cite.value);
        const ok = await dialog({ title: `Change the book to ${st.label}?`,
          message: `Every citation in your text and every entry in your bibliography will change to ${st.label}, in the preview and in every export.${st.id === 'ieee' ? ' In-text citations become numbers like [1], in the order sources are first cited.' : ''}`,
          ok: `Change to ${st.label.replace(/ \(.*\)$/, '')}` });
        if (!ok) { cite.value = b.citationStyle || 'apa'; return; }
        b.citationStyle = st.id;
        app.editor?.redraw?.();
        ch();
        toast(`Every citation and reference is now in ${st.label}`, 'ok', 2400);
      });
      const proof = h('select', { 'aria-label': 'Proofreading style' }, Object.values(PROOF_GUIDES).map((g) => h('option', { value: g.id }, g.name)));
      proof.value = PROOF_GUIDES[b.review?.guide] ? b.review.guide : DEFAULT_GUIDE;
      proof.addEventListener('change', () => { if (app.review) app.review.setGuide(proof.value); else (b.review ||= {}).guide = proof.value; app.markDirty(); });
      const n = () => app.review?.bookCount?.() || 0;
      const count = h('span', { class: 'hint' });
      const clearBtn = h('button', { type: 'button', class: 'btn small', onclick: async () => { await app.review?.clearBook(); draw(); } }, 'Clear All Marks…');
      const draw = () => { const k = n(); count.textContent = k ? `${k} open in the book` : 'None in the book'; clearBtn.disabled = !k; };
      draw();
      return h('div', { class: 'form-grid' },
        field('Citations and bibliography', cite, 'How citations in your text and the entries in your bibliography are written — in the preview and every export.'),
        field('Proofreading style', proof, 'The style guide for proofreader’s marks. Its own rules — serial commas, numbers, dashes, titles, percent — appear in Add Mark.'),
        h('div', { class: 'fld' }, h('span', {}, 'Proofreader’s marks'), h('div', { class: 'row-inline' }, clearBtn, count),
          h('small', { class: 'hint' }, 'Clears every mark in every chapter and scene. The text stays as written.')));
    },
    print: () => h('div', { class: 'form-grid' },
      field('Trim size', select(b.print, 'trim', Object.entries(TRIMS).map(([k, t]) => [k, t.label]), ch)),
      toggle(b.print, 'startRecto', 'Chapters start on right-hand pages', 'Inserts blank pages where needed, like a traditionally printed book.', ch),
      toggle(b.print, 'romanFrontMatter', 'Roman numerals for front matter', 'i, ii, iii… before the first chapter.', ch),
      toggle(b.print, 'runningHeads', 'Running heads', 'Author on left pages, title on right pages.', ch),
      field('Right-hand running head', select(b.print, 'rectoHead', [['title', 'Book title'], ['chapter', 'Chapter title']], ch)),
      toggle(b.print, 'includeCover', 'Include front cover in PDF', 'Leave off for printer-ready interiors.', ch),
      (() => {
        // A watermark across every printed page — DRAFT, Advance Reader Copy, your name…
        const wm = h('input', { type: 'text', maxlength: 60, value: b.print.watermark || '', placeholder: 'e.g. DRAFT or Advance Reader Copy', 'aria-label': 'Watermark text' });
        const soon = debounce(() => { const v = wm.value.trim(); if (v) b.print.watermark = v; else delete b.print.watermark; ch(); }, 350);
        wm.addEventListener('input', soon);
        const strength = select(b.print, 'watermarkStrength', [['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong']], ch);
        if (!b.print.watermarkStrength) strength.value = 'light';
        return field('Watermark', h('div', { class: 'row-inline wm-row' }, wm, strength), 'Printed faintly across every page of the print preview and the PDF. Leave it empty for none.');
      })()),
  };
  const seg = segmented([{ value: 'general', label: 'General' }, { value: 'cover', label: 'Covers' }, { value: 'chapters', label: 'Chapters' }, { value: 'style', label: 'Style' }, { value: 'print', label: 'Print' }], initialTab,
    (v) => pane.replaceChildren(tabs[v]()), { label: 'Settings section' });
  pane.replaceChildren(tabs[initialTab]());
  const backup = h('div', { class: 'bk-backup' },
    h('div', {}, h('b', {}, 'Back up this book'), h('small', { class: 'hint' }, 'A .zip or a folder copy of the whole book, in the same folder or one you choose.')),
    h('button', { type: 'button', class: 'btn small', onclick: () => { close(); app.backupBook(); } }, icon('download', 14), 'Back Up Book…'));
  const del = h('div', { class: 'bk-danger' },
    h('div', {}, h('b', {}, 'Delete this book'), h('small', { class: 'hint' }, 'Moves the whole book folder to the Trash after you confirm. You can restore it from there.')),
    h('button', { type: 'button', class: 'btn small danger', onclick: () => app.deleteOpenBook() }, icon('trash', 14), 'Delete Book…'));
  const close = sheet('Book', h('div', {}, h('div', { class: 'tab-bar' }, seg), pane, backup, del), {});
  // Opened from the binder's Front Cover or Back Cover: bring that cover into view and mark it.
  if (focus) requestAnimationFrame(() => {
    const slot = pane.querySelector(`.cover-slot[data-key="${focus}"]`);
    if (!slot) return;
    slot.scrollIntoView({ block: 'center' });
    slot.classList.add('flash');
    setTimeout(() => slot.classList.remove('flash'), 1600);
  });
  return close;
}

function toggle(obj, key, label, hint, onChange) {
  const el = h('input', { type: 'checkbox', role: 'switch', class: 'switch' });
  el.checked = obj[key] !== false && !!obj[key];
  el.addEventListener('change', () => { obj[key] = el.checked; onChange(); });
  return h('label', { class: 'toggle-row' }, h('span', { class: 'tr-text' }, h('b', {}, label), hint ? h('small', {}, hint) : null), el);
}

/* ---------------------------------------------------------- templates */
/** Every template this book can use: yours (this book's and your library's) and the built-ins, by name. */
export function allTemplates(app) {
  const mine = [...(app.book.customTemplates || []).map((t) => sanitizeTemplate(t)), ...myTemplates()].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return { mine: mine.sort(byName), all: [...mine, ...TEMPLATES].sort(byName) };
}
/** Use a template for this book now (a custom one is copied into the book so it travels with it). */
export async function applyTemplate(app, t, { quiet = false } = {}) {
  if (!t || app.book.template === t.id) return;
  if (t.custom && !(app.book.customTemplates || []).some((x) => x.id === t.id)) {
    const { ornamentData, ...copy } = t;
    if (ornamentData && copy.ornamentImg) {
      try { copy.ornamentImg = await window.lutefisk.writeImage({ name: `ornament-${t.name.toLowerCase()}`, data: Uint8Array.from(atob(ornamentData.split(',')[1]), (c) => c.charCodeAt(0)) }); } catch { copy.ornamentImg = ''; }
    }
    app.book.customTemplates = [...(app.book.customTemplates || []), copy];
    setCustomTemplates(app.book.customTemplates);
  }
  app.book.template = t.id;
  app.markDirty();
  app.refreshAll();
  for (const el of document.querySelectorAll('.ts-strip')) el.draw?.();
  if (!quiet) toast(`Template: ${t.name}`, 'info', 1200);
}

export function openTemplates(app) {
  // My Templates: this book's custom designs plus any saved in the user's library.
  const { mine, all } = allTemplates(app);
  const original = app.book.template; // Esc goes back to this
  const css = all.map((t) => templateCss(withCasePrefs(t, app.book), `.tpl-card .bk.tpl-${t.id}`, { ctx: 'device', dropCaps: true, color: true })).join('\n');
  const style = h('style', {}, `${baseCss('.tpl-card .bk', 'device')}\n${css}`);
  const grid = h('div', { class: 'tpl-grid' });
  let close;
  const reopen = () => { close(); openTemplates(app); };
  const cats = ['All', ...(mine.length ? ['My Templates'] : []), ...new Set(TEMPLATES.map((t) => t.category))];
  let cat = 'All';
  const origins = new Set(); // 'new' (your own designs) and/or 'changed' (built-in designs you customized)
  const originChip = (value, label, title) => {
    const b = h('button', { type: 'button', class: 'chip-toggle tpl-origin', title, 'aria-pressed': 'false', onclick: () => {
      if (origins.has(value)) origins.delete(value); else origins.add(value);
      b.classList.toggle('on', origins.has(value)); b.setAttribute('aria-pressed', String(origins.has(value)));
      applyFilter();
    } }, icon(value === 'new' ? 'palette' : 'pen', 14), h('span', {}, label), h('span', { class: 'tpl-origin-n' }, String(mine.filter((m) => m.origin === value).length)));
    return b;
  };
  const originChips = h('div', { class: 'tpl-origins', role: 'group', 'aria-label': 'Show only' },
    originChip('new', 'Custom', 'Custom — designs you made with New Template'),
    originChip('changed', 'Modified', 'Modified — built-in designs you changed'));
  const search = h('input', { type: 'search', class: 'tpl-search', placeholder: 'Search templates by name', 'aria-label': 'Search templates by name' });
  const empty = h('p', { class: 'tpl-empty', hidden: true }, 'No templates match.');
  const applyFilter = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const card of grid.children) {
      if (card.classList.contains('new')) { card.hidden = !!q || origins.size > 0; continue; }
      card.hidden = (cat !== 'All' && card.dataset.cat !== cat && !(cat === 'My Templates' && card.dataset.mine)) || (q && !card.dataset.name.includes(q))
        || (origins.size > 0 && !origins.has(card.dataset.origin));
      if (!card.hidden) shown++;
    }
    empty.hidden = shown > 0;
  };
  search.addEventListener('input', applyFilter);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = [...grid.children].find((c) => !c.hidden && !c.classList.contains('new')); first?.click(); } });
  const filter = segmented(cats.map((c) => ({ value: c, label: c })), 'All', (c) => { cat = c; applyFilter(); }, { label: 'Template category' });
  // The preview beside this panel shows a design as soon as you point at it (or reach it with
  // the arrow keys). Pointing only shows it; a click or Return chooses it. Esc goes back.
  let chosen = original;
  let hoverTimer = 0;
  const show = (id) => { if (app.book.template !== id) applyTemplate(app, tplById(id), { quiet: true }); };
  const select = (t, card) => {
    for (const c of grid.querySelectorAll('.tpl-card.on')) c.classList.remove('on');
    card?.classList.add('on');
    current.textContent = t.name;
    chosen = t.id;
    clearTimeout(hoverTimer);
    show(t.id);
  };
  const choose = (t, card) => { select(t, card); close(); toast(`Template: ${t.name}`, 'info', 1200); };
  grid.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => show(chosen), 60); });
  grid.append(h('button', { class: 'tpl-card new', 'data-cat': 'My Templates', onclick: () => { close(); openTemplateEditor(app, tplById(app.book.template), { fresh: true, onSaved: () => openTemplates(app) }); } },
    h('div', { class: 'tpl-page tpl-new' }, icon('plus', 28), h('b', {}, 'New Template'), h('small', {}, `Start from ${tplById(app.book.template).name}`)), h('div', { class: 'tpl-name' }, 'Design your own', h('small', {}, 'Custom'))));
  // Each design shows example text; Live view swaps in your own (the open chapter, or the first with text).
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const yours = bookSample(app, { paras: 2, chars: 150 });
  let live = false;
  try { live = localStorage.getItem('lutefisk.tplLive') === '1' && !!yours; } catch { /* ignore */ }
  const EXAMPLE = { title: 'The Lantern Road', paras: ['Morning came slowly to the valley, spilling over the ridge like honey from a tipped jar. By the time it reached the mill, the river had already begun to sing.', 'She packed the lantern anyway.'] };
  const samples = [];
  const sampleHtml = (t) => {
    const src = live && yours ? yours : EXAMPLE;
    return `<section class="bk-sec t-chapter dc-ok dc"><header class="bk-head"><p class="bk-num">${t.numbering === 'none' ? '' : t.numbering.includes('roman') ? 'Chapter III' : t.numbering === 'number-only' ? '3' : 'Chapter Three'}</p><h1 class="bk-title">${esc(src.title)}</h1>${t.ornamentImg ? `<div class="bk-orn bk-orn-pic"><img src="${esc(t.ornamentData || assetUrl(t.ornamentImg))}" alt=""></div>` : '<div class="bk-orn"></div>'}</header><div class="bk-body">${src.paras.map((p) => `<p>${esc(p)}</p>`).join('')}<div class="bk-scene"><span></span></div></div></section>`;
  };
  const liveToggle = (() => {
    const sw = h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: live, disabled: !yours, 'aria-label': 'Live view — preview the designs with your own text' });
    sw.addEventListener('change', () => {
      live = sw.checked;
      app.setTemplateLive?.(live);
      for (const [el, t] of samples) setHtml(el, sampleHtml(t));
    });
    return h('label', { class: 'tpl-live', title: yours ? 'Live — show each design (and the device) with your own chapter instead of the example text' : 'Live needs some text in your book first' }, sw, h('span', {}, 'Live — show my text'));
  })();
  for (const t of all) {
    const sample = h('div', { class: `bk tpl-${t.id} dropcaps` });
    setHtml(sample, sampleHtml(t));
    samples.push([sample, t]);
    const edit = h('span', { class: 'tpl-edit', role: 'button', title: t.custom ? 'Edit this template' : 'Customize — make your own version', onclick: (e) => { e.stopPropagation(); close(); openTemplateEditor(app, t, { onSaved: () => openTemplates(app) }); } }, icon(t.custom ? 'pen' : 'palette', 14), t.custom ? 'Edit' : 'Customize');
    const card = h('button', { 'data-cat': t.category, 'data-name': t.name.toLowerCase(), 'data-mine': mine.some((m) => m.id === t.id) ? '1' : null, 'data-origin': t.custom ? t.origin : null, class: `tpl-card${app.book.template === t.id ? ' on' : ''}`, 'data-id': t.id, onclick: (e) => choose(t, e.currentTarget) },
      h('div', { class: 'tpl-page' }, sample, edit), h('div', { class: 'tpl-name' }, t.name,
        h('small', { title: t.custom && t.origin === 'changed' && t.baseName ? `Modified from ${t.baseName}` : null }, t.custom ? (t.origin === 'changed' ? 'Modified' : 'Custom') : t.category)));
    const hover = () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => show(t.id), 140); };
    // Only when the mouse really moves (not when the gallery opens under a resting pointer).
    card.addEventListener('mousemove', (e) => { if ((e.movementX || e.movementY) && card.dataset.hover !== '1') { card.dataset.hover = '1'; hover(); } });
    card.addEventListener('mouseleave', () => { delete card.dataset.hover; });
    card.addEventListener('mouseenter', (e) => { if (e.isTrusted === false) hover(); });
    grid.append(card);
  }
  const newTpl = h('button', { class: 'btn small primary tpl-new-btn', onclick: () => { close(); openTemplateEditor(app, tplById(app.book.template), { fresh: true, onSaved: () => openTemplates(app) }); } }, icon('plus', 14), 'New Template');
  const current = h('b', {}, tplById(app.book.template).name);
  const head = h('div', { class: 'tpl-current' }, icon('palette', 15), h('span', {}, 'Using '), current,
    h('span', { class: 'hint' }, ' — point at a design (or use the arrow keys) to see it in the preview; click or Return chooses it, Esc goes back.'));
  close = sheet('Templates', h('div', {}, style, h('div', { class: 'tpl-top' }, head, h('div', { class: 'tpl-filter' }, search, originChips, filter, liveToggle, newTpl)), grid, empty), {
    wide: true,
    onClose: () => { clearTimeout(hoverTimer); if (app.book.template !== chosen) show(chosen); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', dock); app.setTemplateBrowsing?.(false); },
  });
  app.setTemplateBrowsing?.(true);
  const overlay = [...document.querySelectorAll('.overlay')].pop();
  // Dock beside the preview so it stays in view.
  const dock = () => {
    const pv = document.querySelector('.preview-pane');
    const r = pv && !pv.classList.contains('collapsed') ? pv.getBoundingClientRect() : null;
    const docked = !!(r && r.width > 300 && window.innerWidth - r.width > 520);
    overlay.classList.toggle('tpl-docked', docked);
    overlay.style.right = docked ? `${window.innerWidth - r.left}px` : '';
    overlay.style.top = docked ? `${r.top}px` : '';
  };
  dock();
  window.addEventListener('resize', dock);
  const visibleCards = () => [...grid.querySelectorAll('.tpl-card:not(.new)')].filter((c) => !c.hidden);
  const cols = () => Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  const move = (d) => {
    const cards = visibleCards();
    if (!cards.length) return;
    let i = cards.findIndex((c) => c.classList.contains('on'));
    i = i < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, i + d));
    cards[i].focus({ preventScroll: true });
    cards[i].scrollIntoView({ block: 'nearest' });
    select(all.find((t) => t.id === cards[i].dataset.id), cards[i]);
  };
  const onKey = (e) => {
    if (!overlay.isConnected) return;
    const inSearch = e.target === search;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (inSearch && search.value) { search.value = ''; applyFilter(); return; }
      chosen = original;
      clearTimeout(hoverTimer);
      if (app.book.template !== original) applyTemplate(app, tplById(original), { quiet: true });
      close();
      return;
    }
    if (e.key === 'Enter' && !inSearch && e.target.closest?.('.tpl-card:not(.new)')) { e.preventDefault(); const t = all.find((x) => x.id === e.target.closest('.tpl-card').dataset.id); if (t) choose(t, e.target.closest('.tpl-card')); return; }
    if (inSearch && e.key !== 'ArrowDown') return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols(), ArrowUp: -cols() }[e.key];
    if (d === undefined || e.target.closest?.('.segmented, .tpl-origins')) return;
    e.preventDefault();
    move(inSearch ? 0 : d);
  };
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => { search.focus(); grid.querySelector('.tpl-card.on')?.scrollIntoView({ block: 'nearest' }); });
  void reopen;
}

/* ------------------------------------------------------- bibliography */
/**
 * The book's sources: Add New Source at the top, then every source you've added, then the
 * citation styles. Choosing a style shows its rules and examples; only "Apply This Style
 * Throughout the Book" (after a warning) changes the book.
 */
export function bibliographyPanel(app, sec) {
  const b = app.book;
  b.bibliography ||= [];
  const list = h('div', { class: 'bib-list' });
  const countEl = h('span', { class: 'bib-count' });
  const ch = () => { app.markDirty(); app.htmlCache?.clear?.(); app.refreshPreview(true); drawList(); };

  const addNew = () => {
    const e = { id: `ref-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: 'webpage', authors: [], title: '', accessed: localToday() };
    editSource(app, e, { title: 'New Source', ok: 'Add to Bibliography' }).then((saved) => {
      if (!saved) return;
      if (!e.title && e.url) Object.assign(e, { title: entryFromUrl(e.url).title });
      b.bibliography.push(e);
      ch();
      toast('Added to the bibliography', 'ok', 1600);
    });
  };

  function drawList() {
    const style = b.citationStyle || 'apa';
    const order = citationOrder(b, app.contents || {});
    const pos = new Map(order.map((id, i) => [id, i]));
    const sorted = [...b.bibliography].sort(style === 'ieee' ? (x, y) => pos.get(x.id) - pos.get(y.id) : (x, y) => sortKey(x).localeCompare(sortKey(y)));
    countEl.textContent = sorted.length ? String(sorted.length) : '';
    list.replaceChildren(...(sorted.length ? sorted.map((e, i) => {
      const item = h('div', { class: 'bib-item', title: 'Click to edit this source', onclick: (ev) => { if (!ev.target.closest('.bib-actions')) editEntry(app, e, ch); } });
      setHtml(item, `<div class="bib-text">${style === 'ieee' ? `[${i + 1}] ` : ''}${formatEntry(e, style)}</div>`);
      item.append(h('div', { class: 'bib-actions' },
        h('button', { class: 'tb-btn', title: 'Edit this source', onclick: () => editEntry(app, e, ch) }, icon('pen', 15)),
        h('button', { class: 'tb-btn', title: 'Delete this source', onclick: async () => { if (await confirmDialog('Delete source?', `${e.title || 'Untitled'}\n\nCitations of it in your text will show as missing.`)) { b.bibliography = b.bibliography.filter((x) => x !== e); ch(); } } }, icon('trash', 15))));
      return item;
    }) : [h('div', { class: 'bib-empty' }, h('b', {}, 'No sources yet.'), h('span', {}, ' Add the books, articles, web pages and posts you’ll cite. A citation in your text points to one of these, so add a source before you cite it.'))]));
  }
  drawList();

  // Citation styles: looking at one doesn't change anything; applying it does (after a warning).
  let viewing = b.citationStyle || 'apa';
  const guide = h('div', { class: 'sg' });
  const head = h('div', { class: 'sg-head' });
  const drawGuide = () => {
    const current = b.citationStyle || 'apa';
    const st = STYLES.find((x) => x.id === viewing);
    head.replaceChildren(h('div', { class: 'sg-title' }, h('b', {}, GUIDES[viewing]?.name || st?.label)),
      viewing === current
        ? h('span', { class: 'sg-current' }, icon('check', 13), ' Your book uses this style')
        : h('button', { class: 'btn primary small', onclick: applyStyle }, `Apply ${st?.label.replace(/ \(.*\)$/, '')} Throughout the Book`));
    setHtml(guide, guideHtml(viewing));
  };
  async function applyStyle() {
    const st = STYLES.find((x) => x.id === viewing);
    const name = st?.label || viewing;
    const ok = await dialog({ title: `Change the book to ${name}?`,
      message: `Every citation in your text and every entry in your bibliography will change to ${name}, in the preview and in every export.${viewing === 'ieee' ? ' In-text citations become numbers like [1], in the order sources are first cited.' : (b.citationStyle === 'ieee' ? ' Numbered citations like [1] become author–date citations.' : '')}\n\nYou can switch back at any time.`,
      ok: `Change to ${name.replace(/ \(.*\)$/, '')}` });
    if (!ok) return;
    b.citationStyle = viewing;
    app.editor?.redraw?.();
    ch(); drawGuide();
    toast(`Every citation and reference is now in ${name}`, 'ok', 2400);
  }
  const styleSeg = segmented(STYLES.map((s) => ({ value: s.id, label: s.label.replace(/ \(.*\)$/, '') })), viewing, (v) => { viewing = v; drawGuide(); }, { label: 'Citation style to read about' });
  drawGuide();

  return h('div', { class: 'gen-panel bib-panel' },
    h('div', { class: 'bib-top' },
      h('button', { class: 'btn primary', onclick: addNew }, icon('plus', 14), ' Add New Source'),
      h('p', { class: 'hint' }, 'Citations in your text point to these sources, so add a source first, then cite it: right-click in your text › Insert › Citation…')),
    h('div', { class: 'bib-sec-head' }, h('h3', {}, 'Your Sources'), countEl),
    list,
    h('div', { class: 'bib-sec-head' }, h('h3', {}, 'Citation Styles'), h('small', { class: 'hint' }, 'Pick one to read its rules. Nothing changes until you apply it.')),
    styleSeg,
    h('div', { class: 'sg-box' }, head, guide));
}

function cleanErr(err) {
  return String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/** Source details, with the citation calculator (source-editor.js). */
async function editEntry(app, e, done) {
  if (await editSource(app, e)) done();
}

/* ------------------------------------------------- generated sections */
export function generatedPanel(app, sec) {
  const b = app.book;
  const ch = () => { app.markDirty(); app.refreshPreview(); app.refreshSidebar(); };
  switch (sec.type) {
    case 'title-page':
      return h('div', { class: 'gen-panel' },
        h('p', { class: 'hint' }, 'The title page is generated from your book details.'),
        field('Title', titleInput(app, b, 'title', ch)), field('Subtitle', titleInput(app, b, 'subtitle', ch)),
        authorsField(b, ch), field('Publisher / imprint', textInput(b, 'publisher', ch)));
    case 'toc': {
      // The contents as they are now — made from your sections, so a new chapter shows up here (and in
      // the book) as soon as you add it. Click one to go to it.
      const list = (app.sections() || []).filter((s) => !['title-page', 'copyright', 'toc', 'dedication', 'epigraph'].includes(s.type));
      return h('div', { class: 'gen-panel' }, field('Heading', textInput(sec, 'title', ch, { placeholder: 'Contents' })),
        h('ol', { class: 'toc-live' }, list.length ? list.map((s) => h('li', { class: `g-${SECTION_TYPES[s.type]?.group || 'body'}` },
          h('button', { type: 'button', title: 'Go to it', onclick: () => app.selectSection(s.id) }, s.tocTitle || s.title || SECTION_TYPES[s.type]?.label || 'Untitled'))) : h('li', { class: 'hint' }, 'Nothing yet.')),
        h('p', { class: 'hint' }, 'Made automatically from your chapters and other sections — add, move or rename one and the contents follow. Print and PDF show page numbers; e-books get tappable links.'));
    }
    case 'endnotes':
      return h('div', { class: 'gen-panel' }, field('Heading', textInput(sec, 'title', ch, { placeholder: 'Notes' })),
        field('Where footnotes appear', select(b, 'notesPlacement', [['chapter', 'End of each chapter'], ['book', 'Collected here']], ch)),
        h('p', { class: 'hint' }, 'Add notes in the editor with the footnote button (⌘/Ctrl+Alt+F).'));
    case 'index': {
      b.index ||= { terms: [] };
      const ta = h('textarea', { rows: 14, placeholder: 'One term per line' });
      ta.value = (b.index.terms || []).join('\n');
      ta.addEventListener('input', () => { b.index.terms = ta.value.split('\n').map((s) => s.trim()).filter(Boolean); app.markDirty(); app.refreshPreviewSoon(); });
      return h('div', { class: 'gen-panel' }, field('Heading', textInput(sec, 'title', ch, { placeholder: 'Index' })),
        field('Index terms', ta, 'Every occurrence is located automatically. PDF lists page numbers; EPUB and Word list chapters. Tip: select a word in the editor and use the index button.'));
    }
    case 'bibliography': return bibliographyPanel(app, sec);
    default: return h('div');
  }
}

/* --------------------------------------------------------- statistics */
/** A small (?) with an explanation shown on hover or focus. */
export function helpTip(text) {
  // Positioned by the app's hover tips, so it always stays inside the window.
  return h('span', { class: 'help-tip', tabindex: 0, role: 'note', 'aria-label': text, title: text }, '?');
}

const HELP = {
  Words: 'Every word in the text, counted the way word processors do.',
  Characters: 'Letters, digits, punctuation and spaces. Publishers sometimes quote lengths in characters.',
  Sentences: 'Text ending in . ! or ? — the average shows how long a typical sentence runs.',
  Paragraphs: 'Blocks of text separated by a blank line.',
  'Reading time': 'At about 250 words a minute for silent reading, and 150 read aloud (audiobook pace).',
  'Print pages': 'From the print layout when it has been measured; otherwise about 275 words a page.',
  'Flesch Reading Ease': 'From 0 to 100 — higher is easier. Most popular fiction scores 70–90; academic writing 30–50. Based on sentence length and syllables per word.',
  'Flesch–Kincaid grade': 'The US school grade a reader needs to follow the text. Fiction usually sits between 4 and 8.',
  'Gunning fog': 'Years of education needed on a first reading, weighted by long sentences and words of three or more syllables. Under 12 suits a wide audience.',
  SMOG: 'Grade level estimated from words of three or more syllables. Often used for health and public information.',
  'Coleman–Liau': 'Grade level from letters per word and sentences per 100 words, rather than syllables.',
  'Automated Readability': 'Grade level from characters per word and words per sentence.',
  'Lexical diversity': 'Distinct words as a share of all words. Higher means a more varied vocabulary; it falls naturally as a text gets longer.',
  Dialogue: 'The share of words inside quotation marks.',
  'Adverbs (‑ly)': 'Words ending in -ly, a quick proxy for adverbs. Many writers trim them in favor of stronger verbs.',
  'Possible passive voice': 'Phrases like “was taken” or “were seen”. Not always wrong — a prompt to check who is doing the action.',
  'Complex words (3+ syllables)': 'The share of words with three or more syllables. More makes text feel denser.',
  'Sentences over 30 words': 'Long sentences can be fine, but a lot of them in a row can tire readers.',
  'Avg. word length': 'Average letters per word.',
  'Avg. syllables per word': 'Used by most readability formulas; around 1.4 is typical for fiction.',
  'Sentence length (words)': 'How many sentences fall in each length band. Varied lengths give prose rhythm.',
  'Most used words': 'Your most frequent words, ignoring common ones like “the” and “and”.',
  'Most used adverbs': 'The -ly words you lean on most.',
  'Repeated phrases': 'Three-word phrases used more than twice — echoes a reader may notice.',
  'Longest sentences': 'Your longest sentences, worth a second look.',
};
const withHelp = (label) => (HELP[label] ? [label, helpTip(HELP[label])] : [label]);

/** The text-analysis half of Insights. units: [{id, title, type, text}] */
export function textInsights(units, { pages = 0, trimLabel = '', unitLabel = 'Section', note = '' } = {}) {
  const rep = bookReport(units, { pages });
  const t = rep.totals;
  const n = (v) => Number(v).toLocaleString();
  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, value), h('div', { class: 'tile-l' }, ...withHelp(label)), sub ? h('div', { class: 'tile-s' }, sub) : null);
  const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const h3 = (label) => h('h3', {}, ...withHelp(label));

  const maxW = Math.max(1, ...rep.sections.map((s) => s.words));
  const chapterRows = rep.sections.map((s) => h('tr', {},
    h('td', { class: 'name' }, s.title),
    h('td', { class: 'num' }, n(s.words)),
    h('td', { class: 'barcell' }, h('div', { class: 'bar', style: { width: `${(s.words / maxW) * 100}%` }, title: `${s.title}: ${n(s.words)} words` })),
    h('td', { class: 'num' }, n(s.sentences)), h('td', { class: 'num' }, s.avgSentence), h('td', { class: 'num' }, s.ease), h('td', { class: 'num' }, `${s.dialoguePercent}%`)));

  const maxB = Math.max(1, ...rep.sentenceBuckets.map((b) => b.count));
  const hist = h('div', { class: 'hist', role: 'img', 'aria-label': 'Sentence length distribution' },
    rep.sentenceBuckets.map((b) => h('div', { class: 'hcol', title: `${b.label} words: ${n(b.count)} sentences` },
      h('div', { class: 'hval' }, n(b.count)), h('div', { class: 'hbar', style: { height: `${(b.count / maxB) * 100}%` } }), h('div', { class: 'hlbl' }, b.label))));
  const r = rep.readability;
  const list = (rows, fmt) => h('ol', { class: 'wordlist' }, rows.map(([w, c]) => h('li', {}, h('span', {}, w), h('b', {}, fmt ? fmt(c) : n(c)))));
  const kv = (rows) => h('table', { class: 'kv' }, rows.map(([k, v]) => h('tr', {}, h('td', {}, ...withHelp(k)), h('td', { class: 'num' }, String(v)))));
  if (!t.words) return h('div', { class: 'stats' }, h('p', { class: 'hint ins-empty' }, 'There’s no text to analyze yet.'));

  return h('div', { class: 'stats' },
    h('div', { class: 'tiles' },
      tile('Words', n(t.words), `${n(t.uniqueWords)} unique`),
      tile('Characters', n(t.characters), `${n(t.charactersNoSpaces)} without spaces`),
      tile('Sentences', n(t.sentences), `${t.avgWordsPerSentence} words avg`),
      tile('Paragraphs', n(t.paragraphs), `${t.avgSentencesPerParagraph} sentences avg`),
      tile('Reading time', mins(t.readingMinutes), `${mins(t.speakingMinutes)} read aloud`),
      tile('Print pages', n(t.estimatedPages), pages ? `at ${trimLabel}` : 'estimated')),
    h('div', { class: 'stat-cols' },
      h('section', {}, h3('Readability'),
        h('div', { class: 'ease' }, h('div', { class: 'ease-v' }, String(r.fleschReadingEase)), h('div', {}, h('b', {}, ...withHelp('Flesch Reading Ease')), h('div', { class: 'hint' }, rep.easeLabel))),
        kv([['Flesch–Kincaid grade', r.fleschKincaidGrade], ['Gunning fog', r.gunningFog], ['SMOG', r.smog], ['Coleman–Liau', r.colemanLiau], ['Automated Readability', r.automatedReadability]])),
      h('section', {}, h3('Style'),
        kv([['Lexical diversity', `${t.lexicalDiversity}%`], ['Dialogue', `${t.dialoguePercent}% of words`], ['Adverbs (‑ly)', `${n(t.adverbCount)} (${t.adverbPerThousand} per 1,000)`], ...(() => { const pp = t.sentences ? Math.min(100, Math.round((t.passiveCount / t.sentences) * 100)) : 0; return [['Active voice', `about ${100 - pp}% of sentences`], ['Possible passive voice', `${n(t.passiveCount)} (${pp}%)`]]; })(), ['Complex words (3+ syllables)', `${t.complexWordPercent}%`], ['Sentences over 30 words', n(t.longSentences)], ['Avg. word length', `${t.avgWordLength} letters`], ['Avg. syllables per word', t.avgSyllablesPerWord]])),
      h('section', {}, h3('Sentence length (words)'), hist)),
    h('section', {}, h('h3', {}, `By ${unitLabel.toLowerCase()}`),
      h('table', { class: 'chapters' }, h('thead', {}, h('tr', {}, h('th', {}, unitLabel), h('th', { class: 'num' }, 'Words'), h('th', {}, ''), h('th', { class: 'num' }, 'Sentences'), h('th', { class: 'num' }, 'Avg. sentence'), h('th', { class: 'num' }, 'Reading ease'), h('th', { class: 'num' }, 'Dialogue'))), h('tbody', {}, chapterRows))),
    h('div', { class: 'stat-cols' },
      h('section', {}, h3('Most used words'), list(rep.topWords.slice(0, 20))),
      h('section', {}, h3('Most used adverbs'), rep.topAdverbs.length ? list(rep.topAdverbs) : h('p', { class: 'hint' }, 'None found.')),
      h('section', {}, h3('Repeated phrases'), rep.repeatedPhrases.length ? list(rep.repeatedPhrases, (c) => `×${c}`) : h('p', { class: 'hint' }, 'No three-word phrase appears more than twice.'))),
    h('section', {}, h3('Longest sentences'), h('ol', { class: 'longest' }, rep.longestSentences.map((x) => h('li', {}, h('b', {}, `${x.n} words: `), x.s)))),
    note ? h('p', { class: 'hint' }, note) : null);
}

/** Units for this book's text analysis. */
export function bookTextUnits(app) {
  const secs = app.sections().filter((s) => !SECTION_TYPES[s.type]?.generated && !['copyright', 'title-page'].includes(s.type));
  return secs.map((s) => ({ id: s.id, title: s.tocTitle, type: s.type, text: markdownToPlain(app.contents[s.id] || '') }));
}

