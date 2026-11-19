// Links: offline date detection, address clean-up, and social-media citations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkInfo, normalizeUrl, displayUrl, looksLikeUrl, describeWhen } from '../src/shared/linkinfo.js';
import { formatEntry, formatInText, entryFromUrl } from '../src/shared/citations.js';

const NOW = Date.UTC(2026, 10, 17);

test('links: https:// is added when missing and hidden in the dialog', () => {
  assert.equal(normalizeUrl('example.com/page'), 'https://example.com/page');
  assert.equal(normalizeUrl('  https://example.com  '), 'https://example.com');
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeUrl('jane@example.com'), 'mailto:jane@example.com');
  assert.equal(normalizeUrl(''), '');
  assert.equal(displayUrl('https://example.com/a'), 'example.com/a');
  assert.equal(displayUrl('http://example.com/a'), 'http://example.com/a');
});

test('links: selected text that looks like an address', () => {
  for (const s of ['example.com', 'www.example.org/x?y=1', 'https://a.io', 'jane@example.com']) assert.ok(looksLikeUrl(s), s);
  for (const s of ['Hello world', 'Chapter 3.1', '3.14', 'e.g.', '']) assert.ok(!looksLikeUrl(s), s);
});

test('links: posting dates decoded from the link itself', () => {
  const tw = linkInfo('x.com/BillGates/status/1170330302231502849', NOW);
  assert.deepEqual([tw.platform, tw.postType, tw.handle, tw.date], ['Twitter', 'Tweet', '@BillGates', '2019-09-07']);
  const x = linkInfo('https://x.com/someone/status/1745012345678901234', NOW);
  assert.deepEqual([x.platform, x.postType, x.date], ['X', 'Post', '2024-01-10']);
  const li = linkInfo('https://www.linkedin.com/feed/update/urn:li:activity:7012345678901234567/', NOW);
  assert.deepEqual([li.platform, li.date, li.dateFrom], ['LinkedIn', '2022-12-24', 'the LinkedIn post ID']);
  assert.equal(linkInfo('https://www.linkedin.com/posts/jdoe_some-title-activity-7198049361234567890-Ab3d', NOW).date, '2024-05-19');
  assert.equal(linkInfo('https://bsky.app/profile/jay.bsky.team/post/3l6oveex3ii2l', NOW).date, '2024-10-17');
  const ma = linkInfo('https://mastodon.social/@Gargron/112345678901234567', NOW);
  assert.deepEqual([ma.platform, ma.handle, ma.date], ['Mastodon', '@Gargron@mastodon.social', '2024-04-27']);
  assert.equal(linkInfo('https://www.tiktok.com/@scout2015/video/6718335390845095173', NOW).date, '2019-07-27');
  const news = linkInfo('https://www.example-news.com/2024/05/12/story.html', NOW);
  assert.deepEqual([news.platform, news.date, news.dateFrom], ['', '2024-05-12', 'the date in the address']);
  assert.equal(linkInfo('https://www.facebook.com/NASA/posts/123', NOW).date, '');
  assert.equal(linkInfo('https://example.com/2999/01/01/', NOW).date, ''); // not in the future
  assert.match(describeWhen(tw), /^September 7, 2019 at \d\d:\d\d UTC$/);
  assert.equal(linkInfo('ftp://example.com', NOW), null);
});

const gates = {
  kind: 'social', authors: [{ family: 'Gates', given: 'Bill' }], handle: '@BillGates', container: 'Twitter', postType: 'Tweet', media: 'Image attached', date: '2019-09-07',
  title: 'Today, it’s easy to take for granted that the polio vaccine helped eliminate the disease in the United States and much of the world but',
  url: 'https://twitter.com/BillGates/status/1170330302231502849',
};

test('citations: social media posts in APA 7, MLA 9 and Chicago 17', () => {
  assert.equal(formatEntry(gates, 'apa'), 'Gates, B. [@BillGates]. (2019, September 7). <i>Today, it’s easy to take for granted that the polio vaccine helped eliminate the disease in the United States and…</i> [Image attached] [Tweet]. Twitter. <span class="url">https://twitter.com/BillGates/status/1170330302231502849</span>');
  assert.match(formatEntry(gates, 'mla'), /^Gates, Bill \[@BillGates\]\. “Today, .* but\.” <i>Twitter<\/i>, 7 Sept\. 2019, <span class="url">twitter\.com\/BillGates/);
  assert.match(formatEntry(gates, 'chicago'), /^Gates, Bill \(@BillGates\)\. “Today, .*” Twitter, September 7, 2019\. <span class="url">https:/);
  assert.equal(formatInText(gates, 'apa'), '(Gates, 2019)');
  assert.equal(formatInText(gates, 'mla'), '(Gates)');
  assert.equal(formatInText(gates, 'chicago'), '(Gates 2019)');
  // No real name: the handle takes the author's place.
  const anon = { ...gates, authors: [] };
  assert.match(formatEntry(anon, 'apa'), /^@BillGates\. \(2019, September 7\)\./);
  assert.equal(formatInText(anon, 'apa'), '(@BillGates, 2019)');
});

test('bibliography: a social post from a link gets its platform, handle and date offline', () => {
  const e = entryFromUrl('https://x.com/BillGates/status/1170330302231502849', { today: '2026-11-17' });
  assert.deepEqual([e.kind, e.container, e.handle, e.postType, e.date, e.accessed], ['social', 'Twitter', '@BillGates', 'Tweet', '2019-09-07', '2026-11-17']);
  assert.equal(entryFromUrl('https://www.example.org/2021/03/a-story').date, '2021-03');
});
