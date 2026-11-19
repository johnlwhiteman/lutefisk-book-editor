# Changelog

All notable changes to Lutefisk Book Editor are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The e-book preview's text-size slider now goes up to 200% (from 50%), like the largest type settings on real readers.
- Settings opens as a panel at the right, with the app undimmed beside it, so changes to the skin, text size or contrast show as you make them.
- Spelling dialects: American, British, Canadian and Australian English (Indian English is no longer offered; if you used it, you're switched to American).
- A tidier preview: every control in its top bars has the same soft look and height, the template picker is one control (◀ name ▶, with its gear), Print shows the template in its top bar like the e-book preview, the page buttons match, and in a narrow preview the top row stays on one line.
- Settings sections are in alphabetical order: Appearance, Backups, Folders, Language, Projects folder, Saving, Spelling & Grammar, Vision & Comfort, Writing Goals.
- The app is now called **Lutefisk Book Editor**. Your settings, recent books and books stay where they were.
- New skins. Classic and High Contrast stay; the other twelve are replaced by ten skins drawn from the same traditions as the print artwork papers — Batik, Seigaiha, Washi, Talavera, Bògòlan, Kuba, Kōwhaiwhai, Greek Key, Selbu and Andean — each with strong-contrast day and night colors and a faint pattern on the title bar, binder, Library and behind the preview. If you used a skin that's gone, you're switched to Classic.
- A more polished binder: Front Matter, Body and Back Matter each sit on their own card with a count, chapters are numbered, the chapter you're in is highlighted with a soft accent and a bar at its edge, and scenes hang from their chapter on a guide line.
- Research: Index Cards and Bibliography sit with Characters, Plot and Timeline in the story tools row.
- Research: the notes pane is labeled Notes. Uploading files no longer adds pictures to your notes; uploaded files are shown as tiles under the notes, where a picture can be inserted with Insert into Notes. The notes toolbar's Image item still uploads and inserts a picture.

### Added

- **Your dictionary** (Settings › Spelling & Grammar › Edit Dictionary…): add, find, correct and remove the words you've added. Removing a word now takes effect at once.
- **Spelling & grammar rules** (Settings › Spelling & Grammar › Choose Rules…): Harper's rules in their 16 groups, with descriptions; turn a whole group or single rules on or off, pick a side on choices like the Oxford comma, find a rule, see the ones you've changed, and restore the defaults.
- **Text size** in Settings › Vision & Comfort and **View › Text Size**: Default, Large (125%), Larger (150%), Largest (175%) and Extra Large (200%) for the whole window.
- **Contrast** in Settings › Vision & Comfort and **View › Contrast**, for every skin: Softer, Standard, Stronger and Strongest. It replaces the "Stronger contrast" checkbox (if you had it on, you're on Stronger).
- **View › Skin** and **View › Appearance** in the application menu: switch skins, and between Day, Night and System, without opening Settings.
- Each new book gets its own cover color in the Library, different from the books already there.
- Uploading a front or back cover shows it first, with its size, and asks whether to use it.
- New Book asks for a logline: what the book is about, in one or two sentences, in a box three lines tall (also in Book settings). There's no word count; the note under it only speaks up past two sentences.
- A picture or drawing you delete from the text is removed from the book's `assets` folder (moved to the Trash) when you close the book or next open it.

### Fixed

- Menus no longer show two dividers in a row (for example after Paste in the right-click menu), and every divider is the same thickness.

## [1.0.0] - 2026-11-18

The first public version.

### Writing

- An editor with paragraph styles (headings, block quote, verse, hanging indent, attribution), bold, italic, underline, subscript, superscript, strikethrough, text color, a highlighter and alignment.
- A **+** menu, also on the right-click menu, that inserts links, pictures, lists, tables, code, formulas, symbols, drawings, citations, footnotes, line breaks, horizontal lines, page breaks and scene breaks.
- Code blocks in dozens of languages, with syntax colors, line numbers, borders, alignment and padding.
- LaTeX formulas, inline or on their own line.
- Margin comments with replies, which can be included in the Word export.
- Spelling, grammar and style checking as you type, on your computer, with a personal dictionary.
- **Capitalize My Title** in Chicago, APA, MLA, AP and sentence case.
- A formatting toolbar above or below the text.

### Organizing

- Chapters and scenes, front matter and back matter, with a generated title page, contents, bibliography, endnotes and index.
- Labels, several statuses at once, and an **Exclude from Book** status.
- Search and replace across the book, a chapter, a scene or the selection.
- A Recycle Bin that restores items to where they were.

### Previewing and design

- A live preview on Kindle, Kobo, Nook, iPhone, iPad and Android devices, drawn to scale.
- A print preview as an open spread, identical to the PDF, with trim sizes, type size, papers, artwork pages and a watermark.
- About 95 templates, a template designer, drop caps, ornaments and scene breaks.

### Planning

- A Research window with Markdown notes and a live preview, uploaded files, and index cards laid out like cards on a desk.
- A bibliography in APA, MLA, Chicago or IEEE, with each style's rules and examples, and **Analyze** to fill in a source from its link or DOI.
- Characters with portraits and appearances, a plot board, and a story timeline that marks flashbacks.

### Tracking

- Book and daily goals in words, pages or hours, with a countdown, a stopwatch and a writing history.
- Insights: readability, sentence length, active and passive voice, adverbs, repeated phrases, and spelling and grammar counts, for the book or a single chapter.

### Exporting

- EPUB 3, PDF, Word (.docx), RTF, MOBI, Markdown and plain text.
- One-click backup of a book as a .zip.

### Comfort

- Day and night themes, 14 skins, 16 interface languages, larger interface text, an easier-to-read font, stronger contrast and reduced motion.
- In-app Help with a guided tour.

### Privacy and security

- No accounts, cloud, telemetry or automatic updates. The only network request is **Analyze**, and only when the user presses it.
- A sandboxed window with a strict Content Security Policy, validated file paths and hardened packaged builds.
- A privacy test in `npm test`, and a software bill of materials (`npm run sbom`).

[Unreleased]: ../../compare/v1.0.0...HEAD
[1.0.0]: ../../releases/tag/v1.0.0
