// Privacy: no book data ever goes online. Run with every `npm test`.
//
// 1. At run time: every way Node can reach the network is trapped (fetch, http, https, http2,
//    net, tls, dgram, dns, WebSocket), then a whole book — the test novel, with every feature —
//    is written, saved, read back, listed in the library, given research notes and uploads, and
//    exported to EPUB, Word, RTF, MOBI and Markdown. Not one network call may happen.
// 2. In the source: nothing in the app (main, preload, window, shared) uses a network API, the
//    window's Content-Security-Policy allows only the app's own files, and every Electron
//    session cancels http(s), ws(s) and ftp requests.
// 3. The one exception: Analyze, in a source's details, looks up the link the writer pasted.
//    Only src/main/source-lookup.js may go online, only through the 'source:lookup' handler,
//    and it sends nothing but a plain GET for that address (no cookies, no referrer, no book).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- the traps */
const attempts = [];
const trap = (name) => (...args) => { attempts.push(`${name} ${String(args[0]?.href || args[0]?.host || args[0] || '').slice(0, 80)}`); throw new Error(`Network use is not allowed: ${name}`); };
function lockNetwork() {
  globalThis.fetch = trap('fetch');
  globalThis.WebSocket = class { constructor(u) { trap('WebSocket')(u); } };
  for (const [mod, name] of [[http, 'http'], [https, 'https']]) { mod.request = trap(`${name}.request`); mod.get = trap(`${name}.get`); }
  http2.connect = trap('http2.connect');
  net.connect = trap('net.connect'); net.createConnection = trap('net.createConnection');
  net.Socket.prototype.connect = trap('net.Socket.connect');
  tls.connect = trap('tls.connect');
  dgram.createSocket = trap('dgram.createSocket');
  dns.lookup = trap('dns.lookup'); dns.resolve = trap('dns.resolve');
  dns.promises.lookup = trap('dns.promises.lookup'); dns.promises.resolve = trap('dns.promises.resolve');
}

test('privacy: a whole book is written, saved, read, researched and exported without one network call', async () => {
  lockNetwork();
  // The test novel: chapters, scenes, front and back matter, footnotes, citations, equations,
  // code, a table, verse, comments, characters, plot, research, goals…
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lutefisk-privacy-'));
  const bookDir = path.join(dir, 'The Teaspoon Admiral');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'make-test-novel.mjs'), bookDir], { stdio: 'ignore' });

  // The main process is bundled as CommonJS (where __dirname is dist/); give its modules the same.
  globalThis.__dirname = path.join(root, 'dist');
  const { loadBook, saveBook, readSummary } = await import('../src/main/bookstore.js');
  const research = await import('../src/main/research-folder.js');
  const { buildEpub } = await import('../src/main/export-epub.js');
  const { buildDocx } = await import('../src/main/export-docx.js');
  const { buildRtf } = await import('../src/main/export-rtf.js');
  const { buildMobi } = await import('../src/main/export-mobi.js');
  const { buildMarkdown } = await import('../src/main/export-markdown.js');

  // Open, edit, save, reopen.
  const { book, contents } = await loadBook(bookDir);
  const first = book.sections.find((s) => s.type === 'chapter');
  contents[first.id] = `${contents[first.id] || ''}\n\nA private sentence that must never leave this computer.\n`;
  await saveBook(bookDir, book, { [first.id]: contents[first.id] });
  const again = await loadBook(bookDir);
  assert.match(again.contents[first.id], /must never leave this computer/);
  await readSummary(bookDir);

  // Research: README notes and an upload.
  await research.ensureReadme(bookDir, book.title);
  await research.writeReadme(bookDir, '# Notes\n\nSecret research.\n');
  const up = path.join(dir, 'map.png');
  await fs.writeFile(up, Buffer.from('89504e470d0a1a0a', 'hex'));
  await research.uploadFiles(bookDir, [up]);
  await research.listFiles(bookDir);

  // Every export (math pictures and image conversions are stood in for; in the app they're drawn on this computer).
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const rasterize = async (eqs) => new Map([...eqs.keys()].map((k) => [k, { png, width: 10, height: 10, depth: 0 }]));
  const args = { dir: bookDir, book: again.book, contents: again.contents, rasterize, toPng: async (b) => b, toJpeg: async (b) => b };
  const made = [], failed = [];
  for (const [name, build] of [['EPUB', buildEpub], ['Word', buildDocx], ['RTF', buildRtf], ['MOBI', buildMobi], ['Markdown', buildMarkdown]]) {
    try { const out = await build(args); made.push(`${name}:${out?.length ?? 0}`); } catch (err) {
      failed.push(`${name}: ${String(err?.message || err).slice(0, 120)}`);
    }
  }
  assert.deepEqual(failed, [], 'every export must succeed offline');
  assert.equal(made.length, 5);
  assert.deepEqual(attempts, [], `Network calls were attempted: ${attempts.join('; ')}`);
});

/* ---------------------------------------------------------------- the source */
const list = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? list(p) : /\.(m?js|html)$/.test(n) ? [p] : []; });
const sources = list(path.join(root, 'src')).map((f) => ({ f: path.relative(root, f), t: readFileSync(f, 'utf8') }));

test('privacy: no network APIs anywhere in the app’s source', () => {
  const banned = [
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bnew\s+WebSocket\b/, 'WebSocket'], [/\bEventSource\b/, 'EventSource'],
    [/\bsendBeacon\b/, 'sendBeacon'], [/\bRTCPeerConnection\b/, 'WebRTC'], [/\bnet\.request\b/, 'electron net.request'],
    [/from ['"]node:(http|https|http2|net|tls|dgram|dns)['"]/, 'a Node network module'], [/require\(['"](node:)?(http|https|http2|net|tls|dgram|dns)['"]\)/, 'a Node network module'],
    [/\bautoUpdater\b/, 'auto-update'], [/crashReporter\.start/, 'crash reporting'], [/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs/, 'a web font or CDN'],
  ];
  for (const { f, t } of sources) for (const [re, what] of banned) assert.doesNotMatch(t, re, `${f} uses ${what}`);
  // The only fetch of a file: the app's own README, shown in Help (a file inside the app).
  // The only fetch of a web address: Analyze (source-lookup.js), checked below.
  for (const { f, t } of sources) {
    if (f === path.join('src', 'main', 'source-lookup.js')) continue;
    for (const m of t.matchAll(/\bfetch\(([^)]*)\)/g)) assert.match(m[1], /^'[\w./-]+'$/, `${f}: fetch(${m[1]}) — only the app's own files may be fetched`);
  }
});

test('privacy: the window may load only the app’s own files, and every session blocks the network', () => {
  const html = readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] || '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /https?:|wss?:|\*/, 'the CSP must not allow any web address');
  const main = readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  for (const scheme of ['http', 'https', 'ws', 'wss', 'ftp']) assert.match(main, new RegExp(`'${scheme}://\\*/\\*'`), `${scheme} requests must be cancelled`);
  assert.match(main, /onBeforeRequest\(\{ urls: NET \}, \(_d, cb\) => cb\(\{ cancel: true \}\)\)/);
  assert.match(main, /app\.on\('session-created', \(ses\) => lockDown\(ses\)\)/);
});

test('privacy: Analyze is the only way online — one file, one handler, a plain GET of the pasted link', () => {
  const lookupFile = path.join('src', 'main', 'source-lookup.js');
  const t = readFileSync(path.join(root, lookupFile), 'utf8');
  const calls = [...t.matchAll(/\bfetch\(/g)];
  assert.equal(calls.length, 1, 'source-lookup.js fetches in exactly one place');
  assert.match(t, /method: 'GET'/);
  assert.match(t, /credentials: 'omit'/);
  assert.match(t, /referrerPolicy: 'no-referrer'/);
  assert.doesNotMatch(t, /\bbody\s*:/, 'nothing is sent in a request body');
  const code = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'|`[^`]*`/g, "''");
  assert.doesNotMatch(code, /\b(contents|bibliography|book)\b/, 'the lookup never touches the book');
  // Only main.js imports it, and only the source:lookup handler calls it.
  const users = sources.filter(({ f, t: src }) => f !== lookupFile && /from ['"][^'"]*source-lookup\.js['"]/.test(src)).map(({ f }) => f);
  assert.deepEqual(users, [path.join('src', 'main', 'main.js')]);
  const main = readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  assert.equal([...main.matchAll(/lookupSource\(/g)].length, 1);
  assert.match(main, /handle\('source:lookup', async \(\{ url \} = \{\}\) => lookupSource\(/);
});
