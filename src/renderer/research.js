// Research: index cards, character & place sheets, web links and imported files
// (images, PDFs, documents). Kept with the book but never exported. Index cards
// replace the older research notes, scenes and snippets (converted on opening).
import { h, icon, setHtml, toast, assetUrl } from './ui.js';
import { renderMarkdown } from '../shared/markdown.js';
import { entryFromUrl, formatEntry } from '../shared/citations.js';
import { newId } from '../shared/sections.js';

export const RESEARCH_LABEL = { card: 'Index Card', scene: 'Index Card', note: 'Index Card', character: 'Character', place: 'Place', link: 'Web Link', image: 'Image', pdf: 'PDF', file: 'File', folder: 'Folder' };

const TEMPLATES = {
  card: '',
  note: '',
  scene: '',
  character: '## At a glance\n\n- **Role:** \n- **Age:** \n- **Occupation:** \n\n## Appearance\n\n\n\n## Personality\n\n\n\n## Backstory\n\n\n\n## Wants & needs\n\n\n\n## Arc\n\n',
  place: '## Overview\n\n\n\n## Sights, sounds & smells\n\n\n\n## History\n\n\n\n## Who lives here\n\n\n\n## Scenes set here\n\n',
};

/** Items whose text is edited in the main editor (stored as research/<id>.md). */
export const isTextItem = (r) => r && ['card', 'scene', 'note', 'character', 'place'].includes(r.kind);

export function newResearchItem(kind, extra = {}) {
  const item = { id: newId('res'), kind: ['character', 'place'].includes(kind) ? kind : kind, title: extra.title || `New ${RESEARCH_LABEL[kind] || 'Note'}`, ...extra };
  // Text items are stored as notes on disk.
  if (isTextItem(item)) item.store = 'note';
  return { item, text: extra.text ?? TEMPLATES[kind] ?? '' };
}

const fileUrl = (rel) => assetUrl(rel);
const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n || 0} bytes`);

function notesBox(app, item) {
  const ta = h('textarea', { class: 'res-notes', rows: 5, placeholder: 'Your notes about this item…' });
  ta.value = item.notes || '';
  ta.addEventListener('input', () => { item.notes = ta.value; app.markDirty(); });
  return h('label', { class: 'fld' }, h('span', {}, 'Notes'), ta);
}

/** Main-pane view for non-text research items. */
export function researchPanel(app, item) {
  const wrap = h('div', { class: 'res-panel' });
  switch (item.kind) {
    case 'image': {
      const img = h('img', { src: fileUrl(item.file), alt: item.title, class: 'res-image' });
      img.addEventListener('click', () => img.classList.toggle('zoom'));
      wrap.append(h('div', { class: 'res-image-wrap' }, img), h('div', { class: 'res-meta' }, h('span', {}, 'Click the image to zoom.'), fileActions(app, item)), notesBox(app, item));
      break;
    }
    case 'pdf':
      wrap.classList.add('fill');
      wrap.append(h('iframe', { class: 'res-pdf', src: fileUrl(item.file), title: item.title }), h('div', { class: 'res-meta' }, h('span', {}, fmtSize(item.size)), fileActions(app, item)));
      break;
    case 'link': {
      const url = h('input', { type: 'url', placeholder: 'https://', value: item.url || '' });
      // Once it's in the bibliography, the reference shows here too, as the book will print it.
      const refBox = h('div', { class: 'res-ref', hidden: true });
      const drawRef = () => {
        const e = item.refId && (app.book.bibliography || []).find((x) => x.id === item.refId);
        refBox.hidden = !e;
        if (!e) return;
        const html = h('div', { class: 'res-ref-text' });
        setHtml(html, formatEntry(e, app.book.citationStyle || 'apa'));
        refBox.replaceChildren(h('div', { class: 'res-ref-head' }, icon('cite', 14), h('b', {}, 'In your bibliography'), h('small', {}, (app.book.citationStyle || 'apa').toUpperCase())), html);
      };
      drawRef();
      url.value = item.url || '';
      url.addEventListener('input', () => { item.url = url.value.trim(); app.markDirty(); });
      wrap.append(
        h('label', { class: 'fld' }, h('span', {}, 'Web address'), url),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn small', onclick: () => openLink(item) }, icon('share', 14), 'Open in Browser'),
          h('button', { class: 'btn small', onclick: () => addToBibliography(app, item).then(drawRef) }, icon('cite', 14), 'Add to Bibliography')),
        refBox,
        h('p', { class: 'privacy-note' }, icon('eye', 14), ' Links are stored here only. In the bibliography, Analyze can look a link up online — only when you press it.'),
        notesBox(app, item));
      break;
    }
    default:
      wrap.append(
        h('div', { class: 'res-file' }, icon('folder', 40), h('b', {}, item.title), h('small', {}, `${(item.file || '').split('.').pop().toUpperCase()} · ${fmtSize(item.size)}`),
          h('button', { class: 'btn', onclick: () => openFile(item) }, 'Open with Default App')),
        notesBox(app, item));
  }
  return wrap;
}

function fileActions(app, item) {
  return h('button', { class: 'btn small plain', onclick: () => openFile(item) }, 'Open with Default App');
}
async function openFile(item) {
  try { await window.lutefisk.openResearchFile(item.file); } catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'); }
}
async function openLink(item) {
  try { await window.lutefisk.openExternal(item.url); } catch { toast('That doesn’t look like a web address.', 'warn'); }
}

async function addToBibliography(app, item) {
  if (!item.url) { toast('Add a web address first.', 'warn'); return; }
  try {
    // Made from the link on this computer; nothing is fetched.
    const entry = entryFromUrl(item.url, { title: item.title && !item.title.startsWith('New ') ? item.title : '' });
    entry.id = `ref-${Date.now().toString(36)}`;
    app.book.bibliography ||= [];
    app.book.bibliography.push(entry);
    app.enableSection('bibliography');
    if ((!item.title || item.title.startsWith('New ')) && entry.title) item.title = entry.title;
    item.refId = entry.id;
    app.markDirty(); app.refreshSidebar(); app.refreshPreview();
    toast(`Added “${entry.title}” to the bibliography. Add the author and date in the Bibliography section.`, 'ok', 4200);
  } catch (err) { toast(String(err.message || err), 'error', 5000); }
}

/** Read-only reference view, shown beside the editor in the preview pane. */
export function researchReference(app, item) {
  if (!item) {
    return h('div', { class: 'ref-empty' }, icon('book', 30), h('b', {}, 'Nothing pinned'), h('p', {}, 'Choose a research item above, or use “Open Beside Editor” from any item’s menu.'));
  }
  const body = h('div', { class: `ref-body kind-${item.kind}` });
  if (isTextItem(item)) {
    const doc = h('div', { class: 'ref-doc' });
    setHtml(doc, renderMarkdown(app.contents[item.id] || '', { assetUrl }).html || '<p><i>Empty</i></p>');
    body.append(h('h2', {}, item.title), doc);
  } else if (item.kind === 'image') {
    body.append(h('img', { src: fileUrl(item.file), alt: item.title, class: 'ref-image' }), item.notes ? h('p', { class: 'ref-notes' }, item.notes) : null);
  } else if (item.kind === 'pdf') {
    body.classList.add('fill');
    body.append(h('iframe', { class: 'res-pdf', src: fileUrl(item.file), title: item.title }));
  } else if (item.kind === 'link') {
    body.append(h('h2', {}, item.title), h('p', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); openLink(item); } }, item.url || 'No address')), item.notes ? h('p', { class: 'ref-notes' }, item.notes) : null);
  } else {
    body.append(h('h2', {}, item.title), h('button', { class: 'btn', onclick: () => openFile(item) }, 'Open with Default App'), item.notes ? h('p', { class: 'ref-notes' }, item.notes) : null);
  }
  return body;
}

