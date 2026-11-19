// Analyze reads a page's own citation tags; IEEE numbers sources by first citation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaFromHtml, isoDate } from '../src/shared/pagemeta.js';
import { formatInText, formatBibliography, citationOrder, formatEntry } from '../src/shared/citations.js';

test('pagemeta: scholarly citation_* tags', () => {
  const html = `<html><head><title>Ignored | Site</title>
    <meta name="citation_title" content="Moonlight &amp; tides">
    <meta name="citation_author" content="Chen, Li"><meta name="citation_author" content="Ana Rivera">
    <meta name="citation_journal_title" content="Journal of Shore Ecology">
    <meta name="citation_publication_date" content="2019/05/07">
    <meta name="citation_volume" content="12"><meta name="citation_issue" content="3">
    <meta name="citation_firstpage" content="45"><meta name="citation_lastpage" content="61">
    <meta name="citation_doi" content="10.1234/jse.2019.045"></head></html>`;
  const m = metaFromHtml(html, 'https://journal.example.org/a/1');
  assert.equal(m.kind, 'journal');
  assert.equal(m.title, 'Moonlight & tides');
  assert.deepEqual(m.authors, [{ family: 'Chen', given: 'Li' }, { given: 'Ana', family: 'Rivera' }]);
  assert.equal(m.container, 'Journal of Shore Ecology');
  assert.equal(m.date, '2019-05-07');
  assert.equal(m.pages, '45–61');
  assert.equal(m.doi, '10.1234/jse.2019.045');
});

test('pagemeta: a news article from Open Graph and JSON-LD', () => {
  const html = `<head><title>Why the Tide Keeps Its Schedule | Coastal Monthly</title>
    <meta property="og:site_name" content="Coastal Monthly"><meta property="og:type" content="article">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"NewsArticle","headline":"Why the Tide Keeps Its Schedule","author":[{"@type":"Person","name":"Riya Patel"}],"datePublished":"2024-03-14T08:00:00Z","publisher":{"@type":"Organization","name":"Coastal Media"}}]}</script></head>`;
  const m = metaFromHtml(html, 'https://www.example.com/tide');
  assert.equal(m.kind, 'article');
  assert.equal(m.title, 'Why the Tide Keeps Its Schedule');
  assert.deepEqual(m.authors, [{ given: 'Riya', family: 'Patel' }]);
  assert.equal(m.date, '2024-03-14');
  assert.equal(m.container, 'Coastal Monthly');
  assert.equal(m.publisher, 'Coastal Media');
});

test('pagemeta: a bare page falls back to <title> and the site name; dates parse', () => {
  const m = metaFromHtml('<title>Tides and the Moon</title>', 'https://www.example.gov/tides');
  assert.equal(m.kind, 'webpage');
  assert.equal(m.title, 'Tides and the Moon');
  assert.equal(m.container, 'example.gov');
  assert.equal(isoDate('March 3, 2024'), '2024-03-03');
  assert.equal(isoDate('2021'), '2021');
});

test('IEEE: numbered by first citation, list in that order', () => {
  const book = { citationStyle: 'ieee', sections: [{ id: 'a' }, { id: 'b', scenes: [{ id: 'c' }] }], bibliography: [
    { id: 'x', kind: 'book', authors: [{ family: 'Rivera', given: 'Ana M.' }], title: 'Harbors', publisher: 'Northwind', date: '2021' },
    { id: 'y', kind: 'journal', authors: [{ family: 'Chen', given: 'Li' }], title: 'Moonlight', container: 'J. Shore', volume: '12', issue: '3', pages: '45–61', date: '2019' },
    { id: 'z', kind: 'webpage', authors: [], title: 'Never cited', container: 'Site', url: 'https://example.org' },
  ] };
  const contents = { a: 'See [@y, 47].', c: 'And [@x] and [@y].' };
  assert.deepEqual(citationOrder(book, contents), ['y', 'x', 'z']);
  assert.equal(formatInText(book.bibliography[1], 'ieee', '47', 1), '[1, p. 47]');
  const list = formatBibliography(book.bibliography, 'ieee', citationOrder(book, contents));
  assert.match(list[0], /^\[1\] L\. Chen, “Moonlight,” <i>J\. Shore<\/i>, vol\. 12, no\. 3, pp\. 45–61, 2019\./);
  assert.match(list[1], /^\[2\] A\. M\. Rivera, <i>Harbors<\/i>\. Northwind, 2021\./);
  assert.match(list[2], /^\[3\] /);
  assert.match(formatEntry(book.bibliography[2], 'ieee'), /\[Online\]\. Available:/);
});
