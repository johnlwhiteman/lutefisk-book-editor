// Artwork papers for the print preview: faint, original drawings of traditional
// patterns from around the world, behind the text. Preview only — the PDF has a
// white page. Each is a small SVG, kept light enough that the text stays easy to read.
//
// region: the heading it's listed under. The first six are drawn in print.css.

const svg = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/* Japan — seigaiha, the "blue ocean waves" of overlapping scales */
const seigaiha = (() => {
  const scale = (x, y) => [20, 15, 10, 5].map((r) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#fbfaf6' stroke='#24476b' stroke-opacity='.17' stroke-width='1'/>`).join('');
  return svg(40, 20, `${scale(20, 0)}${scale(0, 10)}${scale(40, 10)}${scale(20, 20)}${scale(0, 30)}${scale(40, 30)}`);
})();

/* Japan — asanoha, the hemp-leaf star */
const asanoha = (() => {
  const w = 60, hh = 34.64; // equilateral grid
  const pts = [[0, 0], [w / 2, 0], [w, 0], [0, hh], [w / 2, hh], [w, hh], [w / 4, hh / 2], [(3 * w) / 4, hh / 2]];
  const cx = [[w / 4, hh / 2], [(3 * w) / 4, hh / 2]];
  let d = `M0 0H${w}M0 ${hh}H${w}M0 0L${w / 2} ${hh}L${w} 0M${w / 2} 0L0 ${hh}M${w / 2} 0L${w} ${hh}`;
  for (const [x, y] of cx) for (const [px, py] of pts) if (Math.hypot(px - x, py - y) < 20) d += `M${x} ${y}L${px} ${py}`;
  return svg(w, hh, `<path d='${d}' fill='none' stroke='#5b3b6b' stroke-opacity='.17' stroke-width='1'/>`);
})();

/* China — xiangyun, curling "auspicious clouds", in the corners */
const xiangyun = svg(320, 200, `<g fill='none' stroke='#a8322d' stroke-opacity='.13' stroke-width='3' stroke-linecap='round'>
<path d='M30 150c-18 0-26-22-10-30 8-4 18 0 18 9 0 6-6 9-10 6'/>
<path d='M38 129c4-24 34-30 46-12 6-14 30-16 38 0 14-6 30 4 26 18-2 8-12 10-16 4'/>
<path d='M48 150h120c18 0 26-16 16-26'/>
<path d='M118 117c2-10 14-12 18-4 3 6-2 11-7 9'/>
<path d='M190 70c-14 0-20-17-8-23 6-3 14 0 14 7 0 5-5 7-8 5'/>
<path d='M196 54c3-18 26-23 35-9 5-11 23-12 29 0 11-5 23 3 20 14-2 6-9 8-12 3'/>
<path d='M204 70h90'/></g>`);

/* Indonesia — mega mendung, the layered clouds of Cirebon batik */
const megamendung = (() => {
  const cloud = 'M20 120c-14 0-18-20-4-24-2-16 18-24 28-12 6-18 34-20 42-2 14-8 32 2 28 18 14 2 16 22 2 24z';
  const rings = [1, 0.84, 0.68, 0.52, 0.36].map((k, i) => `<path d='${cloud}' transform='translate(${70 - 70 * k} ${110 - 110 * k}) scale(${k})' fill='${i % 2 ? '#fbf6ee' : '#2c4f7c'}' fill-opacity='${i % 2 ? 1 : 0.1}' stroke='#2c4f7c' stroke-opacity='.16' stroke-width='${1.6 / k}'/>`).join('');
  return svg(140, 140, rings);
})();

/* India — buta (paisley), in offset rows */
const paisley = (() => {
  const p = (x, y, r) => `<g transform='translate(${x} ${y}) rotate(${r})'><path d='M0-18c14 0 18 18 10 28-7 9-21 8-23-1-2-8 6-11 10-6 2 3 0 6-3 5' fill='none' stroke='#8a3b5e' stroke-opacity='.15' stroke-width='1.4'/><path d='M1-10c8 2 9 13 4 18' fill='none' stroke='#b5651d' stroke-opacity='.15' stroke-width='1'/><circle cx='-2' cy='3' r='1.6' fill='#b5651d' fill-opacity='.15'/></g>`;
  return svg(80, 80, `${p(22, 24, -20)}${p(62, 64, -20)}`);
})();

/* Aotearoa New Zealand (Māori) — kōwhaiwhai-style koru, as bands at top and bottom */
const koru = (() => {
  const one = `<path d='M0 36H22c12 0 18-8 18-16s-6-14-14-14c-7 0-12 5-12 11 0 5 4 9 9 9 4 0 7-3 7-7 0-3-2-5-5-5' fill='none' stroke='#8b2e1f' stroke-opacity='.22' stroke-width='3' stroke-linecap='round'/>`;
  return svg(80, 42, `${one}<g transform='translate(80 42) rotate(180)'>${one}</g><circle cx='26' cy='18' r='2.5' fill='#1e1e1e' fill-opacity='.18'/><circle cx='54' cy='24' r='2.5' fill='#1e1e1e' fill-opacity='.18'/>`);
})();

/* Islamic geometry — the eight-pointed star (khatam), linked into a lattice */
const khatam = (() => {
  const c = 24, a = 9;
  const sq = (rot) => `<rect x='${c - a}' y='${c - a}' width='${2 * a}' height='${2 * a}' transform='rotate(${rot} ${c} ${c})'/>`;
  const t = a * Math.SQRT2;
  const links = `M${c} ${c - t}V0M${c} ${c + t}V48M${c - t} ${c}H0M${c + t} ${c}H48`;
  return svg(48, 48, `<g fill='none' stroke='#1d4e89' stroke-opacity='.13' stroke-width='1.1'>${sq(0)}${sq(45)}<path d='${links}'/><circle cx='${c}' cy='${c}' r='3.2'/></g><g fill='#0f7c74' fill-opacity='.08'><path d='M0 0h6L0 6zM48 0h-6l6 6zM0 48h6L0 42zM48 48h-6l6-6z'/></g>`);
})();

/* Mali — bògòlanfini (mud cloth): lines, crosses and dots */
const mudcloth = svg(64, 64, `<g stroke='#4a3424' stroke-opacity='.15' stroke-width='1.6' stroke-linecap='round' fill='none'>
<path d='M0 2H64M0 62H64M2 8V56M62 8V56'/><path d='M14 14l6 6m0-6l-6 6M44 14l6 6m0-6l-6 6M14 44l6 6m0-6l-6 6M44 44l6 6m0-6l-6 6'/>
<path d='M24 32l4-4 4 4 4-4 4 4'/></g><g fill='#4a3424' fill-opacity='.15'><circle cx='32' cy='14' r='1.6'/><circle cx='32' cy='50' r='1.6'/><circle cx='14' cy='32' r='1.6'/><circle cx='50' cy='32' r='1.6'/></g>`);

/* Congo — Kuba cloth: interlocking diamonds */
const kuba = svg(40, 40, `<g fill='none' stroke='#6b4423' stroke-opacity='.14' stroke-width='1.3'><path d='M20 2L38 20 20 38 2 20z'/><path d='M20 10L30 20 20 30 10 20z'/><path d='M0 0L6 6M40 0l-6 6M0 40l6-6M40 40l-6-6'/></g><rect x='18' y='18' width='4' height='4' fill='#6b4423' fill-opacity='.14'/>`);

/* Greece — the meander (Greek key), as bands at top and bottom */
const meander = svg(32, 24, `<path d='M0 21H32M0 2H32M22 21V6H6V16H16V11' fill='none' stroke='#2b3f5c' stroke-opacity='.26' stroke-width='2'/>`);

/* Norway — the eight-petal star of Selbu knitting */
const selbu = (() => {
  const petal = "M24 24L27.5 15 24 6 20.5 15z";
  const petals = [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<path d='${petal}' transform='rotate(${r} 24 24)'/>`).join('');
  return svg(48, 48, `<g fill='#9b2335' fill-opacity='.10'>${petals}</g><g fill='#1f3a5f' fill-opacity='.10'><rect x='0' y='0' width='3' height='3'/><rect x='45' y='0' width='3' height='3'/><rect x='0' y='45' width='3' height='3'/><rect x='45' y='45' width='3' height='3'/></g>`);
})();

/* Andes — stepped tocapu, as bands at top and bottom */
const andean = svg(40, 22, `<path d='M0 22V17H5V12H10V7H15V2H25V7H30V12H35V17H40V22' fill='#b0532d' fill-opacity='.10' stroke='#7a3a1d' stroke-opacity='.18' stroke-width='1'/><rect x='17' y='9' width='6' height='6' fill='#22303f' fill-opacity='.14'/>`);

/* Mexico — Talavera tile: a blue four-petal flower with corner quarters */
const talavera = svg(56, 56, `<g fill='#1f4e9c' fill-opacity='.09' stroke='#1f4e9c' stroke-opacity='.16' stroke-width='1'>
<ellipse cx='28' cy='16' rx='5' ry='10'/><ellipse cx='28' cy='40' rx='5' ry='10'/><ellipse cx='16' cy='28' rx='10' ry='5'/><ellipse cx='40' cy='28' rx='10' ry='5'/>
<path d='M0 0h10a10 10 0 0 1-10 10zM56 0v10A10 10 0 0 1 46 0zM0 56V46a10 10 0 0 1 10 10zM56 56H46a10 10 0 0 1 10-10z'/></g><circle cx='28' cy='28' r='4' fill='#d9a21b' fill-opacity='.18'/>`);

/* Indonesia — batik truntum: small star-flowers scattered like a night sky */
const truntum = (() => {
  const star = (x, y, r) => {
    const pts = Array.from({ length: 16 }, (_, i) => { const a = (i * Math.PI) / 8; const rr = i % 2 ? r * 0.45 : r; return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`; }).join(' ');
    return `<polygon points='${pts}' fill='none' stroke='#3e2a1c' stroke-opacity='.17' stroke-width='1'/><circle cx='${x}' cy='${y}' r='${(r * 0.18).toFixed(1)}' fill='#3e2a1c' fill-opacity='.17'/>`;
  };
  return svg(60, 60, `${star(15, 15, 8)}${star(45, 45, 8)}${star(45, 13, 3)}${star(14, 46, 3)}<g fill='#3e2a1c' fill-opacity='.14'><circle cx='30' cy='30' r='1.2'/><circle cx='2' cy='30' r='1'/><circle cx='30' cy='2' r='1'/></g>`);
})();

/* Indonesia — batik ceplok: a repeating four-petal flower in a square grid */
const ceplok = svg(48, 48, `<g fill='none' stroke='#5a3a22' stroke-opacity='.16' stroke-width='1.1'>
<path d='M24 6c6 6 6 12 0 18-6-6-6-12 0-18zM24 42c6-6 6-12 0-18-6 6-6 12 0 18zM6 24c6-6 12-6 18 0-6 6-12 6-18 0zM42 24c-6-6-12-6-18 0 6 6 12 6 18 0z'/>
<circle cx='24' cy='24' r='3'/><path d='M0 0l7 7M48 0l-7 7M0 48l7-7M48 48l-7-7'/></g><g fill='#1f3a5f' fill-opacity='.12'><circle cx='0' cy='0' r='3'/><circle cx='48' cy='0' r='3'/><circle cx='0' cy='48' r='3'/><circle cx='48' cy='48' r='3'/></g>`);

/*
 * Aotearoa — kirituhi: Māori-inspired skin art (tā moko itself is personal and
 * sacred; kirituhi is the form made for anyone). A takarangi double spiral with
 * pakati notches and unaunahi scales, flowing from two corners.
 */
const kirituhi = (() => {
  const cx = 110, cy = 110;
  const spiral = (rot) => {
    let d = '';
    for (let i = 0; i <= 150; i++) {
      const t = (i / 150) * Math.PI * 5; const r = 6 + t * 4.2; const a = t + rot;
      d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    }
    return `<path d='${d}' fill='none' stroke='#141414' stroke-opacity='.2' stroke-width='3' stroke-linecap='round'/>`;
  };
  let ticks = '';
  for (let a = 200; a <= 340; a += 7) {
    const r1 = 82, r2 = 92, rad = (a * Math.PI) / 180;
    ticks += `M${(cx + r1 * Math.cos(rad)).toFixed(1)} ${(cy + r1 * Math.sin(rad)).toFixed(1)}L${(cx + r2 * Math.cos(rad)).toFixed(1)} ${(cy + r2 * Math.sin(rad)).toFixed(1)}`;
  }
  let scales = '';
  for (let a = 20; a <= 160; a += 14) {
    const rad = (a * Math.PI) / 180; const x = cx + 88 * Math.cos(rad), y = cy + 88 * Math.sin(rad);
    scales += `M${(x - 6).toFixed(1)} ${y.toFixed(1)}a6 6 0 0 0 12 0`;
  }
  return svg(220, 220, `${spiral(0)}${spiral(Math.PI)}<circle cx='${cx}' cy='${cy}' r='97' fill='none' stroke='#141414' stroke-opacity='.16' stroke-width='2'/><circle cx='${cx}' cy='${cy}' r='78' fill='none' stroke='#141414' stroke-opacity='.14' stroke-width='1.2'/><path d='${ticks}' stroke='#141414' stroke-opacity='.2' stroke-width='1.6'/><path d='${scales}' fill='none' stroke='#141414' stroke-opacity='.18' stroke-width='1.4'/>`);
})();

/* Borneo (Dayak) — bunga terung, the "eggplant flower" rosette of Dayak tattoo art */
const bungaTerung = (() => {
  const c = 45;
  const petal = `M${c} ${c - 9}C${c + 7} ${c - 20} ${c + 5} ${c - 31} ${c} ${c - 35}C${c - 5} ${c - 31} ${c - 7} ${c - 20} ${c} ${c - 9}z`;
  const petals = [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<path d='${petal}' transform='rotate(${r} ${c} ${c})'/>`).join('');
  let spiral = '';
  for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 3; const r = 1 + t * 0.75; spiral += `${i ? 'L' : 'M'}${(c + r * Math.cos(t)).toFixed(1)} ${(c + r * Math.sin(t)).toFixed(1)}`; }
  return svg(90, 90, `<g fill='#141414' fill-opacity='.05' stroke='#141414' stroke-opacity='.13' stroke-width='1'>${petals}</g><circle cx='${c}' cy='${c}' r='9' fill='#faf6ee' stroke='#141414' stroke-opacity='.15' stroke-width='1.2'/><path d='${spiral}' fill='none' stroke='#141414' stroke-opacity='.17' stroke-width='1.1'/><g fill='#141414' fill-opacity='.14'><circle cx='0' cy='0' r='2'/><circle cx='90' cy='0' r='2'/><circle cx='0' cy='90' r='2'/><circle cx='90' cy='90' r='2'/></g>`);
})();

/* Lakota — the morning star quilt: eight points built from diamonds, one large star */
const starQuilt = (() => {
  const colors = ['#b22d2d', '#d99a1e', '#1f4e8c', '#b22d2d', '#d99a1e'];
  const d = 14; // diamond step
  let g = '';
  for (let k = 0; k < 8; k++) {
    let arm = '';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5 - i; j++) {
      const x = (i + j) * d * 0.7071, y = (j - i) * d * 0.7071 * 0.5;
      arm += `<path d='M${(30 + x).toFixed(1)} ${y.toFixed(1)}l${(d * 0.7071).toFixed(1)} ${(-d * 0.35).toFixed(1)}l${(d * 0.7071).toFixed(1)} ${(d * 0.35).toFixed(1)}l${(-d * 0.7071).toFixed(1)} ${(d * 0.35).toFixed(1)}z' fill='${colors[(i + j) % 5]}'/>`;
    }
    g += `<g transform='rotate(${k * 45})'>${arm}</g>`;
  }
  return svg(400, 400, `<g transform='translate(200 200)' fill-opacity='.10' stroke='#3a2a1a' stroke-opacity='.10' stroke-width='.6'>${g}</g><circle cx='200' cy='200' r='22' fill='none' stroke='#3a2a1a' stroke-opacity='.14'/>`);
})();

/* Comanche — a beadwork band: stepped triangles and crosses, top and bottom */
const beadwork = svg(48, 26, `<rect width='48' height='26' fill='#2f6f8f' fill-opacity='.06'/>
<path d='M0 24h4v-4h4v-4h4v-4h4v4h4v4h4v4h4' fill='#b23a2e' fill-opacity='.3'/><path d='M24 24h4v-4h4v-4h4v-4h4v4h4v4h4v4' fill='#e0a526' fill-opacity='.34'/>
<path d='M14 3h4v3h3v4h-3v3h-4v-3h-3v-4h3z' fill='#1f3f6e' fill-opacity='.32'/><path d='M38 3h4v3h3v4h-3v3h-4v-3h-3v-4h3z' fill='#2f7a4f' fill-opacity='.32'/>
<path d='M0 25.5H48M0 .5H48' stroke='#3a2a1a' stroke-opacity='.2'/>`);

/* Apache — basketry: a coiled-basket feel with zigzag lightning rows and steps */
const basketry = svg(72, 48, `<g fill='none' stroke='#5a3b1e' stroke-opacity='.18' stroke-width='2' stroke-linejoin='miter'>
<path d='M0 12l9-8 9 8 9-8 9 8 9-8 9 8 9-8 9 8'/></g><g fill='#3a2a1a' fill-opacity='.14'><path d='M10 30h6v-4h6v-4h4v4h6v4h6v4h-6v4h-6v4h-4v-4h-6v-4h-6z'/><path d='M50 26h4v4h4v4h-4v4h-4v-4h-4v-4h4z'/></g>
<path d='M0 46.5H72' stroke='#5a3b1e' stroke-opacity='.1' stroke-dasharray='2 3'/>`);

/* Russia — prison tattoo art: eight-pointed compass stars at the shoulders, and onion domes */
const prisonStar = (() => {
  const pts = Array.from({ length: 16 }, (_, i) => { const a = (i * Math.PI) / 8 - Math.PI / 2; const r = i % 2 ? 14 : 44; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; });
  const outline = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}z`;
  let shade = '';
  for (let i = 0; i < 16; i += 2) { const [x, y] = pts[i]; const [nx, ny] = pts[(i + 1) % 16]; shade += `M50 50L${x.toFixed(1)} ${y.toFixed(1)}L${nx.toFixed(1)} ${ny.toFixed(1)}z`; }
  return svg(100, 100, `<path d='${shade}' fill='#1a2a44' fill-opacity='.16'/><path d='${outline}' fill='none' stroke='#1a2a44' stroke-opacity='.3' stroke-width='1.6'/><circle cx='50' cy='50' r='4' fill='#1a2a44' fill-opacity='.25'/>`);
})();
const domes = svg(240, 150, `<g fill='none' stroke='#1a2a44' stroke-opacity='.15' stroke-width='1.6'>
<path d='M40 150V80h40v70M120 150V60h40v90M200 150V85h30v65'/>
<path d='M38 80c0-14 22-18 22-34 0 16 22 20 22 34z'/><path d='M60 46v-14M55 37h10'/>
<path d='M116 60c0-18 24-24 24-44 0 20 24 26 24 44z'/><path d='M140 16V0M134 6h12M136 11l8 2'/>
<path d='M198 85c0-12 17-15 17-28 0 13 17 16 17 28z'/><path d='M215 57V45M211 50h8'/>
<path d='M30 150h210M120 108h40M128 150v-24a12 12 0 0 1 24 0v24'/></g>`);

/* USA — hobo signs: the chalk marks travelers left on fences and gateposts.
   A circle with an X (a good place for a meal), a top hat (a well-off home), a cat
   (a kind woman lives here), a cross (sit through a sermon, get a meal), linked
   circles (police — keep moving) and a circle with two arrows (leave fast). */
const hobo = svg(220, 220, `<g fill='none' stroke='#3b3a36' stroke-opacity='.2' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>
<g transform='translate(36 38)'><circle r='15'/><path d='M-9-9l18 18M9-9l-18 18'/></g>
<g transform='translate(150 30)'><path d='M-12 10h24M-8 10V-10h16v20M-8 4h16'/></g>
<g transform='translate(104 104)'><circle cy='-10' r='8'/><path d='M-6-16l-2-8 6 4M6-16l2-8-6 4M-8-4c-6 6-6 22 2 26h12c8-4 8-20 2-26M8 18c8 0 12-6 8-12'/></g>
<g transform='translate(186 120)'><path d='M0-16v32M-10-6h20'/></g>
<g transform='translate(42 168)'><circle cx='-9' r='10'/><circle cx='9' r='10'/></g>
<g transform='translate(160 186)'><circle r='14'/><path d='M-24-6h-12M-24 6h-12M-30-12l-6 6 6 6M-30 0l-6 6 6 6'/></g>
</g>`);

/**
 * Every artwork paper: [id, label (with where it comes from), region, background]. The first six are in
 * print.css; the rest are generated here.
 */
export const ART_PAPERS = [
  ['washi', 'Washi Paper (Japan)', 'East Asia', null],
  ['seigaiha', 'Seigaiha Waves (Japan)', 'East Asia', `${seigaiha} 0 0 / 40px 20px repeat, #fbfaf6`],
  ['asanoha', 'Asanoha Hemp Leaf (Japan)', 'East Asia', `${asanoha} 0 0 / 60px 34.64px repeat, #fbf9f6`],
  ['sakura', 'Cherry Blossom (Japan)', 'East Asia', null],
  ['inkwash', 'Ink Wash Mountains (China)', 'East Asia', null],
  ['bamboo', 'Ink Bamboo (China)', 'East Asia', null],
  ['xiangyun', 'Auspicious Clouds (China)', 'East Asia', `${xiangyun} right -20px top 6px / 62% auto no-repeat, #fdf9f3`],
  ['kawung', 'Batik Kawung (Indonesia)', 'South and Southeast Asia', null],
  ['parang', 'Batik Parang (Indonesia)', 'South and Southeast Asia', null],
  ['megamendung', 'Mega Mendung Clouds (Indonesia)', 'South and Southeast Asia', `${megamendung} left -10px bottom -6px / 46% auto no-repeat, #fbf6ee`],
  ['truntum', 'Batik Truntum (Indonesia)', 'South and Southeast Asia', `${truntum} 0 0 / 60px 60px repeat, #fbf5ec`],
  ['ceplok', 'Batik Ceplok (Indonesia)', 'South and Southeast Asia', `${ceplok} 0 0 / 48px 48px repeat, #fbf6ee`],
  ['bungaterung', 'Bunga Terung (Dayak, Borneo)', 'South and Southeast Asia', `${bungaTerung} 0 0 / 120px 120px repeat, #faf6ee`],
  ['paisley', 'Paisley (India)', 'South and Southeast Asia', `${paisley} 0 0 / 80px 80px repeat, #fcf7f0`],
  ['koru', 'Kōwhaiwhai Koru (Māori, Aotearoa)', 'Pacific', `${koru} 0 4px / 80px 42px repeat-x, ${koru} 0 calc(100% - 4px) / 80px 42px repeat-x, #fbf7f2`],
  ['kirituhi', 'Kirituhi Spirals (Māori-inspired)', 'Pacific', `${kirituhi} right -60px top -60px / 58% auto no-repeat, ${kirituhi} left -60px bottom -60px / 58% auto no-repeat, #faf7f1`],
  ['khatam', 'Eight-Pointed Star (Islamic geometry)', 'Middle East and Africa', `${khatam} 0 0 / 48px 48px repeat, #f9f8f3`],
  ['mudcloth', 'Bògòlan Mud Cloth (Mali)', 'Middle East and Africa', `${mudcloth} 0 0 / 64px 64px repeat, #f6efe3`],
  ['kuba', 'Kuba Cloth (Congo)', 'Middle East and Africa', `${kuba} 0 0 / 40px 40px repeat, #f7f0e4`],
  ['meander', 'Greek Key (Greece)', 'Europe', `${meander} 0 6px / 32px 24px repeat-x, ${meander} 0 calc(100% - 6px) / 32px 24px repeat-x, #fbfaf6`],
  ['prison', 'Russian Prison Tattoo Stars and Domes', 'Europe', `${prisonStar} left 14px top 14px / 64px 64px no-repeat, ${prisonStar} right 14px top 14px / 64px 64px no-repeat, ${domes} center bottom 18px / 62% auto no-repeat, #f7f6f2`],
  ['selbu', 'Selbu Star (Norway)', 'Europe', `${selbu} 0 0 / 48px 48px repeat, #fbfaf7`],
  ['andean', 'Andean Steps (Peru and Bolivia)', 'Americas', `${andean} 0 4px / 40px 22px repeat-x, ${andean} 0 calc(100% - 4px) / 40px 22px repeat-x, #fbf6ef`],
  ['starquilt', 'Morning Star Quilt (Lakota)', 'Americas', `${starQuilt} center / 115% auto no-repeat, #fbf8f2`],
  ['beadwork', 'Beadwork Band (Comanche)', 'Americas', `${beadwork} 0 6px / 64px 35px repeat-x, ${beadwork} 0 calc(100% - 6px) / 64px 35px repeat-x, #fbf7f0`],
  ['basketry', 'Basketry Zigzag (Apache)', 'Americas', `${basketry} 0 0 / 72px 48px repeat, #fbf6ec`],
  ['hobo', 'Hobo Signs (USA)', 'Americas', `${hobo} 0 0 / 220px 220px repeat, #f8f6f1`],
  ['talavera', 'Talavera Tile (Mexico)', 'Americas', `${talavera} 0 0 / 56px 56px repeat, #fbfaf6`],
];

/** CSS for the generated artwork papers. */
export function artCss() {
  return ART_PAPERS.filter((a) => a[3])
    .map(([id, , , bg]) => `.pp-stage.paper-${id} .pp-page:not(.pp-cover):not(.empty){background:${bg};}`)
    .join('\n');
}
