// Analyze: the one place Lutefisk goes online, and only when the writer presses Analyze on a
// source's link. It fetches that single address — or, for a DOI, asks doi.org for the
// record — and reads the citation details the page publishes about itself. Nothing from the
// book is sent: no cookies, no referrer, no text; just a plain request for the page.
// test/privacy.test.mjs allows network use in this file alone.
import { metaFromHtml } from '../shared/pagemeta.js';
import { fromCsl, doiFrom } from '../shared/citations.js';

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 3 * 1024 * 1024;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Lutefisk Book Editor citation lookup)', 'Accept-Language': 'en' };

/** Only plain web addresses, never anything on this computer's own network names. */
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('That doesn’t look like a web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web (http or https) links can be analyzed.');
  if (u.username || u.password) throw new Error('Links with a user name or password can’t be analyzed.');
  return u;
}

async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    chunks.push(value);
    if (n >= MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

async function get(url, accept) {
  const res = await fetch(url, {
    method: 'GET', redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { ...HEADERS, Accept: accept }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const finalUrl = checkUrl(res.url || url).toString();
  if (!res.ok) throw new Error(res.status === 404 ? 'The page wasn’t found (404).' : res.status === 403 || res.status === 401 ? 'The site didn’t allow the page to be read.' : `The site answered with an error (${res.status}).`);
  return { res, finalUrl };
}

/** The record doi.org has for a DOI (CSL-JSON), as bibliography fields. */
async function fromDoi(doi, url) {
  const { res } = await get(`https://doi.org/${encodeURI(doi)}`, 'application/vnd.citationstyles.csl+json');
  const csl = JSON.parse(await readCapped(res));
  const e = fromCsl(csl, url);
  delete e.accessed;
  return e;
}

/**
 * Look up a link. Returns { fields, from: 'doi' | 'page' }: whatever the source says about
 * itself (title, authors, date, site, journal, volume, issue, pages, DOI…).
 */
export async function lookupSource(raw) {
  const u = checkUrl(raw);
  const url = u.toString();
  try {
    const doi = doiFrom(url);
    if (doi) return { fields: await fromDoi(doi, url), from: 'doi' };
    const { res, finalUrl } = await get(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
    const type = res.headers.get('content-type') || '';
    if (!/html|xml/i.test(type)) {
      await res.body?.cancel().catch(() => {});
      throw new Error(/pdf/i.test(type) ? 'That link is a PDF, which can’t be read for details. Fill them in from the document.' : 'That link isn’t a web page, so there are no details to read.');
    }
    const fields = metaFromHtml(await readCapped(res), finalUrl);
    // A page that names its DOI: the DOI record is the better source for the details.
    if (fields.doi && (!fields.authors?.length || !fields.date)) {
      try { return { fields: { ...fields, ...(await fromDoi(fields.doi, url)) }, from: 'doi' }; } catch { /* keep what the page said */ }
    }
    delete fields.url;
    return { fields, from: 'page' };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error('The site took too long to answer. Try again, or fill in the details yourself.');
    if (err?.cause?.code === 'ENOTFOUND' || err?.cause?.code === 'EAI_AGAIN') throw new Error('Couldn’t reach the site. Check the link and your internet connection.');
    if (/fetch failed/i.test(err?.message || '')) throw new Error('Couldn’t reach the site. Check the link and your internet connection.');
    throw err;
  }
}
