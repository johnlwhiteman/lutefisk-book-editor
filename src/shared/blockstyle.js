// The look of code blocks and display equations, set per book (Book settings ›
// General): a background color (none by default), padding, and for display
// equations a border. Written as CSS after the template, so it wins.
export const BLOCK_BG = [['', 'None'], ['#f6f8fa', 'Mist'], ['#f3f1ec', 'Stone'], ['#fbf6e9', 'Cream'], ['#eef7f1', 'Mint'], ['#eef4fb', 'Sky'], ['#f4f0fb', 'Lavender'], ['#fdf0ef', 'Blush']];
export const MATH_BORDERS = [[0, 'No border'], [1, 'Thin border'], [2, 'Medium border'], [3, 'Thick border']];
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));

/** The book's settings, cleaned: { code: { bg, pad }, math: { bg, border, pad } } (pad in em). */
export function blockStyles(book) {
  const c = book?.codeStyle || {};
  const m = book?.mathStyle || {};
  return {
    code: { bg: HEX.test(c.bg || '') ? c.bg.toLowerCase() : '', pad: num(c.pad, 3) },
    math: { bg: HEX.test(m.bg || '') ? m.bg.toLowerCase() : '', border: Math.round(num(m.border, 3)), pad: num(m.pad, 3) },
  };
}

/** CSS for the book's code and equation blocks under `scope`. color false → gray backgrounds (print/e-ink). */
export function blockStyleCss(book, scope = '.bk', { color = true } = {}) {
  const { code, math } = blockStyles(book);
  const gray = (hex) => {
    if (color || !hex) return hex;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const v = y.toString(16).padStart(2, '0');
    return `#${v}${v}${v}`;
  };
  let css = '';
  if (code.bg || code.pad) {
    css += `${scope} pre.bk-code.bk-code{${code.bg ? `background:${gray(code.bg)};` : ''}${code.pad ? `padding:${code.pad}em ${(code.pad * 1.3).toFixed(2)}em;border-radius:4px;` : ''}}\n`;
  }
  if (math.bg || math.pad || math.border) {
    css += `${scope} .bk-math-d.bk-math-d{${math.bg ? `background:${gray(math.bg)};` : ''}${math.pad ? `padding:${math.pad}em ${(math.pad * 1.3).toFixed(2)}em;` : ''}${math.border ? `border:${math.border}px solid #8c959f;` : ''}${math.bg || math.border ? 'border-radius:4px;' : ''}}\n`;
  }
  return css;
}
