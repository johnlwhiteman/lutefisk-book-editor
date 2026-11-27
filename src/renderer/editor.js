// Rich-text editor (Quill-style toolbar) built on ProseMirror. The document
// is stored as Markdown; this module converts both ways.
import { Schema, Fragment, Slice } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, Selection, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift, chainCommands, exitCode } from 'prosemirror-commands';
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, ellipsis, emDash, InputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { tableNodes, tableEditing, goToNextCell, addRowAfter, addRowBefore, addColumnAfter, addColumnBefore, deleteRow, deleteColumn, deleteTable, isInTable, selectedRect } from 'prosemirror-tables';
import { createMarkdown, extractFootnotes, safeAssetPath, cleanBullet } from '../shared/markdown.js';
import { h, icon, dialog, assetUrl, popover, setHtml, bumpAsset, toast, closePopovers, segmented } from './ui.js';
import { openDrawingEditor } from './drawing-editor.js';
import { texToMathml } from '../shared/math.js';
import { harperPlugin, lintAt, lintsIn, wasChecked, ignoreLint, recheck as harperRecheck } from './spellcheck.js';
import { highlightRanges, CODE_LANGUAGES, CODE_BORDERS, CODE_PADS, CODE_ALIGNS, normalizeLang, parseCodeInfo, codeInfo, CODE_CSS } from '../shared/code.js';
import { openMathDialog } from './math-dialog.js';
import { openSymbolPicker } from './symbol-picker.js';
import { CASES, changeCase } from '../shared/textcase.js';
import { typoEdits } from '../shared/typography.js';
import { linkInfo, describeWhen, normalizeUrl, displayUrl, looksLikeUrl } from '../shared/linkinfo.js';
import { mentionRegex } from '../shared/characters.js';
import { MARK_GROUPS, MARKS, GUIDE_RULES, GUIDES, markType, markText, canApply, newReviewId, INKS } from '../shared/review.js';
const INK_IDS = Object.keys(INKS);
import { canJoin } from 'prosemirror-transform';


/* ------------------------------------------------------------------ schema */

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    blockquote: { content: 'block+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
    // kind 'scene' is a scene break (* * *, the template's ornament); 'line' is a plain horizontal line (___).
    horizontal_rule: {
      attrs: { kind: { default: 'scene' } }, group: 'block',
      parseDOM: [{ tag: 'hr', getAttrs: (d) => ({ kind: d.classList.contains('pm-rule') ? 'line' : 'scene' }) }],
      toDOM: (n) => (n.attrs.kind === 'line' ? ['hr', { class: 'pm-rule' }] : ['div', { class: 'pm-scene', contenteditable: 'false' }, ['hr']]),
    },
    page_break: { group: 'block', atom: true, selectable: true, parseDOM: [{ tag: 'div.pm-pagebreak' }], toDOM: () => ['div', { class: 'pm-pagebreak', contenteditable: 'false', title: 'Page break — the next text starts on a new page' }, ['span', 'Page break']] },
    heading: {
      attrs: { level: { default: 2 } }, content: 'inline*', group: 'block', defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((l) => ({ tag: `h${l}`, attrs: { level: l } })),
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    /* Left/center/right/justified text, saved as a Pandoc-style ::: fenced div. */
    align: {
      attrs: { align: { default: 'center' } }, content: 'block+', group: 'block', defining: true,
      parseDOM: [{ tag: 'div.pm-align', getAttrs: (d) => ({ align: d.dataset.align || 'center' }) }],
      toDOM: (n) => ['div', { class: `pm-align pm-align-${n.attrs.align}`, 'data-align': n.attrs.align }, 0],
    },
    ordered_list: {
      content: 'list_item+', group: 'block', attrs: { order: { default: 1 }, tight: { default: false } },
      parseDOM: [{ tag: 'ol' }], toDOM: (n) => ['ol', n.attrs.order === 1 ? {} : { start: n.attrs.order }, 0],
    },
    bullet_list: {
      content: 'list_item+', group: 'block', attrs: { tight: { default: false }, symbol: { default: '' } },
      parseDOM: [{ tag: 'ul', getAttrs: (d) => ({ symbol: cleanBullet(d.dataset.bullet) }) }],
      toDOM: (n) => (n.attrs.symbol ? ['ul', { class: 'pm-bullets', 'data-bullet': n.attrs.symbol, style: `--bullet:${JSON.stringify(`${n.attrs.symbol} `)}` }, 0] : ['ul', 0]),
    },
    list_item: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    text: { group: 'inline' },
    code_block: {
      content: 'text*', marks: '', group: 'block', code: true, defining: true,
      attrs: { params: { default: '' }, lineNumbers: { default: false }, colors: { default: true }, border: { default: 0 }, align: { default: 'left' }, pad: { default: null }, comment: { default: null } },
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (d) => ({ params: d.getAttribute('data-lang') || '', lineNumbers: d.hasAttribute('data-linenums'), colors: !d.hasAttribute('data-nocolor'), border: Math.min(3, Number(d.getAttribute('data-border')) || 0), align: ['center', 'right'].includes(d.getAttribute('data-align')) ? d.getAttribute('data-align') : 'left', pad: d.hasAttribute('data-pad') ? Math.max(0, Math.min(4, Number(d.getAttribute('data-pad')) || 0)) : null }) }],
      toDOM: (n) => ['pre', { class: 'pm-code', 'data-lang': n.attrs.params, ...(n.attrs.lineNumbers ? { 'data-linenums': '' } : {}), ...(n.attrs.colors === false ? { 'data-nocolor': '' } : {}), ...(n.attrs.border ? { 'data-border': String(n.attrs.border) } : {}), ...(n.attrs.align !== 'left' ? { 'data-align': n.attrs.align } : {}), ...(n.attrs.pad != null ? { 'data-pad': String(n.attrs.pad) } : {}) }, ['code', 0]],
    },
    image: {
      inline: true, group: 'inline', draggable: true,
      attrs: { src: {}, alt: { default: '' }, title: { default: '' }, width: { default: null }, align: { default: 'center' }, wrap: { default: 'topbottom' }, drawing: { default: null }, rev: { default: 0 } },
      parseDOM: [{ tag: 'img[data-src]', getAttrs: (d) => ({ src: d.getAttribute('data-src'), alt: d.getAttribute('alt') || '' }) }],
      toDOM: (n) => ['img', { 'data-src': n.attrs.src, src: assetUrl(n.attrs.src), alt: n.attrs.alt }],
    },
    footnote: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { text: { default: '' } },
      parseDOM: [{ tag: 'sup.pm-fn', getAttrs: (d) => ({ text: d.getAttribute('data-text') || '' }) }],
      toDOM: (n) => ['sup', { class: 'pm-fn', 'data-text': n.attrs.text }],
    },
    citation: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { ref: {}, locator: { default: '' } },
      parseDOM: [{ tag: 'span.pm-cite', getAttrs: (d) => ({ ref: d.getAttribute('data-ref'), locator: d.getAttribute('data-locator') || '' }) }],
      toDOM: (n) => ['span', { class: 'pm-cite', 'data-ref': n.attrs.ref, 'data-locator': n.attrs.locator }],
    },
    math: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { tex: { default: '' }, display: { default: false } },
      parseDOM: [{ tag: 'span.pm-math', getAttrs: (d) => ({ tex: d.getAttribute('data-tex') || '', display: d.hasAttribute('data-display') }) }],
      toDOM: (n) => ['span', { class: 'pm-math', 'data-tex': n.attrs.tex, ...(n.attrs.display ? { 'data-display': '' } : {}) }],
    },
    ...tableNodes({
      tableGroup: 'block', cellContent: 'inline*',
      cellAttributes: {
        align: {
          default: null,
          getFromDOM: (d) => d.style.textAlign || null,
          setDOMAttr: (v, attrs) => { if (v) attrs.style = `${attrs.style || ''}text-align:${v};`; },
        },
      },
    }),
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    /* Review mode: a proofreader's mark at a point (insert, ¶, a comma…). Editor only — never in the book. */
    review_point: {
      inline: true, group: 'inline', atom: true, selectable: false,
      attrs: { id: {}, type: { default: 'ins' } },
      parseDOM: [{ tag: 'span.pm-rv-pt', getAttrs: (d) => ({ id: d.dataset.review, type: d.dataset.type || 'ins' }) }],
      toDOM: (n) => ['span', { class: 'pm-rv-pt', 'data-review': n.attrs.id, 'data-type': n.attrs.type, contenteditable: 'false' }],
    },
  },
  marks: {
    /* Review mode: a proofreader's mark on a stretch of text. Editor only — the text exports as written. */
    review: {
      attrs: { id: {}, type: { default: 'query' } }, inclusive: false,
      parseDOM: [{ tag: 'span.pm-rv', getAttrs: (d) => ({ id: d.dataset.review, type: d.dataset.type || 'query' }) }],
      toDOM: (m) => ['span', { class: 'pm-rv', 'data-review': m.attrs.id, 'data-type': m.attrs.type, 'data-apply': markType(m.attrs.type).apply || 'none' }, 0],
    },
    comment: {
      attrs: { id: {} }, inclusive: false,
      parseDOM: [{ tag: 'span[data-comment]', getAttrs: (d) => ({ id: d.getAttribute('data-comment') }) }],
      toDOM: (m) => ['span', { class: 'pm-comment', 'data-comment': m.attrs.id }, 0],
    },
    em: { parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[5-9]\d{2,})$/.test(v) && null }], toDOM: () => ['strong', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }], toDOM: () => ['u', 0] },
    subscript: { excludes: 'superscript', parseDOM: [{ tag: 'sub' }], toDOM: () => ['sub', 0] },
    superscript: { excludes: 'subscript', parseDOM: [{ tag: 'sup:not(.pm-fn)' }], toDOM: () => ['sup', 0] },
    /* Writer's highlighter — shown while writing, left out of the book. */
    highlight: {
      attrs: { color: { default: 'yellow' }, size: { default: 'full' } }, inclusive: false, excludes: 'highlight',
      parseDOM: [{ tag: 'span.pm-hl', getAttrs: (d) => ({ color: d.dataset.color || 'yellow', size: d.dataset.size || 'full' }) }],
      toDOM: (m) => ['span', { class: `pm-hl hl-${m.attrs.color} hl-${m.attrs.size}`, 'data-color': m.attrs.color, 'data-size': m.attrs.size }, 0],
    },
    link: {
      attrs: { href: {}, title: { default: null } }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (d) => ({ href: d.getAttribute('href'), title: d.getAttribute('title') }) }],
      toDOM: (n) => ['a', { href: n.attrs.href, title: n.attrs.title, rel: 'noopener noreferrer' }, 0],
    },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
    /* Text color — printed in the book. */
    textColor: {
      attrs: { color: {} }, inclusive: true, excludes: 'textColor',
      parseDOM: [{ tag: 'span.pm-color', getAttrs: (d) => ({ color: d.dataset.color }) }],
      toDOM: (m) => ['span', { class: 'pm-color', 'data-color': m.attrs.color, style: `color:${/^#[0-9a-f]{6}$/i.test(m.attrs.color) ? m.attrs.color : 'inherit'}` }, 0],
    },
  },
});

/* ------------------------------------------------------ markdown ↔ doc */

const tokenizer = createMarkdown({ typographer: false });
let parseDefs = new Map();
const parser = new MarkdownParser(schema, tokenizer, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: { block: 'bullet_list', getAttrs: (tok, tokens, i) => ({ tight: listIsTight(tokens, i), symbol: cleanBullet(tok.meta?.bullet) }) },
  ordered_list: { block: 'ordered_list', getAttrs: (tok, tokens, i) => ({ order: +tok.attrGet('start') || 1, tight: listIsTight(tokens, i) }) },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: Math.min(6, Math.max(1, +tok.tag.slice(1))) }) },
  align: { block: 'align', getAttrs: (tok) => ({ align: tok.meta?.align || 'center' }) },
  hl: { mark: 'highlight', getAttrs: (tok) => ({ color: tok.meta?.color || 'yellow', size: tok.meta?.size || 'full' }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (tok) => { const i = parseCodeInfo(tok.info); return { params: i.lang === 'auto' ? '' : i.lang, lineNumbers: i.lineNumbers, colors: i.colors, border: i.border, align: i.align, pad: i.pad, comment: i.comment }; }, noCloseToken: true },
  hr: { node: 'horizontal_rule', getAttrs: (tok) => ({ kind: tok.markup?.[0] === '_' ? 'line' : 'scene' }) },
  color: { mark: 'textColor', getAttrs: (tok) => ({ color: tok.meta?.color || '#000000' }) },
  pagebreak: { node: 'page_break' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: safeAssetPath(tok.attrGet('src')) || '', title: tok.attrGet('title') || '',
      alt: (tok.children && tok.children[0] && tok.children[0].content) || '',
      width: tok.meta?.width || null, align: tok.meta?.align || 'center', wrap: tok.meta?.wrap || 'topbottom', drawing: tok.meta?.drawing || null,
    }),
  },
  fnref: { node: 'footnote', getAttrs: (tok) => ({ text: parseDefs.get(tok.meta.label) || '' }) },
  cite: { node: 'citation', getAttrs: (tok) => ({ ref: tok.meta.ref, locator: tok.meta.locator || '' }) },
  math: { node: 'math', getAttrs: (tok) => ({ tex: tok.meta.tex, display: !!tok.meta.display }) },
  hardbreak: { node: 'hard_break' },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header', getAttrs: (tok) => ({ align: cellAlign(tok) }) },
  td: { block: 'table_cell', getAttrs: (tok) => ({ align: cellAlign(tok) }) },
  comment: { mark: 'comment', getAttrs: (tok) => ({ id: tok.meta.id }) },
  review: { mark: 'review', getAttrs: (tok) => ({ id: tok.meta.id, type: tok.meta.type }) },
  review_point: { node: 'review_point', getAttrs: (tok) => ({ id: tok.meta.id, type: tok.meta.type }) },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strike' },
  u: { mark: 'underline' },
  sub: { mark: 'subscript' },
  sup: { mark: 'superscript' },
  link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }) },
  code_inline: { mark: 'code', noCloseToken: true },
});
function cellAlign(tok) {
  const m = /text-align:\s*(left|center|right)/.exec(tok.attrGet('style') || '');
  return m ? m[1] : null;
}
function listIsTight(tokens, i) {
  while (++i < tokens.length) if (tokens[i].type !== 'list_item_open') return tokens[i].hidden;
  return false;
}

export function parseMarkdownDoc(md) {
  const { body, defs } = extractFootnotes(md || '');
  parseDefs = defs;
  try {
    const doc = parser.parse(body);
    return doc.childCount ? doc : schema.node('doc', null, [schema.node('paragraph')]);
  } catch (err) {
    console.error('Markdown parse failed', err);
    return schema.node('doc', null, [schema.node('paragraph', null, md ? [schema.text(md)] : [])]);
  } finally { parseDefs = new Map(); }
}

let notesOut = [];
const serializer = new MarkdownSerializer({
  ...defaultMarkdownSerializer.nodes,
  code_block(state, node) {
    // ```lang linenums — a longer fence when the code itself contains ```.
    const ticks = node.textContent.match(/`{3,}/gm);
    const fence = ticks ? `${ticks.sort().slice(-1)[0]}\`` : '```';
    state.write(`${fence}${codeInfo(node.attrs.params, node.attrs.lineNumbers, node.attrs.colors, node.attrs.border, node.attrs.align, node.attrs.pad, node.attrs.comment)}\n`);
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write(fence);
    state.closeBlock(node);
  },
  bullet_list(state, node, parent, index) {
    const b = cleanBullet(node.attrs.symbol);
    if (!b) { defaultMarkdownSerializer.nodes.bullet_list(state, node, parent, index); return; }
    state.write(`::: bullets ${b}\n`);
    defaultMarkdownSerializer.nodes.bullet_list(state, node, parent, index);
    state.ensureNewLine();
    state.write(':::');
    state.closeBlock(node);
  },
  horizontal_rule(state, node) { state.write(node.attrs.kind === 'line' ? '___' : '* * *'); state.closeBlock(node); },
  page_break(state, node) { state.write('\\newpage'); state.closeBlock(node); },
  image(state, node) {
    const a = node.attrs;
    const wrap = a.wrap && a.wrap !== 'topbottom' && a.wrap !== true ? a.wrap : a.wrap === true ? 'square' : '';
    const attrs = [a.width ? `width=${a.width}%` : '', a.align && a.align !== 'center' ? `align=${a.align}` : '', wrap ? `wrap=${wrap}` : '', a.drawing ? `drawing=${a.drawing}` : ''].filter(Boolean).join(' ');
    state.write(`![${state.esc(a.alt || '')}](${a.src}${a.title ? ` "${a.title.replace(/"/g, '\\"')}"` : ''})${attrs ? `{${attrs}}` : ''}`);
  },
  citation(state, node) {
    const loc = String(node.attrs.locator || '').replace(/[\]\n]/g, '').trim();
    state.write(`[@${node.attrs.ref}${loc ? `, ${loc}` : ''}]`);
  },
  table(state, node) {
    const rows = [];
    node.forEach((row) => { const cells = []; row.forEach((cell) => cells.push(cell)); rows.push(cells); });
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const text = (cell) => (cell ? serializer.serialize(schema.node('doc', null, [schema.node('paragraph', null, cell.content)])).trim().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|') : '');
    const line = (cells) => `| ${Array.from({ length: cols }, (_, i) => text(cells[i]) || ' ').join(' | ')} |`;
    const al = Array.from({ length: cols }, (_, i) => rows[0][i]?.attrs.align || rows[1]?.[i]?.attrs.align);
    const rule = `| ${al.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---')).join(' | ')} |`;
    const out = [line(rows[0]), rule, ...rows.slice(1).map(line)];
    out.forEach((l, i) => { state.write(l); if (i < out.length - 1) state.ensureNewLine(); });
    state.closeBlock(node);
  },
  table_row() {},
  table_header() {},
  table_cell() {},
  math(state, node) {
    const tex = String(node.attrs.tex || '').replace(/\$/g, '\\$').trim();
    state.write(node.attrs.display ? `$$${tex}$$` : `$${tex}$`);
  },
  align(state, node) {
    state.write(`::: ${node.attrs.align}\n`);
    state.renderContent(node);
    state.write(':::');
    state.closeBlock(node);
  },
  review_point(state, node) { state.write(`{%${node.attrs.id}:${node.attrs.type}%}`); },
  footnote(state, node) {
    notesOut.push(String(node.attrs.text || '').replace(/\s*\n\s*/g, ' ').trim());
    state.write(`[^${notesOut.length}]`);
  },
}, {
  ...defaultMarkdownSerializer.marks,
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  underline: { open: '++', close: '++', mixable: true, expelEnclosingWhitespace: true },
  subscript: { open: '~', close: '~', mixable: false, expelEnclosingWhitespace: true },
  superscript: { open: '^', close: '^', mixable: false, expelEnclosingWhitespace: true },
  textColor: { open: '[', close: (_s, m) => `]{color=${m.attrs.color}}`, mixable: false, expelEnclosingWhitespace: true },
  highlight: { open: (_s, m) => (m.attrs.color === 'yellow' && m.attrs.size === 'full' ? '==' : `=={${m.attrs.color},${m.attrs.size}}`), close: '==', mixable: true, expelEnclosingWhitespace: true },
  comment: { open: '{==', close: (_state, mark) => `==}{>>#${mark.attrs.id}<<}`, mixable: false, expelEnclosingWhitespace: true },
  // Whitespace stays inside: closing up or deleting a space marks only the space.
  review: { open: '{%%', close: (_state, mark) => `%%}{%${mark.attrs.id}:${mark.attrs.type}%}`, mixable: false },
}, { escapeExtraCharacters: /[$^~]|\+(?=\+)/g });

export function docToMarkdown(doc) {
  notesOut = [];
  let md = serializer.serialize(doc, { tightLists: true }).trimEnd();
  if (notesOut.length) md += '\n\n' + notesOut.map((t, i) => `[^${i + 1}]: ${t}`).join('\n');
  return md + '\n';
}

/* ---------------------------------------------------------------- commands */

const markActive = (state, type) => {
  const { from, $from, to, empty } = state.selection;
  return empty ? !!type.isInSet(state.storedMarks || $from.marks()) : state.doc.rangeHasMark(from, to, type);
};
const inAncestor = (state, type) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true;
  return false;
};

function insertNode(node) {
  return (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };
}
function insertPageBreak(state, dispatch) { return insertBlockBreak(schema.nodes.page_break, state, dispatch); }
function insertSceneBreak(state, dispatch) { return insertBlockBreak(schema.nodes.horizontal_rule, state, dispatch); }
function insertHorizontalLine(state, dispatch) { return insertBlockBreak(schema.nodes.horizontal_rule, state, dispatch, { kind: 'line' }); }
function insertLineBreak(state, dispatch) { if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }
function insertBlockBreak(type, state, dispatch, attrs = null) {
  const { $from } = state.selection;
  const hr = type.create(attrs);
  if (dispatch) {
    const pos = $from.after(1);
    const tr = state.tr.insert(pos, [hr, schema.nodes.paragraph.create()]);
    tr.setSelection(TextSelection.create(tr.doc, pos + 2));
    dispatch(tr.scrollIntoView());
  }
  return true;
}
/** In verse, Enter keeps the line in the stanza; Enter on an empty line starts the next stanza. */
function verseEnter(state, dispatch) {
  const { $from, empty } = state.selection;
  let inVerse = false;
  for (let d = $from.depth; d > 0; d--) { const n = $from.node(d); if (n.type === schema.nodes.align && n.attrs.align === 'verse') { inVerse = true; break; } }
  if (!inVerse || !empty || $from.parent.type !== schema.nodes.paragraph) return false;
  const before = $from.nodeBefore;
  if (before && before.type === schema.nodes.hard_break) {
    if (dispatch) {
      const tr = state.tr.delete($from.pos - before.nodeSize, $from.pos);
      dispatch(tr.split(tr.mapping.map($from.pos)).scrollIntoView());
    }
    return true;
  }
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
}

function clearFormatting(state, dispatch) {
  const { from, to } = state.selection;
  if (dispatch) {
    let tr = state.tr;
    for (const m of ['em', 'strong', 'strike', 'underline', 'subscript', 'superscript', 'highlight', 'textColor', 'link', 'code']) tr = tr.removeMark(from, to, schema.marks[m]);
    dispatch(tr);
  }
  return setBlockType(schema.nodes.paragraph)(state, dispatch) || true;
}

/* -------------------------------------------------------------- node views */

export const WRAP_OPTIONS = [
  { value: 'inline', label: 'In Line with Text', short: 'In line', icon: 'wrapInline', hint: 'Sits in the line like a word' },
  { value: 'square', label: 'Square', short: 'Square', icon: 'wrap', hint: 'Text wraps a box' },
  { value: 'tight', label: 'Tight', short: 'Tight', icon: 'wrapTight', hint: 'Follows the image outline*' },
  { value: 'through', label: 'Through', short: 'Through', icon: 'wrapTight', hint: 'Fills transparent areas*' },
  { value: 'topbottom', label: 'Top and Bottom', short: 'Top & bottom', icon: 'wrapTopBottom', hint: 'Own line, no wrapping' },
  { value: 'behind', label: 'Behind Text', short: 'Behind', icon: 'wrapBehind', hint: 'Under the text†' },
  { value: 'front', label: 'In Front of Text', short: 'In front', icon: 'wrapFront', hint: 'Over the text†' },
];

class ImageView {
  constructor(node, view, getPos, ctx) {
    this.node = node; this.view = view; this.getPos = getPos; this.ctx = ctx;
    this.img = h('img', { src: assetUrl(node.attrs.src), alt: node.attrs.alt, draggable: false });
    this.handle = h('span', { class: 'pm-img-handle', title: 'Drag to resize' });
    this.badge = h('span', { class: 'pm-img-badge' });
    this.bar = this.buildBar();
    this.dom = h('span', { class: 'pm-img', contenteditable: 'false' }, this.img, this.handle, this.badge, this.bar);
    this.apply(node);
    this.handle.addEventListener('mousedown', (e) => this.startResize(e));
    this.dom.addEventListener('dblclick', () => (this.node.attrs.drawing ? ctx.editDrawing : ctx.editImage)?.(this.getPos(), this.node));
  }
  set(attrs) {
    const pos = this.getPos();
    const next = { ...this.node.attrs, ...attrs };
    const tr = this.view.state.tr.setNodeMarkup(pos, null, next);
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }
  buildBar() {
    const b = (label, title, fn, cls = '') => {
      const el = h('button', { type: 'button', class: `pib ${cls}`, title, 'aria-label': title }, label);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
      return el;
    };
    this.sizeBtns = [25, 33, 50, 75, 100].map((p) => b(`${p}%`, `Width ${p}%`, () => this.set({ width: p === 100 ? null : p, align: this.node.attrs.align === 'full' ? 'center' : this.node.attrs.align }), 'size'));
    this.alignBtns = {
      left: b(icon('alignLeft', 16), 'Align left', () => this.set({ align: 'left' })),
      center: b(icon('alignCenter', 16), 'Center', () => this.set({ align: 'center' })),
      right: b(icon('alignRight', 16), 'Align right', () => this.set({ align: 'right' })),
      full: b(icon('alignFull', 16), 'Full width', () => this.set({ align: 'full', width: null })),
    };
    this.wrapLbl = h('span', {});
    this.wrapBtn = b(h('span', { class: 'pib-wrap' }, icon('wrap', 16), this.wrapLbl, icon('chevron', 12)), 'Text wrapping', () => {
      popover(this.wrapBtn, WRAP_OPTIONS.map((o) => ({
        label: o.label, icon: o.icon, hint: o.hint, onClick: () => {
          const a = this.node.attrs;
          const patch = { wrap: o.value };
          if (['square', 'tight', 'through'].includes(o.value) && !['left', 'right'].includes(a.align)) patch.align = 'left';
          if (o.value !== 'topbottom' && o.value !== 'inline' && (!a.width || a.width > 75) && a.align !== 'full') patch.width = 40;
          if (o.value === 'inline' && (!a.width || a.width > 50)) patch.width = 25;
          this.set(patch);
        },
      })), { width: 300 });
    }, 'wrap');
    const more = b(icon('gear', 15), 'Alt text & caption…', () => this.ctx.editImage?.(this.getPos(), this.node));
    this.drawBtn = b(h('span', { class: 'pib-wrap' }, icon('pen', 15), h('span', {}, 'Edit Drawing')), 'Edit drawing', () => this.ctx.editDrawing?.(this.getPos(), this.node), 'draw');
    const del = b(icon('trash', 15), 'Delete image', () => { const pos = this.getPos(); this.view.dispatch(this.view.state.tr.delete(pos, pos + 1)); this.view.focus(); }, 'danger');
    const sep = () => h('span', { class: 'pib-sep' });
    return h('span', { class: 'pm-img-bar', contenteditable: 'false' }, this.drawBtn, ...this.sizeBtns, sep(), ...Object.values(this.alignBtns), sep(), this.wrapBtn, sep(), more, del);
  }
  apply(node) {
    const a = node.attrs;
    if (this.img.dataset.rev !== String(a.rev)) { this.img.src = assetUrl(a.src); this.img.dataset.rev = String(a.rev); }
    this.drawBtn.hidden = !a.drawing;
    const wrap = a.wrap === true ? 'square' : a.wrap || 'topbottom';
    const w = a.align === 'full' ? 100 : a.width || (wrap === 'topbottom' ? 100 : wrap === 'inline' ? 25 : 40);
    this.dom.style.width = `${w}%`;
    this.dom.dataset.align = a.align || 'center';
    this.dom.dataset.wrap = wrap;
    this.img.style.shapeOutside = '';
    this.dom.style.shapeOutside = wrap === 'tight' || wrap === 'through' ? `url("${assetUrl(a.src)}")` : '';
    this.wrapLbl.textContent = WRAP_OPTIONS.find((o) => o.value === wrap)?.short || 'Wrap';
    this.badge.textContent = `${w}%`;
    for (const btn of this.sizeBtns) btn.classList.toggle('on', a.align !== 'full' && Number(btn.textContent.replace('%', '')) === w);
    for (const [k, btn] of Object.entries(this.alignBtns)) btn.classList.toggle('on', (a.align || 'center') === k);
  }
  startResize(e) {
    e.preventDefault(); e.stopPropagation();
    const content = this.view.dom.getBoundingClientRect().width - 64;
    const startX = e.clientX;
    const startW = this.dom.getBoundingClientRect().width;
    const a = this.node.attrs;
    const factor = a.align === 'center' || a.align === 'full' ? 2 : a.align === 'right' ? -1 : 1;
    let pct = a.width || 100;
    const move = (ev) => {
      pct = Math.round(Math.min(100, Math.max(10, ((startW + (ev.clientX - startX) * factor) / content) * 100)));
      this.dom.style.width = `${pct}%`;
      this.badge.textContent = `${pct}%`;
      this.dom.classList.add('resizing');
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.dom.classList.remove('resizing');
      this.set({ width: pct === 100 ? null : pct, align: a.align === 'full' ? 'center' : a.align });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  update(node) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.src !== this.node.attrs.src) this.img.src = assetUrl(node.attrs.src);
    this.node = node; this.apply(node);
    return true;
  }
  selectNode() { this.dom.classList.add('selected'); }
  deselectNode() { this.dom.classList.remove('selected'); }
  stopEvent(e) { return e.target === this.handle || this.bar.contains(e.target); }
  ignoreMutation() { return true; }
}

class CitationView {
  constructor(node, view, getPos, ctx) {
    this.node = node; this.ctx = ctx;
    this.dom = h('span', { class: 'pm-cite' });
    this.draw();
    this.dom.addEventListener('mousedown', (e) => { e.preventDefault(); ctx.editCitation?.(getPos(), this.node); });
  }
  draw() {
    const text = this.ctx.formatCitation ? this.ctx.formatCitation(this.node.attrs.ref, this.node.attrs.locator) : `(${this.node.attrs.ref})`;
    this.dom.textContent = text;
    this.dom.classList.toggle('missing', /missing source/.test(text));
    this.dom.title = 'Citation — click to edit';
  }
  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.draw(); return true; }
  ignoreMutation() { return true; }
}

class MathView {
  constructor(node, view, getPos, ctx) {
    this.node = node;
    this.dom = h('span', { class: 'pm-math', contenteditable: 'false' });
    this.draw();
    this.dom.addEventListener('mousedown', (e) => { e.preventDefault(); ctx.editMath?.(getPos(), this.node); });
  }
  draw() {
    const { tex, display } = this.node.attrs;
    setHtml(this.dom, texToMathml(tex, display).html);
    this.dom.classList.toggle('display', !!display);
    this.dom.title = `${tex}\n\nClick to edit`;
  }
  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.draw(); return true; }
  ignoreMutation() { return true; }
  stopEvent() { return false; }
}

class FootnoteView {
  constructor(node, view, getPos, ctx) {
    this.node = node;
    this.dom = h('sup', { class: 'pm-fn', title: node.attrs.text || '(empty note)' });
    this.dom.addEventListener('mousedown', (e) => { e.preventDefault(); ctx.editFootnote?.(getPos(), this.node); });
  }
  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.dom.title = node.attrs.text || '(empty note)'; return true; }
  ignoreMutation() { return true; }
}

/* ------------------------------------------------------------------ editor */

/** Quotes as you type: curly ("smart", the default) or straight — the book's choice in Tools. */
let quoteMode = 'smart';
export function setQuoteMode(v) { quoteMode = v === 'straight' ? 'straight' : 'smart'; }
const typedQuotes = smartQuotes.map((r) => new InputRule(r.match, (state, m, start, end) => (quoteMode === 'straight' ? null : r.handler(state, m, start, end))));

function buildInputRules() {
  const rules = [...typedQuotes, ellipsis, emDash];
  rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));
  rules.push(wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (m) => ({ order: +m[1] }), (m, n) => n.childCount + n.attrs.order === +m[1]));
  rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list));
  rules.push(textblockTypeInputRule(/^(#{1,3})\s$/, schema.nodes.heading, (m) => ({ level: Math.max(2, m[1].length) })));
  rules.push(textblockTypeInputRule(/^```([\w+#.-]*)\s$/, schema.nodes.code_block, (m) => ({ params: normalizeLang(m[1]) || '' })));
  // [ ] or [x] and a space at the start of a line: a checkbox.
  rules.push(new InputRule(/^\[( |x|X)\]\s$/, (state, m, start, end) => state.tr.insertText(`${m[1] === ' ' ? BOX_OFF : BOX_ON} `, start, end)));
  rules.push(new InputRule(/^(?:\*\s?\*\s?\*|---|___)$/, (state, _m, start, end) => {
    const $s = state.doc.resolve(start);
    if ($s.parent.type !== schema.nodes.paragraph || $s.parent.textContent.length > 3) return null;
    return state.tr.replaceRangeWith($s.before(), $s.after(), schema.nodes.horizontal_rule.create());
  }));
  return inputRules({ rules });
}

/** Syntax highlighting inside code blocks (the same highlighter the book uses). */
function codeDecorations(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.code_block) return true;
    const text = node.textContent;
    if (text && text.length < 50000 && node.attrs.colors !== false) for (const r of highlightRanges(text, node.attrs.params)) decos.push(Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, { class: r.cls }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}
const codeHighlight = new Plugin({
  state: {
    init: (_c, state) => codeDecorations(state.doc),
    apply: (tr, old) => (tr.docChanged ? codeDecorations(tr.doc) : old),
  },
  props: { decorations(state) { return this.getState(state); } },
});

/**
 * The look of one code block — colors, line numbers, border, alignment and padding —
 * as a small panel. Shown from the block's ⋯ button and from the right-click menu.
 */
export function codeOptionsPanel(attrs, set) {
  const seg = (label, opts, cur, key) => h('div', { class: 'cb-row' }, h('span', { class: 'cb-lbl' }, label),
    h('div', { class: 'cb-seg', role: 'group', 'aria-label': label }, opts.map(([v, l]) => h('button', { type: 'button', class: v === cur ? 'on' : '', 'aria-pressed': String(v === cur), onmousedown: (e) => e.preventDefault(), onclick: () => { closePopovers(); set({ [key]: v }); } }, l))));
  const sw = (label, on, key, title) => h('label', { class: 'cb-row cb-sw', title }, h('span', { class: 'cb-lbl' }, label),
    h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: on, onchange: (e) => set({ [key]: e.target.checked }) }));
  return h('div', { class: 'cb-panel' },
    sw('Colors', attrs.colors !== false, 'colors', 'Syntax colors — off shows the code in the text color'),
    sw('Line numbers', !!attrs.lineNumbers, 'lineNumbers', 'Number the lines, in the editor and the book'),
    seg('Border', CODE_BORDERS.map(([v, l]) => [v, l.replace(' border', '').replace('No', 'None')]), attrs.border || 0, 'border'),
    seg('Align', CODE_ALIGNS, attrs.align || 'left', 'align'),
    seg('Padding', CODE_PADS.map(([v, l]) => [v, v == null ? 'Book' : l === 'Extra large' ? 'XL' : l[0] === 'N' ? 'None' : l[0]]), attrs.pad ?? null, 'pad'),
    h('p', { class: 'hint cb-hint' }, 'Book: the padding set in Book settings › General.'));
}

/** Code block: a language picker and a ⋯ button for its look; a number gutter. */
class CodeBlockView {
  constructor(node, view, getPos) {
    this.node = node;
    this.sel = h('select', { class: 'pm-code-lang', 'aria-label': 'Code language', contenteditable: 'false' });
    let group = null;
    for (const [id, label, g] of CODE_LANGUAGES) {
      if (g !== group?.label) { group = h('optgroup', { label: g }); this.sel.append(group); }
      group.append(h('option', { value: id }, label));
    }
    this.sel.value = normalizeLang(node.attrs.params);
    const set = (attrs) => { view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...this.node.attrs, ...attrs })); view.focus(); };
    this.sel.addEventListener('change', () => set({ params: this.sel.value }));
    this.more = h('button', { type: 'button', class: 'pm-code-more', title: 'Code block options — colors, line numbers, border, alignment and padding (or right-click in the code)', 'aria-label': 'Code block options' }, icon('more', 15));
    this.more.addEventListener('click', () => popover(this.more, [{ header: 'Code block' }, { node: codeOptionsPanel(this.node.attrs, set) }], { width: 300 }));
    for (const el of [this.sel, this.more]) el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.bar = h('div', { class: 'pm-code-bar', contenteditable: 'false' }, icon('code', 13), this.sel, h('span', { class: 'spacer' }), this.more);
    this.gutter = h('div', { class: 'pm-code-gutter', contenteditable: 'false', 'aria-hidden': 'true' });
    this.code = h('code');
    this.pre = h('pre', { class: 'pm-code' }, this.code);
    this.dom = h('div', { class: 'pm-code-wrap' }, this.bar, h('div', { class: 'pm-code-body' }, this.gutter, this.pre));
    this.contentDOM = this.code;
    this.look();
    this.drawNumbers();
  }
  look() {
    const a = this.node.attrs;
    this.dom.dataset.border = String(a.border || 0);
    this.dom.dataset.align = a.align || 'left';
    if (a.pad != null) this.dom.dataset.pad = String(a.pad); else delete this.dom.dataset.pad;
    if (a.comment) this.dom.dataset.comment = a.comment; else delete this.dom.dataset.comment;
    this.dom.classList.toggle('nocolor', a.colors === false);
  }
  drawNumbers() {
    const on = !!this.node.attrs.lineNumbers;
    this.dom.classList.toggle('linenums', on);
    this.gutter.hidden = !on;
    if (!on) return;
    const n = this.node.textContent.split('\n').length;
    if (this.gutter.dataset.n !== String(n)) { this.gutter.dataset.n = String(n); this.gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  }
  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const v = normalizeLang(node.attrs.params);
    if (this.sel.value !== v) this.sel.value = v;
    this.look();
    this.drawNumbers();
    return true;
  }
  stopEvent(e) { return this.bar.contains(e.target); }
  ignoreMutation(m) { return !this.contentDOM.contains(m.target); }
}

/** Marks the top-level block holding the cursor (used by Focus mode dimming). */
/* ---- content search: highlight every match of the current query */
export const searchKey = new PluginKey('lutefisk-search');
/** Text of each textblock with one character per position (leaf nodes become U+FFFC). */
export function textblocks(doc) {
  const out = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    out.push({ pos: pos + 1, text: node.textBetween(0, node.content.size, '', '\ufffc') });
    return false;
  });
  return out;
}
export function searchRegex(query, { caseSensitive = false, wholeWord = false } = {}) {
  const q = String(query || '').trim();
  if (!q) return null;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]").replace(/["“”]/g, '["“”]');
  return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, `gu${caseSensitive ? '' : 'i'}`);
}
export function findMatches(doc, re) {
  const out = [];
  if (!re) return out;
  for (const b of textblocks(doc)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(b.text))) { if (!m[0].length) { re.lastIndex++; continue; } out.push({ from: b.pos + m.index, to: b.pos + m.index + m[0].length, text: b.text, at: m.index, len: m[0].length }); }
  }
  return out;
}
/** Replace matches in a transaction (back to front so positions stay valid). Keeps the formatting of each match. */
export function replaceMatches(tr, matches, replacement) {
  for (const m of [...matches].sort((a, b) => b.from - a.from)) {
    const marks = tr.doc.resolve(m.from + 1 <= m.to ? m.from + 1 : m.from).marks();
    if (replacement) tr.replaceWith(m.from, m.to, schema.text(replacement, marks));
    else tr.delete(m.from, m.to);
  }
  return tr;
}
/** Find-and-replace on Markdown outside the editor; returns { md, count }. */
/**
 * Typography tools (shared/typography.js) on a document: every paragraph's plain text,
 * skipping code, from `from` to `to`. Formatting is kept. Returns the number of changes.
 */
function typoTr(tr, kind, from = 0, to = tr.doc.content.size) {
  const edits = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') return false;
    if (!node.isTextblock) return true;
    if (pos + node.nodeSize < from || pos > to) return false;
    let s = '';
    const map = []; // per character: { pos, marks } or null (not plain text)
    node.forEach((child, off) => {
      const at = pos + 1 + off;
      if (child.isText && !child.marks.some((m) => m.type.name === 'code')) {
        for (let i = 0; i < child.text.length; i++) map.push({ pos: at + i, marks: child.marks });
        s += child.text;
      } else { s += '\ufffc'; map.push(null); }
    });
    for (const e of typoEdits(s, kind)) {
      const first = map[e.at] || map[e.at - 1];
      if (!first || (e.del && map.slice(e.at, e.at + e.del).some((m) => !m))) continue;
      const p = map[e.at] ? map[e.at].pos : map[e.at - 1].pos + 1;
      if (p < from || p > to) continue;
      edits.push({ p, del: e.del, ins: e.ins, marks: first.marks });
    }
    return false;
  });
  for (const e of edits.sort((a, b) => b.p - a.p)) {
    if (e.ins) tr.replaceWith(e.p, e.p + e.del, tr.doc.type.schema.text(e.ins, e.marks));
    else tr.delete(e.p, e.p + e.del);
  }
  return edits.length;
}
/** The typography tools on a chapter's Markdown. Returns { md, count }. */
export function typoMarkdown(md, kind) {
  const doc = parseMarkdownDoc(md);
  const tr = EditorState.create({ doc }).tr;
  const count = typoTr(tr, kind);
  return count ? { md: docToMarkdown(tr.doc), count } : { md, count: 0 };
}

export function replaceInMarkdown(md, re, replacement) {
  const doc = parseMarkdownDoc(md);
  const ms = findMatches(doc, re);
  if (!ms.length) return { md, count: 0 };
  const st = EditorState.create({ doc });
  const tr = replaceMatches(st.tr, ms, replacement);
  return { md: docToMarkdown(tr.doc), count: ms.length };
}

const searchPlugin = new Plugin({
  key: searchKey,
  state: {
    init: () => ({ re: null, active: -1, deco: DecorationSet.empty }),
    apply(tr, old, _o, state) {
      const meta = tr.getMeta(searchKey);
      if (!meta && !tr.docChanged) return old;
      const re = meta ? meta.re : old.re;
      const active = meta ? meta.active ?? -1 : -1;
      if (!re) return { re: null, active: -1, deco: DecorationSet.empty };
      const ms = findMatches(state.doc, re);
      return { re, active, deco: DecorationSet.create(state.doc, ms.map((m, i) => Decoration.inline(m.from, m.to, { class: i === active ? 'pm-hit active' : 'pm-hit' }))) };
    },
  },
  props: { decorations(state) { return searchKey.getState(state).deco; } },
});

/* ---- checkboxes: ☐ and ☑ in the text. Saved as those characters, so every export shows a box;
   the editor draws each as a checkbox you click to check or uncheck. */
export const BOX_OFF = '\u2610', BOX_ON = '\u2611';
const BOX_RE = /[\u2610\u2611]/g;
const checkboxPlugin = new Plugin({
  state: {
    init: (_c, state) => boxDecos(state.doc),
    apply: (tr, old) => (tr.docChanged ? boxDecos(tr.doc) : old),
  },
  props: { decorations(state) { return this.getState(state); } },
});
function boxDecos(doc) {
  const decos = [];
  doc.descendants((n, pos) => {
    if (!n.isText || !n.text.includes(BOX_OFF) && !n.text.includes(BOX_ON)) return;
    if (n.marks.some((m) => m.type.name === 'code')) return;
    for (const m of n.text.matchAll(BOX_RE)) {
      const on = m[0] === BOX_ON;
      decos.push(Decoration.inline(pos + m.index, pos + m.index + 1, { class: `pm-check${on ? ' on' : ''}`, role: 'checkbox', 'aria-checked': String(on), title: on ? 'Checked — click to uncheck' : 'Click to check' }));
    }
  });
  return DecorationSet.create(doc, decos);
}

const currentBlock = new Plugin({
  props: {
    decorations(state) {
      const { $head } = state.selection;
      if (!$head.depth) return null;
      const from = $head.before(1);
      const node = state.doc.nodeAt(from);
      if (!node) return null;
      return DecorationSet.create(state.doc, [Decoration.node(from, from + node.nodeSize, { class: 'pm-current' })]);
    },
  },
});

/**
 * Character names, faintly tinted in each character's color. Found the same way as
 * Characters › Appears in (whole words, same capitals, aliases and first names).
 * Code is skipped. Point at a name for a card that opens that character.
 */
export const charKey = new PluginKey('lutefisk-characters');
function findCharacters(doc, chars) {
  const finders = (chars || []).map((c) => ({ c, re: mentionRegex(c) })).filter((x) => x.re);
  if (!finders.length) return DecorationSet.empty;
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type === schema.nodes.code_block) return false;
    if (!node.isTextblock) return true;
    // The block's text, one character per position (anything not plain text is a placeholder).
    let text = '';
    node.forEach((child) => { text += child.isText && !child.marks.some((m) => m.type.name === 'code') ? child.text : '\ufffc'.repeat(child.nodeSize); });
    if (!text.trim()) return false;
    const taken = [];
    for (const { c, re } of finders) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(text));) {
        const from = pos + 1 + m.index, to = from + m[0].length;
        // Two characters can share a name (a first name): the earlier one in the list keeps it.
        if (taken.some(([a, b]) => from < b && to > a)) continue;
        taken.push([from, to]);
        const col = /^#[0-9a-f]{3,8}$/i.test(c.color || '') ? c.color : 'var(--accent)';
        decos.push(Decoration.inline(from, to, { class: 'pm-char', 'data-char': c.id, style: `--char: ${col}` }));
      }
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}
function characterPlugin(getChars) {
  // Found again only when the text changes or the cast does (bump()), and kept otherwise.
  const cache = { doc: null, v: -1, deco: DecorationSet.empty };
  let version = 0;
  const plugin = new Plugin({
    key: charKey,
    props: {
      decorations(state) {
        if (!getChars) return null;
        if (cache.doc !== state.doc || cache.v !== version) Object.assign(cache, { doc: state.doc, v: version, deco: findCharacters(state.doc, getChars()) });
        return cache.deco;
      },
    },
  });
  plugin.bump = () => { version++; };
  return plugin;
}

/** The same token colors as the book, inside the editor's code blocks. */
let codeStyled = false;
function styleCodeBlocks() {
  if (codeStyled) return;
  codeStyled = true;
  document.head.append(h('style', { id: 'lutefisk-code-colors' }, CODE_CSS('.pm-code')));
}

/* ------------------------------------------------- review: proofreader's marks */

/** Every proofreader's mark in a document, in order: { id, type, from, to, point }. */
export function reviewRangesIn(doc) {
  const map = new Map();
  doc.descendants((n, pos) => {
    if (n.type === schema.nodes.review_point) { if (!map.has(n.attrs.id)) map.set(n.attrs.id, { id: n.attrs.id, type: n.attrs.type, from: pos, to: pos + 1, point: true }); return; }
    if (!n.isInline) return;
    for (const m of n.marks) if (m.type === schema.marks.review) {
      const r = map.get(m.attrs.id);
      if (r) { r.from = Math.min(r.from, pos); r.to = Math.max(r.to, pos + n.nodeSize); } else map.set(m.attrs.id, { id: m.attrs.id, type: m.attrs.type, from: pos, to: pos + n.nodeSize, point: false });
    }
  });
  return [...map.values()].sort((a, b) => a.from - b.from);
}
/** The mark at a position: a point mark beside it, or marked text it touches. */
function reviewAtPos(doc, pos) {
  let $p;
  try { $p = doc.resolve(pos); } catch { return null; }
  for (const n of [$p.nodeAfter, $p.nodeBefore]) {
    if (!n) continue;
    if (n.type === schema.nodes.review_point) return n.attrs.id;
    const m = n.marks.find((x) => x.type === schema.marks.review);
    if (m) return m.attrs.id;
  }
  return null;
}
function reviewAtState(state) {
  const { from, to } = state.selection;
  if (from === to) return reviewAtPos(state.doc, from);
  let id = null;
  state.doc.nodesBetween(from, to, (n) => {
    if (id) return false;
    if (n.type === schema.nodes.review_point) id = n.attrs.id;
    else id = n.marks.find((x) => x.type === schema.marks.review)?.attrs.id || null;
    return !id;
  });
  return id;
}
/** Remove one mark (its marked text stays as it is; a point mark goes). */
function removeReviewTr(tr, id) {
  const pts = [];
  tr.doc.descendants((n, pos) => {
    if (n.type === schema.nodes.review_point && n.attrs.id === id) pts.push(pos);
    else if (n.isInline) { const m = n.marks.find((x) => x.type === schema.marks.review && x.attrs.id === id); if (m) tr.removeMark(pos, pos + n.nodeSize, m); }
  });
  for (const pos of pts.reverse()) tr.delete(pos, pos + 1);
  return tr;
}
/** Pasted text never brings proofreader's marks with it (they'd be copies of marks already made). */
function dropReview(fragment) {
  const out = [];
  fragment.forEach((n) => {
    if (n.type === schema.nodes.review_point) return;
    if (n.isText) { out.push(n.mark(n.marks.filter((m) => m.type !== schema.marks.review))); return; }
    out.push(n.copy(dropReview(n.content)));
  });
  return Fragment.fromArray(out);
}
const visibleText = (t) => (/^\s+$/.test(t) ? t.replace(/ /g, '␣').replace(/ /g, '⍽') : t);

/**
 * Review mode's look in the text: each mark gets its margin abbreviation as a little tag
 * (“del”, “cap”, “‸ the”…), and the mark at the cursor is outlined. Nothing when Review is off.
 * ctx.review: { on(), info(id) → { text, note, author } , guide(), select(id) }.
 */
const reviewKey = new PluginKey('review');
function reviewPlugin(ctx) {
  const build = (state) => {
    const R = ctx.review;
    if (!R?.on?.()) return DecorationSet.empty;
    const active = reviewAtState(state);
    const decos = [];
    for (const r of reviewRangesIn(state.doc)) {
      const def = markType(r.type);
      const rec = R.info?.(r.id) || {};
      const text = ['insert', 'replace'].includes(def.apply) && rec.text != null && rec.text !== '' ? rec.text : '';
      // Written by hand: ^ for the caret, then what to insert or use.
      const shortText = text.length > 24 ? `${text.slice(0, 23)}…` : text;
      const label = `${def.abbr.replace(/‸/g, '^')}${shortText ? ` ${visibleText(shortText)}` : ''}`;
      const on = r.id === active;
      // Each mark keeps the ink it was made with (red unless chosen otherwise).
      const ink = INK_IDS.includes(rec.ink) ? rec.ink : 'red';
      decos.push(Decoration.widget(r.to, () => {
        const el = document.createElement('span');
        el.className = `rv-badge rv-ink-${ink} rv-${def.group || 'rule'}${on ? ' active' : ''}`;
        el.dataset.review = r.id;
        el.textContent = label;
        el.title = `${def.label.replace('…', '')}${rec.note ? ` — ${rec.note}` : ''}${rec.author ? `\n${rec.author}` : ''}`;
        el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); R.select?.(r.id); });
        return el;
      }, { side: 1, key: `rv|${r.id}|${label}|${ink}|${on ? 1 : 0}`, ignoreSelection: true, marks: [] }));
      // The hand-drawn stroke over the text (or the caret), in the mark's ink.
      if (r.point) decos.push(Decoration.node(r.from, r.to, { class: `rv-ink-${ink}` }));
      else decos.push(Decoration.inline(r.from, r.to, { class: `rv-mk rv-ink-${ink}${on ? ' rv-active' : ''}`, 'data-apply': def.apply || 'none', 'data-type': r.type }));
    }
    return DecorationSet.create(state.doc, decos);
  };
  return new Plugin({
    key: reviewKey,
    state: {
      init: (_c, state) => build(state),
      apply: (tr, old, _o, state) => (tr.docChanged || tr.selectionSet || tr.getMeta(reviewKey) ? build(state) : old),
    },
    props: { decorations: (state) => reviewKey.getState(state) },
  });
}

export function createEditor(mount, ctx) {
  styleCodeBlocks();
  const toolbar = h('div', { class: 'ql-toolbar', role: 'toolbar', 'aria-label': 'Formatting' });
  const area = h('div', { class: 'ql-container' });
  mount.append(toolbar, area);
  // Right-click the toolbar to move it above or below the text.
  if (ctx.toolbarPos) toolbar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const anchor = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } });
    document.body.append(anchor);
    const bottom = ctx.toolbarPos() === 'bottom';
    const fontsMenu = () => {
      const a2 = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } });
      document.body.append(a2);
      const cur = ctx.editorFont?.() || '';
      popover(a2, [{ header: 'Editor font (not the book)' }, ...ctx.editorFonts().map((f) => ({ label: f.label, icon: f.id === cur ? 'check' : null, onClick: () => ctx.setEditorFont(f.id) }))], { width: 240, maxHeight: 420 });
      setTimeout(() => a2.remove(), 0);
    };
    popover(anchor, [
      { label: bottom ? 'Move Toolbar to Top' : 'Move Toolbar to Bottom', icon: bottom ? 'up' : 'down', onClick: () => ctx.setToolbarPos(bottom ? 'top' : 'bottom') },
      ...(ctx.editorFonts ? [{ label: 'Editor Font…', icon: 'textSize', hint: ctx.editorFontName?.() || '', onClick: () => setTimeout(fontsMenu) }] : []),
    ]);
    setTimeout(() => anchor.remove(), 0);
  });

  const keys = {
    'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em),
    'Mod-Shift-x': toggleMark(schema.marks.strike), 'Mod-k': () => { linkCmd(); return true; },
    'Mod-u': toggleMark(schema.marks.underline), 'Mod-,': toggleMark(schema.marks.subscript), 'Mod-.': toggleMark(schema.marks.superscript),
    'Mod-Alt-0': setBlockType(schema.nodes.paragraph), 'Mod-Alt-2': setBlockType(schema.nodes.heading, { level: 2 }), 'Mod-Alt-3': setBlockType(schema.nodes.heading, { level: 3 }),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
    Enter: chainCommands(verseEnter, splitListItem(schema.nodes.list_item)), 'Mod-[': liftListItem(schema.nodes.list_item), 'Mod-]': sinkListItem(schema.nodes.list_item),
    'Mod-Alt-f': () => { footnoteCmd(); return true; },
    // Spelling and grammar: F7 checks now and goes to the first problem; ⌥F7 / ⇧⌥F7 step through them.
    F7: () => { if (!spell.enabled()) { ctx.spellOff?.(); return true; } harperRecheck(view); ctx.spellNow?.(); return true; },
    'Alt-F7': () => { if (!nextLint(1)) ctx.spellNone?.(); return true; },
    'Shift-Alt-F7': () => { if (!nextLint(-1)) ctx.spellNone?.(); return true; },
    'Mod-Alt-c': () => { citeCmd(); return true; },
    'Mod-Alt-e': () => { mathCmd(); return true; },
    'Mod-Alt-i': () => { symbolCmd(); return true; },
    'Mod-Alt-m': () => { commentCmd(); return true; },
    'Mod-Enter': insertPageBreak,
    'Mod-Shift-e': (st, d) => alignCmd('center')(st, d),
    // Alignment, as in word processors: ⌘L left, ⌘E center, ⌘R right, ⌘J justify.
    'Mod-l': (st, d) => alignCmd('left')(st, d),
    'Mod-e': (st, d) => alignCmd('center')(st, d),
    'Mod-r': (st, d) => alignCmd('right')(st, d),
    'Mod-j': (st, d) => alignCmd('justify')(st, d),
    'Mod-Shift-.': (st, d) => (inAncestor(st, schema.nodes.blockquote) ? lift(st, d) : wrapIn(schema.nodes.blockquote)(st, d)),
    'Mod->': (st, d) => (inAncestor(st, schema.nodes.blockquote) ? lift(st, d) : wrapIn(schema.nodes.blockquote)(st, d)),
  };
  const tableKeys = keymap({ Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) });
  const inCode = (state) => state.selection.$from.parent.type === schema.nodes.code_block;
  const codeKeys = keymap({
    Tab: (state, dispatch) => { if (!inCode(state)) return false; dispatch?.(state.tr.insertText('  ')); return true; },
    'Shift-Tab': (state) => inCode(state),
    'Mod-Enter': (state, dispatch) => (inCode(state) ? exitCode(state, dispatch) : false),
    'Shift-Enter': (state, dispatch) => (inCode(state) ? exitCode(state, dispatch) : false),
  });
  // Spelling and grammar (Harper, on this computer). The browser's own checker is
  // switched off while it runs, so words aren't underlined twice.
  const spell = ctx.spell || { enabled: () => false, dialect: () => 'american', kinds: () => new Set() };
  const charPlugin = characterPlugin(ctx.characters);
  const plugins = [tableEditing(), tableKeys, codeKeys, codeHighlight, buildInputRules(), keymap(keys), keymap(baseKeymap), dropCursor(), gapCursor(), history(), currentBlock, searchPlugin, charPlugin, checkboxPlugin, reviewPlugin(ctx), harperPlugin(spell)];
  const mkState = (doc) => EditorState.create({ doc, plugins });
  const spellKeyName = plugins.at(-1).spec.key;

  const view = new EditorView(area, {
    state: mkState(parseMarkdownDoc('')),
    attributes: () => ({ class: 'ql-editor book-editor', spellcheck: spell.enabled() ? 'false' : 'true', 'aria-label': 'Chapter text' }),
    nodeViews: {
      image: (n, v, p) => new ImageView(n, v, p, api),
      footnote: (n, v, p) => new FootnoteView(n, v, p, api),
      citation: (n, v, p) => new CitationView(n, v, p, ctx),
      math: (n, v, p) => new MathView(n, v, p, ctx),
      code_block: (n, v, p) => new CodeBlockView(n, v, p),
    },
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr);
      view.updateState(newState);
      refreshToolbar();
      ctx.onChange?.(tr, newState);
      if (tr.docChanged || tr.getMeta(spellKeyName)) spell.onState?.();
    },
    handleDOMEvents: {
      drop: (_v, e) => {
        if (e.dataTransfer?.files?.length) { e.preventDefault(); return true; }
        return false;
      },
      paste: (_v, e) => { if ([...(e.clipboardData?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); return true; } return false; },
      contextmenu: (_v, e) => { hideLinkTip(); e.preventDefault(); contextMenu(e); return true; },
      mouseover: (_v, e) => {
        const a = e.target.closest?.('a[href]'); if (a) showLinkTip(a); else if (linkTipFor) hideLinkTip();
        const nm = !a && e.target.closest?.('.pm-char'); if (nm) showCharCard(nm); else if (charFor) hideCharCardSoon();
        return false;
      },
      mouseleave: () => { hideLinkTip(); hideCharCardSoon(); return false; },
      keydown: () => { hideLinkTip(); hideCharCard(); return false; },
      mousedown: (_v, e) => {
        // A checkbox: click to check or uncheck it (one undo step).
        const box = e.button === 0 ? e.target.closest?.('.pm-check') : null;
        if (box) {
          e.preventDefault();
          let pos;
          try { pos = view.posAtDOM(box, 0); } catch { return false; }
          toggleBox(pos);
          return true;
        }
        const a = e.button === 0 && (e.metaKey || e.ctrlKey) ? e.target.closest?.('a[href]') : null;
        if (!a) return false;
        e.preventDefault(); hideLinkTip(); openLink(a.getAttribute('href'));
        return true;
      },
    },
    transformPastedHTML: (html) => html.replace(/<img[^>]*>/gi, ''),
    transformPasted: (slice) => new Slice(dropReview(slice.content), slice.openStart, slice.openEnd),
  });

  /* ---- toolbar */
  const run = (cmd) => () => { cmd(view.state, view.dispatch, view); view.focus(); };
  const btn = (name, title, cmd, isActive) => {
    const b = h('button', { type: 'button', class: `ql-${name}`, title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: run(cmd) }, icon(name));
    b._active = isActive;
    return b;
  };
  /* ---- block styles: paragraph, headings, blockquote, verse, hanging indent */
  const BLOCK_STYLES = [['p', 'Paragraph'], ...[1, 2, 3, 4, 5, 6].map((l) => [`h${l}`, `Heading ${l}`]), ['quote', 'Blockquote'], ['verse', 'Verse'], ['hanging', 'Hanging Indent'], ['attribution', 'Attribution']];
  // The value lives in a select (not shown); the toolbar shows a button that opens the app's own
  // list, so pointing at a style can show it on the text before you choose it.
  const styleSel = h('select', { class: 'ql-header-value', 'aria-hidden': 'true', tabindex: -1 },
    BLOCK_STYLES.map(([v, l]) => h('option', { value: v }, l)));
  const styleLabel = h('span', { class: 'ps-label' });
  // An H button with a small menu (like the Research editor's), not a box: the style in use is in its tip.
  const styleBtn = h('button', { type: 'button', class: 'ql-header ql-menu', title: 'Paragraph style — point at a style to see it, click or press Return to keep it', 'aria-label': 'Paragraph style', 'aria-haspopup': 'listbox', onmousedown: (e) => e.preventDefault() }, icon('heading'), h('span', { class: 'ql-caret' }, icon('chevron', 9)));
  /** The wrapper that gives the cursor its style: a blockquote, or a verse/hanging block. */
  function styleWrapper(state) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type === schema.nodes.blockquote) return 'quote';
      if (n.type === schema.nodes.align && ['verse', 'hanging', 'attribution'].includes(n.attrs.align)) return n.attrs.align;
    }
    return null;
  }
  function currentBlockStyle(state) {
    const w = styleWrapper(state);
    if (w) return w;
    const p = state.selection.$from.parent;
    return p.type === schema.nodes.heading ? `h${p.attrs.level}` : 'p';
  }
  /** quiet: a preview — not in the undo history, and the focus stays where it is. */
  function setBlockStyle(v, { quiet = false } = {}) {
    const d = quiet ? (tr) => view.dispatch(tr.setMeta('addToHistory', false)) : view.dispatch;
    for (let guard = 0; guard < 6 && styleWrapper(view.state); guard++) if (!lift(view.state, d)) break;
    if (/^h[1-6]$/.test(v)) setBlockType(schema.nodes.heading, { level: Number(v.slice(1)) })(view.state, d);
    else setBlockType(schema.nodes.paragraph)(view.state, d);
    if (v === 'quote') wrapIn(schema.nodes.blockquote)(view.state, d);
    if (v === 'verse' || v === 'hanging' || v === 'attribution') wrapIn(schema.nodes.align, { align: v })(view.state, d);
    if (!quiet) view.focus();
  }
  // The paragraph style list: pointing at a style, or moving to it with ↑ ↓, shows it on the text
  // (not in the undo history); a click or Return keeps it; Esc, clicking elsewhere or leaving the
  // list puts back what was there.
  let stylePreview = null; // { doc, sel, value }
  const revertStyle = () => {
    if (!stylePreview) return;
    const { doc, sel } = stylePreview;
    if (view.state.doc.eq(doc)) return;
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    try { tr.setSelection(Selection.fromJSON(tr.doc, sel)); } catch { /* keep the mapped selection */ }
    view.dispatch(tr.setMeta('addToHistory', false));
  };
  const previewStyle = (v) => { if (!stylePreview) return; revertStyle(); if (v !== stylePreview.value) setBlockStyle(v, { quiet: true }); };
  function openStyleList() {
    const cur = currentBlockStyle(view.state);
    stylePreview = { doc: view.state.doc, sel: view.state.selection.toJSON(), value: cur };
    let kept = false;
    const menu = popover(styleBtn, BLOCK_STYLES.map(([v, l]) => ({
      label: l, icon: v === cur ? 'check' : null,
      onClick: () => { kept = true; revertStyle(); stylePreview = null; setBlockStyle(v); },
    })), {
      width: 190,
      onClose: () => { if (!kept) { revertStyle(); stylePreview = null; view.focus(); } },
    });
    const items = [...menu.querySelectorAll('.pop-item')];
    items.forEach((btn, k) => {
      const v = BLOCK_STYLES[k][0];
      btn.addEventListener('mouseenter', () => previewStyle(v));
      btn.addEventListener('focus', () => previewStyle(v));
    });
    // Leaving the list shows what was there again (until you choose).
    menu.addEventListener('mouseleave', () => { if (stylePreview) revertStyle(); });
    items[BLOCK_STYLES.findIndex(([v]) => v === cur)]?.focus();
  }
  styleBtn.addEventListener('click', openStyleList);
  styleBtn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openStyleList(); } });

  /** The extent of the link mark around the cursor, if any. */
  function linkRange(state) {
    const { $from, from, to } = state.selection;
    const type = schema.marks.link;
    const at = (pos) => { const $p = state.doc.resolve(pos); return type.isInSet($p.marks()) || ($p.nodeAfter && type.isInSet($p.nodeAfter.marks)); };
    const mark = at(from);
    if (!mark) return null;
    const parent = $from.parent, start = $from.start();
    let a = from, b = to;
    parent.forEach((child, offset) => {
      const cs = start + offset, ce = cs + child.nodeSize;
      if (mark.isInSet(child.marks) && ce >= a && cs <= b) { a = Math.min(a, cs); b = Math.max(b, ce); }
    });
    // Keep only the run that touches the cursor.
    return { from: a, to: b, href: mark.attrs.href };
  }
  /**
   * Insert or edit a link. The address is shown without https:// (it's added back
   * when missing), and a pasted address can carry it or not. Selected text that
   * looks like an address fills the address; other selected text fills the name.
   * For a web link, the box underneath shows any posting date the link carries and
   * can add it to the bibliography — and cite it right after the link.
   */
  async function linkCmd() {
    const { state } = view;
    const existing = linkRange(state);
    const { from, to } = existing || state.selection;
    const selText = state.doc.textBetween(from, to, ' ');
    const urlish = !existing && looksLikeUrl(selText);
    const nameIn = h('input', { type: 'text', name: 'text', placeholder: urlish ? 'Leave blank to show the address' : 'e.g. Project Gutenberg' });
    nameIn.value = urlish ? '' : selText.trim();
    const urlIn = h('input', { type: 'text', name: 'href', placeholder: 'example.com/page', spellcheck: 'false', autocomplete: 'off' });
    urlIn.value = existing ? displayUrl(existing.href) : urlish ? displayUrl(selText.trim()) : '';
    const will = h('div', { class: 'lk-will', 'aria-live': 'polite' });
    // Cite this link (optional): only for web addresses, and only in the book's text.
    const known = () => ctx.findSource?.(normalizeUrl(urlIn.value));
    const dateLine = h('div', { class: 'lk-date' });
    const addBib = h('input', { type: 'checkbox' });
    const citeHere = h('input', { type: 'checkbox' });
    const addLbl = h('span', {}, 'Also add it to the bibliography');
    const citeBox = h('div', { class: 'lk-cite', hidden: true },
      dateLine,
      h('label', { class: 'lk-opt' }, addBib, addLbl),
      h('label', { class: 'lk-opt sub' }, citeHere, h('span', {}, 'Cite it here, right after the link')));
    const drawUrl = () => {
      const href = normalizeUrl(urlIn.value);
      will.textContent = href ? `Links to ${href}` : '';
      const web = /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(href) && !!ctx.citeLink;
      citeBox.hidden = !web;
      if (!web) return;
      const info = linkInfo(href);
      dateLine.replaceChildren(...(info?.date ? [icon('check', 12), h('span', {}, `${info.platform ? `${info.platform} · ` : ''}${info.time ? 'Posted' : 'Dated'} ${describeWhen(info)} (from ${info.dateFrom})`)] : info?.platform ? [h('span', {}, `${info.platform} — add the date in the source details`)] : []));
      const ref = known();
      addLbl.textContent = ref ? 'In your bibliography — open its details' : 'Also add it to the bibliography';
      citeHere.disabled = !addBib.checked && !ref;
      if (citeHere.disabled) citeHere.checked = false;
    };
    urlIn.addEventListener('input', drawUrl);
    addBib.addEventListener('change', drawUrl);
    urlIn.addEventListener('paste', () => setTimeout(() => { urlIn.value = displayUrl(urlIn.value.trim()); drawUrl(); }));
    drawUrl();
    // Editing a link: a Remove Link button takes the link off and keeps the words.
    let removeIt = false;
    const removeBtn = existing ? h('button', { type: 'button', class: 'btn danger-plain lk-remove', onclick: (e) => {
      removeIt = true;
      e.currentTarget.closest('form')?.querySelector('.dlg-actions .btn:not(.primary)')?.click();
    } }, icon('trash', 13), 'Remove Link') : null;
    const body = h('div', {},
      h('label', { class: 'fld' }, h('span', {}, 'Name (the words shown)'), nameIn),
      h('div', { class: 'fld' }, h('span', {}, 'Web address'), h('div', { class: 'lk-url-row' }, urlIn), will),
      citeBox, removeBtn);
    const focusLater = () => requestAnimationFrame(() => (!urlish && nameIn.value && !urlIn.value ? urlIn : nameIn).focus());
    focusLater();
    const res = await dialog({
      title: existing ? 'Edit Link' : 'Insert Link',
      body, ok: existing ? 'Save' : 'Insert',
    });
    if (removeIt && existing) { view.dispatch(view.state.tr.removeMark(from, to, schema.marks.link)); view.focus(); return; }
    if (!res) { view.focus(); return; }
    const href = normalizeUrl(urlIn.value);
    const text = nameIn.value.replace(/\s+/g, ' ').trim();
    const tr = view.state.tr;
    if (!href) {
      if (existing) view.dispatch(tr.removeMark(from, to, schema.marks.link));
      view.focus(); return;
    }
    if (!/^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(href)) { toast('That doesn’t look like a web or email address', 'error'); view.focus(); return; }
    const mark = schema.marks.link.create({ href });
    // Leave spaces at either end of the selection outside the link.
    const lead = selText.length - selText.trimStart().length, trail = selText.length - selText.trimEnd().length;
    let a = from, b = to;
    if (selText.trim() && from !== to && selText.length === to - from) { a = from + lead; b = to - trail; }
    const shown = view.state.doc.textBetween(a, b, ' ');
    const name = text || shown || displayUrl(href).replace(/^mailto:/i, '');
    let end = b;
    if (name !== shown || a === b) {
      const marks = view.state.doc.resolve(a).marks().filter((m) => m.type !== schema.marks.link);
      tr.replaceWith(a, b, schema.text(name, [...marks, mark]));
      tr.setSelection(TextSelection.create(tr.doc, a + name.length));
      end = a + name.length;
    } else {
      tr.removeMark(a, b, schema.marks.link).addMark(a, b, mark);
    }
    view.dispatch(tr.scrollIntoView());
    // Optional: the source (with its citation calculator), then an in-text citation.
    const wantCite = !citeBox.hidden && citeHere.checked;
    if (!citeBox.hidden && (addBib.checked || wantCite)) {
      const ref = await ctx.citeLink({ url: href, text: name });
      if (ref && wantCite) {
        const before = view.state.doc.textBetween(Math.max(0, end - 1), end, '', '￼');
        const tr2 = view.state.tr;
        const nodes = [...(before && !/\s/.test(before) ? [schema.text(' ')] : []), schema.nodes.citation.create({ ref, locator: '' })];
        tr2.insert(end, nodes);
        view.dispatch(tr2.scrollIntoView());
      }
    }
    view.focus();
  }
  /** Open a link in the writer's own web browser (or mail app), outside Lutefisk. */
  function openLink(href) {
    if (!/^(https?|mailto):/i.test(href || '')) return;
    window.lutefisk?.openExternal?.(href)?.catch?.(() => toast('Couldn’t open that link', 'error'));
  }
  ctx.openLink = openLink;
  const IS_MAC = (window.lutefisk?.platform || navigator.platform || '').toLowerCase().startsWith('darwin') || /mac/i.test(navigator.platform || '');
  const OPEN_KEY = IS_MAC ? '⌘' : 'Ctrl';
  /* Hovering a link shows its address; ⌘-click (Mac) or Ctrl+click opens it. */
  let linkTip = null, linkTipTimer = 0, linkTipFor = null;
  function hideLinkTip() { clearTimeout(linkTipTimer); linkTip?.remove(); linkTip = null; linkTipFor = null; }
  function showLinkTip(a) {
    if (linkTipFor === a) return;
    hideLinkTip();
    linkTipFor = a;
    linkTipTimer = setTimeout(() => {
      if (!a.isConnected || linkTipFor !== a) return;
      const href = a.getAttribute('href') || '';
      linkTip = h('div', { class: 'hover-tip link-tip', role: 'tooltip' },
        h('span', { class: 'lt-url' }, href.replace(/^mailto:/i, '')),
        h('span', { class: 'lt-how' }, `${OPEN_KEY}+click to open${/^mailto:/i.test(href) ? ' in your mail app' : ' in your browser'}`));
      document.body.append(linkTip);
      const r = a.getBoundingClientRect(), t = linkTip.getBoundingClientRect();
      let top = r.bottom + 6;
      if (top + t.height > window.innerHeight - 6) top = r.top - t.height - 6;
      linkTip.style.left = `${Math.max(6, Math.min(window.innerWidth - t.width - 6, r.left))}px`;
      linkTip.style.top = `${top}px`;
      linkTip.classList.add('in');
    }, 300);
  }
  /* ---- character card: point at a highlighted name; click the name to open that character */
  let charCard = null, charTimer = 0, charHide = 0, charFor = null;
  function hideCharCard() { clearTimeout(charTimer); clearTimeout(charHide); charCard?.remove(); charCard = null; charFor = null; }
  function hideCharCardSoon() { clearTimeout(charTimer); clearTimeout(charHide); if (charCard) charHide = setTimeout(hideCharCard, 260); else charFor = null; }
  function showCharCard(el) {
    clearTimeout(charHide);
    if (charFor === el && charCard) return;
    const id = el.dataset.char;
    if (charCard && charCard.dataset.char === id) { charFor = el; return; } // the same character, a word along
    hideCharCard();
    charFor = el;
    charTimer = setTimeout(() => {
      if (!el.isConnected || charFor !== el) return;
      const c = (ctx.characters?.() || []).find((x) => x.id === id);
      if (!c) return;
      const open = () => { hideCharCard(); ctx.openCharacter?.(c.id); };
      const attrs = (Array.isArray(c.attrs) ? c.attrs : []).filter((a) => a?.k && String(a.v || '').trim()).slice(0, 2);
      charCard = h('div', { class: 'char-card', role: 'dialog', 'aria-label': `Character: ${c.name}`, 'data-char': id, style: { '--char': c.color || 'var(--accent)' },
        onmouseenter: () => clearTimeout(charHide), onmouseleave: () => hideCharCardSoon(), onmousedown: (e) => e.preventDefault() },
      h('div', { class: 'cc-top' },
        ctx.characterAvatar?.(c, 30) || h('span', { class: 'cc-dot' }),
        h('div', { class: 'cc-id' },
          h('button', { type: 'button', class: 'cc-name', title: `Open ${c.name} in Characters — your place in the text stays put`, onclick: open }, c.name || 'Unnamed'),
          c.role ? h('small', {}, c.role) : null)),
      attrs.length ? h('dl', { class: 'cc-attrs' }, attrs.flatMap((a) => [h('dt', {}, a.k), h('dd', {}, String(a.v).slice(0, 80))])) : null,
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-open', onclick: open }, icon('people', 13), 'Open Character')));
      document.body.append(charCard);
      const r = el.getBoundingClientRect(), t = charCard.getBoundingClientRect();
      let top = r.bottom + 6;
      if (top + t.height > window.innerHeight - 6) top = r.top - t.height - 6;
      charCard.style.left = `${Math.max(6, Math.min(window.innerWidth - t.width - 6, r.left))}px`;
      charCard.style.top = `${top}px`;
      requestAnimationFrame(() => charCard?.classList.add('in'));
    }, 350);
  }
  view.dom.addEventListener('scroll', hideCharCard, { passive: true });
  area.addEventListener('scroll', hideCharCard, { passive: true });

  const modHeld = (e) => view?.dom?.classList.toggle('mod-held', IS_MAC ? e.metaKey : e.ctrlKey);
  window.addEventListener('keydown', modHeld);
  window.addEventListener('keyup', modHeld);
  window.addEventListener('blur', () => view?.dom?.classList.remove('mod-held'));
  /** A list with a bullet of the author's choosing (★, ➤, ✓, ❧…). */
  async function customBulletCmd() {
    const presets = ['•', '◦', '▪', '–', '—', '★', '☆', '✓', '✗', '➤', '→', '◆', '❧', '❦', '♦', '♥', '✦', '❖', '○', '■'];
    const input = h('input', { type: 'text', maxlength: 6, class: 'bul-input', 'aria-label': 'Bullet character', placeholder: '★' });
    const cur = (() => { const { $from } = view.state.selection; for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.bullet_list) return $from.node(d).attrs.symbol; return ''; })();
    input.value = cur || '★';
    const grid = h('div', { class: 'bul-grid' }, presets.map((c) => h('button', { type: 'button', class: 'bul-chip', title: `Use ${c}`, onclick: () => { input.value = c; input.focus(); } }, c)),
      h('button', { type: 'button', class: 'bul-chip more', title: 'Choose from all symbols', onclick: () => openSymbolPicker({ onInsert: (ch) => { input.value = ch; }, onClose: () => input.focus() }) }, '…'));
    const body = h('div', { class: 'bul-body' }, grid, h('label', { class: 'fld' }, h('span', {}, 'Bullet (any 1–3 characters, or pick one above)'), input));
    const res = await dialog({ title: 'Custom bullet', body, ok: 'Use bullet', cancel: 'Cancel' });
    if (!res) { view.focus(); return; }
    const symbol = cleanBullet(input.value);
    if (!symbol) { toast('Use 1–3 characters — no spaces, quotes or < > & { } ; :', 'error'); view.focus(); return; }
    if (!inAncestor(view.state, schema.nodes.bullet_list)) {
      if (inAncestor(view.state, schema.nodes.ordered_list)) liftListItem(schema.nodes.list_item)(view.state, view.dispatch);
      wrapInList(schema.nodes.bullet_list)(view.state, view.dispatch);
    }
    const { $from } = view.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.bullet_list) { view.dispatch(view.state.tr.setNodeMarkup($from.before(d), null, { ...$from.node(d).attrs, symbol })); break; }
    }
    view.focus();
  }
  async function footnoteCmd() {
    const res = await dialog({ title: 'Add footnote', fields: [{ name: 'text', label: 'Note text (Markdown: *italic*, **bold**)', type: 'textarea', rows: 4 }], ok: 'Add footnote' });
    if (res && res.text.trim()) insertNode(schema.nodes.footnote.create({ text: res.text.trim() }))(view.state, view.dispatch);
    view.focus();
  }
  async function citeCmd(pos = null, node = null) {
    const res = await ctx.pickCitation?.(node ? node.attrs : null);
    if (res === undefined) { view.focus(); return; }
    if (res === null) { // removed
      if (node) view.dispatch(view.state.tr.delete(pos, pos + 1));
      view.focus(); return;
    }
    const n = schema.nodes.citation.create({ ref: res.ref, locator: res.locator || '' });
    if (node) view.dispatch(view.state.tr.setNodeMarkup(pos, null, n.attrs));
    else {
      const { $from } = view.state.selection;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, '', '\ufffc');
      const tr = view.state.tr;
      if (before && !/[\s(“"'‘—–-]/.test(before)) tr.insertText(' ');
      tr.replaceSelectionWith(n);
      view.dispatch(tr.scrollIntoView());
    }
    view.focus();
  }
  ctx.editCitation = (pos, node) => citeCmd(pos, node);

  async function mathCmd(pos = null, node = null) {
    const sel = view.state.selection;
    const selected = !node && !sel.empty ? view.state.doc.textBetween(sel.from, sel.to, ' ') : '';
    const res = await openMathDialog({ tex: node ? node.attrs.tex : selected, display: node ? node.attrs.display : false, isEdit: !!node });
    if (res) {
      let tr = view.state.tr;
      if (node && pos != null) {
        tr = res.remove ? tr.delete(pos, pos + node.nodeSize) : tr.setNodeMarkup(pos, null, { tex: res.tex, display: res.display });
      } else if (!res.remove) {
        tr = tr.replaceSelectionWith(schema.nodes.math.create({ tex: res.tex, display: res.display }), false);
      }
      view.dispatch(tr.scrollIntoView());
    }
    view.focus();
  }
  ctx.editMath = (pos, node) => mathCmd(pos, node);

  /* ---- drawings */
  async function drawCmd(pos = null, node = null) {
    try {
      const existing = node?.attrs.drawing ? { rel: node.attrs.drawing, pngRel: node.attrs.src, json: await window.lutefisk.readDrawing({ rel: node.attrs.drawing }) } : null;
      const res = await openDrawingEditor(existing);
      if (!res) { view.focus(); return; }
      bumpAsset(res.png);
      if (node && pos != null) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, src: res.png, drawing: res.json, rev: (node.attrs.rev || 0) + 1 }));
      } else {
        const img = schema.nodes.image.create({ src: res.png, alt: 'Drawing', drawing: res.json, width: 60 });
        const { $from } = view.state.selection;
        const para = schema.nodes.paragraph.create(null, img);
        const tr = $from.parent.content.size ? view.state.tr.insert($from.after(1), para) : view.state.tr.replaceSelectionWith(img);
        view.dispatch(tr.scrollIntoView());
      }
      ctx.onAssetChanged?.();
    } catch (err) { toast(`Drawing: ${err.message || err}`, 'error'); }
    view.focus();
  }
  ctx.editDrawing = (pos, node) => drawCmd(pos, node);

  /* ---- comments (Word-style) */
  const commentType = schema.marks.comment;
  function commentRanges(doc = view.state.doc) {
    const map = new Map();
    doc.descendants((n, pos) => {
      if (n.type === schema.nodes.code_block && n.attrs.comment) { map.set(n.attrs.comment, { id: n.attrs.comment, from: pos + 1, to: pos + n.nodeSize - 1, block: true }); return false; }
      if (!n.isInline) return;
      for (const m of n.marks) if (m.type === commentType) {
        const r = map.get(m.attrs.id);
        if (r) { r.from = Math.min(r.from, pos); r.to = Math.max(r.to, pos + n.nodeSize); } else map.set(m.attrs.id, { id: m.attrs.id, from: pos, to: pos + n.nodeSize });
      }
    });
    return [...map.values()].sort((a, b) => a.from - b.from);
  }
  function commentAt(state = view.state) {
    const { $from, from, to } = state.selection;
    if ($from.parent.type === schema.nodes.code_block) return $from.parent.attrs.comment || null;
    const marks = from === to ? $from.marks() : [];
    let m = marks.find((x) => x.type === commentType);
    if (!m && from !== to) state.doc.nodesBetween(from, to, (n) => { m ||= n.marks.find((x) => x.type === commentType); });
    return m?.attrs.id || null;
  }
  function commentCmd() {
    let { from, to, empty, $from } = view.state.selection;
    // In code, a comment belongs to the whole block (code can't carry marks).
    if ($from.parent.type === schema.nodes.code_block) {
      const pos = $from.before(); const node = $from.parent;
      if (node.attrs.comment) { ctx.commentsChanged?.(node.attrs.comment); ctx.focusComment?.(node.attrs.comment); return; }
      const id = `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const quote = empty ? node.textContent.split('\n')[0].slice(0, 80) : view.state.doc.textBetween(from, to, ' ');
      ctx.createComment?.(id, quote);
      view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, comment: id }));
      ctx.commentsChanged?.(id);
      return;
    }
    if (empty) {
      // Comment on the word at the cursor, like Word.
      const text = $from.parent.textContent;
      const off = $from.parentOffset;
      let a = off, b = off;
      while (a > 0 && /[\p{L}\p{N}'’-]/u.test(text[a - 1])) a--;
      while (b < text.length && /[\p{L}\p{N}'’-]/u.test(text[b])) b++;
      if (a === b) { toast('Select some text to comment on', 'info'); return; }
      from = $from.start() + a; to = $from.start() + b;
    }
    const id = `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    ctx.createComment?.(id, view.state.doc.textBetween(from, to, ' '));
    const tr = view.state.tr.addMark(from, to, commentType.create({ id }));
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, to)));
    ctx.commentsChanged?.(id);
  }
  function removeComment(id) {
    const tr = view.state.tr.removeMark(0, view.state.doc.content.size, commentType.create({ id }));
    tr.doc.descendants((n, pos) => { if (n.type === schema.nodes.code_block && n.attrs.comment === id) tr.setNodeMarkup(pos, null, { ...n.attrs, comment: null }); });
    view.dispatch(tr);
  }
  function selectComment(id) {
    const r = commentRanges().find((x) => x.id === id);
    if (!r) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, r.from, r.to)).scrollIntoView());
    view.focus();
  }

  /* ---- checkboxes */
  function toggleBox(pos) {
    const ch = view.state.doc.textBetween(pos, pos + 1);
    if (ch !== BOX_OFF && ch !== BOX_ON) return false;
    const node = view.state.doc.nodeAt(pos);
    view.dispatch(view.state.tr.replaceWith(pos, pos + 1, schema.text(ch === BOX_ON ? BOX_OFF : BOX_ON, node?.marks || [])));
    return true;
  }
  /** Insert a checkbox at the cursor, with a space after it (and before it, mid-line). */
  function insertBox() {
    const { $from, from, to } = view.state.selection;
    if ($from.parent.type === schema.nodes.code_block) { toast('Checkboxes can’t go in code', 'info'); return; }
    const before = $from.parentOffset ? view.state.doc.textBetween(from - 1, from) : '';
    const text = `${before && !/\s/.test(before) ? ' ' : ''}${BOX_OFF} `;
    view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
    view.focus();
  }

  /* ---- review: proofreader's marks (Review mode) */
  const reviewType = schema.marks.review;
  const R = () => ctx.review || null;
  const clipQ = (t, n = 40) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
  /** Make a mark of this type on the selection (or the word at the cursor), or at the cursor. */
  async function reviewCmd(typeId) {
    const rv = R();
    if (!rv) return;
    if (!rv.on()) rv.setOn(true);
    const def = markType(typeId);
    let { from, to, empty, $from } = view.state.selection;
    if ($from.parent.type === schema.nodes.code_block) { toast('Proofreader’s marks can’t go in code — add a comment instead (⌃⌥M)', 'info', 2600); return; }
    if (def.at === 'range') {
      if (empty) {
        const text = $from.parent.textContent;
        const off = $from.parentOffset;
        let a = off, b = off;
        while (a > 0 && /[\p{L}\p{N}'’-]/u.test(text[a - 1])) a--;
        while (b < text.length && /[\p{L}\p{N}'’-]/u.test(text[b])) b++;
        if (a === b) { toast('Select the text to mark', 'info'); return; }
        from = $from.start() + a; to = $from.start() + b;
      }
      let clash = null;
      view.state.doc.nodesBetween(from, to, (n) => { clash ||= n.marks.find((m) => m.type === reviewType) || null; });
      if (clash) { toast('That text already has a proofreader’s mark — remove it first (right-click it), or mark other text', 'info', 2800); return; }
    } else {
      // A point: at the cursor, or just after the selected text (select a word, Insert Comma → after it).
      from = to = empty ? from : to;
    }
    const docBefore = view.state.doc;
    const quote = def.at === 'range' ? view.state.doc.textBetween(from, to, ' ')
      : `${view.state.doc.textBetween(Math.max($from.start(), from - 24), from, ' ').slice(-24)}‸${view.state.doc.textBetween(from, Math.min($from.end(), from + 24), ' ')}`;
    let text = null, note = '';
    if (def.ask === 'text') {
      const res = await dialog({ title: def.label.replace('…', ''), fields: [{ name: 'text', label: def.apply === 'replace' ? `Replace “${clipQ(quote)}” with` : 'Text to insert', value: '' }], ok: 'Mark' });
      if (!res || res.text === '') { view.focus(); return; }
      text = res.text;
    } else if (def.ask === 'note') {
      const res = await dialog({ title: def.label.replace('…', ''), fields: [{ name: 'note', label: `About “${clipQ(quote)}”`, type: 'textarea', rows: 3, placeholder: 'Your question or suggestion for the author' }], ok: 'Mark' });
      if (!res || !res.note.trim()) { view.focus(); return; }
      note = res.note.trim();
    }
    if (!view.state.doc.eq(docBefore)) { toast('The text changed — mark it again', 'info'); return; }
    const id = newReviewId();
    rv.create(id, { type: typeId, text, note: note || def.note || '', quote: clipQ(quote, 200) });
    const tr = view.state.tr;
    if (def.at === 'range') tr.addMark(from, to, reviewType.create({ id, type: typeId }));
    else tr.insert(from, schema.nodes.review_point.create({ id, type: typeId }));
    const end = def.at === 'range' ? to : from + 1;
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView());
    view.focus();
    rv.changed?.(id);
  }
  /** The marks in the open text. */
  const reviewRanges = () => reviewRangesIn(view.state.doc);
  /** The marks the selection touches (or the one at the cursor). */
  function reviewIdsInSelection() {
    const { from, to, empty } = view.state.selection;
    if (empty) { const id = reviewAtState(view.state); return id ? [id] : []; }
    return reviewRanges().filter((r) => r.from < to && r.to > from || (r.point && r.from >= from && r.from <= to)).map((r) => r.id);
  }
  function selectReview(id) {
    const r = reviewRanges().find((x) => x.id === id);
    if (!r) return false;
    const sel = r.point ? TextSelection.create(view.state.doc, r.to) : TextSelection.create(view.state.doc, r.from, r.to);
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
    view.focus();
    return true;
  }
  /** Go to the next (1) or previous (-1) mark from the cursor, round to the start. */
  function nextReview(dir = 1, { wrap = true } = {}) {
    const all = reviewRanges();
    if (!all.length) return null;
    const cur = reviewAtState(view.state);
    const at = view.state.selection.from;
    const i = cur ? all.findIndex((r) => r.id === cur) : -1;
    let r;
    if (i >= 0) r = all[i + dir] || (wrap ? all[(i + dir + all.length) % all.length] : null);
    else r = dir > 0 ? (all.find((x) => x.from >= at) || (wrap ? all[0] : null)) : ([...all].reverse().find((x) => x.to <= at) || (wrap ? all.at(-1) : null));
    if (!r) return null;
    selectReview(r.id);
    return r.id;
  }
  /** Take every mark out of the open text (one undo step). Returns their ids. */
  function clearReview() {
    const ids = reviewRanges().map((r) => r.id);
    if (!ids.length) return [];
    const tr = view.state.tr;
    for (const id of ids) removeReviewTr(tr, id);
    view.dispatch(tr);
    return ids;
  }
  /** Change the case of text from..to in a transaction, keeping its formatting. */
  function caseTr(tr, from, to, mode) {
    const parts = [];
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const a = Math.max(from, pos), b = Math.min(to, pos + node.nodeSize);
      if (b > a) parts.push({ a, b, text: node.text.slice(a - pos, b - pos), marks: node.marks });
    });
    const joined = changeCase(parts.map((p) => p.text).join(''), mode);
    let i = 0;
    for (const p of parts) { p.out = joined.slice(i, i + p.text.length); i += p.text.length; }
    for (const p of [...parts].reverse()) if (p.out !== p.text) tr.replaceWith(p.a, p.b, schema.text(p.out, p.marks));
  }
  /**
   * Finish with a mark. accept: make the change it asks for (if Lutefisk can), then take the mark
   * away; otherwise (Reject, or a mark you fixed by hand) just take it away. One undo step.
   * Returns 'accepted', 'resolved', or null when the change has to be made by hand.
   */
  function finishReview(id, accept) {
    const r = reviewRanges().find((x) => x.id === id);
    if (!r) return null;
    const rv = R();
    const def = markType(r.type);
    const rec = rv?.info?.(id) || {};
    const guide = rv?.guide?.() || 'cmos';
    const tr = view.state.tr;
    if (!accept || !canApply(def, rec, guide)) {
      removeReviewTr(tr, id);
      view.dispatch(tr.scrollIntoView());
      return 'resolved';
    }
    const text = markText(def, guide, rec);
    const hand = () => { toast(`Make this change by hand, then press Resolve`, 'info', 2600); return null; };
    if (r.point) {
      const pos = r.from;
      const marks = view.state.doc.resolve(pos).marks().filter((m) => m.type !== reviewType);
      removeReviewTr(tr, id);
      if (def.apply === 'insert') tr.insert(pos, schema.text(text, marks));
      else if (def.apply === 'split') { if (!tr.doc.resolve(pos).parent.isTextblock) return hand(); tr.split(pos); }
      else if (def.apply === 'join') {
        const $p = tr.doc.resolve(pos);
        if ($p.parentOffset !== 0 || !canJoin(tr.doc, $p.before())) return hand();
        tr.join($p.before());
      }
    } else {
      const { from, to } = r;
      removeReviewTr(tr, id);
      const first = [];
      tr.doc.nodesBetween(from, to, (n) => { if (n.isText && !first.length) first.push(n); });
      const marks = first[0]?.marks || [];
      switch (def.apply) {
        case 'delete': tr.delete(from, to); break;
        case 'replace': if (text) tr.replaceWith(from, to, schema.text(text, marks)); else tr.delete(from, to); break;
        case 'wrap': { const [open, close] = text || ['“', '”']; tr.insertText(close, to); tr.insertText(open, from); break; }
        case 'upper': caseTr(tr, from, to, 'upper'); break;
        case 'lower': caseTr(tr, from, to, 'lower'); break;
        case 'italic': tr.addMark(from, to, schema.marks.em.create()); break;
        case 'bold': tr.addMark(from, to, schema.marks.strong.create()); break;
        case 'roman': tr.removeMark(from, to, schema.marks.em); tr.removeMark(from, to, schema.marks.strong); break;
        case 'closeup': {
          const gaps = [];
          tr.doc.nodesBetween(from, to, (n, pos) => {
            if (!n.isText) return;
            for (const m of n.text.matchAll(/\s+/g)) {
              const a = Math.max(from, pos + m.index), b = Math.min(to, pos + m.index + m[0].length);
              if (b > a) gaps.push([a, b]);
            }
          });
          if (!gaps.length) return hand();
          for (const [a, b] of gaps.reverse()) tr.delete(a, b);
          break;
        }
        case 'transpose': {
          const t = tr.doc.textBetween(from, to, '￼', '￼');
          if (t.includes('￼')) return hand();
          const w = /^(\S+)(\s+)(\S+)$/u.exec(t);
          const chars = [...t];
          const out = w ? `${w[3]}${w[2]}${w[1]}` : chars.length === 2 ? `${chars[1]}${chars[0]}` : null;
          if (!out) return hand();
          tr.replaceWith(from, to, schema.text(out, marks));
          break;
        }
        default: break;
      }
    }
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return 'accepted';
  }
  /**
   * Add Mark: every mark and the book's style-guide rules in one list, with a search box —
   * type “comma”, “cap”, “del” or “serial” and press Return (↑ ↓ to choose).
   */
  function reviewPicker(anchor) {
    const rv = R();
    if (!rv || !anchor) return;
    const g = rv.guide();
    const all = [
      ...MARKS.map((m) => ({ ...m, where: MARK_GROUPS.find(([k]) => k === m.group)?.[1] || '' })),
      ...GUIDE_RULES[g].map((m) => ({ ...m, where: `${GUIDES[g].short} rules` })),
    ];
    const input = h('input', { type: 'search', class: 'rv-find', placeholder: 'Search marks — del, comma, cap, serial…', 'aria-label': 'Search proofreader’s marks', spellcheck: 'false' });
    const list = h('div', { class: 'rv-find-list', role: 'listbox', 'aria-label': 'Proofreader’s marks' });
    let shown = [], at = 0;
    const choose = (m) => { closePopovers(); setTimeout(() => reviewCmd(m.id)); };
    const draw = () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      shown = all.filter((m) => { const hay = `${m.label} ${m.abbr} ${m.where} ${m.id} ${m.note || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
      at = Math.min(at, Math.max(0, shown.length - 1));
      let last = null;
      const rows = [];
      shown.forEach((m, i) => {
        if (m.where !== last) { rows.push(h('div', { class: 'rv-find-head' }, m.where)); last = m.where; }
        rows.push(h('button', { type: 'button', role: 'option', class: `rv-find-item${i === at ? ' on' : ''}`, 'aria-selected': String(i === at), title: m.note || '', onmousedown: (e) => e.preventDefault(), onmouseenter: () => { at = i; mark(); }, onclick: () => choose(m) },
          h('span', { class: 'rv-find-abbr' }, m.abbr.replace(/‸/g, '^')), h('span', { class: 'rv-find-label' }, m.label)));
      });
      list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'rv-find-empty' }, 'No marks match')]));
    };
    const mark = () => list.querySelectorAll('.rv-find-item').forEach((b, i) => { b.classList.toggle('on', i === at); b.setAttribute('aria-selected', String(i === at)); if (i === at) b.scrollIntoView({ block: 'nearest' }); });
    input.addEventListener('input', () => { at = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { at = (at + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; mark(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) choose(shown[at]); }
      else if (e.key === 'Escape') { e.preventDefault(); closePopovers(); view.focus(); }
    });
    draw();
    popover(anchor, [{ node: h('div', { class: 'rv-find-box' }, input, list) }], { width: 300 });
    requestAnimationFrame(() => input.focus());
  }
  /** Right-click and the + menu: search, the marks by kind, the guide's own rules, and Clear Here. */
  function reviewMenuItems(anchorAt) {
    const rv = R();
    if (!rv) return [];
    const g = rv.guide();
    const item = (m) => ({ label: m.label, hint: m.abbr, onClick: () => setTimeout(() => reviewCmd(m.id)) });
    const search = () => {
      const a = anchorAt ? h('span', { class: 'ctx-anchor', style: { left: `${anchorAt.x}px`, top: `${anchorAt.y}px` } }) : null;
      if (a) document.body.append(a);
      setTimeout(() => { reviewPicker(a || toolbar); if (a) setTimeout(() => a.remove(), 0); });
    };
    const n = reviewRanges().length;
    return [
      { label: 'Search Marks…', icon: 'search', onClick: search },
      '-',
      { header: `Proofreader’s marks · ${GUIDES[g].short}` },
      ...MARK_GROUPS.filter(([k]) => k !== 'query').map(([k, label]) => ({ label, icon: { edit: 'pen', punct: 'quote', space: 'newline', type: 'textStyle' }[k], subWidth: 250, submenu: () => MARKS.filter((m) => m.group === k).map(item) })),
      { ...item(MARKS.find((m) => m.id === 'query')), icon: 'help' },
      '-',
      { label: `${GUIDES[g].short} Rules`, icon: 'book', subWidth: 290, submenu: () => [{ header: GUIDES[g].name }, ...GUIDE_RULES[g].map(item)] },
      ...(n ? ['-', { label: 'Clear Marks Here…', icon: 'eraser', hint: String(n), onClick: () => setTimeout(() => rv.clearHere?.()) }] : []),
    ];
  }
  /** What a mark under the pointer offers: Accept, Reject, a note, Remove. */
  function reviewMarkItems(id) {
    const rv = R();
    const r = reviewRanges().find((x) => x.id === id);
    if (!rv || !r) return [];
    const def = markType(r.type);
    const rec = rv.info(id) || {};
    const auto = canApply(def, rec, rv.guide());
    return [
      { header: `${def.label.replace('…', '')}${rec.author ? ` · ${rec.author}` : ''}` },
      ...(auto ? [{ label: 'Make This Change', icon: 'check', onClick: () => rv.finish(id, true) }] : []),
      { label: rec.note ? 'Edit Note…' : 'Add Note…', icon: 'comment', onClick: () => setTimeout(() => rv.editNote(id)) },
      { label: 'Color', icon: 'palette', subWidth: 170, submenu: () => Object.entries(INKS).map(([k, x]) => ({ label: x.label, swatch: x.light, icon: (rec.ink || 'red') === k ? 'check' : null, onClick: () => rv.recolor?.([id], k) })) },
      { label: 'Remove Mark', icon: 'trash', onClick: () => rv.finish(id, false, 'removed') },
      '-',
    ];
  }

  /**
   * Insert Code…: Block (a code block with a language, line numbers and
   * colors) or Inline (code in the sentence). The language and layout are remembered.
   */
  async function insertCodeCmd() {
    const { $from } = view.state.selection;
    if ($from.parent.type === schema.nodes.code_block) { toast('You’re in a code block — right-click in it, or click ⋯ in its bar, to change how it looks', 'info', 2600); return; }
    const selText = view.state.selection.empty ? '' : view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n');
    let layout = 'block';
    try { layout = localStorage.getItem('lutefisk.codeLayout') === 'inline' ? 'inline' : 'block'; } catch { /* ignore */ }
    if (selText && !selText.includes('\n') && selText.length < 120) layout = 'inline';
    let last = '';
    try { last = localStorage.getItem('lutefisk.codeLang') || ''; } catch { /* ignore */ }
    const lang = h('select', { class: 'code-lang-sel', 'aria-label': 'Language' });
    let group = null;
    for (const [id, label, g] of CODE_LANGUAGES) {
      if (g !== group?.label) { group = h('optgroup', { label: g }); lang.append(group); }
      group.append(h('option', { value: id }, label));
    }
    lang.value = normalizeLang(last) || '';
    const lines = h('input', { type: 'checkbox', 'aria-label': 'Show line numbers' });
    const colors = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Color the code' });
    const border = h('select', { 'aria-label': 'Border' }, CODE_BORDERS.map(([v, l]) => h('option', { value: String(v) }, l)));
    try { border.value = localStorage.getItem('lutefisk.codeBorder') || '0'; } catch { border.value = '0'; }
    if (!border.value) border.value = '0';
    const align = h('select', { 'aria-label': 'Align' }, CODE_ALIGNS.map(([v, l]) => h('option', { value: v }, `Align ${l.toLowerCase()}`)));
    try { align.value = localStorage.getItem('lutefisk.codeAlign') || 'left'; } catch { align.value = 'left'; }
    if (!align.value) align.value = 'left';
    const code = h('textarea', { class: 'code-paste', rows: 10, spellcheck: 'false', placeholder: 'Paste or type code here (optional — you can also type in the block afterwards)', 'aria-label': 'Code' });
    code.value = selText;
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const a = code.selectionStart; code.setRangeText('  ', a, code.selectionEnd, 'end'); }
    });
    const blockOnly = h('div', { class: 'code-block-opts' },
      h('label', { class: 'fld' }, h('span', {}, 'Language'), lang),
      h('div', { class: 'code-ln-row' },
        h('label', {}, lines, h('span', {}, 'Line numbers')),
        h('label', { title: 'Syntax colors — turn off for plain text color' }, colors, h('span', {}, 'Colors')),
        h('label', { class: 'code-border-row', title: 'Border around the code' }, border),
        h('label', { class: 'code-border-row', title: 'Where the block sits: left, centered or right' }, align)));
    const hint = h('small', { class: 'hint' });
    const setLayout = (v) => {
      layout = v;
      blockOnly.hidden = v === 'inline';
      code.rows = v === 'inline' ? 2 : 10;
      code.placeholder = v === 'inline' ? 'Type the code for the sentence, e.g. print()' : 'Paste or type code here (optional — you can also type in the block afterwards)';
      hint.textContent = v === 'inline'
        ? 'Inline code sits in the sentence in a monospaced font. Tip: type `code` between backticks.'
        : 'Highlighted the same way in the editor, the preview and every export. Tip: type ``` and a language name, then a space, to start a code block from the keyboard.';
    };
    const seg = segmented([{ value: 'block', label: 'Block', title: 'A code block on its own lines' }, { value: 'inline', label: 'Inline', title: 'Code inside the sentence' }], layout, setLayout, { label: 'Layout' });
    seg.classList.add('code-layout');
    setLayout(layout);
    const body = h('div', { class: 'code-dlg' },
      h('div', { class: 'fld' }, h('span', {}, 'Layout'), seg),
      blockOnly,
      h('label', { class: 'fld' }, h('span', {}, 'Code'), code),
      hint);
    requestAnimationFrame(() => code.focus());
    const res = await dialog({ title: 'Insert code', body, ok: 'Insert', cancel: 'Cancel', wide: true });
    if (!res) { view.focus(); return; }
    try { localStorage.setItem('lutefisk.codeLang', lang.value); localStorage.setItem('lutefisk.codeLayout', layout); localStorage.setItem('lutefisk.codeBorder', border.value); localStorage.setItem('lutefisk.codeAlign', align.value); } catch { /* ignore */ }
    if (layout === 'inline') {
      const t = code.value.replace(/\s*\n\s*/g, ' ').trim();
      if (!t) { view.focus(); return; }
      const { from, to } = view.state.selection;
      const tr = view.state.tr.replaceWith(from, to, schema.text(t, [schema.marks.code.create()]));
      tr.setStoredMarks([]);
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return;
    }
    const text = code.value.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    const node = schema.nodes.code_block.create({ params: lang.value, lineNumbers: lines.checked, colors: colors.checked, border: Number(border.value), align: align.value }, text ? schema.text(text) : null);
    const { state } = view;
    const sel = state.selection;
    let tr;
    const para = sel.$from.parent;
    if (para.isTextblock && para.content.size === 0 && sel.empty) tr = state.tr.replaceWith(sel.$from.before(), sel.$from.after(), node);
    else {
      let at = sel.to;
      for (let d = sel.$to.depth; d > 0; d--) if (sel.$to.node(d).isTextblock) { at = sel.$to.after(d); break; }
      tr = state.tr.insert(at, node);
    }
    let pos = null;
    tr.doc.descendants((n, p2) => { if (pos == null && n === node) pos = p2; return pos == null; });
    if (pos != null) tr.setSelection(TextSelection.create(tr.doc, pos + 1 + (text ? 0 : node.content.size)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }

  function codeCmd(lang = '') {
    const { $from } = view.state.selection;
    if ($from.parent.type === schema.nodes.code_block) setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
    else setBlockType(schema.nodes.code_block, { params: lang })(view.state, view.dispatch);
    view.focus();
  }

  /* ---- spelling and grammar suggestions for one problem */
  function lintMenu(lint, after) {
    const fix = (sug) => {
      const { from, to } = lint;
      const tr = sug.kind === 1 ? view.state.tr.delete(from, to)
        : sug.kind === 2 ? view.state.tr.insertText(sug.text, to)
          : view.state.tr.insertText(sug.text, from, to);
      view.dispatch(tr); view.focus();
      after?.();
    };
    return [
      { header: `${lint.pretty}: ${lint.message}`.slice(0, 120) },
      ...lint.suggestions.map((sug) => ({ label: sug.kind === 1 ? `Remove “${lint.problem}”` : sug.kind === 2 ? `Add “${sug.text}”` : !sug.text ? '(nothing)' : !sug.text.trim() ? (sug.text.length === 1 ? 'One space' : 'Two spaces') : sug.text, icon: 'check', onClick: () => fix(sug) })),
      ...(lint.cls === 'spell' ? [{ label: `Add “${lint.problem}” to Dictionary`, icon: 'plus', onClick: () => { ctx.addWord?.(lint.problem); after?.(); } }] : []),
      { label: 'Ignore', icon: 'eyeOff', onClick: () => { ignoreLint(lint); dropLint(lint); harperRecheck(view); after?.(); } },
    ];
  }
  /** Take one problem's underline away now (ignored, or its word added to the dictionary). */
  function dropLint(lint) {
    const same = lintsIn(view.state).filter((l) => l.problem === lint.problem && l.message === lint.message);
    const st = spellKeyName.getState(view.state);
    if (!st || !same.length) return;
    let decos = st.decos;
    for (const l of same) decos = decos.remove(decos.find(l.from, l.to));
    view.dispatch(view.state.tr.setMeta(spellKeyName, { ...st, decos }));
  }
  /** Go to the next (dir 1) or previous (-1) problem after the cursor and show its suggestions. */
  function nextLint(dir = 1, { menu = true, kinds = null } = {}) {
    const all = lintsIn(view.state).filter((l) => !kinds || kinds.has(l.cls));
    if (!all.length) return null;
    const at = dir > 0 ? view.state.selection.to : view.state.selection.from;
    const lint = dir > 0 ? (all.find((l) => l.from >= at && !(l.from === view.state.selection.from && l.to === view.state.selection.to)) || all[0])
      : ([...all].reverse().find((l) => l.to <= at && !(l.from === view.state.selection.from && l.to === view.state.selection.to)) || all.at(-1));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, lint.from, lint.to)).scrollIntoView());
    view.focus();
    if (menu) {
      requestAnimationFrame(() => {
        const c = view.coordsAtPos(lint.from);
        const anchor = h('span', { class: 'ctx-anchor', style: { left: `${c.left}px`, top: `${c.bottom + 2}px` } });
        document.body.append(anchor);
        popover(anchor, [...lintMenu(lint, () => setTimeout(() => nextLint(1), 60)), '-',
          { label: 'Next Problem', icon: 'next', hint: '⌥F7', onClick: () => setTimeout(() => nextLint(1), 0) }], { width: 260 });
        setTimeout(() => anchor.remove(), 0);
      });
    }
    return lint;
  }

  /* ---- right-click menu */
  function contextMenu(e) {
    const inTable = isInTable(view.state);
    const cid = commentAt();
    const hasSel = !view.state.selection.empty;
    const anchor = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } });
    document.body.append(anchor);
    // A spelling or grammar problem under the pointer: its suggestions come first.
    const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
    const lint = at ? lintAt(view.state, at.pos) : null;
    const lintItems = lint ? [...lintMenu(lint), '-'] : [];
    const sub = (fn) => () => { const a2 = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } }); document.body.append(a2); fn(a2); setTimeout(() => a2.remove(), 0); };
    const selText = hasSel ? view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, ' ').trim() : '';
    // The code block under the pointer (else the one with the cursor).
    const codeAt = (() => {
      const $p = at ? view.state.doc.resolve(at.pos) : view.state.selection.$from;
      return $p.parent.type === schema.nodes.code_block ? $p.before() : -1;
    })();
    // Menus from the app (Scene & Chapter) use `choices`; here they open as submenus.
    const toSub = (list) => list.map((it) => (it && it.choices ? { ...it, choices: undefined, submenu: toSub(it.choices), subWidth: 230 } : it));
    const inCode = codeAt >= 0;
    const link = !inCode ? linkItems(at) : [];
    const onLink = link.length > 1;
    // At the top, always in this order: Add Card, Add Character, Add Comment (Delete Comment inside one),
    // Add Thought. With text selected, each starts from it.
    const cardTop = [
      ...(inCode || !ctx.makeCard ? [] : [{ label: 'Add Card', icon: 'card', hint: hasSel ? 'from selection' : '', onClick: () => ctx.makeCard(hasSel ? selectionMarkdown() : '', selText) }]),
      ...(inCode || !ctx.addAsCharacter ? [] : [{ label: 'Add Character', icon: 'person', hint: hasSel ? 'from selection' : '', onClick: () => ctx.addAsCharacter(selText || '') }]),
      { label: cid ? 'Delete Comment' : 'Add Comment', icon: cid ? 'trash' : 'comment', hint: cid ? '' : '⌃⌥M', onClick: cid ? () => { removeComment(cid); ctx.deleteComment?.(cid); } : commentCmd },
      ...(!ctx.newThought ? [] : [{ label: 'Add Thought', icon: 'thought', hint: hasSel ? 'from selection' : '', onClick: () => ctx.newThought(hasSel ? selText : '') }]),
      '-',
    ];
    // Review mode: the mark under the pointer first, then the marks to make.
    const rid = !inCode && ctx.review?.on?.() ? (at ? reviewAtPos(view.state.doc, at.pos) : null) || reviewAtState(view.state) : null;
    const reviewTop = !inCode && ctx.review?.on?.() ? [...(rid ? reviewMarkItems(rid) : []), { label: 'Proofreader’s Marks', icon: 'proof', subWidth: 240, submenu: () => reviewMenuItems({ x: e.clientX, y: e.clientY }) }, '-'] : [];
    const items = [
      ...reviewTop,
      ...cardTop,
      ...lintItems,
      { label: 'Cut', icon: 'clear', hint: '⌘X', disabled: !hasSel, onClick: () => { view.focus(); document.execCommand('cut'); } },
      { label: 'Copy', icon: 'doc', hint: '⌘C', disabled: !hasSel, onClick: () => { view.focus(); document.execCommand('copy'); } },
      { label: 'Paste', icon: 'export', hint: '⌘V', onClick: () => { view.focus(); window.lutefisk.paste?.(); } },
      '-',
      ...(inCode ? [{ header: 'Code block' }, { node: codeOptionsPanel(view.state.doc.nodeAt(codeAt).attrs, (attrs) => { const n = view.state.doc.nodeAt(codeAt); if (n) view.dispatch(view.state.tr.setNodeMarkup(codeAt, null, { ...n.attrs, ...attrs })); view.focus(); }) }, '-'] : []),
      // The selection (or the link under the pointer)
      ...(onLink ? [{ label: 'Link', icon: 'link', submenu: link, subWidth: 200 }] : link),
      ...(hasSel && !inCode ? [{ label: 'Change Case', icon: 'textSize', submenu: CASES.map((c) => ({ label: c.label, onClick: () => caseCmd(c.id) })), subWidth: 200 }] : []),
      ...(inCode ? [] : [
        '-',
        // Exactly the toolbar's + menu: the same items in the same order.
        { label: 'Insert', icon: 'plus', subWidth: 220, submenu: () => insertItems() },
        ...(ctx.structureItems && ctx.structureItems().length ? [{ label: 'Scene & Chapter', icon: 'scene', subWidth: 230, submenu: () => toSub(ctx.structureItems()) }] : []),
      ]),
      ...(inTable ? [{ label: 'Table', icon: 'table', subWidth: 210, submenu: tableItems() }] : []),
    ];
    popover(anchor, items, { width: codeAt >= 0 ? 300 : 220 });
    setTimeout(() => anchor.remove(), 0);
  }

  /** UPPERCASE, lowercase, Capitalize Each Word or Sentence case for the selection, formatting kept. */
  function caseCmd(mode) {
    const { from, to } = view.state.selection;
    if (from === to) return;
    // The selected text, piece by piece (each text node keeps its marks).
    const parts = [];
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || node.marks.some((m) => m.type === schema.marks.code)) return;
      const a = Math.max(from, pos), b = Math.min(to, pos + node.nodeSize);
      if (b > a) parts.push({ a, b, text: node.text.slice(a - pos, b - pos), marks: node.marks });
    });
    if (!parts.length) return;
    // Change the case of the whole run at once (word and sentence starts cross nodes), then split it back.
    const joined = changeCase(parts.map((p) => p.text).join(''), mode);
    const tr = view.state.tr;
    let i = 0;
    for (const p of parts) { p.out = joined.slice(i, i + p.text.length); i += p.text.length; }
    for (const p of [...parts].reverse()) if (p.out !== p.text) tr.replaceWith(p.a, p.b, schema.text(p.out, p.marks));
    if (tr.docChanged) view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView());
    view.focus();
  }
  /** Right-click: a link under the pointer (Open, Edit, Remove), or Add Link… for selected text. */
  function linkItems(at) {
    const type = schema.marks.link;
    const $p = at ? view.state.doc.resolve(at.pos) : null;
    const mark = $p && (type.isInSet($p.marks()) || ($p.nodeAfter && type.isInSet($p.nodeAfter.marks)));
    if (mark) {
      // Put the cursor in that link, so Edit and Remove act on it.
      const inLink = () => { if (!view.state.selection.empty || !type.isInSet(view.state.doc.resolve(view.state.selection.from).marks())) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at.pos))); };
      return [
        { label: 'Open Link', icon: 'link', hint: `${OPEN_KEY}+click`, onClick: () => openLink(mark.attrs.href) },
        { label: 'Edit Link…', icon: 'link', hint: '⌘K', onClick: () => { inLink(); linkCmd(); } },
        { label: 'Remove Link', icon: 'close', onClick: () => { inLink(); const r = linkRange(view.state); if (r) view.dispatch(view.state.tr.removeMark(r.from, r.to, type)); view.focus(); } },
      ];
    }
    return view.state.selection.empty ? [] : [{ label: 'Add Link…', icon: 'link', hint: '⌘K', onClick: () => linkCmd() }];
  }
  /** The selection as Markdown (formatting kept), for Add as Snippet. */
  function selectionMarkdown() {
    const slice = view.state.selection.content();
    let doc;
    try { doc = schema.node('doc', null, slice.content); } catch { doc = null; }
    if (!doc || !doc.childCount || doc.firstChild.isInline) {
      try { doc = schema.node('doc', null, [schema.node('paragraph', null, slice.content)]); } catch { return view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n\n'); }
    }
    return docToMarkdown(doc).trim();
  }

  /* ---- tables */
  function insertTable(rows, cols) {
    const { table, table_row: tr, table_header: th, table_cell: td } = schema.nodes;
    const mk = (type) => type.createAndFill();
    const t = table.create(null, Array.from({ length: rows }, (_, r) => tr.create(null, Array.from({ length: cols }, () => mk(r === 0 ? th : td)))));
    const { $from } = view.state.selection;
    let tr2 = view.state.tr;
    if ($from.parent.type === schema.nodes.paragraph && !$from.parent.content.size) tr2 = tr2.replaceWith($from.before(), $from.after(), t);
    else tr2 = tr2.insert($from.after(1), t);
    const pos = tr2.mapping.map($from.pos);
    view.dispatch(tr2.setSelection(TextSelection.near(tr2.doc.resolve(Math.min(tr2.doc.content.size, pos + 3)))).scrollIntoView());
    view.focus();
  }
  async function customTable() {
    const res = await dialog({ title: 'Insert table', fields: [{ name: 'rows', label: 'Rows (including the header row)', type: 'number', value: '4' }, { name: 'cols', label: 'Columns', type: 'number', value: '3' }], ok: 'Insert' });
    if (res) insertTable(Math.min(60, Math.max(2, +res.rows || 4)), Math.min(12, Math.max(1, +res.cols || 3)));
    else view.focus();
  }
  const tcmd = (cmd) => () => { cmd(view.state, view.dispatch); view.focus(); };
  const alignCol = (a) => () => {
    const rect = selectedRect(view.state);
    const tr = view.state.tr;
    for (let r = 0; r < rect.map.height; r++) {
      const pos = rect.tableStart + rect.map.map[r * rect.map.width + rect.left];
      tr.setNodeMarkup(pos, null, { ...tr.doc.nodeAt(pos).attrs, align: a });
    }
    view.dispatch(tr); view.focus();
  };
  function tableItems() {
    if (!isInTable(view.state)) {
      return [{ header: 'Insert table' },
        ...[[3, 2], [3, 3], [4, 3], [5, 4]].map(([r, c]) => ({ label: `${c} columns × ${r - 1} rows`, icon: 'table', onClick: () => insertTable(r, c) })),
        { label: 'Custom Size…', icon: 'table', onClick: customTable }];
    }
    return [
      { label: 'Add Row Above', icon: 'up', onClick: tcmd(addRowBefore) }, { label: 'Add Row Below', icon: 'down', onClick: tcmd(addRowAfter) },
      { label: 'Add Column Left', icon: 'prev', onClick: tcmd(addColumnBefore) }, { label: 'Add Column Right', icon: 'next', onClick: tcmd(addColumnAfter) },
      '-',
      { label: 'Align Column Left', icon: 'alignLeft', onClick: alignCol('left') }, { label: 'Align Column Center', icon: 'alignCenter', onClick: alignCol('center') }, { label: 'Align Column Right', icon: 'alignRight', onClick: alignCol('right') },
      '-',
      { label: 'Delete Row', icon: 'minus', onClick: tcmd(deleteRow) }, { label: 'Delete Column', icon: 'minus', onClick: tcmd(deleteColumn) },
      { label: 'Delete Table', icon: 'trash', danger: true, onClick: tcmd(deleteTable) },
    ];
  }


  function symbolCmd() {
    const font = getComputedStyle(view.dom).fontFamily;
    openSymbolPicker({
      fontFamily: font,
      onInsert: (ch) => view.dispatch(view.state.tr.insertText(ch).scrollIntoView()),
      onClose: () => view.focus(),
    });
  }

  async function imageCmd() {
    const rel = await ctx.importImage?.();
    if (!rel) return;
    const res = await dialog({
      title: 'Image details',
      fields: [
        { name: 'alt', label: 'Alternative text (for accessibility)', value: '' },
        { name: 'title', label: 'Caption (optional)', value: '' },
        { name: 'width', label: 'Width', type: 'select', value: '60', options: [100, 80, 60, 50, 40, 30].map((v) => ({ value: String(v), label: `${v}% of text width` })) },
        { name: 'align', label: 'Position', type: 'select', value: 'center', options: ['center', 'left', 'right', 'full'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
        { name: 'wrap', label: 'Text wrapping', type: 'select', value: 'topbottom', options: WRAP_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
      ], ok: 'Insert',
    });
    const a = res || { alt: '', title: '', width: '60', align: 'center', wrap: 'topbottom' };
    let align = a.align;
    if (['square', 'tight', 'through'].includes(a.wrap) && !['left', 'right'].includes(align)) align = 'left';
    const node = schema.nodes.image.create({ src: rel, alt: a.alt, title: a.title, width: a.width === '100' ? null : +a.width, align, wrap: a.wrap });
    const { state } = view;
    const { $from } = state.selection;
    // Images go in their own paragraph.
    const tr = state.tr;
    if ($from.parent.content.size === 0) tr.replaceSelectionWith(node);
    else tr.insert($from.after(1), schema.nodes.paragraph.create(null, node));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }
  async function indexCmd() {
    const text = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, ' ').trim();
    const res = await dialog({ title: 'Add index term', message: 'Every occurrence of this term in the book will be listed in the Index.', fields: [{ name: 'term', label: 'Term', value: text }] , ok: 'Add' });
    if (res?.term?.trim()) ctx.addIndexTerm?.(res.term.trim());
    view.focus();
  }

  /* ---- alignment: wrap the selected blocks in an align node, change it, or unwrap for "left" */
  function alignNodeDepth(state) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.align) return d;
    return 0;
  }
  function currentAlign(state) { const d = alignNodeDepth(state); return d ? state.selection.$from.node(d).attrs.align : 'left'; }
  function alignCmd(align) {
    return (state, dispatch) => {
      const d = alignNodeDepth(state);
      if (d) {
        const pos = state.selection.$from.before(d);
        if (align === 'left') return lift(state, dispatch) || (dispatch && dispatch(state.tr.setNodeMarkup(pos, null, { align: 'left' })), true);
        if (dispatch) dispatch(state.tr.setNodeMarkup(pos, null, { align }));
        return true;
      }
      if (align === 'left') return true;
      return wrapIn(schema.nodes.align, { align })(state, dispatch);
    };
  }
  /* ---- the toolbar: two rows, with the less-used choices in small menus */
  const tb = (name, title, onclick, isActive, cls = '') => {
    const b = h('button', { type: 'button', class: `ql-${name} ${cls}`.trim(), title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick }, icon(name));
    b._active = isActive;
    return b;
  };
  /** A button that opens a small menu; it shows the icon of whatever is in use. */
  const menuBtn = (name, title, items, isActive) => {
    const b = tb(name, title, () => popover(b, items(), { width: 230 }), isActive, 'ql-menu');
    b.append(h('span', { class: 'ql-caret' }, icon('chevron', 9)));
    return b;
  };
  const check = (on) => (on ? '✓ ' : '');
  const toggleList = (type) => run((s, d) => (inAncestor(s, type) ? liftListItem(schema.nodes.list_item)(s, d) : wrapInList(type)(s, d)));
  const textMenu = menuBtn('textStyle', 'Subscript, superscript and strikethrough', () => [
    { label: `${check(markActive(view.state, schema.marks.subscript))}Subscript`, hint: '⌘,', icon: 'subscript', onClick: run(toggleMark(schema.marks.subscript)) },
    { label: `${check(markActive(view.state, schema.marks.superscript))}Superscript`, hint: '⌘.', icon: 'superscript', onClick: run(toggleMark(schema.marks.superscript)) },
    { label: `${check(markActive(view.state, schema.marks.strike))}Strikethrough`, hint: '⇧⌘X', icon: 'strike', onClick: run(toggleMark(schema.marks.strike)) },
  ], (s) => markActive(s, schema.marks.subscript) || markActive(s, schema.marks.superscript) || markActive(s, schema.marks.strike));
  const bulletIs = (st, sym) => { const { $from } = st.selection; for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.bullet_list) return sym === undefined ? true : ($from.node(d).attrs.symbol || '') === sym; return false; };
  const plainBullets = run((st, d) => {
    if (bulletIs(st)) {
      if (!bulletIs(st, '')) { const { $from } = st.selection; for (let k = $from.depth; k > 0; k--) if ($from.node(k).type === schema.nodes.bullet_list) { d(st.tr.setNodeMarkup($from.before(k), null, { ...$from.node(k).attrs, symbol: '' })); return true; } }
      return liftListItem(schema.nodes.list_item)(st, d);
    }
    return wrapInList(schema.nodes.bullet_list)(st, d);
  });
  const listItems = () => [
    { label: `${check(bulletIs(view.state, ''))}Bulleted List`, icon: 'ul', onClick: plainBullets },
    { label: `${check(inAncestor(view.state, schema.nodes.ordered_list))}Numbered List`, icon: 'ol', onClick: toggleList(schema.nodes.ordered_list) },
    { label: `${check(bulletIs(view.state) && !bulletIs(view.state, ''))}Custom Bullet…`, icon: 'star', onClick: () => customBulletCmd() },
  ]; // in the + menu (Link, Image, List, …)
  /* ---- alignment */
  const ALIGN_ICON = { left: 'textLeft', center: 'textCenter', right: 'textRight', justify: 'textJustify' };
  // Alignment: pointing at a choice, or moving through them with the arrow keys, shows it on the
  // text; only a click or Return keeps it (like the paragraph styles).
  const ALIGNS = ['left', 'center', 'right', 'justify'];
  const alignMenu = h('button', { type: 'button', class: 'ql-textLeft ql-menu', title: 'Text alignment — point at one to see it, click or press Return to keep it', 'aria-label': 'Text alignment', 'aria-haspopup': 'menu', onmousedown: (e) => e.preventDefault() },
    icon('textLeft'), h('span', { class: 'ql-caret' }, icon('chevron', 9)));
  alignMenu._active = (s) => currentAlign(s) !== 'left';
  let alignPreview = null; // { doc, sel, value } while the list is open
  const revertAlign = () => {
    if (!alignPreview || view.state.doc.eq(alignPreview.doc)) return;
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, alignPreview.doc.content);
    try { tr.setSelection(Selection.fromJSON(tr.doc, alignPreview.sel)); } catch { /* keep the mapped selection */ }
    view.dispatch(tr.setMeta('addToHistory', false));
  };
  const previewAlign = (a) => {
    if (!alignPreview) return;
    revertAlign();
    if (a !== alignPreview.value) alignCmd(a)(view.state, (tr) => view.dispatch(tr.setMeta('addToHistory', false)));
  };
  function openAlignList() {
    const cur = currentAlign(view.state);
    alignPreview = { doc: view.state.doc, sel: view.state.selection.toJSON(), value: cur };
    let kept = false;
    const menu = popover(alignMenu, ALIGNS.map((a) => ({
      label: `${a[0].toUpperCase()}${a.slice(1)}`, icon: ALIGN_ICON[a], hint: `${IS_MAC ? '⌘' : 'Ctrl+'}${{ left: 'L', center: 'E', right: 'R', justify: 'J' }[a]}`,
      onClick: () => { kept = true; revertAlign(); alignPreview = null; run(alignCmd(a))(); },
    })), { width: 190, onClose: () => { if (!kept) { revertAlign(); alignPreview = null; view.focus(); } } });
    const items = [...menu.querySelectorAll('.pop-item')];
    items.forEach((btn, k) => {
      btn.addEventListener('mouseenter', () => previewAlign(ALIGNS[k]));
      btn.addEventListener('focus', () => previewAlign(ALIGNS[k]));
    });
    menu.addEventListener('mouseleave', () => { if (alignPreview) revertAlign(); });
    items[ALIGNS.indexOf(cur)]?.focus();
  }
  alignMenu.addEventListener('click', openAlignList);
  alignMenu.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openAlignList(); } });
  /* ---- text color: printed in the book (e-ink shows it as gray) */
  const TEXT_COLORS = [['#1f1f1f', 'Ink'], ['#6b6b6b', 'Gray'], ['#b03a2e', 'Red'], ['#c0571b', 'Orange'], ['#8a6d1d', 'Ochre'], ['#2e7d32', 'Green'], ['#00796b', 'Teal'], ['#1f5fa8', 'Blue'], ['#283593', 'Navy'], ['#6a3d9a', 'Purple'], ['#ad1457', 'Magenta'], ['#6d4c41', 'Brown']];
  let textPen = (() => { try { return localStorage.getItem('lutefisk.textColor') || '#b03a2e'; } catch { return '#b03a2e'; } })();
  const colorActive = (st) => { const { from, to, empty, $from } = st.selection; const m = schema.marks.textColor; return empty ? !!m.isInSet(st.storedMarks || $from.marks()) : st.doc.rangeHasMark(from, to, m); };
  const applyColor = (c) => {
    const { state } = view;
    const { from, to, empty } = state.selection;
    if (c) { textPen = c; try { localStorage.setItem('lutefisk.textColor', c); } catch { /* ignore */ } drawColorBtn(); }
    if (empty) {
      // No selection: the next text you type gets the color (or loses it).
      const tr = state.tr.removeStoredMark(schema.marks.textColor);
      view.dispatch(c ? tr.addStoredMark(schema.marks.textColor.create({ color: c })) : tr);
    } else {
      const tr = state.tr.removeMark(from, to, schema.marks.textColor);
      view.dispatch(c ? tr.addMark(from, to, schema.marks.textColor.create({ color: c })) : tr);
    }
    view.focus();
  };
  const colorBtn = h('button', { type: 'button', class: 'ql-textcolor ql-split-main', title: 'Text color — printed in the book', 'aria-label': 'Text color', onmousedown: (e) => e.preventDefault(), onclick: () => applyColor(textPen) });
  const colorMore = h('button', { type: 'button', class: 'ql-split-more', title: 'Text colors', 'aria-label': 'Text colors', onmousedown: (e) => e.preventDefault(), onclick: () => {
    const custom = h('input', { type: 'color', value: textPen, 'aria-label': 'Custom color' });
    custom.addEventListener('change', () => { closePopovers(); applyColor(custom.value.toLowerCase()); });
    const grid = h('div', { class: 'tc-pick' },
      h('div', { class: 'tc-row' }, TEXT_COLORS.map(([c, name]) => h('button', { type: 'button', class: `tc-sw${textPen === c ? ' on' : ''}`, style: { background: c }, title: name, 'aria-label': `${name} text`, onmousedown: (e) => e.preventDefault(), onclick: () => { closePopovers(); applyColor(c); } }))),
      h('label', { class: 'tc-custom' }, custom, h('span', {}, 'Custom color…')));
    popover(colorMore, [
      { header: 'Text color — printed in the book' },
      { node: grid },
      '-',
      { label: 'Automatic (no color)', icon: 'eraser', disabled: !colorActive(view.state), onClick: () => applyColor(null) },
    ], { width: 248 });
  } }, icon('chevron', 9));
  function drawColorBtn() { colorBtn.replaceChildren(icon('textColor', 18), h('span', { class: 'tc-bar', style: { background: textPen } })); }
  drawColorBtn();
  colorBtn._active = colorActive;
  const colorGroup = h('span', { class: 'ql-split' }, colorBtn, colorMore);
  /* ---- highlighter: soft, see-through colors for marking up your own text (not printed in the book) */
  const HL_COLORS = [['yellow', 'Yellow'], ['bright', 'Bright Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['pink', 'Pink'], ['orange', 'Orange'], ['purple', 'Purple']];
  let hlPen = (() => { try { return { color: JSON.parse(localStorage.getItem('lutefisk.hlPen'))?.color || 'yellow', size: 'full' }; } catch { return { color: 'yellow', size: 'full' }; } })();
  const hlActive = (st) => { const { from, to, empty, $from } = st.selection; const m = schema.marks.highlight; return empty ? !!m.isInSet(st.storedMarks || $from.marks()) : st.doc.rangeHasMark(from, to, m); };
  const applyHighlight = (pen) => {
    hlPen = pen;
    try { localStorage.setItem('lutefisk.hlPen', JSON.stringify(pen)); } catch { /* ignore */ }
    drawHlBtn();
    const { state } = view;
    const { from, to, empty } = state.selection;
    if (empty) { toast('Select some text to highlight', 'info', 1400); view.focus(); return; }
    view.dispatch(state.tr.removeMark(from, to, schema.marks.highlight).addMark(from, to, schema.marks.highlight.create(pen)));
    view.focus();
  };
  const removeHighlight = () => {
    const { state } = view;
    const { from, to, empty, $from } = state.selection;
    let a = from, b = to;
    if (empty) {
      // In a highlight with nothing selected: remove that whole highlight.
      const m = schema.marks.highlight.isInSet($from.marks());
      if (!m) return;
      const par = $from.parent, start = $from.start();
      let pos = start;
      par.forEach((n, off) => { const s0 = start + off, e0 = s0 + n.nodeSize; if (m.isInSet(n.marks) && s0 <= from && from <= e0) { a = Math.min(a, s0); b = Math.max(b, e0); } pos = e0; });
    }
    view.dispatch(state.tr.removeMark(a, b, schema.marks.highlight));
    view.focus();
  };
  const hlBtn = h('button', { type: 'button', class: 'ql-highlighter ql-split-main', title: 'Highlight the selected text', 'aria-label': 'Highlight', onmousedown: (e) => e.preventDefault(), onclick: () => (hlActive(view.state) && view.state.selection.empty ? removeHighlight() : applyHighlight(hlPen)) });
  const hlMore = h('button', { type: 'button', class: 'ql-split-more', title: 'Highlighter colors', 'aria-label': 'Highlighter colors', onmousedown: (e) => e.preventDefault(), onclick: () => {
    const swatches = h('div', { class: 'hl-pick' },
      h('div', { class: 'hl-row' }, HL_COLORS.map(([c, name]) => h('button', { type: 'button', class: `hl-sw hl-demo hl-${c}${hlPen.color === c ? ' on' : ''}`, title: name, 'aria-label': `${name} highlighter`, onmousedown: (e) => e.preventDefault(), onclick: () => { closePopovers(); applyHighlight({ color: c, size: 'full' }); } }))));
    popover(hlMore, [
      { header: 'Highlighter — for you; not printed in the book' },
      { node: swatches },
      '-',
      { label: 'Remove Highlight', icon: 'eraser', disabled: !hlActive(view.state), onClick: removeHighlight },
    ], { width: 240 });
  } }, icon('chevron', 9));
  function drawHlBtn() {
    hlBtn.replaceChildren(icon('highlighter', 18), h('span', { class: `hl-bar hl-demo hl-${hlPen.color}` }));
  }
  drawHlBtn();
  hlBtn._active = hlActive;
  const hlGroup = h('span', { class: 'ql-split' }, hlBtn, hlMore);

  // Insert ▾: table, code, formula, symbol and drawing, in one menu.
  // The + menu; the right-click menu's Insert ▸ offers the same items in the same order.
  function insertItems() {
    return [
      { label: 'Link', icon: 'link', hint: `${IS_MAC ? '⌘' : 'Ctrl+'}K`, onClick: () => linkCmd() },
      { label: 'Image', icon: 'image', onClick: () => imageCmd() },
      { label: 'List', icon: 'listMenu', subWidth: 210, submenu: listItems() },
      { label: 'Table', icon: 'table', subWidth: 220, submenu: tableItems() },
      { label: 'Insert Code', icon: 'code', onClick: () => insertCodeCmd() },
      { label: 'Insert Formula', icon: 'mathFx', hint: `${IS_MAC ? '⌥⌘' : 'Ctrl+Alt+'}E`, onClick: () => mathCmd() },
      { label: 'Insert Symbol', icon: 'omega', hint: `${IS_MAC ? '⌥⌘' : 'Ctrl+Alt+'}I`, onClick: () => symbolCmd() },
      { label: 'Insert Drawing', icon: 'drawing', onClick: () => drawCmd() },
      '-',
      { label: 'Citation…', icon: 'cite', hint: `${IS_MAC ? '⌥⌘' : 'Ctrl+Alt+'}C`, onClick: () => citeCmd() },
      { label: 'Footnote', icon: 'footnote', hint: `${IS_MAC ? '⌥⌘' : 'Ctrl+Alt+'}F`, onClick: () => footnoteCmd() },
      { label: 'Checkbox', icon: 'checklist', hint: '[ ]', onClick: () => insertBox() },
      '-',
      { label: 'New Line', icon: 'newline', hint: IS_MAC ? '⇧↵' : 'Shift+Enter', onClick: run(insertLineBreak) },
      { label: 'Horizontal Line', icon: 'hline', onClick: run(insertHorizontalLine) },
      { label: 'Page Break', icon: 'pagebreak', hint: IS_MAC ? '⌘↵' : 'Ctrl+Enter', onClick: run(insertPageBreak) },
      { label: 'Scene Break', icon: 'scene', onClick: run(insertSceneBreak) },
      // Only while proofreading (the pencil above the editor turns it on).
      ...(ctx.review?.on?.() ? ['-', { label: 'Proofreader’s Marks', icon: 'proof', subWidth: 240, submenu: () => reviewMenuItems() }] : []),
    ];
  }
  const insertMenu = menuBtn('plus', 'Insert — link, image, list, table, code, formula, symbol, drawing, citation, footnote, checkbox, line, break or proofreader’s mark', insertItems, (s) => isInTable(s) || s.selection.$from.parent.type === schema.nodes.code_block || markActive(s, schema.marks.link) || inAncestor(s, schema.nodes.bullet_list) || inAncestor(s, schema.nodes.ordered_list));

  // One tidy row (it wraps by group when the editor is narrow):
  // history · style · character formatting · color · paragraph · insert · lines.
  const undoBtn = tb('undo', 'Undo (⌘Z)', () => { undo(view.state, view.dispatch); view.focus(); }, null, 'ql-undo');
  const redoBtn = tb('redo', 'Redo (⇧⌘Z)', () => { redo(view.state, view.dispatch); view.focus(); }, null, 'ql-redo');
  const groups = [
    [undoBtn, redoBtn],
    [styleBtn],
    [tb('bold', 'Bold (⌘B)', run(toggleMark(schema.marks.strong)), (s) => markActive(s, schema.marks.strong)),
      tb('italic', 'Italic (⌘I)', run(toggleMark(schema.marks.em)), (s) => markActive(s, schema.marks.em)),
      tb('underline', 'Underline (⌘U)', run(toggleMark(schema.marks.underline)), (s) => markActive(s, schema.marks.underline)),
      textMenu, alignMenu],
    [colorGroup, hlGroup],
    [insertMenu],
  ];
  toolbar.append(h('div', { class: 'ql-row' }, groups.map((g) => h('span', { class: 'ql-formats' }, g))));
  const counter = h('span', { class: 'ql-count', 'aria-live': 'off' });
  toolbar.append(counter);

  function refreshToolbar() {
    const s = view.state;
    undoBtn.disabled = !undo(s); redoBtn.disabled = !redo(s);
    for (const b of toolbar.querySelectorAll('button')) {
      if (b._active) b.classList.toggle('ql-active', !!b._active(s));
    }
    styleSel.value = currentBlockStyle(s);
    styleLabel.textContent = BLOCK_STYLES.find(([v]) => v === styleSel.value)?.[1] || 'Paragraph';
    styleBtn.title = `Paragraph style: ${styleLabel.textContent} — point at a style to see it, click or press Return to keep it`;
    styleBtn.setAttribute('aria-label', `Paragraph style: ${styleLabel.textContent}`);
    styleBtn.classList.toggle('ql-active', !!styleSel.value && styleSel.value !== 'p');
    const sub = markActive(s, schema.marks.subscript), sup = markActive(s, schema.marks.superscript);
    const tIc = sub ? 'subscript' : sup ? 'superscript' : markActive(s, schema.marks.strike) ? 'strike' : 'textStyle';
    if (textMenu.dataset.ic !== tIc) { textMenu.dataset.ic = tIc; textMenu.firstChild.replaceWith(icon(tIc)); }
    const aIc = ALIGN_ICON[currentAlign(s)] || 'textLeft';
    if (alignMenu.dataset.ic !== aIc) { alignMenu.dataset.ic = aIc; alignMenu.firstChild.replaceWith(icon(aIc)); }
  }

  const states = new Map(); // sectionId → EditorState (keeps undo history per section)
  let currentId = null;

  const api = {
    view,
    counter,
    load(id, markdown) {
      if (currentId) states.set(currentId, view.state);
      currentId = id;
      let st = states.get(id);
      if (!st) { st = mkState(parseMarkdownDoc(markdown)); states.set(id, st); }
      view.updateState(st);
      refreshToolbar();
      spell.onLoad?.();
      spell.onState?.();
    },
    /** Insert Markdown (e.g. a snippet) at the cursor, as blocks. */
    /** Replace the open text with new Markdown (a book-wide correction), as one undoable change. */
    setMarkdown(md) {
      const doc = parseMarkdownDoc(md);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
      view.dispatch(tr);
    },
    /** Put Markdown in as whole paragraphs, before or after the paragraph with the cursor. */
    insertBlocks(md, where = 'after') {
      const doc = parseMarkdownDoc(md);
      if (!doc.content.size) return false;
      const { $from } = view.state.selection;
      const pos = $from.depth >= 1 ? (where === 'before' ? $from.before(1) : $from.after(1)) : view.state.selection.from;
      const tr = view.state.tr.insert(pos, doc.content);
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    },
    /** The selection as Markdown, formatting kept (for a new index card). */
    selectionMarkdown: () => selectionMarkdown(),
    redraw() { view.setProps({ nodeViews: { ...view.props.nodeViews } }); },
    /** Spelling and grammar settings changed: check again (or clear). */
    recheckSpelling() { view.setProps({}); harperRecheck(view); },
    /** Check spelling and grammar now (on-demand mode, or to refresh). */
    checkSpellingNow() { harperRecheck(view); },
    /** Problems underlined right now, and whether this text has been checked. */
    spellProblems() { return lintsIn(view.state); },
    spellChecked() { return wasChecked(view.state); },
    /** How many problems of these kinds are marked in the open text. */
    spellCount(kinds) { return lintsIn(view.state).filter((l) => !kinds || kinds.has(l.cls)).length; },
    /** Select the next (1) or previous (-1) problem and show its suggestions. */
    nextSpellProblem(dir = 1, opts) { return nextLint(dir, opts); },
    undo() { undo(view.state, view.dispatch); view.focus(); },
    redo() { redo(view.state, view.dispatch); view.focus(); },
    /** Highlight all matches of `re`; select and scroll to match number `index` (if given). */
    search(re, index = -1) {
      const ms = findMatches(view.state.doc, re);
      const tr = view.state.tr.setMeta(searchKey, { re, active: index });
      if (index >= 0 && ms[index]) tr.setSelection(TextSelection.create(tr.doc, ms[index].from, ms[index].to)).scrollIntoView();
      view.dispatch(tr);
      if (index >= 0 && ms[index]) requestAnimationFrame(() => { try { const c = view.coordsAtPos(ms[index].from); const box = area.getBoundingClientRect(); area.scrollTop += c.top - (box.top + box.height * 0.35); } catch { /* not laid out */ } });
      return ms.length;
    },
    clearSearch() { view.dispatch(view.state.tr.setMeta(searchKey, { re: null })); },
    /** Replace in the open text: match `index`, all matches, or all inside the selection. Undoable. */
    replace(re, replacement, { index = -1, inSelection = false } = {}) {
      let ms = findMatches(view.state.doc, re);
      if (inSelection) { const { from, to } = view.state.selection; ms = ms.filter((m) => m.from >= from && m.to <= to); }
      else if (index >= 0) ms = ms[index] ? [ms[index]] : [];
      if (!ms.length) return 0;
      const tr = replaceMatches(view.state.tr, ms, replacement);
      tr.setMeta(searchKey, { re, active: -1 });
      view.dispatch(tr);
      return ms.length;
    },
    selectionText() { const { from, to } = view.state.selection; return view.state.doc.textBetween(from, to, ' '); },
    hasSelection() { return !view.state.selection.empty; },
    forget(id) { states.delete(id); },
    /** The cast changed (or highlights went on or off): find the names again in the open text. */
    refreshCharacters() { hideCharCard(); charPlugin.bump(); view.setProps({}); },
    /** Redraw citation chips (style or sources changed). */
    refreshCitations() { view.setProps({ nodeViews: { ...view.props.nodeViews } }); },
    reset() { states.clear(); currentId = null; },
    markdown: () => docToMarkdown(view.state.doc),
    /** Markdown before and after the caret (for splitting a scene). */
    splitAtCaret() {
      const d = view.state.doc;
      const pos = view.state.selection.from;
      return { before: docToMarkdown(d.cut(0, pos)).trim(), after: docToMarkdown(d.cut(pos)).trim() };
    },
    focus: () => view.focus(),
    /** Typewriter scrolling: keep the cursor line in the middle of the editor. */
    /** Typography tools in the open text (undoable): the selection, or all of it. */
    typography(kind, { selection = false } = {}) {
      const { from, to } = view.state.selection;
      const tr = view.state.tr;
      const n = selection && from !== to ? typoTr(tr, kind, from, to) : typoTr(tr, kind);
      if (n) view.dispatch(tr.scrollIntoView());
      return n;
    },
    /** Find this text (an Author's Note's quote) and select it. Returns true when found. */
    selectText(str) {
      const want = String(str || '').replace(/…$/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!want) return false;
      let hit = null;
      view.state.doc.descendants((node, pos) => {
        if (hit || !node.isTextblock) return !hit;
        let text = '';
        const map = [];
        node.forEach((child, off) => { const t = child.isText ? child.text : '\ufffc'; for (let i = 0; i < t.length; i++) map.push(pos + 1 + off + (child.isText ? i : 0)); text += t; });
        const i = text.replace(/\s/g, ' ').indexOf(want);
        if (i >= 0) hit = { from: map[i], to: map[i + want.length - 1] + 1 };
        return false;
      });
      if (!hit) return false;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.from, hit.to)).scrollIntoView());
      view.focus();
      return true;
    },
    centerCaret() {
      const box = area.getBoundingClientRect();
      let c;
      try { c = view.coordsAtPos(view.state.selection.head); } catch { return; }
      const target = box.top + box.height * 0.45;
      area.scrollTop += c.top - target;
    },
    setEditable(on) { view.setProps({ editable: () => on }); },
    /** Top-level block index of the cursor and fractional position inside it. */
    caret() {
      const { $head } = view.state.selection;
      const index = $head.depth ? $head.index(0) : Math.max(0, view.state.selection.$from.index(0));
      const block = view.state.doc.maybeChild(index);
      const start = $head.depth ? $head.before(1) + 1 : 0;
      const frac = block && block.content.size ? Math.min(1, Math.max(0, ($head.pos - start) / block.content.size)) : 0;
      return { index, frac };
    },
    async editFootnote(pos, node) {
      const res = await dialog({ title: 'Edit footnote', fields: [{ name: 'text', label: 'Note text', type: 'textarea', value: node.attrs.text, rows: 5 }], ok: 'Save', cancel: 'Cancel' });
      if (res == null) return view.focus();
      const tr = res.text.trim() ? view.state.tr.setNodeMarkup(pos, null, { text: res.text.trim() }) : view.state.tr.delete(pos, pos + 1);
      view.dispatch(tr); view.focus();
    },
    editDrawing: (pos, node) => drawCmd(pos, node),
    /* Review mode */
    reviewRanges: () => reviewRanges(),
    reviewAt: () => reviewAtState(view.state),
    reviewIdsInSelection: () => reviewIdsInSelection(),
    reviewMark: (type) => reviewCmd(type),
    finishReview: (id, accept) => finishReview(id, accept),
    removeReview: (id) => { const tr = removeReviewTr(view.state.tr, id); if (tr.docChanged) view.dispatch(tr); },
    selectReview: (id) => selectReview(id),
    nextReview: (dir, opts) => nextReview(dir, opts),
    clearReview: () => clearReview(),
    toolbar,
    /** Review went on or off, or a mark's note changed: draw the marks again. */
    refreshReview() { view.dispatch(view.state.tr.setMeta(reviewKey, true).setMeta('addToHistory', false)); },
    reviewMenuItems: () => reviewMenuItems(),
    reviewPicker: (anchor) => reviewPicker(anchor),
    commentRanges: () => commentRanges(),
    commentAt: () => commentAt(),
    removeComment: (id) => removeComment(id),
    selectComment: (id) => selectComment(id),
    container: area,
    async editImage(pos, node) {
      const a = node.attrs;
      const res = await dialog({
        title: 'Image',
        fields: [
          { name: 'alt', label: 'Alternative text', value: a.alt },
          { name: 'title', label: 'Caption', value: a.title },
          { name: 'width', label: 'Width (% of text width)', type: 'number', value: a.width || 100 },
          { name: 'align', label: 'Position', type: 'select', value: a.align || 'center', options: ['center', 'left', 'right', 'full'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
          { name: 'wrap', label: 'Text wrapping', type: 'select', value: a.wrap === true ? 'square' : a.wrap || 'topbottom', options: WRAP_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
        ], ok: 'Apply',
      });
      if (!res) return view.focus();
      const w = Math.min(100, Math.max(5, Math.round(+res.width || 100)));
      view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...a, alt: res.alt, title: res.title, width: w === 100 ? null : w, align: res.align, wrap: res.wrap }));
      view.focus();
    },
    selectNodeAt(pos) { view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))); },
  };
  return api;
}

/**
 * A small rich-text editor (snippets): the same text and list formatting as the
 * chapter editor, stored as Markdown. Returns { el, focus(), markdown(), view }.
 */
const MINI_BASE_KEYS = (() => { const k = { ...baseKeymap }; delete k.Escape; return k; })();
export function createMiniEditor(markdown, { placeholder = '', label = 'Text', onChange, onSubmit } = {}) {
  const toolbar = h('div', { class: 'mini-tb', role: 'toolbar', 'aria-label': 'Formatting' });
  const area = h('div', { class: 'mini-area' });
  const el = h('div', { class: 'mini-ed' }, toolbar, area);
  const keys = {
    'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em), 'Mod-u': toggleMark(schema.marks.underline),
    'Mod-Shift-x': toggleMark(schema.marks.strike), 'Mod-,': toggleMark(schema.marks.subscript), 'Mod-.': toggleMark(schema.marks.superscript),
    Enter: splitListItem(schema.nodes.list_item), 'Mod-[': liftListItem(schema.nodes.list_item), 'Mod-]': sinkListItem(schema.nodes.list_item),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
    'Mod-Enter': () => { onSubmit?.(); return true; },
  };
  const view = new EditorView(area, {
    // No Escape binding (baseKeymap selects the parent node): Esc closes the window the editor is in.
    state: EditorState.create({ doc: parseMarkdownDoc(String(markdown || '')), plugins: [buildInputRules(), keymap(keys), keymap(MINI_BASE_KEYS), history()] }),
    attributes: { class: 'ql-editor mini-editor', spellcheck: 'true', 'aria-label': label, 'data-placeholder': placeholder },
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
      refresh();
      if (tr.docChanged) onChange?.();
    },
    handleDOMEvents: {
      drop: (_v, e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); return true; } return false; },
      paste: (_v, e) => { if ([...(e.clipboardData?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); return true; } return false; },
    },
    transformPastedHTML: (html) => html.replace(/<img[^>]*>/gi, ''),
  });
  const run = (cmd) => () => { cmd(view.state, view.dispatch, view); view.focus(); };
  const list = (type) => (state, dispatch) => (inAncestor(state, type) ? liftListItem(schema.nodes.list_item)(state, dispatch) : wrapInList(type)(state, dispatch));
  const quote = (state, dispatch) => (inAncestor(state, schema.nodes.blockquote) ? lift(state, dispatch) : wrapIn(schema.nodes.blockquote)(state, dispatch));
  const B = [
    ['bold', 'Bold (⌘B)', toggleMark(schema.marks.strong), (s) => markActive(s, schema.marks.strong)],
    ['italic', 'Italic (⌘I)', toggleMark(schema.marks.em), (s) => markActive(s, schema.marks.em)],
    ['underline', 'Underline (⌘U)', toggleMark(schema.marks.underline), (s) => markActive(s, schema.marks.underline)],
    ['strike', 'Strikethrough', toggleMark(schema.marks.strike), (s) => markActive(s, schema.marks.strike)],
    ['superscript', 'Superscript', toggleMark(schema.marks.superscript), (s) => markActive(s, schema.marks.superscript)],
    ['subscript', 'Subscript', toggleMark(schema.marks.subscript), (s) => markActive(s, schema.marks.subscript)],
    '|',
    ['ul', 'Bulleted list', list(schema.nodes.bullet_list), (s) => inAncestor(s, schema.nodes.bullet_list)],
    ['ol', 'Numbered list', list(schema.nodes.ordered_list), (s) => inAncestor(s, schema.nodes.ordered_list)],
    ['quote', 'Block quote', quote, (s) => inAncestor(s, schema.nodes.blockquote)],
    '|',
    ['clear', 'Clear formatting', clearFormatting, null],
    ['undo', 'Undo (⌘Z)', undo, null],
    ['redo', 'Redo (⇧⌘Z)', redo, null],
  ];
  for (const b of B) {
    if (b === '|') { toolbar.append(h('span', { class: 'mini-sep' })); continue; }
    const [ic, title, cmd, active] = b;
    const btn = h('button', { type: 'button', class: 'mini-btn', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: run(cmd) }, icon(ic, 15));
    btn._active = active;
    toolbar.append(btn);
  }
  function refresh() {
    for (const b of toolbar.querySelectorAll('button')) if (b._active) b.classList.toggle('on', !!b._active(view.state));
    area.classList.toggle('empty', view.state.doc.textContent.length === 0 && view.state.doc.childCount <= 1);
  }
  refresh();
  return { el, view, focus: () => view.focus(),
    /** Focus on a new, empty line at the end (after a quote, say), ready to write. */
    focusNewLine: () => {
      const last = view.state.doc.lastChild;
      if (last && !(last.type === schema.nodes.paragraph && !last.content.size)) {
        const end = view.state.doc.content.size;
        view.dispatch(view.state.tr.insert(end, schema.nodes.paragraph.create()));
      }
      view.focus();
      view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView());
    },
    focusEnd: () => { view.focus(); view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView()); }, markdown: () => docToMarkdown(view.state.doc).trim(), destroy: () => view.destroy() };
}
