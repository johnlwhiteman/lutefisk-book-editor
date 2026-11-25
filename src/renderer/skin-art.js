// Skin artwork: each skin (other than Classic and High Contrast) carries a faint, original
// drawing of a traditional pattern — the same traditions as the print preview's artwork
// papers. Drawn as tiny inline SVG (nothing is downloaded) in the skin's own ink, very
// lightly, on the title bar, the binder, the Library and behind the preview. Night versions
// use a pale ink on the dark chrome.

const url = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/** Each pattern: (ink, alpha, paper) → { image, size }. `paper` fills shapes that must hide what's under them. */
const PATTERNS = {
  /* Java — batik kawung: four ovals around a point, like the cut kawung fruit */
  batik: (c, a) => ({ size: '44px 44px', image: url(44, 44, `<g fill='none' stroke='${c}' stroke-opacity='${a}' stroke-width='1.3'>
    <ellipse cx='22' cy='11' rx='6' ry='10'/><ellipse cx='22' cy='33' rx='6' ry='10'/><ellipse cx='11' cy='22' rx='10' ry='6'/><ellipse cx='33' cy='22' rx='10' ry='6'/></g>
    <g fill='${c}' fill-opacity='${a}'><circle cx='22' cy='22' r='1.8'/><circle cx='0' cy='0' r='1.4'/><circle cx='44' cy='0' r='1.4'/><circle cx='0' cy='44' r='1.4'/><circle cx='44' cy='44' r='1.4'/></g>`) }),
  /* Japan — seigaiha: overlapping scales of the "blue ocean waves" */
  seigaiha: (c, a, paper) => {
    const scale = (x, y) => [20, 15, 10, 5].map((r) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${paper}' stroke='${c}' stroke-opacity='${a}' stroke-width='1'/>`).join('');
    return { size: '40px 20px', image: url(40, 20, `<rect width='40' height='20' fill='${paper}'/>${scale(20, 0)}${scale(0, 10)}${scale(40, 10)}${scale(20, 20)}${scale(0, 30)}${scale(40, 30)}`) };
  },
  /* Japan — washi: long paper fibers, scattered */
  washi: (c, a) => ({ size: '180px 180px', image: url(180, 180, `<g fill='none' stroke='${c}' stroke-opacity='${a}' stroke-linecap='round'>
    <path d='M8 20c22 6 40 2 58 12' stroke-width='.9'/><path d='M96 10c14 10 34 12 52 6' stroke-width='.7'/><path d='M30 70c18-4 30 6 50 2' stroke-width='.8'/>
    <path d='M110 64c10 14 30 20 56 16' stroke-width='1'/><path d='M12 120c20 8 30 0 44 10' stroke-width='.7'/><path d='M76 112c22-6 40 6 60 0' stroke-width='.9'/>
    <path d='M140 140c8 10 22 16 36 14' stroke-width='.7'/><path d='M40 160c16-8 34-2 52-6' stroke-width='.8'/><path d='M150 30c-4 16 4 28 0 40' stroke-width='.6'/>
    <path d='M60 36c-6 12-2 22-8 34' stroke-width='.5'/><path d='M100 150c-4-14 6-24 2-36' stroke-width='.5'/></g>`) }),
  /* Mexico — Talavera tile: a four-petal flower with quarter-circles at the corners */
  talavera: (c, a) => ({ size: '56px 56px', image: url(56, 56, `<g fill='${c}' fill-opacity='${a * 0.55}' stroke='${c}' stroke-opacity='${a}' stroke-width='1'>
    <ellipse cx='28' cy='16' rx='5' ry='10'/><ellipse cx='28' cy='40' rx='5' ry='10'/><ellipse cx='16' cy='28' rx='10' ry='5'/><ellipse cx='40' cy='28' rx='10' ry='5'/>
    <path d='M0 0h10a10 10 0 0 1-10 10zM56 0v10A10 10 0 0 1 46 0zM0 56V46a10 10 0 0 1 10 10zM56 56H46a10 10 0 0 1 10-10z'/></g><circle cx='28' cy='28' r='3.5' fill='${c}' fill-opacity='${a}'/>`) }),
  /* Mali — bògòlan mud cloth: hand-painted crosses, dots and zigzags */
  mudcloth: (c, a) => ({ size: '64px 64px', image: url(64, 64, `<g stroke='${c}' stroke-opacity='${a}' stroke-width='1.6' stroke-linecap='round' fill='none'>
    <path d='M0 2H64M0 62H64'/><path d='M14 14l6 6m0-6l-6 6M44 14l6 6m0-6l-6 6M14 44l6 6m0-6l-6 6M44 44l6 6m0-6l-6 6'/><path d='M24 32l4-4 4 4 4-4 4 4'/></g>
    <g fill='${c}' fill-opacity='${a}'><circle cx='32' cy='14' r='1.6'/><circle cx='32' cy='50' r='1.6'/><circle cx='14' cy='32' r='1.6'/><circle cx='50' cy='32' r='1.6'/></g>`) }),
  /* Congo — Kuba cloth: interlocking diamonds */
  kuba: (c, a) => ({ size: '40px 40px', image: url(40, 40, `<g fill='none' stroke='${c}' stroke-opacity='${a}' stroke-width='1.3'><path d='M20 2L38 20 20 38 2 20z'/><path d='M20 10L30 20 20 30 10 20z'/><path d='M0 0L6 6M40 0l-6 6M0 40l6-6M40 40l-6-6'/></g><rect x='18' y='18' width='4' height='4' fill='${c}' fill-opacity='${a}'/>`) }),
  /* Aotearoa New Zealand (Māori) — kōwhaiwhai-style koru, in rows */
  koru: (c, a, _p, dot) => {
    const one = `<path d='M0 36H22c12 0 18-8 18-16s-6-14-14-14c-7 0-12 5-12 11 0 5 4 9 9 9 4 0 7-3 7-7 0-3-2-5-5-5' fill='none' stroke='${c}' stroke-opacity='${a}' stroke-width='3' stroke-linecap='round'/>`;
    return { size: '80px 52px', image: url(80, 52, `<g transform='translate(0 5)'>${one}<g transform='translate(80 42) rotate(180)'>${one}</g><circle cx='26' cy='18' r='2.5' fill='${dot}' fill-opacity='${a}'/><circle cx='54' cy='24' r='2.5' fill='${dot}' fill-opacity='${a}'/></g>`) };
  },
  /* Greece — the meander (Greek key), in bands */
  meander: (c, a) => ({ size: '32px 40px', image: url(32, 40, `<path d='M0 21H32M0 2H32M22 21V6H6V16H16V11' fill='none' stroke='${c}' stroke-opacity='${a}' stroke-width='2'/>`) }),
  /* Norway — the eight-petal star of Selbu knitting */
  selbu: (c, a, _p, dot) => {
    const petal = 'M24 24L27.5 15 24 6 20.5 15z';
    const petals = [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<path d='${petal}' transform='rotate(${r} 24 24)'/>`).join('');
    return { size: '48px 48px', image: url(48, 48, `<g fill='${c}' fill-opacity='${a}'>${petals}</g><g fill='${dot}' fill-opacity='${a}'><rect x='0' y='0' width='3' height='3'/><rect x='45' y='0' width='3' height='3'/><rect x='0' y='45' width='3' height='3'/><rect x='45' y='45' width='3' height='3'/></g>`) };
  },
  /* Andes — stepped tocapu, in rows */
  andean: (c, a, _p, dot) => ({ size: '40px 34px', image: url(40, 34, `<g transform='translate(0 6)'><path d='M0 22V17H5V12H10V7H15V2H25V7H30V12H35V17H40V22' fill='${c}' fill-opacity='${a * 0.6}' stroke='${c}' stroke-opacity='${a}' stroke-width='1'/><rect x='17' y='9' width='6' height='6' fill='${dot}' fill-opacity='${a}'/></g>`) }),
};

/**
 * Every patterned skin: its pattern, and the ink, strength and "paper" (the chrome color under it)
 * by day and by night. `dot` is a second ink some patterns use.
 */
const SKIN_ART = {
  batik:    { p: 'batik',    day: ['#4a2c14', 0.10, '#efe6d6', '#23395d'], night: ['#e9c58f', 0.07, '#1a1510', '#9fb6e0'] },
  seigaiha: { p: 'seigaiha', day: ['#1f4e8c', 0.13, '#e9eef5', '#1f4e8c'], night: ['#9cc0f0', 0.09, '#111b2c', '#9cc0f0'] },
  washi:    { p: 'washi',    day: ['#3b3226', 0.16, '#f1ece2', '#3b3226'], night: ['#e8dfd0', 0.10, '#1a1917', '#e8dfd0'] },
  talavera: { p: 'talavera', day: ['#1f4e9c', 0.12, '#eef2f8', '#d9a21b'], night: ['#8fb0ff', 0.08, '#0f1830', '#e8c060'] },
  mudcloth: { p: 'mudcloth', day: ['#3e2a1a', 0.12, '#e8dcc6', '#3e2a1a'], night: ['#f0dcbc', 0.08, '#241a12', '#f0dcbc'] },
  kuba:     { p: 'kuba',     day: ['#5a3a15', 0.12, '#eadfc6', '#5a3a15'], night: ['#e6c98a', 0.08, '#1f190f', '#e6c98a'] },
  koru:     { p: 'koru',     day: ['#a4281b', 0.10, '#f1ece6', '#141414'], night: ['#e86a55', 0.08, '#161211', '#f2ece6'] },
  meander:  { p: 'meander',  day: ['#9c4320', 0.14, '#efe3d4', '#9c4320'], night: ['#e8955f', 0.10, '#17110d', '#e8955f'] },
  selbu:    { p: 'selbu',    day: ['#b3202a', 0.09, '#f1eeea', '#1d2b45'], night: ['#ff8a8a', 0.07, '#181416', '#c9d6ee'] },
  andean:   { p: 'andean',   day: ['#a33a1f', 0.12, '#efe5d8', '#1f3354'], night: ['#f08a4b', 0.09, '#1b130e', '#a9c0e8'] },
};

// Lighter in the binder, where most of the text sits; a little stronger on the title bar,
// the Library and behind the preview.
const PLACES = ['.titlebar', '.library', '.preview-pane'];
const sel = (id, places) => places.map((p) => `html[data-skin="${id}"] ${p}`).join(', ');
const BINDER = 0.9;
// How strong the artwork is everywhere (it was drawn so faintly it could hardly be seen).
const STRENGTH = 1.8;

/** The CSS for every skin's pattern (and the matching swatch in Settings › Appearance). */
export function skinArtCss() {
  let out = '';
  // !important: no other background rule in the app may hide the artwork (High contrast uses its own skin, which has none).
  const rule = (id, places, pat) => `${sel(id, places)}{background-image:${pat.image} !important;background-size:${pat.size} !important;background-repeat:repeat !important;}`;
  for (const [id, { p, day, night }] of Object.entries(SKIN_ART)) {
    const make = ([ink, a, paper, dot], k = 1) => PATTERNS[p](ink, +Math.min(0.5, a * k * STRENGTH).toFixed(3), paper, dot);
    out += rule(id, PLACES, make(day)) + rule(id, ['.sidebar'], make(day, BINDER)) + '\n';
    out += `@media (prefers-color-scheme: dark){${rule(id, PLACES, make(night))}${rule(id, ['.sidebar'], make(night, BINDER))}}\n`;
    const sw = make(day, Math.min(3, 0.5 / day[1]) / STRENGTH);
    const swn = make(night, Math.min(3, 0.5 / night[1]) / STRENGTH);
    out += `.skin-sw.tex-${id}{background-image:${sw.image};background-size:${sw.size};}\n`;
    out += `@media (prefers-color-scheme: dark){.skin-sw.tex-${id}{background-image:${swn.image};}}\n`;
  }
  return out;
}

let styleEl = null;
/** Adds the skin patterns to the page once (the CSP allows the app's own inline styles). */
export function installSkinArt() {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.id = 'skin-art';
  styleEl.textContent = skinArtCss();
  document.head.append(styleEl);
}
