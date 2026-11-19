// Source details with a live citation calculator: the reference and the in-text
// citation in APA, MLA, Chicago and IEEE update as you type. The fields shown are the
// ones that kind of source has, and the ones the book's style needs are marked. Paste a
// link and press Analyze to fill in the blanks: it reads the date and platform out of
// the link itself, then — the one time the app goes online — fetches that page (or the
// DOI's record from doi.org) for its title, authors, date and the rest.
import { h, icon, setHtml } from './ui.js';
import { STYLES, formatEntry, formatInText, parseName, citationOrder, localToday } from '../shared/citations.js';
import { linkInfo, describeWhen, normalizeUrl } from '../shared/linkinfo.js';

const KINDS = [
  ['webpage', 'Web page'], ['social', 'Social media post'], ['article', 'News / magazine article'], ['journal', 'Journal article'], ['book', 'Book'],
];
const MEDIA = [['', 'None'], ['Image attached', 'Image attached'], ['Images attached', 'Images attached'], ['Video attached', 'Video attached'], ['Audio attached', 'Audio attached'], ['Link attached', 'Link attached']];
const POST_TYPES = ['Post', 'Tweet', 'Status update', 'Video', 'Photograph', 'Photographs', 'Online forum post', 'Article', 'Story'];

// What each style needs, by kind of source (marked in the form; Analyze tries to fill them).
const REQUIRED = {
  apa: { webpage: ['authors', 'title', 'date', 'url'], article: ['authors', 'title', 'container', 'date'], journal: ['authors', 'title', 'container', 'volume', 'date'], book: ['authors', 'title', 'publisher', 'date'], social: ['handle', 'body', 'container', 'date', 'url'] },
  mla: { webpage: ['title', 'container', 'url'], article: ['authors', 'title', 'container', 'date'], journal: ['authors', 'title', 'container', 'volume', 'date', 'pages'], book: ['authors', 'title', 'publisher', 'date'], social: ['handle', 'body', 'container', 'date', 'url'] },
  chicago: { webpage: ['title', 'container', 'url'], article: ['authors', 'title', 'container', 'date'], journal: ['authors', 'title', 'container', 'volume', 'date', 'pages'], book: ['authors', 'title', 'publisher', 'date'], social: ['handle', 'body', 'container', 'date', 'url'] },
  ieee: { webpage: ['title', 'container', 'url', 'accessed'], article: ['authors', 'title', 'container', 'date'], journal: ['authors', 'title', 'container', 'volume', 'pages', 'date'], book: ['authors', 'title', 'publisher', 'date'], social: ['body', 'container', 'date', 'url'] },
};
export const requiredFor = (style, kind) => (REQUIRED[style] || REQUIRED.apa)[kind] || REQUIRED.apa.webpage;
const FIELD_NAMES = { authors: 'authors', title: 'title', container: 'site or journal', publisher: 'publisher', date: 'date', url: 'link', volume: 'volume', pages: 'pages', handle: 'handle', body: 'text of the post', accessed: 'accessed date' };

const authorsText = (list) => (list || []).map((a) => (a.literal ? a.literal : `${a.family}, ${a.given}`.replace(/, $/, ''))).join('; ');
export function parseAuthors(text) {
  return String(text || '').split(';').map((s) => s.trim()).filter(Boolean)
    .map((s) => (s.includes(',') ? parseName(s) : s.split(' ').length > 1 && !/\b(inc|university|association|institute)\b/i.test(s) ? parseName(s) : { literal: s }));
}

/**
 * Edit a bibliography entry in place. Resolves true when saved.
 * opts.title: the dialog's heading; opts.ok: the save button's label.
 */
export function editSource(app, e, { title = 'Source details', ok = 'Save' } = {}) {
  const B = window.lutefisk;
  return new Promise((resolve) => {
    const style = app.book?.citationStyle || 'apa';
    const inputs = {};
    const fld = (name, label, el, hint) => { inputs[name] = el; return h('label', { class: `fld src-${name}` }, h('span', {}, label), el, hint ? h('small', { class: 'hint' }, hint) : null); };
    const text = (name, value, placeholder = '') => { const i = h('input', { type: 'text', placeholder }); i.value = value ?? ''; return i; };
    const sel = (opts, value) => h('select', {}, opts.map(([v, l]) => h('option', { value: v, selected: v === (value ?? '') }, l)));

    const kind = sel(KINDS, e.kind || 'webpage');
    const typeList = h('datalist', { id: 'src-post-types' }, POST_TYPES.map((t) => h('option', { value: t })));
    const postType = text('postType', e.postType || 'Post', 'Post');
    postType.setAttribute('list', 'src-post-types');
    const body = h('textarea', { rows: 3, placeholder: 'The words of the post (APA uses the first 20, Chicago the first 160 characters)' });
    body.value = e.kind === 'social' ? e.title || '' : '';
    const titleIn = text('title', e.kind === 'social' ? '' : e.title, 'Title');
    const url = text('url', e.url, 'Paste the link');
    const found = h('div', { class: 'src-found', role: 'status' });
    const findBtn = h('button', { type: 'button', class: 'btn small primary', title: 'Analyze — look up this link online and fill in the blank fields (title, authors, date, site and so on)', onclick: () => analyze() }, icon('search', 13), ' Analyze');

    const urlBlock = h('div', { class: 'fld src-url src-url-top' }, h('span', {}, 'Link or DOI'), h('div', { class: 'src-url-row' }, url, findBtn), found,
      h('small', { class: 'privacy-note src-online' }, icon('eye', 13), ' Analyze goes online: it opens this one link (or asks doi.org about a DOI) to read the source’s details. Nothing from your book is sent. Everything else in Lutefisk Book Editor stays on this computer.'));
    const grid = h('div', { class: 'src-grid' },
      fld('kind', 'Type', kind),
      fld('authors', 'Authors (Last, First; Last, First — or an organization)', text('authors', authorsText(e.authors))),
      fld('handle', 'Handle (username)', text('handle', e.handle, '@username')),
      fld('body', 'Text of the post', body),
      fld('title', 'Title', titleIn),
      fld('container', 'Website / journal / periodical', text('container', e.container)),
      fld('postType', 'Kind of post', postType),
      fld('media', 'Attached media', sel(MEDIA, e.media || '')),
      fld('publisher', 'Publisher', text('publisher', e.publisher)),
      fld('date', 'Published (YYYY-MM-DD, YYYY-MM or YYYY)', text('date', e.date, 'YYYY-MM-DD')),
      fld('volume', 'Volume', text('volume', e.volume)),
      fld('issue', 'Issue', text('issue', e.issue)),
      fld('pages', 'Pages', text('pages', e.pages)),
      fld('edition', 'Edition', text('edition', e.edition)),
      fld('doi', 'DOI', text('doi', e.doi)),
      fld('accessed', 'Accessed (YYYY-MM-DD)', text('accessed', e.accessed, 'YYYY-MM-DD')),
      typeList);
    inputs.kind = kind; inputs.url = url; inputs.body = body; inputs.title = titleIn; inputs.postType = postType;

    const SHOW = {
      social: ['authors', 'handle', 'body', 'container', 'postType', 'media', 'date', 'accessed'],
      webpage: ['authors', 'title', 'container', 'publisher', 'date', 'accessed'],
      article: ['authors', 'title', 'container', 'publisher', 'date', 'pages', 'accessed'],
      journal: ['authors', 'title', 'container', 'volume', 'issue', 'pages', 'date', 'doi'],
      book: ['authors', 'title', 'edition', 'publisher', 'date', 'doi'],
    };
    const LABELS = { container: { social: 'Platform (LinkedIn, X, Bluesky…)', journal: 'Journal', article: 'Newspaper / magazine' } };
    const drawKind = () => {
      const show = new Set(['kind', ...(SHOW[kind.value] || SHOW.webpage)]);
      for (const el of grid.querySelectorAll('.fld')) {
        const name = [...el.classList].find((c) => c.startsWith('src-'))?.slice(4);
        el.hidden = !show.has(name);
      }
      grid.querySelector('.src-container > span').textContent = LABELS.container[kind.value] || 'Website / periodical';
      // The fields the book's style needs for this kind of source.
      const need = new Set(requiredFor(style, kind.value));
      for (const el of grid.querySelectorAll('.fld')) {
        const name = [...el.classList].find((c) => c.startsWith('src-'))?.slice(4);
        el.classList.toggle('req', need.has(name));
      }
      urlBlock.classList.toggle('req', need.has('url'));
    };
    /** Required fields that are still blank, in words. */
    const missing = () => requiredFor(style, kind.value).filter((k) => !(inputs[k]?.value || '').trim()).map((k) => FIELD_NAMES[k] || k);

    /** Analyze: what the link says about itself, then (online) what the page says; fills the blanks only. */
    async function analyze() {
      if (!url.value.trim()) { found.textContent = 'Paste a link or DOI first.'; url.focus(); return; }
      if (/^10\.\d{4,9}\//.test(url.value.trim())) url.value = `https://doi.org/${url.value.trim()}`;
      findDate(false);
      if (!B?.lookupSource) return;
      findBtn.disabled = true;
      found.classList.remove('ok');
      found.replaceChildren(h('span', { class: 'src-spin' }), ' Looking up the link…');
      try {
        const { fields } = await B.lookupSource({ url: normalizeUrl(url.value) });
        const filled = [];
        const fresh = !inputs.title.value.trim() && !inputs.authors.value.trim();
        if (fields.kind && fresh && kind.value !== 'social') kind.value = fields.kind;
        const put = (k, v) => { if (v && inputs[k] && !inputs[k].value.trim()) { inputs[k].value = v; filled.push(FIELD_NAMES[k] || k); } };
        put('title', fields.title);
        if (fields.authors?.length) put('authors', authorsText(fields.authors));
        for (const k of ['container', 'publisher', 'date', 'volume', 'issue', 'pages', 'doi']) put(k, fields[k]);
        if (!inputs.accessed.value.trim()) inputs.accessed.value = localToday();
        drawKind(); drawCalc();
        const still = missing();
        found.classList.toggle('ok', !!filled.length);
        found.replaceChildren(...(filled.length ? [icon('check', 12), ` Filled in the ${filled.join(', ')}.`] : [icon('help', 12), ' The page doesn’t describe itself — fill in the details from it.']),
          still.length ? h('span', { class: 'src-still' }, ` Still needed: ${still.join(', ')}.`) : h('span', {}, ' Check them against the source.'));
      } catch (err) {
        found.replaceChildren(icon('help', 12), ` ${String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`);
      } finally { findBtn.disabled = false; }
    }

    /** The entry as the fields describe it now. */
    const current = () => {
      const v = (k) => inputs[k].value.trim();
      const k = kind.value;
      const out = {
        ...e, kind: k, authors: parseAuthors(v('authors')), container: v('container'), publisher: v('publisher'), date: v('date'),
        volume: v('volume'), issue: v('issue'), pages: v('pages'), edition: v('edition'), url: v('url') ? normalizeUrl(v('url')) : '', doi: v('doi'), accessed: v('accessed'),
        title: k === 'social' ? body.value.replace(/\s+/g, ' ').trim() : v('title'),
      };
      if (k === 'social') Object.assign(out, { handle: v('handle') ? `@${v('handle').replace(/^@/, '')}` : '', postType: v('postType') || 'Post', media: inputs.media.value });
      else { delete out.handle; delete out.postType; delete out.media; }
      for (const key of Object.keys(out)) if (out[key] === '' && key !== 'title') delete out[key];
      return out;
    };

    // IEEE's number for this source: its place in citation order (a new one goes at the end).
    const ieeeNum = (() => { const order = app.book ? citationOrder(app.book, app.contents || {}) : []; const i = order.indexOf(e.id); return i >= 0 ? i + 1 : order.length + 1; })();
    // The calculator: every style, the book's own first.
    const calc = h('div', { class: 'src-calc', 'aria-live': 'polite' });
    const drawCalc = () => {
      const cur = current();
      const order = [STYLES.find((s) => s.id === style), ...STYLES.filter((s) => s.id !== style)].filter(Boolean);
      calc.replaceChildren(h('div', { class: 'src-calc-head' }, icon('cite', 14), h('b', {}, 'Citation'), h('small', {}, 'as it will appear')),
        ...order.map((s) => {
          const ref = h('div', { class: 'src-ref' });
          setHtml(ref, formatEntry(cur, s.id));
          return h('div', { class: `src-style${s.id === style ? ' on' : ''}` },
            h('div', { class: 'src-style-name' }, s.label, s.id === style ? h('span', { class: 'src-yours' }, 'your book') : null),
            ref, h('div', { class: 'src-intext' }, h('span', {}, 'In text: '), formatInText(cur, s.id, '', ieeeNum)));
        }));
    };

    /** Read what the link says about itself. fill: overwrite the date even when one is set. */
    function findDate(fill) {
      const info = linkInfo(url.value);
      if (!info) { found.textContent = url.value.trim() ? 'That doesn’t look like a web address.' : ''; return; }
      if (info.platform && kind.value !== 'social' && (info.time || info.handle)) kind.value = 'social';
      if (info.platform && kind.value === 'social') {
        if (!inputs.container.value.trim() || fill) inputs.container.value = info.platform;
        if (info.postType && (!postType.value.trim() || postType.value === 'Post' || fill)) postType.value = info.postType;
        if (info.handle.startsWith('@') && !inputs.handle.value.trim()) inputs.handle.value = info.handle;
      }
      if (info.date && (fill || !inputs.date.value.trim())) inputs.date.value = info.date;
      if (!fill) { drawKind(); drawCalc(); return; }
      found.replaceChildren(...(info.date
        ? [icon('check', 12), ` ${info.time ? 'Posted' : 'Dated'} ${describeWhen(info)} — from ${info.dateFrom}. Check it against the post.`]
        : [icon('help', 12), info.platform
          ? ` ${info.platform} doesn’t put the date in its links. Copy it from the post.`
          : ' No date in this address. Copy it from the page.']));
      found.classList.toggle('ok', !!info.date);
      drawKind(); drawCalc();
    }

    const done = (val) => { overlay.remove(); resolve(val); };
    const form = h('form', { class: 'dlg-form src-form', onsubmit: (ev) => {
      ev.preventDefault();
      const cur = current();
      for (const k of Object.keys(e)) if (!(k in cur)) delete e[k];
      Object.assign(e, cur);
      done(true);
    } },
    urlBlock,
    h('div', { class: 'src-cols' }, grid, calc),
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => done(false) }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, ok)));
    form.addEventListener('input', drawCalc);
    kind.addEventListener('change', () => {
      // Moving between a post and other kinds carries the words across.
      if (kind.value === 'social' && !body.value.trim() && titleIn.value.trim()) body.value = titleIn.value;
      if (kind.value !== 'social' && !titleIn.value.trim() && body.value.trim()) titleIn.value = body.value;
      drawKind(); drawCalc();
    });
    url.addEventListener('change', () => findDate(false));
    // Return in the link field analyzes it (instead of saving the form).
    url.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); analyze(); } });
    const overlay = h('div', { class: 'overlay', onkeydown: (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done(false); } } },
      h('div', { class: 'dlg wide src-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', {}, title), form));
    overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) done(false); });
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    drawKind();
    if (e.url && !e.date) findDate(false); else drawCalc();
    (!e.url && !e.title ? url : kind.value === 'social' ? (inputs.authors.value ? body : inputs.authors) : inputs.authors.value ? titleIn : inputs.authors).focus();
  });
}
