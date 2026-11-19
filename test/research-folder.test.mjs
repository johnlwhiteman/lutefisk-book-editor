// The book's Research folder: research/README.md (made once, never overwritten), uploads with
// plain names, a file list without README.md or index cards, and checked file names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as rf from '../src/main/research-folder.js';

const tmpBook = () => fs.mkdtemp(path.join(os.tmpdir(), 'lutefisk-rf-'));

test('research: README.md is made once and kept', async () => {
  const book = await tmpBook();
  const file = await rf.ensureReadme(book, 'The Salt');
  assert.equal(file, path.join(book, 'research', 'README.md'));
  assert.match(await fs.readFile(file, 'utf8'), /^# Research — The Salt/);
  await rf.writeReadme(book, '# Mine\n');
  await rf.ensureReadme(book, 'Other');
  assert.equal((await rf.readReadme(book, 'x')).text, '# Mine\n');
});

test('research: uploads get plain names; the list skips README and index cards', async () => {
  const book = await tmpBook();
  const src = await tmpBook();
  const a = path.join(src, 'Moon map (old).PNG'), b = path.join(src, 'tide tables.pdf');
  await fs.writeFile(a, 'x'); await fs.writeFile(b, 'y');
  await rf.ensureReadme(book, 'B');
  await fs.writeFile(path.join(book, 'research', 'res-abcd1234.md'), 'card');
  await fs.writeFile(path.join(book, 'research', 'book.yaml'), 'title: x');
  const got = await rf.uploadFiles(book, [a, b, a]);
  assert.deepEqual(got.map((f) => f.name), ['Moon-map-old.png', 'tide-tables.pdf', 'Moon-map-old-2.png']);
  assert.deepEqual(got.map((f) => f.image), [true, false, true]);
  assert.deepEqual((await rf.listFiles(book)).map((f) => f.name), ['Moon-map-old-2.png', 'Moon-map-old.png', 'tide-tables.pdf']);
});

test('research: file names are checked', () => {
  assert.throws(() => rf.filePath('/b', '../x'), /Invalid/);
  assert.throws(() => rf.filePath('/b', '.hidden'), /Invalid/);
  assert.equal(rf.plainName('a..b c.JPG'), 'a.b-c.jpg');
});
