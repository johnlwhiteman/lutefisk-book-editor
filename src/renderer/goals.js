// Writing goals and history. Tracks net words written and active writing time,
// logs them per book on this computer only, and shows progress toward the
// book's goals and the daily goals.
import { h, icon, toast, segmented, popover, confirmDialog, dialog, closePopovers } from './ui.js';
import { proseText } from '../shared/scenes.js';
import { GOAL_PRESETS, describeGoal, goalProgress, countdown, cleanPreset, migrateGoals, WORDS_PER_PAGE, personalProgress, cleanHabits } from '../shared/goal-presets.js';
import { settings, updateSettings, onSettings } from './settings.js';
import { writingHistory } from './history.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const n0 = (n) => Math.round(n).toLocaleString();
const B = () => window.lutefisk;

const isoDay = (t) => dayKey(t);
/** The writer's author presets (Settings), or the starting set. */
export const authorPresets = () => (Array.isArray(settings.goalAuthors) ? settings.goalAuthors : GOAL_PRESETS);
/** Words per printed page for this book (adjustable; ~280 for a typical bestselling novel). */
export const wordsPerPage = (book) => Number(book?.goals?.wordsPerPage) || WORDS_PER_PAGE;

/**
 * Give a book its default goals the first time it's opened: a typical novel
 * of 80,000 words (about 290 pages), from the day the book was started to a
 * year later. Writers change any of it; "goalsSet" marks it as done.
 */
export function ensureGoalDefaults(book, startedAt) {
  const g = (book.goals ||= {});
  let changed = migrateGoals(g);
  // Daily Goals start at 2,000 words a day.
  if (!g.dailySet) {
    if (!g.dailyWords && !g.dailyMinutes && !g.dailyPages) { g.dailyWords = 2000; g.dailyUnit = 'words'; }
    g.dailySet = true; changed = true;
  }
  if (g.goalsSet) return changed;
  const start = startedAt ? new Date(startedAt) : new Date();
  if (!g.startDate) g.startDate = isoDay(start);
  if (g.targetWords == null && g.targetPages == null) g.targetWords = 80000;
  if (!g.wordsPerPage) g.wordsPerPage = WORDS_PER_PAGE;
  if (!g.deadline) { const d = new Date(`${g.startDate}T12:00`); d.setFullYear(d.getFullYear() + 1); g.deadline = isoDay(d); }
  g.goalsSet = true;
  return true;
}

export function createGoals(app) {
  let history = { book: [], all: [] };
  let lastTotal = null;
  let pending = { d: 0, s: 0, sw: 0 };
  let lastActivity = 0;
  let lastFlush = Date.now();
  let onUpdate = () => {};

  /* ---- writing session: a clock of active writing time and net words.
     The clock runs while you write and stops after 90 s without an edit. */
  const IDLE = 90000;
  let sess = null;
  const sessKey = () => `lutefisk.sessions.${app.book?.uuid || 'none'}`;
  function sessionLog() { try { return JSON.parse(localStorage.getItem(sessKey()) || '[]'); } catch { return []; } }
  function archiveSession() {
    if (!sess || !app.book) return;
    const s = session();
    if (s.activeMs < 30000 && !s.words) return;
    const log = [{ start: new Date(s.start).toISOString(), end: new Date().toISOString(), ms: Math.round(s.activeMs), words: s.words }, ...sessionLog()].slice(0, 30);
    try { localStorage.setItem(sessKey(), JSON.stringify(log)); } catch { /* ignore */ }
  }
  function startSession() { sess = { start: Date.now(), active: 0, last: 0, paused: false, startWords: lastTotal ?? bookWords() }; }
  function session() {
    if (!sess) startSession();
    const now = Date.now();
    const live = sess.last && !sess.paused ? Math.min(now - sess.last, IDLE) : 0;
    return { start: sess.start, activeMs: sess.active + live, elapsedMs: now - sess.start, words: (lastTotal ?? sess.startWords) - sess.startWords, paused: sess.paused, writing: !!live && now - sess.last < IDLE };
  }
  function pauseSession(on) {
    if (!sess) return;
    if (on && !sess.paused) { sess.active = session().activeMs; sess.last = 0; sess.paused = true; } else if (!on) sess.paused = false;
    onUpdate();
  }
  function newSession() { archiveSession(); startSession(); onUpdate(); }

  /* ---- stopwatch: started and stopped by hand. Its time is logged per day.
     State is kept per book on this computer so it survives a restart (stopped). */
  const swKey = () => `lutefisk.stopwatch.${app.book?.uuid || 'none'}`;
  // The stopwatch keeps each book's time for the day: open a book and it carries on from that
  // book's time today (from zero on a new day). It starts by itself when the book opens.
  let sw = { acc: 0, since: 0, day: dayKey(Date.now()) };
  function swLoad() {
    const today = dayKey(Date.now());
    try {
      const v = JSON.parse(localStorage.getItem(swKey()) || 'null');
      sw = { acc: v?.day === today ? Number(v?.acc) || 0 : 0, since: 0, day: today };
    } catch { sw = { acc: 0, since: 0, day: today }; }
  }
  const swSave = () => { try { localStorage.setItem(swKey(), JSON.stringify({ acc: Math.round(stopwatch().ms), day: sw.day })); } catch { /* ignore */ } };
  function swTick() {
    // Move running time into the day's log so a long run is split across midnight correctly.
    if (!sw.since) return;
    const now = Date.now();
    const add = (now - sw.since) / 1000;
    sw.acc += now - sw.since; sw.since = now;
    pending.sw += add;
  }
  function stopwatch() { return { ms: sw.acc + (sw.since ? Date.now() - sw.since : 0), running: !!sw.since }; }
  function stopwatchStart() { if (!sw.since) { sw.since = Date.now(); onUpdate(); } }
  function stopwatchStop() { if (sw.since) { swTick(); sw.since = 0; swSave(); flush(); onUpdate(); } }
  function stopwatchReset() { if (sw.since) swTick(); sw = { acc: 0, since: sw.since ? Date.now() : 0, day: dayKey(Date.now()) }; swSave(); flush(); onUpdate(); }
  setInterval(() => {
    if (!sw.since) return;
    swTick(); swSave();
    // A new day: yesterday's time is logged; today starts from zero and keeps running.
    const today = dayKey(Date.now());
    if (sw.day !== today) { flush(); sw = { acc: 0, since: Date.now(), day: today }; swSave(); onUpdate(); }
    if (Date.now() - lastFlush > 60000) flush();
  }, 15000);

  // Prose words only (no markup, code, maths or tables), cached per section text —
  // the same measure as the book bar, so "today" and "this session" agree.
  const proseCache = new Map();
  function proseWords(id, md) {
    const src = String(md || '');
    const hit = proseCache.get(id);
    if (hit?.src === src) return hit.n;
    const n = (proseText(src).match(/[\p{L}\p{N}’']+/gu) || []).length;
    proseCache.set(id, { src, n });
    return n;
  }

  /** Words in the manuscript (enabled, non-generated sections; research excluded). */
  function bookWords() {
    let n = 0;
    for (const s of app.book.sections) {
      if (s.enabled === false || ['title-page', 'toc', 'endnotes', 'bibliography', 'index'].includes(s.type)) continue;
      n += proseWords(s.id, app.contents[s.id]);
    }
    return n;
  }

  async function load() {
    try { history = await B().getHistory({ days: 400 }); } catch { history = { book: [], all: [] }; }
    // (The book you came from was stopped and saved when you left it.)
    swLoad();
    sw.since = Date.now(); // starts by itself when the book opens
    lastTotal = bookWords();
    pending = { d: 0, s: 0, sw: 0 };
    lastFlush = Date.now();
    startSession();
    onUpdate();
  }

  /** Called on every edit: counts active writing time (gaps over 90 s are breaks). */
  function activity() {
    const now = Date.now();
    if (lastActivity && now - lastActivity < 90000) pending.s += (now - lastActivity) / 1000;
    lastActivity = now;
    if (sess && !sess.paused) {
      if (sess.last) sess.active += Math.min(now - sess.last, IDLE);
      sess.last = now;
    }
  }

  /** Called after each save: accumulates the net word change. */
  function measured(force = false) {
    if (!app.book || lastTotal == null) return;
    const total = bookWords();
    pending.d += total - lastTotal;
    lastTotal = total;
    onUpdate();
    if (force || Date.now() - lastFlush > 60000) flush();
  }

  async function flush() {
    if (sw.since) swTick();
    if (!app.book || (!pending.d && pending.s < 1 && pending.sw < 1)) return;
    const ev = { t: new Date().toISOString(), d: pending.d, w: lastTotal, s: Math.round(pending.s), sw: Math.round(pending.sw) };
    pending = { d: 0, s: 0, sw: 0 };
    lastFlush = Date.now();
    history.book.push(ev);
    history.all.push({ ...ev, b: app.book.uuid, n: app.book.title });
    try { await B().logHistory({ bookId: app.book.uuid, title: app.book.title, events: [ev] }); } catch { /* best effort */ }
  }

  function events(scope) {
    const base = scope === 'all' ? history.all : history.book;
    if (sw.since) swTick();
    return pending.d || pending.s || pending.sw ? [...base, { t: new Date().toISOString(), d: pending.d, w: lastTotal, s: pending.s, sw: pending.sw, b: app.book?.uuid }] : base;
  }

  /** Aggregate by day → Map(dayKey → {words, secs, sw, total, added, removed}).
      Deletions count against the day; `total` is the manuscript size at the day's last save. */
  function byDay(scope) {
    const m = new Map();
    for (const e of events(scope)) {
      const k = dayKey(e.t);
      const v = m.get(k) || { words: 0, secs: 0, sw: 0, total: null, added: 0, removed: 0 };
      v.words += e.d || 0; v.secs += e.s || 0; v.sw += e.sw || 0;
      if (e.d > 0) v.added += e.d; else if (e.d < 0) v.removed -= e.d;
      if (scope !== 'all' && e.w != null) v.total = e.w;
      m.set(k, v);
    }
    return m;
  }

  function today(scope) { return Math.max(0, byDay(scope).get(dayKey(Date.now()))?.words || 0); }

  /** Today's goal as words (pages are turned into words), for charts. */
  function dailyTarget() {
    const g = app.book.goals || {};
    return g.dailyUnit === 'pages' ? Math.round((Number(g.dailyPages) || 0) * wordsPerPage(app.book)) : Number(g.dailyWords) || 0;
  }

  /** Words per day needed to hit the manuscript goal by the deadline. */
  function deadlinePace() {
    const g = app.book.goals || {};
    if (!g.deadline || !(g.targetWords > 0)) return 0;
    const days = Math.ceil((Date.parse(`${g.deadline}T23:59:59`) - Date.now()) / DAY);
    const left = g.targetWords - (lastTotal ?? bookWords());
    if (left <= 0) return 0;
    return days > 0 ? Math.ceil(left / days) : left;
  }

  /** Today's goal: words or pages, and/or writing minutes. Every part that's set must be met. */
  function dailyGoal() {
    const g = app.book.goals || {};
    const pages = g.dailyUnit === 'pages';
    return { words: pages ? 0 : Number(g.dailyWords) || 0, pages: pages ? Number(g.dailyPages) || 0 : 0, minutes: Number(g.dailyMinutes) || 0, any: false };
  }
  /** All writing time on this book (typing, or the stopwatch when it ran longer), in minutes. */
  function totalMinutes() {
    let secs = 0;
    for (const v of byDay('book').values()) secs += Math.max(v.secs || 0, v.sw || 0);
    return secs / 60;
  }
  const hasGoal = (goal) => goal.words > 0 || goal.minutes > 0 || goal.pages > 0;
  /** A day's numbers for goals: net words, and writing minutes (typing time, or the stopwatch if more). */
  const dayStats = (v) => ({ words: v?.words || 0, minutes: Math.max(v?.secs || 0, v?.sw || 0) / 60 });
  /** Progress on a day (default today) toward the whole daily goal. */
  function progress(scope, key = dayKey(Date.now())) {
    const goal = dailyGoal(scope);
    return { goal, has: hasGoal(goal), ...goalProgress(dayStats(byDay(scope).get(key)), goal, wordsPerPage(app.book)) };
  }

  function streak(scope) {
    const m = byDay(scope);
    const goal = dailyGoal(scope);
    const hit = (k) => (hasGoal(goal) ? goalProgress(dayStats(m.get(k)), goal, wordsPerPage(app.book)).met : (m.get(k)?.words || 0) >= 1);
    let s = 0;
    let d = Date.now();
    if (!hit(dayKey(d))) d -= DAY; // today still in progress
    while (hit(dayKey(d))) { s++; d -= DAY; }
    return s;
  }

  /* ---- Personal Daily Goals: your own goals, ticked off by hand each day (kept with the book). */
  const habits = () => cleanHabits(app.book?.goals?.habits);
  function habitsDone(key = dayKey(Date.now())) { return (app.book?.goals?.habitLog?.[key] || []).filter((id) => habits().some((x) => x.id === id)); }
  function setHabitDone(id, on, key = dayKey(Date.now())) {
    const g = (app.book.goals ||= {});
    const log = (g.habitLog ||= {});
    const set = new Set(log[key] || []);
    if (on) set.add(id); else set.delete(id);
    if (set.size) log[key] = [...set]; else delete log[key];
    // Keep about a year of check-offs.
    const keys = Object.keys(log).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete log[k];
    app.markDirty();
    onUpdate();
  }
  /** Today's Personal Daily Goals: the tracked goal plus your own, as one percentage. */
  function personal(key = dayKey(Date.now())) {
    return personalProgress(dayStats(byDay('book').get(key)), dailyGoal('book'), habits(), habitsDone(key), wordsPerPage(app.book));
  }
  /** The book: how far along toward its goal (words or pages, else hours), 0–1, or null without one. */
  function bookPct() {
    const g = app.book?.goals || {};
    const words = lastTotal ?? bookWords();
    if (g.targetUnit === 'pages' ? g.targetPages : g.targetWords) {
      return g.targetUnit === 'pages' ? Math.min(1, words / wordsPerPage(app.book) / g.targetPages) : Math.min(1, words / g.targetWords);
    }
    if (g.targetHours) return Math.min(1, totalMinutes() / (g.targetHours * 60));
    return null;
  }

  /** Reset the writing history (and session log and stopwatch) of this book. */
  async function resetHistory() {
    pending = { d: 0, s: 0, sw: 0 };
    await B().resetHistory({ scope: 'book', bookId: app.book?.uuid });
    try { localStorage.removeItem(sessKey()); localStorage.removeItem(swKey()); } catch { /* ignore */ }
    sw = { acc: 0, since: 0 };
    startSession();
    try { history = await B().getHistory({ days: 400 }); } catch { history = { book: [], all: [] }; }
    lastTotal = bookWords();
    onUpdate();
  }

  return {
    resetHistory,
    session, pauseSession, newSession, sessionLog, archiveSession,
    stopwatch, stopwatchStart, stopwatchStop, stopwatchReset,
    load, activity, measured, flush, today, dailyMinutes: () => Number(app.book?.goals?.dailyMinutes) || 0, dailyTarget, dailyGoal, progress, dayStats, streak, byDay, events, bookWords, deadlinePace, totalMinutes,
    habits, habitsDone, setHabitDone, personal, bookPct,
    wordsPerPage: () => wordsPerPage(app.book),
    set onUpdate(fn) { onUpdate = fn; },
  };
}

/* ------------------------------------------------------------- status bar */

export function goalMeter(app, goals, open) {
  const ring = h('span', { class: 'gm-ring' });
  const txt = h('span', { class: 'gm-text' });
  const el = h('button', { class: 'goal-meter', title: 'Writing goals', onclick: open }, ring, txt);
  const draw = () => {
    if (!app.book) return;
    const t = goals.today('book');
    const pr = goals.progress('book');
    const onlyWords = pr.goal.words > 0 && !pr.goal.minutes && !pr.goal.pages;
    ring.style.setProperty('--p', String(pr.has ? pr.pct : 0));
    ring.classList.toggle('done', pr.has && pr.met);
    txt.textContent = onlyWords ? `${n0(t)} / ${n0(pr.goal.words)} today` : pr.has ? `${Math.floor(pr.pct * 100)}% of today’s goal` : `${n0(t)} today`;
    el.title = pr.has ? `Writing goals — today: ${pr.parts.map((p) => `${p.kind === 'minutes' ? dur(p.cur * 60000) : n0(p.cur)} of ${p.kind === 'minutes' ? dur(p.target * 60000) : n0(p.target)} ${p.kind === 'minutes' ? '' : p.kind}`.trim()).join(', ')}` : 'Writing goals';
  };
  return { el, draw };
}

/* ------------------------------------------------------------------ panel */

const GOAL_KEYS = ['targetWords', 'targetPages', 'targetHours', 'deadline', 'bookNote', 'dailyWords', 'dailyMinutes', 'dailyPages', 'dailyPreset', 'dailyNote', 'habits', 'habitLog'];

/**
 * The Goals window: Book Goals and Daily Goals (each an amount in words or
 * pages, and/or hours, with your own notes), Write like…, and your writing
 * history. Turn Goals Off and Reset are at the top right; Esc closes it.
 */
export function openGoals(app, goals, sheet) {
  app.book.goals ||= {};
  const g = app.book.goals;
  migrateGoals(g);
  const body = h('div', { class: 'goals' });
  const save = () => { app.markDirty(); drawClock(); history.draw(); goals.measured(); };
  const wpp = () => wordsPerPage(app.book);

  const num = (val, onInput, attrs = {}) => {
    const el = h('input', { type: 'number', min: 0, step: attrs.step || 100, placeholder: attrs.placeholder || '', 'aria-label': attrs.label || '' });
    el.value = val || '';
    el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
    return el;
  };
  const noteBox = (key, placeholder) => {
    const t = h('textarea', { class: 'goal-note', rows: 2, placeholder, 'aria-label': 'Notes about this goal' });
    t.value = g[key] || '';
    t.addEventListener('input', () => { if (t.value.trim()) g[key] = t.value.slice(0, 2000); else delete g[key]; app.markDirty(); });
    return t;
  };
  const unitSeg = (unitKey, onChange) => segmented([{ value: 'words', label: 'Words' }, { value: 'pages', label: 'Pages' }], g[unitKey] === 'pages' ? 'pages' : 'words', (v) => { g[unitKey] = v; onChange(v); }, { label: 'Words or pages' });

  /* ---- Book Goals: words or pages, and/or total hours; start, deadline, countdown */
  const bookAmt = () => (g.targetUnit === 'pages' ? g.targetPages : g.targetWords);
  const fBook = num(bookAmt(), (v) => {
    if (g.targetUnit === 'pages') { g.targetPages = v; g.targetWords = v ? Math.round(v * wpp()) : 0; } else { g.targetWords = v; g.targetPages = v ? Math.round(v / wpp()) : 0; }
    save();
  }, { step: 1000, placeholder: 'e.g. 80000', label: 'Book goal amount' });
  const bookUnit = unitSeg('targetUnit', (v) => {
    fBook.step = v === 'pages' ? 10 : 1000; fBook.placeholder = v === 'pages' ? 'e.g. 290' : 'e.g. 80000';
    if (v === 'pages' && g.targetWords && !g.targetPages) g.targetPages = Math.round(g.targetWords / wpp());
    if (v === 'words' && g.targetPages && !g.targetWords) g.targetWords = Math.round(g.targetPages * wpp());
    fBook.value = bookAmt() || ''; save();
  });
  if (g.targetUnit === 'pages') { fBook.step = 10; fBook.placeholder = 'e.g. 290'; }
  const fBookHours = num(g.targetHours, (v) => { if (v) g.targetHours = v; else delete g.targetHours; save(); }, { step: 10, placeholder: 'optional', label: 'Book goal hours' });
  const fWpp = num(wpp(), (v) => {
    g.wordsPerPage = v > 0 ? Math.round(v) : WORDS_PER_PAGE;
    if (g.targetUnit === 'pages' && g.targetPages) g.targetWords = Math.round(g.targetPages * wpp()); else if (g.targetWords) g.targetPages = Math.round(g.targetWords / wpp());
    save();
  }, { step: 5, label: 'Words per page' });
  const start = h('input', { type: 'date', 'aria-label': 'Started' });
  start.value = g.startDate || '';
  start.addEventListener('input', () => { g.startDate = start.value; save(); });
  const date = h('input', { type: 'date', 'aria-label': 'Deadline' });
  date.value = g.deadline || '';
  date.addEventListener('input', () => { g.deadline = date.value; save(); });

  const clock = h('div', { class: 'gc-clock', 'aria-live': 'off' });
  const bars = h('div', { class: 'gc-bars' });
  const drawClock = () => {
    const words = goals.bookWords();
    const c = countdown({ deadline: g.deadline, targetWords: 0 }, words);
    if (!c) clock.replaceChildren(h('span', { class: 'gc-none' }, 'Set a deadline to start the countdown'));
    else {
      const unit = (v, l) => h('span', { class: 'gc-unit' }, h('b', {}, String(v).padStart(l === 'days' ? 1 : 2, '0')), h('small', {}, l));
      clock.replaceChildren(unit(c.days, 'days'), unit(c.hours, 'hours'), unit(c.minutes, 'min'), unit(c.seconds, 'sec'));
      clock.classList.toggle('over', c.over);
    }
    const daysLeft = c ? Math.max(1, Math.ceil(c.ms / DAY)) : 0;
    const bar = (label, cur, target, fmt, perDay) => {
      const pct = target ? Math.min(100, (cur / target) * 100) : 0;
      const left = Math.max(0, target - cur);
      return h('div', { class: 'gc-bar' },
        h('div', { class: 'gc-bar-top' }, h('b', {}, label), h('span', {}, `${fmt(cur)} of ${fmt(target)} · ${Math.floor(pct)}%`)),
        h('div', { class: 'gbar' }, h('i', { style: { width: `${pct}%` } })),
        h('small', { class: 'hint' }, left ? `${fmt(left)} to go${c && !c.over && perDay ? ` · about ${perDay(left / daysLeft)} a day to finish on time` : ''}` : h('span', { class: 'gc-done' }, icon('check', 12), 'Goal reached')));
    };
    const hrs = (m) => `${Math.round((m / 60) * 10) / 10} h`;
    const parts = [];
    if (g.targetUnit === 'pages' ? g.targetPages : g.targetWords) {
      parts.push(g.targetUnit === 'pages'
        ? bar('Pages', words / wpp(), g.targetPages, (v) => `${n0(v)} ${Math.round(v) === 1 ? 'page' : 'pages'}`, (v) => `${Math.ceil(v)} ${Math.ceil(v) === 1 ? 'page' : 'pages'}`)
        : bar('Words', words, g.targetWords, (v) => `${n0(v)} words`, (v) => `${n0(Math.ceil(v))} words`));
    }
    if (g.targetHours) parts.push(bar('Time', goals.totalMinutes(), g.targetHours * 60, hrs, (v) => `${Math.max(1, Math.round(v))} min`));
    if (c?.over && parts.length) parts.push(h('span', { class: 'gc-late' }, 'Deadline passed'));
    bars.replaceChildren(...(parts.length ? parts : [h('p', { class: 'hint' }, 'Set an amount, hours or both to track your progress.')]));
  };
  const tick = setInterval(() => { if (!body.isConnected) { clearInterval(tick); return; } drawClock(); if (todayEl.isConnected) drawToday(); }, 1000);
  const bookGoal = h('section', { class: 'goal-card goal-book' },
    h('div', { class: 'goal-card-head' }, icon('target', 16), h('h3', {}, 'Book Goals'),
      h('small', { class: 'hint' }, 'Words or pages, hours, or both — and by when.')),
    h('div', { class: 'goal-row' },
      h('label', { class: 'fld goal-amt' }, h('span', {}, 'Amount'), h('div', { class: 'goal-amt-in' }, fBook, bookUnit)),
      h('label', { class: 'fld' }, h('span', {}, 'Total hours'), fBookHours),
      h('label', { class: 'fld' }, h('span', {}, 'Started'), start),
      h('label', { class: 'fld' }, h('span', {}, 'Deadline'), date)),
    h('div', { class: 'goal-countdown' }, clock, bars),
    noteBox('bookNote', 'Notes about this goal — why it matters, what “done” means, a reward when you get there…'),
    h('small', { class: 'hint goal-wpp-note' }, 'A printed page is about ', fWpp, ' words (a typical novel runs 250–300).'));

  /* ---- Daily Goals: words or pages, and/or hours */
  const custom = () => { if (g.dailyPreset) { delete g.dailyPreset; drawAuthors(); } };
  const dayAmt = () => (g.dailyUnit === 'pages' ? g.dailyPages : g.dailyWords);
  const fDaily = num(dayAmt(), (v) => {
    if (g.dailyUnit === 'pages') g.dailyPages = v; else g.dailyWords = v;
    custom(); save();
  }, { step: g.dailyUnit === 'pages' ? 1 : 50, placeholder: g.dailyUnit === 'pages' ? 'e.g. 5' : 'e.g. 1000', label: 'Daily amount' });
  const dayUnit = unitSeg('dailyUnit', (v) => {
    fDaily.step = v === 'pages' ? 1 : 50; fDaily.placeholder = v === 'pages' ? 'e.g. 5' : 'e.g. 1000';
    // Each unit keeps its own amount: switching back shows exactly what you had.
    if (v === 'pages' && !g.dailyPages && g.dailyWords) g.dailyPages = Math.max(1, Math.round(g.dailyWords / wpp()));
    if (v === 'words' && !g.dailyWords && g.dailyPages) g.dailyWords = Math.round(g.dailyPages * wpp());
    fDaily.value = dayAmt() || ''; custom(); save();
  });
  const fHours = num(g.dailyMinutes ? g.dailyMinutes / 60 : 0, (v) => { g.dailyMinutes = Math.round(v * 60); custom(); save(); }, { step: 0.5, placeholder: 'optional', label: 'Daily hours' });
  const fillDaily = () => { dayUnit.setValue(g.dailyUnit === 'pages' ? 'pages' : 'words'); fDaily.value = dayAmt() || ''; fHours.value = g.dailyMinutes ? String(g.dailyMinutes / 60) : ''; };

  /* ---- write like…: authors' habits, editable (kept in Settings) */
  const authorsEl = h('div', { class: 'ga-list' });
  const saveAuthors = (list) => updateSettings({ goalAuthors: list.map((a, i) => cleanPreset(a, i)) });
  const useAuthor = (p) => {
    g.dailyPreset = p.id;
    if (p.words) { g.dailyUnit = 'words'; g.dailyWords = p.words; } else if (p.pages) { g.dailyUnit = 'pages'; g.dailyPages = p.pages; } else { delete g.dailyWords; delete g.dailyPages; }
    g.dailyMinutes = p.words || p.pages ? 0 : p.minutes || 0;
    // The author's own habits join your personal goals (once).
    const have = new Set(goals.habits().map((x) => x.name.toLowerCase()));
    const add = (p.habits || []).filter((x) => !have.has(x.toLowerCase()));
    if (add.length) g.habits = cleanHabits([...goals.habits(), ...add.map((name, i) => ({ id: `hb-${Date.now().toString(36)}${i}`, name }))]);
    fillDaily(); save(); drawAuthors(); drawHabits();
    toast(`Daily goal: ${describeGoal(dailyOf())}, like ${p.name}`, 'ok', 1800);
  };
  const dailyOf = () => ({ words: g.dailyUnit === 'pages' ? 0 : g.dailyWords || 0, pages: g.dailyUnit === 'pages' ? g.dailyPages || 0 : 0, minutes: g.dailyMinutes || 0 });
  const editAuthor = (p) => {
    const isNew = !p;
    const a = p ? { ...p } : { name: '', words: 0, minutes: 0, pages: 0, note: '' };
    const name = h('input', { type: 'text', value: a.name, placeholder: 'Author', 'aria-label': 'Author' });
    const w1 = num(a.words, () => {}, { step: 'any', placeholder: 'e.g. 1000', label: 'Words from' });
    const w2 = num(a.wordsMax, () => {}, { step: 'any', placeholder: 'to (optional)', label: 'Words to' });
    const h1 = num(a.minutes ? a.minutes / 60 : 0, () => {}, { step: 'any', placeholder: 'e.g. 3', label: 'Hours from' });
    const h2 = num(a.minutesMax ? a.minutesMax / 60 : 0, () => {}, { step: 'any', placeholder: 'to (optional)', label: 'Hours to' });
    const pg = num(a.pages, () => {}, { step: 'any', placeholder: 'e.g. 6', label: 'Pages' });
    const note = h('textarea', { rows: 4, placeholder: 'How they worked, their rituals and quirks', 'aria-label': 'Notes' });
    note.value = a.note || '';
    const hab = h('textarea', { rows: 2, placeholder: 'One per line, e.g. Take a long walk', 'aria-label': 'Their habits' });
    hab.value = (a.habits || []).join('\n');
    const form = h('div', { class: 'ga-form' },
      h('label', { class: 'fld' }, h('span', {}, 'Author'), name),
      h('div', { class: 'ga-form-row' }, h('label', { class: 'fld' }, h('span', {}, 'Words'), w1), h('span', { class: 'ga-to' }, '–'), h('label', { class: 'fld' }, h('span', {}, ' '), w2)),
      h('label', { class: 'fld' }, h('span', {}, 'Pages'), pg),
      h('div', { class: 'ga-form-row' }, h('label', { class: 'fld' }, h('span', {}, 'Hours'), h1), h('span', { class: 'ga-to' }, '–'), h('label', { class: 'fld' }, h('span', {}, ' '), h2)),
      h('label', { class: 'fld' }, h('span', {}, 'Notes and trivia'), note),
      h('label', { class: 'fld' }, h('span', {}, 'Habits (added to your personal goals when you use this author)'), hab));
    dialog({ title: isNew ? 'Add Author' : `Edit ${a.name}`, body: form, ok: isNew ? 'Add' : 'Save', cancel: 'Cancel' }).then((ok) => {
      if (!ok) return;
      const v = (el) => (el.value === '' ? 0 : Number(el.value));
      const next = cleanPreset({ id: a.id, name: name.value, words: v(w1), wordsMax: v(w2), minutes: Math.round(v(h1) * 60), minutesMax: Math.round(v(h2) * 60), pages: v(pg), any: a.any, note: note.value, habits: hab.value.split('\n') });
      if (!next.words && !next.minutes && !next.pages) { toast('Give a number of words, pages or hours', 'info', 2000); return; }
      const list = authorPresets().map((x) => ({ ...x }));
      const at = list.findIndex((x) => x.id === a.id);
      if (at >= 0) list[at] = next; else list.push(next);
      saveAuthors(list).then(() => { if (g.dailyPreset === next.id) useAuthor(next); drawAuthors(); });
    });
  };
  const deleteAuthor = async (p) => {
    if (!(await confirmDialog(`Delete ${p.name}?`, 'Removes this author from your list. A daily goal you took from them keeps its numbers.', 'Delete'))) return;
    await saveAuthors(authorPresets().filter((x) => x.id !== p.id));
    if (g.dailyPreset === p.id) { delete g.dailyPreset; save(); }
    drawAuthors();
  };
  const restoreAuthors = async () => {
    if (!(await confirmDialog('Restore the starting authors?', 'Replaces your author list with the original six: Stephen King, J.K. Rowling, Virginia Woolf, Dorothy Parker, Lee Child and Mark Twain.', 'Restore'))) return;
    await updateSettings({ goalAuthors: null }); drawAuthors();
  };
  function drawAuthors() {
    const list = authorPresets();
    authorsEl.replaceChildren(...list.map((p) => h('article', { class: `ga-card${g.dailyPreset === p.id ? ' on' : ''}` },
      h('div', { class: 'ga-top' },
        h('b', { class: 'ga-name' }, p.name),
        h('span', { class: 'ga-goal' }, describeGoal(p)),
        h('span', { class: 'spacer' }),
        g.dailyPreset === p.id ? h('span', { class: 'ga-using' }, icon('check', 12), 'Your daily goal')
          : h('button', { type: 'button', class: 'btn small', onclick: () => useAuthor(p) }, 'Use'),
        h('button', { type: 'button', class: 'icon-btn', title: `Edit ${p.name}`, 'aria-label': `Edit ${p.name}`, onclick: () => editAuthor(p) }, icon('pen', 14)),
        h('button', { type: 'button', class: 'icon-btn', title: `Delete ${p.name}`, 'aria-label': `Delete ${p.name}`, onclick: () => deleteAuthor(p) }, icon('trash', 14))),
      p.note ? h('p', { class: 'ga-note' }, p.note) : null)),
    list.length ? '' : h('p', { class: 'hint' }, 'No authors yet.'));
  }
  const stopSettings = onSettings(() => { if (!body.isConnected) { stopSettings(); return; } drawAuthors(); });
  drawAuthors();

  /* ---- your own goals: anything you want to do each day, ticked off by hand */
  const habitsEl = h('div', { class: 'hb-list' });
  const todayEl = h('div', { class: 'hb-today' });
  const newHabit = h('input', { type: 'text', maxlength: 80, placeholder: 'e.g. Go for a jog before writing', 'aria-label': 'New personal goal' });
  const newWhen = h('select', { 'aria-label': 'When' }, h('option', { value: '' }, 'Any time'), h('option', { value: 'before' }, 'Before writing'), h('option', { value: 'during' }, 'During writing'), h('option', { value: 'after' }, 'After writing'));
  const setHabits = (list) => { g.habits = cleanHabits(list); if (!g.habits.length) delete g.habits; save(); drawHabits(); };
  const addHabit = () => {
    const name = newHabit.value.replace(/\s+/g, ' ').trim();
    if (!name) { newHabit.focus(); return; }
    setHabits([...goals.habits(), { id: `hb-${Date.now().toString(36)}`, name, when: newWhen.value }]);
    newHabit.value = ''; newHabit.focus();
  };
  newHabit.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addHabit(); } });
  function drawHabits() {
    const list = goals.habits();
    const done = new Set(goals.habitsDone());
    habitsEl.replaceChildren(...list.map((hb) => {
      const name = h('input', { type: 'text', class: 'hb-name', maxlength: 80, value: hb.name, 'aria-label': 'Personal goal' });
      name.addEventListener('change', () => setHabits(goals.habits().map((x) => (x.id === hb.id ? { ...x, name: name.value } : x))));
      const when = h('select', { class: 'hb-when', 'aria-label': 'When' }, [['', 'Any time'], ['before', 'Before writing'], ['during', 'During writing'], ['after', 'After writing']].map(([v, l]) => h('option', { value: v, selected: hb.when === v }, l)));
      when.addEventListener('change', () => setHabits(goals.habits().map((x) => (x.id === hb.id ? { ...x, when: when.value } : x))));
      const box = h('input', { type: 'checkbox', checked: done.has(hb.id), title: 'Done today', 'aria-label': `${hb.name}, done today` });
      box.addEventListener('change', () => { goals.setHabitDone(hb.id, box.checked); drawToday(); });
      return h('div', { class: `hb-row${done.has(hb.id) ? ' done' : ''}` }, box, name, when,
        h('button', { type: 'button', class: 'icon-btn', title: `Delete “${hb.name}”`, 'aria-label': `Delete ${hb.name}`, onclick: () => setHabits(goals.habits().filter((x) => x.id !== hb.id)) }, icon('trash', 14)));
    }));
    if (!list.length) habitsEl.append(h('p', { class: 'hint' }, 'None yet. Add anything you want to do each day, then tick it off when it’s done.'));
    drawToday();
  }
  function drawToday() {
    const pp = goals.personal();
    todayEl.replaceChildren(
      h('div', { class: 'gc-bar-top' }, h('b', {}, 'Today'), h('span', {}, pp.total ? `${pp.done} of ${pp.total} done · ${Math.floor(pp.pct * 100)}%` : 'Set a goal to track today')),
      h('div', { class: 'gbar' }, h('i', { style: { width: `${pp.pct * 100}%` } })));
  }

  const daily = h('section', { class: 'goal-card goal-daily' },
    h('div', { class: 'goal-card-head' }, icon('calendar', 16), h('h3', {}, 'Personal Daily Goals'),
      h('small', { class: 'hint' }, 'Words, pages and hours are counted for you. Add your own goals and tick them off each day.')),
    h('div', { class: 'goal-sub' }, h('b', {}, 'Counted for you')),
    h('div', { class: 'goal-row' },
      h('label', { class: 'fld goal-amt' }, h('span', {}, 'Words or pages'), h('div', { class: 'goal-amt-in' }, fDaily, dayUnit)),
      h('label', { class: 'fld' }, h('span', {}, 'Hours'), fHours)),
    h('div', { class: 'goal-sub' }, h('b', {}, 'Your own goals'), h('small', { class: 'hint' }, 'Tick them off when they’re done, here or from the Today meter under the editor.')),
    habitsEl,
    h('div', { class: 'hb-add' }, newHabit, newWhen, h('button', { type: 'button', class: 'btn small', onclick: addHabit }, icon('plus', 13), 'Add')),
    todayEl,
    noteBox('dailyNote', 'Notes about your daily goal — when and where you write, what helps…'),
    h('div', { class: 'ga-head' }, h('b', {}, 'Write like…'), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn small', onclick: () => editAuthor(null) }, icon('plus', 13), 'Add Author'),
      h('button', { type: 'button', class: 'btn small plain', title: 'Bring back the original six authors', onclick: restoreAuthors }, 'Restore')),
    authorsEl);
  drawHabits();

  /* ---- top right: Reset and Turn Goals Off */
  const resetGoals = async () => {
    if (!(await confirmDialog('Reset this book’s goals?', 'Clears the Book Goals, the deadline, the Personal Daily Goals (your own goals too) and their notes. The date you started and your writing history are kept.', 'Reset Goals'))) return;
    for (const k of GOAL_KEYS) delete g[k];
    fBook.value = ''; fBookHours.value = ''; date.value = '';
    for (const t of body.querySelectorAll('.goal-note')) t.value = '';
    fillDaily(); drawAuthors(); save(); drawHabits(); toast('Goals reset', 'ok', 1800);
  };
  const resetHistory = async () => {
    if (!(await confirmDialog(`Reset the writing history of “${app.book?.title || 'this book'}”?`, 'Deletes this book’s words per day, writing time, stopwatch time and streak from this computer. Your text and goals aren’t affected. This can’t be undone.', 'Reset History'))) return;
    try { await goals.resetHistory(); toast('Writing history reset', 'ok', 2000); } catch (err) { toast(String(err?.message || err), 'error'); }
    save();
  };
  const resetBtn = h('button', { type: 'button', class: 'btn small plain', title: 'Reset goals or writing history', onclick: () => popover(resetBtn, [
    { label: 'Reset Goals…', icon: 'reset', onClick: resetGoals },
    { label: 'Reset Writing History…', icon: 'reset', danger: true, onClick: resetHistory },
  ], { align: 'right', width: 230 }) }, icon('reset', 13), 'Reset…');
  const offBtn = h('button', { type: 'button', class: 'btn small plain', title: 'Hide goals everywhere — turn them back on in Settings › General', onclick: async () => {
    if (!(await confirmDialog('Turn goals off?', 'Hides Goals, the countdown and the daily goal meter. Your goals and history are kept; turn them back on in Settings › General.', 'Turn Off'))) return;
    await updateSettings({ goalsOn: false }); closeSheet?.();
  } }, icon('eyeOff', 13), 'Turn Goals Off');

  const history = writingHistory(app, goals);
  body.append(h('div', { class: 'goal-settings' }, bookGoal, daily), history.el);
  drawClock();
  goals.flush().then(() => history.draw());
  history.draw();
  let rt;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => history.draw(), 150); };
  window.addEventListener('resize', onResize);
  const closeSheet = sheet('Goals', body, { wide: true, actions: h('div', { class: 'goal-actions' }, resetBtn, offBtn), onClose: () => { clearInterval(tick); window.removeEventListener('resize', onResize); } });
}

/* ---------------------------------------------------------- session clock */

const clockText = (ms) => {
  const t = Math.floor(ms / 1000);
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
};
const dur = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;


/* -------------------------------------------------------------- stopwatch */

/** A start/stop stopwatch. It never starts by itself; its time is logged per day. */
export function stopwatchControl(app, goals, { onHistory } = {}) {
  const time = h('span', { class: 'sw-time' });
  const playIcon = h('span', { class: 'sw-ic' });
  const toggle = h('button', { class: 'sw-toggle', onclick: () => { const s = goals.stopwatch(); if (s.running) goals.stopwatchStop(); else goals.stopwatchStart(); draw(); } }, playIcon, time);
  const reset = h('button', { class: 'sw-reset', title: 'Reset stopwatch', 'aria-label': 'Reset stopwatch', onclick: () => { goals.stopwatchReset(); draw(); } }, icon('reset', 13));
  const el = h('div', { class: 'stopwatch', role: 'group', 'aria-label': 'Stopwatch' }, toggle, reset);
  let wasRunning = null;
  const draw = () => {
    if (!app.book) return;
    const s = goals.stopwatch();
    // With a daily hours goal: today's time for this book against it.
    const goalMin = settings.goalsOn !== false ? goals.dailyMinutes() : 0;
    time.textContent = goalMin ? `${clockText(s.ms)} / ${clockText(goalMin * 60000)}` : clockText(s.ms);
    el.classList.toggle('met', !!goalMin && s.ms >= goalMin * 60000);
    el.classList.toggle('running', s.running);
    el.classList.toggle('zero', s.ms < 1000);
    if (wasRunning !== s.running) {
      playIcon.replaceChildren(icon('stopwatch', 17));
      toggle.title = s.running ? 'Stopwatch — this book’s writing time today. It starts when you open the book; click to pause.' : 'Stopwatch — paused. Click to carry on timing this book today.';
      toggle.setAttribute('aria-label', s.running ? 'Stop stopwatch' : 'Start stopwatch');
      wasRunning = s.running;
    }
  };
  setInterval(draw, 1000);
  draw();
  void onHistory;
  return { el, draw };
}

/** Popover with this session's details, recent sessions and Start New Session. */
export function sessionPopover(anchor, goals, { onNew } = {}) {
  const s = goals.session();
  const row = (k, v) => h('div', { class: 'sc-row' }, h('span', {}, k), h('b', {}, v));
  const recent = goals.sessionLog().slice(0, 5);
  const body = h('div', { class: 'sc-panel' },
    row('Words this session', signed(s.words)),
    row('Started', new Date(s.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    row('Typing time', dur(s.activeMs)),
    recent.length ? h('div', { class: 'sc-hist' }, h('div', { class: 'pop-head' }, 'Earlier sessions'),
      ...recent.map((r) => h('div', { class: 'sc-row small' }, h('span', {}, new Date(r.start).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), h('b', {}, `${dur(r.ms)} · ${signed(r.words)}`)))) : null);
  popover(anchor, [
    { node: body }, '-',
    { label: 'Start New Session', icon: 'rotate', onClick: () => {
      goals.newSession(); onNew?.(); toast('New writing session started');
      // The end of a session: a good moment to tick off your own goals.
      if (goals.personal().items.some((it) => !it.auto && !it.done)) setTimeout(() => todayChecklist(anchor, goals, { title: 'Before you go: anything done today?' }));
    } },
  ], { align: 'left', width: 280 });
}

/**
 * Today's Personal Daily Goals as a checklist: the tracked goal with its progress,
 * then your own goals to tick off. opts.openGoals: a link to the Goals window.
 */
export function todayChecklist(anchor, goals, { title = 'Today’s personal goals', openGoals } = {}) {
  const draw = () => {
    const pp = goals.personal();
    const rows = pp.items.map((it) => {
      if (it.auto) {
        const cur = it.kind === 'minutes' ? dur(it.cur * 60000) : n0(it.cur);
        return h('div', { class: `tc-item auto${it.done ? ' done' : ''}`, title: 'Counted for you as you write' },
          h('span', { class: 'tc-ring gm-ring' + (it.done ? ' done' : ''), style: { '--p': String(it.pct) } }),
          h('span', { class: 'tc-name' }, it.name), h('small', {}, it.done ? 'done' : `${cur} so far`));
      }
      const box = h('input', { type: 'checkbox', checked: it.done });
      box.addEventListener('change', () => { goals.setHabitDone(it.id, box.checked); draw(); });
      return h('label', { class: `tc-item${it.done ? ' done' : ''}` }, box, h('span', { class: 'tc-name' }, it.name),
        it.when ? h('small', {}, `${it.when} writing`) : null);
    });
    panel.replaceChildren(
      h('div', { class: 'pop-head' }, title),
      ...(rows.length ? rows : [h('p', { class: 'hint' }, 'No daily goals yet.')]),
      h('div', { class: 'tc-foot' }, h('span', {}, pp.total ? `${pp.done} of ${pp.total} · ${Math.floor(pp.pct * 100)}%` : ''),
        openGoals ? h('button', { type: 'button', class: 'btn small plain', onclick: () => { closePopovers(); openGoals(); } }, 'Edit Goals…') : null));
  };
  const panel = h('div', { class: 'today-check', onmousedown: (e) => e.stopPropagation(), onclick: (e) => e.stopPropagation() });
  draw();
  popover(anchor, [{ node: panel }], { align: 'left', width: 290 });
}

/**
 * Under the editor, when goals are on: how much of the book is done, and how much
 * of today's personal goals. Click Book for the Goals window, Today for the checklist.
 */
export function progressMeters(app, goals, openGoals) {
  const bookRing = h('span', { class: 'gm-ring' }), bookTxt = h('span', { class: 'pm-txt' });
  const dayRing = h('span', { class: 'gm-ring' }), dayTxt = h('span', { class: 'pm-txt' });
  const bookBtn = h('button', { type: 'button', class: 'pm-btn', onclick: () => openGoals() }, bookRing, bookTxt);
  const dayBtn = h('button', { type: 'button', class: 'pm-btn', onclick: () => todayChecklist(dayBtn, goals, { openGoals }) }, dayRing, dayTxt);
  const el = h('div', { class: 'pm-group', role: 'group', 'aria-label': 'Goal progress' }, bookBtn, dayBtn);
  const draw = () => {
    if (!app.book) return;
    const on = settings.goalsOn !== false;
    el.hidden = !on;
    if (!on) return;
    const bp = goals.bookPct();
    bookBtn.hidden = bp == null;
    if (bp != null) {
      bookRing.style.setProperty('--p', String(bp)); bookRing.classList.toggle('done', bp >= 1);
      bookTxt.replaceChildren(h('small', {}, 'Book '), `${Math.floor(bp * 100)}%`);
      bookBtn.title = `Book — ${Math.floor(bp * 100)}% of your book goal. Click for Goals.`;
    }
    const pp = goals.personal();
    dayBtn.hidden = !pp.total;
    dayRing.style.setProperty('--p', String(pp.pct)); dayRing.classList.toggle('done', pp.total > 0 && pp.done === pp.total);
    dayTxt.replaceChildren(h('small', {}, 'Daily '), `${Math.floor(pp.pct * 100)}%`);
    dayBtn.title = `Daily — ${pp.done} of ${pp.total} personal daily goals done. Click to tick yours off.`;
  };
  return { el, draw };
}
