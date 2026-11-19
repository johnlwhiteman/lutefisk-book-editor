// The book's Research folder: <book>/research/, with a README.md for your notes about the
// book (made with the book, or the first time it's needed), and any files you upload.
// Index cards live here too, as research/<id>.md, but they're listed by the app, not as files.
// Every name is checked here: nothing outside the folder can be touched.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const NOTE_RE = /^[a-z]{1,4}-[a-z0-9]{4,32}\.md$/; // index cards and other text items
export const researchDir = (bookDir) => path.join(bookDir, 'research');
const exists = (p) => fs.access(p).then(() => true, () => false);

export const readmeTemplate = (title) => `# Research — ${title || 'My Book'}\n\nNotes, sources, pictures and ideas for this book. Nothing here goes into the book.\n`;

/** Make research/README.md if it isn't there. Returns its path. */
export async function ensureReadme(bookDir, title) {
  const dir = researchDir(bookDir);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'README.md');
  if (!(await exists(file))) await fs.writeFile(file, readmeTemplate(title), 'utf8');
  return file;
}
export async function readReadme(bookDir, title) {
  const file = await ensureReadme(bookDir, title);
  return { text: await fs.readFile(file, 'utf8'), path: file, dir: researchDir(bookDir) };
}
export async function writeReadme(bookDir, text) {
  const s = String(text ?? '');
  if (s.length > 2_000_000) throw new Error('That’s too long');
  await fs.mkdir(researchDir(bookDir), { recursive: true });
  const file = path.join(researchDir(bookDir), 'README.md');
  await fs.writeFile(`${file}.tmp`, s, 'utf8');
  await fs.rename(`${file}.tmp`, file);
  return true;
}

/** The files you put in Research (not README.md, index cards or hidden files). */
export async function listFiles(bookDir) {
  const out = [];
  for (const d of await fs.readdir(researchDir(bookDir), { withFileTypes: true }).catch(() => [])) {
    // Not listed: README.md (it's the notes), index cards, hidden files, and the book's own settings files
    // (lutefisk.yaml / book.yaml and any other .yaml), which shouldn't be edited by hand.
    if (!d.isFile() || d.name.startsWith('.') || d.name === 'README.md' || NOTE_RE.test(d.name) || d.name.endsWith('.tmp') || /\.ya?ml$/i.test(d.name)) continue;
    const st = await fs.stat(path.join(researchDir(bookDir), d.name)).catch(() => null);
    out.push({ name: d.name, size: st?.size || 0, image: /\.(png|jpe?g|gif|webp|svg)$/i.test(d.name) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A plain file name the book:// protocol serves and Markdown can link: letters, digits, . _ - */
export function plainName(file) {
  const ext = path.extname(file).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const base = path.basename(file, path.extname(file)).normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(0, 90) || 'file';
  return `${base}${ext}`;
}

/** Copy files in (plain names; "-2", "-3"… when taken). Returns [{ name, image }]. */
export async function uploadFiles(bookDir, files) {
  const to = researchDir(bookDir);
  await fs.mkdir(to, { recursive: true });
  const out = [];
  for (const f of (files || []).slice(0, 100)) {
    const plain = plainName(f);
    const ext = path.extname(plain), base = plain.slice(0, plain.length - ext.length);
    let name = plain;
    for (let i = 2; name === 'README.md' || NOTE_RE.test(name) || await exists(path.join(to, name)); i++) name = `${base}-${i}${ext}`;
    await fs.copyFile(f, path.join(to, name));
    out.push({ name, image: /\.(png|jpe?g|gif|webp|svg)$/i.test(name) });
  }
  return out;
}

/** The full path of a file in Research (checked). */
export function filePath(bookDir, name) {
  const n = String(name || '');
  if (/\.ya?ml$/i.test(n)) throw new Error('That file can’t be opened from Research');
  if (!n || n !== path.basename(n) || n.startsWith('.') || /[\\/\u0000]/.test(n) || n.length > 200) throw new Error('Invalid file name');
  return path.join(researchDir(bookDir), n);
}
