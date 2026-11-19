// Reading and writing book folders. A book is a plain folder:
//
//   My Book/
//     lutefisk.yaml      ← marks a Lutefisk book; metadata, settings, section order, bibliography
//     chapters/<id>.md   ← one Markdown file per section
//     assets/            ← images (cover, author photo, inline images)
//
// All paths coming from the renderer are validated here so that a compromised
// renderer can never read or write outside the open book folder.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const BOOK_FILE = 'lutefisk.yaml';
/** Books made before the rename kept their manifest in book.yaml; it's read, then replaced on the next save. */
export const LEGACY_BOOK_FILE = 'book.yaml';
/** The manifest file a folder actually has: lutefisk.yaml, or an older book.yaml. */
export async function manifestPath(dir) {
  for (const f of [BOOK_FILE, LEGACY_BOOK_FILE]) {
    try { await fs.access(path.join(dir, f)); return path.join(dir, f); } catch { /* next */ }
  }
  return null;
}
const SECTION_FILE_RE = /^chapters\/[a-z]{1,4}-[a-z0-9]{4,32}\.md$/;
const ASSET_RE = /^(assets|research)\/[A-Za-z0-9._ -]{1,120}$/;
const NOTE_FILE_RE = /^research\/[a-z]{1,4}-[a-z0-9]{4,32}\.md$/;
export const RESEARCH_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.txt', '.md', '.markdown', '.docx', '.doc', '.rtf', '.odt', '.epub', '.csv', '.xlsx', '.pptx', '.mp3', '.m4a', '.mp4', '.mov']);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MAX_FILE = 25 * 1024 * 1024;

export function isSectionFile(rel) {
  return typeof rel === 'string' && SECTION_FILE_RE.test(rel);
}
export function isNoteFile(rel) {
  return typeof rel === 'string' && NOTE_FILE_RE.test(rel);
}
export function isAssetPath(rel) {
  return typeof rel === 'string' && ASSET_RE.test(rel) && !rel.includes('..');
}

/** Resolve rel inside dir, refusing anything that escapes it. */
export function within(dir, rel) {
  const full = path.resolve(dir, rel);
  const root = path.resolve(dir) + path.sep;
  if (!full.startsWith(root)) throw new Error('Path escapes book folder');
  return full;
}

async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function isBookDir(dir) {
  return !!(await manifestPath(dir));
}

export async function loadBook(dir) {
  const file = await manifestPath(dir);
  if (!file) throw new Error('That folder isn’t a book (there’s no lutefisk.yaml inside).');
  const raw = await fs.readFile(file, 'utf8');
  const book = YAML.parse(raw, { maxAliasCount: 50 }) || {};
  if (typeof book !== 'object' || Array.isArray(book)) throw new Error(`${path.basename(file)} is not a mapping`);
  book.sections = Array.isArray(book.sections) ? book.sections : [];
  const contents = {};
  const fileTimes = {};
  const read = async (id, rel) => {
    try {
      const st = await fs.stat(within(dir, rel));
      fileTimes[id] = { created: (st.birthtimeMs > 0 ? st.birthtime : st.ctime).toISOString(), modified: st.mtime.toISOString() };
      if (st.size > MAX_FILE) return;
      contents[id] = await fs.readFile(within(dir, rel), 'utf8');
    } catch { contents[id] = ''; }
  };
  for (const s of book.sections) {
    if (!s || typeof s.id !== 'string') continue;
    if (isSectionFile(`chapters/${s.id}.md`)) await read(s.id, `chapters/${s.id}.md`);
    for (const sc of Array.isArray(s.scenes) ? s.scenes : []) {
      if (sc && typeof sc.id === 'string' && isSectionFile(`chapters/${sc.id}.md`)) await read(sc.id, `chapters/${sc.id}.md`);
    }
  }
  for (const r of Array.isArray(book.research) ? book.research : []) {
    // Text items — notes, scenes drafted in Research, character and place sheets — live in research/<id>.md.
    if (r && (r.store === 'note' || ['card', 'note', 'scene', 'character', 'place'].includes(r.kind)) && typeof r.id === 'string' && isNoteFile(`research/${r.id}.md`)) await read(r.id, `research/${r.id}.md`);
  }
  return { dir, book, contents, fileTimes };
}

/** Lightweight info for the library grid. */
export async function readSummary(dir) {
  const file = await manifestPath(dir);
  const raw = await fs.readFile(file, 'utf8');
  const book = YAML.parse(raw, { maxAliasCount: 50 }) || {};
  let modified = (await fs.stat(file)).mtime;
  let words = 0;
  for (const s of Array.isArray(book.sections) ? book.sections : []) {
    if (!s || s.enabled === false || typeof s.id !== 'string') continue;
    const rel = `chapters/${s.id}.md`;
    if (!isSectionFile(rel)) continue;
    try {
      const file = within(dir, rel);
      const st = await fs.stat(file);
      if (st.mtime > modified) modified = st.mtime;
      if (st.size < MAX_FILE) words += ((await fs.readFile(file, 'utf8')).match(/[\p{L}\p{N}’']+/gu) || []).length;
    } catch { /* missing file */ }
  }
  const coverPath = isAssetPath(book.cover) ? within(dir, book.cover) : '';
  // The book goal, for the library: a length in words (pages × words per page) and a deadline.
  const g = book.goals && typeof book.goals === 'object' ? book.goals : {};
  const perPage = Number(g.wordsPerPage) > 0 ? Number(g.wordsPerPage) : 280;
  const target = g.targetUnit === 'pages' ? Number(g.targetPages) * perPage : Number(g.targetWords);
  const goal = { targetWords: Number.isFinite(target) && target > 0 ? Math.round(target) : 0, deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(g.deadline || '')) ? g.deadline : '' };
  return {
    goal,
    title: String(book.title || path.basename(dir)), subtitle: String(book.subtitle || ''), genre: typeof book.genre === 'string' ? book.genre.slice(0, 60) : '', author: String(book.author || ''),
    template: String(book.template || 'classic'), coverTone: Number.isInteger(book.coverTone) ? book.coverTone : null, words, modified: modified.toISOString(), coverPath, kind: book.kind && book.kind !== 'book' ? String(book.kind) : 'book',
  };
}

export function serializeBook(book) {
  const clean = JSON.parse(JSON.stringify(book)); // drop functions/undefined
  for (const s of clean.sections || []) delete s.def;
  const header = '# Lutefisk Book Editor book manifest. Chapter text lives in chapters/*.md\n';
  return header + YAML.stringify(clean, { lineWidth: 0 });
}

/** files: { [sectionId]: markdown } ; removed: [sectionId] */
export async function saveBook(dir, book, files = {}, removed = [], notes = {}, removedNotes = []) {
  if (!book || typeof book !== 'object') throw new Error('Invalid book');
  await atomicWrite(path.join(dir, BOOK_FILE), serializeBook(book));
  // An older book: its book.yaml has now been replaced by lutefisk.yaml.
  await fs.rm(path.join(dir, LEGACY_BOOK_FILE), { force: true }).catch(() => {});
  for (const [id, text] of Object.entries(files)) {
    const rel = `chapters/${id}.md`;
    if (!isSectionFile(rel) || typeof text !== 'string' || text.length > MAX_FILE) continue;
    await atomicWrite(within(dir, rel), text);
  }
  for (const [id, text] of Object.entries(notes)) {
    const rel = `research/${id}.md`;
    if (!isNoteFile(rel) || typeof text !== 'string' || text.length > MAX_FILE) continue;
    await atomicWrite(within(dir, rel), text);
  }
  for (const id of removedNotes) {
    const rel = `research/${id}.md`;
    if (!isNoteFile(rel)) continue;
    const trash = within(dir, `.trash/${id}-${Date.now()}.md`);
    await fs.mkdir(path.dirname(trash), { recursive: true });
    await fs.rename(within(dir, rel), trash).catch(() => {});
  }
  for (const id of removed) {
    const rel = `chapters/${id}.md`;
    if (!isSectionFile(rel)) continue;
    const src = within(dir, rel);
    const trash = within(dir, `.trash/${id}-${Date.now()}.md`);
    await fs.mkdir(path.dirname(trash), { recursive: true });
    await fs.rename(src, trash).catch(() => {});
  }
}

export async function createBook(dir, book, contents) {
  await fs.mkdir(path.join(dir, 'chapters'), { recursive: true });
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await saveBook(dir, book, contents);
}

/** Copy an image into assets/ with a safe, unique name. Returns 'assets/<name>'. */
export async function importAsset(dir, srcFile) {
  const ext = path.extname(srcFile).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('Unsupported image type');
  const st = await fs.stat(srcFile);
  if (!st.isFile() || st.size > MAX_FILE) throw new Error('Image too large (25 MB max)');
  const base = path.basename(srcFile, path.extname(srcFile)).normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  let name = `${base}${ext}`;
  for (let i = 2; ; i++) {
    try { await fs.access(path.join(dir, 'assets', name)); name = `${base}-${i}${ext}`; } catch { break; }
  }
  await fs.copyFile(srcFile, path.join(dir, 'assets', name));
  return `assets/${name}`;
}

/** Write image bytes made in the app (e.g. a cropped cover) into assets/. Returns 'assets/<name>'. */
export async function writeAssetData(dir, baseName, data) {
  const buf = Buffer.from(data);
  if (buf.length < 4 || buf.length > MAX_FILE) throw new Error('Invalid image');
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? '.jpg' : buf[0] === 0x89 && buf[1] === 0x50 ? '.png' : null;
  if (!ext) throw new Error('Only JPEG or PNG images can be saved');
  const base = String(baseName || 'image').normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  let name = `${base}${ext}`;
  for (let i = 2; ; i++) {
    try { await fs.access(path.join(dir, 'assets', name)); name = `${base}-${i}${ext}`; } catch { break; }
  }
  await fs.writeFile(path.join(dir, 'assets', name), buf);
  return `assets/${name}`;
}

/** Drawings keep their editable strokes as JSON next to the rendered PNG. */
export async function writeDrawing(dir, rel, json) {
  const text = String(json || '');
  if (text.length > 8 * 1024 * 1024) throw new Error('Drawing too large');
  const data = JSON.parse(text);
  if (!data || !['lutefisk-drawing', 'chedditor-drawing'].includes(data.kind) || !Array.isArray(data.strokes)) throw new Error('Invalid drawing');
  data.kind = 'lutefisk-drawing';
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  let target = rel && /^assets\/[A-Za-z0-9._-]+\.json$/.test(rel) ? rel : null;
  if (!target) {
    for (let i = 1; ; i++) {
      const name = `assets/drawing-${i}.json`;
      try { await fs.access(path.join(dir, name)); } catch { target = name; break; }
    }
  }
  await fs.writeFile(path.join(dir, target), JSON.stringify(data));
  return target;
}
export async function readDrawing(dir, rel) {
  if (!/^assets\/[A-Za-z0-9._-]+\.json$/.test(String(rel))) throw new Error('Invalid drawing path');
  return fs.readFile(path.join(dir, rel), 'utf8');
}

/** Copy any file into research/ with a safe, unique name. Returns 'research/<name>'. */
export async function importResearchFile(dir, srcFile) {
  const ext = path.extname(srcFile).toLowerCase();
  if (!RESEARCH_EXT.has(ext)) throw new Error(`${path.basename(srcFile)}: this file type can’t be added to Research`);
  const st = await fs.stat(srcFile);
  if (!st.isFile() || st.size > 200 * 1024 * 1024) throw new Error(`${path.basename(srcFile)} is too large (200 MB max)`);
  const base = path.basename(srcFile, path.extname(srcFile)).normalize('NFKD').replace(/[^A-Za-z0-9 _-]+/g, '-').replace(/^[-\s]+|[-\s]+$/g, '').slice(0, 80) || 'file';
  await fs.mkdir(path.join(dir, 'research'), { recursive: true });
  let name = `${base}${ext}`;
  for (let i = 2; ; i++) {
    try { await fs.access(path.join(dir, 'research', name)); name = `${base} ${i}${ext}`; } catch { break; }
  }
  await fs.copyFile(srcFile, path.join(dir, 'research', name));
  return { rel: `research/${name}`, name: path.basename(srcFile, path.extname(srcFile)), ext, size: st.size };
}

export async function readAsset(dir, rel) {
  if (!isAssetPath(rel)) throw new Error('Invalid asset path');
  return fs.readFile(within(dir, rel));
}

export function mimeFor(file) {
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json',
    '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8',
  })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * Pictures (and drawings) the book no longer uses: files in assets/ that nothing in the book
 * mentions as "assets/<name>". Every text file in the book is read: chapters, lutefisk.yaml
 * (cover, portraits, templates, the Recycle Bin's deleted text), research notes and so on.
 * Runs when a book is closed or opened (never mid-session, so Undo can bring a picture back).
 * Each unused file goes to the system Trash via `trash` (so it can still be recovered).
 * If anything can't be read, nothing is removed. Returns the names moved.
 */
export async function trashUnusedAssets(dir, trash) {
  const assetsDir = path.join(dir, 'assets');
  let files;
  try { files = (await fs.readdir(assetsDir, { withFileTypes: true })).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => d.name); } catch { return []; }
  if (!files.length) return [];
  // The book must be a book: no marker file, no clean-up.
  const marker = await fs.readFile(path.join(dir, 'lutefisk.yaml'), 'utf8').catch(() => fs.readFile(path.join(dir, 'book.yaml'), 'utf8').catch(() => null));
  if (marker == null) return [];
  const TEXT = /\.(md|markdown|ya?ml|json|txt|css|html?)$/i;
  let text = '';
  const walk = async (d, depth) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4 && p !== assetsDir) await walk(p, depth + 1); continue; }
      if (!e.isFile() || !TEXT.test(e.name)) continue;
      const st = await fs.stat(p);
      if (st.size > 50 * 1024 * 1024) throw new Error('too large to check');
      text += '\n' + await fs.readFile(p, 'utf8');
    }
  };
  try { await walk(dir, 0); } catch { return []; }
  const used = (name) => text.includes(`assets/${name}`) || text.includes(`assets/${encodeURI(name)}`);
  const moved = [];
  for (const name of files) {
    if (used(name)) continue;
    // A drawing's PNG is kept while its strokes file is used, and the other way round.
    const twin = /\.json$/i.test(name) ? name.replace(/\.json$/i, '.png') : name.replace(/\.png$/i, '.json');
    if (twin !== name && files.includes(twin) && used(twin)) continue;
    try { await trash(path.join(assetsDir, name)); moved.push(name); } catch { /* leave it */ }
  }
  return moved;
}
