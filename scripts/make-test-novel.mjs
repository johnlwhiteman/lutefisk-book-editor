// Creates a silly test novel that uses nearly every Lutefisk feature: front and
// back matter, many chapters and scenes, footnotes, citations, equations, code,
// a table, verse, highlights, text colors, comments, pictures, characters, a
// plot board and timeline, research folders, snippets, to-dos, labels,
// statuses, goals and a genre. The story is deliberately nonsense.
//
// Usage: node scripts/make-test-novel.mjs [targetDir]
// Default target: local/books/The Teaspoon Admiral (local/ is never committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { defaultBook, ensureSections, DEFAULT_CONTENT } from '../src/shared/sections.js';
import { serializeBook } from '../src/main/bookstore.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = process.argv[2] || join(root, 'local', 'books', 'The Teaspoon Admiral');

/* ---------------------------------------------------------------- pictures */
// A tiny PNG writer, so the book has a cover and a map without any image files.
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// Cover: a night sea, a large moon, and a teaspoon sailing toward it.
const cover = png(800, 1280, (x, y) => {
  let c = mix([18, 30, 68], [58, 46, 104], y / 1280);
  if (y > 860) c = mix([16, 64, 92], [8, 30, 52], (y - 860) / 420);
  if (y > 860 && Math.sin(x / 23 + y / 9) > 0.93) c = mix(c, [230, 210, 160], 0.5);
  const dm = Math.hypot(x - 520, y - 380);
  if (dm < 170) c = mix([250, 236, 196], [236, 210, 150], dm / 170);
  else if (dm < 230) c = mix(c, [250, 236, 196], 0.18 * (1 - (dm - 170) / 60));
  const bowl = ((x - 330) / 120) ** 2 + ((y - 860) / 34) ** 2 < 1 && y > 850;
  const handle = y > 836 && y < 848 && x > 420 && x < 640 && Math.abs(y - (842 - (x - 420) * 0.02)) < 5;
  const mast = x > 326 && x < 334 && y > 640 && y < 860;
  const sail = y > 660 && y < 820 && x > 334 && x < 334 + (y - 660) * 0.75;
  if (bowl || handle) c = [196, 202, 214];
  if (mast) c = [120, 84, 52];
  if (sail) c = mix([246, 240, 226], [214, 200, 176], (x - 334) / 120);
  if ((x * 7 + y * 13) % 997 === 0 && y < 820 && dm > 240) c = [255, 255, 240];
  return c;
});
// Map: parchment, a dotted route and a few islands.
const map = png(900, 520, (x, y) => {
  let c = mix([241, 228, 198], [226, 206, 166], (Math.sin(x / 41) + Math.cos(y / 37) + 2) / 4);
  const isl = [[150, 380, 70], [420, 220, 55], [700, 120, 60], [760, 400, 40]];
  for (const [ix, iy, r] of isl) { const d = Math.hypot(x - ix, (y - iy) * 1.3); if (d < r) c = mix([176, 196, 132], [140, 164, 104], d / r); else if (d < r + 4) c = [120, 100, 70]; }
  const route = (t) => [150 + t * 610, 380 - Math.sin(t * Math.PI) * 300 + t * 20];
  for (let t = 0; t <= 1; t += 0.004) { const [rx, ry] = route(t); if (Math.floor(t * 125) % 2 === 0 && Math.hypot(x - rx, y - ry) < 3) c = [156, 40, 40]; }
  if (Math.hypot(x - 820, y - 70) < 26 && Math.hypot(x - 820, y - 70) > 22) c = [90, 70, 50];
  return c;
});

/* -------------------------------------------------------------------- book */
const book = ensureSections(defaultBook({ title: 'The Teaspoon Admiral', subtitle: 'Being a Mostly Accurate Account of an Apology to the Moon', author: 'Penelope Fogwhistle' }));
book.uuid = '0b7d2f84-5e1c-4d0a-9a77-7e3c2f1d5a90';
book.publisher = 'Damp Biscuit Books';
book.year = '2026';
book.genre = 'Humor';
book.logline = 'When a retired admiral accidentally insults the Moon, he must sail a single teaspoon across the Sea of Mild Inconvenience to apologize in person — before the tides, which are taking it very personally, refuse to come back.';
book.description = 'An admiral, a goose, a walking lighthouse and a scone with opinions set sail in a teaspoon to say sorry to the Moon.';
book.keywords = ['humor', 'nautical nonsense', 'the Moon', 'apologies'];
book.template = 'classic';
book.cover = 'assets/cover.png';
book.index = { terms: ['teaspoon', 'Moon', 'Duchess Honk', 'Gerald', 'Sea of Mild Inconvenience'] };
book.labels = [
  { id: 'red', name: 'Needs jokes', color: '#e5484d' }, { id: 'orange', name: 'Too many jokes', color: '#f76b15' },
  { id: 'green', name: 'Lovely', color: '#30a46c' }, { id: 'blue', name: 'Check facts (there are none)', color: '#0090ff' },
];
book.goals = { goalsSet: true, dailySet: true, startDate: '2026-09-01', targetUnit: 'words', targetWords: 6000, targetPages: 21, targetHours: 40, wordsPerPage: 280, deadline: '2027-03-01', dailyUnit: 'words', dailyWords: 120, dailyMinutes: 30,
  bookNote: 'A short, silly book. Done means the goose gets the last word.', dailyNote: 'Mornings, before the tea goes cold.' };
book.bibliography = [
  { id: 'ref-moon', kind: 'book', authors: [{ family: 'Crumpet', given: 'Bartholomew' }], title: 'Things I Should Not Have Said to Celestial Bodies', publisher: 'Admiralty Regrets Press', date: '1987', edition: '2nd' },
  { id: 'ref-goose', kind: 'journal', authors: [{ family: 'Honk', given: 'Duchess' }], title: 'On the navigational superiority of geese: a polite but firm rebuttal', container: 'Proceedings of the Waterfowl Society', volume: '4', issue: '2', pages: '1–3', date: '2003' },
  { id: 'ref-tides', kind: 'webpage', authors: [{ literal: 'The Committee of Unnecessary Weather' }], title: 'Minutes of the 412th Meeting', container: 'Committee Notices', date: '2026-04-01', url: 'https://www.example.org/unnecessary-weather/minutes', accessed: '2026-11-14' },
];
const S = (type) => book.sections.find((s) => s.type === type);
for (const t of ['dedication', 'epigraph', 'prologue', 'epilogue', 'acknowledgments', 'bibliography', 'index', 'about-author']) S(t).enabled = true;
S('prologue').title = 'Prologue: The Remark';
const first = S('chapter');

let n = 0;
const id = (p) => `${p}-${(0x1a2b3c4d + (n++) * 7919).toString(16)}`;
const stats = () => ({ created: '2026-09-01T09:00:00.000Z', days: {} });
const chapter = (title, extra = {}) => ({ id: id('cha'), type: 'chapter', enabled: true, title, stats: stats(), ...extra });
const scene = (title, extra = {}) => ({ id: id('sce'), title, stats: stats(), ...extra });

const p = (...xs) => xs.join('\n\n');
const contents = {};
const chapters = [];
const add = (ch, text) => { chapters.push(ch); if (typeof text === 'string') contents[ch.id] = text; else { ch.scenes = text.map(([sc]) => sc); for (const [sc, t] of text) contents[sc.id] = t; contents[ch.id] = ''; } return ch; };

/* ---- chapter 1 replaces the default first chapter */
first.title = 'In Which an Admiral Is Rude to the Moon';
first.label = 'green';
first.statuses = ['First Draft', 'Reviewed'];
contents[first.id] = p(
  'Admiral Bartholomew Crumpet had commanded many fleets in his career, though never more than one ship at a time, and lately not even that. He was retired now, which is to say he spent his evenings on the balcony of a narrow house in Lower Puddingham, shouting at things that could not shout back.',
  'On the night in question he shouted at the Moon.',
  '“You,” he said, pointing his pipe at it, “are *frankly* a bit much.”',
  'The Moon, which had been called many things over four and a half billion years, had never once been called *a bit much*. It went very quiet. Then, slowly, deliberately, it took the tide with it — all of it, from every beach in the kingdom — and did not give it back.',
  '{==By morning the harbor was a long field of surprised fish.==}{>>#c-fish<<} The harbormaster wrote a strongly worded letter. The fish did not have a view.',
  '* * *',
  '“Well,” said Duchess Honk, the Admiral’s goose and navigator, when she had read the newspaper twice. “You’ll have to apologize.”',
  '“To the *Moon*?”',
  '“In person,” said the goose. “It’s only polite.”[^1]',
  'The Admiral looked at his fleet, which was hanging on a hook in the kitchen. It was a teaspoon. It had been a teaspoon for as long as he had owned it, and it showed no sign of becoming anything grander.',
  '“Then we sail at dawn,” he said, ==which was the kind of thing he said==.',
  '[^1]: Geese are famously polite. The rumors to the contrary were started by swans.');

const ch2 = add(chapter('The Fleet Is Assembled', { label: 'orange', statuses: ['In Progress'] }), [
  [scene('The Crew'), p(
    'Every admiral needs a crew, and the Admiral’s crew assembled in the kitchen the way crews do: grudgingly, and one at a time.',
    'First came **Duchess Honk**, who had brought her own sextant and would not be discussing it.',
    'Second came **Gerald**, the lighthouse from the end of the pier, who had heard there was a voyage and had walked up the high street to volunteer. Gerald was a pessimist. “We’ll all drown,” he said, by way of hello. “Probably on a Tuesday.”',
    'Third, and last, came **Sir Reginald**, a scone who had been left on a plate for so long that he had developed opinions. Nobody had invited Sir Reginald. Nobody ever did.')],
  [scene('The Inventory'), p(
    'Duchess Honk drew up the ship’s inventory, because somebody had to.',
    '| Item | Quantity | Condition |\n| --- | :---: | --- |\n| Teaspoon (flagship) | 1 | Shiny, optimistic |\n| Sugar lumps (ballast) | 14 | Dissolving slowly |\n| Apology, unwritten | 1 | Pending |\n| Lighthouse | 1 | Gloomy |\n| Scone | 1 | Sentient, crumbly |',
    'The Admiral signed it. Gerald read it and said, “Fourteen sugar lumps won’t be enough.” He did not say enough for *what*. He never did.')],
  [scene('The Departure'), p(
    'They launched from the bathtub at dawn, which in Lower Puddingham was considered a perfectly respectable port.',
    'The neighbors waved. One of them threw a slipper, which the Admiral chose to interpret as a salute.',
    '::: center\n*Fair winds, foolish fleet.*\n:::')],
]);

const ch3 = add(chapter('The Sea of Mild Inconvenience', { label: 'blue', statuses: ['First Draft'] }), p(
  'The Sea of Mild Inconvenience lies just past the drain, and it is exactly as advertised. Nothing on it is ever *dangerous*. It is simply always slightly the wrong temperature, and the waves arrive a moment after you were expecting them.',
  'Wren Pickle, the ship’s cartographer, was already aboard when they reached it. Nobody knew when she had arrived. She was busy drawing a map of an island that did not exist yet.',
  '“It will,” she said, when asked. “I’m early, that’s all.”',
  '![Wren Pickle’s chart of the route to the Moon, with several islands that may or may not exist](assets/map.png "Wren’s chart — not to scale, or to reality"){width=85%}',
  'According to Wren’s calculations, the distance to the Moon could be expressed in teaspoons as $d = \\frac{384{,}400\\ \\text{km}}{4.9\\ \\text{cm}}$, which she rounded down to “a lot,” for morale.',
  'The Admiral nodded as if he understood. The goose did understand, which was worse.',
  '___',
  'On the second day the wind dropped, and Sir Reginald gave a speech about crumbs. It lasted three hours. Nobody could remember a word of it afterward, which Gerald said was the best part.'));

const ch4 = add(chapter('The Committee of Unnecessary Weather', { label: 'red', statuses: ['Needs Review'] }), [
  [scene('A Cloud Appears'), p(
    'On the third morning a small grey cloud drifted over the teaspoon and stopped, as if it had a clipboard.',
    'It did have a clipboard. It was the Chair of the Committee of Unnecessary Weather, and it had come to inform them that they were *not authorized* to have this nice a day.[@ref-tides]',
    '“Under section four,” said the cloud, “all voyages of apology require a light drizzle. For atmosphere.”')],
  [scene('The Negotiation'), p(
    'The Admiral negotiated. He was very good at negotiating, provided nobody minded losing.',
    '1. He offered the cloud a sugar lump.',
    '2. The cloud asked for two.',
    '3. Gerald said it would ask for three next, and it did.',
    '4. In the end they settled on *intermittent sprinkles, with sunny spells*, which everyone agreed was a triumph of diplomacy and which the cloud immediately ignored.')],
]);

const ch5 = add(chapter('A Song for the Moon', { statuses: ['First Draft'] }), p(
  'Duchess Honk believed that apologies landed better with music, and she had composed a song. She sang it from the prow while Gerald provided the light and Sir Reginald provided commentary nobody asked for.',
  `::: verse\n${[['O Moon, O Moon, you lovely lump,', 'We’re sorry that our Admiral’s a grump.', 'He called you *much* — it was a slip —', 'Please send the tides back to the ship.'], ['We’ve sailed a spoon through rain and fog,', 'We’ve argued with a cloud and log,', 'We’ve brought you crumbs (the scone said no),', 'So please, dear Moon, let the oceans flow.']].map((st) => st.join('\\\n')).join('\n\n')}\n:::`,
  '::: attribution\n— Duchess Honk, *Collected Honks*, volume three\n:::',
  'It was not, Gerald admitted, the worst song he had ever heard. He had once heard the foghorn try jazz.'));

const ch6 = add(chapter('Gerald Has a Bad Feeling', { label: 'orange', statuses: ['In Progress'] }), [
  [scene('The Feeling'), p(
    'Gerald had a bad feeling, which was not news. Gerald had had a bad feeling every day since 1874. But this one, he said, was *special*.',
    '“It’s in my lamp room,” he said. “A sort of flicker.”',
    'The Admiral told him it was probably indigestion. Lighthouses do not eat, so this was not helpful, but it was said kindly.')],
  [scene('The Flicker Is Explained'), p(
    'The flicker turned out to be a moth named Clive who had been living in Gerald’s lamp room for eleven years and had only just gathered the courage to introduce himself.',
    '“I’m terribly sorry,” said Clive. “I didn’t want to be any trouble.”',
    'Gerald was so moved by this that he did not predict a single disaster for nearly an hour, which [everyone agreed]{color=#2e7d32} was a personal best.')],
  [scene('Flashback: The Night Gerald Stopped Walking'), p(
    'Many years earlier — long before the Admiral, the goose or the scone — Gerald had been a walking lighthouse, as all lighthouses were in those days. He had strolled the coast every evening, lighting ships home and stopping for chats.',
    'Then one night a ship had followed him inland, all the way to a cake shop, and run aground on a display of éclairs. After that, the Harbour Council had asked him to stand still, please, at the end of the pier.',
    'He had stood there ever since. Until the Admiral’s teaspoon came along, he had nearly forgotten that he had legs.')],
]);

const ch7 = add(chapter('Sir Reginald’s Unrequested Lecture on Physics'), p(
  'Sir Reginald had been reading — or rather, he had been left face-down on a physics textbook for a week, which he said was the same thing.',
  '“The Moon’s pull on the tides,” he announced, “is obviously proportional to how *offended* it is.” He drew this on the deck in crumbs:',
  '$$T_{\\text{tide}} = k \\cdot \\frac{\\text{Offense}^2}{\\text{Distance}} - \\text{Apology}$$',
  'Duchess Honk pointed out that this was not how physics worked. Sir Reginald pointed out that she was a goose. It was felt that both points had merit.',
  'To settle the matter, Wren Pickle wrote a small program in the margins of her map:',
  '```python linenums\ndef tide_height(offense, apology, distance=384_400):\n    """How much tide the Moon is willing to give back."""\n    k = 0.0042  # the Moon\'s patience, measured in teaspoons\n    return max(0, k * offense**2 / distance - apology)\n\nprint(tide_height(offense=10, apology=3))  # prints 0 — not sorry enough\n```',
  'The program printed `0`, which meant they were not sorry enough yet. The Admiral took this very hard.'));

const ch8 = add(chapter('The Island That Wasn’t There Yet', { label: 'green', statuses: ['Revised'] }), [
  [scene('Landfall'), p(
    'On the fifth day the island Wren had been drawing turned up, slightly embarrassed, as if it had overslept.',
    'It was a small island, mostly made of lost buttons, and it was inhabited by a single tortoise who sold postcards of itself.',
    '“Two pence each,” said the tortoise. “Or three for a story.”')],
  [scene('Three Stories for a Tortoise'), p(
    'The Admiral told the story of the Moon. The goose told the story of the sextant (briefly, and with some reluctance). Gerald told the story of the éclairs.',
    'The tortoise laughed so hard at the éclairs that it gave them the postcards for free, and also a jar of something it described as *emergency tide*.',
    '> “Only open it,” said the tortoise, “if you have run out of everything else, including hope and biscuits.”',
    'Sir Reginald said he would be keeping the jar. Nobody let him.')],
]);

const ch9 = add(chapter('Becalmed', { statuses: ['To Do'] }), p(
  'There was no wind, no tide and no biscuits left. The teaspoon sat on the glassy sea like a spoon on a table, which, if you think about it, is what it was.',
  'They passed the time as becalmed sailors always have:',
  '- by arguing about the best kind of biscuit (*custard creams*, according to everyone but the scone);',
  '- by teaching Clive the moth to tap-dance;',
  '- by listening to Gerald list every way they might still drown, alphabetically.',
  'He had reached *W* (“whales, sarcastic”) when the Admiral, very quietly, began to write his apology.',
  '\\newpage',
  'He wrote it seventeen times. The eighteenth was the one.'));

const ch10 = add(chapter('The Apology', { label: 'green', statuses: ['Finished'] }), p(
  'The Moon was much closer by now — close enough that the Admiral could see it was not, as he had always believed, made of cheese, but of something more like old porcelain, chipped at the edges and quietly lovely.',
  'He stood on the handle of the teaspoon, cleared his throat, and read:',
  '> Dear Moon,\n>\n> I was wrong. You are not *a bit much*. You are exactly enough, and you have been for a very long time, and I was cross about something else entirely (my knees) and took it out on you.\n>\n> Please give the sea back. The fish are very confused.\n>\n> Yours, with genuine regret and one teaspoon,\\\n> B. Crumpet (Admiral, retired)',
  'For a long moment nothing happened.',
  'Then the Moon, very slightly, *blushed*.'));

const ch11 = add(chapter('The Tides Come Home', { statuses: ['First Draft'] }), [
  [scene('Rushing Water'), p(
    'The tide came back all at once, with the air of someone who has been waiting outside a room until they are sure the argument is over.',
    'It picked up the teaspoon, the goose, the lighthouse, the scone, the cartographer and the moth, and carried them all the way home in a single enormous, apologetic wave.')],
  [scene('Lower Puddingham'), p(
    'They landed in the bathtub. The neighbors cheered. The fish returned to the harbor, looking deeply relieved and only a little smug.',
    'The harbormaster wrote another strongly worded letter, this one of thanks. It was, everyone agreed, *much* nicer than the first.')],
]);

const ch12 = add(chapter('In Which Everyone Has Tea', { label: 'green', statuses: ['Finished'] }), p(
  'There was tea, naturally. The Admiral made it himself, and stirred it — slowly, respectfully — with the flagship.',
  'Gerald went back to the end of the pier, but now, on fine evenings, he takes a short walk along the sea wall, and Clive rides on his lamp.',
  'Duchess Honk published her songs. Wren Pickle drew a map of next week, which is coming along nicely. Sir Reginald was, at last, eaten — at his own request, with clotted cream, and he said it was the proudest moment of his life.',
  'And every night, before bed, the Admiral steps out onto his narrow balcony, looks up, and says, “Evening, Moon. You’re looking well.”',
  'And the Moon, which has been called many things, likes that one best.'));

const backstory = chapter('Appendix', { type: 'appendix', title: 'A Glossary of Nautical Terms (Mostly Invented)' });
contents[backstory.id] = p(
  '**Becalmed**\\\nThe state of having no wind, no tide and no biscuits.',
  '**Flagship**\\\nThe most important ship in a fleet. In a fleet of one teaspoon, the teaspoon.',
  '**Port**\\\nThe left side of a ship, or the bathtub, depending on context.',
  '**Starboard**\\\nThe side that isn’t port. Gerald could never remember which, and blamed the starboard.',
  '**Teaspoon**\\\nApproximately 4.9 cm of optimism. See also *flagship*.',
  '**Weather, unnecessary**\\\nSee the Committee. Then see a lawyer.');

book.sections.splice(book.sections.indexOf(first) + 1, 0, ...chapters);
book.sections.splice(book.sections.indexOf(S('epilogue')) + 1, 0, backstory);
for (const s of book.sections) if (s.type === 'appendix' && s !== backstory && !contents[s.id]) s.enabled = false;

for (const s of book.sections) if (!(s.id in contents)) contents[s.id] = DEFAULT_CONTENT[s.type] || '';
contents[S('dedication').id] = '*For everyone who has ever said the wrong thing to something enormous.*';
contents[S('epigraph').id] = '*The sea is a great deal of water, most of it in the wrong place.*\n\n::: attribution\n— a goose, overheard\n:::';
contents[S('prologue').id] = p(
  'This is a true story, apart from the parts that aren’t, which are the best parts.',
  'It concerns an admiral, a goose, a lighthouse, a scone, a cartographer and a moth, and it begins — as so many great voyages do — with a man on a balcony saying something he immediately regretted.');
contents[S('epilogue').id] = p(
  'The Committee of Unnecessary Weather still meets on the first Tuesday of every month. It has never once been necessary.',
  'The teaspoon hangs in the kitchen again. If you look closely, there is a faint silvery shine on its bowl that was not there before. The Admiral says it is moonlight. Gerald says it is polish. Both of them, for once, are right.');
contents[S('acknowledgments').id] = 'Thank you to the real geese of the village pond, who taught me everything I know about menace; to my editor, who allowed exactly one éclair joke and then a second when I cried; and to the Moon, for being a good sport.';
contents[S('about-author').id] = 'Penelope Fogwhistle lives in a lighthouse that does not walk, with a goose who does not navigate. *The Teaspoon Admiral* is her second novel and first apology.';

/* ---- comments, characters, plot, timeline, research, snippets, to-dos */
book.comments = {
  'c-fish': { author: 'Penelope', at: '2026-10-02T10:15:00.000Z', text: 'Is “surprised fish” funnier than “astonished fish”? Ask the goose.', quote: 'By morning the harbor was a long field of surprised fish.', replies: [{ author: 'Editor', at: '2026-10-03T08:00:00.000Z', text: 'Surprised. Definitely surprised.' }], resolved: false },
};
const attrs = (o) => Object.entries(o).map(([k, v]) => ({ k, v }));
book.characters = [
  { id: 'ch-crumpet', name: 'Bartholomew Crumpet', aliases: ['the Admiral', 'Admiral'], role: 'Protagonist', color: '#2a78d6', matchFirst: false, avatar: 'icon:royal', attrs: attrs({ Age: '71', Occupation: 'Admiral (retired)', Goal: 'Apologize to the Moon', Flaw: 'Says things', Fear: 'Being wrong in public' }), notes: 'Has commanded many fleets, never more than one ship at a time.' },
  { id: 'ch-honk', name: 'Duchess Honk', aliases: ['the goose'], role: 'Navigator', color: '#eda100', matchFirst: false, avatar: 'icon:bird', attrs: attrs({ Species: 'Goose', Occupation: 'Navigator, composer', Strength: 'Being right' }), notes: 'Will not be discussing the sextant.' },
  { id: 'ch-gerald', name: 'Gerald', aliases: ['the lighthouse'], role: 'Comic relief', color: '#e5484d', matchFirst: true, avatar: 'icon:ghost', attrs: attrs({ Height: '22 meters', Mood: 'Gloomy since 1874', Secret: 'Can still walk' }), notes: 'Lists disasters alphabetically.' },
  { id: 'ch-reginald', name: 'Sir Reginald', aliases: ['the scone'], role: 'Antagonist (mild)', color: '#a18072', matchFirst: true, avatar: 'icon:robot', attrs: attrs({ Material: 'Scone', Opinions: 'Many', Ambition: 'To be eaten with dignity' }), notes: 'Nobody invited him.' },
  { id: 'ch-wren', name: 'Wren Pickle', aliases: [], role: 'Cartographer', color: '#30a46c', matchFirst: true, avatar: 'icon:long-hair', attrs: attrs({ Occupation: 'Cartographer', Specialty: 'Places that don’t exist yet' }), notes: 'Is always early.' },
  { id: 'ch-clive', name: 'Clive', aliases: ['the moth'], role: 'Supporting', color: '#8e4ec6', matchFirst: true, avatar: 'icon:cat', attrs: attrs({ Species: 'Moth', Residence: 'Gerald’s lamp room (11 years)' }), notes: 'Didn’t want to be any trouble.' },
];
const colFor = (s) => ({ id: `pc-${s.id}`, link: s.id, title: s.title });
const cols = [S('prologue'), first, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9, ch10, ch11, ch12, S('epilogue')].map(colFor);
const col = (s) => `pc-${s.id}`;
book.plot = {
  lines: [{ id: 'pl-voyage', title: 'The Voyage', color: '#2a78d6' }, { id: 'pl-gerald', title: 'Gerald’s Legs', color: '#e5484d' }, { id: 'pl-weather', title: 'The Committee', color: '#8d8d86' }],
  columns: cols, skip: [],
  cards: [
    { id: 'pk-remark', when: 'Day 0, evening', line: 'pl-voyage', col: col(first), title: 'The remark', text: '“You are frankly a bit much.”', chars: ['ch-crumpet'] },
    { id: 'pk-crew', when: 'Day 1', line: 'pl-voyage', col: col(ch2), title: 'The crew assembles', text: 'Goose, lighthouse, scone.', chars: ['ch-crumpet', 'ch-honk', 'ch-gerald', 'ch-reginald'] },
    { id: 'pk-sea', when: 'Day 2', line: 'pl-voyage', col: col(ch3), title: 'Wren is already aboard', text: 'Mapping an island that doesn’t exist yet.', chars: ['ch-wren'] },
    { id: 'pk-cloud', when: 'Day 3', line: 'pl-weather', col: col(ch4), title: 'The cloud with a clipboard', text: 'Drizzle is mandatory.', chars: ['ch-crumpet'] },
    { id: 'pk-song', when: 'Day 3, evening', line: 'pl-voyage', col: col(ch5), title: 'The song', text: 'O Moon, O Moon.', chars: ['ch-honk'] },
    { id: 'pk-clive', when: 'Day 4', line: 'pl-gerald', col: col(ch6), title: 'Clive introduces himself', text: 'Eleven years in the lamp room.', chars: ['ch-gerald', 'ch-clive'] },
    { id: 'pk-eclairs', when: 'Year 1874', line: 'pl-gerald', col: col(ch6), title: 'The éclair incident', text: 'Gerald stops walking.', chars: ['ch-gerald'] },
    { id: 'pk-physics', when: 'Day 4, afternoon', line: 'pl-voyage', col: col(ch7), title: 'Crumb physics', text: 'Not sorry enough yet.', chars: ['ch-reginald', 'ch-wren'] },
    { id: 'pk-island', when: 'Day 5', line: 'pl-voyage', col: col(ch8), title: 'The island turns up', text: 'Tortoise, postcards, emergency tide.', chars: ['ch-wren'] },
    { id: 'pk-becalmed', when: 'Day 6', line: 'pl-voyage', col: col(ch9), title: 'Becalmed', text: 'Seventeen drafts of an apology.', chars: ['ch-crumpet'] },
    { id: 'pk-apology', when: 'Day 7, moonrise', line: 'pl-voyage', col: col(ch10), title: 'The apology', text: 'The Moon blushes.', chars: ['ch-crumpet'] },
    { id: 'pk-home', when: 'Day 7, night', line: 'pl-voyage', col: col(ch11), title: 'The tide comes home', text: 'One enormous apologetic wave.', chars: [] },
    { id: 'pk-walks', when: 'Day 30', line: 'pl-gerald', col: col(ch12), title: 'Gerald walks again', text: 'Evening strolls on the sea wall.', chars: ['ch-gerald', 'ch-clive'] },
    { id: 'pk-committee', when: 'Year 1066', line: 'pl-weather', col: null, title: 'The Committee is founded', text: 'Nobody remembers why.', chars: [] },
    { id: 'pk-spoon', when: 'Year 1952', line: 'pl-voyage', col: null, title: 'The Admiral is given a teaspoon', text: 'A christening present. He has kept it ever since.', chars: ['ch-crumpet'] },
    { id: 'pk-clive-moves', when: 'Eleven years earlier', line: 'pl-gerald', col: null, title: 'Clive moves into the lamp room', text: 'Very quietly.', chars: ['ch-clive'] },
  ],
};
book.plot.chrono = ['pk-committee', 'pk-eclairs', 'pk-spoon', 'pk-clive-moves', 'pk-remark', 'pk-crew', 'pk-sea', 'pk-cloud', 'pk-song', 'pk-clive', 'pk-physics', 'pk-island', 'pk-becalmed', 'pk-apology', 'pk-home', 'pk-walks'];

const fld = (title, extra = {}) => ({ id: id('fld'), kind: 'folder', title, ...extra });
const ships = fld('Ships and Spoons');
const sky = fld('The Moon');
const tides = fld('Tides', { folder: sky.id });
const note = (title, folder, text) => { const r = { id: id('res'), kind: 'note', store: 'note', title, ...(folder ? { folder: folder.id } : {}) }; contents[r.id] = text; return r; };
book.research = [
  ships, sky, tides,
  note('Teaspoon specifications', ships, '## The flagship\n\n- Length: 13 cm\n- Bowl: 4.9 cm of optimism\n- Displacement: one sugar lump, roughly\n\nThe handle is good for standing on during speeches.'),
  note('Moon facts (real and otherwise)', sky, '- Distance: 384,400 km.\n- Made of: not cheese. Old porcelain, probably.\n- Mood: sensitive.\n\nTo check: does the Moon blush in color or only in grayscale?'),
  note('Why tides happen', tides, 'Gravity, mostly. Also manners.'),
  { id: id('res'), kind: 'link', title: 'Tides — a real explanation', url: 'https://oceanservice.noaa.gov/facts/tides.html', folder: tides.id },
  note('Name ideas for the moth', null, '- Clive\n- Kevin\n- Lord Fluttersby\n- Dennis (rejected: too threatening)'),
  // A scene drafted in Research, waiting to be inserted into a chapter.
  (() => { const r = { id: id('res'), kind: 'scene', store: 'note', title: 'The Goose Files a Complaint' }; contents[r.id] = 'Duchess Honk waddled into the wardroom holding a sheet of paper in her beak. It was a complaint. It was in triplicate.\n\n“Section four,” said the Admiral, reading, “*insufficient bread*.”\n\nThe goose did not blink. Geese rarely do.'; return r; })(),
];
book.snippets = [
  { id: 'snip-1', title: 'Gerald, alphabetically', text: '“Anchors, falling. Barnacles, aggressive. Cormorants, judgmental…” Gerald was only getting started.', created: Date.parse('2026-10-05T12:00:00Z') },
  { id: 'snip-2', title: 'A line for the epilogue?', text: 'Some apologies take a teaspoon. Some take a *tide*.', created: Date.parse('2026-10-06T12:00:00Z') },
  { id: 'snip-3', title: '', text: 'The goose looked at him the way geese look at everything: as though it owed her money.', created: Date.parse('2026-10-07T12:00:00Z') },
];
const today = new Date().toISOString().slice(0, 10);
book.todos = [
  { id: 'todo-1', text: 'Decide whether the tortoise needs a name', done: false, created: Date.parse('2026-10-01T09:00:00Z'), due: '2026-10-15' },
  { id: 'todo-2', text: 'Fact-check the éclair incident (there are no facts)', done: false, created: Date.parse('2026-10-08T09:00:00Z'), due: today },
  { id: 'todo-3', text: 'Write the song in chapter 5', done: true, created: Date.parse('2026-09-12T09:00:00Z'), doneAt: Date.parse('2026-09-20T09:00:00Z'), due: '' },
  { id: 'todo-4', text: 'Ask a real goose about sextants', done: false, created: Date.parse('2026-11-01T09:00:00Z'), due: '2027-01-10' },
];

mkdirSync(join(dir, 'chapters'), { recursive: true });
mkdirSync(join(dir, 'assets'), { recursive: true });
mkdirSync(join(dir, 'research'), { recursive: true });
writeFileSync(join(dir, 'assets', 'cover.png'), cover);
writeFileSync(join(dir, 'assets', 'map.png'), map);
writeFileSync(join(dir, 'lutefisk.yaml'), serializeBook(book));
for (const s of book.sections) {
  writeFileSync(join(dir, 'chapters', `${s.id}.md`), contents[s.id] ?? '');
  for (const sc of s.scenes || []) writeFileSync(join(dir, 'chapters', `${sc.id}.md`), contents[sc.id] ?? '');
}
for (const r of book.research) if (r.store === 'note') writeFileSync(join(dir, 'research', `${r.id}.md`), contents[r.id] ?? '');
const words = Object.values(contents).join(' ').split(/\s+/).filter(Boolean).length;
{
  // Six weeks of made-up writing history, so Goals has something to chart.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const days = 42, events = [];
  const plan = [];
  for (let i = days; i >= 1; i--) plan.push(rnd() < 0.68 ? Math.round(40 + rnd() * 150) - (rnd() < 0.12 ? 190 : 0) : 0);
  // Scale the days so the history ends at the book's size (prose words, as the app counts them).
  const goal = Math.round(words * 0.87) - 400;
  const raw = plan.reduce((a, b) => a + b, 0);
  for (let i = 0; i < plan.length; i++) plan[i] = Math.round((plan[i] * goal) / raw);
  let total = 400;
  plan.forEach((d, k) => {
    if (!d) return;
    const t = new Date(Date.now() - (days - k) * 86400000); t.setHours(7 + Math.floor(rnd() * 3), Math.floor(rnd() * 60), 0, 0);
    total += d;
    events.push(JSON.stringify({ t: t.toISOString(), d, w: total, s: Math.round(600 + rnd() * 2400), sw: rnd() < 0.4 ? Math.round(900 + rnd() * 2400) : 0 }));
  });
  mkdirSync(join(dir, 'stats'), { recursive: true });
  writeFileSync(join(dir, 'stats', 'history.jsonl'), `${events.join('\n')}\n`);
}
console.log(`Test novel written to ${dir} (${book.sections.filter((s) => s.type === 'chapter').length} chapters, ~${words.toLocaleString()} words)`);
