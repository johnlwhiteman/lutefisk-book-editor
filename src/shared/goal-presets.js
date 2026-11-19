// Daily-goal presets: write like a famous author. Each sets a daily target in
// words, writing time (minutes) and/or pages. Usually a day counts as met when
// every part that's set is met; a preset with `any` is met by any one part
// ("6 pages or 1,000 words"). Ranges (wordsMax, minutesMax) are shown in the
// label; the lower figure is the target. Figures and notes come from the
// authors' own accounts and well-known stories about them. Writers can add,
// change and delete presets — this list is only the starting set.

/** Words on a printed page of a typical bestselling novel (trade paperback/hardcover, ~250–300). */
export const WORDS_PER_PAGE = 280;

// Notes are written without colons, semicolons or em dashes, in plain sentences.
// `habits` are personal goals that come with an author (added when you use them).
export const GOAL_PRESETS = [
  {
    id: 'king', name: 'Stephen King', pages: 6, words: 1000, wordsMax: 2000, any: true, habits: ['Take a long walk'],
    note: 'Writes every morning and stops when he reaches his number. Afternoons are for naps, letters and reading. He takes a long walk most days, the habit that put him in the path of a van in 1999. In On Writing he admits that saying he takes holidays off was a fib. He writes every day of the year.',
  },
  {
    id: 'rowling', name: 'J.K. Rowling', minutes: 360, minutesMax: 480,
    note: 'Drafted early Harry Potter chapters in Edinburgh cafés while her baby daughter slept. She jotted the names of the Hogwarts houses on an airplane sick bag. To finish the last book she checked into a hotel, and when she was done she signed a marble bust in her room.',
  },
  {
    id: 'woolf', name: 'Virginia Woolf', minutes: 150, habits: ['Walk in the afternoon'],
    note: 'Wrote in the morning, for years standing at a tall desk so she would be level with her sister Vanessa, who painted standing up. Afternoons were for long walks over the Sussex Downs, where she made up sentences as she went.',
  },
  {
    id: 'parker', name: 'Dorothy Parker', words: 5,
    note: 'She once said she could not write five words without changing seven. Five words a day is all this goal asks, and the rewriting is up to you. She suggested Excuse my dust for her own tombstone.',
  },
  {
    id: 'child', name: 'Lee Child', words: 2000,
    note: 'Starts every Jack Reacher novel on September 1, the date he began the first one after losing his TV job. He works without an outline and writes to find out what happens, fueled by famously endless cups of coffee.',
  },
  {
    id: 'twain', name: 'Mark Twain', words: 1500,
    note: 'Spent summers writing in an eight-sided study on a hill at Quarry Farm and reported 1,400 to 3,000 words a day. He skipped lunch, and when the family needed him for supper they blew a horn to call him down.',
  },
];

const n = (v) => Math.round(v).toLocaleString('en-US');
const hours = (m) => (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/** A short label for a goal: "2,000 words", "6 pages or 1,000–2,000 words", "6–8 h". */
export function describeGoal({ words = 0, wordsMax = 0, minutes = 0, minutesMax = 0, pages = 0, any = false } = {}) {
  const parts = [];
  if (pages > 0) parts.push(`${pages} ${pages === 1 ? 'page' : 'pages'}`);
  if (words > 0) parts.push(`${n(words)}${wordsMax > words ? `–${n(wordsMax)}` : ''} ${words === 1 && !(wordsMax > words) ? 'word' : 'words'}`);
  if (minutes > 0) {
    if (minutesMax > minutes && !(minutes % 60) && !(minutesMax % 60)) parts.push(`${minutes / 60}–${minutesMax / 60} h`);
    else parts.push(minutesMax > minutes ? `${hours(minutes)}–${hours(minutesMax)}` : hours(minutes));
  }
  return parts.join(any ? ' or ' : ' + ');
}

/** Clean a preset typed by the writer (or read from settings). */
export function cleanPreset(p, i = 0) {
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const out = {
    id: String(p?.id || `custom-${Date.now().toString(36)}-${i}`).replace(/[^\w-]/g, '').slice(0, 40) || `custom-${i}`,
    name: String(p?.name || '').trim().slice(0, 80) || 'Untitled',
    words: num(p?.words, 100000), wordsMax: num(p?.wordsMax, 100000),
    minutes: num(p?.minutes, 1440), minutesMax: num(p?.minutesMax, 1440),
    pages: num(p?.pages, 1000),
    any: !!p?.any,
    note: String(p?.note || '').trim().slice(0, 1000),
    habits: (Array.isArray(p?.habits) ? p.habits : []).map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 10),
  };
  if (out.wordsMax <= out.words) out.wordsMax = 0;
  if (out.minutesMax <= out.minutes) out.minutesMax = 0;
  return out;
}

/**
 * How far a day got toward a goal. day: { words, minutes }. goal: { words,
 * minutes, pages, any }. Returns { pct (0–1), met, parts }: with `any`, the
 * most-complete part counts; otherwise the least-complete one.
 */
export function goalProgress(day, goal, wordsPerPage = WORDS_PER_PAGE) {
  const parts = [];
  const words = Math.max(0, day.words || 0);
  if (goal.words > 0) parts.push({ kind: 'words', cur: words, target: goal.words });
  if (goal.pages > 0) parts.push({ kind: 'pages', cur: words / (wordsPerPage || WORDS_PER_PAGE), target: goal.pages });
  if (goal.minutes > 0) parts.push({ kind: 'minutes', cur: Math.max(0, day.minutes || 0), target: goal.minutes });
  if (!parts.length) return { pct: 0, met: false, parts };
  const each = parts.map((p) => Math.min(1, p.cur / p.target));
  const pct = goal.any ? Math.max(...each) : Math.min(...each);
  return { pct, met: goal.any ? parts.some((p) => p.cur >= p.target) : parts.every((p) => p.cur >= p.target), parts };
}

/**
 * The time left to a deadline (end of that day, local time) and what's left
 * to write. Returns null without a deadline.
 */
export function countdown({ deadline, targetWords = 0, wordsPerPage = WORDS_PER_PAGE }, words, now = Date.now()) {
  if (!deadline) return null;
  const end = new Date(`${deadline}T23:59:59`).getTime();
  const ms = Math.max(0, end - now);
  const wordsLeft = Math.max(0, (targetWords || 0) - (words || 0));
  const days = ms / 86400000;
  return {
    ms, days: Math.floor(days), hours: Math.floor((ms % 86400000) / 3600000), minutes: Math.floor((ms % 3600000) / 60000), seconds: Math.floor((ms % 60000) / 1000),
    wordsLeft, pagesLeft: Math.ceil(wordsLeft / (wordsPerPage || WORDS_PER_PAGE)),
    perDay: wordsLeft ? Math.ceil(wordsLeft / Math.max(1, Math.ceil(days))) : 0,
    over: ms === 0,
  };
}

/**
 * Goals are an amount (words or pages) and/or hours, for the book and for each
 * day. Older books had "either one is enough" daily goals and both words and
 * pages: keep the amount the writer set (words first) and drop the rest.
 */
export function migrateGoals(g) {
  let changed = false;
  if (!g.targetUnit) { g.targetUnit = !g.targetWords && g.targetPages ? 'pages' : 'words'; changed = true; }
  if (!g.dailyUnit) { g.dailyUnit = !g.dailyWords && g.dailyPages ? 'pages' : 'words'; changed = true; }
  if (g.dailyAny) {
    // "2,000 words or 6 hours" was the old default: the amount alone is the closest goal now.
    if ((g.dailyWords || g.dailyPages) && g.dailyMinutes) delete g.dailyMinutes;
    delete g.dailyAny; changed = true;
  }
  // Words and pages are both kept, so switching between them never loses either amount.
  if ('resetSeen' in g) { delete g.resetSeen; changed = true; }
  return changed;
}

/**
 * Personal Daily Goals for one day: the tracked goal (words or pages, and/or
 * hours, counted for you) plus your own goals, ticked off by hand. Each part
 * counts the same. habits: [{ id, name }]. done: ids ticked off that day.
 * Returns { pct (0–1), items: [{ id, name, pct, done, auto }], done, total }.
 */
export function personalProgress(day, goal, habits = [], done = [], wordsPerPage = WORDS_PER_PAGE) {
  const items = [];
  const tracked = goalProgress(day, goal, wordsPerPage);
  for (const p of tracked.parts) {
    const pct = Math.min(1, p.cur / p.target);
    const name = p.kind === 'minutes' ? `${Math.round((p.target / 60) * 10) / 10} h of writing` : `${n(p.target)} ${p.kind}`;
    items.push({ id: `auto-${p.kind}`, name, pct, done: pct >= 1, auto: true, cur: p.cur, target: p.target, kind: p.kind });
  }
  const set = new Set(done);
  for (const hb of habits) items.push({ id: hb.id, name: hb.name, when: hb.when || '', pct: set.has(hb.id) ? 1 : 0, done: set.has(hb.id), auto: false });
  const total = items.length;
  return { pct: total ? items.reduce((a, it) => a + it.pct, 0) / total : 0, items, done: items.filter((it) => it.done).length, total };
}

/** Clean the writer's own daily goals: [{ id, name, when: '' | 'before' | 'during' | 'after' }]. */
export function cleanHabits(list) {
  return (Array.isArray(list) ? list : []).map((x, i) => ({
    id: String(x?.id || `hb-${Date.now().toString(36)}${i}`).replace(/[^\w-]/g, '').slice(0, 40) || `hb-${i}`,
    name: String(x?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    when: ['before', 'during', 'after'].includes(x?.when) ? x.when : '',
  })).filter((x) => x.name).slice(0, 30);
}
