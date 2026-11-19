// Bibliography: metadata extraction from web pages and APA 7 / MLA 9 /
// Chicago 17 (notes-bibliography) reference formatting.
//
// Entry shape:
// { id, kind: 'webpage'|'article'|'journal'|'book'|'social', authors: [{family, given} | {literal}],
//   title, container, publisher, date: 'YYYY[-MM[-DD]]', accessed: 'YYYY-MM-DD',
//   url, doi, volume, issue, pages, edition,
//   social only: handle ('@name'), postType ('Post', 'Tweet', 'Video'…), media ('Image attached'…) }
// For a social post, `title` is the text of the post and `container` the platform.
import { linkInfo } from './linkinfo.js';

export const STYLES = [
  { id: 'apa', label: 'APA (7th ed.)' },
  { id: 'mla', label: 'MLA (9th ed.)' },
  { id: 'chicago', label: 'Chicago (17th ed.)' },
  { id: 'ieee', label: 'IEEE' },
];

/**
 * The order sources are first cited in the book ([@id] in the text, front to back), then
 * any sources never cited, in the bibliography's own order. IEEE numbers them this way.
 */
export function citationOrder(book, contents = {}) {
  const seen = [];
  const add = (md) => { for (const m of String(md || '').matchAll(/\[@([A-Za-z0-9_-]{1,64})/g)) if (!seen.includes(m[1])) seen.push(m[1]); };
  for (const sec of book?.sections || []) {
    if (sec.exclude || sec.enabled === false) continue;
    add(contents[sec.id]);
    for (const sc of sec.scenes || []) if (!sc.exclude) add(contents[sc.id]);
  }
  const ids = new Set((book?.bibliography || []).map((e) => e.id));
  const order = seen.filter((id) => ids.has(id));
  for (const e of book?.bibliography || []) if (!order.includes(e.id)) order.push(e.id);
  return order;
}

/** Today on this computer's calendar (not UTC), as YYYY-MM-DD. */
export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const endPunct = (s) => (/[.?!]$/.test(s) ? s : s + '.');

function parseDate(d) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(String(d || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: m[2] ? Number(m[2]) : null, d: m[3] ? Number(m[3]) : null };
}

/** Split "Jane Q. Doe" → {given:'Jane Q.', family:'Doe'}; keeps organizations literal. */
export function parseName(raw) {
  const s = clean(raw).replace(/^by\s+/i, '');
  if (!s) return null;
  if (/,/.test(s) && s.split(',').length === 2) {
    const [family, given] = s.split(',').map(clean);
    return { family, given };
  }
  const parts = s.split(' ');
  if (parts.length === 1 || /\b(inc|llc|ltd|university|association|institute|agency|department|news|staff|team|editors?)\b/i.test(s)) return { literal: s };
  const particles = new Set(['van', 'von', 'de', 'da', 'del', 'der', 'di', 'la', 'le', 'du', 'st.']);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return { given: parts.slice(0, i).join(' '), family: parts.slice(i).join(' ') };
}

const initials = (given) => clean(given).split(/[\s]+/).filter(Boolean)
  .map((g) => g.split('-').map((p) => (p[0] ? p[0].toUpperCase() + '.' : '')).join('-')).join(' ');

function apaAuthors(list) {
  const names = list.map((a) => (a.literal ? a.literal : `${a.family}, ${initials(a.given || '')}`.replace(/, $/, '')));
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= 20) return names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
  return names.slice(0, 19).join(', ') + ', . . . ' + names[names.length - 1];
}
function mlaAuthors(list) {
  const full = (a, inverted) => (a.literal ? a.literal : inverted ? `${a.family}, ${a.given}` : `${a.given} ${a.family}`);
  if (!list.length) return '';
  if (list.length === 1) return full(list[0], true);
  if (list.length === 2) return `${full(list[0], true)}, and ${full(list[1], false)}`;
  return `${full(list[0], true)}, et al`;
}
function chicagoAuthors(list) {
  const full = (a, inverted) => (a.literal ? a.literal : inverted ? `${a.family}, ${a.given}` : `${a.given} ${a.family}`);
  if (!list.length) return '';
  if (list.length === 1) return full(list[0], true);
  if (list.length === 2) return `${full(list[0], true)}, and ${full(list[1])}`;
  if (list.length <= 10) return [full(list[0], true), ...list.slice(1, -1).map((a) => full(a))].join(', ') + ', and ' + full(list[list.length - 1]);
  return list.slice(0, 7).map((a, i) => full(a, i === 0)).join(', ') + ', et al';
}

const sentenceCase = (s) => s; // titles are kept as written; authors can edit.
const doiUrl = (doi) => (doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : '');
const link = (u) => (u ? `<span class="url">${esc(u)}</span>` : '');

/** First n words of a post, with an ellipsis if it was cut (APA: the first 20 words). */
function firstWords(text, n) {
  const w = clean(text).split(' ').filter(Boolean);
  return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ');
}
/** Up to n characters, cut at a word (Chicago: the first 160 characters). */
function firstChars(text, n) {
  const s = clean(text);
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}
const atHandle = (h) => { const s = clean(h).replace(/^@?/, ''); return s ? `@${s}` : ''; };

/**
 * Social media posts (APA 7 §10.15, MLA 9 §5.21, Chicago 17 §14.209):
 *  APA      Gates, B. [@BillGates]. (2019, September 7). <i>First 20 words…</i> [Image attached] [Tweet]. Twitter. URL
 *  MLA      Gates, Bill [@BillGates]. “Text of the post.” <i>Twitter</i>, 7 Sept. 2019, twitter.com/…
 *  Chicago  Gates, Bill (@BillGates). “Up to the first 160 characters…” Twitter, September 7, 2019. URL.
 * With no real name, the handle stands in the author's place.
 */
function formatSocial(e, style, authors, d, url) {
  const handle = atHandle(e.handle);
  const platform = clean(e.container) || 'Social media';
  const text = clean(e.title);
  const media = clean(e.media);
  const type = clean(e.postType) || 'Post';
  if (style === 'mla') {
    const who = authors.length ? `${mlaAuthors(authors)}${handle ? ` [${handle}]` : ''}` : handle;
    const date = d ? [d.d, d.m ? MLA_MONTHS[d.m - 1] : '', d.y].filter(Boolean).join(' ') : '';
    const body = text.length > 280 ? firstWords(text, 40) : text;
    return `${who ? esc(endPunct(who)) + ' ' : ''}“${esc(endPunct(body || `${type} by ${handle || 'unknown'}`))}” ${[`<i>${esc(platform)}</i>`, esc(date), link(url.replace(/^https?:\/\//, ''))].filter(Boolean).join(', ')}.`;
  }
  if (style === 'chicago') {
    const who = authors.length ? `${chicagoAuthors(authors)}${handle ? ` (${handle})` : ''}` : handle;
    const date = d ? (d.m ? `${MONTHS[d.m - 1]} ${d.d ? d.d + ', ' : ''}${d.y}` : String(d.y)) : '';
    return `${who ? esc(endPunct(who)) + ' ' : ''}“${esc(endPunct(firstChars(text, 160) || type))}” ${[esc(platform), esc(date)].filter(Boolean).join(', ')}.${url ? ' ' + link(url) + '.' : ''}`;
  }
  // APA
  const who = authors.length ? `${apaAuthors(authors)}${handle ? ` [${handle}]` : ''}` : handle;
  const date = d ? (d.m ? `${d.y}, ${MONTHS[d.m - 1]}${d.d ? ' ' + d.d : ''}` : String(d.y)) : 'n.d.';
  const words = firstWords(text, 20);
  const tags = [media && `[${esc(media)}]`, `[${esc(type)}]`].filter(Boolean).join(' ');
  if (!who) return `<i>${esc(words || type)}</i> ${tags}. (${esc(date)}). ${esc(endPunct(platform))}${url ? ' ' + link(url) : ''}`;
  return `${esc(endPunct(who))} (${esc(date)}). ${words ? `<i>${esc(words)}</i> ` : ''}${tags}. ${esc(endPunct(platform))}${url ? ' ' + link(url) : ''}`;
}

const IEEE_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
/** IEEE names: initials first — "B. Gates", "A. Doe and B. Roe", "A, B, and C"; seven or more: "A et al." */
function ieeeAuthors(list) {
  const n = (a) => (a.literal ? a.literal : [initials(a.given || ''), a.family].filter(Boolean).join(' '));
  if (!list.length) return '';
  if (list.length === 1) return n(list[0]);
  if (list.length === 2) return `${n(list[0])} and ${n(list[1])}`;
  if (list.length <= 6) return list.slice(0, -1).map(n).join(', ') + ', and ' + n(list[list.length - 1]);
  return `${n(list[0])} <i>et al.</i>`;
}
const ieeeDate = (d) => (d ? [d.m ? IEEE_MONTHS[d.m - 1] : '', d.d && d.m ? `${d.d},` : '', d.y].filter(Boolean).join(' ') : '');
/**
 * IEEE reference (without its [n], which the list adds):
 *  Book     J. Doe, <i>Title</i>, 2nd ed. Publisher, 2020.
 *  Journal  J. Doe, “Title,” <i>Journal</i>, vol. 4, no. 2, pp. 1–3, 2003, doi: 10.…
 *  Article  J. Doe, “Title,” <i>Magazine</i>, Mar. 3, 2024. [Online]. Available: URL
 *  Web page J. Doe, “Title,” Site. Accessed: Nov. 14, 2026. [Online]. Available: URL
 */
function formatIeee(e, authors, d, acc, url) {
  const who = authors.length ? ieeeAuthors(authors) : '';
  const a = who ? `${who.includes('<i>') ? who : esc(who)}, ` : '';
  const title = clean(e.title) || 'Untitled';
  const cont = clean(e.container), pub = clean(e.publisher);
  const online = url && !e.doi ? ` [Online]. Available: ${link(url)}` : '';
  const accessed = acc && !e.doi && e.kind !== 'book' ? ` Accessed: ${esc(ieeeDate(acc))}.` : '';
  if (e.kind === 'book') {
    return `${a}<i>${esc(title)}</i>${e.edition ? `, ${esc(e.edition)} ed` : ''}. ${[pub, d?.y].filter(Boolean).map(esc).join(', ')}${pub || d ? '.' : ''}${e.doi ? ` doi: ${esc(e.doi)}.` : online}`.trim();
  }
  if (e.kind === 'social') {
    const handle = atHandle(e.handle);
    const by = who ? `${a.slice(0, -2)}${handle ? ` [${esc(handle)}]` : ''}, ` : handle ? `${esc(handle)}, ` : '';
    return `${by}“${esc(firstChars(title, 160))},” ${esc(cont || 'Social media')}${d ? `, ${esc(ieeeDate(d))}` : ''}.${accessed}${online}`;
  }
  const parts = [cont && `<i>${esc(cont)}</i>`, e.volume && `vol. ${esc(e.volume)}`, e.issue && `no. ${esc(e.issue)}`, e.pages && `${/[-–]/.test(e.pages) ? 'pp.' : 'p.'} ${esc(e.pages)}`, d && esc(e.kind === 'journal' ? ieeeDate({ ...d, d: null }) : ieeeDate(d))].filter(Boolean);
  if (e.kind === 'webpage') {
    return `${a}“${esc(title)},” ${esc(cont || pub || 'Online')}${d ? `, ${esc(ieeeDate(d))}` : ''}.${accessed}${online}`;
  }
  return `${a}“${esc(title)},” ${parts.join(', ')}${e.doi ? `, doi: ${esc(e.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''))}.` : '.'}${e.kind === 'article' ? online : ''}`;
}

export function formatEntry(e, style = 'apa') {
  const authors = (e.authors || []).filter((a) => a && (a.literal || a.family));
  const d = parseDate(e.date);
  const acc = parseDate(e.accessed);
  const title = clean(e.title) || 'Untitled';
  const cont = clean(e.container);
  const pub = clean(e.publisher);
  const url = e.doi ? doiUrl(e.doi) : clean(e.url);
  const isPart = e.kind === 'webpage' || e.kind === 'article' || e.kind === 'journal';
  if (style === 'ieee') return formatIeee(e, authors, d, acc, url);
  if (e.kind === 'social') return formatSocial(e, style, authors, d, url);

  if (style === 'mla') {
    const date = d ? [d.d, d.m ? MLA_MONTHS[d.m - 1] : '', d.y].filter(Boolean).join(' ') : '';
    const accessed = acc && e.kind !== 'book' && !e.doi ? ` Accessed ${[acc.d, acc.m ? MLA_MONTHS[acc.m - 1] : '', acc.y].filter(Boolean).join(' ')}.` : '';
    const a = authors.length ? esc(endPunct(mlaAuthors(authors))) + ' ' : '';
    if (!isPart) {
      return `${a}<i>${esc(title)}</i>. ${[pub, d?.y].filter(Boolean).map(esc).join(', ')}${pub || d ? '.' : ''}`.trim();
    }
    const vol = [e.volume ? `vol. ${e.volume}` : '', e.issue ? `no. ${e.issue}` : ''].filter(Boolean).join(', ');
    const parts = [cont ? `<i>${esc(cont)}</i>` : '', vol && esc(vol), pub && pub !== cont ? esc(pub) : '', esc(date), e.pages ? `pp. ${esc(e.pages)}` : '', link(url.replace(/^https?:\/\//, ''))].filter(Boolean);
    return `${a}“${esc(endPunct(title))}” ${parts.join(', ')}.${accessed}`;
  }

  if (style === 'chicago') {
    const a = authors.length ? esc(endPunct(chicagoAuthors(authors))) + ' ' : '';
    const date = d ? (d.m ? `${MONTHS[d.m - 1]} ${d.d ? d.d + ', ' : ''}${d.y}` : String(d.y)) : '';
    if (!isPart) return `${a}<i>${esc(title)}</i>. ${[pub, d?.y].filter(Boolean).map(esc).join(', ')}${pub || d ? '.' : ''}${url ? ' ' + link(url) + '.' : ''}`;
    if (e.kind === 'journal') {
      const vol = [e.volume, e.issue ? `no. ${e.issue}` : ''].filter(Boolean).join(', ');
      return `${a}“${esc(endPunct(title))}” <i>${esc(cont)}</i> ${esc(vol)}${d ? ` (${d.y})` : ''}${e.pages ? `: ${esc(e.pages)}` : ''}.${url ? ' ' + link(url) + '.' : ''}`;
    }
    const accessed = !d && acc ? `Accessed ${MONTHS[acc.m - 1]} ${acc.d}, ${acc.y}. ` : '';
    return `${a}“${esc(endPunct(title))}” ${[cont && `<i>${esc(cont)}</i>`, pub && pub !== cont ? esc(pub) : '', esc(date)].filter(Boolean).join(', ')}${cont || date ? '. ' : ''}${accessed}${link(url)}${url ? '.' : ''}`;
  }

  // APA 7
  let date = 'n.d.';
  if (d) date = e.kind === 'journal' || e.kind === 'book' || !d.m ? String(d.y) : `${d.y}, ${MONTHS[d.m - 1]}${d.d ? ' ' + d.d : ''}`;
  const who = authors.length ? esc(endPunct(apaAuthors(authors))) : '';
  if (e.kind === 'book') {
    return `${who ? who + ' ' : ''}(${esc(date)}). <i>${esc(endPunct(sentenceCase(title)))}</i>${e.edition ? ` (${esc(e.edition)} ed.)` : ''} ${pub ? esc(endPunct(pub)) : ''}${url ? ' ' + link(url) : ''}`.trim();
  }
  if (e.kind === 'journal') {
    const vol = e.volume ? `, <i>${esc(e.volume)}</i>${e.issue ? `(${esc(e.issue)})` : ''}` : '';
    return `${who ? who + ' ' : ''}(${esc(date)}). ${esc(endPunct(title))} <i>${esc(cont)}</i>${vol}${e.pages ? `, ${esc(e.pages)}` : ''}.${url ? ' ' + link(url) : ''}`;
  }
  // webpage / article: if no author, title moves to author position.
  const site = cont && !authors.some((a) => a.literal === cont) ? ` ${esc(endPunct(cont))}` : '';
  const retrieved = !d && acc ? ` Retrieved ${MONTHS[acc.m - 1]} ${acc.d}, ${acc.y}, from` : '';
  if (!who) return `<i>${esc(title)}</i>. (${esc(date)}).${site}${retrieved}${url ? ' ' + link(url) : ''}`;
  return `${who} (${esc(date)}). <i>${esc(title)}</i>.${site}${retrieved}${url ? ' ' + link(url) : ''}`;
}

/** Short author part for in-text citations. */
function citeAuthors(list, style) {
  const n = (a) => a.literal || a.family;
  const and = style === 'apa' ? '&' : 'and';
  if (!list.length) return '';
  if (list.length === 1) return n(list[0]);
  if (list.length === 2) return `${n(list[0])} ${and} ${n(list[1])}`;
  if (style === 'chicago' && list.length === 3) return `${n(list[0])}, ${n(list[1])}, and ${n(list[2])}`;
  return `${n(list[0])} et al.`;
}

/**
 * In-text (parenthetical) citation, e.g. APA "(Doe & Smith, 2024, p. 12)",
 * MLA "(Doe and Smith 12)", Chicago author-date "(Doe and Smith 2024, 12)".
 * Returns plain text (no HTML).
 */
export function formatInText(e, style = 'apa', locator = '', num = 0) {
  if (!e) return style === 'ieee' ? '[?]' : '(missing source)';
  if (style === 'ieee') {
    const bare = clean(locator).replace(/^(pp?\.|pages?|page)\s*/i, '');
    return `[${num || '?'}${bare ? `, ${/[-–,]/.test(bare) ? 'pp.' : 'p.'} ${bare}` : ''}]`;
  }
  const authors = (e.authors || []).filter((a) => a && (a.literal || a.family));
  const d = parseDate(e.date);
  const year = d ? String(d.y) : 'n.d.';
  const shortTitle = (clean(e.title) || 'Untitled').split(/[:.?!]/)[0].split(' ').slice(0, 4).join(' ');
  const quoted = e.kind === 'book' ? shortTitle : `“${shortTitle}”`;
  const who = citeAuthors(authors, style) || (e.kind === 'social' && atHandle(e.handle)) || quoted;
  let loc = clean(locator);
  const bare = loc.replace(/^(pp?\.|pages?|page)\s*/i, '');
  if (style === 'mla') return `(${[who, bare].filter(Boolean).join(' ')})`;
  if (style === 'chicago') return `(${who} ${year}${bare ? `, ${bare}` : ''})`;
  if (loc && /^\d/.test(loc)) loc = `${/[-–,]/.test(loc) ? 'pp.' : 'p.'} ${loc}`;
  return `(${who}, ${year}${loc ? `, ${loc}` : ''})`;
}

export function sortKey(e) {
  const a = (e.authors || [])[0];
  return ((a ? a.family || a.literal : '') || (e.kind === 'social' ? clean(e.handle).replace(/^@/, '') : '') || e.title || '').toLowerCase().replace(/^(the|a|an)\s+/, '');
}

/** The reference list, formatted. IEEE: numbered, in `order` (see citationOrder); the others: alphabetical. */
export function formatBibliography(entries, style = 'apa', order = null) {
  if (style === 'ieee') {
    const pos = new Map((order || (entries || []).map((e) => e.id)).map((id, i) => [id, i]));
    return [...(entries || [])].sort((x, y) => (pos.get(x.id) ?? 1e9) - (pos.get(y.id) ?? 1e9)).map((e, i) => `[${i + 1}] ${formatEntry(e, style)}`);
  }
  return [...(entries || [])].sort((x, y) => sortKey(x).localeCompare(sortKey(y))).map((e) => formatEntry(e, style));
}
/** The heading a style uses for its list. */
export const listHeading = (style) => ({ mla: 'Works Cited', chicago: 'Bibliography' }[style] || 'References');

/* ----------------------------- Metadata extraction ----------------------------- */


/** Map a CSL-JSON record (DOI content negotiation) to an entry. */
export function fromCsl(csl, url, today = localToday()) {
  const parts = csl.issued?.['date-parts']?.[0] || csl.published?.['date-parts']?.[0] || [];
  const type = String(csl.type || '');
  return {
    kind: /journal|article-journal/.test(type) ? 'journal' : /book/.test(type) && !/chapter/.test(type) ? 'book' : 'article',
    authors: (csl.author || []).map((a) => (a.literal ? { literal: a.literal } : { family: a.family || '', given: a.given || '' })),
    title: clean([].concat(csl.title || '')[0]),
    container: clean([].concat(csl['container-title'] || '')[0]),
    publisher: clean(csl.publisher),
    date: parts.map((p, i) => (i ? String(p).padStart(2, '0') : String(p))).join('-'),
    accessed: today,
    url: csl.URL || url,
    doi: csl.DOI || '',
    volume: csl.volume ? String(csl.volume) : '',
    issue: csl.issue ? String(csl.issue) : '',
    pages: csl.page ? String(csl.page).replace('-', '–') : '',
  };
}


/** Detect a DOI in a URL or string. */
export function doiFrom(s) {
  const m = /(10\.\d{4,9}\/[^\s"<>]+)/.exec(decodeURIComponent(String(s || '')));
  return m ? m[1].replace(/[.,;]$/, '') : '';
}

/**
 * A source from a link, made on this computer — nothing is fetched. The title comes
 * from the link itself (or one you give); fill in the authors and the rest yourself.
 */
export function entryFromUrl(raw, { title = '', today = localToday() } = {}) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new Error('That does not look like a web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web (http or https) links can be cited.');
  const doi = doiFrom(u.toString());
  const host = u.hostname.replace(/^www\./, '');
  const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').trim();
  const guess = slug && !/^\d+$/.test(slug) ? slug.charAt(0).toUpperCase() + slug.slice(1) : host;
  // Social posts: platform, handle and — for most platforms — the date, from the address itself.
  const info = linkInfo(u.toString());
  if (!doi && info?.platform && (info.time || info.handle)) {
    return { kind: 'social', authors: [], title, container: info.platform, handle: info.handle.startsWith('@') ? info.handle : '', postType: info.postType, url: u.toString(), ...(info.date ? { date: info.date } : {}), accessed: today };
  }
  return { kind: doi ? 'journal' : 'webpage', authors: [], title: title || guess, container: doi ? '' : host, url: u.toString(), ...(doi ? { doi } : {}), ...(info?.date ? { date: info.date } : {}), accessed: today };
}
