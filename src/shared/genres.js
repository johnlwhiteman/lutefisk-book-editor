// Common book genres, for a book's Genre (Book settings › General and New Book).
// Writers can add their own; those are kept in Settings (customGenres).
export const GENRES = {
  Fiction: ['Fantasy', 'Science Fiction', 'Mystery', 'Thriller', 'Suspense', 'Crime', 'Horror', 'Romance', 'Romantasy', 'Historical Fiction', 'Literary Fiction', 'Contemporary Fiction', 'Women’s Fiction', 'Adventure', 'Dystopian', 'Paranormal', 'Magical Realism', 'Western', 'Humor', 'Satire', 'Young Adult', 'Middle Grade', 'Children’s', 'Short Stories', 'Graphic Novel'],
  Nonfiction: ['Memoir', 'Biography', 'History', 'Self-Help', 'Business', 'Science', 'True Crime', 'Travel', 'Essays', 'Cookbook', 'Religion & Spirituality', 'Health & Wellness', 'Textbook', 'Technical'],
  Other: ['Poetry', 'Drama', 'Anthology'],
};
export const ALL_GENRES = Object.values(GENRES).flat();

/** Tidy a genre typed by the writer. */
export const cleanGenre = (g) => String(g || '').replace(/\s+/g, ' ').trim().slice(0, 60);
