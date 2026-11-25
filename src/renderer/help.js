// Help: a short guide to Lutefisk, and a guided tour that walks you through
// making a new book, pointing at each control in turn.
import { h, icon } from './ui.js';

const KEY = (k) => h('kbd', {}, k);

/* ------------------------------------------------------------- topics */
// Small building blocks so every topic reads the same way.
const lede = (text) => h('p', { class: 'help-lede' }, text);
const tip = (...kids) => h('div', { class: 'help-callout' }, icon('lightbulb', 15), h('div', {}, ...kids));
const card = (ic, title, ...kids) => h('div', { class: 'help-card' }, h('div', { class: 'help-card-head' }, h('span', { class: 'help-ic' }, icon(ic, 16)), h('b', {}, title)), h('div', { class: 'help-card-body' }, ...kids));
const cards = (...kids) => h('div', { class: 'help-cards' }, ...kids);
const steps = (...items) => h('ol', { class: 'help-steps' }, ...items.map(([t, ...rest]) => h('li', {}, h('b', {}, t), ' ', ...rest)));
const B = (t) => h('b', {}, t);

const TOPICS = [
  {
    id: 'start', icon: 'book', title: 'Get started', blurb: 'From a new book to a finished one.',
    body: () => [
      steps(
        ['Create a book.', 'In the Library, click ', B('New Book'), ', give it a title and choose ', B('Create Book'), '.'],
        ['Write.', 'It opens at Chapter One. Type — everything saves as you go.'],
        ['Add chapters.', 'The ', B('+'), ' beside Body in the binder, or ', KEY('⇧⌘N'), '. Drag to reorder.'],
        ['See it.', 'The preview shows your book on a real device, or as a printed book.'],
        ['Export.', B('Export'), ' at the top right: EPUB, PDF, Word and more.']),
    ],
    tour: true,
  },
  {
    id: 'window', icon: 'panelHide', title: 'The window', blurb: 'Binder, editor and preview.',
    body: () => [
      cards(
        card('binder', 'Binder', 'Your book’s parts, top to bottom: covers, front matter, chapters, back matter. Drag any of them to put it in a new place within its part; double-click any name to rename it. Click the cover for Book settings.'),
        card('pen', 'Editor', 'Where you write. The icons above it are Characters, Comments, Spelling, Grammar, Tools and Random Thoughts.'),
        card('device', 'Preview', 'Your book on a phone, tablet or e-reader — or in print. Change its design with the template button.'),
        card('columns', 'Panels', 'The panels button in the title bar puts them in any order. Each pane hides with the button at its top right.')),
    ],
  },
  {
    id: 'writing', icon: 'pen', title: 'Writing', blurb: 'Formatting, spelling, comments.',
    body: () => [
      cards(
        card('textStyle', 'Formatting', 'The toolbar above the text: styles, bold and italic, lists, links, pictures, tables and more.'),
        card('person', 'Right-click', 'Comments, index cards, Random Thoughts, footnotes, breaks, scenes and more — right where you are.'),
        card('spell', 'Spelling and grammar', 'Problems are underlined as you type. Right-click one for suggestions. ', KEY('F7'), ' checks now.'),
        card('search', 'Search', KEY('⌘F'), ' searches the whole book; ', KEY('⇧⌘H'), ' replaces.')),
    ],
  },
  {
    id: 'story', icon: 'people', title: 'Your story', blurb: 'Characters, thoughts, index cards, plot and research.',
    body: () => [
      cards(
        card('people', 'Characters', 'A card for everyone in your story. Their names get light green stripes in your text (“Mark names in editor” at the top of the Characters window) — point at one to open them.'),
        card('thought', 'Random Thoughts', 'Right-click in your text › ', B('Add Random Thought'), ' to jot one down — it can keep where you were and the text you’d highlighted. The thought bubble above the editor — or Random Thoughts in Research — shows them all to add, edit or delete.'),
        card('card', 'Index cards', 'Right-click in your text › ', B('Add Card'), ' to keep a passage with a note. Research › ', B('Index Cards'), ' lays them all out.'),
        card('plot', 'Plot and timeline', 'Plan the story on a board of cards, and see it in the order things happen.'),
        card('research', 'Research', 'Notes and files about the book. Never part of the book itself.')),
    ],
  },
  {
    id: 'finish', icon: 'audit', title: 'Finish and publish', blurb: 'Audit, goals, export, back up.',
    body: () => [
      cards(
        card('audit', 'Audit', 'Checks the book before it goes out: titles, author, covers, copyright, empty chapters, spelling. Green means all clear; red means something to fix.'),
        card('target', 'Goals', 'How long the book will be and by when, plus a daily goal. Turn them off in Settings if you’d rather not.'),
        card('export', 'Export', 'EPUB for e-book stores, PDF for print, Word for editors.'),
        card('download', 'Back up', B('Back Up'), ' in the title bar saves a copy of the whole book (', KEY('⇧⌘S'), ').')),
    ],
  },
  {
    id: 'settings', icon: 'gear', title: 'Settings', blurb: 'Make it yours.',
    body: () => [
      cards(
        card('gear', 'Settings', 'The gear at the top left: appearance, text size, contrast, spelling, saving and more.'),
        card('sun', 'Day, night or system', 'The sun button in the title bar steps through them.'),
        card('trash', 'Recycle Bin', 'Beside the gear. Anything you delete waits here until you restore it.')),
    ],
  },
  {
    id: 'keys', icon: 'keyboard', title: 'Shortcuts', blurb: 'The keys worth knowing.',
    body: () => [
      h('table', { class: 'help-keys' }, ...[
        ['New chapter / New scene', '⇧⌘N / ⌥⌘N'], ['Search / Replace', '⌘F / ⇧⌘H'], ['Bold / Italic', '⌘B / ⌘I'],
        ['Comment', '⌃⌥M'], ['Check spelling', 'F7'], ['Focus on writing', '⇧⌘F'], ['Back up', '⇧⌘S'], ['Help', 'F1'],
      ].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, KEY(b))))),
      h('p', { class: 'hint' }, 'On Windows and Linux, use Ctrl for ⌘ and Alt for ⌥.'),
    ],
  },
  {
    id: 'privacy', icon: 'lock', title: 'Privacy', blurb: 'Your words stay on your computer.',
    body: () => [
      lede('No accounts, no cloud, no tracking. Your books are ordinary folders on your computer, and nothing from them is ever sent anywhere.'),
    ],
  },
];

/* --------------------------------------------------------- help sheet */
export function openHelp(app, { topic = 'home' } = {}) {
  document.querySelector('.help-overlay')?.remove();
  const nav = h('nav', { class: 'help-nav', 'aria-label': 'Help topics' });
  const main = h('div', { class: 'help-main', tabindex: -1 });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const tourBtn = (big) => h('button', { class: `btn ${big ? 'primary' : ''}`, onclick: () => { close(); startTour(app); } }, icon('play', 14), 'Take the Guided Tour');
  const home = () => [
    h('div', { class: 'help-hero' },
      h('div', {}, h('h2', {}, 'Welcome to Lutefisk Book Editor'), h('p', {}, 'Write your book, see it on real devices and in print, and export it ready to publish — all on your own computer.')),
      tourBtn(true)),
    h('div', { class: 'help-grid' }, ...TOPICS.map((t) => h('button', { class: 'help-tile', onclick: () => show(t.id) },
      h('span', { class: 'help-ic' }, icon(t.icon, 18)), h('b', {}, t.title), h('small', {}, t.blurb)))),
  ];
  const show = (id) => {
    for (const b of nav.querySelectorAll('.help-tab')) b.classList.toggle('on', b.dataset.id === id);
    if (id === 'home') { main.replaceChildren(...home()); main.scrollTop = 0; return; }
    const i = TOPICS.findIndex((x) => x.id === id);
    const t = TOPICS[i] || TOPICS[0];
    const prev = TOPICS[i - 1], next = TOPICS[i + 1];
    main.replaceChildren(
      h('div', { class: 'help-title' }, h('span', { class: 'help-ic big' }, icon(t.icon, 20)), h('div', {}, h('h2', {}, t.title), h('small', {}, t.blurb))),
      ...t.body(),
      t.tour ? h('div', { class: 'help-tour-row' }, tourBtn(true), h('small', { class: 'hint' }, app.book ? 'Points at each control in this window, one step at a time.' : 'Starts in the Library, then continues when your book opens.')) : '',
      h('div', { class: 'help-pager' },
        prev ? h('button', { class: 'btn plain', onclick: () => show(prev.id) }, icon('arrowLeft', 14), prev.title) : h('span'),
        next ? h('button', { class: 'btn plain', onclick: () => show(next.id) }, next.title, icon('arrowRight', 14)) : h('span')));
    main.scrollTop = 0;
  };
  // Search: filters the topics by their words.
  const q = h('input', { type: 'search', class: 'help-search', placeholder: 'Search help', 'aria-label': 'Search help' });
  const words = new Map(TOPICS.map((t) => [t.id, `${t.title} ${t.blurb} ${h('div', {}, ...t.body()).textContent}`.toLowerCase()]));
  const tabs = [h('button', { class: 'help-tab', 'data-id': 'home', onclick: () => show('home') }, icon('home', 15), 'Overview'),
    ...TOPICS.map((t) => h('button', { class: 'help-tab', 'data-id': t.id, onclick: () => show(t.id) }, icon(t.icon, 15), t.title))];
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    for (const b of tabs) b.hidden = !!v && b.dataset.id !== 'home' && !v.split(/\s+/).every((w) => words.get(b.dataset.id)?.includes(w));
    const first = tabs.find((b) => !b.hidden && b.dataset.id !== 'home');
    if (v && first) show(first.dataset.id);
  });
  nav.append(q, ...tabs);
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const overlay = h('div', { class: 'overlay help-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet wide help-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lutefisk Book Editor Help' },
      h('header', { class: 'sheet-head' }, h('h2', {}, icon('help', 18), 'Help'), h('div', { class: 'sheet-actions' }, tourBtn(false), h('button', { class: 'btn primary small', onclick: close }, 'Done'))),
      h('div', { class: 'help-body' }, nav, main)));
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  show(TOPICS.some((t) => t.id === topic) ? topic : 'home');
}

/* ------------------------------------------------------- guided tour */
// Each step points at an element. Steps whose element isn't on screen are skipped.
const LIBRARY_STEPS = [
  { sel: '.lib-new', title: 'Start a new book', text: 'Click New Book, give it a title and your name, and choose Create. The tour carries on when your book opens.', wait: 'book' },
];
const BOOK_STEPS = [
  { sel: '.sb-book', title: 'Your book', text: 'Click the cover for Book settings. Goals, Insights, Research and Audit sit beside it.' },
  { sel: '.sidebar .sb-scroll', title: 'The binder', text: 'Every part of your book. Click to open, drag to reorder, right-click for more.' },
  { sel: '.ql-container', title: 'Write', text: 'Type here. Everything saves as you go.' },
  { sel: '.ed-tools', title: 'Story tools', text: 'Characters, comments, spelling, grammar, tools and Random Thoughts. Point at an icon for its name.' },
  { sel: '.pv-bar', title: 'Preview', text: 'Pick a device and a design; the book updates as you go.' },
  { sel: '.export-btn', title: 'Export', text: 'EPUB, PDF, Word and more — when you’re ready.' },
  { sel: '.tb-help', title: 'Help any time', text: 'Click ? or press F1.' },
];

let tourState = null;
export function startTour(app) {
  endTour();
  tourState = { app, steps: app.book ? BOOK_STEPS : LIBRARY_STEPS, i: 0 };
  try { localStorage.setItem('lutefisk.tourSeen', '1'); } catch { /* ignore */ }
  if (!app.book) tourState.continueInBook = true;
  drawStep();
}
/** Called when a book opens: a tour begun in the Library carries on. */
export function resumeTour(app) {
  if (!tourState?.continueInBook) return;
  tourState = { app, steps: BOOK_STEPS, i: 0 };
  setTimeout(drawStep, 600);
}
export function endTour() {
  document.querySelectorAll('.tour-ring, .tour-tip').forEach((e) => e.remove());
  window.removeEventListener('resize', drawStep);
  document.removeEventListener('keydown', tourKey, true);
}
function tourKey(e) {
  if (!tourState) return;
  if (e.key === 'Escape') { e.preventDefault(); tourState = null; endTour(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
}
function go(d) {
  if (!tourState) return;
  const { steps } = tourState;
  let i = tourState.i + d;
  while (i >= 0 && i < steps.length && !visible(steps[i].sel)) i += d;
  if (i < 0) i = tourState.i;
  if (i >= steps.length) { tourState = null; endTour(); return; }
  tourState.i = i;
  drawStep();
}
const visible = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
function drawStep() {
  document.querySelectorAll('.tour-ring, .tour-tip').forEach((e) => e.remove());
  if (!tourState) return;
  const { steps } = tourState;
  while (tourState.i < steps.length && !visible(steps[tourState.i].sel)) tourState.i++;
  const step = steps[tourState.i];
  if (!step) { tourState = null; endTour(); return; }
  const el = document.querySelector(step.sel);
  const r = el.getBoundingClientRect();
  const pad = 6;
  const ring = h('div', { class: 'tour-ring' });
  Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const n = steps.length;
  const last = tourState.i >= n - 1;
  const tip = h('div', { class: 'tour-tip', role: 'dialog', 'aria-label': step.title },
    h('div', { class: 'tour-count' }, n > 1 ? `${tourState.i + 1} of ${n}` : 'Guided tour'),
    h('b', {}, step.title), h('p', {}, step.text),
    h('div', { class: 'tour-acts' },
      h('button', { class: 'btn small plain', onclick: () => { tourState = null; endTour(); } }, step.wait ? 'Close' : 'End Tour'),
      h('span', { class: 'spacer' }),
      tourState.i > 0 ? h('button', { class: 'btn small', onclick: () => go(-1) }, 'Back') : null,
      step.wait ? null : h('button', { class: 'btn small primary', onclick: () => go(1) }, last ? 'Finish' : 'Next')));
  document.body.append(ring, tip);
  // Place the tip beside the element, inside the window.
  const t = tip.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  let left = r.right + 14, top = r.top;
  if (left + t.width > W - 8) left = r.left - t.width - 14;
  if (left < 8) { left = Math.min(W - t.width - 8, Math.max(8, r.left)); top = r.bottom + 14; if (top + t.height > H - 8) top = r.top - t.height - 14; }
  top = Math.min(H - t.height - 8, Math.max(8, top));
  Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  window.removeEventListener('resize', drawStep);
  window.addEventListener('resize', drawStep);
  document.removeEventListener('keydown', tourKey, true);
  document.addEventListener('keydown', tourKey, true);
  tip.querySelector('.btn.primary, .btn')?.focus();
}
