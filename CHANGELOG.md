# Changelog

All notable changes to Lutefisk Book Editor are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The device preview cut off the right side of chapters on small screens (iPhone, Galaxy S26, Kindle Basic, GlowLight 3 and 4): a style meant for the dictionary dialog also matched the book's drop-cap class and forced chapters to at least 520 px wide.

### Added

- Proofreading: highlight marks (or click a mark’s label) and click an ink in the row to change their color. The right-click and + menus show **Proofreader’s Marks** only while proofreading.
- **Checkboxes**: + › **Checkbox**, or type `[ ]` (or `[x]`) and a space at the start of a line. Click a box in the editor to check or uncheck it. Saved as ☐ and ☑, so the previews and every export show them.
- Proofreading inks: **red** (the default each time the app opens), **blue**, **green** and **purple**. Each mark keeps the ink it was made in; the palette beside the inks makes every mark one color, and right-click a mark › **Color** changes just that one. The row no longer shows a pencil, and its count reads “1 Mark” / “7 Marks” — nothing at all, and no arrows, when there are none.
- **Book settings › Style**: choose the book's citation and bibliography style and its proofreading style (Chicago, AP or APA) in one place, and clear every proofreader's mark in the book.
- **Add Mark** searches: type “comma”, “cap”, “del” or “serial”, ↑ ↓ to choose, Return to mark. Right-click › Proofreader's Mark › **Search Marks…** does the same.
- **Proofreading**: mark up the manuscript with proofreader’s marks, written over the text by hand in **red or dark-blue ink** (in the Caveat handwriting face, bundled; editor only). Click the pencil above the editor (**⌥⌘R**, Tools › Proofreading) and a second row opens under the toolbar: the ink, **Add Mark**, **‹ ›** to step through the open marks in this chapter or scene and then on through the book, and **Done**. Proofreading is off each time the app opens. The style guide (**The Chicago Manual of Style**, **AP Stylebook** or **APA Style**) is chosen in Book settings › Style and adds its own rules to the menu. Marks are also in right-click › **Proofreader’s Mark** and the **+** menu: delete, insert, replace, transpose, stet, spell out, punctuation, space, close up, new paragraph, run in, move, cap, lc, small caps, ital, bold, roman, wrong font and Query to Author. Right-click a mark to remove it, add a note, or make its change. Click the pencil again, or Done, to finish — the marks stay, hidden, until cleared. They never appear in the previews or any export. Open marks are listed in the **Book Audit** (Proofreader’s marks), count toward its number, and can’t be ignored. Saved in the chapter Markdown as `{%%text%%}{%r-id:type%}` and `{%r-id:type%}`, with who made each mark and its note in lutefisk.yaml under `review`.
- Counts on the tools above the editor: Characters (in the book) and Comments (open in this text) in gray; Spelling and Grammar (possible problems in this text, while that check is on) and Proofreading (open marks in the book) in red.

### Changed

- **A smaller app** (about 17 MB less installed, nothing removed or degraded):
  - The spelling and grammar checker's data (Harper, 20 MB) ships gzipped (8 MB) and is unpacked byte for byte as it loads.
  - Windows and Linux builds keep only the Chromium interface languages the app itself offers (English, German, French, Italian, Spanish, Polish, Russian, Ukrainian, Indonesian, Malay, Vietnamese, Japanese, Chinese and Korean); others fall back to English, as the app's own interface does. macOS is unchanged (those files are inside the signed Electron framework).
  - Every PNG (screenshots, icons) losslessly recompressed — the same pixels, about 20% smaller.
- The README's feature list is a short bullet list, with a Proofread section and screenshots.
- CITATION.cff names the author: John L. Whiteman.

- **Random Thoughts** are now just **Thoughts**.

- In Research, the notes pane is called **README.md** (the file it is).
- The icons above the editor (Characters, Comments, Spelling, Grammar, Tools, Random Thoughts) show just their name when you point at them. The character card no longer has Hide marks.
- The binder follows the skin you choose — its colors, surfaces and accent, by day and night — instead of a fixed warm tint.
- Binder sections no longer have outlines: each sits on the page with a faint lift (Stronger and Strongest contrast keep a clear edge).
- A simpler Characters window: no counts beside names (in the list or on the Characters button); Appears in is just the chapter numbers they're in (click one to go there); Also known as is the only matching setting (first names are always matched); new characters start with Age and Occupation only — empty Appearance, Personality, Goal and Motivation are dropped; “Import Characters from Other Books…”; no How It Works button.
- The binder is quieter: Front Matter, Body and Back Matter are just their names, with no icons or counts (click one to fold it), there's no “Auto” after Title Page and Contents, and the covers say nothing unless one is Not set.
- The right-click menu starts with **Add Card, Add Character, Add Comment and Add Random Thought**, always at the top and in that order (each starts from the selected text, if any). Add Character with nothing selected makes a new, empty character.
- Front and back matter can be put in any order: drag a row in the binder (or right-click › Move Up / Move Down). Each part keeps its own pages — front matter stays before the chapters, back matter after — and the e-book, print and exports follow your order.
- A warmer binder: a hint of paper in the background, softer cards, part names in plain words with a small picture each, and the book's title in a book face beside a slightly tilted cover. Audit turns green when there's nothing to fix.
- Panels (the title-bar button, and right-clicking the top of a pane) shows the six arrangements as little pictures instead of a list of words.
- Help is shorter: eight brief topics covering the main features, and a seven-step tour.
- No logline; the description says what the book is about. New Book asks for an optional description, and an existing logline becomes the book's description if it doesn't have one.
- The top of the binder: the book's title across the top, and beside the cover two rows — Goals and Insights, then Research and Audit. Goals' percentages are in its tooltip.
- The Recycle Bin moved from the bottom of the binder to the title bar, just right of Settings; point at it to see how much is in it.
- The day/night button in the title bar now steps through Day → Night → System → Day (System follows your computer).
- In the Library, Settings sits just right of the app's name, as it sits right of the fish in a book window.
- Settings (the gear) now sits just right of the fish at the left of the title bar.
- The preview's template control matches the device and reading-theme pickers: one button with ↕ in it (↑ ↓ still step through the designs), and the gear beside it — no more arrows on either side. The device, template and theme names are all bold.

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

- **Rename in the binder:** double-click any name — a chapter, a scene, or a front or back matter page such as Dedication or Contents — type the new name, and press Return (Esc leaves it as it was; clearing it brings back the usual name).
- **Audit › Open comments:** every open comment, with what it says, the text it's on, the chapter and who wrote it — Go to It, or **Close** it (asks first). **Close All…** closes them all, after asking.
- Three plain, whitish skins with no artwork: **Paper** (warm white), **Porcelain** (cool white with slate blue) and **Linen** (soft gray-white with sage), each with a night version.
- **Character marks, on or off.** The Characters window has a “Mark names in editor” switch at the top: light green stripes and a small green dot after each name, the same for every character.
- **Audit › Characters:** a character whose name never appears in the text, and names that keep coming up in the text but aren't in Characters (as a suggestion), each with a button to open Characters.
- **Random Thoughts remember where.** The right-click box can keep where you were and the text you'd highlighted (two checkboxes, both on). The highlighted text shows above the thought, and the place is a button that takes you back there.
- **Random Thoughts.** Jot down anything — an idea, a line, a what-if. Right-click in your text › Add Random Thought for a small box right where you are (Return saves, Esc cancels; selected text starts it off). The thought bubble right of Tools, and Random Thoughts in Research, list them all: add one at the top, click any to edit it, or delete it (it goes to the Recycle Bin). Kept with the book, never in it.
- **Cancel** in the index card window: a new card isn't kept, and an existing one goes back to how it was. A new card closed with nothing written in it isn't kept either.
- **CITATION.cff**, so GitHub shows “Cite this repository” with APA and BibTeX.
- **Book Audit.** **Audit** in the binder, beside Research (or View › Audit Book…), reads the whole book for things that could be wrong before it goes out: a missing title, author, description or publication year; an invalid ISBN; no front cover image or no back cover; a missing or empty copyright page, or one whose line has no author; starter text left in About the Author, Acknowledgments and the like; untitled, duplicate or empty chapters and empty scenes; TK, TODO and ??? notes to self; images without descriptions; open comments; and possible spelling and grammar problems in every chapter. Findings are grouped and ranked (problems, things to check, suggestions), each with a button that goes where it can be fixed, and **Ignore** for anything that's fine as it is (ignored findings are kept with the book and can be restored). Tabs show To Fix, Ignored and Passed; To Fix lists real issues and suggestions together, each tagged Problem, Check or Suggestion. In the binder, Audit turns red when something needs fixing; point at it for the count — the same number as To Fix, spelling and grammar included. Nothing is changed by the audit itself.
- **Character names highlighted in the editor.** Every name, alias and first name of your characters is faintly tinted in that character's color. Point at one for a card with their role and a few attributes; click the name (or Open Character) to open them in Characters — close it and you're back exactly where you were. Right-click the Characters button to turn the tint off or on.
- **Front Cover and Back Cover in the binder**, before Front Matter and after Back Matter. Each shows what the cover is made of (Image, Generated, Description or Not set); clicking one shows it in the preview and opens Book › Covers at it.
- **High contrast**, one switch in Settings › Vision & Comfort. It lays a stronger High Contrast look — full-strength text, solid lines, outlined controls, heavier icons and a bold focus ring — over any skin; off brings your own back.
- **Your dictionary** (Settings › Spelling & Grammar › Edit Dictionary…): add, find, correct and remove the words you've added. Removing a word now takes effect at once.
- **Spelling & grammar rules** (Settings › Spelling & Grammar › Choose Rules…): Harper's rules in their 16 groups, with descriptions; turn a whole group or single rules on or off, pick a side on choices like the Oxford comma, find a rule, see the ones you've changed, and restore the defaults.
- **Text size** in Settings › Vision & Comfort and **View › Text Size**: Default, Large (125%), Larger (150%), Largest (175%) and Extra Large (200%) for the whole window.
- **Contrast** in Settings › Vision & Comfort, for every skin: Softer, Standard, Stronger and Strongest. It replaces the "Stronger contrast" checkbox (if you had it on, you're on Stronger).
- **View › Skin** and **View › Appearance** in the application menu: switch skins, and between Day, Night and System, without opening Settings.
- Each new book gets its own cover color in the Library, different from the books already there.
- Uploading a front or back cover shows it first, with its size, and asks whether to use it.
- A picture or drawing you delete from the text is removed from the book's `assets` folder (moved to the Trash) when you close the book or next open it.

### Fixed

- Skin artwork no longer disappears with Stronger or Strongest contrast (only High contrast leaves it off), and no other background in the app can cover it.
- Skin artwork was drawn so faintly it could hardly be seen, and the binder's cards covered it; it's now clearly visible on the title bar, the binder (through its cards), the Library and the preview. Settings › Appearance › **Skins** (was Skin) notes that Strongest contrast and High contrast leave the artwork off.
- Characters › Appears in showed “null” for a chapter left out of the book; it now shows a dash.
- A stray line in the stylesheet stopped the number on the Characters button from being placed correctly.
- Turning writing goals off now hides them in the Library straight away, too.
- Pointing at a character's name no longer darkens it; the highlight stays light and the text stays readable.
- Contrast (Softer, Stronger, Strongest) now works with every skin; before, it only changed Classic.
- The stopwatch starts from zero each time the app starts, instead of carrying on from earlier in the day.
- View › Contrast is gone from the menu; contrast is set in Settings › Vision & Comfort.
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
