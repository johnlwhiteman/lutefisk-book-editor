// Pictures deleted from the book go to the Trash when the book is closed or opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trashUnusedAssets } from '../src/main/bookstore.js';

async function makeBook(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-assets-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), text);
  }
  return dir;
}

test('unused pictures are trashed; used ones (text, cover, Recycle Bin, drawings) stay', async () => {
  const dir = await makeBook({
    'lutefisk.yaml': 'title: T\ncover: assets/cover.png\ntrash:\n  - content: "![old](assets/in-bin.png)"\n',
    'chapters/01.md': 'Text ![map](assets/moon-map.png){width=50} and ![d](assets/drawing-1.png){drawing=assets/drawing-1.json}',
    'research/README.md': '![x](assets/from-notes.jpg)',
    'assets/cover.png': 'x', 'assets/moon-map.png': 'x', 'assets/map.png': 'x', 'assets/in-bin.png': 'x',
    'assets/drawing-1.png': 'x', 'assets/drawing-1.json': '{}', 'assets/from-notes.jpg': 'x', 'assets/deleted.png': 'x',
  });
  const trashed = [];
  const moved = await trashUnusedAssets(dir, async (p) => { trashed.push(path.basename(p)); await fs.rm(p); });
  assert.deepEqual(moved.sort(), ['deleted.png', 'map.png']);
  assert.deepEqual(trashed.sort(), ['deleted.png', 'map.png']);
  const left = (await fs.readdir(path.join(dir, 'assets'))).sort();
  assert.deepEqual(left, ['cover.png', 'drawing-1.json', 'drawing-1.png', 'from-notes.jpg', 'in-bin.png', 'moon-map.png']);
});

test('nothing is removed from a folder that is not a book', async () => {
  const dir = await makeBook({ 'assets/a.png': 'x' });
  const moved = await trashUnusedAssets(dir, async () => { throw new Error('should not trash'); });
  assert.deepEqual(moved, []);
});
