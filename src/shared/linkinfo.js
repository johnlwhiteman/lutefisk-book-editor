// What a link says about itself, worked out on this computer — nothing is fetched.
//
// Many social posts carry their creation time inside their ID:
//   LinkedIn  activity / share / ugcPost IDs   first 41 of 64 bits = ms since 1970
//   X/Twitter status IDs (Snowflake)           id >> 22 = ms since 2010-11-04 01:42:54.657 UTC
//   Mastodon  status IDs                       id >> 16 = ms since 1970
//   Bluesky   record keys (TIDs)               base32-sortable; top 53 bits = µs since 1970
//   TikTok    video IDs                        id >> 32 = seconds since 1970
// Other links: a date in the address itself (/2024/05/12/, 2024-05-12).
// Each result says where its date came from, so the writer can check it.

const TWITTER_EPOCH = 1288834974657n;
const TID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
/** The day X replaced the Twitter name (posts from then on are cited as X). */
const X_RENAMED = Date.UTC(2023, 6, 24);
const MIN_MS = Date.UTC(2004, 0, 1);

const PLATFORMS = [
  { re: /(^|\.)linkedin\.com$/, name: 'LinkedIn', type: 'Post' },
  { re: /(^|\.)(twitter|x)\.com$/, name: 'X', type: 'Post' },
  { re: /(^|\.)bsky\.app$/, name: 'Bluesky', type: 'Post' },
  { re: /(^|\.)tiktok\.com$/, name: 'TikTok', type: 'Video' },
  { re: /(^|\.)facebook\.com$|(^|\.)fb\.com$/, name: 'Facebook', type: 'Status update' },
  { re: /(^|\.)instagram\.com$/, name: 'Instagram', type: 'Photograph' },
  { re: /(^|\.)threads\.(net|com)$/, name: 'Threads', type: 'Post' },
  { re: /(^|\.)youtube\.com$|^youtu\.be$/, name: 'YouTube', type: 'Video' },
  { re: /(^|\.)reddit\.com$/, name: 'Reddit', type: 'Online forum post' },
];

/** A Date for a ms count, or null if it isn't a believable posting time. */
function plausible(ms, now) {
  const n = Number(ms);
  return Number.isFinite(n) && n >= MIN_MS && n <= now + 2 * 86400000 ? new Date(n) : null;
}
const big = (s) => { try { return BigInt(s); } catch { return null; } };

export function linkedinTime(id, now = Date.now()) { const b = big(id); return b == null ? null : plausible(b >> 22n, now); }
export function twitterTime(id, now = Date.now()) { const b = big(id); return b == null ? null : plausible((b >> 22n) + TWITTER_EPOCH, now); }
export function mastodonTime(id, now = Date.now()) { const b = big(id); return b == null ? null : plausible(b >> 16n, now); }
export function tiktokTime(id, now = Date.now()) { const b = big(id); return b == null ? null : plausible((b >> 32n) * 1000n, now); }
export function blueskyTime(rkey, now = Date.now()) {
  if (!/^[2-7a-z]{13}$/.test(rkey)) return null;
  let v = 0n;
  for (const c of rkey) v = v * 32n + BigInt(TID_ALPHABET.indexOf(c));
  return plausible((v >> 10n) / 1000n, now);
}

const ymd = (d) => d.toISOString().slice(0, 10);

/** Normalize what someone typed or pasted into a web address: adds https:// when it's missing. */
export function normalizeUrl(raw) {
  let s = String(raw ?? '').trim().replace(/^<|>$/g, '');
  if (!s) return '';
  if (/^mailto:/i.test(s)) return s;
  if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(s)) return `mailto:${s}`;
  if (/^\/\//.test(s)) return `https:${s}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return `https://${s}`;
  return s;
}
/** The address as shown in the link dialog: https:// left off. */
export function displayUrl(href) {
  return String(href ?? '').replace(/^https:\/\//i, '');
}
/** Does this text look like a web address (for a new link from selected text)? */
export function looksLikeUrl(text) {
  const s = String(text ?? '').trim();
  if (!s || /\s/.test(s)) return false;
  if (/^(https?:\/\/|www\.|mailto:)/i.test(s)) return true;
  if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(s)) return true; // an email address
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s) && !/^\d+(\.\d+)+$/.test(s);
}

/**
 * Everything this link reveals: platform, handle, kind of post, and when it was
 * posted (UTC) — with `dateFrom` saying how that was worked out.
 */
export function linkInfo(raw, now = Date.now()) {
  let u;
  try { u = new URL(normalizeUrl(raw)); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const path = decodeURIComponent(u.pathname);
  const seg = path.split('/').filter(Boolean);
  const out = { url: u.toString(), host, platform: '', postType: '', handle: '', date: '', time: null, dateFrom: '' };
  const p = PLATFORMS.find((x) => x.re.test(host));
  if (p) { out.platform = p.name; out.postType = p.type; }
  let t = null;

  if (p?.name === 'LinkedIn') {
    const m = /(?:activity|share|ugcPost)[:-](\d{18,20})/.exec(path + u.search);
    if (m) { t = linkedinTime(m[1], now); out.dateFrom = 'the LinkedIn post ID'; }
    const pm = /^posts\/([^/_]+)_/.exec(seg.join('/'));
    if (pm) out.handle = pm[1];
    else if (seg[0] === 'in' && seg[1]) out.handle = seg[1];
    if (seg[0] === 'pulse') out.postType = 'Article';
  } else if (p?.name === 'X') {
    const i = seg.indexOf('status');
    if (i > 0 && /^\d{10,20}$/.test(seg[i + 1] || '')) {
      t = twitterTime(seg[i + 1], now); out.dateFrom = 'the post ID';
      if (!['i', 'intent', 'web'].includes(seg[0])) out.handle = `@${seg[0]}`;
    }
    // Cited under the platform's name at the time of posting.
    if (t && t.getTime() < X_RENAMED) { out.platform = 'Twitter'; out.postType = 'Tweet'; }
  } else if (p?.name === 'Bluesky') {
    if (seg[0] === 'profile' && seg[2] === 'post') {
      out.handle = `@${seg[1]}`;
      t = blueskyTime(seg[3] || '', now); if (t) out.dateFrom = 'the Bluesky post ID';
    }
  } else if (p?.name === 'TikTok') {
    const i = seg.indexOf('video');
    if (seg[0]?.startsWith('@')) out.handle = seg[0];
    if (i >= 0 && /^\d{15,20}$/.test(seg[i + 1] || '')) { t = tiktokTime(seg[i + 1], now); out.dateFrom = 'the TikTok video ID'; }
  } else if (p && seg[0]?.startsWith('@')) {
    out.handle = seg[0];
  } else if (seg[0]?.startsWith('@') && /^\d{15,20}$/.test(seg[1] || '')) {
    // Mastodon and other fediverse servers: https://server/@user/<id>
    t = mastodonTime(seg[1], now);
    if (t) { out.platform = 'Mastodon'; out.postType = 'Post'; out.handle = `${seg[0]}@${host}`; out.dateFrom = 'the Mastodon post ID'; }
  }
  if (!t && p?.name === 'Reddit' && seg[0] === 'r' && seg[1]) out.handle = `r/${seg[1]}`;
  if (!t && p?.name === 'YouTube' && seg[0]?.startsWith('@')) out.handle = seg[0];

  // A date written in the address: /2024/05/12/, /2024/05/, 2024-05-12
  if (!t) {
    const m = /(?:^|[/_-])((?:19|20)\d{2})[/-](0?[1-9]|1[0-2])(?:[/-](0?[1-9]|[12]\d|3[01]))?(?=$|[/_.-])/.exec(path);
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0];
      const when = Date.UTC(y, mo - 1, d || 1);
      if (when >= Date.UTC(1990, 0, 1) && when <= now + 86400000) {
        out.date = `${y}-${String(mo).padStart(2, '0')}${d ? `-${String(d).padStart(2, '0')}` : ''}`;
        out.dateFrom = 'the date in the address';
      }
    }
  }
  if (t) { out.time = t; out.date = ymd(t); }
  return out;
}

/** "May 12, 2024 at 17:03 UTC" — for showing where a date came from. */
export function describeWhen(info) {
  if (!info?.date) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m, d] = info.date.split('-').map(Number);
  const day = d ? `${months[m - 1]} ${d}, ${y}` : `${months[m - 1]} ${y}`;
  return info.time ? `${day} at ${info.time.toISOString().slice(11, 16)} UTC` : day;
}
