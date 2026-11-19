// Citation style guides for the Bibliography page: how each style cites in the text and lists
// its sources, with worked examples (made by the same formatter the book uses, so they always
// match what you'll get).
import { formatEntry, formatInText } from '../shared/citations.js';

/** Made-up sources for the examples. */
const SAMPLES = {
  book: { id: 's1', kind: 'book', authors: [{ family: 'Rivera', given: 'Ana M.' }, { family: 'Okafor', given: 'James' }], title: 'The Quiet Tide: A History of Harbors', publisher: 'Northwind Press', date: '2021', edition: '2nd' },
  journal: { id: 's2', kind: 'journal', authors: [{ family: 'Chen', given: 'Li' }], title: 'Moonlight and tidal behavior in coastal birds', container: 'Journal of Shore Ecology', volume: '12', issue: '3', pages: '45–61', date: '2019', doi: '10.1234/jse.2019.045' },
  article: { id: 's3', kind: 'article', authors: [{ family: 'Patel', given: 'Riya' }], title: 'Why the Tide Keeps Its Schedule', container: 'Coastal Monthly', date: '2024-03-14', url: 'https://www.example.com/tide-schedule' },
  webpage: { id: 's4', kind: 'webpage', authors: [{ literal: 'National Tide Office' }], title: 'Tides and the Moon', container: 'National Tide Office', date: '2023-06-02', url: 'https://www.example.gov/tides', accessed: '2026-11-18' },
  social: { id: 's5', kind: 'social', authors: [{ family: 'Brooks', given: 'Sam' }], handle: '@sambrooks', title: 'The spring tide this morning reached the top step of the old pier for the first time in years.', container: 'X', postType: 'Post', date: '2025-04-02', url: 'https://x.com/sambrooks/status/1' },
};

const KINDS = [
  ['book', 'Book'], ['journal', 'Journal article'], ['article', 'Magazine or newspaper article'], ['webpage', 'Web page'], ['social', 'Social media post'],
];

export const GUIDES = {
  apa: {
    name: 'APA Style, 7th edition',
    use: 'Psychology, education and the social sciences. Author–date: the reader sees who and when right in the sentence.',
    inText: [
      'Author’s family name and year, in parentheses: (Rivera & Okafor, 2021). Two authors are joined with “&”; three or more: (Chen et al., 2019).',
      'Add a page for a quotation: (Chen, 2019, p. 47); a range uses “pp.”.',
      'In a sentence, name the author and put the year after: Rivera and Okafor (2021) argue…',
      'No author: use the first words of the title — (“Why the Tide,” 2024). No date: (National Tide Office, n.d.).',
    ],
    list: 'Titled “References”. Alphabetical by the first author’s family name, with a hanging indent. Authors are family name and initials; the date comes right after the authors. Titles of articles and web pages are in sentence case; book, journal and website names in italics.',
    kinds: {
      book: 'Authors. (Year). <i>Title in sentence case</i> (edition). Publisher. DOI or link if there is one.',
      journal: 'Authors. (Year). Title of the article. <i>Journal Name</i>, <i>volume</i>(issue), pages. https://doi.org/…',
      article: 'Authors. (Year, Month Day). <i>Title of the article</i>. Magazine or Newspaper. Link.',
      webpage: 'Author or organization. (Year, Month Day). <i>Title of the page</i>. Site Name (left out when it’s the same as the author). Link. If the page changes and has no date, add “Retrieved Month Day, Year, from”.',
      social: 'Name [@handle]. (Year, Month Day). <i>First 20 words of the post</i> [Attached media] [Post]. Platform. Link.',
    },
  },
  mla: {
    name: 'MLA Style, 9th edition',
    use: 'Literature, languages and the humanities. Author–page: the reader sees whose words and where to find them.',
    inText: [
      'Author’s family name and the page, no comma: (Rivera and Okafor 112). Three or more authors: (Chen et al. 47).',
      'No page (a web page or post): just the name — (Patel).',
      'No author: a short title in quotation marks or italics — (“Why the Tide”).',
      'In a sentence, name the author and put only the page in parentheses: Rivera and Okafor note that… (112).',
    ],
    list: 'Titled “Works Cited”. Alphabetical by the first author, with a hanging indent. The first author is “Family, Given”; later ones are “Given Family”; three or more become “et al.” Each entry follows the core elements: Author. Title. Container, other contributors, version, number, publisher, date, location.',
    kinds: {
      book: 'Family, Given, and Given Family. <i>Title in Title Case</i>. Publisher, Year.',
      journal: 'Family, Given. “Title of the Article.” <i>Journal Name</i>, vol. 12, no. 3, Year, pp. 45–61, doi or link.',
      article: 'Family, Given. “Title of the Article.” <i>Magazine or Newspaper</i>, Day Mon. Year, link (without https://).',
      webpage: 'Author. “Title of the Page.” <i>Site Name</i>, Day Mon. Year, link. Accessed Day Mon. Year. (The access date is optional but helpful when there’s no published date.)',
      social: 'Family, Given [@handle]. “Text of the post.” <i>Platform</i>, Day Mon. Year, link.',
    },
  },
  chicago: {
    name: 'Chicago Manual of Style, 17th edition',
    use: 'History, publishing and general nonfiction. Lutefisk Book Editor uses Chicago’s author–date system in the text and its bibliography for the list.',
    inText: [
      'Author’s family name and year, no comma, then the page after a comma: (Rivera and Okafor 2021, 112).',
      'Three authors are all named; four or more: (Chen et al. 2019).',
      'No date: (National Tide Office, n.d.).',
      'Footnotes you add yourself (Insert › Footnote) can hold longer comments or full references.',
    ],
    list: 'Titled “Bibliography”. Alphabetical by the first author, with a hanging indent. The first author is “Family, Given”; the rest “Given Family”. Titles in title case: books and journals in italics, articles and pages in quotation marks.',
    kinds: {
      book: 'Family, Given, and Given Family. <i>Title: Subtitle</i>. Publisher, Year.',
      journal: 'Family, Given. “Title of the Article.” <i>Journal Name</i> 12, no. 3 (Year): 45–61. https://doi.org/…',
      article: 'Family, Given. “Title of the Article.” <i>Magazine or Newspaper</i>, Month Day, Year. Link.',
      webpage: 'Author. “Title of the Page.” Site Name, Month Day, Year. Link. (No date? Add “Accessed Month Day, Year.”)',
      social: 'Family, Given (@handle). “Up to the first 160 characters of the post.” Platform, Month Day, Year. Link.',
    },
  },
  ieee: {
    name: 'IEEE Reference Style',
    use: 'Engineering, computing and technical writing. Numbered: each source gets a number the first time it’s cited, and keeps it.',
    inText: [
      'A number in square brackets, inside the sentence’s punctuation: as shown in [1].',
      'Numbers follow the order sources are first cited in the book, not the alphabet. Lutefisk Book Editor numbers them for you and renumbers when you move things.',
      'A page: [2, p. 47]; a range: [2, pp. 45–61]. Several sources: [1], [3].',
      'You can use the number as a noun: “see [2] for the full data.”',
    ],
    list: 'Titled “References”. In number order, each entry starting with its [n]. Authors are initials then family name (A. M. Rivera); up to six are listed, seven or more become “et al.” Article titles in quotation marks with the comma inside; book and journal names in italics. Months are abbreviated (Jan., Feb., Sep.).',
    kinds: {
      book: '[n] A. Family and B. Family, <i>Title of Book</i>, xth ed. Publisher, Year.',
      journal: '[n] A. Family, “Title of the article,” <i>Journal Name</i>, vol. x, no. x, pp. xx–xx, Year, doi: 10.…',
      article: '[n] A. Family, “Title of the article,” <i>Magazine</i>, Mon. Day, Year. [Online]. Available: link',
      webpage: '[n] Author, “Title of the page,” Site Name, Mon. Day, Year. Accessed: Mon. Day, Year. [Online]. Available: link',
      social: '[n] A. Family [@handle], “Text of the post,” Platform, Mon. Day, Year. [Online]. Available: link',
    },
  },
};

/** The guide for one style as HTML (examples come from the real formatter). */
export function guideHtml(style) {
  const g = GUIDES[style] || GUIDES.apa;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const n = { s1: 1, s2: 2, s3: 3, s4: 4, s5: 5 };
  const ex = (e) => `${style === 'ieee' ? `[${n[e.id]}] ` : ''}${formatEntry(e, style)}`;
  const intext = [
    ['One or two authors', formatInText(SAMPLES.book, style, '112', 1)],
    ['Three or more, with a page', formatInText({ ...SAMPLES.journal, authors: [...SAMPLES.journal.authors, { family: 'Ito', given: 'K.' }, { family: 'Moss', given: 'P.' }] }, style, '47', 2)],
    ['A web page (no page number)', formatInText(SAMPLES.webpage, style, '', 4)],
  ];
  return `<p class="sg-use">${esc(g.use)}</p>
<h4>In the text</h4><ul class="sg-rules">${g.inText.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<div class="sg-examples sg-intext">${intext.map(([l, v]) => `<div class="sg-ex"><span class="sg-kind">${esc(l)}</span><span class="sg-out">${esc(v)}</span></div>`).join('')}</div>
<h4>The list of sources</h4><p class="sg-rule">${esc(g.list)}</p>
<h4>By kind of source</h4>
<div class="sg-examples">${KINDS.map(([k, label]) => `<div class="sg-ex"><span class="sg-kind">${esc(label)}</span><span class="sg-pattern">${g.kinds[k]}</span><span class="sg-out">${ex(SAMPLES[k])}</span></div>`).join('')}</div>`;
}
