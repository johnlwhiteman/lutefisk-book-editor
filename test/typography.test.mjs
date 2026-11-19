// Tools: straight and curly quotes, one or two spaces after punctuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTypo, typoEdits } from '../src/shared/typography.js';

test('quotes: straight to curly and back', () => {
  const s = '"Hello," she said. \'It\'s the \'90s.\' Then ("quoted").';
  const curly = applyTypo(s, 'smart');
  assert.equal(curly, '“Hello,” she said. ‘It’s the ’90s.’ Then (“quoted”).');
  assert.equal(applyTypo(curly, 'straight'), s);
  // Placeholders (footnotes, code) are never changed, and count as text before a quote.
  assert.equal(applyTypo('word￼"', 'smart'), 'word￼”');
});

test('spaces after a sentence: exactly one or exactly two, whatever was there', () => {
  const t = 'One.  Two!   Three? "Four."\tFive. Six.\u00a0Seven. Mr. Smith met J. R. R. Tolkien e.g. here. said she.  End.';
  assert.equal(applyTypo(t, 'onespace'), 'One. Two! Three? "Four." Five. Six. Seven. Mr. Smith met J. R. R. Tolkien e.g. here. said she. End.');
  assert.equal(applyTypo(t, 'twospace'), 'One.  Two!  Three?  "Four."  Five.  Six.  Seven.  Mr. Smith met J. R. R. Tolkien e.g. here. said she.  End.');
  // Already right: nothing to change.
  assert.deepEqual(typoEdits('One.  Two.', 'twospace'), []);
  assert.deepEqual(typoEdits('One. Two.', 'onespace'), []);
  assert.deepEqual(typoEdits('a.  b', 'onespace'), [{ at: 2, del: 2, ins: ' ' }]);
});
