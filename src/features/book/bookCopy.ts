// Working text for the book. The copy deck has none of it, so it is NOT locked copy: it needs owner
// approval before moving to src/content. Volume names and subtitles are in ./volumes.ts.
export const bookCopy = {
  hint: 'Swipe to look. Tap a volume to open it.',
  open: 'Opens the book so you can write or speak',
  volume: (title: string, index: number, of: number) => `${title}, volume ${index} of ${of}`,
  coverKicker: (index: number) => `ECHO VOLUMES  /  0${index}`,
  page: {
    previous: 'Previous page',
    next: 'Next page',
    of: (page: number, pages: number) => `Page ${page} of ${pages}`,
  },
  another: 'Another volume',
  /**
   * Whose book this is: asked once, inside the book, after an entry is kept (never in onboarding).
   * Working copy, waiting on the owner (docs/DECISIONS_REQUIRED.md). No hyphens, dashes or
   * exclamation marks.
   */
  name: {
    question: 'Whose book is this?',
    line: 'Your name goes on the cover. It stays on this phone.',
    placeholder: 'Your name',
    write: 'Write it',
    notNow: 'Not now',
  },
} as const;
