// Citation details from a web page's HTML: the tags publishers put there for exactly this
// (Highwire/Google Scholar citation_*, Dublin Core, Open Graph, schema.org JSON-LD, <title>).
// Pure: it reads a string and touches nothing else. src/main/source-lookup.js gets the page.
import { parseName, doiFrom } from './citations.js';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
export const decode = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ').trim();

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : '';
};

/** Every <meta name|property=… content=…>, by lower-case key, in page order. */
function metaTags(html) {
  const out = new Map();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'name') || attr(m[0], 'property') || attr(m[0], 'itemprop')).toLowerCase();
    const val = attr(m[0], 'content');
    if (!key || !val) continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(val);
  }
  return out;
}

/** The schema.org objects in the page's JSON-LD blocks (flattened through @graph and arrays). */
function jsonLd(html) {
  const found = [];
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x['@graph']) walk(x['@graph']);
    if (x['@type']) found.push(x);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block: skip it */ }
  }
  return found;
}

const types = (o) => [].concat(o['@type'] || []).map(String);
const ARTICLE = /Article|BlogPosting|Report|NewsArticle|ScholarlyArticle|Posting/;
const nameOf = (x) => (typeof x === 'string' ? x : x?.name ? String(x.name) : '');

/** YYYY-MM-DD (or YYYY-MM, YYYY) from the many ways pages write dates. */
export function isoDate(raw) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/.exec(s);
  if (m) return [m[1], m[2].padStart(2, '0'), m[3] && m[3].padStart(2, '0')].filter(Boolean).join('-');
  m = /^(\d{4})$/.exec(s);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

const looksLikeUrl = (s) => /^https?:\/\//i.test(s);
const person = (s) => (s && !looksLikeUrl(s) ? parseName(s) : null);

/**
 * The page's own description of itself, as bibliography fields (blank when the page doesn't say).
 * url: the page's address (for the site name when nothing else gives it).
 */
export function metaFromHtml(html, url = '') {
  const page = String(html || '').slice(0, 3_000_000);
  const meta = metaTags(page);
  const one = (...keys) => { for (const k of keys) { const v = meta.get(k)?.[0]; if (v) return v; } return ''; };
  const all = (...keys) => { for (const k of keys) { const v = meta.get(k); if (v?.length) return v; } return []; };
  const ld = jsonLd(page);
  const art = ld.find((o) => ARTICLE.test(types(o).join(' '))) || ld.find((o) => /Book|WebPage|CreativeWork/.test(types(o).join(' '))) || null;
  const titleTag = decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(page)?.[1] || '');

  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* no address */ }
  const site = one('citation_journal_title', 'og:site_name', 'application-name') || nameOf(art?.isPartOf) || nameOf(art?.publisher) || '';

  // Title: the page's own, without a trailing " | Site name".
  let title = one('citation_title', 'dc.title', 'og:title', 'twitter:title') || (art && (art.headline || art.name)) || titleTag;
  title = decode(title);
  if (site && title.length > site.length + 3) title = title.replace(new RegExp(`\\s*[|·–—-]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');

  // Authors: scholarly tags first, then schema.org, then plain author tags.
  let names = all('citation_author', 'dc.creator', 'dcterms.creator');
  if (!names.length && art?.author) names = [].concat(art.author).map(nameOf).filter(Boolean);
  if (!names.length) names = all('author', 'article:author', 'parsely-author', 'sailthru.author').flatMap((v) => v.split(/\s*(?:,| and |&)\s*(?=[A-Z])/));
  const authors = [...new Set(names.map(decode))].map(person).filter(Boolean);

  const date = isoDate(one('citation_publication_date', 'citation_date', 'citation_online_date', 'article:published_time', 'dc.date', 'dcterms.date', 'date', 'pubdate', 'publish-date') || art?.datePublished || art?.dateCreated || '');
  const first = one('citation_firstpage'), last = one('citation_lastpage');
  const doi = doiFrom(one('citation_doi', 'dc.identifier', 'prism.doi') || '') || '';
  const ogType = one('og:type').toLowerCase();
  const ldType = art ? types(art).join(' ') : '';
  const kind = one('citation_journal_title') || doi ? 'journal'
    : /Book/.test(ldType) || ogType === 'book' ? 'book'
      : /NewsArticle|Article|BlogPosting|Report/.test(ldType) || ogType === 'article' || meta.has('article:published_time') ? 'article'
        : 'webpage';

  const out = {
    kind,
    title,
    authors,
    container: decode(site) || (kind === 'webpage' || kind === 'article' ? host : ''),
    publisher: decode(one('citation_publisher', 'dc.publisher', 'dcterms.publisher') || nameOf(art?.publisher)),
    date,
    volume: one('citation_volume', 'prism.volume'),
    issue: one('citation_issue', 'prism.number'),
    pages: first ? (last && last !== first ? `${first}–${last}` : first) : '',
    doi,
    url: one('citation_public_url', 'og:url') || '',
  };
  for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  if (out.publisher && out.publisher === out.container) delete out.publisher;
  return out;
}
